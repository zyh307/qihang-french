import {ref,onUnmounted} from 'vue';

// Prevent re-entry in the same event turn, without a timed input lock.
// Pending writes and submissions are protected by the caller's busy state.
export function useErrorCooldown(){
 const blocked=ref(false);let generation=0;
 const clear=()=>{generation++;blocked.value=false;};
 const start=()=>{const current=++generation;blocked.value=true;queueMicrotask(()=>{if(current===generation)blocked.value=false;});};
 const ready=()=>!blocked.value;
 onUnmounted(clear);
 return {blocked,start,clear,ready};
}
