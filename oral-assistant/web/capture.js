/* Worklet runs at the real microphone context rate. Main thread resamples to 16 kHz. */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(); this.buffer = new Float32Array(2048); this.used = 0;
    this.reportFrames = options?.processorOptions?.reportFrames === true;
    this.port.onmessage = event => {
      if (event.data === 'flush') {
        this.postChunk();
        this.port.postMessage({flushed:true});
      }
    };
  }
  postChunk() {
    if (!this.used) return;
    const samples = this.buffer.slice(0, this.used);
    this.port.postMessage(this.reportFrames ? {samples, frame:this.startFrame} : samples);
    this.used = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    if (input) {
      if (this.reportFrames && this.used && this.startFrame + this.used !== currentFrame) this.postChunk();
      for (let i = 0; i < input.length; i++) {
        if (!this.used) this.startFrame = currentFrame + i;
        this.buffer[this.used++] = input[i];
        if (this.used === this.buffer.length) this.postChunk();
      }
    }
    if (outputs[0]) for (const channel of outputs[0]) channel.fill(0);
    return true;
  }
}
registerProcessor('oral-capture', CaptureProcessor);
