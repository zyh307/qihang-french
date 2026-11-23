import {reactive} from 'vue'
import {acquireGameAudio, listenForPracticeStop, registerPlayer, supportsGameAudio} from '../../oral-assistant/web/practice-audio-gate.js'
import {LIBRARY_KEY, RADIO_KEY, loadRadioState, localTracks, localTrackBlob, saveRadioState} from './radioStore.js'

const defaultUrl = '/api/game/radio/default'
const fade = {start:250, change:220, loop:180, leave:120}

function clearSlot(slot) {
  if (!slot) return
  slot.controller?.abort()
  slot.audio.onerror = null
  slot.audio.pause()
  slot.audio.removeAttribute('src')
  slot.audio.load()
  if (slot.url) URL.revokeObjectURL(slot.url)
  slot.url = null
  slot.track = null
}

function readyForMetadata(audio, signal) {
  if (audio.readyState >= 1) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(unavailable, 7000)
    function complete() { cleanup(); resolve() }
    function unavailable() { cleanup(); reject(new Error('这首歌暂时无法播放。')) }
    function abort() { cleanup(); reject(new DOMException('已停止。', 'AbortError')) }
    function cleanup() {
      clearTimeout(timer)
      audio.removeEventListener('loadedmetadata', complete)
      audio.removeEventListener('error', unavailable)
      signal.removeEventListener('abort', abort)
    }
    audio.addEventListener('loadedmetadata', complete, {once:true})
    audio.addEventListener('error', unavailable, {once:true})
    signal.addEventListener('abort', abort, {once:true})
  })
}

export function createRadioPlayer() {
  const ui = reactive({
    settings:loadRadioState(), catalog:{default:[], local:[]}, status:'waiting', issue:'', libraryIssue:'',
    supported:supportsGameAudio(), loading:false,
  })
  let slots, active, prepared, ramp, timer, releaseOutput, waitingForLease, generation = 0
  let clicked = false, mounted = false, gameReady = false, practice = false, resumeTicket = false
  let lastTick = 0, lastSaved = 0, listenCleanup, unregister, outputIds, loaded = false, loadingCatalog
  const failed = new Set()
  const state = ui.settings

  function remember(patch) {
    Object.assign(state, patch)
    if (!saveRadioState(patch)) ui.issue = '无法保存电台设置。请检查浏览器的本地存储设置。'
  }

  function savePosition() {
    if (!active || !releaseOutput) return
    const {source, index, track, audio} = active
    remember({source, trackIndex:index, trackId:track.id, positionSec:audio.currentTime || 0})
    lastSaved = Date.now()
  }

  function settingsForSlot(slot) {
    slot.audio.muted = state.muted
    slot.audio.volume = state.volume * slot.gain
  }

  function stopImmediately() {
    ++generation
    savePosition()
    clearInterval(timer)
    timer = null
    slots?.forEach(clearSlot)
    active = prepared = ramp = null
    releaseOutput?.()
    releaseOutput = null
    ui.status = state.closed ? 'closed' : 'waiting'
  }

  function settingsChanged(event) {
    if (event.key === LIBRARY_KEY) { reloadLocal().catch(() => {}); return }
    if (event.key !== RADIO_KEY) return
    const fresh = loadRadioState()
    if (active) {
      if (fresh.closed) {
        state.closed = true
        stopImmediately()
      }
      Object.assign(state, {volume:fresh.volume, muted:fresh.muted, closed:fresh.closed, resumePolicy:fresh.resumePolicy})
    } else {
      Object.assign(state, fresh)
    }
    if (active && !fresh.closed) slots.forEach(settingsForSlot)
    if (!active) ui.status = state.closed ? 'closed' : 'waiting'
  }

  async function reloadLocal() {
    try {
      ui.catalog.local = await localTracks()
      ui.libraryIssue = ''
    } catch (error) {
      ui.libraryIssue = '本机曲库无法读取。请检查浏览器的存储设置。'
      throw error
    }
    if (state.source === 'local' && state.trackId && !ui.catalog.local.some(track => track.id === state.trackId)) {
      if (active?.source === 'local') stopImmediately()
      remember({source:'default', trackIndex:0, trackId:null, positionSec:0})
      ui.issue = '这首本机音乐已被清理，请重新导入。'
    }
  }

  async function loadCatalog() {
    if (loadingCatalog) return loadingCatalog
    ui.loading = true
    loadingCatalog = (async () => {
      const defaultFetch = !window.QihangOralClient && ['127.0.0.1','localhost','[::1]'].includes(location.hostname)
        ? fetch(defaultUrl, {cache:'no-store'}).then(async response => {
          if (response.ok) ui.catalog.default = (await response.json()).tracks || []
        }).catch(() => { ui.catalog.default = [] }) : Promise.resolve()
      await Promise.allSettled([defaultFetch, reloadLocal()])
      loaded = true
    })().finally(() => { ui.loading = false; loadingCatalog = null })
    return loadingCatalog
  }

  function setGain(slot, gain) {
    slot.gain = Math.max(0, Math.min(1, gain))
    settingsForSlot(slot)
  }

  function fadeTo(slot, previous, milliseconds, mode = 'play') {
    ramp = {from:previous, to:slot, at:performance.now(), milliseconds, mode}
    if (slot) setGain(slot, 0)
  }

  function cleanupRamp() {
    if (!ramp) return
    if (ramp.from !== active) clearSlot(ramp.from)
    if (active) setGain(active, 1)
    ramp = null
  }

  function slotForPreparation() {
    slots ??= Array.from({length:2}, () => ({audio:new Audio(), gain:0, url:null}))
    return slots.find(slot => slot !== active)
  }

  async function prepare(source, index, position, version) {
    const track = ui.catalog[source][index]
    if (!track) throw new Error('这首歌已不可用。')
    const slot = slotForPreparation()
    clearSlot(slot)
    slot.controller = new AbortController()
    const {signal} = slot.controller
    slot.track = track
    slot.source = source
    slot.index = index
    setGain(slot, 0)
    let url = track.url
    if (source === 'local') {
      const blob = await localTrackBlob(track.id)
      if (!blob) throw new Error('这首本机音乐已被清理，请重新导入。')
      if (signal.aborted || version !== generation) throw new DOMException('已停止。', 'AbortError')
      slot.url = URL.createObjectURL(blob)
      url = slot.url
    }
    slot.audio.preload = 'auto'
    slot.audio.src = url
    await readyForMetadata(slot.audio, signal)
    if (signal.aborted || version !== generation) throw new DOMException('已停止。', 'AbortError')
    if (position > 0 && position < slot.audio.duration) slot.audio.currentTime = position
    return slot
  }

  function nextTrack(slot) {
    const list = ui.catalog[slot.source]
    for (let distance = 1; distance <= list.length; distance++) {
      const index = (slot.index + distance) % list.length
      if (!failed.has(slot.source + ':' + list[index].id)) return {source:slot.source, index}
    }
    return null
  }

  function flagUnavailable(source, index, error) {
    const track = ui.catalog[source][index]
    if (track) failed.add(source + ':' + track.id)
    ui.issue = (track ? track.title + ' · ' : '') + error.message
  }

  async function takeSlot(slot, version, milliseconds) {
    await slot.audio.play()
    if (version !== generation) return
    const previous = active
    active = slot
    prepared = null
    fadeTo(slot, previous, milliseconds)
    slot.audio.onerror = () => {
      if (active !== slot) return
      flagUnavailable(slot.source, slot.index, new Error('播放中断，正尝试下一首。'))
      const next = nextTrack(slot)
      if (next) start(next.source, next.index, 0, true)
      else { stopImmediately(); ui.issue = '这组曲目没有可播放的音频。' }
    }
    remember({closed:false, source:slot.source, trackId:slot.track.id, trackIndex:slot.index,
      positionSec:slot.audio.currentTime || 0})
    ui.status = 'playing'
    lastSaved = lastTick = Date.now()
    timer ??= setInterval(tick, 35)
  }

  function fillNext(slot) {
    const next = nextTrack(slot)
    if (!next) return
    const track = ui.catalog[next.source][next.index]
    const position = track.id === slot.track.id ? track.loopStartSec || 0 : 0
    const candidate = {slot:null, starting:false, ...next}
    prepared = candidate
    const version = generation
    prepare(next.source, next.index, position, version).then(nextSlot => {
      if (version === generation && prepared === candidate) candidate.slot = nextSlot
    }).catch(error => {
      if (version !== generation || prepared !== candidate) return
      prepared = null
      if (error.name !== 'AbortError') flagUnavailable(next.source, next.index, error)
    })
  }

  function tick() {
    const now = Date.now()
    if (now - lastTick > 2500 || document.hidden) { background(); return }
    lastTick = now
    if (ramp) {
      const amount = Math.min(1, (performance.now() - ramp.at) / ramp.milliseconds)
      if (ramp.from) setGain(ramp.from, 1 - amount)
      if (ramp.to) setGain(ramp.to, amount)
      if (amount >= 1) {
        if (ramp.mode === 'leave') { stopImmediately(); return }
        cleanupRamp()
      }
    }
    if (!active || ramp) return
    if (now - lastSaved >= 3000) savePosition()
    const duration = active.audio.duration
    if (!Number.isFinite(duration)) return
    const end = ui.catalog[active.source].length === 1 && active.track.loopEndSec > (active.track.loopStartSec || 0) + 1
      ? Math.min(duration, active.track.loopEndSec) : duration
    const left = end - active.audio.currentTime
    if (!prepared && left < 5) fillNext(active)
    if (prepared?.slot && !prepared.starting && left <= fade.loop / 1000) {
      const current = prepared
      const version = generation
      current.starting = true
      takeSlot(current.slot, version, fade.loop).catch(error => {
        if (version !== generation) return
        flagUnavailable(current.source, current.index, error)
        prepared = null
      })
    } else if (active.audio.ended && !prepared && !nextTrack(active)) stopImmediately()
  }

  async function start(source, index, position, automatic = false) {
    if (!gameReady || practice || document.hidden || !ui.supported || !clicked) return
    if (!ui.catalog[source].length) {
      ui.issue = source === 'default' ? '默认电台暂不可用' : '先导入一首音乐。'
      return
    }
    if (!automatic) {
      ui.issue = ''
      failed.clear()
    }
    const version = ++generation
    try {
      if (!releaseOutput) {
        if (!waitingForLease) {
          waitingForLease = acquireGameAudio().then(release => {
            if (!release) return null
            if (!gameReady || practice || document.hidden || !leaseRequested) { release(); return null }
            releaseOutput = release
            return release
          }).finally(() => { waitingForLease = null })
        }
        leaseRequested = true
        const release = await waitingForLease
        if (version !== generation) return
        if (!release) { ui.issue = '电台正被另一页播放或被口语练习占用。'; return }
      }
      if (version !== generation) return
      cleanupRamp()
      prepared = null
      const slot = await prepare(source, index, position, version)
      await takeSlot(slot, version, active ? fade.change : fade.start)
    } catch (error) {
      if (version !== generation || error.name === 'AbortError') return
      if (!active || active.audio.error) stopImmediately()
      else clearSlot(slots.find(item => item !== active))
      if (error.name === 'NotAllowedError') ui.issue = '点击继续收听。'
      else flagUnavailable(source, index, error)
    }
  }

  let leaseRequested = false
  const halt = () => { leaseRequested = false; stopImmediately() }

  function startFromClick(source = state.source, index) {
    clicked = true
    if (index === undefined) {
      const found = ui.catalog[source].findIndex(track => track.id === state.trackId)
      index = found >= 0 ? found : source === state.source && !state.trackId && ui.catalog[source][state.trackIndex]
        ? state.trackIndex : 0
    }
    const track = ui.catalog[source][index]
    if (active?.source === source && active.track.id === track?.id && !active.audio.paused) return
    const position = source === state.source && track?.id === state.trackId ? state.positionSec : 0
    return start(source, index, position)
  }

  function background() {
    halt()
    resumeTicket = false
  }

  function routeLeave() {
    gameReady = false
    resumeTicket = false
    leaseRequested = false
    if (active && !active.audio.paused) {
      ++generation
      cleanupRamp()
      clearSlot(slots.find(slot => slot !== active))
      prepared = null
      fadeTo(null, active, fade.leave, 'leave')
    } else halt()
  }

  function enterGame() {
    gameReady = true
    if (!ui.supported || mounted) return
    mounted = true
    listenCleanup = listenForPracticeStop(halt)
    unregister = registerPlayer(halt)
    window.addEventListener('storage', settingsChanged)
    window.addEventListener('pagehide', background)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('freeze', background)
    document.addEventListener('resume', background)
    navigator.mediaDevices?.addEventListener('devicechange', deviceChanged)
    setInitialOutputs().catch(() => {})
    if (!loaded) void loadCatalog()
  }

  function visibility() { if (document.hidden) background() }
  async function readOutputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return null
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(device => device.kind === 'audiooutput').map(device => device.deviceId).sort().join('|')
  }
  async function deviceChanged() {
    const before = outputIds
    try {
      outputIds = await readOutputs()
      if (before && before !== outputIds && active) {
        background()
        ui.issue = '音频输出设备已切换，点击继续收听。'
      }
    } catch { /* The operating system may not report physical output changes. */ }
  }

  function stopForPractice() {
    if (!practice) resumeTicket = !!active && !active.audio.paused && !state.closed
    practice = true
    halt()
    return resumeTicket
  }

  function resumeAfterPractice() {
    practice = false
    const resume = resumeTicket
    resumeTicket = false
    if (resume && !state.closed && state.resumePolicy !== 'manual') {
      const saved = ui.catalog[state.source].findIndex(track => track.id === state.trackId)
      if (saved >= 0) return start(state.source, saved, state.resumePolicy === 'restart' ? 0 : state.positionSec)
    }
  }

  function setMuted() {
    remember({muted:!state.muted})
    slots?.forEach(settingsForSlot)
  }
  function setVolume(volume) {
    remember({volume:Math.max(0, Math.min(1, Number(volume)))})
    slots?.forEach(settingsForSlot)
  }
  function close() {
    resumeTicket = false
    halt()
    remember({closed:true})
    ui.status = 'closed'
    ui.issue = ''
  }
  function dispose() {
    background()
    listenCleanup?.()
    unregister?.()
    window.removeEventListener('storage', settingsChanged)
    window.removeEventListener('pagehide', background)
    document.removeEventListener('visibilitychange', visibility)
    document.removeEventListener('freeze', background)
    document.removeEventListener('resume', background)
    navigator.mediaDevices?.removeEventListener('devicechange', deviceChanged)
  }

  // Set a baseline before using device changes to protect against rerouted output.
  async function setInitialOutputs() { outputIds = await readOutputs() }
  return {ui, enterGame, routeLeave, startFromClick, setMuted, setVolume, close, loadCatalog, reloadLocal,
    stopForPractice, resumeAfterPractice, dispose,
    cancelPractice:() => { practice = false; routeLeave() },
    setResumePolicy:resumePolicy => remember({resumePolicy}),
    beforeClear:() => { if (active?.source === 'local') halt() }}
}
