import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';import {zipSync,strToU8} from 'fflate';import {validateLesson} from '../src/domain/importer.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),material=path.resolve(root,'../词库/FOS1'),sha=b=>createHash('sha256').update(b).digest('hex');
if(!await fs.access(path.join(material,'book-source.json')).then(()=>true,()=>false)){await fs.access(path.join(root,'src/static/content/fos1.zip'));console.log('保留已有 FOS 1 内置资料。');process.exit(0);}
const input=JSON.parse(await fs.readFile(path.join(material,'book-source.json'),'utf8')),recordings=JSON.parse(await fs.readFile(path.join(material,'录音/recordings.json'),'utf8'));
const previousDictionary=JSON.parse(await fs.readFile(path.join(root,'src/static/lexicon/french.json'),'utf8')).entries;
const bare=t=>t.normalize('NFC').toLocaleLowerCase('fr').replaceAll('’',"'").replace(/^(?:un|une|le|la|les|des)\s+|^l['’]/iu,'');
const library=[],audio=new Map(),indexPath=path.join(root,'src/static/lexicon/audio/index.json'),index=JSON.parse(await fs.readFile(indexPath,'utf8'));
async function recording(text){const entry=recordings[text];if(!entry)throw Error('FOS 1 录音缺失：'+text);const bytes=await fs.readFile(path.join(material,'录音',entry.file)),hash=sha(bytes);if(entry.file!==hash+'.mp3'||bytes.length<1000)throw Error('FOS 1 音频不完整');audio.set(hash,bytes);index.entries[sha(text)]={file:hash+'.mp3',start:0,end:entry.duration,full:true};return hash;}
for(let lesson=1;lesson<=6;lesson++){
 const p={schemaVersion:1,book:input.book,lesson:{id:'L'+String(lesson).padStart(2,'0'),title:'Lesson '+lesson,order:lesson,version:1},bundled:true,words:[]};
 for(const e of input.entries.filter(e=>e.lesson===lesson)){
  const source=`FOS 1 · ${p.lesson.id}`;
  const example={fr:e.fr,zh:e.zh,meaning:e.meaning,sourceKind:e.exampleSource==='textbook'?'textbook':'companion',source:source+(e.exampleSource==='textbook'?'':' · 配套例句'),audioKey:await recording(e.fr),audioOrigin:'fos-synthetic',translationOrigin:'fos'};
  const forms=[];
  for(const [i,f]of e.preparedForms.entries())forms.push({id:e.id+'-'+(i?'v'+(i+1):'base'),text:f.text,gender:f.gender,tested:!(e.word==='gradué(e)'&&i===1),audio:null,audioKey:await recording(f.text),audioOrigin:'fos-synthetic',ipa:f.ipa,source,example:{...example},...(f.meaning?{meaning:f.meaning}:{}),...(e.pos!=='n.'?{literal:true}:{})});
  p.words.push({id:e.id,order:p.words.length+1,audioNumber:String(p.words.length+1).padStart(3,'0'),sourceText:e.word,sourcePos:e.sourcePos,pos:e.pos,meanings:[...new Set([...e.meanings,...previousDictionary.filter(row=>e.preparedForms.some(f=>bare(f.text)===bare(row.word))).flatMap(row=>row.meanings)])],primaryMeaning:e.meaning,curriculumAuthority:{book:'fos1',lesson:p.lesson.id,page:e.page},fosAuthority:{revision:input.revision,source},forms,...(e.notation?{notation:e.notation}:{}),...(e.translationSource?{translationSource:e.translationSource}:{})});
 }
 validateLesson(p);library.push(p);
}
const id=sha(JSON.stringify(library)+[...audio.keys()].join('')),stats={lessons:6,words:library.reduce((s,p)=>s+p.words.length,0),recordings:audio.size};
const bundle={schema:1,id,bookId:'fos1',library,audio:[...audio.keys()],stats},files={'manifest.json':strToU8(JSON.stringify(bundle))};for(const [key,bytes]of audio)files['audio/'+key+'.bin']=bytes;
await fs.writeFile(path.join(root,'src/static/content/fos1.zip'),zipSync(files,{level:6}));
await fs.writeFile(path.join(root,'src/lexicon/fos1-content.json'),JSON.stringify({revision:input.revision,library},null,2));
const catalogFile=path.join(root,'src/domain/content-books.js'),old=(await import(pathToFileURL(catalogFile).href+'?'+Date.now())).ADDITIONAL_BUNDLED_BOOKS.filter(b=>b.id!=='fos1');old.push({id:'fos1',contentId:id,file:'fos1.zip',...stats});await fs.writeFile(catalogFile,'export const ADDITIONAL_BUNDLED_BOOKS = '+JSON.stringify(old,null,2)+';\n');
for(const [hash,bytes]of audio){for(const dir of ['src/static/lexicon/audio','src/static/lexicon/audio-updates']){await fs.mkdir(path.join(root,dir),{recursive:true});await fs.writeFile(path.join(root,dir,hash+'.mp3'),bytes);}}
await fs.writeFile(indexPath,JSON.stringify(index));const names=new Set(Object.values(index.entries).map(e=>e.file));let size=0;for(const name of names)size+=(await fs.stat(path.join(root,'src/static/lexicon/audio',name))).size;
const metaFile=path.join(root,'src/static/lexicon/manifest.json'),meta=JSON.parse(await fs.readFile(metaFile,'utf8'));meta.audio={...meta.audio,clips:Object.keys(index.entries).length,files:names.size,bytes:size,indexSHA256:sha(await fs.readFile(indexPath))};await fs.writeFile(metaFile,JSON.stringify(meta,null,2)+'\n');
console.log('FOS 1 ready: '+JSON.stringify(stats));
