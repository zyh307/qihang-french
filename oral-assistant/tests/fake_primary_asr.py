"""Independent ASR fixture; no model, network, or real recordings."""
import asyncio
import wave


class FakePrimaryASR:
    def __init__(self):
        self.state={'configured':True,'available':True,'source':'whisper_fr','message':'隔离法语识别替身'}
        self.text="J'étudie à l'université."
        self.error=None;self.delay=0;self.calls=[];self.sequence=[]
    async def refresh(self):return self.state
    async def start(self):pass
    async def close(self):pass
    async def transcribe(self,path):
        with wave.open(str(path),'rb') as w:
            assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(16000,1,2)
            self.calls.append(w.readframes(w.getnframes()))
        await asyncio.sleep(self.delay)
        if self.error:raise ValueError(self.error)
        return {'text':self.sequence.pop(0) if self.sequence else self.text,'source':'whisper_fr','model':'test-only','language':'fr','local_only':True,'elapsed':self.delay}
