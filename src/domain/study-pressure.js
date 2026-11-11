import {shiftDate,nextNormalReview} from './review-plan.js';
const lesson=p=>p.book.id+':'+p.lesson.id;
const progressKey=(p,w)=>w.origin?.progressKey||lesson(p)+':'+w.id;
export function studyPressureKey(p,w){return w.conjugation?'conjugation:'+w.conjugation.lemma+':'+w.conjugation.tense:progressKey(p,w);}
export const studyPaused=(data,p,w,today)=>{if(data.settings?.reviewThreeErrorPause===false)return false;const r=data.studyPressure?.[studyPressureKey(p,w)];return r?.countVersion===2&&r.pausedOn===today;};
export function recordStudyFailure(data,p,w,today,learningOnly=false){
 if(data.settings?.[learningOnly?'learnThreeErrorDefer':'reviewThreeErrorPause']===false)return false;
 data.studyPressure||={};const key=studyPressureKey(p,w);
 let record=data.studyPressure[key];if(record?.date!==today||record.countVersion!==2)record=data.studyPressure[key]={date:today,count:0,countVersion:2};
 if(learningOnly&&record.learningDeferredOn===today)return false;
 if(record.pausedOn===today)return true;
 record.count=Math.min(3,(record.count||0)+1);if(record.count<3)return false;
 if(learningOnly){record.learningDeferredOn=today;return true;}
 record.pausedOn=today;
 const cards=w.conjugation?(data.conjugationDecks?.[w.origin?.lessonKey||lesson(p)]||[]).filter(card=>card.conjugation.baseWordId===w.conjugation.baseWordId&&card.conjugation.tense===w.conjugation.tense):[w];
 for(const card of cards){
  const r=(data.progress[progressKey(p,card)]||={notebook:'practice',forms:{}});r.forms||={};r.notebook='review';
  for(const f of card.forms.filter(f=>f.tested)){
   const form=r.forms[f.id]||={known:false,due:null,pendingLearning:true};
   if(!form.learnedAt){form.pendingLearning=true;r.pendingLearning=true;}
   else if(form.known&&!form.due)Object.assign(form,nextNormalReview(form.reviewAnchor||form.learnedAt,today));
   form.known=false;form.remedialDates=[1,2,3].map(n=>shiftDate(today,n));
  }
 }
 return true;
}
