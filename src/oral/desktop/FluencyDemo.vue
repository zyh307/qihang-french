<script setup>
import {canPlayPracticeAudio, registerPlayer} from '../../../oral-assistant/web/practice-audio-gate.js'
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {openRecordingWindow} from './recording-window.js'
import {recoverAdventure} from '../../game/practiceBridge.js'

const props = defineProps({request: {type: Function, required: true}, review:Object, adventure:Object})
const emit = defineEmits(['return-notebook', 'review-session', 'game-end'])
const base = '/api/daily-practice/fluency'
const hints = [
  '按自己的速度，把这些小块连起来说一遍。',
  '先说第一小块，再接下一块。可以先听一遍示范。',
  '先听一遍，再照着说下面两小块。说完就能继续。',
]
const messages = {
  rhythm_within_limits: '这一遍接得很顺。',
  internal_pause: '短块里面停得有点久。试着把这小块一口气说完。',
  boundary_pause: '两块之间停得有点久。说完一块，试着直接接下一块。',
  group_restarts: '有一小块重新起头较多。卡住时先接着往下说。',
  pace_slow: '这次语速低于旧版参考范围。接下来可以按自己的速度说。',
  pace_fast: '这次语速高于旧版参考范围。接下来可以按自己的速度说。',
  assisted_speech: '你已经跟着提示开口了。',
  window_ended_mid_chain: '录音到时仍检测到声音，最后一小块没能确认。可以跟提示再说，也可以继续。',
}
const statusLabels = {pass:'通过', retry:'再试一次', release:'带提示完成', undetermined:'这次未判定'}
const catalog = ref(null), session = ref(null), error = ref(''), busy = ref('loading')
const earlyHint = ref(false), playing = ref(false)
const chain = computed(() => session.value?.lesson.chains[session.value.position])
const chainsCount = computed(() => session.value?.lesson.chains.length ??
  Math.min(catalog.value?.lesson.chains.length ?? 0, props.adventure ? 3 : Infinity))
const stage = computed(() => session.value?.stage)
const hintLevel = computed(() => Math.max(session.value?.level ?? 0, earlyHint.value ? 1 : 0))
const groups = computed(() => hintLevel.value === 2 ? chain.value?.short_groups : chain.value?.groups)
const decisions = computed(() => session.value?.outcomes.filter(row =>
  row.verdict === 'pass' && (!props.adventure || row.level === 0)).length || 0)
const feedback = computed(() => session.value?.last)
const url = () => base + '/' + session.value.id
const actionUrl = action => url() + '/' + session.value.revision + '/' + action
const writeHeaders = type => ({'Content-Type':type,'X-Oral-Client':'web'})
let recorder, player, audioUrl, onsetTimer, activeSince, heard, disposed = false

async function json(path, options) { return (await props.request(path, options)).json() }
function savedClock(key) {
  try { return Number(localStorage.getItem(key)) || 0 } catch { return 0 }
}
function activeMs() {
  if (!activeSince) return session.value?.active_ms || 0
  return Math.max(0, Math.round(performance.now() - activeSince.origin + activeSince.previous))
}
function checkpoint() {
  if (!activeSince) return
  try { localStorage.setItem(activeSince.key, String(activeMs())) } catch {}
}
function useSession(next) {
  if (disposed) return
  if (next.phase === 'active' && activeSince?.id !== next.id) {
    const key = 'qihang-fluency-ms:' + next.id
    activeSince = {id:next.id, key, origin:performance.now(), previous:Math.max(next.active_ms, savedClock(key))}
  }
  if (next.phase === 'ended') {
    if (activeSince) {
      try { localStorage.removeItem(activeSince.key) } catch {}
    }
    activeSince = null
  }
  session.value = next
  earlyHint.value = false
}
async function load() {
  try {
    catalog.value = await json(base)
    if (props.adventure) {
      const state = await recoverAdventure(json, base, props.adventure)
      if (state) useSession(state)
    } else if (props.review?.sessionId) useSession(await json(base + '/' + props.review.sessionId))
    else if (props.review) await start(props.review)
    else if (catalog.value.recent?.phase === 'active') {
      useSession(await json(base + '/' + catalog.value.recent.id))
    }
  } catch (err) { error.value = err.message }
  finally { busy.value = '' }
}
async function start(review = null) {
  busy.value = 'loading'
  error.value = ''
  try {
    const next = await json(base, {method:'POST',headers:writeHeaders('application/json'),
      body:JSON.stringify({...props.adventure, lesson:catalog.value.lesson.lesson_id,
        review:review ? {item:review.unitId,version:review.contentRevision} : null})})
    useSession(next)
    if (review && !disposed) emit('review-session', next.id)
  } catch (err) { error.value = err.message }
  finally { busy.value = '' }
}
async function previousReport() {
  try { useSession(await json(base + '/' + catalog.value.recent.id)) }
  catch (err) { error.value = err.message }
}
async function advance(action) {
  busy.value = 'saving'
  error.value = ''
  try {
    checkpoint()
    useSession(await json(actionUrl('advance'), {method:'POST',headers:writeHeaders('application/json'),
      body:JSON.stringify({action,active_ms:activeMs()})}))
  } catch (err) { error.value = err.message }
  finally { busy.value = '' }
}
function stopPlayer() {
  if (player) {
    player.onended = player.onerror = null
    player.pause()
    player = null
  }
  if (audioUrl) URL.revokeObjectURL(audioUrl)
  audioUrl = ''
  playing.value = false
}
async function listen() {
  if (playing.value || busy.value || !canPlayPracticeAudio()) return
  playing.value = true
  error.value = ''
  try {
    const key = hintLevel.value === 2 ? 'short_demo_wav' : 'demo_wav'
    const response = await props.request(base + '/audio/' + encodeURIComponent(chain.value[key]))
    const blob = await response.blob()
    if (disposed || !playing.value || !canPlayPracticeAudio()) return
    audioUrl = URL.createObjectURL(blob)
    player = new Audio(audioUrl)
    player.playbackRate = .8
    player.onended = stopPlayer
    player.onerror = () => { error.value = '播放失败，可以直接看提示开口。'; stopPlayer() }
    await player.play()
  } catch { error.value = '播放失败，可以直接看提示开口。'; stopPlayer() }
}
function observe(samples) {
  if (heard) return
  let energy = 0
  for (const sample of samples) energy += sample * sample
  heard = samples.length > 0 && energy / samples.length >= .000064
}
async function beginRecording() {
  if (playing.value || busy.value) return
  busy.value = 'opening'
  error.value = ''
  heard = false
  try {
    const current = recorder = openRecordingWindow(session.value.window_seconds, () => finish(true), observe)
    if (!(await current.ready) || recorder !== current) return
    busy.value = 'recording'
    if (!hintLevel.value && stage.value === 'full') {
      onsetTimer = setTimeout(() => {
        if (!heard && busy.value === 'recording') {
          earlyHint.value = true
        }
      }, 2000)
    }
  } catch (err) {
    recorder?.close()
    recorder = null
    busy.value = ''
    error.value = err.name === 'NotAllowedError' ? '请允许浏览器使用麦克风后再试。' : '麦克风没能打开，请检查设备。'
  }
}
async function finish(timedOut = false) {
  const current = recorder
  if (!current || busy.value !== 'recording') return
  clearTimeout(onsetTimer)
  busy.value = 'recognizing'
  try {
    if (!timedOut) {
      // Preserve the last syllable when the learner releases the recording button.
      await new Promise(resolve => setTimeout(resolve, 180))
      if (disposed || recorder !== current) return
    }
    const audio = await current.finish()
    if (disposed || recorder !== current) return
    if (!audio?.pcm.size) throw new Error('没有收到录音，再试一次。')
    checkpoint()
    const capped = timedOut || audio.endSample === audio.sampleRate * session.value.window_seconds
    useSession(await json(actionUrl('record') + '?active_ms=' + activeMs() + (capped ? '&capped=1' : ''), {
      method:'POST',headers:writeHeaders('application/octet-stream'),body:audio.pcm,
    }))
  } catch (err) { error.value = err.message }
  finally {
    current.close()
    if (recorder === current) { recorder = null; busy.value = '' }
  }
}
async function downloadLog() {
  try {
    const blob = await (await props.request(url() + '/log')).blob()
    const link = document.createElement('a'), target = URL.createObjectURL(blob)
    link.href = target
    link.download = 'fluency-' + session.value.id + '.jsonl'
    link.click()
    setTimeout(() => URL.revokeObjectURL(target), 1000)
  } catch (err) { error.value = err.message }
}
function leave() {
  checkpoint()
  clearTimeout(onsetTimer)
  recorder?.close()
  recorder = null
  stopPlayer()
}
let unregisterAudio
onMounted(() => {
  unregisterAudio = registerPlayer(stopPlayer)
  window.addEventListener('pagehide', leave)
  load()
})
onBeforeUnmount(() => {
  unregisterAudio?.()
  disposed = true
  window.removeEventListener('pagehide', leave)
  leave()
})
</script>

<template>
  <section class="landing narrow fluency">
    <p class="overline">Enchaîner au rythme</p>
    <h1>接拍串说</h1>
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <button v-if="!adventure && session?.phase === 'active' && session.lesson.version < catalog?.lesson.version"
      class="secondary" :disabled="!!busy || playing" @click="start()">开始新版练习</button>
    <template v-if="!session && catalog">
      <p class="muted">{{ catalog.lesson.label }} · {{ chainsCount }} 条节奏链</p>
      <h2>{{ catalog.lesson.title.zh }}</h2>
      <p>每条可以先逐块热身，再连起来说。热身计入开口时间，整条连说才会给判定。</p>
      <button class="speak" :disabled="!!busy" @click="start()">开始练习</button>
      <button v-if="!adventure && catalog.recent?.phase === 'ended'" class="secondary" @click="previousReport">查看上次结果</button>
    </template>
    <p v-else-if="!catalog && busy" role="status">正在加载试点课次…</p>
    <template v-else-if="stage === 'report'">
      <h2>本轮结果</h2>
      <div class="metrics">
        <div><small>开口率</small><strong>{{ Math.floor(session.summary.speech_ratio * 100) }}%</strong></div>
        <div><small>实际发声</small><strong>{{ session.summary.speech_seconds.toFixed(1) }} 秒</strong></div>
        <div><small>独立通过</small><strong>{{ decisions }} / {{ chainsCount }}</strong></div>
      </div>
      <p>{{ session.summary.effective ? '完整有效轮' : '已保存为短练' }} · 共 {{ session.summary.active_seconds.toFixed(1) }} 秒</p>
      <h3>待练条目</h3>
      <ul v-if="session.summary.due.length">
        <li v-for="item in session.summary.due" :key="item" lang="fr">
          {{ session.lesson.chains.find(row => row.id === item).groups.join(' ') }}
        </li>
      </ul>
      <p v-else>这一轮没有待练条目。</p>
      <div class="actions">
        <button v-if="adventure" class="speak" @click="emit('game-end', session)">结算并返回地图</button>
        <button v-else-if="session.review_item" class="speak" @click="emit('return-notebook')">返回需练习本</button>
        <button v-else class="speak" :disabled="!!busy" @click="start()">再练一轮</button>
        <button class="secondary" @click="downloadLog">下载判定日志</button>
      </div>
    </template>
    <template v-else-if="chain">
      <p class="muted">第 {{ session.position + 1 }} / {{ chainsCount }} 条 · {{ stage === 'chunks' ? '逐块热身' : stage === 'feedback' ? '本条反馈' : '连起来说' }}</p>
      <template v-if="stage === 'feedback'">
        <p class="groups"><span v-for="group in groups" :key="group" lang="fr">{{ group }}</span></p>
        <h2>{{ statusLabels[feedback.verdict] }}</h2>
        <p role="status">{{ messages[feedback.rule] || '这一遍没抓准，可以跟着提示再来一次，也可以继续。' }}</p>
        <div class="actions">
          <button v-if="feedback.verdict !== 'pass' && session.level < 2" class="speak" :disabled="!!busy" @click="advance('hint')">跟提示再说</button>
          <button :class="feedback.verdict === 'pass' || session.level === 2 ? 'speak' : 'secondary'"
            :disabled="!!busy" @click="advance('next')">{{ session.position === chainsCount - 1 ? '看本轮结果' : '下一条' }}</button>
        </div>
      </template>
      <template v-else>
        <p v-if="stage === 'chunks'">逐块说一遍做热身。想只录一遍，可以点「直接连起来说」。</p>
        <template v-else>
          <p>{{ hints[hintLevel] }}</p>
          <p v-if="hintLevel < 2" class="muted">读完整条并停止录音，就能看到本条判定。</p>
        </template>
        <div class="groups">
          <span v-for="group in groups" :key="group" lang="fr">{{ group }}</span>
        </div>
        <div class="actions">
          <button v-if="busy === 'recording'" class="speak" @click="finish()">停止录音</button>
          <button v-else class="speak" :disabled="!!busy || playing" @click="beginRecording">开始录音</button>
          <button v-if="!busy" class="secondary" :disabled="playing" @click="listen">{{ playing ? '正在播放…' : '听慢速示范' }}</button>
          <button v-if="stage === 'chunks' && !busy" class="text-link" :disabled="playing" @click="advance('skip_chunks')">直接连起来说</button>
        </div>
        <p v-if="busy === 'opening'" role="status">正在准备麦克风…</p>
        <p v-if="busy === 'recording'" role="status">
          说完点「停止录音」。本次最长 {{ session.window_seconds }} 秒。
        </p>
        <p v-if="busy === 'recognizing'" role="status">
          {{ stage === 'chunks' ? '正在统计热身的发声时间…' : '正在本机判定这条录音…' }}
        </p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.fluency h2{margin-top:16px}.fluency p{line-height:1.6}
.groups{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0;min-height:60px;align-items:start}
.groups span{font:clamp(20px,2vw,28px)/1.35 Georgia,serif;padding:10px 14px;border:1px solid var(--line);border-radius:9px;background:var(--ui-1e3fc6eba2ca,#f6f9f4)}
.fluency .actions{margin-top:18px}
</style>
