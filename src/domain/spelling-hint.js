import highConfusionGroups from '../lexicon/spelling-hint-groups.json' with {type:'json'};
const fold=value=>String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr').replaceAll('œ','oe').replaceAll('æ','ae');
const phrase=value=>fold(value).replaceAll('’',"'").replace(/\s+/gu,' ').trim();
export const confusableSpellings=answer=>highConfusionGroups.filter(group=>group.some(value=>phrase(value)===phrase(answer))).flatMap(group=>group.filter(value=>phrase(value)!==phrase(answer)));
const functionWords=new Set(['a','au','aux','de','du','des','d','en','un','une','le','la','les','l','et','ou','se','s']);
const words=text=>[...String(text).matchAll(/[\p{L}\p{M}]+/gu)].map(match=>({text:match[0],key:fold(match[0]),offset:match.index})).filter(word=>!functionWords.has(word.key));

export function distinctiveSpellingHint(answer,alternatives){
 const peers=alternatives.map(words).filter(tokens=>tokens.length);
 if(!peers.length)return '';
 for(const word of words(answer)){
  // A shared verb or other complete token cannot identify this expression.
  if(peers.some(tokens=>tokens.some(other=>other.key===word.key)))continue;
  const letters=Array.from(word.text);
  for(let size=1;size<=Math.min(4,letters.length-1);size++){
   const prefix=letters.slice(0,size).join(''),key=fold(prefix);
   if(peers.every(tokens=>tokens.every(other=>!other.key.startsWith(key))))return (word.offset?'… ':'')+prefix;
  }
 }
 return '';
}
