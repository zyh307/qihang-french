import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from daily_practice_config import FluencyRules, ModeSettings
from fluency_rules import score
from fluency_session import BASE, install
from word_alignment import tokens

CHAIN = {"id": "fixture", "groups": ["un deux trois", "quatre cinq six", "sept huit neuf"],
         "pause_after_words": [3, 6], "short_groups": ["un deux trois", "quatre cinq six"]}
SETTINGS = ModeSettings(True, 12, FluencyRules(), 1.5)


def heard(*, text=None, speech=4.5, span=5.4, confidence=.9, no_speech=.1, pauses=()):
    words = tokens(" ".join(CHAIN["groups"]) if text is None else text)
    return {
        "words": [{"text": word, "start": i * span / len(words), "end": (i + .6) * span / len(words),
                   "probability": confidence, "segment": 0} for i, word in enumerate(words)],
        "segments": [{"no_speech_prob": no_speech}], "speech_seconds": speech,
        "speech_spans": [{"start": 0, "end": span}],
        "pause_spans": [{"start": left, "end": right, "seconds": round(right - left, 3)}
                        for left, right in pauses],
    }


class FluencyRulesTest(unittest.TestCase):
    def decision(self, asr, assisted=False):
        result, evidence = score(CHAIN, {"seconds":12}, asr, SETTINGS, assisted)
        return result, evidence["rule"]

    def test_coverage_and_timing_do_not_infer_an_error(self):
        self.assertEqual(self.decision(heard()), ("pass", "rhythm_within_limits"))
        for candidate in (heard(confidence=.549),
                          heard(no_speech=.6), heard(text="zéro deux oui quatre cinq six sept huit neuf")):
            self.assertEqual(self.decision(candidate)[0], "undetermined")
        for span, band in ((3.5, "above"), (10, "below")):
            verdict, evidence = score(CHAIN, {"seconds":12}, heard(span=span), SETTINGS)
            self.assertEqual((verdict, evidence["rule"]), ("pass", "rhythm_within_limits"))
            self.assertEqual(evidence["metrics"]["rate_reference"], band)
        self.assertEqual(self.decision(heard(text="un deux un deux un deux trois quatre cinq six sept huit neuf")),
                         ("retry", "group_restarts"))

    def test_short_complete_chain_uses_word_and_rhythm_evidence(self):
        self.assertEqual(self.decision(heard(speech=2.816, span=2.9)),
                         ("pass", "rhythm_within_limits"))
        self.assertEqual(self.decision(heard(speech=1, text="un deux trois", span=1.1)),
                         ("undetermined", "insufficient_word_evidence"))
        self.assertEqual(self.decision(heard(speech=0, span=2.9)),
                         ("undetermined", "voice_timing_unavailable"))

    def test_pauses_allow_more_time_at_group_boundaries(self):
        internal = (.38, 1.19)
        boundary = (1.27, 2.27)
        self.assertEqual(self.decision(heard(pauses=(internal,))), ("retry", "internal_pause"))
        self.assertEqual(self.decision(heard(pauses=(boundary,)))[0], "pass")
        self.assertEqual(self.decision(heard(pauses=((1.12, 2.42),))), ("retry", "boundary_pause"))
        # The third word's ASR midpoint falls in silence. It must not turn a
        # pause across the group boundary into an internal one.
        self.assertEqual(self.decision(heard(pauses=((.39, 1.39),)))[0], "pass")

    def test_release_only_with_assisted_speech(self):
        self.assertEqual(self.decision(heard(text="", speech=1.5), assisted=True),
                         ("release", "assisted_speech"))
        self.assertEqual(self.decision(heard(text="", speech=1.49), assisted=True)[0], "undetermined")

    def test_only_an_unconfirmed_ending_at_the_limit_blocks_a_complete_chain(self):
        ending = heard(text="un deux trois quatre cinq six sept huit", span=6)
        ending["speech_spans"][-1]["end"] = 12
        verdict, evidence = score(CHAIN, {"seconds":12}, ending, SETTINGS, capped=True)
        self.assertEqual((verdict, evidence["rule"]), ("undetermined", "window_ended_mid_chain"))
        self.assertGreaterEqual(evidence["hit_rate"], .80)
        self.assertTrue(evidence["metrics"]["tail_activity"])
        verdict, evidence = score(CHAIN, {"seconds":12}, {**ending, "speech_seconds":2.9}, SETTINGS, capped=True)
        self.assertEqual((verdict, evidence["rule"]), ("undetermined", "window_ended_mid_chain"))

        ending = heard(span=6)
        ending["speech_spans"].append({"start":11.8, "end":12})
        ending["words"][-1].update(start=11.83, end=12.01)
        verdict, evidence = score(CHAIN, {"seconds":12}, ending, SETTINGS, capped=True)
        self.assertEqual((verdict, evidence["rule"]), ("undetermined", "window_ended_mid_chain"))
        self.assertEqual(evidence["metrics"]["cross_window_words"], ["neuf"])

        ending["words"][-1].update(start=5.35, end=5.85)
        verdict, evidence = score(CHAIN, {"seconds":12}, ending, SETTINGS, capped=True)
        self.assertNotEqual(evidence["rule"], "window_ended_mid_chain")


class FluencyRoundTest(unittest.IsolatedAsyncioTestCase):
    async def test_round_resume_stale_duplicate_and_one_log_per_decision(self):
        class Engine:
            async def transcribe_wav(self, data, *, word_evidence):
                assert word_evidence
                self.calls += 1
                return self.next_result
            calls = 0

        with TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data"
            path = root / "chains.json"
            chains = [{**CHAIN, "id": f"c{i}"} for i in range(3)]
            path.write_text(json.dumps({"lesson_id": "fixture", "version": 1, "chains": chains}), encoding="utf-8")
            app = web.Application(client_max_size=64*1024)
            engine = app["french_asr"] = Engine()
            install(app, data, SETTINGS, path)
            async with TestClient(TestServer(app)) as client:
                session = await (await client.post(BASE, json={"lesson":"fixture"})).json()
                url = BASE + "/" + session["id"]
                saved = data / "daily-speaking/v1/fluency/sessions" / session["id"] / "session.json"
                legacy = json.loads(saved.read_text(encoding="utf-8"))
                legacy["rules"]["min_speech_seconds"] = 3.0
                saved.write_text(json.dumps(legacy), encoding="utf-8")
                async def action(name, active=40_000):
                    nonlocal session
                    endpoint = f'{url}/{session["revision"]}/advance'
                    response = await client.post(endpoint, json={"action":name,"active_ms":active})
                    self.assertEqual(response.status, 200)
                    session = await response.json()
                previous = ""
                async def audio(result, *, capped=False):
                    nonlocal session, previous
                    engine.next_result = result
                    previous = f'{url}/{session["revision"]}/record?active_ms=10000'
                    if capped:
                        previous += "&capped=1"
                    response = await client.post(previous, data=bytes(32000*8))
                    self.assertEqual(response.status, 200)
                    session = await response.json()

                await audio(heard())
                self.assertEqual(session["stage"], "full")
                await audio(heard(speech=2.816, span=2.9))
                self.assertEqual(session["last"]["verdict"], "pass")
                calls = engine.calls
                duplicate = await (await client.post(previous, data=bytes(32000*8))).json()
                self.assertEqual(duplicate["revision"], session["revision"])
                self.assertEqual(engine.calls, calls)
                await action("next")
                self.assertEqual((await (await client.get(url)).json())["position"], 1)
                await action("skip_chunks")
                await audio(heard(pauses=((.38, 1.19),)))
                self.assertEqual(session["last"], {"verdict":"retry", "rule":"internal_pause"})
                await action("hint")
                self.assertEqual(session["level"], 1)
                clipped = heard(text="un deux trois quatre cinq six sept huit")
                clipped["speech_spans"][-1]["end"] = 8
                await audio(clipped, capped=True)
                self.assertEqual(session["last"]["verdict"], "undetermined")
                self.assertEqual(session["last"]["rule"], "window_ended_mid_chain")
                await action("hint")
                self.assertEqual(session["level"], 2)
                await audio(heard(speech=1.5, text=""))
                await action("next")
                await action("skip_chunks")
                await audio(heard())
                await action("next", 75_000)
                self.assertEqual(session["stage"], "report")
                self.assertEqual(session["summary"]["due"], ["c1"])
                self.assertFalse(session["summary"]["effective"])
                lines = (await (await client.get(url + "/log")).text()).splitlines()
                self.assertEqual([json.loads(line)["verdict"] for line in lines],
                                 ["pass", "retry", "undetermined", "release", "pass"])
                self.assertEqual(len(list(data.rglob("*.jsonl"))), len(lines))
