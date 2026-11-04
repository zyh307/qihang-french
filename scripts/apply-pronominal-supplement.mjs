import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),file=new URL('src/static/lexicon/french.json',root);
const sourceFile=new URL('src/lexicon/pronominal-supplement.json',root),sourceBytes=await fs.readFile(sourceFile);
const source=JSON.parse(sourceBytes),dictionary=JSON.parse(await fs.readFile(file,'utf8'));
if(source.schema!==1||!Array.isArray(source.entries))throw Error('自反动词补充资料无效');
const exact=text=>String(text).normalize('NFC').replaceAll('’',"'").toLocaleLowerCase('fr');
const existing=new Map(dictionary.entries.map(row=>[exact(row.word),row]));let added=0;
for(const entry of source.entries){
 if(!/^(?:se |s')/.test(entry.word)||!entry.ipa?.startsWith('/')||!entry.meanings?.length||!entry.fr||!entry.zh||!entry.fr.includes(entry.highlight))throw Error('自反动词资料不完整：'+entry.word);
 const old=existing.get(exact(entry.word));if(old&&!old.pronominalSupplement)continue;
 const base=entry.word.replace(/^(?:se |s')/,'').split(' ')[0],original=existing.get(exact(base));
 const row={id:old?.id||'lex'+createHash('sha256').update(entry.word).digest('hex').slice(0,20),word:entry.word,pos:'v.',gender:null,meanings:[...entry.meanings],primaryMeaning:entry.meanings[0],ipa:entry.ipa,frequency:original?.frequency||3,source:source.source,sourceUrl:'https://fr.wiktionary.org/wiki/'+encodeURIComponent(base),ipaSource:'Wiktionary · 启航法语音标校订',pronominalSupplement:1,reviewedPrimarySense:true,...(entry.aliases?.length?{aliases:[...entry.aliases]}:{}),example:{fr:entry.fr,zh:entry.zh,highlight:entry.highlight,authored:true,source:'启航法语 · 自反动词例句'}};
 if(old)Object.assign(old,row);else{dictionary.entries.push(row);existing.set(exact(row.word),row);added++;}
}
const bytes=JSON.stringify(dictionary);await fs.writeFile(file,bytes);
const manifestFile=new URL('src/static/lexicon/manifest.json',root),manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
manifest.sha256=createHash('sha256').update(bytes).digest('hex');
manifest.stats={...manifest.stats,words:dictionary.entries.length,ipa:dictionary.entries.filter(row=>row.ipa).length,examples:dictionary.entries.filter(row=>row.example?.fr).length,translatedExamples:dictionary.entries.filter(row=>row.example?.zh?.trim()).length,authoredExamples:dictionary.entries.filter(row=>row.example?.authored).length};
manifest.pronominalSupplement={entries:source.entries.length,date:source.date,sha256:createHash('sha256').update(sourceBytes).digest('hex'),method:'Reviewed pronominal uses, separately authored French-Chinese examples and explicit usage aliases; existing headwords and IDs preserved.'};
await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
console.log(`自反动词：补充 ${added} 条，共 ${source.entries.length} 条；词库 ${dictionary.entries.length} 条。`);
