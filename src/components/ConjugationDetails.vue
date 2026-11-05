<template>
  <view class="word-preview conjugation-details"><view class="word-preview-content">
    <view class="practice-top"><button data-conjugation-close class="icon-button back-control" hover-class="none" @click="$emit('close')" aria-label="返回 / Retour"><Icon name="back" /></button><view class="practice-location"><text lang="fr">{{ lemma }}</text><Bi zh="变位" fr="Conjugaison" small /></view></view>
    <view class="conj-detail-scroll">
      <view class="conj-tense-tabs"><button v-for="t in TENSES" :key="t.id" hover-class="none" :class="{selected:tense===t.id}" :aria-pressed="tense===t.id" @click="tense=t.id"><text>{{ t.id }}</text></button></view>
      <view class="conj-person-grid"><button v-for="p in PERSONS" :key="p" class="conj-person-card" hover-class="none" :disabled="!forms[p]||forms[p]==='—'" :aria-label="personLabel(p)+' '+(forms[p]||'—')" @click="$emit('audio',recording(spokenForm(lemma,tense,p),p))"><text class="conj-person-label" lang="fr">{{ personLabel(p) }}</text><text class="conj-person-form" lang="fr">{{ forms[p]||'—' }}</text><Icon v-if="forms[p]&&forms[p]!=='—'" name="sound" /></button></view>
    </view>
  </view></view>
</template>
<script setup>
import {ref,computed} from 'vue';
import Bi from './Bi.vue';import Icon from './Icon.vue';
import {PERSONS,TENSES,conjugations,spokenForm,recording,lemmaFor} from '../conjugation/catalog.js';
const props=defineProps({word:Object});defineEmits(['close','audio']);
const lemma=computed(()=>lemmaFor(props.word));const tense=ref(props.word?.conjugation?.tense||'现在时');const forms=computed(()=>conjugations(lemma.value,tense.value));
const personLabel=p=>p==='il'?'il / elle / on':p==='ils'?'ils / elles':p;
</script>
<style scoped>
.conjugation-details{z-index:95}.conj-detail-scroll{min-height:0;flex:1;overflow-y:auto;padding:3px}
.conj-tense-tabs{display:flex;gap:8px;margin:9px 0 16px}.conj-tense-tabs>button{flex:1;min-width:0;padding:12px 7px;border:1px solid #d9e2ee;border-radius:14px;background:#f8faff;box-sizing:border-box}.conj-tense-tabs>button.selected{background:#e7eefb;border-color:#9fb6d9;box-shadow:0 0 0 2px #adc2df22}.conj-tense-tabs :deep(.bi-zh){font-size:11px}.conj-tense-tabs :deep(.bi-fr){font-size:9px}
.conj-person-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:640px;margin:0 auto}.conj-person-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:9px;min-width:0;min-height:115px;padding:17px 16px 27px;border:1px solid #d4dfef;border-radius:18px;background:linear-gradient(145deg,#fff,#f0f5fc);box-shadow:0 4px 12px #617a9e0b,inset 0 1px #fff;box-sizing:border-box;overflow:visible}.conj-person-label{font:14px/1.5 Georgia,serif;color:#93a3bc}.conj-person-form{display:block;max-width:100%;font:22px/1.5 Georgia,serif;color:#526e96;overflow-wrap:anywhere}.conj-person-card>.icon{position:absolute;right:12px;bottom:10px;width:15px;height:15px;color:#8ba3c5}.conj-person-card:disabled{opacity:.58}.conj-person-card:focus-visible{outline:2px solid #9db5d8;outline-offset:3px}
@media(min-width:850px){.conj-person-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:390px){.conj-person-grid{gap:9px}.conj-person-card{min-height:105px;padding:13px 12px 25px}.conj-person-label{font-size:12px}.conj-person-form{font-size:19px}}
</style>
