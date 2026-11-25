import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMusicPlayer } from '../src/music.js';

function setup() {
  const tracks = [];
  const errors = [];
  let time = 0;
  let tick;
  const player = createMusicPlayer({
    volume: 1,
    now: () => time,
    schedule: callback => { tick = callback; },
    onError: err => errors.push(err.name),
    createAudio() {
      const audio = {
        paused: true,
        play() {
          return new Promise((resolve, reject) => {
            this.finish = error => {
              this.finish = null;
              if (error) reject({ name: error });
              else {
                this.paused = false;
                resolve();
              }
            };
          });
        },
        pause() {
          this.paused = true;
          this.finish?.('AbortError');
        },
      };
      tracks.push(audio);
      return audio;
    },
  });
  return {
    player, tracks, errors,
    advance(ms) {
      time += ms;
      const callback = tick;
      tick = undefined;
      callback?.();
    },
  };
}

test('the outgoing score keeps playing while the incoming track loads and both obey the volume slider during a fade', async () => {
  const { player, tracks, advance } = setup();
  player.select('daytime');
  const [day] = tracks;
  assert.equal(day.volume, 1);
  await day.finish();
  player.select('rain');
  const rain = tracks[1];
  assert.equal(rain.volume, 0);
  advance(5000);
  assert.equal(day.volume, 1);
  assert.equal(day.paused, false);
  await rain.finish();
  advance(1250);
  assert.ok(day.volume > 0 && day.volume < 1);
  assert.equal(rain.volume, day.volume);
  const gain = rain.volume;
  player.setVolume(0.4);
  assert.equal(day.volume, gain * 0.4);
  assert.equal(rain.volume, gain * 0.4);
  advance(1250);
  assert.equal(day.paused, true);
  assert.equal(rain.paused, false);
  assert.equal(rain.volume, 0.4);
});

test('autoplay can retry on a gesture and rapid changes redirect the existing fade without silence', async () => {
  const { player, tracks, errors, advance } = setup();
  player.select('daytime');
  const [day] = tracks;
  await day.finish('NotAllowedError');
  assert.deepEqual(errors, []);
  player.retry();
  await day.finish();
  player.select('rain');
  const rain = tracks[1];
  player.select('nighttime');
  const night = tracks[2];
  assert.equal(day.paused, false);
  assert.equal(rain.paused, true);
  await night.finish('NotSupportedError');
  assert.deepEqual(errors, ['NotSupportedError']);
  assert.equal(day.volume, 1);
  player.retry();
  await night.finish();
  advance(800);
  const previous = [day.volume, night.volume];
  player.select('daytime');
  assert.deepEqual([day.volume, night.volume], previous);
  assert.equal(day.finish, null);
  advance(2500);
  assert.equal(day.paused, false);
  assert.equal(day.volume, 1);
  assert.equal(night.paused, true);
});
