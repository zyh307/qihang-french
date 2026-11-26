<template>
 <button v-if="alternatives.length" ref="trigger" class="text-button other-senses-open" :data-related-kind="kind" hover-class="none" :disabled="busy" @click="open"><Bi :zh="title.zh" :fr="title.fr" small/><Icon name="chevron-right"/></button>
 <Teleport to="body"><Transition name="page-fade"><view v-if="opened" class="word-preview other-senses-page" :data-related-kind="kind" role="dialog" aria-modal="true" :aria-label="title.zh+' / '+title.fr"><view class="word-preview-content">
  <view class="practice-top"><button ref="back" data-word-senses-close class="icon-button back-control" hover-class="none" @click="close" aria-label="返回 / Retour"><Icon name="back"/></button><Bi :zh="title.zh" :fr="title.fr" small/></view>
  <view class="other-senses-scroll">
   <view class="other-senses-links"><button v-for="entry in alternatives" :key="entry.key" :data-sense-key="entry.key" class="text-button other-senses-choice" hover-class="none" @click="select(entry)"><view class="other-senses-label"><text>{{ entry.meaning }}</text><text class="muted" lang="fr">{{ entry.headword }} · {{ cardPartOfSpeech(entry.w) }}</text></view><Icon name="chevron-right"/></button></view>
  </view>
 </view></view></Transition></Teleport>
</template>
<script setup>
import {computed,inject,nextTick,ref,watch} from 'vue';
import {primaryMeaning} from '../domain/meanings.js';
import {senseDifference} from '../domain/meaning-nuances.js';
import {cardPartOfSpeech,displayForm} from '../domain/word-display.js';
import {wordKey} from '../domain/learning.js';
import Bi from './Bi.vue';import Icon from './Icon.vue';
const props=defineProps({pkg:Object,word:Object,busy:Boolean,hideSource:Boolean,inPreview:Boolean,kind:{type:String,default:'senses'}});
const lookup=inject('relatedWordSenses',()=>[]),openSense=inject('openRelatedWordSense');
const title=computed(()=>props.kind==='confusables'?{zh:'易混词',fr:'À distinguer'}:props.kind==='synonyms'?{zh:'近义词',fr:'Synonymes'}:{zh:'其他释义',fr:'Autres sens'});
const opened=ref(false),trigger=ref(null),back=ref(null);
const sourceKey=computed(()=>wordKey(props.pkg,props.word));
const alternatives=computed(()=>lookup(props.word,props.kind).map(entry=>{
 const gloss=entry.gloss||primaryMeaning(entry.w);
 return {...entry,key:wordKey(entry.p,entry.w),meaning:props.kind==='senses'?gloss:senseDifference(entry.w,gloss)||gloss,
  headword:entry.w.forms.map(form=>displayForm(entry.w,form)).join(' / ')};
}));
function focus(refValue){(refValue?.$el||refValue)?.focus?.();}
function open(){opened.value=true;nextTick(()=>focus(back.value));}
function select(entry){
 if(!openSense||props.busy)return;
 opened.value=false;
 openSense(entry,{inPreview:props.inPreview,hideSource:props.hideSource});
}
function close(){
 if(!opened.value)return false;
 opened.value=false;nextTick(()=>focus(trigger.value));
 return true;
}
watch(sourceKey,()=>{opened.value=false;});
defineExpose({close});
</script>
<style scoped>
.other-senses-open{display:flex;align-items:center;align-self:flex-start;gap:8px;margin:8px 0;padding:8px 2px;color:var(--ui-ac74441efc95,#7387a6)}
.other-senses-open>.icon,.other-senses-choice>.icon{width:14px;height:14px;flex:none}
.other-senses-page{z-index:140}.other-senses-page.page-fade-leave-active{pointer-events:none}.other-senses-scroll{min-height:0;flex:1;overflow-y:auto;padding-bottom:20px}
.other-senses-links{display:flex;flex-direction:column;margin-top:8px}
.other-senses-choice{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:56px;padding:10px 4px;border-bottom:1px solid var(--ui-e3ab1fbf2772,#e4e9f0);border-radius:0;white-space:normal;text-align:left;color:inherit}
.other-senses-label{display:flex;flex-direction:column;gap:4px;min-width:0;overflow-wrap:anywhere}.other-senses-label .muted{font-size:12px}
</style>
