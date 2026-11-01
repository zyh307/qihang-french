/* Worklet runs at the real microphone context rate. Main thread resamples to 16 kHz. */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = new Float32Array(2048); this.used = 0;
    this.port.onmessage = event => {
      if (event.data === 'flush') {
        if (this.used) this.port.postMessage(this.buffer.slice(0, this.used));
        this.used = 0;
        this.port.postMessage({flushed:true});
      }
    };
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    if (input) {
      for (let i = 0; i < input.length; i++) {
        this.buffer[this.used++] = input[i];
        if (this.used === this.buffer.length) {
          this.port.postMessage(this.buffer.slice());
          this.used = 0;
        }
      }
    }
    if (outputs[0]) for (const channel of outputs[0]) channel.fill(0);
    return true;
  }
}
registerProcessor('oral-capture', CaptureProcessor);
