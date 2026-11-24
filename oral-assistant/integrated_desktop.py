"""Run the desktop workshop and its local recognizer in one owned process."""
import argparse
import asyncio
import json
from pathlib import Path
import secrets
import sys

from aiohttp import web

from french_asr import FrenchEngine
from lecture import MEDIA
from server import make_app


class LocalRecognizer:
    def __init__(self, model_path):
        gpu = Path(__file__).parent / '.gpu_deps' / 'nvidia'
        self.engine = FrenchEngine({'device': 'auto' if gpu.is_dir() else 'cpu', 'model_path': str(model_path)})

    @property
    def state(self):
        state = self.engine.state
        if not state['available'] and not self.engine.last_error:
            state['message'] = '请在「口语资料」的 Model 文件夹放入法语识别模型'
        return state

    async def start(self):
        return self.state

    async def refresh(self):
        return self.state

    async def transcribe(self, path, *, word_evidence=False):
        return await self.transcribe_wav(Path(path).read_bytes(), word_evidence=word_evidence)

    async def transcribe_wav(self, data, *, word_evidence=False, continuous=False):
        if not self.state['available']:
            raise ValueError(self.state['message'])
        return await self.engine.transcribe(data, word_evidence=word_evidence, continuous=continuous)

    async def close(self):
        if self.engine.task:
            await asyncio.gather(self.engine.task, return_exceptions=True)


async def serve(args):
    entry = secrets.token_urlsafe(32)
    resources = args.data / 'Resources'
    model_path = resources / 'Model'
    lecture_path = resources / 'Lecture'
    legacy_model = Path(__file__).parent / '.models/whisper-large-v3-french/ctranslate2'
    if not (model_path / 'model.bin').is_file() and (legacy_model / 'model.bin').is_file():
        model_path = legacy_model
    if not any(lecture_path.glob('*.json')) and any(MEDIA.glob('*.json')):
        lecture_path = MEDIA
    app = make_app(args.data, args.port, cookie_name='qihang_workshop',
                   game_private_assets=args.data / 'assets-private',
                   embedded_parent=f'http://127.0.0.1:{args.parent_port}',
                   embedded_token=entry, french_asr=LocalRecognizer(model_path), lecture_media=lecture_path)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    try:
        await web.TCPSite(runner, '127.0.0.1', args.port).start()
        print(json.dumps({'entry': entry}), flush=True)
        # Closing the owning process also closes its side of this pipe.
        await asyncio.to_thread(sys.stdin.buffer.read, 1)
    finally:
        await runner.cleanup()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--parent-port', type=int, required=True)
    asyncio.run(serve(parser.parse_args()))
