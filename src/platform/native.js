import {conjugationPackages} from '../conjugation/catalog.js';
import {nextReviewDate} from '../domain/review-plan.js';
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
 const native=nativeHost();
 const dates=[...data.library,...conjugationPackages(data)].flatMap(p=>p.words.flatMap(w=>{const r=data.progress[wordKey(p,w)];if(r?.notebook!=='review')return [];const due=w.forms.filter(f=>f.tested).map(f=>nextReviewDate(r.forms[f.id],data.settings)).filter(Boolean).sort()[0];return due?[due]:[];}));
 const state={enabled:data.settings.reviewReminders!==false,dates,time:data.settings.reminderTime||'08:00'};
 if(native?.syncReviewSchedule){native.syncReviewSchedule(JSON.stringify(state));try{const status=JSON.parse(native.reviewReminderStatus?.()||'null');if(status)window.qihangBackgroundReminderReady=!status.enabled||!status.hasWords||status.scheduled;}catch{}}
 else if(typeof window!=='undefined'&&window.location.hostname==='127.0.0.1')return fetch('/review-reminders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)}).then(async response=>{if(!response.ok)return;const result=await response.json();window.qihangWindowsReminders=result.nativeReminders===true;window.qihangBackgroundReminderReady=result.scheduled===true;}).catch(()=>{});
}
