import {conjugationPackages} from '../conjugation/catalog.js';
import { day, addDays, dueForms, formReviewDate, wordKey, errorPracticeEligible } from './learning.js';
import {logicalVocabularyKey,uniqueVocabularyEntries} from './vocabulary-identity.js';
export function dueLessons(data, today = day()) {
  const entries=uniqueVocabularyEntries([...data.library,...conjugationPackages(data)].flatMap(p=>p.words.filter(w=>dueForms(data,p,w,today).length).map(w=>({p,w}))),data),groups=new Map();
  for(const {p,w}of entries){if(!groups.has(p))groups.set(p,{p,words:[]});groups.get(p).words.push(w);}
  return [...groups.values()];
}
export const PRACTICE_THRESHOLD=10,REMINDER_INTERVAL_DAYS={review:1,errors:2};
export function practiceReminderItems(data,today=day()){
  const dates=new Map(),errors=new Set();
  for(const p of [...data.library,...conjugationPackages(data)])for(const w of p.words){
    const due=dueForms(data,p,w,today).map(f=>formReviewDate(data.progress[wordKey(p,w)],f,data.settings)).filter(Boolean).sort()[0];
    const key=w.conjugation?'conjugation:'+encodeURIComponent(w.conjugation.lemma):logicalVocabularyKey(p,w);
    if(due&&(!dates.has(key)||due<dates.get(key)))dates.set(key,due);
    if(errorPracticeEligible(data,p,w,today))errors.add(w.conjugation?p.book.id+':'+p.lesson.id+':'+w.conjugation.baseWordId+':'+w.conjugation.tense:key);
  }
  return {review:[...dates].map(([key,date])=>key+':'+date),errors:[...errors]};
}
export function syncPracticeBadges(data,today=day()){
  data.reminders||={};const badges=data.reminders.badges||={},items=practiceReminderItems(data,today);
  for(const kind of ['review','errors']){
    const state=badges[kind]||={pending:false,acknowledged:[]};if(data.settings[kind==='review'?'reviewReminders':'errorReminders']===false){state.pending=false;continue;}const acknowledged=new Set(state.acknowledged||[]);
    if(items[kind].length>=PRACTICE_THRESHOLD&&(!state.ackDate||today>=addDays(state.ackDate,REMINDER_INTERVAL_DAYS[kind])||items[kind].some(id=>!acknowledged.has(id))))state.pending=true;
  }
  return badges;
}
export function acknowledgePractice(data,kind,today=day()){
  data.reminders||={};data.reminders.badges||={};
  data.reminders.badges[kind]={pending:false,acknowledged:practiceReminderItems(data,today)[kind],ackDate:today};
}
export function reminderCounts(data,today=day()){
  const items=practiceReminderItems(data,today),badges=data.reminders?.badges||{};
  const active=kind=>data.settings[kind==='review'?'reviewReminders':'errorReminders']!==false&&items[kind].length>0&&(!badges[kind]?.ackDate||today>=addDays(badges[kind].ackDate,REMINDER_INTERVAL_DAYS[kind])||badges[kind].pending);
  return {review:active('review')?items.review.length:0,errors:active('errors')?items.errors.length:0};
}
function intervalReady(last,today,kind){return !last||today>=addDays(last,REMINDER_INTERVAL_DAYS[kind]);}
export function notificationCounts(data,now=Date.now()){
 const today=day(new Date(now)),last=data.reminders?.lastSentDates?.review||data.reminders?.lastSentDate;
 return {review:data.settings.reviewReminders!==false&&last!==today?practiceReminderItems(data,today).review.length:0,errors:0};
}

export function popupCounts(data,now=Date.now()){
  const today=day(new Date(now)),counts=reminderCounts(data,today),last=data.reminders?.lastPopupDates||{};
  return Object.fromEntries(['review','errors'].map(kind=>[kind,intervalReady(last[kind],today,kind)?counts[kind]:0]));
}
export function shouldRemind(data,now=Date.now()){
  const today=day(new Date(now)),counts=popupCounts(data,now);
  return !!(counts.review||counts.errors)&&data.reminders?.lastPopupDate!==today&&data.reminders?.dismissedDate!==today&&now>=(data.reminders?.snoozedUntil||0);
}
export function shouldNotifyReview(data,now=Date.now()){
  const date=new Date(now),counts=notificationCounts(data,now);
  const [hour,minute]=(data.settings.reminderTime||'08:00').split(':').map(Number);
  return date.getHours()*60+date.getMinutes()>=hour*60+minute&&!!counts.review;
}
export const markReminderShown=(data,now=Date.now())=>{
  const counts=popupCounts(data,now),today=day(new Date(now));data.reminders||={};data.reminders.lastPopupDates||={};data.reminders.lastPopupDate=today;
  for(const kind of ['review','errors'])if(counts[kind])data.reminders.lastPopupDates[kind]=today;
};
export const markNotificationSent=(data,counts,now=Date.now())=>{
  data.reminders||={};data.reminders.lastSentDates||={};const today=day(new Date(now));
  for(const kind of ['review','errors'])if(counts[kind])data.reminders.lastSentDates[kind]=today;
};
export const snoozeReminder = (data, now = Date.now()) => {
  data.reminders ||= {};
  data.reminders.dismissedDate=day(new Date(now));
  delete data.reminders.snoozedUntil;
};
