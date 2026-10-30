<template>
  <view class="home-dashboard">
    <view class="home-title"><h1>开始学习<span>Apprendre</span></h1><view class="home-cover"><text>inspire</text><text>{{ bookTitle?1:'·' }}</text></view></view>
    <view class="home-selection glass">
      <button hover-class="none" class="home-selection-row" @click="$emit('book')"><Icon name="book" /><Bi zh="教材" fr="Manuel" /><text>{{ bookTitle||'选择 · Choisir' }}</text><Icon name="arrow" /></button>
      <button hover-class="none" class="home-selection-row" @click="$emit('lesson')"><Icon name="list" /><Bi zh="Lesson" fr="Leçon" /><text>{{ lessonId||'选择 · Choisir' }}</text><Icon name="arrow" /></button>
    </view>
    <view class="home-today"><Bi zh="今日学习" fr="Aujourd’hui" small /><text>{{ today }} 个词 · mots</text><text v-if="lessonId" class="muted">{{ completed }} / {{ total }}</text></view>
    <view class="home-study-actions"><button hover-class="none" class="button primary" :disabled="busy" @click="$emit('recite')"><Icon name="cards" /><Bi zh="开始背诵" fr="Mémoriser" /></button><button hover-class="none" class="button secondary" :disabled="busy" @click="$emit('practice')"><Icon name="edit" /><Bi zh="直接练习" fr="Pratiquer" /></button></view>
    <button v-if="lastLabel" hover-class="none" class="home-resume glass" :disabled="busy" @click="$emit('resume')"><Icon name="clock" /><view><Bi zh="继续上回进度" fr="Reprendre" /><text>{{ lastLabel }}</text></view><Icon name="arrow" /></button>
    <button hover-class="none" class="home-review glass" :disabled="(!due&&!reviewInProgress)||busy" @click="$emit('review')"><view class="soft-icon"><Icon name="repeat" /></view><Bi zh="开始复习" fr="Réviser" /><text>{{ due }}</text><Icon name="arrow" /></button>
  </view>
</template>
<script setup>
import Bi from './Bi.vue';import Icon from './Icon.vue';
defineProps({bookTitle:String,lessonId:String,total:Number,completed:Number,today:Number,due:Number,reviewInProgress:Boolean,busy:Boolean,lastLabel:String});defineEmits(['book','lesson','recite','practice','review','resume']);
</script>
