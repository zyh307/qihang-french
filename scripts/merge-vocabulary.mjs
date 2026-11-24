import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {mergeVocabularyContent,mergeVocabularyDictionary} from '../src/domain/vocabulary-merge.js';
import {vocabularyGroups} from '../src/domain/vocabulary-merge.js';

const root=new URL('../',import.meta.url),read=async file=>JSON.parse(await fs.readFile(new URL(file,root),'utf8'));
const library=[];
for(const book of ['inspire1','inspire2','inspire3','inspire4','fos1']){
 const files=unzipSync(await fs.readFile(new URL('src/static/content/'+book+'.zip',root)),{filter:f=>f.name==='manifest.json'});
 library.push(...JSON.parse(strFromU8(files['manifest.json'])).library);
}
// Keep a pristine course snapshot: older installations may already contain
// copied FOS/dictionary content, so runtime selection cannot rely on them.
vocabularyGroups(library);
await fs.writeFile(new URL('src/lexicon/vocabulary-content.json',root),JSON.stringify({library}));
const stats=mergeVocabularyContent({library},[]);
const file='src/static/lexicon/french.json',dictionary=await read(file),before=dictionary.entries.map(row=>[row.id,row.word]);
dictionary.entries=mergeVocabularyDictionary(dictionary.entries,library,[]);
if(JSON.stringify(before)!==JSON.stringify(dictionary.entries.map(row=>[row.id,row.word])))throw Error('Vocabulary identifiers changed');
const bytes=JSON.stringify(dictionary);await fs.writeFile(new URL(file,root),bytes);
const byId=new Map(dictionary.entries.map(row=>[row.id,row])),distractors=await read('src/static/lexicon/distractors.json');
for(const row of distractors){const source=byId.get(row.id);if(source)for(const field of ['meanings','primaryMeaning','pos','gender'])row[field]=source[field];}
await fs.writeFile(new URL('src/static/lexicon/distractors.json',root),JSON.stringify(distractors));
const manifest=await read('src/static/lexicon/manifest.json');manifest.sha256=createHash('sha256').update(bytes).digest('hex');
manifest.textbookVocabulary={method:'Exact French spelling, grammatical kind and gender; textbook content and recorded voices take precedence; original identifiers retained',...stats};
await fs.writeFile(new URL('src/static/lexicon/manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({dictionaryRows:dictionary.entries.length,...stats,duplicateGroups:[...vocabularyGroups(library).values()].filter(rows=>rows.length>1).length}));
