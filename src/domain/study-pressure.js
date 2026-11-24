import {shiftDate,nextNormalReview,isNormalReview} from './review-plan.js';
const lesson=p=>p.book.id+':'+p.lesson.id;
const progressKey=(p,w)=>w.origin?.progressKey||lesson(p)+':'+w.id;
export function studyPressureKey(p,w){return w.conjugation?'conjugation:'+w.conjugation.lemma+':'+w.conjugation.tense:progressKey(p,w);}
export const studyPaused=(data,p,w,today)=>{if(data.settings?.reviewThreeErrorPause===false)return false;const r=data.studyPressure?.[studyPressureKey(p,w)];return r?.countVersion===2&&r.pausedOn===today;};
const conjugationReviewKey=lemma=>'conjugation-review:'+lemma;
export function conjugationReviewPaused(data,lemma,today){
 return data.studyPressure?.[conjugationReviewKey(lemma)]?.pausedOn===today;
}
export function isNormalConjugationReview(data,p,w,today){
 const progress=data.progress[progressKey(p,w)];
 return progress?.notebook==='review'&&w.forms.some(f=>{
  const form=progress.forms?.[f.id];
  return f.tested&&form?.learnedAt&&!form.known&&isNormalReview(form,today);
 });
}
export function recordConjugationReviewFailure(data,lemma,today){
 data.studyPressure||={};
 const key=conjugationReviewKey(lemma);
 let record=data.studyPressure[key];
 if(record?.date!==today)record=data.studyPressure[key]={date:today,count:0,countVersion:2};
 if(record.pausedOn===today)return true;
 if(++record.count<2)return false;
 record.pausedOn=today;
 const tomorrow=shiftDate(today,1);
 for(const p of data.library){
  const cards=(data.conjugationDecks?.[lesson(p)]||[]).filter(w=>!w.studyDisabled&&w.conjugation.lemma===lemma);
  const scheduled=new Set(cards.filter(w=>isNormalConjugationReview(data,p,w,today)).map(w=>w.conjugation.baseWordId+'|'+w.conjugation.tense));
  for(const w of cards){
   if(!scheduled.has(w.conjugation.baseWordId+'|'+w.conjugation.tense))continue;
   const progress=data.progress[progressKey(p,w)];
   if(progress?.notebook!=='review')continue;
   for(const f of w.forms){
    const form=progress.forms?.[f.id];
    if(!f.tested||!form?.learnedAt||form.known)continue;
    if(form.due&&form.due<=today)Object.assign(form,nextNormalReview(form.reviewAnchor||form.learnedAt,today),{lastNormalReviewedAt:today});
    form.retryDue=tomorrow;
   }
  }
 }
 return true;
}
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
