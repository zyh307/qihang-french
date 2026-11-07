// Shared by the main page and the oral iframe, on Windows and Android.
export const RECORD_DATABASE='francais-ensemble-v1';
export const RECORD_STORES=['state','audio','oralSessions','oralAudio'];
let opened,persistence;
export function openRecordDatabase(){
 if(!opened)opened=new Promise((resolve,reject)=>{
  const request=indexedDB.open(RECORD_DATABASE,2);let blocked=false;
  request.onupgradeneeded=()=>{for(const name of RECORD_STORES)if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
  request.onsuccess=()=>{const db=request.result;if(blocked){db.close();return;}db.onversionchange=()=>{db.close();opened=null;};resolve(db);};
  request.onerror=()=>{opened=null;reject(Error('无法打开本地记录 / Stockage local indisponible.'));};
  request.onblocked=()=>{blocked=true;opened=null;reject(Error('请关闭其他启航法语页面后重试 / Fermez les autres fenêtres et réessayez.'));};
 });
 return opened;
}
export const idbResult=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
export const idbDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('记录未保存，请检查存储空间 / Enregistrement impossible.'));});
export async function recordEpoch(){const db=await openRecordDatabase();return await idbResult(db.transaction('state').objectStore('state').get('recordsEpoch'))||0;}
export async function recordSnapshot({wordAudio=true}={}){const db=await openRecordDatabase(),tx=db.transaction(RECORD_STORES),done=idbDone(tx);const [state,keys,bytes,sessions,recordings]=await Promise.all([idbResult(tx.objectStore('state').get('primary')),wordAudio?idbResult(tx.objectStore('audio').getAllKeys()):[],wordAudio?idbResult(tx.objectStore('audio').getAll()):[],idbResult(tx.objectStore('oralSessions').getAll()),idbResult(tx.objectStore('oralAudio').getAll())]);await done;return{state,audio:keys.map((id,i)=>({id,bytes:bytes[i]})),sessions,recordings};}
export function requestRecordPersistence(){return persistence||=(async()=>{try{await navigator.storage?.persist?.();}catch{}})();}
