<template>
 <view class="oral-mode-local">
  <view class="oral-local-bar"><Bi zh="DELF A1–B2 口语" fr="Expression orale" small /><button class="oral-settings-button" hover-class="none" @click="emit('settings')"><Icon name="settings" /><Bi zh="设置" fr="Réglages" small /></button></view>
  <aside v-if="!prepared || oralHome" class="oral-performance-note" aria-label="口语练习设备建议">
   <strong>建议使用性能较好的电脑练习</strong>
   <span>口语模式在本机识别录音。设备性能较低时，可能出现卡顿或长时间等待回复。</span>
  </aside>
  <view v-if="!prepared" class="oral-local-setup"><OralSetup auto-enter @status="receiveStatus" @notice="emit('notice',$event)" @ready="enter" /></view>
  <iframe v-if="prepared" ref="frame" class="oral-local-frame" :src="frameURL" title="DELF A1–B2 口语练习 / Expression orale" allow="microphone; autoplay" referrerpolicy="no-referrer" />
 </view>
</template>
<script setup>
import {ref,onMounted,onUnmounted} from 'vue';import Bi from './Bi.vue';import Icon from './Icon.vue';import OralSetup from './OralSetup.vue';import {oralCall} from '../oral/native-bridge.js';import {download} from '../platform/files.js';import {oralSessionArchive} from '../platform/records-backup.js';
const emit=defineEmits(['notice','modes','settings','home','restore-file']),prepared=ref(localStorage.getItem('qihang-oral-prepared-v2')==='1'),oralHome=ref(true),frame=ref(null);let timer,alive=true;
const frameURL=new URL('static/oral/index.html',window.location.href).href;
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
onMounted(()=>{emit('home',true);refresh();timer=setInterval(refresh,2000);window.addEventListener('message',receive);});onUnmounted(()=>{alive=false;clearInterval(timer);window.removeEventListener('message',receive);});
</script>
<style scoped>
.oral-mode-local{height:100%;min-height:0;display:flex;flex-direction:column;width:100%;max-width:1100px;margin:0 auto}.oral-local-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 22px 12px;flex-shrink:0}.oral-settings-button{display:flex;align-items:center;gap:7px;padding:7px 11px;border-radius:13px;border:1px solid #dae4f2;background:linear-gradient(145deg,#fff,#eef3fb);color:#7d92b4}.oral-settings-button>.icon{width:17px;height:17px}.oral-local-setup{flex:1;min-height:0;overflow-y:auto;padding:10px 19px 35px}.oral-local-frame{flex:1;min-height:0;width:100%;border:0;background:transparent;display:block}@media(max-width:720px){.oral-local-bar{padding:0 16px 10px}.oral-local-setup{padding:6px 13px 25px}}
@media(max-width:720px){.oral-local-bar{padding:0 13px 7px;gap:9px}.oral-local-bar :deep(.bi-zh){font-size:11px}.oral-local-bar :deep(.bi-fr){font-size:9px}.oral-settings-button{padding:6px 9px;gap:6px;border-radius:11px}.oral-settings-button>.icon{width:15px;height:15px}.oral-local-setup{padding:5px 11px 18px}}
.oral-performance-note {
  flex-shrink: 0;
  margin: 0 22px 8px;
  padding: 8px 12px;
  border: 1px solid #e3dfd1;
  border-radius: 10px;
  background: #faf7ee;
  color: #574c33;
  font-size: 13px;
  line-height: 1.45;
}
.oral-performance-note strong { display: block; font-weight: 600; }
@media (max-width: 720px) {
  .oral-performance-note { margin-inline: 13px; font-size: 12px; }
}
</style>
