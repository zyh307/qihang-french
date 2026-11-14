import {distractorExclusion} from './choice-eligibility.js';
import {sameWordFamily} from './choice-similarity.js';
import {spellingParts} from './word-display.js';
import {splitChoiceSenses,semanticLabel,semanticContrast} from './choice-semantic-core.js';
import {reviewedSemanticGroups} from './choice-semantic-groups.js';
import derivedSemantics from '../lexicon/choice-semantic-index.json' with {type:'json'};
// Keep raw semantic cores as well as independent synonym memberships. An
// opaque alias alone used to lose compound/short-word comparisons.
const aliases=new Map();
for(const [index,group]of [...reviewedSemanticGroups,...derivedSemantics.groups].entries())for(const label of group){const key=semanticLabel(label);if(!aliases.has(key))aliases.set(key,new Set());aliases.get(key).add('@sense:'+index);}
const cachedKeys=new Map();
function senseKeys(key){let result=cachedKeys.get(key);if(!result){result=[key,...(aliases.get(key)||[])];if(cachedKeys.size>8192)cachedKeys.clear();cachedKeys.set(key,result);}return result;}
export function choiceMeaningKeys(values){return new Set(splitChoiceSenses(values).flatMap(senseKeys));}
function nearbyChinese(a,b){
 if(a===b)return true;
 if(!/\p{Script=Han}/u.test(a)||!/\p{Script=Han}/u.test(b)||Math.min(a.length,b.length)<2||semanticContrast(a,b))return false;
 if(a.includes(b)||b.includes(a))return true;
 if(Math.min(a.length,b.length)<3)return false;
 let previous=Array(b.length+1).fill(0);for(const char of a){const next=[0];for(let i=0;i<b.length;i++)next.push(char===b[i]?previous[i]+1:Math.max(previous[i+1],next[i]));previous=next;}
 return previous[b.length]/Math.max(a.length,b.length)>=.78;
}
export function meaningsOverlap(left,right){
 // Shared semantic memberships are a cheap set lookup. Only actual Chinese
 // cores need the more expensive phrase comparison, not every opaque tag.
 for(const key of left)if(right.has(key))return true;
 const a=[...left].filter(key=>key[0]!=='@'),b=[...right].filter(key=>key[0]!=='@');
 return a.some(x=>b.some(y=>nearbyChinese(x,y)));
}

// Also hide ambiguous distractors in a previously saved question, while keeping
// its valid choices, order, question ID and learning position unchanged.
export function unambiguousChoices(options,word,primary,resolve=()=>null){
 const seen=choiceMeaningKeys([primary,...(word.meanings||[])]);
 const eligible=[...(options||[])].sort((a,b)=>String(a.id).localeCompare(String(b.id))).filter(option=>{
  if(option.id===word.id)return true;
  const source=resolve(option.id);
  if(source&&distractorExclusion(source))return false;
  const sourceFrench=source?.forms?.map(form=>spellingParts(source,form).answer)||[];
  if(sourceFrench.some(text=>word.forms?.some(form=>sameWordFamily(spellingParts(word,form).answer,text))))return false;
  if(distractorExclusion({meanings:[option.label],primaryMeaning:option.label,pos:option.pos||'v.',forms:String(option.french||'').split(/\s+\/\s+/u).map(text=>({text}))}))return false;
  const french=String(option.french||'').split(/\s+\/\s+/u);
  if(french.length&&french.every(text=>/^(?:se|s['’])$/iu.test(text.trim())))return false;
  if(french.some(text=>word.forms?.some(form=>sameWordFamily(spellingParts(word,form).answer,text))))return false;
  const keys=choiceMeaningKeys([option.label,...(source?.meanings||[])]);
  if(meaningsOverlap(keys,seen))return false;
  for(const key of keys)seen.add(key);
  return true;
 });
 const ids=new Set(eligible.map(option=>option.id));
 return (options||[]).filter(option=>ids.has(option.id));
}
