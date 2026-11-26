import index from './search-forms.json' with {type:'json'};

import {conjugations} from './catalog.js';
import {conjugationSearchKey,searchVariants} from './search-key.js';

export function searchLemmas(query){
 const key=conjugationSearchKey(query);
 if(!/^[a-z][a-z '-]*$/u.test(key))return new Set();
 const token='|'+key+'|';
 return new Set(index.filter(([,forms])=>forms.includes(token)).map(([lemma])=>lemma));
}

export function matchesSearchLemma(word,lemmas,query){
 if(!lemmas.size)return false;
 if(word.conjugation){
  const {lemma,tense}=word.conjugation;
  if(!lemmas.has(lemma))return false;
  if(!query||!tense)return true;
  const key=conjugationSearchKey(query);
  return Object.entries(conjugations(lemma,tense)).some(([person,raw])=>
   searchVariants(person,raw).some(form=>conjugationSearchKey(form)===key));
 }
 if(!/^v(?:[.\s]|$)|^verb/iu.test(word.pos||word.sourcePos||''))return false;
 return [word.word,word.lexiconWord,...(word.forms||[]).map(form=>form.text)].some(name=>name&&lemmas.has(name.toLocaleLowerCase('fr')));
}
