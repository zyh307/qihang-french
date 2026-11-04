import {primaryMeaningOptions} from './meanings.js';
import {day,wordKey,packageKey,getProgress,normalize,advance,reviewPackage,lessonStats,resetLessonProgress,wordContext} from './learning.js';
import {displayForm,splitNounArticle} from './word-display.js';
export const spokenKey=text=>'tts:'+encodeURIComponent(text);
export const splitWords=text=>[...new Set(String(text).normalize('NFC').split(/[,，\n;；]+/).map(v=>v.trim().replace(/\s+/g,' ')).filter(Boolean))];
const exact=text=>String(text).normalize('NFC').replaceAll('’',"'").trim().replace(/\s+/g,' ');
const importNormal=text=>normalize(text).replaceAll('œ','oe').replaceAll('æ','ae');
const bare=text=>{const value=exact(text),p=splitNounArticle(value);return p.answer&&/^(?:un|une|des|du|le|la|les|de la|de l['’]|l['’])$/i.test(p.prefix)?p.answer:value;};
function distance(a,b,limit=2){if(Math.abs(a.length-b.length)>limit)return limit+1;let older,prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const curr=[i];for(let j=1;j<=b.length;j++){curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]!==b[j-1]));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])curr[j]=Math.min(curr[j],older[j-2]+1);}if(Math.min(...curr)>limit)return limit+1;older=prev;prev=curr;}return prev[b.length];}
export function makeLookup(entries,library=[]){
 const dictionary=new Map(entries.map(e=>[exact(e.word).toLocaleLowerCase('fr'),e]));
 const rows=[...library.flatMap(p=>p.words.flatMap(w=>w.forms.map(f=>{const entry=dictionary.get(exact(bare(displayForm(w,f))).toLocaleLowerCase('fr'));return {...entry,word:displayForm(w,f),id:'existing:'+wordKey(p,w)+':'+f.id,existing:{lesson:packageKey(p),word:w.id},meanings:w.meanings,pos:w.pos,ipa:f.ipa||entry?.ipa||'',example:f.example?.fr?f.example:entry?.example,gender:f.gender||entry?.gender||null};}))),...entries];
 const byExact=new Map(),byNormal=new Map(),byAlias=new Map(),byAliasNormal=new Map();
 for(const r of rows){const k=exact(r.word),n=importNormal(k);if(!byExact.has(k))byExact.set(k,[]);byExact.get(k).push(r);if(!byNormal.has(n))byNormal.set(n,[]);byNormal.get(n).push(r);}
 for(const r of rows)for(const alias of r.aliases||[]){const k=exact(alias),n=importNormal(k);if(!byAlias.has(k))byAlias.set(k,[]);byAlias.get(k).push(r);if(!byAliasNormal.has(n))byAliasNormal.set(n,[]);byAliasNormal.get(n).push(r);}
 const unique=items=>{const m=new Map();for(const r of items)if(!m.has(exact(r.word)))m.set(exact(r.word),r);return [...m.values()];};
 return input=>{const key=exact(input),plain=bare(key);let found=byExact.get(key),kind='exact';if(!found){found=byExact.get(plain);kind='article';}if(!found){found=byAlias.get(key);kind='alias';}if(!found){found=byNormal.get(importNormal(key))||byNormal.get(importNormal(plain))||byAliasNormal.get(importNormal(key));kind='fuzzy';}if(!found){const n=importNormal(plain),hits=[];let min=3;for(const [candidate,items] of byNormal){if(candidate[0]!==n[0]||Math.abs(candidate.length-n.length)>2)continue;const d=distance(n,candidate,2);if(d<min){min=d;hits.length=0;}if(d===min&&d<=2)hits.push(...items);}found=hits;kind='typo';}const options=unique(found||[]).sort((a,b)=>(b.frequency||0)-(a.frequency||0)).slice(0,6);return {input,kind,options,selected:options.length===1?options[0].id:'',missing:!options.length};};
}
export function importedEntries(data){return data.library.flatMap(p=>p.words.filter(w=>!w.conjugation&&data.importedWords?.[wordKey(p,w)]).map(w=>({p,w,imported:data.importedWords[wordKey(p,w)]}))).sort((a,b)=>Number(getProgress(data,a.p,a.w).notebook!=='practice')-Number(getProgress(data,b.p,b.w).notebook!=='practice')||b.imported.at-a.imported.at);}
export const IMPORTED_LESSON_SIZE=30;
const importedLessonId=sequence=>'L'+String(Math.floor((sequence-1)/IMPORTED_LESSON_SIZE)+1).padStart(2,'0');
const locationKey=value=>exact(value).toLocaleLowerCase('fr');
export function makeImportLocationLookup(data){
 const index=new Map();
 for(const p of data.library)for(const w of p.words){
  if(w.conjugation)continue;
  const key=wordKey(p,w),locations=[];
  if(p.book.id!=='personal')locations.push({zh:p.book.title.split(' · ')[0]+' · '+p.lesson.id,fr:p.book.title.split(' · ')[0]+' · '+p.lesson.id});
  const sequence=data.importedWordOrder?.[key];
  if(data.importedWords?.[key]&&Number.isSafeInteger(sequence)&&sequence>0){const lesson=importedLessonId(sequence);locations.unshift({zh:'导入本 · '+lesson,fr:'Importés · '+lesson});}
  if(!locations.length)continue;
  const item={key,word:w.forms.map(f=>displayForm(w,f)).join(' / '),pos:w.sourcePos||w.pos,locations};
  const names=new Set(w.forms.map(f=>locationKey(w.lexiconWord||bare(displayForm(w,f)))));
  for(const name of names){if(!index.has(name))index.set(name,[]);index.get(name).push(item);}
 }
 return entry=>index.get(locationKey(bare(entry.word)))||[];
}
export function importedWordResults(data,result){
 const added=new Set(result.addedKeys||[]),rows=new Map();
 for(const entry of result.resolved||[]){
  const p=data.library.find(p=>packageKey(p)===entry.lesson),w=p?.words.find(w=>w.id===entry.word);if(!w)continue;
  const key=wordKey(p,w),sequence=data.importedWordOrder?.[key];
  if(!data.importedWords?.[key]||!Number.isSafeInteger(sequence)||sequence<1)continue;
  rows.set(key,{key,word:w.forms.map(f=>displayForm(w,f)).join(' / '),lesson:importedLessonId(sequence),added:added.has(key)});
 }
 return [...rows.values()];
}
export function syncImportedProgress(data){
 for(const {p,w}of importedEntries(data)){
  const r=data.progress[wordKey(p,w)],forms=w.forms.filter(f=>f.tested);
  if(!r||r.notebook!=='practice'||!forms.length||!forms.every(f=>/^\d{4}-\d{2}-\d{2}$/.test(r.forms?.[f.id]?.learnedAt||'')))continue;
  r.notebook=forms.every(f=>r.forms[f.id].known)?'known':'review';
  r.learnedAt ||= forms.map(f=>r.forms[f.id].learnedAt).sort().at(-1);
  r.firstStudiedAt ||= r.learnedAt;
 }
}
// Assign permanent slots without moving the source words or their progress keys.
export function ensureImportedLessons(data){
 syncImportedProgress(data);
 data.importedWordOrder||={};let serial=Math.max(0,Number(data.importedWordSerial)||0,...Object.values(data.importedWordOrder).filter(Number.isSafeInteger));
 const order=new Map(Object.keys(data.importedWords||{}).map((key,i)=>[key,i]));
 const entries=importedEntries(data).sort((a,b)=>a.imported.at-b.imported.at||order.get(wordKey(a.p,a.w))-order.get(wordKey(b.p,b.w)));
 for(const e of entries){const key=wordKey(e.p,e.w);if(!Number.isSafeInteger(data.importedWordOrder[key])||data.importedWordOrder[key]<1)data.importedWordOrder[key]=++serial;}
 data.importedWordSerial=serial;
 const lessons=importedLessons(data);data.lessonCompletions||={};
 if(data.importedRecitationIds?.length&&!data.importedRecitationLesson){const lesson=lessons.find(p=>p.words.some(w=>w.id===data.importedRecitationIds[0]));if(lesson)data.importedRecitationLesson=packageKey(lesson);}
 for(const p of lessons){const key=packageKey(p);if(lessonStats(data,p).practice===0)data.lessonCompletions[key]||=day();else delete data.lessonCompletions[key];}
 for(const s of Object.values(data.sessions||{}))if(s.importedPractice&&!s.importedLessonKey){const id=s.group?.[0],lesson=lessons.find(p=>p.words.some(w=>w.id===id||w.origin.wordId===id&&w.origin.lessonKey===s.lessonKey));if(lesson)s.importedLessonKey=packageKey(lesson);}
 return lessons;
}
export function importedLessons(data){
 const groups=new Map();
 for(const p of data.library){const byBase=new Map();for(const card of p.words)if(card.conjugation){const base=card.conjugation.baseWordId;if(!byBase.has(base))byBase.set(base,[]);byBase.get(base).push(card);}
 for(const w of p.words){const key=wordKey(p,w),sequence=data.importedWordOrder?.[key];if(w.conjugation||!data.importedWords?.[key]||!Number.isSafeInteger(sequence)||sequence<1)continue;
  const number=Math.floor((sequence-1)/IMPORTED_LESSON_SIZE)+1;
  if(!groups.has(number))groups.set(number,{reviewPool:true,importedLesson:true,book:{id:'imported',title:'导入本 · Mots importés'},lesson:{id:'L'+String(number).padStart(2,'0'),title:'导入词汇 · Mots importés',order:number,version:1},words:[]});
  groups.get(number).words.push({...w,id:key,order:sequence,origin:{progressKey:key,lessonKey:packageKey(p),wordId:w.id,bookId:p.book.id}});
  const cards=byBase.get(w.id)||[];
  for(const [i,card]of cards.entries()){const id=wordKey(p,card);groups.get(number).words.push({...card,id,order:sequence+(i+1)/100,conjugation:{...card.conjugation,baseWordId:key},origin:{progressKey:id,lessonKey:packageKey(p),wordId:card.id,bookId:p.book.id}});}
 }}
 return [...groups.values()].sort((a,b)=>a.lesson.order-b.lesson.order).map(p=>({...p,words:p.words.sort((a,b)=>a.order-b.order)}));
}
export function resetImportedLesson(data,p){
 resetLessonProgress(data,p);
 const ids=new Set(p.words.map(w=>w.id));
 for(const [key,s]of Object.entries(data.sessions))if(s.importedPractice&&(s.importedLessonKey===packageKey(p)||s.group?.some(id=>ids.has(id)))){delete data.sessions[key];if(data.activeSessions?.[s.lessonKey]===key)delete data.activeSessions[s.lessonKey];if(data.lastPractice?.sessionKey===key)delete data.lastPractice;}
 for(const id of ids)delete data.directProgress?.[id];
}
export function addImportedEntries(data,entries,at=Date.now(),addToImported=true){
 ensureImportedLessons(data);
 data.importedWords||={};let added=0,duplicates=0;const resolved=[],addedKeys=[];const date=day(new Date(at));let personal=data.library.find(p=>p.book.id==='personal');
 const wordIndex=new Map(),newIds=[];for(const p of data.library)for(const w of p.words)for(const f of w.forms){const key=exact(w.lexiconWord||(w.pos==='n.'?bare(displayForm(w,f)):displayForm(w,f))).toLocaleLowerCase('fr');if(!wordIndex.has(key))wordIndex.set(key,{p,w});}
 const used=new Set([...(data.reservedWordIds||[]),...data.library.flatMap(p=>p.words.map(w=>w.id)),...Object.keys(data.progress).map(k=>k.split(':').at(-1))]);let counter=800000;
 for(const entry of entries){
  let p,w;
  if(entry.existing){p=data.library.find(p=>packageKey(p)===entry.existing.lesson);w=p?.words.find(w=>w.id===entry.existing.word);}
  if(!w){const match=wordIndex.get(exact(entry.word).toLocaleLowerCase('fr'));if(match){p=match.p;w=match.w;}}
  if(!w){
   if(!personal){personal={schemaVersion:1,book:{id:'personal',title:'导入词汇 · Mots importés'},lesson:{id:'L01',title:'导入词汇 · Mots importés',order:1,version:1},words:[]};data.library.push(personal);}p=personal;
   while(used.has('w'+String(counter).padStart(6,'0')))counter++;if(counter>999999)throw Error('词条空间不足 / Limite atteinte.');const id='w'+counter++;used.add(id);
   const gender=entry.gender||null,pos=entry.pos==='n.'&&!gender?'loc.':entry.pos||'loc.';
   const text=pos==='n.'&&entry.plural?'des '+entry.word:entry.word,spoken=pos==='n.'&&!splitNounArticle(text).prefix?(gender==='f'?'une ':'un ')+text:text;
   const example=entry.example?.fr?{...entry.example,audioKey:spokenKey(entry.example.fr)}:undefined;
   const form={id:id+'-base',text,tested:true,gender,audio:null,audioKey:spokenKey(spoken),ipa:entry.ipa||'',source:'Wiktionary · '+entry.word+' · CC BY-SA 4.0'+(example?.source?' / '+example.source:'')};if(example)form.example=example;if(entry.literal||pos!=='n.'&&splitNounArticle(text).prefix)form.literal=true;
   w={id,lexiconId:entry.id,lexiconWord:entry.word,provenance:{dictionary:entry.sourceUrl||'https://zh.wiktionary.org/',license:'CC BY-SA 4.0',sentence:entry.example?.url||entry.sourceUrl||'',sentenceSource:entry.example?.source||'',authored:!!entry.example?.authored},order:p.words.length+1,pos,sourcePos:entry.pos||pos,meanings:entry.meanings,primaryMeaning:entry.primaryMeaning,forms:[form]};p.words.push(w);p.lesson.version++;newIds.push(id);wordIndex.set(exact(entry.word).toLocaleLowerCase('fr'),{p,w});
  }
  for(const f of w.forms){
   const same=exact(w.lexiconWord||bare(displayForm(w,f))).toLocaleLowerCase('fr')===exact(entry.existing?bare(entry.word):entry.word).toLocaleLowerCase('fr');
   if(!f.audioKey)f.audioKey=spokenKey(displayForm(w,f));
   if(same&&!f.ipa&&entry.ipa)f.ipa=entry.ipa;
   if(same&&!f.example?.fr&&entry.example?.fr)f.example={...entry.example};
   if(f.example?.fr&&!f.example.audioKey)f.example.audioKey=spokenKey(f.example.fr);
  }
  if(entry.conjugationPlan)w.conjugationPlan=JSON.parse(JSON.stringify(entry.conjugationPlan));
  const key=wordKey(p,w);resolved.push({lesson:packageKey(p),word:w.id});if(addToImported){if(data.importedWords[key])duplicates++;else{data.importedWords[key]={at,date};if(!data.importedWordOrder[key])data.importedWordOrder[key]=++data.importedWordSerial;added++;addedKeys.push(key);}}
 }
 if(newIds.length)data.reservedWordIds=[...new Set([...(data.reservedWordIds||[]),...newIds])];return {added,duplicates,resolved,addedKeys};
}
export function removeImportedEntry(data,p,w){
 delete data.importedWords?.[wordKey(p,w)];
 for(const s of Object.values(data.sessions).filter(s=>s.importedPractice&&(s.lessonKey===packageKey(p)||s.lessonKey==='review:all')&&s.phase!=='done')){
  const id=s.lessonKey==='review:all'?wordKey(p,w):w.id,engine=s.lessonKey==='review:all'?reviewPackage(data):p;
  const active=s.question?.wordId===id||s.feedback?.wordId===id,present=s.pending.includes(id)||s.group.includes(id);
  s.pending=s.pending.filter(v=>v!==id);s.group=s.group.filter(v=>v!==id);s.jobs=s.jobs.filter(j=>j.wordId!==id);s.doneWords=s.doneWords.filter(v=>v!==id);s.total=s.group.length;if(present)s.progressTotal=Math.max(0,(s.progressTotal||0)-1);
  if(active){s.question=null;s.feedback=null;advance(data,engine,day(),s.key);}else if(!s.jobs.length&&!s.feedback)s.phase='done';
 }
}

export function activeImportedSession(data,lessonKey=null){return Object.values(data.sessions).find(s=>s.importedPractice&&(!lessonKey||s.importedLessonKey===lessonKey)&&s.phase!=='done'&&(s.jobs?.length||s.group?.some(id=>!s.doneWords?.includes(id))));}

export function dictionaryEntry(row){const gender=row.gender||null,pos=row.pos==='n.'&&!gender?'loc.':row.pos;let text=pos==='n.'&&row.plural?'des '+row.word:row.word;const spoken=pos==='n.'&&!splitNounArticle(text).prefix?(gender==='f'?'une ':'un ')+text:text;return {id:row.id,lexiconId:row.id,lexiconWord:row.word,order:1,pos,sourcePos:row.pos,meanings:row.meanings,primaryMeaning:row.primaryMeaning,forms:[{id:row.id+'-base',text,gender,tested:true,literal:!!row.literal||pos!=='n.'&&!!splitNounArticle(text).prefix,ipa:row.ipa,audio:null,audioKey:spokenKey(spoken),example:row.example?{...row.example,audioKey:spokenKey(row.example.fr)}:undefined}]};}
export function dictionaryNotebookEntries(rows,data){
 const existing=new Map(),seen=new Set(),result=[];for(const p of data.library)for(const w of p.words){if(w.conjugation)continue;for(const f of w.forms){const name=exact(w.lexiconWord||(w.pos==='n.'?bare(displayForm(w,f)):displayForm(w,f))).toLocaleLowerCase('fr');if(!existing.has(name))existing.set(name,{p,w});}}
 const p={dictionary:true,book:{id:'dictionary',title:'词库 · Dictionnaire'},lesson:{id:'all',title:'词库',order:1,version:1}};
 for(const row of rows){const entry=existing.get(exact(row.word).toLocaleLowerCase('fr'));if(entry){const key=wordKey(entry.p,entry.w);if(!seen.has(key)){result.push(entry);seen.add(key);}}else result.push({p,w:dictionaryEntry(row),dictionaryRow:row});}
 for(const course of data.library)for(const w of course.words){const key=wordKey(course,w);if(!w.conjugation&&!seen.has(key)){result.push({p:course,w});seen.add(key);}}return result;
}
export function resolveDictionaryEntry(data,entry){if(!entry.p.dictionary)return entry;const result=addImportedEntries(data,[entry.dictionaryRow],Date.now(),false).resolved[0],p=data.library.find(p=>packageKey(p)===result.lesson);return {p,w:p.words.find(w=>w.id===result.word)};}

// Import membership reuses the original word and its progress key.
export function addToImportedBook(data,entry,at=Date.now()){
 const resolved=resolveDictionaryEntry(data,entry),source=wordContext(data,resolved.p,resolved.w),{p,w}=source;
 if(w.conjugation)throw Error('请加入动词原形 / Ajoutez l’infinitif.');
 ensureImportedLessons(data);data.importedWords||={};
 const key=wordKey(p,w);
 if(!data.importedWords[key]){
  data.importedWords[key]={at,date:day(new Date(at))};
  if(!data.importedWordOrder[key])data.importedWordOrder[key]=++data.importedWordSerial;
 }
 ensureImportedLessons(data);
 return {...entry,p,w};
}

export function importedLessonIds(data,resolved){
 const numbers=new Set();
 for(const {lesson,word} of resolved||[]){
  const key=lesson+':'+word,sequence=data.importedWordOrder?.[key];
  if(data.importedWords?.[key]&&Number.isSafeInteger(sequence)&&sequence>0)numbers.add(Math.floor((sequence-1)/IMPORTED_LESSON_SIZE)+1);
 }
 return [...numbers].sort((a,b)=>a-b).map(n=>'L'+String(n).padStart(2,'0'));
}

export function setWordPrimaryMeaning(data,entry,meaning){
 const resolved=resolveDictionaryEntry(data,entry),source=wordContext(data,resolved.p,resolved.w);
 if(!primaryMeaningOptions(source.w).includes(meaning))throw Error('请选择已有释义 / Choisissez un sens existant.');
 source.w.primaryMeaning=meaning;source.w.primaryMeaningChosen=true;
 return {...entry,...source};
}
