"""Invite-only temporary team trial gateway. Personal service on 8127 is untouched."""
from __future__ import annotations
import argparse
import asyncio
from collections import defaultdict, deque
import hashlib
import json
from pathlib import Path
import re
import secrets
import sys
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT/'.deps'))
import aiohttp
from aiohttp import web
from server import make_app
from store import atomic_json

TRIAL_BUILD = '20261031-team-trial-0.1.0-r7'
COOKIE = 'parlons_trial'
SID = r'[0-9a-f]{32}'
CSP = "default-src 'self'; connect-src 'self'; media-src 'self' blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'"
LOGIN = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Parlons · 开发组试用</title><link rel="stylesheet" href="/team/style.css"><main><div class="brand">Parlons <small>A1 · 开发组试用</small></div><h1>一起，把法语说出来。</h1><p>输入开发组试用码，开始体验三个 A1 口语模块。</p><form method="post" action="/team/login"><label>试用码<input name="invite" type="password" autocomplete="off" required maxlength="100"></label><label class="consent"><input name="consent" type="checkbox" value="yes" required>我已了解：录音经安全连接传到管理员电脑并保存在独立试用区。默认在该电脑识别法语，识别文字与对话发往小智；若选择小智原有识别，录音也会发往小智。其他组员不能查看我的记录，管理员可用于排查问题。</label><button>进入试用 →</button></form><p class="small">当前为临时链接，需要管理员电脑开机联网。一次一人练习，结束后会释放名额。同一浏览器保留历史，清除 Cookie 后无法直接找回。</p><p class="error">__ERROR__</p></main></html>'''
LOGIN_CSS = b'''*{box-sizing:border-box}body{margin:0;background:#f6f7f4;color:#243d35;font-family:"Segoe UI","Microsoft YaHei",sans-serif}main{max-width:490px;margin:8vh auto;padding:30px}.brand{font-size:25px;font-weight:600}.brand small{display:block;font-size:12px;font-weight:400;color:#758079;margin:8px 0 45px}h1{font-size:29px;font-weight:500}p{line-height:1.9;color:#65736a;font-size:14px}label{display:block;font-size:13px;margin:25px 0}input[type=password]{display:block;width:100%;margin-top:12px;border:1px solid #cfd9cd;background:white;border-radius:10px;padding:14px;font-size:18px}.consent{display:flex;gap:10px;line-height:1.8}.consent input{flex-shrink:0;width:16px}button{background:#243d35;color:white;border:0;border-radius:10px;padding:14px 20px;width:100%;font-size:15px;cursor:pointer}.small{font-size:12px;margin-top:24px}.error{color:#9e3e36}'''


def clean_provider(state):
    if state.get('status') == 'ready':
        return {'status':'ready', 'message':'开发组试用已就绪，一次一人练习'}
    return {'status':'unchecked', 'message':'管理员尚未连接试用智能体，请联系管理员'}


class TrialGate:
    def __init__(self, root, port, upstream):
        self.root, self.port, self.upstream = Path(root), port, upstream
        self.config_path = self.root/'access.json'
        self.attempts = defaultdict(deque)
        self.starts = deque()
        self.http = None

    def config(self):
        return json.loads(self.config_path.read_text(encoding='utf-8'))

    def allowed_origin(self, request):
        public = self.config().get('public_origin', '')
        if public and request.host == urlsplit(public).netloc:
            return public
        if request.host in (f'127.0.0.1:{self.port}', f'localhost:{self.port}'):
            return f'http://{request.host}'
        return None

    def guest(self, request):
        token = request.cookies.get(COOKIE, '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
            return None
        path = self.root/'visitors'/(hashlib.sha256(token.encode()).hexdigest()+'.json')
        if not path.is_file():
            return None
        data = json.loads(path.read_text(encoding='utf-8'))
        if data['expires'] < time.time():
            return None
        return path, data

    @staticmethod
    def owns(guest, sid):
        return sid in guest[1]['sessions']

    def claim(self, guest, sid):
        # Only server-generated IDs from this visitor's own websocket are added.
        data = json.loads(guest[0].read_text(encoding='utf-8'))
        if sid not in data['sessions']:
            data['sessions'].append(sid)
            atomic_json(guest[0], data)
        guest[1].update(data)

    async def response(self, request):
        origin = self.allowed_origin(request)
        if not origin:
            return web.json_response({'error':'试用地址不匹配'}, status=403)
        if self.config()['expires'] < time.time():
            return web.Response(text='本次试用链接已到期，请联系管理员。', status=410)
        path = request.path
        if request.method != 'GET' or path == '/ws':
            if request.headers.get('Origin') != origin:
                return web.json_response({'error':'来源校验失败'}, status=403)
        if path == '/team/style.css' and request.method == 'GET':
            return web.Response(body=LOGIN_CSS, content_type='text/css')
        if path == '/team/login' and request.method == 'POST':
            return await self.login(request, origin)
        guest = self.guest(request)
        if not guest:
            if path == '/' and request.method == 'GET':
                return web.Response(text=LOGIN.replace('__ERROR__',''), content_type='text/html')
            return web.json_response({'error':'请输入试用码后使用'}, status=401)
        if path == '/team/logout' and request.method == 'POST':
            data = guest[1];data['expires'] = 0;atomic_json(guest[0],data)
            response = web.HTTPSeeOther('/');response.del_cookie(COOKIE);return response
        if path == '/ws' and request.method == 'GET':
            return await self.websocket(request, guest)
        if request.method not in ('GET','POST'):
            raise web.HTTPNotFound()
        if request.method == 'POST' and request.headers.get('X-Oral-Client') != 'web':
            return web.json_response({'error':'请求校验失败'}, status=403)
        session_path = re.fullmatch(rf'/api/sessions/({SID})(?:/(revision|local-review|evaluation)|/audio/[0-9a-f]{{16}}\.wav)?', path)
        if session_path:
            if not self.owns(guest, session_path[1]):
                raise web.HTTPNotFound()
        elif path not in ('/', '/api/bootstrap', '/api/provider', '/api/bind') and not re.fullmatch(r'/assets/(app.js|capture.js|style.css)|/examples/(intro|exchange|roleplay)\.(mp4|jpg)',path):
            raise web.HTTPNotFound()
        if path == '/api/bind':
            async with self.http.get(self.upstream+'/api/provider') as remote:
                return web.json_response(clean_provider(await remote.json()))
        headers = {'Origin':self.upstream, 'X-Oral-Client':'web'}
        if request.headers.get('Range'):
            headers['Range'] = request.headers['Range']
        if request.headers.get('Content-Type'):
            headers['Content-Type'] = request.headers['Content-Type']
        async with self.http.request(request.method, self.upstream+path,
                                     data=await request.read(), headers=headers) as remote:
            body = await remote.read()
            if path in ('/api/bootstrap','/api/provider') and remote.status == 200:
                data = json.loads(body)
                if path == '/api/bootstrap':
                    data['provider'] = clean_provider(data['provider'])
                    data['sessions'] = [s for s in data['sessions'] if self.owns(guest,s['id'])]
                else:
                    data = clean_provider(data)
                return web.json_response(data)
            if path == '/' and remote.status == 200:
                note = '<div class="wrap trial-note">开发组临时试用 · 一次一人练习 · 记录仅本浏览器与管理员可查看<form method="post" action="/team/logout"><button class="text-button">退出试用</button></form></div>'
                body = body.replace(b'</header>', b'</header>'+note.encode(),1)
            if path == '/assets/style.css' and remote.status == 200:
                body += b'\n.trial-note{display:flex;align-items:center;gap:16px;padding-top:14px;padding-bottom:14px;font-size:12px;color:#65736a;background:#edf2e9}.trial-note form{margin-left:auto;flex-shrink:0}'
            response_headers = {k:v for k,v in remote.headers.items() if k.lower() in
                                ('content-type','content-range','accept-ranges')}
            return web.Response(body=body, status=remote.status, headers=response_headers)

    async def login(self, request, origin):
        key = request.headers.get('CF-Connecting-IP', request.remote or 'local')
        if len(self.attempts) > 2000:
            self.attempts.clear()
        attempts = self.attempts[key]
        now = time.time()
        while attempts and attempts[0] < now-60:
            attempts.popleft()
        if len(attempts) >= 5:
            return web.Response(text=LOGIN.replace('__ERROR__','尝试次数过多，请一分钟后重试。'), content_type='text/html', status=429)
        data = await request.post()
        if not secrets.compare_digest(str(data.get('invite','')), self.config()['invite']) or data.get('consent') != 'yes':
            attempts.append(now)
            return web.Response(text=LOGIN.replace('__ERROR__','试用码不正确，或未勾选录音说明。'), content_type='text/html', status=401)
        token = secrets.token_urlsafe(32)
        filename = hashlib.sha256(token.encode()).hexdigest()+'.json'
        atomic_json(self.root/'visitors'/filename, {'created':now, 'expires':self.config()['expires'], 'sessions':[]})
        response = web.HTTPSeeOther('/')
        response.set_cookie(COOKIE,token,httponly=True,secure=origin.startswith('https:'),samesite='Strict',max_age=86400)
        return response

    async def websocket(self, request, guest):
        try:
            upstream = await self.http.ws_connect(self.upstream+'/ws',headers={'Origin':self.upstream},max_msg_size=1024*1024)
        except aiohttp.WSServerHandshakeError:
            return web.json_response({'error':'已有成员正在练习，请稍后再试'},status=409)
        browser = web.WebSocketResponse(max_msg_size=64*1024, heartbeat=20)
        await browser.prepare(request)
        pending = {}

        async def to_server():
            allowance, last = 128000., time.monotonic()
            async for message in browser:
                if message.type == aiohttp.WSMsgType.BINARY:
                    now = time.monotonic();allowance = min(128000, allowance+(now-last)*64000);last = now
                    if len(message.data) > 32000 or len(message.data)%2 or len(message.data) > allowance:
                        await browser.close(code=1008,message=b'audio rate exceeded');break
                    allowance -= len(message.data)
                    await upstream.send_bytes(message.data)
                elif message.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(message.data)
                    if not isinstance(data,dict) or not isinstance(data.get('request'),str) or len(data['request']) > 100 or len(pending) >= 128:
                        await browser.close(code=1008,message=b'invalid request');break
                    action = data.get('action')
                    if action not in ('start','next','keyword','select_keyword','resume','restore','end','checks','record_start','record_stop','abort','confirm_transcript','retry_recognition'):
                        await browser.send_json({'type':'error','request':data.get('request'),'message':'不支持的试用操作'});continue
                    if action in ('restore','end') and data.get('id') and not self.owns(guest,str(data['id'])):
                        await browser.send_json({'type':'error','request':data.get('request'),'message':'不能访问其他成员的记录'});continue
                    if action == 'start':
                        now = time.time()
                        while self.starts and self.starts[0] < now-60: self.starts.popleft()
                        if len(self.starts) >= 30:
                            await browser.send_json({'type':'error','request':data.get('request'),'message':'开始练习过于频繁，请稍后重试'});continue
                        self.starts.append(now)
                    pending[data.get('request')] = action
                    await upstream.send_json(data)

        async def to_browser():
            async for message in upstream:
                if message.type == aiohttp.WSMsgType.BINARY:
                    await browser.send_bytes(message.data)
                elif message.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(message.data)
                    session = data.get('session')
                    if session and re.fullmatch(SID,str(session.get('id',''))):
                        self.claim(guest,session['id'])
                    await browser.send_json(data)
                    if data.get('type') in ('ack','error'):
                        action = pending.pop(data.get('request'),None)
                        if action == 'end' and data['type'] == 'ack':
                            break  # release the single trial slot after saving

        forward = asyncio.create_task(to_server());back = asyncio.create_task(to_browser())
        try:
            lifetime = max(0,min(1800,self.config()['expires']-time.time()))
            done, _ = await asyncio.wait((forward,back), timeout=lifetime, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                if not task.cancelled(): task.result()
        except (ValueError, aiohttp.ClientError, ConnectionResetError):
            pass
        finally:
            for task in (forward,back): task.cancel()
            await asyncio.gather(forward,back,return_exceptions=True)
            await upstream.close()
            await browser.close()
        return browser


def make_gateway(root, port=8128, upstream='http://127.0.0.1:8130'):
    gate = TrialGate(root,port,upstream)

    @web.middleware
    async def guard(request, handler):
        try:
            response = await handler(request)
        except web.HTTPException as exc:
            response = exc
        except Exception:
            response = web.json_response({'error':'试用服务暂不可用，请稍后重试'},status=503)
        if not isinstance(response,web.WebSocketResponse):
            response.headers.update({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
                                     'Referrer-Policy':'same-origin','Content-Security-Policy':CSP})
        return response

    app = web.Application(middlewares=[guard], client_max_size=64*1024)
    app['gate'] = gate
    async def lifecycle(app):
        async with aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True),
                                          timeout=aiohttp.ClientTimeout(total=180), trust_env=False) as http:
            gate.http = http
            async with http.get(upstream) as response: await response.read()
            yield
    app.cleanup_ctx.append(lifecycle)
    app.router.add_route('*','/{tail:.*}',gate.response)
    return app


async def serve(root, port, backend_port):
    backend = web.AppRunner(make_app(root/'backend',backend_port),access_log=None)
    await backend.setup()
    await web.TCPSite(backend,'127.0.0.1',backend_port).start()
    if (root/'backend/private/identity.json').is_file():
        await backend.app['provider'].begin()  # resume this trial identity after restart
    gateway = web.AppRunner(make_gateway(root,port,f'http://127.0.0.1:{backend_port}'),access_log=None)
    await gateway.setup()
    await web.TCPSite(gateway,'127.0.0.1',port).start()
    try:
        await asyncio.Event().wait()
    finally:
        await gateway.cleanup();await backend.cleanup()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir',type=Path,default=ROOT/'.team')
    parser.add_argument('--port',type=int,default=8128)
    parser.add_argument('--backend-port',type=int,default=8130)
    args = parser.parse_args()
    asyncio.run(serve(args.data_dir,args.port,args.backend_port))
