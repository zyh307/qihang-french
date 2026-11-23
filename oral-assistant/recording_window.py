"""Sample-based windows over signed little-endian 16 kHz mono PCM."""
from dataclasses import dataclass
from io import BytesIO
import wave

SAMPLE_RATE = 16_000
SAMPLE_BYTES = 2


async def receive_window(request, limit_seconds):
    if request.content_type != "application/octet-stream":
        raise ValueError("请提交 16 kHz 单声道 PCM")
    pcm = bytearray()
    cap = limit_seconds * SAMPLE_RATE * SAMPLE_BYTES
    async for chunk in request.content.iter_chunked(16_384):
        pcm.extend(chunk)
        if len(pcm) > cap:
            raise ValueError(f"录音窗口超过 {limit_seconds} 秒")
    return RecordingWindow.select(pcm, limit_seconds)


@dataclass(frozen=True)
class RecordingWindow:
    pcm: bytes
    start_sample: int
    end_sample: int
    limit_seconds: int

    @classmethod
    def select(cls, pcm, limit_seconds, *, start_sample=0, end_sample=None):
        if len(pcm) % SAMPLE_BYTES:
            raise ValueError("录音包含不完整的 PCM 采样")
        total = len(pcm) // SAMPLE_BYTES
        end_sample = total if end_sample is None else end_sample
        if any(type(value) is not int for value in (limit_seconds, start_sample, end_sample)):
            raise ValueError("录音窗口需要整数采样位置和秒数")
        if not 0 <= start_sample < end_sample <= total:
            raise ValueError("录音窗口超出 PCM 范围或为空")
        if not 0 < end_sample - start_sample <= limit_seconds * SAMPLE_RATE:
            raise ValueError(f"录音窗口超过 {limit_seconds} 秒")
        selected = bytes(pcm[start_sample * SAMPLE_BYTES:end_sample * SAMPLE_BYTES])
        return cls(selected, start_sample, end_sample, limit_seconds)

    def timing(self):
        return {
            "start_sample": self.start_sample, "end_sample": self.end_sample,
            "start": self.start_sample / SAMPLE_RATE, "end": self.end_sample / SAMPLE_RATE,
            "seconds": (self.end_sample - self.start_sample) / SAMPLE_RATE,
            "limit_seconds": self.limit_seconds, "sample_rate": SAMPLE_RATE,
        }

    def wav(self):
        output = BytesIO()
        with wave.open(output, "wb") as audio:
            audio.setparams((1, SAMPLE_BYTES, SAMPLE_RATE, 0, "NONE", ""))
            audio.writeframes(self.pcm)
        return output.getvalue()
