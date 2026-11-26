<template>
 <view class="word-preview quick-import-page"><view class="word-preview-content">
  <view class="practice-top import-top"><button class="icon-button back-control" hover-class="none" @click="handleBack" :disabled="loading||saving" data-quick-import-back aria-label="返回 / Retour"><Icon name="back"/></button><Bi :zh="destination.courseKey?'添加单词':'导入单词'" :fr="destination.courseKey?'Ajouter des mots':'Importer des mots'"/></view>
  <view class="quick-import-body">
   <view v-if="destination.courseKey" class="import-destination course-destination"><Icon name="book"/><text>{{ destination.courseTitle }} · {{ destination.lessonId }}</text></view><view v-else class="import-destination"><button class="button secondary import-destination-button" hover-class="none" :disabled="loading||saving" :aria-expanded="lessonPicker" aria-label="导入课次 / Leçon de destination" @click="openLessons"><Icon name="book"/><text v-if="destination.lessonId">{{ destination.lessonId }}</text><Bi v-else zh="自动分课" fr="Automatique" small/><Icon name="chevron-down"/></button><button class="icon-button lesson-add" hover-class="none" :disabled="loading||saving" @click="$emit('newLesson')" aria-label="新增 Lesson / Nouvelle leçon"><Icon name="plus"/></button></view><text class="muted">用逗号隔开 · Séparez les mots par des virgules.</text>
   <textarea auto-height v-model="input" :adjust-position="false" class="quick-import-input" maxlength="12000" placeholder="bonjour, un livre, hôtel" :disabled="loading||saving"/>
   <button class="button secondary" :disabled="!input.trim()||loading||saving" @click="lookup"><Icon name="search"/><Bi :zh="loading?'正在导入':'导入单词'" :fr="loading?'Importation…':'Importer'" small/></button>
   <view class="ai-image-help">
    <Icon name="camera" aria-hidden="true"/>
    <Bi class="ai-image-label" zh="识图推荐前往 DeepSeek" fr="Pour lire une image, utilisez DeepSeek"/>
    <button class="button secondary ai-image-copy" hover-class="none" aria-label="复制识图提示词 / Copier la consigne" @click="copyImagePrompt"><Bi :zh="copied?'已复制':'复制'" :fr="copied?'Copié':'Copier'" small/></button>
   </view>
   <text v-if="copyFailed" class="quick-import-error" role="alert">复制失败，请重试 · Échec de la copie.</text>
   <text v-if="error" class="quick-import-error" role="alert">{{ error }}</text>
   <view v-if="choiceRows.length" class="quick-import-results">
    <view v-for="(row,i) in choiceRows" :key="i" class="glass quick-import-row">
     <text v-if="row.phrase" class="quick-phrase-source" lang="fr">{{ row.phrase }}</text><text>{{ row.input }}</text>
     <Bi v-if="!row.selected" class="quick-choice-prompt" :zh="row.requiresPartOfSpeech?'请选择词性及释义':row.requiresSense?'请选择释义':'请选择一个词'" :fr="row.requiresPartOfSpeech?'Choisissez la catégorie et le sens':row.requiresSense?'Choisissez le sens':'Choisissez un mot'" small/>
     <view v-for="option in row.options" :key="option.id" class="quick-word-option">
      <button hover-class="none" :disabled="loading||saving" :class="['quick-word-choice',{selected:row.selected===option.id}]" :aria-pressed="row.selected===option.id" @click="row.selected=row.selected===option.id?'':option.id">
       <view><text lang="fr">{{ option.word }}</text><text class="quick-word-pronunciation">{{ grammaticalLabel(option.pos) }} {{ option.gender==='m'?'m.':option.gender==='f'?'f.':'' }} {{ option.ipa }}</text><text class="muted">{{ option.meanings.join('；') }}</text><text v-if="!option.example?.fr" class="quick-word-pending">例句待补 · Phrase à compléter</text></view><Icon :name="row.selected===option.id?'check':'plus'"/>
      </button>
      <view v-if="candidateLocations.get(option.id)?.length" class="quick-existing-list">
       <Bi zh="已有词条" fr="Déjà présents" small/>
       <view v-for="existing in candidateLocations.get(option.id)" :key="existing.key" class="quick-existing-word"><text lang="fr">{{ existing.word }}</text><view v-for="location in existing.locations" :key="location.key" class="quick-existing-location"><text>{{ location.zh }}</text><text v-if="location.fr!==location.zh" lang="fr">{{ location.fr }}</text></view><Bi v-if="existing.tenses?.length" :zh="'已有时态：'+existing.tenses.join('、')" :fr="'Déjà ajoutés : '+existing.tenses.join('、')" small/></view>
      </view>
     </view>
    </view>
   </view>
   <view v-if="missingRows.length" class="quick-import-not-found"><Bi zh="以下词未找到" fr="Mots introuvables" small/><text v-for="row in missingRows" :key="row.input" lang="fr">{{ row.input }}</text></view>
   <view v-if="importedRows.length" class="quick-import-receipt" role="status" aria-live="polite">
    <template v-if="successfulRows.length"><view class="import-success"><Icon name="check"/><Bi :zh="'成功导入 '+successfulRows.length+' 个词'" :fr="successfulRows.length+' mots importés'" small/></view><view v-for="word in successfulRows" :key="word.key" class="imported-word-result"><text lang="fr">{{ word.word }}</text><text>{{ word.lesson }}</text></view></template>
    <template v-if="duplicateRows.length"><Bi :zh="(destination.courseKey?'已在本课 · ':'已在导入本 · ')+duplicateRows.length+' 个词'" :fr="'Déjà importés · '+duplicateRows.length" small/><view v-for="word in duplicateRows" :key="word.key" class="imported-word-result duplicate"><text lang="fr">{{ word.word }}</text><text>{{ word.lesson }}</text></view></template>
    <template v-if="knownSkippedRows.length"><Bi :zh="'已在已会本，未导入 · '+knownSkippedRows.length+' 项'" :fr="'Déjà acquis, non importés · '+knownSkippedRows.length" small/><view v-for="word in knownSkippedRows" :key="word.key" class="imported-word-result duplicate"><text lang="fr">{{ word.word }}</text><text>{{ word.lesson }}</text></view></template>
    <template v-if="reviewSkippedRows.length"><Bi :zh="'已在复习本，未导入 · '+reviewSkippedRows.length+' 项'" :fr="'Déjà en révision, non importés · '+reviewSkippedRows.length" small/><view v-for="word in reviewSkippedRows" :key="word.key" class="imported-word-result duplicate"><text lang="fr">{{ word.word }}</text><text>{{ word.lesson }}</text></view></template>
   </view>
  </view>
  <ConjugationOptions v-if="!destination.courseKey&&selected.some(needsConjugationChoice)" :key="conjugationChoiceKey" v-model="conjugationPlan" :existing="existingTenses"/>
  <view v-if="results.length&&selected.length" class="exercise-footer"><button class="button primary wide" hover-class="none" :disabled="!selected.length||saving||loading" @click="submit"><Icon name="upload"/><Bi :zh="saving?'正在导入':'导入 '+selected.length+' 个词'" :fr="saving?'Importation…':'Importer '+selected.length+' mots'" small/></button></view>
  <ImportSheet :open="lessonPicker" label="导入课次 / Leçon de destination" @close="lessonPicker=false">
   <view class="import-lesson-picker">
    <button class="button secondary auto-lesson" hover-class="none" :aria-pressed="!destination.lessonId" @click="selectLesson('')"><Bi zh="自动分课" fr="Automatique" small/><Icon v-if="!destination.lessonId" name="check"/></button>
    <view v-if="lessons.length" class="import-lesson-grid"><button v-for="lesson in lessons" :key="lesson.lesson.id" class="button secondary" hover-class="none" :aria-pressed="destination.lessonId===lesson.lesson.id" @click="selectLesson(lesson.lesson.id)"><text>{{ lesson.lesson.id }}</text><Icon v-if="destination.lessonId===lesson.lesson.id" name="check"/></button></view>
   </view>
  </ImportSheet>
 </view></view>
</template>
<script setup>
import {computed,ref,watch,onUnmounted} from 'vue';
import {yieldToUI} from '../platform/ui-work.js';
import {readJSON} from '../platform/read-json.js';
import {nativeHost} from '../platform/native.js';
import ImportSheet from './ImportSheet.vue';
import ConjugationOptions from './ConjugationOptions.vue';
import {TENSES} from '../conjugation/catalog.js';
import {grammaticalLabel} from '../domain/word-readings.js';
import Bi from './Bi.vue';import Icon from './Icon.vue';
import {splitWords,makeLookupAsync,resolveImportInput,makeImportLocationLookup,makeLearnedImportLookup,needsConjugationChoice} from '../domain/quick-import.js';
const props=defineProps({library:Array,data:Object,dictionaryRows:Array,destination:Object,lessons:Array}),emit=defineEmits(['close','import','destination','newLesson']);
const input=ref(''),results=ref([]),error=ref(''),importedRows=ref([]),loading=ref(false),saving=ref(false);let dictionary,cancelled=false;onUnmounted(()=>{cancelled=true;clearTimeout(copyTimer);});
const lessonPicker=ref(false),copied=ref(false),copyFailed=ref(false);
let copyTimer;
const imagePrompt='请识别图片里的法语词汇和短语，保留重音、撇号、连字符和词组中的空格。去掉重复项，只输出一行，用英文逗号分隔。不要翻译，不要加序号或说明。';
function copyBySelection(text){
 const previous=document.activeElement;
 const field=document.createElement('textarea');
 field.value=text;field.readOnly=true;
 field.style.cssText='position:fixed;left:0;top:0;opacity:0;pointer-events:none';
 document.body.append(field);
 try{field.select();return document.execCommand('copy');}
 finally{field.remove();previous?.focus?.({preventScroll:true});}
}
async function copyImagePrompt(){
 clearTimeout(copyTimer);copyFailed.value=false;copied.value=false;
 try{
  const host=nativeHost();
  if(host?.copyText){
   if(!host.copyText(imagePrompt))throw Error('Clipboard unavailable');
  }else{
   try{await navigator.clipboard.writeText(imagePrompt);}
   catch(error){if(!copyBySelection(imagePrompt))throw error;}
  }
  copied.value=true;
  copyTimer=setTimeout(()=>copied.value=false,1800);
 }catch{copyFailed.value=true;}
}
function openLessons(){document.activeElement?.blur();lessonPicker.value=true;}
function selectLesson(id){lessonPicker.value=false;emit('destination',id);}
function handleBack(){
 if(lessonPicker.value){lessonPicker.value=false;return;}
 if(!loading.value&&!saving.value)emit('close');
}
watch(input,()=>{results.value=[];error.value='';importedRows.value=[];});
const successfulRows=computed(()=>importedRows.value.filter(row=>row.added)),duplicateRows=computed(()=>importedRows.value.filter(row=>!row.added&&!row.skipped)),reviewSkippedRows=computed(()=>importedRows.value.filter(row=>row.skipped==='review')),knownSkippedRows=computed(()=>importedRows.value.filter(row=>row.skipped==='known'));
const choiceRows=computed(()=>results.value.filter(row=>!row.missing)),missingRows=computed(()=>results.value.filter(row=>row.missing));
const candidateLocations=computed(()=>{
 const locate=makeImportLocationLookup(props.data||{library:props.library||[]}),map=new Map();
 for(const row of results.value)for(const option of row.options)if(!map.has(option.id))map.set(option.id,locate(option));
 return map;
});
function rememberImports(lessons=[],rows=[]){
 const all=new Map(importedRows.value.map(row=>[row.key,row]));
 for(const row of rows)all.set(row.key,{...row,added:!row.skipped&&(row.added||all.get(row.key)?.added||false)});
 importedRows.value=[...all.values()];
}
const conjugationPlan=ref({infinitive:true,tenses:[]}),conjugationChoiceKey=ref(0);
const existingTenses=computed(()=>[...new Set(selected.value.flatMap(e=>(candidateLocations.value.get(e.id)||[]).flatMap(location=>location.tenses||[])))]);
const selected=computed(()=>[...new Map(results.value.flatMap(r=>r.options.filter(o=>o.id===r.selected)).map(option=>[option.id,option])).values()]);
function resetConjugationChoice(){conjugationPlan.value={infinitive:true,tenses:[]};conjugationChoiceKey.value++;}
watch(()=>selected.value.filter(needsConjugationChoice).map(entry=>entry.id).sort().join('|'),resetConjugationChoice);
async function lookup(){
 document.activeElement?.blur();const words=splitWords(input.value);
 if(words.length>200){error.value='每次最多 200 个词 / 200 mots maximum.';return;}
 loading.value=true;await yieldToUI();error.value='';importedRows.value=[];
 try{
  const resolve=await dictionaryLookup();if(cancelled)return;const learnedLookup=makeLearnedImportLookup(props.data||{library:props.library||[],progress:{}}),matched=[],resolved=[];results.value=[];resetConjugationChoice();
  for(let i=0;i<words.length;i++){
   resolved.push(...resolveImportInput(resolve,words[i]));
   if(resolved.length>200){error.value='每次最多 200 个词 / 200 mots maximum.';return;}
   await yieldToUI();if(cancelled)return;
  }
  for(const row of resolved){
   const certain=row.options.length===1&&row.kind!=='typo',option=row.options[0];
   if(certain&&(option.existing||props.destination.courseKey&&!row.phrase||learnedLookup(option)||!row.phrase&&!needsConjugationChoice(option)))matched.push(option);
   else{if(!row.phrase||!certain)row.selected='';results.value.push(row);}
  }
  if(matched.length){saving.value=true;emit('import',[...new Map(matched.map(e=>[e.id,e])).values()].map(e=>e.existing?e:{...e,conjugationPlan:conjugationPlan.value}),(success,lessons,rows)=>{saving.value=false;if(success)rememberImports(lessons,rows);},true);}
 }catch{error.value='词库暂时无法读取，请重试 / Dictionnaire indisponible.';}
 finally{loading.value=false;}
}
async function dictionaryLookup(){
 if(!dictionary&&props.dictionaryRows?.length)dictionary=props.dictionaryRows;
 if(!dictionary){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);let response;
  try{response=await fetch(new URL('static/lexicon/french.json',document.baseURI),{signal:controller.signal});}finally{clearTimeout(timer);}
  if(!response.ok)throw Error();const data=await readJSON(response);
  if(data.schema!==1||!Array.isArray(data.entries)||!data.entries.length)throw Error();dictionary=data.entries;
 }
 return makeLookupAsync(dictionary,props.library,{current:()=>!cancelled});
}
function planForEntry(entry){const existing=(candidateLocations.value.get(entry.id)||[]).flatMap(location=>location.tenses||[]);return {...conjugationPlan.value,tenses:[...new Set([...existing,...conjugationPlan.value.tenses])]};}
function submit(){
 if(!selected.value.length||saving.value||loading.value)return;saving.value=true;
 const entries=props.destination.courseKey?selected.value:selected.value.map(e=>({...e,conjugationPlan:planForEntry(e)}));
 emit('import',entries,(success,lessons,rows)=>{saving.value=false;if(success){rememberImports(lessons,rows);results.value=results.value.filter(r=>!r.selected);}},true);
}
</script>
<style scoped>
.ai-image-help{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--line);border-radius:15px;background:color-mix(in srgb,var(--accent) 9%,var(--glass));color:var(--ink)}
.ai-image-help>.icon{color:var(--accent)}
.ai-image-label{flex:1}
.ai-image-help>.ai-image-copy{flex:none}
.ai-image-copy{min-height:36px;padding:5px 12px;flex:none}
.quick-import-body{flex:1;min-height:0;overflow-y:auto;padding:8px 2px 12px;display:flex;flex-direction:column;gap:14px}.quick-import-input{width:100%;height:auto;min-height:88px;max-width:100%;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap;flex:none;box-sizing:border-box;padding:15px;border:1px solid var(--ui-926d7c5b65de,#dce4f1);background:var(--ui-4e24da21164e,#ffffffd9);border-radius:20px;box-shadow:0 5px 20px var(--ui-b5e6260e95d6,#7085a407);font:16px/1.6 Georgia,serif;color:var(--ui-89eeba3a2d41,#49617f)}.quick-import-body>.button{flex:none;align-self:flex-start}.quick-import-results{display:flex;flex-direction:column;gap:12px}.quick-import-row{padding:16px;display:flex;flex-direction:column;gap:9px}.quick-import-row>text{font-size:12px;color:var(--ui-65eda1fb6ebd,#94a5bc)}.quick-word-choice{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--ui-e509653ab173,#d9e2ee);border-radius:12px;line-height:1.6;background:var(--ui-a814ced23185,#f9fbfe)}.quick-word-choice>view{flex:1;min-width:0}.quick-word-choice>view>text{display:block;overflow-wrap:anywhere}.quick-word-choice.selected{border-color:var(--ui-7cb29025ddcb,#a8bddc);background:var(--ui-154c51ac860c,#edf3fc)}.quick-word-choice .muted{font-size:11px}.quick-word-pending{font-size:10px;color:var(--ui-3f8b157b9d3d,#ae9370)}.quick-import-error{font-size:12px;color:var(--ui-970e198c8d5f,#b97780);line-height:1.7}.quick-import-page .exercise-footer{flex:none}.quick-import-page .practice-top>.bi{flex:1}.quick-import-page :deep(uni-text){line-height:1.6}
.quick-word-pronunciation{font-size:11px;color:var(--ui-7ccbcf728c92,#9aaac1);line-height:1.6}
.import-top{min-height:52px;flex:none;gap:15px}.missing-word{display:flex;align-items:center;justify-content:space-between;gap:10px}
.import-success{display:flex;align-items:center;gap:9px;color:var(--ui-7f88b38c4dd9,#739d8c);font-size:11px;padding:4px 1px}
.quick-word-option{display:flex;flex-direction:column;gap:5px;min-width:0}.quick-word-choice{width:100%;text-align:left}.quick-existing-list{padding:3px 9px 6px;display:flex;flex-direction:column;gap:5px;color:var(--ui-2f9ff39f3d20,#8799ac)}.quick-existing-word{display:flex;flex-direction:column;gap:1px;font-size:11px;line-height:1.6;overflow-wrap:anywhere}.quick-existing-list :deep(.bi){font-size:10px}.quick-import-receipt{display:flex;flex-direction:column;gap:7px;padding:12px 2px 8px;border-top:1px solid var(--ui-d21d7045e214,#e4ebf0)}.quick-import-receipt>.bi{margin-top:5px;color:var(--ui-aa6306916338,#8d9ba9)}.imported-word-result{display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:3px 0;font-size:12px;color:var(--ui-448a2dd75d3e,#597b6b);line-height:1.6}.imported-word-result>text:first-child{min-width:0;overflow-wrap:anywhere}.imported-word-result>text:last-child{flex:none;color:var(--ui-cf40e904fbda,#97a6b4);font-size:10px}.imported-word-result.duplicate{color:var(--ui-c1f5a94e8fbe,#8a98a8)}
.quick-choice-prompt{padding:7px 10px;border-radius:10px;background:var(--ui-3ac529c09150,#edf2fc);color:var(--ui-88c09a740350,#617cad)}.quick-import-not-found{display:flex;flex-direction:column;gap:6px;padding:12px 2px;color:var(--ui-c47c4a23f95c,#9b8082)}.quick-import-not-found>text{font-size:12px;line-height:1.6;overflow-wrap:anywhere}
.quick-existing-location{display:flex;flex-direction:column;gap:1px;font-size:10px}.quick-import-row>.quick-phrase-source{opacity:.75;font-size:10px;overflow-wrap:anywhere}
</style>

<style scoped>
.import-destination{display:flex;align-items:center;gap:10px}.import-destination-button{flex:1;min-width:0;justify-content:flex-start}.import-destination-button>.icon:last-child{margin-left:auto}.lesson-add{width:38px;min-width:38px;height:38px}
.course-destination{gap:8px}.course-destination>.icon{width:16px;height:16px}
.import-lesson-picker{display:flex;flex-direction:column;gap:10px}.import-lesson-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.import-lesson-picker .button{min-height:42px;padding:6px}.import-lesson-picker .auto-lesson{justify-content:space-between;padding-inline:12px}.import-lesson-picker .button[aria-pressed=true]{border-color:var(--ui-7cb29025ddcb,#a8bddc);background:var(--ui-154c51ac860c,#edf3fc)}
</style>
