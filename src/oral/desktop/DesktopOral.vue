<script setup>
import {canPlayPracticeAudio, registerPlayer} from '../../../oral-assistant/web/practice-audio-gate.js'
import {ref, computed, onMounted, onBeforeUnmount, nextTick, watch} from 'vue'
import WordLine from './WordLine.vue'
import {openMicrophone} from './microphone.js'

const apiRoot = '/api/lecture'
const scopeKey = 'qihang-oral-scope-v1'
const route = ref('home'), packs = ref([]), selected = ref(''), session = ref(null)
const error = ref(''), busy = ref(false), sound = ref(''), mic = ref(''), heardClip = ref(false)
const focusLine = ref(null)
let version = 0, player, blobURL, capture, stopTimer, nextTimer, pointer, toggled = false
function stored(k) { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
function store(k,v) { localStorage.setItem(k, JSON.stringify(v)) }
const pack = computed(() => packs.value.find(p => p.id === selected.value))
const book = p => p.book?.fr || p.book || p.source?.split(' · ')[0] || 'Inspire 1'
const books = computed(() => [...new Set(packs.value.map(book))])
const units = computed(() => [...new Set(packs.value.filter(p => book(p) === book(pack.value)).map(p => p.unit))])
const lessons = computed(() => packs.value.filter(p => book(p) === book(pack.value) && p.unit === pack.value.unit))
function choose(level,value) {
  const match = packs.value.find(p => level === 'book' ? book(p) === value :
    level === 'unit' ? book(p) === book(pack.value) && String(p.unit) === value : p.id === value)
  if (match) { selected.value = match.id; store(scopeKey,match.id) }
}
const lines = computed(() => session.value?.text.sentences || [])
const step = computed(() => session.value?.queue[0])
const line = computed(() => lines.value.find(s => s.id === step.value))
const phase = computed(() => session.value?.phase)
const report = computed(() => session.value?.report)
const feedback = computed(() => {
  const s = session.value, a = s?.attempts.at(-1)
  return a && a.revision === s.revision && a.step === step.value ? a.result : null
})
const names = {pass:'通过',border:'边缘',retry:'重读',uncertain:'待确认'}
const activeText = computed(() => line.value?.fr || lines.value.map(l => l.fr).join(' '))
const reading = computed(() => route.value === 'session' && ['lines','full','review'].includes(phase.value))
const lastKey = () => 'qihang-oral-desktop-last:'+selected.value
const hasRecord = ref(false)
function pauseAdvance(event) { if (event.target.open) clearTimeout(nextTimer) }
watch(selected, () => { hasRecord.value = !!stored(lastKey()) })
const cards = [
  {name:'听辨打卡',fr:'Écoute',hint:'听一个词，选出它的意思。',icon:'♪'},
  {name:'影子跟读',fr:'En écho',hint:'跟着原声的节奏开口。',icon:'≈'},
  {name:'语法闯关',fr:'Grammaire',hint:'把学过的句型读进对话。',icon:'{ }'}
]
async function request(path,options) {
  const response = await (window.QihangOralClient?.fetch || fetch)(path,options)
  if (!response.ok) {
    const msg = await response.json().catch(() => ({}))
    throw Error(msg.error || '本机口语服务暂时不可用，请再试一次。')
  }
  return response
}
const post = data => ({method:'POST',headers:{'Content-Type':'application/json','X-Oral-Client':'web'},body:JSON.stringify(data)})
function silence() {
  if (player) { player.onended = player.onerror = null; player.pause(); player = null }
  if (blobURL) URL.revokeObjectURL(blobURL)
  blobURL = ''; sound.value = ''
}
function cancelMic() {
  clearTimeout(stopTimer); capture?.close(); capture = null; pointer = undefined
  toggled = false; mic.value = ''
}
function move(view) {
  ++version; clearTimeout(nextTimer); cancelMic(); silence()
  error.value = ''; busy.value = false; route.value = view
  window.scrollTo(0,0)
}
async function work(fn) {
  if (busy.value) return
  const epoch = version
  error.value = ''; busy.value = true
  try { await fn(epoch) } catch(e) { if (epoch === version) error.value = e.message }
  finally { if (epoch === version) busy.value = false }
}
async function load() {
  await work(async epoch => {
    const data = await (await request(apiRoot+'?layout=desktop')).json()
    if (epoch !== version) return
    packs.value = data.texts
    selected.value = packs.value.find(p => p.id === stored(scopeKey))?.id || packs.value[0]?.id || ''
    if (!selected.value) error.value = '本机还没有课文包。'
  })
  if (pack.value && new URLSearchParams(location.search).has('read')) await begin()
}
function exam() {
  location.assign(window.QihangOralClient ? 'index.html?from=atelier' : '/?from=atelier')
}
async function begin(history=false) {
  await work(async epoch => {
    const id = stored(lastKey())
    let s
    if (id) {
      try { s = await (await request(apiRoot+'/'+id)).json() } catch(e) {
        if (!e.message.includes('没有找到')) throw e
      }
    }
    if (!s || (!history && s.phase === 'ended')) {
      s = await (await request(apiRoot,post({text:selected.value,layout:'desktop'}))).json()
    }
    if (epoch !== version) return
    if (s.layout !== 'desktop') throw Error('本机服务需要更新才能使用桌面盲读。')
    store(lastKey(),s.id); hasRecord.value = true
    move('session'); apply(s)
  })
}
function apply(s, replay=true) {
  session.value = s
  if (s.phase === 'ended') {
    const day = new Date().toLocaleDateString(), last = stored('qihang-oral-desktop-streak')
    store('qihang-oral-desktop-streak',{day,best:Math.max(s.report.todayBest,last?.day === day ? last.best : 0)})
  }
  if (s.phase === 'review' && replay) {
    if (s.report.streaks[step.value]>=2) scheduleNext()
    else { heardClip.value = false; play(1) }
  }
  if (s.phase === 'lines' && feedback.value && feedback.value.status !== 'uncertain') scheduleNext()
  nextTick(() => focusLine.value?.scrollIntoView({block:'nearest'}))
}
async function advance(action,step) {
  clearTimeout(nextTimer)
  await work(async epoch => {
    const s = session.value
    const next = await (await request(apiRoot+'/'+s.id+'/'+s.revision+'/advance',post({action,step}))).json()
    if (epoch === version) { silence(); apply(next) }
  })
}
function scheduleNext() {
  clearTimeout(nextTimer)
  const revision = session.value.revision
  nextTimer = setTimeout(() => {
    if (route.value === 'session' && !mic.value && session.value.revision === revision) advance('next')
  },2400)
}
async function play(rate) {
  if (mic.value || phase.value !== 'review' || !canPlayPracticeAudio()) return
  silence(); error.value = ''
  const epoch = version, id = step.value, audio = new Audio()
  player = audio; sound.value = '加载原声'
  try {
    const blob = await (await request(apiRoot+'/'+session.value.id+'/clip/'+id)).blob()
    if (epoch !== version || player !== audio || !canPlayPracticeAudio()) return
    blobURL = URL.createObjectURL(blob); audio.src = blobURL; audio.playbackRate = rate
    audio.onended = () => { heardClip.value = true; sound.value = '' }
    audio.onerror = () => { sound.value = ''; error.value = '原声未能播放，请点重播。' }
    await audio.play()
    if (player === audio) sound.value = '原声播放中'
  } catch { if (epoch === version && player === audio) { sound.value=''; error.value='请点重播听教材原声。' } }
}
const micBlocked = computed(() => busy.value || !!sound.value || (phase.value==='review' && !heardClip.value))
async function press() {
  if (!reading.value || mic.value || micBlocked.value) return
  clearTimeout(nextTimer); error.value = ''; mic.value = 'opening'
  const c = openMicrophone(); capture = c
  try {
    await c.ready
    if (capture !== c) return
    mic.value = 'recording'
    stopTimer = setTimeout(release, phase.value === 'full' ? 175000 : 55000)
  } catch(e) {
    if (capture !== c) return
    cancelMic(); error.value = e.name === 'NotAllowedError' ? '请在浏览器地址栏允许麦克风，然后再读一次。' : '麦克风未就绪，请检查输入设备。'
  }
}
async function release() {
  if (!capture || mic.value === 'sending') return
  if (mic.value === 'opening') { cancelMic(); error.value='麦克风准备好后，请再按住朗读。'; return }
  const c = capture, epoch = version, s = session.value
  clearTimeout(stopTimer); mic.value = 'sending'
  try {
    const pcm = await c.finish()
    if (epoch !== version || capture !== c) return
    if (!pcm || pcm.size < 3200) throw Error('这次录音太短，请按住读完再松开。')
    const result = await (await request(apiRoot+'/'+s.id+'/'+s.revision+'/record',{
      method:'POST',headers:{'X-Oral-Client':'web'},body:pcm
    })).json()
    if (epoch !== version) return
    apply(result,false)
    if ((phase.value==='review' && result.report.streaks[step.value]>=2) ||
        (phase.value==='full' && feedback.value?.status==='pass')) scheduleNext()
  } catch(e) { if (epoch === version) error.value = e.message }
  finally { c.close(); if (epoch === version) { capture = null; mic.value=''; toggled=false; pointer=undefined } }
}
function down(e) {
  if (e.button !== 0 || micBlocked.value || mic.value) return
  pointer=e.pointerId; e.currentTarget.setPointerCapture(pointer); press()
}
function up(e) {
  if (e.pointerId !== pointer) return
  pointer=undefined
  const r=e.currentTarget.getBoundingClientRect()
  if (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) cancelMic()
  else release()
}
function accessibleClick(e) { if (e.detail === 0) { if (toggled) release(); else { toggled=true; press() } } }
function lostFocus() { if (mic.value==='recording' || mic.value==='opening') cancelMic() }
function leave() { move('home') }
let unregisterAudio
onMounted(() => { unregisterAudio=registerPlayer(silence); window.addEventListener('blur',lostFocus); window.addEventListener('pagehide',leave); load() })
onBeforeUnmount(() => { unregisterAudio?.(); leave(); window.removeEventListener('blur',lostFocus); window.removeEventListener('pagehide',leave) })
const pct = n => Math.round(n*100)+'%'
const scored = computed(() => lines.value.map(l=>report.value?.scores[l.id]).filter(Boolean))
function mean(key) { return scored.value.length ? pct(scored.value.reduce((n,s)=>n+s[key],0)/scored.value.length) : '—' }
const today = computed(() => {
  const record = stored('qihang-oral-desktop-streak')
  return Math.max(report.value?.todayBest || 0, record?.day === new Date().toLocaleDateString() ? record.best : 0)
})
async function downloadRecord() {
  await work(async epoch => {
    const blob=await (await request(apiRoot+'/'+session.value.id+'/export')).blob()
    if (epoch !== version) return
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='Lecture-'+session.value.id+'.zip'
    a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),10000)
  })
}
</script>

<template>
<main class="desk">
<header class="mast"><div class="brand"><span class="brand-mark" aria-hidden="true"><i/><i/><i/><i/></span>启航法语<span class="divider"/>口语练习</div>
<button v-if="route!=='home'" class="back" @click="leave">← 模式选择</button><span v-else class="mast-note" lang="fr">Atelier oral</span></header>
<div v-if="error" role="alert" class="alert">{{error}} <button v-if="route==='home'" @click="load">重试</button></div>

<section v-if="route==='home'" class="landing">
<div class="intro"><div><p class="overline" lang="fr">Atelier de français</p><h1>口语练习室</h1></div>
<div v-if="pack" class="scope"><label>教材<select :value="book(pack)" @change="choose('book',$event.target.value)"><option v-for="b in books" :key="b">{{b}}</option></select></label><label>单元<select :value="pack.unit" @change="choose('unit',$event.target.value)"><option v-for="u in units" :key="u" :value="u">Unité {{u}}</option></select></label><label>课<select :value="pack.id" @change="choose('lesson',$event.target.value)"><option v-for="p in lessons" :key="p.id" :value="p.id">Leçon {{p.lesson}}{{lessons.filter(q=>q.lesson===p.lesson).length>1?' · '+p.title.zh:''}}</option></select></label></div>
<span v-else class="muted">{{busy?'正在读取课本…':'课本未就绪'}}</span></div>
<div class="mode-grid">
<button class="mode daily" :disabled="!pack" @click="move('games')"><span class="card-fr" lang="fr">Pratique</span><span class="bars" aria-hidden="true"><i v-for="n in 19" :key="n" :style="{'--bar':[24,38,60,45,72,96,67,42,75,100,65,44,60,82,48,31,50,35,20][n-1]+'%'}"/></span>
<strong>日常练习</strong><span class="card-foot">跟着课本，练好每一句。<b aria-hidden="true">↗</b></span></button>
<button class="mode exam" @click="exam"><span class="card-fr" lang="fr">Examen</span><span class="exam-label">DELF <b>A1</b></span><strong>考试模拟</strong><span class="card-foot">进入考场，完成三项口试。<b aria-hidden="true">↗</b></span></button></div></section>

<section v-else-if="route==='games'" class="landing"><p class="overline">{{book(pack)}} / Unité {{pack.unit}} / Leçon {{pack.lesson}}</p><h1>日常练习</h1>
<div class="games"><button class="game live" :disabled="busy" @click="begin()"><i class="glyph">Aa</i><span lang="fr">Lecture</span><strong>读课文</strong><small>{{pack.title.zh}} · {{pack.sentences.length}} 句</small><b class="go">↗</b></button>
<article v-for="c in cards" :key="c.name" class="game"><i class="glyph">{{c.icon}}</i><em>开发中</em><span lang="fr">{{c.fr}}</span><strong>{{c.name}}</strong><small>{{c.hint}}</small></article></div>
<button v-if="hasRecord" class="text-link" :disabled="busy" @click="begin(true)">查看上次朗读 →</button></section>

<template v-else-if="session">
<section v-if="reading" class="reader">
<div class="track-head"><span>{{session.text.title.fr}}</span><span>{{phase==='full'?'整段连读':phase==='review'?'红句精练':'课文盲读'}} · {{line?lines.indexOf(line)+1:lines.length}} / {{lines.length}}</span></div>
<div class="track"><i :style="{transform:'scaleX('+report.recorded/lines.length+')'}"/></div>
<div class="dots"><i v-for="l in lines" :key="l.id" :class="[report.scores[l.id]?.status,{current:l.id===step}]" :title="names[report.scores[l.id]?.status]||'尚未判定'"/></div>
<div class="sentence-box" ref="focusLine"><p class="overline">{{phase==='review'?'Écouter et répéter':phase==='full'?'Lecture intégrale':'Lecture à voix haute'}}</p>
<h1 :class="{long:phase==='full'}"><WordLine :key="session.revision" :text="activeText" :result="feedback"/></h1>
<p v-if="phase!=='full'" class="translation">{{line?.zh}}</p></div>
<div class="controls"><p role="status" class="prompt" :class="feedback?.status">{{error?'':mic==='sending'?'本机正在识别…':mic==='opening'?'正在准备麦克风…':mic==='recording'?'正在录音，松手识别':sound|| (feedback ? (feedback.status==='uncertain'?'这次没听清，再读一次，不计错。':names[feedback.status]+(feedback.extras?.length?' · 多读 '+feedback.extras.map(e=>e.text).join(' '):'')) : phase==='lines'?'直接读，不用先听。':phase==='review'?'听原声，再读两次。':'看着原文，连起来读一遍。')}}</p>
<button v-if="phase==='review'" class="secondary" :disabled="!!mic" @click="play(.8)">▷ 慢听 0.8×</button>
<button class="speak" :class="{recording:mic==='recording'}" :disabled="micBlocked || mic==='sending'" @pointerdown="down" @pointerup="up" @pointercancel="cancelMic" @click="accessibleClick"><span aria-hidden="true">●</span> {{mic==='recording'?'松手识别':mic==='sending'?'识别中…':phase==='review'?'按住跟读':'按住说话'}}</button>
<p v-if="phase==='review'" class="muted">连续通过 {{report.streaks[step]||0}} / 2</p>
<button v-if="phase==='full' && feedback && feedback.status!=='uncertain'" class="text-link" @click="advance('next')">查看报告 →</button>
</div><details class="more" @toggle="pauseAdvance"><summary>课文与进度</summary><ol><li v-for="l in lines" :key="l.id" :class="{now:l.id===step}" lang="fr"><WordLine :text="l.fr" :result="report.scores[l.id]"/></li></ol><button class="text-link" :disabled="!!mic||busy" @click="advance('skip')">跳过本步</button><button v-if="feedback && feedback.status!=='uncertain' && phase==='lines'" class="text-link" @click="advance('next')">下一句 →</button></details></section>

<section v-else-if="phase==='list'" class="landing narrow"><p class="overline">Relecture · {{session.text.title.fr}}</p><h1>{{report.wrong.length?'红句清单':'逐句朗读结束'}}</h1>
<p class="muted">{{report.wrong.length?'先听原声，再把这些句子读两次。':'这轮没有需要精练的红句。'}}</p>
<ol class="list"><li v-for="id in report.wrong" :key="id"><small>第 {{lines.findIndex(l=>l.id===id)+1}} 句</small><strong lang="fr">{{lines.find(l=>l.id===id)?.fr}}</strong><span>需重读 · {{report.redWords[id].join('、')}}</span><button class="text-link" :disabled="busy" @click="advance('drill',id)">练这句 →</button></li></ol>
<div class="actions"><button v-if="report.wrong.length" class="speak" :disabled="busy" @click="advance('drill')">开始精练 →</button><button class="secondary" :disabled="busy" @click="advance('full')">整段连读</button><button class="text-link" :disabled="busy" @click="advance('finish')">查看报告 →</button></div></section>

<section v-else-if="phase==='ended'" class="landing narrow"><p class="overline">Bilan de lecture</p><h1>本课朗读报告</h1><p class="muted">{{session.text.title.zh}} · {{session.text.title.fr}} <b v-if="report.cleared">✓ 本课通关</b></p>
<div class="metrics"><div v-for="[title,value] in [['有效朗读',report.recorded+'/'+lines.length],['平均覆盖率',mean('coverage')],['平均准确率',mean('accuracy')],['今日连击',today+' 句']]" :key="title"><small>{{title}}</small><strong>{{value}}</strong></div></div>
<p>常错词　<strong>{{report.frequent.map(p=>p[0]+' ×'+p[1]).join('　')||'暂无'}}</strong></p><ol class="list"><li v-for="l in lines" :key="l.id"><strong lang="fr">{{l.fr}}</strong><span>{{report.scores[l.id]?names[report.scores[l.id].status]+' · '+pct(report.scores[l.id].accuracy):'尚无有效判定'}}</span></li></ol>
<div class="actions"><button class="speak" :disabled="busy" @click="report.wrong.length?advance('drill'):move('games')">{{report.wrong.length?'再练一遍红的':'完成'}}</button><button class="text-link" :disabled="busy" @click="downloadRecord">导出记录</button></div></section>
</template></main>
</template>
