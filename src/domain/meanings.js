import contextualMeanings from '../lexicon/contextual-primary-meanings.json' with {type:'json'};
function shortSense(value){
 return String(value||'').replace(/^:Template:[^ ]+\s*/,'').replace(/^(?:(?:n|v|adj|adv|prép|prep|art|loc|pron|conj|interj|num|m|f|inv|pl|sg|intr|tr|interr|exclam)\.\s*|et\s+|[1-9]\.\s*)+/iu,'').replace(/［[^］]*］|【[^】]*】|\[[^\]]*\]|〈[^〉]*〉|（[^）]*）|\([^)]*\)/g,'').split(/(?:adv|adj|n|v|loc|prép|art)\./i)[0].split(/[；;\n]/)[0].trim();
}
function splitSenseChunks(value){
 const text=String(value).trim(),chunks=[],closing=[],pairs={'(':')','（':'）','[':']','［':'］','【':'】','〈':'〉'};
 let start=0,count=0;
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(pairs[char])closing.push(pairs[char]);
  else if(char===closing.at(-1))closing.pop();
  else if(!closing.length&&/[，,、]/u.test(char)&&text.slice(start,i).trim()){
   count++;
   if(count===3){chunks.push(text.slice(start,i).trim());start=i+1;count=0;}
  }
 }
 const last=text.slice(start).trim();if(last)chunks.push(last);
 return chunks;
}
export function meaningPoints(word){
 return [...new Set((word?.meanings||[]).flatMap(value=>String(value).split(/[；;\n\r•●▪]+/u)).map(value=>value.trim().replace(/^(?:[-–—]\s+|\d+[.、．)]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*)/u,'')).filter(Boolean).flatMap(splitSenseChunks))];
}
function senseForPrimary(word,points){
 const chosen=splitSenseChunks(shortSense(word?.primaryMeaning))[0];
 if(!chosen)return '';
 // Old versions offered individual synonyms. Resolve those choices back to
 // their complete sense, without turning commas inside a sense into options.
 return points.find(value=>value===chosen)||points.find(value=>value.split(/[，,、]/u).some(part=>part.trim()===chosen))||chosen;
}
export function primaryMeaning(word){const points=meaningPoints(word).map(shortSense).filter(Boolean);return senseForPrimary(word,points)||points[0]||String(word?.meanings?.[0]||'').trim();}
export function primaryMeaningOptions(word){
 const points=meaningPoints(word).map(shortSense).filter(Boolean);
 return [...new Set([senseForPrimary(word,points),...points].filter(Boolean))];
}
export function applyMeaningCorrections(data){
 for(const p of data.library)for(const w of p.words){
  if(w.conjugation||w.curriculumAuthority)continue;
  const key=w.lexiconWord||w.forms?.[0]?.text?.replace(/^(?:un|le)\s+/i,'');
  if(key==='roman'&&!(w.meaningRevision>=1)){
   w.meanings=['小说',...w.meanings.filter(m=>m!=='小说')];w.pos='n.';w.sourcePos='n.';w.meaningRevision=1;
   for(const f of w.forms){f.gender='m';if(!f.audioKey||f.audioKey.startsWith('tts:'))f.audioKey='tts:'+encodeURIComponent('un roman');}
  }
  if(key==='combien'&&!w.meanings.includes('多久'))w.meanings=['多久','多少','多么',...w.meanings];
  if(!w.primaryMeaningChosen&&!w.curriculumAddition&&contextualMeanings[key]&&(w.lexiconWord||key==='roman'||key==='combien'))w.primaryMeaning=contextualMeanings[key];
 }
}
