let serial=0,current,indexPromise;const batches=new Map();
async function batchURL(file){if(batches.has(file))return batches.get(file);const r=await fetch(new URL('static/lexicon/audio/'+file,document.baseURI));if(!r.ok)throw Error('录音暂时无法读取，请重新打开应用 / Audio indisponible, rouvrez l’application.');const bytes=await r.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(file!==hash+'.mp3')throw Error('音频校验失败 / Audio invalide.');const url=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));batches.set(file,url);while(batches.size>8){const key=batches.keys().next().value;URL.revokeObjectURL(batches.get(key));batches.delete(key);}return url;}
export function stopSpeech(){serial++;current?.();current=null;}
export function preloadSpeechIndex(){return indexPromise||=(async()=>{const response=await fetch(new URL('static/lexicon/audio/index.json',document.baseURI),{cache:'no-store'});if(!response.ok)throw Error('音频暂时无法读取 / Audio indisponible.');const value=await response.json();if(value.schema!==1||!value.entries)throw Error('音频目录无效 / Index audio invalide.');return value.entries;})().catch(error=>{indexPromise=null;throw error;});}
export async function playSpeech(text,ended){
 stopSpeech();const token=serial;const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const index=await preloadSpeechIndex(),clip=index[hash];if(token!==serial)return;
 if(!clip||!(/^[a-f0-9]{64}\.mp3$/).test(clip.file)||!Number.isFinite(clip.start)||!Number.isFinite(clip.end)||clip.start<0||clip.end<=clip.start)throw Error('该词发音暂不可用 / Audio indisponible.');
 const url=await batchURL(clip.file);if(token!==serial)return;
 return new Promise((resolve,reject)=>{const audio=new Audio();let timer,timeout,finished=false;
 const finish=(error,cancelled=false)=>{if(finished)return;finished=true;clearInterval(timer);clearTimeout(timeout);audio.pause();audio.removeAttribute('src');audio.load();if(token===serial){current=null;if(!cancelled)ended?.();}error?reject(error):resolve();};
 current=()=>finish(null,true);audio.onerror=()=>finish(Error('音频暂时无法播放 / Lecture indisponible.'));audio.onended=()=>finish();audio.onloadedmetadata=async()=>{if(token!==serial){finish(null,true);return;}try{audio.currentTime=clip.start;await audio.play();clearTimeout(timeout);timer=setInterval(()=>{if(!clip.full&&audio.currentTime>=clip.end-.015)finish();},20);}catch(e){finish(e);}};
 timeout=setTimeout(()=>finish(Error('录音读取超时，请重试 / Réessayez la lecture.')),12000);audio.preload='auto';audio.src=url;audio.load();
 });
}
