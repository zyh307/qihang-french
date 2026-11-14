<template>
 <view v-if="choices.length>1" class="notebook-selection">
  <Bi zh="选择词条（可多选）" fr="Choisir les éléments" small/>
  <view class="notebook-selection-grid" role="group" aria-label="选择要调整的词条，可多选 / Sélection multiple">
   <button v-for="item in choices" :key="item.id" class="notebook-selection-item" :class="{selected:checked(item.id)}" hover-class="none" :disabled="disabled" :aria-pressed="checked(item.id)" @click="toggle(item.id)"><view class="notebook-selection-check"><Icon v-if="checked(item.id)" name="check"/></view><Bi :zh="item.zh" :fr="item.fr" small/></button>
  </view>
 </view>
</template>
<script setup>
import {computed} from 'vue';import Bi from './Bi.vue';import Icon from './Icon.vue';
import {notebookChoices} from '../domain/notebook-adjustment.js';
const props=defineProps({word:Object,modelValue:Object,disabled:Boolean}),emit=defineEmits(['update:modelValue']);
const choices=computed(()=>notebookChoices(props.word));
const checked=id=>id==='infinitive'?props.modelValue?.infinitive:props.modelValue?.tenses?.includes(id);
function toggle(id){const s={infinitive:!!props.modelValue?.infinitive,tenses:[...(props.modelValue?.tenses||[])]};if(id==='infinitive')s.infinitive=!s.infinitive;else s.tenses=checked(id)?s.tenses.filter(t=>t!==id):[...s.tenses,id];emit('update:modelValue',s);}
</script>
<style scoped>
.notebook-selection{display:flex;flex-direction:column;gap:10px;margin:15px 0}.notebook-selection-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.notebook-selection-item{display:flex;align-items:center;gap:9px;min-width:0;min-height:58px;padding:10px;border:1px solid var(--line);border-radius:13px;background:var(--theme-panel,#f8faff);color:var(--ink);text-align:left;transition:background-color .18s,border-color .18s}.notebook-selection-item.selected{background:var(--theme-soft,#e7eefb);border-color:var(--accent)}.notebook-selection-check{display:grid;place-items:center;flex:0 0 17px;width:17px;height:17px;border:1px solid var(--line);border-radius:5px}.selected .notebook-selection-check{background:var(--accent);border-color:var(--accent);color:#fff}.notebook-selection-check>.icon{width:12px;height:12px}.notebook-selection-item>.bi{min-width:0}.notebook-selection-item :deep(.bi-zh){font-size:12px;font-weight:450}.notebook-selection-item :deep(.bi-fr){font-size:10px;line-height:1.4}.notebook-selection-item:disabled{opacity:.6}
</style>
