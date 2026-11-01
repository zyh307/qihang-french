import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / '.deps'))
import asyncio
import json
import math
import socket
import struct
import tempfile
import unittest
import wave

import aiohttp
from aiohttp import web

from audio_codec import AudioCodec
from exam import create_session, current_stage, instruction, next_stage, trigger
from hosted import Hosted, ProviderError, safe_ws_url
from server import make_app
from store import Store
from fake_provider import FakeProvider, peer
from fake_asr import FakeFrenchASR
from local_asr import LocalFrenchASR


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class CoreTests(unittest.TestCase):
    def test_exam_roles_and_order(self):
        s = create_session('practice', 'full', 'boulangerie')
        self.assertEqual(current_stage(s), 'intro')
        next_stage(s)
        self.assertEqual(current_stage(s), 'exchange')
        self.assertIn('考生主动', instruction(s))
        self.assertLessEqual(len(trigger(s)), 12)
        next_stage(s)
        self.assertIn('1.20', instruction(s))
        with self.assertRaises(ValueError): next_stage(s)

    def test_simulation_preparation(self):
        s = create_session('simulation', 'full')
        self.assertEqual(s['phase'], 'preparation')
        self.assertAlmostEqual(s['prep_until'] - s['created'], 600)
        next_stage(s)
        self.assertEqual(s['phase'], 'active')
        self.assertTrue(s['events'][0]['early'])
        self.assertIn('不给答案', instruction(s))

    def test_invalid_and_separate_cards(self):
        with self.assertRaises(ValueError): create_session('bad', 'intro')
        with self.assertRaises(ValueError): create_session('practice', 'bad')
        a = create_session('practice', 'roleplay', 'hotel')
        b = create_session('practice', 'roleplay', 'cafe')
        self.assertIn('60', instruction(a))
        self.assertNotIn('60', instruction(b))
        self.assertNotEqual(a['id'], b['id'])

    def test_codec_stream_tail_and_decode(self):
        pcm = b''.join(struct.pack('<h', int(math.sin(i * math.tau * 440 / 16000) * 8000)) for i in range(16000))
        c = AudioCodec()
        packets = []
        for i in range(0, len(pcm), 614): packets += c.encode(pcm[i:i+614])
        packets += c.encode(b'', finish=True)
        self.assertEqual(len(c.buffer), 0)
        decoded = b''.join(block for p in packets for block in c.decode(p))
        self.assertGreater(len(decoded), 45000)
        # Final drain adds one 60 ms packet, retaining the delayed end of speech.
        self.assertLess(len(decoded), 55000)
        self.assertTrue(any(decoded))
        with self.assertRaises(ValueError): c.encode(b'1')

    def test_frame_aligned_final_consonant_survives_encoder_delay(self):
        import numpy as np
        # A short sound right at the end of an exact frame boundary used to
        # remain in the encoder even though the PCM input buffer was empty.
        pcm = np.zeros(960, dtype='<i2')
        pcm[-160:] = (np.sin(np.arange(160)*math.tau*700/16000)*10000).astype('<i2')
        c = AudioCodec()
        c.reset_decoder(16000)
        packets = c.encode(pcm.tobytes()) + c.encode(b'', finish=True)
        decoded = b''.join(block for p in packets for block in c.decode(p))
        decoded += b''.join(f.to_ndarray().astype('<i2').tobytes() for f in c.resampler.resample(None))
        samples = np.frombuffer(decoded, dtype='<i2').astype(float)
        self.assertGreater(len(samples), 1064)
        self.assertGreater(float(np.sqrt(np.mean(samples[960:1064]**2))), 1000)
        self.assertEqual(c.encode(b'', finish=True), [])
        with self.assertRaises(ValueError): c.encode(pcm.tobytes())
        self.assertEqual(AudioCodec().encode(b'', finish=True), [])

    def test_store_no_traversal_and_retains_original(self):
        with tempfile.TemporaryDirectory() as d:
            store = Store(d)
            with self.assertRaises(ValueError): store.load('../../private')
            s = create_session('practice', 'intro')
            s['messages'].append({'role': 'user', 'text': '<script>original</script>'})
            store.save(s)
            self.assertEqual(store.load(s['id'])['messages'], s['messages'])
            self.assertEqual(len(store.listing()), 1)

    def test_provider_url_not_arbitrary(self):
        self.assertEqual(safe_ws_url('wss://api.tenclass.net/xiaozhi/v1/'), 'wss://api.tenclass.net/xiaozhi/v1/')
        for url in ['ws://api.tenclass.net/', 'wss://evil.test/', 'https://api.tenclass.net/']:
            with self.assertRaises(ProviderError): safe_ws_url(url)

    def test_software_identity_is_stable(self):
        with tempfile.TemporaryDirectory() as d:
            provider = Hosted(Path(d), None)
            provider.ensure_identity()
            old = provider.identity.copy()
            fresh = Hosted(Path(d), None)
            fresh.ensure_identity()
            self.assertEqual(fresh.identity, old)
            self.assertEqual(int(old['device_id'].split(':')[0], 16) & 3, 2)
            self.assertNotIn('hmac', json.dumps(provider.state))


class LocalASRTests(unittest.IsolatedAsyncioTestCase):
    async def test_unconfigured_model_fails_explicitly(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d)/'asr.json').write_text(json.dumps({'model_path':str(Path(d)/'missing-model')}), encoding='utf-8')
            asr = LocalFrenchASR(d)
            self.assertFalse(asr.state['available'])
            with self.assertRaisesRegex(ValueError, '尚未安装'):
                await asr.review(Path(d)/'missing.wav')

    async def test_cancelled_request_does_not_start_second_worker(self):
        import threading
        started, release = threading.Event(), threading.Event()
        class SlowASR(LocalFrenchASR):
            @property
            def state(self): return {'available':True}
            def _transcribe(self, path):
                started.set()
                release.wait(3)
                return {'text':'test'}
        with tempfile.TemporaryDirectory() as d:
            asr = SlowASR(d)
            caller = asyncio.create_task(asr.review(Path(d)/'unused.wav'))
            await asyncio.to_thread(started.wait, 2)
            caller.cancel()
            with self.assertRaises(asyncio.CancelledError): await caller
            try:
                with self.assertRaisesRegex(ValueError, '另一段录音'):
                    await asr.review(Path(d)/'unused.wav')
            finally:
                release.set()
                await asr.task


class IntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='oral_a1_test_')
        self.port = free_port()
        fake = web.Application(); fake.router.add_get('/peer', peer)
        self.fake_runner = web.AppRunner(fake, access_log=None)
        await self.fake_runner.setup()
        fake_port = free_port()
        await web.TCPSite(self.fake_runner, '127.0.0.1', fake_port).start()
        FakeProvider.url = f'http://127.0.0.1:{fake_port}/peer'
        FakeProvider.fail_connect = False
        self.app = make_app(self.temp.name, self.port, FakeProvider)
        self.runner = web.AppRunner(self.app, access_log=None)
        await self.runner.setup()
        await web.TCPSite(self.runner, '127.0.0.1', self.port).start()
        self.base = f'http://127.0.0.1:{self.port}'
        self.http = aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True))
        await (await self.http.get(self.base)).read()
        self.ws = None
        self.serial = 0

    async def asyncTearDown(self):
        if self.ws: await self.ws.close()
        await self.http.close()
        await self.runner.cleanup()
        await self.fake_runner.cleanup()
        self.temp.cleanup()

    async def connect(self):
        self.ws = await self.http.ws_connect(self.base + '/ws', headers={'Origin': self.base})
        self.assertEqual((await self.ws.receive_json())['type'], 'welcome')

    async def command(self, action, **kw):
        self.serial += 1
        request = str(self.serial)
        await self.ws.send_json({'action': action, 'request': request, **kw})
        async with asyncio.timeout(5):
            while True:
                msg = await self.ws.receive()
                if msg.type != aiohttp.WSMsgType.TEXT: continue
                d = json.loads(msg.data)
                if d.get('request') == request:
                    return d

    async def wait_idle(self):
        for _ in range(100):
            if not self.app['bridge'].busy: return
            await asyncio.sleep(.01)
        self.fail('never idle')

    async def test_security_and_private_routes(self):
        response = await self.http.post(self.base+'/api/bind', json={})
        self.assertEqual(response.status, 403)
        response = await self.http.get(self.base+'/assets/identity.json')
        self.assertEqual(response.status, 404)
        response = await self.http.get(self.base+'/api/bootstrap')
        data = await response.json()
        self.assertNotIn('identity', data)
        self.assertNotIn('token', json.dumps(data))
        response = await self.http.get(self.base+'/api/health', headers={'Host':'evil.test'})
        self.assertEqual(response.status, 403)

    async def test_second_window_is_rejected(self):
        await self.connect()
        with self.assertRaises(aiohttp.WSServerHandshakeError) as ctx:
            await self.http.ws_connect(self.base+'/ws', headers={'Origin':self.base})
        self.assertEqual(ctx.exception.status, 409)

    async def test_all_stages_end_and_original_record(self):
        await self.connect()
        d = await self.command('start', mode='practice', part='full', scene='cafe')
        self.assertEqual(d['type'], 'ack')
        sid = d['session']['id']
        await self.wait_idle()
        self.assertEqual((await self.command('text', text='Bonjour <script> !'))['type'], 'error')
        await self.wait_idle()
        d = await self.command('next')
        self.assertEqual(current_stage(d['session']), 'exchange')
        old_word = d['session']['keywords'][0]
        await self.wait_idle()
        d = await self.command('keyword')
        self.assertNotEqual(d['session']['keywords'][d['session']['keyword_index']], old_word)
        await self.wait_idle()
        d = await self.command('next')
        self.assertEqual(current_stage(d['session']), 'roleplay')
        d = await self.command('checks', checks=['打招呼'])
        self.assertEqual(d['session']['checks'], ['打招呼'])
        self.assertEqual((await self.command('checks', checks=['invented']))['type'], 'error')
        d = await self.command('end')
        self.assertEqual(d['session']['phase'], 'ended')
        saved = self.app['store'].load(sid)
        self.assertFalse(any(m.get('role')=='user' for m in saved['messages']))
        self.assertTrue(any(e['type']=='task_tool_called' for e in saved['events']))
        self.assertFalse(any('% self.' in m.get('text','') for m in saved['messages']))
        self.assertTrue(any(e['type']=='control_request' for e in saved['events']))
        self.assertEqual((await self.command('next'))['type'], 'error')

    async def test_failed_transition_does_not_advance(self):
        await self.connect()
        await self.command('start', mode='practice', part='full')
        await self.wait_idle()
        self.app['provider'].fail_connect = True
        d = await self.command('next')
        self.assertEqual(d['type'], 'error')
        self.assertEqual(current_stage(self.app['bridge'].session), 'intro')
        self.app['provider'].fail_connect = False
        d = await self.command('resume')
        self.assertEqual(d['type'], 'ack')

    async def test_record_raw_opus_transcript_audio_and_restore(self):
        await self.connect()
        start = await self.command('start', mode='practice', part='intro')
        sid = start['session']['id']
        await self.wait_idle()
        self.assertEqual((await self.command('record_start'))['type'], 'ack')
        pcm = b''.join(struct.pack('<h', int(math.sin(i*.2)*3000)) for i in range(5000))
        for i in range(0,len(pcm),1600): await self.ws.send_bytes(pcm[i:i+1600])
        await self.command('record_stop')
        await self.wait_idle()
        session = self.app['store'].load(sid)
        row = next(m for m in session['messages'] if m['role']=='user')
        self.assertIn('[测试转写]', row['text'])
        original = row['text']
        url = self.base + f'/api/sessions/{sid}/revision'
        for text in ('Je m’appelle Alex.', 'Je suis étudiant.'):
            response = await self.http.post(url, json={'row':row['id'], 'text':text},
                headers={'Origin':self.base,'X-Oral-Client':'web'})
            self.assertEqual(response.status, 200)
        revised = next(m for m in self.app['store'].load(sid)['messages'] if m['id']==row['id'])
        self.assertEqual(revised['text'], original)
        self.assertEqual(len(revised['revisions']), 2)
        self.assertEqual(revised['revisions'][-1]['text'], 'Je suis étudiant.')
        await self.command('resume')
        await self.wait_idle()
        unchanged = next(m for m in self.app['store'].load(sid)['messages'] if m['id']==row['id'])
        self.assertEqual(unchanged['text'], row['text'])
        with wave.open(str(self.app['store'].folder(sid)/row['audio'])) as wav:
            self.assertEqual(wav.getframerate(), 16000)
            self.assertEqual(wav.readframes(wav.getnframes()), pcm)
        r = await self.http.get(self.base+f'/api/sessions/{sid}/audio/{row["audio"]}')
        self.assertEqual(r.status, 200)
        # Review is a separate candidate. A learner edit arriving DURING the
        # worker must not be lost when that candidate is committed.
        started, release = asyncio.Event(), asyncio.Event()
        class DelayedASR(FakeFrenchASR):
            async def review(self, path):
                started.set()
                await release.wait()
                return await super().review(path)
        self.app['local_asr'] = DelayedASR()
        pending = asyncio.create_task(self.http.post(self.base+f'/api/sessions/{sid}/local-review',
            json={'row':row['id']}, headers={'Origin':self.base,'X-Oral-Client':'web'}))
        await asyncio.wait_for(started.wait(), 2)
        await self.http.post(url, json={'row':row['id'], 'text':'Pendant la vérification.'},
            headers={'Origin':self.base,'X-Oral-Client':'web'})
        release.set()
        self.assertEqual((await pending).status, 200)
        saved = next(m for m in self.app['store'].load(sid)['messages'] if m['id']==row['id'])
        self.assertEqual(saved['text'], original)
        self.assertEqual(saved['revisions'][-1]['text'], 'Pendant la vérification.')
        self.assertIn('restaurant', saved['asr_reviews'][-1]['text'])
        with wave.open(str(self.app['store'].folder(sid)/row['audio'])) as wav:
            self.assertEqual(wav.readframes(wav.getnframes()), pcm)
        denied = await self.http.post(self.base+f'/api/sessions/{sid}/local-review',
            json={'row':'../../private/identity'}, headers={'Origin':self.base,'X-Oral-Client':'web'})
        self.assertEqual(denied.status, 400)
        await self.ws.close(); await asyncio.sleep(.05)
        await self.connect()
        d = await self.command('restore', id=sid)
        self.assertEqual(d['type'], 'ack')
        self.assertEqual(d['session']['id'], sid)
        self.assertTrue(any(m.get('audio')==row['audio'] for m in d['session']['messages']))

    async def test_abort_discards_old_epoch(self):
        await self.connect()
        await self.command('start', mode='practice', part='intro')
        old = self.app['bridge'].epoch
        d = await self.command('abort')
        self.assertEqual(d['type'], 'ack')
        self.assertGreater(self.app['bridge'].epoch, old)
        self.assertIsNone(self.app['bridge'].up)
        d = await self.command('resume')
        self.assertEqual(d['type'], 'ack')

    async def test_preparation_does_not_connect_early(self):
        await self.connect()
        d = await self.command('start', mode='simulation', part='full')
        self.assertEqual(d['session']['phase'], 'preparation')
        self.assertEqual(self.app['provider'].connections, 0)
        self.assertEqual((await self.command('record_start'))['type'], 'error')
        d = await self.command('next')
        self.assertEqual(d['session']['phase'], 'active')
        self.assertEqual(self.app['provider'].connections, 1)


if __name__ == '__main__': unittest.main()
