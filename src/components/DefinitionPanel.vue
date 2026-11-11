<template>
  <view :class="['definition-screen',{'is-celebrating':celebrating}]">
    <view class="definition-title"><Icon name="book" /><Bi zh="释义" fr="Fiche du mot" small /><view v-if="showTools||allowRemove" class="definition-tools"><button v-if="allowRemove" hover-class="none" class="text-button" :disabled="busy" @click="$emit('remove')"><Icon name="trash"/><Bi zh="移除" fr="Retirer" small/></button><button v-if="showTools" hover-class="none" class="text-button" :disabled="busy||celebrating||practiceDisabled" @click="$emit('practice')"><Icon name="repeat" /><Bi zh="专练" fr="Pratiquer" small /></button><button v-if="showTools" hover-class="none" class="text-button" :disabled="busy||celebrating" @click="$emit('move')"><Icon name="notebook" /><Bi zh="词本" fr="Carnet" small /></button></view></view>
    <view class="definition-scroll">
      <WordCard :word="word" :allow-meaning-choice="!word.conjugation" :busy="busy" @primary-meaning="$emit('primary-meaning',$event)" :hide-favorite="!!word.conjugation" :favorite="favorite" :playing="playing" definition :show-source="!!word.curriculumAuthority||/^(?:inspire[1-4]|fos1)$/.test(word.origin?.bookId||pkg.book.id)" :source-label="sourceLabel||lessonSourceLabel(pkg)" @favorite="$emit('favorite',word)" @audio="$emit('audio',$event)" />
      <button v-if="canConjugate" class="button secondary conjugation-open" hover-class="none" @click="conjugationOpen=true"><Icon name="grammar"/><Bi zh="查看变位" fr="Voir la conjugaison" small/><Icon name="arrow"/></button>
      <slot />
    </view>
    <ConjugationDetails v-if="conjugationOpen" :word="word" :pkg="pkg" @close="conjugationOpen=false" @audio="$emit('audio',$event)"/>
    <view v-if="showContinue||allowKnown" class="exercise-footer definition-actions">
      <KnownAction v-if="allowKnown" :secondary="showContinue" :disabled="busy||celebrating" :known="known" @confirm="know"/>

      <button v-if="showContinue" hover-class="none" class="button primary" :disabled="busy||celebrating" @click="$emit('continue')"><Bi zh="继续" fr="Continuer" small /><Icon name="arrow" /></button>
    </view>
  </view>
</template>
<script setup>
import {ref,computed} from 'vue';
import KnownAction from './KnownAction.vue';
import ConjugationDetails from './ConjugationDetails.vue';
import {isConjugationVerb} from '../conjugation/catalog.js';
import {lessonSourceLabel} from '../domain/word-source.js';
import {playKnown} from '../platform/feedback-sounds.js';
import Bi from './Bi.vue';import Icon from './Icon.vue';import WordCard from './WordCard.vue';
const props=defineProps({pkg:Object,word:Object,sourceLabel:String,favorite:Boolean,playing:String,busy:Boolean,known:Boolean,allowKnown:{type:Boolean,default:true},showContinue:{type:Boolean,default:true},showTools:Boolean,allowRemove:Boolean,practiceDisabled:Boolean});
const emit=defineEmits(['favorite','audio','known','continue','practice','move','remove','primary-meaning']);
const conjugationOpen=ref(false),canConjugate=computed(()=>isConjugationVerb(props.word)||!!props.word?.conjugation);
const celebrating=ref(false);
function know(){
  if(props.busy||props.known||celebrating.value)return;
  celebrating.value=true;emit('known',props.word,saved=>{celebrating.value=false;if(saved!==false)playKnown();},props.pkg);
}
defineExpose({celebrating,closeConjugation(){if(conjugationOpen.value){conjugationOpen.value=false;return true;}return false;}});
</script>
