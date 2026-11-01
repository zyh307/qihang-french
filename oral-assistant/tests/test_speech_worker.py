import asyncio,io,json,tempfile,threading,unittest,wave
from pathlib import Path
import test_core as core
import aiohttp
from aiohttp import web
from french_asr import FrenchEngine,FrenchASRClient
from speech_server import make_speech_app


def wav_bytes(rate=16000,channels=1,seconds=.05):
    out=io.BytesIO()
    with wave.open(out,'wb') as w:
        w.setnchannels(channels);w.setsampwidth(2);w.setframerate(rate)
        w.writeframes(b'\0\0'*int(rate*channels*seconds))
    return out.getvalue()


class SilentEngine(FrenchEngine):
    def _load(self):pass


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_wav_validation_and_silence(self):
        engine=SilentEngine({})
        for data in (b'bad',wav_bytes(rate=8000),wav_bytes(channels=2),wav_bytes(seconds=0),wav_bytes(seconds=181),wav_bytes()[:-2]):
            with self.assertRaises(ValueError):await engine.transcribe(data)
        result=await engine.transcribe(wav_bytes())
        self.assertEqual(result['text'],'');self.assertTrue(result['local_only'])

    async def test_cancelled_request_keeps_single_model_worker_busy(self):
        started,release=threading.Event(),threading.Event();engine=SilentEngine({})
        def operation():started.set();release.wait(3);return 'finished'
        caller=asyncio.create_task(engine.run(operation));await asyncio.to_thread(started.wait,2)
        caller.cancel()
        with self.assertRaises(asyncio.CancelledError):await caller
        try:
            with self.assertRaises(ValueError):await engine.run(lambda:None)
        finally:release.set();self.assertEqual(await engine.task,'finished')

    async def test_http_auth_host_wav_and_client_transport(self):
        class Fake:
            state={'available':True,'source':'whisper_fr','message':'test-only'}
            async def transcribe(self,data):return {'text':'Bonjour.','source':'whisper_fr','bytes':len(data)}
            async def warmup(self):return self.state
        with tempfile.TemporaryDirectory() as d:
            port=core.free_port();url=f'http://127.0.0.1:{port}';token='t'*48
            runner=web.AppRunner(make_speech_app(d,port,Fake(),token),access_log=None);await runner.setup()
            await web.TCPSite(runner,'127.0.0.1',port).start()
            try:
                async with aiohttp.ClientSession() as http:
                    self.assertEqual((await http.get(url+'/health')).status,401)
                    headers={'Authorization':'Bearer '+token}
                    self.assertEqual((await http.get(url+'/health',headers={**headers,'Host':'evil.test'})).status,403)
                    self.assertEqual((await http.post(url+'/transcribe',headers=headers,data=b'bad')).status,400)
                    self.assertEqual((await http.post(url+'/transcribe',headers={**headers,'Content-Type':'audio/wav'},data=b'x'*(6*1024*1024+1))).status,413)
                client=FrenchASRClient(d)
                # Explicit test injection: production config remains restricted to port 8132.
                client.endpoint=url;client.token=token
                await client.start()
                try:
                    self.assertTrue(client.state['available']);self.assertNotIn(token,json.dumps(client.state))
                    path=Path(d)/'sample.wav';path.write_bytes(wav_bytes())
                    self.assertEqual((await client.transcribe(path))['text'],'Bonjour.')
                finally:await client.close()
            finally:await runner.cleanup()

    async def test_unconfigured_client_and_nonlocal_config(self):
        with tempfile.TemporaryDirectory() as d:
            client=FrenchASRClient(d);self.assertFalse(client.state['configured'])
            (Path(d)/'french_asr.json').write_text(json.dumps({'enabled':True,'endpoint':'https://example.com'}))
            client=FrenchASRClient(d);self.assertIsNone(client.endpoint)


if __name__=='__main__':unittest.main()
