"""Exercise real HTTP recording, confirmation, recovery and exam isolation."""
import tempfile
import unittest
from pathlib import Path
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from fake_primary_asr import FakePrimaryASR
from unit_practice import install, feedback


class UnitPracticeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = web.Application()
        self.asr = FakePrimaryASR()
        self.app["french_asr"] = self.asr
        @web.middleware
        async def bad_input(request, handler):
            try:
                return await handler(request)
            except ValueError as error:
                return web.json_response({"error": str(error)}, status=400)
        self.app.middlewares.append(bad_input)
        install(self.app, self.tmp.name)
        self.client = TestClient(TestServer(self.app))
        await self.client.start_server()
        self.base = "/api/unit-practice"
        self.pack = (await (await self.client.get(self.base)).json())["units"][0]
        response = await self.client.post(self.base, json={"unit":self.pack["id"]})
        self.sid = (await response.json())["id"]
        self.path = self.base + "/" + self.sid

    async def asyncTearDown(self):
        await self.client.close()
        self.tmp.cleanup()

    async def test_round(self):
        for card in self.pack["cards"]:
            for text in [card["model"], *card["variants"]]:
                self.assertEqual(feedback(card,text)["status"], "pass")
            url = self.path + "/" + card["id"]
            self.asr.text = card["model"]
            draft = await (await self.client.post(url+"/record", data=bytes(100000))).json()
            before = await (await self.client.get(self.path)).json()
            self.assertEqual(before["draft"], draft)
            self.assertEqual(len(before["rows"]), self.pack["cards"].index(card))
            payload = {"audio": draft["audio"], "text": card["variants"][0]}
            response = await self.client.post(url+"/confirm", json=payload)
            result = await response.json()
            self.assertEqual(result["rows"][-1]["status"], "pass")
            self.assertEqual((await self.client.post(url+"/confirm", json=payload)).status, 400)
        self.assertEqual(result["phase"],"ended")
        folder = Path(self.tmp.name)/"unit-practice/v1/sessions"/self.sid
        self.assertTrue((folder/"session.json").exists())
        self.assertEqual(len(list(folder.glob("*.wav"))),3)
        self.assertFalse((Path(self.tmp.name)/"sessions").exists())

    async def test_asr_failure_keeps_ungraded_audio(self):
        self.asr.error = "模型不可用"
        url = self.path + "/ask/record"
        self.assertEqual((await self.client.post(url, data=b"x")).status, 400)
        draft = await (await self.client.post(url, data=bytes(16000))).json()
        self.assertTrue(draft["uncertain"])
        self.assertTrue(draft["error"])
        self.assertEqual((await (await self.client.get(self.path)).json())["rows"],[])
        replay = await self.client.get(self.path + "/audio/" + draft["audio"])
        self.assertTrue((await replay.read()).startswith(b"RIFF"))

    async def test_repeat_preserves_confirmed_attempt(self):
        url = self.path + "/ask"
        draft = await (await self.client.post(url+"/record", data=bytes(16000))).json()
        payload = {"audio": draft["audio"], "text": "Bonjour"}
        result = await (await self.client.post(url+"/confirm", json=payload)).json()
        self.assertEqual(result["rows"][-1]["status"], "retry")
        result = await (await self.client.post(url+"/repeat", json=payload)).json()
        self.assertEqual(result["rows"], [])
        self.assertEqual(result["previous_attempts"][0]["confirmed"], "Bonjour")
