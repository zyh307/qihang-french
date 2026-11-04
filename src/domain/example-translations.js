const sentenceKey=text=>String(text||'').normalize('NFC').replace(/\s+/gu,' ').trim();
const missing=example=>example?.fr&&!String(example.zh||'').trim();
export function needsExampleTranslations(data){return data.library.some(p=>p.words.some(w=>w.forms.some(f=>missing(f.example))));}
export function fillExampleTranslations(data,rows){
 const translations=new Map(rows.filter(row=>row.example?.fr&&row.example.zh?.trim()).map(row=>[sentenceKey(row.example.fr),row.example.zh]));let count=0;
 for(const p of data.library)for(const w of p.words)for(const f of w.forms){
  if(!missing(f.example))continue;
  const zh=translations.get(sentenceKey(f.example.fr));
  if(zh){f.example.zh=zh;f.example.translationOrigin='bundled';count++;}
 }
 return count;
}
export async function prepareExampleTranslations(data,fetcher=fetch){
 if(!needsExampleTranslations(data))return 0;
 const response=await fetcher(new URL('static/lexicon/french.json',document.baseURI));
 if(!response.ok)throw Error('例句翻译暂时无法读取 / Traductions indisponibles.');
 return fillExampleTranslations(data,(await response.json()).entries);
}
