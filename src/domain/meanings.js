import reviewedExamples from '../lexicon/reviewed-example-meanings.json' with {type:'json'};
import contextualMeanings from '../lexicon/contextual-primary-meanings.json' with {type:'json'};
import {definitionText} from './definition-text.js';
import definitionCorrections from '../lexicon/reviewed-definition-corrections.json' with {type:'json'};
const glossLabel=value=>String(value||'').trim()==='DIY'?'手工制作，家居修缮（DIY）':value;
export function usageNote(word){
 const text=word?.lexiconWord||word?.word||word?.forms?.[0]?.text;
 return String(text||'').normalize('NFC').trim()==='nouvel'?'用于元音或哑音 h 开头的阳性单数名词前 / Devant un nom masculin singulier commençant par une voyelle ou un h muet.':'';
}
function shortSense(value){
 const original=definitionText(glossLabel(value)),short=original.replace(/^[1-9]\.\s*/u,'').replace(/［[^］]*］|【[^】]*】|\[[^\]]*\]|〈[^〉]*〉|（[^）]*）|\([^)]*\)/g,'').split(/(?:adv|adj|n|v|loc|prép|art)\./i)[0].split(/[；;\n]/)[0].trim();
 return !/\p{Script=Han}/u.test(short)&&/\p{Script=Han}/u.test(original)?original:short;
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
 return [...new Set((word?.meanings||[]).flatMap(value=>definitionText(glossLabel(value)).split(/[；;\n\r•●▪]+/u)).map(value=>definitionText(value).replace(/^(?:[-–—]\s+|\d+[.、．)]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*)/u,'')).filter(value=>/\p{Script=Han}/u.test(value)).flatMap(splitSenseChunks))];
}
const exampleKey=text=>String(text||'').normalize('NFC').replaceAll('’',"'").replace(/\s+/g,' ').trim();
export function exampleMeaning(word){
 const example=word?.forms?.find(f=>f.example?.fr)?.example||word?.example;
 if(!example?.fr)return '';
 if(example.meaning)return String(example.meaning).trim();
 const key=word.lexiconWord||word.word||word.forms?.[0]?.text?.replace(/^(?:un|une|le|la)\s+/i,''),reviewed=reviewedExamples[key];
 return reviewed&&exampleKey(reviewed.fr)===exampleKey(example.fr)?reviewed.meaning:'';
}
function senseForPrimary(word,points){
 const chosen=splitSenseChunks(shortSense(word?.primaryMeaning))[0];
 if(!/\p{Script=Han}/u.test(chosen||''))return '';
 if(!chosen)return '';
 if(chosen===exampleMeaning(word))return chosen;
 // Old versions offered individual synonyms. Resolve those choices back to
 // their complete sense, without turning commas inside a sense into options.
 return points.find(value=>value===chosen)||points.find(value=>value.split(/[，,、]/u).some(part=>part.trim()===chosen))||chosen;
}
export function primaryMeaning(word){const points=meaningPoints(word).map(shortSense).filter(Boolean),chosen=senseForPrimary(word,points);return (word?.primaryMeaningChosen&&chosen)||exampleMeaning(word)||chosen||points[0]||String(word?.meanings?.[0]||'').trim();}
export function primaryMeaningOptions(word){
 const points=meaningPoints(word).map(shortSense).filter(Boolean);
 return [...new Set([primaryMeaning(word),...points].filter(Boolean))];
}
export function applyMeaningCorrections(data){
 for(const p of data.library)for(const w of p.words){
  const curriculumKey=w.lexiconWord||w.forms?.[0]?.text?.replace(/^(?:un|une|le|la)\s+/i,''),curriculumFix=reviewedExamples[curriculumKey];
  if(curriculumFix?.applyToCurriculum&&w.forms.some(f=>exampleKey(f.example?.fr)===exampleKey(curriculumFix.fr))){
   if(JSON.stringify(w.meanings)===JSON.stringify(curriculumFix.previousMeanings))w.meanings=[...curriculumFix.meanings];
   for(const f of w.forms)if(exampleKey(f.example?.fr)===exampleKey(curriculumFix.fr))f.example.meaning=curriculumFix.meaning;
   if(!w.primaryMeaningChosen)w.primaryMeaning=curriculumFix.meaning;
  }
  if(w.conjugation||w.curriculumAuthority)continue;
  const key=w.lexiconWord||w.forms?.[0]?.text?.replace(/^(?:un|une|le|la)\s+/i,'');
  const definition=definitionCorrections[key];
  const matchesDefinition=definition&&w.lexiconWord&&[definition.previousMeanings,definition.meanings,reviewedExamples[key]?.meanings].some(meanings=>meanings&&JSON.stringify(w.meanings)===JSON.stringify(meanings));
  if(matchesDefinition){
   w.meanings=[...definition.meanings];
   if(definition.invalidMeanings?.includes(w.primaryMeaning))delete w.primaryMeaningChosen;
   if(!w.primaryMeaningChosen)w.primaryMeaning=definition.meaning;
  }
  const reviewed=reviewedExamples[key];
  if(reviewed?.pos&&w.lexiconWord&&!w.primaryMeaningChosen&&w.forms.some(f=>exampleKey(f.example?.fr)===exampleKey(reviewed.fr))){w.pos=reviewed.pos;w.sourcePos=reviewed.pos;for(const f of w.forms){f.gender=reviewed.gender;f.literal=false;if(f.audioKey?.startsWith('tts:'))f.audioKey='tts:'+encodeURIComponent((reviewed.gender==='f'?'une ':'un ')+w.lexiconWord);}}
  if(reviewed?.invalidMeanings?.includes(w.primaryMeaning)){w.primaryMeaning=reviewed.meaning;delete w.primaryMeaningChosen;}
  if(reviewed?.meanings&&JSON.stringify(w.meanings)===JSON.stringify(reviewed.previousMeanings))w.meanings=[...reviewed.meanings];
  if(reviewed)for(const f of w.forms)if(f.example?.fr&&exampleKey(f.example.fr)===exampleKey(reviewed.fr)){f.example.meaning=reviewed.meaning;if(reviewed.zh){f.example.zh=reviewed.zh;f.example.translationOrigin='reviewed';}}
  if(key==='roman'&&!(w.meaningRevision>=1)){
   w.meanings=['小说',...w.meanings.filter(m=>m!=='小说')];w.pos='n.';w.sourcePos='n.';w.meaningRevision=1;
   for(const f of w.forms){f.gender='m';if(!f.audioKey||f.audioKey.startsWith('tts:'))f.audioKey='tts:'+encodeURIComponent('un roman');}
  }
  if(key==='combien'&&!w.meanings.includes('多久'))w.meanings=['多久','多少','多么',...w.meanings];
  if(!w.primaryMeaningChosen&&!w.curriculumAddition&&(w.lexiconWord||key==='roman'||key==='combien')){
   const context=exampleMeaning(w);
   if(context||matchesDefinition||contextualMeanings[key])w.primaryMeaning=context||(matchesDefinition?definition.meaning:contextualMeanings[key]);
   else if(!/\p{Script=Han}/u.test(w.primaryMeaning||''))w.primaryMeaning=primaryMeaning(w);
  }
 }
}
