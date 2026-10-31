/**
 * Mara Toast System - Human-centered notification layer
 * Accessible, animated, and respectful of user attention
 */

const TOAST_CONTAINER_ID = 'mara-toast-container';
const TOAST_DEFAULTS = {
  duration: 4000,
  position: 'bottom-right',
  maxVisible: 5,
  gap: 8,
};

const ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  loading: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="toast-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>`,
};

const TYPE_CLASSES = {
  success: 'toast--success',
  error: 'toast--error',
  warning: 'toast--warning',
  info: 'toast--info',
  loading: 'toast--loading',
};

let container = null;
let toastId = 0;
const activeToasts = new Map();

/**
 * Initialize the toast container
 */
function ensureContainer() {
  if (container) return container;

  container = document.createElement('div');
  container.id = TOAST_CONTAINER_ID;
  container.className = 'mara-toast-container';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Notifications');
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'true');
  document.body.appendChild(container);
  return container;
}

/**
 * Create a toast element
 */
function createToastElement({ id, type, title, message, action, dismissible = true, persistent = false }) {
  const el = document.createElement('div');
  el.className = `mara-toast ${TYPE_CLASSES[type] || ''}`;
  el.dataset.toastId = id;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const iconHtml = ICONS[type] || ICONS.info;

  el.innerHTML = `
    <div class="toast-icon" aria-hidden="true">${iconHtml}</div>
    <div class="toast-content">
      ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
      ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
      ${action ? `<button class="toast-action" data-toast-action>${escapeHtml(action.label)}</button>` : ''}
    </div>
    ${dismissible ? `<button class="toast-close" aria-label="Dismiss notification" data-toast-close>✕</button>` : ''}
    ${!persistent ? '<div class="toast-progress" aria-hidden="true"></div>' : ''}
  `;

  // Action handler
  if (action && action.onClick) {
    const btn = el.querySelector('[data-toast-action]');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      action.onClick(el);
    });
  }

  // Dismiss handler
  if (dismissible) {
    const closeBtn = el.querySelector('[data-toast-close]');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss(id);
    });
  }

  // Pause progress on hover
  if (!persistent) {
    const progress = el.querySelector('.toast-progress');
    el.addEventListener('mouseenter', () => progress.style.animationPlayState = 'paused');
    el.addEventListener('mouseleave', () => progress.style.animationPlayState = 'running');
  }

  return el;
}

/**
 * Show a toast notification
 */
export function toast({ type = 'info', title, message, action, duration, persistent = false, dismissible = true }) {
  const id = ++toastId;
  const cfg = { ...TOAST_DEFAULTS, duration: duration ?? TOAST_DEFAULTS.duration };

  // Enforce max visible
  if (activeToasts.size >= cfg.maxVisible) {
    const oldestId = activeToasts.keys().next().value;
    dismiss(oldestId, false);
  }

  const el = createToastElement({ id, type, title, message, action, dismissible, persistent });
  ensureContainer().appendChild(el);

  // Force reflow for animation
  requestAnimationFrame(() => {
    el.classList.add('toast--visible');
  });

  // Progress bar animation
  if (!persistent && cfg.duration > 0) {
    const progress = el.querySelector('.toast-progress');
    if (progress) {
      progress.style.animationDuration = `${cfg.duration}ms`;
    }
  }

  // Auto-dismiss
  let dismissTimer = null;
  if (!persistent && cfg.duration > 0) {
    dismissTimer = setTimeout(() => dismiss(id), cfg.duration);
  }

  activeToasts.set(id, { el, dismissTimer, persistent });

  return {
    id,
    dismiss: () => dismiss(id),
    update: (opts) => updateToast(id, opts),
  };
}

/**
 * Dismiss a toast
 */
export function dismiss(id, animate = true) {
  const entry = activeToasts.get(id);
  if (!entry) return;

  if (entry.dismissTimer) clearTimeout(entry.dismissTimer);

  if (animate) {
    entry.el.classList.add('toast--hiding');
    entry.el.addEventListener('transitionend', () => entry.el.remove(), { once: true });
  } else {
    entry.el.remove();
  }

  activeToasts.delete(id);
}

/**
 * Update an existing toast
 */
function updateToast(id, opts) {
  const entry = activeToasts.get(id);
  if (!entry) return;

  if (opts.type && opts.type !== entry.el.dataset.type) {
    entry.el.className = `mara-toast ${TYPE_CLASSES[opts.type] || ''} toast--visible`;
    entry.el.querySelector('.toast-icon').innerHTML = ICONS[opts.type] || ICONS.info;
  }
  if (opts.title) entry.el.querySelector('.toast-title').textContent = opts.title;
  if (opts.message) entry.el.querySelector('.toast-message').textContent = opts.message;
}

/**
 * Convenience methods
 */
export const toastSuccess = (title, message, opts) => toast({ type: 'success', title, message, ...opts });
export const toastError = (title, message, opts) => toast({ type: 'error', title, message, duration: 6000, ...opts });
export const toastWarning = (title, message, opts) => toast({ type: 'warning', title, message, ...opts });
export const toastInfo = (title, message, opts) => toast({ type: 'info', title, message, ...opts });
export const toastLoading = (title, message, opts) => toast({ type: 'loading', title, message, persistent: true, dismissible: false, ...opts });

/**
 * Replace a loading toast with a result
 */
export function resolveLoadingToast(loadingToast, { type = 'success', title, message, action }) {
  if (!loadingToast) return;
  loadingToast.dismiss();
  return toast({ type, title, message, action });
}

/**
 * Clear all toasts
 */
export function clearToasts() {
  activeToasts.forEach((_, id) => dismiss(id, false));
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Initialize styles (call once on app startup)
 */
export function initToastStyles() {
  if (document.getElementById('mara-toast-styles')) return;

  const style = document.createElement('style');
  style.id = 'mara-toast-styles';
  style.textContent = `
    .mara-toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      max-width: 380px;
    }

    .mara-toast {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: var(--surface-0);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg), 0 0 0 1px var(--border-hairline);
      pointer-events: auto;
      transform: translateX(120%) scale(0.95);
      opacity: 0;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
      min-width: 280px;
      max-width: 380px;
    }

    .mara-toast.toast--visible {
      transform: translateX(0) scale(1);
      opacity: 1;
    }

    .mara-toast.toast--hiding {
      transform: translateX(120%) scale(0.95);
      opacity: 0;
    }

    .toast-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--fg-muted);
    }

    .mara-toast.toast--success .toast-icon { color: var(--gain); }
    .mara-toast.toast--error .toast-icon { color: var(--loss); }
    .mara-toast.toast--warning .toast-icon { color: var(--warning); }
    .mara-toast.toast--info .toast-icon { color: var(--accent-primary); }
    .mara-toast.toast--loading .toast-icon { color: var(--accent-primary); }

    .toast-spin { animation: toast-spin 1s linear infinite; }
    @keyframes toast-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    .toast-content { flex: 1; min-width: 0; }
    .toast-title { font-size: var(--font-size-sm); font-weight: 600; color: var(--fg); line-height: 1.3; margin-bottom: 2px; }
    .toast-message { font-size: var(--font-size-xs); color: var(--fg-muted); line-height: 1.4; word-break: break-word; }

    .toast-action {
      margin-top: 8px;
      padding: 6px 12px;
      font-size: var(--font-size-xs);
      font-weight: 600;
      font-family: var(--font-sans);
      color: var(--accent-primary);
      background: transparent;
      border: 1px solid var(--accent-primary);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .toast-action:hover { background: var(--accent-primary); color: var(--bg); }

    .toast-close {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: var(--fg-muted);
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
    }
    .mara-toast:hover .toast-close { opacity: 1; }
    .toast-close:hover { background: var(--surface-1); color: var(--fg); }

    .toast-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      border-radius: 0 0 var(--radius-md) var(--radius-md);
      background: var(--accent-primary);
      transform-origin: left center;
      animation: toast-progress linear forwards;
    }
    .mara-toast.toast--success .toast-progress { background: var(--gain); }
    .mara-toast.toast--error .toast-progress { background: var(--loss); }
    .mara-toast.toast--warning .toast-progress { background: var(--warning); }

    @keyframes toast-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .mara-toast { transition: opacity 0.01s; transform: none; }
      .mara-toast.toast--visible { opacity: 1; transform: none; }
      .mara-toast.toast--hiding { opacity: 0; }
      .toast-progress { animation: none; }
      .toast-spin { animation: none; }
    }

    /* Mobile adjustments */
    @media (max-width: 480px) {
      .mara-toast-container { left: 12px; right: 12px; bottom: 12px; max-width: none; }
      .mara-toast { min-width: 0; }
    }
  `;
  document.head.appendChild(style);
}

// Auto-initialize when imported
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToastStyles, { once: true });
  } else {
    initToastStyles();
  }
}
