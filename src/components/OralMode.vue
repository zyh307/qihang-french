<template>
 <view class="oral-mode-local" :class="{'oral-immersive':section==='game'}">
  <view v-if="section!=='game'" class="oral-local-bar">
   <nav v-if="desktop" class="oral-sections" aria-label="口语练习">
    <button v-for="item in sections" :key="item.id" class="oral-section-button" hover-class="none"
     :aria-pressed="section===item.id" @click="select(item.id)"><Bi :zh="item.zh" :fr="item.fr" small /></button>
   </nav>
   <Bi v-else zh="DELF A1–B2 口语" fr="Expression orale" small />
   <button v-if="section==='delf'" class="oral-settings-button" hover-class="none" @click="emit('settings')"><Icon name="settings" /><Bi zh="设置" fr="Réglages" small /></button>
   <button v-else class="oral-settings-button" hover-class="none" @click="desktop.postMessage({type:'qihang-workshop-folder'})"><Icon name="book" /><Bi zh="口语资料" fr="Ressources" small /></button>
  </view>
  <button v-else class="oral-town-back" hover-class="none" aria-label="退出口语小镇 / Quitter le village" title="退出口语小镇" @click="select('daily')"><Icon name="back" /></button>
  <view ref="screenStage" class="fade-stage fade-fill">
  <Transition name="page-fade" @before-leave="retireFadePane">
  <view :key="oralPane" class="fade-fill">
  <template v-if="section==='delf'">
  <aside v-if="!desktop && (!prepared || oralHome)" class="oral-performance-note" aria-label="口语练习设备建议">
   <strong>建议使用性能较好的电脑练习</strong>
   <span>口语模式在本机识别录音。设备性能较低时，可能出现卡顿或长时间等待回复。</span>
  </aside>
  <view v-if="!prepared" class="oral-local-setup"><OralSetup auto-enter @status="receiveStatus" @notice="emit('notice',$event)" @ready="enter" /></view>
  <iframe v-if="prepared" ref="frame" class="oral-local-frame" :src="frameURL" title="DELF A1–B2 口语练习 / Expression orale" allow="microphone; autoplay" referrerpolicy="no-referrer" />
  </template>
  <iframe v-else-if="workshopURL" :src="workshopURL" class="oral-workshop-frame" title="口语练习室 / Atelier oral"
   allow="microphone; autoplay" referrerpolicy="no-referrer" />
  <section v-else class="oral-workshop-state" aria-live="polite">
   <Bi v-if="!workshopError" zh="正在打开…" fr="Ouverture…" />
   <template v-else>
    <Bi :zh="workshopError==='start'?'无法打开口语练习室':'口语组件不完整，请重新解压 Windows 包'"
     :fr="workshopError==='start'?'Impossible d’ouvrir l’atelier oral':'Réextrayez le dossier Windows'" />
    <button class="oral-settings-button" hover-class="none" @click="openWorkshop"><Bi zh="重试" fr="Réessayer" small /></button>
   </template>
  </section>
  </view></Transition></view>
 </view>
</template>
<script setup>
import {rememberFadeBounds,retireFadePane} from '../platform/page-motion.js';
import {computed,ref,onMounted,onUnmounted,watch} from 'vue';import Bi from './Bi.vue';import Icon from './Icon.vue';import OralSetup from './OralSetup.vue';import {oralCall} from '../oral/native-bridge.js';import {download} from '../platform/files.js';import {oralSessionArchive} from '../platform/records-backup.js';
const emit=defineEmits(['notice','modes','settings','home','restore-file']),prepared=ref(localStorage.getItem('qihang-oral-prepared-v2')==='1'),oralHome=ref(true),frame=ref(null);let timer,alive=true;
const frameURL=new URL('static/oral/index.html',window.location.href).href;
const desktop=window.chrome?.webview;
const sections=[
 {id:'delf',zh:'DELF',fr:'Examen'},
 {id:'read',zh:'读课文',fr:'Lecture'},
 {id:'daily',zh:'日常练习',fr:'Pratique'},
 {id:'game',zh:'口语小镇',fr:'Village'},
];
const section=ref('delf'),workshopAddress=ref(''),workshopError=ref('');
let opening;
const workshopURL=computed(()=>{
 if(section.value==='delf'||!workshopAddress.value)return '';
 const url=new URL(workshopAddress.value);
 url.searchParams.set(section.value,'1');
 return url.href;
});
const oralPane=computed(()=>section.value+(section.value==='delf'?prepared.value?':ready':':setup':workshopURL.value?':ready':workshopError.value?':error':':loading'));
const screenStage=ref(null);
watch(oralPane,()=>{
 const stage=screenStage.value?.$el||screenStage.value;
 rememberFadeBounds(stage?.querySelector('.fade-fill:not([inert])'));
},{flush:'sync'});
function openWorkshop(){
 if(opening)return;
 workshopAddress.value='';workshopError.value='';
 desktop.postMessage({type:'qihang-workshop-open'});
 opening=setTimeout(()=>{opening=null;workshopError.value='start';},17000);
}
function receiveWorkshop(event){
 if(event.data?.type!=='qihang-workshop')return;
 clearTimeout(opening);opening=null;
 workshopError.value=event.data.error||'';
 if(event.data.url)workshopAddress.value=event.data.url;
}
function select(id){
 if(section.value===id)return;
 const wasTown=section.value==='game';
 section.value=id;
 if(wasTown!==(id==='game'))desktop?.postMessage({type:'qihang-town-window',active:id==='game'});
 oralHome.value=id!=='game';emit('home',oralHome.value);
 if(id==='delf')refresh();
 else if(!workshopAddress.value)openWorkshop();
}
function enter(){prepared.value=true;localStorage.setItem('qihang-oral-prepared-v2','1');}
function receiveStatus(value){if(value.recognizer?.ready===false||!value.model?.ready&&value.model?.state!=='checking')prepared.value=false;else if(!prepared.value&&localStorage.getItem('qihang-oral-prepared-v2')==='1'&&value.provider?.status==='connected'&&value.microphone)enter();}
async function refresh(){try{const status=await oralCall('status');if(!alive)return;const native=window.QihangNative;if(typeof native?.microphonePermission==='function'&&native.microphonePermission()!=='granted'){prepared.value=false;return;}if(status.recognizer?.ready===false||!status.model.ready&&status.model.state!=='checking')prepared.value=false;else if(!prepared.value&&localStorage.getItem('qihang-oral-prepared-v2')==='1'&&status.model.ready)prepared.value=true;}catch{}}
async function receive(event){if(event.origin!==location.origin||event.source!==(frame.value?.$el||frame.value)?.contentWindow)return;const data=event.data;
 if(data?.type==='qihang-oral-restore-file'&&data.file instanceof File)emit('restore-file',data.file);
 if(data?.type==='qihang-oral-view'){oralHome.value=data.home===true;emit('home',oralHome.value);}
 if(data?.type==='qihang-oral-error')emit('notice',data.message);
 if(data?.type==='qihang-oral-native-state')refresh();
 if(data?.type==='qihang-oral-link'&&data.url?.startsWith('https://'))window.QihangNative?.openExternalLink?window.QihangNative.openExternalLink(data.url):window.open(data.url,'_blank','noopener,noreferrer');
 if(data?.type==='qihang-oral-export-record'){try{const bytes=await oralSessionArchive(data.session,data.recordings);await download(`${data.session.level||'A1'}-${data.session.id}.zip`,bytes,'application/zip');}catch(e){emit('notice',e.message);}}
 if(data?.type==='qihang-oral-export-archive'&&/^[AB][12]-[a-z0-9-]+\.zip$/i.test(data.name)&&typeof data.data==='string'&&data.data.length<110*1024*1024){try{const bytes=Uint8Array.from(atob(data.data),c=>c.charCodeAt(0));await download(data.name,bytes,'application/zip');}catch(e){emit('notice',e.message);}}
}
onMounted(()=>{emit('home',true);refresh();timer=setInterval(()=>{if(section.value==='delf')refresh();},2000);window.addEventListener('message',receive);desktop?.addEventListener('message',receiveWorkshop);});
onUnmounted(()=>{
 if(section.value==='game')desktop?.postMessage({type:'qihang-town-window',active:false});
 alive=false;clearInterval(timer);clearTimeout(opening);
 window.removeEventListener('message',receive);desktop?.removeEventListener('message',receiveWorkshop);
});
</script>
<style scoped>
.oral-mode-local{height:100%;min-height:0;display:flex;flex-direction:column;width:100%;max-width:1100px;margin:0 auto}.oral-local-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 22px 12px;flex-shrink:0}.oral-settings-button{display:flex;align-items:center;gap:7px;padding:7px 11px;border-radius:13px;border:1px solid var(--ui-f0d541f0a938,#dae4f2);background:linear-gradient(145deg,var(--ui-06543dea30c1,#fff),var(--ui-11e74bacb7a8,#eef3fb));color:var(--ui-95c1c91ce599,#7d92b4)}.oral-settings-button>.icon{width:17px;height:17px}.oral-local-setup{flex:1;min-height:0;overflow-y:auto;padding:10px 19px 35px}.oral-local-frame,.oral-workshop-frame{flex:1;min-height:0;width:100%;border:0;background:transparent;display:block}@media(max-width:720px){.oral-local-bar{padding:0 16px 10px}.oral-local-setup{padding:6px 13px 25px}}
@media(max-width:720px){.oral-local-bar{padding:0 13px 7px;gap:9px}.oral-local-bar :deep(.bi-zh){font-size:11px}.oral-local-bar :deep(.bi-fr){font-size:9px}.oral-settings-button{padding:6px 9px;gap:6px;border-radius:11px}.oral-settings-button>.icon{width:15px;height:15px}.oral-local-setup{padding:5px 11px 18px}}
.oral-performance-note {
  flex-shrink: 0;
  margin: 0 22px 8px;
  padding: 8px 12px;
  border: 1px solid var(--ui-7a0b9a30b045,#e3dfd1);
  border-radius: 10px;
  background: var(--ui-09021e23a3e6,#faf7ee);
  color: var(--ui-ccc5b3b9af93,#574c33);
  font-size: 13px;
  line-height: 1.45;
}
.oral-performance-note strong { display: block; font-weight: 600; }
.oral-sections{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.oral-section-button{margin:0;padding:6px 12px;border:0;border-radius:10px;background:transparent;color:var(--muted,#546681);min-height:38px}
.oral-section-button[aria-pressed="true"]{color:var(--accent,#315c99);background:var(--ui-11e74bacb7a8,#eef3fb)}
.oral-workshop-state{flex:1;display:grid;align-content:center;justify-items:center;gap:12px;text-align:center}
.oral-immersive{position:fixed;inset:0;z-index:100;max-width:none;background:var(--ui-2d85834d82c4,#f0f0e4)}
.oral-town-back{position:absolute;top:8px;left:8px;z-index:1;display:grid;place-items:center;width:42px;height:42px;margin:0;padding:0;border:0;border-radius:12px;background:var(--ui-06543dea30c1,#fff);color:var(--ink,#24364c);box-shadow:0 1px 5px var(--ui-0790873b9afb,#0002)}
.oral-town-back .icon{width:22px;height:22px}
@media (max-width: 720px) {
  .oral-performance-note { margin-inline: 13px; font-size: 12px; }
}
</style>
