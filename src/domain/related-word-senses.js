import nuances from '../lexicon/meaning-nuances.json' with {type:'json'};
import {readingSpellings,grammaticalKind,reviewedReading} from './word-readings.js';
import {vocabularyIdentity,preferVocabularyEntry} from './vocabulary-identity.js';
import {dictionaryEntry} from './quick-import.js';
import {primaryMeaningOptions,senseSignature} from './meanings.js';

const rowIndexes=new WeakMap(),libraryIndexes=new WeakMap();
function add(index,names,entry){for(const name of names){if(!index.has(name))index.set(name,[]);index.get(name).push(entry);}}
function wordIndexes(rows,library){
 let dictionary=rowIndexes.get(rows);
 if(!dictionary){dictionary=new Map();for(const row of rows)add(dictionary,readingSpellings(row),row);rowIndexes.set(rows,dictionary);}
 let courses=libraryIndexes.get(library);
 if(!courses){courses=new Map();for(const p of library)for(const w of p.words)if(!w.conjugation)add(courses,readingSpellings(w),{p,w});libraryIndexes.set(library,courses);}
 return {dictionary,courses};
}
const dictionaryPackage={dictionary:true,book:{id:'dictionary',title:'词库 · Dictionnaire'},lesson:{id:'all',title:'词库',order:1,version:1}};
const dictionaryResult=row=>({p:dictionaryPackage,w:dictionaryEntry(row),dictionaryRow:row});
export function relatedWordSenses(rows,library,word){
 if(!word||word.conjugation)return [];
 const {dictionary,courses}=wordIndexes(rows,library);
 const found=new Map(),kind=grammaticalKind(word.pos),reading=reviewedReading(word);
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
  for(const row of dictionary.get(name)||[])consider(dictionaryResult(row));
 }
 const visible=new Map();
 for(const entry of found.values()){
  const senses=primaryMeaningOptions(entry.w).map(senseSignature).filter(Boolean).sort().join(';');
  const label=grammaticalKind(entry.w.pos)+'|'+senses;
  if(preferVocabularyEntry(entry,visible.get(label)))visible.set(label,entry);
 }
 return [...visible.values()];
}

const synonymGroups=[
 ['adj','heureux','content','ravi'],
 ['adj','beau','joli'],
 ['adj','triste','malheureux'],
 ['adj','petit','minuscule'],
 ['v','commencer','débuter'],
 ['v','finir','terminer','achever'],
 ['v','choisir','sélectionner'],
 ['v','aider','assister'],
 ['n','commerce','magasin','boutique'],
 ['n','maison','habitation','logement'],
];
const confusableGroups=[
 ['n','menu','carte'],['n','glace','glaçon','sorbet'],['n','pot','boîte','bocal'],
 ['n','commerce','magasin','boutique'],['v','connaître','savoir'],['v','écouter','entendre'],
 ['v','regarder','voir'],['v','apporter','emporter','amener','emmener'],['n','jour','journée'],
 ['n','an','année'],['n','soir','soirée'],['n','fleuve','rivière'],['n','emploi','métier','profession'],
 ['n','bibliothèque','librairie'],['n','souvenir','mémoire'],['n','verre','gobelet','tasse'],
 ...synonymGroups,
];
function relationIndex(groups){
 const index=new Map();
 for(const [kind,...names] of groups)for(const name of names){
  const key=kind+'|'+name, peers=index.get(key)||new Set();
  for(const other of names)if(other!==name)peers.add(other);
  index.set(key,peers);
 }
 return index;
}
const synonymIndex=relationIndex(synonymGroups),confusableIndex=relationIndex(confusableGroups);
// Identical Chinese glosses can hide differences that matter in French.
const chinesePeers=new Map();
for(const [name,senses] of Object.entries(nuances))for(const {match,gloss} of senses){
 for(const term of match){
  if(!chinesePeers.has(term))chinesePeers.set(term,new Map());
  chinesePeers.get(term).set(name,gloss);
 }
}
const iceSense=word=>!['lex-glace-miroir','lex-glace-froideur'].includes(reviewedReading(word)?.id);
export function relatedSynonyms(rows,library,word,kindOfLink){
 if(!word||word.conjugation)return [];
 const kind=grammaticalKind(word.pos),spellings=readingSpellings(word);
 if(!iceSense(word))return [];
 const index=kindOfLink==='confusables'?confusableIndex:synonymIndex;
 const names=[...new Set(spellings.flatMap(name=>[...(index.get(kind+'|'+name)||[])]))].filter(name=>!spellings.includes(name));
 const notes=new Map();
 if(kindOfLink==='confusables')for(const source of spellings){
  for(const sense of nuances[source]||[])for(const term of sense.match){
   for(const [peer,gloss] of chinesePeers.get(term)||[]){
    if(!spellings.includes(peer)){notes.set(peer,gloss);if(!names.includes(peer))names.push(peer);}
   }
  }
 }
 if(spellings.includes('carte')&&notes.has('menu'))notes.set('menu',nuances.menu.find(row=>row.match.includes('套餐')).gloss);
 if(!names.length)return [];
 const {dictionary,courses}=wordIndexes(rows,library);
 return names.flatMap(name=>{
  const matches=(courses.get(name)||[]).filter(entry=>!entry.w.studyDisabled&&iceSense(entry.w)&&grammaticalKind(entry.w.pos)===kind);
  const best=matches.reduce((pick,entry)=>preferVocabularyEntry(entry,pick)?entry:pick,null);
  if(best)return [{...best,gloss:notes.get(name)}];
  const row=dictionary.get(name)?.find(row=>row.word===name&&iceSense(row)&&grammaticalKind(row.pos)===kind);
  return row?[{...dictionaryResult(row),gloss:notes.get(name)}]:[];
 });
}
