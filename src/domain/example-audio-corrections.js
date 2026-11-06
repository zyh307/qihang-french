import corrections from '../lexicon/course-example-corrections.json' with {type:'json'};
import sentences from '../lexicon/bundled-example-audio.json' with {type:'json'};
import matches from '../lexicon/course-example-matches.json' with {type:'json'};
import dictionaryCorrections from '../lexicon/dictionary-example-corrections.json' with {type:'json'};
const sentenceSet=new Set(sentences);
const key=s=>String(s||'').normalize('NFC').replaceAll('’',"'").replace(/\s+/g,' ').trim();
const wordText=w=>[w.sourceText,...w.forms.map(f=>f.text)].filter(Boolean).map(key);
function courseMatch(p,w,c){
 const authority=w.curriculumAuthority;
 const inCourse=(p.book.id===c.book&&p.lesson.id===c.lesson)||(authority?.bookId===c.book&&authority.lessonId===c.lesson);
 const texts=wordText(w);
 return inCourse&&(w.id===c.wordId||[c.sourceText,...(c.forms||[])].filter(Boolean).some(text=>texts.includes(key(text))));
}
export function applyExampleAudioCorrections(data){
 for(const p of data.library)for(const w of p.words)for(const f of w.forms){
  const fix=corrections.find(c=>courseMatch(p,w,c))||dictionaryCorrections.find(c=>key(w.lexiconWord||f.text)===key(c.word));
  if(fix&&key(f.example?.fr)===key(fix.previousFr)){
   f.example={fr:fix.fr,zh:fix.zh,sourceKind:'authored',source:'启航法语编写',authored:true,translationOrigin:'reviewed',audioKey:'tts:'+encodeURIComponent(fix.fr),audioOrigin:'synthesized'};
   if(fix.meanings&&!w.primaryMeaningChosen){w.meanings=[...fix.meanings];w.primaryMeaning=fix.meaning;}
  }
  const hint=matches.find(c=>courseMatch(p,w,c)&&key(c.fr)===key(f.example?.fr));
  if(hint)f.example.highlight=Array.isArray(hint.highlight)?[...hint.highlight]:hint.highlight;
  if(f.example?.fr&&!f.example.audioKey&&sentenceSet.has(f.example.fr)){f.example.audioKey='tts:'+encodeURIComponent(f.example.fr);f.example.audioOrigin='synthesized';}
 }
}
