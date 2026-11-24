<script setup>
import {computed} from 'vue'
import {HARVEST_XP, plotStage, SHOP_GOODS} from './farm.js'

const props = defineProps({kind:String, profile:Object, now:Number, busy:Boolean})
const emit = defineEmits(['buy', 'tend'])
const stages = {
  empty:{label:'空地', action:'plant', button:'播种', resource:'seeds', missing:'需要 1 粒种子'},
  planted:{label:'已播种', action:'water', button:'浇水', resource:'water', missing:'需要 1 份水'},
  watered:{label:'已浇水'},
  ready:{label:'可收获', action:'harvest', button:'收获'},
}
const cells = computed(() => props.profile.plots.map((plot, index) => {
  const state = plotStage(plot, props.now)
  return {index, plot, state, ...stages[state]}
}))

function countdown(readyAt) {
  const seconds = Math.max(0, Math.ceil((readyAt - props.now) / 1000))
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2,'0')
}
</script>

<template>
  <div class="town-stock">
    <span v-if="kind==='shop'">余额 <strong>{{ profile.coins }}</strong> 金币</span>
    <span>种子 <strong>{{ profile.inventory.seeds }}</strong></span>
    <span>水 <strong>{{ profile.inventory.water }}</strong></span>
  </div>
  <ul v-if="kind==='shop'" class="shop-list">
    <li v-for="good in SHOP_GOODS" :key="good.key" class="shop-good">
      <div><strong>{{ good.name }}</strong><span>{{ good.contents }} · {{ good.price }} 金币</span></div>
      <div class="shop-action">
        <button :disabled="busy || profile.coins < good.price" :aria-label="'购买' + good.name"
          @click="emit('buy',good.key)">购买</button>
        <small v-if="profile.coins < good.price">还差 {{ good.price - profile.coins }} 金币</small>
      </div>
    </li>
  </ul>
  <template v-else>
    <p class="farm-help">浇水后 30 分钟可收获，离开游戏也会生长。</p>
    <ol class="farm-grid">
      <li v-for="cell in cells" :key="cell.index" class="farm-cell" :data-stage="cell.state">
        <div><span>第 {{ cell.index + 1 }} 格</span><strong>{{ cell.label }}</strong></div>
        <p v-if="cell.state==='watered'">距成熟 {{ countdown(cell.plot.readyAt) }}</p>
        <p v-else-if="cell.state==='ready'">收获奖励 {{ HARVEST_XP }} XP</p>
        <p v-else-if="cell.state==='planted'">浇水后开始生长</p>
        <p v-else>可种 1 粒种子</p>
        <button v-if="cell.action" :disabled="busy || !!cell.resource && profile.inventory[cell.resource] < 1"
          :aria-label="'第 ' + (cell.index + 1) + ' 格' + cell.button"
          @click="emit('tend',cell.index,cell.action)">{{ cell.button }}</button>
        <small v-if="cell.resource && !profile.inventory[cell.resource]">{{ cell.missing }}</small>
      </li>
    </ol>
  </template>
</template>

<style scoped>
.town-stock{display:flex;flex-wrap:wrap;gap:8px 16px;margin:10px 0 14px;color:var(--ui-b92a978fd0e0,#3b4d3c)}
.town-stock span{border-radius:6px;background:var(--ui-e9df8f700601,#e9efdc);padding:5px 8px}
.shop-list,.farm-grid{padding:0;margin:0;list-style:none}
.shop-good,.farm-cell{padding:10px;border:1px solid var(--ui-1ec16f4e4920,#c9cdb8);border-radius:8px;background:var(--ui-3599ab9684ab,#f9f6e8)}
.shop-good{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:8px}
.shop-good div{display:grid;gap:4px}
.shop-good span,.town-stock,.farm-help,.farm-cell p,.farm-cell span{font-size:13px}
.shop-action{text-align:right}
.shop-action small,.farm-cell small{color:var(--ui-df0f0a0596c8,#765036)}
.farm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.farm-cell div{display:flex;align-items:center;justify-content:space-between;gap:6px}
.farm-cell[data-stage=planted]{background:var(--ui-dc8bea486ed1,#f8f1da)}
.farm-cell[data-stage=watered]{background:var(--ui-2e82c49ba412,#e3eeed);border-color:var(--ui-f3d22815e80b,#bbd3cb)}
.farm-cell[data-stage=ready]{background:var(--ui-049cdabb065d,#e9f1d2);border-color:var(--ui-1ae38c5e28be,#b4c68b)}
.farm-cell p{margin:7px 0;color:var(--ui-07bcbf80e21e,#4c5947)}
.farm-cell small{display:block;margin-top:5px}
button{min-height:34px;padding:5px 11px;border-radius:6px;background:var(--ui-0a37db1b48d0,#315d45);color:white;font-weight:650}
button:disabled{background:var(--ui-e21b55aabbf9,#e5e5d7);color:var(--ui-a75f9766d7a5,#5a5d50);cursor:default}
</style>
