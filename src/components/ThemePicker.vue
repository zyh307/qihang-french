<template>
  <section class="glass settings-card theme-settings">
    <Bi zh="配色主题" fr="Couleurs" />
    <view class="theme-choices" role="group" aria-label="选择配色主题 / Choisir les couleurs">
      <button v-for="theme in COLOR_THEMES" :key="theme.id" hover-class="none" :class="['theme-choice',{selected:colorThemeId(value)===theme.id}]" :style="{'--choice-paper':theme.paper,'--choice-soft':theme.soft,'--choice-accent':theme.accent,'--choice-ink':theme.ink}" :aria-pressed="colorThemeId(value)===theme.id" :disabled="disabled" @click="$emit('change',theme.id)">
        <view class="theme-preview" aria-hidden="true"><view class="theme-preview-line"/><view class="theme-preview-line short"/><view class="theme-preview-button"/></view>
        <view class="theme-name"><Bi :zh="theme.zh" :fr="theme.fr" small/><Icon v-if="colorThemeId(value)===theme.id" name="check" /></view>
      </button>
    </view>
  </section>
</template>
<script setup>
import Bi from './Bi.vue';import Icon from './Icon.vue';
import {COLOR_THEMES,colorThemeId} from '../platform/color-theme.js';
defineProps({value:String,disabled:Boolean});defineEmits(['change']);
</script>
<style scoped>
.theme-settings>.bi{margin-bottom:16px}.theme-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.theme-choice{min-width:0;padding:10px;border:1px solid var(--line);border-radius:17px;background:#ffffffa8;box-sizing:border-box;text-align:left}.theme-choice.selected{border-color:var(--accent);box-shadow:0 0 0 2px rgba(var(--theme-rgb),.1)}
.theme-preview{height:48px;border-radius:11px;padding:10px;background:var(--choice-paper);border:1px solid var(--choice-soft);position:relative;overflow:hidden}.theme-preview-line{width:50%;height:5px;border-radius:5px;background:var(--choice-ink);opacity:.7}.theme-preview-line.short{width:34%;margin-top:7px;opacity:.22}.theme-preview-button{position:absolute;right:9px;bottom:9px;width:32%;height:13px;border-radius:5px;background:var(--choice-accent)}
.theme-name{display:flex;align-items:center;gap:7px;min-height:43px;padding:8px 2px 0}.theme-name>.bi{flex:1}.theme-name>.icon{width:17px;height:17px;color:var(--accent)}
@media(max-width:360px){.theme-choices{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.theme-choice{padding:8px}.theme-preview{height:44px}}
</style>
