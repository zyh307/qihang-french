<script setup>
import {onBeforeUnmount, ref} from 'vue'
import {openRecordingWindow} from './recording-window.js'

const props = defineProps({
  title: {type: String, required: true},
  windowSeconds: {type: Number, required: true},
  inspect: {type: Function, required: true},
})
const reference = ref(''), status = ref(''), result = ref(null), error = ref('')
let recording, request

async function start() {
  error.value = ''
  result.value = null
  status.value = 'opening'
  try {
    recording = openRecordingWindow(props.windowSeconds, finish)
    if (await recording.ready) status.value = 'recording'
  } catch (err) {
    recording?.close()
    recording = null
    status.value = ''
    error.value = err.name === 'NotAllowedError' ? '请允许浏览器使用麦克风。' : '无法打开麦克风，请检查设备后重试。'
  }
}

async function finish() {
  const current = recording
  if (!current || status.value !== 'recording') return
  status.value = 'recognizing'
  try {
    const audio = await current.finish()
    if (recording !== current) return
    if (!audio?.pcm.size) throw new Error('没有收到麦克风录音，请重试。')
    request = new AbortController()
    result.value = await props.inspect(audio.pcm, reference.value.trim(), request.signal)
  } catch (err) {
    if (recording === current) error.value = err.message
  } finally {
    current.close()
    if (recording === current) {
      recording = null
      request = null
      status.value = ''
    }
  }
}

onBeforeUnmount(() => {
  recording?.close()
  recording = null
  request?.abort()
})
</script>

<template>
  <section class="landing narrow">
    <p class="overline">录音与本机识别</p>
    <h1>{{ title }}</h1>
    <p>第 0 步试玩。说一句你熟悉的法语，检查 {{ windowSeconds }} 秒录音窗口和本机词级结果。试玩不写入成绩。</p>
    <label class="reference">
      对照文本（可选）
      <input v-model="reference" :disabled="!!status" maxlength="600" lang="fr" autocomplete="off">
    </label>
    <div class="actions">
      <button v-if="status === 'recording'" class="speak" @click="finish">停止并识别</button>
      <button v-else class="speak" :disabled="!!status" @click="start">开始录音</button>
      <span v-if="status" role="status">{{ {opening:'正在准备麦克风…', recording:'正在录音…', recognizing:'正在本机识别…'}[status] }}</span>
    </div>
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <section v-if="result" aria-live="polite">
      <p>录音 {{ result.window.seconds.toFixed(2) }} 秒 · 检出发声 {{ result.speech_seconds.toFixed(2) }} 秒</p>
      <p v-if="result.text" lang="fr">{{ result.text }}</p>
      <p v-else>这段没有识别到词。</p>
      <ul v-if="result.words.length" class="evidence">
        <li v-for="(word, index) in result.words" :key="index">
          <span lang="fr">{{ word.text }}</span> {{ Math.round(word.probability * 100) }}%
        </li>
      </ul>
      <p v-if="result.pause_spans.length">
        停顿区间
        <span v-for="pause in result.pause_spans" :key="pause.start">
          {{ pause.start.toFixed(2) }}–{{ pause.end.toFixed(2) }} 秒
        </span>
      </p>
      <details v-if="result.alignment">
        <summary>对照命中 {{ Math.round(result.alignment.coverage * 100) }}%</summary>
        <ul class="evidence">
          <li v-for="(word, index) in result.alignment.matches" :key="index">
            <span lang="fr">{{ word.target }}</span>
            {{ {hit:'命中', low_confidence:'低置信', missing:'缺失'}[word.status] }}
          </li>
        </ul>
        <p v-if="result.alignment.boundary_words.length">
          跨界词 <span lang="fr">{{ result.alignment.boundary_words.join('、') }}</span>
        </p>
      </details>
    </section>
  </section>
</template>

<style scoped>
.reference{display:grid;gap:6px;margin:18px 0;max-width:520px}
input{box-sizing:border-box;width:100%;font:inherit;color:inherit;background:white;border:1px solid var(--line);border-radius:8px;padding:10px}
.evidence{display:flex;gap:8px 20px;flex-wrap:wrap;padding:0;list-style:none}
</style>
