<template>
 <view class="app-settings-page">
  <view class="app-settings-inner">
   <view class="picker-heading"><button hover-class="none" class="icon-button back-control" @click="$emit('close')" aria-label="返回 / Retour"><Icon name="back" /></button><view class="page-heading"><h1>设置<span>Réglages</span></h1></view></view>
   <nav class="settings-scope-tabs" aria-label="设置分类 / Catégories">
    <button v-for="item in scopes" :key="item.id" hover-class="none" :class="{active:scope===item.id}" @click="scope=item.id"><Icon :name="item.icon" /><Bi :zh="item.zh" :fr="item.fr" small /></button>
   </nav>
   <Transition name="panel-switch" mode="out-in"><view :key="scope" class="app-settings-section">
    <template v-if="scope==='general'">
     <section class="glass settings-card"><button hover-class="none" class="toggle-row" @click="setting('sounds',data.settings.sounds===false)"><Bi zh="按键与提示音" fr="Sons de l’application" small /><view :class="['toggle',{on:data.settings.sounds!==false}]" /></button><button hover-class="none" class="setting-action" @click="$emit('share')"><Icon name="upload" /><Bi zh="分享学习记录" fr="Partager mes progrès" /><Icon name="arrow" /></button></section>
     <section class="glass settings-card"><button hover-class="none" class="setting-action" :disabled="busy||!dataReady" @click="$emit('backup')"><Icon name="download" /><Bi zh="全部记录备份" fr="Sauvegarder toutes les données" /><Icon name="arrow" /></button><button hover-class="none" class="setting-action" :disabled="busy||!dataReady" @click="$emit('restore')"><Icon name="upload" /><Bi zh="恢复记录" fr="Restaurer les données" /><Icon name="arrow" /></button><Bi zh="手机与电脑通用，可拖入 ZIP 恢复；不含词汇音频。" fr="Compatible mobile et ordinateur. Déposez le ZIP pour restaurer." small /></section>
     <view class="manual-about"><text>{{ appManifest.name }} · {{ appManifest.versionName }}</text><text>Cap sur le français</text></view>
    </template>
    <template v-else-if="scope==='vocabulary'">
     <view v-if="!dataReady" class="empty-state glass"><Bi zh="词汇资料正在读取，请稍后重试。" fr="Chargement du vocabulaire. Réessayez dans un instant." /></view>
     <template v-else>
     <view class="settings-panel-tabs"><button v-for="tab in vocabularyTabs" :key="tab.id" hover-class="none" :class="{active:vocabularySection===tab.id}" @click="vocabularySection=tab.id"><Icon :name="tab.icon" /><Bi :zh="tab.zh" :fr="tab.fr" small /></button></view>
     <Transition name="panel-switch" mode="out-in"><view :key="vocabularySection" class="settings-vocabulary-panel">
     <section v-if="vocabularySection==='study'" class="glass settings-card">
      <view class="setting-row"><Bi zh="每轮词数" fr="Mots par série" small /><text>5</text></view>
      <button hover-class="none" class="toggle-row" @click="setting('shuffleLearning',!data.settings.shuffleLearning)"><Bi zh="课内乱序学习" fr="Mélanger la leçon" small /><view :class="['toggle',{on:data.settings.shuffleLearning}]" /></button>
      <view class="setting-stack"><Bi zh="名词冠词" fr="Articles des noms" small /><view class="segments"><button v-for="item in articles" :key="item.id" hover-class="none" :class="{active:(data.settings.articleMode||'choice')===item.id}" @click="setting('articleMode',item.id)"><Bi :zh="item.zh" :fr="item.fr" small /></button></view></view>
      <view class="setting-stack"><Bi zh="切词动效" fr="Animation" small /><view class="segments"><button v-for="item in motions" :key="item.id" hover-class="none" :class="{active:data.settings.wordMotion===item.id}" @click="setting('wordMotion',item.id)"><Bi :zh="item.zh" :fr="item.fr" small /></button></view></view>
      <view class="setting-row"><Bi zh="每日目标" fr="Objectif quotidien" small /><input :adjust-position="false" class="number-input" type="number" :value="data.settings.dailyGoal" @change="$emit('goal',$event)" aria-label="每日目标 / Objectif quotidien" /></view>
      <button hover-class="none" class="toggle-row" @click="setting('fuzzy',!data.settings.fuzzy)"><Bi zh="模糊识别" fr="Réponse tolérante" small /><view :class="['toggle',{on:data.settings.fuzzy}]" /></button>
     </section>
     <section v-else-if="vocabularySection==='review'" class="glass settings-card">
      <button v-for="item in reviewModes" :key="item.id" hover-class="none" :class="['review-setting',{selected:data.settings.reviewMode===item.id}]" @click="setting('reviewMode',item.id)"><view class="radio"><view v-if="data.settings.reviewMode===item.id" /></view><Bi :zh="item.zh" :fr="item.fr" /></button>
      <button hover-class="none" class="toggle-row" @click="$emit('notifications',data.settings.reviewReminders===false)"><Bi zh="复习提醒" fr="Rappels de révision" small/><view :class="['toggle',{on:data.settings.reviewReminders!==false}]"/></button>
      <button hover-class="none" class="toggle-row" @click="setting('errorReminders',data.settings.errorReminders===false)"><Bi zh="错题提醒（仅软件内）" fr="Erreurs : dans l’application" small/><view :class="['toggle',{on:data.settings.errorReminders!==false}]"/></button>
      <button hover-class="none" class="toggle-row" @click="setting('reviewErrorRetry',data.settings.reviewErrorRetry===false)"><Bi zh="复习答错，次日加练" fr="Erreur en révision : reprise le lendemain" small/><view :class="['toggle',{on:data.settings.reviewErrorRetry!==false}]"/></button>
      <view v-if="data.settings.reviewReminders!==false" class="setting-row"><Bi zh="提醒时间" fr="Heure du rappel" small/><picker mode="time" :value="data.settings.reminderTime||'08:00'" @change="$emit('reminderTime',$event)"><button hover-class="none" class="time-choice"><Icon name="clock"/><text>{{ data.settings.reminderTime||'08:00' }}</text><Icon name="chevron-down"/></button></picker></view>
      <Bi zh="第2、4、7、15、30天复习；之后每30天一次。加练独立计算。" fr="Jours 2, 4, 7, 15 et 30 ; puis tous les 30 jours. Reprises indépendantes." small/>
      <button v-if="data.settings.reviewReminders!==false&&notificationPermission!=='granted'" class="setting-action" hover-class="none" @click="$emit('notifications',true)"><Icon name="clock"/><Bi zh="允许系统通知" fr="Autoriser les notifications" small/><Icon name="arrow"/></button>
      <button v-if="data.settings.reviewReminders!==false&&alarmPermission==='denied'" class="setting-action" hover-class="none" @click="openExactAlarmSettings"><Icon name="clock"/><Bi zh="允许准时提醒" fr="Autoriser les rappels à l’heure" small/><Icon name="arrow"/></button>
      <button v-if="nativeHost()" hover-class="none" class="setting-action" @click="openNotificationSettings"><Icon name="settings"/><Bi zh="系统通知设置" fr="Notifications du système" small/><Icon name="arrow"/></button>
      <template v-if="reminderStatus&&data.settings.reviewReminders!==false">
       <Bi :zh="reminderState.zh" :fr="reminderState.fr" small/>
       <button hover-class="none" class="setting-action" @click="openBackgroundSettings"><Icon name="settings"/><Bi zh="后台运行与自启动" fr="Exécution en arrière-plan" small/><Icon name="arrow"/></button>
       <button v-if="reminderStatus.batteryOptimized" hover-class="none" class="setting-action" @click="openBatterySettings"><Icon name="settings"/><Bi zh="省电限制设置" fr="Économie de batterie" small/><Icon name="arrow"/></button>
       <Bi zh="收不到提醒时，请允许后台运行和自启动。" fr="Si nécessaire, autorisez l’arrière-plan et le démarrage automatique." small/>
      </template>
      <Bi v-if="data.settings.reviewReminders!==false&&backgroundReminderFailed" zh="后台提醒未开启，请重新开启复习提醒。" fr="Réactivez les rappels en arrière-plan." small/>

     </section>
     <section v-else-if="vocabularySection==='data'" class="glass settings-card">
      <button hover-class="none" class="setting-action" @click="$emit('import')"><Icon name="plus" /><Bi zh="导入课次" fr="Importer" /><Icon name="arrow" /></button>
      <button hover-class="none" class="setting-action" :disabled="busy" @click="$emit('backup')"><Icon name="download" /><Bi zh="全部记录备份" fr="Sauvegarder toutes les données" /><Icon name="arrow" /></button>
      <button hover-class="none" class="setting-action" :disabled="busy" @click="$emit('restore')"><Icon name="upload" /><Bi zh="恢复记录" fr="Restaurer les données" /><Icon name="arrow" /></button>
     </section>
     <section v-else class="glass settings-card"><StudyGuide /></section>
     </view></Transition>
     </template>
    </template>
    <template v-else-if="scope==='grammar'">
     <section class="glass settings-card">
      <view class="setting-stack"><Bi zh="每轮题数" fr="Questions par série" small /><view class="segments"><button v-for="count in [5,10,15,20]" :key="count" hover-class="none" :class="{active:grammarSettings.roundSize===count}" @click="grammarSetting('roundSize',count)">{{ count }}</button></view></view>
      <view class="setting-stack"><Bi zh="练习题型" fr="Types de questions" small /><view class="segments grammar-type-choices"><button v-for="item in grammarTypes" :key="item.id" hover-class="none" :class="{active:grammarSettings.questionType===item.id}" @click="grammarSetting('questionType',item.id)"><Bi :zh="item.zh" :fr="item.fr" small /></button></view></view>
      <button hover-class="none" class="toggle-row" @click="grammarSetting('shuffle',!grammarSettings.shuffle)"><Bi zh="乱序出题" fr="Mélanger les questions" small /><view :class="['toggle',{on:grammarSettings.shuffle}]" /></button>
     </section>
     <view class="glass settings-card grammar-quick-help"><Bi zh="选择课次或综合练习，答题后查看规则，再进入下一题。错题可在结果页重新练习。" fr="Choisissez une leçon, répondez puis relisez la règle. Vous pouvez refaire vos erreurs." small /><Bi zh="设置从下一轮生效。" fr="Les réglages s’appliquent à la prochaine série." small /></view>
    </template>
    <OralSetup v-else-if="scope==='oral'" :auto-enter="false" @notice="$emit('notice',$event)" @ready="enterOral" />
   </view></Transition>
  </view>
 </view>
</template>
<script setup>
import {ref,computed,watch,onMounted,onUnmounted} from 'vue';
import Bi from './Bi.vue';import Icon from './Icon.vue';import StudyGuide from './StudyGuide.vue';import OralSetup from './OralSetup.vue';
import appManifest from '../manifest.json';import {nativeHost} from '../platform/native.js';import {notificationAvailable,openNotificationSettings,exactAlarmPermission,openExactAlarmSettings,reviewReminderStatus,openBackgroundSettings,openBatterySettings} from '../platform/notifications.js';
const props=defineProps({data:Object,dataReady:Boolean,busy:Boolean,notificationPermission:String,grammarSettings:Object,initialScope:{type:String,default:'general'}});
const emit=defineEmits(['close','setting','grammarSetting','goal','notifications','reminderTime','import','backup','restore','share','notice','mode']);
const reminderStatus=ref(reviewReminderStatus()),alarmPermission=ref(exactAlarmPermission()),backgroundReminderFailed=ref(window.qihangBackgroundReminderReady===false);
const reminderState=computed(()=>{
 const s=reminderStatus.value;if(!s)return {zh:'',fr:''};
 if(s.notifications!=='granted')return {zh:'尚未允许系统通知',fr:'Notifications non autorisées'};
 if(s.error)return {zh:s.error,fr:''};
 if(!s.hasWords)return {zh:'暂无待复习单词',fr:'Aucun mot à réviser'};
 if(!s.scheduled)return {zh:'提醒尚未安排，请重新开启',fr:'Réactivez les rappels'};
 if(s.backgroundRestricted)return {zh:'后台运行受限',fr:'Arrière-plan limité'};
 if(s.exact!=='granted')return {zh:'提醒已安排，时间可能延迟',fr:'Rappel planifié, retard possible'};
 const at=new Date(s.nextAlarmAt),time=String(at.getHours()).padStart(2,'0')+':'+String(at.getMinutes()).padStart(2,'0');
 return {zh:'提醒已安排 · '+(at.getMonth()+1)+'月'+at.getDate()+'日 '+time,fr:'Rappel planifié · '+at.toLocaleDateString('fr-FR')+' '+time};
});
const refreshPermissions=()=>{alarmPermission.value=exactAlarmPermission();reminderStatus.value=reviewReminderStatus();backgroundReminderFailed.value=window.qihangBackgroundReminderReady===false;};
watch(()=>[props.data.settings.reviewReminders,props.data.settings.reminderTime],refreshPermissions,{flush:'post'});
onMounted(()=>{document.addEventListener('visibilitychange',refreshPermissions);window.addEventListener('qihang-resume',refreshPermissions);});
onUnmounted(()=>{document.removeEventListener('visibilitychange',refreshPermissions);window.removeEventListener('qihang-resume',refreshPermissions);});
const scope=ref(props.initialScope),vocabularySection=ref('study');
const scopes=[{id:'general',icon:'settings',zh:'通用',fr:'Général'},{id:'vocabulary',icon:'book',zh:'词汇',fr:'Vocabulaire'},{id:'grammar',icon:'grammar',zh:'语法',fr:'Grammaire'},{id:'oral',icon:'microphone',zh:'口语',fr:'Expression orale'}];
const vocabularyTabs=[{id:'study',icon:'book',zh:'学习',fr:'Étude'},{id:'review',icon:'repeat',zh:'复习',fr:'Révision'},{id:'data',icon:'upload',zh:'资料',fr:'Données'},{id:'guide',icon:'info',zh:'帮助',fr:'Aide'}];
const articles=[{id:'choice',zh:'选择冠词',fr:'Choisir'},{id:'typed',zh:'自行填写',fr:'Écrire'}];
const motions=[{id:'slide',zh:'滑动',fr:'Glisser'},{id:'page',zh:'翻页',fr:'Tourner'},{id:'none',zh:'关闭',fr:'Aucune'}];
const reviewModes=[{id:'both',zh:'认义＋填空',fr:'Sens + écrit'},{id:'spelling',zh:'只做填空',fr:'Écrit seul'}];
const grammarTypes=[{id:'both',zh:'全部',fr:'Tous'},{id:'translate',zh:'中译选句',fr:'Traduction'},{id:'judge',zh:'判断用法',fr:'Vrai ou faux'}];
function setting(key,value){if(!props.dataReady){emit('notice','请等待词汇资料读取完成 / Attendez la fin du chargement.');return;}emit('setting',key,value);}
function grammarSetting(key,value){emit('grammarSetting',key,value);}
function enterOral(){localStorage.setItem('qihang-oral-prepared-v2','1');emit('mode','oral');}
</script>
<style scoped>
.settings-scope-tabs>button,.settings-panel-tabs>button,.segments>button,.review-setting{transition:background-color .18s,border-color .18s,color .18s,box-shadow .18s}
.app-settings-page{position:fixed;inset:0;z-index:75;overflow-y:auto;background:#f3f5fb;padding:max(25px,env(safe-area-inset-top)) 26px max(35px,env(safe-area-inset-bottom));overscroll-behavior:contain}.app-settings-inner{max-width:900px;margin:0 auto}.app-settings-inner>.picker-heading{margin-bottom:25px}.app-settings-inner .page-heading{margin:0}.settings-scope-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:25px}.settings-scope-tabs>button{display:flex;justify-content:center;align-items:center;gap:9px;padding:13px 9px;min-height:61px;border:1px solid #dce5f1;border-radius:17px;color:#8b9db9;background:linear-gradient(145deg,#fff,#f3f6fc)}.settings-scope-tabs>button.active{border-color:#a8bbda;color:#607fa8;background:#e7eefb}.settings-scope-tabs .icon{width:19px;height:19px}.app-settings-section{min-height:180px}.app-settings-section .settings-card{margin-bottom:17px}.app-settings-section .settings-panel-tabs{margin-bottom:20px}.grammar-quick-help{display:flex;flex-direction:column;gap:12px}.grammar-type-choices>button{padding:10px 8px;flex:1}.app-settings-inner .manual-about{margin:25px auto}.app-settings-inner .segments>button{cursor:pointer}
@media(max-width:720px){.app-settings-page{padding:18px 16px max(25px,env(safe-area-inset-bottom))}.settings-scope-tabs{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:20px}.settings-scope-tabs>button{min-height:54px;padding:9px}.app-settings-inner .settings-card{padding:22px 18px}}
@media(prefers-reduced-motion:reduce){.settings-scope-tabs>button,.settings-panel-tabs>button,.segments>button,.review-setting{transition:none}}
</style>
