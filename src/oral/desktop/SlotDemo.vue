<script setup>
import {canPlayPracticeAudio, enterCapture, registerPlayer} from '../../../oral-assistant/web/practice-audio-gate.js'
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {openRecordingWindow, pcmWave} from './recording-window.js'
import {recoverAdventure} from '../../game/practiceBridge.js'

const props = defineProps({request:{type:Function, required:true}, review:Object, adventure:Object})
const emit = defineEmits(['return-notebook', 'review-session', 'game-end'])
const base = '/api/daily-practice/slot'
const catalog = ref(null), session = ref(null), heardClips = ref([]), playing = ref('')
const busy = ref('loading'), error = ref(''), showHelp = ref(false)
const takes = ref(new Map())
const frame = computed(() => session.value?.frame || catalog.value?.lesson.frames[0])
const frames = computed(() => session.value?.lesson.frames ??
  (catalog.value?.lesson.frames ?? []).slice(0, props.adventure ? 1 : undefined))
const frameNumber = computed(() => (session.value?.frame_index ?? 0) + 1)
const cardCount = computed(() => frames.value.reduce((count, group) => count + group.prompts.length, 0))
const independentPasses = computed(() => new Set(session.value?.rows.filter(row =>
  row.verdict === 'pass' && row.level === 0 && !row.supplement)
  .map(row => row.frame_id + '/' + row.prompt.id)).size)
const dueFrames = computed(() => {
  const summary = session.value?.summary
  const ids = summary?.due_frames ?? (summary?.needs_practice ? [frame.value.id] : [])
  return frames.value.filter(group => ids.includes(group.id))
})
const task = computed(() => session.value?.tasks[session.value?.clips.length])
const target = computed(() => frame.value?.candidates.find(item => item.id === task.value?.prompt.target))
const hint = computed(() => Math.max(task.value?.level || 0, showHelp.value ? 1 : 0))
const lastRows = computed(() => [...new Map(session.value?.rows.filter(row => !row.supplement
  && (row.frame_id ?? frame.value.id) === frame.value.id)
  .map(row => [row.prompt.id, row])).values()])
const latestGroup = computed(() => session.value?.rows.slice(-session.value.tasks.length) || [])
const canRetry = computed(() => lastRows.value.some(row => row.verdict !== 'pass' && row.level < 2))
const canSupplement = computed(() => session.value?.stage === 'feedback' && !session.value.supplement_used
  && session.value.speech_seconds * 2000 < activeMs())
const labels = {pass:'通过', retry:'重来', release:'带提示完成', undetermined:'未确认'}
const uncertainLabels = {
  insufficient_speech:'发声时间不足',
  insufficient_assisted_speech:'发声时间不足',
  frame_coverage:'句框未确认',
  slot_anchor:'换词位置未确认',
  missing_slot:'词形未确认',
  low_slot_confidence:'词形未确认',
  competing_forms:'词形未确认',
  cross_window:'录音边界未确认',
  end_of_window_unconfirmed:'录音结尾未确认',
}
const listenAgain = {
  voice_timing_unavailable:'这次未检测到有效发声。等滴声，再读高亮的整句。',
  insufficient_speech:'系统检测到的发声时间偏短。可以跟着高亮的整句再读一遍。',
  insufficient_assisted_speech:'系统按检出的发声时间核对跟说完成度。',
  frame_coverage:'本机识别没能确认固定句框 Je fais。',
  slot_anchor:'句框和换词的位置没识别清楚。可以照着高亮的整句读。',
  missing_slot:'已识别句框，这次没能确认换进去的词。',
  low_slot_confidence:'本机识别对换进去的词把握不足。',
  competing_forms:'这次听到了两种说法。请只读高亮的那一句。',
  cross_window:'识别到的词和录音边界重合，句子没法确认。可以再录一遍。',
  end_of_window_unconfirmed:'录音到时仍有声音，最后一个词没法确认。可以再读一遍。',
}
function feedbackLabel(row) {
  return (row.verdict === 'undetermined' && uncertainLabels[row.rule]) || labels[row.verdict]
}
function feedbackDetail(row) {
  if (row.rule === 'low_slot_confidence' && row.spoken) {
    return `本机转写出了「${row.spoken}」，但词形置信度不足。`
  }
  if (uncertainLabels[row.rule] === '发声时间不足' && Number.isFinite(row.speech_seconds)
      && Number.isFinite(row.required_seconds)) {
    return `系统检出发声 ${row.speech_seconds.toFixed(3)} 秒，常规门槛为 ${row.required_seconds} 秒。`
  }
  return listenAgain[row.rule] || '这次的录音证据不足，可以跟提示再说。'
}
const writeHeaders = type => ({'Content-Type':type, 'X-Oral-Client':'web'})
const options = body => ({method:'POST', headers:writeHeaders('application/json'), body:JSON.stringify(body)})
const baseSession = () => base + '/' + session.value.id
const endpoint = action => baseSession() + '/' + session.value.revision + '/' + action
let recorder, startSample, cueSample, deadline, onset, heard, player, playerUrl, clock, disposed = false

async function json(url, init) { return (await props.request(url, init)).json() }
function activeMs() {
  return clock ? Math.round(clock.previous + performance.now() - clock.start) : session.value?.active_ms || 0
}
function checkpoint() {
  if (clock) try { localStorage.setItem(clock.key, String(activeMs())) } catch {}
}
function accept(next) {
  if (disposed) return
  if (next.phase === 'active' && next.id !== session.value?.id) {
    const key = 'qihang-slot-ms:' + next.id
    let saved = 0
    try { saved = Number(localStorage.getItem(key)) || 0 } catch {}
    clock = {key, start:performance.now(), previous:Math.max(saved, next.active_ms)}
  }
  if (next.phase === 'ended' && clock) {
    try { localStorage.removeItem(clock.key) } catch {}
    clock = null
  }
  session.value = next
  showHelp.value = false
}
async function load(lesson = props.review?.lessonId) {
  busy.value = 'loading'
  error.value = ''
  heardClips.value = []
  try {
    catalog.value = await json(base + (lesson ? '?lesson=' + encodeURIComponent(lesson) : ''))
    const recent = catalog.value.recent
    if (props.adventure) {
      const state = await recoverAdventure(json, base, props.adventure)
      if (state) accept(state)
      if (!disposed && state?.stage === 'pending') await grade()
    } else if (props.review?.sessionId) {
      accept(await json(base + '/' + props.review.sessionId))
      if (session.value.stage === 'pending') await grade()
    } else if (props.review) await start(props.review)
    else if (catalog.value.audition_confirmed && recent?.phase === 'active') {
      accept(await json(base + '/' + recent.id))
      if (session.value.stage === 'pending') await grade()
    }
  } catch (err) { error.value = err.message }
  finally { busy.value = '' }
}
function stopAudio() {
  if (player) { player.onended = null; player.pause(); player = null }
  if (playerUrl) URL.revokeObjectURL(playerUrl)
  playerUrl = ''
  playing.value = ''
}
async function playClip(clip, rate, onEnded) {
  if (!canPlayPracticeAudio()) return
  playerUrl = URL.createObjectURL(clip)
  player = new Audio(playerUrl)
  player.playbackRate = rate
  player.onended = () => { onEnded?.(); stopAudio() }
  player.onerror = () => { error.value = '这段音频未能播放，请重试。'; stopAudio() }
  await player.play()
}
async function listen(candidate, audition = false) {
  if (busy.value || playing.value || !canPlayPracticeAudio()) return
  playing.value = candidate.id
  error.value = ''
  try {
    const response = await props.request(base + '/audio/' + encodeURIComponent(candidate.demo_wav))
    const clip = await response.blob()
    if (disposed || playing.value !== candidate.id || !canPlayPracticeAudio()) return
    await playClip(clip, audition ? 1 : .75, () => {
      if (audition && !heardClips.value.includes(candidate.id)) heardClips.value.push(candidate.id)
    })
  } catch { error.value = '本地原声未能播放，请重试。'; stopAudio() }
}
async function confirmAudition() {
  busy.value = 'saving'
  error.value = ''
  try {
    const ids = frame.value.candidates.map(item => item.id)
    if (ids.every(id => heardClips.value.includes(id))) {
      await json(base + '/audition', options({lesson:catalog.value.lesson.lesson_id, fingerprint:catalog.value.fingerprint, heard:ids}))
      catalog.value.audition_confirmed = true
    }
  } catch (err) { error.value = err.message }
  finally { busy.value = '' }
}
async function start(review = null) {
  busy.value = 'opening'
  error.value = ''
  try {
    const next = await json(base, options({...props.adventure, lesson:review?.lessonId || catalog.value.lesson.lesson_id,
      review:review ? {item:review.unitId,version:review.contentRevision} : null}))
    stopAudio()
    takes.value.clear()
    accept(next)
    if (review && !disposed) emit('review-session', next.id)
    if (!disposed && next.stage === 'pending') await grade()
  }
  catch (err) { error.value = err.message }
  finally { busy.value = '' }
}
async function previousReport() {
  if (busy.value) return
  busy.value = 'loading'
  error.value = ''
  try { accept(await json(base + '/' + catalog.value.recent.id)) }
  catch (err) { error.value = err.message }
  finally { busy.value = '' }
}
function observe(samples) {
  if (heard || busy.value !== 'recording') return
  let energy = 0
  for (const value of samples) energy += value * value
  heard = energy / samples.length >= .000064
}
async function openCard(current, previousEnd = 0) {
  busy.value = 'cue'
  const boundary = await current.cue()
  if (disposed || current !== recorder || boundary === null) return
  cueSample = boundary.index
  startSample = Math.max(previousEnd, boundary.captureIndex)
  const elapsed = performance.now() - boundary.endedAt
  heard = false
  showHelp.value = false
  busy.value = 'recording'
  deadline = setTimeout(() => submitCard(true), Math.max(0, session.value.window_seconds * 1000 - elapsed))
  if (task.value.level === 0) {
    onset = setTimeout(() => {
      if (!heard && busy.value === 'recording') showHelp.value = true
    }, Math.max(0, 2000 - elapsed))
  }
}
function closeRecorder() {
  clearTimeout(deadline)
  clearTimeout(onset)
  recorder?.close()
  recorder = null
}
async function startGroup() {
  if (playing.value || busy.value) return
  busy.value = 'opening'
  error.value = ''
  try {
    const remaining = session.value.tasks.length - session.value.clips.length
    const current = recorder = openRecordingWindow(remaining * (session.value.window_seconds + 2),
      () => { if (busy.value === 'recording') submitCard(true) }, observe, {withCue:true})
    if (!(await current.ready) || recorder !== current) return
    await openCard(current)
  } catch (err) {
    closeRecorder()
    busy.value = ''
    error.value = err.name === 'NotAllowedError' ? '请允许浏览器使用麦克风后再试。'
      : err.message || '麦克风没能打开，请检查设备。'
  }
}
async function submitCard(capped = false) {
  if (!recorder || busy.value !== 'recording') return
  const current = recorder
  clearTimeout(deadline)
  clearTimeout(onset)
  busy.value = 'saving'
  try {
    const stop = await current.checkpoint()
    if (disposed || current !== recorder) return
    const end = Math.min(stop, cueSample + current.sampleRate * session.value.window_seconds)
    if (end <= cueSample) throw new Error('这张没有收到录音，请再试一次。')
    const body = current.slice(startSample, end)
    const key = takeKey(task.value)
    checkpoint()
    const query = new URLSearchParams({active_ms:activeMs(), capped:Number(capped || stop > end),
      lead_samples:cueSample - startSample})
    const next = await json(endpoint('record') + '?' + query, {
      method:'POST', headers:writeHeaders('application/octet-stream'), body,
    })
    if (next.accepted_clip && !disposed) takes.value.set(key, body)
    accept(next)
    if (disposed || current !== recorder) return
    if (session.value.stage === 'pending') {
      await grade()
    } else if (task.value.level === 2) {
      closeRecorder()
      busy.value = ''
    } else {
      await openCard(current, stop)
    }
  } catch (err) {
    closeRecorder()
    busy.value = ''
    error.value = err.message
  }
}
async function grade() {
  busy.value = 'recognizing'
  error.value = ''
  const gate = enterCapture()
  closeRecorder()
  try {
    await gate.ready
    if (!disposed) accept(await json(endpoint('grade'), options({})))
  }
  catch (err) { error.value = err.message }
  finally { gate.leave(); busy.value = '' }
}
async function advance(action) {
  busy.value = 'saving'
  error.value = ''
  try {
    checkpoint()
    accept(await json(endpoint('advance'), options({action, active_ms:activeMs()})))
  } catch (err) { error.value = err.message }
  finally { busy.value = '' }
}
function full(candidate) { return frame.value.template.replace('{slot}', candidate.form) }
function expected(row) { return frame.value.candidates.find(item => item.id === row.prompt.target).form }
function takeKey(row) {
  return (row.frame_id ?? frame.value.id) + ':' + row.prompt.id + ':' + row.level + ':' + Number(!!row.supplement)
}
async function playTake(row) {
  if (busy.value || playing.value || !canPlayPracticeAudio()) return
  const key = takeKey(row)
  const pcm = takes.value.get(key)
  if (!pcm) return
  playing.value = key
  error.value = ''
  try { await playClip(pcmWave(pcm), 1) }
  catch { error.value = '录音未能播放，请重试。'; stopAudio() }
}
function downloadTake(row) {
  const pcm = takes.value.get(takeKey(row))
  if (!pcm) return
  const file = URL.createObjectURL(pcmWave(pcm))
  const link = document.createElement('a')
  link.href = file
  link.download = `口语换一格-${row.prompt.id}-${row.level}.wav`
  link.click()
  setTimeout(() => URL.revokeObjectURL(file), 1000)
}
async function downloadLog() {
  try {
    const file = URL.createObjectURL(await (await props.request(baseSession() + '/log')).blob())
    const link = document.createElement('a')
    link.href = file
    link.download = 'slot-' + session.value.id + '.jsonl'
    link.click()
    setTimeout(() => URL.revokeObjectURL(file), 1000)
  } catch (err) { error.value = err.message }
}
function leave() { checkpoint(); closeRecorder(); stopAudio(); takes.value.clear() }
let unregisterAudio
onMounted(() => { unregisterAudio = registerPlayer(stopAudio); window.addEventListener('pagehide', leave); load() })
onBeforeUnmount(() => { disposed = true; unregisterAudio?.(); window.removeEventListener('pagehide', leave); leave() })
</script>

<template>
  <section class="landing narrow slot">
    <p class="overline">À l’indice, je change un mot</p>
    <h1>看提示换一格</h1>
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <button v-if="!adventure && session?.phase === 'active' && session.lesson.version < catalog?.lesson.version"
      class="secondary" :disabled="!!busy || !!playing" @click="start()">开始新版练习</button>
    <button v-if="!adventure && !review && session && catalog?.lessons?.length > 1" class="text-link"
      :disabled="!!busy" @click="checkpoint(); stopAudio(); session = null">返回课次选择</button>
    <template v-if="catalog && !session">
      <label v-if="!adventure && !review && catalog.lessons?.length > 1">练习课次
        <select :value="catalog.lesson.lesson_id" :disabled="!!busy" @change="load($event.target.value)">
          <option v-for="lesson in catalog.lessons" :key="lesson.id" :value="lesson.id">{{ lesson.label }} · {{ lesson.title.zh }}</option>
        </select>
      </label>
      <p class="muted">{{ catalog.lesson.label }} · {{ frames.length }} 个句框 · {{ cardCount }} 张提示卡</p>
      <h2>{{ catalog.lesson.title.zh }}</h2>
      <p>每张卡提示一种说法。等滴声，读高亮的完整法语句子。每组答完 4 张，再一起看反馈。</p>
      <p v-if="!catalog.audition_confirmed">先听完两段示范，确认你能分清两种说法。</p>
      <ul class="options">
        <li v-for="candidate in frame.candidates" :key="candidate.id">
          <span lang="fr">{{ full(candidate) }}</span>
          <small>{{ candidate.condition }}</small>
          <button v-if="!catalog.audition_confirmed" class="secondary" :disabled="!!busy || !!playing"
            @click="listen(candidate, true)">{{ playing === candidate.id ? '正在播放…' : heardClips.includes(candidate.id) ? '重听原声' : '听' + candidate.condition + '的原声' }}</button>
        </li>
      </ul>
      <button v-if="!catalog.audition_confirmed" class="speak" :disabled="heardClips.length !== 2 || !!busy || !!playing"
        @click="confirmAudition">两段都听清了</button>
      <button v-else class="speak" :disabled="!!busy" @click="start()">开始练习</button>
      <button v-if="!adventure && catalog.audition_confirmed && catalog.recent?.phase === 'ended'" class="secondary"
        :disabled="!!busy" @click="previousReport">查看上次结果</button>
    </template>
    <template v-else-if="session?.stage === 'record' && task">
      <p v-if="frames.length > 1" class="muted">句框 {{ frameNumber }} / {{ frames.length }}</p>
      <p class="muted">第 {{ session.clips.length + 1 }} / {{ session.tasks.length }} 张</p>
      <h2>{{ task.prompt.cue }}</h2>
      <p v-if="hint === 2">听到滴声后，跟着读下面的整句。</p>
      <p v-else>听到滴声后，从句首读完高亮的整句。</p>
      <p class="frame target-sentence" lang="fr" data-reading-target>{{ full(target) }}</p>
      <p v-if="frame.source_note" class="muted">{{ frame.source_note }}</p>
      <ul v-if="hint < 2" class="options">
        <li v-for="candidate in frame.candidates" :key="candidate.id"
          :class="{ 'target-option':candidate.id === target.id }">
          <span lang="fr">{{ candidate.form }}</span>
          <small>{{ candidate.condition }}</small>
          <strong v-if="candidate.id === target.id">这张用这个说法</strong>
        </li>
      </ul>
      <div class="actions">
        <button v-if="busy === 'recording'" class="speak" @click="submitCard(false)">
          {{ session.clips.length + 1 < session.tasks.length ? '下一张' : '录完了，看反馈' }}
        </button>
        <button v-else class="speak" :disabled="!!busy || !!playing" @click="startGroup">
          {{ session.clips.length ? '继续口答' : '开始口答' }}
        </button>
        <button v-if="!busy" class="secondary" :disabled="!!playing" @click="listen(target)">
          {{ playing ? '正在播放…' : '听整句' }}
        </button>
      </div>
      <p v-if="busy === 'recording'" role="status">
        可以开口了。每张最多 {{ session.window_seconds }} 秒。
        {{ session.clips.length + 1 < session.tasks.length ? '读完点「下一张」，再等一声滴。' : '读完点「录完了，看反馈」。' }}
      </p>
      <p v-else-if="busy === 'cue'" role="status">麦克风已准备好 · 等待滴声…</p>
      <p v-else-if="busy" role="status">{{ busy === 'opening' ? '正在准备麦克风…' : '正在保存这一张…' }}</p>
    </template>
    <template v-else-if="session?.stage === 'pending'">
      <h2>本组录完了</h2>
      <p v-if="busy" role="status">正在本机核对这一组的词形…</p>
      <button v-else class="speak" @click="grade">再试判定</button>
    </template>
    <template v-else-if="session?.stage === 'feedback'">
      <h2>组末反馈</h2>
      <p v-if="latestGroup.some(row => row.verdict === 'undetermined')" class="muted">
        「未确认」表示本机的识别证据不足。你可以先回听，再决定是否补练。
      </p>
      <ol class="slot-feedback">
        <li v-for="row in latestGroup" :key="row.prompt.id">
          <strong>{{ row.prompt.cue }} · {{ feedbackLabel(row) }}</strong>
          <p v-if="row.verdict === 'retry'">你说了 <span lang="fr">{{ row.spoken }}</span>，这里应该是 <span lang="fr">{{ expected(row) }}</span>。</p>
          <p v-else-if="row.verdict === 'undetermined'">{{ feedbackDetail(row) }}</p>
          <p v-else lang="fr">{{ expected(row) }}</p>
          <p v-if="row.verdict === 'undetermined' && row.recognized">本机首次转写为「<span lang="fr">{{ row.recognized }}</span>」，可能有误。</p>
          <button v-if="takes.has(takeKey(row))" class="text-link" :disabled="!!busy || !!playing"
            @click="playTake(row)">{{ playing === takeKey(row) ? '正在回听…' : '回听我的录音' }}</button>
          <button v-if="row.verdict === 'undetermined' && takes.has(takeKey(row))" class="text-link" :disabled="!!busy"
            @click="downloadTake(row)">保存这段录音</button>
        </li>
      </ol>
      <div class="actions">
        <button v-if="canRetry" class="speak" :disabled="!!busy || !!playing" @click="advance('retry')">跟提示补练</button>
        <button v-if="canSupplement" class="secondary" :disabled="!!busy || !!playing" @click="advance('supplement')">再跟说两句</button>
        <button v-if="frameNumber < frames.length" class="secondary" :disabled="!!busy || !!playing"
          @click="advance('next_frame')">下一个句框</button>
        <button v-else class="secondary" :disabled="!!busy || !!playing" @click="advance('finish')">看本轮结果</button>
      </div>
    </template>
    <template v-else-if="session?.stage === 'report'">
      <h2>本轮结果</h2>
      <div class="metrics">
        <div><small>开口率</small><strong>{{ Math.floor(session.summary.speech_ratio * 100) }}%</strong></div>
        <div><small>实际发声</small><strong>{{ session.summary.speech_seconds.toFixed(1) }} 秒</strong></div>
        <div><small>{{ adventure ? '独立通过' : '普通通过' }}</small>
          <strong>{{ adventure ? independentPasses : session.summary.passes }} / {{ cardCount }}</strong></div>
      </div>
      <p>{{ session.summary.effective ? '完整有效轮' : '已保存为短练' }} · {{ session.summary.needs_practice ? '待练词形对' : '这轮没有待练词形对' }}</p>
      <p v-for="group in dueFrames" :key="group.id" lang="fr">
        {{ group.template.replace('{slot}', '…') }} · {{ group.candidates.map(item => item.form).join(' / ') }}
      </p>
      <div class="actions">
        <button v-if="adventure" class="speak" @click="emit('game-end', session)">结算并返回地图</button>
        <button v-else-if="session.review_item" class="speak" @click="emit('return-notebook')">返回需练习本</button>
        <button v-else class="speak" :disabled="!!busy" @click="start()">再练一轮</button>
        <button class="secondary" @click="downloadLog">下载判定日志</button>
      </div>
    </template>
    <p v-else-if="busy" role="status">正在加载试玩课…</p>
  </section>
</template>

<style scoped>
.slot h2{margin-top:20px}.slot p{line-height:1.6}.frame{font:26px Georgia,serif}
.options{list-style:none;display:flex;flex-wrap:wrap;gap:12px;padding:0;margin:18px 0}
.options li{display:grid;gap:8px;padding:14px;border:1px solid var(--line);border-radius:10px;background:#f6f9f4}
.options li>span{font:22px Georgia,serif}
.target-sentence,.options .target-option{background:var(--mint);border:1px solid #58856a}
.target-sentence{padding:12px 16px;border-radius:10px;color:#173c28}
.target-option strong{color:#245b3a;font-size:13px}
.slot-feedback li{padding:8px}.slot-feedback p{margin:4px 0}
</style>
