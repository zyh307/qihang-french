<template>
  <view class="glass study-calendar">
    <view class="calendar-heading"><Bi zh="学习日历" fr="Calendrier d’apprentissage" /><button hover-class="none" class="text-button calendar-today" @click="goToday"><Bi zh="回到今天" fr="Aujourd’hui" inline /></button></view>
    <view class="calendar-toolbar">
      <button hover-class="none" class="icon-button calendar-prev" @click="changeMonth(-1)" aria-label="上个月 / Mois précédent"><Icon name="back" /></button>
      <view class="calendar-month"><text>{{ Number(month.slice(0,4)) }} 年 {{ Number(month.slice(5)) }} 月</text><text lang="fr">{{ frenchMonth }}</text></view>
      <button hover-class="none" class="icon-button calendar-next" @click="changeMonth(1)" aria-label="下个月 / Mois suivant"><Icon name="arrow" /></button>
    </view>
    <view class="calendar-summary"><Bi :zh="`本月 ${summary.days} 天 · ${summary.words} 个词 · ${summary.attempts} 次作答`" :fr="`${summary.days} jours · ${summary.words} mots · ${summary.attempts} réponses ce mois-ci`" small /></view>
    <view class="calendar-weekdays"><view v-for="weekday in weekdays" :key="weekday[0]"><text>{{ weekday[0] }}</text><text lang="fr">{{ weekday[1] }}</text></view></view>
    <Transition name="panel-switch" mode="out-in"><view :key="month" class="month-grid">
      <button hover-class="none" v-for="cell in cells" :key="cell.date" :data-date="cell.date" :class="['calendar-day',{outside:!cell.inMonth,today:cell.today,selected:cell.date===selected,practiced:cell.active,future:cell.future}]" :aria-pressed="cell.date===selected" :aria-label="`${cell.date} · ${cell.count} 词 / mots${cell.today?' · 今天 / Aujourd’hui':''}`" @click="selectDate(cell.date)">
        <text class="calendar-number">{{ cell.number }}</text><text class="calendar-count">{{ cell.count ? `${cell.count} 词` : cell.active ? '•' : '·' }}</text>
      </button>
    </view>
    </Transition><view class="calendar-legend"><view><text class="legend-dot" /><Bi zh="有学习记录" fr="Journée active" inline small /></view><view><text class="legend-today" /><Bi zh="今天" fr="Aujourd’hui" inline small /></view></view>
    <view class="day-detail" aria-live="polite">
      <view class="day-detail-heading"><Bi :zh="`${selected} 的记录`" :fr="selectedFrench" /><text v-if="selected===today" class="tag">今天 · Aujourd’hui</text></view>
      <view v-if="record.words.length || record.attempts" class="day-detail-stats"><view><strong>{{ record.words.length }}</strong><Bi zh="完成词数" fr="mots terminés" small /></view><view><strong>{{ record.reviews.length }}</strong><Bi zh="其中复习" fr="dont révisés" small /></view><view><strong>{{ record.attempts }}</strong><Bi zh="作答次数" fr="réponses" small /></view><view><strong>{{ record.attempts ? Math.round(record.correct/record.attempts*100)+'%' : '—' }}</strong><Bi zh="正确率" fr="réussite" small /></view></view>
      <view v-if="words.length" class="calendar-words"><button hover-class="none" v-for="word in words" :key="word.id" :disabled="!word.package||!word.word" @click="$emit('word',{p:word.package,w:word.word})"><text lang="fr">{{ word.text }}</text><text>{{ word.meaning }}</text><text class="muted">{{ word.label }}</text><Icon v-if="word.package" name="arrow" /></button></view>
      <Bi v-else :zh="selected>today?'这一天还未到来。':record.attempts?'当天有练习作答，尚未完成整词。':'这一天还没有学习记录。'" :fr="selected>today?'Cette journée est à venir.':record.attempts?'Des réponses, mais aucun mot terminé.':'Aucune activité enregistrée ce jour-là.'" small />
      <Bi zh="每日完成词数含复习，同词不重复计数。" fr="Révisions comprises, un seul compte par mot et par jour." small />
    </view>
  </view>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Bi from './Bi.vue'; import Icon from './Icon.vue';
import { day } from '../domain/learning.js';
import { monthCells, monthSummary, shiftMonth } from '../domain/calendar.js';
import { displayForm } from '../domain/word-display.js';
const props=defineProps({activity:Object,library:Array}); defineEmits(['word']);
const today=ref(day()),month=ref(today.value.slice(0,7)),selected=ref(today.value);
const weekdays=[['一','Lun.'],['二','Mar.'],['三','Mer.'],['四','Jeu.'],['五','Ven.'],['六','Sam.'],['日','Dim.']];
const cells=computed(()=>monthCells(month.value,props.activity,today.value));
const summary=computed(()=>monthSummary(month.value,props.activity));
const frenchMonth=computed(()=>new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(`${month.value}-01T12:00:00`)));
const selectedFrench=computed(()=>new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${selected.value}T12:00:00`)));
const record=computed(()=>({words:[],reviews:[],attempts:0,correct:0,...props.activity[selected.value]}));
const words=computed(()=>record.value.words.map(id=>{
  const [book,wid]=id.split(':'),p=props.library.find(p=>p.book.id===book&&p.words.some(w=>w.id===wid)),w=p?.words.find(w=>w.id===wid);
  return{id,package:p,word:w,text:w?w.forms.map(f=>displayForm(w,f)).join(' / '):wid,meaning:w?.meanings.join('；')||'词条已归档 · Entrée archivée',label:p?`${p.book.title} · ${p.lesson.id}`:book};
}));
function selectDate(date){selected.value=date;month.value=date.slice(0,7);}
function changeMonth(offset){month.value=shiftMonth(month.value,offset);selected.value=month.value===today.value.slice(0,7)?today.value:`${month.value}-01`;}
function goToday(){today.value=day();selectDate(today.value);}
let timer;onMounted(()=>{timer=setInterval(()=>today.value=day(),30000);});onUnmounted(()=>clearInterval(timer));
</script>
