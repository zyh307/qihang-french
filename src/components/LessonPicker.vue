<template><view class="lesson-catalog"><view v-for="group in groups" :key="group.id" class="lesson-group"><view class="lesson-group-heading"><Icon :name="group.id==='priority'?'star':group.id==='completed'?'check':'book'" /><Bi :zh="group.zh" :fr="group.fr" /><text>{{ group.items.length }}</text></view><view class="lesson-grid"><view v-for="entry in group.items" :key="entry.key" :class="['lesson-card','glass',{'is-selected':entry.key===selected}]"><view class="lesson-select-top"><button hover-class="none" class="lesson-select-main" @click="$emit('select',entry.p)"><text class="lesson-number">{{ entry.p.lesson.id }}</text><text>{{ entry.stats.completed }} / {{ entry.stats.total }}</text></button><button hover-class="none" :class="['lesson-pin',{marked:entry.pinned}]" :aria-pressed="entry.pinned" @click="$emit('pin',entry.p)" aria-label="重点 Lesson / Leçon prioritaire"><Icon name="star" /></button></view><view class="thin-progress"><view :style="{width:entry.stats.completed/Math.max(1,entry.stats.total)*100+'%'}" /></view><view class="lesson-card-actions"><button hover-class="none" class="lesson-preview" @click="$emit('preview',entry.p)"><Icon name="eye" /><Bi zh="预览" fr="Aperçu" small /></button><button v-if="!entry.stats.practice" hover-class="none" @click="$emit('reset',entry.p)"><Icon name="repeat" /><Bi zh="一键放回" fr="Recommencer" small /></button></view></view></view></view></view></template>
<script setup>
import {computed} from 'vue';import Bi from './Bi.vue';import Icon from './Icon.vue';
const props=defineProps({entries:Array,selected:String});defineEmits(['select','preview','pin','reset']);
const groups=computed(()=>[
  {id:'priority',zh:'重点 Lesson',fr:'Prioritaires',items:props.entries.filter(e=>e.pinned)},
  {id:'learning',zh:'待学习',fr:'À apprendre',items:props.entries.filter(e=>!e.pinned&&e.stats.practice)},
  {id:'completed',zh:'已做完',fr:'Terminées',items:props.entries.filter(e=>!e.pinned&&!e.stats.practice)}
].filter(g=>g.items.length));
</script>
