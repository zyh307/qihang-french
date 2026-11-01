<template>
  <view class="oral-mode">
    <view class="oral-service-bar"><view class="oral-service-state"><view :class="['status-dot',{connected}]" /><Bi :zh="connected?'口语服务已连接':'口语服务未连接'" :fr="connected?'Service connecté':'Service déconnecté'" small /></view><button hover-class="none" class="text-button" @click="configure=!configure" :aria-expanded="configure"><Icon name="settings" /><Bi zh="连接设置" fr="Connexion" small /></button></view>
    <view v-if="configure" class="glass oral-service-form">
      <label><Bi zh="服务地址" fr="Adresse du service" small /><input :adjust-position="false" v-model="draftEndpoint" placeholder="https://…" inputmode="url" :spellcheck="false" /></label>
      <label><Bi zh="访问码" fr="Code d’accès" small /><input :adjust-position="false" v-model="draftCode" password placeholder="Code d’accès" autocomplete="off" /></label>
      <button hover-class="none" class="button primary" @click="connect"><Icon name="link" /><Bi zh="连接" fr="Connecter" small /></button>
    </view>
    <iframe ref="frame" :key="frameKey" class="oral-frame" :src="frameURL" title="DELF A1 口语练习 / Expression orale" allow="microphone; autoplay" referrerpolicy="no-referrer" @load="sendConfig" />
  </view>
</template>
<script setup>
import {ref,onMounted,onUnmounted} from 'vue';
import Bi from './Bi.vue';import Icon from './Icon.vue';
import {nativeHost} from '../platform/native.js';
import {download} from '../platform/files.js';
const emit=defineEmits(['notice']);
const storageKey='qihang-oral-connection-v2';
let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}
const endpoint=ref(saved.endpoint||''),accessCode=ref(saved.accessCode||''),draftEndpoint=ref(endpoint.value),draftCode=ref(accessCode.value),connected=ref(false),configure=ref(!endpoint.value),frame=ref(null),frameKey=ref(0);
const frameURL=new URL('static/oral/index.html',window.location.href).href;
function frameElement(){return frame.value?.$el||frame.value;}
function sendConfig(){frameElement()?.contentWindow?.postMessage({type:'qihang-oral-config',endpoint:endpoint.value,accessCode:accessCode.value},location.origin);}
function connect(){
  try{
    const value=new URL(draftEndpoint.value.trim());
    const local=['localhost','127.0.0.1','[::1]'].includes(value.hostname);
    if(value.username||value.password||value.search||value.hash||!(value.protocol==='https:'||(!nativeHost()&&local&&value.protocol==='http:')))throw Error('请填写 HTTPS 服务地址 / Adresse HTTPS requise.');
    if(!/^[A-Za-z0-9_-]{24,256}$/.test(draftCode.value.trim()))throw Error('请填写有效访问码 / Code d’accès requis.');
    endpoint.value=value.href.replace(/\/$/,'');accessCode.value=draftCode.value.trim();
    localStorage.setItem(storageKey,JSON.stringify({endpoint:endpoint.value,accessCode:accessCode.value}));
    nativeHost()?.configureOralService?.(endpoint.value);connected.value=false;frameKey.value++;
  }catch(error){emit('notice',error.message||'服务地址无效 / Adresse invalide.');}
}
async function receive(event){
  if(event.source!==frameElement()?.contentWindow||event.origin!==location.origin)return;
  if(event.data?.type==='qihang-oral-ready')sendConfig();
  if(event.data?.type==='qihang-oral-status'){connected.value=!!event.data.connected;if(connected.value)configure.value=false;}
  if(event.data?.type==='qihang-oral-link'&&typeof event.data.url==='string'&&event.data.url.startsWith('https://')){const native=nativeHost();if(native)native.openExternalLink?.(event.data.url);else window.open(event.data.url,'_blank','noopener,noreferrer');}
  if(event.data?.type==='qihang-oral-export'){
    const {name,text}=event.data;if(typeof text!=='string'||text.length>2_000_000)return;
    try{await download(/^A1-[a-z0-9-]+\.txt$/i.test(name)?name:'DELF-A1.txt',new TextEncoder().encode(text),'text/plain');}catch(error){emit('notice',error.message);}
  }
}
onMounted(()=>{nativeHost()?.configureOralService?.(endpoint.value);window.addEventListener('message',receive);});
onUnmounted(()=>window.removeEventListener('message',receive));
</script>
<style scoped>
.oral-mode{height:100%;min-height:0;display:flex;flex-direction:column;width:100%;max-width:1100px;margin:0 auto}
.oral-service-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 21px 9px;flex-shrink:0}.oral-service-state{display:flex;align-items:center;gap:9px}.oral-service-state>.status-dot{background:#b5becf}.oral-service-state>.status-dot.connected{background:#90b3a3}.oral-service-bar>.text-button{gap:7px}.oral-service-bar .icon{width:17px;height:17px}
.oral-service-form{margin:0 21px 12px;padding:17px;display:grid;grid-template-columns:1.3fr 1fr auto;gap:12px;align-items:end;border-radius:18px;flex-shrink:0}.oral-service-form>label{display:flex;flex-direction:column;gap:7px;min-width:0}.oral-service-form input{width:100%;height:42px;background:#f8faff;border:1px solid #d6e1ef;border-radius:11px;padding:0 11px;font-size:13px;color:#526a90}.oral-service-form>.button{min-height:42px;padding:8px 15px}
.oral-frame{display:block;flex:1;width:100%;min-height:0;border:0;background:transparent}
@media(max-width:720px){.oral-service-bar{padding:4px 15px 9px}.oral-service-form{margin:0 15px 11px;grid-template-columns:1fr 1fr;gap:10px;padding:14px}.oral-service-form>.button{grid-column:1/-1;min-height:40px}.oral-service-bar .bi-zh{font-size:11px}}
</style>
