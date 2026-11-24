import {catalog} from '../conjugation/catalog.js';
import {primaryMeaning} from './meanings.js';
import {spellingParts} from './word-display.js';
const key=text=>String(text||'').normalize('NFC').toLocaleLowerCase('fr').replaceAll('’',"'").trim();
const infinitives=new Set(Object.keys(catalog).map(key));
const inflected=new Set(Object.values(catalog).flatMap(tenses=>Object.values(tenses).flatMap(forms=>Object.values(forms))).map(key));
// Definition cross-references are useful in the dictionary, but not answer
// choices. Do not reject a genuine sense merely because an alternate sense
// mentions spelling or grammar.
const reference=/另一种拼写|另[一]?种写法|新拼写|旧拼写|现代拼写|传统拼写|\d{4}年.{0,8}拼写|的.{0,12}(?:变位|变形|拼写|单数|复数|阴性|阳性|过去分词|现在分词)|^(?:阳性|阴性|单数|复数)(?:[、，,；;]|$)/u;
// Only the displayed distractor sense is filtered. The vocabulary entry can
// still be searched, imported, studied and used as the correct target answer.
const sensitiveGloss=/阴茎|陰莖|阴道|陰道|阴蒂|陰蒂|阴唇|陰唇|阴囊|陰囊|睾丸|龟头|龜頭|包皮|生殖器|性器官|私处|私處|肛门|肛門|精液|性交|交媾|口交|肛交|手淫|自慰|射精|性高潮|色情|淫秽|淫穢|淫荡|淫蕩|嫖娼|卖淫|賣淫|妓女|娼妓|鸡巴|雞巴|屌|屄|婊子|傻逼|他妈的|他媽的|操你|狗日的/u;
const sensitiveHeadword=/^(?:pénis|penis|vagin|vulve|clitoris|scrotum|prépuce|testicules?|sperme|spermatozoïdes?|fellation|cunnilingus|masturbation|pornographie|pornographique|putain|connard|connasse)$/u;
export function distractorExclusion(word){
 if(word.conjugation)return 'conjugation';
 const meaning=primaryMeaning(word);
 const forms=(word.forms||[]).map(form=>key(spellingParts(word,form).answer));
 if(sensitiveGloss.test(meaning)||forms.some(text=>sensitiveHeadword.test(text)))return 'sensitive';
 if(!/\p{Script=Han}/u.test(meaning)||reference.test(meaning))return 'reference';
 // Chinese choices must not disclose a French headword embedded in a gloss.
 if(/\p{Script=Latin}{2,}/u.test(meaning))return 'foreign-label';
 if(!forms.length||forms.every(text=>/^(?:se|s')$/u.test(text)))return 'pronoun';
 if(/^(?:v\b|verb)/iu.test(word.pos||word.sourcePos||'')&&forms.every(text=>inflected.has(text)&&!infinitives.has(text)))return 'conjugation';
 return '';
}
