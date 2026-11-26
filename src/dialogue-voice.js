const emotions = {
  happy: [1.13, 1, 0.07], laughing: [1.21, 0.9, 0.07], proud: [1.05, 1.06, 0.07],
  surprised: [1.22, 0.88, 0.08], smug: [1.03, 1.08, 0.065], thinking: [0.97, 1.12, 0.055],
  worried: [0.96, 1.19, 0.05], angry: [0.9, 0.87, 0.08], sad: [0.87, 1.3, 0.047],
  sleepy: [0.8, 1.34, 0.048], mysterious: [0.9, 1.19, 0.055],
};

export function createDialogueVoice(settings, { basePitch = 145 } = {}) {
  let context;
  let nextTone = 0;

  function unlock() {
    if (settings.voiceMute || !settings.voice) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Keep dialogue readable when audio is unavailable. */ }
  }

  function syllable(letter, expression, index, rate) {
    if (context?.state !== 'running' || settings.voiceMute || !settings.voice || !/[a-z]/i.test(letter)) return;
    const now = context.currentTime;
    if (now < nextTone) return;
    const [pitch, pace, loudness] = emotions[expression] ?? [1, 1, 0.06];
    const length = 0.072 * pace;
    nextTone = now + Math.max(0.072, pace * 3.7 / rate);
    const frequency = basePitch * pitch * (0.97 + ((index * 7 + letter.charCodeAt(0)) % 9) * 0.021);
    const volume = loudness * settings.master * settings.voice / 10000;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(Math.max(0.0001, volume), now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + length);
    envelope.connect(context.destination);
    const tone = context.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(frequency, now);
    tone.frequency.exponentialRampToValueAtTime(frequency * 0.79, now + length);
    tone.connect(envelope);
    tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
    tone.start(now);
    tone.stop(now + length);
  }

  return { unlock, syllable };
}
