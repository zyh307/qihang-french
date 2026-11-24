import {h,render} from 'vue';
import CollectionAchievement from '../components/CollectionAchievement.vue';
import {playKnown} from './feedback-sounds.js';

let activeCleanup;

// Acknowledgement belongs to the completed save, not to a mounted card.
// This callback survives when saving advances a question or closes a sheet.
export function prepareCollection(){
 let completed=false;
 return saved=>{
  if(completed)return;
  completed=true;
  if(saved===true)finishCollection();
 };
}

export function finishCollection(){
 if(!document.body||document.hidden)return;
 activeCleanup?.();
 const host=document.createElement('div');
 let removed=false,timeout;
 const cleanup=()=>{
  if(removed)return;
  removed=true;
  clearTimeout(timeout);
  document.removeEventListener('visibilitychange',onVisibility);
  render(null,host);
  host.remove();
  if(activeCleanup===cleanup)activeCleanup=null;
 };
 const onVisibility=()=>{if(document.hidden)cleanup();};
 activeCleanup=cleanup;
 document.body.appendChild(host);
 document.addEventListener('visibilitychange',onVisibility);
 timeout=setTimeout(cleanup,1800);
 try{
  render(h(CollectionAchievement,{onFinished:cleanup}),host);
  playKnown();
 }catch{cleanup();}
}
