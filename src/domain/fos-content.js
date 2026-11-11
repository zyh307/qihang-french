import content from '../lexicon/fos1-content.json' with {type:'json'};
import {splitNounArticle,spellingParts} from './word-display.js';
const name=text=>{const value=String(text||'').normalize('NFC').replaceAll('’',"'").toLocaleLowerCase('fr').replace(/\s+/g,' ').trim(),parts=splitNounArticle(value);return parts.answer&&parts.prefix?parts.answer:value;};
const entries=new Map();
for(const p of content.library)for(const w of p.words)for(const f of w.forms){const key=name(f.text);if(!entries.has(key))entries.set(key,{p,w,f});}
const conciseSource=value=>typeof value==='string'?value.replace(/\s*·\s*PDF p\.\s*\d+/giu,''):value;
const meanings=(fresh,previous)=>[...new Set([...fresh,...previous])];
export function applyFosDictionary(rows){
 const result=rows.map(row=>({...row})),byName=new Map(result.map(row=>[name(row.word),row]));
 for(const [key,{p,w,f}]of entries){
  const old=byName.get(key),row=old||{id:'fos-'+w.id+'-'+w.forms.indexOf(f),word:key,frequency:4,source:'FOS 1'};
  Object.assign(row,{pos:w.pos,meanings:meanings(w.meanings,old?.meanings||[]),primaryMeaning:w.primaryMeaning,gender:f.gender,ipa:f.ipa||old?.ipa||'',example:{...f.example},audioKey:f.audioKey,fosSource:f.source,sourceUrl:'',plural:/^(?:les|des)\s/iu.test(f.text),source:'FOS 1'});
  if(!old){result.push(row);byName.set(key,row);}
 }
 return result;
}
export function applyFosContent(data){
 const corrected=new Map();
 for(const p of data.library)for(const w of p.words){
  if(w.fosAuthority){w.fosAuthority.source=conciseSource(w.fosAuthority.source);for(const f of w.forms){f.source=conciseSource(f.source);if(f.example)f.example.source=conciseSource(f.example.source);}}
  if(w.conjugation||p.book.id==='fos1')continue;
  const match=w.forms.map(f=>entries.get(name(f.text))).find(Boolean)||entries.get(name(w.lexiconWord));
  if(!match||w.fosAuthority?.revision>=content.revision)continue;
  const fresh=match.w;w.meanings=meanings(fresh.meanings,w.meanings||[]);w.primaryMeaning=fresh.primaryMeaning;w.primaryMeaningChosen=false;w.pos=fresh.pos;w.sourcePos=fresh.sourcePos;w.curriculumAuthority={...fresh.curriculumAuthority};w.fosAuthority={...fresh.fosAuthority};
  for(const f of w.forms){const source=entries.get(name(f.text));if(!source)continue;f.audioKey=source.f.audioKey;f.audio=null;f.audioOrigin='fos-synthetic';f.source=source.f.source;f.ipa=source.f.ipa||f.ipa;f.example={...source.f.example};if(source.f.meaning)f.meaning=source.f.meaning;else delete f.meaning;}
  corrected.set(w.id,w);corrected.set(p.book.id+':'+p.lesson.id+':'+w.id,w);
 }
 // Preserve a frozen question's ID, position and choice order. Only replace
 // labels whose vocabulary content was explicitly corrected by this material.
 for(const s of Object.values(data.sessions||{}))for(const q of [s.question,s.feedback?.question])if(q?.kind==='recognize')for(const option of q.options||[]){const w=corrected.get(option.id);if(w)option.label=w.primaryMeaning;}
 return corrected.size;
}
