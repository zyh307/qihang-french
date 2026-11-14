import fs from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import content from '../src/lexicon/fos1-content.json' with {type:'json'};
import {applyFosDictionary,applyFosContent,repairFosCollisions,fosVocabularyKey} from '../src/domain/fos-content.js';
import {splitNounArticle} from '../src/domain/word-display.js';
import {primaryMeaning} from '../src/domain/meanings.js';
const root=new URL('../',import.meta.url),clone=v=>JSON.parse(JSON.stringify(v));
const dictionary=JSON.parse(await fs.readFile(new URL('src/static/lexicon/french.json',root),'utf8')).entries,updated=applyFosDictionary(dictionary),library=[],legacy=new Map(),problems=[],collisions=[];
const oldName=text=>{const value=String(text||'').normalize('NFC').replaceAll('’',"'").toLocaleLowerCase('fr').replace(/\s+/g,' ').trim(),parts=splitNounArticle(value);return parts.prefix&&parts.answer?parts.answer:value;};
for(const p of content.library)for(const w of p.words)for(const f of w.forms)if(!legacy.has(oldName(f.text)))legacy.set(oldName(f.text),{p,w,f});
for(const row of dictionary){const old=legacy.get(oldName(row.word));if(old&&fosVocabularyKey(old.f.text)!==fosVocabularyKey(row.word)){
 const fresh=updated.find(w=>w.id===row.id);collisions.push({scope:'dictionary',word:row.word,oldMeaning:old.w.primaryMeaning,restoredMeaning:primaryMeaning(fresh)});
 if(JSON.stringify(fresh.meanings)!==JSON.stringify(row.meanings)||fresh.pos!==row.pos||JSON.stringify(fresh.example)!==JSON.stringify(row.example))problems.push({word:row.word,problem:'preposition-meaning-overwritten'});
}}
for(const book of ['inspire1','inspire2','inspire3','inspire4','fos1']){const bytes=unzipSync(await fs.readFile(new URL('src/static/content/'+book+'.zip',root)),{filter:f=>f.name==='manifest.json'});library.push(...JSON.parse(strFromU8(bytes['manifest.json'])).library);}
const expectedData={library:clone(library),sessions:{}};applyFosContent(expectedData);const expected=new Map(expectedData.library.flatMap(p=>p.words.map(w=>[p.book.id+':'+p.lesson.id+':'+w.id,w])));const data={library:clone(library),sessions:{}},checks=[];
for(const p of data.library)for(const w of p.words){if(p.book.id==='fos1')continue;const match=w.forms.map(f=>legacy.get(oldName(f.text))).find(Boolean);if(!match||!w.forms.some(f=>{const old=legacy.get(oldName(f.text));return old&&fosVocabularyKey(old.f.text)!==fosVocabularyKey(f.text);}))continue;
 const original=clone(w);Object.assign(w,{meanings:[...match.w.meanings,...w.meanings],primaryMeaning:match.w.primaryMeaning,pos:match.w.pos,sourcePos:match.w.sourcePos,fosAuthority:clone(match.w.fosAuthority),curriculumAuthority:clone(match.w.curriculumAuthority)});
 for(const f of w.forms){const old=legacy.get(oldName(f.text));if(old)Object.assign(f,{audioKey:old.f.audioKey,audio:null,audioOrigin:'fos-synthetic',source:old.f.source,example:clone(old.f.example)});}
 checks.push({p,w,original,expected:expected.get(p.book.id+':'+p.lesson.id+':'+w.id)});collisions.push({scope:p.book.id+':'+p.lesson.id,word:w.forms.map(f=>f.text).join(' / '),oldMeaning:match.w.primaryMeaning,restoredMeaning:primaryMeaning(original)});
}
await repairFosCollisions(data,updated,async url=>{const file=url.pathname.split('/').at(-1),bytes=await fs.readFile(new URL('src/static/content/'+file,root));return {ok:true,arrayBuffer:async()=>bytes};});
applyFosContent(data);
for(const {p,w,original,expected}of checks){if(w.id!==original.id||JSON.stringify(w.forms.map(f=>f.id))!==JSON.stringify(original.forms.map(f=>f.id))||JSON.stringify(w.meanings)!==JSON.stringify(expected.meanings)||w.pos!==expected.pos||JSON.stringify(w.forms.map(f=>f.example))!==JSON.stringify(expected.forms.map(f=>f.example)))problems.push({word:original.forms[0].text,problem:'legacy-collision-not-restored'});}
const personalChecks=collisions.filter(row=>row.scope==='dictionary').map((entry,i)=>{
 const row=dictionary.find(row=>row.word===entry.word),old=legacy.get(oldName(row.word)),id='w'+String(790000+i),word={id,lexiconId:row.id,lexiconWord:row.word,pos:old.w.pos,sourcePos:old.w.sourcePos,meanings:[...old.w.meanings,...row.meanings],primaryMeaning:old.w.primaryMeaning,fosAuthority:clone(old.w.fosAuthority),forms:[{id:id+'-base',text:row.word,gender:old.f.gender,tested:true,audio:null,audioKey:old.f.audioKey,example:clone(old.f.example)}]};return {row,word};
});
const personal={library:[{book:{id:'personal'},lesson:{id:'L01'},words:personalChecks.map(e=>e.word)}],sessions:{}};
await repairFosCollisions(personal,updated);
for(const {row,word}of personalChecks)if(word.lexiconId!==row.id||word.forms[0].id!==word.id+'-base'||word.pos!==row.pos||JSON.stringify(word.meanings)!==JSON.stringify(row.meanings)||word.forms[0].example?.fr!==row.example?.fr||word.forms[0].audio!==null||row.pos==='loc.'&&word.forms[0].gender!==null)problems.push({word:row.word,problem:'imported-content-not-restored'});
const right=updated.find(w=>w.word==='à droite'),line=updated.find(w=>w.word==='droite'&&w.pos==='n.');
if(primaryMeaning(right)!=='在右侧'||primaryMeaning(line)!=='直线')problems.push({problem:'droite-meanings-mixed'});
const summary={dictionaryEntries:dictionary.length,textbookEntries:library.reduce((n,p)=>n+p.words.length,0),legacyCollisions:collisions.length,restoredTextbookWords:checks.length,restoredImportedContentVariants:personalChecks.length,problems:problems.length,examples:{right:{word:right.word,meaning:primaryMeaning(right),example:right.example.fr},line:{word:line.word,meaning:primaryMeaning(line),example:line.example.fr}},scope:'Pure bundled-content matching and legacy-word repair audit; no personal records or device/UI tests.'};
const out=new URL('.lexicon-work/choice-semantics/',root);await fs.mkdir(out,{recursive:true});await fs.writeFile(new URL('fos-matching.json',out),JSON.stringify({summary,collisions,problems},null,2)+'\n');console.log(JSON.stringify(summary,null,2));if(problems.length){console.log(JSON.stringify(problems));process.exitCode=1;}
