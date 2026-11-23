<script setup>
import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {clearLocalMusic, importTracks} from './radioStore.js'

const props = defineProps({radio:{type:Object, required:true}, blocked:Boolean})
const {ui} = props.radio
const open = ref(false), tab = ref(ui.settings.source), trigger = ref(), files = ref()
const importing = ref(false), progress = ref(''), result = ref(null), confirming = ref(false)
const selected = computed(() => ui.catalog[ui.settings.source].find(track => track.id === ui.settings.trackId))
const station = computed(() => ui.settings.source === 'default' ? '默认电台' : '我的音乐')
const tracks = computed(() => ui.catalog[tab.value])
const status = computed(() => ui.settings.closed ? '已关闭' : ui.settings.muted ? '已静音' :
  ui.status === 'playing' ? '播放中' : '待播放')
const volume = computed(() => Math.round(ui.settings.volume * 100))
const panelTitle = computed(() => tab.value === 'default' ? '默认电台' : '我的音乐')

onMounted(() => {
  props.radio.enterGame()
})
watch(() => props.blocked, blocked => { if (blocked) open.value = false })

function togglePanel() {
  open.value = !open.value
  if (open.value) {
    tab.value = ui.settings.source
    props.radio.loadCatalog()
  } else confirming.value = false
}
async function closePanel() {
  open.value = false
  confirming.value = false
  await nextTick()
  trigger.value?.focus()
}
function duration(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const time = Math.floor(seconds)
  return Math.floor(time / 60) + ':' + String(time % 60).padStart(2, '0')
}
function active(track) { return tab.value === ui.settings.source && track.id === ui.settings.trackId }

async function handleImport(event) {
  const batch = Array.from(event.target.files || [])
  event.target.value = ''
  if (!batch.length || importing.value) return
  importing.value = true
  result.value = null
  try {
    result.value = await importTracks(batch, (done, total) => { progress.value = '正在导入 ' + done + ' / ' + total })
    await props.radio.reloadLocal()
  } catch (error) {
    result.value = {added:0, duplicates:0, skipped:0, failures:[{message:error.message}]}
  } finally { importing.value = false; progress.value = '' }
}

async function clearMusic() {
  confirming.value = false
  importing.value = true
  result.value = null
  try {
    props.radio.beforeClear()
    await clearLocalMusic()
    await props.radio.reloadLocal()
    result.value = {notice:'已清空「我的音乐」。'}
  } catch (error) {
    result.value = {added:0, duplicates:0, skipped:0, failures:[{message:error.message}]}
  } finally { importing.value = false }
}
</script>

<template>
  <aside class="game-radio" :inert="blocked" aria-label="游戏电台"
    @keydown.esc="open && ($event.stopPropagation(), closePanel())">
    <div class="radio-mini">
      <button ref="trigger" class="radio-title" type="button" aria-label="电台面板" :aria-expanded="open"
        :title="selected?.title ?? station" @click="togglePanel">
        <span aria-hidden="true" class="radio-note">♫</span>
        <span class="radio-label"><small>{{ station }}</small><strong>{{ selected?.title ?? '电台' }}</strong></span>
        <span aria-hidden="true" class="radio-chevron">{{ open ? '▴' : '▾' }}</span>
      </button>
      <button class="radio-mute" type="button" :aria-pressed="ui.settings.muted"
        :aria-label="ui.settings.muted ? '恢复声音' : '静音'" :disabled="!ui.supported"
        :title="ui.settings.muted ? '恢复声音 (M)' : '静音 (M)'" @click="radio.setMuted()">
        <svg class="radio-speaker" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/>
          <path v-if="ui.settings.muted" d="m12 8 4 4m0-4-4 4" stroke="currentColor" stroke-width="1.5"/>
          <path v-else d="M12 7a4 4 0 0 1 0 6m2-8a6.5 6.5 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.3"/>
        </svg>
      </button>
      <input class="radio-mini-volume" type="range" min="0" max="100" :value="volume" aria-label="电台音量"
        :disabled="!ui.supported" @input="radio.setVolume($event.target.value / 100)">
      <span class="radio-status" :data-status="ui.status">{{ status }}</span>
    </div>

    <section v-if="open" class="radio-panel" aria-label="电台设置">
      <header class="radio-panel-head"><h2>电台</h2><button type="button" aria-label="关闭电台面板" @click="closePanel">×</button></header>
      <p v-if="!ui.supported" role="status">浏览器不支持电台的多标签页播放保护。请用电脑版 Edge 或 Chrome 打开。</p>
      <template v-else>
        <div class="radio-tabs" aria-label="曲库">
          <button v-for="option in ['default','local']" :key="option" type="button" :aria-pressed="tab === option"
            @click="tab = option; confirming = false">{{ option === 'default' ? '默认电台' : '我的音乐' }}</button>
        </div>
        <p v-if="ui.loading && !tracks.length" class="radio-empty">正在读取曲目…</p>
        <p v-else-if="!tracks.length" class="radio-empty">{{ tab === 'default' ? '默认电台暂不可用' : (ui.libraryIssue || '还没有导入音乐。') }}</p>
        <ol v-else class="radio-tracks" :aria-label="panelTitle">
          <li v-for="(track, index) in tracks" :key="track.id">
            <button type="button" :aria-current="active(track) ? 'true' : undefined" :title="track.title"
              @click="radio.startFromClick(tab, index)">
              <span aria-hidden="true" class="radio-marker">{{ active(track) && ui.status === 'playing' ? '▶' : '' }}</span>
              <span class="radio-track-name">{{ track.title }}</span>
              <span class="radio-duration">{{ duration(track.durationSec) }}</span>
            </button>
          </li>
        </ol>
        <p v-if="ui.issue" class="radio-issue" role="status">{{ ui.issue }}</p>
        <div class="radio-actions">
          <button v-if="ui.status !== 'playing' || ui.settings.source !== tab" type="button" class="radio-play"
            :disabled="!tracks.length" @click="radio.startFromClick(tab)">{{ selected && ui.settings.source === tab ? '继续收听' : '开始收听' }}</button>
          <button type="button" :aria-pressed="ui.settings.muted" @click="radio.setMuted()">{{ ui.settings.muted ? '恢复声音' : '静音' }}</button>
          <button type="button" :disabled="ui.settings.closed" @click="radio.close()">关闭电台</button>
        </div>
        <label class="radio-volume">音量
          <input type="range" min="0" max="100" :value="volume" @input="radio.setVolume($event.target.value / 100)">
          <span>{{ volume }}%</span>
        </label>
        <label class="radio-resume">练习后
          <select :value="ui.settings.resumePolicy" @change="radio.setResumePolicy($event.target.value)">
            <option value="continue">接着播</option><option value="restart">从曲首播</option><option value="manual">手动恢复</option>
          </select>
        </label>
        <div v-if="tab === 'local'" class="radio-import">
          <input ref="files" type="file" multiple hidden accept=".mp3,.m4a,.ogg,.wav,audio/mpeg,audio/mp4,audio/ogg,audio/wav"
            @change="handleImport">
          <div class="radio-actions">
            <button type="button" :disabled="importing" @click="files.click()">导入音乐</button>
            <button type="button" :disabled="importing || !tracks.length" @click="confirming = true">清空我的音乐</button>
          </div>
          <p v-if="confirming" class="radio-issue">清空浏览器内已导入的音乐？</p>
          <div v-if="confirming" class="radio-actions">
            <button type="button" @click="clearMusic">确认清空</button><button type="button" @click="confirming = false">取消</button>
          </div>
          <p v-if="progress" role="status">{{ progress }}</p>
          <div v-if="result" role="status">
            <p v-if="result.notice">{{ result.notice }}</p>
            <template v-else>
              <p>已导入 {{ result.added }} 首，重复 {{ result.duplicates }} 首，失败 {{ result.failures.length }} 首。</p>
              <p v-if="result.skipped">每批最多导入 20 个文件，本批还有 {{ result.skipped }} 个未处理。</p>
              <ul v-if="result.failures.length" class="radio-failures">
                <li v-for="(item, index) in result.failures" :key="index">{{ item.name ? item.name + ' · ' : '' }}{{ item.message }}</li>
              </ul>
            </template>
          </div>
        </div>
      </template>
    </section>
  </aside>
</template>

<style scoped>
.game-radio{position:relative;max-width:100%;font-size:.8rem;color:#423523;z-index:5}
.radio-mini{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;padding:.22rem .42rem;background:#fff5db;border:1px solid #d4bc8f;border-radius:.6rem}
.game-radio button,.game-radio select{min-height:1.8rem;border:1px solid #d6c09b;border-radius:.35rem;background:#fcf2dc;color:#403422;padding:.18rem .42rem;font:inherit;cursor:pointer}
.game-radio button:disabled{opacity:.55;cursor:default}
.game-radio button:focus-visible,.game-radio input:focus-visible,.game-radio select:focus-visible{outline:2px solid #775d36;outline-offset:2px}
.radio-mini .radio-title{display:flex;align-items:center;gap:.4rem;max-width:11rem;border-color:transparent;text-align:left;padding:.12rem .28rem;background:transparent}
.radio-label{display:grid;min-width:0;line-height:1.15}
.radio-label strong,.radio-track-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.radio-label small{font-size:.65rem;color:#69583e}
.radio-note{font-size:1.1rem}
.radio-chevron{font-size:.8rem;color:#69583e}
.radio-mini .radio-mute{display:grid;place-items:center;padding:0;width:1.85rem}
.radio-speaker{width:1rem;height:1rem}
.game-radio input[type=range]{accent-color:#795c3a;min-height:1rem}
.radio-mini-volume{width:3.3rem;margin:0}
.radio-status{white-space:nowrap;font-size:.69rem;color:#645334}
.radio-status[data-status=playing]{color:#3e5f46}
.radio-panel{position:absolute;right:0;top:calc(100% + .4rem);width:min(19rem,calc(100vw - 2rem));padding:.65rem;background:#fffbef;border:1px solid #c5a974;border-radius:.65rem;box-shadow:0 8px 20px #3c2e2133;box-sizing:border-box}
.radio-panel h2{font-size:1rem;margin:0}
.radio-panel-head,.radio-tabs,.radio-actions,.radio-volume,.radio-resume{display:flex;align-items:center;gap:.38rem}
.radio-panel-head{justify-content:space-between;margin-bottom:.42rem}
.radio-tabs button{flex:1}
.radio-tabs [aria-pressed=true],.game-radio .radio-play{background:#634e34;color:#fff8e6;border-color:#634e34}
.radio-tracks,.radio-failures{max-height:11rem;overflow:auto;padding:0;margin:.45rem 0;list-style:none}
.radio-tracks button{display:grid;width:100%;grid-template-columns:1rem minmax(0,1fr) 2.75rem;align-items:center;gap:.2rem;text-align:left;border:0;background:transparent}
.radio-tracks button:hover,.radio-tracks button[aria-current=true]{background:#f0e2bc}
.radio-duration{text-align:right;color:#645334;font-variant-numeric:tabular-nums}
.radio-empty,.radio-import p{margin:.5rem 0}
.radio-empty{color:#69583e}
.radio-actions,.radio-volume,.radio-resume{margin-top:.4rem;flex-wrap:wrap}
.radio-volume input{flex:1}
.radio-import{border-top:1px solid #d6c09b;margin-top:.5rem}
.radio-issue{margin:.45rem 0;color:#892b21;overflow-wrap:anywhere}
.radio-failures{max-height:4.5rem}
.radio-failures li{margin-bottom:.2rem;overflow-wrap:anywhere}
</style>
