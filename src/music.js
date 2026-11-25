const crossfadeMs = 2500;

export function createMusicPlayer({
  volume,
  onError,
  createAudio = () => new Audio(),
  now = () => performance.now(),
  schedule = callback => setTimeout(callback, 32),
}) {
  const channels = new Map();
  let master = volume;
  let desired;
  let active;
  let pending;
  let retryOnGesture = false;
  let mix;
  let tickScheduled = false;

  function channelFor(track) {
    if (!channels.has(track)) {
      const audio = createAudio();
      audio.loop = true;
      audio.volume = 0;
      audio.src = `/assets/music/${track}-music.mp3`;
      channels.set(track, { audio, gain: 0 });
    }
    return channels.get(track);
  }

  function applyGain(channel) {
    channel.audio.volume = master * channel.gain;
  }

  function updateMix(time) {
    if (!mix) return;
    const progress = Math.min(1, (time - mix.started) / crossfadeMs);
    const eased = progress * progress * (3 - 2 * progress);
    for (const { channel, from } of mix.channels) {
      const target = channel === active ? 1 : 0;
      channel.gain = Math.sqrt(from * from * (1 - eased) + target * eased);
      applyGain(channel);
      if (progress === 1 && channel !== active) channel.audio.pause();
    }
    if (progress === 1) mix = null;
  }

  function scheduleTick() {
    if (!mix || tickScheduled) return;
    tickScheduled = true;
    schedule(() => {
      tickScheduled = false;
      updateMix(now());
      scheduleTick();
    });
  }

  function transitionTo(channel, started = now()) {
    if (channel === active) return;
    updateMix(started);
    active = channel;
    const playing = [...channels.values()].filter(entry => !entry.audio.paused);
    if (playing.length === 1) {
      channel.gain = 1;
      applyGain(channel);
      mix = null;
      return;
    }
    mix = { started, channels: playing.map(entry => ({ channel: entry, from: entry.gain })) };
    scheduleTick();
  }

  function startDesired() {
    retryOnGesture = false;
    if (pending) {
      const { channel: superseded } = pending;
      pending = null;
      superseded.audio.pause();
      superseded.gain = 0;
      applyGain(superseded);
    }
    const channel = channelFor(desired);
    const time = now();
    updateMix(time);
    if (!channel.audio.paused) {
      transitionTo(channel, time);
      return;
    }
    channel.gain = active ? 0 : 1;
    applyGain(channel);
    const attempt = { channel };
    pending = attempt;
    channel.audio.play().then(() => {
      if (pending !== attempt) return;
      pending = null;
      transitionTo(channel);
    }, error => {
      if (pending !== attempt) return;
      pending = null;
      retryOnGesture = true;
      if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') onError?.(error);
    });
  }

  return {
    select(track) {
      if (track === desired) return;
      desired = track;
      startDesired();
    },
    retry() {
      if (retryOnGesture) startDesired();
    },
    setVolume(value) {
      master = value;
      for (const channel of channels.values()) applyGain(channel);
    },
  };
}
