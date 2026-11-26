import {searchLemmas,matchesSearchLemma} from '../conjugation/search.js';
import {conjugationSearchKey} from '../conjugation/search-key.js';
import {normalize} from './learning.js';
import {readingSpellings,grammaticalKind} from './word-readings.js';
import {splitNounArticle} from './word-display.js';
import pluralForms from '../lexicon/notebook-plurals.json' with {type:'json'};

const written=text=>String(text).normalize('NFC').replace(/[’‘]/gu,"'").trim().replace(/\s+/gu,' ').toLocaleLowerCase('fr');
const nounArticle=/^(?:un|une|des|du|le|la|les|de la|de l'|l')$/u;
const nameIndex=new WeakMap();
function pluralSpellings(word,kind,spellings){
 if(word.plural||!['n','adj'].includes(kind))return [];
 return [...new Set(spellings.flatMap(name=>{
  const form=written(name).replaceAll('œ','oe').replaceAll('æ','ae');
  const attested=pluralForms[kind+':'+form];
  if(attested)return attested.map(conjugationSearchKey);
  if(/^\p{L}+$/u.test(form)&&!/(?:[sxz]|al|ail|au|eu|ou)$/u.test(form))return [conjugationSearchKey(form+'s')];
  return [];
 }))];
}
export function notebookSearch(query){
 const needle=normalize(query);
 if(!needle)return null;
 const spelling=written(query),folded=conjugationSearchKey(query),lemmas=searchLemmas(query);
 const queryArticle=splitNounArticle(folded);
 const bareNoun=nounArticle.test(queryArticle.prefix)?queryArticle.answer:'';
 const plural= ['les','des'].includes(queryArticle.prefix)?queryArticle.answer:folded;
 return word=>{
  let names=nameIndex.get(word);
  if(!names){
   const spellings=readingSpellings(word);
   const kind=grammaticalKind(word.pos),noun=kind==='n';
   if(noun)for(const name of [...spellings]){
    const {prefix,answer}=splitNounArticle(name);
    if(nounArticle.test(written(prefix))&&answer)spellings.push(answer);
   }
   names={noun,written:spellings.map(written),folded:spellings.map(conjugationSearchKey),plural:pluralSpellings(word,kind,spellings),contains:normalize([...spellings,...(word.meanings||[])].join(' '))};
   nameIndex.set(word,names);
  }
  if(names.written.includes(spelling))return 0;
  if(names.folded.includes(folded)||bareNoun&&names.noun&&names.folded.includes(bareNoun))return 1;
  if(names.plural.includes(plural)||matchesSearchLemma(word,lemmas,query))return 2;
  if(names.folded.some(name=>name.startsWith(folded)))return 3;
  return names.contains.includes(needle)?4:Infinity;
 };
}
