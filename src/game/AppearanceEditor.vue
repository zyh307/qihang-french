<script setup>
import {onMounted, ref, watch} from 'vue'
import {drawAvatar} from './graphics.js'
import {LAYERS} from './save.js'

const props = defineProps({modelValue:Object, art:Object, label:String, prefix:String})
const emit = defineEmits(['update:modelValue'])
const preview = ref(null)

function draw() {
  const ctx = preview.value?.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, 48, 48)
  drawAvatar(ctx, 24, 35, props.modelValue, 'down', 0, props.art)
}

watch([() => props.modelValue, () => props.art], draw, {flush:'post'})
onMounted(draw)
</script>

<template>
  <div class="character-editor">
    <div class="avatar-display">
      <canvas ref="preview" width="48" height="48" aria-label="角色外观预览" role="img"/>
      <b>{{ label || '角色预览' }}</b>
    </div>
    <div class="appearance-fields">
      <slot name="before"/>
      <div class="appearance">
        <div v-for="layer in LAYERS" :key="layer.id" class="appearance-field">
          <label :for="prefix + '-' + layer.id">{{ layer.label }}</label>
          <select :id="prefix + '-' + layer.id" :value="modelValue[layer.id]"
            @change="emit('update:modelValue', {...modelValue,[layer.id]:Number($event.target.value)})">
            <option v-for="(option,i) in layer.options" :key="option" :value="i">{{ option }}</option>
          </select>
        </div>
      </div>
      <slot name="after"/>
    </div>
  </div>
</template>

<style scoped>
.character-editor{display:grid;grid-template-columns:clamp(100px,24%,210px) minmax(0,1fr);gap:clamp(12px,3vw,26px)}
.avatar-display{min-width:0;display:grid;align-content:center;justify-items:center;gap:8px;background:var(--ui-38f471f3c828,#dbe3cb);border:1px solid var(--ui-14985e22a688,#cbd9bc);border-radius:12px;overflow:hidden;padding:8px;overflow-wrap:anywhere;font-size:14px}
.avatar-display canvas{width:96px;height:96px;image-rendering:pixelated}
.appearance{display:grid;grid-template-columns:repeat(auto-fit,minmax(65px,1fr));gap:8px;margin:4px 0 14px}
.appearance-field{display:grid;gap:5px;font-size:14px;font-weight:600}
select{width:100%;height:38px;border:1px solid var(--ui-020fe175317c,#aaba9e);border-radius:7px;background:var(--ui-9980255b5277,#fdfdf7);color:var(--ui-809655853b2a,#223e38);padding:5px 8px;font:inherit}
</style>
