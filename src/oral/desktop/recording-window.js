import {openMicrophone} from './microphone.js'

const sampleRate = 16000
const bytesPerSample = 2

export function pcmWave(pcm) {
  const header = new DataView(new ArrayBuffer(44))
  const label = (text, offset) => {
    for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i))
  }
  label('RIFF', 0)
  header.setUint32(4, 36 + pcm.size, true)
  label('WAVEfmt ', 8)
  header.setUint32(16, 16, true)
  header.setUint16(20, 1, true)
  header.setUint16(22, 1, true)
  header.setUint32(24, sampleRate, true)
  header.setUint32(28, sampleRate * bytesPerSample, true)
  header.setUint16(32, bytesPerSample, true)
  header.setUint16(34, bytesPerSample * 8, true)
  label('data', 36)
  header.setUint32(40, pcm.size, true)
  return new Blob([header, pcm], {type:'audio/wav'})
}

export function openRecordingWindow(limitSeconds, onLimit, onSamples, {withCue = false} = {}) {
  if (!Number.isInteger(limitSeconds) || limitSeconds < 1 || limitSeconds > 180) {
    throw new Error('录音窗口长度无效。')
  }
  const microphone = openMicrophone({onSamples, withCue})
  let startedAt, timer, cancelled = false, finishing
  const ready = microphone.ready.then(() => {
    if (cancelled) return false
    startedAt = performance.now()
    timer = setTimeout(onLimit, limitSeconds * 1000)
    return true
  })

  async function collect() {
    clearTimeout(timer)
    const captured = await microphone.finish()
    if (!captured || cancelled || startedAt == null) return null
    const pcm = captured.slice(0, limitSeconds * sampleRate * bytesPerSample, 'application/octet-stream')
    const endSample = pcm.size / bytesPerSample
    return {pcm, startedAt, endedAt: startedAt + endSample * 1000 / sampleRate,
            startSample: 0, endSample, sampleRate}
  }

  return {
    ready,
    checkpoint: microphone.checkpoint,
    cue: microphone.cue,
    slice: microphone.slice,
    sampleRate,
    finish() {
      finishing ??= collect()
      return finishing
    },
    close() {
      cancelled = true
      clearTimeout(timer)
      microphone.close()
    },
  }
}
