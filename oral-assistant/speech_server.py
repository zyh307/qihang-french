"""Single shared French ASR worker. Authenticated loopback only."""
import argparse,asyncio,hmac,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.deps'))
from aiohttp import web
from french_asr import FrenchEngine

BUILD='20261031-french-asr-0.1.0-r5'

def make_speech_app(root,port=8132,engine=None,token=None):
    root=Path(root)
    if token is None:token=json.loads((root/'access.json').read_text(encoding='utf-8'))['token']
    if not isinstance(token,str) or len(token)<32:raise ValueError('识别凭证无效')
    if engine is None:
        config=json.loads((root/'engine.json').read_text(encoding='utf-8'))
        engine=FrenchEngine(config)

    @web.middleware
    async def guard(request,handler):
        if request.host not in (f'127.0.0.1:{port}',f'localhost:{port}'):
            return web.json_response({'error':'仅允许本机访问'},status=403)
        if not hmac.compare_digest(request.headers.get('Authorization','').encode(),('Bearer '+token).encode()):
            return web.json_response({'error':'识别服务需要凭证'},status=401)
        try:return await handler(request)
        except ValueError as exc:return web.json_response({'error':str(exc)},status=400)
        except web.HTTPException:raise
        except Exception:
            import traceback
            traceback.print_exc()
            return web.json_response({'error':'独立法语模型运行失败，录音已保留，请检查本机服务日志'},status=500)

    app=web.Application(middlewares=[guard],client_max_size=6*1024*1024)
    app['engine']=engine
    async def health(request):return web.json_response({'build':BUILD,'pid':os.getpid(),**engine.state})
    async def transcribe(request):
        if request.content_type!='audio/wav':raise ValueError('请提交WAV录音')
        detail=request.query.get('detail')
        if detail not in (None,'words'):raise ValueError('不支持的识别证据类型')
        continuous=request.query.get('continuous')
        alternate=request.query.get('alternate')
        if continuous is not None and (continuous!='1' or detail!='words'):
            raise ValueError('连续音频复识需要逐词证据')
        if alternate is not None and (alternate!='1' or continuous!='1'):
            raise ValueError('备用识别需要连续短录音和逐词证据')
        data=await request.read()
        if alternate:
            return web.json_response(await engine.transcribe_alternate_wav(data))
        if continuous:
            return web.json_response(await engine.transcribe(data,word_evidence=True,continuous=True))
        result=await engine.transcribe(data,word_evidence=True) if detail else await engine.transcribe(data)
        return web.json_response(result)
    async def warmup(request):return web.json_response(await engine.warmup())
    async def cleanup(app):
        task=getattr(engine,'task',None)
        if task and not task.done():await asyncio.shield(task)
    app.on_cleanup.append(cleanup)
    app.router.add_get('/health',health);app.router.add_post('/transcribe',transcribe);app.router.add_post('/warmup',warmup)
    return app

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT/'.speech');parser.add_argument('--port',type=int,default=8132)
    args=parser.parse_args()
    web.run_app(make_speech_app(args.root,args.port),host='127.0.0.1',port=args.port,access_log=None)
