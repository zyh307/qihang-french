import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),file=new URL('src/static/lexicon/french.json',root);
const bytes=await fs.readFile(new URL('src/lexicon/common-supplement.json',root)),source=JSON.parse(bytes),dictionary=JSON.parse(await fs.readFile(file,'utf8'));
const key=s=>s.normalize('NFC').replaceAll('’',"'").toLocaleLowerCase('fr');
const existing=new Map(dictionary.entries.map(e=>[key(e.word),e]));let added=0;
for(const e of source.entries){
 if(!e.word||!e.ipa||!e.meanings.length||e.meanings.length>3||!e.fr.includes(e.highlight)||!e.zh||e.pos==='n.'&&!['m','f'].includes(e.gender))throw Error('Invalid common entry: '+e.word);
 const old=existing.get(key(e.word));if(old&&!old.commonSupplement)continue;
 const row={id:old?.id||'lex'+createHash('sha256').update(e.word).digest('hex').slice(0,20),word:e.word,pos:e.pos,gender:e.gender,meanings:e.meanings,primaryMeaning:e.primaryMeaning||e.meanings[0],ipa:e.ipa,frequency:e.frequency||0,source:'Wiktionary · 启航法语常用词校订',sourceUrl:e.sourceUrl,commonSupplement:1,reviewedPrimarySense:true,literal:e.literal??(e.pos!=='n.'),...(e.plural?{plural:true}:{}),...(e.aliases?{aliases:e.aliases}:{}),...(e.word==='etc.'?{aliases:['etc']}:{}),example:{fr:e.fr,zh:e.zh,meaning:e.primaryMeaning||e.meanings[0],highlight:e.highlight,authored:true,source:'启航法语 · 常用词例句'}};
 if(old)Object.assign(old,row);else{dictionary.entries.push(row);existing.set(key(row.word),row);added++;}
}
const output=JSON.stringify(dictionary);await fs.writeFile(file,output);
const manifestFile=new URL('src/static/lexicon/manifest.json',root),m=JSON.parse(await fs.readFile(manifestFile,'utf8'));
m.sha256=createHash('sha256').update(output).digest('hex');m.commonSupplement={entries:source.entries.length,date:source.date,sha256:createHash('sha256').update(bytes).digest('hex')};m.stats={...m.stats,words:dictionary.entries.length,ipa:dictionary.entries.filter(e=>e.ipa).length,examples:dictionary.entries.filter(e=>e.example?.fr).length,translatedExamples:dictionary.entries.filter(e=>e.example?.zh?.trim()).length,authoredExamples:dictionary.entries.filter(e=>e.example?.authored).length};await fs.writeFile(manifestFile,JSON.stringify(m,null,2)+'\n');console.log(`Common words added: ${added}; dictionary: ${dictionary.entries.length}`);
