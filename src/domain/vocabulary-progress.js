import {vocabularyIdentity,vocabularyPracticeFormKey} from './vocabulary-identity.js';
import {runCooperatively} from '../platform/ui-work.js';
import {practiceForm,sharedPracticeForms} from './word-display.js';

const keyOf=({p,w})=>w.origin?.progressKey||p.book.id+':'+p.lesson.id+':'+w.id;
const fingerprint=value=>JSON.stringify(value);
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const top=record=>{if(!record)return record;const {forms,...rest}=record;return rest;};
const formKey=(word,form)=>vocabularyPracticeFormKey(word,practiceForm(word,form));
const date=record=>[record?.lastReviewedAt,record?.lastNormalReviewedAt,record?.lastPracticed,record?.lastReviewDate,record?.lastErrorDate,record?.date,record?.last,record?.completedAt].filter(v=>typeof v==='string').sort().at(-1)||'';
const count=record=>Math.max(0,...['reviewIndex','reviewCount','practiceCount','count','cycleReviews'].map(key=>Number(record?.[key])||0));
function best(values,{dateFirst=false}={}){
 return values.filter(Boolean).reduce((chosen,next)=>{
  if(!chosen)return next;
  const rank=r=>[r.notebook==='known'||r.known?3:r.notebook==='review'?2:r.learnedAt?1:0,...(dateFirst?[date(r),count(r)]:[count(r),date(r)]),r.learnedAt?-(Date.parse(r.learnedAt)||0):-Infinity];
  const a=rank(chosen),b=rank(next);for(let i=0;i<a.length;i++){if(b[i]>a[i])return next;if(b[i]<a[i])return chosen;}return chosen;
 },undefined);
}
function selected(values,previous,options){
 const changed=previous&&values.filter((value,index)=>fingerprint(value)!==fingerprint(previous[index]));
 return changed?.length?best(changed,options):best(values,options);
}
const groupCache=new WeakMap();
function groupsFor(data){
 const cached=groupCache.get(data.library);if(cached&&cached.decks===data.conjugationDecks)return cached.groups;
 const groups=new Map(),packages=new Map((data.library||[]).map(p=>[p.book.id+':'+p.lesson.id,p]));
 const add=(identity,p,w)=>{if(!groups.has(identity))groups.set(identity,[]);groups.get(identity).push({p,w});};
 for(const p of data.library||[])for(const w of p.words||[]){
  const identity=w.vocabularyMerge?.key||vocabularyIdentity(w);if(!identity||w.conjugation||w.studyDisabled)continue;
  add(identity,p,w);
 }
 // Derived cards have stable physical IDs in each lesson, but a conjugation
 // is the same learning item across sources. Persons and tenses stay separate.
 for(const [lesson,cards]of Object.entries(data.conjugationDecks||{})){
  const p=packages.get(lesson);if(!p)continue;
  for(const w of cards){const c=w.conjugation;if(!c||w.studyDisabled||!c.lemma||!c.tense||!c.person)continue;
   add('conjugation|'+[c.lemma.normalize('NFC').toLocaleLowerCase('fr'),c.tense,c.person].join('|'),p,w);
  }
 }
 groupCache.set(data.library,{decks:data.conjugationDecks,groups});return groups;
}
function rememberOriginal(data,identity,members){
 if(data.sharedVocabulary.migrated[identity])return;
 data.sharedVocabulary.migrated[identity]=true;
 for(const entry of members){
  const key=keyOf(entry),original={};
  for(const table of ['progress','errorHistory','directProgress','studyPressure'])if(data[table]?.[key]!==undefined)original[table]=copy(data[table][key]);
  if(data.favorites?.[key])original.favorite=true;
  for(const f of entry.w.forms){const error=data.errors?.[key+':'+f.id];if(error)(original.errors||={})[f.id]=copy(error);}
  if(Object.keys(original).length){data.vocabularyMergeArchive||={};data.vocabularyMergeArchive[key]||=original;}
 }
}
function syncRecord(data,previous,table,identity,members){
 const keys=members.map(keyOf),values=keys.map(key=>data[table]?.[key]),prior=previous&&keys.map(key=>previous[table]?.[key]);
 const registry=data.sharedVocabulary.records[identity]||={},saved=registry[table];
 const changed=prior&&values.map((value,i)=>({value,index:i})).filter(({value,index})=>fingerprint(top(value))!==fingerprint(top(prior[index])));
 // A missing alias in an older backup does not erase a surviving record.
 const options={dateFirst:table==='studyPressure'};
 const record=best(changed?.map(e=>e.value)||[],options)||(prior?saved||best(values,options):best(values,options)||saved);
 if(!values.some(Boolean)||changed?.length&&changed.every(e=>e.value===undefined)){
  delete registry[table];for(const key of keys)if(data[table])delete data[table][key];return;
 }
 const canonical={...top(record)},forms={};
 const formGroups=new Map();
 for(let i=0;i<members.length;i++)for(const f of members[i].w.forms){const name=formKey(members[i].w,f);if(!formGroups.has(name))formGroups.set(name,[]);formGroups.get(name).push({index:i,f});}
 const hasForms=values.some(r=>r?.forms)||saved?.forms;
 if(hasForms)for(const [name,aliases]of formGroups){
  const current=aliases.map(({index,f})=>values[index]?.forms?.[f.id]),before=prior&&aliases.map(({index,f})=>prior[index]?.forms?.[f.id]);
  const changes=prior&&aliases.map(({index},i)=>({value:current[i],changed:!!values[index]&&fingerprint(current[i])!==fingerprint(before[i])})).filter(e=>e.changed);
  const sharedSpelling=new Set(aliases.map(alias=>alias.f.gender).filter(Boolean)).size>1;
  const state=changes?.length?best(changes.map(e=>e.value)):prior&&!sharedSpelling?saved?.forms?.[name]||best(current):best(current)||saved?.forms?.[name];
  if(state!==undefined)forms[name]=state;
 }
 if(hasForms||table==='progress')canonical.forms=forms;
 if(table==='progress'){
  const scheduled=members.flatMap(e=>e.w.forms.filter(f=>f.tested).map(f=>({key:formKey(e.w,f),supplement:f.studySupplement})));
  const required=[...new Set(scheduled.map(form=>form.key))];
  const complete=name=>{const state=forms[name];return !!(state&&(state.learnedAt||state.known||canonical.learnedAt&&(state.due||state.scheduleVersion||state.reviewIndex!==undefined)));};
  if(canonical.notebook==='known')delete canonical.pendingLearning;
  else if(required.length&&required.every(complete)){
   delete canonical.pendingLearning;
   if(canonical.notebook==='practice')canonical.notebook=required.every(name=>forms[name].known)?'known':'review';
   canonical.learnedAt||=required.map(name=>forms[name].learnedAt).filter(Boolean).sort().at(-1);
  }else if(canonical.notebook==='review'&&scheduled.some(form=>!form.supplement&&!complete(form.key))&&(canonical.pendingLearning||Object.keys(forms).length)){canonical.notebook='practice';canonical.pendingLearning=true;}
 }
 if(table==='progress'&&!prior){
  const valid=dates=>dates.filter(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(v)).sort()[0];
  const first=valid(values.flatMap(r=>[r?.firstStudiedAt,r?.learnedAt,...Object.values(r?.forms||{}).map(f=>f.learnedAt)]));if(first)canonical.firstStudiedAt=first;
  for(const field of ['learnedAt','newLearnedAt']){const earliest=valid(values.map(r=>r?.[field]));if(earliest)canonical[field]=earliest;}
 }
 registry[table]=canonical;data[table]||={};
 for(let i=0;i<members.length;i++){
  const projection={...top(canonical)};
  if(hasForms||table==='progress'){projection.forms={};for(const f of members[i].w.forms){const state=forms[formKey(members[i].w,f)];if(state!==undefined)projection.forms[f.id]=state;}}
  data[table][keys[i]]=projection;
 }
}
function syncOtherState(data,previous,members){
 const keys=members.map(keyOf),flags=keys.map(key=>!!data.favorites?.[key]),old=previous&&keys.map(key=>!!previous.favorites?.[key]);
 const changed=old&&flags.filter((value,i)=>value!==old[i]);const favorite=changed?.length?changed[0]:flags.some(Boolean);
 data.favorites||={};for(const key of keys)if(favorite)data.favorites[key]=true;else delete data.favorites[key];
 const forms=new Map();
 for(const e of members)for(const f of e.w.forms){const name=formKey(e.w,f);if(!forms.has(name))forms.set(name,[]);forms.get(name).push({entry:e,f,key:keyOf(e)+':'+f.id});}
 for(const aliases of forms.values()){
  const values=aliases.map(e=>data.errors?.[e.key]),before=previous&&aliases.map(e=>previous.errors?.[e.key]),error=selected(values,before);
  for(const alias of aliases){
   if(error){data.errors||={};data.errors[alias.key]={...error,wordId:alias.entry.w.id,formId:alias.f.id,lesson:alias.entry.p.book.id+':'+alias.entry.p.lesson.id};}
   else if(data.errors)delete data.errors[alias.key];
  }
 }
}
function* syncSteps(data,previous){
 data.sharedVocabulary||={version:2,migrated:{},records:{}};data.sharedVocabulary.version=2;
 data.sharedVocabulary.migrated||={};data.sharedVocabulary.records||={};let linked=0;
 for(const [identity,members]of groupsFor(data)){
  if(members.length<2&&!members.some(({w})=>w.forms.some(form=>sharedPracticeForms(w,form).length>1)))continue;
  if(previous&&previous.library===data.library&&previous.conjugationDecks===data.conjugationDecks&&data.sharedVocabulary.migrated[identity]&&!members.some(({p,w})=>{
   const key=keyOf({p,w});
   for(const table of ['progress','errorHistory','directProgress','studyPressure'])if(fingerprint(data[table]?.[key])!==fingerprint(previous[table]?.[key]))return true;
   if(!!data.favorites?.[key]!==!!previous.favorites?.[key])return true;
   return w.forms.some(f=>fingerprint(data.errors?.[key+':'+f.id])!==fingerprint(previous.errors?.[key+':'+f.id]));
  })){yield;continue;}
  rememberOriginal(data,identity,members);
  const tables=members[0].w.conjugation?['progress','errorHistory','directProgress']:['progress','errorHistory','directProgress','studyPressure'];
  for(const table of tables)syncRecord(data,previous,table,identity,members);
  syncOtherState(data,previous,members);linked++;yield;
 }
 return linked;
}
export const shareVocabularyProgress=(data,previous,options)=>runCooperatively(syncSteps(data,previous),options);
