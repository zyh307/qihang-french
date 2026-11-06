import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import reviewed from '../src/lexicon/reviewed-example-meanings.json' with {type:'json'};
import definitions from '../src/lexicon/reviewed-definition-corrections.json' with {type:'json'};
import exampleCorrections from '../src/lexicon/dictionary-example-corrections.json' with {type:'json'};
import {primaryMeaning} from '../src/domain/meanings.js';
const file=new URL('../src/static/lexicon/french.json',import.meta.url),data=JSON.parse(await fs.readFile(file,'utf8'));let count=0;
const key=s=>String(s).normalize('NFC').replaceAll('’',"'").replace(/\s+/g,' ').trim();
for(const row of data.entries){const fix=exampleCorrections.find(c=>c.word===row.word&&key(c.previousFr)===key(row.example?.fr||''));if(fix)row.example={fr:fix.fr,zh:fix.zh,meaning:fix.meaning,source:'启航法语编写',authored:true,translationOrigin:'reviewed'};}
for(const row of data.entries){const fix=definitions[row.word];if(fix){row.meanings=[...fix.meanings];row.primaryMeaning=fix.meaning;}}
for(const row of data.entries){const match=reviewed[row.word];if(!match||!row.example?.fr||key(match.fr)!==key(row.example.fr))continue;row.primaryMeaning=match.meaning;if(match.meanings)row.meanings=[...match.meanings];if(match.pos){row.pos=match.pos;row.gender=match.gender;}row.example.meaning=match.meaning;if(match.zh){row.example.zh=match.zh;row.example.translationOrigin='reviewed';}count++;}
for(const row of data.entries)row.primaryMeaning=primaryMeaning(row);
const distractorFile=new URL('../src/static/lexicon/distractors.json',import.meta.url),distractors=JSON.parse(await fs.readFile(distractorFile,'utf8')),byId=new Map(data.entries.map(row=>[row.id,row]));
for(const distractor of distractors){const row=byId.get(distractor.id);if(row){for(const field of ['pos','gender','meanings','primaryMeaning'])distractor[field]=row[field];}}
await fs.writeFile(distractorFile,JSON.stringify(distractors));
const bytes=JSON.stringify(data);await fs.writeFile(file,bytes);const manifestFile=new URL('../src/static/lexicon/manifest.json',import.meta.url),m=JSON.parse(await fs.readFile(manifestFile,'utf8'));m.sha256=createHash('sha256').update(bytes).digest('hex');m.reviewedExampleMeanings={entries:count,method:'Reviewed against the French example; explicit example sense; user choices preserved.'};await fs.writeFile(manifestFile,JSON.stringify(m,null,2)+'\n');console.log('Reviewed example defaults applied:',count);
