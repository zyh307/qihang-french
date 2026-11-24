import {readingSpellings,grammaticalKind,reviewedReading} from './word-readings.js';
import {vocabularyIdentity,preferVocabularyEntry} from './vocabulary-identity.js';
import {dictionaryEntry} from './quick-import.js';
import {primaryMeaningOptions,senseSignature} from './meanings.js';

const rowIndexes=new WeakMap(),libraryIndexes=new WeakMap();
function add(index,names,entry){for(const name of names){if(!index.has(name))index.set(name,[]);index.get(name).push(entry);}}
export function relatedWordSenses(rows,library,word){
 if(!word||word.conjugation)return [];
 let dictionary=rowIndexes.get(rows);
 if(!dictionary){dictionary=new Map();for(const row of rows)add(dictionary,readingSpellings(row),row);rowIndexes.set(rows,dictionary);}
 let courses=libraryIndexes.get(library);
 if(!courses){courses=new Map();for(const p of library)for(const w of p.words)if(!w.conjugation)add(courses,readingSpellings(w),{p,w});libraryIndexes.set(library,courses);}
 const p={dictionary:true,book:{id:'dictionary',title:'词库 · Dictionnaire'},lesson:{id:'all',title:'词库',order:1,version:1}},found=new Map(),kind=grammaticalKind(word.pos),reading=reviewedReading(word);
 const consider=entry=>{
  if(!entry.w.pos)return;
  if(grammaticalKind(entry.w.pos)===kind){
   const other=reviewedReading(entry.w);
   if(!reading||!other||reading.id===other.id)return;
  }
  const identity=vocabularyIdentity(entry.w);if(identity&&preferVocabularyEntry(entry,found.get(identity)))found.set(identity,entry);
 };
 for(const name of readingSpellings(word)){
  for(const entry of courses.get(name)||[])consider(entry);
  for(const row of dictionary.get(name)||[])consider({p,w:dictionaryEntry(row),dictionaryRow:row});
 }
 const visible=new Map();
 for(const entry of found.values()){
  const senses=primaryMeaningOptions(entry.w).map(senseSignature).filter(Boolean).sort().join(';');
  const label=grammaticalKind(entry.w.pos)+'|'+senses;
  if(preferVocabularyEntry(entry,visible.get(label)))visible.set(label,entry);
 }
 return [...visible.values()];
}
