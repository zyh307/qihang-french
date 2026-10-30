<template>
  <view class="recitation-panel">
    <view class="recitation-scroll">
      <view v-for="group in groups" :key="group.id" class="recitation-group">
        <view class="recitation-group-heading"><Bi :zh="group.zh" :fr="group.fr" small /><text>{{ group.words.length }}</text></view>
        <view class="recitation-grid">
          <view v-for="word in group.words" :key="word.id" :class="['recitation-card',{'is-flipped':!!flipped[word.id],'is-learned':group.id==='learned','is-long':longest(word)>13,'is-very-long':longest(word)>19}]" role="button" tabindex="0" :aria-pressed="!!flipped[word.id]" aria-label="翻面查看中文 / Retourner la carte" @click="flip(word)" @keydown.enter.self.prevent="flip(word)" @keydown.space.self.prevent="flip(word)">
            <view class="recitation-flipper">
              <view class="recitation-face recitation-front" :aria-hidden="!!flipped[word.id]"><text lang="fr">{{ label(word) }}</text></view>
              <view class="recitation-face recitation-back" :aria-hidden="!flipped[word.id]"><text lang="fr">{{ label(word) }}</text><text class="recitation-pos">{{ word.sourcePos||word.pos }}</text><text class="recitation-meaning">{{ word.meanings.join('；') }}</text><button v-if="flipped[word.id]" hover-class="none" class="recitation-details" @click.stop="$emit('detail',word)" aria-label="详细释义 / Fiche du mot"><view class="recitation-detail-label"><text>释义</text><text>Fiche</text></view><Icon name="arrow" /></button></view>
            </view>
            <view class="recitation-card-actions">

              <button hover-class="none" class="recitation-audio" :class="{active:word.forms.some(f=>f.id===playing)}" :disabled="!word.forms.some(f=>f.audioKey)" @click.stop="listen(word)" aria-label="播放单词 / Écouter le mot"><Icon name="sound" /></button>
            </view>
          </view>
        </view>
      </view>
    </view>
    <view class="recitation-footer"><button hover-class="none" class="button primary wide" :disabled="busy" @click="$emit('practice')"><Bi zh="进入练习" fr="Pratiquer" /><Icon name="arrow" /></button></view>
  </view>
</template>
<script setup>
import {computed,ref,onMounted,onUnmounted} from 'vue';
import Bi from './Bi.vue';import Icon from './Icon.vue';
import {displayForm} from '../domain/word-display.js';import {getProgress} from '../domain/learning.js';
const props=defineProps({pkg:Object,data:Object,playing:String,busy:Boolean});
const emit=defineEmits(['audio','detail','practice','audio-stop']);const flipped=ref({}),timers=new Map();
const learned=w=>getProgress(props.data,props.pkg,w).notebook!=='practice';
const groups=computed(()=>[{id:'new',zh:'待背诵',fr:'À mémoriser',words:props.pkg.words.filter(w=>!learned(w))},{id:'learned',zh:'已学习',fr:'Déjà appris',words:props.pkg.words.filter(learned)}].filter(g=>g.words.length));
const label=w=>w.forms.map(f=>displayForm(w,f)).join(' / ');
const longest=w=>Math.max(...label(w).split(/\s+/).map(s=>s.length));
function listen(word){const form=word.forms.find(f=>f.audioKey);if(form)emit('audio',form);}
function flip(word){clearTimeout(timers.get(word.id));if(flipped.value[word.id]){delete flipped.value[word.id];timers.delete(word.id);return;}flipped.value[word.id]=true;listen(word);timers.set(word.id,setTimeout(()=>{delete flipped.value[word.id];timers.delete(word.id);},3000));}
onMounted(()=>emit('audio-stop'));
onUnmounted(()=>{for(const timer of timers.values())clearTimeout(timer);emit('audio-stop');});
</script>
