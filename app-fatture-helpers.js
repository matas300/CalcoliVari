// app-fatture-helpers.js - Fatture helpers (getFatture* / cross-year / migration / per-anno)
// Estratto da app.js (Sprint 6.3).

(function () {
  'use strict';

  // ═══════════════════ Fatture helpers ═══════════════════
  // year param routes to FattureSelectors when available; legacy fallback for unmigrated data.
  function getFattureFromYearData(yearData, month, year) {
    if (year && typeof window !== 'undefined' && window.FattureSelectors && currentProfile) {
      const fatture = window.FattureSelectors.getByMonth(currentProfile, year, month);
      // NC invoices (TD04) return negative importo via getImportoSigned
      return fatture.map(f => ({
        importo: window.FattureSelectors.getImportoSigned(f),
        pagMese: f.pagMese || null,
        pagAnno: f.pagAnno || null,
        desc: (f.righe && f.righe[0] && f.righe[0].descrizione) || f.numero || ''
      }));
    }
    // Legacy fallback (pre-migration or year not known)
    const arr = yearData && yearData.fatture ? yearData.fatture[month] : null;
    if (!arr || !Array.isArray(arr) || arr.length === 0) return [];
    return arr.map(f => ({
      importo: parseFloat(f.importo) || 0,
      pagMese: f.pagMese || null,
      pagAnno: f.pagAnno || null,
      desc: f.desc || ''
    }));
  }

  // Helper: get all fattureEmesse for the current profile (from FattureStorico or localStorage)
  function _getFattureEmesse(profile) {
    if (window.FattureStorico) return window.FattureStorico.load(profile);
    const key = window.StorageKeys.fattureEmesse(profile);
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : []; } catch { return []; }
  }

  // Helper: save updated list back
  function _saveFattureEmesse(profile, list) {
    if (window.FattureStorico) { window.FattureStorico.save(profile, list); return; }
    const key = window.StorageKeys.fattureEmesse(profile);
    localStorage.setItem(key, JSON.stringify(list));
  }

  // getFatture: shim that reads from fattureEmesse via FattureSelectors.
  // Returns legacy-shaped objects {importo, pagMese, pagAnno, desc, id, origine, stato, tipoDocumento}
  // used by callers that haven't been refactored yet (e.g. getAllFattureForBudget uses yearData directly).
  function getFatture(month) {
    // F1 fix 2026-05-06: aggrega legacy data.fatture[M] + fatture wizard
    // (escludendo legacy-migrated per evitare duplicati con la sorgente legacy
    // ancora in data.fatture[M] post-migrazione).
    const legacyRows = getFattureFromYearData(data, month);
    if (!window.FattureSelectors) return legacyRows;
    const wizardRows = window.FattureSelectors.getByMonth(currentProfile, currentYear, month)
      .filter(f => f.origine !== 'legacy-migrated')
      .map(f => {
        const imp = window.FattureSelectors.getImportoSigned(f);
        const desc = (f.righe && f.righe[0] && f.righe[0].descrizione) || f.numero || '';
        const cliente = f.clienteSnapshot ? (f.clienteSnapshot.denominazione || (f.clienteSnapshot.nome || '')) : '';
        return {
          importo: imp,
          pagMese: f.pagMese || null,
          pagAnno: f.pagAnno || null,
          desc: cliente ? `${f.numero || ''} - ${cliente}`.trim().replace(/^-\s*/, '') : desc,
          id: f.id,
          origine: f.origine,
          stato: f.stato,
          tipoDocumento: f.tipoDocumento
        };
      });
    return [...legacyRows, ...wizardRows];
  }

  if (typeof window !== "undefined") {
    window.getFattureFromYearData = getFattureFromYearData;
    window._getFattureEmesse = _getFattureEmesse;
    window._saveFattureEmesse = _saveFattureEmesse;
    window.getFatture = getFatture;
  }
}());
