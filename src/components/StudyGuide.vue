<template><view class="study-guide"><view v-for="item in items" :key="item.zh" class="guide-row"><view class="soft-icon"><Icon :name="item.icon" /></view><Bi :zh="item.zh" :fr="item.fr" small /></view><view class="guide-sources"><Bi zh="词库来源" fr="Sources" small/><button class="text-button" hover-class="none" @click="source('https://github.com/tatuylonen/wiktextract')">Wiktionary · Wiktextract</button><button class="text-button" hover-class="none" @click="source('https://tatoeba.org/')">Tatoeba</button><button class="text-button" hover-class="none" @click="source('https://github.com/open-dict-data/ipa-dict')">IPA-dict</button><text>词典数据 CC BY-SA 4.0；Tatoeba 例句 CC BY 2.0；IPA-dict MIT。各词条可查看来源。</text><text>Wiktionary : CC BY-SA 4.0 ; Tatoeba : CC BY 2.0 ; IPA-dict : MIT.</text></view></view></template>
<script setup>
import {nativeHost} from '../platform/native.js';
function source(url){const host=nativeHost();if(host?.openExternalLink)host.openExternalLink(url);else window.open(url,'_blank','noopener,noreferrer');}
import Bi from './Bi.vue';import Icon from './Icon.vue';
const items=[
{icon:'book',zh:'首页选择教材和 Lesson，开始背诵',fr:'Choisissez un manuel et une leçon à l’accueil'},
{icon:'cards',zh:'点击卡片查看中文，点“释义”查看例句',fr:'Touchez une carte pour le sens, puis Fiche pour un exemple'},
{icon:'edit',zh:'单词练习先选中文，再填写法语',fr:'Choisissez le sens, puis écrivez le mot français'},
{icon:'repeat',zh:'变位练习每轮三个动词原型',fr:'Trois verbes par série de conjugaison'},
{icon:'book',zh:'每组词数在首页“学习调整”中修改',fr:'Réglez la taille des séries à l’accueil'},
{icon:'sound',zh:'点击播放单词和例句录音',fr:'Écoutez les mots et les phrases'},
{icon:'edit',zh:'填空时点左下角“释义”查看单词',fr:'Touchez Fiche en bas à gauche pendant la dictée'},
{icon:'check',zh:'名词可选冠词，也可在设置中改为自行填写',fr:'Choisissez l’article ou saisissez-le selon vos réglages'},
{icon:'keyboard',zh:'手机长按字母选择重音，电脑可点重音按钮',fr:'Mobile : appui long sur une lettre ; ordinateur : boutons d’accents'},
{icon:'cards',zh:'导入本支持用逗号分隔输入单词',fr:'Importez des mots séparés par des virgules'},
{icon:'repeat',zh:'在词本中查看复习、收藏和错题',fr:'Retrouvez vos révisions, favoris et erreurs dans les carnets'},
{icon:'badge',zh:'上滑“已会”按钮完成收录，长按词条可调整词本',fr:'Glissez le bouton Acquis vers le haut ; appui long pour changer de carnet'},
{icon:'clock',zh:'在设置中开启复习提醒并选择时间',fr:'Activez les rappels et choisissez une heure dans les réglages'}
];
</script>

<style scoped>.guide-sources{display:flex;flex-wrap:wrap;gap:10px;padding:15px 0;align-items:center}.guide-sources>.bi{width:100%}.guide-sources>text{display:block;width:100%;font-size:10px;line-height:1.7;color:#98a7bd}.guide-sources>.text-button{font-size:11px;padding:5px 0}</style>
