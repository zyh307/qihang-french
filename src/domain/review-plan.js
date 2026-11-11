// Learning day is day one; regular reviews stay anchored to that date.
export const REVIEW_DAYS=[2,4,7,15,30,60,90];
const offsets=REVIEW_DAYS.map(n=>n-1),lastOffset=offsets.at(-1);
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
export function shiftDate(value,n){const d=new Date(value+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function elapsed(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);}
function localToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function newReviewRecord(today){return {learnedAt:today,reviewAnchor:today,scheduleVersion:3,reviewIndex:0,due:shiftDate(today,1),known:false};}
export function nextReviewDate(form,settings={}){if(!form||form.known)return null;return [form.due,settings.reviewErrorRetry!==false?form.retryDue:null,...(form.remedialDates||[])].filter(v=>datePattern.test(v||'')).sort()[0]||null;}
export function nextNormalReview(anchor,today){
 const index=offsets.findIndex(n=>shiftDate(anchor,n)>today);
 if(index>=0)return {reviewIndex:index,due:shiftDate(anchor,offsets[index]),longReview:REVIEW_DAYS[index]>30};
 const cycle=Math.max(1,Math.floor((elapsed(anchor,today)-lastOffset)/30)+1);
 return {reviewIndex:offsets.length,due:shiftDate(anchor,lastOffset+cycle*30),longReview:true};
}
export function completeReviewRecord(form,settings,today,failed){
 if(!form.learnedAt){const remedialDates=form.remedialDates||[];Object.assign(form,newReviewRecord(today),{remedialDates});delete form.pendingLearning;}
 const anchor=form.reviewAnchor||form.learnedAt;
 // A retry is a single extra visit, not a new daily review chain. A normal
 // review (including an overdue one) may create one next-day retry. Multiple
 // attempts on that normal-review day still belong to the same normal visit.
 const normalReview=!!form.due&&form.due<=today||form.lastNormalReviewedAt===today;
 if(form.lastNormalReviewedAt!==today&&form.due&&form.due<=today){Object.assign(form,nextNormalReview(anchor,today));form.lastNormalReviewedAt=today;}
 if(form.retryDue&&form.retryDue<=today)delete form.retryDue;
 if(failed&&normalReview&&settings.reviewErrorRetry!==false)form.retryDue=shiftDate(today,1);
 form.lastReviewedAt=today;form.known=false;form.scheduleVersion=3;
 if(form.remedialDates?.some(date=>date<=today)&&form.lastRemedialReviewedAt!==today){
  const dates=[...form.remedialDates].sort();dates.shift();let next=today;
  form.remedialDates=dates.map(date=>{const earliest=shiftDate(next,1);next=date>earliest?date:earliest;return next;});form.lastRemedialReviewedAt=today;
 }
}
export function migrateReviewPlans(data,today=localToday()){
 for(const r of Object.values(data.progress||{}))for(const f of Object.values(r.forms||{})){
  if(!datePattern.test(f.learnedAt||'')||f.scheduleVersion===3)continue;
  const anchor=datePattern.test(f.reviewAnchor||'')?f.reviewAnchor:datePattern.test(r.learnedAt||'')?r.learnedAt:f.learnedAt;
  f.reviewAnchor=anchor;f.scheduleVersion=3;
  if(f.known){f.due=null;delete f.retryDue;continue;}
  const reviewed=[f.lastNormalReviewedAt,f.lastReviewedAt].filter(d=>datePattern.test(d||'')&&d>=anchor&&d<=today).sort().at(-1);
  if(reviewed){Object.assign(f,nextNormalReview(anchor,reviewed));continue;}
  // Old counters could jump a young word straight into the 60-day stage.
  // Retain valid overdue dates, but never infer reviews that have not happened.
  const latest=nextNormalReview(anchor,today),age=elapsed(anchor,f.due),index=offsets.indexOf(age);
  const aligned=index>=0||age>lastOffset&&(age-lastOffset)%30===0;
  if(datePattern.test(f.due||'')&&aligned&&f.due<=latest.due){f.reviewIndex=index>=0?index:offsets.length;f.longReview=age>29;continue;}
  const oldIndex=Number.isInteger(f.reviewIndex)?Math.max(0,f.reviewIndex):0;
  const safeIndex=Math.min(oldIndex,latest.reviewIndex,offsets.length-1);
  f.reviewIndex=safeIndex;f.due=shiftDate(anchor,offsets[safeIndex]);f.longReview=offsets[safeIndex]>29;
 }
}
