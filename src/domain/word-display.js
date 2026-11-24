// A written article belongs to the vocabulary entry. Only bare gendered nouns
// receive the default un/une; IDs and recordings remain independent of articles.
import {nounPresentation} from './noun-articles.js';
export function splitNounArticle(text) {
  const value=String(text??'').normalize('NFC').trim().replace(/\s+/g,' ');
  const match=/^(de la\s+|de l['’]\s*|(?:un|une|des|du|le|la|les|en|au|aux|à)\s+|l['’]\s*)(.*)$/i.exec(value);
  const articleOnly=/^(?:de la|de l['’]|un|une|des|du|le|la|les|en|au|aux|à|l['’])$/i.test(value);
  const prefix=match?match[1].trimEnd():articleOnly?value:'';
  const answer=match?match[2].trim():articleOnly?'':value;
  const lower=prefix.toLocaleLowerCase('fr');
  const gender=['un','le','du','au'].includes(lower)?'m':['une','la','de la'].includes(lower)?'f':null;
  return {prefix,answer,gender};
}
export function spellingParts(word, form) {
  if (!form) return { prefix: '', answer: '', text: '' };
  if(form.literal)return {prefix:'',answer:form.text,text:form.text};
  const parsed=splitNounArticle(form.text);
  // An article can itself be a vocabulary word, without a following noun.
  if(parsed.prefix&&!parsed.answer)return {prefix:'',answer:form.text,text:form.text};
  const transport=/^(?:en|à)\s+(?:pied|vélo|bicyclette|moto|scooter|cheval|trottinette|voiture|bus|autobus|car|train|tram|tramway|métro|avion|bateau|taxi|camion|ferry)(?:\b|$)/iu.test(form.text);
  const obvious=/^(?:un|une|des|du|le|la|les|de la|de l['’]|l['’])$/i.test(parsed.prefix);
  // Locutions such as au bout stay intact; a visible determiner is independent
  // of the imported part-of-speech label (e.g. les jeux pour enfants).
  if(!transport&&!obvious&&!(word?.pos==='n.'&&!parsed.prefix))return {prefix:'',answer:form.text,text:form.text};
  const preferred=nounPresentation(word,form),usePreferred=!!preferred&&(preferred.replaceArticle||!parsed.prefix||/^(?:un|une)$/i.test(parsed.prefix));
  const prefix=usePreferred?preferred.article:parsed.prefix||(word?.pos==='n.'&&/\bpl\.?\b/i.test(word.sourcePos||'')?'des':form.gender==='m'?'un':form.gender==='f'?'une':'');
  const answer=usePreferred?preferred.word:parsed.answer;
  return {prefix,answer,text:prefix?`${prefix}${/['’]$/.test(prefix)?'':' '}${answer}`:answer,transport};
}
export const displayForm = (word, form) => spellingParts(word, form).text;
export function nounGender(word,form){
  return form?.gender||splitNounArticle(form?.text).gender||(/n\.?m/i.test(word?.sourcePos||'')?'m':/n\.?f/i.test(word?.sourcePos||'')?'f':null);
}
const exactSpelling=value=>String(value||'').normalize('NFC').replaceAll('’',"'").replace(/\s+/gu,' ').trim().toLocaleLowerCase('fr');
export function preferredNounAudio(word){
  for(const form of word.forms||[]){
    const saved=form.preferredArticleAudio;
    if(saved&&form.audioKey===saved.replacement)form.audioKey=saved.original;
    delete form.preferredArticleAudio;
    const rule=nounPresentation(word,form);
    if(!rule)continue;
    const spoken=rule.article+(/'$/.test(rule.article)?'':' ')+rule.word;
    if(exactSpelling(displayForm(word,form))!==exactSpelling(spoken))continue;
    const replacement='tts:'+encodeURIComponent(spoken);
    if(form.audioKey===replacement)continue;
    if(form.audioKey&&!form.audioKey.startsWith('tts:')&&exactSpelling(spoken)===exactSpelling(form.text))continue;
    form.preferredArticleAudio={original:form.audioKey,replacement};
    form.audioKey=replacement;
  }
}
const formSense=(word,form)=>exactSpelling((!listedCommonGender(word,form)&&(form.meaning||form.example?.meaning))||word.primaryMeaning||word.meanings?.[0]);
// Some imports duplicate a masculine spelling. Verify common-gender nouns
// independently before offering both articles as a hint.
const commonGenderNouns=new Set([
  'architecte','artiste','astronaute','athlète','bénévole','bibliothécaire','camarade',
  'collègue','dentiste','élève','hydrologue','journaliste','médecin','peintre',
  'pilote','pneumologue','responsable','stagiaire','tabacologue','touriste','urbaniste',
]);
function listedCommonGender(word,form){return word?.pos==='n.'&&commonGenderNouns.has(exactSpelling(spellingParts(word,form).answer));}
function isPlural(word,form){
  const {prefix}=spellingParts(word,form);
  return /^(des|les)$/i.test(prefix)||(!prefix&&/\bpl\.?\b/i.test(word?.sourcePos||''));
}
export function equivalentGenderForms(word,form){
  if(!form||!word||word.forms?.length<2||word.conjugation||!['m','f'].includes(nounGender(word,form)))return form?[form]:[];
  const answer=exactSpelling(spellingParts(word,form).answer),sense=formSense(word,form);
  const same=(word.forms||[]).filter(candidate=>['m','f'].includes(nounGender(word,candidate))&&exactSpelling(spellingParts(word,candidate).answer)===answer&&formSense(word,candidate)===sense&&isPlural(word,candidate)===isPlural(word,form));
  return new Set(same.map(candidate=>nounGender(word,candidate))).size===2?same:[form];
}
export function isCommonGenderNoun(word,form){
  return !!form&&listedCommonGender(word,form)&&!isPlural(word,form);
}
export function sharedPracticeForms(word,form){
  const identical=equivalentGenderForms(word,form);
  if(identical.length>1||!form||word?.conjugation||!['n.','adj.'].includes(word?.pos)||word.forms.length!==2)return identical;
  const male=word.forms.find(candidate=>nounGender(word,candidate)==='m');
  const female=word.forms.find(candidate=>nounGender(word,candidate)==='f');
  if(!male||!female||!word.forms.includes(form)||formSense(word,male)!==formSense(word,female)||isPlural(word,male)!==isPlural(word,female))return identical;
  const masculine=exactSpelling(spellingParts(word,male).answer),feminine=exactSpelling(spellingParts(word,female).answer);
  const regular=masculine&&feminine===masculine+'e';
  const doubled=/(?:ien|on|el|s)$/u.test(masculine)&&feminine===masculine+masculine.at(-1)+'e';
  return regular||doubled?[male,female]:identical;
}
export function practiceForm(word,form){
  const same=sharedPracticeForms(word,form);
  return same.find(candidate=>candidate.tested&&nounGender(word,candidate)==='m')||same.find(candidate=>candidate.tested)||form;
}
export function practiceForms(word){
  const seen=new Set();return (word?.forms||[]).filter(form=>form.tested).map(form=>practiceForm(word,form)).filter(form=>{if(seen.has(form))return false;seen.add(form);return true;});
}
export function spellingTask(word,form,mode='choice'){
  const parts=spellingParts(word,form),gender=nounGender(word,form);
  if(!parts.prefix)return {...parts,mode:'bare',gender,options:[]};
  if(mode==='typed')return {...parts,mode:'typed',gender,options:[]};
  const article=parts.prefix.toLocaleLowerCase('fr').replaceAll('’',"'");
  const options=parts.transport?['à','en']:['le','la','les',"l'"].includes(article)?['le','la',"l'",'les']:/^de |^du$/.test(article)?['du','de la',"de l'",'des']:['un','une','des'];
  return {...parts,mode:'choice',gender,options};
}
export function choiceArticleAgrees(word,form,prefix){
  return exactSpelling(spellingParts(word,form).prefix)===exactSpelling(prefix);
}
export function articleAgrees(word,form,prefix){
  if(!prefix)return false;
  const original=spellingParts(word,form),given=splitNounArticle(prefix),gender=nounGender(word,form);
  if(original.transport)return choiceArticleAgrees(word,form,prefix);
  if(isPlural(word,form))return /^(des|les)$/i.test(prefix);
  if(given.gender)return !gender||given.gender===gender;
  // Elided articles do not expose gender; permit them where the source uses
  // elision, or before a vowel. Never infer a mute h from the letter alone.
  if(/^(l|de l)['’]$/i.test(prefix))return /['’]$/.test(original.prefix)||/^[aàâäeéèêëiîïoôöuùûüyÿœæ]/i.test(original.answer);
  return exactSpelling(prefix)===exactSpelling(original.prefix);
}
export function sharedExample(word) {
  const form = word.forms.find(f => f.example?.fr) || word.forms.find(f => f.source);
  return { example: form?.example, source: form?.source || word.forms.find(f => f.source)?.source };
}
export function exampleAudio(word){
  const example=sharedExample(word).example;
  if(!example?.fr)return null;
  // Legacy imports may have the sentence but no usable saved recording key.
  // Resolve synthesized recordings from the displayed text, never an old sentence.
  const audioKey=!example.audioKey||example.audioKey.startsWith('tts:')?'tts:'+encodeURIComponent(example.fr):example.audioKey;
  return {id:`example:${word.id}:${audioKey}`,audioKey,text:example.fr};
}
export const wordAudioEntries=word=>[...word.forms,...word.forms.map(f=>f.example).filter(Boolean)];

export function partOfSpeech(word,form,{includeGender=true}={}){
  if(!word)return '';
  if(word.conjugation)return 'v.';
  const pos=String(form?.pos||word.pos||word.sourcePos||'').trim();
  const source=String(form?.sourcePos||word.sourcePos||'').trim();
  if(pos==='n.'||/^n[.\s]/i.test(pos)){
    const forms=form?[form]:(word.forms||[]);
    const genders=includeGender?[...new Set(forms.flatMap(candidate=>isCommonGenderNoun(word,candidate)?['m','f']:[nounGender(word,candidate)]).filter(Boolean))]:[];
    return ['n.',genders.sort().reverse().map(gender=>gender+'.').join(' / '),forms.length&&forms.every(candidate=>isPlural(word,candidate))?'pl.':''].filter(Boolean).join(' ');
  }
  return pos==='loc.'&&/^loc\.\s+pr[ée]p\./i.test(source)?'loc. prép.':pos;
}

export function testsBothGenders(word){const tested=new Set(practiceForms(word).map(f=>f.gender));return tested.has('m')&&tested.has('f');}
export function cardPartOfSpeech(word){return testsBothGenders(word)?partOfSpeech(word).replace(/\s+[mf]\.(?:\s*\/\s*[mf]\.)*/g,'').trim():partOfSpeech(word);}
export function spellingGender(word,form){
  const gender=nounGender(word,form);
  if(!gender)return '';
  return isCommonGenderNoun(word,form)||testsBothGenders(word)||sharedPracticeForms(word,form).length>1?gender+'.':'';
}
