<template>
  <view class="practice-panel fade-stage" @click="closeArticle">
    <Transition :name="definitionVisible?'definition-sheet':motion==='none'?'page-fade':question?.kind==='recognize'?'recognition-sheet':motion==='page'?'word-switch-page':'word-switch-slide'" @before-leave="retireFadePane">
      <DefinitionPanel v-if="definitionVisible" key="definition" ref="definitionCard" :pkg="sourcePkg||pkg" :source-label="sourceLabel" :hide-source="session.mode==='review'" :word="word" :favorite="favorite" :playing="playing" :busy="busy" :continue-disabled="errorCooldown" :known="known" :allow-known="session.mode!=='errors'" :allow-remove="false" @remove="removeImported" @primary-meaning="$emit('primary-meaning',$event)" @favorite="$emit('favorite',word)" @audio="$emit('audio',$event)" @known="forwardKnown" @continue="continueDefinition"></DefinitionPanel>
      <view v-else-if="question" :key="question.kind==='spell'?'spell:'+question.wordId+':'+question.formId:'question:'+question.id" class="exercise-screen" :class="{'is-recognition':question.kind==='recognize'}">
        <view class="exercise-body">
          <view class="exercise-head"><Bi :zh="question.kind==='recognize'?'选择中文':'写出法语'" :fr="question.kind==='recognize'?'Choisir le sens':'Écrire le mot'" small /><view v-if="question.kind==='recognize'" class="recognition-audio-controls"><button v-if="sentenceRecording" hover-class="none" class="round-audio sentence-audio" @click="$emit('audio',sentenceRecording)" aria-label="播放例句 / Écouter la phrase"><Icon name="phrase" /></button></view></view>
          <view v-if="question.kind==='spell'" class="exercise-prompt spelling-prompt"><text class="spelling-meaning" lang="zh">{{ questionMeaning(word,form) }}</text><text v-if="questionDetail||questionGender" class="meaning-pos">{{ questionDetail }}<text v-if="questionGender" class="gender-emphasis">{{ ' '+questionGender }}</text></text><text v-if="form?.questionHint" class="question-detail">{{ form.questionHint }}</text><text v-if="spellingInitial" class="question-detail spelling-initial">{{ spellingInitial }}…</text></view>
          <view v-else-if="testsBothGenders(word)" class="exercise-prompt"><text v-fit-text="{lines:1,min:12,nowrap:true}" lang="fr">{{ recognitionForms.map(f=>displayForm(word,f)).join(' / ') }}</text><view class="recognition-genders"><template v-for="(candidate,index) in recognitionForms" :key="candidate.id"><text v-if="index" aria-hidden="true">/</text><text>{{ candidate.gender==='m'?'阳性 · m.':'阴性 · f.' }}</text></template></view></view>
          <view v-else class="exercise-prompt"><text lang="fr">{{ displayForm(word,form) }}</text><text class="question-detail">{{ questionDetail }}<template v-if="form?.questionHint"> · {{ form.questionHint }}</template></text></view>
          <view v-if="question.kind==='recognize'&&example?.fr" class="exercise-context"><ExampleSentence :text="example.fr" :word="word" /></view>
          <view v-if="question.options" class="exercise-options">
            <button v-for="(option,index) in visibleOptions" :key="option.id" hover-class="none" :class="['exercise-option',{correct:session.feedback?.correct&&option.id===word.id,incorrect:question.rejectedIds?.includes(option.id)}]" :disabled="busy||submitted||!canViewOptions&&(!!session.feedback||question.rejectedIds?.includes(option.id))" @click="activateOption(option.id)"><text class="option-letter">{{ String.fromCharCode(65+index) }}</text><text class="option-meaning">{{ question.kind==='recognize'?exerciseGloss(option.label):option.label }}</text><text class="wrong-option-word" :class="{visible:showOptionFrench(option.id),reviewed:session.feedback?.correct&&!question.rejectedIds?.includes(option.id)}" lang="fr">{{ showOptionFrench(option.id)?(option.french||optionWord(option.id)):'' }}</text><Icon v-if="question.rejectedIds?.includes(option.id)||(session.feedback?.correct&&option.id===word.id)" :name="option.id===word.id?'check':'close'" /></button>
          </view>
          <template v-else>
            <view :class="['exercise-entry',{correct:session.feedback?.correct,incorrect:session.feedback&&!session.feedback.correct}]" @click="retrySpelling"><view v-if="task.mode==='choice'" class="article-picker" @click.stop><button hover-class="none" class="article-trigger" :class="{selected:!!articleSelection}" :disabled="busy||!!session.feedback" :aria-expanded="articleOpen" aria-label="选择冠词 / Choisir un article" @click="toggleArticle"><text v-if="articleSelection">{{ articleSelection }}</text><Bi v-else zh="冠词" fr="Article" small /><Icon name="chevron-down" /></button><Transition name="article-menu"><view v-if="articleOpen" class="article-menu" role="group" aria-label="冠词选项 / Articles"><button v-for="article in task.options" :key="article" hover-class="none" :class="{selected:articleSelection===article}" :aria-pressed="articleSelection===article" @click="selectArticle(article)"><text>{{ article }}</text><Icon v-if="articleSelection===article" name="check" /></button></view></Transition></view><text v-if="task.mode==='given'&&parts.prefix" class="given-article">{{ parts.prefix }}</text><AnswerInput ref="answerInput" v-model="input" :touch="useTouchKeyboard" :active="keyboardOpen" :disabled="busy||!!session.feedback" @update:model-value="draft=$event" @activate="openKeyboard" @blur="focusInput=false" @keydown="physicalInput" /><Icon v-if="session.feedback" :name="session.feedback.correct?'check':'close'" /></view>
            <DesktopAccents v-if="!mobile" :disabled="busy||submitted||!!session.feedback" @insert="insertAccent" />
            <view v-if="session.feedback" :class="['spelling-result',{correct:session.feedback.correct}]" role="status"><Icon :name="session.feedback.correct?'check':'repeat'" /><Bi :zh="session.feedback.correct?'正确':'再试一次'" :fr="session.feedback.correct?'Correct':'À revoir'" small /></view>
            <SpellingFeedback v-if="session.feedback?.diff&&!session.feedback.deferred" :diff="session.feedback.diff" />
          </template>

        </view>
        <view class="exercise-footer question-actions">
          <template v-if="session.feedback?.deferred"><button v-if="question.kind==='spell'" hover-class="none" class="button secondary" :disabled="busy" @click="showHint"><Icon name="eye"/><Bi zh="释义" fr="Fiche" small/></button><button hover-class="none" class="button primary" :disabled="busy||errorCooldown" @click="continueQuestion"><Bi zh="继续" fr="Continuer" small/><Icon name="arrow"/></button></template>
          <template v-else-if="question.kind==='spell'"><button hover-class="none" class="button secondary" :disabled="busy||submitted" @click="showHint"><Icon name="eye"/><Bi zh="释义" fr="Fiche" small/></button>
            <button v-if="session.feedback?.correct" hover-class="none" class="button primary" :disabled="busy||errorCooldown" @click="continueQuestion"><Bi zh="继续" fr="Continuer" small /><Icon name="arrow" /></button>
            <button v-else-if="session.feedback" hover-class="none" class="button primary" :disabled="busy||errorCooldown" @click="retrySpelling"><Icon name="repeat" /><Bi zh="重试" fr="Réessayer" small /></button>
            <button v-else hover-class="none" class="button primary" :disabled="busy||submitted||!liveInput.trim()||(task.mode==='choice'&&!articleSelection)" @click="submitSpelling"><Icon name="check" /><Bi zh="提交" fr="Vérifier" small /></button>
          </template>
          <template v-else-if="session.feedback&&(returnedToQuestion||(session.feedback.correct&&!question.rejectedIds?.length))"><button hover-class="none" class="button secondary" :disabled="busy" @click="showHint"><Icon name="eye" /><Bi zh="释义" fr="Fiche" small /></button><button hover-class="none" class="button primary" :disabled="busy||errorCooldown" @click="continueQuestion"><Icon :name="session.feedback.correct?'arrow':'repeat'" /><Bi :zh="session.feedback.correct?'继续':'重试'" :fr="session.feedback.correct?'Continuer':'Réessayer'" small /></button></template>
          <view v-else class="choice-wait" aria-live="polite"><Icon :name="session.feedback?(session.feedback.correct?'check':'close'):'hand'" /><Bi :zh="session.feedback?(session.feedback.correct?'正确':'再看一遍'):'选择一项'" :fr="session.feedback?(session.feedback.correct?'Correct':'À revoir'):'Choisir une réponse'" small /></view>
        </view>
      </view>
    </Transition>
    <Teleport to="body"><Transition name="keyboard-rise"><FrenchKeyboard v-if="useTouchKeyboard&&keyboardOpen&&question?.kind==='spell'&&!session.feedback&&!definitionVisible" :disabled="busy||submitted||!liveInput.trim()||(task.mode==='choice'&&!articleSelection)" @input="insertText" @delete="deleteCharacter" @confirm="submitSpelling" @close="closeKeyboard" /></Transition></Teleport>
  </view>
</template>
<script setup>
import {retireFadePane} from '../platform/page-motion.js';
import {computed,ref,watch,nextTick,onMounted,onUnmounted} from 'vue';
import {useErrorCooldown} from '../platform/use-error-cooldown.js';
import {exerciseGloss,questionMeaning} from '../domain/meanings.js';
import {hasMeaningNuance} from '../domain/meaning-nuances.js';
import ExampleSentence from './ExampleSentence.vue';
import FrenchKeyboard from './FrenchKeyboard.vue';
import AnswerInput from './AnswerInput.vue';
import DesktopAccents from './DesktopAccents.vue';
import {isMobileAnswerDevice} from '../platform/answer-keyboard.js';
import {playCorrect,playTap} from '../platform/feedback-sounds.js';
import Bi from './Bi.vue';import Icon from './Icon.vue';import DefinitionPanel from './DefinitionPanel.vue';import SpellingFeedback from './SpellingFeedback.vue';
import {displayForm,spellingParts,spellingTask,sharedExample,splitNounArticle,exampleAudio,testsBothGenders,cardPartOfSpeech,partOfSpeech,spellingGender} from '../domain/word-display.js';
const props=defineProps({pkg:Object,sourcePkg:Object,sourceLabel:String,session:Object,word:Object,form:Object,favorite:Boolean,known:Boolean,playing:String,busy:Boolean,allowRemove:Boolean,motion:String,articleMode:String,builtInKeyboard:{type:Boolean,default:true},showChoiceFrench:{type:Boolean,default:true}});
const emit=defineEmits(['answer','next','hint','retry-hint','known','favorite','audio','audio-stop','remove','primary-meaning','option-detail']);
const mobile=isMobileAnswerDevice(),useTouchKeyboard=computed(()=>mobile&&props.builtInKeyboard);
let desktopBlockedUntil=0;
function desktopReady(){return mobile||performance.now()>=desktopBlockedUntil;}
function blockDesktopAction(){if(!mobile)desktopBlockedUntil=performance.now()+500;}
const answerInput=ref(null),keyboardOpen=ref(false),draft=ref('');
const input=ref(''),focusInput=ref(false),articleSelection=ref(''),articleOpen=ref(false),submitted=ref(false),choiceReady=ref(false),definitionOpen=ref(false),returnedToQuestion=ref(false),definitionCard=ref(null);let definitionTimer,wrongFeedbackAt=0,retryFocus=false;
const question=computed(()=>props.session.question||props.session.feedback?.question);
const cooldown=useErrorCooldown(),errorCooldown=cooldown.blocked;
watch(()=>props.session.feedback&&!props.session.feedback.correct?props.session.feedback.question?.id:props.session.question?.hinted?props.session.question.id:null,id=>id?cooldown.start():cooldown.clear(),{immediate:true,flush:'sync'});
// The engine validates and fills saved choices together, before display.
const visibleOptions=computed(()=>question.value?.options||[]);
const canViewOptions=computed(()=>question.value?.kind==='recognize'&&props.session.feedback?.correct===true&&!props.session.feedback.deferred);
const showOptionFrench=id=>question.value?.rejectedIds?.includes(id)||props.showChoiceFrench&&props.session.feedback?.correct&&id!==props.word.id;
const liveInput=computed(()=>useTouchKeyboard.value?input.value:draft.value);
function inputElement(){return answerInput.value?.element;}
function submitSpelling(){if(!useTouchKeyboard.value)input.value=draft.value=inputElement()?.value??input.value;submit(input.value);}
function openKeyboard(){closeArticle();if(!useTouchKeyboard.value||props.busy||props.session.feedback||question.value?.kind!=='spell')return;keyboardOpen.value=true;focusInput.value=true;answerInput.value?.focus();}
function closeKeyboard(){keyboardOpen.value=false;focusInput.value=false;inputElement()?.blur();}
watch(useTouchKeyboard,closeKeyboard);
function replaceRange(text,backwards=false,forwards=false){answerInput.value?.replaceRange(text,backwards,forwards);}
function insertText(letter){if(!props.busy&&!props.session.feedback)replaceRange(letter);}
function insertAccent(letter){if(props.busy||submitted.value||props.session.feedback)return;insertText(letter);answerInput.value?.focus();}
function deleteCharacter(){if(!props.busy&&!props.session.feedback)replaceRange('',true);}
function physicalInput(event){
  if(!useTouchKeyboard.value){
    if(mobile&&event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();event.stopPropagation();submitSpelling();}
    return;
  }
  if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
  if(event.key==='Enter'){event.preventDefault();event.stopPropagation();submitSpelling();}
  else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeKeyboard();}
  else if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();event.stopPropagation();playTap();replaceRange('',event.key==='Backspace',event.key==='Delete');}
  else if(event.key?.length===1){event.preventDefault();event.stopPropagation();playTap();insertText(event.key);}
}
const parts=computed(()=>spellingParts(props.word,props.form));
const task=computed(()=>spellingTask(props.word,props.form,props.articleMode||'choice'));
const example=computed(()=>sharedExample(props.word).example);
const recognitionForms=computed(()=>(props.word.forms||[]).filter(f=>f.tested&&['m','f'].includes(f.gender)));
const spellingInitial=computed(()=>props.form?.questionHint||hasMeaningNuance(props.word,questionMeaning(props.word,props.form))?'':question.value?.initialHint||'');
const sentenceRecording=computed(()=>exampleAudio(props.word));
const recognitionRecording=computed(()=>sentenceRecording.value||audioForm.value);
const questionGender=computed(()=>spellingGender(props.word,props.form));
const questionDetail=computed(()=>question.value?.kind==='spell'
  ?partOfSpeech(props.word,props.form,{includeGender:false})
  :cardPartOfSpeech(props.word));
function optionWord(id){const w=[...(props.sourcePkg?.words||[]),...(props.pkg?.words||[])].find(w=>w.id===id||w.origin?.wordId===id);return w?.forms.map(f=>displayForm(w,f)).join(' / ')||'';}
const audioForm=computed(()=>props.form||props.word?.forms.find(f=>f.audioKey));
const definitionVisible=computed(()=>definitionOpen.value||props.session.question?.hinted||(props.session.feedback?.questionKind==='recognize'&&choiceReady.value));
const autoOpensDefinition=computed(()=>{
  const feedback=props.session.feedback;
  return feedback?.questionKind==='recognize'&&!feedback.deferred&&
    (!feedback.correct||!!feedback.question.rejectedIds?.length);
});
function cancelDefinitionTransition(){clearTimeout(definitionTimer);}
function afterFeedback(show,startedAt=wrongFeedbackAt){
  const remaining=startedAt?500-(performance.now()-startedAt):0;
  clearTimeout(definitionTimer);
  if(remaining>0)definitionTimer=setTimeout(show,remaining);else show();
}
watch(()=>props.session.feedback?.question?.id,id=>{
  cancelDefinitionTransition();choiceReady.value=false;definitionOpen.value=false;articleOpen.value=false;returnedToQuestion.value=false;
  const feedback=props.session.feedback;
  wrongFeedbackAt=id&&(!feedback.correct||feedback.question.rejectedIds?.length)?performance.now():0;
  if(!id)return;
  blockDesktopAction();
  closeKeyboard();
  if(feedback.correct){playCorrect();if(feedback.questionKind==='spell'&&audioForm.value)emit('audio',audioForm.value);}
  if(autoOpensDefinition.value)afterFeedback(()=>choiceReady.value=true);
},{immediate:true});
watch(()=>props.session.question?.id,id=>{if(id){closeKeyboard();input.value='';draft.value='';articleSelection.value='';articleOpen.value=false;submitted.value=false;returnedToQuestion.value=false;if(retryFocus){retryFocus=false;nextTick(openKeyboard);}}});
const audioScreen=computed(()=>definitionVisible.value?`definition:${question.value?.id}`:question.value?.kind==='recognize'?`recognize:${question.value.id}`:'');
watch(audioScreen,key=>{emit('audio-stop');const recording=definitionVisible.value?audioForm.value:recognitionRecording.value;if(key&&recording)emit('audio',recording);},{immediate:true,flush:'post'});
function closeArticle(){articleOpen.value=false;}
function toggleArticle(){const open=!articleOpen.value;closeKeyboard();articleOpen.value=open;}
function selectArticle(article){articleSelection.value=article;articleOpen.value=false;}
function activateOption(id){
 if(props.busy||submitted.value)return;
 if(canViewOptions.value){
  cancelDefinitionTransition();
  returnedToQuestion.value=true;
  emit('option-detail',id);
 }else if(!question.value?.rejectedIds?.includes(id))submit(id);
}
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
  blockDesktopAction();submitted.value=true;emit('answer',value,()=>submitted.value=false);
}
function showHint(){if(props.busy||submitted.value)return;closeKeyboard();closeArticle();returnedToQuestion.value=false;if(props.session.feedback)afterFeedback(()=>definitionOpen.value=true);else emit('hint');}
function continueQuestion(){if(!props.busy&&!submitted.value&&cooldown.ready()){blockDesktopAction();emit('next');}}
function retrySpelling(){if(cooldown.ready()&&!props.busy&&props.session.feedback&&!props.session.feedback.correct&&!props.session.feedback.deferred){blockDesktopAction();input.value='';draft.value='';articleSelection.value='';focusInput.value=false;retryFocus=true;closeArticle();emit('next');}}
const definitionContinueBlocked=computed(()=>props.busy||errorCooldown.value||!!definitionCard.value?.celebrating);
function continueDefinition(){
 if(definitionContinueBlocked.value||!cooldown.ready())return false;
 blockDesktopAction();
 if(props.session.question?.hinted)emit('retry-hint');else emit('next');
 return true;
}
function onDesktopEnter(event){
  if(event.key!=='Enter'||event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey||
    document.querySelector('.modal-shade:not(.page-fade-leave-active):not(.dialog-pop-leave-active),.word-preview:not(.page-fade-leave-active),.app-settings-page:not(.page-fade-leave-active)'))return;
  const target=event.target;
  const control=target?.closest?.('button,uni-button,a,[role="button"]');
  const answerField=inputElement();
  if(target?.closest?.('input,textarea,[contenteditable="true"]')&&target!==answerField)return;
  if(event.repeat){event.preventDefault();return;}
  if(articleOpen.value||control&&!control.closest('.exercise-option,.question-actions .primary,.definition-actions .primary'))return;
  let action;
  const feedback=props.session.feedback;
  if(definitionVisible.value){if(definitionCard.value)action=continueDefinition;}
  else if(autoOpensDefinition.value&&!returnedToQuestion.value){event.preventDefault();return;}
  else if(feedback)action=feedback.questionKind==='spell'&&!feedback.correct&&!feedback.deferred?retrySpelling:continueQuestion;
  else if(question.value?.kind==='spell')action=submitSpelling;
  if(!action)return;
  event.preventDefault();event.stopPropagation();
  if(desktopReady()&&!props.busy&&!submitted.value)action();
}
function removeImported(){if(props.busy)return;cancelDefinitionTransition();closeKeyboard();closeArticle();emit('remove',props.word);}
function forwardKnown(word,done,pkg){emit('known',word,done,pkg);}
function backToQuestion(){
  if(definitionCard.value?.closeConjugation?.())return true;
  if(keyboardOpen.value){closeKeyboard();return true;}
  if(articleOpen.value){closeArticle();return true;}
  if(!definitionVisible.value)return false;
  if(props.busy||definitionCard.value?.celebrating)return true;
  cancelDefinitionTransition();definitionOpen.value=false;choiceReady.value=false;returnedToQuestion.value=true;
  if(props.session.question?.hinted)emit('retry-hint');
  return true;
}
defineExpose({backToQuestion,continueDefinition,definitionContinueBlocked});
onMounted(()=>{if(!mobile)document.addEventListener('keydown',onDesktopEnter,true);});
onUnmounted(()=>{if(!mobile)document.removeEventListener('keydown',onDesktopEnter,true);cancelDefinitionTransition();emit('audio-stop');});
</script>
