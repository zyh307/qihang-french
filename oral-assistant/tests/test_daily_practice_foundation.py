from concurrent.futures import ThreadPoolExecutor
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import wave

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from daily_practice import install
from daily_practice_config import load_settings
from french_asr import FrenchEngine
from lecture import install as install_lecture
from pause_detection import summarize
from practice_records import Mode, PracticeJournal, Verdict, record
from recording_window import RecordingWindow
from scripts.validate_daily_practice import validate
from word_alignment import Word, align, words_in_window


class WindowTests(unittest.TestCase):
    def test_limits_and_sample_time(self):
        for length in (6, 12):
            with self.subTest(length=length):
                window = RecordingWindow.select(bytes(length * 32000), length)
                self.assertEqual(window.timing()["seconds"], length)
                for pcm in (b"", b"\x00", bytes(length * 32000 + 2)):
                    with self.assertRaises(ValueError):
                        RecordingWindow.select(pcm, length)
        window = RecordingWindow.select(b"\x00\x00\x01\x00\x02\x00", 6, start_sample=1, end_sample=2)
        self.assertEqual(window.timing()["start"], 1 / 16000)
        with wave.open(io.BytesIO(window.wav())) as audio:
            self.assertEqual((audio.getframerate(), audio.getnchannels(), audio.getsampwidth()), (16000, 1, 2))
            self.assertEqual(audio.readframes(1), b"\x01\x00")


class WordTests(unittest.TestCase):
    def test_confident_repetition_is_used_and_weak_match_is_preserved(self):
        words = [Word("l’été", 0, .3, .2), Word("l'été", .4, .7, .9), Word("arrive", .8, 1, .4)]
        result = align("L’été arrive.", words, .55)
        self.assertEqual([m.status for m in result.matches], ["hit", "hit", "low_confidence"])
        self.assertEqual([m.heard_index for m in result.matches], [1, 1, 2])
        self.assertEqual(result.coverage, 2 / 3)

    def test_no_credit_for_reversed_or_crossing_words(self):
        left, crossing, right = Word("soir", .1, .3, .99), Word("ce", .3, .7, .99), Word("ce", .7, 1, .99)
        self.assertEqual(words_in_window([left, crossing, right], 0, .5), ((left,), (crossing,)))
        self.assertEqual(words_in_window([left, crossing, right], .5, 1), ((right,), (crossing,)))
        self.assertEqual(align("ce soir", [left, right], .55).coverage, .5)
        self.assertEqual(align("été", [Word("et", 0, 1, .9)], .55).matches[0].status, "missing")


class PauseTests(unittest.TestCase):
    def test_merges_overlaps_and_excludes_leading_and_trailing_silence(self):
        voice = summarize([(32000, 40000), (8000, 16000), (12000, 20000)], 48000)
        self.assertEqual(voice["speech_seconds"], 1.25)
        self.assertEqual(voice["pause_spans"], [{"start": 1.25, "end": 2.0, "seconds": .75}])
        self.assertEqual(summarize([], 16000)["pause_spans"], [])
        self.assertEqual(summarize([(-500, 17000)], 16000)["speech_seconds"], 1)


class JournalTests(unittest.TestCase):
    def test_atomic_idempotency_partition_and_restore(self):
        with TemporaryDirectory() as temp:
            journal = PracticeJournal(temp)
            attempt = "0" * 32
            evidence = {"window": {"seconds": 3}, "speech_seconds": 2, "hit_rate": .9,
                        "thresholds": {"max_pause": .75}, "metrics": {"pauses": (.8,)}}
            decision = record(Mode.FLUENCY, "chain-1", Verdict.RETRY,
                              {**evidence, "rule": "pause"}, ts=10)
            with ThreadPoolExecutor(max_workers=4) as workers:
                rows = list(workers.map(lambda _: journal.append(attempt, decision), range(12)))
            self.assertTrue(all(row == rows[0] for row in rows))
            journal.append(attempt, record(Mode.SLOT, "slot-1", Verdict.RELEASE, {**evidence, "rule": "hint"}, ts=11))
            self.assertEqual(PracticeJournal(temp).records(Mode.FLUENCY), rows[:1])
            self.assertEqual(PracticeJournal(temp).records(Mode.SLOT)[0]["verdict"], "release")
            with self.assertRaises(ValueError):
                journal.append(attempt, {**decision, "item": "chain-2"})
            with self.assertRaises(ValueError):
                record(Mode.SLOT, "slot-1", Verdict.PASS, {})
            lines = (Path(temp) / "fluency" / (attempt + ".jsonl")).read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            self.assertFalse(list(Path(temp).rglob("*.tmp")))


class SettingsTests(unittest.TestCase):
    def test_defaults_and_rule_overrides(self):
        with TemporaryDirectory() as temp:
            default = load_settings(temp)
            self.assertEqual([config.window_seconds for config in default.values()], [12, 6])
            self.assertEqual([len(vars(config.rules)) for config in default.values()], [7, 5])
            self.assertEqual(default[Mode.SLOT].rules.min_release_seconds, 1.2)
            self.assertFalse(any(config.enabled for config in default.values()))
            path = Path(temp) / "daily-practice.json"
            path.write_text(json.dumps({"fluency": {"enabled": True, "window_seconds": 2,
                                                  "rules": {"words_per_minute": [50, 130],
                                                            "min_speech_seconds": 3.0}}}))
            fluency = load_settings(temp)[Mode.FLUENCY]
            self.assertEqual(fluency.rules.words_per_minute, (50, 130))
            self.assertEqual(fluency.window_seconds, 2)
            self.assertEqual(fluency.release_seconds, 1.5)
            path.write_text(json.dumps({"slot": {"rules": {"min_target_probability": 10}}}))
            with self.assertRaises(ValueError):
                load_settings(temp)


class ValidationTests(unittest.TestCase):
    def test_chain_schema_audio_boundaries_and_duplicates(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "clip.wav").write_bytes(RecordingWindow.select(bytes(3200), 12).wav())
            row = {"id": "fixture", "groups": ["a b c d", "e f g h i"], "pause_after_words": [4],
                   "short_groups": ["a b c d", "e f g h i"], "demo_wav": "clip.wav", "short_demo_wav": "clip.wav"}
            path = root / "chains.json"
            def write(rows):
                path.write_text(json.dumps({"lesson_id": "fixture", "version": 1, "chains": rows}), encoding="utf-8")
            write([row])
            self.assertEqual(validate(path), 1)
            for invalid in ([row, row], [{**row, "pause_after_words": [5]}],
                            [{**row, "demo_wav": "missing.wav"}], [{**row, "groups": ["TODO", "f g h"]}]):
                write(invalid)
                with self.assertRaises(ValueError):
                    validate(path)

    def test_demo_and_formal_require_their_respective_human_evidence(self):
        with TemporaryDirectory() as temp:
            path = Path(temp) / "frames.json"
            # Synthetic schema fixture. No textbook item or real pair assessment.
            row = {"id": "fixture", "template": "A {slot} D",
                   "candidates": [{"id": x, "form": x, "pronunciation": x, "condition": x} for x in ("b", "c")],
                   "prompts": [{"id": f"p{i}", "target": x, "cue": x} for i, x in enumerate("bccb")],
                   "examples": [{"prompt": f"p{i}", "spoken_candidate": x, "accepted": accepted}
                                for i, x, accepted in ((0, "b", True), (0, "c", False), (1, "c", True), (1, "b", False))],
                   "validation": {"blind_test": "未测", "listened": False, "asr_hits": None}}
            def write():
                path.write_text(json.dumps({"lesson_id": "fixture", "version": 1, "frames": [row]}), encoding="utf-8")
            write()
            self.assertEqual(validate(path), 1)
            with self.assertRaises(ValueError):
                validate(path, "demo")
            row["validation"]["listened"] = True
            write()
            self.assertEqual(validate(path, "demo"), 1)
            with self.assertRaises(ValueError):
                validate(path, "formal")
            row["validation"].update(blind_test="通过", asr_hits="schema fixture")
            write()
            self.assertEqual(validate(path, "formal"), 1)
            row["candidates"][1]["pronunciation"] = row["candidates"][0]["pronunciation"]
            write()
            with self.assertRaises(ValueError):
                validate(path, "formal")


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_reading_preserves_legacy_status_and_stores_canonical_record(self):
        class Engine:
            async def transcribe(self, path):
                return {"text": "", "segments": []}
        with TemporaryDirectory() as temp:
            root = Path(temp)
            media = root / "media"
            media.mkdir()
            (media / "001.wav").write_bytes(RecordingWindow.select(bytes(32000), 6).wav())
            pack = {"id": "fixture", "piste": 1, "sentences": [
                {"id": "s1", "fr": "Bonjour", "piste": 1, "start": 0, "end": 1},
            ]}
            (media / "fixture.json").write_text(json.dumps(pack))
            app = web.Application()
            app["french_asr"] = Engine()
            install_lecture(app, root, media)
            async with TestClient(TestServer(app)) as client:
                start = await client.post("/api/lecture", json={"text": "fixture", "layout": "guided"})
                session = await start.json()
                base = "/api/lecture/" + session["id"]
                record_url = f'{base}/{session["revision"]}/record?attempt={"a" * 32}'
                response = await client.post(record_url, data=bytes(32000))
                self.assertEqual(response.status, 200)
                refreshed = await (await client.get(base)).json()
                attempt = refreshed["attempts"][0]
                self.assertEqual((attempt["result"]["status"], attempt["practice"]["verdict"]),
                                 ("uncertain", "undetermined"))
                self.assertEqual((attempt["practice"]["mode"], attempt["practice"]["item"]), ("lecture", "fixture/s1"))

    async def test_probe_requires_an_enabled_mode_and_local_word_evidence(self):
        class Engine:
            async def transcribe_wav(self, data, *, word_evidence):
                self.calls += 1
                self.evidence = word_evidence
                with wave.open(io.BytesIO(data)) as wav:
                    assert wav.getnframes() == 32000
                return {"text": "Bonjour", "words": [{"text": "Bonjour", "start": .1, "end": .5, "probability": .9}],
                        "speech_seconds": .4, "speech_spans": [], "pause_spans": []}
            calls = 0

        with TemporaryDirectory() as temp:
            root = Path(temp)
            flags = root / "daily-practice.json"
            flags.write_text('{"fluency":{"enabled":true},"slot":{"enabled":false}}')

            @web.middleware
            async def handle_bad_input(request, handler):
                try:
                    return await handler(request)
                except ValueError as error:
                    return web.json_response({"error": str(error)}, status=400)

            app = web.Application(middlewares=[handle_bad_input], client_max_size=64 * 1024)
            engine = app["french_asr"] = Engine()
            install(app, root)
            initial = sorted(root.rglob("*"))
            async with TestClient(TestServer(app)) as client:
                base = "/api/daily-practice"
                self.assertEqual(await (await client.get(base)).json(), {"modes": {"fluency": {"window_seconds": 12}}})
                self.assertEqual((await client.post(base + "/slot/probe", data=b"invalid")).status, 404)
                bad = await client.post(base + "/fluency/probe", data=bytes(12 * 32000 + 2))
                self.assertEqual(bad.status, 400)
                result = await (await client.post(base + "/fluency/probe?reference=Bonjour", data=bytes(64000))).json()
                self.assertEqual(result["alignment"]["coverage"], 1)
                self.assertTrue(engine.evidence)
                self.assertEqual(engine.calls, 1)
                self.assertEqual(sorted(root.rglob("*")), initial)

    async def test_word_mode_enables_timestamps_and_preserves_legacy_shape(self):
        word = SimpleNamespace(word=" Bonjour", start=.2, end=.6, probability=.83)
        segment = SimpleNamespace(text=" Bonjour", start=.1, end=.8, words=[word],
                                  avg_logprob=-.2, no_speech_prob=.05)
        class Model:
            def transcribe(self, audio, **options):
                self.options = options
                return [segment], None
        engine = FrenchEngine({})
        engine.model = Model()
        audio = RecordingWindow.select(b"\x01\x20" * 16000, 6).wav()
        legacy = await engine.transcribe(audio)
        self.assertNotIn("words", legacy)
        self.assertNotIn("word_timestamps", engine.model.options)
        voice = summarize([(3200, 9600)], 16000)
        with patch("french_asr.detect", return_value=voice):
            detail = await engine.transcribe(audio, word_evidence=True)
        self.assertEqual(detail["words"], [{"text": "Bonjour", "start": .2, "end": .6, "probability": .83, "segment": 0}])
        self.assertTrue(engine.model.options["word_timestamps"])
        self.assertEqual(detail["speech_seconds"], .4)
