<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue'
import AppearanceEditor from './AppearanceEditor.vue'
import {loadArt, makeRenderer} from './graphics.js'
import {buy, levelProgress, plotStage, tend} from './farm.js'
import {portalTitle} from './practiceBridge.js'
import {changeSave, defaultAppearance, loadSave, makeSave, persist, SAVE_KEY, validName} from './save.js'
import {doorUnder, movement, nearby, NODES, TILE, transition, ZONES} from './world.js'
import TownPanel from './TownPanel.vue'
import OpeningStory from './OpeningStory.vue'
import RadioHud from './RadioHud.vue'

const props = defineProps({autoEnter:Boolean, returnMessage:String, radio:Object, immersive:Boolean})
const emit = defineEmits(['leave', 'created', 'adventure'])
const forceCc0 = new URLSearchParams(location.search).get('assetSource') === 'cc0'
const loaded = loadSave()
const profile = ref(loaded.save)
const assetSource = computed(() => forceCc0 ? 'cc0' : profile.value?.assetSource || 'private')
const error = ref(loaded.error || '')
const name = ref('')
const appearance = ref(defaultAppearance())
const outfit = ref(defaultAppearance()), draftSource = ref('private')
const intro = ref(false), introSaving = ref(false)
const playing = ref(false)
const player = ref(profile.value?.position)
const canvas = ref(null), viewport = ref(null), action = ref(null), dialog = ref(null)
const scale = ref(2)
const viewportSize = shallowRef({width:0,height:0})
const modal = ref(null)
const opening = ref(false)
const working = ref(false), townNotice = ref(''), townError = ref('')
const clock = ref(Date.now())
const zone = computed(() => ZONES[player.value?.zone])
const closest = computed(() => player.value && nearby(player.value))
const farmBox = computed(() => player.value?.zone === 'home' ? zone.value.props.find(box => box.kind === 'farm') : null)
const actions = {
  home:{farm:{kind:'farm', label:'农田'}, bed:{kind:'wardrobe', label:'换装'}},
  shop:{counter:{kind:'shop', label:'商店'}},
}
const town = computed(() => {
  const p = player.value
  const byProp = actions[p?.zone]
  if (!byProp) return null
  for (const box of zone.value.props) {
    const interaction = byProp[box.kind]
    if (!interaction) continue
    const dx = Math.max(box.x - p.x, 0, p.x - box.x - box.w)
    const dy = Math.max(box.y - p.y, 0, p.y - box.y - box.h)
    if (Math.hypot(dx, dy) <= 1.35) return {...interaction, x:box.x + box.w / 2, y:box.y}
  }
  return null
})
const level = computed(() => levelProgress(profile.value?.xp || 0))
const plotMarkers = {planted:'种', watered:'水', ready:'熟'}
const gateTitle = nodeId => portalTitle(nodeId, profile.value.unlocked)
const unlockedGates = computed(() => player.value?.zone === 'field' ?
  NODES.filter(node => profile.value.unlocked.includes(node.id) && node.id !== closest.value?.id) : [])
const sceneStyle = computed(() => {
  const {cols,rows} = zone.value
  const tile = TILE * scale.value
  const width = cols * tile
  const height = rows * tile
  const style = {width:width+'px',aspectRatio:cols+' / '+rows}
  if (!props.immersive) return style
  const view = viewportSize.value
  const left = Math.max(0,Math.min(width-view.width,player.value.x*tile-view.width/2))
  const top = Math.max(0,Math.min(height-view.height,player.value.y*tile-view.height/2))
  return {...style,left:-left+'px',top:-top+'px'}
})
const art = shallowRef({})
let artRevision = 0
let raf, lastFrame, renderer, resizeObserver, clockTimer, dirty = false, checkpointAt = 0
const keys = new Set()
const moveKeys = new Map([
  ['w', 'up'], ['arrowup', 'up'], ['s', 'down'], ['arrowdown', 'down'],
  ['a', 'left'], ['arrowleft', 'left'], ['d', 'right'], ['arrowright', 'right'],
])

function point(x, y) {
  return {left: x / zone.value.cols * 100 + '%', top: y / zone.value.rows * 100 + '%'}
}

const plotPosition = index => point(farmBox.value.x + (17 + index % 2 * 29) / TILE,
  farmBox.value.y + (17 + Math.floor(index / 2) * 28) / TILE)

function setArt(images) {
  art.value = images
  if (canvas.value) renderer = makeRenderer(canvas.value, images)
}
async function refreshArt(source) {
  const revision = ++artRevision
  setArt({})
  const images = await loadArt(source)
  if (revision === artRevision) setArt(images)
}

async function savePosition() {
  if (!profile.value || !dirty) return true
  const position = {...player.value}
  const id = profile.value.character.id
  dirty = false
  try {
    await changeSave(save => {
      if (save.character.id !== id) throw new Error('角色已变更。')
      save.position = position
    })
    return true
  } catch {
    dirty = true
    error.value = '角色位置暂时保存不了。请检查浏览器存储。'
    return false
  }
}

function create() {
  const id = name.value.trim()
  if (!validName(id)) {
    error.value = '角色 ID 请用 2–12 个汉字、英文字母、数字或下划线。'
    return
  }
  const save = makeSave(id, appearance.value)
  if (!persist(save)) {
    error.value = '角色暂时保存不了。请检查浏览器存储。'
    return
  }
  profile.value = save
  emit('created', id)
  requestEnter()
}

function requestEnter() {
  if (profile.value.introSeen) enter()
  else { error.value = '';intro.value = true }
}

async function finishIntro() {
  if (introSaving.value) return
  if (profile.value.introSeen) {
    intro.value = false
    await enter()
    return
  }
  introSaving.value = true
  try {
    profile.value = await changeSave(save => {
      if (save.character.id !== profile.value.character.id) throw new Error('角色已变更。')
      save.introSeen = true
      return save
    })
    intro.value = false
    await enter()
  } catch (err) { error.value = err.message }
  finally { introSaving.value = false }
}

function resize() {
  if (viewport.value && zone.value) {
    const width = viewport.value.clientWidth
    if (props.immersive) {
      const height = viewport.value.clientHeight
      viewportSize.value = {width,height}
      scale.value = Math.max((width+1)/(TILE*zone.value.cols),(height+1)/(TILE*zone.value.rows))
      return
    }
    const height = window.innerHeight - viewport.value.getBoundingClientRect().top - 68
    const fit = Math.floor(Math.min(width / (TILE * zone.value.cols), height / (TILE * zone.value.rows)))
    scale.value = Math.min(3, Math.max(1, fit))
  }
}

async function enter() {
  if (playing.value) return
  playing.value = true
  player.value = {...profile.value.position}
  error.value = ''
  await nextTick()
  if (!canvas.value) return
  resize()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(viewport.value)
  renderer = makeRenderer(canvas.value, art.value)
  canvas.value.focus({preventScroll:true})
  raf = requestAnimationFrame(tick)
}

function tick(now) {
  const elapsed = lastFrame === undefined ? 0 : (now - lastFrame) / 1000
  lastFrame = now
  let walking = false
  if (!modal.value && keys.size) {
    const directions = new Set([...keys].map(key => moveKeys.get(key)))
    const x = Number(directions.has('right')) - Number(directions.has('left'))
    const y = Number(directions.has('down')) - Number(directions.has('up'))
    const current = player.value
    const next = movement(current, x, y, elapsed)
    walking = next.x !== current.x || next.y !== current.y
    player.value = next
    dirty ||= walking || next.facing !== current.facing
    const door = walking && doorUnder(next)
    if (door) {
      player.value = transition(door)
      keys.clear()
      savePosition()
      resize()
    }
  }
  renderer(player.value, profile.value.character.appearance, now, walking)
  if (dirty && now - checkpointAt > 700) {
    checkpointAt = now
    savePosition()
  }
  raf = requestAnimationFrame(tick)
}

function openInteraction() {
  const entrance = closest.value ? {kind:'rift', id:closest.value.id} : town.value
  if (!entrance || modal.value) return
  openPanel(entrance)
}

function openPanel(entrance) {
  keys.clear()
  townNotice.value = '';townError.value = ''
  refreshTime()
  if (entrance.kind === 'wardrobe') outfit.value = {...profile.value.character.appearance}
  if (entrance.kind === 'settings') draftSource.value = profile.value.assetSource
  modal.value = entrance
  nextTick(() => action.value?.focus({preventScroll:true}))
}

async function startPractice() {
  if (opening.value) return
  const node = modal.value
  opening.value = true
  try {
    if (await savePosition() && modal.value === node) emit('adventure', node.id)
  } finally { opening.value = false }
}

function closePanel() {
  modal.value = null
  nextTick(() => canvas.value?.focus({preventScroll:true}))
}

async function townChange(update) {
  if (working.value) return false
  working.value = true
  townNotice.value = '';townError.value = ''
  try {
    const committed = await changeSave(save => {
      if (save.character.id !== profile.value.character.id) throw new Error('角色已变更。')
      return {save, message:update(save)}
    })
    profile.value = committed.save
    townNotice.value = committed.message
    return true
  } catch (err) {
    townError.value = err.message
    refreshProfile()
    return false
  } finally {
    refreshTime()
    working.value = false
    await nextTick()
    if (dialog.value && !dialog.value.contains(document.activeElement)) action.value?.focus()
  }
}

function saveOutfit() {
  const look = {...outfit.value}, panel = modal.value
  return townChange(save => {
    save.character.appearance = look
    return '已保存外观。'
  }).then(ok => { if (ok && modal.value === panel) closePanel() })
}

function saveSettings() {
  if (forceCc0) return
  const source = draftSource.value, panel = modal.value
  return townChange(save => {
    save.assetSource = source
    return '已保存画面设置。'
  }).then(ok => { if (ok && modal.value === panel) closePanel() })
}

function refreshTime() { clock.value = Date.now() }
function refreshProfile() {
  refreshTime()
  const {save} = loadSave()
  if (save?.character.id === profile.value?.character.id) profile.value = save
}
function storageChanged(event) { if (event.key === SAVE_KEY) refreshProfile() }
function visible() { if (!document.hidden) refreshProfile() }

function keydown(event) {
  if (!playing.value || event.altKey || event.ctrlKey || event.metaKey) return
  const key = event.key.toLowerCase()
  if (key === 'm' && !modal.value && !intro.value && !event.repeat && !event.isComposing &&
      !event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])') &&
      props.radio?.ui.supported) {
    event.preventDefault()
    props.radio.setMuted()
    return
  }
  if (key === 'escape' && modal.value) {
    event.preventDefault()
    closePanel()
  } else if (key === 'tab' && dialog.value) {
    const controls = dialog.value.querySelectorAll('button:not(:disabled), select:not(:disabled)')
    const edge = event.shiftKey ? controls[0] : controls[controls.length - 1]
    if (!dialog.value.contains(event.target) || event.target === edge) {
      event.preventDefault()
      const target = event.shiftKey ? controls[controls.length - 1] : controls[0]
      target?.focus()
    }
  } else if (!modal.value && event.target === canvas.value) {
    if (moveKeys.has(key)) {
      event.preventDefault()
      keys.add(key)
    } else if (key === ' ' || key === 'enter') {
      event.preventDefault()
      if (!event.repeat) openInteraction()
    }
  }
}

function keyup(event) { keys.delete(event.key.toLowerCase()) }
function suspend() { keys.clear(); savePosition() }

watch(assetSource, refreshArt)
watch(() => props.autoEnter, active => { if (active && profile.value) enter() })
onMounted(() => {
  window.addEventListener('keydown', keydown)
  window.addEventListener('keyup', keyup)
  window.addEventListener('blur', suspend)
  window.addEventListener('pagehide', suspend)
  window.addEventListener('resize', resize)
  window.addEventListener('storage', storageChanged)
  document.addEventListener('visibilitychange', visible)
  clockTimer = setInterval(refreshTime, 1000)
  if (props.autoEnter && profile.value) enter()
  refreshArt(assetSource.value)
})
onBeforeUnmount(() => {
  ++artRevision
  suspend()
  cancelAnimationFrame(raf)
  clearInterval(clockTimer)
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', keydown)
  window.removeEventListener('keyup', keyup)
  window.removeEventListener('blur', suspend)
  window.removeEventListener('pagehide', suspend)
  window.removeEventListener('resize', resize)
  window.removeEventListener('storage', storageChanged)
  document.removeEventListener('visibilitychange', visible)
})
</script>

<template>
  <OpeningStory v-if="intro" :busy="introSaving" :error="error" :local-audio="!forceCc0" @complete="finishIntro"/>
  <section v-else-if="!playing" class="game-landing" :class="{'town-landing':immersive}">
    <div class="game-intro">
      <p lang="fr">Le village des mots</p>
      <h1>口语小镇</h1>
      <p v-if="profile">{{ profile.character.id }}，继续探索你上次到达的地方。</p>
      <p v-else>挑一个角色，从家门口出发。</p>
      <button v-if="profile" class="game-primary" @click="requestEnter">继续冒险</button>
      <button v-if="profile?.introSeen" class="game-secondary replay-story" @click="error='';intro=true">重看四格开场</button>
      <p v-if="error" class="game-error" role="alert">{{ error }}</p>
    </div>
    <form v-if="!profile && !loaded.error" class="character" @submit.prevent="create">
      <AppearanceEditor v-model="appearance" :art="art" :label="name.trim()" prefix="create-look">
        <template #before>
          <h2>创建角色</h2>
          <label class="name-label">角色 ID
            <input v-model="name" autocomplete="off" aria-describedby="game-id-help"/>
          </label>
          <p id="game-id-help">2–12 个汉字、英文字母、数字或下划线</p>
        </template>
        <template #after><button class="game-primary" type="submit">创建并出发</button></template>
      </AppearanceEditor>
    </form>
  </section>
  <section v-else class="world" :class="{'town-world':immersive}">
    <header class="world-head">
      <div><p class="zone-fr" lang="fr">{{ zone.subtitle }}</p><h1 aria-live="polite">{{ zone.title }}</h1></div>
      <div class="world-account">
        <span class="player-id">{{ profile.character.id }}</span>
        <span class="player-id">金币 <strong>{{ profile.coins }}</strong></span>
        <div class="player-id level" aria-label="角色等级与经验">
          <strong>Lv.{{ level.level }}</strong>
          <progress :value="level.current" :max="level.needed" aria-label="本级经验"/>
          <small>{{ level.current }} / {{ level.needed }} XP</small>
        </div>
        <button class="game-secondary" :inert="!!modal" @click="openPanel({kind:'settings',label:'画面设置'})">画面设置</button>
        <RadioHud v-if="radio" :radio="radio" :blocked="!!modal"/>
      </div>
    </header>
    <div ref="viewport" class="world-viewport">
      <div class="map-frame" :style="sceneStyle">
        <canvas ref="canvas" tabindex="0" aria-describedby="game-controls" :aria-label="zone.title + '地图'" role="img"
          :inert="!!modal"/>
        <span v-for="box in zone.props.filter(box => box.label)" :key="box.kind + box.x" class="map-label"
          :style="point(box.x + box.w / 2, box.y + box.h / 2)">{{ box.kind==='bed' ? '床边换装' : box.label }}</span>
        <template v-if="farmBox">
          <template v-for="(plot,index) in profile.plots" :key="index">
            <span v-if="plot" class="plot-marker" :data-stage="plotStage(plot,clock)" :style="plotPosition(index)" aria-hidden="true">
              {{ plotMarkers[plotStage(plot,clock)] }}
            </span>
          </template>
        </template>
        <span v-for="door in zone.doors" :key="door.to" class="map-label door-label"
          :style="point(door.x + (door.x === 0 ? 1.5 : door.x === zone.cols - 1 ? -0.5 : 0.5), door.y === 0 ? 1.5 : door.y - 0.45)">
          {{ door.label }}
        </span>
        <span v-for="node in unlockedGates" :key="node.id" class="map-label"
          :style="point(node.x, node.y - 1.15)">{{ gateTitle(node.id) }}</span>
        <aside v-if="closest && !modal" class="rift-hint" :style="point(closest.x, closest.y - 0.75)" role="status">
          开始「{{ gateTitle(closest.id) }}」冒险？ <kbd>空格</kbd>
        </aside>
        <aside v-else-if="town && !modal" class="rift-hint town-hint" :style="point(town.x, town.y)" role="status">
          {{ town.label }} <kbd>空格</kbd>
        </aside>
        <div v-if="modal" class="rift-overlay" :class="{'town-overlay':modal.kind!=='rift'}">
          <section ref="dialog" class="rift-dialog" :class="{'town-dialog':modal.kind!=='rift'}"
            role="dialog" aria-modal="true" aria-labelledby="game-panel-title">
            <template v-if="modal.kind==='rift'">
              <h2 id="game-panel-title">开始「{{ gateTitle(modal.id) }}」冒险？</h2>
              <p>至少独立通过一项，就能解锁名字。每天首次通关可领金币。</p>
              <div class="dialog-choices">
                <button ref="action" class="game-primary" :disabled="opening" @click="startPractice">
                  {{ profile.pending[modal.id] ? '继续冒险' : '进入冒险' }}
                </button>
                <button class="game-secondary" @click="closePanel">取消</button>
              </div>
            </template>
            <template v-else>
              <h2 id="game-panel-title">{{ modal.label }}</h2>
              <AppearanceEditor v-if="modal.kind==='wardrobe'" v-model="outfit" class="outfit-editor"
                :art="art" :label="profile.character.id" prefix="wardrobe-look"/>
              <div v-else-if="modal.kind==='settings'" class="scene-settings">
                <label for="game-art-source">地图和角色素材</label>
                <select id="game-art-source" v-model="draftSource" :disabled="forceCc0">
                  <option value="private">本机素材</option><option value="cc0">内置图形</option>
                </select>
                <p v-if="forceCc0">此试玩链接固定使用内置图形。</p>
                <p v-else>本机素材缺失时会显示内置图形。</p>
              </div>
              <TownPanel v-else :kind="modal.kind" :profile="profile" :now="clock" :busy="working"
                @buy="key=>townChange(save=>buy(save,key))"
                @tend="(index,action)=>townChange(save=>tend(save,index,action))"/>
              <p v-if="townNotice" class="game-receipt" role="status">{{ townNotice }}</p>
              <p v-if="townError" class="game-error" role="alert">{{ townError }}</p>
              <div class="dialog-choices town-close">
                <button v-if="modal.kind==='wardrobe'" class="game-primary" :disabled="working" @click="saveOutfit">保存换装</button>
                <button v-else-if="modal.kind==='settings'&&!forceCc0" class="game-primary" :disabled="working" @click="saveSettings">保存设置</button>
                <button ref="action" class="game-secondary" @click="closePanel">返回地图</button>
              </div>
            </template>
          </section>
        </div>
      </div>
    </div>
    <footer id="game-controls" class="world-controls">
      <span><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> 或方向键移动</span>
      <span><kbd>空格</kbd> / <kbd>回车</kbd> 交互</span>
      <button v-if="!immersive" class="game-secondary" :inert="!!modal" @click="emit('leave')">返回日常练习</button>
    </footer>
    <p v-if="!modal && (townNotice || returnMessage)" class="game-receipt" role="status">{{ townNotice || returnMessage }}</p>
    <p v-if="error" class="game-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.game-landing,.world{max-width:960px;margin:32px auto 0}
.game-intro,.character,.world{border:1px solid var(--ui-c03293a37481,#d5ddc9);border-radius:18px;background:var(--ui-81309ffb5573,#f6f5eb)}
.game-intro{padding:25px 30px;background:var(--ui-bc7ac8f39ebd,#e8eedc)}
.game-intro p[lang],.zone-fr{margin:0 0 5px;color:var(--ui-b68e019c4de2,#576848);font:italic 16px Georgia,serif}
.game-intro h1,.world h1{color:var(--ui-193c2dc564a7,#233f31)}
.game-intro p:not([lang]){margin:10px 0 15px;color:var(--ui-24a4b0b39857,#384e40)}
.replay-story{margin-left:8px}
.character{margin-top:16px;padding:23px}
.character h2{margin:0 0 12px}
.name-label{display:grid;gap:5px;font-size:14px;font-weight:600}
.name-label input,.scene-settings select{width:100%;height:38px;border:1px solid var(--ui-020fe175317c,#aaba9e);border-radius:7px;background:var(--ui-9980255b5277,#fdfdf7);color:var(--ui-809655853b2a,#223e38);padding:5px 8px;font:inherit}
.name-label input{max-width:240px}
#game-id-help{margin:4px 0 14px;font-size:13px;color:var(--ui-54ffdeaa4e43,#506253)}
.game-primary,.game-secondary{padding:8px 14px;border-radius:7px;min-height:38px;font-weight:650}
.game-primary{background:var(--ui-0a37db1b48d0,#315d45);color:white}
.game-secondary{background:var(--ui-779336caea08,#ecf0e3);color:var(--ui-e5993ce870e1,#344b3d);border:1px solid var(--ui-246e27a50913,#c5d1bd)}
.game-error{color:var(--ui-29491b380df4,#921f38)}
.world{padding:16px clamp(12px,3vw,26px);background:var(--ui-2d85834d82c4,#f0f0e4)}
.world-head,.world-controls{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.world-head{padding-bottom:12px}
.world h1{font-size:30px}
.player-id{border:1px solid var(--ui-1203756d0ffe,#bdcbb6);border-radius:8px;padding:6px 10px;color:var(--ui-4c4a38587068,#395345);overflow-wrap:anywhere}
.world-account{display:flex;gap:8px;flex-wrap:wrap}
.level{display:flex;gap:6px;align-items:center}
.level progress{width:68px;height:9px;accent-color:var(--ui-8ede64087988,#507c54)}
.game-receipt{margin:10px 0 0;color:var(--ui-0a37db1b48d0,#315d45);font-weight:650}
.world-viewport{overflow:auto;background:var(--ui-eff954839d04,#e1e6d5);border:1px solid var(--ui-b66454993467,#bdc8ac);border-radius:10px;padding:0}
.map-frame{position:relative;margin:auto}
.town-landing{min-height:100dvh;max-width:none;margin:0;padding:8px 12px 12px 60px;background:var(--ui-bc7ac8f39ebd,#e8eedc)}
.town-world{position:relative;height:100dvh;max-width:none;margin:0;padding:0;border:0;border-radius:0}
.town-world .world-viewport{position:absolute;inset:0;overflow:hidden;border:0;border-radius:0}
.town-world .map-frame{position:absolute;margin:0}
.town-world .world-head{position:absolute;z-index:1;inset:8px 12px auto 60px;align-items:flex-start;padding:0;pointer-events:none}
.town-world .world-head>div:first-child,.town-world .player-id{background:var(--ui-81309ffb5573,#f6f5eb)}
.town-world .world-head>div:first-child{padding:5px 10px;border-radius:8px}
.town-world .world-head h1{font-size:20px}
.town-world .zone-fr{margin-bottom:0;font-size:13px}
.town-world .world-account{pointer-events:auto}
.town-world .world-controls,.town-world .game-receipt,.town-world .game-error{position:absolute;z-index:1;left:8px;margin:0;padding:5px 8px;border-radius:8px;background:var(--ui-81309ffb5573,#f6f5eb)}
.town-world .world-controls{bottom:8px}
.town-world .game-receipt,.town-world .game-error{bottom:49px}
.town-world .rift-overlay{position:fixed;z-index:20}
.map-frame>canvas{display:block;width:100%;height:100%;image-rendering:pixelated}
.map-frame>canvas:focus-visible{outline:3px solid var(--ui-42cc39660890,#365446);outline-offset:-3px}
.map-label,.rift-hint{position:absolute;transform:translate(-50%,-50%);pointer-events:none}
.plot-marker{position:absolute;transform:translate(-50%,-50%);pointer-events:none;padding:2px 4px;border-radius:3px;background:var(--ui-d65ba2a66cdc,#e9d499);color:var(--ui-40710b63d5d6,#513925);font-size:11px;font-weight:700}
.plot-marker[data-stage=watered]{background:var(--ui-a53ba676613a,#cfe8e3);color:var(--ui-234753ed9d32,#224f54)}
.plot-marker[data-stage=ready]{background:var(--ui-5dc12f893a80,#d6eb9d);color:var(--ui-aecf74e76d0e,#325221)}
.map-label{padding:2px 5px;border-radius:3px;background:var(--ui-ba99946b4a23,#342b27dc);color:var(--ui-232eeccc2f48,#fff6dc);font-size:11px;white-space:nowrap}
.door-label{background:var(--ui-1be0193bd4ee,#52412d)}
.rift-hint{transform:translate(-50%,-100%);padding:6px 9px;border:1px solid var(--ui-046a2f2d306c,#806485);border-radius:6px;background:var(--ui-ac5aeeff3308,#fff5de);color:var(--ui-cb3424a72b9a,#35253a);font-size:13px;font-weight:650;white-space:nowrap}
.rift-hint kbd{margin-left:4px}
.town-hint{border-color:var(--ui-0fd33ed8317f,#859774);color:var(--ui-b5e9eb611eb9,#31513b)}
.rift-overlay{position:absolute;inset:0;display:grid;place-items:center;background:var(--ui-6a47f5c31177,#201d25a6)}
.town-overlay{position:fixed;z-index:20}
.rift-dialog{max-width:calc(100% - 22px);width:320px;padding:14px;border:2px solid var(--ui-bf80552ddd78,#7b567e);border-radius:9px;background:var(--ui-ac5aeeff3308,#fff5de);color:var(--ui-ce9a1ad5abb0,#2c2630)}
.town-dialog{width:470px;max-height:calc(100dvh - 32px);overflow:auto;border-color:var(--ui-4d74e1b0214b,#9eab87);background:var(--ui-dab366638d50,#fffdf0);color:var(--ui-8f68227cd5f2,#283e30)}
.town-close{margin-top:12px}
.outfit-editor,.scene-settings{margin-top:12px}
.scene-settings{display:grid;gap:5px}
.scene-settings select{max-width:240px}
.rift-dialog h2{margin:0;font-size:19px}
.rift-dialog p{margin:8px 0 12px;font-size:14px}
.dialog-choices,.world-controls{display:flex;gap:8px;align-items:center}
.world-controls{padding-top:12px;color:var(--ui-620ba3964da7,#434f3e);font-size:13px}
kbd{display:inline-block;padding:1px 4px;border:1px solid var(--ui-04973c8e1e81,#aeb7a3);border-radius:4px;background:var(--ui-d679faae3ef1,#faf9ee);color:var(--ui-24a4b0b39857,#384e40);font:inherit}
</style>
