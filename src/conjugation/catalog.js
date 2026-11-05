import catalog from './source-catalog.json' with {type:'json'};
import audio from './audio.json' with {type:'json'};
import ipa from './phonetics.json' with {type:'json'};
import {conjugationSpeech,speechTextKey} from './speech-text.js';
import {verbMeanings} from './verb-meanings.js';
export const PERSONS=['je','tu','il','nous','vous','ils'];
export const TENSES=[{id:'现在时',fr:'Présent'},{id:'复合过去时',fr:'Passé composé'},{id:'未完成过去时',fr:'Imparfait'}];
export const defaultPlan=()=>({infinitive:true,tenses:['现在时']});
export function normalizePlan(value){return {infinitive:value?.infinitive!==false,tenses:[...new Set(Array.isArray(value?.tenses)?value.tenses.filter(t=>TENSES.some(x=>x.id===t)):['现在时'])]};}
export const lemmaFor=word=>word?.conjugation?.lemma||word?.forms?.map(f=>f.text.normalize('NFC').trim().replace(/[’‘]/g,"'").toLocaleLowerCase('fr')).find(t=>catalog[t])||null;
export const conjugations=(lemma,tense='现在时')=>catalog[lemma]?.[tense]||{};
export const isVerb=word=>!!word&&!word.conjugation&&(/^(v\.|v$|verb)/i.test(word.pos||'')||/^v[.\s]/i.test(word.sourcePos||''))&&!!lemmaFor(word);
// Eligibility follows the complete source app, including rendre and confondre.
export const isSupportedLemma=lemma=>Object.hasOwn(catalog,lemma);
export const isConjugationVerb=isVerb;
export const sourceVerbEntries=()=>Object.keys(catalog).map(word=>({id:'conjugation:'+word,word,pos:'v.',meanings:verbMeanings[word].split('；'),ipa:ipa[word]||'',conjugationSource:true}));
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
  return (data.conjugationDecks?.[lesson]||[]).filter(w=>w.conjugation.baseWordId===wordId&&!w.studyDisabled).map(w=>({...w,id:lesson+':'+w.id,conjugation:{...w.conjugation,baseWordId:base.id},origin:{...base.origin,wordId:w.id,progressKey:lesson+':'+w.id}}));
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
  const byId=new Map(p.words.map(w=>[w.id,w]));
  for(const card of deck){const base=byId.get(card.conjugation.baseWordId),c=card.conjugation;card.studyDisabled=!isConjugationVerb(base)||c.lemma!==lemmaFor(base)||conjugations(c.lemma,c.tense)[c.person]!==c.form||!normalizePlan(base?.conjugationPlan).tenses.includes(c.tense);}
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
 const groups=new Map();for(const w of conjugationPracticeWords(data,p)){const c=w.conjugation,key=c.baseWordId+'|'+c.tense;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(w);}
 return [...groups.values()].map(cards=>({cards,w:{...cards[0],sourcePos:'v. · '+cards[0].conjugation.tense,forms:[{...cards[0].forms[0],text:cards[0].conjugation.lemma,audioKey:null}],conjugationUnit:true}}));
}
