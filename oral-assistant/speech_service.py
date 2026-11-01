"""Start/reuse one authenticated local ASR worker for both launchers."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.request

ROOT=Path(__file__).resolve().parent
BUILD='20261031-french-asr-0.1.0-r5'
ENDPOINT='http://127.0.0.1:8132'


def ensure_service(data_dir):
    private=ROOT/'.speech';private.mkdir(exist_ok=True)
    access=private/'access.json'
    if not access.exists():
        with access.open('x',encoding='utf-8') as f:
            json.dump({'token':secrets.token_urlsafe(48)},f)
    token=json.loads(access.read_text(encoding='utf-8'))['token']
    if not isinstance(token,str) or len(token)<32:raise RuntimeError('本机识别凭证无效')
    settings=private/'engine.json'
    if not settings.exists():settings.write_text(json.dumps({'device':'auto'},indent=2),encoding='utf-8')
    # Never send loopback requests through the user's download proxy.
    http=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def health():
        try:
            req=urllib.request.Request(ENDPOINT+'/health',headers={'Authorization':'Bearer '+token})
            with http.open(req,timeout=2) as response:return json.load(response)
        except OSError:return None
    state=health()
    if state and state.get('build')!=BUILD:raise RuntimeError('8132已有其他版本的识别服务')
    if not state:
        import socket
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1',8132))==0:raise RuntimeError('8132端口已占用，未启动第二个模型')
        python=Path(sys.executable);hidden=python.with_name('pythonw.exe')
        if not hidden.exists():hidden=python
        options={'creationflags':subprocess.DETACHED_PROCESS|subprocess.CREATE_NEW_PROCESS_GROUP} if os.name=='nt' else {'start_new_session':True}
        with (private/'service.log').open('ab') as log:
            child=subprocess.Popen([str(hidden),str(ROOT/'speech_server.py')],cwd=ROOT,
                    stdin=subprocess.DEVNULL,stdout=log,stderr=log,close_fds=True,**options)
        for _ in range(100):
            state=health()
            if state:break
            if child.poll() is not None:raise RuntimeError('识别服务启动失败，见 .speech/service.log')
            time.sleep(.1)
        else:raise RuntimeError('识别服务启动超时，见 .speech/service.log')
    if not state.get('available'):raise RuntimeError(state.get('message','法语模型尚未就绪'))
    if not state.get('warmed'):
        print('正在预热本机法语模型…',flush=True)
        req=urllib.request.Request(ENDPOINT+'/warmup',data=b'',headers={'Authorization':'Bearer '+token},method='POST')
        with http.open(req,timeout=120) as response:state.update(json.load(response))
    data_dir=Path(data_dir);data_dir.mkdir(parents=True,exist_ok=True)
    config={'enabled':True,'endpoint':ENDPOINT,'token_file':str(access)}
    dest=data_dir/'french_asr.json'
    if not dest.exists() or json.loads(dest.read_text(encoding='utf-8'))!=config:
        partial=dest.with_suffix('.tmp');partial.write_text(json.dumps(config,indent=2),encoding='utf-8');partial.replace(dest)
    (private/'runtime.json').write_text(json.dumps({'pid':state['pid'],'build':BUILD},indent=2),encoding='utf-8')
    return state


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--data-dir',type=Path,default=ROOT/'.local')
    args=parser.parse_args();state=ensure_service(args.data_dir)
    print('独立法语识别服务已就绪（本机共享）')
