<template>
  <view class="desktop-accents" role="group" aria-label="重音字母 / Accents">
    <button v-for="letter in letters" :key="letter" type="button" hover-class="none" :disabled="disabled" :aria-label="'输入 / Insérer '+letter" @pointerdown.prevent @mousedown.prevent @click.stop="insert(letter,$event)">{{ letter }}</button>
  </view>
</template>
<script setup>
import {playTap} from '../platform/feedback-sounds.js';
defineProps({disabled:Boolean});
const emit=defineEmits(['insert']);
const letters=['é','è','ê','ë','à','â','î','ï','ô','ù','û','ü','ç','œ','æ',"'"];
function insert(letter,event){playTap();emit('insert',event.shiftKey?letter.toLocaleUpperCase('fr'):letter);}
</script>
<style scoped>
.desktop-accents{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.desktop-accents>button{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:34px;height:34px;padding:0 9px;margin:0;border:1px solid #d8e1ef;border-radius:9px;background:#f5f8fd;color:#526b91;font:20px/1 Georgia,serif;transition:background-color .12s,transform .12s;cursor:pointer}
.desktop-accents>button::after{border:0}
.desktop-accents>button:active:not(:disabled){background:#e3ebf7;transform:scale(.95)}
.desktop-accents>button:focus-visible{outline:2px solid #8da8cf;outline-offset:2px}
.desktop-accents>button:disabled{opacity:.42;cursor:default}
</style>
