<template>
  <view class="home-dashboard">
    <view class="home-title"><h1>开始学习<span>Apprendre</span></h1><view :class="['home-cover',cover.kind]" :aria-label="bookTitle||'词书 · Manuel'"><text>{{ cover.series }}</text><text v-if="cover.number">{{ cover.number }}</text><Icon v-else :name="cover.icon"/></view></view>
    <view class="home-selection glass">
      <button hover-class="none" class="home-selection-row" @click="$emit('book')"><Icon name="book" /><Bi zh="教材" fr="Manuel" /><text>{{ bookTitle||'选择 · Choisir' }}</text><Icon name="arrow" /></button>
      <button hover-class="none" class="home-selection-row" @click="$emit('lesson')"><Icon name="list" /><Bi zh="Lesson" fr="Leçon" /><text>{{ lessonId||'选择 · Choisir' }}</text><Icon name="arrow" /></button>
    </view>
    <view class="home-today"><Bi zh="今日学习" fr="Aujourd’hui" small /><text>{{ today }} 个词 · mots</text><text v-if="lessonId" class="muted">{{ completed }} / {{ total }}</text></view>
    <view class="home-study-actions"><button hover-class="none" class="button primary" :disabled="busy" @click="$emit('recite')"><Icon name="cards" /><Bi zh="开始背诵" fr="Mémoriser" /></button><button hover-class="none" class="button secondary" :disabled="busy" @click="$emit('practice')"><Icon name="edit" /><Bi zh="直接练习" fr="Pratiquer" /></button></view>
    <button v-if="lastLabel" hover-class="none" class="home-resume glass" :disabled="busy" @click="$emit('resume')"><Icon name="clock" /><view><Bi zh="继续上回进度" fr="Reprendre" /><text>{{ lastLabel }}</text></view><Icon name="arrow" /></button>
    <button hover-class="none" class="home-review glass" :disabled="(!due&&!reviewInProgress)||busy" @click="$emit('review')"><view class="soft-icon"><Icon name="repeat" /></view><Bi :zh="reviewInProgress?'继续复习':'开始复习'" :fr="reviewInProgress?'Reprendre':'Réviser'" /><text>{{ due }}</text><Icon name="arrow" /><view v-if="reviewBadge" class="practice-badge" aria-label="有待复习词 / Mots à réviser" /></button>
    <LearningAdjust :learn-size="learnSize" :review-size="reviewSize" :busy="busy" @open="$emit('learning-adjust')"/>
  </view>
</template>
<script setup>
import Bi from './Bi.vue';import Icon from './Icon.vue';
import LearningAdjust from './LearningAdjust.vue';
import {computed} from 'vue';
const props=defineProps({bookId:String,bookTitle:String,lessonId:String,total:Number,completed:Number,today:Number,due:Number,reviewInProgress:Boolean,reviewBadge:Boolean,busy:Boolean,lastLabel:String,learnSize:Number,reviewSize:Number});defineEmits(['book','lesson','recite','practice','review','resume','learning-adjust']);
const cover=computed(()=>{const match=/^inspire([1-4])$/.exec(props.bookId||'');if(match)return {kind:'home-cover-'+match[1],series:'inspire',number:match[1]};if(props.bookId==='fos1')return {kind:'home-cover-fos',series:'FOS',number:'1'};if(props.bookId==='imported')return {kind:'home-cover-imported',series:'mes mots',icon:'cards'};return {kind:'home-cover-empty',series:'livre',icon:'book'};});
</script>
<style scoped>
.home-cover-2{background:linear-gradient(150deg,#d2d9d4,#bbc9c1);border-left-color:#b4c2b7}.home-cover-3{background:linear-gradient(150deg,#ddd0d4,#cbbdc7);border-left-color:#c4b1bb}.home-cover-4{background:linear-gradient(150deg,#c9d1dd,#aebccc);border-left-color:#a8b6c8}.home-cover-fos{background:linear-gradient(145deg,#dce9f1,#acc9db);border-left-color:#99b6c9;color:#41677e}.home-cover-imported{background:linear-gradient(145deg,#e0ece8,#c3dcd4);border-left-color:#b5ccc2;color:#487566}.home-cover>.icon{width:25px;height:25px;margin-top:5px}
</style>
