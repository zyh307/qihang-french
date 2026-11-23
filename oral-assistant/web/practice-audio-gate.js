// A radio holds the exclusive lock until all of its elements have stopped.
const lockName = 'qihang-game-audio'
const stopKey = 'qihang-game-audio-stop'
const players = new Set()
let captures = 0
let channel

export const canPlayPracticeAudio = () => captures === 0
export const supportsGameAudio = () => !!navigator.locks

export function registerPlayer(stop) {
  players.add(stop)
  return () => players.delete(stop)
}

function stopPlayers() {
  for (const stop of [...players]) {
    try { stop() }
    catch (error) { console.error(error) }
  }
}

export function listenForPracticeStop(stop) {
  const receiver = typeof BroadcastChannel === 'function' ? new BroadcastChannel(stopKey) : null
  if (receiver) receiver.onmessage = stop
  function storage(event) { if (event.key === stopKey && event.newValue) stop() }
  window.addEventListener('storage', storage)
  return () => {
    receiver?.close()
    window.removeEventListener('storage', storage)
  }
}

function requestRadioStop() {
  if (typeof BroadcastChannel === 'function') {
    channel ??= new BroadcastChannel(stopKey)
    channel.postMessage('stop')
  }
  try { localStorage.setItem(stopKey, crypto.randomUUID()) }
  catch { /* Web Locks still prevent capture while radio holds the lock. */ }
}

function acquire(mode, options = {}) {
  return new Promise((resolve, reject) => {
    const request = navigator.locks.request(lockName, {mode, ...options}, lock => {
      if (!lock) { resolve(null); return }
      return new Promise(finish => resolve(() => { finish(); return request }))
    })
    request.catch(reject)
  })
}

export async function acquireGameAudio() {
  if (!supportsGameAudio()) return null
  return acquire('exclusive', {ifAvailable:true})
}

export async function acquirePracticeLease() {
  if (!supportsGameAudio()) return () => {}
  const idle = await acquire('shared', {ifAvailable:true})
  if (idle) return idle
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  // Queue the shared lock before asking the current owner to release it.
  const pending = acquire('shared', {signal:controller.signal})
  requestRadioStop()
  try {
    const release = await pending
    // The other tab has stopped. Let the system output buffer drain before opening the mic.
    await new Promise(resolve => setTimeout(resolve, 150))
    return release
  }
  catch (error) {
    if (error.name === 'AbortError') throw new Error('另一游戏页的音乐还未停止。请关闭那一页的电台后重试。')
    throw error
  } finally { clearTimeout(timeout) }
}

export function enterCapture() {
  captures += 1
  stopPlayers()
  let left = false
  let release
  function leave() {
    if (left) return
    left = true
    captures -= 1
    release?.()
  }
  const ready = (async () => {
    try {
      release = await acquirePracticeLease()
      if (left) release()
    } catch (error) {
      leave()
      throw error
    }
  })()
  return {ready, leave}
}
