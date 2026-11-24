import {vocabularyIdentity,vocabularyFormKey,vocabularySourceScore,textbookPackage} from './vocabulary-identity.js';
import textbookContent from '../lexicon/vocabulary-content.json' with {type:'json'};
import {applyFormRelations} from './form-relations.js';
import {applyReviewedReading,reviewedReading} from './word-readings.js';
import {preferredNounAudio} from './word-display.js';

const copy=value=>JSON.parse(JSON.stringify(value));
export function vocabularyGroups(library){
 const groups=new Map();
 for(const p of library||[])for(const w of p.words||[]){
  if(reviewedReading(w)?.splitSense)applyReviewedReading(w);
  applyFormRelations(w);
  const key=vocabularyIdentity(w);if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({p,w});
 }
 return groups;
}
function preferred(entries){
 const direct=entries.filter(({p,w})=>{const source=w.vocabularyMerge?.source;return !source||source.bookId===p.book.id&&source.lessonId===p.lesson.id&&source.wordId===w.id;});
 return (direct.length?direct:entries).reduce((best,next)=>!best||vocabularySourceScore(next)>vocabularySourceScore(best)?next:best,null);
}
const sourceCache=new WeakMap();
function sourceIndex(library){
 let index=sourceCache.get(library);if(index)return index;
 index=new Map();for(const [key,members]of vocabularyGroups(library)){const source=preferred(members.filter(e=>textbookPackage(e.p)));if(source)index.set(key,source);}
 sourceCache.set(library,index);return index;
}
function applyContent(word,source,meanings){
 word.meanings=[...new Set([...meanings,...(word.meanings||[])])];
 if(!word.primaryMeaningChosen)word.primaryMeaning=source.w.primaryMeaning||source.w.meanings[0];
 for(const f of word.forms){
  const fresh=source.w.forms.find(candidate=>vocabularyFormKey(source.w,candidate)===vocabularyFormKey(word,f));if(!fresh)continue;
  for(const field of ['text','gender','ipa','audio','audioKey','audioOrigin','source','example','meaning','questionHint','registerLabel']){
   if(fresh[field]!==undefined)f[field]=copy(fresh[field]);else if(['meaning','questionHint'].includes(field))delete f[field];
  }
  if(fresh.audioKey){
   if(fresh.preferredArticleAudio)f.preferredArticleAudio=copy(fresh.preferredArticleAudio);
   else delete f.preferredArticleAudio;
  }
 }
 preferredNounAudio(word);
}
// Original lesson/word/form IDs and stored progress keys remain intact.
export function mergeVocabularyContent(data,sourceLibrary=textbookContent.library){
 let groups=0,entries=0;
 const originals=sourceIndex(sourceLibrary);
 for(const [key,members]of vocabularyGroups(data.library)){
  const source=originals.get(key)||preferred(members.filter(e=>textbookPackage(e.p)));if(!source)continue;
  const frozen={p:source.p,w:copy(source.w)},meanings=[...new Set([...(source.w.meanings||[]),...members.flatMap(e=>e.w.meanings||[])])];
  const origin=source.w.vocabularyMerge?.source||{bookId:source.p.book.id,title:source.p.book.title,lessonId:source.p.lesson.id,wordId:source.w.id};
  for(const {w}of members){applyContent(w,frozen,meanings);w.vocabularyMerge={revision:1,key,source:origin};entries++;}
  if(members.length>1)groups++;
 }
 return {groups,entries};
}
export function mergeVocabularyDictionary(rows,library,sourceLibrary=textbookContent.library){
 const groups=vocabularyGroups(library),sources=new Map(),originals=sourceIndex(sourceLibrary);
 for(const [key,members]of groups){const source=originals.get(key)||preferred(members.filter(e=>textbookPackage(e.p)));if(source)sources.set(key,{source,meanings:[...new Set([...(source.w.meanings||[]),...members.flatMap(e=>e.w.meanings||[])])]});}
 return rows.map(row=>{
  const match=sources.get(vocabularyIdentity(row));if(!match)return row;
  const {source,meanings}=match,f=source.w.forms[0],result={...row,meanings:[...new Set([...meanings,...row.meanings])],primaryMeaning:source.w.primaryMeaning||source.w.meanings[0],gender:f.gender||row.gender,ipa:f.ipa||row.ipa};
  if(f.audioKey){result.audioKey=f.audioKey;result.audioOrigin=f.audioOrigin;}
  if(f.example)result.example=copy(f.example);
  result.textbookText=f.text;
  result.textbookSource=f.source;
  result.vocabularySource=source.w.vocabularyMerge?.source||{bookId:source.p.book.id,title:source.p.book.title,lessonId:source.p.lesson.id,wordId:source.w.id};
  return result;
 });
}
