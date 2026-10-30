<template>
  <view :class="['word-card','glass',{'definition-card':definition}]">
    <view class="word-heading"><view class="word-meaning"><text>{{ word.meanings.join('；') }}</text><text class="pos">{{ word.sourcePos || word.pos }}</text></view><button hover-class="none" class="icon-button favorite" :class="{ marked: favorite }" @click="$emit('favorite', word)" :aria-label="favorite ? '取消收藏 / Retirer des favoris' : '收藏 / Ajouter aux favoris'"><Icon name="heart" /></button></view>
    <view class="paired-forms">
      <template v-for="(form,index) in word.forms" :key="form.id">
        <text v-if="index" class="form-separator" aria-hidden="true">/</text>
        <view class="paired-form">
          <view class="paired-form-heading"><text class="french-word" lang="fr">{{ displayForm(word,form) }}</text><button hover-class="none" class="audio-button" role="button" :aria-disabled="!form.audioKey" :disabled="!form.audioKey" @click="$emit('audio',form)" :aria-label="`播放录音 / Écouter : ${displayForm(word,form)}`"><Icon name="sound" /></button></view>
          <view v-if="form.gender||!form.tested||(!sharedIpa&&form.ipa)" class="form-meta"><text v-if="form.gender" class="gender" :class="form.gender">{{ form.gender === 'm' ? '阳性 · m.' : '阴性 · f.' }}</text><text v-if="!form.tested" class="display-only">只看不考 · À découvrir</text><text v-if="form.ipa&&!sharedIpa" class="ipa">{{ form.ipa }}</text></view>
          <text class="audio-caption">{{ playing===form.id?'播放中 · Lecture':form.audioKey?'听发音 · Écouter':'暂无录音 · Sans audio' }}</text>
        </view>
      </template>
    </view>
    <text v-if="sharedIpa" class="shared-ipa">{{ sharedIpa }}</text>
    <view v-if="shared.example?.fr" class="example shared-example"><ExampleSentence class="example-fr" :text="shared.example.fr" :word="word" /><text v-if="shared.example.zh" class="example-zh">{{ shared.example.zh }}</text><view class="example-footer"><view v-if="shared.source||sourceLabel" class="source"><Icon name="book" /><text>{{ shared.source||sourceLabel }}</text></view><button hover-class="none" class="example-audio" :class="{active:playing===sentenceRecording?.id}" :disabled="!sentenceRecording" @click="$emit('audio',sentenceRecording)" aria-label="播放法语例句 / Écouter la phrase"><Icon name="sound" /><Bi zh="听例句" fr="Écouter" small /></button></view></view><view v-else-if="shared.source||sourceLabel" class="source"><Icon name="book" /><text>{{ shared.source||sourceLabel }}</text></view>
    <view v-if="word.patternNote&&!definition" class="pattern-note"><Icon name="info" /><text>{{ word.patternNote }}</text></view>
    <view v-if="actions" class="word-actions"><button hover-class="none" class="text-button single-word-practice" @click="$emit('practice', word)"><Bi :zh="practiceSession&&practiceSession.phase!=='done'?'继续专练':'单词专练'" :fr="practiceSession&&practiceSession.phase!=='done'?'Reprendre ce mot':'Pratiquer ce mot'" inline /></button><button hover-class="none" class="text-button subtle" @click="$emit('move', word)"><Bi zh="调整词本" fr="Changer de carnet" inline /></button></view>
  </view>
</template>
<script setup>
import { computed } from 'vue'; import ExampleSentence from './ExampleSentence.vue'; import Icon from './Icon.vue'; import Bi from './Bi.vue';
import { displayForm, sharedExample, exampleAudio } from '../domain/word-display.js';
const props=defineProps({ word: Object, favorite: Boolean, playing: String, actions: Boolean,practiceSession:Object,definition:Boolean,sourceLabel:String }); defineEmits(['favorite', 'audio', 'practice', 'move']);
const shared=computed(()=>sharedExample(props.word));
const sentenceRecording=computed(()=>exampleAudio(props.word));
const sharedIpa=computed(()=>{const values=[...new Set(props.word.forms.map(f=>f.ipa).filter(Boolean))];return values.length===1?values[0]:null;});
</script>
