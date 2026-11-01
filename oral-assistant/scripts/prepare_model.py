"""Explicit developer setup only. Download pinned public weights; no user audio."""
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,time,urllib.request,sys
HOST='https://hf-mirror.com' if '--mirror' in sys.argv else 'https://huggingface.co'
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REPO='Systran/faster-whisper-small'
REV='536b0662742c02347bc0e980a01041f333bce120'
DEST=ROOT/'.models/faster-whisper-small'
TURBO='--turbo' in sys.argv
FRENCH='--french' in sys.argv
if TURBO:
    REPO='dropbox-dash/faster-whisper-large-v3-turbo'
    REV='0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf'
    DEST=ROOT/'.models/faster-whisper-large-v3-turbo'
if FRENCH:
    REPO='bofenghuang/whisper-large-v3-french'
    REV='90a7cd1fea9cd69f80f5a0fc49738418dba96083'
    DEST=ROOT/'.models/whisper-large-v3-french'

def download(item):
    name=item['path'];target=DEST/name
    target.parent.mkdir(parents=True,exist_ok=True)
    expected=item.get('lfs',{}).get('oid')
    if target.is_file() and target.stat().st_size==item['size']:
        digest=hashlib.sha256() if expected else hashlib.sha1(b'blob '+str(item['size']).encode()+b'\0')
        with target.open('rb') as existing:
            while chunk:=existing.read(1024*1024):digest.update(chunk)
        if digest.hexdigest()==(expected or item['oid']):
            return name
    url=f'{HOST}/{REPO}/resolve/{REV}/{name}?download=true&t={int(time.time())}'
    partial=target.with_suffix(target.suffix+'.part')
    digest=hashlib.sha256() if expected else hashlib.sha1(b'blob '+str(item['size']).encode()+b'\0');total=0
    with urllib.request.urlopen(url,timeout=45) as response,partial.open('wb') as output:
        while chunk:=response.read(1024*1024):
            output.write(chunk);digest.update(chunk);total+=len(chunk)
            if total%(128*1024*1024)==0:print(f'{name}: {total//1048576} MiB',flush=True)
    if total!=item['size'] or digest.hexdigest()!=(expected or item['oid']):
        raise RuntimeError(f'model integrity mismatch: {name}')
    partial.replace(target)
    print(f'{name}: {total} bytes verified',flush=True)
    return name

def retry(call):
    for attempt in range(3):
        try:return call()
        except (OSError,TimeoutError) as exc:
            if attempt==2:raise
            print(f'download retry {attempt+1}: {type(exc).__name__}: {str(exc)[:160]}',flush=True)
            time.sleep(1+attempt*2)

if __name__=='__main__':
    DEST.mkdir(parents=True,exist_ok=True)
    folder='/ctranslate2' if FRENCH else ''
    def listing():
        print(f'fetch {HOST}/api/models/{REPO}/tree/{REV}{folder}',flush=True)
        with urllib.request.urlopen(f'{HOST}/api/models/{REPO}/tree/{REV}{folder}',timeout=25) as response:return json.load(response)
    entries=retry(listing)
    files=('config.json','model.bin','tokenizer.json','vocabulary.json','preprocessor_config.json','README.md') if TURBO else ('config.json','model.bin','tokenizer.json','vocabulary.txt','README.md')
    if FRENCH:files=tuple('ctranslate2/'+n for n in ('config.json','model.bin','tokenizer.json','vocabulary.json','preprocessor_config.json'))
    entries=[x for x in entries if x['path'] in files]
    if len(entries)!=len(files):raise RuntimeError('unexpected repository file list')
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda item:retry(lambda:download(item)),entries))
    (DEST/'provenance.json').write_text(json.dumps({'repo':REPO,'revision':REV,'download_host':HOST,'files':entries},indent=2),encoding='utf-8')
    print('model setup complete',flush=True)
