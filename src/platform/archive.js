import {unzip,unzipSync} from 'fflate';
import {yieldToUI} from './ui-work.js';
export async function unzipAsync(bytes,options={}){
 await yieldToUI();
 if(typeof Worker==='undefined')return unzipSync(bytes,options);
 try{return await new Promise((resolve,reject)=>{
  let cancel;const timeout=setTimeout(()=>{cancel?.();reject(Error('Archive worker unavailable'));},30000);
  try{cancel=unzip(bytes,options,(error,files)=>{clearTimeout(timeout);error?reject(error):resolve(files);});}
  catch(error){clearTimeout(timeout);reject(error);}
 });}
 catch(error){if(options.filter)throw error;await yieldToUI();return unzipSync(bytes,options);}
}
