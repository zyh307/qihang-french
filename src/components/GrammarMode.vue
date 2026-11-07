<template>
 <view :class="['grammar-mode','grammar-screen-'+screen]">
  <Transition name="grammar-screen" mode="out-in" @before-leave="screenSwitching=true" @after-enter="screenSwitching=false" @enter-cancelled="screenSwitching=false" @leave-cancelled="screenSwitching=false">
   <view :key="screen+(screen==='lesson'?':'+lessonKey+':'+ruleIndex:'')" class="grammar-screen">
  <template v-if="screen==='home'">
   <view class="grammar-home">
    <view class="grammar-head"><view><text class="eyebrow">GRAMMAIRE</text><h1>语法学习<span>Grammaire</span></h1></view></view>
    <view class="glass grammar-home-progress"><view><Bi zh="学习进度" fr="Votre progression" /><strong>{{ stats.done }}<small> / {{ allPoints.length }}</small></strong></view><view class="grammar-home-track"><view :style="{width:(stats.done/allPoints.length*100)+'%'}" /></view></view>
    <button hover-class="none" class="grammar-resume glass" :disabled="!canResume" @click="resume"><Icon name="clock" /><Bi zh="继续" fr="Reprendre" small /><text>{{ continueLabel }}</text><Icon name="arrow" /></button>
    <view class="glass grammar-selection">
     <button hover-class="none" class="grammar-selection-row" @click="enterScreen('books')"><Icon name="book" /><Bi zh="教材" fr="Manuel" small /><text>Inspire 1</text><Icon name="arrow" /></button>
     <button hover-class="none" class="grammar-selection-row" @click="enterScreen('units')"><Icon name="grammar" /><Bi zh="课时" fr="Leçon" small /><text>{{ chosenLesson?lessonName(chosenLesson):'选择课时' }}</text><Icon name="arrow" /></button>
    </view>
    <view class="grammar-home-actions"><button hover-class="none" class="button primary" @click="startLearning"><Icon name="cards" /><Bi zh="开始学习" fr="Apprendre" /></button><button hover-class="none" class="button secondary" :disabled="!mixedPending&&!filteredPool.length" @click="startMixed"><Icon name="list" /><Bi zh="综合练习" fr="Pratique mixte" small /><text v-if="mixedPending" class="grammar-mixed-count">{{ mixedResumeLabel }}</text></button></view>
   </view>
  </template>

  <template v-else-if="screen==='books'">
   <view class="grammar-page-bar"><button hover-class="none" class="icon-button back-control" @click="returnToEntry" aria-label="返回 / Retour"><Icon name="back" /></button><Bi zh="选择教材" fr="Choisir un manuel" /></view>
   <view class="grammar-scroll"><BookPicker :selected="bookId" :lessons="allLessons.length" @select="selectBook" /></view>
  </template>

  <template v-else-if="screen==='units'">
   <view class="grammar-page-bar"><button hover-class="none" class="icon-button back-control" @click="returnToEntry" aria-label="返回 / Retour"><Icon name="back" /></button><Bi zh="选择单元" fr="Choisir une unité" /></view>
   <view class="grammar-scroll grammar-unit-grid"><button v-for="unit in unitChoices" :key="unit.id" hover-class="none" :class="['glass','grammar-unit-card',{selected:unitId===unit.id}]" @click="selectUnit(unit.id)"><Bi :zh="unit.zh" :fr="unit.fr" /><Icon :name="unitId===unit.id?'check':'arrow'" /></button></view>
  </template>

  <template v-else-if="screen==='lessons'">
   <view class="grammar-page-bar"><button hover-class="none" class="icon-button back-control" @click="returnToEntry" aria-label="返回 / Retour"><Icon name="back" /></button><Bi zh="选择课时" fr="Choisir une leçon" /></view>
   <view class="grammar-scroll grammar-lesson-grid">
    <button v-for="lesson in visibleLessons" :key="lesson.key" hover-class="none" :class="['glass','grammar-lesson-card',{selected:chosenLessonKey===lesson.key}]" @click="selectLesson(lesson)">
     <view class="grammar-lesson-heading"><text class="grammar-lesson-key">{{ lesson.id==='Summary'?lesson.unitId+' · Résumé':lesson.id }}</text><Icon :name="chosenLessonKey===lesson.key?'check':lesson.points.length?'grammar':'list'" /></view>
     <text class="grammar-lesson-name" lang="fr">{{ lesson.subtitle||lesson.title }}</text>
     <Bi class="grammar-lesson-meta" :zh="lessonMeta(lesson)" :fr="lesson.kind==='technique'?'Savoir-faire':lesson.kind==='summary'?'Expressions utiles':lesson.points.length+' points'" small />
     <view v-if="lesson.points.length" class="grammar-lesson-meter"><view :style="{width:lessonPct(lesson)+'%'}" /></view>
    </button>
   </view>
  </template>

  <template v-else-if="screen==='overview'&&selectedLesson">
   <view class="grammar-page-bar"><button hover-class="none" class="icon-button back-control" @click="returnToEntry" aria-label="返回 / Retour"><Icon name="back" /></button><view><text class="eyebrow">{{ selectedLesson.unitId.replace('U','UNITÉ ') }} · {{ lessonName(selectedLesson) }}</text><h2>{{ selectedLesson.subtitle||selectedLesson.title }}</h2></view></view>
   <view class="grammar-scroll grammar-overview">
    <Bi zh="本课概览" fr="Vue d’ensemble" small />
    <button v-for="(point,i) in selectedLesson.points" :key="point.id" hover-class="none" class="glass grammar-overview-point" @click="openRule(i)"><text class="grammar-overview-number">{{ String(i+1).padStart(2,'0') }}</text><view><text class="grammar-point-title">{{ point.title }}</text><text class="grammar-overview-fr" lang="fr">{{ point.raw }}</text></view><Icon :name="isMastered(pointStat(point.id))?'check':'arrow'" /></button>
    <button v-if="!selectedLesson.points.length" hover-class="none" class="glass grammar-overview-point" @click="openRule(0)"><Icon name="list"/><Bi :zh="selectedLesson.kind==='technique'?'表达检查清单':'实用句型'" :fr="selectedLesson.kind==='technique'?'Avant de parler':'Expressions utiles'" small/><Icon name="arrow"/></button>
   </view>
   <view v-if="selectedLesson.points.length" class="grammar-actions"><button hover-class="none" class="button secondary" :disabled="!lessonPool.length&&!lessonPending" @click="startLessonPractice"><Bi :zh="lessonPending?'继续课时练习':'课时练习'" :fr="lessonPending?'Reprendre':'Pratiquer'" small/><Icon name="arrow"/></button></view>
  </template>

  <template v-else-if="screen==='lesson'&&selectedLesson">
   <view class="grammar-page-bar"><button hover-class="none" class="icon-button back-control" @click="returnToEntry" aria-label="返回 / Retour"><Icon name="back" /></button><view><text class="eyebrow">{{ selectedLesson.unitId.replace('U','UNITÉ ') }} · {{ selectedLesson.id==='Summary'?'Résumé':selectedLesson.id }}</text><h2>{{ selectedLesson.subtitle||selectedLesson.title }}</h2></view></view>
   <view class="grammar-scroll grammar-detail">
    <view v-for="point in visibleRule" :key="point.id" class="glass grammar-rule-card">
     <view class="grammar-rule-toggle"><view><text class="grammar-point-title">{{ point.title }}</text><text class="muted" lang="fr">{{ point.raw }}</text></view><text class="grammar-point-count">{{ ruleIndex+1 }} / {{ selectedLesson.points.length }}</text></view>
     <Transition name="grammar-fold" v-bind="foldTransition"><view v-if="openRules.includes(point.id)" :id="'grammar-rule-'+point.id"><view class="grammar-rule-body"><text v-for="(rule,i) in point.rules" :key="i" class="grammar-rule-text">{{ rule }}</text><view v-for="(example,i) in point.examples" :key="i" class="grammar-example"><text lang="fr">{{ example[0] }}</text><text>{{ example[1] }}</text></view><view v-if="point.hook" class="grammar-hook">{{ point.hook }}</view></view></view></Transition>
    </view>
    <section v-if="selectedLesson.checklist?.length&&ruleIndex>=selectedLesson.points.length-1" class="glass grammar-reference"><Bi zh="表达检查清单" fr="Avant de parler" /><view v-for="(item,i) in selectedLesson.checklist" :key="i" class="grammar-check-item"><Icon name="check" /><text>{{ item }}</text></view></section>
    <section v-if="selectedLesson.phrases?.length&&ruleIndex>=selectedLesson.points.length-1" class="glass grammar-reference"><Bi zh="实用句型" fr="Expressions utiles" /><view v-for="(phrase,i) in selectedLesson.phrases" :key="i" class="grammar-example"><text lang="fr">{{ phraseFields(phrase).fr }}</text><text>{{ phraseFields(phrase).zh }}</text></view></section>
   </view>
   <view class="grammar-actions"><button v-if="ruleIndex<selectedLesson.points.length-1" class="button primary" @click="nextRule"><Bi zh="下一个语法点" fr="Point suivant" small/><Icon name="arrow"/></button><button v-else-if="selectedLesson.points.length" hover-class="none" class="button primary" :disabled="!lessonPool.length&&!lessonPending" @click="startLessonPractice"><Bi :zh="lessonPending?'继续课时练习':'开始练习'" :fr="lessonPending?'Reprendre':'Pratiquer'" small /><Icon name="arrow" /></button><button v-else hover-class="none" class="button secondary" @click="returnToEntry"><Bi zh="返回概览" fr="Vue d’ensemble" small /><Icon name="back" /></button></view>
  </template>

  <template v-else-if="screen==='quiz'&&current">
   <view class="grammar-page-bar"><button hover-class="none" class="icon-button back-control" @click="leaveQuiz" aria-label="返回 / Retour"><Icon name="back" /></button><view class="quiz-progress"><view :style="{width:(results.length/questions.length*100)+'%'}" /></view><text class="quiz-count">{{ index+1 }} / {{ questions.length }}</text></view>
   <view class="grammar-scroll grammar-question-scroll">
    <Transition name="grammar-question" mode="out-in" @before-leave="questionSwitching=true" @after-enter="questionSwitching=false" @enter-cancelled="questionSwitching=false" @leave-cancelled="questionSwitching=false"><view :key="current.id" class="glass quiz-card">
     <view class="quiz-tag"><Bi :zh="current.type==='translate'?'中译选句':'判断用法'" :fr="current.type==='translate'?'Traduction':'Vrai ou faux'" small /><text>{{ current.lessonId }} · {{ current.point.title }}</text></view>
     <view class="quiz-prompt"><text :class="current.type==='translate'?'prompt-zh':'prompt-fr'" :lang="current.type==='judge'?'fr':'zh'">{{ current.prompt }}</text><Bi :zh="current.type==='translate'?'选出恰当的法语表达':'这句话符合本题用法吗？'" :fr="current.type==='translate'?'Choisissez la bonne phrase.':'Cet emploi est-il correct ?'" small /></view>
     <view class="grammar-options"><button v-for="(option,i) in current.options" :key="option.id" hover-class="none" :class="['grammar-option',optionClass(option)]" :disabled="answered||switching" :aria-pressed="pickedId===option.id" @click="pickedId=option.id"><text class="option-key">{{ 'ABCD'[i] }}</text><text class="option-text" lang="fr">{{ option.text }}</text><view class="grammar-option-status"><Transition name="grammar-mark"><Icon v-if="answered&&(option.correct||pickedId===option.id)" :name="option.correct?'check':'close'" /></Transition></view></button></view>
     <view class="grammar-feedback-slot" aria-live="polite">
      <Transition name="grammar-fold" v-bind="foldTransition"><view v-if="answered"><view :class="['grammar-feedback',lastCorrect?'ok':'no']"><view class="feedback-head"><Icon :name="lastCorrect?'check':'info'" /><Bi :zh="lastCorrect?'答对了':'再看一眼规则'" :fr="lastCorrect?'Correct':'À revoir'" small /></view><view class="feedback-answer"><Bi zh="正确表达" fr="Bonne formulation" small /><text lang="fr">{{ current.answerText }}</text></view><text class="feedback-rule">{{ current.explain }}</text><view v-if="current.point.hook" class="grammar-hook">{{ current.point.hook }}</view></view></view></Transition>
     </view>
    </view></Transition>
   </view>
   <view class="grammar-quiz-dock"><button hover-class="none" class="button primary" :disabled="switching||(!answered&&!pickedId)" @click="answered?next():submit()"><Transition name="grammar-label" mode="out-in"><view :key="answered?(index+1<questions.length?'next':'result'):'submit'" class="grammar-action-label"><Bi :zh="answered?(index+1<questions.length?'下一题':'查看结果'):'确认答案'" :fr="answered?(index+1<questions.length?'Suivant':'Résultat'):'Valider'" small /><Icon v-if="answered" name="arrow" /></view></Transition></button></view>
  </template>

  <template v-else-if="screen==='result'">
   <view class="grammar-page-bar"><button hover-class="none" class="icon-button back-control" @click="returnToEntry" aria-label="返回 / Retour"><Icon name="back" /></button><Bi zh="本轮完成" fr="Série terminée" /></view>
   <view class="grammar-scroll grammar-result-scroll">
    <view class="glass grammar-result-card"><view class="result-ring" :style="{background:'conic-gradient(var(--accent) '+accuracy+'%, #e6ecf6 0)'}"><view class="result-inner"><strong>{{ accuracy }}%</strong><text>{{ correctCount }} / {{ results.length }}</text></view></view><Bi :zh="resultTitle" fr="Chaque exercice compte." /><Bi :zh="'答对 '+correctCount+' 题，共 '+results.length+' 题'" :fr="correctCount+' bonnes réponses sur '+results.length" small /></view>
    <view v-if="wrongList.length" class="glass grammar-result-errors"><Bi :zh="'需要复习 · '+wrongList.length+' 题'" fr="À revoir" /><view v-for="item in wrongList" :key="item.question.id" class="grammar-error-item"><text class="error-prompt">{{ item.question.prompt }}</text><Bi zh="正确表达" fr="Bonne formulation" small /><text lang="fr">{{ item.question.answerText }}</text><text class="muted">{{ item.question.explain }}</text></view></view>
   </view>
   <view class="grammar-actions"><button v-if="wrongList.length" hover-class="none" class="button primary" @click="retryWrong"><Icon name="repeat" /><Bi zh="重练错题" fr="Refaire les erreurs" small /></button><button hover-class="none" class="button secondary" @click="returnToEntry"><Bi zh="返回" fr="Retour" small /></button></view>
  </template>
   </view>
  </Transition>
 </view>
</template>

<script setup>
import {computed,ref,watch,onMounted,onBeforeUnmount} from 'vue';
import Bi from './Bi.vue';import Icon from './Icon.vue';import BookPicker from './BookPicker.vue';
import grammarData from '../grammar/grammar-data.json';
import {buildQuestions,shuffle,normalizeProgress,isMastered} from '../grammar/practice.js';
import {defaultGrammarSettings,normalizeGrammarSettings} from '../grammar/settings.js';
import {encodeRound,decodeRound,roundComplete,rememberRound,mixedForUnit} from '../grammar/sessions.js';
import {playCorrect} from '../platform/feedback-sounds.js';
import {foldTransition} from '../grammar/motion.js';
const props=defineProps({settings:{type:Object,default:()=>({...defaultGrammarSettings})},active:{type:Boolean,default:true}});
const emit=defineEmits(['notice','settings','home']);
const settings=computed(()=>normalizeGrammarSettings(props.settings));
import {grammarRevision,writeGrammarRecord} from '../grammar/storage.js';
const grammarRecordRevision=grammarRevision();
const STORE_KEY='qihang-grammar-progress-v1',ROUND_KEY='qihang-grammar-round-v1';
const units=grammarData.units;
const allLessons=units.flatMap(u=>u.lessons.map(l=>({...l,unitId:u.id,key:u.id+':'+l.id})));
const allPoints=allLessons.flatMap(l=>l.points.map(p=>({...p,lessonId:l.id,unitId:l.unitId})));
const pool=buildQuestions(allPoints),byId=new Map(pool.map(q=>[q.id,q]));
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const progress=ref(normalizeProgress(read(STORE_KEY),allPoints.map(p=>p.id)));
let storageWarning=false;
function persist(key,value){try{writeGrammarRecord(key,value,grammarRecordRevision);}catch{if(!storageWarning){storageWarning=true;emit('notice','本轮记录未能保存，请检查存储空间 / Enregistrement impossible.');}}}
const pointStat=id=>progress.value[id]||{r:0,w:0};
function recordAnswer(pointId,correct){const s=pointStat(pointId);progress.value={...progress.value,[pointId]:{r:s.r+(correct?1:0),w:s.w+(correct?0:1),at:Date.now()}};persist(STORE_KEY,progress.value);}
const bookId=ref('inspire1'),unitId=ref('all'),chosenLessonKey=ref(''),lastStudyKey=ref('');
const screen=ref('home'),lessonKey=ref(''),scopeLabel=ref(''),navigation=ref([]);
const roundKind=ref('lesson'),roundLessonKey=ref(''),cachedRounds=ref({mixed:null,lessons:{}});
const questions=ref([]),index=ref(0),pickedId=ref(''),answered=ref(false),results=ref([]);
const rulePages=ref(read('qihang-grammar-rule-pages')||{});const ruleIndex=ref(0);const visibleRule=computed(()=>selectedLesson.value?.points.slice(ruleIndex.value,ruleIndex.value+1)||[]);
const openRules=ref([]),screenSwitching=ref(false),questionSwitching=ref(false);
const switching=computed(()=>screenSwitching.value||questionSwitching.value);
const selectedLesson=computed(()=>allLessons.find(l=>l.key===lessonKey.value));
const chosenLesson=computed(()=>allLessons.find(l=>l.key===chosenLessonKey.value));
const lastStudyLesson=computed(()=>allLessons.find(l=>l.key===lastStudyKey.value));
function nextRule(){rememberEntry();ruleIndex.value++;rulePages.value[lessonKey.value]=ruleIndex.value;persist('qihang-grammar-rule-pages',rulePages.value);openRules.value=visibleRule.value.map(p=>p.id);}
function toggleRule(id){openRules.value=[id];}
watch(lessonKey,()=>{openRules.value=visibleRule.value.map(p=>p.id);});
watch(screen,value=>{questionSwitching.value=false;emit('home',value==='home');},{immediate:true});
const visibleLessons=computed(()=>allLessons.filter(l=>unitId.value==='all'||l.unitId===unitId.value));
const unitChoices=[{id:'all',zh:'全部单元',fr:'Toutes les unités'},...units.map(u=>({id:u.id,zh:'单元 '+u.id.slice(1),fr:'Unité '+u.id.slice(1)+' · '+u.title}))];
const typeAllowed=q=>settings.value.questionType==='both'||q.type===settings.value.questionType;
const filteredPool=computed(()=>pool.filter(q=>typeAllowed(q)&&(unitId.value==='all'||q.point.unitId===unitId.value)));
const lessonPool=computed(()=>pool.filter(q=>typeAllowed(q)&&selectedLesson.value?.points.some(p=>p.id===q.pointId)));
const mixedRound=computed(()=>decodeRound(mixedForUnit(cachedRounds.value,unitId.value),byId));
const mixedPending=computed(()=>!!mixedRound.value&&!roundComplete(mixedRound.value));
const mixedResumeLabel=computed(()=>mixedPending.value?(mixedRound.value.scopeLabel.replace('Inspire 1 · ','')+' · '+mixedRound.value.results.length+'/'+mixedRound.value.questions.length):'');
const lessonRound=computed(()=>decodeRound(cachedRounds.value.lessons[lessonKey.value],byId));
const lessonPending=computed(()=>!!lessonRound.value&&!roundComplete(lessonRound.value));
const currentPending=computed(()=>questions.value.length>0&&results.value.length<questions.value.length);
const canResume=computed(()=>currentPending.value||!!lastStudyLesson.value);
const continueLabel=computed(()=>currentPending.value?scopeLabel.value+' · '+results.value.length+'/'+questions.value.length:lastStudyLesson.value?lessonName(lastStudyLesson.value):'—');
const stats=computed(()=>({done:allPoints.filter(p=>isMastered(pointStat(p.id))).length}));
function lessonName(l){return l.id==='Summary'?l.unitId+' · Résumé':l.id;}
function lessonPct(l){return l.points.length?Math.round(l.points.filter(p=>isMastered(pointStat(p.id))).length/l.points.length*100):0;}
function lessonMeta(l){if(l.kind==='technique')return '表达检查清单';if(l.kind==='summary')return (l.phrases?.length||0)+' 条实用句型';return l.points.length+' 个语法点 · 已掌握 '+l.points.filter(p=>isMastered(pointStat(p.id))).length;}
function selectBook(id){if(id!=='inspire1')return;bookId.value=id;returnHome();}
function selectUnit(id){if(!unitChoices.some(u=>u.id===id))return;unitId.value=id;if(id!=='all'&&chosenLesson.value?.unitId!==id)chosenLessonKey.value='';enterScreen('lessons');}
function selectLesson(l){chosenLessonKey.value=l.key;unitId.value=l.unitId;returnHome();}
function startLearning(){
 if(!chosenLesson.value){emit('notice','请选择课时 / Choisissez une leçon.');enterScreen('units');return;}
 openLearning(chosenLesson.value);
}
function openLearning(l){saveRound();enterScreen('overview');ruleIndex.value=Math.min(rulePages.value[l.key]||0,Math.max(0,l.points.length-1));lessonKey.value=l.key;lastStudyKey.value=l.key;openRules.value=visibleRule.value.map(p=>p.id);}
function openRule(index){if(!selectedLesson.value)return;enterScreen('lesson');ruleIndex.value=Math.max(0,Math.min(index,selectedLesson.value.points.length-1));rulePages.value[lessonKey.value]=ruleIndex.value;persist('qihang-grammar-rule-pages',rulePages.value);openRules.value=visibleRule.value.map(p=>p.id);}
function phraseFields(p){return /\p{Script=Han}/u.test(p.fr)&&!(/\p{Script=Han}/u.test(p.zh))?{fr:p.zh,zh:p.fr.replace(/^\d+[.、]\s*/,'')}:p;}
function currentRound(){return {kind:roundKind.value,lessonKey:roundLessonKey.value,scopeLabel:scopeLabel.value,questions:questions.value,index:index.value,pickedId:pickedId.value,answered:answered.value,results:results.value};}
// Navigation belongs to the entry point, independently of the saved exercise kind.
function rememberEntry(){
 navigation.value=[...navigation.value,{screen:screen.value,lessonKey:lessonKey.value,ruleIndex:ruleIndex.value,...(['quiz','result'].includes(screen.value)?{round:encodeRound(currentRound())}:{})}].slice(-32);
}
function enterScreen(next){if(screen.value===next)return;rememberEntry();screen.value=next;}
function returnHome(){navigation.value=[];screen.value='home';}
function returnToEntry(){
 if(screen.value==='home')return false;
 saveRound();
 const entry=navigation.value.at(-1);navigation.value=navigation.value.slice(0,-1);
 const fallback=screen.value==='lesson'?'overview':screen.value==='lessons'?'units':'home';
 if(entry){
  const round=entry.round&&decodeRound(entry.round,byId);if(round)applyRound(round);
  if(allLessons.some(l=>l.key===entry.lessonKey))lessonKey.value=entry.lessonKey;
  ruleIndex.value=Math.min(entry.ruleIndex||0,Math.max(0,(selectedLesson.value?.points.length||1)-1));
  openRules.value=visibleRule.value.map(p=>p.id);screen.value=entry.screen;
 }else screen.value=fallback;
 saveRound();return true;
}
function applyRound(round){
 roundKind.value=round.kind;roundLessonKey.value=round.lessonKey;scopeLabel.value=round.scopeLabel;questions.value=round.questions;index.value=round.index;pickedId.value=round.pickedId;answered.value=round.answered;results.value=round.results;
 if(round.kind==='lesson'&&allLessons.some(l=>l.key===round.lessonKey))lessonKey.value=round.lessonKey;
}
function begin(source,label,kind,sourceLessonKey=''){
 if(!source.length){emit('notice','当前范围没有所选题型 / Aucune question de ce type.');return;}
 saveRound();
 enterScreen('quiz');
 const ordered=settings.value.shuffle?shuffle(source):[...source];
 applyRound({kind,lessonKey:sourceLessonKey,scopeLabel:label,questions:ordered.slice(0,settings.value.roundSize).map(q=>({...q,options:settings.value.shuffle?shuffle(q.options):[...q.options]})),index:0,pickedId:'',answered:false,results:[]});
 saveRound();
}
function startMixed(){
 saveRound();const saved=decodeRound(mixedForUnit(cachedRounds.value,unitId.value),byId);
 if(saved&&!roundComplete(saved)){enterScreen('quiz');applyRound(saved);return;}
 begin(filteredPool.value,'Inspire 1 · '+(unitId.value==='all'?'全部单元':unitId.value),'mixed');
}
function startLessonPractice(){
 saveRound();const saved=decodeRound(cachedRounds.value.lessons[lessonKey.value],byId);
 if(saved&&!roundComplete(saved)){enterScreen('quiz');applyRound(saved);return;}
 begin(lessonPool.value,selectedLesson.value?.id||'Leçon','lesson',lessonKey.value);
}
const current=computed(()=>questions.value[index.value]||null);
const lastCorrect=computed(()=>!!current.value?.options.find(o=>o.id===pickedId.value)?.correct);
function optionClass(o){if(!answered.value)return {selected:pickedId.value===o.id};return {correct:o.correct,wrong:!o.correct&&o.id===pickedId.value,dim:!o.correct&&o.id!==pickedId.value};}
function submit(){
 if(switching.value||answered.value||!current.value)return;const option=current.value.options.find(o=>o.id===pickedId.value);if(!option)return;
 answered.value=true;recordAnswer(current.value.pointId,option.correct);results.value.push({question:current.value,pickedId:option.id,correct:option.correct});if(option.correct)playCorrect();
}
function next(){if(switching.value||!answered.value)return;if(index.value+1===questions.value.length){screen.value='result';return;}index.value++;pickedId.value='';answered.value=false;}
function leaveQuiz(){returnToEntry();}
function resume(){if(currentPending.value){enterScreen('quiz');if(roundKind.value==='lesson'&&allLessons.some(l=>l.key===roundLessonKey.value))lessonKey.value=roundLessonKey.value;}else if(lastStudyLesson.value)openLearning(lastStudyLesson.value);}
function retryWrong(){begin(wrongList.value.map(r=>r.question),'错题 · Erreurs','retry');}
const correctCount=computed(()=>results.value.filter(r=>r.correct).length);
const accuracy=computed(()=>results.value.length?Math.round(correctCount.value/results.value.length*100):0);
const wrongList=computed(()=>results.value.filter(r=>!r.correct));
const resultTitle=computed(()=>accuracy.value===100?'本轮全部答对':accuracy.value>=70?'继续巩固，稳步向前':'再看一遍规则，再练一次');
function saveRound(){
 const snapshot=encodeRound(currentRound());cachedRounds.value=rememberRound(cachedRounds.value,snapshot);
 persist(ROUND_KEY,{schema:2,screen:screen.value,navigation:navigation.value,selection:{bookId:bookId.value,unitId:unitId.value,lessonKey:chosenLessonKey.value},lessonKey:lessonKey.value,lastStudyKey:lastStudyKey.value,current:snapshot,sessions:cachedRounds.value});
}
function restoreRound(){
 const saved=read(ROUND_KEY);if(!saved)return;
 if(saved.schema===1){
  const kind=saved.returnScreen==='lesson'?'lesson':/错题|薄弱/.test(saved.scopeLabel||'')?'retry':'mixed';
  const legacy=decodeRound({...saved,kind},byId);
  if(unitChoices.some(u=>u.id===saved.unitId))unitId.value=saved.unitId;
  if(allLessons.some(l=>l.key===saved.lessonKey)){lessonKey.value=saved.lessonKey;chosenLessonKey.value=saved.lessonKey;lastStudyKey.value=saved.lessonKey;}
  if(legacy){applyRound(legacy);cachedRounds.value=rememberRound(cachedRounds.value,encodeRound(legacy));}
 }else if(saved.schema===2){
  const s=saved.selection;if(unitChoices.some(u=>u.id===s?.unitId))unitId.value=s.unitId;
  if(allLessons.some(l=>l.key===s?.lessonKey))chosenLessonKey.value=s.lessonKey;
  if(allLessons.some(l=>l.key===saved.lessonKey))lessonKey.value=saved.lessonKey;
  if(allLessons.some(l=>l.key===saved.lastStudyKey))lastStudyKey.value=saved.lastStudyKey;
  const mixed=decodeRound(saved.sessions?.mixed,byId),lessons={};
  for(const l of allLessons){const round=decodeRound(saved.sessions?.lessons?.[l.key],byId);if(round&&round.kind==='lesson'&&round.lessonKey===l.key)lessons[l.key]=encodeRound(round);}
  cachedRounds.value={mixed:mixed?.kind==='mixed'?encodeRound(mixed):null,lessons,mixedByUnit:saved.sessions?.mixedByUnit||{}};
  const current=decodeRound(saved.current,byId);if(current)applyRound(current);
  ruleIndex.value=Math.min(rulePages.value[lessonKey.value]||0,Math.max(0,(selectedLesson.value?.points.length||1)-1));openRules.value=visibleRule.value.map(p=>p.id);
 }
 if(saved.screen==='quiz'&&questions.value.length)screen.value='quiz';
 else if(saved.screen==='result'&&questions.value.length&&results.value.length===questions.value.length)screen.value='result';
 else if(['lesson','overview'].includes(saved.screen)&&selectedLesson.value)screen.value=saved.screen;
 const routes=Array.isArray(saved.navigation)?saved.navigation:[];
 navigation.value=routes.slice(-32).filter(entry=>{
  if(!entry||!['home','books','units','lessons','overview','lesson','quiz','result'].includes(entry.screen)||!Number.isInteger(entry.ruleIndex)||entry.ruleIndex<0)return false;
  if(['overview','lesson'].includes(entry.screen)&&!allLessons.some(l=>l.key===entry.lessonKey))return false;
  if(['quiz','result'].includes(entry.screen)){const round=decodeRound(entry.round,byId);return !!round&&(entry.screen!=='result'||roundComplete(round));}
  return true;
 });
 if(chosenLesson.value&&unitId.value!=='all'&&chosenLesson.value.unitId!==unitId.value)chosenLessonKey.value='';
}
restoreRound();
watch([screen,navigation,bookId,unitId,chosenLessonKey,lastStudyKey,lessonKey,questions,index,pickedId,answered,results],saveRound,{deep:true});
function handleBack(){return returnToEntry();}
defineExpose({handleBack});
function onKey(e){if(!props.active||switching.value||e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,textarea,[contenteditable=true]')||screen.value!=='quiz')return;const n='abcd'.indexOf(e.key.toLowerCase());if(n>=0&&!answered.value&&current.value?.options[n]){e.preventDefault();pickedId.value=current.value.options[n].id;}else if(e.key==='Enter'&&!e.repeat&&!e.target?.closest?.('button,uni-button,[role=button]')){e.preventDefault();answered.value?next():submit();}}
onMounted(()=>document.addEventListener('keydown',onKey));
onBeforeUnmount(()=>{saveRound();document.removeEventListener('keydown',onKey);});
</script>

<style scoped>
.grammar-home{flex:1;min-height:0;width:100%;max-width:650px;margin:0 auto;display:flex;flex-direction:column;gap:18px;overflow-y:auto;padding:1px 1px 7px}.grammar-home-progress{padding:22px;border-radius:21px}.grammar-home-progress>view:first-child{display:flex;align-items:center;justify-content:space-between;gap:15px}.grammar-home-progress strong{font-size:30px;font-weight:500;color:#6c85aa;white-space:nowrap}.grammar-home-progress small{font-size:14px;color:#9daec7;font-weight:400}.grammar-home-track{height:5px;border-radius:6px;background:#e3eaf6;overflow:hidden;margin-top:18px}.grammar-home-track>view{height:100%;border-radius:inherit;background:#9bb2d5;transition:width .24s}
.grammar-selection{padding:2px 17px;border-radius:20px}.grammar-selection-row{display:flex;align-items:center;gap:13px;width:100%;min-height:67px;padding:10px 0;background:transparent;border:0;text-align:left}.grammar-selection-row+.grammar-selection-row{border-top:1px solid #e1e8f2}.grammar-selection-row>.bi{flex:1}.grammar-selection-row>.icon{width:18px;height:18px;color:#98accb}.grammar-selection-row>text{max-width:52%;font-size:14px;color:#6d86ab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.grammar-home-actions{display:flex;flex-direction:column;gap:11px;margin-top:auto;padding:1px}.grammar-home-actions>.button{width:100%;min-height:53px}.grammar-mixed-count{font-size:11px;color:#92a5bf}.grammar-resume:disabled{opacity:.5}
.grammar-unit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:13px}.grammar-unit-card{padding:22px 19px;display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:93px;text-align:left}.grammar-unit-card:first-child{grid-column:1/-1;min-height:75px}.grammar-unit-card>.icon{width:18px;height:18px;color:#9bafcc}.grammar-unit-card.selected,.grammar-lesson-card.selected{border-color:#a6bcdb;background:#e9f0fc}.grammar-screen-lessons .grammar-lesson-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.grammar-screen{min-height:0;flex:1;display:flex;flex-direction:column;gap:inherit}
.grammar-rule-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0;background:transparent;border:0;text-align:left}.grammar-rule-toggle>view{min-width:0}.grammar-rule-toggle>.icon{transition:transform .22s cubic-bezier(.2,.7,.3,1)}.grammar-rule-toggle[aria-expanded=true]>.icon{transform:rotate(180deg)}
.grammar-option-status{width:18px;height:20px;flex:0 0 18px;display:flex;align-items:center;justify-content:center}.grammar-option-status>.icon{width:18px;height:18px}.grammar-action-label{display:flex;align-items:center;justify-content:center;gap:12px}
.grammar-option,.unit-tab{transition:background-color .18s,border-color .18s,color .18s,box-shadow .18s,opacity .18s}
.grammar-screen-enter-active,.grammar-question-enter-active,.grammar-content-enter-active{transition:opacity .22s cubic-bezier(.2,.7,.3,1),transform .24s cubic-bezier(.2,.7,.3,1);pointer-events:none}.grammar-screen-leave-active,.grammar-question-leave-active,.grammar-content-leave-active{transition:opacity .12s ease-out,transform .12s ease-out;pointer-events:none}.grammar-screen-enter-from,.grammar-question-enter-from,.grammar-content-enter-from{opacity:0;transform:translateY(6px)}.grammar-screen-leave-to,.grammar-question-leave-to,.grammar-content-leave-to{opacity:0;transform:translateY(-3px)}
.grammar-fold-enter-active,.grammar-fold-leave-active{transition:height .24s cubic-bezier(.2,.7,.3,1),opacity .18s ease}
.grammar-label-enter-active,.grammar-label-leave-active{transition:opacity .12s ease}.grammar-label-enter-from,.grammar-label-leave-to{opacity:0}
.grammar-mark-enter-active,.grammar-mark-leave-active{transition:opacity .16s,transform .2s cubic-bezier(.2,.7,.3,1)}.grammar-mark-enter-from,.grammar-mark-leave-to{opacity:0;transform:scale(.8)}
.grammar-mode{height:100%;min-height:0;display:flex;flex-direction:column;gap:17px;width:100%;max-width:1050px;margin:0 auto;padding:8px 25px 24px;overflow:hidden}
.grammar-head,.grammar-page-bar{display:flex;align-items:center;gap:16px;flex-shrink:0}.grammar-head{justify-content:space-between}.grammar-head .eyebrow{margin-bottom:6px}.grammar-head h1{font-size:28px;letter-spacing:-.6px}.grammar-head h1 span{display:inline;font-size:20px;margin-left:13px}.grammar-settings{border:1px solid #dce5f1;background:#ffffffae;width:43px;height:43px;border-radius:15px}.grammar-kpis{display:flex;gap:12px;flex-shrink:0}.grammar-kpis>view{display:flex;align-items:center;gap:17px;flex:1;padding:16px 20px;border-radius:19px}.grammar-kpis strong{font-size:28px;color:#637da7;font-weight:500;white-space:nowrap}.grammar-kpis small{font-size:13px;color:#99abc6;font-weight:400}.grammar-resume{display:flex;align-items:center;gap:12px;padding:12px 17px;min-height:58px;flex-shrink:0;color:#7690b7;border-radius:17px}.grammar-resume .bi{flex:1}.grammar-resume>text{font-size:12px}
.unit-tabs{display:flex;gap:8px;flex-shrink:0;overflow-x:auto;padding-bottom:3px}.unit-tab{flex:1;min-width:68px;padding:9px 13px;border-radius:13px;border:1px solid #dbe4f1;background:#ffffffb8;color:#8c9db8;white-space:nowrap;text-align:center}.unit-tab.active{background:#e7eefb;border-color:#a8bbda;color:#5f7da7}.unit-tab>.bi{align-items:center}
.grammar-scroll{min-height:0;flex:1;overflow-y:auto;overscroll-behavior:contain;padding:1px 1px 8px}.grammar-lesson-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-content:start}.grammar-actions{display:flex;gap:10px;flex-shrink:0;padding:1px}.grammar-actions>.button{flex:1;min-height:51px}.grammar-page-bar>view:not(.quiz-progress){min-width:0}.grammar-page-bar .eyebrow{margin-bottom:3px;letter-spacing:1px}.grammar-page-bar h2{font-size:19px;color:#6e85a8}.grammar-detail{display:flex;flex-direction:column;gap:13px}.grammar-rule-card{border-radius:19px;padding:17px 19px}.grammar-point-title{font-size:14px;line-height:1.65;color:#546c90}.grammar-rule-body{display:flex;flex-direction:column;gap:13px;padding-top:16px}.grammar-rule-text{font-size:13px;line-height:1.9;color:#7687a4}.grammar-example{display:flex;flex-direction:column;gap:5px;padding:13px 15px;background:#edf2fa9c;border-radius:13px;font-size:12px;line-height:1.8;color:#899ab4}.grammar-example>text:first-child{font:17px/1.7 Georgia,serif;color:#607b9f}.grammar-hook{font-size:12px;color:#8f815f;background:#f9f5e9;border-radius:12px;padding:11px 14px;line-height:1.8}.grammar-reference{padding:20px;display:flex;flex-direction:column;gap:14px}.grammar-check-item{display:flex;gap:12px;color:#7c8faa;font-size:13px;line-height:1.8}.grammar-check-item>.icon{width:17px;height:17px;margin-top:4px;color:#8eaaab}
.quiz-progress{flex:1;height:5px;background:#e4eaf5;border-radius:5px;overflow:hidden}.quiz-progress>view{height:100%;background:#99aed4;transition:width .25s}.quiz-count{font-size:12px;color:#8b9cb6}.quiz-card{padding:24px;border-radius:23px}.quiz-tag{display:flex;justify-content:space-between;gap:15px;align-items:center;color:#9aabc3;font-size:11px}.quiz-tag>text{max-width:65%;text-align:right;line-height:1.6}.quiz-prompt{display:flex;flex-direction:column;gap:13px;margin:24px 0}.prompt-zh{font-size:25px;line-height:1.6;color:#506788;font-weight:550}.prompt-fr{font:27px/1.6 Georgia,serif;color:#506788}.grammar-options{display:flex;flex-direction:column;gap:10px}.grammar-option{display:flex;align-items:center;gap:13px;min-height:62px;padding:14px 16px;border-radius:15px;border:1px solid #d9e3f1;background:linear-gradient(145deg,#fff,#f5f8fd);color:#607b9e;text-align:left}.grammar-option:disabled{opacity:1}.option-key{width:25px;height:25px;background:#edf2fa;color:#9aafcc;border-radius:9px;display:grid;place-items:center;font-size:10px;flex-shrink:0}.option-text{flex:1;font-size:16px;line-height:1.6;overflow-wrap:anywhere}.grammar-option>.icon{width:18px;height:18px}.grammar-option.selected{background:#e9f0fc;border-color:#9fb6db}.grammar-option.correct{background:#edf6f1;border-color:#accabb;color:#5b856f}.grammar-option.wrong{background:#fbefef;border-color:#dfb8bc;color:#ab747d}.grammar-option.dim{opacity:.6}
.grammar-feedback-slot{min-height:170px;padding-top:18px}.grammar-feedback{padding:16px 17px;border:1px solid #d9e8e0;border-radius:17px;background:#f1f7f3;display:flex;flex-direction:column;gap:12px;line-height:1.8;color:#6b8b7c}.grammar-feedback.no{background:#faf3f2;border-color:#ead6d8;color:#ab7c83}.feedback-head{display:flex;align-items:center;gap:9px}.feedback-head>.icon{width:17px;height:17px}.feedback-answer{display:flex;flex-direction:column;gap:5px}.feedback-answer>text{font:19px/1.7 Georgia,serif;color:#627f9c}.feedback-rule{font-size:12px;line-height:1.9;color:#7b8ca6}.grammar-quiz-dock{display:flex;justify-content:flex-end;flex-shrink:0;padding:1px}.grammar-quiz-dock>.button{min-width:190px;height:52px}
.grammar-result-card{display:flex;align-items:center;flex-direction:column;gap:15px;text-align:center;padding:32px 20px}.result-ring{width:132px;height:132px;border-radius:50%;display:grid;place-items:center;margin-bottom:7px}.result-inner{width:108px;height:108px;border-radius:50%;background:#f9fbff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px}.result-inner strong{font-size:29px;color:#6c84ac;font-weight:500}.result-inner>text{font-size:12px;color:#9aaac2}.grammar-result-errors{margin-top:16px;padding:21px}.grammar-error-item{display:flex;flex-direction:column;gap:6px;border-top:1px solid #e1e8f1;padding-top:17px;margin-top:17px;font-size:14px;line-height:1.8;color:#708baa}.error-prompt{color:#a17e87;margin-bottom:5px}

@media(max-width:720px){.grammar-mode{padding:7px 16px max(17px,env(safe-area-inset-bottom));gap:12px}.grammar-head h1{font-size:22px}.grammar-head h1 span{font-size:17px;margin-left:10px}.grammar-head .eyebrow{font-size:9px;margin-bottom:3px}.grammar-kpis>view{padding:12px 13px;gap:10px;border-radius:16px}.grammar-kpis strong{font-size:24px}.grammar-kpis small{font-size:10px}.unit-tab{padding:7px 9px;min-width:61px}.grammar-lesson-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.quiz-card{padding:18px 16px}.quiz-tag{align-items:flex-start;gap:10px}.quiz-tag>text{font-size:10px}.quiz-prompt{margin:20px 0;gap:11px}.prompt-zh{font-size:21px}.prompt-fr{font-size:23px}.grammar-option{min-height:58px;padding:12px 13px;gap:10px}.option-text{font-size:15px}.grammar-feedback-slot{min-height:165px}.grammar-feedback{padding:13px}.grammar-quiz-dock>.button{width:100%}.grammar-actions{gap:8px}.grammar-actions>.button{padding:10px 11px}.grammar-rule-card{padding:15px}.grammar-point-title{font-size:13px}.grammar-page-bar h2{font-size:16px}}
@media(prefers-reduced-motion:reduce){.quiz-card{animation:none}.quiz-progress>view{transition:none}}
@media(prefers-reduced-motion:reduce){.grammar-screen-enter-active,.grammar-screen-leave-active,.grammar-question-enter-active,.grammar-question-leave-active,.grammar-content-enter-active,.grammar-content-leave-active,.grammar-fold-enter-active,.grammar-fold-leave-active,.grammar-label-enter-active,.grammar-label-leave-active,.grammar-mark-enter-active,.grammar-mark-leave-active,.grammar-rule-toggle>.icon,.grammar-option,.unit-tab{transition:none}.grammar-screen-enter-from,.grammar-screen-leave-to,.grammar-question-enter-from,.grammar-question-leave-to,.grammar-content-enter-from,.grammar-content-leave-to,.grammar-mark-enter-from,.grammar-mark-leave-to{transform:none}}
@media(max-width:720px){.grammar-home{gap:14px}.grammar-home-progress{padding:19px}.grammar-selection{padding:2px 15px}.grammar-selection-row{min-height:62px;gap:11px}.grammar-home-actions{gap:10px}.grammar-unit-card{padding:18px 15px;min-height:90px}.grammar-unit-card:first-child{min-height:68px}}
@media(prefers-reduced-motion:reduce){.grammar-home-track>view{transition:none}}
.grammar-lesson-grid>.grammar-lesson-card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto 4px;position:relative;border-radius:20px;text-align:left;align-content:start;align-items:start;row-gap:11px;width:100%;min-width:0;height:auto;min-height:158px;margin:0;padding:17px;white-space:normal;line-height:1.6;overflow:hidden}.grammar-lesson-heading{display:grid;grid-template-columns:minmax(0,1fr) 18px;align-items:start;gap:7px;min-width:0;width:100%}.grammar-lesson-heading>.icon{width:17px;height:17px;color:#9aafcd;margin-top:2px}.grammar-lesson-key{display:block;justify-self:start;max-width:100%;padding:3px 7px;font-size:10px;line-height:1.65;letter-spacing:.2px;color:#93a7c5;background:#edf2fa;border-radius:8px;white-space:normal;overflow-wrap:anywhere}.grammar-lesson-name{display:block;min-width:0;max-width:100%;margin:0;padding:0;font-size:14px;font-weight:500;line-height:1.65;white-space:normal;word-break:normal;overflow-wrap:anywhere;color:#607b9f}.grammar-lesson-meta{min-width:0;width:100%;gap:5px}.grammar-lesson-meta :deep(.bi-zh),.grammar-lesson-meta :deep(.bi-fr){display:block;min-width:0;margin:0;line-height:1.65;white-space:normal;word-break:normal;overflow-wrap:anywhere}.grammar-lesson-meta :deep(.bi-zh){font-size:11px}.grammar-lesson-meta :deep(.bi-fr){font-size:10px}.grammar-lesson-meter{height:4px;width:100%;border-radius:5px;background:#e4eaf5;overflow:hidden;align-self:end}.grammar-lesson-meter>view{height:100%;border-radius:inherit;background:#9db3d7;transition:width .24s}
@media(max-width:720px){.grammar-lesson-grid>.grammar-lesson-card{border-radius:17px;padding:13px 10px;row-gap:10px;min-height:151px}.grammar-lesson-name{font-size:12px;line-height:1.7}.grammar-lesson-key{padding:2px 5px;font-size:9px}.grammar-lesson-meta :deep(.bi-zh){font-size:10px;line-height:1.7}.grammar-lesson-meta :deep(.bi-fr){font-size:9px;line-height:1.7}}
@media(prefers-reduced-motion:reduce){.grammar-lesson-meter>view{transition:none}}
.grammar-point-count{flex:none;white-space:nowrap;font-size:11px;color:#98abc5}.grammar-mode :deep(uni-button){box-sizing:border-box;height:auto;line-height:1.6;white-space:normal}.grammar-mode :deep(uni-button::after){border:0}.grammar-rule-toggle>view{display:flex;flex-direction:column;gap:7px}.grammar-rule-card{overflow:visible}.grammar-unit-card .bi,.grammar-lesson-card>text{min-width:0;overflow-wrap:anywhere}
.grammar-overview{display:flex;flex-direction:column;gap:12px}.grammar-overview>.bi{margin:3px 2px 2px}.grammar-overview-point{display:flex;align-items:center;gap:13px;padding:18px;text-align:left;flex-shrink:0;border-radius:18px;min-height:78px}.grammar-overview-point>view,.grammar-overview-point>.bi{min-width:0;flex:1}.grammar-overview-point>view{display:flex;flex-direction:column;gap:5px}.grammar-overview-point>.icon{width:18px;height:18px;flex:none;color:#92a7c4}.grammar-overview-number{font:18px/1.4 Georgia,serif;color:#a0b3cf;flex:none}.grammar-overview-fr{font-size:11px;line-height:1.7;color:#93a5bf;overflow-wrap:anywhere}@media(max-width:720px){.grammar-overview{gap:10px}.grammar-overview-point{padding:14px;min-height:72px;gap:11px}}
</style>