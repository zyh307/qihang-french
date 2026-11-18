import unittest
from lecture_desktop import evaluate, summary, advance

LINE = {"fr":"Ici, il y a un grand jardin."}


def read(text, confidence=-.2, prior=None):
    return evaluate(LINE, {"text":text,"segments":[{"avg_logprob":confidence,"no_speech_prob":.06}]}, prior)


class DesktopReading(unittest.TestCase):
    def test_word_evidence(self):
        result = read("Ici, il y a un jardin.")
        self.assertEqual([w["text"] for w in result["words"] if w["mark"] == "bad"], ["grand"])
        self.assertEqual(result["status"], "border")
        self.assertEqual(read("Ici il y a jardin")["status"],"retry")
        for heard,confidence in [("ici il y a jardin",-.8),("",-.1),("ici",-1.1)]:
            result = read(heard,confidence)
            self.assertIsNone(result["accuracy"])
            self.assertFalse(any(w["mark"]=="bad" for w in result["words"]))
        edge = read("Ici, il y a un grand.")
        self.assertEqual(edge["status"],"uncertain")
        self.assertEqual(read("Ici, il y a un grand.",prior=edge)["words"][-1]["mark"],"bad")
        self.assertEqual(read(LINE["fr"])["status"],"pass")

    def test_queue_requires_two_valid_passes_and_is_resumable(self):
        s={"text":{"sentences":[{"id":"a",**LINE}]},"attempts":[],"queue":["a"],
           "revision":0,"phase":"lines","skipped":[]}
        def append(text,confidence=-.2):
            s["revision"] += 1
            s["attempts"].append({"revision":s["revision"],"step":"a","phase":s["phase"],
                                  "result":read(text,confidence)})
        append("ici il y a jardin")
        advance(s,"next")
        self.assertEqual(s["phase"],"list")
        advance(s,"finish")
        advance(s,"drill","a")
        append(LINE["fr"])
        append("",-2)
        self.assertEqual(summary(s)["streaks"]["a"],1)
        with self.assertRaises(ValueError): advance(s,"next")
        append(LINE["fr"])
        self.assertEqual(summary(s)["wrong"],[])
        advance(s,"next")
        advance(s,"finish")
        self.assertFalse(summary(s)["cleared"])
        self.assertEqual(summary(s)["recorded"],1)
