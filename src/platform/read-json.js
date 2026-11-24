import {yieldToUI} from './ui-work.js';
let workerUnavailable=false;
export const readJSON=async response=>parseJSONText(await response.text());
export async function parseJSONText(text){
 await yieldToUI();
 if(text.length>=262144&&!workerUnavailable&&typeof Worker!=='undefined'){
  try{
   return await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./json.worker.js',import.meta.url),{type:'module'});
    const timeout=setTimeout(()=>{worker.terminate();reject(Error('JSON worker unavailable'));},15000);
    const finish=()=>{clearTimeout(timeout);worker.terminate();};
    worker.onmessage=event=>{finish();event.data.error?reject(new SyntaxError(event.data.error)):resolve(event.data.value);};
    worker.onerror=event=>{event.preventDefault();finish();reject(Error('JSON worker unavailable'));};
    try{worker.postMessage(text);}catch(error){finish();reject(error);}
   });
  }catch(error){if(error instanceof SyntaxError)throw error;workerUnavailable=true;await yieldToUI();}
 }
 return JSON.parse(text);
}
