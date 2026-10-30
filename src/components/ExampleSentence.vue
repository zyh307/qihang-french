<template><text lang="fr"><text v-for="(part,index) in parts" :key="index" :class="{'sentence-mark':part.hit}">{{ part.text }}</text></text></template>
<script setup>
import {computed} from 'vue';import {highlightExample} from '../domain/example-highlight.js';
const props=defineProps({text:String,word:Object});const parts=computed(()=>highlightExample(props.text,props.word));
</script>
