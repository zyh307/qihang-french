<template>
 <Teleport to="body"><Transition name="import-sheet">
  <view v-if="open" class="import-sheet-shade" @click.self="$emit('close')">
   <view ref="panel" class="import-sheet-panel" role="dialog" aria-modal="true" :aria-label="label" tabindex="-1" @keydown="trapFocus">
    <slot/>
   </view>
  </view>
 </Transition></Teleport>
</template>
<script setup>
import {nextTick,ref,watch} from 'vue';
const props=defineProps({open:Boolean,label:String});
defineEmits(['close']);
const panel=ref(null);
const element=()=>panel.value?.$el||panel.value;
let trigger;
watch(()=>props.open,async value=>{
 if(value){trigger=document.activeElement;await nextTick();const target=element();if(props.open&&target)target.focus({preventScroll:true});}
 else if(trigger?.isConnected)trigger.focus({preventScroll:true});
});
function trapFocus(event){
 if(event.key!=='Tab')return;
 const buttons=[...(element()?.querySelectorAll('button:not(:disabled)')||[])];
 if(!buttons.length){event.preventDefault();return;}
 const current=document.activeElement,first=buttons[0],last=buttons.at(-1);
 if(event.shiftKey&&(current===first||current===element())){event.preventDefault();last.focus();}
 if(!event.shiftKey&&current===last){event.preventDefault();first.focus();}
}
</script>
<style scoped>
.import-sheet-shade{position:fixed;inset:0;z-index:165;display:flex;align-items:flex-end;justify-content:center;background:var(--ui-0b0e9e288aa6,#17233f38)}
.import-sheet-panel{width:min(100%,460px);max-height:65vh;overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:10px 16px max(12px,env(safe-area-inset-bottom));border-radius:22px 22px 0 0;background:var(--theme-panel,#fff);color:var(--ink);outline:none;box-shadow:0 -8px 28px var(--ui-9145d78035be,#17233f18)}
.import-sheet-enter-active,.import-sheet-leave-active{transition:opacity .18s ease}
.import-sheet-enter-active .import-sheet-panel,.import-sheet-leave-active .import-sheet-panel{transition:transform .22s cubic-bezier(.22,.75,.25,1)}
.import-sheet-enter-from,.import-sheet-leave-to{opacity:0}
.import-sheet-enter-from .import-sheet-panel,.import-sheet-leave-to .import-sheet-panel{transform:translateY(100%)}
@media(prefers-reduced-motion:reduce){.import-sheet-enter-active,.import-sheet-leave-active,.import-sheet-enter-active .import-sheet-panel,.import-sheet-leave-active .import-sheet-panel{transition:none}}
</style>
