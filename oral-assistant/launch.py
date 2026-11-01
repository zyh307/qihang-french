"""Detached local launcher; keeps the service alive after the calling terminal closes."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:8127/'
BUILD = '20261031-a1-web-0.1.0-r7'


def health():
    try:
        with urllib.request.urlopen(URL+'api/health', timeout=1) as r:
            return json.load(r)
    except (OSError, ValueError):
        return None


def main():
    from speech_service import ensure_service
    ensure_service(ROOT/'.local')
    state = health()
    if state:
        if state.get('build') != BUILD:
            raise RuntimeError('8127端口已有其他服务，请先处理端口冲突')
    else:
        runtime = ROOT/'.local'
        runtime.mkdir(exist_ok=True)
        python = Path(sys.executable)
        hidden_python = python.with_name('pythonw.exe')
        if not hidden_python.exists(): hidden_python = python
        options = {}
        if os.name == 'nt':
            options['creationflags'] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            options['start_new_session'] = True
        with (runtime/'service.log').open('ab') as log:
            child = subprocess.Popen([str(hidden_python),str(ROOT/'server.py')],cwd=ROOT,
                                     stdin=subprocess.DEVNULL,stdout=log,stderr=log,close_fds=True,**options)
        for _ in range(100):
            state = health()
            if state and state.get('build') == BUILD: break
            if child.poll() is not None: raise RuntimeError('口语助手启动失败，请查看 .local/service.log')
            time.sleep(.1)
        else: raise RuntimeError('启动超时，请查看 .local/service.log')
    (ROOT/'.local/runtime.json').write_text(json.dumps({'build':BUILD,'pid':state['pid'],'url':URL},indent=2),encoding='utf-8')
    if '--no-browser' not in sys.argv: webbrowser.open(URL)
    print(URL)


if __name__ == '__main__': main()
