import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from daily_practice_config import ModeSettings, SlotRules
from recording_window import RecordingWindow
from slot_rules import score
from slot_session import BASE, assess, install

SETTINGS = ModeSettings(True, 6, SlotRules(), 1.2)
FRAME = {"id":"example", "template":"Je fais {slot}.", "candidates":[
    {"id":"a","form":"du sport","condition":"运动","pronunciation":"/dy spɔʁ/","demo_wav":"a.wav"},
    {"id":"b","form":"de la muscu","condition":"力量训练","pronunciation":"/də la mysky/","demo_wav":"b.wav"},
]}
FRAME["prompts"] = [{"id":f"p{i}", "target":item, "cue":item} for i, item in enumerate("abba")]
FRAME["examples"] = [{"prompt":p["id"],"spoken_candidate":c,"accepted":p["target"] == c}
                     for p in FRAME["prompts"][:2] for c in "ab"]
FRAME["validation"] = {"listened":False, "blind_test":"未测", "asr_hits":None}
WINDOW = {"start":2.0,"end":4.0}


def transcript(text, probabilities=None, offset=2.10, duration=1.3):
    words = text.split()
    probabilities = [.95] * len(words) if probabilities is None else probabilities
    return {"text":text, "segments":[{"no_speech_prob":.03}],
            "speech_spans":[{"start":offset,"end":offset + duration}],
            "words":[{"segment":0,"text":word,"start":offset + .19*i,"end":offset + .19*i + .16,
                      "probability":probability} for i, (word, probability) in enumerate(zip(words, probabilities))]}


class RuleTests(unittest.TestCase):
    def verdict(self, asr, target="a", **options):
        outcome, evidence = score(FRAME, target, WINDOW, asr, SETTINGS, **options)
        return outcome, evidence["rule"]

    def test_reliable_target_opposite_and_thresholds(self):
        self.assertEqual(self.verdict(transcript("Je fais du sport", [.5,.5,.68,.68])), ("pass","target_form"))
        self.assertEqual(self.verdict(transcript("Je fais de la muscu", [.5,.5,.75,.75,.75])), ("retry","opposite_form"))
        self.assertEqual(self.verdict(transcript("Je fais du sport", [.9,.9,.679,.9])),
                         ("undetermined","low_slot_confidence"))
        self.assertEqual(self.verdict(transcript("Je fais de la muscu", [.9,.9,.749,.9,.9])),
                         ("undetermined","low_slot_confidence"))

    def test_missing_ambiguous_and_crossing_never_retry(self):
        for raw, reason in (
            ("Il fait du sport", "frame_coverage"),
            ("Je fais", "missing_slot"),
            ("Je fais du sport de la muscu", "competing_forms"),
            ("Je fais parfois du sport", "missing_slot"),
        ):
            self.assertEqual(self.verdict(transcript(raw)), ("undetermined",reason))
        record = transcript("Je fais du sport")
        record["words"][-1]["end"] = 4.1
        self.assertEqual(self.verdict(record), ("undetermined", "cross_window"))
        self.assertEqual(self.verdict(transcript("Je fais du sport", duration=0)),
                         ("undetermined","voice_timing_unavailable"))
        self.assertEqual(self.verdict(transcript("Je fais du sport"), assisted=True), ("release","assisted_speech"))

    def test_short_and_uncertain_frame_require_complete_high_confidence_target(self):
        self.assertEqual(self.verdict(transcript("Je fais du sport", duration=.84)), ("pass","target_form"))
        self.assertEqual(self.verdict(transcript("Je fais de la muscu", duration=1.184), "b"),
                         ("pass","target_form"))
        self.assertEqual(self.verdict(transcript("Je fais de la muscu", duration=.992)),
                         ("retry","opposite_form"))
        self.assertEqual(self.verdict(transcript("Je fais du sport", [.28,.99,.95,.95])),
                         ("pass","clear_slot_with_weak_frame_word"))
        self.assertEqual(self.verdict(transcript("Je fais de la muscu", [.28,.99,.95,.95,.95])),
                         ("undetermined","frame_coverage"))
        self.assertEqual(self.verdict(transcript("Je fais euh du sport")), ("pass","target_form"))
        self.assertEqual(self.verdict(transcript("du sport")), ("undetermined","frame_coverage"))

    def test_assisted_completion_within_one_vad_step_requires_the_complete_model(self):
        for raw, target in (("Je fais du sport", "a"), ("Je fais de la muscu", "b")):
            with self.subTest(raw=raw):
                heard = transcript(raw, duration=1.184)
                verdict, evidence = score(FRAME, target, WINDOW, heard, SETTINGS, assisted=True)
                self.assertEqual(verdict, "release")
                self.assertEqual(evidence["rule"], "assisted_speech_within_vad_step")
                self.assertAlmostEqual(evidence["speech_seconds"], 1.184)
                self.assertEqual(evidence["thresholds"]["min_release_seconds"], 1.2)
                heard["words"][-1]["probability"] = .84
                self.assertEqual(self.verdict(heard, target, assisted=True),
                                 ("undetermined","insufficient_assisted_speech"))
        for heard in (
            transcript("Je fais du sport", duration=1.15),
            transcript("Je fais de la muscu", duration=1.184),
            transcript("Je fais", duration=1.184),
            transcript("du sport", duration=1.184),
        ):
            with self.subTest(heard=heard):
                self.assertEqual(self.verdict(heard, assisted=True)[0], "undetermined")
        crossing = transcript("Je fais du sport", duration=1.184)
        crossing["words"][-1]["end"] = 4.1
        self.assertEqual(self.verdict(crossing, assisted=True), ("undetermined","cross_window"))

    def test_short_complete_answer_uses_normal_word_threshold(self):
        probabilities = [.882, .761, .68, .994]
        self.assertEqual(self.verdict(transcript("Je fais du sport", probabilities, duration=1.12)),
                         ("pass","target_form"))
        probabilities[2] = .672
        self.assertEqual(self.verdict(transcript("Je fais du sport", probabilities, duration=1.12)),
                         ("undetermined","low_slot_confidence"))
        self.assertEqual(self.verdict(transcript("Je fais du sport", probabilities, duration=1.02)),
                         ("undetermined","low_slot_confidence"))

    def test_timeout_with_unrelated_tail_activity_keeps_complete_answer(self):
        for raw, expected in (("Je fais du sport", ("pass","target_form")),
                              ("Je fais de la muscu", ("retry","opposite_form"))):
            with self.subTest(raw=raw):
                heard = transcript(raw)
                heard["speech_spans"].append({"start":3.65,"end":4.0})
                self.assertEqual(self.verdict(heard, capped=True), expected)
                _, evidence = score(FRAME, "a", WINDOW, heard, SETTINGS, capped=True)
                self.assertTrue(evidence["metrics"]["tail_activity"])
                self.assertLess(evidence["metrics"]["answer_end"],3.65)

    def test_timeout_does_not_pass_incomplete_or_unconfirmed_final_word(self):
        late = transcript("Je fais du sport")
        late["speech_spans"].append({"start":3.65,"end":4.0})
        late["words"][-1].update(start=3.64,end=4.0)
        self.assertEqual(self.verdict(late, capped=True), ("undetermined","end_of_window_unconfirmed"))
        late["words"][-1]["end"] = 4.09
        self.assertEqual(self.verdict(late, capped=True), ("undetermined","cross_window"))
        late["words"].pop()
        self.assertEqual(self.verdict(late, capped=True), ("undetermined","missing_slot"))


class AcousticRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_continuous_review_recovers_complete_short_answer_without_changing_time(self):
        class Engine:
            def __init__(self, responses):
                self.responses = iter(responses)
                self.profiles = []

            async def transcribe_wav(self, data, *, word_evidence, continuous=False):
                self.profiles.append(continuous)
                return next(self.responses)

        sample_window = RecordingWindow.select(bytes(128000), 6)
        early = transcript("Je fais du sport", [.882,.761,.672,.994], offset=1.2, duration=1.12)
        padded = transcript("Je fais", offset=1.368)
        continuous = transcript("Je fais du sport", [.85,.91,.72,.96], offset=.34)
        engine = Engine([early, padded, continuous])
        verdict, evidence = await assess(engine, FRAME, "a", sample_window, SETTINGS, assisted=False, capped=False)
        self.assertEqual(verdict, "pass")
        self.assertEqual(engine.profiles, [False, False, True])
        self.assertEqual(evidence["rule"], "target_form_redecoded")
        self.assertEqual(evidence["metrics"]["recovered_by"], "continuous")
        self.assertEqual(evidence["metrics"]["first_rule"], "low_slot_confidence")
        self.assertAlmostEqual(evidence["speech_seconds"], 1.12)
        self.assertAlmostEqual(evidence["metrics"]["answer_end"], 1.93)
        self.assertEqual(evidence["window"], sample_window.timing())
        self.assertEqual([d["rule"] for d in evidence["metrics"]["decodes"]],
                         ["low_slot_confidence", "missing_slot", "target_form"])

    async def test_review_will_not_replace_conflicting_candidate_with_expected_answer(self):
        class Engine:
            def __init__(self, responses):
                self.responses = list(responses)
            async def transcribe_wav(self, data, *, word_evidence, continuous=False):
                return self.responses.pop(0)

        sample_window = RecordingWindow.select(bytes(128000), 6)
        primary = transcript("Je fais", offset=.6)
        padded = transcript("Je fais de la muscu", offset=.768)
        continuous = transcript("Je fais du sport", offset=.33)
        engine = Engine([primary, padded, continuous])
        verdict, evidence = await assess(engine, FRAME, "a", sample_window, SETTINGS, assisted=False, capped=False)
        self.assertEqual(verdict, "undetermined")
        self.assertEqual(evidence["metrics"]["decodes"][-1]["rule"], "opposite_form")
        self.assertEqual([attempt["recognized"] for attempt in evidence["metrics"]["decodes"]],
                         ["Je fais", "Je fais de la muscu"])
        self.assertEqual(len(engine.responses), 1)

    async def test_alternate_model_needs_exact_answer_or_strong_same_slot_from_first_model(self):
        class Engine:
            def __init__(self, first, last):
                self.responses = iter([transcript(first, offset=.22),
                                       transcript(first, offset=.39),
                                       transcript(first, offset=.32)])
                self.last = last

            async def transcribe_wav(self, data, *, word_evidence, continuous=False):
                return next(self.responses)

            async def transcribe_alternate_wav(self, data):
                return transcript(self.last, offset=.32)

        window = RecordingWindow.select(bytes(96000), 6)
        for first, last, expected in (
            ("J'ai fait de la muscu", "Je fais de la muscu et", "pass"),
            ("Je fais", "Je fais de la muscu", "pass"),
            ("Je fais", "Je fais de la muscu et", "undetermined"),
            ("J'ai fait de la muscu", "Je fais de la muscu et du sport", "undetermined"),
        ):
            with self.subTest(first=first, last=last):
                verdict, evidence = await assess(Engine(first, last), FRAME, "b", window, SETTINGS,
                                                  assisted=False, capped=False)
                self.assertEqual(verdict, expected)
                self.assertEqual(evidence["metrics"]["decodes"][-1]["profile"], "alternate")
                if expected == "pass":
                    self.assertEqual(evidence["metrics"]["recovered_by"], "alternate")

    async def test_redecode_preserves_clock_and_does_not_infer_from_target_only(self):
        class Engine:
            calls = 0
            async def transcribe_wav(self, data, *, word_evidence):
                self.calls += 1
                return self.responses.pop(0)

        engine = Engine()
        window = RecordingWindow.select(bytes(64000), 6)
        initial = transcript("J'ai fait de la muscu", offset=.15, duration=1.184)
        corrected = transcript("Je fais de la muscu", offset=.30, duration=1.5)
        engine.responses = [initial, corrected]
        verdict, evidence = await assess(engine, FRAME, "b", window, SETTINGS, assisted=False, capped=False)
        self.assertEqual(verdict, "pass")
        self.assertEqual(evidence["metrics"]["first_rule"], "frame_coverage")
        self.assertEqual(evidence["window"],window.timing())
        self.assertAlmostEqual(evidence["speech_seconds"],1.184)
        engine.responses = [transcript("de la muscu", offset=.15)]
        verdict, _ = await assess(engine, FRAME, "b", window, SETTINGS, assisted=False, capped=False)
        self.assertEqual(verdict,"undetermined")
        self.assertEqual(engine.calls,3)
        engine.responses = [initial, transcript("Je fais du sport", offset=.30)]
        verdict, _ = await assess(engine, FRAME, "b", window, SETTINGS, assisted=False, capped=False)
        self.assertEqual(verdict,"undetermined")
        engine.responses = [transcript("J ai fait du sport", offset=.15),
                            transcript("Je fais de la muscu", offset=.30)]
        verdict, _ = await assess(engine, FRAME, "b", window, SETTINGS, assisted=False, capped=False)
        self.assertEqual(verdict,"undetermined")
        self.assertEqual(len(engine.responses),1)

    async def test_uncertain_capped_window_retries_without_requiring_original_slot_match(self):
        class Engine:
            async def transcribe_wav(self, data, *, word_evidence):
                return self.responses.pop(0)

        engine = Engine()
        window = RecordingWindow.select(bytes(6*32000), 6)
        initial = transcript("J'ai fait de la", offset=.15, duration=1.38)
        initial["speech_spans"].append({"start":5.7,"end":6.0})
        corrected = transcript("Je fais de la muscu", offset=.30, duration=1.50)
        engine.responses = [initial, corrected]
        verdict, evidence = await assess(engine, FRAME, "b", window, SETTINGS, assisted=False, capped=True)
        self.assertEqual(verdict,"pass")
        self.assertEqual(evidence["metrics"]["first_rule"],"frame_coverage")
        self.assertTrue(evidence["metrics"]["tail_activity"])
        self.assertEqual(evidence["window"],window.timing())
        self.assertAlmostEqual(evidence["speech_seconds"],1.68)


class RoundTests(unittest.IsolatedAsyncioTestCase):
    async def test_three_reviewed_frames_keep_results_and_progress_separate(self):
        class Engine:
            async def transcribe_wav(self, data, *, word_evidence):
                return self.responses.pop(0)

        @web.middleware
        async def guard(request, handler):
            try:
                return await handler(request)
            except ValueError as exc:
                return web.json_response({"error":str(exc)}, status=400)

        with TemporaryDirectory() as temp:
            root = Path(temp)
            pack = root / "frames.json"
            frames = [
                {**FRAME, "id":f"frame-{index}", "template":template,
                 "validation":{"listened":True, "blind_test":"通过", "asr_hits":"fixture"}}
                for index, template in enumerate(("Je fais {slot}.", "Le lundi, je fais {slot}.",
                                                   "Je fais {slot} le jeudi."))]
            lesson = {"lesson_id":"trial", "version":2, "frames":frames}
            for name in ("a.wav","b.wav"):
                (root / name).write_bytes(RecordingWindow.select(bytes(64000), 6).wav())
            app = web.Application(middlewares=[guard])
            engine = app["french_asr"] = Engine()
            install(app, root / "data", SETTINGS, pack)
            async with TestClient(TestServer(app)) as client:
                unreviewed = {**frames[-1], "validation":FRAME["validation"]}
                pack.write_text(json.dumps({**lesson, "frames":[*frames[:-1], unreviewed]}), encoding="utf-8")
                self.assertEqual((await client.get(BASE)).status, 400)
                pack.write_text(json.dumps(lesson), encoding="utf-8")
                state = await (await client.post(BASE, json={"lesson":"trial"})).json()
                url = BASE + "/" + state["id"]
                for index, frame in enumerate(frames):
                    self.assertEqual(state["frame_index"], index)
                    self.assertEqual(state["frame"]["id"], frame["id"])
                    self.assertEqual((await (await client.get(url)).json())["frame_index"], index)
                    engine.responses = [
                        transcript(frame["template"].replace("{slot}", {"a":"du sport","b":"de la muscu"}[task["prompt"]["target"]]),
                                   offset=.15) for task in state["tasks"]]
                    for _ in range(4):
                        response = await client.post(f'{url}/{state["revision"]}/record', data=bytes(64000))
                        self.assertEqual(response.status, 200)
                        state = await response.json()
                    state = await (await client.post(f'{url}/{state["revision"]}/grade', json={})).json()
                    self.assertEqual(state["stage"], "feedback")
                    if index < 2:
                        self.assertEqual((await client.post(f'{url}/{state["revision"]}/advance',
                            json={"action":"finish"})).status, 400)
                    action = "next_frame" if index < 2 else "finish"
                    state = await (await client.post(f'{url}/{state["revision"]}/advance',
                        json={"action":action})).json()
                self.assertEqual(state["stage"], "report")
                self.assertEqual(state["summary"]["passes"], 12)
                self.assertEqual([row["frame_id"] for row in state["rows"]], [frame["id"] for frame in frames for _ in range(4)])
                logs = (await (await client.get(url + "/log")).text()).splitlines()
                self.assertEqual(len(logs), 12)

    async def test_audition_restore_group_log_and_retry(self):
        class Engine:
            calls = 0
            responses = None
            async def transcribe_wav(self, data, *, word_evidence):
                assert word_evidence
                self.calls += 1
                return self.responses.pop(0)

        @web.middleware
        async def guard(request, handler):
            try:
                return await handler(request)
            except ValueError as exc:
                return web.json_response({"error":str(exc)}, status=400)

        with TemporaryDirectory() as temp:
            root = Path(temp)
            pack = root / "frames.json"
            lesson = {"lesson_id":"trial", "version":1, "frames":[FRAME]}
            pack.write_text(json.dumps(lesson), encoding="utf-8")
            for name in ("a.wav", "b.wav"):
                (root / name).write_bytes(RecordingWindow.select(bytes(64000), 6).wav())
            app = web.Application(middlewares=[guard])
            engine = app["french_asr"] = Engine()
            install(app, root / "data", SETTINGS, pack)
            async with TestClient(TestServer(app)) as client:
                self.assertEqual((await client.post(BASE,json={"lesson":"trial"})).status,400)
                listing = await (await client.get(BASE)).json()
                self.assertFalse(listing["audition_confirmed"])
                self.assertEqual((await client.post(BASE + "/audition",
                    json={"fingerprint":listing["fingerprint"],"heard":["a"]})).status,400)
                self.assertEqual((await client.post(BASE + "/audition",
                    json={"fingerprint":listing["fingerprint"],"heard":["a","b"]})).status,200)
                state = await (await client.post(BASE,json={"lesson":"trial"})).json()
                url = BASE + "/" + state["id"]

                async def post(section, **kwargs):
                    nonlocal state
                    response = await client.post(f'{url}/{state["revision"]}/{section}', **kwargs)
                    self.assertEqual(response.status,200)
                    state = await response.json()

                invalid = f'{url}/{state["revision"]}/record?active_ms=10000&lead_samples='
                self.assertEqual((await client.post(invalid+"4001",data=bytes(32000))).status,400)
                self.assertEqual((await client.post(invalid+"3200",data=bytes(2*(6*16000+3201)))).status,400)
                for i in range(4):
                    if i == 0:
                        await post("record?active_ms=10000&lead_samples=3200", data=bytes(2*(6*16000+3200)))
                        self.assertIn("accepted_clip",state)
                        self.assertNotIn("accepted_clip",await (await client.get(url)).json())
                    else:
                        await post("record?active_ms=10000", data=bytes(64000))
                    self.assertEqual(len((await (await client.get(url)).json())["clips"]),i+1)
                    self.assertEqual(engine.calls,0)
                self.assertEqual(state["stage"],"pending")
                engine.responses = []
                for i, task in enumerate(state["tasks"]):
                    forms = {"a":"Je fais du sport","b":"Je fais de la muscu"}
                    expected = task["prompt"]["target"]
                    actual = expected if i != 1 else ("b" if expected == "a" else "a")
                    engine.responses.append(transcript(forms[actual], offset=.15))
                awaits = f'{url}/{state["revision"]}/grade'
                await post("grade",json={})
                self.assertEqual([row["verdict"] for row in state["rows"]], ["pass","retry","pass","pass"])
                self.assertEqual(engine.calls,4)
                self.assertEqual((await client.post(awaits,json={})).status,200)
                self.assertEqual(engine.calls,4)
                self.assertFalse(list(root.rglob("*.pcm")))
                await post("advance", json={"action":"retry","active_ms":20_000})
                self.assertEqual([task["level"] for task in state["tasks"]],[1])
                log = await (await client.get(url + "/log")).text()
                self.assertEqual(len(log.splitlines()),4)
                first_window = json.loads(log.splitlines()[0])["evidence"]["window"]
                self.assertEqual((first_window["seconds"],first_window["limit_seconds"],
                                  first_window["pre_cue_seconds"]),(6.2,6,.2))
                corrected = state["tasks"][0]["prompt"]["target"]
                engine.responses = [transcript(forms[corrected], offset=.15)]
                await post("record?active_ms=21000", data=bytes(64000))
                await post("grade", json={})
                await post("advance", json={"action":"supplement","active_ms":24_000})
                self.assertTrue(all(task["supplement"] and task["level"] == 2 for task in state["tasks"]))
                engine.responses = [transcript(forms[task["prompt"]["target"]], offset=.15) for task in state["tasks"]]
                for _ in range(2):
                    await post("record?active_ms=25000", data=bytes(64000))
                await post("grade", json={})
                self.assertEqual([row["verdict"] for row in state["rows"][-2:]],["release","release"])
                await post("advance", json={"action":"finish","active_ms":26_000})
                self.assertEqual(state["summary"]["passes"],4)
                self.assertFalse(state["summary"]["needs_practice"])
