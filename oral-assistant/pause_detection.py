"""Pause and voiced time measured from the PCM, independent of ASR words."""
from dataclasses import dataclass

from recording_window import SAMPLE_RATE


@dataclass(frozen=True)
class VoiceSettings:
    threshold: float = 0.50
    min_speech_duration_ms: int = 180
    min_silence_duration_ms: int = 200
    speech_pad_ms: int = 0


def summarize(spans, sample_count):
    """Clip and merge sample intervals before computing internal gaps."""
    voiced = []
    for start, end in sorted(spans):
        start, end = max(start, 0), min(end, sample_count)
        if start >= end:
            continue
        if voiced and start <= voiced[-1][1]:
            voiced[-1] = (voiced[-1][0], max(end, voiced[-1][1]))
        else:
            voiced.append((start, end))
    gaps = [(left[1], right[0]) for left, right in zip(voiced, voiced[1:])]

    def seconds(intervals):
        return [{"start": start / SAMPLE_RATE, "end": end / SAMPLE_RATE,
                 "seconds": (end - start) / SAMPLE_RATE} for start, end in intervals]

    return {
        "speech_seconds": sum(end - start for start, end in voiced) / SAMPLE_RATE,
        "speech_spans": seconds(voiced),
        "pause_spans": seconds(gaps),
    }


def detect(audio, settings=VoiceSettings()):
    from dataclasses import asdict
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    spans = get_speech_timestamps(audio, VadOptions(**asdict(settings)), sampling_rate=SAMPLE_RATE)
    return summarize(((interval["start"], interval["end"]) for interval in spans), len(audio))
