export const CLOCK_CONFIG = {
  minutesPerDay: 1440,
  dayLengthSeconds: 288,
  periods: [[0, 'night'], [300, 'dawn'], [390, 'morning'], [660, 'noon'],
    [1020, 'sunset'], [1155, 'dusk'], [1260, 'night']],
};

export const weatherProfiles = {
  clear: { label: 'Clear', cloud: 0, rain: 0, wind: 0.12 },
  cloudy: { label: 'Cloudy', cloud: 0.52, rain: 0, wind: 0.57 },
  light_rain: { label: 'Light Rain', cloud: 0.75, rain: 0.46, wind: 0.62 },
  heavy_rain: { label: 'Heavy Rain', cloud: 1, rain: 1, wind: 0.88 },
};

export const WEATHER_CONFIG = {
  transitionMinutes: 32,
  holdMinutes: {
    clear: [360, 620], cloudy: [100, 225], light_rain: [100, 190], heavy_rain: [60, 130],
  },
  probabilities: {
    clear: { cloudy: 1 },
    cloudy: { clear: 0.48, light_rain: 0.52 },
    light_rain: { cloudy: 0.73, heavy_rain: 0.27 },
    heavy_rain: { light_rain: 1 },
  },
};

export const clamp01 = value => Math.max(0, Math.min(1, value));
export const smooth = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
export const lerp = (from, to, t) => from + (to - from) * t;
const wrap = (value, span) => ((value % span) + span) % span;

export function weatherId(value) {
  if (value === 'rain') return 'light_rain';
  return Object.hasOwn(weatherProfiles, value) ? value : 'clear';
}

export function sampleWeather(weather, seconds = 0) {
  const target = weatherProfiles[weatherId(typeof weather === 'string' ? weather : weather?.current)];
  if (!weather?.from || !(weather.duration > 0)) return target;
  const t = smooth((seconds - weather.startedAt) / weather.duration);
  return {
    cloud: lerp(weather.from.cloud, target.cloud, t),
    rain: lerp(weather.from.rain, target.rain, t),
    wind: lerp(weather.from.wind, target.wind, t),
  };
}

export function timePeriod(minutes, config = CLOCK_CONFIG) {
  const minute = wrap(minutes, config.minutesPerDay);
  return config.periods.findLast(([start]) => minute >= start)[1];
}

export function createClimate(state, clock = CLOCK_CONFIG, tuning = WEATHER_CONFIG) {
  const minutesPerSecond = clock.minutesPerDay / clock.dayLengthSeconds;
  const events = { on_time_period_changed: new Set(), on_weather_changed: new Set() };
  let period = timePeriod(state.time.minutes, clock);

  function publish(event, from, to) {
    for (const listener of events[event]) listener({ from, to });
  }

  function setClock(minutes) {
    const { time } = state;
    time.day += Math.floor(minutes / clock.minutesPerDay);
    time.minutes = wrap(minutes, clock.minutesPerDay);
    const next = timePeriod(time.minutes, clock);
    if (next !== period) {
      const previous = period;
      period = next;
      publish('on_time_period_changed', previous, next);
    }
  }

  function random() {
    const { weather } = state;
    weather.seed = (Math.imul(weather.seed ?? 24627, 1664525) + 1013904223) >>> 0;
    return weather.seed / 4294967296;
  }

  function schedule() {
    const { weather, time } = state;
    const [min, max] = tuning.holdMinutes[weather.current];
    weather.nextAt = time.seconds + lerp(min, max, random()) / minutesPerSecond + (weather.duration ?? 0);
  }

  function setWeather(next) {
    next = weatherId(next);
    const { weather, time } = state;
    const previous = weatherId(weather.current);
    if (next === previous) return;
    const { cloud, rain, wind } = sampleWeather(weather, time.seconds);
    const duration = tuning.transitionMinutes / minutesPerSecond;
    Object.assign(weather, { current: next, from: { cloud, rain, wind }, startedAt: time.seconds, duration });
    schedule();
    publish('on_weather_changed', previous, next);
  }

  function advance(elapsed) {
    const { time, weather } = state;
    time.seconds += elapsed;
    setClock(time.minutes + elapsed * minutesPerSecond);
    if (weather.from && time.seconds >= weather.startedAt + weather.duration) {
      delete weather.from;
      delete weather.startedAt;
      delete weather.duration;
    }
    weather.current = weatherId(weather.current);
    if (!Number.isFinite(weather.nextAt)) schedule();
    if (time.seconds < weather.nextAt) return;
    let choices = Object.entries(tuning.probabilities[weather.current]);
    const tutorialCalm = Boolean(state.worldFlags && state.abilities
      && !(state.abilities.heal && (state.story?.firstCureDone || state.worldFlags.restore_garden)));
    if (tutorialCalm) {
      const calmChoices = choices.filter(([id]) => id === 'clear' || id === 'cloudy');
      choices = calmChoices.length ? calmChoices : [['clear', 1]];
    }
    let roll = random() * choices.reduce((total, [, weight]) => total + weight, 0);
    const [next] = choices.find(([, weight]) => (roll -= weight) < 0) ?? choices.at(-1);
    if (next === weather.current) schedule();
    else setWeather(next);
  }

  return {
    advance, setClock, setWeather,
    reset() {
      period = timePeriod(state.time.minutes, clock);
      state.weather.current = weatherId(state.weather.current);
    },
    subscribe(event, listener) {
      events[event].add(listener);
      return () => events[event].delete(listener);
    },
  };
}
