/**
 * Mara Research Notebook
 * Stores per-asset institutional research notes locally without server accounts:
 * - Investment Thesis
 * - Key Structural Risks
 * - Due Diligence Questions
 * - Valuation Notes
 * Includes auto-save and one-click Markdown export.
 */

import { getAccountStorageKey } from './auth.js';

const NOTEBOOK_PREFIX = 'apex_notebook_';

export class ResearchNotebook {
  static getNoteKey(symbol) {
    return getAccountStorageKey(`${NOTEBOOK_PREFIX}${(symbol || '').toUpperCase().trim()}`);
  }

  static loadNote(symbol) {
    try {
      const raw = localStorage.getItem(this.getNoteKey(symbol));
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to load notebook notes:', e);
    }

    return {
      symbol: symbol.toUpperCase(),
      thesis: '',
      risks: '',
      questions: '',
      valuationNotes: '',
      updatedAt: null,
    };
  }

  static saveNote(symbol, data) {
    try {
      const payload = {
        symbol: symbol.toUpperCase(),
        thesis: data.thesis || '',
        risks: data.risks || '',
        questions: data.questions || '',
        valuationNotes: data.valuationNotes || '',
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(this.getNoteKey(symbol), JSON.stringify(payload));
      return payload;
    } catch (e) {
      console.error('Failed to save notebook:', e);
      return null;
    }
  }

  static exportAsMarkdown(symbol, companyName = '') {
    const note = this.loadNote(symbol);
    const dateStr = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : new Date().toLocaleDateString();

    const md = `# Research Note: ${symbol} (${companyName || symbol})
*Last updated: ${dateStr}*

---

## Investment Thesis
${note.thesis || '_No thesis recorded yet._'}

---

## Key Structural & Fundamental Risks
${note.risks || '_No risks cataloged yet._'}

---

## Due Diligence Questions
${note.questions || '_No outstanding questions logged._'}

---

## Valuation & Target Scenarios
${note.valuationNotes || '_No valuation parameters set._'}

---
*Note: Produced in Mara. Stored locally in this browser.*
`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mara_Research_Note_${symbol}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
