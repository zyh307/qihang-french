"""Small stateful bridge: browser PCM16/16k <-> Xiaozhi raw Opus frames."""
from fractions import Fraction

import av
import numpy as np


class AudioCodec:
    RATE = 16000
    FRAME = 960  # 60ms, protocol v1

    def __init__(self, bit_rate=48000):
        if bit_rate not in (24000, 48000):
            raise ValueError('不支持的语音编码码率')
        self.encoder = av.CodecContext.create('libopus', 'w')
        self.encoder.sample_rate = self.RATE
        self.encoder.layout = 'mono'
        self.encoder.format = 's16'
        self.encoder.bit_rate = bit_rate
        self.encoder.options = {'application': 'voip', 'frame_duration': '60', 'compression_level': '10'}
        self.encoder.open()
        self.buffer = bytearray()
        self.pts = 0
        self.finished = False
        self.reset_decoder()

    def encode(self, pcm: bytes, finish=False):
        if len(pcm) % 2:
            raise ValueError('PCM16 数据长度无效')
        if self.finished:
            if pcm:
                raise ValueError('本次语音已提交，请开始新的录音')
            return []
        self.buffer.extend(pcm)
        if finish and self.buffer:
            self.buffer.extend(b'\0' * ((-len(self.buffer)) % (self.FRAME * 2)))
        packets = []
        while len(self.buffer) >= self.FRAME * 2:
            block = bytes(self.buffer[:self.FRAME * 2])
            del self.buffer[:self.FRAME * 2]
            frame = av.AudioFrame.from_ndarray(
                np.frombuffer(block, dtype='<i2').reshape(1, -1),
                format='s16', layout='mono')
            frame.sample_rate = self.RATE
            frame.time_base = Fraction(1, self.RATE)
            frame.pts = self.pts
            self.pts += self.FRAME
            packets.extend(bytes(p) for p in self.encoder.encode(frame))
        if finish:
            # Padding the input frame alone does not drain libopus's lookahead.
            # Protocol v1 has no container to flush it on our behalf.
            if self.pts:
                packets.extend(bytes(p) for p in self.encoder.encode(None))
            self.finished = True
        return packets

    def reset_decoder(self, rate=24000):
        if rate not in (8000, 12000, 16000, 24000, 48000):
            raise ValueError('小智返回了不支持的音频采样率')
        self.output_rate = rate
        self.decoder = av.CodecContext.create('opus', 'r')
        self.resampler = av.AudioResampler(format='s16', layout='mono', rate=rate)

    def decode(self, packet: bytes):
        output = []
        for frame in self.decoder.decode(av.Packet(packet)):
            for converted in self.resampler.resample(frame):
                output.append(converted.to_ndarray().astype('<i2', copy=False).tobytes())
        return output
