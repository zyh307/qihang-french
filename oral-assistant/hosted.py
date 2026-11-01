"""Hosted provider adapter. No credentials or raw upstream responses in logs/UI."""
import asyncio
import hashlib
import hmac
import json
import secrets
import time
import uuid
from urllib.parse import urlsplit

import aiohttp

from store import atomic_json

OTA = 'https://api.tenclass.net/xiaozhi/ota/'


class ProviderError(RuntimeError):
    pass


def safe_ws_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'wss' or parsed.hostname not in ('api.tenclass.net', 'api.xiaozhi.me'):
        raise ProviderError('托管服务下发了未支持的连接地址，请检查接入配置')
    return url


class Hosted:
    mcp_handshake_required = True
    def __init__(self, root, http):
        self.root, self.http = root, http
        self.path = root / 'private' / 'identity.json'
        self.identity = None
        self.config = None
        self.state = {'status': 'unchecked', 'message': '先连接小智，首次使用需要绑定智能体'}
        self.task = None
        self.lock = asyncio.Lock()

    def ensure_identity(self):
        if self.identity is not None:
            return
        if self.path.exists():
            self.identity = json.loads(self.path.read_text(encoding='utf-8'))
        else:
            # Persistent identity for this software installation, not another device.
            device = bytearray(secrets.token_bytes(6))
            device[0] = (device[0] | 2) & 254
            self.identity = {'device_id': ':'.join(f'{x:02x}' for x in device),
                             'client_id': str(uuid.uuid4()), 'serial_number': 'SN-' + uuid.uuid4().hex,
                             'hmac_key': secrets.token_hex(32)}
            atomic_json(self.path, self.identity)

    def headers(self):
        self.ensure_identity()
        return {'Device-Id': self.identity['device_id'], 'Client-Id': self.identity['client_id'],
                'User-Agent': 'bread-compact-wifi/french-a1-web-0.1.0',
                'Accept-Language': 'fr-FR', 'Activation-Version': '2'}

    async def fetch(self):
        self.ensure_identity()
        payload = {'version': 2, 'language': 'fr-FR',
                   'application': {'name': 'french-a1-web', 'version': '0.1.0', 'elf_sha256': self.identity['hmac_key']},
                   'board': {'type': 'bread-compact-wifi', 'name': 'french-a1-web',
                             'ip': '127.0.0.1', 'mac': self.identity['device_id']}}
        try:
            async with self.http.post(OTA, headers=self.headers(), json=payload,
                                      timeout=aiohttp.ClientTimeout(total=15)) as response:
                if response.status != 200:
                    raise ProviderError(f'小智激活配置请求失败（HTTP {response.status}）')
                data = await response.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
            raise ProviderError('暂时无法获取小智连接信息，请检查网络后重试') from exc
        if not isinstance(data, dict):
            raise ProviderError('小智返回的连接信息格式无效')
        self.config = data
        activation = data.get('activation')
        if activation:
            code = str(activation.get('code', ''))
            if not code:
                raise ProviderError('小智要求激活，但没有返回绑定码；请检查平台是否支持此软件客户端')
            self.state = {'status': 'binding', 'code': code, 'expires': time.time() + 300,
                          'message': '在小智控制台“添加设备”中输入此码，并选择 DELF A1 法语口语考官'}
        elif data.get('websocket', {}).get('url'):
            safe_ws_url(data['websocket']['url'])
            self.state = {'status': 'ready', 'message': '绑定信息已就绪，可以开始练习'}
        elif data.get('mqtt'):
            raise ProviderError('小智仅下发了 MQTT 通道；此网页原型当前需要 WebSocket，尚不能开始对话')
        else:
            raise ProviderError('小智没有下发可用语音连接，尚未连接成功')
        return self.state

    async def begin(self):
        async with self.lock:
            if self.task and not self.task.done():
                return self.state
            try:
                await self.fetch()
                if self.state['status'] == 'binding':
                    self.task = asyncio.create_task(self.poll_activation())
            except ProviderError as exc:
                self.state = {'status': 'error', 'message': str(exc)}
            return self.state

    async def poll_activation(self):
        activation = self.config['activation']
        challenge = activation.get('challenge')
        if not challenge:
            self.state = {'status': 'error', 'message': '激活协议缺少挑战信息，不能完成软件绑定'}
            return
        identity = self.identity
        payload = {'Payload': {'algorithm': 'hmac-sha256', 'serial_number': identity['serial_number'],
                               'challenge': challenge,
                               'hmac': hmac.new(identity['hmac_key'].encode(), challenge.encode(), hashlib.sha256).hexdigest()}}
        try:
            while time.time() < self.state.get('expires', 0):
                async with self.http.post(OTA.rstrip('/') + '/activate', headers=self.headers(), json=payload,
                                          timeout=aiohttp.ClientTimeout(total=15)) as response:
                    if response.status == 200:
                        await self.fetch()
                        if self.state['status'] == 'ready':
                            return
                        raise ProviderError('绑定返回成功，但语音通道仍未就绪，请重新连接')
                    if response.status != 202:
                        raise ProviderError(f'小智绑定未完成（HTTP {response.status}），请重新获取绑定码')
                await asyncio.sleep(4)
            self.state = {'status': 'expired', 'message': '绑定码已过期，请重新获取'}
        except asyncio.CancelledError:
            raise
        except (aiohttp.ClientError, asyncio.TimeoutError):
            self.state = {'status': 'error', 'message': '绑定连接中断，请重新连接小智'}
        except ProviderError as exc:
            self.state = {'status': 'error', 'message': str(exc)}

    async def connect(self):
        if not self.config or self.state['status'] != 'ready':
            raise ProviderError('请先连接小智并完成绑定')
        ws_info = self.config['websocket']
        headers = self.headers()
        headers['Protocol-Version'] = '1'
        headers['Authorization'] = 'Bearer ' + (ws_info.get('token') or '')
        try:
            ws = await self.http.ws_connect(safe_ws_url(ws_info['url']), headers=headers,
                                            timeout=aiohttp.ClientWSTimeout(ws_close=5), heartbeat=20,
                                            max_msg_size=1024 * 1024)
            await ws.send_json({'type': 'hello', 'version': 1, 'transport': 'websocket', 'features': {'mcp': True},
                                'audio_params': {'format': 'opus', 'sample_rate': 16000,
                                                 'channels': 1, 'frame_duration': 60}})
            async with asyncio.timeout(12):
                while True:
                    msg = await ws.receive()
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        hello = json.loads(msg.data)
                        if hello.get('type') == 'hello':
                            params = hello.get('audio_params', {})
                            if params.get('format', 'opus') != 'opus' or params.get('channels', 1) != 1:
                                raise ProviderError('小智返回的音频格式与本原型不兼容')
                            return ws, hello
                    elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                        raise ProviderError('小智未完成语音握手，请确认设备已绑定正确智能体')
        except BaseException as exc:
            if 'ws' in locals():
                await ws.close()
            if isinstance(exc, (KeyboardInterrupt, SystemExit, asyncio.CancelledError, ProviderError)):
                raise
            raise ProviderError('连接小智语音通道失败，请重新连接并检查绑定状态') from exc

    async def close(self):
        if self.task and not self.task.done():
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
