export let audioCtx: AudioContext;
export let source: AudioBufferSourceNode;
export let gainNode: GainNode;
export let filter: BiquadFilterNode;

export function initPlayer() {
  audioCtx = new AudioContext();
}

export function play(buffer: AudioBuffer) {
  if (source) source.stop();

  source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = false;

  gainNode = audioCtx.createGain();
  filter = audioCtx.createBiquadFilter();

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  gainNode.gain.value = 0.5;

  filter.frequency.setValueAtTime(22050, audioCtx.currentTime);

  source.start();
}

export function cleanupPlayer() {
  if (source) source.stop();
  if (audioCtx) audioCtx.close();
}

export function setPlaybackRate(rate: number) {
  if (!source || !audioCtx) return;

  source.playbackRate.setValueAtTime(rate, audioCtx.currentTime);
}
