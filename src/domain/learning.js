import {newReviewRecord,nextReviewDate,completeReviewRecord,migrateReviewPlans} from './review-plan.js';
import {preferredGroupSize} from './group-size.js';
import {studyPaused,recordStudyFailure} from './study-pressure.js';
import {primaryMeaning} from './meanings.js';
import {choiceMeaningKeys,meaningsOverlap,unambiguousChoices} from './choice-meanings.js';
import {distractorExclusion} from './choice-eligibility.js';
import {spellingSimilarity,sameWordFamily,isShopVocabulary} from './choice-similarity.js';
let practiceDictionary=[],dictionaryGrams=new Map(),dictionaryShops=[],optionDictionary=new Map(),optionMeaningCache=new WeakMap();
function optionMeaning(word){
 if(String(word.id).startsWith('dictionary:')){let cached=optionMeaningCache.get(word);if(!cached){const label=primaryMeaning(word);cached={label,keys:choiceMeaningKeys([label,...word.meanings])};optionMeaningCache.set(word,cached);}return cached;}
 const label=primaryMeaning(word);return {label,keys:choiceMeaningKeys([label,...word.meanings])};
}
export const practiceOptionWord=id=>optionDictionary.get(id)||null;
const grams=text=>{const value=String(text).normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]/gu,'');return [...new Set(Array.from({length:Math.max(0,value.length-1)},(_,i)=>value.slice(i,i+2)))];};
export function setPracticeDictionary(entries){
 optionMeaningCache=new WeakMap();
 optionDictionary=new Map(entries.map(e=>['dictionary:'+e.id,{id:'dictionary:'+e.id,pos:e.pos,meanings:e.meanings,primaryMeaning:e.primaryMeaning,forms:[{text:e.word,gender:e.gender||null,tested:true}]}]));
 practiceDictionary=entries.filter(e=>e.frequency===undefined||e.frequency>=3.8).sort((a,b)=>(b.frequency||0)-(a.frequency||0)).map(e=>({id:'dictionary:'+e.id,lexiconId:e.id,pos:e.pos,meanings:e.meanings,primaryMeaning:e.primaryMeaning,forms:[{text:e.word,gender:e.gender||null,tested:true}]})).filter(w=>!distractorExclusion(w));
 dictionaryShops=practiceDictionary.filter(w=>isShopVocabulary(w.forms[0].text));
 dictionaryGrams=new Map();for(const w of practiceDictionary)for(const gram of grams(w.forms[0].text)){if(!dictionaryGrams.has(gram))dictionaryGrams.set(gram,[]);dictionaryGrams.get(gram).push(w);}
}
function dictionaryCandidates(text){
 const scores=new Map();for(const gram of grams(text))for(const word of dictionaryGrams.get(gram)||[])scores.set(word,(scores.get(word)||0)+1);
 const similar=[...scores].sort((a,b)=>b[1]-a[1]).slice(0,180).map(([word])=>word);
 return [...new Set([...similar,...(isShopVocabulary(text)?dictionaryShops:[]),...practiceDictionary.slice(0,100)])];
}
import {isVocabularyWord,conjugationPracticeWords,conjugationPackages,conjugationUnits} from '../conjugation/catalog.js';
import { spellingParts, displayForm, splitNounArticle, spellingTask, articleAgrees, testsBothGenders } from './word-display.js';
import { spellingDiff } from './spelling-diff.js';
export const clone = v => JSON.parse(JSON.stringify(v));
export const day = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return day(d); };
export const packageKey = p => `${p.book.id}:${p.lesson.id}`;
export const wordKey = (p, w) => w?.origin?.progressKey || `${packageKey(p)}:${typeof w === 'string' ? w : w.id}`;
export const MIXED_REVIEW_KEY='review:all:review';
export const MIXED_ERRORS_KEY='review:all:errors';
export const MIXED_FAVORITES_KEY='review:all:favorites';
export function reviewPackage(data){
  return {reviewPool:true,book:{id:'review',title:'复习 · Révision'},lesson:{id:'all',title:'混合复习 · Révision mélangée',order:0,version:1},words:data.library.flatMap(p=>p.words.map(w=>({...w,id:wordKey(p,w),origin:{progressKey:wordKey(p,w),lessonKey:packageKey(p),wordId:w.id,bookId:p.book.id}})))};
}
export function wordContext(data,p,w){
  if(!w?.origin)return {p,w};
  const original=data.library.find(item=>packageKey(item)===w.origin.lessonKey);
  return {p:original||p,w:original?.words.find(item=>item.id===w.origin.wordId)||(data.conjugationDecks?.[w.origin.lessonKey]||[]).find(item=>item.id===w.origin.wordId)||w};
}
function shuffled(items,random=Math.random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function rememberKnown(session,word){
  session.newKnownWordIds||=[];session.acquiredWordIds||=[];
  if(!session.newKnownWordIds.includes(word.id))session.newKnownWordIds.push(word.id);
  if(!session.acquiredWordIds.includes(word.id))session.acquiredWordIds.push(word.id);
}
export const testedForms = w => w.forms.filter(f => f.tested);
// Repair stale pending flags without resetting completed forms or review dates.
export function reconcileLearningProgress(data,p=null){
  const packages=p?[p]:[...data.library,...conjugationPackages(data)],seen=new Set();
  for(const pkg of packages)for(const w of pkg.words){
    const key=wordKey(pkg,w);if(seen.has(key))continue;seen.add(key);
    const r=data.progress[key],forms=testedForms(w);if(!r||!forms.length)continue;
    if(r.notebook==='known'){delete r.pendingLearning;continue;}
    const complete=f=>{const state=r.forms?.[f.id];return !!(state&&(state.learnedAt||state.known||r.learnedAt&&(state.due||state.scheduleVersion||state.reviewIndex!==undefined)));};
    if(forms.every(complete)){
      delete r.pendingLearning;
      if(r.notebook==='practice')r.notebook=forms.every(f=>r.forms[f.id].known)?'known':'review';
      r.learnedAt ||= forms.map(f=>r.forms[f.id]?.learnedAt).filter(Boolean).sort().at(-1);
      if(r.learnedAt)r.firstStudiedAt ||= r.learnedAt;
    }else if(r.notebook==='review'&&(r.pendingLearning||Object.keys(r.forms||{}).length)){
      // Only genuinely unfinished forms return to the lesson; finished forms stay intact.
      r.notebook='practice';r.pendingLearning=true;
    }
  }
}
export const sessionKey=(p,mode='learn',ids=null)=>`${packageKey(p)}${mode==='learn'?'':mode==='review'?':review':mode==='favorites'?':favorites':mode==='errors'?':errors'+(ids?.length?':'+[...new Set(ids)].sort().join(','):''):':direct:'+(ids?.length?[...new Set(ids)].sort().join(','):'all')}`;
export const getSession=(data,p,key)=>data.sessions[key||data.activeSessions?.[packageKey(p)]||packageKey(p)];
export function removeDemoLessons(data) {
  const demos=data.library.filter(p=>p.demo===true);
  if(!demos.length)return false;
  const formalKeys=new Set(data.library.filter(p=>p.demo!==true).map(packageKey));
  const removed=new Set(demos.map(packageKey).filter(key=>!formalKeys.has(key)));
  const belongs=key=>typeof key==='string'&&[...removed].some(base=>key===base||key.startsWith(base+':'));
  data.reservedWordIds=[...new Set([...(data.reservedWordIds||[]),...demos.flatMap(p=>p.words.map(w=>w.id))])];
  data.library=data.library.filter(p=>p.demo!==true);
  for(const field of ['progress','sessions','favorites','errors','directProgress','recentOptions','activeSessions','lessonCompletions']){
    for(const [key,value]of Object.entries(data[field]||{})){
      if(belongs(key)||(field==='sessions'&&belongs(value?.lessonKey))||(field==='errors'&&belongs(value?.lesson)))delete data[field][key];
    }
  }
  if(belongs(data.lastPractice?.lessonKey)||belongs(data.lastPractice?.sessionKey))delete data.lastPractice;
  return true;
}
export function migrateSessions(data){
  for(const r of Object.values(data.progress||{})){
    let restored=false;
    for(const f of Object.values(r.forms||{}))if(f.known&&(f.scheduleVersion||0)<2&&f.reviewIndex>=5){f.known=false;f.longReview=true;f.due ||= addDays(r.lastPracticed||f.learnedAt||day(),30);restored=true;}
    if(restored&&r.notebook==='known')r.notebook='review';
  }
  migrateReviewPlans(data);
  data.activeSessions||={};data.directProgress||={};data.errorHistory||={};
  const totals={};for(const error of Object.values(data.errors)){const key=error.lesson+':'+error.wordId;totals[key]=(totals[key]||0)+(error.count||0);}
  for(const [key,count] of Object.entries(totals)){if(!data.errorHistory[key])data.errorHistory[key]={count,reviewCount:0,cycleReviews:0};}
  for(const p of data.library){
    const oldKey=packageKey(p),s=data.sessions[oldKey];
    if(s&&s.mode!=='learn'){
      const ids=[...new Set([...(s.pending||[]),...(s.group||[]),...(s.doneWords||[]),...(s.jobs||[]).map(j=>j.wordId)])];
      const key=sessionKey(p,s.mode,s.mode==='direct'&&ids.length===1?ids:null);
      if(!data.sessions[key])data.sessions[key]=s;
      delete data.sessions[oldKey];if(data.activeSessions[oldKey]===oldKey)delete data.activeSessions[oldKey];
    }
  }
  for(const [key,s]of Object.entries(data.sessions)){
    if(s.feedback&&!s.feedback.correct&&!s.feedback.retry){
      const index=(s.jobs||[]).findIndex(job=>job.wordId===s.feedback.wordId&&job.formId===s.feedback.formId);
      if(index>=0){const [job]=s.jobs.splice(index,1);job.needsReinforcement=true;s.jobs.unshift(job);}
      s.feedback.retry=true;
    }
    s.key=key;s.lessonKey||=key.split(':').slice(0,2).join(':');
    const pkg=data.library.find(p=>packageKey(p)===s.lessonKey);
    if(pkg&&(!s.flowVersion||s.flowVersion<2))upgradePracticeFlow(data,pkg,s);
    if(pkg&&s.flowVersion<3)upgradeRounds(data,pkg,s);
    s.progressTotal??=sessionProgressTotal(s);
    s.mistakeWordIds??=[...new Set((s.jobs||[]).filter(job=>job.failed).map(job=>s.lessonKey==='review:all'?job.wordId:s.lessonKey+':'+job.wordId))];
    data.activeSessions[s.lessonKey]||=key;
  }
  let mixed;
  for(const s of Object.values(data.sessions)){
    const p=s.lessonKey==='review:all'?(mixed||=reviewPackage(data)):data.library.find(p=>packageKey(p)===s.lessonKey);
    if(p){upgradeGenderRecognition(p,s);prunePausedWords(data,p,s,day());repairSessionChoices(data,p,s);if(!s.question&&!s.feedback&&s.phase!=='done')refresh(data,p,s,day());}
  }
  if(!data.lastPractice){const latest=Object.values(data.sessions).sort((a,b)=>(a.updatedAt||Date.parse(a.started+'T12:00:00'))-(b.updatedAt||Date.parse(b.started+'T12:00:00'))).at(-1);if(latest)data.lastPractice={lessonKey:latest.lessonKey,sessionKey:latest.key};}
  return data;
}
function touched(data,p,s){s.updatedAt=Date.now();data.activeSessions||={};data.activeSessions[packageKey(p)]=s.key;data.lastPractice={lessonKey:packageKey(p),sessionKey:s.key};}
export function sessionRemaining(s){
  if(!s||s.phase==='done')return 0;
  return s.group.filter(id=>!s.doneWords.includes(id)).length;
}
function sessionProgressTotal(s){
  return Math.max(0,(s.roundNumber||1)-1)*(s.roundSize||roundSize(s))+new Set([...(s.pending||[]),...(s.group||[]),...(s.doneWords||[])]).size;
}
export function sessionProgress(data,p,s,today=day()){
  if(!p||!s)return {completed:0,total:0,percent:0};
  if(s.mode==='review'){
    const remaining=new Set([...(s.pending||[]),...(s.group||[]).filter(id=>!(s.doneWords||[]).includes(id))]);
    if((s.reviewDate||s.started)!==today){
      // Display the new day's counter immediately, even before the next save.
      const plan=new Set([...(s.phase==='done'?[]:(s.group||[]).filter(id=>!(s.doneWords||[]).includes(id))),...p.words.filter(w=>isVocabularyWord(w)&&dueForms(data,p,w,today).length).map(w=>w.id)]);
      return {completed:0,total:plan.size,percent:0};
    }
    if(Array.isArray(s.reviewDailyIds)){
      const plan=new Set(s.reviewDailyIds),carry=s.reviewDailyCarry||0;
      const total=plan.size+carry,left=[...remaining].filter(id=>plan.has(id)).length;
      const completed=Math.max(0,total-left);
      return {completed,total,percent:total?completed/total*100:0};
    }
  }
  const total=s.mode==='learn'?p.words.filter(isVocabularyWord).length:s.progressTotal??sessionProgressTotal(s);
  const remaining=new Set([...(s.pending||[]),...(s.group||[]).filter(id=>!(s.doneWords||[]).includes(id))]).size;
  const completed=Math.max(0,Math.min(total,s.mode==='learn'?p.words.filter(w=>isVocabularyWord(w)&&getProgress(data,p,w).notebook!=='practice').length:total-remaining));
  return {completed,total,percent:total?completed/total*100:0};
}
export function reviewLessons(data,today=day()){
  return [...data.library].sort((a,b)=>a.book.id.localeCompare(b.book.id)||a.lesson.order-b.lesson.order).filter(p=>{
    const s=data.sessions[sessionKey(p,'review')];
    return p.words.some(w=>dueForms(data,p,w,today).length)||(s&&s.phase!=='done');
  });
}
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const normalize = s => String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^\p{L}\p{N}]/gu, '');
const exact = s => String(s ?? '').normalize('NFC').replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ');
const formatKey=s=>String(s??'').normalize('NFC').toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]/gu,'');
function formattedArticle(input,expected={}){
 const text=formatKey(input),answer=normalize(expected.answer||''),preferred=formatKey(expected.prefix||'');
 // Compare with the current noun before considering longer article prefixes.
 if(preferred&&text.startsWith(preferred)&&normalize(text.slice(preferred.length))===answer)return {prefix:expected.prefix,answer:text.slice(preferred.length)};
 const separated=splitNounArticle(input);if(separated.prefix&&separated.answer)return separated;
 const candidates=["de l'",'de la','une','les','des','aux','un','le','la','du',"l'",'en','au','à'].flatMap(prefix=>{const key=formatKey(prefix);return text.startsWith(key)&&text.length>key.length?[{prefix,answer:text.slice(key.length)}]:[];});
 return candidates.find(item=>normalize(item.answer)===answer)||candidates[0]||{prefix:'',answer:text};
}
function countJobFailure(job,today){if(!job)return false;if(job.pressureDate===today)return false;job.pressureDate=today;return true;}
export function checkAnswer(input, expected, fuzzy = true) {
  const answer = formatKey(input), correct = answer.length > 0 && (fuzzy ? normalize(answer) === normalize(expected) : answer === formatKey(expected));
  return { correct, fuzzy: correct && answer !== formatKey(expected), formatted:correct&&String(input).normalize('NFC')!==String(expected).normalize('NFC'), expected };
}
export function initialState(library) { return { schema: 1, library, settings: { colorTheme:'mist', learnGroupSize:5,reviewGroupSize:10,learnThreeErrorDefer:true,reviewThreeErrorPause:true,groupSize: 5, dailyGoal: 10, fuzzy: true, reviewMode: 'both', wordMotion:'slide', articleMode:'choice', sounds:true, notifications:true,reviewReminders:true,errorReminders:true,reviewErrorRetry:true,reminderTime:'08:00',shuffleLearning:false,errorAutoRemove:true }, progress: {}, sessions: {}, favorites: {}, errors: {}, errorHistory:{}, activity: {}, recentOptions: {}, lessonCompletions:{}, reminders:{} }; }
export function getProgress(data, p, w) { return data.progress[wordKey(p, w)] || { notebook: 'practice', forms: {} }; }
export function errorPracticeState(data,p,w,today=day()){
  const history=data.errorHistory?.[wordKey(p,w)]||{},errors=testedForms(w).map(f=>data.errors[`${wordKey(p,w)}:${f.id}`]).filter(Boolean);
  return {active:errors.length>0,errorCount:history.count??errors.reduce((sum,error)=>sum+(error.count||0),0),reviewCount:history.reviewCount||0,cycleReviews:history.cycleReviews||0,doneToday:history.lastReviewDate===today};
}
export function errorPracticeEligible(data,p,w,today=day()){const state=errorPracticeState(data,p,w,today);return state.active&&!state.doneToday;}
export function dedicatedPracticeState(data,p,w,mode='direct'){
  const count=data.directProgress?.[wordKey(p,w)]?.practiceCount||0;
  const errors=testedForms(w).map(f=>data.errors[`${wordKey(p,w)}:${f.id}`]).filter(Boolean);
  return {count,practiced:count>0&&(mode!=='errors'||errors.length>0&&errors.every(error=>error.practiced!==false))};
}
export function studyDays(data,p,w,today=day()){
  const r=getProgress(data,p,w),dates=[r.firstStudiedAt,r.learnedAt,...Object.values(r.forms||{}).map(f=>f.learnedAt)].filter(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)).sort();
  if(!dates.length)return 1;
  const calendar=value=>{const [y,m,d]=value.split('-').map(Number);return Date.UTC(y,m-1,d);};
  return Math.max(1,Math.floor((calendar(today)-calendar(dates[0]))/86400000)+1);
}
export function dueForms(data, p, w, today = day()) {
  if(studyPaused(data,p,w,today))return [];
  const r = getProgress(data, p, w);
  return r.notebook === 'review' ? testedForms(w).filter(f => nextReviewDate(r.forms[f.id],data.settings)&&nextReviewDate(r.forms[f.id],data.settings)<=today) : [];
}
export function reviewDaysLeft(data,p,w,today=day()){
  if(studyPaused(data,p,w,today)){const next=testedForms(w).flatMap(f=>getProgress(data,p,w).forms[f.id]?.remedialDates||[]).filter(date=>date>today).sort()[0];return next?Math.round((Date.parse(next+'T12:00:00')-Date.parse(today+'T12:00:00'))/86400000):1;}
  const r=getProgress(data,p,w),due=testedForms(w).map(f=>nextReviewDate(r.forms[f.id],data.settings)).filter(Boolean).sort()[0];
  if(!due)return null;
  const utc=value=>{const [y,m,d]=value.split('-').map(Number);return Date.UTC(y,m-1,d);};
  return Math.max(0,Math.round((utc(due)-utc(today))/86400000));
}
export function lessonStats(data,p,today=day()){
 const units=[...p.words.filter(isVocabularyWord).map(w=>[w]),...conjugationUnits(data,p).map(u=>u.cards)],result={total:units.length,practice:0,review:0,known:0,due:0,favorites:0};
 for(const cards of units){const records=cards.map(w=>getProgress(data,p,w)),place=records.some(r=>r.notebook==='practice'||r.pendingLearning)?'practice':records.every(r=>r.notebook==='known')?'known':'review';result[place]++;if(cards.some(w=>dueForms(data,p,w,today).length))result.due++;if(cards.some(w=>data.favorites[wordKey(p,w)]))result.favorites++;}
 result.completed=result.review+result.known;return result;
}
export function recordLessonCompletions(data) {
  data.lessonCompletions ||= {};
  for (const p of data.library) {
    const key=packageKey(p);
    if (data.lessonCompletions[key] || !p.words.length) continue;
    const units=[...p.words.filter(isVocabularyWord),...conjugationPracticeWords(data,p)],progress=units.map(w=>getProgress(data,p,w));
    if (progress.some(r=>r.notebook==='practice'||r.pendingLearning)) continue;
    const dates=units.flatMap((w,i)=>testedForms(w).map(f=>progress[i].forms[f.id]?.learnedAt||progress[i].learnedAt)).filter(Boolean).sort();
    if(dates.length)data.lessonCompletions[key]=dates.at(-1);
  }
}
function activity(data, today) { return data.activity[today] ||= { words: [], reviews: [], attempts: 0, correct: 0 }; }
function remember(data, p, w, today, review = false) {
  const a = activity(data, today), id = `${w.origin?.bookId||p.book.id}:${w.origin?.wordId||w.id}`;
  if (!a.words.includes(id)) a.words.push(id);
  if (review && !a.reviews.includes(id)) a.reviews.push(id);
}
function ensureProgress(data, p, w) { return data.progress[wordKey(p, w)] ||= { notebook: 'practice', forms: {} }; }
const ROUND_SIZE=5;
const roundSize=s=>s.mode==='review'?10:ROUND_SIZE;
const sequenceFor=s=>s.mode==='review'&&s.reviewMode==='spelling'?['spell']:['recognize','spell'];
function groupJobs(data,p,s,today=day()){
  return s.group.filter(id=>!s.doneWords.includes(id)).flatMap(id=>{
    const w=p.words.find(w=>w.id===id);if(!w)return [];
    const forms=s.mode==='review'?dueForms(data,p,w,today):s.mode==='errors'?(errorPracticeEligible(data,p,w,today)?testedForms(w).filter(f=>data.errors[`${wordKey(p,w)}:${f.id}`]):[]):testedForms(w);
    return forms.filter(f=>s.mode!=='learn'||!getProgress(data,p,w).forms[f.id]?.learnedAt).map((f,index)=>({wordId:id,formId:f.id,sequence:testsBothGenders(w)&&index>0?['spell']:sequenceFor(s),stage:0,failed:false}));
  });
}
function upgradeGenderRecognition(p,s){
  if(s.sharedRecognitionVersion===1||s.phase==='done'||!Array.isArray(s.jobs))return;
  const active=s.question||(s.feedback?.retry?s.feedback.question:null);
  for(const id of new Set(s.jobs.map(job=>job.wordId))){
    const word=p.words.find(w=>w.id===id);if(!word||!testsBothGenders(word))continue;
    const jobs=s.jobs.filter(job=>job.wordId===id);
    // Keep the visible question and its rejected choices. Only remove future
    // duplicate recognition stages; every form retains its own spelling job.
    const candidates=jobs.filter(job=>!job.reinforcement&&job.sequence.slice(job.stage).includes('recognize')&&job.sequence.slice(job.stage).includes('spell'));
    const visible=active?.wordId===id&&active.kind==='recognize'?candidates.find(job=>job.formId===active.formId):null;
    const answered=jobs.some(job=>job.sequence.slice(0,job.stage).includes('recognize'))||s.feedback?.wordId===id&&s.feedback.questionKind==='recognize'&&s.feedback.correct&&!s.feedback.retry;
    const keep=visible||(!answered?candidates[0]:null);
    for(const job of candidates)if(job!==keep)job.sequence=job.sequence.filter((kind,index)=>index<job.stage||kind!=='recognize');
  }
  s.sharedRecognitionVersion=1;
}
function upgradePracticeFlow(data,p,s){
  if(s.phase==='judge'){
    s.phase='practice';s.question=null;s.feedback=null;s.jobs=groupJobs(data,p,s);
  }else{
    s.jobs=(s.jobs||[]).map(job=>{
      const remaining=job.sequence.slice(job.stage).filter(kind=>kind!=='choose');
      return {...job,sequence:[...new Set(remaining.length?remaining:[job.reinforcement?'recognize':'spell'])],stage:0};
    });
    if(['judge','choose'].includes(s.question?.kind)||s.feedback?.questionKind==='choose'){s.question=null;s.feedback=null;}
  }
  s.flowVersion=2;delete s.judgments;delete s.judgeIndex;
}
function upgradeRounds(data,p,s){
  s.flowVersion=3;s.pending||=[];s.group||=[];s.doneWords||=[];s.jobs||=[];s.roundNumber||=1;
  const active=s.question?.wordId||s.feedback?.wordId;
  const previous=[...new Set([...s.group,...(active?[active]:[])])];
  const selected=previous.slice(0,roundSize(s));
  if(active&&!selected.includes(active))selected[selected.length?selected.length-1:0]=active;
  const deferred=previous.filter(id=>!selected.includes(id)&&!s.doneWords.includes(id));
  s.pending=[...new Set([...deferred,...s.pending])].filter(id=>!selected.includes(id));
  s.group=selected;s.doneWords=s.doneWords.filter(id=>selected.includes(id));s.total=selected.length;
  s.jobs=s.jobs.filter(job=>selected.includes(job.wordId));
  if(s.phase==='done')return;
  if(!selected.length){openRound(data,p,s,day());return;}
  if(!s.feedback&&s.question?.kind==='spell'&&s.jobs.some(j=>j.sequence[j.stage]==='recognize'))s.question=null;
  refresh(data,p,s,day());
}
const splitWaitingRounds=(count,size)=>Array.from({length:Math.ceil(count/size)},(_,i)=>Math.min(size,count-i*size));
function waitingRoundPlan(s,size){
  const plan=s.pendingRoundSizes;
  return s.pendingPlanBase===size&&Array.isArray(plan)&&plan.every(n=>Number.isInteger(n)&&n>0&&n<=15)&&plan.reduce((a,b)=>a+b,0)===s.pending.length?plan:splitWaitingRounds(s.pending.length,size);
}
export function appendLearningWords(data,p,s,ids=null,today=day()){
  if(!s||!(s.mode==='learn'||s.importedPractice&&s.importedCourseLearning!==false&&!s.importedRelearning))return;
  const included=new Set([...(s.group||[]).filter(id=>!(s.doneWords||[]).includes(id)),...(s.pending||[]),...(s.learningTailIds||[])]),scope=ids?new Set(ids):null;
  const added=p.words.filter(w=>isVocabularyWord(w)&&(!scope||scope.has(w.id))&&!included.has(w.id)&&!studyPaused(data,p,w,today)&&getProgress(data,p,w).notebook==='practice'&&testedForms(w).some(f=>!getProgress(data,p,w).forms[f.id]?.learnedAt)).map(w=>w.id);
  if(!added.length)return;
  if(s.tailReady){const tail=new Set(s.learningTailIds||[]);s.pending=s.pending.filter(id=>!tail.has(id));delete s.tailReady;delete s.pendingRoundSizes;}
  const size=preferredGroupSize(data.settings,s.mode),plan=waitingRoundPlan(s,size),oldCount=s.pending.length;
  s.pending.push(...added);
  let remaining=added.length;
  if(plan.length){const last=plan.length-1,fill=Math.min(15-plan[last],remaining);plan[last]+=fill;remaining-=fill;}
  if(remaining)plan.push(...splitWaitingRounds(remaining,size));
  s.pendingRoundSizes=plan;s.pendingPlanBase=size;
  s.progressTotal=(s.progressTotal??sessionProgressTotal({...s,pending:s.pending.slice(0,oldCount)}))+added.length;
}
function openRound(data,p,s,today){
  s.pending=[...new Set(s.pending)].filter(id=>{
    const w=p.words.find(w=>w.id===id);if(!w||studyPaused(data,p,w,today))return false;
    return s.mode==='review'?dueForms(data,p,w,today).length:s.mode==='errors'?errorPracticeEligible(data,p,w,today):s.mode==='favorites'?data.favorites[wordKey(p,w)]&&testedForms(w).length:s.mode==='direct'?testedForms(w).length:getProgress(data,p,w).notebook==='practice'&&testedForms(w).some(f=>!getProgress(data,p,w).forms[f.id]?.learnedAt);
  });
  if(!s.pending.length){s.phase='done';return;}
  if(s.mode==='errors')s.pending.sort((a,b)=>errorPracticeState(data,p,p.words.find(w=>w.id===b),today).errorCount-errorPracticeState(data,p,p.words.find(w=>w.id===a),today).errorCount);
  s.optionSets={};s.reviewSpellingShuffled=false;s.sharedRecognitionVersion=1;
  const size=preferredGroupSize(data.settings,s.mode),plan=waitingRoundPlan(s,size);
  s.tailRound=!!s.tailReady;delete s.tailReady;
  s.roundSize=s.tailRound?s.pending.length:plan.shift()||size;
  s.pendingRoundSizes=s.tailRound?[]:plan;s.pendingPlanBase=size;
  s.group=s.pending.splice(0,s.roundSize);
  if(s.tailRound)s.learningTailIds=(s.learningTailIds||[]).filter(id=>!s.group.includes(id));
  s.total=s.group.length;s.doneWords=[];s.mistakeWordIds=[];
  s.stats={attempts:0,correct:0};s.newKnownWordIds=[];s.question=null;s.feedback=null;s.phase='practice';
  s.jobs=groupJobs(data,p,s,today);refresh(data,p,s,today);
}

function completeForm(data, p, w, f, session, job, today) {
  if(['direct','errors','favorites'].includes(session.mode)){
    data.directProgress||={};const r=data.directProgress[wordKey(p,w)]||={forms:{}};
    r.forms[f.id]={completedAt:today,count:(r.forms[f.id]?.count||0)+1};
    if(session.mode==='errors'){
      if(data.errors[`${wordKey(p,w)}:${f.id}`])data.errors[`${wordKey(p,w)}:${f.id}`].practiced=true;
    }else if(getProgress(data,p,w).notebook==='practice'){
      const progress=ensureProgress(data,p,w);
      if(!progress.forms[f.id]?.learnedAt)progress.forms[f.id]=newReviewRecord(today);
    }
    return;
  }
  const progress = ensureProgress(data, p, w);
  if (session.mode === 'review') {
    const wasKnown=progress.notebook==='known';
    const r = progress.forms[f.id];
    completeReviewRecord(r,data.settings,today,!!job.failed);
    progress.notebook = testedForms(w).every(x => progress.forms[x.id]?.known) ? 'known' : 'review';
    if(!wasKnown&&progress.notebook==='known')rememberKnown(session,w);
  } else if (progress.notebook === 'practice' && !progress.forms[f.id]?.learnedAt) {
    progress.forms[f.id] = newReviewRecord(today);
  }
}
function finishWord(data, p, w, session, today) {
  if (session.doneWords.includes(w.id)) return;
  session.doneWords.push(w.id);
  if(session.mode==='errors'){
    data.errorHistory||={};const key=wordKey(p,w),history=data.errorHistory[key]||={count:0,reviewCount:0,cycleReviews:0};
    if(history.lastReviewDate!==today){history.reviewCount=(history.reviewCount||0)+1;history.cycleReviews=(history.cycleReviews||0)+1;history.lastReviewDate=today;}
    if(session.removeErrors&&history.cycleReviews>=2)for(const form of testedForms(w))delete data.errors[`${key}:${form.id}`];
  }
  if(['direct','errors','favorites'].includes(session.mode)){
    data.directProgress||={};const r=data.directProgress[wordKey(p,w)]||={forms:{}};
    r.lastPracticed=today;r.practiceCount=(r.practiceCount||0)+1;
    if(session.mode==='errors'||getProgress(data,p,w).notebook!=='practice'){remember(data,p,w,today);return;}
  }
  const progress = ensureProgress(data, p, w);
  if ((progress.notebook === 'practice'||progress.pendingLearning) && testedForms(w).every(f => progress.forms[f.id]?.learnedAt)) {
    delete progress.pendingLearning;
    const source=wordContext(data,p,w),learnedBefore=progress.learnedAt||data.library.some(other=>other.book.id===source.p.book.id&&other.words.some(x=>x.id===source.w.id&&getProgress(data,other,x).learnedAt));
    progress.firstStudiedAt ||= today;
    if(!learnedBefore)progress.newLearnedAt ||= today;
    progress.notebook='review';progress.learnedAt ||= today;
    if(['direct','favorites'].includes(session.mode))for(const s of Object.values(data.sessions).filter(s=>s.mode==='learn'&&s.lessonKey===packageKey(source.p))){
      const id=source.w.id;s.pending=s.pending.filter(item=>item!==id);s.jobs=s.jobs.filter(j=>j.wordId!==id);
      if(s.group.includes(id)&&!s.doneWords.includes(id))s.doneWords.push(id);
      if(s.question?.wordId===id||s.feedback?.wordId===id){s.question=null;s.feedback=null;}
      if(s.phase!=='done')refresh(data,source.p,s,today);
    }
  }
  progress.lastPracticed = today; progress.practiceCount = (progress.practiceCount || 0) + 1;
  remember(data, p, w, today, session.mode === 'review');
}
export function newWordIdsForDay(data,today=day()){
  const dates=new Map(),learned=new Map();
  for(const p of [...data.library,...conjugationPackages(data)])for(const w of p.words){
    const r=getProgress(data,p,w),id=`${p.book.id}:${w.id}`;
    if(r.learnedAt&&(!learned.has(id)||r.learnedAt<learned.get(id)))learned.set(id,r.learnedAt);
    const date=r.newLearnedAt||(!r.firstStudiedAt&&r.practiceCount>0?r.learnedAt:null);
    if(date&&(!dates.has(id)||date<dates.get(id)))dates.set(id,date);
  }
  return [...dates].filter(([id,date])=>date===today&&(!learned.has(id)||learned.get(id)>=date)).map(([id])=>id);
}
export function makeOptions(data, p, word, form, kind, random = Math.random, mode='learn', retained=[]) {
  const resolve=id=>p.words.find(w=>w.id===id||w.origin?.wordId===id)||practiceOptionWord(id);
  const correct={id:word.id,label:kind==='recognize'?primaryMeaning(word):displayForm(word,form)};
  const updated=retained.map(option=>{
    if(option.id===word.id)return correct;
    const source=resolve(option.id);
    return source&&kind==='recognize'?{...option,label:primaryMeaning(source)}:option;
  });
  const valid=kind==='recognize'?unambiguousChoices(updated,word,primaryMeaning(word),resolve):updated;
  if(valid.length===4&&new Set(valid.map(option=>option.id)).size===4&&valid.some(option=>option.id===word.id))return valid;
  const meaningSet = choiceMeaningKeys([primaryMeaning(word),...word.meanings]);
  const sharesMeaning = w => meaningsOverlap(meaningSet,optionMeaning(w).keys);
  const exactText=text=>String(text).normalize('NFC').toLocaleLowerCase('fr').replaceAll('’',"'").replace(/\s+/g,' ').trim();
  const sameText = w => w.forms.some(f => exactText(displayForm(w,f)) === exactText(displayForm(word,form)));
  const target=spellingParts(word,form).answer,shop=isShopVocabulary(target);
  const sameFamily=w=>w.forms.some(f=>sameWordFamily(target,spellingParts(w,f).answer));
  const local = p.words.filter(w => w.id !== word.id && (!p.reviewPool||w.origin.lessonKey===word.origin.lessonKey) && !sharesMeaning(w) && !sameText(w)&&!sameFamily(w));
  const learned = p.reviewPool?p.words.filter(w=>w.origin.lessonKey!==word.origin.lessonKey&&getProgress(data,p,w).notebook!=='practice'&&!sharesMeaning(w)&&!sameText(w)):data.library.filter(other => other.book.id === p.book.id && packageKey(other) !== packageKey(p)).flatMap(other => other.words.filter(w => getProgress(data, other, w).notebook !== 'practice' && !sharesMeaning(w) && !sameText(w)).map(w => ({ ...w })));
  const localIds=new Set(local.map(w=>w.id));
  const recentKey = `${wordKey(p, word)}:${form.id}:${kind}`;
  data.recentOptions||={};
  const recent = data.recentOptions[recentKey] || [];
  const seen = new Set([normalize(kind === 'recognize' ? primaryMeaning(word) : displayForm(word,form))]);
  const candidates = [];
  const meaningSeen = new Set(meaningSet);
  const seenIds=new Set([word.id]);
  for(const option of valid){
    if(seenIds.has(option.id)||candidates.length===3)continue;
    seenIds.add(option.id);seen.add(normalize(option.label));candidates.push(option);
    const source=resolve(option.id);
    for(const key of choiceMeaningKeys([option.label,...(source?.meanings||[])]))meaningSeen.add(key);
  }
  const shopPeers=shop?data.library.flatMap(p=>p.words).filter(w=>w.forms.some(f=>isShopVocabulary(spellingParts(w,f).answer))&&/[店铺房]|超市|商场/u.test(primaryMeaning(w))):[];
  const external=kind==='recognize'?[...shopPeers,...dictionaryCandidates(target)].filter(w=>(!w.lexiconId||w.lexiconId!==word.lexiconId)&&!sharesMeaning(w)&&!sameText(w)&&!sameFamily(w)):[];
  const otherLearned=learned.filter(w=>!sameFamily(w));
  // Relax only the spelling threshold if the nearby/same-lesson pool is short.
  // Keep all semantic, family and label checks when using common fallback words.
  const pools = (mode==='learn'?[local,otherLearned.concat(external)]:[local.concat(otherLearned,external)]).map(words=>({words,nearby:true}));
  pools.push({words:()=>[...data.library.flatMap(p=>p.words),...practiceDictionary],nearby:false});
  for (const {words,nearby} of pools) {
    if(candidates.length===3)break;
    const pool=typeof words==='function'?words():words;
    const shuffled = pool.filter(w=>!seenIds.has(w.id)&&!distractorExclusion(w)&&!sharesMeaning(w)&&!sameText(w)&&!sameFamily(w)).map(w => {
      const similarity=Math.max(...w.forms.map(f=>spellingSimilarity(target,spellingParts(w,f).answer))),r=random();
      const score=!nearby||similarity>=.5?similarity-(recent.includes(w.id)?.15:0):-1-(recent.includes(w.id)?.2:0);
      return {w,r,score,similarity};
    }).sort((a,b)=>b.score-a.score||a.r-b.r);
    for (const { w,similarity } of shuffled) {
      if(nearby&&!localIds.has(w.id)&&similarity<.45)continue;
      if(seenIds.has(w.id))continue;
      if(w.forms.every(f=>/^(?:se|s['’])$/iu.test(spellingParts(w,f).answer.trim())))continue;
      const f = testedForms(w)[0] || w.forms[0], label = kind === 'recognize' ? optionMeaning(w).label : displayForm(w,f);
      if (seen.has(normalize(label)) || w.id === word.id) continue;
      if(kind==='recognize'){
        const keys=optionMeaning(w).keys;
        if(meaningsOverlap(keys,meaningSeen))continue;
        for(const key of keys)meaningSeen.add(key);
      }
      seenIds.add(w.id);seen.add(normalize(label)); candidates.push({ id: w.id, label, pos:w.pos||w.sourcePos||'', french: w.forms.map(f=>displayForm(w,f)).join(" / ") });
      if (candidates.length === 3) break;
    }
    if (candidates.length === 3) break;
  }
  data.recentOptions[recentKey] = candidates.map(c => c.id);
  if(candidates.length!==3)throw new Error('选项无法准备，请重新进入练习 / Impossible de préparer les quatre choix. Réessayez.');
  // Retain valid saved choices in their positions and append replacements once.
  if(retained.length){const byId=new Map([correct,...candidates].map(option=>[option.id,option]));const options=[];for(const old of retained){if(byId.has(old.id)){options.push(byId.get(old.id));byId.delete(old.id);}}return [...options,...byId.values()];}
  const options = [correct, ...candidates];
  return options.map(o => ({ ...o, r: random() })).sort((a, b) => a.r - b.r).map(({ r, ...o }) => o);
}
export function repairSessionChoices(data,p,s){
  for(const q of [s.question,s.feedback?.question]){
    if(q?.kind!=='recognize')continue;
    const word=p.words.find(w=>w.id===q.wordId),form=word?.forms.find(f=>f.id===q.formId);
    if(!word||!form)continue;
    const options=makeOptions(data,p,word,form,q.kind,Math.random,s.mode,q.options||[]);
    if(JSON.stringify(options)!==JSON.stringify(q.options))q.options=options;
    s.optionSets||={};s.optionSets[word.id+'|'+q.kind]=clone(options);
    if(q.rejectedIds)q.rejectedIds=q.rejectedIds.filter(id=>options.some(option=>option.id===id));
  }
}
function rememberQuestionOptions(s){
  const q=s.question||s.feedback?.question;
  if(q)s.lastPresentedQuestion={wordId:q.wordId,kind:q.kind};
  if(q?.options?.length){s.optionSets||={};const key=q.wordId+'|'+q.kind;if(!s.optionSets[key])s.optionSets[key]=clone(q.options);}
}
function prunePausedWords(data,p,s,today){
 if(!s)return;
 if(s.deferredDate!==today){s.deferredDate=today;s.deferredWordIds=[];}
 if(!s.learningTailIds?.length&&!Object.values(data.studyPressure||{}).some(record=>record.pausedOn===today))return;
 const ids=new Set([...(s.group||[]),...(s.pending||[]),...(s.jobs||[]).map(job=>job.wordId)]),byId=new Map(p.words.map(w=>[w.id,w]));
 const paused=new Set([...ids].filter(id=>{const w=byId.get(id);return w&&(studyPaused(data,p,w,today)||!s.tailRound&&s.learningTailIds?.includes(id))&&!(s.doneWords||[]).includes(id);}));
 if(!paused.size)return;
 s.deferredWordIds||=[];const added=[...paused].filter(id=>!s.deferredWordIds.includes(id));s.deferredWordIds.push(...added);
 s.pending=(s.pending||[]).filter(id=>!paused.has(id));s.jobs=(s.jobs||[]).filter(job=>!paused.has(job.wordId));s.group=(s.group||[]).filter(id=>!paused.has(id));
 if(s.reviewDailyIds)s.reviewDailyIds=s.reviewDailyIds.filter(id=>!paused.has(id));
 if(s.mode!=='review'&&Number.isFinite(s.progressTotal))s.progressTotal=Math.max(s.doneWords?.length||0,s.progressTotal-added.filter(id=>!s.learningTailIds?.includes(id)).length);
 if(s.optionSets)for(const key of Object.keys(s.optionSets))if(paused.has(key.split('|')[0]))delete s.optionSets[key];
 if(paused.has(s.question?.wordId)&&!s.question.hinted)s.question=null;
}
function refresh(data, p, s, today) {
  upgradeGenderRecognition(p,s);
  prunePausedWords(data,p,s,today);
  repairSessionChoices(data,p,s);
  rememberQuestionOptions(s);
  if (s.feedback || s.question) return;
  if (!s.jobs.length) {if(!s.pending.length&&!s.tailRound&&s.learningTailIds?.length){s.pending=[...new Set(s.learningTailIds)];s.tailReady=true;}s.phase='done';return; }
  // Finish recognition for this round, including consolidation, before spelling.
  const recognize=s.jobs.findIndex(job=>job.sequence[job.stage]==='recognize');
  if(recognize>0)s.jobs.unshift(s.jobs.splice(recognize,1)[0]);
  if(recognize<0&&s.mode==='review'&&s.reviewSpellingShuffled===false){const before=s.jobs.map(j=>j.wordId+':'+j.formId);for(let i=s.jobs.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s.jobs[i],s.jobs[j]]=[s.jobs[j],s.jobs[i]];}if(s.jobs.length>1&&s.jobs.every((j,i)=>j.wordId+':'+j.formId===before[i]))s.jobs.push(s.jobs.shift());s.reviewSpellingShuffled=true;}
  if(recognize<0&&s.lastPresentedQuestion?.kind==='recognize'&&s.jobs[0]?.wordId===s.lastPresentedQuestion.wordId){
    const spaced=s.jobs.findIndex(job=>job.wordId!==s.lastPresentedQuestion.wordId&&job.sequence[job.stage]==='spell');
    if(spaced>0)s.jobs.unshift(s.jobs.splice(spaced,1)[0]);
  }
  const job = s.jobs[0], word = p.words.find(w => w.id === job.wordId), form = word.forms.find(f => f.id === job.formId);
  let kind = job.sequence[job.stage], options;
  if(kind!=='spell'){s.optionSets||={};const key=word.id+'|'+kind;const saved=makeOptions(data,p,word,form,kind,Math.random,s.mode,s.optionSets[key]||[]);s.optionSets[key]=clone(saved);options=shuffled(clone(saved));}
  s.lastPresentedQuestion={wordId:word.id,kind};
  s.question = { id: uid(), kind, wordId: word.id, formId: form.id, options, hinted: false };
}
// Refresh only the waiting queue on a new local day. Frozen work in the
// current round (including retry stages and choices) is retained.
function rollReviewDay(data,p,s,today){
  if(!s||s.mode!=='review')return;
  if((s.reviewDate||s.started)===today){
    if(!Array.isArray(s.reviewDailyIds)){
      const remaining=new Set([...(s.pending||[]),...(s.group||[]).filter(id=>!(s.doneWords||[]).includes(id))]);
      s.reviewDailyIds=[...remaining];
      s.reviewDailyCarry=Math.max(0,(s.progressTotal??sessionProgressTotal(s))-remaining.size);
    }
    return;
  }
  const active=new Set(s.phase==='done'?[]:(s.group||[]).filter(id=>!(s.doneWords||[]).includes(id)));
  const due=p.words.filter(w=>isVocabularyWord(w)&&dueForms(data,p,w,today).length).map(w=>w.id);
  const dueSet=new Set(due);
  const waiting=[...new Set(s.pending||[])].filter(id=>dueSet.has(id)&&!active.has(id));
  const queued=new Set([...active,...waiting]);
  const added=shuffled(due.filter(id=>!queued.has(id)));
  s.pending=[...waiting,...added];
  if(s.optionSets)s.optionSets=Object.fromEntries(Object.entries(s.optionSets).filter(([key])=>active.has(key.split('|')[0])));
  s.reviewDate=today;
  // The daily counter starts with today's unfinished words; yesterday's
  // completed groups are history, not work to repeat or count again today.
  s.reviewDailyIds=[...new Set([...active,...s.pending])];
  s.reviewDailyCarry=0;
  s.progressTotal=s.reviewDailyIds.length;
}
export function refreshReviewQueues(data,today=day()){
  const mixed=reviewPackage(data);
  for(const s of Object.values(data.sessions||{})){
    if(s.mode!=='review')continue;
    const p=s.lessonKey==='review:all'?mixed:data.library.find(p=>packageKey(p)===s.lessonKey);
    if(p)rollReviewDay(data,p,s,today);
  }
}
export function startSession(data, p, mode = 'learn', ids = null, today = day(), keyOverride = null) {
  migrateSessions(data);
  const key=keyOverride||sessionKey(p,mode,ids),old=data.sessions[key];
  if(mode==='learn'){reconcileLearningProgress(data,p);if(old)appendLearningWords(data,p,old,ids,today);}
  if(mode==='review')rollReviewDay(data,p,old,today);
  if(mode==='errors'&&old&&old.phase!=='done'){
    const eligible=new Set(p.words.filter(w=>errorPracticeEligible(data,p,w,today)).map(w=>w.id));
    old.pending=old.pending.filter(id=>eligible.has(id));old.jobs=old.jobs.filter(job=>eligible.has(job.wordId));
    for(const id of old.group)if(!eligible.has(id)&&!old.doneWords.includes(id))old.doneWords.push(id);
    if((old.question&&!eligible.has(old.question.wordId))||(old.feedback&&!eligible.has(old.feedback.wordId))){old.question=null;old.feedback=null;}
    refresh(data,p,old,today);
  }
  if (old && old.phase !== 'done') {refresh(data,p,old,today);touched(data,p,old);return old;}
  if(old?.pending.length){continueRound(data,p,key,today);if(old.phase!=='done')return old;}
  const words = ids ? p.words.filter(w => isVocabularyWord(w)&&ids.includes(w.id)) : p.words.filter(w => mode === 'review' ? dueForms(data, p, w, today).length :mode==='errors'?errorPracticeEligible(data,p,w,today): mode==='favorites'?!!data.favorites[wordKey(p,w)]:mode==='direct'||getProgress(data, p, w).notebook === 'practice');
  for(let i=words.length-1;i>=0;i--)if(!isVocabularyWord(words[i])||studyPaused(data,p,words[i],today))words.splice(i,1);
  if (!words.length) throw new Error(p.words.some(w=>studyPaused(data,p,w,today))?'今天的难词先暂停，明天继续 / Reprenez ces mots demain.':'暂无待练单词 / Aucun mot à pratiquer.');
  if(mode==='errors')words.sort((a,b)=>errorPracticeState(data,p,b,today).errorCount-errorPracticeState(data,p,a,today).errorCount);
  else if(mode==='favorites')words.sort((a,b)=>dedicatedPracticeState(data,p,a,mode).count-dedicatedPracticeState(data,p,b,mode).count);
  const s = { id: uid(), flowVersion:3, roundNumber:1, mode, reviewMode: data.settings.reviewMode || 'both', removeErrors:mode==='errors'&&data.settings.errorAutoRemove!==false,pending: (mode==='review'||mode==='learn'&&data.settings.shuffleLearning?shuffled(words):words).map(w => w.id), total: 0, doneWords: [], group: [], jobs: [], newKnownWordIds:[], acquiredWordIds:[], phase: 'practice', stats: { attempts: 0, correct: 0 }, started: today, question: null, feedback: null };
  if(mode==='review'){s.reviewDate=today;s.reviewDailyIds=words.map(w=>w.id);s.reviewDailyCarry=0;}
  s.progressTotal=words.length;s.key=key;s.lessonKey=packageKey(p);data.sessions[key] = s;touched(data,p,s);openRound(data,p,s,today); return s;
}
export function startMixedReview(data,today=day()){
  const p=reviewPackage(data),s=startSession(data,p,'review',null,today);
  for(const [key,old]of Object.entries(data.sessions))if(old.mode==='review'&&key!==MIXED_REVIEW_KEY){delete data.sessions[key];if(data.activeSessions?.[old.lessonKey]===key)delete data.activeSessions[old.lessonKey];}
  return s;
}
export function startFavoritePractice(data,today=day()){
  return startSession(data,reviewPackage(data),'favorites',null,today);
}
export function startErrorPractice(data,today=day()){
  return startSession(data,reviewPackage(data),'errors',null,today);
}
export function continueRound(data,p,key,today=day()){
  const s=getSession(data,p,key);rollReviewDay(data,p,s,today);if(!s||s.phase!=='done'||!s.pending.length)return s;
  s.roundNumber=(s.roundNumber||1)+1;openRound(data,p,s,today);touched(data,p,s);return s;
}
export function revealHint(data, p,key) {
  const s=getSession(data,p,key),q=s?.question;
  if(q&&q.kind==='spell'&&!q.hinted){
    const word=p.words.find(w=>w.id===q.wordId),form=word?.forms.find(f=>f.id===q.formId);
    if(word&&form){const today=day(),deferred=recordMistake(data,p,word,form,'',today,'hint',s,countJobFailure(s.jobs[0],today));if(deferred)q.deferral={date:today,wordId:word.id,learning:!!s.learningTailIds?.includes(word.id)};}
    q.hinted=true;s.jobs[0].needsReinforcement=true;s.jobs[0].failed=true;touched(data,p,s);
    prunePausedWords(data,p,s,day());
  }
}
function recordMistake(data,p,word,form,input,today,reason='answer',session=null,countDaily=true){
  const learningOnly=!!session&&(session.mode==='learn'||!['review','errors'].includes(session.mode)&&(session.importedPractice&&!session.importedRelearning||getProgress(data,p,word).notebook==='practice'));
  if(!learningOnly){
    data.errors||={};data.errorHistory||={};const base=wordKey(p,word),key=`${base}:${form.id}`,previous=data.errors[key];
    const active=testedForms(word).some(f=>data.errors[`${base}:${f.id}`]);
    const history=data.errorHistory[base]||={count:0,reviewCount:0,cycleReviews:0};
    if(!active)history.cycleReviews=0;
    const counted=session?(session.mistakeWordIds||=[]).includes(base):false;
    if(!counted){history.count=(history.count||0)+1;if(session)session.mistakeWordIds.push(base);}
    history.lastErrorDate=today;
    data.errors[key]={wordId:word.origin?.wordId||word.id,formId:form.id,lesson:word.origin?.lessonKey||packageKey(p),count:(previous?.count||0)+(counted?0:1),last:today,input:String(input),reason,practiced:false};
  }
  const deferred=countDaily?recordStudyFailure(data,p,word,today,learningOnly):studyPaused(data,p,word,today);if(deferred&&learningOnly){session.learningTailIds||=[];if(!session.learningTailIds.includes(word.id))session.learningTailIds.push(word.id);}return deferred;
}
export function retryAfterHint(data,p,today=day(),key){
  const s=getSession(data,p,key);if(!s?.question?.hinted)return;
  s.question=null;touched(data,p,s);refresh(data,p,s,today);
}
export function submitAnswer(data, p, id, input, today = day(),key) {
  const s = getSession(data,p,key);rollReviewDay(data,p,s,today);const q = s?.question;
  if (!q || q.id !== id || s.feedback || q.kind === 'judge') throw new Error('题目已更新，请继续 / Continuez avec la question actuelle.');
  rememberQuestionOptions(s);
  const job = s.jobs.shift(), word = p.words.find(w => w.id === q.wordId), form = word.forms.find(f => f.id === q.formId);
  let result;
  if (q.options) {
    const picked = q.options.find(o => o.id === input); if (!picked) { s.jobs.unshift(job); throw new Error('请选择一个选项 / Choisissez une réponse.'); }
    if((q.rejectedIds||[]).includes(picked.id)){s.jobs.unshift(job);return {correct:false,retryChoice:true};}
    result = { correct: picked.id === word.id, fuzzy: false, expected: q.kind === 'recognize' ? primaryMeaning(word) : displayForm(word,form) };
  } else {
    if (!String(input).trim()) { s.jobs.unshift(job); throw new Error('请输入答案 / Saisissez une réponse.'); }
    const parts=spellingParts(word,form),task=spellingTask(word,form,data.settings.articleMode||'choice');
    const parsed=formattedArticle(input,parts),needsArticle=['choice','typed'].includes(task.mode);
    if(needsArticle){
      const validArticle=task.mode==='choice'?parsed.prefix.toLocaleLowerCase('fr').replaceAll('’',"'")===parts.prefix.toLocaleLowerCase('fr').replaceAll('’',"'"):articleAgrees(word,form,parsed.prefix);
      result=checkAnswer(parsed.answer,parts.answer,data.settings.fuzzy);
      result.correct=result.correct&&validArticle;result.fuzzy=result.correct&&result.fuzzy;
      const prefix=validArticle?parsed.prefix:parts.prefix;
      result.expected=prefix+(/['’]$/.test(prefix)?'':' ')+parts.answer;
    }else{
      const full=parts.prefix&&(!!parsed.prefix||formatKey(input)===formatKey(parts.text));
      result=checkAnswer(input,full?parts.text:parts.answer,data.settings.fuzzy);result.expected=parts.text;
    }
    result.input=String(input).normalize('NFC');result.diff=spellingDiff(result.input,result.expected);result.formatted=result.correct&&result.input!==result.expected;
  }
  const a = activity(data, today); a.attempts++; s.stats.attempts++; if (result.correct) { a.correct++; s.stats.correct++; }
  if(!result.correct){job.failed=true;job.needsReinforcement=true;result.deferred=recordMistake(data,p,word,form,input,today,'answer',s,countJobFailure(job,today));result.learningDeferred=result.deferred&&!!s.learningTailIds?.includes(word.id);if(result.deferred)result.deferredOn=today;}
  if(q.options&&!result.correct&&!result.deferred){
    s.jobs.unshift(job);
    q.rejectedIds||=[];q.rejectedIds.push(input);touched(data,p,s);
    return {...result,retryChoice:true};
  }
  if(q.options&&result.deferred){q.rejectedIds||=[];q.rejectedIds.push(input);}
  const passed = result.correct && !q.hinted;
  if (passed) {job.stage++;delete job.pressureDate;}
  // A wrong or hinted answer stays first until answered independently.
  if (!passed&&!result.deferred) s.jobs.unshift(job);
  else if(passed) {
    if (job.stage < job.sequence.length) s.jobs.push(job);
    if (job.needsReinforcement) {
      if(!s.jobs.some(other=>other.wordId===word.id&&other.formId===form.id&&other.reinforcement)){
        s.jobs.push({wordId:word.id,formId:form.id,sequence:[q.kind],stage:0,failed:true,reinforcement:true});
      }
      delete job.needsReinforcement;
    }
  }
  // Pending consolidation is part of completion, including the last word.
  if(passed&&!s.jobs.some(other=>other.wordId===word.id&&other.formId===form.id)){
    completeForm(data, p, word, form, s, job, today);
    if (!s.jobs.some(j => j.wordId === word.id)) finishWord(data, p, word, s, today);
  }
  s.feedback = { ...result, hinted: q.hinted, wordId: word.id, formId: form.id, questionKind: q.kind, question: clone(q), input: String(input), retry:!passed };
  s.question = null;
  if(result.deferred)prunePausedWords(data,p,s,today);
  touched(data,p,s);
  return s.feedback;
}
export function advance(data, p, today = day(),key) { const s = getSession(data,p,key);rememberQuestionOptions(s);rollReviewDay(data,p,s,today); s.feedback = null;touched(data,p,s);refresh(data, p, s, today); }
export function moveWord(data,p,word,target,today=day()){
  if(!['practice','review','known'].includes(target))throw new Error('无效的词本 / Carnet invalide.');
  const original=wordContext(data,p,word);p=original.p;word=original.w;
  const r=ensureProgress(data,p,word),wasKnown=r.notebook==='known';r.notebook=target;delete r.pendingLearning;
  if(target==='practice')r.forms={};
  else{r.learnedAt||=today;for(const f of testedForms(word))r.forms[f.id]={...newReviewRecord(r.forms[f.id]?.learnedAt||r.learnedAt||today),known:target==='known',due:target==='known'?null:addDays(r.forms[f.id]?.learnedAt||r.learnedAt||today,1)};if(target==='known')remember(data,p,word,today);}
  for(const s of Object.values(data.sessions).filter(s=>!['errors','favorites'].includes(s.mode)&&(s.key===MIXED_REVIEW_KEY||(s.lessonKey||s.key?.split(':').slice(0,2).join(':'))===packageKey(p)||s.mode==='direct'&&s.lessonKey==='review:all'&&(s.importedPractice||s.dictionaryPractice)))){
    const mixed=s.lessonKey==='review:all'||s.key===MIXED_REVIEW_KEY,engine=mixed?reviewPackage(data):p,id=mixed?wordKey(p,word):word.id;
    const entry=engine.words.find(w=>w.id===id);if(!entry)continue;
    const inRound=s.group.includes(id),active=s.phase!=='done';
    if(target==='known'&&!wasKnown&&inRound&&s.mode==='review')rememberKnown(s,entry);
    s.pending=s.pending.filter(item=>item!==id);s.jobs=s.jobs.filter(job=>job.wordId!==id);
    if(target==='practice'){
      if(active&&inRound){s.doneWords=s.doneWords.filter(item=>item!==id);if(s.mode==='learn')s.jobs.push(...groupJobs(data,engine,{...s,group:[id]},today));else s.doneWords.push(id);}
      else if(s.mode==='learn')s.pending.unshift(id);
    }else if(active&&inRound&&!s.doneWords.includes(id))s.doneWords.push(id);
    if(s.question?.wordId===id||s.feedback?.wordId===id){s.question=null;s.feedback=null;}
    if(active)refresh(data,engine,s,today);
  }
}
export function markWordKnown(data,p,word,today=day()){
  const original=wordContext(data,p,word);p=original.p;word=original.w;
  moveWord(data,p,word,'known',today);
  for(const s of Object.values(data.sessions).filter(s=>s.lessonKey===packageKey(p)&&s.mode==='direct'||s.mode==='direct'&&(s.importedPractice||s.dictionaryPractice)&&s.lessonKey==='review:all'||s.key===MIXED_FAVORITES_KEY)){
    const mixed=s.lessonKey==='review:all',engine=mixed?reviewPackage(data):p,id=mixed?wordKey(p,word):word.id;
    const present=s.group.includes(id);
    s.pending=s.pending.filter(item=>item!==id);s.jobs=s.jobs.filter(job=>job.wordId!==id);
    if(present&&!s.doneWords.includes(id))s.doneWords.push(id);
    if(s.question?.wordId===id||s.feedback?.wordId===id){s.question=null;s.feedback=null;refresh(data,engine,s,today);}
  }
}
export function resetLessonProgress(data,p,today=day()){
  for(const word of p.words)moveWord(data,p,word,'practice',today);
  for(const word of conjugationPracticeWords(data,p)){const original=wordContext(data,p,word);moveWord(data,original.p,original.w,'practice',today);}
  const base=packageKey(p);
  for(const key of Object.keys(data.conjugationSessions||{}))if(key===base||key.startsWith(base+':'))delete data.conjugationSessions[key];
  for(const key of Object.keys(data.sessions))if(key===base||key.startsWith(base+':'))delete data.sessions[key];
  if(data.activeSessions)delete data.activeSessions[base];
  if(data.lastPractice?.lessonKey===base)delete data.lastPractice;
  if(data.lessonCompletions)delete data.lessonCompletions[base];
  for(const key of Object.keys(data.directProgress||{}))if(key.startsWith(base+':'))delete data.directProgress[key];
}
export function installLesson(data, pkg) {
  const key = packageKey(pkg), old = data.library.find(p => packageKey(p) === key);
  if (old && !old.demo && pkg.lesson.version <= old.lesson.version) throw new Error('版本必须高于已安装版本 / Une version plus récente est requise.');
  for (const other of data.library.filter(p => p.book.id === pkg.book.id && packageKey(p) !== key)) for (const w of pkg.words) {
    const found = other.words.find(x => x.id === w.id); if (!found) continue;
    if (found.pos !== w.pos || JSON.stringify(found.meanings) !== JSON.stringify(w.meanings)) throw new Error(`跨课词条冲突 / Conflit : ${w.id}`);
    for (const f of w.forms) {
      const same=found.forms.find(x=>x.id===f.id);
      // The same noun may be memorised with a different article in each lesson.
      const sameNoun=same&&w.pos==='n.'&&exact(spellingParts(found,same).answer).toLocaleLowerCase('fr')===exact(spellingParts(w,f).answer).toLocaleLowerCase('fr');
      const compatibleGender=same&&(same.gender===f.gender||(w.pos==='n.'&&(!same.gender||!f.gender)));
      if(same&&((same.text!==f.text&&!sameNoun)||!compatibleGender))throw new Error(`跨课形式冲突 / Conflit : ${f.id}`);
    }
  }
  data.reservedWordIds=[...new Set([...(data.reservedWordIds||[]),...data.library.flatMap(p=>p.words.map(w=>w.id)),...pkg.words.map(w=>w.id)])];
  data.library = [...data.library.filter(p => packageKey(p) !== key), pkg];
  for (const w of pkg.words) {
    const r = data.progress[wordKey(pkg, w)];
    if (r) r.notebook = testedForms(w).some(f => !r.forms[f.id]?.learnedAt) ? 'practice' : testedForms(w).every(f=>r.forms[f.id]?.known) ? 'known' : 'review';
  }
  // A changed course invalidates only that course's queue, never another lesson.
  for(const runKey of Object.keys(data.sessions))if(runKey===key||runKey.startsWith(key+':'))delete data.sessions[runKey];
  if(data.activeSessions)delete data.activeSessions[key];
  for(const review of [data.sessions[MIXED_REVIEW_KEY],data.sessions[MIXED_ERRORS_KEY],data.sessions[MIXED_FAVORITES_KEY]])if(review&&old){
    const pool=reviewPackage(data),words=new Map(pool.words.map(w=>[w.id,w]));
    const validJob=job=>words.get(job.wordId)?.forms.some(f=>f.id===job.formId&&f.tested);
    for(const field of ['pending','group','doneWords','newKnownWordIds','acquiredWordIds'])review[field]=(review[field]||[]).filter(id=>words.has(id));
    review.jobs=review.jobs.filter(validJob);review.total=review.group.length;
    if((review.question&&!validJob(review.question))||(review.feedback&&!validJob(review.feedback))){review.question=null;review.feedback=null;}
    if(review.phase!=='done')refresh(data,pool,review,day());
  }
}

export function recordConjugationAttempt(data,p,w,correct,session,reason='answer',today=day(),countDaily=true,countPressure=countDaily){
 const a=activity(data,today);if(countDaily){a.attempts++;if(correct)a.correct++;}if(!correct)return recordMistake(data,p,w,testedForms(w)[0],'',today,reason,session,countPressure);
}
export function completeConjugationWord(data,p,w,mode='learn',failed=false,today=day()){
 const current=getProgress(data,p,w);if(current.notebook==='known'&&mode!=='errors')return;
 const effective=mode==='errors'?'errors':mode==='review'&&current.notebook==='review'?'review':current.notebook==='practice'?'learn':'direct';
 const session={mode:effective,removeErrors:data.settings.errorAutoRemove!==false,doneWords:[],newKnownWordIds:[],acquiredWordIds:[]};
 for(const f of testedForms(w))completeForm(data,p,w,f,session,{failed},today);
 finishWord(data,p,w,session,today);
}
