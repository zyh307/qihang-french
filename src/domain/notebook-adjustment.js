import {day,wordKey,packageKey,getProgress,moveWord,markWordKnown} from './learning.js';
import {TENSES,lemmaFor,conjugations,isConjugationVerb} from '../conjugation/catalog.js';
import {tenseCards,moveTense} from '../conjugation/tense-actions.js';
import {ensureImportedLessons,learnedNotebook,makeLearnedImportLookup,makeLearnedTenseLookup,removeImportedEntry,pruneImportedPractice,importedUnitScope,createAutomaticImportAllocator,importedMembershipSize,assertImportScopeCanExpand} from './quick-import.js';

export function notebookChoices(word){
 const lemma=word?.conjugation||isConjugationVerb(word)?lemmaFor(word):null;
 return [{id:'infinitive',zh:'原形',fr:'Infinitif'},...TENSES.filter(t=>lemma&&Object.keys(conjugations(lemma,t.id)).length).map(t=>({id:t.id,zh:t.id,fr:t.fr}))];
}
export const defaultNotebookSelection=(word,tense=null)=>word?.conjugation||tense?{infinitive:false,tenses:[tense||word.conjugation.tense]}:{infinitive:true,tenses:[]};
export function cleanNotebookSelection(word,selection){
 const available=new Set(notebookChoices(word).slice(1).map(t=>t.id));
 return {infinitive:selection?.infinitive===true,tenses:[...new Set((selection?.tenses||[]).filter(t=>available.has(t)))]};
}
const contains=(scope,selection)=>(!selection.infinitive||scope.infinitive)&&selection.tenses.every(t=>scope.tenses.includes(t));
const learnedBook=(data,{p,w})=>getProgress(data,p,w).notebook;
const removeFromLearnedBooks={
 known:{id:'practice',zh:'移出已会本',fr:'Retirer des acquis',icon:'book'},
 review:{id:'practice',zh:'移出复习本',fr:'Retirer des mots à réviser',icon:'book'},
 both:{id:'practice',zh:'移出已会本和复习本',fr:'Retirer des acquis et des révisions',icon:'book'},
};
export function notebookSelectionStatus(data,entry,selection){
 const {p,w}=entry,s=cleanNotebookSelection(w,selection),cards=s.tenses.flatMap(t=>tenseCards(data,entry,t));
 const units=[...(s.infinitive?[{p,w}]:[]),...cards],count=Number(s.infinitive)+s.tenses.length;
 const books=new Set(units.map(e=>learnedBook(data,e))),known=books.has('known'),review=books.has('review');
 const removeLearned=known&&review?removeFromLearnedBooks.both:known?removeFromLearnedBooks.known:review?removeFromLearnedBooks.review:null;
 return {selected:count,imported:count>0&&contains(importedUnitScope(data,p,w),s),favorite:units.length>0&&s.tenses.every(t=>tenseCards(data,entry,t).length>0)&&units.every(e=>!!data.favorites[wordKey(e.p,e.w)]),removeLearned};
}
function retireImportedTenses(data,entry,tenses){
 if(!tenses.length)return;
 const ids=new Set(tenses.flatMap(t=>tenseCards(data,entry,t)).map(e=>wordKey(e.p,e.w)));
 for(const [key,session]of Object.entries(data.conjugationSessions||{}))if(key.startsWith('imported:')&&!session.done&&Object.values(session.refs||{}).flat().some(r=>ids.has(r.lesson+':'+r.wordId)))session.retired=true;
}
export function applyNotebookSelection(data,entry,selection,action,at=Date.now()){
 const {p,w}=entry,s=cleanNotebookSelection(w,selection);
 if(!s.infinitive&&!s.tenses.length)throw Error('请选择词条 / Choisissez un élément.');
 if(!['practice','review','known','favorite','add-imported','remove-imported'].includes(action))throw Error('无效的词本操作 / Action invalide.');
 if(action==='practice'){
  if(s.infinitive&&learnedNotebook(learnedBook(data,entry)))moveWord(data,p,w,'practice');
  for(const tense of s.tenses)moveTense(data,entry,tense,'practice');
  return {skipped:[]};
 }
 ensureImportedLessons(data);
 const key=wordKey(p,w),prior=importedUnitScope(data,p,w),favorite=notebookSelectionStatus(data,entry,s).favorite;
 // Freeze legacy membership before enabling a newly selected tense.
 for(const book of ['imported']){const member=data.importedWords?.[key];if(member&&!member.units)member.units=importedUnitScope(data,p,w,book);}
 if(isConjugationVerb(w)&&!w.conjugationPlan&&!(data.conjugationDecks?.[packageKey(p)]||[]).some(card=>card.conjugation.baseWordId===w.id))w.conjugationPlan={infinitive:true,tenses:[]};
 if(s.infinitive&&w.conjugationPlan&&['review','known'].includes(action))w.conjugationPlan={...w.conjugationPlan,infinitive:true};
 if(action!=='remove-imported')for(const tense of s.tenses)tenseCards(data,entry,tense,true);
 if(action==='add-imported'){
  const accepted={...s,tenses:[...s.tenses]},skipped=[];
  if(s.infinitive&&makeLearnedImportLookup(data)({p,w})){accepted.infinitive=false;skipped.push('原形');}
  if(s.tenses.length){
   const learnedTense=makeLearnedTenseLookup(data);
   accepted.tenses=s.tenses.filter(t=>{if(learnedTense(lemmaFor(w),t)){skipped.push(t);return false;}return true;});
  }
  if(!accepted.infinitive&&!accepted.tenses.length)throw Error('已在已会本或复习本，无需导入 / Déjà acquis ou en révision.');
  assertImportScopeCanExpand(data,key,prior,accepted);
  if(accepted.infinitive&&w.conjugationPlan)w.conjugationPlan={...w.conjugationPlan,infinitive:true};
  const allocator=!data.importedWords[key]?createAutomaticImportAllocator(data):null;
  const member=data.importedWords[key]||={at,date:day(new Date(at))};
  member.units={infinitive:prior.infinitive||accepted.infinitive,tenses:[...new Set([...prior.tenses,...accepted.tenses])]};
  if(allocator)member.lessonId=allocator.take(importedMembershipSize(w,member));
  if(!data.importedWordOrder[key])data.importedWordOrder[key]=++data.importedWordSerial;
  ensureImportedLessons(data);return {skipped};
 }
 if(action==='remove-imported'){
  const next={infinitive:prior.infinitive&&!s.infinitive,tenses:prior.tenses.filter(t=>!s.tenses.includes(t))};
  if(data.importedWords[key]){
   if(!next.infinitive&&!next.tenses.length)removeImportedEntry(data,p,w,'imported',true);
   else{data.importedWords[key].units=next;if(s.infinitive)pruneImportedPractice(data,p,w);}
   retireImportedTenses(data,entry,s.tenses);
  }
  ensureImportedLessons(data);return {skipped:[]};
 }
 if(action==='favorite'){
  for(const e of [...(s.infinitive?[entry]:[]),...s.tenses.flatMap(t=>tenseCards(data,entry,t))]){const id=wordKey(e.p,e.w);if(favorite)delete data.favorites[id];else data.favorites[id]=true;}
 }else{
  if(s.infinitive){if(action==='known')markWordKnown(data,p,w);else moveWord(data,p,w,action);}
  for(const tense of s.tenses)moveTense(data,entry,tense,action);
 }
 return {skipped:[]};
}
