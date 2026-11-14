"""Prepare only the word/example recordings used by the Inspire heading supplement."""
import array
import asyncio
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.lexicon-work/python'))
import edge_tts
import imageio_ffmpeg

sys.stdout.reconfigure(encoding='utf-8')
VOICE = 'fr-FR-DeniseNeural'
WORK = ROOT / '.lexicon-work/heading-import/audio'
CACHE = ROOT / '.lexicon-work/voice-batches'
OUT = ROOT / 'src/static/lexicon/audio'
UPDATES = ROOT / 'src/static/lexicon/audio-updates'
for directory in (WORK, CACHE, OUT, UPDATES):
    directory.mkdir(parents=True, exist_ok=True)

def sha(content):
    return hashlib.sha256(content if isinstance(content, bytes) else content.encode()).hexdigest()

def write_json(file, value, pretty=False):
    temporary = file.with_suffix(file.suffix + '.part')
    temporary.write_text(json.dumps(value, ensure_ascii=False, **({'indent': 2} if pretty else {'separators': (',', ':')})) + '\n', encoding='utf-8')
    temporary.replace(file)

supplement = json.loads((ROOT / 'src/lexicon/inspire-heading-supplement.json').read_text(encoding='utf-8'))
texts = list(dict.fromkeys(text for entry in supplement['entries'] for form in entry['word']['forms']
                           for text in (form['text'], form['example']['fr'])))
index_file = OUT / 'index.json'
index = json.loads(index_file.read_text(encoding='utf-8'))
files_checked = {}

def usable(record):
    if not record or not isinstance(record.get('file'), str):
        return False
    name = record['file']
    if Path(name).name != name or not name.endswith('.mp3'):
        return False
    if name not in files_checked:
        file = OUT / name
        content = file.read_bytes() if file.is_file() else b''
        files_checked[name] = len(content) > 100 and sha(content) + '.mp3' == name
    return files_checked[name] and record.get('end', 0) > record.get('start', 0)

# Keep individual metadata so a future full lexicon rebuild can retain these clips.
for text in texts:
    key = sha(text)
    cached = CACHE / ('headings-' + key + '.json')
    if not usable(index['entries'].get(key)) and cached.is_file():
        record = json.loads(cached.read_text(encoding='utf-8')).get(key)
        if usable(record):
            index['entries'][key] = record

pending = [text for text in texts if not usable(index['entries'].get(sha(text)))]
semaphore = asyncio.Semaphore(5)
completed = 0
failures = []

async def prepare(text):
    global completed
    key = sha(text)
    async with semaphore:
        raw = WORK / (key + '.source.mp3')
        try:
            if not raw.is_file() or raw.stat().st_size < 100:
                for attempt in range(5):
                    try:
                        partial = raw.with_suffix('.mp3.part')
                        await asyncio.wait_for(edge_tts.Communicate(text, VOICE, rate='-5%').save(str(partial)), 100)
                        if partial.stat().st_size < 100:
                            raise ValueError('Empty speech response')
                        partial.replace(raw)
                        break
                    except Exception:
                        if attempt == 4:
                            raise
                        await asyncio.sleep(min(16, 2 ** attempt))
            decoded = await asyncio.to_thread(subprocess.run, [imageio_ffmpeg.get_ffmpeg_exe(),
                '-v', 'error', '-nostdin', '-i', str(raw), '-f', 's16le', '-ac', '1', '-ar', '8000', '-'],
                check=True, capture_output=True)
            samples = array.array('h', decoded.stdout)
            if not samples or max(abs(sample) for sample in samples) < 40:
                raise ValueError('Empty or silent recording')
            compressed = WORK / (key + '.mp3')
            await asyncio.to_thread(subprocess.run, [imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error',
                '-nostdin', '-y', '-i', str(raw), '-ac', '1', '-ar', '24000', '-b:a', '24k', str(compressed)],
                check=True, capture_output=True)
            content = compressed.read_bytes()
            name = sha(content) + '.mp3'
            for directory in (OUT, UPDATES):
                target = directory / name
                temporary = target.with_suffix('.mp3.part')
                temporary.write_bytes(content)
                temporary.replace(target)
            files_checked[name] = True
            record = {'file': name, 'start': 0, 'end': round(len(samples) / 8000, 4),
                      'full': True, 'origin': 'synthesized', 'voice': VOICE}
            write_json(CACHE / ('headings-' + key + '.json'), {key: record})
            index['entries'][key] = record
            completed += 1
            if completed % 20 == 0 or completed == len(pending):
                print(f'Prepared {completed}/{len(pending)} recordings', flush=True)
        except Exception as error:
            failures.append({'text': text, 'error': str(error)})
            print('Recording failed: ' + text + ': ' + str(error), flush=True)

async def main():
    print(f'{len(texts)} unique texts; reusing {len(texts) - len(pending)} recordings; preparing {len(pending)}', flush=True)
    await asyncio.gather(*(prepare(text) for text in pending))
    write_json(WORK.parent / 'audio-failures.json', failures)
    if failures:
        raise RuntimeError(f'{len(failures)} recordings failed. Rerun this script to resume.')
    for text in texts:
        key = sha(text)
        record = index['entries'][key]
        if not usable(record):
            raise ValueError('Recording unavailable: ' + text)
        write_json(CACHE / ('headings-' + key + '.json'), {key: record})
    write_json(index_file, index)
    exact_file = ROOT / '.lexicon-work/lexicon-speech-texts.json'
    exact = json.loads(exact_file.read_text(encoding='utf-8')) if exact_file.is_file() else []
    write_json(exact_file, list(dict.fromkeys(exact + texts)))
    manifest_file = ROOT / 'src/static/lexicon/manifest.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
    filenames = {record['file'] for record in index['entries'].values()}
    manifest['audio'] = {'voice': index['voice'], 'clips': len(index['entries']), 'files': len(filenames),
                         'bytes': sum((OUT / name).stat().st_size for name in filenames),
                         'indexSHA256': sha(index_file.read_bytes())}
    write_json(manifest_file, manifest, pretty=True)
    write_json(WORK.parent / 'audio-summary.json', {'uniqueTexts': len(texts), 'reused': len(texts) - len(pending),
               'synthesized': completed, 'failures': len(failures), 'voice': VOICE})
    print('All heading recordings are available.', flush=True)

asyncio.run(main())
