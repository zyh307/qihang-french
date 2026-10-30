<template>
  <view ref="keyboardRoot" class="french-keyboard" data-manual-tap role="group" aria-label="法语键盘 / Clavier français" @click.stop @contextmenu.prevent>
    <view v-if="accentBase" class="keyboard-accents" :style="popupStyle" role="group" aria-label="重音字母 / Accents"><view v-for="(accent,index) in accentOptions" :key="accent" :class="['accent-option',{selected:accentIndex===index}]" :aria-selected="accentIndex===index">{{ letterCase(accent) }}</view></view>
    <view v-else-if="pressed" class="keyboard-key-preview" :style="previewStyle" aria-hidden="true">{{ symbols?pressed:letterCase(pressed) }}</view>
    <view class="keyboard-top"><text>FR</text><button hover-class="none" class="keyboard-hide" data-action="hide" aria-label="收起键盘 / Masquer le clavier"><Icon name="chevron-down" /></button></view>
    <view v-for="(row,index) in rows" :key="index" :class="['keyboard-row',{'keyboard-middle-letters':index===1&&!symbols,'keyboard-last-letters':index===2}]">
      <button v-if="index===2" hover-class="none" :class="['keyboard-key','keyboard-action',{active:shifted,'caps-lock':capsLocked}]" data-action="shift" aria-label="大写 / Majuscule"><text v-if="symbols">ABC</text><Icon v-else name="shift" /></button>
      <button v-for="letter in row" :key="letter" hover-class="none" :class="['keyboard-key',{pressed:pressed===letter}]" :data-key="letter">{{ symbols?letter:letterCase(letter) }}</button>
      <button v-if="index===2" hover-class="none" class="keyboard-key keyboard-action" data-action="delete" aria-label="删除 / Effacer"><Icon name="backspace" /></button>
    </view>
    <view class="keyboard-row keyboard-bottom"><button hover-class="none" class="keyboard-key keyboard-action keyboard-numbers" data-action="symbols">{{ symbols?'ABC':'123' }}</button><button hover-class="none" class="keyboard-key keyboard-space" data-action="space">space</button><button hover-class="none" class="keyboard-key keyboard-apostrophe" data-action="apostrophe">’</button><button hover-class="none" class="keyboard-key keyboard-confirm" :disabled="disabled" data-action="confirm" aria-label="确认 / Valider"><Icon name="return" /><text>OK</text></button></view>
  </view>
</template>
<script setup>
import {computed,ref,onMounted,onUnmounted} from 'vue';
import Icon from './Icon.vue';
import {playTap} from '../platform/feedback-sounds.js';
const props=defineProps({disabled:Boolean});
const emit=defineEmits(['input','delete','confirm','close']);
const keyboardRoot=ref(null),shifted=ref(false),capsLocked=ref(false),symbols=ref(false),pressed=ref(''),accentBase=ref(''),accentOptions=ref([]),accentIndex=ref(-1),popupStyle=ref({}),previewStyle=ref({});
const accents={a:['a','à','â','ä','æ'],e:['e','é','è','ê','ë'],i:['i','î','ï'],o:['o','ô','ö','œ'],u:['u','ù','û','ü'],c:['c','ç'],y:['y','ÿ']};
const rows=computed(()=>symbols.value?['1234567890','@#€&()-+/=',';:,.?!’"'].map(row=>[...row]):['qwertyuiop','asdfghjkl','zxcvbnm'].map(row=>[...row]));
const letterCase=value=>shifted.value?value.toLocaleUpperCase('fr'):value;
const touches=new Map();let accentPointer=null,popupBounds=null,deleteState=null,lastShiftAt=0,lastGestureAt=0,removeNativeListeners=()=>{};
const rootElement=()=>keyboardRoot.value?.$el||keyboardRoot.value;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function capture(element,id){try{element.setPointerCapture?.(id);}catch{}}
function uncapture(element,id){try{if(element.hasPointerCapture?.(id))element.releasePointerCapture(id);}catch{}}
function write(letter,upper=shifted.value){playTap();emit('input',!symbols.value&&upper?letter.toLocaleUpperCase('fr'):letter);if(!capsLocked.value)shifted.value=false;}
function updatePreview(){
  const state=[...touches.values()].filter(s=>s.letter&&!s.cancelled).at(-1);pressed.value=state?.letter||'';if(!state)return;
  const root=rootElement()?.getBoundingClientRect();if(!root)return;
  state.rect=state.element.getBoundingClientRect();
  const width=Math.max(45,state.rect.width+16),left=clamp(state.rect.left+state.rect.width/2-width/2,root.left+4,root.right-width-4);
  previewStyle.value={left:`${left-root.left}px`,top:`${state.rect.top-root.top-52}px`,width:`${width}px`,'--anchor-x':`${state.rect.left+state.rect.width/2-left}px`};
}
function openAccents(state){
  if(!touches.has(state.id)||state.cancelled||accentPointer!==null)return;
  const root=rootElement()?.getBoundingClientRect();if(!root)return;
  state.rect=state.element.getBoundingClientRect();
  const options=[...accents[state.letter]],padding=6,height=54,cell=clamp(state.rect.width+7,34,48),width=options.length*cell+padding*2,center=state.rect.left+state.rect.width/2;
  let left=center-cell/2-padding;
  if(left+width>root.right-6){options.reverse();left=center-(options.length-.5)*cell-padding;}
  left=clamp(left,root.left+6,root.right-width-6);
  const top=Math.max(8,state.rect.top-height-8);
  state.long=true;accentPointer=state.id;accentBase.value=state.letter;accentOptions.value=options;accentIndex.value=options.indexOf(state.letter);
  popupBounds={left,top,width,height,cell,padding,bottom:state.rect.bottom+30};
  popupStyle.value={left:`${left-root.left}px`,top:`${top-root.top}px`,width:`${width}px`,height:`${height}px`,'--accent-cell':`${cell}px`,'--anchor-x':`${clamp(center-left,12,width-12)}px`};
}
function press(letter,event,element){
  if(event.button!==undefined&&event.button!==0||accentPointer!==null)return;
  const rect=element.getBoundingClientRect(),id=event.pointerId;
  const state={id,letter,element,rect,x:event.clientX,y:event.clientY,upper:shifted.value,long:false,cancelled:false};
  touches.set(id,state);capture(element,id);updatePreview();
  if(!symbols.value&&accents[letter])state.timer=setTimeout(()=>openAccents(state),320);
}
function move(event){
  const state=touches.get(event.pointerId);if(!state)return;
  if(state.long&&popupBounds){
    const p=popupBounds,x=event.clientX,y=event.clientY;
    accentIndex.value=x<p.left-22||x>p.left+p.width+22||y<p.top-25||y>p.bottom?-1:clamp(Math.floor((x-p.left-p.padding)/p.cell),0,accentOptions.value.length-1);
  }else if(Math.hypot(event.clientX-state.x,event.clientY-state.y)>26){clearTimeout(state.timer);state.cancelled=true;updatePreview();}
}
function finish(state){
  clearTimeout(state.timer);touches.delete(state.id);lastGestureAt=Date.now();
  if(accentPointer===state.id){accentPointer=null;accentBase.value='';accentOptions.value=[];accentIndex.value=-1;popupBounds=null;}
  uncapture(state.element,state.id);updatePreview();
}
function release(event){
  const state=touches.get(event.pointerId);if(!state)return;
  if(state.action){const inside=event.clientX>=state.rect.left-12&&event.clientX<=state.rect.right+12&&event.clientY>=state.rect.top-12&&event.clientY<=state.rect.bottom+12;const action=state.action;finish(state);if(inside&&!state.cancelled)runAction(action);return;}
  if(state.long){move(event);const value=accentOptions.value[accentIndex.value];if(value)write(value,state.upper);}
  else if(!state.cancelled&&event.clientX>=state.rect.left-12&&event.clientX<=state.rect.right+12&&event.clientY>=state.rect.top-12&&event.clientY<=state.rect.bottom+12)write(state.letter,state.upper);
  finish(state);
}
function cancelPress(event){const state=touches.get(event.pointerId);if(state)finish(state);}
function deleteOnce(){playTap();emit('delete');}
function startDelete(event,element){if(deleteState)return;const state={element,id:event.pointerId,rect:element.getBoundingClientRect()};deleteState=state;capture(element,state.id);deleteOnce();state.timer=setTimeout(()=>{state.repeat=setInterval(deleteOnce,70);},350);}
function stopDelete(){if(!deleteState)return;const state=deleteState;deleteState=null;clearTimeout(state.timer);clearInterval(state.repeat);lastGestureAt=Date.now();uncapture(state.element,state.id);}
function cancelAll(){for(const state of [...touches.values()])finish(state);stopDelete();}
function toggleShift(){playTap();cancelAll();if(symbols.value){symbols.value=false;return;}const now=Date.now();if(capsLocked.value){capsLocked.value=false;shifted.value=false;}else if(now-lastShiftAt<320){capsLocked.value=true;shifted.value=true;}else shifted.value=!shifted.value;lastShiftAt=now;}
function toggleSymbols(){playTap();cancelAll();symbols.value=!symbols.value;}
function confirm(){playTap();cancelAll();emit('confirm');}
function hide(){playTap();cancelAll();emit('close');}
const onVisibility=()=>{if(document.hidden)cancelAll();};
function runAction(action){
  if(action==='shift')toggleShift();else if(action==='symbols')toggleSymbols();else if(action==='hide')hide();else if(action==='confirm'){if(!props.disabled)confirm();}else if(action==='delete')deleteOnce();else if(action==='space')write(' ');else if(action==='apostrophe')write('’');
}
function findKey(event){
  const root=rootElement(),target=event.target?.nodeType===1?event.target:event.target?.parentElement,exact=target?.closest?.('[data-key],[data-action]');
  if(exact&&root.contains(exact))return exact;
  let nearest=null,distance=121;
  for(const key of root.querySelectorAll('[data-key],[data-action]')){const r=key.getBoundingClientRect(),dx=Math.max(r.left-event.clientX,0,event.clientX-r.right),dy=Math.max(r.top-event.clientY,0,event.clientY-r.bottom),d=dx*dx+dy*dy;if(d<distance){nearest=key;distance=d;}}
  return nearest;
}
function beginNative(event,element){
  if(!element||event.button!==undefined&&event.button!==0)return;
  const action=element.dataset.action;if(action==='confirm'&&props.disabled)return;
  lastGestureAt=Date.now();
  if(element.dataset.key!==undefined)press(element.dataset.key,event,element);
  else if(action==='delete')startDelete(event,element);
  else if(action){const state={id:event.pointerId,action,element,rect:element.getBoundingClientRect(),x:event.clientX,y:event.clientY,cancelled:false};touches.set(state.id,state);capture(element,state.id);}
}
function preventNative(event){if(event.cancelable)event.preventDefault();event.stopPropagation();}
onMounted(()=>{
  const root=rootElement();if(!root)return;const removers=[];
  const bind=(target,name,handler)=>{target.addEventListener(name,handler,{capture:true,passive:false});removers.push(()=>target.removeEventListener(name,handler,true));};
  // Bind to DOM elements directly. uni-app's normalized events omit native
  // pointer IDs, coordinates and DOM currentTarget, which this gesture needs.
  if('PointerEvent' in window){
    bind(root,'pointerdown',event=>{const key=findKey(event);if(!key)return;preventNative(event);beginNative(event,key);});
    bind(document,'pointermove',event=>{if(touches.has(event.pointerId)){preventNative(event);move(event);}});
    bind(document,'pointerup',event=>{if(deleteState?.id===event.pointerId){preventNative(event);stopDelete();}else if(touches.has(event.pointerId)){preventNative(event);release(event);}});
    bind(document,'pointercancel',event=>{if(deleteState?.id===event.pointerId)stopDelete();cancelPress(event);});
    bind(root,'lostpointercapture',event=>{if(deleteState?.id===event.pointerId)stopDelete();cancelPress(event);});
  }else{
    const packet=(touch,event)=>({pointerId:'touch:'+touch.identifier,clientX:touch.clientX,clientY:touch.clientY,button:0,target:event.target});
    bind(root,'touchstart',event=>{let handled=false;for(const touch of event.changedTouches){const p=packet(touch,event),key=findKey(p);if(key){handled=true;beginNative(p,key);}}if(handled)preventNative(event);});
    bind(document,'touchmove',event=>{let handled=false;for(const touch of event.changedTouches){const p=packet(touch,event);if(touches.has(p.pointerId)){handled=true;move(p);}}if(handled)preventNative(event);});
    bind(document,'touchend',event=>{let handled=false;for(const touch of event.changedTouches){const p=packet(touch,event);if(deleteState?.id===p.pointerId){handled=true;stopDelete();}else if(touches.has(p.pointerId)){handled=true;release(p);}}if(handled)preventNative(event);});
    bind(document,'touchcancel',event=>{for(const touch of event.changedTouches){const p=packet(touch,event);if(deleteState?.id===p.pointerId)stopDelete();cancelPress(p);}});
  }
  bind(root,'click',event=>{preventNative(event);if(Date.now()-lastGestureAt<650)return;const key=findKey(event);if(key?.dataset.key!==undefined)write(key.dataset.key);else if(key)runAction(key.dataset.action);});
  window.addEventListener('resize',cancelAll);window.addEventListener('blur',cancelAll);document.addEventListener('visibilitychange',onVisibility);
  removeNativeListeners=()=>{for(const remove of removers)remove();window.removeEventListener('resize',cancelAll);window.removeEventListener('blur',cancelAll);document.removeEventListener('visibilitychange',onVisibility);};
});
onUnmounted(()=>{cancelAll();removeNativeListeners();});
</script>
<style scoped>
.french-keyboard{position:fixed;z-index:85;left:0;right:0;bottom:0;width:100%;max-width:760px;box-sizing:border-box;margin:0 auto;padding:0 7px max(10px,env(safe-area-inset-bottom));border:1px solid #cbd4e3;border-bottom:0;border-radius:20px 20px 0 0;background:#dfe5eff5;backdrop-filter:blur(24px);box-shadow:0 -9px 38px #304b711e;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.keyboard-top{height:29px;display:flex;align-items:center;justify-content:space-between;padding:0 6px 0 9px;color:#7e8da8}.keyboard-top>text{font:10px/1 Arial;letter-spacing:1px}.keyboard-hide{height:28px;width:39px;display:flex;justify-content:center;align-items:center}.keyboard-hide>.icon{width:22px;height:22px}
.keyboard-row{display:flex;justify-content:center;gap:5px;margin-bottom:8px}.keyboard-middle-letters{margin-left:calc((100% + 5px)/20);margin-right:calc((100% + 5px)/20)}.keyboard-row:last-child{margin-bottom:0}.keyboard-key{display:flex;align-items:center;justify-content:center;flex:1;min-width:0;height:43px;border-radius:7px;background:#fff;color:#34465f;box-shadow:0 1px 1px #7a8ba363;font:22px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;padding:0;transition:background .08s;touch-action:none}.keyboard-key:active,.keyboard-key.pressed{background:#eaf0fb}.keyboard-action{background:#bcc9dc;max-width:57px;position:relative}.keyboard-action.active{background:#fff;color:#3d6dab}.keyboard-action>.icon{width:23px;height:23px}.keyboard-action>text{font-size:12px}.caps-lock::before{content:'';position:absolute;width:14px;height:2px;background:currentColor;bottom:5px}.keyboard-last-letters{padding:0 1px;gap:7px}.keyboard-last-letters>.keyboard-action{flex:1.4}.keyboard-bottom{gap:7px}.keyboard-numbers{flex:1.3;font-size:15px;max-width:70px}.keyboard-space{flex:5;font-size:15px;color:#72819a}.keyboard-apostrophe{flex:.8;font-size:27px}.keyboard-confirm{flex:1.8;gap:5px;background:#7189b4;color:#fff;font-size:14px}.keyboard-confirm>.icon{width:20px;height:20px}.keyboard-confirm:disabled{background:#a9b8d2;color:#e9edf5;opacity:1}
.keyboard-accents,.keyboard-key-preview{position:absolute;z-index:4;box-sizing:border-box;border:1px solid #bdcadc;background:#fff;border-radius:12px;box-shadow:0 3px 15px #354b7236;pointer-events:none}.keyboard-accents{display:flex;align-items:center;padding:5px 6px}.keyboard-accents::after,.keyboard-key-preview::after{content:'';position:absolute;left:calc(var(--anchor-x) - 6px);bottom:-7px;width:12px;height:12px;transform:rotate(45deg);background:#fff;border-right:1px solid #bdcadc;border-bottom:1px solid #bdcadc}.accent-option{display:flex;align-items:center;justify-content:center;flex:0 0 var(--accent-cell);height:42px;border-radius:7px;font:26px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#34465f;position:relative;z-index:1}.accent-option.selected{background:#6c8abe;color:#fff}.keyboard-key-preview{height:54px;display:flex;align-items:center;justify-content:center;font:31px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#34465f}
@media(max-height:620px){.keyboard-key{height:36px}.keyboard-row{margin-bottom:6px}.keyboard-top{height:25px}}
@media(min-width:721px){.french-keyboard{padding-left:14px;padding-right:14px}.keyboard-key{height:45px}.keyboard-row{gap:8px}}
</style>
