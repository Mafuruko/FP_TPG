import { bindPreferences, renderPreferences } from './preferences.js';

const titleGlyphs = {
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  N: ['10001','11001','11001','10101','10011','10011','10001'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
};

function drawWordmark(canvas) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const dots = [];
  for (const [line, word] of ['ISLAND', 'COLONY'].entries()) {
    for (const [offset, letter] of [...word].entries()) {
      for (const [row, pixels] of titleGlyphs[letter].entries()) {
        for (const [column, bit] of [...pixels].entries()) {
          if (bit !== '1') continue;
          dots.push({ x: 1 + offset * 6 + column, y: 1 + line * 9 + row, color: row <= 3 ? '#ffefba' : '#edcc80' });
        }
      }
    }
  }
  context.fillStyle = '#392a1d';
  for (const { x, y } of dots) context.fillRect(x - 1, y - 1, 3, 3);
  for (const { x, y, color } of dots) {
    context.fillStyle = color;
    context.fillRect(x, y, 1, 1);
  }
}

export function createMainMenu(root, { saves, preferences, fullscreenSupported, applyPreference, enter, deleted, sound, icon }) {
  let page = 'home';
  let confirmation;
  let message = '';
  let focusId;

  function button(label, action, { id, disabled, primary, glyph } = {}) {
    return `<button type="button" class="island-button${primary ? ' island-button-primary' : ''}"
      data-menu="${action}" ${id ? `data-slot="${id}"` : ''} ${disabled ? 'disabled' : ''}>
      ${glyph ? icon(glyph, 16) : ''}<span>${label}</span>
    </button>`;
  }

  function home() {
    const latest = saves.recent();
    return `<header class="island-logo">
      <div aria-hidden="true">${icon('sun', 24)}</div>
      <h1 id="island-title"><span>Island Colony</span><canvas class="island-wordmark" width="37" height="18" aria-hidden="true"></canvas></h1>
    </header>
    <div class="island-menu-stack">
      ${button('Continue', 'continue', { disabled: !latest, primary: Boolean(latest), glyph: 'play' })}
      ${latest ? `<p class="island-continue-detail">${latest.name} · Day ${latest.day}</p>` : ''}
      ${button('Islands', 'islands', { primary: !latest, glyph: 'load' })}
      ${button('Settings', 'settings', { glyph: 'gear' })}
    </div>`;
  }

  function islands() {
    return `<h2 id="island-title">Islands</h2>
      <div class="island-slot-list">${saves.list().map(slot => {
        const occupied = slot.savedAt !== undefined;
        return `<article class="island-slot">
          <div><small>Slot ${slot.id}</small><h3>${occupied ? slot.name : 'Empty Island'}</h3>
          ${occupied ? `<p>Day ${slot.day} · ${slot.villagers} ${slot.villagers === 1 ? 'villager' : 'villagers'}</p>` : ''}</div>
          <div class="island-slot-actions">
            ${occupied
              ? button('Load', 'load', { id: slot.id, primary: true })
                + button('Overwrite', 'overwrite', { id: slot.id })
                + button('Delete', 'delete', { id: slot.id })
              : button('Start New Island', 'new', { id: slot.id, primary: true })}
          </div>
        </article>`;
      }).join('')}</div>
      ${!saves.persistent ? '<p class="island-save-note">Browser storage is unavailable. Islands last for this session.</p>' : ''}
      ${button('Back', 'back', { glyph: 'arrowL' })}`;
  }

  function confirm() {
    const { action, id } = confirmation;
    return `<h2 id="island-title">Are you sure?</h2>
      <p>This will ${action === 'delete' ? `delete Island ${id} and its progress` : `replace Island ${id} with a new island`}.</p>
      <div class="island-confirm-actions">${button('Cancel', 'cancel')}${button('Confirm', 'confirm', { primary: true })}</div>`;
  }

  function render() {
    const contents = page === 'home' ? home() : page === 'islands' ? islands() : page === 'confirm' ? confirm()
      : `<h2 id="island-title">Settings</h2>${renderPreferences(preferences, fullscreenSupported)}
        ${button('Back', 'back', { glyph: 'arrowL' })}`;
    root.innerHTML = `<section class="island-menu-card island-menu-${page}" role="dialog"
      aria-modal="true" aria-labelledby="island-title" tabindex="-1">
      ${contents}<p class="island-menu-error" role="status"></p>
    </section>`;
    drawWordmark(root.querySelector('.island-wordmark'));
    root.querySelector('.island-menu-error').textContent = message;
    const target = page === 'confirm' ? root.querySelector('[data-menu="cancel"]')
      : focusId ? root.querySelector(`[data-menu="${focusId.action}"][data-slot="${focusId.id}"]`) : null;
    (target ?? root.querySelector('button:enabled, input:enabled'))?.focus({ preventScroll: true });
    focusId = null;
  }

  function back() {
    if (page === 'home') return;
    if (page === 'confirm') focusId = confirmation;
    page = page === 'confirm' ? 'islands' : 'home';
    message = '';
    render();
  }

  bindPreferences(root, applyPreference);
  root.addEventListener('click', event => {
    const control = event.target.closest('button[data-menu]');
    if (!control || root.inert || control.disabled) return;
    sound();
    const action = control.dataset.menu;
    const id = Number(control.dataset.slot);
    message = '';
    switch (action) {
      case 'settings':
      case 'islands':
        page = action;
        break;
      case 'delete':
      case 'overwrite':
        confirmation = { action, id };
        page = 'confirm';
        break;
      case 'cancel':
      case 'back':
        back();
        return;
      case 'confirm':
        page = 'islands';
        if (confirmation.action === 'delete') {
          if (saves.remove(confirmation.id)) deleted();
          else message = 'This island could not be deleted.';
        } else if (enter(confirmation.id, true, true)) return;
        else message = 'This island could not be replaced.';
        break;
      case 'continue':
      case 'load':
      case 'new':
        if (enter(action === 'continue' ? saves.recent()?.id : id, action === 'new')) return;
        message = 'This island could not be opened.';
        break;
    }
    render();
  });

  root.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...root.querySelectorAll('button:enabled, input:enabled')];
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      controls[0]?.focus();
    }
  });

  return {
    show(startPage = 'home') {
      page = startPage;
      message = '';
      root.hidden = false;
      root.inert = false;
      render();
    },
    closePanel: back,
  };
}
