<template>
  <view class="word-preview conjugation-details"><view class="word-preview-content">
    <view class="practice-top"><button data-conjugation-close class="icon-button back-control" hover-class="none" @click="back" aria-label="返回 / Retour"><Icon name="back" /></button><view class="practice-location conj-location"><text lang="fr">{{ lemma }}</text><text v-if="meaning" class="conj-meaning" lang="zh">{{ meaning }}</text></view></view>
    <view v-if="actions" class="definition-title conj-action-row"><Icon name="grammar"/><Bi zh="变位释义" fr="Conjugaison" small/><view class="definition-tools"><button v-if="isIrregularLemma(lemma)" class="text-button" hover-class="none" :disabled="working" @click="practice"><Icon name="repeat"/><Bi zh="专练" fr="Pratiquer" small/></button><button class="text-button" hover-class="none" :disabled="working" @click="openMove"><Icon name="notebook"/><Bi zh="词本" fr="Carnet" small/></button></view><button class="icon-button favorite" :class="{marked:status.favorite}" hover-class="none" :disabled="working" @click="actions.favorite(word,pkg,tense)" aria-label="收藏当前时态 / Ajouter ce temps aux favoris"><SuccessIcon name="heart" :active="!!status.favorite" :item-key="'conjugation:'+(pkg?.book?.id||'')+':'+(pkg?.lesson?.id||'')+':'+lemma+':'+tense" /></button></view>
    <view class="conj-tense-tabs" role="group" aria-label="选择时态 / Choisir un temps"><button v-for="t in availableTenses" :key="t.id" hover-class="none" :class="{selected:tense===t.id}" :aria-pressed="tense===t.id" @click="tense=t.id"><text>{{ t.id }}</text></button></view>
    <view class="conj-detail-scroll">
      <view class="conj-person-grid"><button v-for="p in PERSONS" :key="p" class="conj-person-card" hover-class="none" :disabled="!forms[p]||forms[p]==='—'" :aria-label="personLabel(p)+' '+(forms[p]||'—')" @click="$emit('audio',recording(spokenForm(lemma,tense,p),p))"><text class="conj-person-label" lang="fr">{{ personLabel(p) }}</text><text class="conj-person-form" lang="fr">{{ forms[p]||'—' }}</text><Icon v-if="forms[p]&&forms[p]!=='—'" name="sound" /></button></view>
    </view>
    <view v-if="actions" class="exercise-footer"><KnownAction :disabled="working||!Object.keys(forms).length" :known="status.known" @confirm="move('known')"/></view>
    <view v-if="moveOpen" class="modal-shade confirm-shade" @click.self="moveOpen=false"><view class="modal small-modal"><view class="modal-heading"><button class="icon-button back-control" hover-class="none" @click="moveOpen=false" aria-label="返回 / Retour"><Icon name="back"/></button><Bi zh="调整词本" fr="Changer de carnet"/></view><text class="move-word">{{ lemma }}</text>
      <NotebookSelection :word="word" v-model="adjustmentSelection" :disabled="working"/>
      <button class="setting-action" hover-class="none" :disabled="working||!adjustmentState.selected" @click="adjust('favorite')"><SuccessIcon name="heart" :active="adjustmentState.favorite" :item-key="'adjust-conj:'+lemma"/><Bi :zh="adjustmentState.favorite?'取消收藏':'收藏'" fr="Favoris"/><Icon :name="adjustmentState.favorite?'check':'plus'"/></button>
      <button v-for="target in targets.filter(t=>t.id!=='known')" :key="target.id" class="setting-action" hover-class="none" :disabled="working||!adjustmentState.selected" @click="adjust(target.id)"><Icon :name="target.icon"/><Bi :zh="target.zh" :fr="target.fr"/><Icon name="arrow"/></button>
      <button class="setting-action" hover-class="none" :disabled="working||!adjustmentState.selected" @click="adjust('imported')"><Icon :name="adjustmentState.imported?'trash':'plus'"/><Bi :zh="adjustmentState.imported?'移出导入本':'加入导入本'" :fr="adjustmentState.imported?'Retirer des mots importés':'Ajouter aux mots importés'"/><Icon name="arrow"/></button>
      <KnownAction :disabled="working||!adjustmentState.selected" @confirm="adjust('known')"/>
    </view></view>
  </view></view>
</template>
<script setup>
import KnownAction from './KnownAction.vue';
import NotebookSelection from './NotebookSelection.vue';
import {defaultNotebookSelection} from '../domain/notebook-adjustment.js';
import SuccessIcon from './SuccessIcon.vue';
import {ref,computed,inject,watch} from 'vue';
import {playKnown} from '../platform/feedback-sounds.js';
import Bi from './Bi.vue';import Icon from './Icon.vue';
import {primaryMeaning} from '../domain/meanings.js';
import {verbMeanings} from '../conjugation/verb-meanings.js';
import {PERSONS,TENSES,conjugations,spokenForm,recording,lemmaFor,isIrregularLemma} from '../conjugation/catalog.js';
const props=defineProps({word:Object,pkg:Object});const emit=defineEmits(['close','audio']);
const actions=inject('conjugationActions',null),moveOpen=ref(false),working=computed(()=>actions?.busy.value),status=computed(()=>actions?.status(props.word,props.pkg,tense.value)||{known:false,favorite:false});
const meaning=computed(()=>primaryMeaning(actions?.original?.(props.word,props.pkg)?.w||props.word)||(verbMeanings[lemma.value]||'').split('；')[0]);
const adjustmentSelection=ref({infinitive:false,tenses:[]});
const adjustmentState=computed(()=>actions?.selectionStatus({p:props.pkg,w:props.word},adjustmentSelection.value)||{selected:0,imported:false,favorite:false});
function openMove(){adjustmentSelection.value=defaultNotebookSelection(props.word,tense.value);moveOpen.value=true;}
async function adjust(target){
 if(working.value||!adjustmentState.value.selected)return;
 if(target==='imported')target=adjustmentState.value.imported?'remove-imported':'add-imported';
 if(await actions.adjust({p:props.pkg,w:props.word},adjustmentSelection.value,target)){if(target!=='favorite')moveOpen.value=false;if(target==='known')playKnown();}
}
function back(){if(moveOpen.value)moveOpen.value=false;else emit('close');}
const targets=[{id:'practice',zh:'待学',fr:'À apprendre',icon:'book'},{id:'review',zh:'复习本',fr:'À réviser',icon:'repeat'},{id:'known',zh:'已会本',fr:'Acquis',icon:'check'}];
async function move(target){if(working.value)return;if(await actions.move(props.word,props.pkg,tense.value,target)){moveOpen.value=false;if(target==='known')playKnown();}}
async function practice(){if(!working.value&&await actions.practice(props.word,props.pkg,tense.value))emit('close');}

const lemma=computed(()=>lemmaFor(props.word));const tense=ref(props.word?.conjugation?.tense||'现在时');const forms=computed(()=>conjugations(lemma.value,tense.value));
const availableTenses=computed(()=>TENSES.filter(t=>Object.keys(conjugations(lemma.value,t.id)).length));
// A new card opens at its learning tense; browsing does not change progress.
watch(()=>[props.word?.id||'',lemma.value,props.word?.conjugation?.tense||''].join('|'),()=>{tense.value=props.word?.conjugation?.tense||'现在时';moveOpen.value=false;});
const personLabel=p=>p==='il'?'il / elle / on':p==='ils'?'ils / elles':p;
</script>
<style scoped>
.conj-action-row{flex-wrap:nowrap;gap:8px;min-width:0}.conj-action-row>.icon{flex:0 0 18px}.conj-action-row .definition-tools{margin-left:0;flex-wrap:nowrap;gap:10px;min-width:0}.conj-action-row .text-button{flex-shrink:0;white-space:nowrap}.conj-action-row>.favorite{margin-left:auto;flex:0 0 36px;width:36px;height:36px}.conj-action-row :deep(.bi){flex-direction:column;align-items:flex-start;gap:2px;white-space:nowrap}.conj-action-row :deep(.bi-fr){font-size:9px}

.conjugation-details{z-index:95}.conj-detail-scroll{min-height:0;flex:1;overflow-y:auto;padding:3px}
.conj-location{overflow:visible!important}.conj-location>.conj-meaning{font-size:14px;line-height:1.6;color:#7c8da5;white-space:normal;overflow:visible;overflow-wrap:anywhere}
.conj-tense-tabs{display:flex;flex-shrink:0;gap:8px;margin:9px 0 16px}.conj-tense-tabs>button{flex:1;min-width:0;padding:12px 7px;border:1px solid #d9e2ee;border-radius:14px;background:#f8faff;box-sizing:border-box;white-space:normal;line-height:1.5}.conj-tense-tabs>button.selected{background:#e7eefb;border-color:#9fb6d9;box-shadow:0 0 0 2px #adc2df22}.conj-tense-tabs :deep(.bi-zh){font-size:11px}.conj-tense-tabs :deep(.bi-fr){font-size:9px}
.conj-person-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:640px;margin:0 auto}.conj-person-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:9px;min-width:0;min-height:115px;padding:17px 16px 27px;border:1px solid #d4dfef;border-radius:18px;background:linear-gradient(145deg,#fff,#f0f5fc);box-shadow:0 4px 12px #617a9e0b,inset 0 1px #fff;box-sizing:border-box;overflow:visible}.conj-person-label{font:14px/1.5 Georgia,serif;color:#93a3bc}.conj-person-form{display:block;max-width:100%;font:22px/1.5 Georgia,serif;color:#526e96;overflow-wrap:anywhere}.conj-person-card>.icon{position:absolute;right:12px;bottom:10px;width:15px;height:15px;color:#8ba3c5}.conj-person-card:disabled{opacity:.58}.conj-person-card:focus-visible{outline:2px solid #9db5d8;outline-offset:3px}
@media(min-width:850px){.conj-person-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:390px){.conj-person-grid{gap:9px}.conj-person-card{min-height:105px;padding:13px 12px 25px}.conj-person-label{font-size:12px}.conj-person-form{font-size:19px}}
</style>
