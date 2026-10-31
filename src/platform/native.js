import {day,addDays,wordKey,errorPracticeState} from '../domain/learning.js';
import {REMINDER_INTERVAL_DAYS} from '../domain/reminders.js';
export const nativeHost=()=>typeof window!=='undefined'?window.QihangNative:null;
export function nativeExport(name,bytes,mime,share=false){
  const native=nativeHost();
  if(!native)return null;
  return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID();
    const result=event=>{if(event.detail?.id!==id)return;window.removeEventListener('qihang-export',result);if(event.detail.cancelled){reject(new DOMException('已取消 / Annulé','AbortError'));}else if(event.detail.success)resolve();else reject(new Error(event.detail.message||'保存失败 / Échec de l’enregistrement.'));};
    window.addEventListener('qihang-export',result);
    try{let raw='';for(let i=0;i<bytes.length;i+=0x8000)raw+=String.fromCharCode(...bytes.subarray(i,i+0x8000));native.exportFile(id,name,mime,btoa(raw),share);}
    catch(error){window.removeEventListener('qihang-export',result);reject(error);}
  });
}
export function syncNativeReview(data){
  const native=nativeHost();if(!native)return;
  const dates=data.library.flatMap(p=>p.words.flatMap(w=>{
    const progress=data.progress[`${p.book.id}:${p.lesson.id}:${w.id}`];
    if(progress?.notebook!=='review')return [];
    const due=w.forms.filter(f=>f.tested).map(f=>progress.forms[f.id]?.due).filter(Boolean).sort()[0];
    return due?[due]:[];
  }));
  const today=day(),errorDates=data.library.flatMap(p=>p.words.flatMap(w=>{const state=errorPracticeState(data,p,w,today);return state.active?[state.doneToday?addDays(today,1):today]:[];}));
  const quiet=kind=>{const badge=data.reminders?.badges?.[kind];return badge?.ackDate&&!badge.pending?addDays(badge.ackDate,REMINDER_INTERVAL_DAYS[kind]):'';};
  native.syncReviewSchedule(JSON.stringify({enabled:!!data.settings.notifications,dates,errorDates,time:data.settings.reminderTime||'08:00',reviewIntervalDays:1,errorIntervalDays:2,reviewQuietUntil:quiet('review'),errorQuietUntil:quiet('errors')}));
}
