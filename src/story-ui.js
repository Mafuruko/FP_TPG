import { STORY_CONFIG } from './story.js';

const ambientReadSeconds = 10;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function createStoryDirector(root, { world, view, icon, panTo, onAction, onOpen, onComplete, onModalChange,
  onWipeFresh, onOpenTitle, reducedMotion, guardian, settings = {}, voice }) {
  let active = null;
  let beatIndex = 0;
  let charProgress = 0;
  let waitCheckAccum = 0;
  let typingBudget = 0;
  let punctuationHold = 0;
  let portraitTime = 0;
  let ambientReadTime = 0;
  let lastPortrait;
  let previousFocus;
  let chosenResponse;
  const portraits = new Map();
  const queue = [];

  function isActive() {
    return Boolean(active);
  }

  function currentBeat() {
    return active?.beats?.[beatIndex] || null;
  }

  const mode = sequence => sequence?.mode || (sequence?.pauseWorld ? 'story' : 'guide');
  const blocksWorld = sequence => {
    const dialogueMode = mode(sequence);
    return (dialogueMode === 'story' || dialogueMode === 'choice') && sequence?.pauseWorld !== false;
  };
  const isBlocking = () => blocksWorld(active);
  const isAmbient = () => active?.mode === 'ambient';
  const expression = beat => beat.expression || (active.tone === 'danger' ? 'worried' : active.tone === 'milestone' ? 'proud' : 'neutral');
  const instant = () => settings.dialogueSpeed === 'instant';

  function updatePortrait() {
    const target = root.querySelector('.story-portrait img');
    if (!guardian || !target) return;
    const beat = currentBeat();
    const talking = charProgress < (beat.text?.length ?? 0) && punctuationHold <= 0;
    const options = {
      expression: expression(beat),
      blinking: !reducedMotion?.matches && portraitTime % 4.3 > 4.13,
      mouthFrame: talking ? Math.floor(portraitTime * guardian.animations.talking.fps) % 3 : undefined,
    };
    const key = JSON.stringify(options);
    if (lastPortrait === key) return;
    if (!portraits.has(key)) {
      portraits.set(key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(guardian.renderGuardian(options)));
    }
    target.src = portraits.get(key);
    lastPortrait = key;
  }

  function resetBeatTiming(beat) {
    charProgress = instant() ? (beat.text?.length || 0) : 0;
    waitCheckAccum = typingBudget = punctuationHold = portraitTime = ambientReadTime = 0;
    lastPortrait = undefined;
  }

  function applyBeatFocus(beat) {
    if (!beat) return;
    const duration = reducedMotion?.matches ? STORY_CONFIG.reducedPanDurationSec : STORY_CONFIG.panDurationSec;
    const follow = beat.followVillagerId
      ? world.state.villagers.find(v => v.id === beat.followVillagerId) : null;
    const targetPos = follow ? follow.position : beat.focus;
    if (targetPos) {
      panTo(targetPos, beat.zoom || STORY_CONFIG.defaultSpotlightZoom, { duration });
      if (beat.cue === 'water' || mode(active) !== 'guide') {
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
    const refocusBtn = (beat.focus || beat.followVillagerId) && mode(active) === 'guide'
      ? '<button type="button" class="gu-btn s story-btn" data-story="refocus" data-tip="Pan camera back to target">Show</button>' : '';

    let controlsHtml;
    if (isAmbient()) {
      controlsHtml = '<button type="button" class="gu-btn s story-dismiss" data-story="skip" aria-label="Close Auron’s remark">×</button>';
    } else if (active.colonyLost) {
      controlsHtml = `<button type="button" class="gu-btn g story-btn" data-story="wipe-fresh">Wipe &amp; Start Fresh</button>
        <button type="button" class="gu-btn s story-btn" data-story="open-title">Islands</button>`;
    } else if (beat.choices) {
      controlsHtml = `<div class="story-choices" aria-label="Choose a response">${beat.choices.map((choice, index) =>
        `<button type="button" class="gu-btn s story-btn" data-story-choice="${index}">${escape(choice.label)}</button>`).join('')}</div>
        <button type="button" class="gu-btn s story-btn" data-story="skip">Close</button>`;
    } else if (waiting) {
      controlsHtml = `<span class="story-wait-pill">Do this on the map</span>
        <button type="button" class="gu-btn g story-btn" data-story="next"${doneTyping ? ' hidden' : ''}>Reveal</button>
        ${refocusBtn}
        ${actionBtn}
        <button type="button" class="gu-btn s story-btn" data-story="skip">Skip</button>`;
    } else {
      controlsHtml = `${actionBtn}
        ${refocusBtn}
        <button type="button" class="gu-btn g story-btn" data-story="next">${!doneTyping ? 'Reveal' : isLast ? 'Got It' : 'Next'}</button>
        <button type="button" class="gu-btn s story-btn" data-story="skip">${total > 1 ? 'Skip' : 'Close'}</button>`;
    }

    root.hidden = false;
    root.dataset.tone = active.tone || 'story';
    root.dataset.dialogueMode = mode(active);
    root.dataset.blocking = String(isBlocking());
    root.dataset.waiting = waiting ? 'true' : 'false';
    root.innerHTML = `
      <section class="story-card story-card-compact" role="dialog" aria-modal="${isBlocking()}" aria-labelledby="story-beat-title" tabindex="-1">
        <div class="story-card-head">
          <span class="story-portrait">${guardian ? '<img alt="">' : icon(beat.icon || 'info', 18)}</span>
          <div class="story-card-titles">
            <p class="story-speaker">${escape(beat.speakerName || 'Auron')}</p>
            <h2 id="story-beat-title">${escape(beat.title)}</h2>
          </div>
          <p class="story-caption" id="story-caption-text" aria-label="${escape(fullText)}">${escape(fullText.slice(0, revealed))}</p>
        </div>
        <div class="story-actions">
          ${total > 1 ? `<div class="story-progress">
            ${dots}
            <span class="story-step-badge">${beatIndex + 1}/${total}</span>
          </div>` : ''}
          <div class="story-btn-group">${controlsHtml}</div>
        </div>
      </section>`;
    lastPortrait = undefined;
    updatePortrait();
    if (isBlocking()) root.querySelector('.story-card').focus({ preventScroll: true });
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
        if (typeof beat.waitFor === 'function') nextBtn.hidden = true;
      }
    }
  }

  function startSequence(sequence) {
    active = sequence;
    chosenResponse = undefined;
    beatIndex = 0;
    const first = sequence.beats[0];
    resetBeatTiming(first);
    if (isBlocking()) previousFocus = document.activeElement;
    if (!isAmbient()) {
      onModalChange?.(isBlocking());
      if (isBlocking()) root.closest('main')?.setAttribute('data-story', 'active');
      onOpen?.(sequence);
      applyBeatFocus(first);
    }
    render();
  }

  function play(sequence) {
    if (!sequence?.beats?.length) return false;
    if (active) {
      if (active.id === sequence.id || queue.some(item => item.id === sequence.id)) return false;
      if (sequence.mode === 'ambient') return false;
      if (isAmbient() || (!isBlocking() && blocksWorld(sequence))) {
        queue.unshift(sequence);
        close('interrupted');
      } else queue.push(sequence);
      return true;
    }
    startSequence(sequence);
    return true;
  }

  function close(reason = 'skipped') {
    if (!active) return;
    const finished = active;
    const ambient = isAmbient();
    const choice = chosenResponse;
    const restoreFocus = isBlocking() ? previousFocus : null;
    active = null;
    beatIndex = 0;
    charProgress = 0;
    if (!ambient) {
      view.storyActive = false;
      if (view.storyBeacon && !view.storyBeacon.until) {
        view.storyBeacon = { ...view.storyBeacon, until: performance.now() + 3500 };
      }
      onModalChange?.(false);
      root.closest('main')?.removeAttribute('data-story');
    }
    render();
    restoreFocus?.focus({ preventScroll: true });
    if (queue.length) startSequence(queue.shift());
    finished.onComplete?.({ world, reason, choice });
    onComplete?.(finished, reason);
  }

  function goTo(index) {
    beatIndex = index;
    const beat = currentBeat();
    resetBeatTiming(beat);
    applyBeatFocus(beat);
    render();
  }

  function advance(force = false) {
    const beat = currentBeat();
    if (!beat) return;
    const fullLen = (beat.text || '').length;
    if (!force && charProgress < fullLen) {
      charProgress = fullLen;
      punctuationHold = 0;
      updateCaptionText();
      updatePortrait();
      return;
    }
    if (beat.choices || (!force && beat.waitFor)) return;
    if (beatIndex + 1 < active.beats.length) {
      goTo(beatIndex + 1);
      return;
    }
    if (!active.colonyLost) close('completed');
  }

  function update(dt) {
    if (!active || dt <= 0) return;
    const beat = currentBeat();
    if (!beat) return;
    const fullLen = (beat.text || '').length;
    portraitTime += dt;
    if (isAmbient() && charProgress >= fullLen && !root.contains(document.activeElement)) {
      ambientReadTime += dt;
      if (ambientReadTime >= ambientReadSeconds) {
        close('completed');
        return;
      }
    }
    if (charProgress < fullLen) {
      if (instant()) charProgress = fullLen;
      else if (punctuationHold > 0) punctuationHold -= dt;
      else {
        const rate = ({ slow: 30, normal: 46, fast: 76 })[settings.dialogueSpeed] || STORY_CONFIG.captionCharsPerSec;
        typingBudget += rate * (beat.typingRate ?? 1) * dt;
        while (typingBudget >= 1 && charProgress < fullLen) {
          typingBudget--;
          const letter = beat.text[charProgress++];
          voice?.syllable(letter, expression(beat), charProgress, rate);
          if (/[.,;!?…]/.test(letter)) {
            punctuationHold = /[,;]/.test(letter) ? 0.075 : 0.145;
            typingBudget = 0;
            break;
          }
        }
      }
      updateCaptionText();
    }
    updatePortrait();
    if (typeof beat.waitFor === 'function' && charProgress >= fullLen) {
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
    onModalChange?.(false);
    root.closest('main')?.removeAttribute('data-story');
    render();
  }

  root.addEventListener('click', event => {
    if (!active) return;
    const choiceEl = event.target.closest('[data-story-choice]');
    if (choiceEl) {
      const choice = currentBeat()?.choices?.[Number(choiceEl.dataset.storyChoice)];
      if (!choice) return;
      chosenResponse = choice.id;
      choice.onChoose?.({ world, id: choice.id });
      if (Number.isInteger(choice.next) && active.beats[choice.next]) goTo(choice.next);
      else close('completed');
      return;
    }
    const actionEl = event.target.closest('[data-story-action]');
    if (actionEl) {
      const type = actionEl.dataset.storyAction;
      const arg = actionEl.dataset.storyArg;
      if (typeof currentBeat()?.waitFor !== 'function') close('completed');
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

  root.addEventListener('keydown', event => {
    if (!isBlocking() || event.key !== 'Tab') return;
    const buttons = [...root.querySelectorAll('button:not([hidden]):enabled')];
    if (!buttons.length) return;
    const focused = document.activeElement;
    if (!buttons.includes(focused) || (event.shiftKey && focused === buttons[0])
      || (!event.shiftKey && focused === buttons.at(-1))) {
      event.preventDefault();
      (event.shiftKey ? buttons.at(-1) : buttons[0]).focus();
    }
  });

  return {
    play,
    advance,
    close,
    update,
    reset,
    isActive,
    isBlocking,
    isAmbient,
    getState: () => active ? {
      id: active.id,
      beatIndex,
      totalBeats: active.beats.length,
      tone: active.tone,
      waiting: typeof currentBeat()?.waitFor === 'function',
    } : null,
  };
}
