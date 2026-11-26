import { bindPreferences, renderPreferences } from './preferences.js';
import { founderAppearance, founderChoices, founderColors, islandNameLimit, villagerNameLimit } from './island-setup.js';

const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const optionLabel = value => value ? value[0].toUpperCase() + value.slice(1).replaceAll('_', ' ') : 'None';

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

export function createMainMenu(root, { saves, preferences, fullscreenSupported, applyPreference, enter, deleted, wipeAll,
  sound, icon, createDraft, portrait }) {
  let page = 'home';
  let confirmation;
  let message = '';
  let focusId;
  let setup;

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
      ${latest ? `<p class="island-continue-detail">${escape(latest.name)} · Day ${latest.day}</p>` : ''}
      ${button('Islands', 'islands', { primary: !latest, glyph: 'load' })}
      ${button('Settings', 'settings', { glyph: 'gear' })}
    </div>`;
  }

  function islands() {
    return `<h2 id="island-title">Islands</h2>
      <div class="island-slot-list">${saves.list().map(slot => {
        const occupied = slot.savedAt !== undefined;
        return `<article class="island-slot">
          <div><small>Slot ${slot.id}</small><h3>${occupied ? escape(slot.name) : 'Empty Island'}</h3>
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

  function beginSetup(slot, overwrite = false) {
    setup = { slot, overwrite, draft: createDraft() };
    page = 'setup';
  }

  function thumbnail(founder, key, value) {
    const appearance = founderAppearance({ ...founder, [key]: value });
    if (key !== 'accessory') appearance.accessories = [];
    return portrait(appearance);
  }

  function pickerLabel(key, value) {
    const option = founderChoices[key].options.find(entry => (Array.isArray(entry) ? entry[0] : entry) === value);
    return `${founderChoices[key].label}, ${Array.isArray(option) ? option[1] : optionLabel(option)}`;
  }

  function appearancePicker(founder, key, label, index) {
    const crop = ['skinTone', 'hairStyle', 'hairColor'].includes(key) ? 'head' : key === 'clothingStyle' ? 'torso' : 'full';
    return `<details class="founder-picker" data-appearance="${key}" name="founder-${index}-appearance">
      <summary aria-label="${pickerLabel(key, founder[key])}">
        <span class="founder-thumbnail is-${crop}"><img data-current-appearance src="${escape(thumbnail(founder, key, founder[key]))}" alt=""></span>
        <span>${label}</span>
      </summary>
      <div class="founder-option-grid" aria-label="${label} choices"></div>
    </details>`;
  }

  function updatePicker(picker, founder, changed) {
    const key = picker.dataset.appearance;
    const current = picker.querySelector('[data-current-appearance]');
    current.src = thumbnail(founder, key, founder[key]);
    picker.querySelector('summary').setAttribute('aria-label', pickerLabel(key, founder[key]));
    if (!picker.open) {
      picker.querySelector('.founder-option-grid').replaceChildren();
      return;
    }
    const grid = picker.querySelector('.founder-option-grid');
    if (!grid.hasChildNodes()) {
      const cropClass = current.parentElement.className;
      grid.innerHTML = founderChoices[key].options.map(entry => {
        const [value, text] = Array.isArray(entry) ? entry : [entry, optionLabel(entry)];
        return `<button type="button" class="founder-option" data-founder-option="${value}"
          aria-label="${text}" title="${text}"><span class="${cropClass}"><img alt=""></span></button>`;
      }).join('');
    }
    for (const choice of grid.querySelectorAll('button')) {
      const value = choice.dataset.founderOption;
      choice.setAttribute('aria-pressed', String(founder[key] === value));
      const img = choice.querySelector('img');
      if (!img.getAttribute('src') || changed !== key) img.src = thumbnail(founder, key, value);
    }
  }

  function updateFounder(card, founder, changed) {
    card.querySelector('[data-founder-preview]').src = portrait(founderAppearance(founder));
    card.querySelectorAll('[data-appearance]').forEach(picker => updatePicker(picker, founder, changed));
  }

  function setupForm() {
    return `<h2 class="gu-title" id="island-title">${icon('villagers', 24)} Start a New Island</h2>
      <form class="island-setup-form">
        <label class="founder-field island-name-field">Island name<input type="text" name="island-name" required maxlength="${islandNameLimit}"
          value="${escape(setup.draft.name)}" autocomplete="off"></label>
        <div class="island-founders">${setup.draft.villagers.map((founder, index) => `
          <fieldset class="island-founder" data-founder="${index}">
            <legend>${optionLabel(founder.sex)} Villager</legend>
            <div class="founder-header">
              <div class="founder-portrait">
                <img data-founder-preview width="72" height="96" src="${escape(portrait(founderAppearance(founder)))}" alt="">
              </div>
              <label class="founder-field">Name<input type="text" name="name" required maxlength="${villagerNameLimit}"
                value="${escape(founder.name)}" autocomplete="off"></label>
            </div>
            <div class="founder-controls">${Object.entries(founderChoices).map(([key, { label }]) =>
              appearancePicker(founder, key, label, index)).join('')}
              ${Object.entries(founderColors).map(([key, label]) => `
                <label class="founder-field">${label}<input type="color" name="${key}" value="${founder[key]}"></label>`).join('')}
            </div>
          </fieldset>`).join('')}</div>
        <div class="island-confirm-actions island-setup-actions">${button('Back', 'back', { glyph: 'arrowL' })}
          <button class="island-button island-button-primary" type="submit">Start Island</button>
        </div>
      </form>`;
  }

  function confirm() {
    const { action, id } = confirmation;
    const name = escape(saves.list().find(slot => slot.id === id)?.name ?? `Island ${id}`);
    const desc = action === 'wipe-all'
      ? 'wipe all saved islands, HUD layout, and preferences and reset to the initial game state'
      : action === 'delete'
        ? `delete ${name} and its progress`
        : `replace ${name} with a new island`;
    return `<h2 id="island-title">Are you sure?</h2>
      <p>This will ${desc}.</p>
      <div class="island-confirm-actions">${button('Cancel', 'cancel')}${button('Confirm', 'confirm', { primary: true })}</div>`;
  }

  function render() {
    root.dataset.page = page;
    const contents = page === 'home' ? home() : page === 'islands' ? islands() : page === 'confirm' ? confirm()
      : page === 'setup' ? setupForm()
      : `<h2 id="island-title">Settings</h2>${renderPreferences(preferences, fullscreenSupported)}
        <div class="island-settings-footer">
          ${button('Back', 'back', { glyph: 'arrowL' })}
          ${wipeAll ? button('Wipe All Data', 'wipe-all', { glyph: 'delete' }) : ''}
        </div>`;
    root.innerHTML = `<section class="island-menu-card island-menu-${page}" role="dialog"
      aria-modal="true" aria-labelledby="island-title" tabindex="-1">
      ${contents}<p class="island-menu-error" role="status"></p>
    </section>`;
    drawWordmark(root.querySelector('.island-wordmark'));
    root.querySelector('.island-menu-error').textContent = message;
    const target = page === 'confirm' ? root.querySelector('[data-menu="cancel"]')
      : focusId ? root.querySelector(`[data-menu="${focusId.action}"][data-slot="${focusId.id}"]`) : null;
    (target ?? root.querySelector('button:enabled, input:enabled, select:enabled'))?.focus({ preventScroll: true });
    focusId = null;
  }

  function back() {
    if (page === 'home') return;
    if (page === 'confirm') focusId = confirmation;
    if (page === 'setup') {
      focusId = { action: setup.overwrite ? 'overwrite' : 'new', id: setup.slot };
      setup = null;
      page = 'islands';
    } else page = page === 'confirm' ? (confirmation?.action === 'wipe-all' ? 'settings' : 'islands') : 'home';
    message = '';
    render();
  }

  bindPreferences(root, applyPreference);
  root.addEventListener('toggle', event => {
    const picker = event.target;
    if (!setup || !picker.matches('details[data-appearance]') || !root.contains(picker)) return;
    const card = picker.closest('[data-founder]');
    updatePicker(picker, setup.draft.villagers[Number(card.dataset.founder)]);
  }, true);
  root.addEventListener('input', event => {
    const field = event.target;
    if (!setup || !field.closest('.island-setup-form')) return;
    if (field.name === 'island-name') setup.draft.name = field.value;
    else {
      const card = field.closest('[data-founder]');
      const founder = setup.draft.villagers[Number(card.dataset.founder)];
      founder[field.name] = field.value;
      if (field.name !== 'name') updateFounder(card, founder, field.name);
    }
    if (field.type === 'text') field.setCustomValidity('');
  });
  root.addEventListener('submit', event => {
    if (!setup || !event.target.matches('.island-setup-form')) return;
    event.preventDefault();
    const blank = [...event.target.querySelectorAll('input[type="text"]')].find(input => !input.value.trim());
    if (blank) {
      blank.setCustomValidity('Please enter a name.');
      blank.reportValidity();
      return;
    }
    sound();
    if (!enter(setup.slot, setup.draft, setup.overwrite)) {
      root.querySelector('.island-menu-error').textContent = 'This island could not be saved. Check that the slot is available and try again.';
    }
  });
  root.addEventListener('click', event => {
    const choice = event.target.closest('button[data-founder-option]');
    if (choice && setup && !root.inert) {
      const picker = choice.closest('[data-appearance]');
      const key = picker.dataset.appearance;
      const card = choice.closest('[data-founder]');
      const founder = setup.draft.villagers[Number(card.dataset.founder)];
      founder[key] = choice.dataset.founderOption;
      picker.open = false;
      updateFounder(card, founder, key);
      picker.querySelector('summary').focus({ preventScroll: true });
      sound();
      return;
    }
    if (setup) {
      for (const picker of root.querySelectorAll('.founder-picker[open]')) {
        if (!picker.contains(event.target)) picker.open = false;
      }
    }
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
      case 'wipe-all':
        confirmation = { action, id };
        page = 'confirm';
        break;
      case 'cancel':
      case 'back':
        back();
        return;
      case 'confirm':
        if (confirmation.action === 'wipe-all') {
          page = 'home';
          wipeAll?.();
          message = 'All saved data has been wiped.';
          break;
        }
        page = 'islands';
        if (confirmation.action === 'delete') {
          if (saves.remove(confirmation.id)) deleted();
          else message = 'This island could not be deleted.';
        } else beginSetup(confirmation.id, true);
        break;
      case 'new':
        beginSetup(id);
        break;
      case 'continue':
      case 'load':
        if (enter(action === 'continue' ? saves.recent()?.id : id)) return;
        message = 'This island could not be opened.';
        break;
    }
    render();
  });

  root.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...root.querySelectorAll('button:enabled, input:enabled, select:enabled, summary')]
      .filter(control => control.getClientRects().length);
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      controls[0]?.focus();
    }
  });

  return {
    show(startPage = 'home', slot) {
      setup = null;
      if (startPage === 'setup') beginSetup(slot);
      else page = startPage;
      message = '';
      root.hidden = false;
      root.inert = false;
      render();
    },
    closePanel() {
      if (page === 'setup') {
        const picker = document.activeElement?.closest('details[open]') ?? root.querySelector('details[open]');
        if (picker) {
          picker.open = false;
          picker.querySelector('summary').focus();
          return;
        }
      }
      back();
    },
  };
}
