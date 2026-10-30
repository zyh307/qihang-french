<template>
  <view class="practice-panel" @click="closeArticle">
    <Transition :name="definitionVisible?'definition-sheet':motion==='none'?'no-motion':question?.kind==='recognize'?'recognition-sheet':motion==='page'?'word-switch-page':'word-switch-slide'" mode="out-in">
      <DefinitionPanel v-if="definitionVisible" key="definition" ref="definitionCard" :pkg="sourcePkg||pkg" :word="word" :favorite="favorite" :playing="playing" :busy="busy" :allow-known="session.mode!=='errors'" @favorite="$emit('favorite',word)" @audio="$emit('audio',$event)" @known="forwardKnown" @continue="continueDefinition"></DefinitionPanel>
      <view v-else-if="question" :key="question.kind==='spell'?'spell:'+question.wordId+':'+question.formId:'question:'+question.id" class="exercise-screen" :class="{'is-recognition':question.kind==='recognize'}">
        <view class="exercise-body">
          <view class="exercise-head"><Bi :zh="question.kind==='recognize'?'选择中文':'写出法语'" :fr="question.kind==='recognize'?'Choisir le sens':'Écrire le mot'" small /><view v-if="question.kind==='recognize'" class="recognition-audio-controls"><button hover-class="none" class="round-audio" :disabled="!audioForm" @click="$emit('audio',audioForm)" aria-label="播放单词 / Écouter le mot"><Icon name="sound" /></button><button v-if="sentenceRecording" hover-class="none" class="round-audio sentence-audio" @click="$emit('audio',sentenceRecording)" aria-label="播放例句 / Écouter la phrase"><Icon name="phrase" /></button></view></view>
          <view class="exercise-prompt"><text :lang="question.kind==='recognize'?'fr':'zh'">{{ question.kind==='recognize'?displayForm(word,form):word.meanings.join('；') }}</text><text class="question-detail">{{ questionDetail }}<template v-if="form?.questionHint"> · {{ form.questionHint }}</template></text></view>
          <view v-if="question.kind==='recognize'&&example?.fr" class="exercise-context"><ExampleSentence :text="example.fr" :word="word" /></view>
          <view v-if="question.options" class="exercise-options">
            <button v-for="(option,index) in question.options" :key="option.id" hover-class="none" :class="['exercise-option',{correct:session.feedback?.correct&&option.id===word.id,incorrect:question.rejectedIds?.includes(option.id)}]" :disabled="busy||submitted||!!session.feedback||question.rejectedIds?.includes(option.id)" @click="submit(option.id)"><text class="option-letter">{{ String.fromCharCode(65+index) }}</text><text>{{ option.label }}</text><Icon v-if="question.rejectedIds?.includes(option.id)||(session.feedback?.correct&&option.id===word.id)" :name="option.id===word.id?'check':'close'" /></button>
          </view>
          <template v-else>
            <view :class="['exercise-entry',{correct:session.feedback?.correct,incorrect:session.feedback&&!session.feedback.correct}]" @click="retrySpelling"><view v-if="task.mode==='choice'" class="article-picker" @click.stop><button hover-class="none" class="article-trigger" :class="{selected:!!articleSelection}" :disabled="busy||!!session.feedback" :aria-expanded="articleOpen" aria-label="选择冠词 / Choisir un article" @click="toggleArticle"><text v-if="articleSelection">{{ articleSelection }}</text><Bi v-else zh="冠词" fr="Article" small /><Icon name="chevron-down" /></button><Transition name="article-menu"><view v-if="articleOpen" class="article-menu" role="group" aria-label="冠词选项 / Articles"><button v-for="article in task.options" :key="article" hover-class="none" :class="{selected:articleSelection===article}" :aria-pressed="articleSelection===article" @click="selectArticle(article)"><text>{{ article }}</text><Icon v-if="articleSelection===article" name="check" /></button></view></Transition></view><text v-if="task.mode==='given'&&parts.prefix" class="given-article">{{ parts.prefix }}</text><input ref="answerInput" v-model="input" :readonly="useTouchKeyboard" :inputmode="useTouchKeyboard?'none':'text'" lang="fr" :disabled="busy||!!session.feedback" aria-label="法语答案 / Réponse en français" placeholder="" :focus="focusInput" confirm-type="done" :adjust-position="false" @blur="focusInput=false" @focus="openKeyboard" @click.stop="openKeyboard" @keydown="physicalInput" /><button v-if="useTouchKeyboard&&!session.feedback" hover-class="none" class="answer-keyboard-toggle" @mousedown.prevent @click.stop="openKeyboard" aria-label="法语键盘 / Clavier français"><Icon name="keyboard" /></button><Icon v-if="session.feedback" :name="session.feedback.correct?'check':'close'" /></view>
            <view v-if="session.feedback" :class="['spelling-result',{correct:session.feedback.correct}]" role="status"><Icon :name="session.feedback.correct?'check':'repeat'" /><Bi :zh="session.feedback.correct?'正确':'再试一次'" :fr="session.feedback.correct?'Correct':'À revoir'" small /></view>
            <SpellingFeedback v-if="session.feedback?.diff" :diff="session.feedback.diff" />
          </template>
        </view>
        <view class="exercise-footer question-actions">
          <template v-if="question.kind==='spell'">
            <button hover-class="none" class="button secondary hint-icon" :disabled="busy" @click="showHint" :aria-label="session.feedback?'查看释义 / Voir la fiche':'查看提示 / Voir un indice'"><Icon name="eye" /><Bi :zh="session.feedback?'查看':'提示'" :fr="session.feedback?'Voir':'Indice'" small /></button>
            <button v-if="session.feedback?.correct" hover-class="none" class="button primary" :disabled="busy" @click="$emit('next')"><Bi zh="继续" fr="Continuer" small /><Icon name="arrow" /></button>
            <button v-else-if="session.feedback" hover-class="none" class="button primary" :disabled="busy" @click="retrySpelling"><Icon name="repeat" /><Bi zh="重试" fr="Réessayer" small /></button>
            <button v-else hover-class="none" class="button primary" :disabled="busy||submitted||!liveInput.trim()||(task.mode==='choice'&&!articleSelection)" @click="submitSpelling"><Icon name="check" /><Bi zh="提交" fr="Vérifier" small /></button>
          </template>
          <template v-else-if="session.feedback&&(returnedToQuestion||(session.mode==='review'&&session.feedback.correct&&!question.rejectedIds?.length))"><button hover-class="none" class="button secondary" :disabled="busy" @click="showHint"><Icon name="eye" /><Bi zh="释义" fr="Fiche" small /></button><button hover-class="none" class="button primary" :disabled="busy" @click="$emit('next')"><Icon :name="session.feedback.correct?'arrow':'repeat'" /><Bi :zh="session.feedback.correct?'继续':'重试'" :fr="session.feedback.correct?'Continuer':'Réessayer'" small /></button></template>
          <view v-else class="choice-wait" aria-live="polite"><Icon :name="session.feedback?(session.feedback.correct?'check':'close'):'hand'" /><Bi :zh="session.feedback?(session.feedback.correct?'正确':'再看一遍'):'选择一项'" :fr="session.feedback?(session.feedback.correct?'Correct':'À revoir'):'Choisir une réponse'" small /></view>
        </view>
      </view>
    </Transition>
    <Teleport to="body"><Transition name="keyboard-rise"><FrenchKeyboard v-if="useTouchKeyboard&&keyboardOpen&&question?.kind==='spell'&&!session.feedback&&!definitionVisible" :disabled="busy||submitted||!liveInput.trim()||(task.mode==='choice'&&!articleSelection)" @input="insertText" @delete="deleteCharacter" @confirm="submitSpelling" @close="closeKeyboard" /></Transition></Teleport>
  </view>
</template>
<script setup>
import {computed,ref,watch,nextTick,onUnmounted} from 'vue';
import ExampleSentence from './ExampleSentence.vue';
import FrenchKeyboard from './FrenchKeyboard.vue';
import {nativeHost} from '../platform/native.js';
import {playCorrect,playTap} from '../platform/feedback-sounds.js';
import Bi from './Bi.vue';import Icon from './Icon.vue';import DefinitionPanel from './DefinitionPanel.vue';import SpellingFeedback from './SpellingFeedback.vue';
import {displayForm,spellingParts,spellingTask,sharedExample,splitNounArticle,exampleAudio} from '../domain/word-display.js';
const props=defineProps({pkg:Object,sourcePkg:Object,session:Object,word:Object,form:Object,favorite:Boolean,playing:String,busy:Boolean,motion:String,articleMode:String});
const emit=defineEmits(['answer','next','hint','retry-hint','known','favorite','audio','audio-stop']);
const useTouchKeyboard=!!nativeHost()||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const answerInput=ref(null),keyboardOpen=ref(false),draft=ref('');let unbindInput=()=>{};
const input=ref(''),focusInput=ref(false),articleSelection=ref(''),articleOpen=ref(false),submitted=ref(false),choiceReady=ref(false),definitionOpen=ref(false),returnedToQuestion=ref(false),definitionCard=ref(null);let choiceTimer,retryFocus=false;
const question=computed(()=>props.session.question||props.session.feedback?.question);
const liveInput=computed(()=>useTouchKeyboard?input.value:draft.value);
function inputElement(){const root=answerInput.value?.$el||answerInput.value;return root?.matches?.('input')?root:root?.querySelector?.('input');}
watch(answerInput,()=>{
  unbindInput();const field=inputElement();if(!field)return;field.lang='fr';field.readOnly=useTouchKeyboard;field.inputMode=useTouchKeyboard?'none':'text';field.setAttribute('inputmode',useTouchKeyboard?'none':'text');field.autocomplete='off';field.spellcheck=false;field.setAttribute('autocorrect','off');field.setAttribute('autocapitalize','none');
  const capture=()=>draft.value=field.value,end=()=>{input.value=draft.value=field.value;};field.addEventListener('input',capture);field.addEventListener('compositionend',end);unbindInput=()=>{field.removeEventListener('input',capture);field.removeEventListener('compositionend',end);};
},{flush:'post'});
function submitSpelling(){if(!useTouchKeyboard)input.value=draft.value=inputElement()?.value??input.value;submit(input.value);}
function openKeyboard(){closeArticle();if(!useTouchKeyboard||props.busy||props.session.feedback||question.value?.kind!=='spell')return;keyboardOpen.value=true;focusInput.value=true;nextTick(()=>inputElement()?.focus({preventScroll:true}));}
function closeKeyboard(){keyboardOpen.value=false;focusInput.value=false;inputElement()?.blur();}
function replaceRange(text,backwards=false,forwards=false){
  const field=inputElement(),value=input.value;let start=field?.selectionStart??value.length,end=field?.selectionEnd??start;
  if(start===end&&backwards)start=Math.max(0,start-1);if(start===end&&forwards)end=Math.min(value.length,end+1);
  input.value=value.slice(0,start)+text+value.slice(end);
  if(field){field.value=input.value;field.setSelectionRange(start+text.length,start+text.length);}
  nextTick(()=>{if(keyboardOpen.value){field?.focus({preventScroll:true});field?.setSelectionRange(start+text.length,start+text.length);}});
}
function insertText(letter){if(!props.busy&&!props.session.feedback)replaceRange(letter);}
function deleteCharacter(){if(!props.busy&&!props.session.feedback)replaceRange('',true);}
function physicalInput(event){
  if(!useTouchKeyboard){if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();event.stopPropagation();submitSpelling();}return;}
  if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
  if(event.key==='Enter'){event.preventDefault();event.stopPropagation();submitSpelling();}
  else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeKeyboard();}
  else if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();event.stopPropagation();playTap();replaceRange('',event.key==='Backspace',event.key==='Delete');}
  else if(event.key?.length===1){event.preventDefault();event.stopPropagation();playTap();insertText(event.key);}
}
const parts=computed(()=>spellingParts(props.word,props.form));
const task=computed(()=>spellingTask(props.word,props.form,props.articleMode||'choice'));
const example=computed(()=>sharedExample(props.word).example);
const sentenceRecording=computed(()=>exampleAudio(props.word));
const recognitionRecording=computed(()=>sentenceRecording.value||audioForm.value);
const questionDetail=computed(()=>question.value?.kind==='spell'&&['choice','typed'].includes(task.value.mode)&&props.word.forms.length===1?props.word.pos:props.form?.gender?(props.form.gender==='m'?'阳性 · m.':'阴性 · f.'):props.word.sourcePos||props.word.pos);
const audioForm=computed(()=>props.form?.audioKey?props.form:props.word?.forms.find(f=>f.audioKey));
const definitionVisible=computed(()=>definitionOpen.value||props.session.question?.hinted||(props.session.feedback?.questionKind==='recognize'&&choiceReady.value));
watch(()=>props.session.feedback?.question?.id,id=>{clearTimeout(choiceTimer);choiceReady.value=false;definitionOpen.value=false;articleOpen.value=false;returnedToQuestion.value=false;if(id)closeKeyboard();if(id&&props.session.feedback.correct){playCorrect();if(props.session.feedback.questionKind==='spell'&&audioForm.value)emit('audio',audioForm.value);}if(id&&props.session.feedback.questionKind==='recognize'&&!(props.session.mode==='review'&&props.session.feedback.correct&&!props.session.feedback.question.rejectedIds?.length))choiceTimer=setTimeout(()=>choiceReady.value=true,700);},{immediate:true});
watch(()=>props.session.question?.id,id=>{if(id){closeKeyboard();input.value='';draft.value='';articleSelection.value='';articleOpen.value=false;submitted.value=false;returnedToQuestion.value=false;if(retryFocus){retryFocus=false;nextTick(openKeyboard);}}});
const audioScreen=computed(()=>definitionVisible.value?`definition:${question.value?.id}`:question.value?.kind==='recognize'?`recognize:${question.value.id}`:'');
watch(audioScreen,key=>{emit('audio-stop');const recording=definitionVisible.value?audioForm.value:recognitionRecording.value;if(key&&recording)emit('audio',recording);},{immediate:true,flush:'post'});
function closeArticle(){articleOpen.value=false;}
function toggleArticle(){const open=!articleOpen.value;closeKeyboard();articleOpen.value=open;}
function selectArticle(article){articleSelection.value=article;articleOpen.value=false;}
function submit(value){
  closeArticle();
  if(submitted.value||props.busy||props.session.feedback)return;
  if(question.value.kind==='spell'){
    if(!String(value).trim())return;
    if(task.value.mode==='choice'){
      if(!articleSelection.value)return;
      value=articleSelection.value+(/['’]$/.test(articleSelection.value)?'':' ')+splitNounArticle(value).answer;
    }
  }
  if(question.value.kind==='spell')closeKeyboard();
  submitted.value=true;emit('answer',value,()=>submitted.value=false);
}
function showHint(){closeKeyboard();closeArticle();returnedToQuestion.value=false;if(props.session.feedback)definitionOpen.value=true;else emit('hint');}
function retrySpelling(){if(!props.busy&&props.session.feedback&&!props.session.feedback.correct){input.value='';draft.value='';articleSelection.value='';focusInput.value=false;retryFocus=true;closeArticle();emit('next');}}
function continueDefinition(){if(props.session.question?.hinted)emit('retry-hint');else emit('next');}
function forwardKnown(word,done,pkg){emit('known',word,done,pkg);}
function backToQuestion(){
  if(keyboardOpen.value){closeKeyboard();return true;}
  if(articleOpen.value){closeArticle();return true;}
  if(!definitionVisible.value)return false;
  if(props.busy||definitionCard.value?.celebrating)return true;
  clearTimeout(choiceTimer);definitionOpen.value=false;choiceReady.value=false;returnedToQuestion.value=true;
  if(props.session.question?.hinted)emit('retry-hint');
  return true;
}
defineExpose({backToQuestion});
onUnmounted(()=>{unbindInput();clearTimeout(choiceTimer);emit('audio-stop');});
</script>
