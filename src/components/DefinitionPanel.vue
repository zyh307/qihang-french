<template>
  <view :class="['definition-screen',{'is-celebrating':celebrating}]">
    <view class="definition-title"><Icon name="book" /><Bi zh="释义" fr="Fiche du mot" small /><view v-if="showTools" class="definition-tools"><button hover-class="none" class="text-button" :disabled="busy||celebrating||practiceDisabled" @click="$emit('practice')"><Icon name="repeat" /><Bi zh="专练" fr="Pratiquer" small /></button><button hover-class="none" class="text-button" :disabled="busy||celebrating" @click="$emit('move')"><Icon name="notebook" /><Bi zh="词本" fr="Carnet" small /></button></view></view>
    <view class="definition-scroll">
      <WordCard :word="word" :favorite="favorite" :playing="playing" definition :source-label="`${pkg.book.title} · ${pkg.lesson.id}`" @favorite="$emit('favorite',word)" @audio="$emit('audio',$event)" />
      <slot />
    </view>
    <view class="exercise-footer definition-actions">
      <button v-if="allowKnown" hover-class="none" :class="['button','known-action',showContinue?'secondary':'primary']" :disabled="busy||celebrating||known" @click="know" aria-label="已会，停止自动复习 / Acquis, arrêter les révisions"><Icon :name="known?'check':'badge'" /><Bi zh="已会" fr="Acquis" small /></button>
      <button v-if="showContinue" hover-class="none" class="button primary" :disabled="busy||celebrating" @click="$emit('continue')"><Bi zh="继续" fr="Continuer" small /><Icon name="arrow" /></button>
    </view>
    <view v-if="celebrating" class="achievement" role="status" aria-live="polite">
      <view class="achievement-badge"><Icon name="check" /></view><Bi zh="已收录" fr="Acquis !" />
      <view v-for="(style,index) in confetti" :key="index" class="achievement-confetti" :style="style" />
    </view>
  </view>
</template>
<script setup>
import {ref,onUnmounted} from 'vue';
import {playKnown} from '../platform/feedback-sounds.js';
import Bi from './Bi.vue';import Icon from './Icon.vue';import WordCard from './WordCard.vue';
const props=defineProps({pkg:Object,word:Object,favorite:Boolean,playing:String,busy:Boolean,known:Boolean,allowKnown:{type:Boolean,default:true},showContinue:{type:Boolean,default:true},showTools:Boolean,practiceDisabled:Boolean});
const emit=defineEmits(['favorite','audio','known','continue','practice','move']);
const celebrating=ref(false);let celebrationTimer,knownWord,knownPkg,knownSent=false;
const colors=['#7da9d0','#a4c8b0','#d1afe0','#edc288','#f1b6c7','#99bddc'];
const confetti=Array.from({length:14},(_,i)=>{const angle=Math.PI*2*i/14;return `--dx:${Math.cos(angle)*100}px;--dy:${Math.sin(angle)*85-24}px;--rotate:${i*73}deg;--confetti:${colors[i%colors.length]}`;});
function know(){
  if(props.busy||props.known||celebrating.value)return;
  playKnown();
  celebrating.value=true;knownWord=props.word;knownPkg=props.pkg;knownSent=false;
  const delay=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?220:720;
  celebrationTimer=setTimeout(()=>{knownSent=true;emit('known',knownWord,()=>{celebrating.value=false;knownWord=null;knownPkg=null;},knownPkg);},delay);
}
defineExpose({celebrating});
onUnmounted(()=>{clearTimeout(celebrationTimer);if(knownWord&&!knownSent)emit('known',knownWord,undefined,knownPkg);});
</script>
