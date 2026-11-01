"""Provision a personal app access code; no public listener or tunnel is started."""
import argparse
import json
from pathlib import Path
import secrets
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--host', required=True, help='HTTPS service hostname, optionally with port')
parser.add_argument('--origin', action='append', default=[])
parser.add_argument('--data-dir', type=Path, default=Path(__file__).resolve().parents[1] / '.local')
args = parser.parse_args()
if not args.host or any(c in args.host for c in '/\\?#@ '):
    parser.error('Use a hostname, optionally with port')
origins = ['https://appassets.androidplatform.net', 'http://127.0.0.1:5192', 'http://127.0.0.1:5193', *args.origin]
for origin in origins:
    value = urlsplit(origin)
    if value.scheme not in ('http', 'https') or not value.netloc or value.path:
        parser.error('Invalid app origin')
target = args.data_dir / 'private' / 'app-client.json'
target.parent.mkdir(parents=True, exist_ok=True)
if target.exists():
    parser.error('Configuration already exists; preserve the current access code')
config = {'enabled': True, 'access_token': secrets.token_urlsafe(32), 'hosts': [args.host], 'origins': list(dict.fromkeys(origins))}
target.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
print('Service:', 'https://' + args.host)
print('Access code:', config['access_token'])
