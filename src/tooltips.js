export const TOOLTIP_CONFIG = {
  gap: 8,
  edgeMargin: 8,
  maxWidthPx: 260,
};

/**
 * Pure content-aware placement solver:
 * Chooses above or below based on tooltip height, trigger rect, and viewport bounds,
 * and clamps horizontal position strictly inside the viewport width.
 */
export function computeTooltipPosition(triggerRect, tipSize, viewport, config = TOOLTIP_CONFIG) {
  const { gap, edgeMargin } = config;
  const maxLeft = Math.max(edgeMargin, viewport.width - tipSize.width - edgeMargin);
  const centeredLeft = triggerRect.left + (triggerRect.width - tipSize.width) / 2;
  const left = Math.round(Math.max(edgeMargin, Math.min(maxLeft, centeredLeft)));

  const spaceBelow = viewport.height - triggerRect.bottom - gap - edgeMargin;
  const spaceAbove = triggerRect.top - gap - edgeMargin;
  const fitsBelow = spaceBelow >= tipSize.height;
  const fitsAbove = spaceAbove >= tipSize.height;

  let placement = 'bottom';
  if (!fitsBelow && fitsAbove) {
    placement = 'top';
  } else if (!fitsBelow && !fitsAbove) {
    placement = spaceAbove > spaceBelow ? 'top' : 'bottom';
  } else if (fitsAbove && triggerRect.bottom > viewport.height * 0.72 && spaceAbove > spaceBelow) {
    // Near the bottom edge, prefer placing tooltips above so controls stay unobstructed.
    placement = 'top';
  }

  const rawTop = placement === 'top'
    ? triggerRect.top - tipSize.height - gap
    : triggerRect.bottom + gap;
  const maxTop = Math.max(edgeMargin, viewport.height - tipSize.height - edgeMargin);
  const top = Math.round(Math.max(edgeMargin, Math.min(maxTop, rawTop)));

  return { left, top, placement };
}

/**
 * Binds content-aware hover and keyboard-focus tooltips across `root`.
 * Replaces the static below-only GameUI.bindTooltips behavior.
 */
export function bindSmartTooltips(root, config = TOOLTIP_CONFIG) {
  let tip = null;
  let activeTrigger = null;

  function hide() {
    if (tip) {
      tip.remove();
      tip = null;
    }
    activeTrigger = null;
  }

  function position() {
    if (!tip || !activeTrigger) return;
    if (!activeTrigger.isConnected) {
      hide();
      return;
    }
    const maxW = Math.min(config.maxWidthPx, Math.max(120, window.innerWidth - config.edgeMargin * 2));
    tip.style.maxWidth = `${maxW}px`;
    const rect = activeTrigger.getBoundingClientRect();
    const size = { width: tip.offsetWidth, height: tip.offsetHeight };
    const { left, top, placement } = computeTooltipPosition(
      rect,
      size,
      { width: window.innerWidth, height: window.innerHeight },
      config,
    );
    tip.dataset.placement = placement;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function show(trigger) {
    const text = trigger?.dataset?.tip?.trim();
    if (!text) {
      hide();
      return;
    }
    if (activeTrigger === trigger && tip && tip.textContent === text) {
      position();
      return;
    }
    hide();
    activeTrigger = trigger;
    tip = document.createElement('div');
    tip.className = 'gu-tipbox gu-panel tip smart-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = text;
    tip.style.visibility = 'hidden';
    document.body.appendChild(tip);
    position();
    tip.style.visibility = 'visible';
  }

  function onOver(event) {
    const target = event.target.closest?.('[data-tip]');
    if (!target) {
      hide();
      return;
    }
    show(target);
  }

  function onFocusIn(event) {
    const target = event.target.closest?.('[data-tip]');
    if (target) show(target);
  }

  function onFocusOut() {
    hide();
  }

  root.addEventListener('mouseover', onOver);
  root.addEventListener('mouseleave', hide);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  window.addEventListener('pointerdown', hide, true);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', hide, true);

  return {
    hide,
    refresh: position,
    destroy() {
      hide();
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('mouseleave', hide);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', hide, true);
    },
  };
}
