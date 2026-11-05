<template>
  <view class="recitation-panel">
    <view class="recitation-scroll">
      <view v-for="group in groups" :key="group.id" class="recitation-group">
        <view class="recitation-group-heading"><Bi :zh="group.zh" :fr="group.fr" small /><text>{{ group.words.length }}</text></view>
        <view class="recitation-grid">
          <view v-for="word in group.words" :key="word.id" :class="['recitation-card',{'is-flipped':!!flipped[word.id],'is-learned':group.id==='learned','is-long':longest(word)>13,'is-very-long':longest(word)>19}]" role="button" tabindex="0" :aria-pressed="!!flipped[word.id]" aria-label="翻面查看中文 / Retourner la carte" @click="flip(word)" @keydown.enter.self.prevent="flip(word)" @keydown.space.self.prevent="flip(word)">
            <view class="recitation-flipper">
              <view class="recitation-face recitation-front" :aria-hidden="!!flipped[word.id]"><text lang="fr">{{ label(word) }}</text></view>
              <view class="recitation-face recitation-back" :aria-hidden="!flipped[word.id]"><text lang="fr">{{ label(word) }}</text><text class="recitation-pos">{{ word.sourcePos||word.pos }}</text><text class="recitation-meaning">{{ primaryMeaning(word) }}</text><view v-if="flipped[word.id]" class="recitation-back-actions"><button hover-class="none" class="recitation-details" @click.stop="$emit('detail',word)" aria-label="详细释义 / Fiche du mot"><view class="recitation-detail-label"><text>释义</text><text>Fiche</text></view><Icon name="arrow" /></button><button v-if="isConjugationVerb(word)" hover-class="none" class="recitation-conjugation" @click.stop="openConjugation(word)"><text>查看变位</text><text>Conjugaison</text></button></view></view>
            </view>
          </view>
        </view>
      </view>
    </view>
    <view class="recitation-footer"><button v-if="hasConjugations" class="button secondary wide" hover-class="none" :disabled="busy" @click="$emit('conjugation')"><Icon name="grammar"/><Bi :zh="resumeConjugation?'继续变位':'变位练习'" :fr="resumeConjugation?'Reprendre':'Conjuguer'"/></button><button hover-class="none" class="button primary wide" :disabled="busy" @click="$emit('practice')"><Bi zh="进入练习" fr="Pratiquer" /><Icon name="arrow" /></button></view>
    <Transition name="page-fade"><ConjugationDetails v-if="detailWord" :word="detailWord" @close="closeConjugation" @audio="$emit('audio',$event)" /></Transition>
  </view>
</template>
<script setup>
import {computed,ref,onMounted,onUnmounted} from 'vue';
import Bi from './Bi.vue';import Icon from './Icon.vue';
import {primaryMeaning} from '../domain/meanings.js';
import ConjugationDetails from './ConjugationDetails.vue';
import {isConjugationVerb,isVocabularyWord,conjugationPracticeWords} from '../conjugation/catalog.js';
import {displayForm} from '../domain/word-display.js';import {getProgress} from '../domain/learning.js';
const props=defineProps({pkg:Object,data:Object,playing:String,busy:Boolean});
const emit=defineEmits(['audio','detail','practice','audio-stop','conjugation']);const flipped=ref({}),timers=new Map();
const resumeConjugation=computed(()=>Object.entries(props.data.conjugationSessions||{}).some(([key,s])=>key.startsWith(props.pkg.book.id+':'+props.pkg.lesson.id+':')&&!s.done&&!s.retired));
const practiceForms=computed(()=>conjugationPracticeWords(props.data,props.pkg));
const hasConjugations=computed(()=>practiceForms.value.length>0);
const detailWord=ref(null);
const byBase=computed(()=>{const map=new Map();for(const card of practiceForms.value){const id=card.conjugation.baseWordId;if(!map.has(id))map.set(id,[]);map.get(id).push(card);}return map;});
const learned=w=>{const forms=byBase.value.get(w.id)||[],units=[...(isVocabularyWord(w)?[w]:[]),...forms];return units.length>0&&units.every(card=>getProgress(props.data,props.pkg,card).notebook!=='practice');};
const groups=computed(()=>{const words=props.pkg.words.filter(w=>!w.conjugation);return [{id:'new',zh:'待背诵',fr:'À mémoriser',words:words.filter(w=>!isConjugationVerb(w)&&!learned(w))},{id:'irregular',zh:'动词变位',fr:'Conjugaison',words:words.filter(w=>isConjugationVerb(w)&&!learned(w))},{id:'learned',zh:'已学习',fr:'Déjà appris',words:words.filter(learned)}].filter(g=>g.words.length);});
const label=w=>w.forms.map(f=>displayForm(w,f)).join(' / ');
const longest=w=>Math.max(...label(w).split(/\s+/).map(s=>s.length));
function listen(word){const form=word.forms.find(f=>f.audioKey);if(form)emit('audio',form);}
function flip(word){clearTimeout(timers.get(word.id));if(flipped.value[word.id]){delete flipped.value[word.id];timers.delete(word.id);return;}flipped.value[word.id]=true;listen(word);timers.set(word.id,setTimeout(()=>{delete flipped.value[word.id];timers.delete(word.id);},3000));}
function openConjugation(word){clearTimeout(timers.get(word.id));detailWord.value=word;}
function closeConjugation(){const word=detailWord.value;detailWord.value=null;if(word&&flipped.value[word.id])timers.set(word.id,setTimeout(()=>{delete flipped.value[word.id];timers.delete(word.id);},3000));}
onMounted(()=>emit('audio-stop'));
onUnmounted(()=>{for(const timer of timers.values())clearTimeout(timer);emit('audio-stop');});
</script>