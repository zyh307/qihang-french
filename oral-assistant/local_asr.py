"""Optional French-only review of saved WAVs. No downloads, network, or text repair."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import wave

ROOT = Path(__file__).resolve().parent
sys.path.append(str(ROOT / '.asr_deps'))


class LocalFrenchASR:
    def __init__(self, data_dir):
        config = Path(data_dir) / 'asr.json'
        try:
            settings = json.loads(config.read_text(encoding='utf-8')) if config.exists() else {}
            if not isinstance(settings, dict):
                settings = {}
            self.model_path = Path(settings.get('model_path', ROOT/'.models/vosk-model-small-fr-0.22'))
        except (OSError, ValueError, TypeError):
            self.model_path = ROOT/'.models/vosk-model-small-fr-0.22'
        self.model = None
        self.task = None

    @property
    def state(self):
        available = (self.model_path/'am/final.mdl').is_file() and importlib.util.find_spec('vosk') is not None
        return {'available':available, 'busy':bool(self.task and not self.task.done()),
                'source':'vosk_fr', 'label':'本地法语复核',
                'message':'独立候选结果，也可能识别错误；不会覆盖小智文字或改变已发出的回复。'
                          if available else '本地法语复核尚未安装，请按README配置法语模型。'}

    async def review(self, path):
        if not self.state['available']:
            raise ValueError(self.state['message'])
        if self.task and not self.task.done():
            raise ValueError('本地正在复核另一段录音，请完成后重试')
        self.task = asyncio.create_task(asyncio.to_thread(self._transcribe, Path(path)))
        # Keep the worker marked busy if the caller goes away during recognition.
        return await asyncio.shield(self.task)

    def _transcribe(self, path):
        from vosk import Model, KaldiRecognizer, SetLogLevel
        SetLogLevel(-1)
        with wave.open(str(path), 'rb') as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 16000, 'NONE'):
                raise ValueError('复核只支持本程序保存的16 kHz单声道录音')
            if wav.getnframes() > 16000*180:
                raise ValueError('单条录音过长，不能进行本地复核')
            if self.model is None:
                self.model = Model(str(self.model_path))
            recognizer = KaldiRecognizer(self.model, 16000)
            pieces = []
            while data := wav.readframes(4000):
                if recognizer.AcceptWaveform(data):
                    pieces.append(json.loads(recognizer.Result()).get('text', ''))
            pieces.append(json.loads(recognizer.FinalResult()).get('text', ''))
        return {'text':' '.join(p for p in pieces if p).strip(), 'source':'vosk_fr',
                'model':self.model_path.name, 'language':'fr', 'local_only':True}
