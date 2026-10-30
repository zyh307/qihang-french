import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import {zipSync,strToU8} from 'fflate';
import {normalizeXlsx,masterRowsToLesson,unpack} from '../src/domain/importer.js';
import {initialState,installLesson,normalize} from '../src/domain/learning.js';
import {wordAudioEntries,displayForm} from '../src/domain/word-display.js';
import {vocabularyCorrections} from '../src/domain/vocabulary-corrections.js';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const materials=path.resolve(app,'../词库/Inspire1');
if(!await fs.access(path.join(materials,'词库总表.xlsx')).then(()=>true,()=>false)){
  const destination=path.join(app,'src/static/content/inspire1.zip');
  if(await fs.access(destination).then(()=>true,()=>false)){
    console.log('保留本地已有词库；公开源码不包含教材资料。');process.exit(0);
  }
  const manifest={schema:1,id:'open-source-empty-v1',library:[],audio:[],stats:{lessons:0,words:0,recordings:0,exampleRecordings:0,missing:[]}};
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.writeFile(destination,zipSync({'manifest.json':strToU8(JSON.stringify(manifest))}));
  await fs.writeFile(path.join(app,'src/domain/content-version.js'),"export const BUNDLED_CONTENT_ID = 'open-source-empty-v1';\n");
  console.log('开源版无内置教材，可在设置中导入资料。');process.exit(0);
}
const workbook=new ExcelJS.Workbook();
await workbook.xlsx.load(normalizeXlsx(new Uint8Array(await fs.readFile(path.join(materials,'词库总表.xlsx')))));
const sheet=workbook.getWorksheet('词库总表');if(!sheet)throw new Error('缺少“词库总表”工作表');
const rows=Array.from({length:sheet.rowCount},(_,i)=>Array.from({length:10},(_,j)=>sheet.getRow(i+1).getCell(j+1).value));
const ids=[...new Set(rows.slice(1).map(row=>String(row[0]||'').trim()).filter(Boolean))].sort();
const files=unpack(new Uint8Array(await fs.readFile(path.join(materials,'词汇真人.zip'))));
const clipRoot=path.join(materials,'分声录音');
const clipPlan=JSON.parse(await fs.readFile(path.join(clipRoot,'audio-clips.json'),'utf8'));
for(const entry of clipPlan.entries)for(const clip of entry.forms){
  const file=path.resolve(clipRoot,clip.file);
  if(!file.startsWith(clipRoot+path.sep))throw new Error('Invalid audio clip path');
  files['audio/'+path.basename(clip.file)]=new Uint8Array(await fs.readFile(file));
}
const exampleRoot=path.join(materials,'例句');
const correctionRoot=path.join(materials,'修订录音');
const correctionAudio=JSON.parse(await fs.readFile(path.join(correctionRoot,'recordings.json'),'utf8'));
for(const entry of correctionAudio.entries)files['audio/'+entry.file]=new Uint8Array(await fs.readFile(path.join(correctionRoot,entry.file)));
const exampleData=JSON.parse(await fs.readFile(path.join(exampleRoot,'examples.json'),'utf8'));
for(const correction of vocabularyCorrections){const entry=exampleData.entries.find(e=>e.lesson===correction.lesson&&e.number===correction.number);if(entry){entry.fr=correction.exampleFr;entry.zh=correction.exampleZh;}}
const exampleMetadata={schema:1,entries:exampleData.entries.map(entry=>({lesson:entry.lesson,number:entry.number,fr:entry.fr,zh:entry.zh,audio:path.basename(entry.file)}))};
files['examples.json']=strToU8(JSON.stringify(exampleMetadata));
for(const entry of exampleData.entries){
  if(!entry.zh)throw new Error('例句尚无翻译：'+entry.id);
  const file=path.resolve(exampleRoot,entry.file);if(!file.startsWith(exampleRoot+path.sep))throw new Error('Invalid example path');
  if(!correctionAudio.entries.some(e=>e.file===path.basename(entry.file)))files['audio/'+path.basename(entry.file)]=new Uint8Array(await fs.readFile(file));
}
const state=initialState([]),audio=new Map(),names=new Set(),sentenceNames=new Set(),missing=[];
for(const id of ids){
  const pkg=masterRowsToLesson(rows,{id,title:`Lesson ${Number(id.slice(1))}`,order:Number(id.slice(1)),version:1},files,state.library);
  for(const word of pkg.words){
    if(!word.forms[0].audio)missing.push(word.sourceAudio);
    const sourceEntry=correctionAudio.entries.find(entry=>entry.file===word.sourceAudio)||clipPlan.entries.find(entry=>entry.source===word.sourceAudio);
    for(const form of wordAudioEntries(word)){
      if(!form.audio)continue;
      const bytes=files[form.audio];
      if(!bytes?.length||!((bytes[0]===73&&bytes[1]===68&&bytes[2]===51)||(bytes[0]===255&&(bytes[1]&224)===224)))throw new Error('录音格式错误：'+form.audio);
      const hash=createHash('sha256').update(bytes).digest('hex');form.audioKey=hash;audio.set(hash,bytes);
      if(form.fr){sentenceNames.add(form.audio);form.translationOrigin='bundled';form.audioOrigin='bundled';}
      else{names.add(form.audio);if(sourceEntry){form.sourceAudioKey=sourceEntry.sourceSha256;form.audioOrigin='bundled';}}
    }
  }
  if(id==='L01'){
    const wanted=['Bonjour','Salut','Au revoir','Bonsoir','un cahier','une chaise','un crayon','un livre','un ordinateur','un smartphone','un stylo','une table','un tableau','une tablette'];
    pkg.words=wanted.map((text,index)=>{const word=pkg.words.find(w=>w.forms.some(f=>normalize(displayForm(w,f))===normalize(text)));if(!word)throw new Error('Lesson 1 缺少词条：'+text);word.order=index+1;return word;});
    pkg.curriculumRevision=1;
  }
  installLesson(state,pkg);
}
const id=createHash('sha256').update(JSON.stringify(state.library)).update([...audio.keys()].join('')).digest('hex');
const manifest={schema:1,id,library:state.library,audio:[...audio.keys()],stats:{lessons:ids.length,words:state.library.reduce((sum,p)=>sum+p.words.length,0),recordings:names.size,exampleRecordings:sentenceNames.size,missing}};
const entries={'manifest.json':strToU8(JSON.stringify(manifest))};for(const [hash,bytes]of audio)entries[`audio/${hash}.bin`]=bytes;
await fs.mkdir(path.join(app,'src/static/content'),{recursive:true});
await fs.writeFile(path.join(app,'src/static/content/inspire1.zip'),zipSync(entries,{level:6}));
await fs.writeFile(path.join(app,'src/domain/content-version.js'),`// Generated from the formal Inspire 1 materials by build-content.mjs.\nexport const BUNDLED_CONTENT_ID = '${id}';\n`);
// This import archive contains the original recordings and the preferred
// per-form clips. The workbook still uses its existing simple audio filenames.
const importAudio={'examples.json':files['examples.json']};for(const name of [...names,...sentenceNames])importAudio[name]=files[name];
await fs.writeFile(path.join(materials,'词形录音.zip'),zipSync(importAudio,{level:6}));
console.log(`Inspire 1：${manifest.stats.lessons} 课，${manifest.stats.words} 词，${names.size} 段单词录音，${sentenceNames.size} 段例句录音。`);
