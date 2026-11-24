import {spellingParts,nounGender,isCommonGenderNoun} from './word-display.js';
import {reviewedReading} from './word-readings.js';

const text=value=>String(value||'').normalize('NFC').replaceAll('’',"'").replace(/\s+/gu,' ').trim().toLocaleLowerCase('fr');
const kind=word=>String(word.pos||word.sourcePos||'').trim().toLocaleLowerCase('fr').split(/[.\s]/u)[0];
export function vocabularyFormKey(word,form){const gender=['n','adj'].includes(kind(word))?nounGender(word,form):null;return text(spellingParts(word,form).answer)+'|'+(gender||'?');}
export function vocabularyPracticeFormKey(word,form){return isCommonGenderNoun(word,form)?text(spellingParts(word,form).answer)+'|common':vocabularyFormKey(word,form);}
export function vocabularyIdentity(word){
 if(!word||word.conjugation||word.studyDisabled)return '';
 const reading=reviewedReading(word);if(reading)return 'reading|'+reading.id;
 const forms=word.forms?.length?word.forms:[{text:word.word,gender:word.gender,literal:word.literal}];
 if(forms.some(f=>!f.text))return '';
 return kind(word)+'|'+[...new Set(forms.map(f=>vocabularyPracticeFormKey(word,f)))].sort().join('||');
}
export const logicalVocabularyKey=(p,w)=>w?.conjugation?'conjugation:'+w.conjugation.lemma+':'+w.conjugation.tense:'vocabulary:'+(w?.vocabularyMerge?.key||vocabularyIdentity(w)||p.book.id+':'+p.lesson.id+':'+w.id);
export function uniqueVocabularyWords(p,words){
 const seen=new Set();return words.filter(w=>{if(w.conjugation)return true;const key=logicalVocabularyKey(p,w);if(seen.has(key))return false;seen.add(key);return true;});
}
export const textbookPackage=p=>/^(?:inspire[1-4]|fos1)$/u.test(p?.book?.id||'');
export function vocabularySourceScore({p,w}){
 const real=w.forms?.some(f=>/human|recorded|real/iu.test(f.audioOrigin||'')||textbookPackage(p)&&/^[a-f0-9]{64}$/u.test(f.audioKey||'')&&!/synth/iu.test(f.audioOrigin||''));
 return (real?400:0)+(w.curriculumAuthority?200:0)+(textbookPackage(p)?80:0)-(w.headingSupplement?100:0);
}
export function preferVocabularyEntry(next,old,data,{reuseImported=false}={}){
 if(!old)return true;
 const score=entry=>{
  const key=entry.p.book.id+':'+entry.p.lesson.id+':'+entry.w.id,record=data?.progress?.[key];
  return vocabularySourceScore(entry)+(data?.importedWords?.[key]?(reuseImported?4000:500):0)+(record?.notebook==='known'?2000:record?.notebook==='review'?1000:0);
 };
 return score(next)>score(old);
}
export function uniqueVocabularyEntries(entries,data){
 const chosen=new Map();let serial=0;
 for(const entry of entries){const key=vocabularyIdentity(entry.w)||'entry:'+serial++,old=chosen.get(key);if(preferVocabularyEntry(entry,old,data))chosen.set(key,entry);}
 return [...chosen.values()];
}
