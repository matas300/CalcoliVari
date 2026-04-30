// fatture-state-machine.js — Mutazioni stato fattura canoniche
// Risolve DUP-2: 5 punti diversi mutavano stato fattura con logiche divergenti
// (recalcAll mancante, pagMese non aggiornato, validate ISO inconsistente).
// Pure mutations: nessuna dipendenza UI/storage. I caller restano responsabili
// di prompt/save/recalcAll trigger.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FattureStateMachine = factory();
    if (typeof window !== 'undefined') window.FattureStateMachine = root.FattureStateMachine;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function _resolveTodayIso() {
    if (typeof window !== 'undefined' && window.DateUtils && typeof window.DateUtils.todayIso === 'function') {
      return window.DateUtils.todayIso();
    }
    if (typeof DateUtils !== 'undefined' && typeof DateUtils.todayIso === 'function') {
      return DateUtils.todayIso();
    }
    // Fallback (non TZ-safe ma robusto in test Node senza DateUtils)
    var d = new Date();
    var tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }

  function _parseIsoToLocalDate(iso) {
    // 'YYYY-MM-DD' → Date locale (mezzanotte)
    var parts = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) return null;
    return new Date(parseInt(parts[1], 10), parseInt(parts[2], 10) - 1, parseInt(parts[3], 10));
  }

  // markInviata(fattura, opts?): { date? }
  // Muta fattura in-place: stato='inviata', dataInvioSdi=date|today.
  function markInviata(fattura, opts) {
    if (!fattura) throw new Error('FattureStateMachine.markInviata: fattura richiesta');
    if (fattura.stato !== 'bozza' && fattura.stato !== 'inviata' && fattura.stato !== undefined) {
      throw new Error('FattureStateMachine.markInviata: stato corrente "' + fattura.stato + '" non promovibile a inviata');
    }
    var iso = (opts && opts.date) || _resolveTodayIso();
    fattura.stato = 'inviata';
    fattura.dataInvioSdi = iso;
    return fattura;
  }

  // markPagata(fattura, opts?): { date? }
  // Muta fattura in-place: stato='pagata', dataPagamento=date|today,
  // pagMese/pagAnno derivati dalla data locale.
  function markPagata(fattura, opts) {
    if (!fattura) throw new Error('FattureStateMachine.markPagata: fattura richiesta');
    if (fattura.stato !== 'inviata' && fattura.stato !== 'pagata') {
      throw new Error('FattureStateMachine.markPagata: stato corrente "' + fattura.stato + '" non promovibile a pagata');
    }
    var iso = (opts && opts.date) || _resolveTodayIso();
    var dt = _parseIsoToLocalDate(iso);
    if (!dt) throw new Error('FattureStateMachine.markPagata: data non valida (atteso YYYY-MM-DD): ' + iso);
    fattura.stato = 'pagata';
    fattura.dataPagamento = iso;
    fattura.pagMese = dt.getMonth() + 1;
    fattura.pagAnno = dt.getFullYear();
    return fattura;
  }

  // markBozza(fattura): reset a bozza (rimuove dataInvioSdi/dataPagamento/pagMese/pagAnno).
  function markBozza(fattura) {
    if (!fattura) throw new Error('FattureStateMachine.markBozza: fattura richiesta');
    fattura.stato = 'bozza';
    fattura.dataInvioSdi = null;
    fattura.dataPagamento = null;
    fattura.pagMese = null;
    fattura.pagAnno = null;
    return fattura;
  }

  return {
    markInviata: markInviata,
    markPagata: markPagata,
    markBozza: markBozza
  };
}));
