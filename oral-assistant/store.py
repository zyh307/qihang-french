import json
import os
import re
import time
from pathlib import Path


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temp, path)


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.sessions = self.root / 'sessions'
        self.sessions.mkdir(parents=True, exist_ok=True)

    def folder(self, sid):
        if not re.fullmatch(r'[0-9a-f]{32}', sid):
            raise ValueError('无效会话编号')
        return self.sessions / sid

    def save(self, session):
        session['updated'] = time.time()
        atomic_json(self.folder(session['id']) / 'session.json', session)

    def load(self, sid):
        path = self.folder(sid) / 'session.json'
        if not path.exists():
            raise ValueError('没有找到这次练习记录')
        return json.loads(path.read_text(encoding='utf-8'))

    def listing(self):
        result = []
        for path in self.sessions.glob('*/session.json'):
            try:
                data = json.loads(path.read_text(encoding='utf-8'))
                result.append({k: data.get(k) for k in ('id', 'created', 'updated', 'mode', 'part', 'phase', 'ended')})
            except (OSError, ValueError):
                continue
        return sorted(result, key=lambda x: x['created'], reverse=True)[:100]
