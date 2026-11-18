// Own the stream for a single press, including permission prompts and cancellation.
export function openMicrophone() {
  let closed = false, stream, ctx, worklet, finished
  const chunks = []
  function close() {
    closed = true
    stream?.getTracks().forEach(t => t.stop())
    worklet?.disconnect()
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {})
    finished?.()
  }
  const ready = (async () => {
    stream = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}})
    if (closed) { close(); return }
    ctx = new AudioContext({sampleRate:16000})
    await ctx.resume()
    await ctx.audioWorklet.addModule(window.QihangOralClient?.workletURL || '/assets/capture.js')
    if (closed) return
    worklet = new AudioWorkletNode(ctx, 'oral-capture')
    worklet.port.onmessage = ({data}) => {
      if (data.flushed) { finished?.(); return }
      if (!closed) chunks.push(Int16Array.from(data, n => Math.round(Math.max(-1,Math.min(n,1)) * (n < 0 ? 32768 : 32767))))
    }
    ctx.createMediaStreamSource(stream).connect(worklet).connect(ctx.destination)
  })()
  async function finish() {
    try {
      if (!worklet) return null
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 400)
        finished = () => { clearTimeout(timer); resolve() }
        worklet.port.postMessage('flush')
      })
      return closed ? null : new Blob(chunks, {type:'application/octet-stream'})
    } finally { close() }
  }
  return {ready, close, finish}
}
