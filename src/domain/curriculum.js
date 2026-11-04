import {splitNounArticle,spellingParts} from './word-display.js';
const exact=value=>String(value||'').normalize('NFC').toLocaleLowerCase('fr').replaceAll('’',"'").replace(/\s+/g,' ').trim();
export const isTextbook=id=>/^inspire[1-4]$/.test(id||'');
export const curriculumFormKey=(word,form)=>{const gender=form.gender||splitNounArticle(form.text).gender||(/n\.m/i.test(word.sourcePos||'')?'m':/n\.f/i.test(word.sourcePos||'')?'f':null);return word.pos+':'+exact(spellingParts(word,form).answer)+(word.pos==='n.'?':'+(gender||'?'):'');};
export function curriculumForms(text,sourcePos){
 if(text==='se sentir (bien, mal, fatigué(e))')return {pos:'v.',audioFormIndex:2,forms:[{text:'se sentir bien',meaning:'感觉良好',gender:null,tested:true,audio:null,ipa:'/sə sɑ̃tiʁ bjɛ̃/'},{text:'se sentir mal',meaning:'感觉不适',gender:null,tested:true,audio:null,ipa:'/sə sɑ̃tiʁ mal/'},{text:'se sentir fatigué',meaning:'感到疲惫',gender:'m',tested:true,audio:null,ipa:'/sə sɑ̃tiʁ fatiɡe/'},{text:'se sentir fatiguée',meaning:'感到疲惫',gender:'f',tested:false,audio:null,ipa:'/sə sɑ̃tiʁ fatiɡe/'}]};
 const pos=/^n[.]/.test(sourcePos)?'n.':/^v[.]/.test(sourcePos)?'v.':sourcePos;
 const clean=String(text).replace(/\s*\((?:m|f)(?:\.?\s*pl)?\.?\)\s*/gi,'').replace(/\s*\((?:fam\.?|grossier|fig\.?)\)\s*/gi,'').trim();
 let names=clean.includes('(e)')?[clean.replace('(e)',''),clean.replace('(e)','e')]:clean.split(/\s*[/／]\s*/);
 names=names.map(name=>name.replace(/\s*\(([^)]*)\)/g,'').replace(/\s+/g,' ').trim());
 if(names.length===2&&!names[1].includes(' ')&&names[0].includes(' ')&&!splitNounArticle(names[1]).prefix){const parts=names[0].split(' '),last=parts.pop();let common=0;while(common<last.length&&last[common]===names[1][common])common++;if(common>=3)names[1]=parts.join(' ')+' '+names[1];}
 const difference=names.length===2?names[0].split(' ').map((word,index)=>[word,names[1].split(' ')[index]]).filter(([a,b])=>a!==b):[];
 const relatedPair=names.length===2&&names[0].split(' ').length===names[1].split(' ').length&&difference.length>0&&difference.every(([a,b])=>{let n=0;while(n<Math.min(a.length,b.length)&&a[n]===b[n])n++;return n>=3;});
 const forms=names.map((name,index)=>{
  let gender=splitNounArticle(name).gender||(/n\.m/.test(sourcePos)?'m':/n\.f/.test(sourcePos)?'f':null);
  if(names.length===2&&!splitNounArticle(name).gender&&(clean.includes('(e)')||relatedPair||pos==='adj.')){const first=/n\.f/.test(sourcePos)?'f':'m';gender=index===0?first:first==='m'?'f':'m';}
  return {text:name,gender,tested:true,audio:null};
 });
 if(forms.length===2&&forms[0].gender==='m'&&forms[1].gender==='f'){
  const base=spellingParts({pos},forms[0]).answer,feminine=spellingParts({pos},forms[1]).answer;
  if(exact(feminine)===exact(base+'e')||/s$/.test(base)&&exact(feminine)===exact(base.slice(0,-1)+'es'))forms[1].tested=false;
 }
 if(clean.includes('(e)')&&pos!=='n.')for(const f of forms)if(f.gender==='f')f.tested=false;
 if(names.join('|')==='chez soi|chez moi|chez toi')forms.forEach((f,i)=>{f.meaning=['在自己家','在我家','在你家'][i];});
 if(names.join('|')==="l'œil|les yeux")forms.forEach((f,i)=>{f.gender='m';f.questionHint=i?'复数 · Pluriel':'单数 · Singulier';});
 return {pos,forms};
}
// Textbook content replaces generic dictionary content without changing IDs,
// notebook membership, progress or frozen practice queues.
export function applyTextbookContent(data){
 const lookup=new Map();
 for(const p of data.library.filter(p=>isTextbook(p.book.id)))for(const w of p.words)if(w.curriculumAuthority)for(const f of w.forms){const key=curriculumFormKey(w,f),old=lookup.get(key);if(!old||f.audioOrigin==='textbook-human'&&old.f.audioOrigin!=='textbook-human')lookup.set(key,{p,w,f});}
 let updated=0;
 for(const p of data.library.filter(p=>!isTextbook(p.book.id)))for(const w of p.words){
  if(w.conjugation)continue;
  for(const f of w.forms){
   const key=curriculumFormKey(w,f),entry=lookup.get(key)||(w.pos==='n.'?lookup.get(key.replace(/:[mf]$/,':?')):null);if(!entry)continue;
   const source=entry.w,form=entry.f;w.meanings=[...source.meanings];
   if(!w.primaryMeaningChosen||!w.meanings.some(m=>m.includes(w.primaryMeaning))){w.primaryMeaning=source.primaryMeaning;w.primaryMeaningChosen=false;}
   w.curriculumAuthority={...source.curriculumAuthority};f.source=form.source||source.forms[0].source;
   if(form.ipa&&(f.text===form.text||form.audioOrigin==='textbook-human'))f.ipa=form.ipa;
   for(const field of ['meaning','questionHint'])if(form[field])f[field]=form[field];
   if(form.audioKey&&(form.audioOrigin==='textbook-human'||!f.audioKey)){
    f.audioKey=form.audioKey;f.audioOrigin=form.audioOrigin;f.audio=form.audio;f.text=form.text;f.gender=form.gender||f.gender;
   }
   const example=source.forms.find(f=>f.example?.fr)?.example;
   if(example&&(example.sourceKind==='textbook'||!f.example?.fr)){
    const audio=f.example?.fr===example.fr?f.example.audioKey:null;
    f.example={...example,...(!example.audioKey&&audio?{audioKey:audio}:{})};
   }
   updated++;
  }
 }
 return updated;
}
