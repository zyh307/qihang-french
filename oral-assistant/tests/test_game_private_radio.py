import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import IsolatedAsyncioTestCase

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from game_private_radio import ROUTE, install


class PrivateRadioTest(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        temp = self.enterContext(TemporaryDirectory())
        self.assets = Path(temp) / "assets-private"
        self.radio = self.assets / "radio"
        self.radio.mkdir(parents=True)
        self.app = web.Application()
        install(self.app, self.assets, lambda request: request.headers.get("X-Test-Client") == "integrated")
        self.client = await self.enterAsyncContext(TestClient(TestServer(self.app)))

    async def test_empty_catalog_and_unknown_track(self):
        response = await self.client.get(ROUTE)
        self.assertEqual(await response.json(), {"tracks": []})
        response = await self.client.get(ROUTE + "/001")
        self.assertEqual(response.status, 404)

    async def test_catalog_and_seek(self):
        (self.radio / "02 - Second.ogg").write_bytes(b"0123456789")
        (self.radio / "01 - First.mp3").write_bytes(b"abcdefghij")
        (self.radio / "secret.mp3").write_bytes(b"private")
        (self.radio / "03 - Notes.txt").write_text("private", encoding="utf-8")
        (self.radio / "tracks.json").write_text(json.dumps([
            {"file": "02 - Second.ogg", "title": "Alternate title", "durationSec": 90,
             "loopStartSec": 1, "loopEndSec": 81},
        ]), encoding="utf-8")
        response = await self.client.get(ROUTE)
        tracks = (await response.json())["tracks"]
        self.assertEqual([track["title"] for track in tracks], ["First", "Alternate title"])
        self.assertEqual(tracks[1]["loopEndSec"], 81)
        response = await self.client.get(tracks[0]["url"], headers={"Range": "bytes=2-4"})
        self.assertEqual(response.status, 206)
        self.assertEqual(response.content_type, "audio/mpeg")
        self.assertEqual(response.headers.get("Cache-Control"), "private, no-store")
        self.assertEqual(await response.read(), b"cde")
        (self.radio / "01 - First.mp3").unlink()
        response = await self.client.get(tracks[0]["url"])
        self.assertEqual(response.status, 404)

    async def test_private_audio_unavailable_to_proxy_other_origin_and_integrated_client(self):
        (self.radio / "01 - First.mp3").write_bytes(b"abc")
        for headers in ({"Host": "example.com"}, {"Sec-Fetch-Site": "same-site"},
                        {"Sec-Fetch-Site": "cross-site"}, {"X-Test-Client": "integrated"}):
            with self.subTest(headers=headers):
                manifest = await self.client.get(ROUTE, headers=headers)
                self.assertEqual(await manifest.json(), {"tracks": []})
                media = await self.client.get(ROUTE + "/001", headers=headers)
                self.assertEqual(media.status, 404)
