// date-utils.js — Date helpers TZ-safe + festività italiane + rolling lavorativo
// Pattern UMD: utilizzabile sia in Node (require) sia in browser (window.DateUtils)
// Risolve DUP-6 (timezone bug) consolidando todayIso + helper di parsing date.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DateUtils = factory();
    if (typeof window !== 'undefined') window.DateUtils = root.DateUtils;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Festività nazionali italiane fisse [mese, giorno]
  var HOLIDAYS = [
    [1, 1],   // Capodanno
    [1, 6],   // Epifania
    [4, 25],  // Liberazione
    [5, 1],   // Festa del Lavoro
    [6, 2],   // Festa della Repubblica
    [8, 15],  // Ferragosto
    [11, 1],  // Tutti i Santi
    [12, 8],  // Immacolata
    [12, 25], // Natale
    [12, 26]  // Santo Stefano
  ];

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function todayIso() {
    var d = new Date();
    var tzOffset = d.getTimezoneOffset() * 60 * 1000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
  }

  function parseIsoDate(value) {
    if (!value || typeof value !== 'string') return null;
    var m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var year = parseInt(m[1], 10);
    var month = parseInt(m[2], 10);
    var day = parseInt(m[3], 10);
    var dt = new Date(year, month - 1, day);
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
    return { year: year, month: month, day: day };
  }

  // Alias per compat con codice esistente che usa il nome `parseDateParts`
  var parseDateParts = parseIsoDate;

  function addDaysIso(dateIso, days) {
    var parts = parseIsoDate(dateIso);
    if (!parts) return null;
    var d = new Date(parts.year, parts.month - 1, parts.day);
    d.setDate(d.getDate() + (parseInt(days, 10) || 0));
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // Algoritmo Anonymous Gregorian (Meeus/Jones/Butcher)
  function getEaster(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return [month, day];
  }

  function isHoliday(year, month, day) {
    for (var i = 0; i < HOLIDAYS.length; i++) {
      if (HOLIDAYS[i][0] === month && HOLIDAYS[i][1] === day) return true;
    }
    var easter = getEaster(year);
    if (month === easter[0] && day === easter[1]) return true;
    var pasquetta = new Date(year, easter[0] - 1, easter[1]);
    pasquetta.setDate(pasquetta.getDate() + 1);
    if (month === pasquetta.getMonth() + 1 && day === pasquetta.getDate()) return true;
    return false;
  }

  // Slittamento al primo giorno lavorativo successivo (DPR 558/1999 art. 1)
  // Ritorna shape minimale {year, month, day}: i consumer che vogliono
  // anche `date`/`iso`/`label` arricchiscono in loco.
  function buildRolledDueDate(year, month, day) {
    var d = new Date(year, month - 1, day);
    while (d.getDay() === 0 || d.getDay() === 6
        || isHoliday(d.getFullYear(), d.getMonth() + 1, d.getDate())) {
      d.setDate(d.getDate() + 1);
    }
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }

  return {
    todayIso: todayIso,
    pad2: pad2,
    parseIsoDate: parseIsoDate,
    parseDateParts: parseDateParts,
    addDaysIso: addDaysIso,
    getEaster: getEaster,
    isHoliday: isHoliday,
    buildRolledDueDate: buildRolledDueDate
  };
}));
