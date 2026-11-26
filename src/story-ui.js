import { STORY_CONFIG } from './story.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function createStoryDirector(root, { world, view, icon, panTo, onAction, onOpen, onWipeFresh, onOpenTitle, reducedMotion }) {
  let active = null;
  let beatIndex = 0;
  let charProgress = 0;
  let prevPaused = false;
  let waitCheckAccum = 0;
  const queue = [];

  function isActive() {
    return Boolean(active);
  }

  function currentBeat() {
    return active?.beats?.[beatIndex] || null;
  }

  function applyBeatFocus(beat) {
    if (!beat) return;
    const duration = reducedMotion?.matches ? STORY_CONFIG.reducedPanDurationSec : STORY_CONFIG.panDurationSec;
    const follow = beat.followVillagerId
      ? world.state.villagers.find(v => v.id === beat.followVillagerId) : null;
    const targetPos = follow ? follow.position : beat.focus;
    if (targetPos) {
      panTo(targetPos, beat.zoom || STORY_CONFIG.defaultSpotlightZoom, { duration });
      if (beat.cue === 'water') {
        view.storyBeacon = null;
        return;
      }
      view.storyBeacon = {
        position: { x: targetPos.x, y: targetPos.y },
        followVillagerId: beat.followVillagerId || null,
        label: beat.beaconLabel || beat.title,
        tone: active.tone === 'danger' ? 'danger' : 'gold',
        dragFrom: beat.dragFrom || null,
        excludeId: beat.excludeId || null,
        until: null,
      };
    } else {
      view.storyBeacon = null;
    }
  }

  function render() {
    const beat = currentBeat();
    if (!active || !beat) {
      root.hidden = true;
      root.innerHTML = '';
      return;
    }
    const total = active.beats.length;
    const fullText = beat.text || '';
    const revealed = Math.min(fullText.length, Math.floor(charProgress));
    const doneTyping = revealed >= fullText.length;
    const isLast = beatIndex >= total - 1;
    const waiting = typeof beat.waitFor === 'function';
    const dots = total > 1
      ? `<div class="story-dots" aria-hidden="true">${active.beats.map((_, i) =>
          `<span class="story-dot ${i === beatIndex ? 'is-active' : i < beatIndex ? 'is-done' : ''}"></span>`).join('')}</div>`
      : '';
    const actionBtn = beat.action
      ? `<button type="button" class="gu-btn g story-btn" data-story-action="${escape(beat.action.type)}" data-story-arg="${escape(beat.action.arg || '')}">${escape(beat.action.label)}</button>`
      : '';

    let controlsHtml;
    if (active.colonyLost) {
      controlsHtml = `<button type="button" class="gu-btn g story-btn" data-story="wipe-fresh">Wipe &amp; Start Fresh</button>
        <button type="button" class="gu-btn s story-btn" data-story="open-title">Islands</button>`;
    } else if (waiting) {
      controlsHtml = `<span class="story-wait-pill">Do this on the map</span>
        <button type="button" class="gu-btn s story-btn" data-story="refocus" data-tip="Pan camera back to target">Show</button>
        ${actionBtn}
        <button type="button" class="gu-btn s story-btn" data-story="skip">Skip</button>`;
    } else {
      controlsHtml = `${actionBtn}
        <button type="button" class="gu-btn s story-btn" data-story="refocus" data-tip="Pan camera back to target">Show</button>
        <button type="button" class="gu-btn g story-btn" data-story="next">${!doneTyping ? 'Reveal' : isLast ? 'Got It' : 'Next'}</button>
        <button type="button" class="gu-btn s story-btn" data-story="skip">${total > 1 ? 'Skip' : 'Close'}</button>`;
    }

    root.hidden = false;
    root.dataset.tone = active.tone || 'story';
    root.dataset.waiting = waiting ? 'true' : 'false';
    root.innerHTML = `
      <section class="story-card story-card-compact" role="dialog" aria-modal="false" aria-labelledby="story-beat-title">
        <div class="story-card-head">
          <span class="story-card-icon">${icon(beat.icon || 'info', 18)}</span>
          <div class="story-card-titles">
            <h2 id="story-beat-title">${escape(beat.title)}</h2>
            <p class="story-caption" id="story-caption-text">${escape(fullText.slice(0, revealed))}</p>
          </div>
          <div class="story-head-right">
            ${dots}
            ${total > 1 ? `<span class="story-step-badge">${beatIndex + 1}/${total}</span>` : ''}
          </div>
        </div>
        <div class="story-actions">
          <div class="story-btn-group">${controlsHtml}</div>
        </div>
      </section>`;
  }

  function updateCaptionText() {
    const beat = currentBeat();
    if (!beat) return;
    const node = root.querySelector('#story-caption-text');
    const fullText = beat.text || '';
    const revealed = Math.min(fullText.length, Math.floor(charProgress));
    if (node) node.textContent = fullText.slice(0, revealed);
    if (revealed >= fullText.length) {
      const nextBtn = root.querySelector('[data-story="next"]');
      if (nextBtn) {
        const isLast = beatIndex >= active.beats.length - 1;
        nextBtn.textContent = isLast ? 'Got It' : 'Next';
      }
    }
  }

  function startSequence(sequence) {
    active = sequence;
    beatIndex = 0;
    waitCheckAccum = 0;
    const first = sequence.beats[0];
    charProgress = reducedMotion?.matches || typeof first?.waitFor === 'function'
      ? (first?.text?.length || 0) : 0;
    if (active.pauseWorld) {
      prevPaused = world.state.time.paused;
      world.state.time.paused = true;
    }
    root.closest('main')?.setAttribute('data-story', 'active');
    onOpen?.(sequence);
    applyBeatFocus(first);
    render();
  }

  function play(sequence) {
    if (!sequence?.beats?.length) return false;
    if (active) {
      if (active.id === sequence.id || queue.some(item => item.id === sequence.id)) return false;
      queue.push(sequence);
      return true;
    }
    startSequence(sequence);
    return true;
  }

  function close() {
    if (!active) return;
    const wasPausedWorld = active.pauseWorld;
    const restorePause = prevPaused;
    active = null;
    view.storyActive = false;
    beatIndex = 0;
    charProgress = 0;
    if (view.storyBeacon && !view.storyBeacon.until) {
      view.storyBeacon = { ...view.storyBeacon, until: performance.now() + 3500 };
    }
    if (queue.length) {
      const next = queue.shift();
      if (wasPausedWorld) world.state.time.paused = restorePause;
      startSequence(next);
      return;
    }
    if (wasPausedWorld) {
      world.state.time.paused = restorePause;
    }
    root.closest('main')?.removeAttribute('data-story');
    render();
  }

  function advance(force = false) {
    const beat = currentBeat();
    if (!beat) return;
    const fullLen = (beat.text || '').length;
    if (!force && charProgress < fullLen) {
      charProgress = fullLen;
      updateCaptionText();
      return;
    }
    if (beatIndex + 1 < active.beats.length) {
      beatIndex += 1;
      waitCheckAccum = 0;
      const nextBeat = currentBeat();
      charProgress = reducedMotion?.matches || typeof nextBeat?.waitFor === 'function'
        ? (nextBeat.text?.length || 0) : 0;
      applyBeatFocus(nextBeat);
      render();
      return;
    }
    if (!active.colonyLost) close();
  }

  function update(dt) {
    if (!active || dt <= 0) return;
    const beat = currentBeat();
    if (!beat) return;
    const fullLen = (beat.text || '').length;
    if (charProgress < fullLen) {
      charProgress = Math.min(fullLen, charProgress + STORY_CONFIG.captionCharsPerSec * dt);
      updateCaptionText();
    }
    if (typeof beat.waitFor === 'function') {
      waitCheckAccum += dt;
      if (waitCheckAccum >= 0.12) {
        waitCheckAccum = 0;
        if (beat.waitFor(world)) {
          advance(true);
        }
      }
    }
  }

  function reset() {
    queue.length = 0;
    active = null;
    view.storyActive = false;
    beatIndex = 0;
    charProgress = 0;
    waitCheckAccum = 0;
    view.storyBeacon = null;
    root.closest('main')?.removeAttribute('data-story');
    render();
  }

  root.addEventListener('click', event => {
    const actionEl = event.target.closest('[data-story-action]');
    if (actionEl) {
      const type = actionEl.dataset.storyAction;
      const arg = actionEl.dataset.storyArg;
      if (typeof currentBeat()?.waitFor !== 'function') close();
      onAction?.(type, arg);
      return;
    }
    const btn = event.target.closest('[data-story]');
    if (btn) {
      const cmd = btn.dataset.story;
      if (cmd === 'next') advance();
      else if (cmd === 'skip') close();
      else if (cmd === 'refocus') applyBeatFocus(currentBeat());
      else if (cmd === 'wipe-fresh') {
        reset();
        onWipeFresh?.();
      } else if (cmd === 'open-title') {
        reset();
        onOpenTitle?.();
      }
      return;
    }
    const beat = currentBeat();
    if (event.target.closest('.story-card') && typeof beat?.waitFor !== 'function') advance();
  });

  return {
    play,
    advance,
    close,
    update,
    reset,
    isActive,
    getState: () => active ? {
      id: active.id,
      beatIndex,
      totalBeats: active.beats.length,
      tone: active.tone,
      waiting: typeof currentBeat()?.waitFor === 'function',
    } : null,
  };
}
