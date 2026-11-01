"""Protocol peer for isolated tests ONLY; never used by server.py launcher."""
import asyncio
import math
import struct
from aiohttp import web
from audio_codec import AudioCodec


class FakeProvider:
    state = {'status': 'ready', 'message': '隔离测试替身 · 不连接真实小智'}
    url = None
    fail_connect = False
    http = None

    def __init__(self, root, http):
        self.http = http
        self.connections = 0

    async def begin(self):
        return self.state

    async def connect(self):
        if self.fail_connect:
            from hosted import ProviderError
            raise ProviderError('测试：上游连接失败')
        self.connections += 1
        ws = await self.http.ws_connect(type(self).url)
        await ws.send_json({'type': 'hello'})
        return ws, await ws.receive_json()

    async def close(self):
        pass


async def peer(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    await ws.receive_json()
    await ws.send_json({'type': 'hello', 'session_id': 'fake', 'transport': 'websocket',
                        'audio_params': {'format': 'opus', 'sample_rate': 24000, 'channels': 1}})
    if request.app.get('require_handshake'):
        for serial,method in ((1,'initialize'),(2,'tools/list')):
            await ws.send_json({'type':'mcp','payload':{'jsonrpc':'2.0','id':serial,'method':method,'params':{}}})
            response=await ws.receive_json()
            assert response.get('type')=='mcp' and response['payload']['id']==serial,'control arrived before task tools were registered'
    packets = []
    async for msg in ws:
        if msg.type.name == 'BINARY':
            if 'received_audio' in request.app:request.app['received_audio'].append(msg.data)
            packets.append(msg.data)
        elif msg.type.name == 'TEXT':
            import json
            data = json.loads(msg.data)
            if 'listen_states' in request.app and data.get('type')=='listen':request.app['listen_states'].append(data.get('state'))
            if data.get('state') == 'stop' or data.get('state') == 'detect':
                text = data.get('text', '')
                if data.get('state') == 'stop':
                    assert packets, 'recording sent no raw Opus frames'
                    decoded = AudioCodec()
                    assert sum(len(b) for p in packets for b in decoded.decode(p)) > 0
                    packets.clear()
                    if not request.app.get('omit_stt'):
                        await ws.send_json({'type': 'stt', 'text': request.app.get('asr_text','Je m’appelle Alex. [测试转写]')})
                if text == 'SILENT_TEST':
                    continue
                if data.get('state') == 'detect':
                    await ws.send_json({'type':'stt','text':text})
                if request.app.get('omit_context') or request.app.get('skip_context',0)>0:
                    if request.app.get('skip_context',0)>0:request.app['skip_context']-=1
                    await ws.send_json({'type':'tts','state':'start'})
                    await ws.send_json({'type':'tts','state':'sentence_start','text':'WRONG-OPENING-WITHOUT-CONTEXT'})
                    await ws.send_bytes(b'invalid-opus-that-must-be-blocked')
                    await ws.send_json({'type':'tts','state':'stop'})
                    continue
                await ws.send_json({'type':'mcp','payload':{'jsonrpc':'2.0','id':77,'method':'tools/call',
                    'params':{'name':'self.french_exam.get_current_task','arguments':{}}}})
                tool_message = await ws.receive()
                if tool_message.type.name in ('CLOSE','CLOSED','ERROR'):
                    break
                assert tool_message.type.name == 'TEXT'
                tool = json.loads(tool_message.data)
                assert tool.get('type') == 'mcp'
                context = json.loads(tool['payload']['result']['content'][0]['text'])
                if 'contexts' in request.app: request.app['contexts'].append(context)
                assert context['level'] == 'A1'
                if context.get('mode')=='evaluation':
                    if request.app.get('evaluation_delay'):await asyncio.sleep(request.app['evaluation_delay'])
                    stages=[]
                    for stage in dict.fromkeys(r['stage'] for r in context['learner_rows']):
                        row=next(r for r in context['learner_rows'] if r['stage']==stage)
                        stages.append({'stage':stage,'task':'能围绕本环节交流。','interaction':'能回应考官。',
                            'vocabulary':'使用了常见词汇。','grammar':'可继续练习简单句。',
                            'strengths':[{'row':row['id'],'quote':row['text'],'comment':'表达了个人信息。[测试AI评价]'}],
                            'improvements':[{'row':row['id'],'quote':row['text'],'better':'Je suis étudiant.','reason':'尝试用完整短句表达。'}],
                            'practice':['回听原声，再用一个短句补充细节。']})
                    await ws.send_json({'type':'mcp','payload':{'jsonrpc':'2.0','id':78,'method':'tools/call',
                        'params':{'name':'self.french_exam.submit_evaluation','arguments':{'summary':'本轮有实际发言，可以继续练习。[测试AI评价]','stages':stages}}}})
                    await ws.receive()
                    continue
                await ws.send_json({'type': 'tts', 'state': 'start'})
                await ws.send_json({'type':'tts','state':'sentence_start','text':'% self.french_exam.get_current_task...'})
                reply='Bonjour ! Comment vous appelez-vous ? [测试回复]'
                if request.app.get('flow_replies'):
                    if context['progress']['closing']:reply='Merci, cette partie est terminée. [测试收尾]'
                    elif context['stage']=='intro':reply=context['intro_plan']['question']+' [测试追问]'
                    elif context['stage']=='exchange':reply='Oui, bien sûr. Au mot suivant. [测试回答]'
                await ws.send_json({'type': 'tts', 'state': 'sentence_start', 'text': reply})
                codec = AudioCodec()
                pcm = b''.join(struct.pack('<h', int(math.sin(i * math.tau * 440 / 16000) * 2000)) for i in range(3200))
                for packet in codec.encode(pcm, finish=True):
                    await ws.send_bytes(packet)
                await asyncio.sleep(.04)
                try:
                    await ws.send_json({'type': 'tts', 'state': 'stop'})
                except ConnectionResetError:
                    break  # client intentionally aborted/changed stage
    return ws
