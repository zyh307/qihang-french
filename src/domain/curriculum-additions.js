// Additional curriculum words for the Inspire 1 curriculum.
import {dictionaryEntry} from './quick-import.js';
export const curriculumAdditions=[
 ...['sur','sous','devant','derrière','entre'].map(word=>({lesson:'L18',word,pos:'prép.'})),
 {lesson:'L14',word:'pouvoir',meaning:'能够',fr:'Je vais pouvoir venir demain.',zh:'我明天能够来。'},
 {lesson:'L14',word:'vouloir',meaning:'想要',fr:"C'est normal de vouloir réussir.",zh:'想要成功是正常的。'},
 {lesson:'L14',word:'faire',meaning:'做',fr:'Je vais faire un gâteau.',zh:'我要做一个蛋糕。'},
 {lesson:'L14',word:'venir',meaning:'来',fr:'Tu peux venir chez moi.',zh:'你可以来我家。'},
 {lesson:'L16',word:'finir',meaning:'完成',fr:'Je vais finir mon travail.',zh:'我要完成我的工作。'},
 {lesson:'L24',word:'devoir',meaning:'必须',fr:'Je vais devoir partir bientôt.',zh:'我很快就必须离开。'},
 {lesson:'L24',word:'connaître',meaning:'了解',fr:'Je veux connaître cette ville.',zh:'我想了解这座城市。'},
 {lesson:'L28',word:'savoir',meaning:'知道',fr:'Je voudrais savoir votre nom.',zh:'我想知道您的姓名。'},
 {lesson:'L17',word:'prendre',meaning:'拿',fr:'Je vais prendre une pomme dans le panier.',zh:'我要从篮子里拿一个苹果。',tenses:['现在时']}
];

export function applyRequestedCourseWords(data,rows){let added=0;const used=new Set([...(data.reservedWordIds||[]),...data.library.flatMap(p=>p.words.map(w=>w.id)),...Object.keys(data.progress||{}).map(k=>k.split(':').at(-1))]);let serial=910000;for(const extra of curriculumAdditions.filter(e=>e.pos)){const p=data.library.find(p=>p.book.id==='inspire1'&&p.lesson.id===extra.lesson);if(!p)continue;const present=p.words.find(w=>w.forms.some(f=>f.text.normalize('NFC').toLocaleLowerCase('fr')===extra.word));if(present){present.pos=extra.pos;present.sourcePos=extra.pos;continue;}const row=rows.find(r=>r.word===extra.word);if(!row)continue;while(used.has('w'+serial))serial++;const w=dictionaryEntry({...row,pos:extra.pos});w.id='w'+serial++;used.add(w.id);w.order=Math.max(0,...p.words.map(w=>w.order))+1;w.curriculumAddition='inspire1-positions-20261111';w.sourcePos=extra.pos;w.forms=w.forms.map((f,i)=>({...f,id:w.id+'-'+i,source:'Inspire 1 · '+extra.lesson}));p.words.push(w);added++;}if(added)data.reservedWordIds=[...new Set([...(data.reservedWordIds||[]),...data.library.flatMap(p=>p.words.filter(w=>w.curriculumAddition==='inspire1-positions-20261111').map(w=>w.id))])];return added;}
