import {conjugationSpeech} from './speech-text.js';
import {MatchSession,wordKey as entryKey} from './match-engine.js';
import {primaryMeaning} from '../domain/meanings.js';
import {conjugations,conjugationPracticeWords,conjugationPackages} from './catalog.js';
import {day,packageKey,wordKey,getProgress,dueForms,checkAnswer,completeConjugationWord,recordConjugationAttempt,wordContext,errorPracticeEligible} from '../domain/learning.js';
const keyFor=(v,t,p)=>`${v}|${t}|${p}`;
export function pendingConjugations(data,pkg=null,mode='learn'){
 return (pkg?[{...pkg,words:conjugationPracticeWords(data,pkg)}]:conjugationPackages(data)).flatMap(p=>p.words.filter(w=>!w.studyDisabled&&(mode==='review'?dueForms(data,p,w).length:mode==='learn'?getProgress(data,p,w).notebook==='practice':mode==='errors'?errorPracticeEligible(data,p,w):true)).map(w=>wordContext(data,p,w)));
}
export function startConjugationSession(data,pkg=null,mode='learn'){
 data.conjugationSessions||={};const key=(pkg?packageKey(pkg):'all')+':'+mode,old=data.conjugationSessions[key];
 if(old&&!old.done&&!old.retired){restoreMeanings(data,old);if(old.nextQuestion){old.viewQuestion=old.nextQuestion;delete old.nextQuestion;}return key;}
 if(old?.retired){data.conjugationSessionArchive||=[];data.conjugationSessionArchive.push({key,...old});}
 const candidates=pendingConjugations(data,pkg,mode);if(!candidates.length)throw Error('暂无待练变位 / Aucune conjugaison à pratiquer.');const refs={},entries=new Map();
 for(const {p,w} of candidates){const c=w.conjugation,id=keyFor(c.lemma,c.tense,c.person);(refs[id]||=[]).push({lesson:packageKey(p),wordId:w.id});const base=p.words.find(base=>base.id===c.baseWordId),e=entries.get(c.lemma+'|'+c.tense)||{verbe:c.lemma,temps:c.tense,personnes:[],meaning:primaryMeaning(base)||primaryMeaning(w)};if(!e.personnes.includes(c.person))e.personnes.push(c.person);entries.set(c.lemma+'|'+c.tense,e);}
 const engine=MatchSession.create([...entries.values()],{mode:mode==='review'?'review':'learn',direct:true,settings:{fuzzy:data.settings.fuzzy}},{}).s;
 data.conjugationSessions[key]={schema:1,engine,refs,mode,paused:false,done:false,completedForms:[],mistakeWordIds:[],failedForms:[],created:Date.now(),updatedAt:Date.now()};data.lastConjugationKey=key;conjugationQuestion(data,key);return key;
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
function engineFor(data,s){restoreMeanings(data,s);return new MatchSession(s.engine,{forms:conjugations,check:(a,b,f)=>checkAnswer(a,b,f).correct,known:()=>{},complete:()=>{},record:(correct,e)=>{for(const {p,w} of contexts(data,s,e))recordConjugationAttempt(data,p,w,correct,s);if(!correct){const id=keyFor(e.verbe,e.temps,e.personne);if(!s.failedForms.includes(id))s.failedForms.push(id);}}});}
export function conjugationQuestion(data,key){const s=data.conjugationSessions?.[key];if(!s)return null;const engine=engineFor(data,s);let q=engine.question();while(q.round==='judge')q=engine.answer({id:q.id,choice:3}).next;if(q.completed)s.done=true;s.viewQuestion=q;return q;}
export function answerConjugation(data,key,body){const s=data.conjugationSessions[key];if(s.paused||s.done)throw Error('请继续练习 / Reprenez la série.');const engine=engineFor(data,s),q=s.engine.question,cursor=s.engine.cursor;const entry={verbe:q.verbe,temps:q.temps,personne:q.personne};const previousView=s.viewQuestion;const result=engine.answer(body);result.input=body.answer||'';result.fuzzy=q.round==='fill'&&checkAnswer(body.answer,conjugations(q.verbe,q.temps)[q.personne],data.settings.fuzzy).fuzzy;result.spoken=result.correct?conjugationSpeech(q.round==='fill'?q.personne:q.board.left_persons[body.person_key],result.expected):'';
 if(result.correct&&q.round==='fill'){
  const id=keyFor(entry.verbe,entry.temps,entry.personne);
  if(!s.engine.pending.some(e=>keyFor(e.verbe,e.temps,e.personne)===id)&&!s.completedForms.includes(id)){
   for(const {p,w} of contexts(data,s,entry))completeConjugationWord(data,p,w,s.mode,s.failedForms.includes(id));s.completedForms.push(id);
  }
 }
 if(s.engine.cursor!==cursor){s.mistakeWordIds=[];if(!result.next.completed)s.paused=true;}
 s.updatedAt=Date.now();data.lastConjugationKey=key;result.next=conjugationQuestion(data,key);s.nextQuestion=s.viewQuestion;s.viewQuestion=previousView;return result;
}
export function hintConjugation(data,key){const s=data.conjugationSessions[key],q=s.engine.question;if(q.round!=='fill')return '';const id=keyFor(q.verbe,q.temps,q.personne);s.engine.fill_retry[id]=1;if(!s.failedForms.includes(id))s.failedForms.push(id);for(const {p,w} of contexts(data,s,q))recordConjugationAttempt(data,p,w,false,s,'hint');return conjugations(q.verbe,q.temps)[q.personne];}
export function validateConjugationSessions(data){
 for(const s of Object.values(data.conjugationSessions||{})){
  if(s.schema!==1||!s.engine?.game||!Array.isArray(s.engine.groups)||!s.refs||!Array.isArray(s.completedForms)||!['learn','review','errors','direct'].includes(s.mode)||s.engine.groups.some(g=>!Array.isArray(g.entries)||g.entries.some(e=>typeof e.verbe!=='string'||!Array.isArray(e.personnes)||(!s.retired&&!s.done&&e.personnes.some(p=>!conjugations(e.verbe,e.temps)[p])))))throw Error('变位进度无效 / Progression invalide.');
  for(const refs of Object.values(s.refs))for(const ref of refs){const p=data.library.find(p=>packageKey(p)===ref.lesson);if(!p||![...p.words,...(data.conjugationDecks?.[ref.lesson]||[])].some(w=>w.id===ref.wordId&&w.conjugation))throw Error('变位进度与词条不符 / Mots incompatibles.');}
 }
}

export function advanceConjugationUI(data,key,automatic=false){const s=data.conjugationSessions[key];if(s.nextQuestion){s.viewQuestion=s.nextQuestion;delete s.nextQuestion;}if(!automatic)s.paused=false;}
