<script setup>
import {computed} from 'vue'

const props = defineProps({id:String, focus:Array, support:Array})
const skills = ['发音清晰', '停顿节奏', '词形准确', '临场应答', '组织表达', '听题理解']
const center = {x:140, y:101}
const axes = skills.map((label, index) => ({label, angle:index * Math.PI / 3 - Math.PI / 2}))

function position(axis, radius) {
  return {x:center.x + radius * Math.cos(axis.angle), y:center.y + radius * Math.sin(axis.angle)}
}

function polygon(radius) {
  return axes.map(axis => {
    const {x, y} = position(axis, radius(axis))
    return `${x},${y}`
  }).join(' ')
}

const rings = [34, 68].map(radius => polygon(() => radius))
const spokes = computed(() => axes.map(axis => {
  const level = props.focus.includes(axis.label) ? 2 : props.support.includes(axis.label) ? 1 : 0
  const end = position(axis, 68)
  const label = position(axis, axis.label === skills[0] || axis.label === skills[3] ? 85 : 88)
  return {name:axis.label, level, end, label, point:position(axis, level * 34),
    anchor:Math.abs(label.x - center.x) < 1 ? 'middle' : label.x < center.x ? 'end' : 'start'}
}))
const profile = computed(() => spokes.value.map(({point}) => `${point.x},${point.y}`).join(' '))
const description = computed(() => `训练侧重。主练${props.focus.join('、')}。兼练${props.support.join('、')}。`)
</script>

<template>
  <span :id="id" class="practice-skills" role="img" :aria-label="description">
    <svg viewBox="0 0 280 201" aria-hidden="true" focusable="false">
      <polygon v-for="ring in rings" :key="ring" :points="ring" class="skill-ring"/>
      <line v-for="axis in spokes" :key="axis.name" :x1="center.x" :y1="center.y"
        :x2="axis.end.x" :y2="axis.end.y" class="skill-spoke"/>
      <polygon :points="profile" class="skill-profile"/>
      <template v-for="axis in spokes" :key="axis.name">
        <circle v-if="axis.level" :cx="axis.point.x" :cy="axis.point.y" :r="axis.level === 2 ? 4.5 : 3.5"
          class="skill-point" :class="{'skill-focus':axis.level === 2}"/>
        <text :x="axis.label.x" :y="axis.label.y" :text-anchor="axis.anchor" dominant-baseline="central"
          :class="{'skill-label-focus':axis.level === 2}">{{ axis.name }}</text>
      </template>
    </svg>
    <span class="skill-main" aria-hidden="true"><b>主练</b> {{ focus.join('、') }}</span>
  </span>
</template>

<style scoped>
.practice-skills{display:grid;justify-items:center;gap:2px;width:100%;padding:3px 0 8px;color:var(--skill-ink,#235544);font-family:inherit;font-style:normal;text-align:center}
svg{display:block;width:100%;max-width:280px;overflow:visible}
.skill-ring{fill:none;stroke:var(--ui-84faa42c57c9,#9cae9f);stroke-width:1}
.skill-spoke{stroke:var(--ui-b80f170b8107,#b7c7ba);stroke-width:1}
.skill-profile{fill:currentColor;fill-opacity:.15;stroke:currentColor;stroke-width:1.4;stroke-linejoin:round}
.skill-point{fill:var(--ui-697454aaa548,#f9fbf8);stroke:currentColor;stroke-width:1.6}
.skill-focus{fill:currentColor;stroke:var(--ui-697454aaa548,#f9fbf8);stroke-width:1.3}
text{fill:var(--sub);font:13px "Microsoft YaHei","Segoe UI",sans-serif}
.skill-label-focus{fill:currentColor;font-weight:700}
.skill-main{font-size:13px;line-height:1.55;font-weight:600}
.skill-main b{display:inline-block;margin-right:3px;padding:2px 6px;border:1px solid currentColor;border-radius:4px;font-size:11px;line-height:1.2}
</style>
