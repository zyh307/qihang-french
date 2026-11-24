<template>
 <div class="collection-feedback" role="status" aria-live="polite" aria-atomic="true">
  <div v-if="visible" class="achievement" :class="{'collection-still':reduced}">
   <div class="achievement-badge"><Icon name="check"/></div>
   <div class="bi collection-copy"><span class="bi-zh" lang="zh">已收录</span><span class="bi-fr" lang="fr">Acquis !</span></div>
   <div v-if="!reduced" class="collection-confetti" aria-hidden="true"><div v-for="(style,index) in confetti" :key="index" class="achievement-confetti" :style="style"/></div>
  </div>
 </div>
</template>
<script setup>
import {ref,onMounted,onUnmounted} from 'vue';
import Icon from './Icon.vue';
const emit=defineEmits(['finished']),visible=ref(false);
const reduced=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const colors=['var(--accent)','rgba(var(--theme-rgb),.55)','rgba(var(--theme-rgb),.8)'];
const confetti=Array.from({length:14},(_,i)=>{const angle=Math.PI*2*i/14;return {'--dx':Math.cos(angle)*100+'px','--dy':Math.sin(angle)*85-24+'px','--rotate':i*73+'deg','--confetti':colors[i%colors.length]};});
let firstFrame,secondFrame,timer;
onMounted(()=>{firstFrame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(()=>{visible.value=true;timer=setTimeout(()=>emit('finished'),reduced?600:980);});});});
onUnmounted(()=>{cancelAnimationFrame(firstFrame);cancelAnimationFrame(secondFrame);clearTimeout(timer);});
</script>
<style scoped>
.collection-feedback{position:fixed;inset:0;z-index:2600;pointer-events:none;isolation:isolate}
.collection-feedback>.achievement{animation:collection-fade .16s .8s ease-out both}
.collection-copy{display:flex;flex-direction:column;align-items:center;gap:5px;line-height:1.5}
.collection-confetti{position:absolute;left:50%;top:calc(50% - 25px);width:0;height:0;pointer-events:none}
.collection-confetti>.achievement-confetti{left:-4px;top:-6px}
@keyframes collection-fade{from{opacity:1}to{opacity:0}}
.collection-feedback>.collection-still{animation:none}
@media(prefers-reduced-motion:reduce){.collection-feedback>.achievement{animation:none}}
</style>
