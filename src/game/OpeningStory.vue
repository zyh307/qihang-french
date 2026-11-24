<script setup>
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {acquireGameAudio, listenForPracticeStop, registerPlayer, supportsGameAudio} from '../../oral-assistant/web/practice-audio-gate.js'

const props = defineProps({busy:Boolean, error:String, localAudio:Boolean})
const emit = defineEmits(['complete'])
const skip = ref(null), controls = ref(null), elapsed = ref(0)
const available = ref(false), playing = ref(false), audioError = ref(false)
const visualDurationMs = 24_000
const panelMs = visualDurationMs / 4
const phraseEndSeconds = 28.9
const latestExitMs = 32_000
const scenes = [
  {offset:'left top', text:'回家路上，你在石缝里捡到一枚发光的字母。'},
  {offset:'right top', text:'石板忽然松动，你随碎石和点点光亮一起跌了下去。'},
  {offset:'left bottom', text:'草地尽头亮着一扇窗。木门上的纸条写着：「往上走，试着说几句法语。」'},
  {offset:'right bottom', text:'天亮了。往下走可以去商店，田里有四格空地等你播种。'},
]
const comic = window.QihangOralClient ? './opening-comic.png' : '/assets/opening-comic.png'
const localMedia = '/api/game/local-art'
const trackNames = ['opening.mp3','opening.ogg','opening.wav']
let timer, soundtrack, trackUrl, releaseAudio, removeListener, unregister, version = 0
let starting = false
let disposed = false, finished = false

async function loadMusic() {
  if (!props.localAudio || window.QihangOralClient || !['127.0.0.1','localhost'].includes(location.hostname)) return
  try {
    const response = await fetch(localMedia)
    if (!response.ok) return
    const {openingAudio} = await response.json()
    if (disposed || finished || !trackNames.includes(openingAudio)) return
    trackUrl = localMedia + '/' + openingAudio
    soundtrack = new Audio()
    soundtrack.volume = 0.35
    soundtrack.loop = true
    soundtrack.onplay = () => { playing.value = true }
    soundtrack.onpause = () => { playing.value = false }
    soundtrack.onerror = () => { audioError.value = true; stopMusic() }
    available.value = true
    await playMusic()
  } catch {}
}

async function playMusic(fromClick = false) {
  if (!supportsGameAudio() || starting) return
  starting = true
  const current = ++version
  try {
    const lease = await acquireGameAudio()
    if (!lease || current !== version || disposed || finished || document.hidden) { lease?.(); return }
    releaseAudio = lease
    if (!soundtrack.getAttribute('src')) soundtrack.src = trackUrl
    await soundtrack.play()
  }
  catch {
    if (current !== version) return
    if (fromClick) audioError.value = true
    stopMusic()
  } finally { starting = false }
}

function stopMusic() {
  ++version
  soundtrack?.pause()
  releaseAudio?.()
  releaseAudio = null
  playing.value = false
}

function toggleMusic() {
  if (!soundtrack || finished) return
  if (soundtrack.paused) void playMusic(true)
  else stopMusic()
}

function finish() {
  if (props.busy) return
  finished = true
  clearInterval(timer)
  stopMusic()
  emit('complete')
}

function waitingForPhrase() {
  return soundtrack && !soundtrack.paused && soundtrack.duration > phraseEndSeconds &&
    soundtrack.currentTime < phraseEndSeconds && elapsed.value < latestExitMs
}

function trapTab(event) {
  const buttons = controls.value.querySelectorAll('button:not(:disabled)')
  const edge = event.shiftKey ? buttons[0] : buttons[buttons.length - 1]
  if (!controls.value.contains(event.target) || event.target === edge) {
    event.preventDefault()
    const target = event.shiftKey ? buttons[buttons.length - 1] : buttons[0]
    target?.focus()
  }
}

onMounted(() => {
  removeListener = listenForPracticeStop(stopMusic)
  unregister = registerPlayer(stopMusic)
  window.addEventListener('pagehide', stopMusic)
  const began = performance.now()
  skip.value?.focus()
  loadMusic()
  timer = setInterval(() => {
    elapsed.value = performance.now() - began
    if (elapsed.value >= visualDurationMs && !waitingForPhrase()) finish()
  },100)
})
onBeforeUnmount(() => {
  disposed = true
  clearInterval(timer)
  removeListener?.()
  unregister?.()
  window.removeEventListener('pagehide', stopMusic)
  if (soundtrack) {
    soundtrack.onplay = soundtrack.onpause = soundtrack.onerror = null
  }
  stopMusic()
})
</script>

<template>
  <section class="opening" role="dialog" aria-modal="true" aria-labelledby="opening-title"
    @keydown.esc.prevent="finish" @keydown.tab="trapTab">
    <div class="comic-layout">
      <header class="comic-header">
        <h1 id="opening-title">落进小镇的字母</h1>
        <div ref="controls" class="opening-controls">
          <button v-if="available" :disabled="audioError || busy" @click="toggleMusic">
            {{ audioError ? '音乐暂不可播放' : playing ? '暂停音乐' : '播放音乐' }}
          </button>
          <button ref="skip" class="skip" :disabled="busy" @click="finish">
            {{ elapsed >= visualDurationMs ? '进入小镇' : '跳过开场' }}
          </button>
        </div>
      </header>
      <ol class="comic-grid" aria-live="polite" aria-relevant="additions">
        <li v-for="(scene,i) in scenes" :key="scene.offset" class="comic-panel">
          <figure v-if="elapsed >= i * panelMs">
            <div class="comic-image" :style="{backgroundImage:'url('+comic+')',backgroundPosition:scene.offset}" aria-hidden="true"/>
            <figcaption>{{ scene.text }}</figcaption>
          </figure>
        </li>
      </ol>
      <p v-if="error" class="story-error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.opening{position:fixed;inset:0;z-index:30;display:grid;align-items:center;overflow:auto;background:var(--ui-553ce88edc06,#101015);color:var(--ui-866f7eeac750,#eee8d7)}
.comic-layout{width:min(910px,calc(100% - 34px),max(500px,calc((100dvh - 195px) * 1.5)));margin:auto;padding:20px 0}
.comic-header,.opening-controls{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.comic-header{margin:0 0 12px}
h1{font-size:clamp(24px,3.4vw,38px);color:var(--ui-bd122e8c4de4,#f1dda7)}
.opening-controls button{padding:6px 11px;min-height:36px;border:1px solid var(--ui-983995a3ec9b,#666273);border-radius:6px;background:var(--ui-0ccae3cde40a,#252431);color:var(--ui-d2d127a57410,#f4edda);font-weight:650}
.opening-controls .skip{border-color:var(--ui-12941583c63b,#a5966d);background:var(--ui-143325f0e93d,#38303a)}
.comic-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0;margin:0;list-style:none}
.comic-panel{min-width:0;border:1px solid var(--ui-2c0068edf9d3,#383543);border-radius:7px;overflow:hidden;background:var(--ui-0ac48279a7d8,#191823)}
.comic-panel figure{margin:0;animation:reveal .42s ease-out both}
.comic-image,.comic-panel:empty::before{display:block;aspect-ratio:3 / 2;background-size:200% 200%;background-repeat:no-repeat}
.comic-panel:empty::before{content:'';background:var(--ui-d050ff7602eb,#1a1923)}
.comic-panel:empty::after{content:'';display:block;min-height:56px}
figcaption{display:grid;align-items:center;min-height:56px;padding:6px 12px;background:var(--ui-ba317299ac3c,#252331);color:var(--ui-8fbe80311c89,#f3eedf);font-size:clamp(12px,1.5vw,16px);line-height:1.5}
.story-error{color:var(--ui-f9daa10decfd,#f0b9aa)}
@keyframes reveal{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
</style>
