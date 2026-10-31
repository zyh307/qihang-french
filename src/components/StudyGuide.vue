<template><view class="study-guide"><view v-for="item in items" :key="item.zh" class="guide-row"><view class="soft-icon"><Icon :name="item.icon" /></view><Bi :zh="item.zh" :fr="item.fr" small /></view></view></template>
<script setup>
import Bi from './Bi.vue';import Icon from './Icon.vue';
const items=[
{icon:'book',zh:'每轮 5 词，组内顺序固定；学完一课可进入下一课',fr:'5 mots, ordre conservé ; puis leçon suivante'},
{icon:'sound',zh:'选义听例句，释义听单词；无例句则听单词',fr:'Choix : phrase ou mot ; fiche : mot'},
{icon:'repeat',zh:'各课到期词混合乱序复习，每轮 5 词',fr:'Révision mélangée : 5 mots, toutes leçons'},
{icon:'eye',zh:'多张卡片可同时翻开，3 秒翻回；预览不改变选课',fr:'Plusieurs cartes ouvertes, 3 s ; aperçu sans sélection'},
{icon:'edit',zh:'答错或查看提示进入错题，同词每轮只计错一次',fr:'Erreur ou indice : une erreur par mot et par série'},
{icon:'check',zh:'名词可选冠词，或在设置切换自行填写',fr:'Choisir l’article ou l’écrire selon les réglages'},
{icon:'keyboard',zh:'手机长按滑选重音，松手输入；电脑用实体键盘',fr:'Mobile : maintenir, glisser, relâcher ; ordinateur : clavier physique'},
{icon:'close',zh:'选错标红，继续选；错题专练不改变复习时间',fr:'Rouge : réessayer ; correction sans changer les révisions'},
{icon:'edit',zh:'错题按错误次数排序，每天练一次，两次后可移出',fr:'Erreurs : une fois par jour, retrait après 2 révisions'},
{icon:'clock',zh:'10 词显示红点；复习每天提醒，错题每两天提醒',fr:'10 mots : point rouge ; révision quotidienne, erreurs tous les 2 jours'},
{icon:'badge',zh:'已会：停止自动复习，可手动练习',fr:'Acquis : fin des rappels, pratique libre possible'}
];
</script>
