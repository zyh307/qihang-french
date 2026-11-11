<template><view class="study-guide"><view v-for="item in items" :key="item.zh" class="guide-row"><view class="soft-icon"><Icon :name="item.icon" /></view><Bi :zh="item.zh" :fr="item.fr" small /></view><view class="guide-sources"><Bi zh="词库来源" fr="Sources" small/><button class="text-button" hover-class="none" @click="source('https://github.com/tatuylonen/wiktextract')">Wiktionary · Wiktextract</button><button class="text-button" hover-class="none" @click="source('https://tatoeba.org/')">Tatoeba</button><button class="text-button" hover-class="none" @click="source('https://github.com/open-dict-data/ipa-dict')">IPA-dict</button><text>词典数据 CC BY-SA 4.0；Tatoeba 例句 CC BY 2.0；IPA-dict MIT。原始出处随词条保留。</text><text>Wiktionary : CC BY-SA 4.0 ; Tatoeba : CC BY 2.0 ; IPA-dict : MIT.</text></view></view></template>
<script setup>
import {nativeHost} from '../platform/native.js';
function source(url){const host=nativeHost();if(host?.openExternalLink)host.openExternalLink(url);else window.open(url,'_blank','noopener,noreferrer');}
import Bi from './Bi.vue';import Icon from './Icon.vue';
const items=[
{icon:'clock',zh:'单词和变位均在学习第2、4、7、15、30天复习，之后每30天一次',fr:'Mots et conjugaisons : jours 2, 4, 7, 15 et 30 ; puis tous les 30 jours'},
{icon:'repeat',zh:'正常复习答错，次日加练一次；加练答错不再追加',fr:'Erreur en révision prévue : une seule reprise le lendemain'},
{icon:'cards',zh:'背诵与做题看主要释义，详细释义页可查看其他意思',fr:'Sens principal dans les cartes et exercices, autres sens dans la fiche'},
{icon:'cards',zh:'教材 → 导入本：逗号导入，每课30词，先背20词',fr:'Manuels → Mots importés : 30 mots par leçon, 20 cartes'},
{icon:'sound',zh:'单词和例句录音已内置，点击即可离线播放',fr:'Audio des mots et des phrases intégré, disponible hors ligne'},
{icon:'book',zh:'学习调整：独立页面设置每组3—15词，下组生效',fr:'Page dédiée : 3 à 15 mots ; dès la prochaine série'},
{icon:'sound',zh:'选义听例句，释义听单词；无例句则听单词',fr:'Choix : phrase ou mot ; fiche : mot'},
{icon:'repeat',zh:'各课到期词混合乱序复习，默认每组10词',fr:'Révision mélangée, toutes leçons : 10 mots par défaut'},
{icon:'clock',zh:'新学难词集中在最后一组；复习三次轮到仍错则次日再练，立即重答不累计',fr:'Apprentissage : série finale de mots difficiles. Révision : reprise après 3 passages erronés.'},
{icon:'eye',zh:'多张卡片可同时翻开，3 秒翻回；预览不改变选课',fr:'Plusieurs cartes ouvertes, 3 s ; aperçu sans sélection'},
{icon:'edit',zh:'填空点左下查看释义，答对前查看计错；同词每轮只计一次',fr:'Touchez le haut pour la fiche ; avant réussite, cela compte comme une erreur, une seule par mot et par série'},
{icon:'check',zh:'名词可选冠词，或在设置切换自行填写',fr:'Choisir l’article ou l’écrire selon les réglages'},
{icon:'keyboard',zh:'手机长按滑选重音，松手输入；电脑可用实体键盘和重音按钮',fr:'Mobile : maintenir, glisser, relâcher ; ordinateur : clavier physique et boutons d’accents'},
{icon:'close',zh:'选错标红，继续选；错题专练不改变复习时间',fr:'Rouge : réessayer ; correction sans changer les révisions'},
{icon:'edit',zh:'错题按错误次数排序，每天练一次，两次后可移出',fr:'Erreurs : une fois par jour, retrait après 2 révisions'},
{icon:'clock',zh:'10词显示红点；仅复习发系统通知，错题仅在软件内提醒',fr:'10 mots : point rouge ; notifications pour la révision uniquement'},
{icon:'badge',zh:'已会按钮上滑加入目标区；词条长按上拖可切换已会或复习',fr:'Acquis : glisser vers la zone. Maintenir un mot pour changer de carnet'}
];
</script>

<style scoped>.guide-sources{display:flex;flex-wrap:wrap;gap:10px;padding:15px 0;align-items:center}.guide-sources>.bi{width:100%}.guide-sources>text{display:block;width:100%;font-size:10px;line-height:1.7;color:#98a7bd}.guide-sources>.text-button{font-size:11px;padding:5px 0}</style>
