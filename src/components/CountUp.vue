<template><text class="count-up" :aria-label="String(target)" aria-live="off"><text class="count-reserve" aria-hidden="true">{{ target }}</text><text class="count-visible" aria-hidden="true">{{ displayed }}</text></text></template>
<script setup>
import {computed,ref,watch,onMounted,onBeforeUnmount} from 'vue';
const props=defineProps({value:{type:Number,default:0}});
const target=computed(()=>Number.isFinite(props.value)?Math.max(0,Math.trunc(props.value)):0);
const displayed=ref(0);let mounted=false,frame;
function animate(){
 if(frame)cancelAnimationFrame(frame);
 displayed.value=0;
 if(!target.value||typeof requestAnimationFrame!=='function'||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){displayed.value=target.value;return;}
 const end=target.value;let started;
 const tick=now=>{
  started??=now;const progress=Math.min(1,(now-started)/1100);
  const next=Math.round(end*(1-(1-progress)**3));if(displayed.value!==next)displayed.value=next;
  if(progress<1)frame=requestAnimationFrame(tick);else{displayed.value=end;frame=null;}
 };
 frame=requestAnimationFrame(tick);
}
onMounted(()=>{mounted=true;animate();});watch(target,()=>{if(mounted)animate();});onBeforeUnmount(()=>{mounted=false;if(frame)cancelAnimationFrame(frame);});
</script>
<style scoped>.count-up{position:relative;display:inline-block;vertical-align:baseline;font:inherit;line-height:inherit}.count-reserve{visibility:hidden;font:inherit;line-height:inherit}.count-visible{position:absolute;inset:0;text-align:inherit;font:inherit;line-height:inherit}</style>
