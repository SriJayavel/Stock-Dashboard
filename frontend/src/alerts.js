/**
 * Apex Terminal Local Alerts Engine (Zero Backend / Zero Accounts)
 * Persists user-defined alerts in localStorage.
 * Evaluates live prices and technical conditions, triggering in-app toast
 * and native HTML5 notifications when conditions are met.
 */

const STORAGE_KEY = 'apex_terminal_alerts';

class AlertsManager {
  constructor() {
    this.alerts = this.loadAlerts();
    this.hasRequestedPermission = false;
  }

  loadAlerts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveAlerts() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.alerts));
    } catch (e) {
      console.error('Failed to save alerts to localStorage:', e);
    }
  }

  requestPermission() {
    if ('Notification' in window && Notification.permission === 'default' && !this.hasRequestedPermission) {
      this.hasRequestedPermission = true;
      Notification.requestPermission();
    }
  }

  addAlert({ symbol, metric, operator, target, note = '' }) {
    this.requestPermission();
    const newAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      symbol: symbol.toUpperCase(),
      metric, // 'price', 'rsi', 'pe', 'high_52w'
      operator, // '>', '<', '>=', '<='
      target: parseFloat(target),
      note,
      triggered: false,
      createdAt: new Date().toISOString(),
      triggeredAt: null,
    };
    this.alerts.unshift(newAlert);
    this.saveAlerts();
    return newAlert;
  }

  removeAlert(id) {
    this.alerts = this.alerts.filter((a) => a.id !== id);
    this.saveAlerts();
  }

  clearTriggered() {
    this.alerts = this.alerts.filter((a) => !a.triggered);
    this.saveAlerts();
  }

  getAlertsForSymbol(symbol) {
    const sym = symbol.toUpperCase();
    return this.alerts.filter((a) => a.symbol === sym);
  }

  getAllAlerts() {
    return this.alerts;
  }

  checkAlerts({ symbol, currentPrice, rsi, pe, high52w }) {
    const sym = symbol.toUpperCase();
    const active = this.alerts.filter((a) => a.symbol === sym && !a.triggered);

    active.forEach((alert) => {
      let isMet = false;
      let val = 0;
      let label = '';

      if (alert.metric === 'price' && currentPrice != null) {
        val = currentPrice;
        label = `Price reached ${currentPrice}`;
        if (alert.operator === '>' && val > alert.target) isMet = true;
        if (alert.operator === '<' && val < alert.target) isMet = true;
        if (alert.operator === '>=' && val >= alert.target) isMet = true;
        if (alert.operator === '<=' && val <= alert.target) isMet = true;
      } else if (alert.metric === 'rsi' && rsi != null) {
        val = rsi;
        label = `RSI reached ${rsi.toFixed(1)}`;
        if (alert.operator === '>' && val > alert.target) isMet = true;
        if (alert.operator === '<' && val < alert.target) isMet = true;
      } else if (alert.metric === 'pe' && pe != null) {
        val = pe;
        label = `P/E multiple reached ${pe.toFixed(1)}x`;
        if (alert.operator === '<' && val < alert.target) isMet = true;
        if (alert.operator === '>' && val > alert.target) isMet = true;
      }

      if (isMet) {
        alert.triggered = true;
        alert.triggeredAt = new Date().toISOString();
        this.saveAlerts();
        this.notify(alert, label);
      }
    });
  }

  notify(alert, conditionText) {
    const title = `Apex Alert: ${alert.symbol}`;
    const body = `${conditionText} (${alert.operator} ${alert.target}). ${alert.note || ''}`;

    // 1. Native HTML5 Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } catch (e) {
        console.warn('Native notification failed:', e);
      }
    }

    // 2. In-App Notification Toast
    this.showInAppToast(title, body);
  }

  showInAppToast(title, body) {
    let container = document.getElementById('apex-alert-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'apex-alert-toast-container';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: var(--surface);
      border: 1px solid var(--accent);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      border-radius: var(--radius-sm);
      padding: 10px 14px;
      color: var(--text);
      font-size: 12px;
      min-width: 260px;
      max-width: 360px;
      pointer-events: auto;
      animation: slideIn 0.2s ease-out;
    `;
    toast.innerHTML = `
      <div style="font-weight: 600; color: var(--accent); margin-bottom: 4px;">${title}</div>
      <div style="color: var(--text-dim); font-size: 11px; line-height: 1.4;">${body}</div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 6000);
  }
}

export const alertsManager = new AlertsManager();
