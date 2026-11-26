<template>
  <view :class="['word-card','glass',{'definition-card':definition}]">
    <view class="word-heading"><view class="word-meaning"><text v-fit-text="2">{{ displayMeaning||meaningOptions[0] }}</text><text class="meaning-pos" :title="cardPartOfSpeech(word)">{{ cardPartOfSpeech(word) }}</text></view><button hover-class="none" v-if="!hideFavorite" class="icon-button favorite" :class="{ marked: favorite }" @click="$emit('favorite', word)" :aria-label="favorite ? '取消收藏 / Retirer des favoris' : '收藏 / Ajouter aux favoris'"><SuccessIcon name="heart" :active="favorite" :item-key="'word:'+(word.lexiconId||word.id)" /></button></view>
    <view v-if="definition&&allowMeaningChoice&&meaningOptions.length>1" ref="meaningPicker" class="primary-meaning-picker"><button class="primary-meaning-toggle" hover-class="none" :disabled="busy" :aria-expanded="meaningPickerOpen" @click="meaningPickerOpen=!meaningPickerOpen"><Bi zh="主释义" fr="Sens principal" small inline/><Icon name="chevron-down" :class="{expanded:meaningPickerOpen}"/></button><Transition name="page-fade"><view v-if="meaningPickerOpen" class="primary-meaning-options"><button v-for="meaning in meaningOptions" :key="meaning" :class="['primary-meaning-choice',{selected:primaryMeaning(word)===meaning}]" hover-class="none" :disabled="busy" :aria-pressed="primaryMeaning(word)===meaning" @click="chooseMeaning(meaning)"><text>{{ meaning }}</text><Icon v-if="primaryMeaning(word)===meaning" name="check"/></button></view></Transition></view>
    <view class="paired-forms">
      <template v-for="(form,index) in word.forms" :key="form.id">
        <text v-if="index" class="form-separator" aria-hidden="true">/</text>
        <view class="paired-form">
          <view class="paired-form-heading"><text v-fit-text="{lines:1,min:10,nowrap:true}" class="french-word" lang="fr">{{ displayForm(word,form) }}</text><button hover-class="none" class="audio-button" :aria-pressed="playing===form.id" :disabled="!form.audioKey" @click="$emit('audio',form)" :aria-label="`播放录音 / Écouter : ${displayForm(word,form)}`"><Icon name="sound" /></button></view>
          <view v-if="form.gender||form.registerLabel||form.questionHint||(!sharedIpa&&form.ipa)" class="form-meta"><text v-if="form.gender" class="gender" :class="form.gender">{{ form.gender === 'm' ? '阳性 · m.' : '阴性 · f.' }}</text><text v-if="form.registerLabel||form.questionHint" class="form-register">{{ form.registerLabel||form.questionHint }}</text><text v-if="form.ipa&&!sharedIpa" class="ipa">{{ form.ipa }}</text></view>
        </view>
      </template>
    </view>
    <text v-if="sharedIpa" class="shared-ipa">{{ sharedIpa }}</text>
    <view v-if="!hideExample&&shared.example?.fr" class="example shared-example"><ExampleSentence class="example-fr" :text="shared.example.fr" :word="word" /><text v-if="shared.example.zh" class="example-zh">{{ shared.example.zh }}</text><view v-if="sentenceRecording||showSource&&sourceText" class="example-footer"><view v-if="showSource&&sourceText" class="source"><Icon name="book" /><text>{{ sourceText }}</text></view><button v-if="sentenceRecording" hover-class="none" class="example-audio" :class="{active:playing===sentenceRecording.id}" @click="$emit('audio',sentenceRecording)" aria-label="播放法语例句 / Écouter la phrase"><Icon name="sound" /><Bi zh="听例句" fr="Écouter" small /></button></view></view><view v-else-if="showSource&&sourceText" class="source"><Icon name="book" /><text>{{ sourceText }}</text></view>
    <view v-if="patternNote&&!definition" class="pattern-note"><Icon name="info" /><text>{{ patternNote }}</text></view>
    <view v-if="definition&&detailedMeanings.length" class="definition-senses"><Bi zh="更多释义" fr="Autres sens" small/><text v-for="(sense,index) in detailedMeanings" :key="sense" lang="zh">{{ index+1 }}. {{ sense }}</text></view><view v-if="actions" class="word-actions"><button hover-class="none" class="text-button single-word-practice" @click="$emit('practice', word)"><Bi :zh="practiceSession&&practiceSession.phase!=='done'?'继续专练':'单词专练'" :fr="practiceSession&&practiceSession.phase!=='done'?'Reprendre ce mot':'Pratiquer ce mot'" inline /></button><button hover-class="none" class="text-button subtle" @click="$emit('move', word)"><Bi zh="调整词本" fr="Changer de carnet" inline /></button></view>
  </view>
</template>
<script setup>
import SuccessIcon from './SuccessIcon.vue';
import {vFitText} from '../platform/fit-text.js';
import {primaryMeaning,primaryMeaningOptions} from '../domain/meanings.js';
import {chineseDefinition} from '../domain/definition-text.js';
import { computed,ref,watch,onMounted,onUnmounted } from 'vue'; import ExampleSentence from './ExampleSentence.vue'; import Icon from './Icon.vue'; import Bi from './Bi.vue';
import { displayForm, sharedExample, exampleAudio, cardPartOfSpeech, equivalentGenderForms } from '../domain/word-display.js';
const props=defineProps({ word: Object, displayMeaning:String, hideFavorite:Boolean, hideExample:Boolean, favorite: Boolean, playing: String, actions: Boolean,practiceSession:Object,definition:Boolean,hideSenses:Boolean,allowMeaningChoice:Boolean,busy:Boolean,sourceLabel:String,showSource:{type:Boolean,default:true} }); const emit=defineEmits(['favorite', 'audio', 'practice', 'move','primary-meaning']);
const meaningPickerOpen=ref(false),meaningPicker=ref(null);
function closeMeaningPicker(event){
 const root=meaningPicker.value?.$el||meaningPicker.value;
 if(event.type==='keydown'){if(event.key==='Escape')meaningPickerOpen.value=false;}
 else if(root&&!root.contains(event.target))meaningPickerOpen.value=false;
}
onMounted(()=>{document.addEventListener('pointerdown',closeMeaningPicker,true);document.addEventListener('keydown',closeMeaningPicker);});
onUnmounted(()=>{document.removeEventListener('pointerdown',closeMeaningPicker,true);document.removeEventListener('keydown',closeMeaningPicker);});
watch(()=>props.word.id,()=>meaningPickerOpen.value=false);
function chooseMeaning(meaning){emit('primary-meaning',meaning);meaningPickerOpen.value=false;}
const patternNote=computed(()=>/两种形式分别考|Deux formes à pratiquer/i.test(props.word.patternNote||'')&&props.word.forms.some(form=>equivalentGenderForms(props.word,form).length>1)?'':props.word.patternNote);
const meaningOptions=computed(()=>primaryMeaningOptions(props.word));
const detailedMeanings=computed(()=>{
 if(props.hideSenses)return [];
 const main=chineseDefinition(meaningOptions.value[0]);
 return [...new Set(meaningOptions.value.slice(1).map(chineseDefinition))].filter(sense=>sense&&sense!==main);
});
const shared=computed(()=>sharedExample(props.word));
const sourceText=computed(()=>{
 const location=props.sourceLabel?.trim()||'',raw=shared.value.source||'';
 const book=location.match(/^INSPIRE\s*([1-4])\b/i),original=raw.match(/^\s*Inspire\s*([1-4])\s*·\s*(L\d+)\b/i);
 if(!book||!original||book[1]!==original[1]||!location.toUpperCase().endsWith(original[2].toUpperCase()))return location;
 const page=raw.match(/\bp\.\s*(\d+(?:\s*[-–]\s*\d+)?)/i);
 return location+(page?' · p. '+page[1]:'');
});
const sentenceRecording=computed(()=>exampleAudio(props.word));
const sharedIpa=computed(()=>{const values=[...new Set(props.word.forms.map(f=>f.ipa).filter(Boolean))];return values.length===1?values[0]:null;});
</script>

<style scoped>
.primary-meaning-picker{position:relative;display:flex;flex-direction:column;gap:8px;margin:12px 0}.primary-meaning-toggle{display:flex;align-items:center;align-self:flex-start;gap:7px;padding:4px 0;min-height:30px;background:transparent;border:0;color:var(--ui-2cf359ada2bb,#8294b0);line-height:1.5}.primary-meaning-toggle>.icon{width:12px;height:12px;transition:transform .18s}.primary-meaning-toggle>.icon.expanded{transform:rotate(180deg)}.primary-meaning-options{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:12;max-height:min(240px,42vh);overflow-y:auto;scrollbar-width:thin;display:flex;flex-direction:column;gap:2px;padding:4px;border:1px solid var(--ui-e0f45ae9678e,#dce4ee);border-radius:14px;background:var(--ui-06543dea30c1,#fff);box-shadow:0 8px 24px var(--ui-06a4d1ca21df,#607b9824)}.primary-meaning-choice{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:10px 12px;border:0;border-radius:10px;background:transparent;color:var(--ui-ac74441efc95,#7387a6);text-align:left;white-space:normal;font-size:12px;line-height:1.6}.primary-meaning-choice.selected{background:var(--ui-11e74bacb7a8,#eef3fb)}.primary-meaning-choice>text{min-width:0;overflow-wrap:anywhere}.primary-meaning-choice>.icon{width:14px;height:14px;flex:none}.primary-meaning-choice:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ui-a268188be8c3,#a4b2e3)}
</style>
