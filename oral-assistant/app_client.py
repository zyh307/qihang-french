"""Opt-in authenticated access for the Qihang app. Local browser rules stay intact."""
import json
import secrets
from pathlib import Path
from urllib.parse import urlsplit


class AppClient:
    def __init__(self, data_dir):
        self.path = Path(data_dir) / 'private' / 'app-client.json'

    def config(self):
        try:
            value = json.loads(self.path.read_text(encoding='utf-8'))
            if value.get('enabled') and len(value.get('access_token', '')) >= 24:
                return value
        except (OSError, ValueError, TypeError, AttributeError):
            pass
        return None

    def allowed(self, request):
        config = self.config()
        if not config:
            return False
        return (request.host in config.get('hosts', []) and
                request.headers.get('Origin') in config.get('origins', []))

    def authorized(self, request):
        config = self.config()
        if not config or not self.allowed(request):
            return False
        token = request.headers.get('Authorization', '').removeprefix('Bearer ')
        if request.path == '/ws':
            protocols = request.headers.get('Sec-WebSocket-Protocol', '').split(',')
            token = next((p.strip()[6:] for p in protocols if p.strip().startswith('token.')), '')
        return bool(token) and secrets.compare_digest(token, config['access_token'])

    def cors(self, request, response):
        response.headers['Access-Control-Allow-Origin'] = request.headers['Origin']
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Oral-Client'
        response.headers['Vary'] = 'Origin'
        return response
