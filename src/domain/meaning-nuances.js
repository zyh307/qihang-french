import nuances from '../lexicon/meaning-nuances.json' with {type:'json'};
import {splitNounArticle} from './word-display.js';
export const nuanceWordKey=word=>{const text=word?.lexiconWord||word?.word||word?.forms?.[0]?.text||'';return (splitNounArticle(text).answer||text).normalize('NFC').replaceAll('’',"'").toLocaleLowerCase('fr').trim();};
const core=value=>String(value||'').replace(/（[^）]*）|\([^)]*\)|［[^］]*］|【[^】]*】|〈[^〉]*〉|\[[^\]]*\]/g,'').replace(/^[^\p{Script=Han}]+/u,'').split(/[，,、；;]/u)[0].trim();
export function refinedSense(word,value){
 const rows=nuances[nuanceWordKey(word)];if(!rows)return value;
 return rows.find(row=>row.gloss===value||row.match.includes(core(value)))?.gloss||value;
}
export function senseDifference(word,value){
 const row=nuances[nuanceWordKey(word)]?.find(entry=>entry.gloss===refinedSense(word,value));
 return row?.gloss.match(/（([^（）]+)）$/u)?.[1]||'';
}
export function refinedPrimary(word,value){
 const example=word?.forms?.find(f=>f.example?.fr)?.example||word?.example;
 if(!word?.primaryMeaningChosen&&nuanceWordKey(word)==='monnaie'&&/pièces? de monnaie/iu.test(example?.fr||''))return '硬币（金属钱币）';
 if(!word?.primaryMeaningChosen&&nuanceWordKey(word)==='marché'&&/marché\s+(?:est\s+)?ouvert\s+(?:le|les|chaque)\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/iu.test(example?.fr||''))return '集市（摊位集中售货）';
 if(!word?.primaryMeaningChosen&&nuanceWordKey(word)==='retourner'&&/\bretourn(?:er|e|es|ons|ez|ent|é|ait|ais|aient)\s+(?:dans|à|chez|en)\s/iu.test(example?.fr||''))return '返回（先前去过的地方）';
 return refinedSense(word,value);
}
export const hasMeaningNuance=(word,value)=>/[（(][^）)]+[）)]/u.test(value)||refinedSense(word,value)!==value;
