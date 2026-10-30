<template>
  <view v-if="changes.length" class="spelling-feedback" aria-label="拼写差异 / Différences d’écriture">
    <view class="diff-line"><Bi zh="你的填写" fr="Votre réponse" small /><view class="diff-text" lang="fr"><text v-for="(part,i) in diff" :key="i" :class="['diff-part',part.kind,{'diff-gap':!part.actual}]">{{ part.actual || '·' }}</text></view></view>
    <view class="diff-line"><Bi zh="规范写法" fr="Forme attendue" small /><view class="diff-text expected" lang="fr"><text v-for="(part,i) in diff" :key="i" :class="['diff-part',part.kind,{'diff-gap':!part.expected}]">{{ part.expected || '·' }}</text></view></view>
    <view class="diff-notes"><Bi v-for="kind in changes" :key="kind" :zh="labels[kind][0]" :fr="labels[kind][1]" small /></view>
  </view>
</template>
<script setup>
import {computed} from 'vue';import Bi from './Bi.vue';
const props=defineProps({diff:{type:Array,default:()=>[]}});
const changes=computed(()=>[...new Set(props.diff.filter(p=>p.kind!=='same').map(p=>p.kind))]);
const labels={missing:['补上缺少的字母','Ajoutez la lettre manquante.'],extra:['删去多余的字母','Retirez la lettre en trop.'],replace:['留意不同的字母或词尾','Vérifiez la lettre ou la terminaison.'],accent:['留意重音符号','Vérifiez les accents.'],case:['留意字母大小写','Vérifiez les majuscules.'],format:['留意空格或标点','Vérifiez les espaces et la ponctuation.']};
</script>
