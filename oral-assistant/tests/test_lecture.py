import io
import unittest
from pathlib import Path
import json
import tempfile
from zipfile import ZipFile

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from lecture import install, pcm_wav
from lecture_alignment import align, compare, split_turn


class AlignmentTests(unittest.TestCase):
    def test_four_edits(self):
        for heard, expected in [("un jardin","missing"), ("un très grand jardin","extra"),
                                ("un petit jardin","replace"), ("un jardin grand","order")]:
            with self.subTest(heard=heard):
                self.assertIn(expected,[x["op"] for x in align("un grand jardin",heard)["edits"]])

    def test_evidence_first(self):
        self.assertEqual([e["op"] for e in align("un café et un musée","un musée et un café")["edits"]
                          if e["op"] != "match"],["order","order"])
        line = {"fr":"C’est l’hôtel.", "variants":["Voici l’hôtel."]}
        for segments in [[],[{"avg_logprob":-1.2,"no_speech_prob":.1}],
                         [{"avg_logprob":-.2,"no_speech_prob":.7}]]:
            self.assertIsNone(compare(line,{"text":"le bus","segments":segments})["accuracy"])
        strong = [{"avg_logprob":-.1,"no_speech_prob":.1}]
        self.assertEqual(compare(line,{"text":"voici l hôtel","segments":strong})["accuracy"],1)
        self.assertEqual(align("C’est l’hôtel.","C'est l'hôtel !")["status"],"pass")
        self.assertEqual(compare(line,{"text":"","segments":strong})["status"],"uncertain")

    def test_turn_boundaries(self):
        self.assertEqual(split_turn("M. Dupont hésite... puis répond. Oui !"),
                         ["M. Dupont hésite... puis répond.","Oui !"])
        self.assertEqual(split_turn("Bonjour ici, puis là.",2),["Bonjour ici,","puis là."])
        with self.assertRaises(ValueError):
            split_turn("Un très grand jardin",2)


class ReadingHTTP(unittest.IsolatedAsyncioTestCase):
    async def test_resume_review_skip_export(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            media = root/"import"
            media.mkdir()
            (media/"001.wav").write_bytes(pcm_wav(bytes(32000)))
            line = {"id":"s1","fr":"Bonjour madame","piste":1,"start":0,"end":1}
            pack = {"id":"test","piste":1,"sentences":[line]}
            (media/"test.json").write_text(json.dumps(pack))
            class ASR:
                async def transcribe(self,path):
                    return self.answer
            app=web.Application()
            engine=ASR()
            app["french_asr"]=engine
            install(app,root,media)
            async with TestClient(TestServer(app)) as client:
                s=await (await client.post("/api/lecture",json={"text":"test"})).json()
                base="/api/lecture/"+s["id"]
                async def advance(s,action):
                    return await (await client.post(base+"/"+str(s["revision"])+"/advance",json={"action":action})).json()
                async def record(s,text,confidence):
                    engine.answer={"text":text,"segments":[{"avg_logprob":confidence,"no_speech_prob":.02}]}
                    return await (await client.post(base+"/"+str(s["revision"])+"/record",data=bytes(32000))).json()
                s=await advance(s,"next")
                s=await record(s,"bonjour",-1.5)
                self.assertEqual(s["report"]["wrong"],[])
                self.assertEqual((await (await client.get(base)).json())["phase"],"lines")
                s=await record(s,"bonjour",-.2)
                s=await advance(s,"next")
                self.assertEqual(s["phase"],"review")
                s=await record(s,"bonjour madame",-.2)
                s=await advance(s,"next")
                self.assertEqual(s["phase"],"full")
                s=await advance(s,"skip")
                self.assertEqual(s["phase"],"ended")
                self.assertEqual(s["report"]["wrong"],[])
                self.assertEqual(s["report"]["recorded"],1)
                archive=await (await client.get(base+"/export")).read()
                with ZipFile(io.BytesIO(archive)) as z:
                    self.assertEqual(len(z.namelist()),4)
                self.assertFalse((root/"sessions").exists())
