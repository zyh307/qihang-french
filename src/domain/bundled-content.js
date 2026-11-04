import {unzipSync,strFromU8} from 'fflate';
import {clone,packageKey,installLesson,normalize} from './learning.js';
import {BUNDLED_CONTENT_ID} from './content-version.js';
import {ADDITIONAL_BUNDLED_BOOKS} from './content-books.js';

const fingerprint=word=>JSON.stringify([word.pos,word.meanings,word.forms.map(f=>[f.text,f.gender,f.tested])]);
export function mergeBundledLessons(data,bundle,expectedId=BUNDLED_CONTENT_ID){
  if(bundle.schema!==1||bundle.id!==expectedId||!Array.isArray(bundle.library))throw new Error('内置词库异常 / Vocabulaire intégré invalide.');
  const used=new Set([...(data.reservedWordIds||[]),...data.library.flatMap(p=>p.words.map(w=>w.id)),...Object.keys(data.progress).map(key=>key.split(':')[2])]);
  const registry=new Map(data.library.flatMap(p=>p.words.map(w=>[fingerprint(w),w]))),sourceIds=new Map();let serial=1;
  const nextId=()=>{while(used.has(`w${String(serial).padStart(6,'0')}`))serial++;const id=`w${String(serial++).padStart(6,'0')}`;used.add(id);return id;};
  let installed=0;
  for(const source of bundle.library){
    // A user's imported lesson is authoritative, even with the same lesson number.
    const existing=data.library.find(p=>packageKey(p)===packageKey(source));
    if(existing){
      if(source.words.some(w=>w.curriculumAuthority)){
        for(const fresh of source.words){
          const original=existing.words.find(w=>w.audioNumber===fresh.audioNumber&&w.forms.some(f=>fresh.forms.some(g=>normalize(f.text)===normalize(g.text))));
          if(!original){
            const word=clone(fresh),oldId=word.id;word.id=nextId();word.order=Math.max(0,...existing.words.map(w=>w.order))+1;
            for(const form of word.forms)form.id=word.id+form.id.slice(oldId.length);existing.words.push(word);continue;
          }
          const oldForms=original.forms;for(const field of ['pos','sourcePos','sourceText','meanings','curriculumAuthority'])original[field]=clone(fresh[field]);
          if(!original.primaryMeaningChosen)original.primaryMeaning=fresh.primaryMeaning;
          original.forms=fresh.forms.map((form,index)=>{
            const previous=oldForms.find(f=>normalize(f.text)===normalize(form.text)&&f.gender===form.gender);
            const updated=clone(form);updated.id=previous?.id||original.id+form.id.slice(fresh.id.length);
            if(previous?.audioKey&&form.audioOrigin!=='textbook-human')for(const field of ['audioKey','audio','audioOrigin'])if(previous[field]!==undefined)updated[field]=previous[field];
            return updated;
          });
        }
        existing.bundled=true;installed++;continue;
      }
      if(source.curriculumRevision>(existing.curriculumRevision||0)){
        const textKey=w=>w.pos+':'+w.forms.map(f=>normalize(f.text)).join('|');
        const same=existing.words.length===source.words.length&&source.words.every((w,i)=>textKey(w)===textKey(existing.words[i]));
        if(!same){
          const pkg=clone(source);pkg.bundled=true;pkg.lesson.version=Math.max(pkg.lesson.version,existing.lesson.version+1);
          for(const word of pkg.words){
            const old=existing.words.find(w=>textKey(w)===textKey(word)),original=word.id;
            word.id=old?.id||nextId();
            for(const form of word.forms){const previous=old?.forms.find(f=>normalize(f.text)===normalize(form.text)&&f.gender===form.gender);form.id=previous?.id||word.id+form.id.slice(original.length);}
          }
          installLesson(data,pkg);installed++;continue;
        }
        existing.curriculumRevision=source.curriculumRevision;
      }
      // Append curriculum additions without replacing custom entries, progress
      // or the frozen question queue of an unfinished practice.
      if(existing.bundled){
        let added=false;
        for(const original of source.words.filter(w=>w.curriculumAddition)){
          if(existing.words.some(w=>w.pos===original.pos&&w.forms.some(f=>original.forms.some(fresh=>normalize(f.text)===normalize(fresh.text)))))continue;
          const word=clone(original),oldId=word.id;word.id=nextId();
          for(const form of word.forms)form.id=word.id+form.id.slice(oldId.length);
          word.order=Math.max(0,...existing.words.map(w=>w.order))+1;existing.words.push(word);data.reservedWordIds=[...new Set([...(data.reservedWordIds||[]),word.id])];added=true;
        }
        if(added){existing.lesson.version++;if(data.lessonCompletions)delete data.lessonCompletions[packageKey(existing)];installed++;}
      }
      // Upgrade recordings only for matching original entries. Preserve custom
      // imports, all word/form identifiers, notebooks and unfinished sessions.
      for(const original of source.words){
        const revised=existing.words.find(w=>w.audioNumber===original.audioNumber&&w.forms.length===1&&w.forms[0].text===original.previousSourceText);
        if(revised&&original.contentRevision>(revised.contentRevision||0)){
          const id=revised.forms[0].id;revised.forms=[{...clone(original.forms[0]),id}];
          for(const field of ['pos','sourcePos','sourceText','contentRevision','previousSourceText'])revised[field]=original[field];
        }
        const word=existing.words.find(w=>w.audioNumber===original.audioNumber&&fingerprint(w)===fingerprint(original));
        if(!word)continue;
        for(const fresh of original.forms){
          const form=word.forms.find(f=>f.text===fresh.text&&f.gender===fresh.gender);
          if(!form)continue;
          if(fresh.audioOrigin==='bundled'&&((fresh.sourceAudioKey&&form.audioKey===fresh.sourceAudioKey)||(form.audioOrigin==='bundled'&&form.sourceAudioKey===fresh.sourceAudioKey)||(!form.audioKey))){
            form.audio=fresh.audio;form.audioKey=fresh.audioKey;form.sourceAudioKey=fresh.sourceAudioKey;form.audioOrigin='bundled';
          }
          const example=fresh.example;
          if(example?.fr&&(!form.example||form.example.fr===example.fr)){
            form.example||={fr:example.fr,zh:''};
            if(!form.example.zh||form.example.translationOrigin==='bundled'){form.example.zh=example.zh;form.example.translationOrigin='bundled';}
            if(!form.example.audioKey||form.example.audioOrigin==='bundled'){form.example.audio=example.audio;form.example.audioKey=example.audioKey;form.example.audioOrigin='bundled';}
          }
        }
      }
      continue;
    }
    const pkg=clone(source);pkg.bundled=true;
    for(const word of pkg.words){
      const signature=fingerprint(word),previous=registry.get(signature),original=word.id;
      word.id=sourceIds.get(original)||previous?.id||(used.has(word.id)?nextId():word.id);used.add(word.id);sourceIds.set(original,word.id);
      for(const form of word.forms){const old=previous?.id===word.id?previous.forms.find(f=>f.text===form.text&&f.gender===form.gender):null;form.id=old?.id||word.id+form.id.slice(original.length);}
      registry.set(signature,word);
    }
    installLesson(data,pkg);installed++;
  }
  data.bundles||={};data.bundles[bundle.bookId||bundle.library[0]?.book.id||'inspire1']=bundle.id;
  return installed;
}
export async function prepareBundledContent(data,fetcher=fetch){
  const books=[{id:'inspire1',contentId:BUNDLED_CONTENT_ID,file:'inspire1.zip'},...ADDITIONAL_BUNDLED_BOOKS],assets=new Map();let changed=false;
  for(const book of books){
    if(data.bundles?.[book.id]===book.contentId)continue;
    const response=await fetcher(new URL('static/content/'+book.file,window.location.href));
    if(!response.ok)throw new Error('无法读取内置词库 / Vocabulaire intégré inaccessible.');
    const files=unzipSync(new Uint8Array(await response.arrayBuffer()));
    const bundle=JSON.parse(strFromU8(files['manifest.json']));
    if(bundle.library.some(p=>p.book.id!==book.id))throw Error('教材资料不匹配 / Manuel incorrect.');
    for(const id of bundle.audio){const bytes=files[`audio/${id}.bin`];if(!bytes)throw new Error('内置录音缺失 / Audio intégré absent.');assets.set(id,{id,bytes});}
    mergeBundledLessons(data,bundle,book.contentId);changed=true;
  }
  return changed?[...assets.values()]:null;
}
