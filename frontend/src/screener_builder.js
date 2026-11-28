/**
 * Mara Screener 2.0 - Dynamic Multi-Condition Query Builder
 * Evaluates assets against arbitrary rule combinations (AND / OR).
 * Evaluates rules and exports the displayed results to CSV or JSON.
 */

export const SCREENER_METRICS = [
  { id: 'pe_trailing', label: 'Trailing P/E', unit: 'x', defaultVal: 30, defaultOp: '<' },
  { id: 'pe_forward', label: 'Forward P/E', unit: 'x', defaultVal: 25, defaultOp: '<' },
  { id: 'roe', label: 'Return on Equity (ROE)', unit: '%', defaultVal: 15, defaultOp: '>' },
  { id: 'debt_to_equity', label: 'Debt / Equity', unit: 'x', defaultVal: 0.5, defaultOp: '<' },
  { id: 'dividend_yield', label: 'Dividend Yield', unit: '%', defaultVal: 1.5, defaultOp: '>' },
  { id: 'change_pct', label: 'Change %', unit: '%', defaultVal: 0, defaultOp: '>' },
  { id: 'current_price', label: 'Price', unit: 'quote currency', defaultVal: 500, defaultOp: '<' },
];

export class ScreenerBuilder {
  constructor() {
    this.reset();
    this.nextId = 1;
  }

  addCondition() {
    this.conditions.push({
      id: this.nextId++,
      metric: 'change_pct',
      operator: '>',
      value: 0,
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
    this.conditions = [];
    this.combinator = 'AND';
  }

  execute(assets, conditions = this.conditions, combinator = this.combinator) {
    if (!assets || assets.length === 0) return [];
    if (conditions.length === 0) return assets;

    return assets.filter((asset) => {
      const matches = (cond) => {
        const val = asset[cond.metric];
        const target = cond.value;
        if (!Number.isFinite(val) || !Number.isFinite(target)) return false;

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
            return false;
        }
      };
      return combinator === 'AND' ? conditions.every(matches) : conditions.some(matches);
    });
  }

  exportCSV(results, includeFundamentals = true) {
    if (!results || results.length === 0) return;
    const csvText = value => {
      const safe = String(value ?? '').replace(/^([\s]*[=+\-@]|[\t\r\n])/, "'$&");
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const fundamentals = ['Trailing P/E', 'ROE %', 'Debt/Equity', 'Market Cap'];
    const headers = ['Symbol', 'Name', 'Price', 'Currency', 'Change %', ...(includeFundamentals ? fundamentals : []), 'Source'];
    const rows = results.map((r) => [
      csvText(r.symbol),
      csvText(r.name || r.symbol),
      r.current_price ?? '',
      csvText(r.currency || r.currency_symbol),
      r.change_pct ?? '',
      ...(includeFundamentals ? [r.pe_trailing ?? '', r.roe ?? '', r.debt_to_equity ?? '', r.market_cap ?? ''] : []),
      csvText(r.data_source || r.source),
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
