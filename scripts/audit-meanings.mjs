import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {unzipSync,strFromU8} from 'fflate';
import {primaryMeaning,meaningPoints} from '../src/domain/meanings.js';
import examples from '../src/lexicon/reviewed-example-meanings.json' with {type:'json'};
import definitions from '../src/lexicon/reviewed-definition-corrections.json' with {type:'json'};
import exampleCorrections from '../src/lexicon/dictionary-example-corrections.json' with {type:'json'};

const root=new URL('../',import.meta.url),read=async name=>JSON.parse(await fs.readFile(new URL(name,root),'utf8'));
const dictionary=await read('src/static/lexicon/french.json');
const previous=JSON.parse(execFileSync('git',['show','HEAD:src/static/lexicon/french.json'],{cwd:root,maxBuffer:64*1024*1024,encoding:'utf8'}));
const old=new Map(previous.entries.map(row=>[row.id,row]));
const key=s=>String(s||'').normalize('NFC').replaceAll('’',"'").replace(/\s+/g,' ').trim();
const problems=[],records=[],ids=new Set();let changed=0,pointCount=0,reviewed=0;
if(dictionary.entries.length!==previous.entries.length)problems.push({problem:'entry-count-changed'});
for(const row of dictionary.entries){
 const before=old.get(row.id),meaning=primaryMeaning(row),points=meaningPoints(row);
 const status=examples[row.word]&&key(examples[row.word].fr)===key(row.example?.fr)?'reviewed-example':definitions[row.word]?'reviewed-definition':'not-individually-reviewed';
 if(status!=='not-individually-reviewed')reviewed++;
 if(!before||before.word!==row.word||ids.has(row.id))problems.push({word:row.word,problem:'identity-changed'});
 const reviewedReplacement=exampleCorrections.some(fix=>fix.word===row.word&&fix.previousFr===before?.example?.fr&&fix.fr===row.example?.fr);
 if(before&&(before.ipa!==row.ipa||(before.example?.fr!==row.example?.fr&&!reviewedReplacement)))problems.push({word:row.word,problem:'unrelated-pronunciation-or-sentence-change'});
 if(!meaning||!points.length||!/\p{Script=Han}/u.test(meaning))problems.push({word:row.word,problem:'missing-chinese-definition'});
 if(/(?:国际音标.*\/|名词\s*=|仅按字面意思|^\s*(?:et|ou|pro|pr|t|pl)[.\s]*$)/u.test(meaning))problems.push({word:row.word,problem:'dictionary-metadata-as-definition'});
 if(before&&(JSON.stringify(before.meanings)!==JSON.stringify(row.meanings)||before.primaryMeaning!==meaning))changed++;
 pointCount+=points.length;ids.add(row.id);
 records.push({word:row.word,pos:row.pos,primary:meaning,meanings:points,example:row.example?.fr,translation:row.example?.zh,status});
}
let textbookWords=0,textbookPoints=0;
for(const number of [1,2,3,4]){
 const archive=unzipSync(await fs.readFile(new URL(`src/static/content/inspire${number}.zip`,root)));
 const book=JSON.parse(strFromU8(archive['manifest.json']));
 for(const pkg of book.library)for(const word of pkg.words){
  const meaning=primaryMeaning(word),points=meaningPoints(word);textbookWords++;textbookPoints+=points.length;
  if(!meaning||!/\p{Script=Han}/u.test(meaning)||!points.length)problems.push({book:pkg.book.id,lesson:pkg.lesson.id,word:word.id,problem:'missing-textbook-definition'});
 }
}
const summary={dictionaryEntries:dictionary.entries.length,dictionarySensePoints:pointCount,textbookWords,textbookSensePoints:textbookPoints,individualSemanticReviews:reviewed,notIndividuallyReviewed:dictionary.entries.length-reviewed,changedSincePublishedDictionary:changed,structuralProblems:problems.length,note:'Structural checks cover all entries. They do not certify the semantics of unreviewed entries.'};
const output=new URL('.lexicon-work/meanings-audit/',root);await fs.mkdir(output,{recursive:true});
await fs.writeFile(new URL('report.json',output),JSON.stringify({summary,problems,records},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(problems.length){console.error(JSON.stringify(problems.slice(0,20)));process.exitCode=1;}
