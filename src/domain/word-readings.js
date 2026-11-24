import readings from '../lexicon/word-readings.json' with {type:'json'};

const exact=value=>String(value||'').normalize('NFC').replaceAll('’',"'").replace(/^(?:un|une|le|la|les|des)\s+|^l'/iu,'').trim().toLocaleLowerCase('fr');
export const grammaticalKind=value=>String(value||'').trim().toLocaleLowerCase('fr').split(/[.\s]/u)[0];
export const grammaticalLabel=value=>({n:'名词',adj:'形容词',v:'动词',adv:'副词',prép:'介词',pron:'代词',art:'冠词',conj:'连词',interj:'感叹词',loc:'短语',num:'数词'}[grammaticalKind(value)]||'')+' · '+String(value||'');
const byId=new Map(readings.flatMap(row=>[row.id,...(row.legacyIds||[]),...(row.courseIds||[])].map(id=>[id,row])));
export function reviewedReading(word){
 if(!word||word.conjugation)return null;
 const direct=byId.get(word.lexicalReading||word.lexiconId||word.id);if(direct)return direct;
 // Unreviewed homographs are never merged by a guessed suffix or lemma.
 const name=exact(word.lexiconWord||word.word||word.forms?.[0]?.text),kind=grammaticalKind(word.pos);
 return readings.find(row=>!row.splitSense&&(word.lexiconWord||row.matchSpelling)&&(row.word===name||row.aliases?.includes(name))&&grammaticalKind(row.pos)===kind)||null;
}
export function applyReviewedForms(word,row){
 if(!word.forms?.length)return;
 const ids=new Set(word.forms.map(form=>form.id));
 for(const descriptor of row.forms){
  const existing=word.forms.find(form=>exact(form.text)===descriptor.text);
  if(existing){
   existing.gender=descriptor.gender;existing.tested=descriptor.tested;existing.literal=true;
   if(descriptor.ipa)existing.ipa=descriptor.ipa;
   if(descriptor.questionHint)existing.questionHint=descriptor.questionHint;
   continue;
  }
  let next=1;while(ids.has(word.id+'-v'+next))next++;
  const id=word.id+'-v'+next;ids.add(id);
  word.forms.push({id,...descriptor,literal:true,studySupplement:true,audio:null,audioKey:'tts:'+encodeURIComponent(descriptor.text)});
 }
 word.forms.sort((left,right)=>row.forms.findIndex(form=>form.text===exact(left.text))-row.forms.findIndex(form=>form.text===exact(right.text)));
}
export function applyReviewedReading(word){
 const row=reviewedReading(word);if(!row)return;
 word.lexicalReading=row.id;word.pos=row.pos;word.sourcePos=row.pos;
 word.meanings=[...row.meanings];
 if(row.splitSense){
  const displaced=row.displacedMeanings||[];
  if(displaced.includes(word.primaryMeaning))delete word.primaryMeaningChosen;
  if(displaced.includes(word.primaryMeaningBeforeChoice))delete word.primaryMeaningBeforeChoice;
 }
 if(row.invalidMeanings?.includes(word.primaryMeaning))delete word.primaryMeaningChosen;
 if(!word.primaryMeaningChosen)word.primaryMeaning=row.primaryMeaning;
 if(row.courseIds?.includes(word.id))return;
 if(row.matchSpelling){applyReviewedForms(word,row);return;}
 if(!word.forms)return;
 for(const form of word.forms){
  const descriptor=row.forms.find(f=>f.text===exact(form.text));if(!descriptor)continue;
  form.gender=descriptor.gender;form.literal=row.pos!=='n.';
  if(descriptor.ipa)form.ipa=descriptor.ipa;
  form.example={...(form.example?.fr===row.example.fr?form.example:{audioKey:'tts:'+encodeURIComponent(row.example.fr)}),...row.example};
  delete form.meaning;
 }
 for(const descriptor of row.forms){
  if(word.forms.some(form=>exact(form.text)===descriptor.text))continue;
  const spoken=(row.pos==='n.'?(descriptor.gender==='f'?'une ':'un '):'')+descriptor.text;
  const id=word.id+'-'+descriptor.gender;
  word.forms.push({id,...descriptor,ipa:descriptor.ipa||word.forms[0]?.ipa||'',literal:row.pos!=='n.',audio:null,audioKey:'tts:'+encodeURIComponent(spoken),example:{...row.example,audioKey:'tts:'+encodeURIComponent(row.example.fr)}});
 }
}
export function applyDictionaryReadings(entries){
 const ids=new Set(entries.map(row=>row.id));
 const result=entries.map(entry=>{
  const row=byId.get(entry.id);if(!row)return entry;
  return {...entry,pos:row.pos,gender:row.legacyIds?.includes(entry.id)?entry.gender:row.gender,meanings:[...row.meanings],primaryMeaning:row.primaryMeaning,example:{...(entry.example?.fr===row.example.fr?entry.example:{}),...row.example},aliases:[...new Set([...(entry.aliases||[]),...(row.aliases||[])])],lexicalReading:row.id};
 });
 for(const row of readings)if(!ids.has(row.id)){
  const {forms,courseIds,splitSense,displacedMeanings,...entry}=row;
  result.push({...entry,lexicalReading:row.id,ipa:forms[0]?.ipa||'',frequency:row.frequency||4.38,source:'Wiktionary',sourceUrl:'https://zh.wiktionary.org/wiki/'+encodeURIComponent(row.word)});
 }
 return result;
}
export function readingSpellings(word){
 const row=reviewedReading(word);
 return [...new Set([word.word,word.lexiconWord,...(word.forms||[]).map(form=>form.text),...(word.aliases||[]),...(row?.forms||[]).map(form=>form.text)].filter(Boolean).map(exact))];
}
