// A written article belongs to the vocabulary entry. Only bare gendered nouns
// receive the default un/une; IDs and recordings remain independent of articles.
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
  const parsed=splitNounArticle(form.text);
  const transport=/^(?:en|à)\s+(?:pied|vélo|bicyclette|moto|scooter|cheval|trottinette|voiture|bus|autobus|car|train|tram|tramway|métro|avion|bateau|taxi|camion|ferry)(?:\b|$)/iu.test(form.text);
  const obvious=/^(?:un|une|des|du|le|la|les|de la|de l['’]|l['’])$/i.test(parsed.prefix);
  // Locutions such as au bout stay intact; a visible determiner is independent
  // of the imported part-of-speech label (e.g. les jeux pour enfants).
  if(!transport&&!obvious&&!(word?.pos==='n.'&&!parsed.prefix))return {prefix:'',answer:form.text,text:form.text};
  const prefix=parsed.prefix||(form.gender==='m'?'un':form.gender==='f'?'une':'');
  const answer=parsed.answer;
  return {prefix,answer,text:prefix?`${prefix}${/['’]$/.test(prefix)?'':' '}${answer}`:answer,transport};
}
export const displayForm = (word, form) => spellingParts(word, form).text;
export function nounGender(word,form){
  return form?.gender||splitNounArticle(form?.text).gender||(/n\.?m/i.test(word?.sourcePos||'')?'m':/n\.?f/i.test(word?.sourcePos||'')?'f':null);
}
export function spellingTask(word,form,mode='choice'){
  const parts=spellingParts(word,form),gender=nounGender(word,form);
  if(!parts.prefix)return {...parts,mode:'bare',gender,options:[]};
  if(mode==='typed')return {...parts,mode:'typed',gender,options:[]};
  const article=parts.prefix.toLocaleLowerCase('fr').replaceAll('’',"'");
  const options=parts.transport?['à','en']:['le','la','les',"l'"].includes(article)?['le','la',"l'",'les']:/^de |^du$/.test(article)?['du','de la',"de l'",'des']:['un','une','des'];
  return {...parts,mode:'choice',gender,options};
}
export function articleAgrees(word,form,prefix){
  const original=splitNounArticle(spellingParts(word,form).text),given=splitNounArticle(prefix),gender=nounGender(word,form);
  if(!prefix)return false;
  if(spellingParts(word,form).transport)return prefix.toLocaleLowerCase('fr')===original.prefix.toLocaleLowerCase('fr');
  const plural=/pl\./i.test(word.sourcePos||'')||/^(des|les)$/i.test(original.prefix);
  if(plural)return /^(des|les)$/i.test(prefix);
  if(given.gender)return !gender||given.gender===gender;
  // Elided articles do not expose gender; permit them where the source uses
  // elision, or before a vowel. Never infer a mute h from the letter alone.
  if(/^(l|de l)['’]$/i.test(prefix))return /['’]$/.test(original.prefix)||/^[aàâäeéèêëiîïoôöuùûüyÿœæ]/i.test(original.answer);
  return prefix.toLocaleLowerCase('fr')===original.prefix.toLocaleLowerCase('fr');
}
export function sharedExample(word) {
  const form = word.forms.find(f => f.example?.fr) || word.forms.find(f => f.source);
  return { example: form?.example, source: form?.source || word.forms.find(f => f.source)?.source };
}
export function exampleAudio(word){
  const example=sharedExample(word).example;
  return example?.fr&&example.audioKey?{id:`example:${word.id}:${example.audioKey}`,audioKey:example.audioKey,text:example.fr}:null;
}
export const wordAudioEntries=word=>[...word.forms,...word.forms.map(f=>f.example).filter(Boolean)];
