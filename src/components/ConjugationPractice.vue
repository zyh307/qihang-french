<template>
  <view class="conj-practice">
    <view class="practice-top"><button class="icon-button back-control" hover-class="none" @click="$emit('close')" aria-label="返回 / Retour"><Icon name="back"/></button><view class="practice-location"><Bi zh="变位练习" fr="Conjugaison" small/><text class="muted">{{ groupLabel }}</text></view><text class="practice-count">{{ completedVerbs }} / {{ verbTotal }}</text></view>
    <Transition :name="quietRetry?'no-motion':state.done||state.paused?'round-step':motion==='none'?'no-motion':motion==='page'?'word-switch-page':'word-switch-slide'" mode="out-in"><view v-if="(state.done||state.paused)&&!feedback&&!locked&&!pairBoard" :key="'complete:'+state.engine.cursor" class="completion glass conj-complete"><view class="completion-icon"><Icon name="check"/></view><Bi :zh="state.mode==='review'&&state.done&&todayReviewDone&&!state.engine.deferred_words?.length?'真棒，已完成今日复习':state.engine.deferred_words?.length?(state.done?'本轮结束':'本组结束'):(state.done?'变位练习完成':'本组完成')" :fr="state.mode==='review'&&state.done&&todayReviewDone&&!state.engine.deferred_words?.length?'Bravo, les révisions du jour sont terminées !':state.done?'Terminé':'Série terminée'"/><view class="completion-actions"><button class="button secondary" hover-class="none" @click="$emit('close')"><Bi zh="返回" fr="Retour" small/></button><button v-if="!state.done" class="button primary" hover-class="none" :disabled="busy||errorCooldown" @click="continueRound"><Bi zh="继续练习" fr="Continuer" small/></button></view></view>
    <view v-else-if="q" :key="q.round==='match'?'match:'+q.board.id:'fill:'+q.id" class="exercise-screen">
      <view class="exercise-body">
        <view class="exercise-head"><Bi :zh="q.round==='match'?'人称与变位配对':'写出对应变位'" :fr="q.round==='match'?'Associer':'Écrire la forme'" small/></view>
        <template v-if="q.round==='match'">
          <view class="conj-batch"><view v-for="e in batchVerbs" :key="e.verbe+'|'+e.temps" class="conj-verb" hover-class="none"><text lang="fr">{{ e.verbe }}</text><text class="conj-batch-meaning" lang="zh">{{ meaningFor(e) }}</text><text class="conj-batch-tense">{{ e.temps }}</text></view></view>
          <view class="conj-match-grid"><button v-for="token in layout" :key="q.board.id+token.side+token.key" hover-class="none" :class="['conj-match-card','card-'+token.side,{selected:chosen[token.side]===token.key||pairReserved(token),cleared:gone(token),correct:pairEffect(token)?.correct===true,incorrect:pairEffect(token)?.correct===false}]" :disabled="pairBlocked(token)" @click="choose(token)" @animationend="pairAnimationEnd($event,token)" @animationcancel="pairAnimationEnd($event,token)"><text lang="fr">{{ token.side==='left'?(q.board.left_persons?.[token.key]||cards[token.key].personne):cards[token.key].form }}</text></button></view>
        </template>
        <template v-else>
          <view class="exercise-prompt conjugation-fill-prompt"><text lang="fr">{{ q.verbe }}</text><text v-if="fillMeaning" class="conjugation-fill-meaning" lang="zh">{{ fillMeaning }}</text><text class="question-detail">{{ q.temps }}</text></view>
          <view :class="['exercise-entry',{correct:feedback?.correct,incorrect:feedback&&!feedback.correct}]" @click="retry"><text class="given-article">{{ personPrefix }}</text><AnswerInput ref="field" v-model="input" :touch="touch" :active="keyboard" :disabled="busy||locked||!!feedback" @activate="openKeyboard" @keydown="enter"/><Icon v-if="feedback" :name="feedback.correct?'check':'close'"/></view>
          <DesktopAccents v-if="!mobile" :disabled="busy||locked||!!feedback" @insert="insertAccent"/>
          <view v-if="feedback" :class="['spelling-result',{correct:feedback.correct}]" role="status"><Icon :name="feedback.correct?'check':'repeat'"/><Bi :zh="feedback.correct?'正确':'再试一次'" :fr="feedback.correct?'Correct':'À revoir'" small/></view>
          <SpellingFeedback v-if="feedback&&!feedback.deferred&&(!feedback.correct||feedback.fuzzy||feedback.formatted)" :diff="diff"/>
        </template>
      </view>
      <view class="exercise-footer question-actions">
        <template v-if="q.round==='fill'"><button class="button secondary" hover-class="none" :disabled="busy||locked||hintPending" @click="inspect({verbe:q.verbe,temps:q.temps})"><Icon name="eye"/><Bi zh="释义" fr="Fiche" small/></button><button v-if="feedback?.correct||feedback?.deferred" class="button primary" hover-class="none" :disabled="busy||locked||errorCooldown" @click="continueFill"><Bi zh="继续" fr="Continuer" small/><Icon name="arrow"/></button><button v-else-if="feedback" class="button primary" hover-class="none" :disabled="busy||locked||errorCooldown" @click="retry"><Icon name="repeat"/><Bi zh="重试" fr="Réessayer" small/></button><button v-else class="button primary" hover-class="none" :disabled="busy||locked||!input.trim()" @click="submit"><Icon name="check"/><Bi zh="提交" fr="Vérifier" small/></button></template>
        <view v-else class="choice-wait"><Icon name="hand"/><Bi zh="先选人称，再选变位" fr="Associez une personne et une forme." small/></view>
      </view>
    </view></Transition>
    <Transition name="page-fade"><ConjugationDetails v-if="inspecting" :word="inspecting" @close="inspecting=null" @audio="$emit('audio',$event)"/></Transition>
    <Teleport to="body"><FrenchKeyboard v-if="touch&&keyboard&&!feedback&&q?.round==='fill'&&!state.done&&!state.paused&&!inspecting" :disabled="busy||locked||!input.trim()" @input="insert" @delete="erase" @confirm="submit" @close="closeKeyboard"/></Teleport>
  </view>
</template>
<script setup>
import {useErrorCooldown} from '../platform/use-error-cooldown.js';
import {computed,inject,ref,watch,nextTick,onUnmounted} from 'vue';import Bi from './Bi.vue';import Icon from './Icon.vue';import AnswerInput from './AnswerInput.vue';import DesktopAccents from './DesktopAccents.vue';import FrenchKeyboard from './FrenchKeyboard.vue';import SpellingFeedback from './SpellingFeedback.vue';import ConjugationDetails from './ConjugationDetails.vue';import {cardLayout} from '../conjugation/card-layout.js';import {recording,spokenForm} from '../conjugation/catalog.js';import {primaryMeaning} from '../domain/meanings.js';import {spellingDiff} from '../domain/spelling-diff.js';import {conjugationProgress} from '../conjugation/sessions.js';import {playCorrect,playTap} from '../platform/feedback-sounds.js';
import {isMobileAnswerDevice} from '../platform/answer-keyboard.js';
const props=defineProps({state:Object,busy:Boolean,todayReviewDone:Boolean,motion:String,builtInKeyboard:{type:Boolean,default:true}});const emit=defineEmits(['close','answer','continue','audio','hint']);const chosen=ref({}),locked=ref(false),input=ref(''),feedback=ref(null),field=ref(null),keyboard=ref(false),inspecting=ref(null),hintPending=ref(false);const heldQuestion=ref(null),quietRetry=ref(false),pairBoard=ref(null),pairQueue=ref([]),pairInFlight=ref(null),pairEffects=ref([]);
const cooldown=useErrorCooldown(),errorCooldown=cooldown.blocked;const effectTimers=new Map();let effectSerial=0,disposed=false;
const mobile=isMobileAnswerDevice(),touch=computed(()=>mobile&&props.builtInKeyboard);
const q=computed(()=>heldQuestion.value||pairBoard.value||props.state.viewQuestion),layout=computed(()=>q.value?.board?cardLayout(q.value.board):[]),cards=computed(()=>Object.fromEntries((q.value?.board?.cards||[]).map(c=>[c.key,c]))),batchVerbs=computed(()=>[...new Map((props.state.engine.groups[(q.value?.batch_index||props.state.engine.cursor+1)-1]?.entries||[]).map(e=>[e.verbe+'|'+e.temps,e])).values()]),verbTotal=computed(()=>conjugationProgress(props.state).total),completedVerbs=computed(()=>conjugationProgress(props.state).completed),groupLabel=computed(()=>`第 ${q.value?.batch_index||Math.min(props.state.engine.cursor+1,props.state.engine.groups.length)} / ${props.state.engine.groups.length} 组 · Séries`),diff=computed(()=>feedback.value?spellingDiff(feedback.value.input,feedback.value.expected):[]);
const actions=inject('conjugationActions',null);
const meaningFor=e=>primaryMeaning(actions?.original?.({conjugation:{lemma:e.verbe,tense:e.temps}})?.w)||e.meaning||'';
const fillMeaning=computed(()=>{
 const entry=q.value;
 if(!entry||entry.round!=='fill')return '';
 return meaningFor(batchVerbs.value.find(e=>e.verbe===entry.verbe&&e.temps===entry.temps)||entry);
});
const personPrefix=computed(()=>q.value?.personne==='je'&&spokenForm(q.value.verbe,q.value.temps,'je').startsWith('j’')?"j’":q.value?.personne);
const matched=t=>!!q.value?.board?.['matched_'+t.side]?.includes(t.key);
const pairEffect=t=>pairEffects.value.find(effect=>effect.board===q.value?.board?.id&&effect[t.side]===t.key);
const gone=t=>matched(t)&&!pairEffect(t);
const pairReserved=t=>[...pairQueue.value,...(pairInFlight.value?[pairInFlight.value]:[])].some(pair=>pair.board===q.value?.board?.id&&pair[t.side]===t.key);
const pairBlocked=t=>matched(t)||pairEffects.value.some(effect=>effect.correct&&effect.board===q.value?.board?.id&&effect[t.side]===t.key)||pairReserved(t);
function inspect(e){
 if(!q.value||props.busy||locked.value||hintPending.value)return;
 closeKeyboard();
 const id=q.value.id,word={conjugation:{lemma:e.verbe,tense:e.temps||q.value.temps}};
 if(q.value.round==='fill'&&!feedback.value){
  hintPending.value=true;
  emit('hint',id,result=>{hintPending.value=false;if(result?.ok&&q.value?.id===id){cooldown.start();input.value='';if(result.deferred)feedback.value={correct:false,deferred:true,expected:result.answer,input:''};inspecting.value=word;}});
 }else inspecting.value=word;
}
function answerSound(result){if(result.correct){playCorrect();if(result.spoken)emit('audio',recording(result.spoken));}else cooldown.start();}
function send(body){heldQuestion.value=q.value;locked.value=true;emit('answer',{id:q.value.id,...body},result=>{if(disposed)return;if(!result){heldQuestion.value=null;locked.value=false;return;}answerSound(result);feedback.value=result;locked.value=false;closeKeyboard();});}
function settlePairBoard(){
 const held=pairBoard.value,next=props.state.viewQuestion;if(!held)return;
 if(next?.round==='match'&&next.board.id===held.board.id){pairBoard.value=next;return;}
 // A deferred task or a completed board invalidates only unsubmitted pairs.
 if(pairInFlight.value)return;
 pairQueue.value=[];chosen.value={};
 if(!pairEffects.value.some(effect=>effect.board===held.board.id))pairBoard.value=null;
}
function finishPairEffect(id){
 clearTimeout(effectTimers.get(id));effectTimers.delete(id);pairEffects.value=pairEffects.value.filter(effect=>effect.id!==id);settlePairBoard();drainPairs();
}
function showPairEffect(pair,correct){
 const effect={...pair,correct,id:++effectSerial};pairEffects.value.push(effect);
 // The timer is only a cleanup fallback for the two tiles, never a board lock.
 effectTimers.set(effect.id,setTimeout(()=>finishPairEffect(effect.id),window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?100:180));
}
function pairAnimationEnd(event,token){if(event.target===event.currentTarget&&event.animationName?.includes('conj-pair-')){const effect=pairEffect(token);if(effect)finishPairEffect(effect.id);}}
function drainPairs(){
 if(disposed||pairInFlight.value||props.busy||!pairQueue.value.length)return;
 const current=props.state.viewQuestion,pair=pairQueue.value[0];
 if(current?.round!=='match'||current.board.id!==pair.board){pairQueue.value=[];settlePairBoard();return;}
 pairQueue.value.shift();
 if(current.board.matched_left.includes(pair.left)||current.board.matched_right.includes(pair.right)){drainPairs();return;}
 pairInFlight.value=pair;
 emit('answer',{id:current.id,person_key:pair.left,form_key:pair.right},result=>{
  if(disposed)return;pairInFlight.value=null;
  if(result){answerSound(result);showPairEffect(pair,result.correct);}
  nextTick(()=>{if(!disposed){settlePairBoard();drainPairs();}});
 });
}
function choose(token){
 if(q.value?.round!=='match'||pairBlocked(token))return;
 for(const effect of [...pairEffects.value])if(!effect.correct&&effect[token.side]===token.key)finishPairEffect(effect.id);
 chosen.value={...chosen.value,[token.side]:chosen.value[token.side]===token.key?null:token.key};
 if(chosen.value.left&&chosen.value.right){
  pairBoard.value||=q.value;pairQueue.value.push({...chosen.value,board:q.value.board.id});chosen.value={};drainPairs();
 }
}
function continueRound(){if(!props.busy&&cooldown.ready())emit('continue');}
function continueFill(){if(props.busy||locked.value||!cooldown.ready()||!(feedback.value?.correct||feedback.value?.deferred))return;feedback.value=null;input.value='';heldQuestion.value=null;emit('continue',true);}
function submit(){if(locked.value||props.busy||feedback.value||!input.value.trim())return;closeKeyboard();send({answer:field.value?.element?.value??input.value});}
function openKeyboard(){if(!touch.value||props.busy||locked.value||feedback.value||q.value?.round!=='fill')return;keyboard.value=true;field.value?.focus();}
function closeKeyboard(){keyboard.value=false;field.value?.blur();}
watch(touch,closeKeyboard);
function retry(){if(props.busy||locked.value||!cooldown.ready()||feedback.value?.correct||feedback.value?.deferred)return;if(feedback.value&&!feedback.value.correct){quietRetry.value=true;feedback.value=null;input.value='';heldQuestion.value=null;nextTick(()=>quietRetry.value=false);}openKeyboard();}
function insert(text){if(!props.busy&&!locked.value)field.value?.replaceRange(text);}
function insertAccent(text){if(props.busy||locked.value||feedback.value)return;insert(text);field.value?.focus();}
function erase(){if(!props.busy&&!locked.value)field.value?.replaceRange('',true);}
function enter(e){
 if(e.isComposing||e.keyCode===229)return;
 if(e.key==='Enter'){e.preventDefault();e.stopPropagation();submit();return;}
 if(!touch.value||e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeKeyboard();}
 else if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();e.stopPropagation();if(!props.busy&&!locked.value){playTap();field.value?.replaceRange('',e.key==='Backspace',e.key==='Delete');}}
 else if(e.key?.length===1){e.preventDefault();e.stopPropagation();playTap();insert(e.key);}
}
watch(()=>q.value?q.value.round==='match'?'match:'+q.value.board.id:[q.value.verbe,q.value.temps,q.value.personne,q.value.round].join('|'):'',()=>{if(!locked.value){input.value='';feedback.value=null;chosen.value={};}});watch(input,()=>{if(input.value&&feedback.value&&!feedback.value.correct){feedback.value=null;}});watch([()=>props.busy,()=>props.state.viewQuestion?.id],()=>{settlePairBoard();drainPairs();},{flush:'post'});
onUnmounted(()=>{disposed=true;for(const timer of effectTimers.values())clearTimeout(timer);effectTimers.clear();pairQueue.value=[];});
</script>
<style scoped>
.conj-practice{display:flex;flex-direction:column;min-height:0;flex:1;height:100%;gap:12px}
.conj-batch{display:flex;gap:8px;margin:12px 0 18px}
.conj-verb{display:flex;align-items:center;flex-wrap:wrap;gap:5px;flex:1;min-width:0;padding:10px;border:1px solid var(--ui-24da282e6353,#dbe4f0);border-radius:13px;background:var(--ui-14257323fb44,#f5f8fe);margin:0;text-align:left;box-sizing:border-box}
.conj-verb>text:first-child{font:18px/1.5 Georgia,serif;width:100%;color:var(--ui-c683d6c8b10c,#587296);overflow-wrap:anywhere}
.conj-verb:focus-visible{outline:2px solid var(--ui-c4092ca8e583,#9db5d8);outline-offset:3px}
.conj-verb>.conj-batch-meaning{font-size:12px;line-height:1.5;width:100%;color:var(--ui-ac74441efc95,#7387a6)}.conj-verb>.conj-batch-tense{font-size:9px;color:var(--ui-a1da6d1413f2,#9cabc1)}
.conjugation-fill-prompt>text{display:block;overflow-wrap:anywhere}.conjugation-fill-meaning{margin-top:6px;font-size:16px;line-height:1.5}.conjugation-fill-prompt>.question-detail{margin-top:4px}
.conj-match-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:14px}
.conj-match-card{min-width:0;min-height:64px;padding:11px 6px;border:1px solid var(--ui-8af46712ab7b,#ccd9ec);border-radius:14px;background:var(--ui-06543dea30c1,#fff);font:18px/1.5 Georgia,serif;text-align:center;color:var(--ui-8f2d2b8a5c0b,#526f96);overflow-wrap:anywhere;transition:background-color .1s,border-color .1s,opacity .12s,transform .12s}
.card-right{background:var(--ui-f21d0b1bd79d,#edf3fb)}.conj-match-card:disabled{opacity:1}.conj-match-card:active:not(:disabled){transform:none}.conj-match-card.cleared,.conj-match-card.cleared:disabled{opacity:0;pointer-events:none;transform:scale(.97)}
.conj-match-card.correct{animation:conj-pair-correct .12s ease-out both}.conj-match-card.incorrect{animation:none}@keyframes conj-pair-correct{0%{transform:scale(1)}40%{transform:scale(1.025)}100%{transform:scale(.97);opacity:.35}}@media(prefers-reduced-motion:reduce){.conj-match-card.correct,.conj-match-card.incorrect{animation:none}}
.conj-match-card.selected{background:var(--ui-86392750f2d3,#e1eafb);border-color:var(--ui-cbd42ad11b58,#8ea9d1)}.conj-match-card.correct{background:var(--ui-6b7b9b5eeacb,#e2f2e8);border-color:var(--ui-56eae84357ea,#94bba4)}.conj-match-card.incorrect{background:var(--ui-85051faad215,#f9e8ed);border-color:var(--ui-45120865d840,#dba8b2)}.conj-match-card.cleared{visibility:visible}
.conj-complete{margin:auto 0}
@media(max-height:650px){.conj-match-card{min-height:51px;font-size:16px}.conj-batch{margin-bottom:11px}}
</style>
