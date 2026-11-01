import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / '.deps'))
import argparse
import tempfile
from aiohttp import web
from server import make_app
from fake_provider import FakeProvider, peer
from fake_asr import FakeFrenchASR

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8137)
args = parser.parse_args()
temp = tempfile.TemporaryDirectory(prefix='oral_browser_test_')
FakeProvider.url = f'http://127.0.0.1:{args.port+1}/test-peer'
app = make_app(temp.name, args.port, FakeProvider)
app['local_asr'] = FakeFrenchASR()
async def fake_context(app):
    upstream = web.Application()
    upstream.router.add_get('/test-peer', peer)
    runner = web.AppRunner(upstream, access_log=None)
    await runner.setup()
    await web.TCPSite(runner, '127.0.0.1', args.port+1).start()
    yield
    await runner.cleanup()
app.cleanup_ctx.append(fake_context)
async def testinfo(request):
    return web.json_response({'test_only': True, 'data_dir': temp.name})
app.router.add_get('/test-info', testinfo)
web.run_app(app, host='127.0.0.1', port=args.port, access_log=None)
