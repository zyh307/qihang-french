import sourceCatalog from './source-catalog.json' with {type:'json'};
import irCatalog from './ir-catalog.json' with {type:'json'};
import audio from './audio.json' with {type:'json'};
import ipa from './phonetics.json' with {type:'json'};
import {conjugationSpeech,speechTextKey} from './speech-text.js';
import {verbMeanings} from './verb-meanings.js';
export const catalog={...irCatalog,...sourceCatalog};
export const PERSONS=['je','tu','il','nous','vous','ils'];
export const TENSES=[{id:'现在时',fr:'Présent'},{id:'复合过去时',fr:'Passé composé'},{id:'未完成过去时',fr:'Imparfait'}];
export const defaultPlan=()=>({infinitive:true,tenses:['现在时']});
export function normalizePlan(value){return {infinitive:value?.infinitive!==false,tenses:[...new Set(Array.isArray(value?.tenses)?value.tenses.filter(t=>TENSES.some(x=>x.id===t)):['现在时'])]};}
const lemmaKey=value=>speechTextKey(value).toLocaleLowerCase('fr');
export const lemmaFor=word=>word?.conjugation?.lemma||word?.forms?.map(f=>lemmaKey(f.text)).find(t=>Object.hasOwn(catalog,t))||null;
export const conjugations=(lemma,tense='现在时')=>catalog[lemmaKey(lemma)]?.[tense]||{};
export const isVerb=word=>!!word&&!word.conjugation&&(/^(v\.|v$|verb)/i.test(word.pos||'')||/^v[.\s]/i.test(word.sourcePos||''))&&!!lemmaFor(word);
export const isSupportedLemma=lemma=>Object.hasOwn(catalog,lemmaKey(lemma));
export const isConjugationVerb=isVerb;
export const sourceVerbEntries=()=>Object.keys(sourceCatalog).map(word=>({id:'conjugation:'+word,word,pos:'v.',meanings:verbMeanings[word].split('；'),ipa:ipa[word]||'',conjugationSource:true}));
// Compare attested forms, never generate missing forms for the learner.
const irregularCache=new Map();
export function isIrregularLemma(lemma){
 if(!lemma||!catalog[lemma])return false;if(irregularCache.has(lemma))return irregularCache.get(lemma);
 const present=conjugations(lemma),stem=lemma.slice(0,-2);let expected;
 if(lemma.endsWith('er')){expected=['e','es','e','ons','ez','ent'].map(e=>stem+e);if(lemma.endsWith('ger'))expected[3]=stem+'eons';if(lemma.endsWith('cer'))expected[3]=stem.slice(0,-1)+'çons';}
 else if(lemma.endsWith('ir'))expected=['is','is','it','issons','issez','issent'].map(e=>stem+e);
 else if(lemma.endsWith('re'))expected=['s','s','','ons','ez','ent'].map(e=>stem+e);
 const special=!expected||PERSONS.some((p,i)=>!present[p]||present[p].normalize('NFC')!==expected[i]);
 irregularCache.set(lemma,special);return special;
}
export const isIrregularVerb=word=>isVerb(word)&&isIrregularLemma(lemmaFor(word));
const lessonId=p=>p.book.id+':'+p.lesson.id;
// Derived forms live outside the imported vocabulary. A lesson keeps its original words.
export function conjugationPracticeWords(data,p){
 if(!p)return [];
 if(p.reviewPool)return p.words.filter(w=>!w.conjugation).flatMap(base=>{
  const lesson=base.origin?.lessonKey,wordId=base.origin?.wordId;
  return (data.conjugationDecks?.[lesson]||[]).filter(w=>w.conjugation.baseWordId===wordId&&!w.studyDisabled&&(!base.importedUnitTenses||base.importedUnitTenses.includes(w.conjugation.tense))).map(w=>({...w,id:lesson+':'+w.id,conjugation:{...w.conjugation,baseWordId:base.id},origin:{...base.origin,wordId:w.id,progressKey:lesson+':'+w.id}}));
 });
 const bases=new Set(p.words.filter(w=>!w.conjugation).map(w=>w.id));
 return (data.conjugationDecks?.[lessonId(p)]||[]).filter(w=>!w.studyDisabled&&bases.has(w.conjugation.baseWordId));
}
export const conjugationPackages=data=>data.library.map(p=>({...p,words:conjugationPracticeWords(data,p)}));
export const spokenForm=(lemma,tense,person)=>conjugationSpeech(person,conjugations(lemma,tense)[person]);
export function recording(text,id='conjugation'){
 const key=audio[speechTextKey(text)],value={id,text,speechText:text,audio:null,audioKey:key||'tts:'+encodeURIComponent(text)};
 return {...value,conjugationAudio:true,syntheticSpeech:!key};
}
export function ensureConjugationCards(data){
 data.conjugationDecks||={};
 // Migrate only our previously generated forms; retain their IDs and all progress.
 for(const p of data.library){const key=lessonId(p),previous=p.words.filter(w=>w.conjugation);if(previous.length){const deck=new Map((data.conjugationDecks[key]||[]).map(w=>[w.id,w]));for(const w of previous)deck.set(w.id,w);data.conjugationDecks[key]=[...deck.values()];p.words=p.words.filter(w=>!w.conjugation);}for(const w of p.words)if(w.conjugationPlan)delete w.studyDisabled;}
 const decks=Object.values(data.conjugationDecks).flat();
 const used=new Set([...(data.reservedWordIds||[]),...data.library.flatMap(p=>p.words.map(w=>w.id)),...decks.map(w=>w.id)]);let serial=1;
 const allocate=()=>{while(used.has('w'+String(serial).padStart(6,'0')))serial++;if(serial>999999)throw Error('词条编号已用完 / Identifiants épuisés.');const id='w'+String(serial++).padStart(6,'0');used.add(id);return id;};
 const known=new Map([...Object.entries(data.conjugationWordIds||{}),...decks.map(w=>[w.conjugation.baseWordId+'|'+w.conjugation.tense+'|'+w.conjugation.person,w.id])]);let added=0;
 for(const p of data.library){
  const deck=data.conjugationDecks[lessonId(p)]||=[];
  // Explicit imported tense memberships must remain backed by active cards,
  // including records made before import stopped replacing existing plans.
  for(const w of p.words){const member=data.importedWords?.[lessonId(p)+':'+w.id];if(!member?.units?.tenses?.length||!isConjugationVerb(w))continue;const plan=normalizePlan(w.conjugationPlan),selected=normalizePlan(member.units).tenses;w.conjugationPlan={...plan,tenses:[...new Set([...plan.tenses,...selected])]};}
  const byId=new Map(p.words.map(w=>[w.id,w]));
  for(const card of deck){const base=byId.get(card.conjugation.baseWordId),c=card.conjugation;card.studyDisabled=!isConjugationVerb(base)||c.lemma!==lemmaFor(base)||conjugations(c.lemma,c.tense)[c.person]!==c.form||!normalizePlan(base?.conjugationPlan).tenses.includes(c.tense);if(c.lemma==='prendre'&&c.tense==='现在时'&&c.person==='vous'&&c.form==='prenez'){for(const form of card.forms){const text=conjugationSpeech(c.person,c.form);Object.assign(form,recording(text,form.id),{ipa:ipa[speechTextKey(text)]||form.ipa});}}}
  const base=p.words.filter(isConjugationVerb),existing=new Set(deck.map(w=>w.conjugation.baseWordId+'|'+w.conjugation.tense+'|'+w.conjugation.person));let order=Math.max(0,...p.words.map(w=>w.order||0),...deck.map(w=>w.order||0));
  for(const w of base){const lemma=lemmaFor(w),plan=normalizePlan(w.conjugationPlan);
   for(const tense of plan.tenses)for(const person of PERSONS){const form=conjugations(lemma,tense)[person];if(!form||form==='—')continue;const identity=w.id+'|'+tense+'|'+person;if(existing.has(identity))continue;const id=known.get(identity)||allocate();known.set(identity,id);used.add(id);const text=conjugationSpeech(person,form),rec=recording(text,id+'-base');
    deck.push({id,order:++order,pos:'v.',sourcePos:'v. · '+tense,meanings:[...w.meanings],conjugation:{lemma,tense,person,baseWordId:w.id,form},forms:[{...rec,id:id+'-base',text,gender:null,tested:true,ipa:ipa[speechTextKey(text)]||ipa[form]||'',source:lemma+' · '+tense,questionHint:lemma+' · '+tense+' · '+person}]});existing.add(identity);added++;
   }
  }
 }
 for(const session of Object.values(data.conjugationSessions||{}))if(!session.done&&Object.values(session.refs||{}).flat().some(ref=>(data.conjugationDecks[ref.lesson]||[]).find(w=>w.id===ref.wordId)?.studyDisabled))session.retired=true;
 data.conjugationWordIds=Object.fromEntries(known);data.reservedWordIds=[...used];return added;
}
export const isVocabularyWord=w=>!w.conjugation&&!w.studyDisabled&&!(isConjugationVerb(w)&&w.conjugationPlan?.infinitive===false);
export async function prepareConjugationAudio(data,repository,fetcher=fetch){
 const keys=[...new Set([...data.library.flatMap(p=>p.words.flatMap(w=>w.forms.filter(f=>f.conjugationAudio).map(f=>f.audioKey))),...conjugationPackages(data).flatMap(p=>p.words.flatMap(w=>w.forms.map(f=>f.audioKey)))].filter(k=>k&&!k.startsWith('tts:')))];const assets=[];let cursor=0;
 await Promise.all(Array.from({length:Math.min(6,keys.length)},async()=>{while(cursor<keys.length){const id=keys[cursor++];if(await repository.audio(id))continue;const r=await fetcher(new URL('static/conjugation/audio/'+id+'.mp3',window.location.href));if(!r.ok)throw Error('变位录音读取失败 / Audio inaccessible.');const bytes=new Uint8Array(await r.arrayBuffer());const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==id)throw Error('变位录音校验失败 / Audio invalide.');assets.push({id,bytes});}}));return assets;
}

export function conjugationUnits(data,p){
 const groups=new Map();for(const w of conjugationPracticeWords(data,p)){const c=w.conjugation,key=c.lemma+'|'+c.tense;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(w);}
 return [...groups.values()].map(cards=>{
  const anchor=cards.find(card=>{const c=card.conjugation,base=c.baseWordId,key=base.includes(':')?base:(card.origin?.lessonKey||lessonId(p))+':'+base,member=data.importedWords?.[key];return member&&(!member.units||member.units.tenses.includes(c.tense));})||cards[0];
  return {cards,w:{...anchor,sourcePos:'v. · '+anchor.conjugation.tense,forms:[{...anchor.forms[0],text:anchor.conjugation.lemma,audioKey:null}],conjugationUnit:true,conjugationProgressKeys:cards.map(card=>card.origin?.progressKey||lessonId(p)+':'+card.id)}};
 });
}
