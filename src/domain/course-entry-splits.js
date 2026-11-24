import splits from '../lexicon/course-entry-splits.json' with {type:'json'};
const clone=value=>JSON.parse(JSON.stringify(value));
const textKey=value=>String(value||'').normalize('NFC').replaceAll('’',"'").toLocaleLowerCase('fr').trim();
const speech=text=>'tts:'+encodeURIComponent(text);
function childId(data,suggested){const used=new Set([...data.library.flatMap(p=>p.words.map(w=>w.id)),...(data.reservedWordIds||[]),...Object.keys(data.progress||{}).map(key=>key.split(':')[2])]);let serial=Number(suggested.slice(1));while(used.has('w'+String(serial).padStart(6,'0')))serial++;if(serial>999999)throw Error('词条编号不足 / Identifiants épuisés.');return 'w'+String(serial).padStart(6,'0');}

// Split only the explicitly requested combined entries. Keep the parent's ID,
// learning dates and review schedule; each new word receives an independent copy.
export function applyCourseEntrySplits(data){
 splitBoyGirl(data);
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

function splitBoyGirl(data){
 for(const pkg of data.library){
  const parent=pkg.words.find(w=>w.pos==='n.'&&w.forms.some(f=>textKey(f.text)==='un garçon')&&w.forms.some(f=>textKey(f.text)==='une fille'));
  if(!parent)continue;
  const original=clone(parent),male=original.forms.find(f=>textKey(f.text)==='un garçon'),female=original.forms.find(f=>textKey(f.text)==='une fille');
  const child=clone(original);child.id=childId(data,'w090154');
  const lesson=`${pkg.book.id}:${pkg.lesson.id}`,parentKey=lesson+':'+parent.id,childKey=lesson+':'+child.id;
  const make=(word,source,meaning,fr,zh,gender)=>{
   word.sourceText=source.text;word.pos='n.';word.sourcePos=gender==='m'?'n.m.':'n.f.';word.meanings=[meaning];word.primaryMeaning=meaning;delete word.primaryMeaningChosen;delete word.patternNote;delete word.vocabularyMerge;
   word.entrySplit={parentId:parent.id,from:'un garçon / une fille',sourceFormId:source.id,revision:1};
   word.forms=[{...clone(source),id:word===parent?source.id:word.id+'-base',gender,ipa:gender==='m'?'/œ̃ ɡaʁ.sɔ̃/':'/yn fij/',example:{fr,zh,meaning,source:'启航法语编写',authored:true,translationOrigin:'reviewed',audioKey:speech(fr),audioOrigin:'synthesized'}}];
  };
  make(parent,male,'男孩',"C'est un garçon.",'这是一个男孩。','m');
  make(child,female,'女孩',"C'est une fille.",'这是一个女孩。','f');
  if(child.audioNumber)child.audioNumber=String(Math.max(900,...pkg.words.map(w=>Number(w.audioNumber)||0))+1);
  data.courseEntrySplitArchive||={};data.courseEntrySplitArchive[parentKey]||={word:original};
  for(const table of ['progress','directProgress']){
   const record=data[table]?.[parentKey];if(!record)continue;
   data.courseEntrySplitArchive[parentKey][table]||=clone(record);
   if(!data[table][childKey])data[table][childKey]={...clone(record),forms:record.forms?.[female.id]?{[child.forms[0].id]:clone(record.forms[female.id])}:{}};
   record.forms=record.forms?.[male.id]?{[male.id]:record.forms[male.id]}:{};
  }
  for(const table of ['importedWords','errorHistory','studyPressure'])if(data[table]?.[parentKey]&&!data[table][childKey])data[table][childKey]=clone(data[table][parentKey]);
  if(data.favorites?.[parentKey])data.favorites[childKey]=true;
  const errorKey=parentKey+':'+female.id,error=data.errors?.[errorKey];
  if(error){data.courseEntrySplitArchive[parentKey].femaleError=clone(error);data.errors[childKey+':'+child.forms[0].id]||={...clone(error),wordId:child.id,formId:child.forms[0].id,lesson};delete data.errors[errorKey];}
  pkg.words.splice(pkg.words.indexOf(parent)+1,0,child);pkg.words.forEach((w,i)=>w.order=i+1);pkg.lesson.version=(pkg.lesson.version||1)+1;
  for(const s of Object.values(data.sessions||{})){
   const mixed=s.lessonKey==='review:all',local=s.lessonKey===lesson||s.key?.startsWith(lesson+':');if(!mixed&&!local)continue;
   const from=mixed?parentKey:parent.id,to=mixed?childKey:child.id;
   const remap=task=>{if(task?.wordId===from&&task.formId===female.id){task.wordId=to;task.formId=child.forms[0].id;return true;}return false;};
   const femaleJobs=(s.jobs||[]).filter(job=>remap(job)).length;
   const moved=remap(s.question);remap(s.feedback);remap(s.feedback?.question);
   if((femaleJobs||moved)&&s.group?.includes(from)&&!s.group.includes(to)){s.group.push(to);s.total=s.group.length;s.progressTotal=(s.progressTotal||s.total-1)+1;}
   for(const task of [s.question,s.feedback?.question])for(const option of task?.options||[])if(option.id===from){option.label=task.wordId===to?'女孩':'男孩';option.french=task.wordId===to?female.text:male.text;if(task.wordId===to)option.id=to;}
   if(s.pending?.includes(from)&&!s.pending.includes(to)){s.pending.splice(s.pending.indexOf(from)+1,0,to);if(Number.isFinite(s.progressTotal))s.progressTotal++;}
  }
 }
}
