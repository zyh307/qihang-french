import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {zipSync,strToU8} from 'fflate';
import {validateLesson} from '../src/domain/importer.js';
import {curriculumForms} from '../src/domain/curriculum.js';
import {displayForm,spellingParts} from '../src/domain/word-display.js';
import {applyExampleAudioCorrections} from '../src/domain/example-audio-corrections.js';
import {primaryMeaning,applyMeaningCorrections} from '../src/domain/meanings.js';
import {applyHeadingSupplement} from './inspire-heading-supplement.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),materials=path.resolve(app,'../词库');
const speech=JSON.parse(await fs.readFile(path.join(app,'src/static/lexicon/audio/index.json'),'utf8')).entries;
const sha=value=>createHash('sha256').update(value).digest('hex');
const spoken=text=>speech[sha(text)]?'tts:'+encodeURIComponent(text):null;
const work=path.join(app,'.lexicon-work/inspire-real-clips');await fs.mkdir(work,{recursive:true});
const ffmpegDir=path.join(app,'.lexicon-work/python/imageio_ffmpeg/binaries');
const ffmpeg=process.env.QIHANG_FFMPEG||await fs.readdir(ffmpegDir).then(files=>{const exe=files.find(n=>n.endsWith('.exe'));return exe?path.join(ffmpegDir,exe):null;},()=>null);
const trackHashes=new Map();
const catalog=[];
for(const number of [2,3,4]){
 const directory=path.join(materials,'Inspire'+number),file=path.join(directory,'book-source.json'),bookId='inspire'+number;
 if(!await fs.access(file).then(()=>true,()=>false))continue;
 const input=JSON.parse(await fs.readFile(file,'utf8'));if(input.book?.id!==bookId)throw Error('教材编号不匹配');const translations=JSON.parse(await fs.readFile(path.join(directory,'例句翻译.json'),'utf8'));
 const audioRoot=path.join(directory,(await fs.readdir(directory)).find(n=>n.startsWith('单词音频')),'真人切片');
 const audio=new Map(),lessons=new Map();let humanWords=0,splitForms=0,fallbackForms=0,silentForms=0;
 for(const entry of input.entries){
  const row=entry.row,provenance=entry.source,lessonId=row[0],serial=row[1],id='w'+number+lessonId.slice(1)+serial;
  const parsed=curriculumForms(row[2],row[4]);
  const word={id,order:0,audioNumber:serial,pos:parsed.pos,sourcePos:row[4],sourceText:row[2],meanings:row[5].split(/[；;]/).map(s=>s.trim()).filter(Boolean),forms:parsed.forms,curriculumAuthority:{bookId,lessonId,page:provenance['书页'],pdfPage:provenance['PDF页'],track:provenance['官方音轨']||null}};
  // A quoted foreign term without a supplied gender stays literal.
  if(word.pos==='n.'&&word.forms.some(f=>!f.gender&&!/^(?:un|une|des|du|le|la|les|de la|de l['’]|l['’])/.test(f.text))){word.pos='loc.';for(const f of word.forms)f.literal=true;}
  word.primaryMeaning=primaryMeaning(word);
  const label=[input.book.title,lessonId,provenance['书页']?'p. '+provenance['书页']:'',provenance['官方音轨']?'Piste '+String(provenance['官方音轨']).padStart(3,'0'):''].filter(Boolean).join(' · ');
  const ipa=String(row[3]||'').replace(/^\//,'').replace(/\/$/,'').split(/\s+\/\s+/);
  const audioName=row[8]||entry.id+'.mp3';if(!/^[A-Za-z0-9_-]+\.mp3$/.test(audioName))throw Error('真人录音文件名无效');
  const realFile=path.join(audioRoot,audioName);
  const real=await fs.readFile(realFile).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
  if(real)humanWords++;
  const ranges=JSON.parse(provenance['切片范围（秒）']||'[]'),sourceTrack=path.join(directory,'原音轨',provenance['原文件']||'');
  if(provenance['原文件']&&!/^[A-Za-z0-9_ -]+\.mp3$/.test(provenance['原文件']))throw Error('原音轨文件名无效');
  const canSplit=real&&word.forms.length>1&&ranges.length===word.forms.length&&await fs.stat(sourceTrack).then(s=>s.isFile(),()=>false);
  for(const [index,form]of word.forms.entries()){
   form.id=id+'-v'+(index+1);form.ipa||='/'+(ipa[index]||ipa[0])+'/';form.source=label;
   let bytes=null;
   if(canSplit){
    const range=ranges[index];if(!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[0]<0||range[1]<=range[0]||range[1]-range[0]>30)throw Error('真人切片范围无效：'+entry.id);
    if(!trackHashes.has(sourceTrack))trackHashes.set(sourceTrack,sha(await fs.readFile(sourceTrack)));
    const clipVersion=sha(trackHashes.get(sourceTrack)+JSON.stringify(range)).slice(0,16);
    const target=path.join(work,bookId+'-'+entry.id+'-'+index+'-'+clipVersion+'.mp3');
    if(!await fs.access(target).then(()=>true,()=>false)){
     if(!ffmpeg)throw Error('构建需要 FFmpeg 来切分原版录音');
     const result=spawnSync(ffmpeg,['-v','error','-nostdin','-y','-ss',String(range[0]),'-t',String(range[1]-range[0]),'-i',sourceTrack,'-ac','1','-ar','24000','-b:a','64k',target],{windowsHide:true,encoding:'utf8'});
     if(result.status)throw Error('无法切分真人录音：'+entry.id+' '+result.stderr);
    }
    bytes=await fs.readFile(target);splitForms++;
   }else if(real&&(parsed.audioFormIndex!==undefined?(index===parsed.audioFormIndex||form.ipa===word.forms[parsed.audioFormIndex].ipa):(index===0||ipa.length===1&&word.pos!=='n.')))bytes=real;
   if(bytes){const hash=sha(bytes);audio.set(hash,bytes);form.audio='audio/'+hash+'.mp3';form.audioKey=hash;form.audioOrigin='textbook-human';}
   else {form.audioKey=spoken(displayForm(word,form))||spoken(spellingParts(word,form).answer);if(form.audioKey){form.audioOrigin=speech[sha(decodeURIComponent(form.audioKey.slice(4)))]?.origin==='synthesized'?'supplement-speech':'bundled-speech';fallbackForms++;}else silentForms++;}
  }
  const fr=row[6],zh=translations[fr];if(fr&&!zh)throw Error('例句翻译缺失：'+entry.id);
  if(fr){
   const fromBook=provenance['例句来源']==='教材OCR';
   word.forms[0].example={fr,zh,sourceKind:fromBook?'textbook':'companion',translationOrigin:'bundled',source:fromBook?`${input.book.title} · PDF p. ${provenance['例句PDF页']||provenance['PDF页']}`:provenance['例句来源']==='Inspire1词表复用'?'Inspire 1 · 词表例句':'词汇资料包 · Exemple complémentaire'};
   const recording=spoken(fr);if(recording)word.forms[0].example.audioKey=recording;
  }
  if(!lessons.has(lessonId))lessons.set(lessonId,{schemaVersion:1,book:input.book,lesson:{id:lessonId,title:'Lesson '+Number(lessonId.slice(1)),order:Number(lessonId.slice(1)),version:1},sourceFormat:'textbook-package',words:[]});
  const lesson=lessons.get(lessonId);word.order=lesson.words.length+1;lesson.words.push(word);
 }
 const library=[...lessons.values()].sort((a,b)=>a.lesson.order-b.lesson.order);applyMeaningCorrections({library});applyExampleAudioCorrections({library});
 const headingWords=applyHeadingSupplement(library,speech);
 for(const p of library){try{validateLesson(p);}catch(error){throw Error(input.book.title+' '+p.lesson.id+': '+error.message);}}
 const stats={lessons:library.length,words:library.reduce((sum,p)=>sum+p.words.length,0),headingWords,recordings:humanWords,splitForms,fallbackForms,silentForms,exampleRecordings:library.flatMap(p=>p.words).filter(w=>w.forms[0].example?.audioKey).length,missingHuman:library.flatMap(p=>p.words).filter(w=>!w.forms.some(f=>f.audioOrigin==='textbook-human')).map(w=>w.id),missing:library.flatMap(p=>p.words.flatMap(w=>w.forms.filter(f=>!f.audioKey).map(f=>({word:w.id,form:f.id,text:displayForm(w,f)}))))};
 const id=sha(JSON.stringify(library)+[...audio.keys()].join(''));
 const manifest={schema:1,id,bookId,library,audio:[...audio.keys()],stats};
 const files={'manifest.json':strToU8(JSON.stringify(manifest))};for(const [hash,bytes]of audio)files['audio/'+hash+'.bin']=bytes;
 await fs.writeFile(path.join(app,'src/static/content',bookId+'.zip'),zipSync(files,{level:6}));
 catalog.push({id:bookId,contentId:id,file:bookId+'.zip',lessons:stats.lessons,words:stats.words});
 console.log(input.book.title+': '+JSON.stringify(stats));
}
if(catalog.length){try{const previous=await import('../src/domain/content-books.js');for(const b of previous.ADDITIONAL_BUNDLED_BOOKS)if(b.id==='fos1')catalog.push(b);}catch{}}
if(catalog.length)await fs.writeFile(path.join(app,'src/domain/content-books.js'),'// Generated from the provided textbook packages.\nexport const ADDITIONAL_BUNDLED_BOOKS = '+JSON.stringify(catalog,null,2)+';\n');
