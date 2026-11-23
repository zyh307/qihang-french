from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from daily_practice_summary import notebook, note, slot_results, today
from practice_records import Mode, Verdict
from store import Store


class DailySummaryTests(unittest.TestCase):
    def test_current_pass_clears_only_matching_version_and_mode(self):
        unit = {"id":"activity", "groups":["Je fais du sport."]}
        current = {"lesson_id":"lesson", "version":2, "chains":[unit]}
        with TemporaryDirectory() as temp:
            root = Path(temp)
            store = Store(root / Mode.FLUENCY)
            def save(index, version, disposition):
                store.save({"id":f"{index:032x}", "created":index, "ended":index, "phase":"ended",
                            "part":"lesson", "lesson":{**current, "version":version},
                            "notebook_outcomes":[disposition]})
            save(1, 1, note(Mode.FLUENCY, "activity", Verdict.RELEASE, "queued", "assisted_speech", ts=1))
            save(2, 2, note(Mode.FLUENCY, "activity", Verdict.RELEASE, "queued", "assisted_speech", ts=2))
            self.assertEqual([(row["contentRevision"], row["oldVersion"])
                              for row in notebook(root, {Mode.FLUENCY:current})], [(1, True),(2, False)])
            save(3, 2, note(Mode.FLUENCY, "activity", Verdict.PASS, "cleared", "rhythm_within_limits", ts=3))
            self.assertEqual([row["contentRevision"] for row in notebook(root, {Mode.FLUENCY:current})], [1])

    def test_slot_needs_both_independent_forms_to_clear(self):
        frame = {"id":"frame", "candidates":[{"id":"sport"},{"id":"muscu"}]}
        def answer(form, verdict, level, **extra):
            return {"prompt":{"id":form, "target":form}, "verdict":verdict, "level":level,
                    "rule":"fixture", **extra}
        session = {"frame":frame, "lesson":{"frames":[frame]}, "rows":[
            answer("sport", Verdict.PASS, 0), answer("muscu", Verdict.RELEASE, 2),
            answer("muscu", Verdict.PASS, 0, supplement=True),
        ]}
        result = slot_results(session)["frame"]
        self.assertTrue(result["due"])
        self.assertFalse(result["both"])
        session["rows"].append(answer("muscu", Verdict.PASS, 0))
        self.assertTrue(slot_results(session)["frame"]["both"])

    def test_today_clips_voiced_intervals_and_keeps_unknown_voice_blank(self):
        start, end = 100_000, 186_400
        with TemporaryDirectory() as temp:
            data = Path(temp)
            root = data / "daily-speaking/v1"
            store = Store(root / Mode.FLUENCY)
            store.save({"id":"1"*32, "created":start-5, "ended":start+3, "phase":"ended",
                        "active_ms":6000, "speech_seconds":4, "speech_intervals":[[start-2,start+2]]})
            Store(data).save({"id":"2"*32, "created":start+1, "ended":start+9, "phase":"ended","mode":"simulation"})
            result = today(data, root, [Mode.FLUENCY], start, end)
            self.assertEqual(result[Mode.FLUENCY], {"completed":1, "short":0, "speech_seconds":2.0})
            self.assertEqual(result["exam"], {"completed":1, "short":0, "speech_seconds":None})
            self.assertIsNone(result[Mode.LECTURE]["speech_seconds"])
