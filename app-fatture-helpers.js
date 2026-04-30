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

  // Helper: get id of fattura at position (month, idx) in the Fatture tab grid.
  // Il tab raggruppa per mese di EMISSIONE (issuedMonth), quindi idx riferisce
  // la posizione nella lista filtrata per issuedMonth — non pagMese.
  function _getFatturaIdAt(month, idx) {
    if (!window.FattureSelectors) return null;
    const byIssued = typeof window.FattureSelectors.getByIssuedMonth === 'function'
      ? window.FattureSelectors.getByIssuedMonth(currentProfile, currentYear, month)
      : null;
    const rows = byIssued || window.FattureSelectors.getByMonth(currentProfile, currentYear, month);
    return rows[idx] ? rows[idx].id : null;
  }

  // getFatture: shim that reads from fattureEmesse via FattureSelectors.
  // Returns legacy-shaped objects {importo, pagMese, pagAnno, desc, id, origine, stato, tipoDocumento}
  // used by callers that haven't been refactored yet (e.g. getAllFattureForBudget uses yearData directly).
  function getFatture(month) {
    if (window.FattureSelectors) {
      return window.FattureSelectors.getByMonth(currentProfile, currentYear, month).map(f => {
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
    }
    // Fallback to legacy store (pre-migration)
    return getFattureFromYearData(data, month);
  }

  // getFattureIssued: come getFatture ma filtrata per mese di EMISSIONE (issuedMonth).
  // Usata dal tab Fatture per raggruppare le fatture nel mese in cui sono state fatte.
  function getFattureIssued(month) {
    if (window.FattureSelectors && typeof window.FattureSelectors.getByIssuedMonth === 'function') {
      return window.FattureSelectors.getByIssuedMonth(currentProfile, currentYear, month).map(f => {
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
    }
    return getFattureFromYearData(data, month);
  }

  // Id lookup per posizione nel tab Fatture (raggruppato per issuedMonth).
  function _getFatturaIdAtIssued(month, idx) {
    if (!window.FattureSelectors || typeof window.FattureSelectors.getByIssuedMonth !== 'function') return null;
    const rows = window.FattureSelectors.getByIssuedMonth(currentProfile, currentYear, month);
    return rows[idx] ? rows[idx].id : null;
  }

  function setFatturaImporto(month, idx, val) {
    const imp = parseFloat(val) || 0;
    let id = _getFatturaIdAt(month, idx);
    if (!id && window.FattureStorico) {
      // No existing row — create a new legacy-migrated entry on first write
      addFattura(month);
      id = _getFatturaIdAt(month, idx);
    }
    if (!id) {
      // Fallback: legacy store
      if (!data.fatture[month]) data.fatture[month] = [{ importo: 0, pagMese: null, pagAnno: null, desc: '' }];
      if (data.fatture[month][idx] === undefined) data.fatture[month][idx] = { importo: 0, pagMese: null, pagAnno: null, desc: '' };
      data.fatture[month][idx].importo = imp;
      saveData(); return;
    }
    const list = _getFattureEmesse(currentProfile);
    const i = list.findIndex(f => f.id === id);
    if (i < 0) return;
    if (list[i].righe && list[i].righe.length > 0) {
      list[i].righe[0].prezzoUnitario = imp;
      list[i].righe[0].quantita = 1;
    } else {
      list[i].righe = [{ descrizione: '', quantita: 1, prezzoUnitario: imp, iva: 0 }];
    }
    _saveFattureEmesse(currentProfile, list);
  }

  function setFatturaDesc(month, idx, val) {
    const id = _getFatturaIdAt(month, idx);
    if (!id) {
      // Fallback: legacy store
      if (!data.fatture[month] || !data.fatture[month][idx]) return;
      data.fatture[month][idx].desc = val;
      saveData(); return;
    }
    const list = _getFattureEmesse(currentProfile);
    const i = list.findIndex(f => f.id === id);
    if (i < 0) return;
    if (list[i].righe && list[i].righe.length > 0) {
      list[i].righe[0].descrizione = val;
    } else {
      list[i].righe = [{ descrizione: val, quantita: 1, prezzoUnitario: 0, iva: 0 }];
    }
    _saveFattureEmesse(currentProfile, list);
  }

  function setFatturaPagamento(month, idx, pagMese, pagAnno) {
    const id = _getFatturaIdAt(month, idx);
    if (!id) {
      // Fallback: legacy store
      if (!data.fatture[month]) data.fatture[month] = [{ importo: 0, pagMese: null, pagAnno: null, desc: '' }];
      if (!data.fatture[month][idx]) return;
      data.fatture[month][idx].pagMese = pagMese;
      data.fatture[month][idx].pagAnno = pagAnno;
      saveData(); return;
    }
    const list = _getFattureEmesse(currentProfile);
    const i = list.findIndex(f => f.id === id);
    if (i < 0) return;
    list[i].pagMese = pagMese;
    list[i].pagAnno = pagAnno;
    _saveFattureEmesse(currentProfile, list);
  }

  function addFattura(month) {
    if (window.FattureStorico) {
      const list = _getFattureEmesse(currentProfile);
      const prog = window.FattureStorico.nextProgressivo(currentYear, list);
      const pad = n => String(n).padStart(2, '0');
      const newFatt = {
        id: 'fat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
        numero: window.FattureStorico.formatNumero(currentYear, prog),
        anno: currentYear,
        annoProgressivo: currentYear,
        progressivo: prog,
        data: `${currentYear}-${pad(month)}-01`,
        clienteId: '',
        clienteSnapshot: null,
        righe: [{ descrizione: '', quantita: 1, prezzoUnitario: 0, iva: 0 }],
        contributoIntegrativo: 0,
        marcaDaBollo: false,
        bolloAddebitato: false,
        note: '',
        modalitaPagamento: '',
        scadenzaPagamento: '',
        incassata: false,
        dataIncasso: '',
        issuedMonth: month,
        issuedYear: currentYear,
        stato: 'pagata',
        tipoDocumento: 'TD01',
        dataInvioSdi: null,
        dataPagamento: null,
        fatturaOriginaleId: null,
        ritenuta: 0,
        aliquotaRitenuta: 0,
        tipoRitenuta: '',
        causaleRitenuta: '',
        ncIds: [],
        ncTotaleImporto: 0,
        pagMese: month,
        pagAnno: currentYear,
        origine: 'legacy-migrated'
      };
      list.unshift(newFatt);
      _saveFattureEmesse(currentProfile, list);
    } else {
      if (!data.fatture[month]) data.fatture[month] = [];
      data.fatture[month].push({ importo: 0, pagMese: null, pagAnno: null, desc: '' });
      saveData();
    }
    recalcAll();
  }

  function removeFattura(month, idx) {
    const id = _getFatturaIdAt(month, idx);
    if (id) {
      const list = _getFattureEmesse(currentProfile);
      const updated = list.filter(f => f.id !== id);
      _saveFattureEmesse(currentProfile, updated);
      recalcAll();
      return;
    }
    // Fallback: legacy store
    if (!data.fatture[month] || !data.fatture[month][idx]) return;
    const row = data.fatture[month][idx];
    const linkedInvoiceId = String(row.invoiceId || row.fatturaId || '').trim();
    const canDeleteLast = !!linkedInvoiceId;
    if (data.fatture[month].length <= 1 && !canDeleteLast) return;
    data.fatture[month].splice(idx, 1);
    if (data.fatture[month].length === 0) delete data.fatture[month];
    saveData();
    recalcAll();
  }


  if (typeof window !== "undefined") {
    window.getFattureFromYearData = getFattureFromYearData;
    window._getFattureEmesse = _getFattureEmesse;
    window._saveFattureEmesse = _saveFattureEmesse;
    window._getFatturaIdAt = _getFatturaIdAt;
    window.getFatture = getFatture;
    window.getFattureIssued = getFattureIssued;
    window._getFatturaIdAtIssued = _getFatturaIdAtIssued;
    window.setFatturaImporto = setFatturaImporto;
    window.setFatturaDesc = setFatturaDesc;
    window.setFatturaPagamento = setFatturaPagamento;
    window.addFattura = addFattura;
    window.removeFattura = removeFattura;
  }
}());
