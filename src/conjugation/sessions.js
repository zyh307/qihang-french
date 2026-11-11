import {conjugationSpeech} from './speech-text.js';
import {studyPaused,studyPressureKey} from '../domain/study-pressure.js';
import {preferredGroupSize} from '../domain/group-size.js';
import {MatchSession,smallGroups,wordKey as entryKey} from './match-engine.js';
import {primaryMeaning} from '../domain/meanings.js';
import {conjugations,conjugationPracticeWords,conjugationPackages,ensureConjugationCards,normalizePlan,lemmaFor,isIrregularLemma} from './catalog.js';
import {day,packageKey,wordKey,getProgress,dueForms,checkAnswer,completeConjugationWord,recordConjugationAttempt,wordContext,errorPracticeEligible} from '../domain/learning.js';
const keyFor=(v,t,p)=>`${v}|${t}|${p}`;
function mergeDailyReview(data,key,s){
 const today=day();if(s.mode!=='review'||s.reviewQueueDate===today||s.done||s.retired)return;
 const queued=new Set([...(s.engine.pending||[]).map(entryKey),...s.engine.groups.slice(s.engine.cursor+1).flatMap(group=>group.entries.map(entryKey)),...(s.engine.phase==='fill'?[]:(s.engine.entries||[]).map(entryKey))]);
 const pkg=key.startsWith('all:')?null:data.library.find(p=>key.startsWith(packageKey(p)+':'));
 const added=new Map(),refs=new Map();
 for(const {p,w}of pendingConjugations(data,pkg,'review')){
  const c=w.conjugation,unit=c.lemma+'|'+c.tense;if(queued.has(unit))continue;
  const e=added.get(unit)||{verbe:c.lemma,temps:c.tense,personnes:[],meaning:primaryMeaning(p.words.find(w=>w.id===c.baseWordId))||primaryMeaning(w)};
  if(!e.personnes.includes(c.person))e.personnes.push(c.person);added.set(unit,e);
  const id=keyFor(c.lemma,c.tense,c.person),list=refs.get(id)||[];list.push({lesson:packageKey(p),wordId:w.id});refs.set(id,list);
 }
 for(const [id,list]of refs)s.refs[id]=list;
 s.completedForms=s.completedForms.filter(id=>!refs.has(id));s.engine.completed_words=s.engine.completed_words.filter(id=>!added.has(id));
 s.engine.groups.push(...smallGroups([...added.values()],preferredGroupSize(data.settings,'review')).map(entries=>({entries})));
 const sameDay=!s.reviewQueueDate&&day(new Date(s.updatedAt||s.created))===today;const completed=sameDay?[...s.engine.completed_words]:[];s.reviewQueueDate=today;s.reviewDailyUnits=[...new Set([...queued,...added.keys(),...completed])];s.reviewDoneToday=completed;
}
export function pendingConjugations(data,pkg=null,mode='learn'){
 const packages=pkg?[{...pkg,words:conjugationPracticeWords(data,pkg)}]:conjugationPackages(data),unit=(p,w)=>packageKey(p)+':'+w.conjugation.baseWordId+':'+w.conjugation.tense,eligible=new Set();
 if(['review','errors'].includes(mode))for(const p of packages)for(const w of p.words)if(!w.studyDisabled&&(mode==='review'?dueForms(data,p,w).length:errorPracticeEligible(data,p,w)))eligible.add(unit(p,w));
 return packages.flatMap(p=>p.words.filter(w=>!w.studyDisabled&&!studyPaused(data,p,w,day())&&(['review','errors'].includes(mode)?eligible.has(unit(p,w)):mode==='learn'?getProgress(data,p,w).notebook==='practice':mode==='favorites'?!!data.favorites[wordKey(p,w)]:true)).map(w=>wordContext(data,p,w)));
}
export function startConjugationSession(data,pkg=null,mode='learn',scope=null){
 data.conjugationSessions||={};const key=(pkg?packageKey(pkg):'all')+':'+mode+(scope?':word:'+scope.baseWordId+':'+encodeURIComponent(scope.tense):''),old=data.conjugationSessions[key];
 if(old&&!old.done&&!old.retired){restoreMeanings(data,old);mergeDailyReview(data,key,old);const engine=engineFor(data,old);for(const e of [...(old.engine.entries||[]),...old.engine.groups.flatMap(g=>g.entries)])if(contexts(data,old,{...e,personne:e.personnes[0]}).some(({p,w})=>studyPaused(data,p,w,day()))){engine.defer(e);if(old.reviewDailyUnits&&!old.reviewDoneToday?.includes(entryKey(e)))old.reviewDailyUnits=old.reviewDailyUnits.filter(id=>id!==entryKey(e));}if(!old.engine.question){delete old.nextQuestion;conjugationQuestion(data,key);}if(old.nextQuestion){old.viewQuestion=old.nextQuestion;delete old.nextQuestion;}return key;}
 if(old?.retired){data.conjugationSessionArchive||=[];data.conjugationSessionArchive.push({key,...old});}
 const candidates=pendingConjugations(data,pkg,mode).filter(({w})=>!scope||(w.conjugation.baseWordId===scope.baseWordId&&w.conjugation.tense===scope.tense));if(!candidates.length)throw Error('暂无待练变位 / Aucune conjugaison à pratiquer.');const refs={},entries=new Map();
 for(const {p,w} of candidates){const c=w.conjugation,id=keyFor(c.lemma,c.tense,c.person);(refs[id]||=[]).push({lesson:packageKey(p),wordId:w.id});const base=p.words.find(base=>base.id===c.baseWordId),e=entries.get(c.lemma+'|'+c.tense)||{verbe:c.lemma,temps:c.tense,personnes:[],meaning:primaryMeaning(base)||primaryMeaning(w)};if(!e.personnes.includes(c.person))e.personnes.push(c.person);entries.set(c.lemma+'|'+c.tense,e);}
 const engine=MatchSession.create([...entries.values()],{mode:mode==='review'?'review':'learn',direct:true,groupSize:preferredGroupSize(data.settings,mode),settings:{fuzzy:data.settings.fuzzy}},{}).s;
 data.conjugationSessions[key]={schema:1,engine,refs,mode,paused:false,done:false,completedForms:[],mistakeWordIds:[],failedForms:[],created:Date.now(),updatedAt:Date.now(),...(mode==='review'?{reviewQueueDate:day(),reviewDailyUnits:[...entries.keys()],reviewDoneToday:[]}: {})};data.lastConjugationKey=key;conjugationQuestion(data,key);return key;
}
// Restore display text for saved rounds without changing their questions or progress.
function restoreMeanings(data,s){
 for(const e of [...(s.engine.entries||[]),...s.engine.groups.flatMap(g=>g.entries)]){
  if(e.meaning)continue;
  for(const person of e.personnes){
   for(const {p,w} of contexts(data,s,{...e,personne:person})){
    e.meaning=primaryMeaning(p.words.find(base=>base.id===w.conjugation.baseWordId))||primaryMeaning(w);
    if(e.meaning)break;
   }
   if(e.meaning)break;
  }
 }
}
function contexts(data,s,entry){return (s.refs[keyFor(entry.verbe,entry.temps,entry.personne)]||[]).flatMap(r=>{const p=data.library.find(p=>packageKey(p)===r.lesson),w=(data.conjugationDecks?.[r.lesson]||[]).find(w=>w.id===r.wordId);return p&&w?[{p,w}]:[];});}
function countConjugationVisit(s,e){const today=day(),engine=s.engine,unit=entryKey(e),token=today+':'+engine.phase+':'+(engine.phase==='match'?engine.board?.id:keyFor(e.verbe,e.temps,e.personne)+':'+(engine.pressureTurn||0));s.pressureFailureVisits||={};if(s.pressureFailureVisits[unit]===token)return false;s.pressureFailureVisits[unit]=token;return true;}
function engineFor(data,s){restoreMeanings(data,s);return new MatchSession(s.engine,{deferToTail:e=>contexts(data,s,e).some(({w})=>s.learningTailIds?.includes(w.id)),groupSize:preferredGroupSize(data.settings,s.mode),forms:conjugations,check:(a,b,f)=>checkAnswer(a,b,f).correct,known:()=>{},complete:()=>{},record:(correct,e)=>{const countPressure=correct?false:countConjugationVisit(s,e);if(correct&&s.engine.phase==='fill')s.engine.pressureTurn=(s.engine.pressureTurn||0)+1;let deferred=false;const seen=new Set(),pressures=new Set();for(const {p,w} of contexts(data,s,e)){const key=wordKey(p,w);if(seen.has(key))continue;seen.add(key);const pressure=studyPressureKey(p,w);deferred=!!recordConjugationAttempt(data,p,w,correct,s,'answer',day(),!pressures.has(pressure),countPressure&&!pressures.has(pressure))||deferred;pressures.add(pressure);}if(deferred&&s.reviewDailyUnits)s.reviewDailyUnits=s.reviewDailyUnits.filter(id=>id!==entryKey(e));if(!correct){const id=keyFor(e.verbe,e.temps,e.personne);if(!s.failedForms.includes(id))s.failedForms.push(id);}return deferred;}});}
export function conjugationQuestion(data,key){const s=data.conjugationSessions?.[key];if(!s)return null;const engine=engineFor(data,s);let q=engine.question();while(q.round==='judge')q=engine.answer({id:q.id,choice:3}).next;if(q.completed)s.done=true;s.viewQuestion=q;return q;}
export function answerConjugation(data,key,body){const s=data.conjugationSessions[key];if(s.paused||s.done)throw Error('请继续练习 / Reprenez la série.');mergeDailyReview(data,key,s);const engine=engineFor(data,s),q=s.engine.question,cursor=s.engine.cursor;const entry={verbe:q.verbe,temps:q.temps,personne:q.personne};const previousView=s.viewQuestion;const result=engine.answer(body);result.input=body.answer||'';result.formatted=q.round==='fill'&&result.correct&&result.input.normalize('NFC')!==result.expected.normalize('NFC');result.fuzzy=q.round==='fill'&&checkAnswer(body.answer,conjugations(q.verbe,q.temps)[q.personne],data.settings.fuzzy).fuzzy;result.spoken=result.correct?conjugationSpeech(q.round==='fill'?q.personne:(q.board.left_persons?.[body.person_key]||q.board.cards.find(card=>card.key===body.person_key)?.personne),result.expected):'';
 if(result.correct&&q.round==='fill'){
  const id=keyFor(entry.verbe,entry.temps,entry.personne);
  if(!s.engine.pending.some(e=>keyFor(e.verbe,e.temps,e.personne)===id)&&!s.completedForms.includes(id)){
   for(const {p,w} of contexts(data,s,entry))completeConjugationWord(data,p,w,s.mode,s.failedForms.includes(id));s.completedForms.push(id);
  }
  if(s.mode==='review'&&!s.engine.pending.some(e=>entryKey(e)===entryKey(entry))&&!s.engine.groups.slice(s.engine.cursor+1).some(g=>g.entries.some(e=>entryKey(e)===entryKey(entry)))){s.reviewDoneToday||=[];if(!s.reviewDoneToday.includes(entryKey(entry)))s.reviewDoneToday.push(entryKey(entry));}
 }
 if(s.engine.cursor!==cursor){s.mistakeWordIds=[];if(!result.next.completed)s.paused=true;}
 s.updatedAt=Date.now();data.lastConjugationKey=key;result.next=conjugationQuestion(data,key);s.nextQuestion=s.viewQuestion;s.viewQuestion=previousView;return result;
}
export function hintConjugation(data,key,questionId){
 const s=data.conjugationSessions[key],q=s?.engine.question;
 if(!q||q.round!=='fill'||s.done||s.paused||s.nextQuestion||(questionId&&q.id!==questionId)||s.viewQuestion?.id!==q.id)throw Error('题目已更新，请继续 / Continuez avec la question actuelle.');
 let deferred=false;
 if(!q.hinted){
  q.hinted=true;s.viewQuestion.hinted=true;
  const id=keyFor(q.verbe,q.temps,q.personne);s.engine.fill_retry||={};s.engine.fill_retry[id]=1;s.failedForms||=[];
  if(!s.failedForms.includes(id))s.failedForms.push(id);
  const countPressure=countConjugationVisit(s,q),pressures=new Set();for(const {p,w} of contexts(data,s,q)){const pressure=studyPressureKey(p,w);deferred=!!recordConjugationAttempt(data,p,w,false,s,'hint',day(),!pressures.has(pressure),countPressure&&!pressures.has(pressure))||deferred;pressures.add(pressure);}
  if(deferred){if(s.reviewDailyUnits)s.reviewDailyUnits=s.reviewDailyUnits.filter(id=>id!==entryKey(q));const previous=s.viewQuestion,engine=engineFor(data,s),cursor=s.engine.cursor;engine.defer(q);conjugationQuestion(data,key);if(s.engine.cursor!==cursor&&!s.done)s.paused=true;s.nextQuestion=s.viewQuestion;s.viewQuestion=previous;}
  s.updatedAt=Date.now();data.lastConjugationKey=key;
 }
 return {answer:conjugations(q.verbe,q.temps)[q.personne],deferred};
}
export function validateConjugationSessions(data){
 for(const s of Object.values(data.conjugationSessions||{})){
  if(s.schema!==1||!s.engine?.game||!Array.isArray(s.engine.groups)||!s.refs||!Array.isArray(s.completedForms)||!['learn','review','errors','direct','favorites'].includes(s.mode)||s.engine.groups.some(g=>!Array.isArray(g.entries)||g.entries.some(e=>typeof e.verbe!=='string'||!Array.isArray(e.personnes)||(!s.retired&&!s.done&&e.personnes.some(p=>!conjugations(e.verbe,e.temps)[p])))))throw Error('变位进度无效 / Progression invalide.');
  for(const refs of Object.values(s.refs))for(const ref of refs){const p=data.library.find(p=>packageKey(p)===ref.lesson);if(!p||![...p.words,...(data.conjugationDecks?.[ref.lesson]||[])].some(w=>w.id===ref.wordId&&w.conjugation))throw Error('变位进度与词条不符 / Mots incompatibles.');}
 }
}

export function advanceConjugationUI(data,key,automatic=false){const s=data.conjugationSessions[key];mergeDailyReview(data,key,s);if(s.nextQuestion){s.viewQuestion=s.nextQuestion;delete s.nextQuestion;}if(!automatic)s.paused=false;}

export function startWordConjugationPractice(data,entry,tense){
 const source=wordContext(data,entry.p,entry.w),p=data.library.find(item=>packageKey(item)===packageKey(source.p))||source.p,w=p.words.find(item=>item.id===source.w.id)||source.w,lemma=lemmaFor(w);
 if(!isIrregularLemma(lemma)||!Object.keys(conjugations(lemma,tense)).length)throw Error('暂无这个时态 / Temps indisponible.');
 const plan=normalizePlan(w.conjugationPlan);w.conjugationPlan={...plan,tenses:[...new Set([...plan.tenses,tense])]};
 ensureConjugationCards(data);
 return startConjugationSession(data,{...p,words:[w]},'direct',{baseWordId:w.id,tense});
}
