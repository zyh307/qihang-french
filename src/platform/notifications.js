import {nativeHost} from './native.js';
export const notificationPermission=()=>nativeHost()?.notificationPermission()||(window.qihangWindowsReminders?'granted':null)||(typeof Notification==='undefined'?'unsupported':Notification.permission);
export const notificationAvailable=()=>!!nativeHost()||(typeof window!=='undefined'&&'Notification' in window&&window.isSecureContext);
export async function allowNotifications(){
  if(window.qihangWindowsReminders)return 'granted';
  if(!notificationAvailable())throw new Error('当前环境不支持系统通知 / Notifications indisponibles ici.');
  const native=nativeHost();if(native){if(notificationPermission()==='granted')return 'granted';return await new Promise(resolve=>{const done=event=>{window.removeEventListener('qihang-notification-permission',done);resolve(event.detail.permission);};window.addEventListener('qihang-notification-permission',done);native.requestNotifications();});}
  return Notification.permission==='granted'?'granted':await Notification.requestPermission();
}
export function notifyReview(count, onOpen){
  const native=nativeHost();if(window.qihangWindowsReminders)return null;if(native){native.checkReviewReminders?.();return null;}
  if(!notificationAvailable()||Notification.permission!=='granted')return null;
  const n=new Notification('该复习法语啦 · À réviser !',{body:`有 ${count.review} 个单词待复习 / ${count.review} mots à réviser`,tag:'francais-review'});
  n.onclick=()=>{window.focus();onOpen();n.close();};return n;
}

export function openNotificationSettings(){nativeHost()?.openNotificationSettings?.();}

export const exactAlarmPermission=()=>nativeHost()?.exactAlarmPermission?.()||'unsupported';
export const openExactAlarmSettings=()=>nativeHost()?.openExactAlarmSettings?.();
export function reviewReminderStatus(){try{return JSON.parse(nativeHost()?.reviewReminderStatus?.()||'null');}catch{return null;}}
export const openBackgroundSettings=()=>nativeHost()?.openBackgroundSettings?.();
export const openBatterySettings=()=>nativeHost()?.openBatterySettings?.();
