import unittest
from guided_reading import advance, attempts, record, report, stage, start


class GuidedVisits(unittest.TestCase):
    def setUp(self):
        self.s = {"attempts":[],"queue":["one","two"]}
        start(self.s)

    def say(self, status, accuracy=None):
        row = {"step":self.s["queue"][0], "result":{"status":status,"accuracy":accuracy,
               "coverage":accuracy,"words":[]}}
        record(self.s,row,str(len(self.s["attempts"])))

    def test_three_then_offer_and_retry_only_skipped(self):
        for expected in ["blind","chunks","listen"]:
            with self.assertRaises(ValueError):
                advance(self.s,"skip")
            self.assertEqual(stage(self.s),expected)
            self.say("uncertain")
        self.assertEqual(len(attempts(self.s)),3)
        self.say("uncertain")
        self.assertEqual(self.s["queue"],["one","two"])
        advance(self.s,"skip")
        self.say("pass",1)
        self.assertEqual(self.s["phase"],"offer")
        advance(self.s,"review")
        self.assertEqual(self.s["queue"],["one"])
        self.assertEqual(report(self.s)["roundTotal"],1)
        self.assertEqual(stage(self.s),"listen")
        self.say("pass",1)
        self.assertEqual(self.s["phase"],"ended")
        r=report(self.s)
        self.assertEqual((r["valid"], r["accuracy"], r["due"]),(1,1,[]))
        self.assertEqual(r["lines"]["one"]["passKind"],"assisted")

    def test_pass_after_optional_retries(self):
        for _ in range(4):
            self.say("retry",.5)
        self.say("pass",1)
        self.assertEqual(self.s["queue"],["two"])
        self.assertEqual(self.s["attempts"][-1]["stage"],"retry")
        self.assertEqual(report(self.s)["due"],[])
        self.assertEqual(report(self.s)["accuracy"],.5)

    def test_resume_older_partial_review_and_warmup(self):
        for _ in range(2):
            advance(self.s,"timeout")
        advance(self.s,"review")
        self.say("pass",1)
        del self.s["roundTotal"]
        self.assertEqual(report(self.s)["roundTotal"],2)
        s={"attempts":[],"queue":["x","y","z"]}
        start(s,["z"])
        del s["roundTotal"]
        self.assertEqual(report(s)["roundTotal"],1)

    def test_decline_preserves_queue_and_initial_average(self):
        self.say("retry",.5)
        self.say("pass",1)
        advance(self.s,"timeout")
        advance(self.s,"finish")
        r=report(self.s)
        self.assertEqual((r["accuracy"],r["due"]),(.5,["two"]))

    def test_another_three_in_review_does_not_loop(self):
        advance(self.s,"timeout")
        self.say("pass",1)
        advance(self.s,"review")
        for _ in range(3):
            self.say("retry",.3)
        advance(self.s,"skip")
        self.assertEqual(self.s["phase"],"ended")
        self.assertEqual(report(self.s)["due"],["one"])
