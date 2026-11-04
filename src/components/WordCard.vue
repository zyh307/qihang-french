<template>
  <view :class="['word-card','glass',{'definition-card':definition}]">
    <view class="word-heading"><view class="word-meaning"><text>{{ primaryMeaning(word) }}</text><text class="pos">{{ word.sourcePos || word.pos }}</text></view><button hover-class="none" v-if="!hideFavorite" class="icon-button favorite" :class="{ marked: favorite }" @click="$emit('favorite', word)" :aria-label="favorite ? '取消收藏 / Retirer des favoris' : '收藏 / Ajouter aux favoris'"><Icon name="heart" /></button></view>
    <view v-if="definition&&allowMeaningChoice&&meaningOptions.length>1" ref="meaningPicker" class="primary-meaning-picker"><button class="primary-meaning-toggle" hover-class="none" :disabled="busy" :aria-expanded="meaningPickerOpen" @click="meaningPickerOpen=!meaningPickerOpen"><Bi zh="主释义" fr="Sens principal" small inline/><Icon name="chevron-down" :class="{expanded:meaningPickerOpen}"/></button><Transition name="page-fade"><view v-if="meaningPickerOpen" class="primary-meaning-options"><button v-for="meaning in meaningOptions" :key="meaning" :class="['primary-meaning-choice',{selected:primaryMeaning(word)===meaning}]" hover-class="none" :disabled="busy" :aria-pressed="primaryMeaning(word)===meaning" @click="chooseMeaning(meaning)"><text>{{ meaning }}</text><Icon v-if="primaryMeaning(word)===meaning" name="check"/></button></view></Transition></view>
    <view class="paired-forms">
      <template v-for="(form,index) in word.forms" :key="form.id">
        <text v-if="index" class="form-separator" aria-hidden="true">/</text>
        <view class="paired-form">
          <view class="paired-form-heading"><text class="french-word" lang="fr">{{ displayForm(word,form) }}</text><button hover-class="none" class="audio-button" role="button" :aria-disabled="!form.audioKey" :disabled="!form.audioKey" @click="$emit('audio',form)" :aria-label="`播放录音 / Écouter : ${displayForm(word,form)}`"><Icon name="sound" /></button></view>
          <view v-if="form.gender||!form.tested||(!sharedIpa&&form.ipa)" class="form-meta"><text v-if="form.gender" class="gender" :class="form.gender">{{ form.gender === 'm' ? '阳性 · m.' : '阴性 · f.' }}</text><text v-if="!form.tested" class="display-only">只看不考 · À découvrir</text><text v-if="form.ipa&&!sharedIpa" class="ipa">{{ form.ipa }}</text></view>
          <text class="audio-caption">{{ playing===form.id?'播放中 · Lecture':form.audioKey?'听发音 · Écouter':'暂无录音 · Sans audio' }}</text>
        </view>
      </template>
    </view>
    <text v-if="sharedIpa" class="shared-ipa">{{ sharedIpa }}</text>
    <view v-if="shared.example?.fr" class="example shared-example"><ExampleSentence class="example-fr" :text="shared.example.fr" :word="word" /><text v-if="shared.example.zh" class="example-zh">{{ shared.example.zh }}</text><view class="example-footer"><view v-if="showSource&&(shared.source||sourceLabel)" class="source"><Icon name="book" /><text>{{ sourceText }}</text></view><button hover-class="none" class="example-audio" :class="{active:playing===sentenceRecording?.id}" :disabled="!sentenceRecording" @click="$emit('audio',sentenceRecording)" aria-label="播放法语例句 / Écouter la phrase"><Icon name="sound" /><Bi zh="听例句" fr="Écouter" small /></button></view></view><view v-else-if="showSource&&(shared.source||sourceLabel)" class="source"><Icon name="book" /><text>{{ sourceText }}</text></view>
    <view v-if="word.patternNote&&!definition" class="pattern-note"><Icon name="info" /><text>{{ word.patternNote }}</text></view>
    <view v-if="definition&&detailedMeanings.length" class="definition-senses"><Bi zh="更多释义" fr="Autres sens" small/><text v-for="(sense,index) in detailedMeanings" :key="index">{{ index+1 }}. {{ sense }}</text></view><view v-if="actions" class="word-actions"><button hover-class="none" class="text-button single-word-practice" @click="$emit('practice', word)"><Bi :zh="practiceSession&&practiceSession.phase!=='done'?'继续专练':'单词专练'" :fr="practiceSession&&practiceSession.phase!=='done'?'Reprendre ce mot':'Pratiquer ce mot'" inline /></button><button hover-class="none" class="text-button subtle" @click="$emit('move', word)"><Bi zh="调整词本" fr="Changer de carnet" inline /></button></view>
  </view>
</template>
<script setup>
import {primaryMeaning,primaryMeaningOptions,meaningPoints} from '../domain/meanings.js';
import { computed,ref,watch,onMounted,onUnmounted } from 'vue'; import ExampleSentence from './ExampleSentence.vue'; import Icon from './Icon.vue'; import Bi from './Bi.vue';
import { displayForm, sharedExample, exampleAudio } from '../domain/word-display.js';
const props=defineProps({ word: Object, hideFavorite:Boolean, favorite: Boolean, playing: String, actions: Boolean,practiceSession:Object,definition:Boolean,allowMeaningChoice:Boolean,busy:Boolean,sourceLabel:String,showSource:{type:Boolean,default:true} }); const emit=defineEmits(['favorite', 'audio', 'practice', 'move','primary-meaning']);
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
const meaningOptions=computed(()=>primaryMeaningOptions(props.word));
const detailedMeanings=computed(()=>meaningPoints(props.word).filter(value=>primaryMeaning({meanings:[value]})!==primaryMeaning(props.word)));
const shared=computed(()=>sharedExample(props.word));
const sourceText=computed(()=>[shared.value.source||props.sourceLabel,shared.value.example?.source&&('例句 · Exemple : '+shared.value.example.source)].filter(Boolean).join('；'));
const sentenceRecording=computed(()=>exampleAudio(props.word));
const sharedIpa=computed(()=>{const values=[...new Set(props.word.forms.map(f=>f.ipa).filter(Boolean))];return values.length===1?values[0]:null;});
</script>

<style scoped>
.primary-meaning-picker{position:relative;display:flex;flex-direction:column;gap:8px;margin:12px 0}.primary-meaning-toggle{display:flex;align-items:center;align-self:flex-start;gap:7px;padding:4px 0;min-height:30px;background:transparent;border:0;color:#8294b0;line-height:1.5}.primary-meaning-toggle>.icon{width:12px;height:12px;transition:transform .18s}.primary-meaning-toggle>.icon.expanded{transform:rotate(180deg)}.primary-meaning-options{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:12;max-height:min(240px,42vh);overflow-y:auto;scrollbar-width:thin;display:flex;flex-direction:column;gap:2px;padding:4px;border:1px solid #dce4ee;border-radius:14px;background:#fff;box-shadow:0 8px 24px #607b9824}.primary-meaning-choice{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:10px 12px;border:0;border-radius:10px;background:transparent;color:#7387a6;text-align:left;white-space:normal;font-size:12px;line-height:1.6}.primary-meaning-choice.selected{background:#eef3fb}.primary-meaning-choice>text{min-width:0;overflow-wrap:anywhere}.primary-meaning-choice>.icon{width:14px;height:14px;flex:none}.primary-meaning-choice:focus-visible{outline:none;box-shadow:0 0 0 3px #a4b2e3}
</style>
