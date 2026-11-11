<template>
  <view class="recitation-panel">
    <view class="recitation-scroll">
      <view v-for="group in groups" :key="group.id" class="recitation-group">
        <view class="recitation-group-heading"><Bi :zh="group.zh" :fr="group.fr" small /><text>{{ group.words.length }}</text></view>
        <view class="recitation-grid">
          <view v-for="word in group.words" :key="word.id" :data-notebook-key="wordKey(pkg,word)" :class="['recitation-card',{'is-flipped':!word.conjugation&&!!flipped[word.id],'is-learned':group.id==='learned','is-long':longest(word)>13,'is-very-long':longest(word)>19}]" role="button" tabindex="0" :aria-pressed="word.conjugation?undefined:!!flipped[word.id]" :aria-label="word.conjugation?'查看变位 / Voir la conjugaison':'翻面查看中文 / Retourner la carte'" @click="flip(word)" @keydown.enter.self.prevent="flip(word)" @keydown.space.self.prevent="flip(word)">
            <view class="recitation-flipper">
              <view class="recitation-face recitation-front" :aria-hidden="!!flipped[word.id]"><text v-fit-card-text="label(word)" lang="fr">{{ label(word) }}</text></view>
              <view class="recitation-face recitation-back" :aria-hidden="!flipped[word.id]"><text v-fit-card-text="label(word)" lang="fr">{{ label(word) }}</text><view class="recitation-pos" :class="{'with-gender-emphasis':testsBothGenders(word)}"><text>{{ cardPartOfSpeech(word) }}</text><template v-if="testsBothGenders(word)"><text class="gender-emphasis">m.</text><text aria-hidden="true"> / </text><text class="gender-emphasis">f.</text></template></view><text class="recitation-meaning">{{ primaryMeaning(word) }}</text><view v-if="flipped[word.id]" class="recitation-back-actions"><button hover-class="none" class="recitation-details" @click.stop="word.conjugation?openConjugation(word):$emit('detail',word)" aria-label="详细释义 / Fiche du mot"><view class="recitation-detail-label"><text>释义</text><text>Fiche</text></view><Icon name="arrow" /></button><button v-if="isConjugationVerb(word)" hover-class="none" class="recitation-conjugation" @click.stop="openConjugation(word)"><text>查看变位</text><text>Conjugaison</text></button></view></view>
            </view>
          </view>
        </view>
      </view>
    </view>
    <view class="recitation-footer"><button v-if="hasConjugations" class="button secondary wide" hover-class="none" :disabled="busy" @click="$emit('conjugation')"><Icon name="grammar"/><Bi :zh="resumeConjugation?'继续变位':'变位练习'" :fr="resumeConjugation?'Reprendre':'Conjuguer'"/></button><button hover-class="none" class="button primary wide" :disabled="busy" @click="$emit('practice')"><Bi zh="进入练习" fr="Pratiquer" /><Icon name="arrow" /></button></view>
    <Transition name="page-fade"><ConjugationDetails v-if="detailWord" :key="detailWord.id" :word="detailWord" :pkg="pkg" @close="closeConjugation" @audio="$emit('audio',$event)" /></Transition>
  </view>
</template>
<script setup>
import {computed,ref,onMounted,onUnmounted} from 'vue';
import {vFitCardText} from '../ui/fit-card-text.js';
import Bi from './Bi.vue';import Icon from './Icon.vue';
import {primaryMeaning} from '../domain/meanings.js';
import ConjugationDetails from './ConjugationDetails.vue';
import {isConjugationVerb,isVocabularyWord,conjugationPracticeWords,conjugationUnits} from '../conjugation/catalog.js';
import {cardPartOfSpeech,testsBothGenders,displayForm} from '../domain/word-display.js';import {getProgress,wordKey} from '../domain/learning.js';
const props=defineProps({pkg:Object,data:Object,playing:String,busy:Boolean});
const emit=defineEmits(['audio','detail','practice','audio-stop','conjugation']);const flipped=ref({}),timers=new Map();
const resumeConjugation=computed(()=>Object.entries(props.data.conjugationSessions||{}).some(([key,s])=>key.startsWith(props.pkg.book.id+':'+props.pkg.lesson.id+':')&&!s.done&&!s.retired));
const practiceForms=computed(()=>conjugationPracticeWords(props.data,props.pkg));
const hasConjugations=computed(()=>practiceForms.value.length>0);
const detailWord=ref(null);
const unitRows=computed(()=>conjugationUnits(props.data,props.pkg));
const learned=w=>{const cards=w.conjugationUnit?unitRows.value.find(u=>u.w.id===w.id)?.cards||[]:[w];return cards.length>0&&cards.every(c=>getProgress(props.data,props.pkg,c).notebook!=='practice');};
const groups=computed(()=>{const originals=props.pkg.words.filter(isVocabularyWord),tenses=unitRows.value.map(u=>u.w);return [{id:'new',zh:'待背诵',fr:'À mémoriser',words:originals.filter(w=>!learned(w))},{id:'irregular',zh:'动词变位',fr:'Conjugaison',words:tenses.filter(w=>!learned(w))},{id:'learned',zh:'已学习',fr:'Déjà appris',words:[...originals,...tenses].filter(learned)}].filter(g=>g.words.length);});
const label=w=>w.conjugationUnit?w.conjugation.lemma+' · '+w.conjugation.tense:w.forms.map(f=>displayForm(w,f)).join(' / ');
const longest=w=>Math.max(...label(w).split(/\s+/).map(s=>s.length));
function listen(word){const form=word.forms.find(f=>f.audioKey);if(form)emit('audio',form);}
function flip(word){if(props.busy)return;if(word.conjugation){openConjugation(word);return;}clearTimeout(timers.get(word.id));if(flipped.value[word.id]){delete flipped.value[word.id];timers.delete(word.id);return;}flipped.value[word.id]=true;listen(word);timers.set(word.id,setTimeout(()=>{delete flipped.value[word.id];timers.delete(word.id);},3000));}
function openConjugation(word){if(props.busy)return;clearTimeout(timers.get(word.id));emit('audio-stop');detailWord.value=word;}
function closeConjugation(){const word=detailWord.value;detailWord.value=null;if(word&&flipped.value[word.id])timers.set(word.id,setTimeout(()=>{delete flipped.value[word.id];timers.delete(word.id);},3000));}
onMounted(()=>emit('audio-stop'));
onUnmounted(()=>{for(const timer of timers.values())clearTimeout(timer);emit('audio-stop');});
</script>
