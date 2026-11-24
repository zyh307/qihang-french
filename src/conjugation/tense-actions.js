import {ensureConjugationCards,normalizePlan,lemmaFor,conjugations,conjugationUnits} from './catalog.js';
import {packageKey,wordKey,wordContext,getProgress,moveWord,studyDays,reviewDaysLeft,errorPracticeState,dedicatedPracticeState} from '../domain/learning.js';
export function tenseCards(data,entry,tense,prepare=false){
 const source=wordContext(data,entry.p,entry.w),p=data.library.find(p=>packageKey(p)===packageKey(source.p));if(!p)return [];
 const w=p.words.find(w=>w.id===(source.w.conjugation?.baseWordId||source.w.id));if(!w)return [];
 if(prepare){if(!Object.keys(conjugations(lemmaFor(w),tense)).length)throw Error('暂无这个时态 / Temps indisponible.');const plan=normalizePlan(w.conjugationPlan);w.conjugationPlan={...plan,tenses:[...new Set([...plan.tenses,tense])]};ensureConjugationCards(data);}
 return (data.conjugationDecks?.[packageKey(p)]||[]).filter(c=>c.conjugation.baseWordId===w.id&&c.conjugation.tense===tense).map(w=>({p,w}));
}
export function tenseStatus(data,entry,tense){const cards=tenseCards(data,entry,tense);return {known:cards.length>0&&cards.every(({p,w})=>getProgress(data,p,w).notebook==='known'),favorite:cards.length>0&&cards.every(({p,w})=>!!data.favorites[wordKey(p,w)])};}
export function moveTense(data,entry,tense,target){
 const cards=tenseCards(data,entry,tense,target!=='practice').filter(({p,w})=>target!=='practice'||['known','review'].includes(getProgress(data,p,w).notebook));
 if(!cards.length)return;
 const ids=new Set(cards.map(({p,w})=>wordKey(p,w))),lemma=cards[0].w.conjugation.lemma;
 for(const {p,w}of cards)moveWord(data,p,w,target);
 // A changed notebook must not resume stale questions for this tense.
 for(const s of Object.values(data.conjugationSessions||{}))if(!s.done&&(Object.values(s.refs||{}).flat().some(r=>ids.has(r.lesson+':'+r.wordId))||s.engine?.groups?.some(group=>group.entries.some(e=>e.verbe===lemma&&e.temps===tense))))s.retired=true;
}
export function favoriteTense(data,entry,tense){const selected=tenseStatus(data,entry,tense).favorite;for(const {p,w}of tenseCards(data,entry,tense,true))data.favorites[wordKey(p,w)]=!selected;}

export function tenseNotebookEntries(data,today){const entries=data.library.flatMap(p=>conjugationUnits(data,p).map(({w,cards})=>{
 const records=cards.map(c=>getProgress(data,p,c)),errors=cards.map(c=>errorPracticeState(data,p,c,today)).filter(e=>e.active),counts=cards.map(c=>dedicatedPracticeState(data,p,c).count),left=cards.filter(c=>getProgress(data,p,c).notebook==='review').map(c=>reviewDaysLeft(data,p,c,today)).filter(n=>n!==null);
 return {p,w,cards,tenseEntry:true,notebook:records.some(r=>r.notebook==='practice'||r.pendingLearning)?'practice':records.every(r=>r.notebook==='known')?'known':'review',favorite:cards.some(c=>data.favorites[wordKey(p,c)]),studyDays:Math.max(...cards.map(c=>studyDays(data,p,c,today))),daysLeft:left.length?Math.min(...left):null,errorCount:Math.max(0,...errors.map(e=>e.errorCount)),errorActive:errors.length>0,errorDoneToday:errors.length>0&&errors.every(e=>e.doneToday),practiceCount:errors.length?Math.min(...errors.map(e=>e.reviewCount)):Math.min(...counts),baseWordId:w.conjugation.baseWordId};
 }));
 // Prefer an imported membership when choosing the display anchor so the
 // imported notebook does not lose a tense stored under a different lesson.
 const groups=new Map(),imported=entry=>{const member=data.importedWords?.[packageKey(entry.p)+':'+entry.baseWordId];return !!member&&(!member.units||member.units.tenses.includes(entry.w.conjugation.tense));};
 for(const entry of entries){const c=entry.w.conjugation,key=c.lemma+'|'+c.tense,old=groups.get(key);if(!old||imported(entry)&&!imported(old))groups.set(key,entry);}
 return [...groups.values()];
}
