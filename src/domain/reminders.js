import { day, dueForms } from './learning.js';
export function dueLessons(data, today = day()) {
  return data.library.map(p=>({p,words:p.words.filter(w=>dueForms(data,p,w,today).length)})).filter(x=>x.words.length);
}
export function shouldRemind(data, now = Date.now()) {
  const today=day(new Date(now));
  return data.reminders?.lastPopupDate!==today && data.reminders?.dismissedDate!==today && now >= (data.reminders?.snoozedUntil || 0) && dueLessons(data,today).length>0;
}
export function shouldNotifyReview(data, now = Date.now()) {
  const date=new Date(now);
  const [hour,minute]=(data.settings.reminderTime||'08:00').split(':').map(Number);
  return date.getHours()===hour && date.getMinutes()===minute && data.reminders?.lastSentDate!==day(date) && dueLessons(data,day(date)).length>0;
}
export const markReminderShown = (data, now = Date.now()) => {
  data.reminders ||= {};
  data.reminders.lastPopupDate=day(new Date(now));
};
export const snoozeReminder = (data, now = Date.now()) => {
  data.reminders ||= {};
  data.reminders.dismissedDate=day(new Date(now));
  delete data.reminders.snoozedUntil;
};
