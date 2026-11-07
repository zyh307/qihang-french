import {strToU8,strFromU8,zip} from 'fflate';
import {openRecordDatabase,idbResult,idbDone,RECORD_STORES,recordSnapshot} from './browser-database.js';
import {validateOralSession,validateRecording,sessionAudioIds} from '../oral/browser-store.js';
import {GRAMMAR_REVISION} from '../grammar/storage.js';
export const GRAMMAR_KEYS=['qihang-grammar-progress-v1','qihang-grammar-round-v1','qihang-grammar-settings-v1'];
export async function flushOralRecords(){const target=document.querySelector('iframe.oral-local-frame')?.contentWindow;if(!target)return;const request=crypto.randomUUID();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('口语记录尚未保存，请稍后重试 / Réessayez après l’enregistrement.')),20000);const receive=e=>{if(e.origin===location.origin&&e.source===target&&e.data?.type==='qihang-records-flushed'&&e.data.request===request)finish(e.data.error?Error(e.data.error):null);};function finish(error){clearTimeout(timer);window.removeEventListener('message',receive);error?reject(error):resolve();}window.addEventListener('message',receive);target.postMessage({type:'qihang-records-flush',request},location.origin);});}
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
export const zipRecords=files=>new Promise((resolve,reject)=>{if(Object.values(files).reduce((n,b)=>n+b.byteLength,0)>1024*1024*1024){reject(Error('记录过多，备份不能超过 1 GB / Sauvegarde trop volumineuse.'));return;}zip(files,{level:3},(error,bytes)=>error?reject(error):bytes.length>512*1024*1024?reject(Error('备份不能超过 512 MB / Sauvegarde limitée à 512 Mo.')):resolve(bytes));});
const grammarSnapshot=()=>Object.fromEntries(GRAMMAR_KEYS.map(k=>[k,localStorage.getItem(k)]));
function validateGrammar(g){if(!g||typeof g!=='object'||Array.isArray(g)||Object.keys(g).some(k=>!GRAMMAR_KEYS.includes(k)))throw Error('语法记录无效 / Données de grammaire invalides.');for(const value of Object.values(g))if(value!==null&&(typeof value!=='string'||value.length>8*1024*1024||!JSON.parse(value)||typeof JSON.parse(value)!=='object'))throw Error('语法记录损坏 / Données de grammaire endommagées.');return g;}
export async function addBrowserRecords(files,snapshot){
 const snap=snapshot||await recordSnapshot({wordAudio:false}),manifest={schema:1,kind:'qihang-all-records',wordAudio:'installed',files:[]};
 const extra={'records/grammar.json':strToU8(JSON.stringify(grammarSnapshot()))};
 for(const s of snap.sessions){validateOralSession(s);extra[`records/sessions/${s.id}.json`]=strToU8(JSON.stringify(s));}
 const audio=new Map();for(const r of snap.recordings){const bytes=validateRecording(r.bytes);audio.set(r.id,bytes);extra[`records/recordings/${r.id}.wav`]=bytes;}
 for(const s of snap.sessions)for(const id of sessionAudioIds(s))if(!audio.has(id))throw Error('备份缺少口语录音，请重试 / Enregistrement manquant.');
 Object.assign(files,extra);for(const [path,bytes]of Object.entries(files))manifest.files.push({path,size:bytes.byteLength,sha256:await hash(bytes)});
 files['records/manifest.json']=strToU8(JSON.stringify(manifest));
}
export async function readBrowserRecords(files){
 if(!files['records/manifest.json']){if(Object.keys(files).some(k=>k.startsWith('records/')))throw Error('完整备份缺少目录 / Sauvegarde incomplète.');return null;}
 const m=JSON.parse(strFromU8(files['records/manifest.json']));if(m.schema!==1||m.kind!=='qihang-all-records'||!Array.isArray(m.files))throw Error('备份版本无效 / Format de sauvegarde invalide.');
 const sessions=[],recordings=[],seen=new Set();let grammar;
 for(const entry of m.files){const p=entry.path;if(typeof p!=='string'||!/^(?:snapshot\.json|audio\/[a-f0-9]{64}\.bin|records\/(?:grammar\.json|sessions\/[a-zA-Z0-9-]{8,80}\.json|recordings\/[a-zA-Z0-9-]{8,80}\.wav))$/.test(p)||seen.has(p))throw Error('备份目录无效 / Répertoire de sauvegarde invalide.');seen.add(p);const bytes=files[p];if(!bytes||bytes.length!==entry.size||await hash(bytes)!==entry.sha256)throw Error('备份文件损坏 / Sauvegarde endommagée.');if(p==='records/grammar.json')grammar=validateGrammar(JSON.parse(strFromU8(bytes)));else if(p.startsWith('records/sessions/')){const s=validateOralSession(JSON.parse(strFromU8(bytes)));if(p!==`records/sessions/${s.id}.json`)throw Error('练习编号不一致 / Identifiant invalide.');sessions.push(s);}else if(p.startsWith('records/recordings/')){const id=p.split('/').at(-1).slice(0,-4);recordings.push({id,bytes:validateRecording(bytes).slice().buffer});}}
 if(!grammar||!seen.has('snapshot.json')||Object.keys(files).some(k=>k!=='records/manifest.json'&&!seen.has(k)))throw Error('备份内容不完整 / Sauvegarde incomplète.');const ids=new Set(recordings.map(r=>r.id));for(const s of sessions)for(const id of sessionAudioIds(s))if(!ids.has(id))throw Error('备份缺少口语录音 / Enregistrement manquant.');return{grammar,sessions,recordings,wordAudio:m.wordAudio};
}
export async function restoreBrowserBackup(restored){
 const db=await openRecordDatabase(),oldGrammar=grammarSnapshot(),records=restored.records,oldRevision=localStorage.getItem(GRAMMAR_REVISION);
 // localStorage cannot join an IndexedDB transaction: write its small validated
 // values first and roll them back if the atomic record replacement fails.
 const apply=g=>{for(const k of GRAMMAR_KEYS)localStorage.removeItem(k);for(const k of GRAMMAR_KEYS)if(g[k]!==null&&g[k]!==undefined)localStorage.setItem(k,g[k]);};
 let tx,done;
 try{if(records){validateGrammar(records.grammar);localStorage.setItem(GRAMMAR_REVISION,crypto.randomUUID());apply(records.grammar);}tx=db.transaction(records?RECORD_STORES:['state','audio'],'readwrite');done=idbDone(tx);const state=tx.objectStore('state'),epoch=await idbResult(state.get('recordsEpoch'))||0;state.put(restored.data,'primary');state.delete('backup');state.put(epoch+1,'recordsEpoch');const a=tx.objectStore('audio');if(records?.wordAudio!=='installed')a.clear();for(const r of restored.assets)a.put(r.bytes,r.id);if(records){const sessions=tx.objectStore('oralSessions'),audio=tx.objectStore('oralAudio');sessions.clear();audio.clear();for(const s of records.sessions)sessions.put(s,s.id);for(const r of records.recordings)audio.put(r,r.id);}await done;}catch(e){try{tx?.abort();}catch{}await done?.catch(()=>{});if(records){apply(oldGrammar);if(oldRevision===null)localStorage.removeItem(GRAMMAR_REVISION);else localStorage.setItem(GRAMMAR_REVISION,oldRevision);}throw e;}
 if(typeof BroadcastChannel!=='undefined'){const c=new BroadcastChannel('qihang-records');c.postMessage('restored');c.close();}
}
export async function oralSessionArchive(session,recordings){validateOralSession(session);const files={'practice.json':strToU8(JSON.stringify(session,null,2))},ids=new Set();for(const r of recordings){if(!sessionAudioIds(session).includes(r.id))throw Error('录音编号无效 / Audio invalide.');files[`audio/${r.id}.wav`]=validateRecording(r.bytes);ids.add(r.id);}for(const id of sessionAudioIds(session))if(!ids.has(id))throw Error('未找到练习录音 / Audio introuvable.');files['练习记录.txt']=strToU8(`启航法语 · DELF ${session.level||'A1'}\n\n`+session.messages.map(m=>`${m.role}: ${m.confirmed_text||m.text||''}`).join('\n')+(session.evaluation?'\n\n'+JSON.stringify(session.evaluation,null,2):''));return zipRecords(files);}
