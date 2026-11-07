import {getOralSession,saveOralSession,listOralSessions,getOralAudio,saveOralAudio,validateRecording,sessionAudioIds} from './browser-store.js';
const block=512*1024;
const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
export function createBrowserOralCall(native){
 let ready,recovery,currentSession='',recovering=false;const jobs=new Map();
 async function check(){return ready||=(async()=>{const r=await native('records.capabilities');if(r.browserStorage!==1)throw Error('请完整更新软件后再进入口语练习 / Mettez à jour l’application.');})().catch(e=>{ready=null;throw e;});}
 async function capture(id){let saved=await getOralAudio(id);if(saved)return saved;const {size}=await native('audio.info',{id});if(!Number.isSafeInteger(size)||size<44||size>40*1024*1024)throw Error('录音暂未保存，请重试 / Réessayez l’enregistrement.');const a=new Uint8Array(size);for(let offset=0;offset<size;offset+=block){const n=Math.min(block,size-offset),r=await native('audio.chunk',{id,offset,size:n}),chunk=decode(r.data);if(chunk.length!==n)throw Error('录音读取不完整 / Audio incomplet.');a.set(chunk,offset);}validateRecording(a);await saveOralAudio(id,a);return a.buffer;}
 async function stage(id){const bytes=await getOralAudio(id);if(!bytes)throw Error('未找到录音 / Enregistrement introuvable.');if((await native('audio.info',{id})).size===bytes.byteLength)return;await native('audio.stage.begin',{id,size:bytes.byteLength});const a=new Uint8Array(bytes);for(let offset=0;offset<a.length;offset+=block)await native('audio.stage.chunk',{id,offset,data:encode(a.subarray(offset,offset+block))});await native('audio.stage.finish',{id,size:a.length});}
 async function recover(){if(recovering)return;recovering=true;try{const {recordings=[]}=await native('record.cache.list');for(const r of recordings){let s;try{s=await getOralSession(r.session);}catch{continue;}await capture(r.audio);if(r.kind==='user'&&!s.messages.some(m=>m.audio===r.audio))s.messages.push({id:r.row||crypto.randomUUID(),role:'user',audio:r.audio,stage:r.stage,at:r.at,seconds:r.seconds,text:'',confirmation_status:'cancelled',recognition_status:'cancelled',interrupted:true,native_recording:true});else if(r.kind==='assistant'){const row=s.messages.find(m=>m.role==='assistant'&&m.request_id===r.turn);if(!row)continue;row.audio=r.audio;}else if(r.kind==='evaluation'){if(s.evaluation?.request_id!==r.turn)continue;s.evaluation.audio=r.audio;s.evaluation.voice_status='ready';}await saveOralSession(s);await native('audio.release',{id:r.audio});}}finally{recovering=false;}}
 async function ensure(){await check();if(!recovery)recovery=recover().catch(e=>{recovery=null;throw e;});await recovery;}
 return async function call(method,args={}){
  if(['session.save','session.list','session.get','audio.read','record.begin','record.end','send','events','recognize','job','background','resume'].includes(method))await ensure();
  if(method==='session.save'){await saveOralSession(args.session);currentSession=args.session.id;await native('session.cache',{session:await getOralSession(currentSession)});for(const row of args.session.messages)if(row.audio&&(row.role==='assistant'||['done','failed','cancelled'].includes(row.recognition_status))&&await getOralAudio(row.audio))await native('audio.release',{id:row.audio});if(args.session.evaluation?.audio&&await getOralAudio(args.session.evaluation.audio))await native('audio.release',{id:args.session.evaluation.audio});return{saved:true};}
  if(method==='session.get')return getOralSession(args.id);
  if(method==='session.list')return listOralSessions();
  if(method==='audio.read'){const bytes=await getOralAudio(args.id);if(!bytes)throw Error('未找到录音 / Audio introuvable.');return{data:encode(new Uint8Array(bytes))};}
  if(method==='record.begin'){const s=await getOralSession(args.session);currentSession=s.id;await native('session.cache',{session:s});return native(method,args);}
  if(method==='record.end'){const r=await native(method,args);await capture(r.audio);return r;}
  if(method==='recognize'){await stage(args.audio);const r=await native(method,args);jobs.set(r.job,args.audio);return r;}
  if(method==='job'){const r=await native(method,args);if(r.state!=='running'&&jobs.has(args.id)){await native('audio.release',{id:jobs.get(args.id)});jobs.delete(args.id);}return r;}
  if(method==='send')return native(method,{...args,browserStorage:true,browserSession:currentSession});
  if(method==='events'){const r=await native(method,args);for(const e of r.events||[])if(e.type==='reply_recording')await capture(e.audio);return r;}
  if(method==='background'||method==='resume'){const r=await native(method,args);await recover();return r;}
  if(method==='session.export')throw Error('请从浏览器记录导出 / Exportez les données enregistrées.');
  return native(method,args);
 };
}
