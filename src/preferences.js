const key = 'island-colony.settings.v1';
const defaults = { master: 100, music: 100, sfx: 35, voice: 40, voiceMute: false, dialogueSpeed: 'normal',
  fullscreen: false, integer: false, lightning: false };
const sliders = { master: 'Master volume', music: 'Music volume', sfx: 'Sound effects & ambience', voice: 'Auron voice volume' };
const switches = { voiceMute: 'Mute Auron’s voice', fullscreen: 'Fullscreen',
  integer: 'Integer scaling', lightning: 'Lightning flashes' };
const textSpeeds = { slow: 'Slow', normal: 'Normal', fast: 'Fast', instant: 'Instant' };

const minimum = name => name === 'sfx' || name === 'voice' ? 0 : 1;

function percent(name, value) {
  return Math.max(minimum(name), Math.min(100, Math.round(value)));
}

function readRecord(storage, name) {
  try { return JSON.parse(storage?.getItem(name) ?? 'null'); }
  catch { return null; }
}

export function loadPreferences(storage) {
  const saved = readRecord(storage, key);
  const legacy = readRecord(storage, 'island-colony.audio');
  const result = { ...defaults };
  if (Number.isFinite(legacy?.musicVolume)) result.music = percent('music', legacy.musicVolume);
  for (const name of Object.keys(sliders)) {
    if (Number.isFinite(saved?.[name])) result[name] = percent(name, saved[name]);
  }
  for (const name of Object.keys(switches)) {
    if (typeof saved?.[name] === 'boolean') result[name] = saved[name];
  }
  if (Object.hasOwn(textSpeeds, saved?.dialogueSpeed)) result.dialogueSpeed = saved.dialogueSpeed;
  return result;
}

export function storePreferences(storage, settings) {
  try { storage?.setItem(key, JSON.stringify(settings)); } catch { /* Settings are still active for this session. */ }
}

export function renderPreferences(settings, fullscreenSupported) {
  const range = id => `
    <label class="island-range">
      <span>${sliders[id]}</span><output>${settings[id]}%</output>
      <input type="range" data-preference="${id}" min="${minimum(id)}" max="100" value="${settings[id]}">
    </label>`;
  const toggle = id => `
    <label class="island-switch">
      <span>${switches[id]}</span><input type="checkbox" data-preference="${id}" ${settings[id] ? 'checked' : ''}
        ${id === 'fullscreen' && !fullscreenSupported ? 'disabled' : ''}>
    </label>`;
  const speed = `<label class="island-switch"><span>Text speed</span>
    <select class="gu-in" data-preference="dialogueSpeed">${Object.entries(textSpeeds).map(([id, label]) =>
      `<option value="${id}" ${settings.dialogueSpeed === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  return `<div class="island-preferences">
    <section class="settings-audio" aria-label="Audio">${['master', 'music', 'sfx'].map(range).join('')}</section>
    <details class="settings-section"><summary>Display &amp; comfort</summary><div class="island-switches">
      ${['fullscreen', 'integer', 'lightning'].map(toggle).join('')}
      <p class="fullscreen-status" role="status">${fullscreenSupported ? '' : 'Fullscreen is unavailable in this browser.'}</p>
    </div></details>
    <details class="settings-section"><summary>Dialogue</summary>
      ${range('voice')}<div class="island-switches">${speed}${toggle('voiceMute')}</div>
    </details></div>`;
}

export function bindPreferences(root, apply) {
  root.addEventListener('input', event => {
    const input = event.target.closest('[data-preference]');
    if (!input) return;
    const name = input.dataset.preference;
    if (input.type === 'checkbox') apply(name, input.checked);
    else if (input.tagName === 'SELECT') apply(name, input.value);
    else {
      input.parentElement.querySelector('output').value = `${input.value}%`;
      apply(name, Number(input.value));
    }
  });
}

export function createMenuSounds(settings) {
  const tones = {
    button: [390, 280, 0.055], test: [520, 690, 0.055],
    'command-pickup': [310, 480, 0.035], 'command-land': [330, 225, 0.044],
    'command-send': [390, 510, 0.028], 'command-invalid': [240, 180, 0.025],
  };
  let context;
  let last = -Infinity;
  return (sound = 'button') => {
    const volume = settings.master * settings.sfx / 10000;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext || !volume) return;
    try {
      context ??= new AudioContext();
      if (context.state === 'closed') return;
      if (context.state !== 'running') context.resume().catch(() => {});
      const at = context.currentTime;
      if (at - last < 0.065) return;
      last = at;
      const tone = context.createOscillator();
      const gain = context.createGain();
      const [start, end, strength] = tones[sound] || tones.button;
      tone.type = 'sine';
      tone.frequency.setValueAtTime(start, at);
      tone.frequency.exponentialRampToValueAtTime(end, at + 0.075);
      gain.gain.setValueAtTime(0.001, at);
      gain.gain.linearRampToValueAtTime(strength * volume + 0.001, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.105);
      tone.connect(gain).connect(context.destination);
      tone.start(at);
      tone.stop(at + 0.11);
    } catch { /* Button and settings actions remain available without Web Audio. */ }
  };
}
