import {nativeHost} from './native.js';
export const notificationPermission=()=>nativeHost()?.notificationPermission()||(typeof Notification==='undefined'?'unsupported':Notification.permission);
export const notificationAvailable=()=>!!nativeHost()||(typeof window!=='undefined'&&'Notification' in window&&window.isSecureContext);
export async function allowNotifications(){
  if(!notificationAvailable())throw new Error('当前环境不支持系统通知 / Notifications indisponibles ici.');
  const native=nativeHost();if(native){if(notificationPermission()==='granted')return 'granted';return await new Promise(resolve=>{const done=event=>{window.removeEventListener('qihang-notification-permission',done);resolve(event.detail.permission);};window.addEventListener('qihang-notification-permission',done);native.requestNotifications();});}
  return Notification.permission==='granted'?'granted':await Notification.requestPermission();
}
export function notifyReview(count, onOpen){
  if(nativeHost())return null;
  if(!notificationAvailable()||Notification.permission!=='granted')return null;
  const n=new Notification('该复习法语啦 · À réviser !',{body:`${count} 个词已到复习时间。点击查看。 / ${count} mots à réviser.`,tag:'francais-review'});
  n.onclick=()=>{window.focus();onOpen();n.close();};return n;
}
