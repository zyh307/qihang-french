import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import guided_reading as guided
from lecture import catalog, pcm_wav
import reading_library
from store import Store


class ReadingLibraryTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.store = Store(self.root/"records")
        self.pack = {"id":"lesson-a","piste":1,"sentences":[
            {"id":"s1","fr":"Salut !","piste":1,"start":0,"end":0.25}]}
        self.path = self.root/"lesson-a.json"
        self.path.write_text(json.dumps(self.pack),encoding="utf-8")
        (self.root/"001.wav").write_bytes(pcm_wav(bytes(16000)))
        self.pack = catalog(self.root, True)["lesson-a"]
        self.serial = 0
        self.clock = iter(range(1,5000))

    def session(self, notebook=False):
        self.serial += 1
        s = dict(id=f"{self.serial:032x}",created=next(self.clock),part=self.pack["id"],
                 text=self.pack,queue=["s1"],attempts=[],origin="notebook" if notebook else "lesson")
        guided.start(s,["s1"] if notebook else None)
        return s

    def say(self, s, status):
        score = {"uncertain":None,"retry":.4,"pass":1}[status]
        mark = {"uncertain":"maybe","retry":"bad","pass":"good"}[status]
        row = dict(step="s1",at=next(self.clock),result=dict(status=status,accuracy=score,coverage=score,
                   words=[{"text":"Salut","mark":mark}],extras=[]))
        with patch("guided_reading.time.time",return_value=next(self.clock)):
            guided.record(s,row,str(row["at"]))
        self.store.save(s)

    def index(self):
        return reading_library.index(self.store, catalog(self.root,True))

    def test_missing_audio_empty_and_unplayable_lessons_are_hidden(self):
        clone = dict(self.pack,id="lesson-b", sentences=[])
        (self.root/"lesson-b.json").write_text(json.dumps(clone))
        (self.root/"bad.json").write_text("{")
        self.assertEqual(list(catalog(self.root,True)),["lesson-a"])
        (self.root/"001.wav").write_bytes(pcm_wav(bytes(100)))
        self.assertEqual(catalog(self.root,True),{})

    def test_enter_on_third_before_skip_and_leave_on_pass(self):
        s = self.session()
        self.say(s,"uncertain")
        self.say(s,"retry")
        self.assertFalse(self.index()["reviewQueue"])
        self.say(s,"retry")
        self.say(s,"retry")
        entry, = self.index()["reviewQueue"]
        self.assertEqual((entry["failures"],entry["uncertain"]),(3,1))
        self.assertEqual(self.index()["inProgress"]["lesson-a"],s["id"])
        self.say(s,"pass")
        self.assertFalse(self.index()["reviewQueue"])
        self.assertFalse(self.index()["lessons"]["lesson-a"]["crown"])

    def test_crown_is_per_complete_blind_round_and_revision(self):
        self.say(self.session(),"pass")
        self.assertTrue(self.index()["lessons"]["lesson-a"]["crown"])
        s = self.session()
        self.say(s,"retry"); self.say(s,"pass")
        self.assertFalse(self.index()["lessons"]["lesson-a"]["crown"])
        self.say(self.session(True),"pass")
        self.assertEqual(self.index()["lessons"]["lesson-a"]["sessionId"],s["id"])
        self.say(self.session(),"pass")
        (self.root/"001.wav").write_bytes(pcm_wav(bytes(16100)))
        self.assertFalse(self.index()["lessons"])

    def test_clear_in_notebook_preserves_lesson_report(self):
        s = self.session()
        for _ in range(3):
            self.say(s,"retry")
        with patch("guided_reading.time.time",return_value=next(self.clock)):
            guided.advance(s,"skip")
        self.store.save(s)
        original = self.index()["lessons"]
        self.say(self.session(True),"pass")
        self.assertEqual(self.index()["lessons"],original)
        self.assertFalse(self.index()["reviewQueue"])

    def test_oldest_of_101_is_archived_without_removing_its_record(self):
        s = self.session()
        s["text"]["sentences"] = [dict(self.pack["sentences"][0], id=f"s{i}") for i in range(101)]
        s["queue"] = [r["id"] for r in s["text"]["sentences"]]
        s["roundTotal"] = 101
        with patch("guided_reading.time.time", side_effect=lambda:next(self.clock)):
            for _ in range(101):
                guided.advance(s,"timeout")
        self.store.save(s)
        queue = reading_library.index(self.store, {s["part"]:s["text"]})["reviewQueue"]
        self.assertEqual((len(queue), queue[0]["sentenceId"]), (100, "s1"))
        self.assertEqual(len(self.store.load(s["id"])["outcomes"]), 101)
