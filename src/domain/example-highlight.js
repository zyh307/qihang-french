import {spellingParts} from './word-display.js';
const irregular={
  aller:['vais','vas','va','allons','allez','vont','allé','allée'],
  faire:['fais','fait','faisons','faites','font','faits','faite','faites'],
  boire:['bois','boit','buvons','buvez','boivent','bu'],
  prendre:['prends','prend','prenons','prenez','prennent','pris','prise'],
  lire:['lis','lit','lisons','lisez','lisent','lu','lue'],
  écrire:['écris','écrit','écrivons','écrivez','écrivent','écrits'],
  dormir:['dors','dort','dormons','dormez','dorment','dormi'],
  sortir:['sors','sort','sortons','sortez','sortent','sorti','sortie'],
  courir:['cours','court','courons','courez','courent','couru'],
  lever:['lève','lèves','levons','levez','lèvent','levé'],
};
function verbForms(verb){
  const forms=[verb,...(irregular[verb]||[])],stem=verb.slice(0,-2);
  if(verb.endsWith('er'))forms.push(...['e','es','ons','ez','ent','é','ée','és','ées'].map(end=>stem+end));
  if(verb.endsWith('ger'))forms.push(stem+'eons');
  if(verb.endsWith('ir'))forms.push(...['is','it','issons','issez','issent','i','ie'].map(end=>stem+end));
  if(verb.endsWith('re'))forms.push(...['s','','ons','ez','ent','u','ue'].map(end=>stem+end));
  return forms;
}
function phrases(word){
  const result=new Set();
  for(const form of word.forms){
    result.add(spellingParts(word,form).text.trim().replace(/[.!?…,:;\s]+$/u,''));
    const text=spellingParts(word,form).answer.trim().replace(/[.!?…,:;\s]+$/u,'');if(!text)continue;
    result.add(text);result.add(text+'s');result.add(text+'x');
    if(word.pos==='adj.'){
      const feminine={blanc:'blanche',long:'longue',beau:'belle',nouveau:'nouvelle',vieux:'vieille',doux:'douce',faux:'fausse'}[text]
        ||(/eux$/.test(text)?text.slice(0,-3)+'euse':/f$/.test(text)?text.slice(0,-1)+'ve':/er$/.test(text)?text.slice(0,-2)+'ère':/e$/.test(text)?text:text+'e');
      result.add(feminine);result.add(feminine+'s');
    }
    const pieces=text.split(' '),first=pieces[0];
    if(pieces.length>1){result.add(first+'s '+pieces.slice(1).join(' '));result.add(first+'x '+pieces.slice(1).join(' '));}
    const reflexive=/^(?:se\s+|s['’])(.+)$/i.exec(text),body=reflexive?reflexive[1]:text;
    const [verb,...tail]=body.split(' ');
    if(word.pos==='v.'||reflexive||irregular[verb]||['faire','prendre','rentrer','planter','boire'].includes(verb)){
      for(const variant of verbForms(verb)){
        const phrase=[variant,...tail].join(' ');result.add(phrase);
        if(tail.join(' ')==='chez soi')for(const who of ['moi','toi','lui','elle','nous','vous','eux','elles'])result.add(variant+' chez '+who);
        if(reflexive)for(const pronoun of ['me ','te ','se ','nous ','vous ',"m'","t'","s'"])result.add(pronoun+phrase);
      }
    }
    if(/eau$/.test(text))result.add(text.slice(0,-3)+'eaux');
    if(/al$/.test(text))result.add(text.slice(0,-2)+'aux');
  }
  return [...result].filter(Boolean).sort((a,b)=>b.length-a.length);
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/['’]/g,"['’]").replace(/\s+/g,'\\s+');
export function highlightExample(text,word){
  const source=String(text||'');if(!word||!source)return [{text:source,hit:false}];
  const candidates=phrases(word);if(!candidates.length)return [{text:source,hit:false}];
  const pattern=new RegExp(`(^|[^\\p{L}\\p{N}])(${candidates.map(escape).join('|')})(?=$|[^\\p{L}\\p{N}])`,'giu');
  const parts=[];let cursor=0;
  for(const match of source.matchAll(pattern)){
    const start=match.index+match[1].length,end=start+match[2].length;
    if(start>cursor)parts.push({text:source.slice(cursor,start),hit:false});
    parts.push({text:source.slice(start,end),hit:true});cursor=end;
  }
  if(cursor<source.length)parts.push({text:source.slice(cursor),hit:false});
  return parts.length?parts:[{text:source,hit:false}];
}
