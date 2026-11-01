"""Guest isolation and actual HTTP/WS proxy tests, temporary data and fake voice."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'.deps'))
import asyncio
import json
import tempfile
import time
import unittest
import aiohttp
from aiohttp import web
from test_core import free_port
from server import make_app
from trial_server import make_gateway
from store import atomic_json
from fake_provider import FakeProvider, peer
from fake_asr import FakeFrenchASR


class TrialTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='oral_trial_test_')
        self.root = Path(self.temp.name)
        atomic_json(self.root/'access.json',{'invite':'test-invite','public_origin':'','expires':time.time()+600})
        self.runners = []
        async def start(app):
            runner = web.AppRunner(app,access_log=None);await runner.setup();self.runners.append(runner)
            port = free_port();await web.TCPSite(runner,'127.0.0.1',port).start();return port
        fake = web.Application();fake.router.add_get('/peer',peer)
        fake_port = await start(fake)
        FakeProvider.url = f'http://127.0.0.1:{fake_port}/peer'
        FakeProvider.fail_connect = False
        backend_port = free_port()
        self.backend = make_app(self.root/'backend',backend_port,FakeProvider)
        self.backend['local_asr'] = FakeFrenchASR()
        runner = web.AppRunner(self.backend,access_log=None);await runner.setup();self.runners.append(runner)
        await web.TCPSite(runner,'127.0.0.1',backend_port).start()
        gate_port = free_port()
        gateway = make_gateway(self.root,gate_port,f'http://127.0.0.1:{backend_port}')
        runner = web.AppRunner(gateway,access_log=None);await runner.setup();self.runners.append(runner)
        await web.TCPSite(runner,'127.0.0.1',gate_port).start()
        self.url = f'http://127.0.0.1:{gate_port}'
        self.a = aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True))
        self.b = aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True))
        self.sockets = []

    async def asyncTearDown(self):
        for ws in self.sockets: await ws.close()
        await self.a.close();await self.b.close()
        for runner in reversed(self.runners): await runner.cleanup()
        self.temp.cleanup()

    async def login(self,client):
        response = await client.post(self.url+'/team/login',data={'invite':'test-invite','consent':'yes'},headers={'Origin':self.url})
        self.assertEqual(response.status,200)
        self.assertIn('开发组临时试用',await response.text())

    async def socket(self,client):
        ws = await client.ws_connect(self.url+'/ws',headers={'Origin':self.url})
        self.sockets.append(ws)
        return ws

    async def command(self,ws,action,**fields):
        request = action+str(time.monotonic())
        await ws.send_json({'action':action,'request':request,**fields})
        async with asyncio.timeout(5):
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    if data.get('request') == request:
                        return data
        raise AssertionError('missing acknowledgment')

    async def test_login_origin_code_cookie_and_no_binding_leak(self):
        self.assertEqual((await self.a.get(self.url+'/api/bootstrap')).status,401)
        bad = await self.a.post(self.url+'/team/login',data={'invite':'test-invite','consent':'yes'},headers={'Origin':'https://other.example'})
        self.assertEqual(bad.status,403)
        for _ in range(5):
            response = await self.b.post(self.url+'/team/login',data={'invite':'wrong','consent':'yes'},headers={'Origin':self.url})
            self.assertEqual(response.status,401)
        self.assertEqual((await self.b.post(self.url+'/team/login',data={'invite':'wrong'},headers={'Origin':self.url})).status,429)
        # Throttle is per source; test correct login independently of this deliberate block.
        response = await self.a.post(self.url+'/team/login',data={'invite':'test-invite','consent':'yes'},headers={'Origin':self.url,'CF-Connecting-IP':'test-other'})
        self.assertEqual(response.status,200)
        self.backend['provider'].state = {'status':'binding','code':'PRIVATE-OWNER-CODE','message':'private'}
        boot = await (await self.a.get(self.url+'/api/bootstrap')).text()
        self.assertNotIn('PRIVATE-OWNER-CODE',boot)
        response = await self.a.post(self.url+'/api/bind',json={},headers={'Origin':self.url,'X-Oral-Client':'web'})
        self.assertNotIn('PRIVATE-OWNER-CODE',await response.text())
        self.assertEqual((await self.a.get(self.url+'/api/health')).status,404)
        self.assertEqual((await self.a.get(self.url+'/.team/access.json')).status,404)

    async def test_two_visitors_isolated_and_slot_released_after_end(self):
        await self.login(self.a);await self.login(self.b)
        wa = await self.socket(self.a)
        started = await self.command(wa,'start',mode='practice',part='intro')
        sid = started['session']['id']
        with self.assertRaises(aiohttp.WSServerHandshakeError): await self.socket(self.b)
        self.assertEqual((await self.b.get(self.url+'/api/sessions/'+sid)).status,404)
        denied=await self.b.post(self.url+f'/api/sessions/{sid}/evaluation',json={},headers={'Origin':self.url,'X-Oral-Client':'web'})
        self.assertEqual(denied.status,404)
        self.assertEqual((await (await self.b.get(self.url+'/api/bootstrap')).json())['sessions'],[])
        self.assertEqual((await self.command(wa,'end',id=sid))['type'],'ack')
        for _ in range(100):
            if self.backend['bridge'] is None: break
            await asyncio.sleep(.01)
        self.assertIsNone(self.backend['bridge'])
        wb = await self.socket(self.b)
        denied = await self.command(wb,'restore',id=sid)
        self.assertEqual(denied['type'],'error')
        self.assertEqual((await (await self.b.get(self.url+'/api/bootstrap')).json())['sessions'],[])
        own = await (await self.a.get(self.url+'/api/sessions/'+sid)).json()
        self.assertEqual(own['id'],sid)

    async def test_expiry_and_forged_cookie_are_rejected(self):
        self.a.cookie_jar.update_cookies({'parlons_trial':'A'*43})
        self.assertEqual((await self.a.get(self.url+'/api/bootstrap')).status,401)
        config = json.loads((self.root/'access.json').read_text())
        config['expires'] = time.time()-1;atomic_json(self.root/'access.json',config)
        self.assertEqual((await self.a.get(self.url)).status,410)


if __name__ == '__main__': unittest.main()
