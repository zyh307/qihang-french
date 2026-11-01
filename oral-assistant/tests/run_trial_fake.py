"""Isolated team gateway browser fixture. Fixed local ports, disposable records."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'.deps'))
import asyncio
import tempfile
import time
from aiohttp import web
from trial_server import make_gateway
from server import make_app
from store import atomic_json
from fake_provider import FakeProvider,peer
from fake_asr import FakeFrenchASR
from fake_primary_asr import FakePrimaryASR


async def main():
    with tempfile.TemporaryDirectory(prefix='oral_trial_browser_') as d:
        root = Path(d)
        atomic_json(root/'access.json',{'invite':'trial-browser-test','public_origin':'','expires':time.time()+3600})
        FakeProvider.url = 'http://127.0.0.1:8137/peer'
        FakeProvider.fail_connect = False
        peer_app = web.Application();peer_app.router.add_get('/peer',peer)
        backend = make_app(root/'backend',8136,FakeProvider);backend['local_asr'] = FakeFrenchASR()
        if '--independent' in sys.argv:backend['french_asr']=FakePrimaryASR()
        if '--flow' in sys.argv:
            backend['french_asr'].sequence=["Je m'appelle Alex.","J'habite à Hangzhou.",'Je suis étudiant.','J’ai une sœur.',"J'aime lire.",'Je me lève à huit heures.',
                *['Est-ce que vous aimez lire ?']*6,'Je voudrais une baguette.','Merci, au revoir.']
            peer_app['flow_replies']=True
        gateway = make_gateway(root,8135,'http://127.0.0.1:8136')
        runners = []
        try:
            for app,port in ((peer_app,8137),(backend,8136),(gateway,8135)):
                runner = web.AppRunner(app,access_log=None);await runner.setup();runners.append(runner)
                await web.TCPSite(runner,'127.0.0.1',port).start()
            await asyncio.Event().wait()
        finally:
            for runner in reversed(runners): await runner.cleanup()


if __name__ == '__main__': asyncio.run(main())
