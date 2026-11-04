import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'src/static/lexicon/french.json');
const source=JSON.parse(await fs.readFile(path.join(root,'src/lexicon/example-translations.json'),'utf8'));
if(source.schema!==1||source.sourceLanguage!=='fr'||source.targetLanguage!=='zh-CN')throw Error('例句翻译资料无效');
const dictionary=JSON.parse(await fs.readFile(file,'utf8'));let added=0;
for(const row of dictionary.entries){
 const example=row.example;
 if(example?.fr&&(!String(example.zh||'').trim()||example.translationOrigin==='bundled'&&source.entries[example.fr]&&source.entries[example.fr]!==example.zh)){
  const zh=source.entries[example.fr];
  if(!zh?.trim())throw Error('例句缺少中文翻译：'+row.word);
  example.zh=zh;example.translationOrigin='bundled';added++;
 }
}
const raw=JSON.stringify(dictionary);await fs.writeFile(file,raw);
const manifestFile=path.join(root,'src/static/lexicon/manifest.json');
const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
manifest.sha256=createHash('sha256').update(raw).digest('hex');
manifest.stats.translatedExamples=dictionary.entries.filter(row=>row.example?.fr&&row.example.zh?.trim()).length;
manifest.exampleTranslations={date:source.date,provider:source.provider,entries:Object.keys(source.entries).length,sha256:createHash('sha256').update(await fs.readFile(path.join(root,'src/lexicon/example-translations.json'))).digest('hex')};
await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
console.log(`例句中文翻译：${manifest.stats.translatedExamples}/${dictionary.entries.length}（补充 ${added} 条）`);
