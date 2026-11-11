import {displayForm,splitNounArticle} from './word-display.js';

const inspire=p=>/^inspire[1-4]$/i.test(p?.book?.id||'');
export const sourceOrderedLibrary=library=>[...library].sort((a,b)=>Number(inspire(b))-Number(inspire(a)));
const canonical=text=>String(text||'').normalize('NFC').replace(/[’‘]/g,"'").trim().replace(/\s+/g,' ').toLocaleLowerCase('fr');
function names(word){
 return [...new Set([word.lexiconWord,...word.forms.map(form=>{
  const text=displayForm(word,form),parts=splitNounArticle(text);
  return word.pos==='n.'&&parts.answer?parts.answer:text;
 })].filter(Boolean).map(canonical))];
}
export function lessonSourceLabel(pkg){
 if(!pkg?.book)return '';
 const title=inspire(pkg)?'INSPIRE '+pkg.book.id.slice(-1):pkg.book.title.split(' · ')[0];
 return title+(pkg.lesson?.id&&pkg.lesson.id!=='all'?' · '+pkg.lesson.id:'');
}
// Resolve display attribution only; source IDs and learning records stay intact.
export function makeWordSourceLookup(data){
 const textbook=new Map();
 for(const p of sourceOrderedLibrary(data.library||[]))if(inspire(p))for(const w of p.words){
  if(w.conjugation)continue;
  for(const name of names(w))if(!textbook.has(name))textbook.set(name,lessonSourceLabel(p));
 }
 return (p,w)=>{
  if(w.fosAuthority?.source)return w.fosAuthority.source;
  for(const name of names(w))if(textbook.has(name))return textbook.get(name);
  const sourceKey=w.origin?.lessonKey,original=sourceKey?data.library.find(p=>p.book.id+':'+p.lesson.id===sourceKey):p;
  const key=w.origin?.progressKey||(sourceKey?sourceKey+':'+w.origin.wordId:p.book.id+':'+p.lesson.id+':'+w.id);
  const sequence=data.importedWordOrder?.[key];
  if((original?.book.id==='personal'||p.book.id==='imported')&&data.importedWords?.[key]&&Number.isSafeInteger(sequence)&&sequence>0)return '导入本 · L'+String(Math.floor((sequence-1)/30)+1).padStart(2,'0');
  return original?.book.id==='personal'?'导入本':lessonSourceLabel(original||p);
 };
}
