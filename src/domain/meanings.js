import reviewedExamples from '../lexicon/reviewed-example-meanings.json' with {type:'json'};
import contextualMeanings from '../lexicon/contextual-primary-meanings.json' with {type:'json'};
import {definitionText} from './definition-text.js';
import definitionCorrections from '../lexicon/reviewed-definition-corrections.json' with {type:'json'};
import exampleCorrections from '../lexicon/dictionary-example-corrections.json' with {type:'json'};
import {refinedSense,refinedPrimary} from './meaning-nuances.js';
import {applyFormRelations} from './form-relations.js';
import {applyReviewedReading} from './word-readings.js';
import {preferredNounAudio} from './word-display.js';
const glossLabel=value=>String(value||'').trim()==='DIY'?'手工制作，家居修缮（DIY）':value;
function shortSense(value){
 const original=definitionText(glossLabel(value)),short=original.replace(/^[1-9]\.\s*/u,'').replace(/［[^］]*］|【[^】]*】|\[[^\]]*\]|〈[^〉]*〉|（[^）]*）|\([^)]*\)/g,'').split(/(?:adv|adj|n|v|loc|prép|art)\./i)[0].split(/[；;\n]/)[0].trim();
 return !/\p{Script=Han}/u.test(short)&&/\p{Script=Han}/u.test(original)?original:short;
}
function senseTerms(value,exercise=false){
 const text=String(value).trim(),terms=[],closing=[],pairs={'(':')','（':'）','[':']','［':'］','【':'】','〈':'〉'};
 let start=0;
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(pairs[char])closing.push(pairs[char]);
  else if(char===closing.at(-1))closing.pop();
  else if(!closing.length&&(/[，,、]/u.test(char)||exercise&&/[；;／/\n]/u.test(char))){terms.push(text.slice(start,i).trim());start=i+1;}
 }
 terms.push(text.slice(start).trim());
 return terms.filter(Boolean);
}
function splitSenseChunks(value){
 const terms=senseTerms(value),chunks=[];
 if(terms.length<=3)return [String(value).trim()].filter(Boolean);
 for(let index=0;index<terms.length;index+=3){
  chunks.push(terms.slice(index,index+3).join('，'));
 }
 return chunks;
}
export function meaningPoints(word){
 return [...new Set((word?.meanings||[]).flatMap(value=>definitionText(glossLabel(value)).split(/[；;\n\r•●▪]+/u)).map(value=>definitionText(value).replace(/^(?:[-–—]\s+|\d+[.、．)]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*)/u,'')).filter(value=>/\p{Script=Han}/u.test(value)).flatMap(splitSenseChunks).map(value=>refinedSense(word,value)))];
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
function mainSense(word,full){
 if(word?.primaryMeaningChosen&&/(?:\p{Script=Han}|^\d+(?:[.,]\d+)?$)/u.test(word.primaryMeaning||''))return word.primaryMeaning;
 const points=full.map(shortSense).filter(Boolean),chosen=senseForPrimary(word,points);
 return refinedPrimary(word,exampleMeaning(word)||chosen||points[0]||String(word?.meanings?.[0]||'').trim());
}
export const primaryMeaning=word=>mainSense(word,meaningPoints(word));
export function exerciseGloss(value){
 const terms=senseTerms(value,true);
 return terms.length>2?terms.slice(0,2).join('，'):value;
}
export const questionMeaning=(word,form)=>exerciseGloss(form?.meaning?refinedPrimary(word,form.meaning):primaryMeaning(word));
const synonymousTerm=new Map([
 ['夏季','夏天'],['秋季','秋天'],['春季','春天'],['冬季','冬天'],
 ['电脑','计算机'],['事实上','实际上'],['同僚','同事'],['太空旅行者','宇航员'],
]);
const senseKey=value=>{
 const clean=value.normalize('NFKC').replace(/^\s*\[(?:阴|阳|阴性|阳性|名词|动词|形容词)\]\s*/u,'').replace(/[\s。．.!！?？]+$/gu,'').trim();
 return synonymousTerm.get(clean)||clean;
};
export const senseSignature=value=>[...new Set(senseTerms(value).map(senseKey).filter(Boolean))].sort().join('|');
export function distinctSenseOptions(main,points){
 const claimed=new Set(senseTerms(main).map(senseKey));
 const result=main?[main]:[];
 for(const point of points){
  const terms=senseTerms(point),novel=terms.filter(term=>{
   const key=senseKey(term);if(!key||claimed.has(key))return false;
   claimed.add(key);return true;
  });
  if(novel.length)result.push(novel.length===terms.length?point:novel.join('，'));
 }
 return result;
}
export function primaryMeaningOptions(word){
 const points=meaningPoints(word);
 return distinctSenseOptions(mainSense(word,points),[...points,...(word?.primaryMeaningChosen&&word.primaryMeaningBeforeChoice?[word.primaryMeaningBeforeChoice]:[])]);
}
export function applyMeaningCorrections(data){
 for(const p of data.library)for(const w of p.words){
  applyReviewedReading(w);
  applyFormRelations(w);
  const curriculumKey=w.lexiconWord||w.forms?.[0]?.text?.replace(/^(?:un|une|le|la)\s+/i,''),curriculumFix=reviewedExamples[curriculumKey];
  if(curriculumFix?.applyToCurriculum&&w.forms.some(f=>exampleKey(f.example?.fr)===exampleKey(curriculumFix.fr))){
   if(JSON.stringify(w.meanings)===JSON.stringify(curriculumFix.previousMeanings))w.meanings=[...curriculumFix.meanings];
   for(const f of w.forms)if(exampleKey(f.example?.fr)===exampleKey(curriculumFix.fr)){
    f.example.meaning=curriculumFix.meaning;
    if(curriculumFix.zh){f.example.zh=curriculumFix.zh;f.example.translationOrigin='reviewed';}
   }
   if(!w.primaryMeaningChosen)w.primaryMeaning=curriculumFix.meaning;
  }
  if(w.conjugation)continue;
  if(w.curriculumAuthority||w.headingSupplement){preferredNounAudio(w);continue;}
  const key=w.lexiconWord||w.forms?.[0]?.text?.replace(/^(?:un|une|le|la)\s+/i,'');
  if(w.lexiconWord)for(const f of w.forms){
   const fix=exampleCorrections.find(c=>c.word===key&&exampleKey(c.previousFr)===exampleKey(f.example?.fr));
   if(!fix)continue;
   f.example={fr:fix.fr,zh:fix.zh,meaning:fix.meaning,source:fix.source||'启航法语编写',authored:fix.authored??true,...(fix.url?{url:fix.url}:{}),translationOrigin:'reviewed',audioKey:'tts:'+encodeURIComponent(fix.fr)};
   if(w.provenance)Object.assign(w.provenance,{sentence:fix.url||'',sentenceSource:f.example.source,authored:f.example.authored});
  }
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
  preferredNounAudio(w);
 }
}
