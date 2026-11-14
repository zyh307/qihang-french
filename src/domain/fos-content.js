import content from '../lexicon/fos1-content.json' with {type:'json'};
import {unzipSync,strFromU8} from 'fflate';
import {splitNounArticle} from './word-display.js';
import {primaryMeaningOptions} from './meanings.js';
const exact=text=>String(text||'').normalize('NFC').replaceAll('’',"'").toLocaleLowerCase('fr').replace(/\s+/g,' ').trim();
const article=/^(?:un|une|des|du|le|la|les|de la|de l['’]|l['’])$/iu;
export const fosVocabularyKey=text=>{const value=exact(text),parts=splitNounArticle(value);return parts.answer&&article.test(parts.prefix)?parts.answer:value;};
const name=fosVocabularyKey;
const legacyName=text=>{const value=exact(text),parts=splitNounArticle(value);return parts.answer&&parts.prefix?parts.answer:value;};
const posKind=word=>String(word.pos||word.sourcePos||'').toLocaleLowerCase('fr').split(/[.\s]/u)[0];
const compatible=(old,fresh)=>!posKind(old)||!posKind(fresh)||posKind(old)===posKind(fresh);
const entries=new Map();
for(const p of content.library)for(const w of p.words)for(const f of w.forms){const key=name(f.text);if(!entries.has(key))entries.set(key,{p,w,f});}
const legacyEntries=new Map();for(const p of content.library)for(const w of p.words)for(const f of w.forms)if(!legacyEntries.has(legacyName(f.text)))legacyEntries.set(legacyName(f.text),{p,w,f});
const conciseSource=value=>typeof value==='string'?value.replace(/\s*·\s*PDF p\.\s*\d+/giu,''):value;
const meanings=(fresh,previous)=>[...new Set([...fresh,...previous])];
export function applyFosDictionary(rows){
 const result=rows.map(row=>({...row,...(row.pos==='loc.'&&/^(?:à|en|au|aux)\s/iu.test(row.word)?{gender:null}:{})})),byName=new Map();for(const row of result){const key=name(row.word);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(row);}
 for(const [key,{p,w,f}]of entries){
  const old=byName.get(key)?.find(row=>compatible(row,w)),row=old||{id:'fos-'+w.id+'-'+w.forms.indexOf(f),word:key,frequency:4,source:'FOS 1'};
  Object.assign(row,{pos:w.pos,meanings:meanings(w.meanings,old?.meanings||[]),primaryMeaning:w.primaryMeaning,gender:f.gender,ipa:f.ipa||old?.ipa||'',example:{...f.example},audioKey:f.audioKey,fosSource:f.source,sourceUrl:'',plural:/^(?:les|des)\s/iu.test(f.text),source:'FOS 1'});
  if(!old){result.push(row);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(row);}
 }
 return result;
}
export function applyFosContent(data){
 const corrected=new Map();
 for(const p of data.library)for(const w of p.words){
  if(w.fosAuthority){w.fosAuthority.source=conciseSource(w.fosAuthority.source);for(const f of w.forms){f.source=conciseSource(f.source);if(f.example)f.example.source=conciseSource(f.example.source);}}
  if(w.conjugation||w.headingSupplement||p.book.id==='fos1')continue;
  const match=w.forms.map(f=>entries.get(name(f.text))).find(entry=>entry&&compatible(w,entry.w))||entries.get(name(w.lexiconWord));
  if(match&&!compatible(w,match.w))continue;
  if(!match||w.fosAuthority?.revision>=content.revision)continue;
  const fresh=match.w;w.meanings=meanings(fresh.meanings,w.meanings||[]);w.primaryMeaning=fresh.primaryMeaning;w.primaryMeaningChosen=false;w.pos=fresh.pos;w.sourcePos=fresh.sourcePos;w.curriculumAuthority={...fresh.curriculumAuthority};w.fosAuthority={...fresh.fosAuthority};w.fosMatchVersion=2;
  for(const f of w.forms){const source=entries.get(name(f.text));if(!source)continue;f.audioKey=source.f.audioKey;f.audio=null;f.audioOrigin='fos-synthetic';f.source=source.f.source;f.ipa=source.f.ipa||f.ipa;f.example={...source.f.example};if(source.f.meaning)f.meaning=source.f.meaning;else delete f.meaning;}
  corrected.set(w.id,w);corrected.set(p.book.id+':'+p.lesson.id+':'+w.id,w);
 }
 // Preserve a frozen question's ID, position and choice order. Only replace
 // labels whose vocabulary content was explicitly corrected by this material.
 for(const s of Object.values(data.sessions||{}))for(const q of [s.question,s.feedback?.question])if(q?.kind==='recognize')for(const option of q.options||[]){const w=corrected.get(option.id);if(w)option.label=w.primaryMeaning;}
 return corrected.size;
}

// Repair only content affected by the old preposition-erasing match. The
// source IDs, form IDs, progress, notebooks and dates are never replaced.
export async function repairFosCollisions(data,dictionary=[],fetcher=fetch){
 const byId=new Map(dictionary.map(row=>[row.id,row])),literalRows=new Map();
 for(const row of dictionary){const key=exact(row.word);if(!literalRows.has(key))literalRows.set(key,[]);literalRows.get(key).push(row);}
 const originalRow=w=>byId.get(w.lexiconId)||(literalRows.get(exact(w.lexiconWord||w.forms[0]?.text))||[]).find(row=>row.source!=='FOS 1');
 const affected=data.library.flatMap(p=>p.book.id==='fos1'?[]:p.words.filter(w=>w.fosAuthority&&w.fosMatchVersion!==2&&!w.conjugation&&w.forms.some(f=>{
  const old=legacyEntries.get(legacyName(f.text)),fresh=entries.get(name(f.text));
  const reference=originalRow(w);
  return old&&(!fresh||!compatible(w,fresh.w)||reference&&!compatible(reference,fresh.w));
 })).map(w=>({p,w})));
 if(!affected.length)return 0;
 const baseline=new Map();
 for(const book of new Set(affected.map(({p})=>p.book.id).filter(id=>/^inspire[1-4]$/u.test(id)))){
  const response=await fetcher(new URL('static/content/'+book+'.zip',globalThis.document?.baseURI||import.meta.url));
  if(!response.ok)throw Error('课本词汇无法恢复 / Restauration du vocabulaire impossible.');
  const files=unzipSync(new Uint8Array(await response.arrayBuffer()),{filter:file=>file.name==='manifest.json'}),bundle=JSON.parse(strFromU8(files['manifest.json']));
  for(const p of bundle.library)for(const w of p.words)for(const f of w.forms)baseline.set(p.book.id+':'+p.lesson.id+':'+name(f.text),w);
 }
 const rows=new Map(dictionary.map(row=>[name(row.word),row])),corrected=new Map();let repaired=0;
 for(const {p,w}of affected){
  let source=w.forms.map(f=>baseline.get(p.book.id+':'+p.lesson.id+':'+name(f.text))).find(Boolean);
  if(!source){const row=originalRow(w)||rows.get(name(w.lexiconWord||w.forms[0]?.text));if(row)source={pos:row.pos,sourcePos:row.pos,meanings:row.meanings,primaryMeaning:row.primaryMeaning,provenance:{dictionary:row.fosSource||row.sourceUrl||'https://zh.wiktionary.org/',license:row.fosSource?'用户提供的课程资料':'CC BY-SA 4.0',sentence:row.example?.url||row.sourceUrl||'',sentenceSource:row.example?.source||'',authored:!!row.example?.authored},forms:[{text:row.word,gender:['n.','adj.'].includes(row.pos)?row.gender||null:null,ipa:row.ipa,audio:null,audioKey:row.audioKey||'tts:'+encodeURIComponent(row.word),source:row.example?.source||row.source||'词库',example:row.example?{...row.example,audioKey:row.example.audioKey||'tts:'+encodeURIComponent(row.example.fr)}:undefined}]};}
  if(!source)continue;
  const chosen=w.primaryMeaningChosen&&primaryMeaningOptions(source).includes(w.primaryMeaning)?w.primaryMeaning:null;
  for(const field of ['pos','sourcePos','meanings','primaryMeaning','curriculumAuthority']){if(source[field]===undefined)delete w[field];else w[field]=JSON.parse(JSON.stringify(source[field]));}
  if(source.provenance)w.provenance=JSON.parse(JSON.stringify(source.provenance));delete w.fosAuthority;w.fosMatchVersion=2;w.primaryMeaningChosen=!!chosen;if(chosen)w.primaryMeaning=chosen;
  for(const f of w.forms){const fresh=source.forms.find(form=>name(form.text)===name(f.text));if(!fresh)continue;for(const field of ['gender','audioKey','audio','audioOrigin','source','ipa','example','meaning']){if(fresh[field]===undefined)delete f[field];else f[field]=JSON.parse(JSON.stringify(fresh[field]));}}
  corrected.set(w.id,w);corrected.set(p.book.id+':'+p.lesson.id+':'+w.id,w);
  repaired++;
 }
 for(const s of Object.values(data.sessions||{}))for(const q of [s.question,s.feedback?.question])if(q?.kind==='recognize')for(const option of q.options||[]){const w=corrected.get(option.id);if(w)option.label=w.primaryMeaning||w.meanings[0];}
 return repaired;
}
