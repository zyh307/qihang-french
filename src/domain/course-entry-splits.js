import splits from '../lexicon/course-entry-splits.json' with {type:'json'};
const clone=value=>JSON.parse(JSON.stringify(value));
const textKey=value=>String(value||'').normalize('NFC').replaceAll('’',"'").toLocaleLowerCase('fr').trim();
const speech=text=>'tts:'+encodeURIComponent(text);
function childId(data,suggested){const used=new Set([...data.library.flatMap(p=>p.words.map(w=>w.id)),...(data.reservedWordIds||[]),...Object.keys(data.progress||{}).map(key=>key.split(':')[2])]);let serial=Number(suggested.slice(1));while(used.has('w'+String(serial).padStart(6,'0')))serial++;if(serial>999999)throw Error('词条编号不足 / Identifiants épuisés.');return 'w'+String(serial).padStart(6,'0');}

// Split only the explicitly requested combined entries. Keep the parent's ID,
// learning dates and review schedule; each new word receives an independent copy.
export function applyCourseEntrySplits(data){
 for(const split of splits){
  const pkg=data.library.find(p=>p.book.id===split.book&&p.lesson.id===split.lesson);
  if(!pkg)continue;
  const parent=pkg.words.find(w=>w.forms.some(f=>textKey(f.text)===textKey(split.fromText)));
  if(!parent)continue;
  const original=clone(parent),originalForm=original.forms[0],parentKey=`${pkg.book.id}:${pkg.lesson.id}:${parent.id}`;
  const children=split.parts.map((part,index)=>{
   const word=index?clone(original):parent;
   word.id=index?childId(data,part.wordId):original.id;
   word.meanings=[part.meaning];word.primaryMeaning=part.meaning;delete word.primaryMeaningChosen;
   word.sourceText=part.text;word.sourcePos='n.f.';word.pos='n.';
   word.entrySplit={from:split.fromText,parentId:original.id,part:index,revision:1};
   if(index)word.audioNumber=String(900+Number(original.audioNumber||split.wordId.slice(-3)));
   const formId=index?word.id+'-base':originalForm.id;
   word.forms=[{id:formId,text:part.text,gender:'f',tested:true,ipa:part.ipa,audio:null,audioKey:speech(part.text),audioOrigin:'synthesized',source:originalForm.source||'Inspire 1 · '+pkg.lesson.id,example:{fr:part.fr,zh:part.zh,source:'启航法语编写',sourceKind:'authored',authored:true,translationOrigin:'reviewed',audioKey:speech(part.fr),audioOrigin:'synthesized'}}];
   if(index){
    const childKey=`${pkg.book.id}:${pkg.lesson.id}:${word.id}`,previous=data.progress?.[parentKey];
    if(previous&&!data.progress[childKey]){
     const record=clone(previous),savedForm=record.forms?.[originalForm.id];
     record.forms=savedForm?{[formId]:savedForm}:{};data.progress[childKey]=record;
    }
    if(data.favorites?.[parentKey])data.favorites[childKey]=true;
    if(data.importedWords?.[parentKey]&&!data.importedWords[childKey])data.importedWords[childKey]=clone(data.importedWords[parentKey]);
    for(const session of Object.values(data.sessions||{}))if(session.lessonKey===`${pkg.book.id}:${pkg.lesson.id}`&&session.mode==='learn'&&session.phase!=='done'&&(!previous||previous.notebook==='practice')&&Array.isArray(session.pending)&&!session.pending.includes(word.id))session.pending.push(word.id);
   }
   return word;
  });
  const at=pkg.words.indexOf(parent);pkg.words.splice(at,1,...children);
  pkg.words.forEach((word,index)=>word.order=index+1);
  pkg.lesson.version=(pkg.lesson.version||1)+1;
  for(const session of Object.values(data.sessions||{})){
   const local=session.lessonKey===`${pkg.book.id}:${pkg.lesson.id}`;
   for(const option of session.question?.options||[])if(option.id===parentKey||(local&&option.id===original.id)){option.label=session.question.kind==='recognize'?parent.meanings[0]:parent.forms[0].text;if(option.french)option.french=parent.forms[0].text;}
  }
 }
}
