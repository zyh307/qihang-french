import { spellingParts, displayForm, splitNounArticle, spellingTask, articleAgrees } from './word-display.js';
import { spellingDiff } from './spelling-diff.js';
export const clone = v => JSON.parse(JSON.stringify(v));
export const day = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return day(d); };
export const packageKey = p => `${p.book.id}:${p.lesson.id}`;
export const wordKey = (p, w) => w?.origin?.progressKey || `${packageKey(p)}:${typeof w === 'string' ? w : w.id}`;
export const MIXED_REVIEW_KEY='review:all:review';
export const MIXED_ERRORS_KEY='review:all:errors';
export function reviewPackage(data){
  return {reviewPool:true,book:{id:'review',title:'复习 · Révision'},lesson:{id:'all',title:'混合复习 · Révision mélangée',order:0,version:1},words:data.library.flatMap(p=>p.words.map(w=>({...w,id:wordKey(p,w),origin:{progressKey:wordKey(p,w),lessonKey:packageKey(p),wordId:w.id,bookId:p.book.id}})))};
}
export function wordContext(data,p,w){
  if(!w?.origin)return {p,w};
  const original=data.library.find(item=>packageKey(item)===w.origin.lessonKey);
  return {p:original||p,w:original?.words.find(item=>item.id===w.origin.wordId)||w};
}
function shuffled(items,random=Math.random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function rememberKnown(session,word){
  session.newKnownWordIds||=[];session.acquiredWordIds||=[];
  if(!session.newKnownWordIds.includes(word.id))session.newKnownWordIds.push(word.id);
  if(!session.acquiredWordIds.includes(word.id))session.acquiredWordIds.push(word.id);
}
export const testedForms = w => w.forms.filter(f => f.tested);
export const sessionKey=(p,mode='learn',ids=null)=>`${packageKey(p)}${mode==='learn'?'':mode==='review'?':review':mode==='errors'?':errors'+(ids?.length?':'+[...new Set(ids)].sort().join(','):''):':direct:'+(ids?.length?[...new Set(ids)].sort().join(','):'all')}`;
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
  data.activeSessions||={};data.directProgress||={};
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
    data.activeSessions[s.lessonKey]||=key;
  }
  if(!data.lastPractice){const latest=Object.values(data.sessions).sort((a,b)=>(a.updatedAt||Date.parse(a.started+'T12:00:00'))-(b.updatedAt||Date.parse(b.started+'T12:00:00'))).at(-1);if(latest)data.lastPractice={lessonKey:latest.lessonKey,sessionKey:latest.key};}
  return data;
}
function touched(data,p,s){s.updatedAt=Date.now();data.activeSessions||={};data.activeSessions[packageKey(p)]=s.key;data.lastPractice={lessonKey:packageKey(p),sessionKey:s.key};}
export function sessionRemaining(s){
  if(!s||s.phase==='done')return 0;
  return s.group.filter(id=>!s.doneWords.includes(id)).length;
}
export function reviewLessons(data,today=day()){
  return [...data.library].sort((a,b)=>a.book.id.localeCompare(b.book.id)||a.lesson.order-b.lesson.order).filter(p=>{
    const s=data.sessions[sessionKey(p,'review')];
    return p.words.some(w=>dueForms(data,p,w,today).length)||(s&&s.phase!=='done');
  });
}
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const normalize = s => String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]/gu, '');
const exact = s => String(s ?? '').normalize('NFC').replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ');
export function checkAnswer(input, expected, fuzzy = true) {
  const answer = exact(input), correct = answer.length > 0 && (fuzzy ? normalize(answer) === normalize(expected) : answer === exact(expected));
  return { correct, fuzzy: correct && answer !== exact(expected), expected };
}
export function initialState(library) { return { schema: 1, library, settings: { groupSize: 5, dailyGoal: 10, fuzzy: true, reviewMode: 'both', wordMotion:'slide', articleMode:'choice', sounds:true, notifications:false,reminderTime:'08:00',shuffleLearning:false,errorAutoRemove:true }, progress: {}, sessions: {}, favorites: {}, errors: {}, activity: {}, recentOptions: {}, lessonCompletions:{}, reminders:{} }; }
export function getProgress(data, p, w) { return data.progress[wordKey(p, w)] || { notebook: 'practice', forms: {} }; }
export function studyDays(data,p,w,today=day()){
  const r=getProgress(data,p,w),dates=[r.firstStudiedAt,r.learnedAt,...Object.values(r.forms||{}).map(f=>f.learnedAt)].filter(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)).sort();
  if(!dates.length)return 1;
  const calendar=value=>{const [y,m,d]=value.split('-').map(Number);return Date.UTC(y,m-1,d);};
  return Math.max(1,Math.floor((calendar(today)-calendar(dates[0]))/86400000)+1);
}
export function dueForms(data, p, w, today = day()) {
  const r = getProgress(data, p, w);
  return r.notebook === 'review' ? testedForms(w).filter(f => r.forms[f.id]?.due && r.forms[f.id].due <= today) : [];
}
export function reviewDaysLeft(data,p,w,today=day()){
  const r=getProgress(data,p,w),due=testedForms(w).map(f=>r.forms[f.id]?.due).filter(Boolean).sort()[0];
  if(!due)return null;
  const utc=value=>{const [y,m,d]=value.split('-').map(Number);return Date.UTC(y,m-1,d);};
  return Math.max(0,Math.round((utc(due)-utc(today))/86400000));
}
export function lessonStats(data, p, today = day()) {
  const result = { total: p.words.length, practice: 0, review: 0, known: 0, due: 0, favorites: 0 };
  for (const w of p.words) { result[getProgress(data, p, w).notebook]++; if (dueForms(data, p, w, today).length) result.due++; if (data.favorites[wordKey(p, w)]) result.favorites++; }
  result.completed = result.review + result.known;
  return result;
}
export function recordLessonCompletions(data) {
  data.lessonCompletions ||= {};
  for (const p of data.library) {
    const key=packageKey(p);
    if (data.lessonCompletions[key] || !p.words.length) continue;
    const progress=p.words.map(w=>getProgress(data,p,w));
    if (progress.some(r=>r.notebook==='practice')) continue;
    const dates=p.words.flatMap((w,i)=>testedForms(w).map(f=>progress[i].forms[f.id]?.learnedAt||progress[i].learnedAt)).filter(Boolean).sort();
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
const sequenceFor=s=>s.mode==='review'&&s.reviewMode==='spelling'?['spell']:['recognize','spell'];
function groupJobs(data,p,s,today=day()){
  return s.group.filter(id=>!s.doneWords.includes(id)).flatMap(id=>{
    const w=p.words.find(w=>w.id===id);if(!w)return [];
    const forms=s.mode==='review'?dueForms(data,p,w,today):s.mode==='errors'?testedForms(w).filter(f=>data.errors[`${wordKey(p,w)}:${f.id}`]):testedForms(w);
    return forms.filter(f=>s.mode!=='learn'||!getProgress(data,p,w).forms[f.id]?.learnedAt).map(f=>({wordId:id,formId:f.id,sequence:sequenceFor(s),stage:0,failed:false}));
  });
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
  const selected=previous.slice(0,ROUND_SIZE);
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
function openRound(data,p,s,today){
  s.pending=[...new Set(s.pending)].filter(id=>{
    const w=p.words.find(w=>w.id===id);if(!w)return false;
    return s.mode==='review'?dueForms(data,p,w,today).length:s.mode==='errors'?testedForms(w).some(f=>data.errors[`${wordKey(p,w)}:${f.id}`]):s.mode==='direct'?testedForms(w).length:getProgress(data,p,w).notebook==='practice'&&testedForms(w).some(f=>!getProgress(data,p,w).forms[f.id]?.learnedAt);
  });
  if(!s.pending.length){s.phase='done';return;}
  s.group=s.pending.splice(0,ROUND_SIZE);s.total=s.group.length;s.doneWords=[];
  s.stats={attempts:0,correct:0};s.newKnownWordIds=[];s.question=null;s.feedback=null;s.phase='practice';
  s.jobs=groupJobs(data,p,s,today);refresh(data,p,s,today);
}
const schedule = [1, 3, 7, 14, 30];
function completeForm(data, p, w, f, session, job, today) {
  if(session.mode==='direct'||session.mode==='errors'){
    data.directProgress||={};const r=data.directProgress[wordKey(p,w)]||={forms:{}};
    r.forms[f.id]={completedAt:today,count:(r.forms[f.id]?.count||0)+1};
    if(session.mode==='errors'){
      if(session.removeErrors)delete data.errors[`${wordKey(p,w)}:${f.id}`];
    }else if(getProgress(data,p,w).notebook==='practice'){
      const progress=ensureProgress(data,p,w);
      if(!progress.forms[f.id]?.learnedAt)progress.forms[f.id]={learnedAt:today,reviewIndex:0,due:addDays(today,1),known:false};
    }
    return;
  }
  const progress = ensureProgress(data, p, w);
  if (session.mode === 'review') {
    const wasKnown=progress.notebook==='known';
    const r = progress.forms[f.id];
    if (job.failed) r.due = addDays(today, 1);
    else {
      const next = (r.reviewIndex ?? 0) + 1;
      r.reviewIndex = Math.min(next,schedule.length);
      r.known = next >= schedule.length;
      // Missing a date postpones the remaining sequence. Never skip a review.
      r.due = r.known ? null : addDays(today,schedule[next]-schedule[next-1]);
    }
    progress.notebook = testedForms(w).every(x => progress.forms[x.id]?.known) ? 'known' : 'review';
    if(!wasKnown&&progress.notebook==='known')rememberKnown(session,w);
  } else if (progress.notebook === 'practice' && !progress.forms[f.id]?.learnedAt) {
    progress.forms[f.id] = { learnedAt: today, reviewIndex: 0, due: addDays(today, 1), known: false };
  }
}
function finishWord(data, p, w, session, today) {
  if (session.doneWords.includes(w.id)) return;
  session.doneWords.push(w.id);
  if(session.mode==='direct'||session.mode==='errors'){
    data.directProgress||={};const r=data.directProgress[wordKey(p,w)]||={forms:{}};
    r.lastPracticed=today;r.practiceCount=(r.practiceCount||0)+1;
    if(session.mode==='errors'||getProgress(data,p,w).notebook!=='practice'){remember(data,p,w,today);return;}
  }
  const progress = ensureProgress(data, p, w);
  if (progress.notebook === 'practice' && testedForms(w).every(f => progress.forms[f.id]?.learnedAt)) {
    const learnedBefore=progress.learnedAt||data.library.some(other=>other.book.id===p.book.id&&other.words.some(x=>x.id===w.id&&getProgress(data,other,x).learnedAt));
    progress.firstStudiedAt ||= today;
    if(!learnedBefore)progress.newLearnedAt ||= today;
    progress.notebook='review';progress.learnedAt ||= today;
    if(session.mode==='direct')for(const s of Object.values(data.sessions).filter(s=>s.mode==='learn'&&s.lessonKey===packageKey(p))){
      s.pending=s.pending.filter(id=>id!==w.id);s.jobs=s.jobs.filter(j=>j.wordId!==w.id);
      if(s.group.includes(w.id)&&!s.doneWords.includes(w.id))s.doneWords.push(w.id);
      if(s.question?.wordId===w.id||s.feedback?.wordId===w.id){s.question=null;s.feedback=null;}
      if(s.phase!=='done')refresh(data,p,s,today);
    }
  }
  progress.lastPracticed = today; progress.practiceCount = (progress.practiceCount || 0) + 1;
  remember(data, p, w, today, session.mode === 'review');
}
export function newWordIdsForDay(data,today=day()){
  const dates=new Map(),learned=new Map();
  for(const p of data.library)for(const w of p.words){
    const r=getProgress(data,p,w),id=`${p.book.id}:${w.id}`;
    if(r.learnedAt&&(!learned.has(id)||r.learnedAt<learned.get(id)))learned.set(id,r.learnedAt);
    const date=r.newLearnedAt||(!r.firstStudiedAt&&r.practiceCount>0?r.learnedAt:null);
    if(date&&(!dates.has(id)||date<dates.get(id)))dates.set(id,date);
  }
  return [...dates].filter(([id,date])=>date===today&&(!learned.has(id)||learned.get(id)>=date)).map(([id])=>id);
}
export function makeOptions(data, p, word, form, kind, random = Math.random) {
  const meaningSet = new Set(word.meanings.map(normalize));
  const sharesMeaning = w => w.meanings.some(m => meaningSet.has(normalize(m)));
  const sameText = w => w.forms.some(f => normalize(displayForm(w,f)) === normalize(displayForm(word,form)));
  const local = p.words.filter(w => w.id !== word.id && (!p.reviewPool||w.origin.lessonKey===word.origin.lessonKey) && !sharesMeaning(w) && !sameText(w));
  const learned = p.reviewPool?p.words.filter(w=>w.origin.lessonKey!==word.origin.lessonKey&&getProgress(data,p,w).notebook!=='practice'&&!sharesMeaning(w)&&!sameText(w)):data.library.filter(other => other.book.id === p.book.id && packageKey(other) !== packageKey(p)).flatMap(other => other.words.filter(w => getProgress(data, other, w).notebook !== 'practice' && !sharesMeaning(w) && !sameText(w)).map(w => ({ ...w })));
  const recentKey = `${wordKey(p, word)}:${form.id}:${kind}`;
  const recent = data.recentOptions[recentKey] || [];
  const seen = new Set([normalize(kind === 'recognize' ? word.meanings.join('；') : displayForm(word,form))]);
  const candidates = [];
  const pools = [local.filter(w => w.pos === word.pos), local.filter(w => w.pos !== word.pos), learned];
  for (const pool of pools) {
    const shuffled = pool.map(w => ({ w, r: random() })).sort((a, b) => Number(recent.includes(a.w.id)) - Number(recent.includes(b.w.id)) || a.r - b.r);
    for (const { w } of shuffled) {
      const f = testedForms(w)[0] || w.forms[0], label = kind === 'recognize' ? w.meanings.join('；') : displayForm(w,f);
      if (seen.has(normalize(label)) || w.id === word.id) continue;
      seen.add(normalize(label)); candidates.push({ id: w.id, label });
      if (candidates.length === 3) break;
    }
    if (candidates.length === 3) break;
  }
  data.recentOptions[recentKey] = candidates.map(c => c.id);
  const options = [{ id: word.id, label: kind === 'recognize' ? word.meanings.join('；') : displayForm(word,form) }, ...candidates];
  return options.map(o => ({ ...o, r: random() })).sort((a, b) => a.r - b.r).map(({ r, ...o }) => o);
}
function refresh(data, p, s, today) {
  if (s.feedback || s.question) return;
  if (!s.jobs.length) { s.phase='done';return; }
  // Finish recognition for this round, including consolidation, before spelling.
  const recognize=s.jobs.findIndex(job=>job.sequence[job.stage]==='recognize');
  if(recognize>0)s.jobs.unshift(s.jobs.splice(recognize,1)[0]);
  const job = s.jobs[0], word = p.words.find(w => w.id === job.wordId), form = word.forms.find(f => f.id === job.formId);
  let kind = job.sequence[job.stage], options;
  if (kind !== 'spell') { options = makeOptions(data, p, word, form, kind); if (options.length < 2) { kind = 'spell'; options = undefined; } }
  s.question = { id: uid(), kind, wordId: word.id, formId: form.id, options, hinted: false };
}
export function startSession(data, p, mode = 'learn', ids = null, today = day()) {
  migrateSessions(data);
  const key=sessionKey(p,mode,ids),old=data.sessions[key];
  if (old && old.phase !== 'done') {touched(data,p,old);return old;}
  if(old?.pending.length){continueRound(data,p,key,today);if(old.phase!=='done')return old;}
  const words = ids ? p.words.filter(w => ids.includes(w.id)) : p.words.filter(w => mode === 'review' ? dueForms(data, p, w, today).length :mode==='errors'?testedForms(w).some(f=>data.errors[`${wordKey(p,w)}:${f.id}`]): mode==='direct'||getProgress(data, p, w).notebook === 'practice');
  if (!words.length) throw new Error('暂无待练单词 / Aucun mot à pratiquer.');
  const s = { id: uid(), flowVersion:3, roundNumber:1, mode, reviewMode: data.settings.reviewMode || 'both', removeErrors:mode==='errors'&&data.settings.errorAutoRemove!==false,pending: (mode==='review'||mode==='learn'&&data.settings.shuffleLearning?shuffled(words):words).map(w => w.id), total: 0, doneWords: [], group: [], jobs: [], newKnownWordIds:[], acquiredWordIds:[], phase: 'practice', stats: { attempts: 0, correct: 0 }, started: today, question: null, feedback: null };
  s.key=key;s.lessonKey=packageKey(p);data.sessions[key] = s;touched(data,p,s);openRound(data,p,s,today); return s;
}
export function startMixedReview(data,today=day()){
  const p=reviewPackage(data),s=startSession(data,p,'review',null,today);
  for(const [key,old]of Object.entries(data.sessions))if(old.mode==='review'&&key!==MIXED_REVIEW_KEY){delete data.sessions[key];if(data.activeSessions?.[old.lessonKey]===key)delete data.activeSessions[old.lessonKey];}
  return s;
}
export function startErrorPractice(data,today=day()){
  return startSession(data,reviewPackage(data),'errors',null,today);
}
export function continueRound(data,p,key,today=day()){
  const s=getSession(data,p,key);if(!s||s.phase!=='done'||!s.pending.length)return s;
  s.roundNumber=(s.roundNumber||1)+1;openRound(data,p,s,today);touched(data,p,s);return s;
}
export function revealHint(data, p,key) {
  const s=getSession(data,p,key),q=s?.question;
  if(q&&q.kind==='spell'){q.hinted=true;s.jobs[0].needsReinforcement=true;s.jobs[0].failed=true;touched(data,p,s);}
}
export function retryAfterHint(data,p,today=day(),key){
  const s=getSession(data,p,key);if(!s?.question?.hinted)return;
  s.question=null;touched(data,p,s);refresh(data,p,s,today);
}
export function submitAnswer(data, p, id, input, today = day(),key) {
  const s = getSession(data,p,key), q = s?.question;
  if (!q || q.id !== id || s.feedback || q.kind === 'judge') throw new Error('题目已更新，请继续 / Continuez avec la question actuelle.');
  const job = s.jobs.shift(), word = p.words.find(w => w.id === q.wordId), form = word.forms.find(f => f.id === q.formId);
  let result;
  if (q.options) {
    const picked = q.options.find(o => o.id === input); if (!picked) { s.jobs.unshift(job); throw new Error('请选择一个选项 / Choisissez une réponse.'); }
    if((q.rejectedIds||[]).includes(picked.id)){s.jobs.unshift(job);return {correct:false,retryChoice:true};}
    result = { correct: picked.id === word.id, fuzzy: false, expected: q.kind === 'recognize' ? word.meanings.join('；') : displayForm(word,form) };
  } else {
    if (!String(input).trim()) { s.jobs.unshift(job); throw new Error('请输入答案 / Saisissez une réponse.'); }
    const parts=spellingParts(word,form),task=spellingTask(word,form,data.settings.articleMode||'choice');
    const parsed=splitNounArticle(input),needsArticle=['choice','typed'].includes(task.mode);
    if(needsArticle){
      const validArticle=task.mode==='choice'?parsed.prefix.toLocaleLowerCase('fr').replaceAll('’',"'")===parts.prefix.toLocaleLowerCase('fr').replaceAll('’',"'"):articleAgrees(word,form,parsed.prefix);
      result=checkAnswer(parsed.answer,parts.answer,data.settings.fuzzy);
      result.correct=result.correct&&validArticle;result.fuzzy=result.correct&&result.fuzzy;
      const prefix=validArticle?parsed.prefix:parts.prefix;
      result.expected=prefix+(/['’]$/.test(prefix)?'':' ')+parts.answer;
    }else{
      const full=parts.prefix&&!!parsed.prefix;
      result=checkAnswer(input,full?parts.text:parts.answer,data.settings.fuzzy);result.expected=parts.text;
    }
    result.input=String(input).normalize('NFC');result.diff=spellingDiff(result.input,result.expected);
  }
  const a = activity(data, today); a.attempts++; s.stats.attempts++; if (result.correct) { a.correct++; s.stats.correct++; }
  if(q.options&&!result.correct){
    job.failed=true;job.needsReinforcement=true;s.jobs.unshift(job);
    const key=`${wordKey(p,word)}:${form.id}`;
    data.errors[key]={wordId:word.origin?.wordId||word.id,formId:form.id,lesson:word.origin?.lessonKey||packageKey(p),count:(data.errors[key]?.count||0)+1,last:today,input:String(input)};
    q.rejectedIds||=[];q.rejectedIds.push(input);touched(data,p,s);
    return {...result,retryChoice:true};
  }
  const passed = result.correct && !q.hinted;
  if (passed) job.stage++;
  else {
    if (!result.correct) {
      job.failed = true;
      job.needsReinforcement = true;
      const key = `${wordKey(p, word)}:${form.id}`;
      data.errors[key] = { wordId: word.origin?.wordId||word.id, formId: form.id, lesson: word.origin?.lessonKey||packageKey(p), count: (data.errors[key]?.count || 0) + 1, last: today, input: String(input) };
    }
  }
  // A wrong or hinted answer stays first until answered independently.
  if (!passed) s.jobs.unshift(job);
  else {
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
  touched(data,p,s);
  return s.feedback;
}
export function advance(data, p, today = day(),key) { const s = getSession(data,p,key); s.feedback = null;touched(data,p,s);refresh(data, p, s, today); }
export function moveWord(data,p,word,target,today=day()){
  if(!['practice','review','known'].includes(target))throw new Error('无效的词本 / Carnet invalide.');
  const original=wordContext(data,p,word);p=original.p;word=original.w;
  const r=ensureProgress(data,p,word),wasKnown=r.notebook==='known';r.notebook=target;
  if(target==='practice')r.forms={};
  else{r.learnedAt||=today;for(const f of testedForms(word))r.forms[f.id]={learnedAt:r.forms[f.id]?.learnedAt||today,reviewIndex:0,due:target==='known'?null:addDays(today,1),known:target==='known'};remember(data,p,word,today);}
  for(const s of Object.values(data.sessions).filter(s=>!['direct','errors'].includes(s.mode)&&(s.key===MIXED_REVIEW_KEY||(s.lessonKey||s.key?.split(':').slice(0,2).join(':'))===packageKey(p)))){
    const mixed=s.key===MIXED_REVIEW_KEY,engine=mixed?reviewPackage(data):p,id=mixed?wordKey(p,word):word.id;
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
  for(const s of Object.values(data.sessions).filter(s=>s.lessonKey===packageKey(p)&&s.mode==='direct')){
    const present=s.group.includes(word.id);
    s.pending=s.pending.filter(id=>id!==word.id);s.jobs=s.jobs.filter(job=>job.wordId!==word.id);
    if(present&&!s.doneWords.includes(word.id))s.doneWords.push(word.id);
    if(s.question?.wordId===word.id||s.feedback?.wordId===word.id){s.question=null;s.feedback=null;refresh(data,p,s,today);}
  }
}
export function resetLessonProgress(data,p,today=day()){
  for(const word of p.words)moveWord(data,p,word,'practice',today);
  const base=packageKey(p);
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
  for(const review of [data.sessions[MIXED_REVIEW_KEY],data.sessions[MIXED_ERRORS_KEY]])if(review&&old){
    const pool=reviewPackage(data),words=new Map(pool.words.map(w=>[w.id,w]));
    const validJob=job=>words.get(job.wordId)?.forms.some(f=>f.id===job.formId&&f.tested);
    for(const field of ['pending','group','doneWords','newKnownWordIds','acquiredWordIds'])review[field]=(review[field]||[]).filter(id=>words.has(id));
    review.jobs=review.jobs.filter(validJob);review.total=review.group.length;
    if((review.question&&!validJob(review.question))||(review.feedback&&!validJob(review.feedback))){review.question=null;review.feedback=null;}
    if(review.phase!=='done')refresh(data,pool,review,day());
  }
}
