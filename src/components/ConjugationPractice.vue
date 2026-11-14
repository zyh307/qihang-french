<template>
  <view class="conj-practice">
    <view class="practice-top"><button class="icon-button back-control" hover-class="none" @click="$emit('close')" aria-label="返回 / Retour"><Icon name="back"/></button><view class="practice-location"><Bi zh="变位练习" fr="Conjugaison" small/><text class="muted">{{ groupLabel }}</text></view><text class="practice-count">{{ completedVerbs }} / {{ verbTotal }}</text></view>
    <Transition name="round-step" mode="out-in"><view v-if="(state.done||state.paused)&&!feedback&&!locked" :key="'complete:'+state.engine.cursor" class="completion glass conj-complete"><view class="completion-icon"><Icon name="check"/></view><Bi :zh="state.mode==='review'&&state.done&&todayReviewDone&&!state.engine.deferred_words?.length?'真棒，已完成今日复习':state.engine.deferred_words?.length?(state.done?'本轮结束':'本组结束'):(state.done?'变位练习完成':'本组完成')" :fr="state.mode==='review'&&state.done&&todayReviewDone&&!state.engine.deferred_words?.length?'Bravo, les révisions du jour sont terminées !':state.done?'Terminé':'Série terminée'"/><view class="completion-actions"><button class="button secondary" hover-class="none" @click="$emit('close')"><Bi zh="返回" fr="Retour" small/></button><button v-if="!state.done" class="button primary" hover-class="none" @click="$emit('continue')"><Bi zh="继续练习" fr="Continuer" small/></button></view></view>
    <view v-else-if="q" :key="q.round==='match'?'match:'+q.board.id:'fill:'+q.id" class="exercise-screen">
      <view class="exercise-body">
        <view class="exercise-head"><Bi :zh="q.round==='match'?'人称与变位配对':'写出对应变位'" :fr="q.round==='match'?'Associer':'Écrire la forme'" small/></view>
        <template v-if="q.round==='match'">
          <view class="conj-batch"><view v-for="e in batchVerbs" :key="e.verbe+'|'+e.temps" class="conj-verb" hover-class="none"><text lang="fr">{{ e.verbe }}</text><text class="conj-batch-meaning">{{ e.meaning }}</text><text class="conj-batch-tense">{{ e.temps }}</text></view></view>
          <view class="conj-match-grid"><button v-for="token in layout" :key="q.board.id+token.side+token.key" hover-class="none" :class="['conj-match-card','card-'+token.side,{context:token.side==='left'&&q.board.rule===2,selected:chosen[token.side]===token.key,cleared:gone(token),correct:flash?.correct&&flash[token.side]===token.key,incorrect:flash&&!flash.correct&&flash[token.side]===token.key}]" :disabled="busy||locked||gone(token)" @click="choose(token)" @animationend="pairAnimationEnd" @animationcancel="pairAnimationEnd"><text v-if="token.side==='left'&&q.board.rule===2" class="conj-card-context" lang="fr">{{ cards[token.key].verbe }}</text><text lang="fr">{{ token.side==='left'?(q.board.left_persons?.[token.key]||cards[token.key].personne):cards[token.key].form }}</text></button></view>
        </template>
        <template v-else>
          <view class="exercise-prompt"><text lang="fr">{{ q.verbe }}</text><text class="question-detail">{{ meaningFor(q.verbe) }} · {{ q.temps }}</text></view>
          <view :class="['exercise-entry',{correct:feedback?.correct,incorrect:feedback&&!feedback.correct}]" @click="retry"><text class="given-article">{{ personPrefix }}</text><AnswerInput ref="field" v-model="input" :touch="touch" :active="keyboard" :disabled="busy||locked||!!feedback" @activate="openKeyboard" @keydown="enter"/><Icon v-if="feedback" :name="feedback.correct?'check':'close'"/></view>
          <DesktopAccents v-if="!touch" :disabled="busy||locked||!!feedback" @insert="insertAccent"/>
          <view v-if="feedback" :class="['spelling-result',{correct:feedback.correct}]" role="status"><Icon :name="feedback.correct?'check':'repeat'"/><Bi :zh="feedback.correct?'正确':'再试一次'" :fr="feedback.correct?'Correct':'À revoir'" small/></view>
          <SpellingFeedback v-if="feedback&&!feedback.deferred&&(!feedback.correct||feedback.fuzzy||feedback.formatted)" :diff="diff"/>
        </template>
      </view>
      <view class="exercise-footer question-actions">
        <template v-if="q.round==='fill'"><button class="button secondary" hover-class="none" :disabled="busy||locked||hintPending" @click="inspect({verbe:q.verbe,temps:q.temps})"><Icon name="eye"/><Bi zh="释义" fr="Fiche" small/></button><button v-if="feedback?.correct||feedback?.deferred" class="button primary" hover-class="none" :disabled="busy||locked" @click="continueFill"><Bi zh="继续" fr="Continuer" small/><Icon name="arrow"/></button><button v-else-if="feedback" class="button primary" hover-class="none" :disabled="busy||locked" @click="retry"><Icon name="repeat"/><Bi zh="重试" fr="Réessayer" small/></button><button v-else class="button primary" hover-class="none" :disabled="busy||locked||!input.trim()" @click="submit"><Icon name="check"/><Bi zh="提交" fr="Vérifier" small/></button></template>
        <view v-else class="choice-wait"><Icon name="hand"/><Bi zh="先选人称，再选变位" fr="Associez une personne et une forme." small/></view>
      </view>
    </view></Transition>
    <Transition name="page-fade"><ConjugationDetails v-if="inspecting" :word="inspecting" @close="inspecting=null" @audio="$emit('audio',$event)"/></Transition>
    <Teleport to="body"><FrenchKeyboard v-if="touch&&keyboard&&!feedback&&q?.round==='fill'&&!state.done&&!state.paused&&!inspecting" :disabled="busy||locked||!input.trim()" @input="insert" @delete="erase" @confirm="submit" @close="closeKeyboard"/></Teleport>
  </view>
</template>
<script setup>
import {computed,ref,watch,nextTick,onUnmounted} from 'vue';import Bi from './Bi.vue';import Icon from './Icon.vue';import AnswerInput from './AnswerInput.vue';import DesktopAccents from './DesktopAccents.vue';import FrenchKeyboard from './FrenchKeyboard.vue';import SpellingFeedback from './SpellingFeedback.vue';import ConjugationDetails from './ConjugationDetails.vue';import {cardLayout} from '../conjugation/card-layout.js';import {recording,spokenForm} from '../conjugation/catalog.js';import {spellingDiff} from '../domain/spelling-diff.js';import {conjugationProgress} from '../conjugation/sessions.js';import {playCorrect,playTap} from '../platform/feedback-sounds.js';
const props=defineProps({state:Object,busy:Boolean,todayReviewDone:Boolean});const emit=defineEmits(['close','answer','continue','audio','hint']);const chosen=ref({}),flash=ref(null),locked=ref(false),input=ref(''),feedback=ref(null),field=ref(null),keyboard=ref(false),inspecting=ref(null),hintPending=ref(false);let timer;
const touch=/Android|iPhone|iPad/i.test(navigator.userAgent),q=computed(()=>props.state.viewQuestion),layout=computed(()=>q.value?.board?cardLayout(q.value.board):[]),cards=computed(()=>Object.fromEntries((q.value?.board?.cards||[]).map(c=>[c.key,c]))),batchVerbs=computed(()=>[...new Map((props.state.engine.groups[(q.value?.batch_index||props.state.engine.cursor+1)-1]?.entries||[]).map(e=>[e.verbe+'|'+e.temps,e])).values()]),verbTotal=computed(()=>conjugationProgress(props.state).total),completedVerbs=computed(()=>conjugationProgress(props.state).completed),groupLabel=computed(()=>`第 ${q.value?.batch_index||Math.min(props.state.engine.cursor+1,props.state.engine.groups.length)} / ${props.state.engine.groups.length} 组 · Séries`),diff=computed(()=>feedback.value?spellingDiff(feedback.value.input,feedback.value.expected):[]);
const meaningFor=verb=>props.state.engine.groups.flatMap(g=>g.entries).find(e=>e.verbe===verb&&e.temps===q.value?.temps)?.meaning||'';
const personPrefix=computed(()=>q.value?.personne==='je'&&spokenForm(q.value.verbe,q.value.temps,'je').startsWith('j’')?"j’":q.value?.personne);
const gone=t=>q.value.board['matched_'+t.side].includes(t.key);
function inspect(e){
 if(!q.value||props.busy||locked.value||hintPending.value)return;
 closeKeyboard();
 const id=q.value.id,word={conjugation:{lemma:e.verbe,tense:e.temps||q.value.temps}};
 if(q.value.round==='fill'&&!feedback.value){
  hintPending.value=true;
  emit('hint',id,result=>{hintPending.value=false;if(result?.ok&&q.value?.id===id){input.value='';if(result.deferred)feedback.value={correct:false,deferred:true,expected:result.answer,input:''};inspecting.value=word;}});
 }else inspecting.value=word;
}
function send(body,selection){locked.value=true;emit('answer',{id:q.value.id,...body},result=>{if(!result){locked.value=false;return;}if(result.correct){playCorrect();const phrase=result.spoken;if(phrase)emit('audio',recording(phrase));}flash.value=selection?{...selection,correct:result.correct}:null;feedback.value=result;if(!selection){locked.value=false;closeKeyboard();return;}nextTick(()=>{if(!flash.value)return;if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)finishPair();else timer=setTimeout(finishPair,360);});});}
function finishPair(){if(!flash.value||!locked.value)return;clearTimeout(timer);chosen.value={};flash.value=null;locked.value=false;input.value='';feedback.value=null;emit('continue',true);}
function pairAnimationEnd(event){if(event.target===event.currentTarget&&event.animationName?.includes('conj-pair-'))finishPair();}
function choose(t){if(locked.value||props.busy)return;chosen.value={...chosen.value,[t.side]:chosen.value[t.side]===t.key?null:t.key};if(chosen.value.left&&chosen.value.right)send({person_key:chosen.value.left,form_key:chosen.value.right},{...chosen.value});}
function continueFill(){if(props.busy||locked.value||!(feedback.value?.correct||feedback.value?.deferred))return;feedback.value=null;input.value='';emit('continue',true);}
function submit(){if(locked.value||props.busy||feedback.value||!input.value.trim())return;closeKeyboard();send({answer:field.value?.element?.value??input.value});}
function openKeyboard(){if(!touch||props.busy||locked.value||feedback.value||q.value?.round!=='fill')return;keyboard.value=true;field.value?.focus();}
function closeKeyboard(){keyboard.value=false;field.value?.blur();}
function retry(){if(props.busy||locked.value||feedback.value?.correct||feedback.value?.deferred)return;if(feedback.value&&!feedback.value.correct){feedback.value=null;input.value='';}openKeyboard();}
function insert(text){if(!props.busy&&!locked.value)field.value?.replaceRange(text);}
function insertAccent(text){if(props.busy||locked.value||feedback.value)return;insert(text);field.value?.focus();}
function erase(){if(!props.busy&&!locked.value)field.value?.replaceRange('',true);}
function enter(e){
 if(e.isComposing||e.keyCode===229)return;
 if(e.key==='Enter'){e.preventDefault();e.stopPropagation();submit();return;}
 if(!touch||e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeKeyboard();}
 else if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();e.stopPropagation();if(!props.busy&&!locked.value){playTap();field.value?.replaceRange('',e.key==='Backspace',e.key==='Delete');}}
 else if(e.key?.length===1){e.preventDefault();e.stopPropagation();playTap();insert(e.key);}
}
watch(()=>q.value?[q.value.verbe,q.value.temps,q.value.personne,q.value.round,q.value.board?.id].join('|'):'',()=>{if(!locked.value){input.value='';feedback.value=null;chosen.value={};}});watch(input,()=>{if(input.value&&feedback.value&&!feedback.value.correct){feedback.value=null;}});onUnmounted(()=>{clearTimeout(timer);});
</script>
<style scoped>
.conj-practice{display:flex;flex-direction:column;min-height:0;flex:1;height:100%;gap:12px}
.conj-batch{display:flex;gap:8px;margin:12px 0 18px}
.conj-verb{display:flex;align-items:center;flex-wrap:wrap;gap:5px;flex:1;min-width:0;padding:10px;border:1px solid #dbe4f0;border-radius:13px;background:#f5f8fe;margin:0;text-align:left;box-sizing:border-box}
.conj-verb>text:first-child{font:18px/1.5 Georgia,serif;width:100%;color:#587296;overflow-wrap:anywhere}
.conj-verb:focus-visible{outline:2px solid #9db5d8;outline-offset:3px}
.conj-verb>.conj-batch-meaning{font-size:12px;line-height:1.5;width:100%;color:#7387a6}.conj-verb>.conj-batch-tense{font-size:9px;color:#9cabc1}
.conj-match-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:14px}
.conj-match-card{min-width:0;min-height:64px;padding:11px 6px;border:1px solid #ccd9ec;border-radius:14px;background:#fff;font:18px/1.5 Georgia,serif;text-align:center;color:#526f96;overflow-wrap:anywhere;transition:background-color .1s,border-color .1s,opacity .12s,transform .12s}
.card-right{background:#edf3fb}.conj-match-card:disabled{opacity:1}.conj-match-card:active:not(:disabled){transform:none}.conj-match-card.cleared,.conj-match-card.cleared:disabled{opacity:0;pointer-events:none;transform:scale(.97)}
.conj-match-card.context{padding-top:6px;padding-bottom:6px}.conj-card-context{display:block;font:10px/1.25 Georgia,serif;color:var(--muted);margin-bottom:2px}.conj-match-card.correct{animation:conj-pair-correct .12s ease-out both}.conj-match-card.incorrect{animation:conj-pair-incorrect .16s ease-out both}@keyframes conj-pair-correct{0%{transform:scale(1)}40%{transform:scale(1.025)}100%{transform:scale(.97);opacity:.35}}@keyframes conj-pair-incorrect{0%,100%{transform:translateX(0)}30%{transform:translateX(-2px)}70%{transform:translateX(2px)}}@media(prefers-reduced-motion:reduce){.conj-match-card.correct,.conj-match-card.incorrect{animation:none}}
.conj-match-card.selected{background:#e1eafb;border-color:#8ea9d1}.conj-match-card.correct{background:#e2f2e8;border-color:#94bba4}.conj-match-card.incorrect{background:#f9e8ed;border-color:#dba8b2}.conj-match-card.cleared{visibility:visible}
.conj-complete{margin:auto 0}
@media(max-height:650px){.conj-match-card{min-height:51px;font-size:16px}.conj-batch{margin-bottom:11px}}
</style>
