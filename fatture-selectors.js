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

  function _calcImporto(fattura) {
    var righe = (fattura && fattura.righe) || [];
    var imp = 0;
    for (var i = 0; i < righe.length; i++) {
      imp += (Number(righe[i].quantita) || 0) * (Number(righe[i].prezzoUnitario) || 0);
    }
    return imp;
  }

  function getImportoSigned(fattura) {
    var imp = _calcImporto(fattura);
    return (fattura && fattura.tipoDocumento === 'TD04') ? -imp : imp;
  }

  function getNettoEffettivo(fattura) {
    var imp = _calcImporto(fattura);
    var nc = Number(fattura && fattura.ncTotaleImporto) || 0;
    return imp - nc;
  }

  function getByMonth(profile, year, month) {
    return all(profile).filter(function (f) {
      if (f.stato === 'bozza') return false;
      return Number(f.pagAnno) === Number(year) && Number(f.pagMese) === Number(month);
    });
  }

  function getByIssuedMonth(profile, year, month) {
    return all(profile).filter(function (f) {
      if (f.stato === 'bozza') return false;
      return Number(f.issuedYear) === Number(year) && Number(f.issuedMonth) === Number(month);
    });
  }

  function getByQuarter(profile, year, quarter) {
    var months = [quarter * 3 - 2, quarter * 3 - 1, quarter * 3];
    return all(profile).filter(function (f) {
      if (f.stato === 'bozza') return false;
      if (Number(f.pagAnno) !== Number(year)) return false;
      return months.indexOf(Number(f.pagMese)) !== -1;
    });
  }

  function getByPagAnno(profile, year) {
    return all(profile).filter(function (f) {
      if (f.stato === 'bozza') return false;
      return Number(f.pagAnno) === Number(year);
    });
  }

  function getCrossYearPaidIn(profile, year) {
    return all(profile).filter(function (f) {
      if (f.stato === 'bozza') return false;
      if (Number(f.pagAnno) !== Number(year)) return false;
      var dataAnno = Number(String(f.data || '').slice(0, 4));
      return dataAnno && dataAnno < Number(year);
    });
  }

  window.FattureSelectors = {
    all: all,
    storageKey: storageKey,
    getImportoSigned: getImportoSigned,
    getNettoEffettivo: getNettoEffettivo,
    getByMonth: getByMonth,
    getByIssuedMonth: getByIssuedMonth,
    getByQuarter: getByQuarter,
    getByPagAnno: getByPagAnno,
    getCrossYearPaidIn: getCrossYearPaidIn
  };
})();
