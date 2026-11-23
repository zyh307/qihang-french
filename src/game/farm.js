export const GROWTH_MS = 30 * 60_000
export const HARVEST_XP = 12
export const SHOP_GOODS = [
  {key:'seeds', name:'种子包', contents:'3 粒种子', quantity:3, price:30},
  {key:'water', name:'水', contents:'1 份水', quantity:1, price:2},
]

const PLOT_COUNT = 4
const natural = value => Number.isSafeInteger(value) && value >= 0
export const emptyFarm = () => ({inventory:{seeds:0, water:0}, plots:Array(PLOT_COUNT).fill(null), xp:0})

function isPlot(plot) {
  return plot === null || Boolean(plot && natural(plot.plantedAt) && (
    (plot.wateredAt === null && plot.readyAt === null) ||
    (natural(plot.wateredAt) && plot.wateredAt >= plot.plantedAt && plot.readyAt === plot.wateredAt + GROWTH_MS)
  ))
}

export function validFarm(save) {
  return natural(save.inventory?.seeds) && natural(save.inventory?.water) && natural(save.xp) &&
    Array.isArray(save.plots) && save.plots.length === PLOT_COUNT && save.plots.every(isPlot)
}

export function buy(save, key) {
  const good = SHOP_GOODS.find(item => item.key === key)
  if (!good) throw new Error('找不到这件商品。')
  if (save.coins < good.price) throw new Error(`还差 ${good.price - save.coins} 金币。`)
  save.coins -= good.price
  save.inventory[key] += good.quantity
  return `已买入 ${good.contents}。`
}

export function plotStage(plot, now) {
  if (plot === null) return 'empty'
  if (plot.wateredAt === null) return 'planted'
  return now >= plot.readyAt ? 'ready' : 'watered'
}

export function levelProgress(xp) {
  // Completing n levels costs 24 + 36 + ... = 6n(n+3) experience.
  const steps = Math.floor((Math.sqrt(9 + xp * 2 / 3) - 3) / 2)
  return {level:steps + 1, current:xp - 6 * steps * (steps + 3), needed:24 + 12 * steps}
}

const fromStage = {plant:'empty', water:'planted', harvest:'ready'}

export function tend(save, index, action, now = Date.now()) {
  if (!Number.isInteger(index) || index < 0 || index >= PLOT_COUNT || !Object.hasOwn(fromStage, action)) {
    throw new Error('这块农田操作无效。')
  }
  const plot = save.plots[index]
  if (plotStage(plot, now) !== fromStage[action]) throw new Error('这块农田的状态已变，请再试。')
  if (action === 'plant') {
    if (!save.inventory.seeds) throw new Error('背包里没有种子。')
    save.inventory.seeds--
    save.plots[index] = {plantedAt:now, wateredAt:null, readyAt:null}
    return '已播种。浇水后开始生长。'
  }
  if (action === 'water') {
    if (!save.inventory.water) throw new Error('背包里没有水。')
    save.inventory.water--
    const wateredAt = Math.max(now, plot.plantedAt)
    save.plots[index] = {...plot, wateredAt, readyAt:wateredAt + GROWTH_MS}
    return '已浇水，30 分钟后可以收获。'
  }
  const before = levelProgress(save.xp).level
  save.plots[index] = null
  save.xp += HARVEST_XP
  const after = levelProgress(save.xp).level
  return after > before ? `收获 +${HARVEST_XP} XP，升到 Lv.${after}！` : `收获 +${HARVEST_XP} XP。`
}
