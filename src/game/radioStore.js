import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'

export const RADIO_KEY = 'qihang-game-radio-state'
export const LIBRARY_KEY = 'qihang-game-radio-library'
const defaults = Object.freeze({
  version:1, source:'default', trackIndex:0, trackId:null, volume:.35, muted:false, closed:false,
  positionSec:0, resumePolicy:'continue', updatedAt:0,
})
const MiB = 1024 * 1024
const maxFileBytes = 100 * MiB
const maxLibraryBytes = 256 * MiB
const maxSeconds = 120 * 60
const maxFiles = 20
const formats = new Set(['mp3','m4a','ogg','wav'])

export function loadRadioState() {
  let state
  try { state = JSON.parse(localStorage.getItem(RADIO_KEY)) }
  catch { return {...defaults} }
  if (!state || typeof state !== 'object' || state.version > defaults.version) return {...defaults}
  // The first release can also read an unversioned preference object.
  return {
    version:1,
    source:state.source === 'local' ? 'local' : 'default',
    trackIndex:Number.isSafeInteger(state.trackIndex) && state.trackIndex >= 0 ? state.trackIndex : 0,
    trackId:typeof state.trackId === 'string' ? state.trackId : null,
    volume:Number.isFinite(state.volume) ? Math.max(0, Math.min(1, state.volume)) : defaults.volume,
    muted:state.muted === true,
    closed:state.closed === true,
    positionSec:Number.isFinite(state.positionSec) ? Math.max(0, state.positionSec) : 0,
    resumePolicy:['continue','restart','manual'].includes(state.resumePolicy) ? state.resumePolicy : 'continue',
    updatedAt:Number.isFinite(state.updatedAt) ? state.updatedAt : 0,
  }
}

export function saveRadioState(patch) {
  try {
    const raw = JSON.parse(localStorage.getItem(RADIO_KEY))
    if (raw?.version > defaults.version) return false
  } catch { /* Replace invalid JSON with validated preferences. */ }
  try {
    localStorage.setItem(RADIO_KEY, JSON.stringify({...loadRadioState(), ...patch, updatedAt:Date.now()}))
    return true
  } catch { return false }
}

let database
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('qihang-game-radio', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('tracks', {keyPath:'id'})
      request.result.createObjectStore('audio', {keyPath:'id'})
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('请关闭其他电台窗口后重试。'))
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = null }
      resolve(request.result)
    }
  }).catch(error => { database = null; throw error })
  return database
}

function transaction(db, names, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode)
    let result, issue
    tx.oncomplete = () => resolve(result)
    tx.onabort = () => reject(issue ?? tx.error ?? new Error('本机曲库未能保存。'))
    const done = value => { result = value }
    const fail = error => { issue = error; tx.abort() }
    try { run(tx, done, fail) } catch (error) { fail(error) }
  })
}

export async function localTracks() {
  const db = await openDatabase()
  return transaction(db, ['tracks'], 'readonly', (tx, done) => {
    const request = tx.objectStore('tracks').getAll()
    request.onsuccess = () => done(request.result.sort((a,b) => a.order - b.order))
  })
}

export async function localTrackBlob(id) {
  const db = await openDatabase()
  return transaction(db, ['audio'], 'readonly', (tx, done) => {
    const request = tx.objectStore('audio').get(id)
    request.onsuccess = () => done(request.result?.blob)
  })
}

function durationOf(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const timer = setTimeout(() => finish(NaN), 7000)
    function finish(duration) {
      clearTimeout(timer)
      audio.onloadedmetadata = audio.onerror = null
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
      if (Number.isFinite(duration) && duration > 0) resolve(duration)
      else reject(new Error('无法读取音频。文件可能损坏或编码不受支持，请试用 MP3 或 WAV。'))
    }
    audio.onloadedmetadata = () => finish(audio.duration)
    audio.onerror = () => finish(NaN)
    audio.preload = 'metadata'
    audio.src = url
  })
}

async function hashFile(file) {
  const hash = sha256.create()
  for (let offset = 0; offset < file.size; offset += MiB) {
    const bytes = await file.slice(offset, offset + MiB).arrayBuffer()
    hash.update(new Uint8Array(bytes))
  }
  return bytesToHex(hash.digest())
}

async function addTrack(db, file, track) {
  return transaction(db, ['tracks','audio'], 'readwrite', (tx, done, fail) => {
    const metadata = tx.objectStore('tracks')
    const query = metadata.getAll()
    query.onsuccess = () => {
      const rows = query.result
      if (rows.some(item => item.id === track.id)) { done(false); return }
      const {bytes, seconds, order} = rows.reduce((totals, row) => ({
        bytes:totals.bytes + row.bytes, seconds:totals.seconds + row.durationSec,
        order:Math.max(totals.order, row.order),
      }), {bytes:0, seconds:0, order:0})
      if (bytes + file.size > maxLibraryBytes) { fail(new Error('「我的音乐」已达到 256 MiB 上限。')); return }
      if (seconds + track.durationSec > maxSeconds) { fail(new Error('「我的音乐」累计时长不能超过 120 分钟。')); return }
      metadata.add({...track, order:order + 1})
      tx.objectStore('audio').add({id:track.id, blob:file})
      done(true)
    }
  })
}

function alertLibraryChange() {
  try { localStorage.setItem(LIBRARY_KEY, crypto.randomUUID()) }
  catch { /* The local panel can still show the result. */ }
}

export async function importTracks(files, progress) {
  const result = {added:0, duplicates:0, failures:[], skipped:Math.max(0, files.length - maxFiles)}
  const batch = Array.from(files).slice(0, maxFiles)
  if (!batch.length) return result
  const db = await openDatabase()
  const known = new Set((await localTracks()).map(track => track.id))
  progress?.(0, batch.length)
  for (const [index, file] of batch.entries()) {
    try {
      if (!formats.has(file.name.split('.').at(-1)?.toLowerCase())) throw new Error('仅支持 MP3、M4A、OGG、WAV。')
      if (file.size > maxFileBytes) throw new Error('单个文件不能超过 100 MiB。')
      if (!file.size) throw new Error('文件没有内容。')
      const id = await hashFile(file)
      if (known.has(id)) result.duplicates++
      else {
        const durationSec = await durationOf(file)
        const space = await navigator.storage?.estimate().catch(() => null)
        if (space?.quota && space.quota - (space.usage ?? 0) < file.size) {
          throw new Error('浏览器剩余空间不足，请先清理本机音乐。')
        }
        const title = file.name.replace(/\.[^.]+$/, '').slice(0, 180) || file.name
        if (await addTrack(db, file, {id, title, durationSec, bytes:file.size})) result.added++
        else result.duplicates++
        known.add(id)
      }
    } catch (error) {
      const message = error.name === 'QuotaExceededError' ? '浏览器储存空间不足，请先清理本机音乐。'
        : error.name === 'NotReadableError' ? '文件已移动或无法读取，请重新选择。' : error.message
      result.failures.push({name:file.name, message})
    } finally { progress?.(index + 1, batch.length) }
  }
  if (result.added) alertLibraryChange()
  return result
}

export async function clearLocalMusic() {
  const db = await openDatabase()
  await transaction(db, ['tracks','audio'], 'readwrite', tx => {
    tx.objectStore('tracks').clear()
    tx.objectStore('audio').clear()
  })
  alertLibraryChange()
}
