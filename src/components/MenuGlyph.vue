<template><view :class="['icon','menu-glyph',{'is-open':opened}]" aria-hidden="true"><view/><view/><view/></view></template>
<script setup>
import {ref,watch,onMounted,nextTick} from 'vue';
const props=defineProps({open:Boolean}),opened=ref(false);
watch(()=>props.open,value=>opened.value=value);
onMounted(()=>nextTick(()=>opened.value=props.open));
</script>
