const kinds = {
  source: ['●', 'Source data'],
  calculation: ['ƒ', 'Calculated metric'],
  context: ['❝', 'Attributed context'],
  interpretation: ['◇', 'Interpretation'],
};

function escapeHtml(value) {
  const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, character => escapes[character]);
}

export function provenance(value, { kind = 'source', label, details }) {
  const [marker, name] = kinds[kind];
  return `<button type="button" class="provenance-trigger" data-kind="${kind}"
    data-label="${escapeHtml(label)}" data-details="${escapeHtml(details)}"
    aria-description="${escapeHtml(`${label} · ${name}: ${details}`)}"
    aria-controls="provenance-card" aria-expanded="false"><span class="provenance-value">${escapeHtml(value)}</span><span class="provenance-marker" aria-hidden="true">${marker}</span></button>`;
}

export function setupProvenance() {
  const card = document.createElement('aside');
  card.id = 'provenance-card';
  card.className = 'provenance-card';
  card.setAttribute('popover', 'manual');
  card.hidden = true;
  const heading = document.createElement('strong');
  const details = document.createElement('span');
  card.append(heading, details);
  document.body.append(card);
  let owner;
  let pinned = false;
  let leaveTimer;
  let handledTouch = false;

  function close() {
    clearTimeout(leaveTimer);
    owner?.setAttribute('aria-expanded', 'false');
    card.hidePopover?.();
    card.hidden = true;
    owner = null;
    pinned = false;
  }

  function show(trigger) {
    clearTimeout(leaveTimer);
    if (owner === trigger) return;
    close();
    owner = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    heading.textContent = `${kinds[trigger.dataset.kind][1]} · ${trigger.dataset.label}`;
    details.textContent = trigger.dataset.details;
    card.dataset.kind = trigger.dataset.kind;
    card.hidden = false;
    card.showPopover?.();
    const bounds = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(bounds.right - card.offsetWidth, document.documentElement.clientWidth - card.offsetWidth - 8));
    const top = bounds.bottom + card.offsetHeight + 16 > window.innerHeight
      ? Math.max(8, bounds.top - card.offsetHeight - 4)
      : bounds.bottom + 4;
    card.style.inset = `${top}px auto auto ${left}px`;
  }

  function scheduleClose() {
    clearTimeout(leaveTimer);
    if (!pinned) leaveTimer = setTimeout(() => {
      if (!owner?.matches(':hover, :focus-visible') && !card.matches(':hover')) close();
    }, 120);
  }

  document.addEventListener('focusin', event => {
    const trigger = event.target.closest('.provenance-trigger');
    if (trigger?.matches(':focus-visible')) show(trigger);
    else if (owner && !card.contains(event.target) && trigger !== owner) close();
  });
  document.addEventListener('pointerover', event => {
    const trigger = event.target.closest('.provenance-trigger');
    if (event.pointerType === 'mouse' && trigger && (!pinned || owner === trigger)) show(trigger);
    if (card.contains(event.target)) clearTimeout(leaveTimer);
  });
  document.addEventListener('pointerout', event => {
    if (owner?.contains(event.target) || card.contains(event.target)) scheduleClose();
  });
  document.addEventListener('pointerdown', () => { handledTouch = false; });
  document.addEventListener('pointerup', event => {
    const trigger = event.target.closest('.provenance-trigger');
    if (event.pointerType !== 'touch' || !trigger) return;
    handledTouch = true;
    if (owner === trigger && pinned) close();
    else {
      show(trigger);
      pinned = true;
    }
  });
  document.addEventListener('click', event => {
    if (handledTouch && event.detail > 0) {
      handledTouch = false;
      return;
    }
    const trigger = event.target.closest('.provenance-trigger');
    if (trigger) {
      if (owner === trigger && pinned) close();
      else {
        show(trigger);
        pinned = true;
      }
    } else if (owner && !card.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && owner) close();
  });
  window.addEventListener('resize', close);
  document.addEventListener('scroll', close, true);
}
