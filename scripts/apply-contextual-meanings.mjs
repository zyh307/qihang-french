import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import reviewed from '../src/lexicon/reviewed-example-meanings.json' with {type:'json'};
const file=new URL('../src/static/lexicon/french.json',import.meta.url),data=JSON.parse(await fs.readFile(file,'utf8'));let count=0;
const key=s=>String(s).normalize('NFC').replaceAll('’',"'").replace(/\s+/g,' ').trim();
for(const row of data.entries){const match=reviewed[row.word];if(!match||!row.example?.fr||key(match.fr)!==key(row.example.fr))continue;row.primaryMeaning=match.meaning;if(match.pos){row.pos=match.pos;row.gender=match.gender;}row.example.meaning=match.meaning;if(match.zh){row.example.zh=match.zh;row.example.translationOrigin='reviewed';}count++;}
const bytes=JSON.stringify(data);await fs.writeFile(file,bytes);const manifestFile=new URL('../src/static/lexicon/manifest.json',import.meta.url),m=JSON.parse(await fs.readFile(manifestFile,'utf8'));m.sha256=createHash('sha256').update(bytes).digest('hex');m.reviewedExampleMeanings={entries:count,method:'Reviewed against the French example; explicit example sense; user choices preserved.'};await fs.writeFile(manifestFile,JSON.stringify(m,null,2)+'\n');console.log('Reviewed example defaults applied:',count);
