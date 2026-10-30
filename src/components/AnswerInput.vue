<template><view ref="host" class="answer-textbox" :class="{'touch-answer':touch,'answer-active':active}" /></template>
<script setup>
import {ref,onMounted,onUnmounted,watch} from 'vue';
const props=defineProps({modelValue:{type:String,default:''},touch:Boolean,active:Boolean,disabled:Boolean});
const emit=defineEmits(['update:modelValue','activate','blur','keydown']);
const host=ref(null);
let field,caret,measure,observer,width=0,fontSize=29,letterSpacing=0,caretAnimation,removeListeners=()=>{};
const root=()=>host.value?.$el||host.value;
const textWidth=text=>(measure?.measureText(text).width||0)+Math.max(0,text.length-1)*letterSpacing;
function metrics(){
  if(!field)return;
  const style=getComputedStyle(field);fontSize=parseFloat(style.fontSize)||29;letterSpacing=parseFloat(style.letterSpacing)||0;width=field.clientWidth;
  if(measure)measure.font=style.font||`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  updateCaret();
}
function updateCaret(reset=false){
  if(!field||!caret)return;
  const active=props.touch&&props.active&&!props.disabled;
  caret.hidden=!active;if(!active)return;
  const position=field.selectionEnd??field.value.length,before=textWidth(field.value.slice(0,position))+3;
  const visibleWidth=Math.max(1,width-6),maximum=Math.max(0,textWidth(field.value)+9-width);
  let offset=field.scrollLeft;
  if(before-offset>visibleWidth)offset=before-visibleWidth;
  else if(before-offset<3)offset=Math.max(0,before-3);
  field.scrollLeft=Math.min(maximum,Math.max(0,offset));
  caret.style.left=`${Math.max(2,Math.min(width-3,before-field.scrollLeft))}px`;
  caret.style.height=`${fontSize*1.08}px`;
  if(reset&&caretAnimation)caretAnimation.currentTime=0;
}
function focus(){if(field&&!props.disabled){if(document.activeElement!==field)field.focus({preventScroll:true});updateCaret(true);}}
function blur(){field?.blur();}
function replaceRange(text,backwards=false,forwards=false){
  if(!field||props.disabled)return;
  const value=field.value;let start=field.selectionStart??value.length,end=field.selectionEnd??start;
  if(start===end&&backwards)start=Math.max(0,start-1);
  if(start===end&&forwards)end=Math.min(value.length,end+1);
  field.value=value.slice(0,start)+text+value.slice(end);
  field.setSelectionRange(start+text.length,start+text.length);
  updateCaret(true);emit('update:modelValue',field.value);
}
function tap(event){
  if(!props.touch||props.disabled)return;
  if(event.button!==undefined&&event.button!==0)return;
  event.preventDefault();event.stopPropagation();
  const x=event.clientX-field.getBoundingClientRect().left+field.scrollLeft-3,value=field.value;
  let low=0,high=value.length;
  while(low<high){const mid=Math.floor((low+high)/2);if(textWidth(value.slice(0,mid))<x)low=mid+1;else high=mid;}
  const previous=Math.max(0,low-1),position=Math.abs(textWidth(value.slice(0,previous))-x)<Math.abs(textWidth(value.slice(0,low))-x)?previous:low;
  field.setSelectionRange(position,position);emit('activate');focus();updateCaret(true);
}
onMounted(()=>{
  // Use the DOM field directly: no uni-input focus timers or value mirroring on
  // each virtual keystroke. The desktop keeps normal native editing and IME.
  field=document.createElement('input');field.className='answer-native-input';field.type='text';field.lang='fr';field.value=props.modelValue;
  field.readOnly=props.touch;field.disabled=props.disabled;field.inputMode=props.touch?'none':'text';field.autocomplete='off';field.spellcheck=false;
  field.setAttribute('aria-label','法语答案 / Réponse en français');field.setAttribute('autocorrect','off');field.setAttribute('autocapitalize','none');field.setAttribute('enterkeyhint','done');
  caret=document.createElement('span');caret.className='answer-native-caret';caret.setAttribute('aria-hidden','true');caret.hidden=true;
  // uni-app scopes component CSS even for this style block. DOM-created
  // children must carry the host's scope attributes to receive their styles.
  for(const name of root().getAttributeNames())if(name.startsWith('data-v-')){field.setAttribute(name,'');caret.setAttribute(name,'');}
  root().append(field,caret);measure=document.createElement('canvas').getContext('2d');
  if(caret.animate)caretAnimation=caret.animate([{opacity:1,offset:0},{opacity:1,offset:.6},{opacity:0,offset:.601},{opacity:0,offset:1}],{duration:1000,iterations:Infinity});
  const removers=[],bind=(target,name,handler)=>{target.addEventListener(name,handler);removers.push(()=>target.removeEventListener(name,handler));};
  const changed=()=>{updateCaret(true);emit('update:modelValue',field.value);};
  bind(field,'input',changed);bind(field,'compositionend',changed);bind(field,'focus',()=>{emit('activate');updateCaret(true);});bind(field,'blur',()=>emit('blur'));
  bind(field,'keydown',event=>emit('keydown',event));bind(field,'keyup',()=>updateCaret(true));bind(field,'select',()=>updateCaret());
  bind(field,'scroll',()=>updateCaret());
  if('PointerEvent' in window)bind(field,'pointerdown',tap);
  else bind(field,'touchstart',event=>{const point=event.changedTouches[0];if(point)tap({clientX:point.clientX,button:0,preventDefault:()=>event.preventDefault(),stopPropagation:()=>event.stopPropagation()});});
  bind(document,'selectionchange',()=>{if(document.activeElement===field)updateCaret();});
  if('ResizeObserver' in window){observer=new ResizeObserver(metrics);observer.observe(root());}else bind(window,'resize',metrics);
  metrics();removeListeners=()=>removers.forEach(remove=>remove());
});
watch(()=>props.modelValue,value=>{if(field&&field.value!==value){field.value=value;field.setSelectionRange(value.length,value.length);updateCaret(true);}});
watch(()=>props.active,()=>updateCaret(true),{flush:'post'});
watch(()=>props.disabled,value=>{if(field)field.disabled=value;updateCaret();});
onUnmounted(()=>{observer?.disconnect();caretAnimation?.cancel();removeListeners();});
defineExpose({get element(){return field;},focus,blur,replaceRange});
</script>
<style>
.answer-textbox{position:relative;flex:1;width:0;min-width:0;height:44px;font:29px Georgia,serif;overflow:hidden}
.exercise-entry .answer-textbox>.answer-native-input{display:block;box-sizing:border-box;width:100%;height:100%;padding:0 3px;border:0;outline:0!important;border-radius:0;background:transparent;font:inherit;color:inherit;line-height:normal;box-shadow:none;letter-spacing:inherit;text-align:left;-webkit-appearance:none;appearance:none}
.touch-answer>.answer-native-input{caret-color:transparent;touch-action:manipulation;-webkit-text-fill-color:currentColor}
.answer-native-caret{display:block;position:absolute;z-index:2;top:50%;width:2px;height:1.08em;border-radius:1px;background:#5279b5;transform:translateY(-50%);pointer-events:none}
.answer-native-caret[hidden]{display:none}
@media(max-width:720px){.answer-textbox{font-size:25px;height:42px}}
@media(prefers-reduced-motion:reduce){.answer-native-caret{opacity:1!important}}
</style>
