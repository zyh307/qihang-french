<template><view :class="['toggle','spring-toggle',{on}]" aria-hidden="true"><view ref="thumb" class="toggle-thumb" /></view></template>
<script setup>
import {ref,watch,onUnmounted} from 'vue';
const props=defineProps({on:Boolean}),thumb=ref(null);let effect;
watch(()=>props.on,(on)=>{
 const el=thumb.value?.$el||thumb.value;if(!el)return;
 const current=getComputedStyle(el),from={transform:current.transform,width:current.width};effect?.cancel();
 if(!el.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
 const end=on?16:0,direction=on?1:-1;
 effect=el.animate([from,{transform:'translateX(4px)',width:'25px',offset:.38},{transform:`translateX(${end+direction*1.2}px)`,width:'17.6px',offset:.72},{transform:`translateX(${end-direction*.4}px)`,width:'16.8px',offset:.87},{transform:`translateX(${end}px)`,width:'17px'}],{duration:380,easing:'cubic-bezier(.22,.7,.3,1)'});
});
onUnmounted(()=>effect?.cancel());
</script>
