"""Local French recognizer and authenticated loopback client. No auto-downloads."""
import asyncio
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import time
import wave

ROOT=Path(__file__).resolve().parent
MAX_SECONDS=180


class FrenchEngine:
    def __init__(self,settings):
        self.model_path=Path(settings.get('model_path',ROOT/'.models/whisper-large-v3-french/ctranslate2'))
        self.device=settings.get('device','auto')
        self.compute_type=None
        self.model=None;self.task=None;self.dll_handles=[];self.warmed=False
        self.last_error=None
        self.model_name=settings.get('model_name','whisper-large-v3-french')
        self.revision=settings.get('revision','90a7cd1fea9cd69f80f5a0fc49738418dba96083')
        sys.path.append(str(ROOT/'.whisper_deps'))

    @property
    def state(self):
        ready=all((self.model_path/n).is_file() for n in ('model.bin','config.json','tokenizer.json')) and importlib.util.find_spec('faster_whisper') is not None
        return {'available':ready and not self.last_error,'configured':True,'busy':bool(self.task and not self.task.done()),
                'loaded':self.model is not None,'warmed':self.warmed,'source':'whisper_fr','model':self.model_name,'language':'fr',
                'device':self.device,'compute_type':self.compute_type,'label':'独立法语识别',
                'message':self.last_error or ('独立法语识别已就绪' if ready else '缺少法语识别依赖或模型，请运行安装工具')}

    async def run(self,operation):
        if self.task and not self.task.done():raise ValueError('识别服务正在处理另一段录音，请稍后重试')
        self.task=asyncio.create_task(asyncio.to_thread(operation))
        # A disconnected HTTP caller cannot stop a native decoder. Retrieve any
        # eventual error while retaining the task so a second model cannot run.
        self.task.add_done_callback(lambda task:task.exception() if not task.cancelled() else None)
        return await asyncio.shield(self.task)

    async def warmup(self):
        await self.run(self._warmup)
        return self.state

    def _warmup(self):
        self._load()
        if not self.warmed:
            import numpy as np
            # Initialize GPU kernels before the first learner speaks. Any text
            # from this artificial silence is discarded, never stored as speech.
            segments,_=self.model.transcribe(np.zeros(16000,dtype=np.float32),language='fr',
                    beam_size=1,temperature=0,condition_on_previous_text=False,vad_filter=False)
            list(segments)
            self.warmed=True

    def _load(self):
        if self.model is not None:return
        os.environ['HF_HUB_OFFLINE']='1';os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
        if os.name=='nt':
            dirs=list((ROOT/'.gpu_deps/nvidia').glob('*/bin'))
            for folder in dirs:self.dll_handles.append(os.add_dll_directory(str(folder)))
            if dirs:os.environ['PATH']=os.pathsep.join(map(str,dirs))+os.pathsep+os.environ.get('PATH','')
        from faster_whisper import WhisperModel
        import ctranslate2
        if self.device=='auto':self.device='cuda' if ctranslate2.get_cuda_device_count() else 'cpu'
        self.compute_type='int8_float16' if self.device=='cuda' else 'int8'
        self.model=WhisperModel(str(self.model_path),device=self.device,compute_type=self.compute_type,
                                cpu_threads=6,num_workers=1,local_files_only=True)

    async def transcribe(self,data):
        return await self.run(lambda:self._transcribe(data))

    def _transcribe(self,data):
        import numpy as np
        try:
            with wave.open(io.BytesIO(data),'rb') as wav:
                if (wav.getnchannels(),wav.getsampwidth(),wav.getframerate(),wav.getcomptype())!=(1,2,16000,'NONE'):
                    raise ValueError('识别需要16 kHz单声道PCM录音')
                frames=wav.getnframes()
                if not 0<frames<=16000*MAX_SECONDS:raise ValueError('录音为空或超过3分钟')
                pcm=wav.readframes(frames)
                if len(pcm)!=frames*2:raise ValueError('录音数据不完整')
        except (wave.Error,EOFError) as exc:raise ValueError('无法读取这段录音') from exc
        start=time.monotonic();self._load()
        audio=np.frombuffer(pcm,dtype='<i2').astype(np.float32)/32768
        # Silence is not a learner answer. VAD additionally handles quiet pauses.
        if float(np.max(np.abs(audio)))<.002:
            pieces=[]
        else:
            segments,_=self.model.transcribe(audio,language='fr',task='transcribe',beam_size=5,
                    temperature=0,condition_on_previous_text=False,vad_filter=True)
            pieces=[{'start':round(s.start,3),'end':round(s.end,3),'text':s.text.strip(),
                     'avg_logprob':s.avg_logprob,'no_speech_prob':s.no_speech_prob} for s in segments]
        return {'text':' '.join(x['text'] for x in pieces).strip(),'source':'whisper_fr','model':self.model_name,
                'revision':self.revision,'language':'fr','local_only':True,'device':self.device,
                'compute_type':self.compute_type,'elapsed':round(time.monotonic()-start,3),
                'audio_seconds':round(frames/16000,3),'segments':pieces}


class FrenchASRClient:
    def __init__(self,data_dir):
        self.http=None;self.endpoint=None;self.token=None
        self.state={'available':False,'configured':False,'source':'whisper_fr','label':'独立法语识别',
                    'message':'独立法语识别尚未配置'}
        try:
            config=json.loads((Path(data_dir)/'french_asr.json').read_text(encoding='utf-8'))
            if config.get('enabled') is not True:return
            self.endpoint=config['endpoint']
            if self.endpoint!='http://127.0.0.1:8132':raise ValueError('仅允许本机识别服务')
            self.token=json.loads(Path(config['token_file']).read_text(encoding='utf-8'))['token']
            if not isinstance(self.token,str) or len(self.token)<32:raise ValueError('识别凭证无效')
            self.state.update(configured=True,message='独立法语识别正在连接')
        except (OSError,ValueError,KeyError,TypeError):self.endpoint=None

    async def start(self):
        import aiohttp
        self.http=aiohttp.ClientSession(trust_env=False,timeout=aiohttp.ClientTimeout(total=150))
        await self.refresh()

    async def refresh(self):
        if not self.endpoint or not self.http:return self.state
        import aiohttp
        try:
            async with self.http.get(self.endpoint+'/health',headers={'Authorization':'Bearer '+self.token},timeout=aiohttp.ClientTimeout(total=2)) as r:
                if r.status!=200:raise ValueError('识别服务鉴权失败')
                data=await r.json()
            allowed=('available','busy','loaded','warmed','source','model','language','device','compute_type','label','message')
            self.state.update({k:data[k] for k in allowed if k in data})
        except (aiohttp.ClientError,asyncio.TimeoutError,ValueError):
            self.state.update(available=False,message='独立法语识别服务未就绪，请运行启动器')
        return self.state

    async def transcribe(self,path):
        if not self.http or not self.endpoint:raise ValueError(self.state['message'])
        import aiohttp
        try:
            async with self.http.post(self.endpoint+'/transcribe',data=Path(path).read_bytes(),
                    headers={'Authorization':'Bearer '+self.token,'Content-Type':'audio/wav'}) as r:
                result=await r.json()
                if r.status!=200:raise ValueError(result.get('error','独立法语识别失败'))
        except (aiohttp.ClientError,asyncio.TimeoutError) as exc:raise ValueError('独立识别连接失败，录音已保留，可重试') from exc
        if not isinstance(result.get('text'),str) or len(result['text'])>10000 or result.get('source')!='whisper_fr':
            raise ValueError('独立识别结果格式无效')
        return result

    async def close(self):
        if self.http:await self.http.close()
