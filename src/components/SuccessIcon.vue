<template><Icon ref="icon" :name="name" :data-success-key="itemKey" :data-success-active="String(active)" /></template>
<script setup>
import {ref,watch,onMounted} from 'vue';
import Icon from './Icon.vue';
import {celebrateFavorite} from '../platform/interaction-motion.js';
const props=defineProps({name:{type:String,default:'heart'},active:Boolean,itemKey:{type:String,required:true}}),icon=ref(null);
function celebrate(){celebrateFavorite(icon.value?.$el||icon.value,props.itemKey);}
watch(()=>props.active,(active,old)=>{if(active&&!old)celebrate();},{flush:'post'});
// A saved Lesson may move into the priority section and mount at a new spot.
// Only a pending user click can celebrate; initial/restored favorites stay still.
onMounted(()=>{if(props.active)celebrate();});
</script>
