import fs from 'node:fs';
import {conjugationSearchKey,searchVariants} from '../src/conjugation/search-key.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../src/conjugation/'+name+'.json',import.meta.url),'utf8'));
const catalog={...read('catalog'),...read('ir-catalog'),...read('source-catalog')};
const rows=[];
for(const [lemma,tenses] of Object.entries(catalog)){
 const keys=new Set();
 for(const persons of Object.values(tenses))for(const [person,raw] of Object.entries(persons)){
  for(const form of searchVariants(person,raw)){
   const key=conjugationSearchKey(form);
   keys.add(key);
  }
 }
 rows.push([lemma,"|"+[...keys].join("|")+"|"]);
}
fs.writeFileSync(new URL('../src/conjugation/search-forms.json',import.meta.url),JSON.stringify(rows));
