<template>
 <view class="word-preview quick-import-page"><view class="word-preview-content">
  <view class="practice-top import-top"><button class="icon-button back-control" hover-class="none" @click="$emit('close')" :disabled="loading||saving" aria-label="返回 / Retour"><Icon name="back"/></button><Bi zh="导入单词" fr="Importer des mots"/></view>
  <view class="quick-import-body">
   <text class="muted">用逗号隔开 · Séparez les mots par des virgules.</text>
   <textarea auto-height v-model="input" :adjust-position="false" class="quick-import-input" maxlength="12000" placeholder="bonjour, un livre, hôtel" :disabled="loading||saving"/>
   <button class="button secondary" :disabled="!input.trim()||loading||saving" @click="lookup"><Icon name="search"/><Bi :zh="loading?'正在导入':'导入单词'" :fr="loading?'Importation…':'Importer'" small/></button>
   <text v-if="error" class="quick-import-error" role="alert">{{ error }}</text>
   <view v-if="results.length" class="quick-import-results">
    <view v-for="(row,i) in results" :key="i" class="glass quick-import-row">
     <text>{{ row.input }}</text>
     <view v-if="row.missing" class="missing-word"><Bi zh="未找到，可修改输入后重试" fr="Mot introuvable : corrigez puis réessayez" small/><button class="text-button" :disabled="loading||saving" @click="results.splice(i,1)"><Bi zh="跳过" fr="Ignorer" small/></button></view>
     <view v-for="option in row.options" :key="option.id" class="quick-word-option">
      <button hover-class="none" :disabled="loading||saving" :class="['quick-word-choice',{selected:row.selected===option.id}]" @click="row.selected=row.selected===option.id?'':option.id">
       <view><text lang="fr">{{ option.word }}</text><text class="quick-word-pronunciation">{{ option.pos }} {{ option.gender==='m'?'m.':option.gender==='f'?'f.':'' }} {{ option.ipa }}</text><text class="muted">{{ option.meanings.join('；') }}</text><text v-if="!option.example?.fr" class="quick-word-pending">例句待补 · Phrase à compléter</text></view><Icon :name="row.selected===option.id?'check':'plus'"/>
      </button>
      <view v-if="candidateLocations.get(option.id)?.length" class="quick-existing-list">
       <Bi zh="已有词条" fr="Déjà présents" small/>
       <view v-for="existing in candidateLocations.get(option.id)" :key="existing.key" class="quick-existing-word"><text lang="fr">{{ existing.word }}</text><Bi :zh="existing.locations.map(location=>location.zh).join(' / ')" :fr="existing.locations.map(location=>location.fr).join(' / ')" small/></view>
      </view>
     </view>
     <text v-if="row.options.length>1&&!row.selected" class="muted">请选择一个词 · Choisissez un mot.</text>
    </view>
   </view>
   <view v-if="importedRows.length" class="quick-import-receipt" role="status" aria-live="polite">
    <template v-if="successfulRows.length"><view class="import-success"><Icon name="check"/><Bi :zh="'成功导入 '+successfulRows.length+' 个词'" :fr="successfulRows.length+' mots importés'" small/></view><view v-for="word in successfulRows" :key="word.key" class="imported-word-result"><text lang="fr">{{ word.word }}</text><text>{{ word.lesson }}</text></view></template>
    <template v-if="duplicateRows.length"><Bi :zh="'已在导入本 · '+duplicateRows.length+' 个词'" :fr="'Déjà importés · '+duplicateRows.length" small/><view v-for="word in duplicateRows" :key="word.key" class="imported-word-result duplicate"><text lang="fr">{{ word.word }}</text><text>{{ word.lesson }}</text></view></template>
   </view>
  </view>
  <ConjugationOptions v-if="selected.some(e=>e.pos==='v.'&&isIrregularLemma(e.word))" v-model="conjugationPlan"/>
  <view v-if="results.length&&selected.length" class="exercise-footer"><button class="button primary wide" hover-class="none" :disabled="!selected.length||saving||loading" @click="submit"><Icon name="upload"/><Bi :zh="saving?'正在导入':'导入 '+selected.length+' 个词'" :fr="saving?'Importation…':'Importer '+selected.length+' mots'" small/></button></view>
 </view></view>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import ConjugationOptions from './ConjugationOptions.vue';
import {defaultPlan,isIrregularLemma} from '../conjugation/catalog.js';
import Bi from './Bi.vue';import Icon from './Icon.vue';
import {splitWords,makeLookup,makeImportLocationLookup} from '../domain/quick-import.js';
const props=defineProps({library:Array,data:Object}),emit=defineEmits(['close','import']);
const input=ref(''),results=ref([]),error=ref(''),importedRows=ref([]),loading=ref(false),saving=ref(false);let dictionary;
watch(input,()=>{results.value=[];error.value='';importedRows.value=[];});
const successfulRows=computed(()=>importedRows.value.filter(row=>row.added)),duplicateRows=computed(()=>importedRows.value.filter(row=>!row.added));
const candidateLocations=computed(()=>{
 const locate=makeImportLocationLookup(props.data||{library:props.library||[]}),map=new Map();
 for(const row of results.value)for(const option of row.options)if(!map.has(option.id))map.set(option.id,locate(option));
 return map;
});
function rememberImports(lessons=[],rows=[]){
 const all=new Map(importedRows.value.map(row=>[row.key,row]));
 for(const row of rows)all.set(row.key,{...row,added:row.added||all.get(row.key)?.added||false});
 importedRows.value=[...all.values()];
}
const conjugationPlan=ref(defaultPlan());
const selected=computed(()=>results.value.flatMap(r=>r.options.filter(o=>o.id===r.selected)));
async function lookup(){
 document.activeElement?.blur();const words=splitWords(input.value);
 if(words.length>200){error.value='每次最多 200 个词 / 200 mots maximum.';return;}
 loading.value=true;error.value='';importedRows.value=[];
 try{
  if(!dictionary){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);let r;
   try{r=await fetch(new URL('static/lexicon/french.json',document.baseURI),{signal:controller.signal});}finally{clearTimeout(timer);}
   if(!r.ok)throw Error();const data=await r.json();if(data.schema!==1||!Array.isArray(data.entries)||!data.entries.length)throw Error();dictionary=data.entries;
  }
  const resolve=makeLookup(dictionary,props.library),matched=[];results.value=[];
  for(let i=0;i<words.length;i++){
   const row=resolve(words[i]);if(row.options.length===1&&row.kind!=='typo')matched.push(row.options[0]);else{row.selected='';results.value.push(row);}
   if(i%8===0)await new Promise(r=>setTimeout(r,0));
  }
  if(matched.length){saving.value=true;emit('import',matched.map(e=>({...e,conjugationPlan:conjugationPlan.value})),(success,lessons,rows)=>{saving.value=false;if(success)rememberImports(lessons,rows);},true);}
 }catch{error.value='词库暂时无法读取，请重试 / Dictionnaire indisponible.';}
 finally{loading.value=false;}
}
function submit(){
 if(!selected.value.length||saving.value)return;saving.value=true;
 emit('import',selected.value.map(e=>({...e,conjugationPlan:conjugationPlan.value})),(success,lessons,rows)=>{saving.value=false;if(success){rememberImports(lessons,rows);results.value=results.value.filter(r=>!r.selected);}},true);
}
</script>
<style scoped>
.quick-import-body{flex:1;min-height:0;overflow-y:auto;padding:8px 2px 12px;display:flex;flex-direction:column;gap:14px}.quick-import-input{width:100%;height:auto;min-height:88px;max-width:100%;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap;flex:none;box-sizing:border-box;padding:15px;border:1px solid #dce4f1;background:#ffffffd9;border-radius:20px;box-shadow:0 5px 20px #7085a407;font:16px/1.6 Georgia,serif;color:#49617f}.quick-import-body>.button{flex:none;align-self:flex-start}.quick-import-results{display:flex;flex-direction:column;gap:12px}.quick-import-row{padding:16px;display:flex;flex-direction:column;gap:9px}.quick-import-row>text{font-size:12px;color:#94a5bc}.quick-word-choice{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid #d9e2ee;border-radius:12px;line-height:1.6;background:#f9fbfe}.quick-word-choice>view{flex:1;min-width:0}.quick-word-choice>view>text{display:block;overflow-wrap:anywhere}.quick-word-choice.selected{border-color:#a8bddc;background:#edf3fc}.quick-word-choice .muted{font-size:11px}.quick-word-pending{font-size:10px;color:#ae9370}.quick-import-error{font-size:12px;color:#b97780;line-height:1.7}.quick-import-page .exercise-footer{flex:none}.quick-import-page .practice-top>.bi{flex:1}.quick-import-page :deep(uni-text){line-height:1.6}
.quick-word-pronunciation{font-size:11px;color:#9aaac1;line-height:1.6}
.import-top{min-height:52px;flex:none;gap:15px}.missing-word{display:flex;align-items:center;justify-content:space-between;gap:10px}
.import-success{display:flex;align-items:center;gap:9px;color:#739d8c;font-size:11px;padding:4px 1px}
.quick-word-option{display:flex;flex-direction:column;gap:5px;min-width:0}.quick-word-choice{width:100%;text-align:left}.quick-existing-list{padding:3px 9px 6px;display:flex;flex-direction:column;gap:5px;color:#8799ac}.quick-existing-word{display:flex;flex-direction:column;gap:1px;font-size:11px;line-height:1.6;overflow-wrap:anywhere}.quick-existing-list :deep(.bi){font-size:10px}.quick-import-receipt{display:flex;flex-direction:column;gap:7px;padding:12px 2px 8px;border-top:1px solid #e4ebf0}.quick-import-receipt>.bi{margin-top:5px;color:#8d9ba9}.imported-word-result{display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:3px 0;font-size:12px;color:#597b6b;line-height:1.6}.imported-word-result>text:first-child{min-width:0;overflow-wrap:anywhere}.imported-word-result>text:last-child{flex:none;color:#97a6b4;font-size:10px}.imported-word-result.duplicate{color:#8a98a8}
</style>
