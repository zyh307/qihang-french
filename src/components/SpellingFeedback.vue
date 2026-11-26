<template>
  <view v-if="changes.length" class="spelling-feedback" aria-label="拼写差异 / Différences d’écriture">
    <view class="diff-line"><Bi zh="你的填写" fr="Votre réponse" small /><view class="diff-text" lang="fr"><text v-for="(part,i) in displayedDiff" :key="i" :class="['diff-part',part.kind,{'diff-gap':!part.actual}]">{{ part.actual || '·' }}</text></view></view>
    <view class="diff-line"><Bi zh="规范写法" fr="Forme attendue" small /><view class="diff-text expected" lang="fr"><text v-for="(part,i) in displayedDiff" :key="i" :class="['diff-part',part.kind,{'diff-gap':!part.expected}]">{{ part.expected || '·' }}</text></view></view>
    <view class="diff-notes"><Bi v-for="kind in changes" :key="kind" :zh="labels[kind][0]" :fr="labels[kind][1]" small /></view>
  </view>
</template>
<script setup>
import {computed} from 'vue';import Bi from './Bi.vue';
import {normalizeApostrophes} from '../domain/spelling-diff.js';
const props=defineProps({diff:{type:Array,default:()=>[]}});
// Previously saved feedback may still contain a typography-only format mark.
const displayedDiff=computed(()=>props.diff.map(part=>part.kind==='format'&&
  normalizeApostrophes(part.actual)===normalizeApostrophes(part.expected)?{...part,kind:'same'}:part));
const changes=computed(()=>[...new Set(displayedDiff.value.filter(part=>part.kind!=='same').map(part=>part.kind))]);
const labels={ligature:['留意连字写法','Vérifiez la ligature.'],missing:['补上缺少的字母','Ajoutez la lettre manquante.'],extra:['删去多余的字母','Retirez la lettre en trop.'],replace:['留意不同的字母或词尾','Vérifiez la lettre ou la terminaison.'],accent:['留意重音符号','Vérifiez les accents.'],case:['留意字母大小写','Vérifiez les majuscules.'],format:['留意空格或标点','Vérifiez les espaces et la ponctuation.']};
</script>
