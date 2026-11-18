<script setup>
import {computed} from 'vue'
const props = defineProps({text:String, result:Object})
const labels = {good:'匹配',bad:'需重读',maybe:'待确认',idle:'未判定'}
const pieces = computed(() => {
  let index = 0
  function markPart([part]) {
    if (!/[\p{L}\p{N}]/u.test(part)) return {part}
    const i = index++, word = props.result?.words?.[i]
    const mark = word?.mark || (props.result?.status === 'uncertain' ? 'maybe' : 'idle')
    return {part,mark,i,label:labels[mark],order:word?.op === 'order'}
  }
  // Keep apostrophes, the comma, and French spaced punctuation with the spoken word.
  return Array.from(props.text.matchAll(/\S+(?:[ \u00a0\u202f]+[?!:;»]+)?|\s+/gu), ([word]) =>
    /^\s+$/u.test(word) ? word : Array.from(word.matchAll(/[\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+/gu), markPart))
})
</script>
<template><span lang="fr" class="word-line"><template v-for="(group,i) in pieces" :key="i"><template v-if="typeof group==='string'">{{group}}</template><span v-else class="lexeme"><template v-for="(p,j) in group" :key="j"><span v-if="p.mark" :class="['word',p.mark,{lit:result}]" :style="{'--wait': Math.min(p.i*38,510)+'ms'}" :aria-label="p.part+'，'+p.label" :title="p.label">{{p.part}}<sup v-if="p.order">↔</sup></span><template v-else>{{p.part}}</template></template></span></template></span></template>
<style scoped>.lexeme{display:inline-block;white-space:nowrap}</style>
