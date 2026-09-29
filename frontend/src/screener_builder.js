/**
 * Mara Screener 2.0 - Dynamic Multi-Condition Query Builder
 * Evaluates assets against arbitrary rule combinations (AND / OR).
 * Allows saving query presets to localStorage and exporting results to CSV / JSON.
 */

const PRESETS_STORAGE_KEY = 'apex_screener_presets';

export const SCREENER_METRICS = [
  { id: 'pe_trailing', label: 'Trailing P/E', unit: 'x', defaultVal: 30, defaultOp: '<' },
  { id: 'pe_forward', label: 'Forward P/E', unit: 'x', defaultVal: 25, defaultOp: '<' },
  { id: 'roe', label: 'Return on Equity (ROE)', unit: '%', defaultVal: 15, defaultOp: '>' },
  { id: 'debt_to_equity', label: 'Debt / Equity', unit: 'x', defaultVal: 0.5, defaultOp: '<' },
  { id: 'dividend_yield', label: 'Dividend Yield', unit: '%', defaultVal: 1.5, defaultOp: '>' },
  { id: 'change_pct', label: '24H Change %', unit: '%', defaultVal: 0, defaultOp: '>' },
  { id: 'current_price', label: 'Current Price', unit: '$ / ₹', defaultVal: 500, defaultOp: '<' },
];

export class ScreenerBuilder {
  constructor() {
    this.conditions = [
      { id: 1, metric: 'roe', operator: '>', value: 15 },
      { id: 2, metric: 'debt_to_equity', operator: '<', value: 0.8 },
      { id: 3, metric: 'pe_trailing', operator: '<', value: 35 },
    ];
    this.combinator = 'AND'; // 'AND' or 'OR'
    this.nextId = 4;
  }

  addCondition() {
    this.conditions.push({
      id: this.nextId++,
      metric: 'pe_trailing',
      operator: '<',
      value: 30,
    });
  }

  removeCondition(id) {
    this.conditions = this.conditions.filter((c) => c.id !== id);
  }

  updateCondition(id, key, val) {
    const cond = this.conditions.find((c) => c.id === id);
    if (cond) {
      cond[key] = key === 'value' ? parseFloat(val) : val;
    }
  }

  reset() {
    this.conditions = [
      { id: 1, metric: 'roe', operator: '>', value: 15 },
      { id: 2, metric: 'debt_to_equity', operator: '<', value: 0.8 },
    ];
    this.combinator = 'AND';
  }

  execute(assets) {
    if (!assets || assets.length === 0) return [];
    if (this.conditions.length === 0) return assets;

    return assets.filter((asset) => {
      const matchResults = this.conditions.map((cond) => {
        let val = asset[cond.metric];
        if (val == null) return false;

        const target = parseFloat(cond.value);
        if (isNaN(target)) return true;

        switch (cond.operator) {
          case '>':
            return val > target;
          case '>=':
            return val >= target;
          case '<':
            return val < target;
          case '<=':
            return val <= target;
          case '=':
            return Math.abs(val - target) < 0.01;
          default:
            return true;
        }
      });

      if (this.combinator === 'AND') {
        return matchResults.every(Boolean);
      } else {
        return matchResults.some(Boolean);
      }
    });
  }

  exportCSV(results) {
    if (!results || results.length === 0) return;
    const headers = ['Symbol', 'Name', 'Price', '24H Chg %', 'P/E', 'ROE %', 'Debt/Equity', 'Market Cap'];
    const rows = results.map((r) => [
      `"${r.symbol}"`,
      `"${(r.name || r.symbol).replace(/"/g, '""')}"`,
      r.current_price || '',
      r.change_pct || '',
      r.pe_trailing || '',
      r.roe || '',
      r.debt_to_equity || '',
      `"${r.market_cap_str || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mara_Screener_Results_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  exportJSON(results) {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mara_Screener_Results_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const screenerBuilder = new ScreenerBuilder();
