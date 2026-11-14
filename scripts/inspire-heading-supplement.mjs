import {createHash} from 'node:crypto';
import supplement from '../src/lexicon/inspire-heading-supplement.json' with {type:'json'};
import {headingWordKeys} from '../src/domain/heading-word-key.js';

// The original source workbooks, entry identifiers and human recordings are untouched.
export function applyHeadingSupplement(library,speech){
  const known=new Map(),used=new Set(library.flatMap(p=>p.words.map(w=>w.id)));
  for(const p of library){
    if(!known.has(p.book.id))known.set(p.book.id,new Set());
    for(const word of p.words)for(const key of headingWordKeys(word))known.get(p.book.id).add(key);
  }
  let added=0;
  for(const entry of supplement.entries){
    if(!known.has(entry.bookId))continue;
    const keys=headingWordKeys(entry.word),bookWords=known.get(entry.bookId);
    if([...keys].some(key=>bookWords.has(key)))continue;
    const lesson=library.find(p=>p.book.id===entry.bookId&&p.lesson.id===entry.lessonId);
    if(!lesson)throw Error('标题词的课次不存在：'+entry.bookId+' '+entry.lessonId);
    if(used.has(entry.word.id))throw Error('标题词编号重复：'+entry.word.id);
    for(const form of entry.word.forms)for(const text of [form.text,form.example.fr]){
      const recording=speech[createHash('sha256').update(text).digest('hex')];
      if(!recording?.file||!(recording.end>recording.start))throw Error('标题词录音缺失：'+text);
    }
    const word=structuredClone(entry.word);
    word.order=Math.max(0,...lesson.words.map(w=>w.order))+1;
    lesson.words.push(word);used.add(word.id);
    for(const key of keys)bookWords.add(key);
    added++;
  }
  return added;
}
