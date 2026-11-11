import catalog from '../conjugation/source-catalog.json' with {type:'json'};
import {primaryMeaning} from './meanings.js';
import {spellingParts} from './word-display.js';
const key=text=>String(text||'').normalize('NFC').toLocaleLowerCase('fr').replaceAll('’',"'").trim();
const infinitives=new Set(Object.keys(catalog).map(key));
const inflected=new Set(Object.values(catalog).flatMap(tenses=>Object.values(tenses).flatMap(forms=>Object.values(forms))).map(key));
// Definition cross-references are useful in the dictionary, but not answer
// choices. Do not reject a genuine sense merely because an alternate sense
// mentions spelling or grammar.
const reference=/另一种拼写|另[一]?种写法|新拼写|旧拼写|现代拼写|传统拼写|\d{4}年.{0,8}拼写|的.{0,12}(?:变位|变形|拼写|单数|复数|阴性|阳性|过去分词|现在分词)|^(?:阳性|阴性|单数|复数)(?:[、，,；;]|$)/u;
export function distractorExclusion(word){
 if(word.conjugation)return 'conjugation';
 const meaning=primaryMeaning(word);
 if(!/\p{Script=Han}/u.test(meaning)||reference.test(meaning))return 'reference';
 // Chinese choices must not disclose a French headword embedded in a gloss.
 if(/\p{Script=Latin}{2,}/u.test(meaning))return 'foreign-label';
 const forms=(word.forms||[]).map(form=>key(spellingParts(word,form).answer));
 if(!forms.length||forms.every(text=>/^(?:se|s')$/u.test(text)))return 'pronoun';
 if(/^(?:v\b|verb)/iu.test(word.pos||word.sourcePos||'')&&forms.every(text=>inflected.has(text)&&!infinitives.has(text)))return 'conjugation';
 return '';
}
