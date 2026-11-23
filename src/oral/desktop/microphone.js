import {enterCapture} from '../../../oral-assistant/web/practice-audio-gate.js'

// Own the stream for a single press, including permission prompts and cancellation.
export function openMicrophone({onSamples, withCue = false} = {}) {
  let closed = false, stream, ctx, worklet, finished, flush, samples = 0, received, endCue
  const chunks = []
  const frames = []
  const audioGate = enterCapture()
  function closeStream() {
    closed = true
    stream?.getTracks().forEach(t => t.stop())
    worklet?.disconnect()
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {})
    finished?.()
    received?.(false)
    endCue?.(null)
  }
  function close() { closeStream(); audioGate.leave() }
  const ready = (async () => {
    await audioGate.ready
    if (closed) return
    stream = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}})
    if (closed) { close(); return }
    ctx = new AudioContext({sampleRate:16000})
    await ctx.resume()
    await ctx.audioWorklet.addModule(window.QihangOralClient?.workletURL || '/assets/capture.js')
    if (closed) return
    worklet = new AudioWorkletNode(ctx, 'oral-capture', {processorOptions:{reportFrames:withCue}})
    worklet.port.onmessage = ({data}) => {
      if (data.flushed) { finished?.(); return }
      if (!closed) {
        const pcm = withCue ? data.samples : data
        if (withCue) frames.push({frame:data.frame, index:samples, count:pcm.length})
        chunks.push(Int16Array.from(pcm, n => Math.round(Math.max(-1,Math.min(n,1)) * (n < 0 ? 32768 : 32767))))
        samples += pcm.length
        received?.(true)
        onSamples?.(pcm)
      }
    }
    ctx.createMediaStreamSource(stream).connect(worklet).connect(ctx.destination)
  })()
  function checkpoint() {
    if (!worklet || closed) return Promise.resolve(samples)
    if (!flush) {
      flush = new Promise(resolve => {
        const timer = setTimeout(resolve, 400)
        finished = () => { clearTimeout(timer); resolve() }
        worklet.port.postMessage('flush')
      }).then(() => {
        finished = null
        flush = null
        return samples
      })
    }
    return flush
  }
  function slice(start, end) {
    return new Blob(chunks, {type:'application/octet-stream'}).slice(start * 2, end * 2, 'application/octet-stream')
  }
  async function cue() {
    if (!withCue || closed || !worklet) return null
    if (!await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        received = null
        reject(new Error('麦克风没有送来录音。请检查麦克风，再试一次。'))
      }, 2000)
      received = started => { clearTimeout(timeout); received = null; resolve(started) }
    }) || closed) return null

    const tone = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = ctx.currentTime + .025
    const end = start + .085
    tone.frequency.value = 980
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(.14, start + .008)
    gain.gain.setValueAtTime(.14, end - .018)
    gain.gain.linearRampToValueAtTime(0, end)
    tone.connect(gain).connect(ctx.destination)

    const endedAt = await new Promise(resolve => {
      const timeout = setTimeout(() => endCue?.(null), 2000)
      endCue = time => {
        clearTimeout(timeout)
        tone.onended = null
        tone.disconnect()
        gain.disconnect()
        endCue = null
        resolve(time)
      }
      tone.onended = () => endCue?.(performance.now())
      tone.start(start)
      tone.stop(end)
    })
    if (closed) return null
    if (endedAt === null) throw new Error('提示音没有播完，请重新开始口答。')
    // Flush delivery may lag the user's first syllable. Cut on the audio clock, not delivery time.
    await checkpoint()
    if (closed) return null
    function sampleAt(time) {
      const boundary = Math.ceil(time * ctx.sampleRate)
      const chunk = frames.find(({frame, count}) => frame + count > boundary)
      return chunk ? chunk.index + Math.max(0, boundary - chunk.frame) : samples
    }
    return {index:sampleAt(end), captureIndex:sampleAt(start - .120), endedAt}
  }
  async function finish() {
    try {
      if (!worklet) return null
      await checkpoint()
      return closed ? null : new Blob(chunks, {type:'application/octet-stream'})
    } finally { closeStream() }
  }
  return {ready, close, finish, checkpoint, slice, cue}
}
