/* Fatture selectors — single source of truth query helpers */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'calcoliPIVA_';
  var STORAGE_SUFFIX = '_fattureEmesse';

  function storageKey(profile) {
    if (!profile) throw new Error('FattureSelectors: profile richiesto');
    return STORAGE_PREFIX + profile + STORAGE_SUFFIX;
  }

  function all(profile) {
    try {
      var raw = localStorage.getItem(storageKey(profile));
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      var norm = typeof window.normalizeInvoice === 'function' ? window.normalizeInvoice : function (x) { return x; };
      return arr.map(norm);
    } catch (err) {
      console.warn('FattureSelectors.all: errore parse', err);
      return [];
    }
  }

  window.FattureSelectors = {
    all: all,
    storageKey: storageKey
  };
})();
