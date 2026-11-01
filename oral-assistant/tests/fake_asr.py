"""Explicit local review substitute for isolated tests; never imported by production."""
import asyncio
import wave


class FakeFrenchASR:
    state = {'available':True, 'source':'test_only', 'message':'测试替身，不是真实识别'}

    async def review(self, path):
        with wave.open(str(path), 'rb') as wav:
            assert wav.getframerate() == 16000 and wav.getnframes() > 0
        await asyncio.sleep(.02)
        return {'text':'[测试本地复核] J’aime manger au restaurant. <script>',
                'source':'test_only', 'local_only':True, 'language':'fr'}
