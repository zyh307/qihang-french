import {vocabularyIdentity,logicalVocabularyKey,preferVocabularyEntry,uniqueVocabularyEntries,textbookPackage} from './vocabulary-identity.js';
import {primaryMeaning,primaryMeaningOptions} from './meanings.js';
import {runCooperatively} from '../platform/ui-work.js';
import {clone,day,wordKey,packageKey,getProgress,normalize,advance,reviewPackage,lessonStats,resetLessonProgress,wordContext,appendLearningWords,testedForms,lessonWithAdditions} from './learning.js';
import {displayForm,preferredNounAudio,splitNounArticle} from './word-display.js';
import {applyFormRelations} from './form-relations.js';
import {isSupportedLemma,sourceVerbEntries,recording,normalizePlan,isConjugationVerb,conjugations,lemmaFor} from '../conjugation/catalog.js';
import {sourceOrderedLibrary,lessonSourceLabel} from './word-source.js';
import {applyDictionaryReadings,applyReviewedReading,grammaticalKind,reviewedReading,readingSpellings} from './word-readings.js';
export const needsConjugationChoice=entry=>/^(v\.|v$|verb)/i.test(entry?.pos||'')&&isSupportedLemma(String(entry.word).normalize('NFC').trim().toLocaleLowerCase('fr'));
function withSourceVerbs(entries){
 entries=applyDictionaryReadings(entries);
 const source=new Map(sourceVerbEntries().map(e=>[e.word,e])),names=new Set();
 const rows=entries.map(entry=>{const name=exact(entry.word).toLocaleLowerCase('fr');names.add(name);const verb=source.get(name);return verb&&!/^(v\.|v$|verb)/i.test(entry.pos)?{...entry,pos:'v.',meanings:verb.meanings}:entry;});
 return [...rows,...[...source.values()].filter(e=>!names.has(e.word))];
}
export const spokenKey=text=>'tts:'+encodeURIComponent(text);
export const splitWords=text=>[...new Set(String(text).normalize('NFC').split(/[,，\n;；]+/).map(v=>v.trim().replace(/\s+/g,' ')).filter(Boolean))];
const exact=text=>String(text).normalize('NFC').replaceAll('’',"'").trim().replace(/\s+/g,' ');
const importNormal=text=>normalize(text).replaceAll('œ','oe').replaceAll('æ','ae');
const bare=text=>{const value=exact(text),p=splitNounArticle(value);return p.answer&&/^(?:un|une|des|du|le|la|les|de la|de l['’]|l['’])$/i.test(p.prefix)?p.answer:value;};
function distance(a,b,limit=2){if(Math.abs(a.length-b.length)>limit)return limit+1;let older,prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const curr=[i];for(let j=1;j<=b.length;j++){curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]!==b[j-1]));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])curr[j]=Math.min(curr[j],older[j-2]+1);}if(Math.min(...curr)>limit)return limit+1;older=prev;prev=curr;}return prev[b.length];}
function* makeLookupSteps(entries,library=[]){
 entries=withSourceVerbs(entries);
 const dictionary=new Map();for(const entry of entries)for(const name of readingSpellings(entry)){if(!dictionary.has(name))dictionary.set(name,[]);dictionary.get(name).push(entry);}
 const courseRows=sourceOrderedLibrary(library).flatMap(p=>p.words.flatMap(w=>{
  const reading=reviewedReading(w);
  return w.forms.map(f=>{
   const word=displayForm(w,f),name=exact(bare(word)).toLocaleLowerCase('fr');
   const entry=dictionary.get(name)?.find(row=>grammaticalKind(row.pos)===grammaticalKind(w.pos)&&row.lexicalReading===reading?.id);
   return {...entry,lexicalReading:reading?.id,word,id:'existing:'+wordKey(p,w)+':'+f.id,existing:{lesson:packageKey(p),word:w.id},meanings:w.meanings,pos:w.pos,ipa:f.ipa||entry?.ipa||'',example:f.example?.fr?f.example:entry?.example,gender:f.gender||entry?.gender||null};
  });
 }));
 const rows=[...courseRows,...entries];
 const byExact=new Map(),byNormal=new Map(),byAlias=new Map(),byAliasNormal=new Map();let work=0;
 // Course words retain their written articles. Index both the display form
 // and its bare noun so an existing un condiment also matches condiment.
 for(const r of rows){for(const k of new Set([exact(r.word),exact(bare(r.word))])){const n=importNormal(k);if(!byExact.has(k))byExact.set(k,[]);byExact.get(k).push(r);if(!byNormal.has(n))byNormal.set(n,[]);byNormal.get(n).push(r);}if(++work%64===0)yield;}
 for(const r of rows)for(const alias of r.aliases||[]){const k=exact(alias),n=importNormal(k);if(!byAlias.has(k))byAlias.set(k,[]);byAlias.get(k).push(r);if(!byAliasNormal.has(n))byAliasNormal.set(n,[]);byAliasNormal.get(n).push(r);if(++work%64===0)yield;}
 const unique=items=>{
  const m=new Map(),existing=items.filter(r=>r.existing),kind=r=>String(r.pos||'').split(/[.\s]/u)[0];
  for(const r of items){
   // A generic dictionary row without gender is not an extra choice beside
   // the fully described course word. Distinct genders/kinds still differ.
   if(!r.existing&&existing.some(e=>locationKey(bare(e.word))===locationKey(bare(r.word))&&kind(e)===kind(r)&&e.lexicalReading===r.lexicalReading&&(!r.gender||!e.gender||r.gender===e.gender)))continue;
   const key=vocabularyIdentity(r)||exact(r.word),old=m.get(key);if(!old||r.existing&&!old.existing||!r.existing&&!old.existing&&reviewedReading(r)?.word===r.word&&reviewedReading(old)?.word!==old.word)m.set(key,r);
  }
  return [...m.values()];
 };
 return (input,{allowTypos=true}={})=>{const key=exact(input),plain=bare(key);let found=byExact.get(key),kind='exact';if(!found){found=byExact.get(plain);kind='article';}const aliases=[...(byAlias.get(key)||[]),...(plain===key?[]:byAlias.get(plain)||[])];if(aliases.length){if(!found)kind='alias';found=[...(found||[]),...aliases];}if(!found){found=byNormal.get(importNormal(key))||byNormal.get(importNormal(plain))||byAliasNormal.get(importNormal(key));kind='fuzzy';}if(!found&&allowTypos){const n=importNormal(plain),hits=[];let min=3;for(const [candidate,items] of byNormal){if(candidate[0]!==n[0]||Math.abs(candidate.length-n.length)>2)continue;const d=distance(n,candidate,2);if(d<min){min=d;hits.length=0;}if(d===min&&d<=2)hits.push(...items);}found=hits;kind='typo';}
  const options=unique(found||[]).sort((a,b)=>(b.frequency||0)-(a.frequency||0)).slice(0,6);
  const reviewedNames=options.map(reviewedReading).filter(Boolean).map(row=>row.word);
  return {input,kind,options,requiresPartOfSpeech:new Set(options.map(row=>grammaticalKind(row.pos))).size>1,requiresSense:new Set(reviewedNames).size<reviewedNames.length,selected:options.length===1?options[0].id:'',missing:!options.length};
 };
}
export function makeLookup(entries,library=[]){const steps=makeLookupSteps(entries,library);let next;do{next=steps.next();}while(!next.done);return next.value;}
export const makeLookupAsync=(entries,library=[],options)=>runCooperatively(makeLookupSteps(entries,library),options);
export function resolveImportInput(lookup,input){
 const row=lookup(input);if(!row.missing)return [row];
 const parts=String(input).trim().split(/\s+/u).filter(Boolean);
 return parts.length>1?[...new Set(parts)].map(part=>({...lookup(part),phrase:input})): [row];
}
export const importBookTitle=book=>'导入本 · Mots importés';
const importFields=()=>['importedWords','importedWordOrder','importedWordSerial','importedLessonCatalog'];
export function importedUnitScope(data,p,w,book='imported'){
 if(!p||!w)return {infinitive:false,tenses:[]};
 const [members]=importFields(book),record=data[members]?.[wordKey(p,w)];if(!record)return {infinitive:false,tenses:[]};
 return record.units?{infinitive:record.units.infinitive===true,tenses:[...normalizePlan(record.units).tenses]}:{infinitive:!isConjugationVerb(w)||normalizePlan(w.conjugationPlan).infinitive,tenses:isConjugationVerb(w)?[...normalizePlan(w.conjugationPlan).tenses]:[]};
}
const memberLessons=(record,sequence)=>record?.lessonIds?.length?record.lessonIds:[record?.lessonId||importedLessonId(sequence)];
function rawImportedEntries(data){return data.library.flatMap(p=>p.words.filter(w=>!w.conjugation&&data.importedWords?.[wordKey(p,w)]).map(w=>({p,w,imported:data.importedWords[wordKey(p,w)]})));}
export function importedEntries(data,book='imported'){return uniqueVocabularyEntries(rawImportedEntries(data),data);}
export function createImportedLesson(data,book='imported'){
 ensureImportedLessons(data);
 const [,,,catalog]=importFields(book),counts=importedLessonOccupancy(data,book),empty=[...counts].sort((a,b)=>Number(a[0].slice(1))-Number(b[0].slice(1))).find(([,count])=>count===0);
 if(empty)throw Error('请先为 '+empty[0]+' 添加单词 / Ajoutez des mots à '+empty[0]+'.');
 const number=Math.max(0,...[...counts.keys()].map(id=>Number(id.slice(1))))+1;if(!Number.isSafeInteger(number))throw Error('课次编号无效 / Numéro invalide.');
 const id='L'+String(number).padStart(2,'0');data[catalog]||={};data[catalog][id]={id,order:number};return id;
}
// Keep legacy order-to-lesson mapping stable; new allocation is explicit.
export const IMPORTED_LESSON_SIZE=30;
export const AUTO_IMPORTED_LESSON_TARGET=25;
export function importedMembershipSize(word,record){
 const verb=isConjugationVerb(word),scope=record?.units||{infinitive:!verb||normalizePlan(word.conjugationPlan).infinitive,tenses:verb?normalizePlan(word.conjugationPlan).tenses:[]};
 return Number(scope.infinitive===true)+(verb?(scope.tenses||[]).filter(tense=>Object.keys(conjugations(lemmaFor(word),tense)).length).length:0);
}
function importedLessonOccupancy(data,book){
 const [members,orders,,catalog]=importFields(book),counts=new Map(Object.keys(data[catalog]||{}).map(id=>[id,0])),seen=new Set();
 for(const {p,w,imported}of rawImportedEntries(data))for(const id of memberLessons(imported,data[orders]?.[wordKey(p,w)])){const scope=importedUnitScope(data,p,w),units=[...(scope.infinitive?['infinitive']:[]),...scope.tenses];for(const unit of units){const key=id+'|'+logicalVocabularyKey(p,w)+'|'+unit;if(seen.has(key))continue;seen.add(key);counts.set(id,(counts.get(id)||0)+1);}}
 return counts;
}
export function createAutomaticImportAllocator(data,book='imported'){
 const [,,,catalog]=importFields(book),counts=importedLessonOccupancy(data,book);data[catalog]||={};
 return {
  adjust(ids,delta){if(delta)for(const id of ids)counts.set(id,(counts.get(id)||0)+delta);},
  take(size=1){
   if(!Number.isInteger(size)||size<1)throw Error('请选择原形或时态 / Choisissez un élément.');
   let id=[...counts].sort((a,b)=>Number(a[0].slice(1))-Number(b[0].slice(1))).find(([,count])=>count<AUTO_IMPORTED_LESSON_TARGET)?.[0];
   if(!id){const number=Math.max(0,...[...counts.keys()].map(value=>Number(value.slice(1))))+1;if(!Number.isSafeInteger(number))throw Error('课次编号无效 / Numéro invalide.');id='L'+String(number).padStart(2,'0');}
   data[catalog][id]||={id,order:Number(id.slice(1))};counts.set(id,(counts.get(id)||0)+size);return id;
  }
 };
}
const importedLessonId=sequence=>'L'+String(Math.floor((sequence-1)/IMPORTED_LESSON_SIZE)+1).padStart(2,'0');
const locationKey=value=>exact(value).toLocaleLowerCase('fr');
export const learnedNotebook=notebook=>notebook==='review'||notebook==='known';
export function makeLearnedImportLookup(data){
 const byKey=new Map(),byName=new Map(),name=value=>locationKey(bare(value)).replaceAll('œ','oe').replaceAll('æ','ae'),pos=value=>String(value||'').toLocaleLowerCase('fr').split(/[.\s]/)[0];
 for(const p of sourceOrderedLibrary(data.library||[]))for(const w of p.words){
  if(w.conjugation||!learnedNotebook(getProgress(data,p,w).notebook))continue;
  const item={p,w,notebook:getProgress(data,p,w).notebook};byKey.set(wordKey(p,w),item);
  for(const key of new Set([w.lexiconWord,...w.forms.map(f=>displayForm(w,f))].filter(Boolean).map(name))){if(!byName.has(key))byName.set(key,[]);byName.get(key).push(item);}
 }
 return entry=>{
  const source=entry.w?wordContext(data,entry.p,entry.w):null,w=source?.w,existing=entry.existing||(source?{lesson:packageKey(source.p),word:w.id}:null);
  const direct=existing&&byKey.get(existing.lesson+':'+existing.word);if(direct)return direct;
  const word=entry.word||w?.lexiconWord||(w?.forms?.length?displayForm(w,w.forms[0]):'');if(!word)return null;
  const part=pos(entry.pos||w?.pos),gender=entry.gender||w?.forms?.[0]?.gender;
  return (byName.get(name(word))||[]).find(item=>{
   const requested=reviewedReading(w||entry),existingReading=reviewedReading(item.w);
   if(requested&&existingReading&&requested.id!==existingReading.id)return false;
   if(part&&pos(item.w.pos)&&part!==pos(item.w.pos))return false;
   const genders=item.w.forms.filter(f=>f.tested).map(f=>f.gender).filter(Boolean);
   return part!=='n'||!gender||!genders.length||genders.includes(gender);
  })||null;
 };
}
// Retain the previous public name for existing integrations.
export const makeReviewImportLookup=makeLearnedImportLookup;
export function makeLearnedTenseLookup(data){
 const packages=new Map((data.library||[]).map(p=>[packageKey(p),p])),groups=new Map();
 for(const [key,cards]of Object.entries(data.conjugationDecks||{})){
  const p=packages.get(key);if(!p)continue;
  for(const card of cards){
   const c=card.conjugation;if(!c||conjugations(c.lemma,c.tense)[c.person]!==c.form)continue;
   const record=getProgress(data,p,card);if(!learnedNotebook(record.notebook)||record.pendingLearning)continue;
   const w=p.words.find(w=>w.id===c.baseWordId);if(!w)continue;
   const id=c.lemma+'|'+c.tense,people=groups.get(id)||new Map(),old=people.get(c.person);
   if(!old||record.notebook==='known')people.set(c.person,{p,w,notebook:record.notebook});groups.set(id,people);
  }
 }
 return (lemma,tense)=>{
  const people=groups.get(lemma+'|'+tense),required=Object.entries(conjugations(lemma,tense)).filter(([,form])=>form&&form!=='—').map(([person])=>person);
  if(!people||!required.length||!required.every(person=>people.has(person)))return null;
  return {...people.get(required[0]),notebook:required.every(person=>people.get(person).notebook==='known')?'known':'review'};
 };
}
export function makeImportLocationLookup(data){
 const index=new Map();
 for(const p of sourceOrderedLibrary(data.library))for(const w of p.words){
  if(w.conjugation)continue;
  const key=wordKey(p,w),locations=[];
  if(p.book.id!=='personal')locations.push({key:packageKey(p),zh:lessonSourceLabel(p),fr:lessonSourceLabel(p)});
  for(const book of ['imported']){const [members,orders]=importFields(book),record=data[members]?.[key];if(record){const ids=memberLessons(record,data[orders]?.[key]);for(const id of new Set(ids))locations.push({key:book+':'+id,zh:importBookTitle(book).split(' · ')[0]+' · '+id,fr:importBookTitle(book).split(' · ')[1]+' · '+id});}}
  if(!locations.length)continue;
  const item={p,w,locations,tenses:[...new Set((data.conjugationDecks?.[packageKey(p)]||[]).filter(card=>card.conjugation.baseWordId===w.id&&!card.studyDisabled).map(card=>card.conjugation.tense))]};
  const names=new Set([w.lexiconWord,...w.forms.map(f=>bare(displayForm(w,f)))].filter(Boolean).map(locationKey));
  for(const name of names){if(!index.has(name))index.set(name,[]);index.get(name).push(item);}
 }
 return entry=>{
  const name=locationKey(bare(entry.word)),part=String(entry.pos||'').split(/[.\s]/u)[0],groups=new Map(),reading=reviewedReading(entry);
  for(const item of index.get(name)||[]){
   const {p,w}=item;if(part&&String(w.pos||'').split(/[.\s]/u)[0]!==part)continue;
   const current=reviewedReading(w);if(reading&&current&&reading.id!==current.id)continue;
   const form=w.forms.find(f=>locationKey(bare(displayForm(w,f)))===name&&(!entry.gender||!f.gender||entry.gender===f.gender));if(!form)continue;
   const identity=vocabularyIdentity({...w,forms:[form]}),group=groups.get(identity)||{key:identity,preferred:item,locations:new Map(),tenses:new Set()};
   if(preferVocabularyEntry(item,group.preferred,data))group.preferred=item;
   for(const location of item.locations)group.locations.set(location.key,location);
   for(const tense of item.tenses)group.tenses.add(tense);
   groups.set(identity,group);
  }
  return [...groups.values()].map(group=>({key:group.key,word:group.preferred.w.forms.map(f=>displayForm(group.preferred.w,f)).join(' / '),pos:group.preferred.w.sourcePos||group.preferred.w.pos,locations:[...group.locations.values()],tenses:[...group.tenses]}));
 };
}
export function importedWordResults(data,result){
 const book=result.bookId||'imported',[members,orders]=importFields(book),added=new Set(result.addedKeys||[]);
 const rows=(result.resolved||[]).flatMap(entry=>{const p=data.library.find(p=>packageKey(p)===entry.lesson),w=p?.words.find(w=>w.id===entry.word);if(!w)return [];const key=wordKey(p,w),record=data[members]?.[key];return record?[{key,word:w.forms.map(f=>displayForm(w,f)).join(' / '),lesson:importBookTitle(book).split(' · ')[0]+' · '+memberLessons(record,data[orders][key]).join(' / '),added:added.has(key)}]:[];});
 for(const [kind,skipped]of [['review',result.skippedReview||[]],['known',result.skippedKnown||[]]])for(const entry of skipped){const p=data.library.find(p=>packageKey(p)===entry.lesson),w=p?.words.find(w=>w.id===entry.word);if(w)rows.push({key:wordKey(p,w)+':skip:'+entry.unit,word:w.forms.map(f=>displayForm(w,f)).join(' / ')+(entry.unit&&entry.unit!=='infinitive'?' · '+entry.unit:''),lesson:lessonSourceLabel(p),added:false,skipped:kind});}
 return rows;
}
export function syncImportedProgress(data){
 for(const {p,w}of importedEntries(data)){
  const r=data.progress[wordKey(p,w)],forms=testedForms(w);
  if(!r||r.notebook!=='practice'||!forms.length||!forms.every(f=>/^\d{4}-\d{2}-\d{2}$/.test(r.forms?.[f.id]?.learnedAt||'')))continue;
  r.notebook=forms.every(f=>r.forms[f.id].known)?'known':'review';delete r.pendingLearning;
  r.learnedAt ||= forms.map(f=>r.forms[f.id].learnedAt).sort().at(-1);
  r.firstStudiedAt ||= r.learnedAt;
 }
}
// Assign permanent slots without moving the source words or their progress keys.
export function ensureImportedLessons(data){
 syncImportedProgress(data);
 for(const book of ['imported']){const [members,orders,serialKey,catalog]=importFields(book);data[members]||={};data[orders]||={};data[catalog]||={};let serial=Math.max(0,Number(data[serialKey])||0,...Object.values(data[orders]).filter(Number.isSafeInteger));const order=new Map(Object.keys(data[members]).map((key,i)=>[key,i]));for(const entry of rawImportedEntries(data).sort((a,b)=>a.imported.at-b.imported.at||order.get(wordKey(a.p,a.w))-order.get(wordKey(b.p,b.w)))){const key=wordKey(entry.p,entry.w);if(!Number.isSafeInteger(data[orders][key])||data[orders][key]<1)data[orders][key]=++serial;for(const id of memberLessons(entry.imported,data[orders][key]))data[catalog][id]||={id,order:Number(id.slice(1))};}data[serialKey]=serial;}
 const lessons=importedLessons(data);data.lessonCompletions||={};
 if(data.importedRecitationIds?.length&&!data.importedRecitationLesson){const lesson=lessons.find(p=>p.words.some(w=>w.id===data.importedRecitationIds[0]));if(lesson)data.importedRecitationLesson=packageKey(lesson);}
 for(const p of lessons){const key=packageKey(p);if(lessonStats(data,p).total>0&&lessonStats(data,p).practice===0)data.lessonCompletions[key]||=day();else delete data.lessonCompletions[key];}
 for(const s of Object.values(data.sessions||{}))if(s.importedPractice&&!s.importedLessonKey){const id=s.group?.[0],lesson=lessons.find(p=>p.words.some(w=>w.id===id||w.origin.wordId===id&&w.origin.lessonKey===s.lessonKey));if(lesson)s.importedLessonKey=packageKey(lesson);}
 const byLesson=new Map(lessons.map(p=>[packageKey(p),p]));
 for(const s of Object.values(data.sessions||{}))if(s.importedCourseLearning===true&&!s.importedRelearning){const course=byLesson.get(s.importedLessonKey);if(course)appendLearningWords(data,course,s);}
 return lessons;
}
export function importedLessons(data,book='imported'){
 if(book==='special')return [];
 const [members,orders,,catalog]=importFields(book),groups=new Map();
 const make=id=>{if(!groups.has(id)){const number=Number(id.slice(1));groups.set(id,{reviewPool:true,importedLesson:true,book:{id:book,title:importBookTitle(book)},lesson:{id,title:'Lesson '+number,order:number,version:1},words:[]});}return groups.get(id);};
 for(const id of Object.keys(data[catalog]||{}))make(id);
 for(const p of data.library){const byBase=new Map();for(const card of p.words)if(card.conjugation){const id=card.conjugation.baseWordId;if(!byBase.has(id))byBase.set(id,[]);byBase.get(id).push(card);}for(const w of p.words){const key=wordKey(p,w),record=data[members]?.[key],sequence=data[orders]?.[key];if(w.conjugation||!record||!Number.isSafeInteger(sequence)||sequence<1)continue;
  for(const id of memberLessons(record,sequence)){const group=make(id),scoped=record.units?{...w,conjugationPlan:{...normalizePlan(w.conjugationPlan),infinitive:record.units.infinitive,tenses:[...record.units.tenses]},importedUnitTenses:[...record.units.tenses]}:w;group.words.push({...scoped,id:key,order:sequence,origin:{progressKey:key,lessonKey:packageKey(p),wordId:w.id,bookId:p.book.id}});for(const [i,card]of (byBase.get(w.id)||[]).entries()){const cardKey=wordKey(p,card);group.words.push({...card,id:cardKey,order:sequence+(i+1)/100,conjugation:{...card.conjugation,baseWordId:key},origin:{progressKey:cardKey,lessonKey:packageKey(p),wordId:card.id,bookId:p.book.id}});}}
 }}
 return [...groups.values()].sort((a,b)=>a.lesson.order-b.lesson.order).map(p=>({...p,words:p.words.sort((a,b)=>a.order-b.order)}));
}
export function resetImportedLesson(data,p){
 resetLessonProgress(data,p);
 const ids=new Set(p.words.map(w=>w.id));
 for(const [key,s]of Object.entries(data.sessions))if(s.importedPractice&&(s.importedLessonKey===packageKey(p)||s.group?.some(id=>ids.has(id)))){delete data.sessions[key];if(data.activeSessions?.[s.lessonKey]===key)delete data.activeSessions[s.lessonKey];if(data.lastPractice?.sessionKey===key)delete data.lastPractice;}
 for(const id of ids)delete data.directProgress?.[id];
}
export function addImportedEntries(data,entries,at=Date.now(),addToImported=true,destination={}){
 ensureImportedLessons(data);
 const learnedLookup=addToImported?makeLearnedImportLookup(data):null,tenseLookup=addToImported?makeLearnedTenseLookup(data):null,skippedReview=[],skippedKnown=[];
 const skip=(hit,unit)=>{(hit.notebook==='known'?skippedKnown:skippedReview).push({lesson:packageKey(hit.p),word:hit.w.id,unit});};
 const book='imported',[members,orders,serial,catalog]=importFields(book);if(addToImported&&destination.lessonId&&!data[catalog]?.[destination.lessonId]&&!importedLessons(data,book).some(p=>p.lesson.id===destination.lessonId))throw Error('请选择 Lesson / Choisissez une leçon.');let added=0,duplicates=0;const resolved=[],addedKeys=[];const date=day(new Date(at));let personal=data.library.find(p=>p.book.id==='personal');
 const allocator=addToImported&&!destination.lessonId?createAutomaticImportAllocator(data,book):null;
 const wordIndex=new Map(),newIds=[];for(const p of sourceOrderedLibrary(data.library))for(const w of p.words){if(w.conjugation)continue;for(const f of w.forms){const key=vocabularyIdentity({...w,forms:[f]}),entry={p,w};if(preferVocabularyEntry(entry,wordIndex.get(key),data,{reuseImported:true}))wordIndex.set(key,entry);}}
 const used=new Set([...(data.reservedWordIds||[]),...data.library.flatMap(p=>p.words.map(w=>w.id)),...Object.keys(data.progress).map(k=>k.split(':').at(-1))]);let counter=800000;
 for(const entry of clone(entries)){
  let p,w;
  if(entry.existing){p=data.library.find(p=>packageKey(p)===entry.existing.lesson);w=p?.words.find(w=>w.id===entry.existing.word);}
  const match=wordIndex.get(vocabularyIdentity(entry));
  if(match&&(!w||data[members]?.[wordKey(match.p,match.w)]&&vocabularyIdentity(match.w)===vocabularyIdentity(w))){p=match.p;w=match.w;}
  if(w&&destination.preserveExisting){resolved.push({lesson:packageKey(p),word:w.id});continue;}
  const verb=w?isConjugationVerb(w):needsConjugationChoice(entry),requested=verb?normalizePlan(entry.conjugationPlan||w?.conjugationPlan):{infinitive:true,tenses:[]},accepted={infinitive:requested.infinitive,tenses:[...requested.tenses]};
  if(!requested.infinitive&&!requested.tenses.length)throw Error('请选择原形或时态 / Choisissez un élément.');
  if(addToImported){
   const learned=learnedLookup(entry);if(requested.infinitive&&learned){accepted.infinitive=false;skip(learned,'infinitive');}
   const lemma=w?lemmaFor(w):exact(entry.word).toLocaleLowerCase('fr');
   accepted.tenses=requested.tenses.filter(tense=>{const learned=tenseLookup(lemma,tense);if(!learned)return true;skip(learned,tense);return false;});
   if(!accepted.infinitive&&!accepted.tenses.length)continue;
  }
  const newWord=!w;
  if(!w){
   if(!personal){personal={schemaVersion:1,book:{id:'personal',title:'导入词汇 · Mots importés'},lesson:{id:'L01',title:'导入词汇 · Mots importés',order:1,version:1},words:[]};data.library.push(personal);}p=personal;
   while(used.has('w'+String(counter).padStart(6,'0')))counter++;if(counter>999999)throw Error('词条空间不足 / Limite atteinte.');const id='w'+counter++;used.add(id);
   const gender=entry.gender||null,pos=entry.pos==='n.'&&!gender?'loc.':entry.pos||'loc.';
   const text=entry.textbookText||(pos==='n.'&&entry.plural?'des '+entry.word:entry.word),spoken=displayForm({pos,primaryMeaning:entry.primaryMeaning,meanings:entry.meanings},{text,gender,literal:!!entry.literal});
   const example=entry.example?.fr?{...entry.example,audioKey:entry.example.audioKey||spokenKey(entry.example.fr)}:undefined;
   const form={id:id+'-base',text,tested:true,gender,audio:null,audioKey:entry.audioKey||spokenKey(spoken),ipa:entry.ipa||'',source:entry.textbookSource||entry.fosSource||'Wiktionary · '+entry.word+' · CC BY-SA 4.0'+(example?.source?' / '+example.source:'')};if(entry.conjugationSource){Object.assign(form,{audioKey:recording(entry.word).audioKey,conjugationAudio:true,source:'法语变位器3.0'});}if(example)form.example=example;if(entry.literal||pos!=='n.'&&splitNounArticle(text).prefix)form.literal=true;
   w={id,lexiconId:entry.id,lexiconWord:entry.word,provenance:{dictionary:entry.textbookSource||entry.fosSource|| (entry.conjugationSource?'法语变位器3.0':entry.sourceUrl||'https://zh.wiktionary.org/'),license:entry.textbookSource||entry.fosSource?'用户提供的课程资料':entry.conjugationSource?'MIT':'CC BY-SA 4.0',sentence:entry.example?.url||entry.sourceUrl||'',sentenceSource:entry.example?.source||'',authored:!!entry.example?.authored},order:p.words.length+1,pos,sourcePos:entry.pos||pos,meanings:entry.meanings,primaryMeaning:entry.primaryMeaning,forms:[form]};p.words.push(w);p.lesson.version++;newIds.push(id);wordIndex.set(vocabularyIdentity(entry),{p,w});
  }
  applyReviewedReading(w);
  applyFormRelations(w);
  preferredNounAudio(w);
  const previousMember=data[members]?.[wordKey(p,w)],previousSize=previousMember?importedMembershipSize(w,previousMember):0,previousScope=previousMember?importedUnitScope(data,p,w):{infinitive:false,tenses:[]};
  for(const f of w.forms){
   const same=exact(w.lexiconWord||bare(displayForm(w,f))).toLocaleLowerCase('fr')===exact(entry.existing?bare(entry.word):entry.word).toLocaleLowerCase('fr');
   if(!f.audioKey)f.audioKey=spokenKey(displayForm(w,f));
   if(same&&!f.ipa&&entry.ipa)f.ipa=entry.ipa;
   if(same&&!f.example?.fr&&entry.example?.fr)f.example={...entry.example};
   if(f.example?.fr&&!f.example.audioKey)f.example.audioKey=spokenKey(f.example.fr);
  }
  if(verb&&(addToImported||entry.conjugationPlan)){const before=newWord?{infinitive:false,tenses:[]}:normalizePlan(w.conjugationPlan),wanted=addToImported?accepted:requested;w.conjugationPlan={infinitive:before.infinitive||wanted.infinitive,tenses:[...new Set([...before.tenses,...wanted.tenses])]};}
  const key=wordKey(p,w);resolved.push({lesson:packageKey(p),word:w.id});
  if(addToImported){
   const previous=data[members][key],target=destination.lessonId,unitsAdded=accepted.infinitive&&!previousScope.infinitive||accepted.tenses.some(tense=>!previousScope.tenses.includes(tense));
   if(previous){previous.units={infinitive:previousScope.infinitive||accepted.infinitive,tenses:[...new Set([...previousScope.tenses,...accepted.tenses])]};allocator?.adjust(memberLessons(previous,data[orders][key]),importedMembershipSize(w,previous)-previousSize);}
   if(previous&&(!target||memberLessons(previous,data[orders][key]).includes(target))){if(unitsAdded){added++;addedKeys.push(key);}else duplicates++;}
   else{
    if(previous)previous.lessonIds=[...new Set([...memberLessons(previous,data[orders][key]),target])];
    else{const member={at,date,units:accepted};member.lessonId=target||allocator.take(importedMembershipSize(w,member));data[members][key]=member;if(!data[orders][key])data[orders][key]=++data[serial];}
    added++;addedKeys.push(key);
   }
  }
 }
 if(newIds.length)data.reservedWordIds=[...new Set([...(data.reservedWordIds||[]),...newIds])];return {added,duplicates,resolved,addedKeys,skippedReview,skippedKnown,bookId:book,lessonId:destination.lessonId};
}
export function addLessonWords(data, lessonKey, entries) {
 const lesson = data.library.find(p => packageKey(p) === lessonKey && textbookPackage(p));
 if (!lesson) throw Error('课次不存在 / Leçon introuvable.');
 const seen = new Set(lessonWithAdditions(data, lesson).words.filter(w=>!w.studyDisabled).map(w=>logicalVocabularyKey(lesson,w)));
 const input = entries.map(entry=>({...entry,conjugationPlan:{infinitive:true,tenses:[]}}));
 const {resolved} = addImportedEntries(data,input,Date.now(),false,{preserveExisting:true});
 const refs = data.lessonAdditions?.[lessonKey] || [];
 const rows = new Map();
 for (const ref of resolved) {
  const source = data.library.find(p=>packageKey(p)===ref.lesson);
  const word = source?.words.find(w=>w.id===ref.word&&!w.conjugation&&!w.studyDisabled);
  if (!word) continue;
  const identity = logicalVocabularyKey(source,word);
  if (rows.has(identity)) continue;
  const added = !seen.has(identity);
  if (added) {
   refs.push(ref);
   seen.add(identity);
  }
  rows.set(identity,{key:wordKey(source,word),word:word.forms.map(f=>displayForm(word,f)).join(' / '),
    lesson:lessonSourceLabel(lesson),added});
 }
 if (refs.length) (data.lessonAdditions ||= {})[lessonKey] = refs;
 const updated = lessonWithAdditions(data,lesson);
 for (const session of Object.values(data.sessions).filter(s=>s.lessonKey===lessonKey&&s.mode==='learn')) {
  appendLearningWords(data,updated,session);
 }
 if (rows.size && lessonStats(data,updated).practice) delete data.lessonCompletions?.[lessonKey];
 return [...rows.values()];
}

export function removeLessonWord(data, lessonKey, id) {
 const lesson = data.library.find(p=>packageKey(p)===lessonKey&&textbookPackage(p));
 const word = lessonWithAdditions(data,lesson)?.words.find(w=>w.id===id&&w.lessonAddition);
 if (!word) return false;
 const origin = word.origin;
 const refs = data.lessonAdditions[lessonKey].filter(ref=>ref.lesson!==origin.lessonKey||ref.word!==origin.wordId);
 if (refs.length) data.lessonAdditions[lessonKey]=refs;
 else delete data.lessonAdditions[lessonKey];
 return true;
}
export function removeImportedEntry(data,p,w,book='imported',whole=false){
 const identity=vocabularyIdentity(w),aliases=rawImportedEntries(data).filter(entry=>vocabularyIdentity(entry.w)===identity);
 for(const entry of aliases.length?aliases:[{p,w}])removeImportedAlias(data,entry.p,entry.w,book,whole);
}
function removeImportedAlias(data,p,w,book,whole){
 const [members]=importFields(book),key=wordKey(p,w),record=data[members]?.[key];
 if(!whole&&record?.units?.infinitive&&record.units.tenses.length)record.units={...record.units,infinitive:false};
 else{
  delete data[members]?.[key];
  const ids=new Set((data.conjugationDecks?.[packageKey(p)]||[]).filter(card=>card.conjugation.baseWordId===w.id).map(card=>wordKey(p,card)));
  for(const [id,session]of Object.entries(data.conjugationSessions||{}))if(id.startsWith(book+':')&&!session.done&&Object.values(session.refs||{}).flat().some(r=>ids.has(r.lesson+':'+r.wordId)))session.retired=true;
 }
 pruneImportedPractice(data,p,w,book);
}
export function pruneImportedPractice(data,p,w,book='imported'){
 for(const s of Object.values(data.sessions).filter(s=>s.importedPractice&&(!s.importedLessonKey||s.importedLessonKey.startsWith(book+':'))&&(s.lessonKey===packageKey(p)||s.lessonKey==='review:all'))){
  const id=s.lessonKey==='review:all'?wordKey(p,w):w.id,engine=s.lessonKey==='review:all'?reviewPackage(data):p;
  const active=s.question?.wordId===id||s.feedback?.wordId===id,present=s.pending.includes(id)||s.group.includes(id);
  s.pending=s.pending.filter(v=>v!==id);s.group=s.group.filter(v=>v!==id);s.jobs=s.jobs.filter(j=>j.wordId!==id);s.doneWords=s.doneWords.filter(v=>v!==id);s.total=s.group.length;if(present)s.progressTotal=Math.max(0,(s.progressTotal||0)-1);
  if(active){s.question=null;s.feedback=null;advance(data,engine,day(),s.key);}else if(!s.jobs.length&&!s.feedback)s.phase='done';
 }
}

export function activeImportedSession(data,lessonKey=null){return Object.values(data.sessions).find(s=>s.importedPractice&&s.importedCourseLearning!==false&&(!lessonKey||s.importedLessonKey===lessonKey)&&s.phase!=='done'&&(s.jobs?.length||s.group?.some(id=>!s.doneWords?.includes(id))));}
export function waitingImportedSession(data,lessonKey){return Object.values(data.sessions).find(s=>s.importedPractice&&s.importedCourseLearning!==false&&s.importedLessonKey===lessonKey&&s.phase==='done'&&s.pending?.length);}

export function dictionaryEntry(row){const gender=row.gender||null,pos=row.pos==='n.'&&!gender?'loc.':row.pos;let text=row.textbookText||(pos==='n.'&&row.plural?'des '+row.word:row.word);const spoken=displayForm({pos,primaryMeaning:row.primaryMeaning,meanings:row.meanings},{text,gender,literal:!!row.literal});const word={id:row.id,lexiconId:row.id,lexiconWord:row.word,...(row.vocabularySource?{vocabularyMerge:{revision:1,key:vocabularyIdentity(row),source:row.vocabularySource}}:{}),order:1,pos,sourcePos:row.pos,meanings:row.meanings,primaryMeaning:row.primaryMeaning,forms:[{id:row.id+'-base',text,gender,tested:true,literal:!!row.literal||pos!=='n.'&&!!splitNounArticle(text).prefix,ipa:row.ipa,source:row.textbookSource||row.fosSource||'',audio:null,audioKey:row.conjugationSource?recording(row.word).audioKey:row.audioKey||spokenKey(spoken),...(row.conjugationSource?{conjugationAudio:true}:{}),example:row.example?{...row.example,audioKey:row.example.audioKey||spokenKey(row.example.fr)}:undefined}]};applyReviewedReading(word);applyFormRelations(word);preferredNounAudio(word);return word;}
const preparedRows=new WeakMap(),rowWords=new WeakMap(),rowSearch=new WeakMap(),librarySources=new WeakMap();
export function* dictionaryNotebookEntrySteps(rows,data,{query='',limit=Infinity}={}){
 let work=0;let prepared=preparedRows.get(rows);if(!prepared){prepared=withSourceVerbs(rows);preparedRows.set(rows,prepared);}
 let source=librarySources.get(data.library);if(!source){const existing=new Map(),all=[];for(const p of sourceOrderedLibrary(data.library))for(const w of p.words){if(++work%64===0)yield;if(w.conjugation)continue;const e={p,w};all.push(e);for(const f of w.forms){const name=vocabularyIdentity({...w,forms:[f]});const old=existing.get(name),keys=new Set(w.forms.map(f=>vocabularyIdentity({...w,forms:[f]}))),oldKeys=old&&new Set(old.w.forms.map(f=>vocabularyIdentity({...old.w,forms:[f]})));const superset=oldKeys&&keys.size>oldKeys.size&&[...oldKeys].every(key=>keys.has(key)),subset=oldKeys&&oldKeys.size>keys.size&&[...keys].every(key=>oldKeys.has(key));if(superset||!subset&&preferVocabularyEntry(e,old,data))existing.set(name,e);}}source={existing,all:uniqueVocabularyEntries(all,data)};librarySources.set(data.library,source);}
 const p={dictionary:true,book:{id:'dictionary',title:'词库 · Dictionnaire'},lesson:{id:'all',title:'词库',order:1,version:1}},seen=new Set(),seenWords=new Set(),result=[],needle=normalize(query);
 for(const row of prepared){if(++work%64===0)yield;const identity=vocabularyIdentity(row);if(identity&&seenWords.has(identity))continue;const e=source.existing.get(vocabularyIdentity(row));if(e){const key=wordKey(e.p,e.w);if(seen.has(key)){if(identity)seenWords.add(identity);continue;}seen.add(key);if(needle&&!normalize([...e.w.meanings,...e.w.forms.map(f=>f.text)].join(' ')).includes(needle))continue;result.push(e);}else{let search=rowSearch.get(row);if(search===undefined){search=normalize([...readingSpellings(row),...row.meanings].join(' '));rowSearch.set(row,search);}if(needle&&!search.includes(needle))continue;let w=rowWords.get(row);if(!w){w=dictionaryEntry(row);rowWords.set(row,w);}result.push({p,w,dictionaryRow:row});}if(identity)seenWords.add(identity);if(e){const key=vocabularyIdentity(e.w);if(key)seenWords.add(key);for(const f of e.w.forms)seenWords.add(vocabularyIdentity({...e.w,forms:[f]}));}if(result.length>=limit)return result;}
 for(const e of source.all){if(++work%64===0)yield;const identity=vocabularyIdentity(e.w),key=wordKey(e.p,e.w);if(seen.has(key)||identity&&seenWords.has(identity))continue;seen.add(key);if(needle&&!normalize([...e.w.meanings,...e.w.forms.map(f=>f.text)].join(' ')).includes(needle))continue;result.push(e);if(identity)seenWords.add(identity);if(result.length>=limit)break;}return result;
}
export function dictionaryNotebookEntries(rows,data,options){const steps=dictionaryNotebookEntrySteps(rows,data,options);let next;do{next=steps.next();}while(!next.done);return next.value;}
export function resolveDictionaryEntry(data,entry){if(!entry.p.dictionary)return entry;const result=addImportedEntries(data,[entry.dictionaryRow],Date.now(),false).resolved[0],p=data.library.find(p=>packageKey(p)===result.lesson);return {p,w:p.words.find(w=>w.id===result.word)};}

// Import membership reuses the original word and its progress key.
export function addToImportedBook(data,entry,at=Date.now()){
 if(entry.w?.conjugation)throw Error('请加入动词原形 / Ajoutez l’infinitif.');
 const source=entry.dictionaryRow?null:wordContext(data,entry.p,entry.w),row=entry.dictionaryRow||{word:displayForm(source.w,source.w.forms[0]),pos:source.w.pos,gender:source.w.forms[0].gender,existing:{lesson:packageKey(source.p),word:source.w.id}};
 const result=addImportedEntries(data,[row],at),resolved=result.resolved[0];
 if(!resolved)throw Error('已在已会本或复习本，无需导入 / Déjà acquis ou en révision.');
 const p=data.library.find(p=>packageKey(p)===resolved.lesson),w=p.words.find(w=>w.id===resolved.word);return {...entry,p,w};
}

export function importedLessonIds(data,resolved){
 const ids=new Set();for(const {lesson,word}of resolved||[]){const key=lesson+':'+word,record=data.importedWords?.[key],sequence=data.importedWordOrder?.[key];if(record&&Number.isSafeInteger(sequence)&&sequence>0)for(const id of memberLessons(record,sequence))ids.add(id);}
 return [...ids].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
}

export function setWordPrimaryMeaning(data,entry,meaning){
 const resolved=resolveDictionaryEntry(data,entry.dictionaryRow||!entry.p.dictionary?entry:{...entry,dictionaryRow:{...entry.w,id:entry.w.lexiconId,word:entry.w.lexiconWord,gender:entry.w.forms[0]?.gender,example:entry.w.forms.find(form=>form.example)?.example}}),source=wordContext(data,resolved.p,resolved.w);
 const p=data.library.find(lesson=>packageKey(lesson)===packageKey(source.p)),w=p?.words.find(word=>word.id===source.w.id);
 if(!w)throw Error('找不到词条 / Mot introuvable.');
 if(!primaryMeaningOptions(w).includes(meaning)&&!primaryMeaningOptions(entry.w).includes(meaning))throw Error('请选择已有释义 / Choisissez un sens existant.');
 if(!w.primaryMeaningChosen)w.primaryMeaningBeforeChoice=primaryMeaning(w);
 w.primaryMeaning=meaning;w.primaryMeaningChosen=true;
 preferredNounAudio(w);
 return {...entry,p,w};
}
