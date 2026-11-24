"""Build bundled French recordings. No speech engine is needed on user devices."""
import asyncio,array,bisect,hashlib,json,re,subprocess,sys,time
from pathlib import Path
from shutil import copyfile
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'.lexicon-work/python'),str(ROOT.parents[1]/'app/.audio-tools')]
import edge_tts,imageio_ffmpeg
VOICE='fr-FR-DeniseNeural'
WORK=ROOT/'.lexicon-work/voice-batches';OUT=ROOT/'src/static/lexicon/audio'
WORK.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
rows=json.loads((ROOT/'src/static/lexicon/french.json').read_text(encoding='utf-8'))['entries']
def key(value):return hashlib.sha256((value if isinstance(value,bytes) else value.encode())).hexdigest()
texts={}
for row in rows:
 word=row['word']
 if row['pos']=='n.' and row.get('gender'):
  if row.get('plural'):word='des '+word
  if not re.match(r"^(?:de la\s+|de l['’]|(?:un|une|des|du|le|la|les|en|au|aux|à)(?:\s+|$)|l['’])",word,re.I):word=('une ' if row.get('gender')=='f' else 'un ')+word
 for value in [word,row.get('example',{}).get('fr')]:
  if value:texts.setdefault(value,None)
exact_texts=ROOT/'.lexicon-work/lexicon-speech-texts.json'
segments=json.loads(exact_texts.read_text(encoding='utf-8')) if exact_texts.exists() else list(texts)
append=next((a.split('=',1)[1] for a in sys.argv if a.startswith('--append-texts=')),None)
existing={}
if append:
 segments=list(dict.fromkeys(json.loads(Path(append).read_text(encoding='utf-8'))))
 existing=json.loads((OUT/'index.json').read_text(encoding='utf-8'))['entries']
wanted={key(text) for text in segments};index={}
for metadata in WORK.glob('*.json'):
 try:
  records=json.loads(metadata.read_text(encoding='utf-8'))
  if not isinstance(records,dict):continue
  index.update({k:v for k,v in records.items() if k in wanted and isinstance(v,dict) and (OUT/v['file']).is_file()})
 except (ValueError,KeyError,TypeError):pass
index.update({k:v for k,v in existing.items() if k in wanted and (OUT/v['file']).is_file()})
pending=[text for text in segments if key(text) not in index];size=1 if '--single' in sys.argv else 40;batches=[pending[i:i+size] for i in range(0,len(pending),size)]
done=0;started=time.monotonic()
print(f'Reusing {len(index)} clips; {len(pending)} remaining',flush=True)
async def one(group):
 global done
 batch=key(json.dumps([VOICE,group],ensure_ascii=False));meta=WORK/(batch+'.json')
 if meta.exists():
  records=json.loads(meta.read_text(encoding='utf-8'))
  if all((OUT/r['file']).is_file() for r in records.values()):index.update(records);done+=1;return
 text='';starts=[];ends=[]
 for value in group:
  starts.append(len(text));text+=re.sub(r'\s+',' ',value.strip());ends.append(len(text));text+=('' if re.search(r'[.!?…]$',text) else '.')+'\n'
 raw=WORK/(batch+'.mp3');boundaries=[]
 for attempt in range(5):
  try:
   with raw.open('wb') as target:
    async for chunk in edge_tts.Communicate(text,VOICE,rate='-5%',boundary='WordBoundary').stream():
     if chunk['type']=='audio':target.write(chunk['data'])
     elif chunk['type']=='WordBoundary':boundaries.append(chunk)
   if raw.stat().st_size<100 or not boundaries and len(group)>1:raise ValueError('Empty audio')
   break
  except Exception:
   boundaries=[]
   if attempt==4:raise
   await asyncio.sleep(2**attempt)
 windows=[[] for _ in group];cursor=0
 if len(group)==1:
  decoded=await asyncio.to_thread(subprocess.run,[imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-nostdin','-i',str(raw),'-f','s16le','-ac','1','-ar','8000','-'],check=True,capture_output=True)
  samples=array.array('h',decoded.stdout)
  if not samples or max(abs(n) for n in samples)<40:raise ValueError('Silent audio: '+group[0])
  windows=[[(0,len(samples)/8000)]]
 else:
  for event in boundaries:
   match=re.search(re.escape(event['text'].replace('’',"'")),text[cursor:].replace('’',"'"),re.I)
   if not match:raise ValueError('Cannot align speech: '+event['text'])
   pos=cursor+match.start();cursor+=match.end();i=bisect.bisect_right(starts,pos)-1
   if i<0 or pos>=ends[i]:continue
   windows[i].append((event['offset']/1e7,(event['offset']+event['duration'])/1e7))
  if any(not w for w in windows):raise ValueError('Missing speech boundary: '+repr([group[i] for i,w in enumerate(windows) if not w]))
 compressed=WORK/(batch+'-small.mp3')
 await asyncio.to_thread(subprocess.run,[imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-nostdin','-y','-i',str(raw),'-ac','1','-ar','24000','-b:a','24k',str(compressed)],check=True,capture_output=True)
 content=compressed.read_bytes();name=key(content)+'.mp3';(OUT/name).write_bytes(content)
 records={}
 for i,(value,window) in enumerate(zip(group,windows)):
  start=max(0,window[0][0]-.025);end=window[-1][1]+.09
  if i+1<len(windows):end=min(end,windows[i+1][0][0]-.025)
  records[key(value)]={'file':name,'start':round(start,4),'end':round(end,4),**({'full':True} if len(group)==1 else {})}
 meta.write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')),encoding='utf-8');index.update(records);done+=1
 if done%20==0:print(f'{done}/{len(batches)} batches, {len(index)} clips, {time.monotonic()-started:.0f}s',flush=True)
async def main():
 queue=asyncio.Queue()
 for b in batches:queue.put_nowait(b)
 failures=[]
 async def worker():
  while not queue.empty():
   group=queue.get_nowait()
   try:await one(group)
   except Exception as e:failures.append({'texts':group,'error':str(e)});print('Batch failed: '+str(e),flush=True)
 await asyncio.gather(*(worker() for _ in range(9)))
 (WORK/'failures.json').write_text(json.dumps(failures,ensure_ascii=False),encoding='utf-8')
 if failures:raise RuntimeError(f'{len(failures)} audio batches failed; resume to retry')
 if len(index)!=len(segments):raise RuntimeError('Incomplete audio index')
 if append:
  updates=OUT.with_name('audio-updates')
  updates.mkdir(exist_ok=True)
  for name in {record['file'] for k,record in index.items() if existing.get(k)!=record}:
   copyfile(OUT/name,updates/name)
  existing.update(index)
  index.update(existing)
  cached=json.loads(exact_texts.read_text(encoding='utf-8')) if exact_texts.exists() else []
  exact_texts.write_text(json.dumps(list(dict.fromkeys(cached+segments)),ensure_ascii=False),encoding='utf-8')
 (OUT/'index.json').write_text(json.dumps({'schema':1,'voice':VOICE,'entries':index},separators=(',',':')),encoding='utf-8')
 files={row['file'] for row in index.values()}
 manifest=ROOT/'src/static/lexicon/manifest.json';metadata=json.loads(manifest.read_text(encoding='utf-8'))
 metadata['audio']={'voice':VOICE,'clips':len(index),'files':len(files),'bytes':sum((OUT/name).stat().st_size for name in files),'indexSHA256':key((OUT/'index.json').read_bytes())}
 manifest.write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f'Bundled audio ready: {len(index)} clips, {len(files)} files',flush=True)
asyncio.run(main())
