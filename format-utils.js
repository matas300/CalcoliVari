// format-utils.js — Formatter euro/percent condivisi (DRY: consolidamento di 4+ varianti)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FormatUtils = factory();
    if (typeof window !== 'undefined') window.FormatUtils = root.FormatUtils;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function _toFiniteNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    var n = parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
  }

  // Portable it-IT formatter (fraction digits): "1.234,56".
  // Avoids Node.js full-ICU dependency (default Node build outputs "1234,56" w/o
  // grouping separator under it-IT). Browser parity guaranteed.
  function _formatItIT(n, fractionDigits) {
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n);
    var fixed = abs.toFixed(fractionDigits);
    var parts = fixed.split('.');
    var intPart = parts[0];
    var fracPart = parts[1] || '';
    // Insert '.' as thousands separator
    var withGrouping = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return sign + withGrouping + (fracPart ? ',' + fracPart : '');
  }

  function formatEur(value) {
    var n = _toFiniteNumber(value);
    if (!Number.isFinite(n)) n = 0;
    return _formatItIT(n, 2) + ' €';
  }

  function formatEurOrDash(value) {
    if (value === null || value === undefined) return '—';
    var n = _toFiniteNumber(value);
    if (!Number.isFinite(n)) return '—';
    return formatEur(n);
  }

  function formatPdfMoney(value) {
    var n = _toFiniteNumber(value);
    if (!Number.isFinite(n)) n = 0;
    return 'EUR ' + _formatItIT(n, 2);
  }

  function formatPct(value) {
    var n = _toFiniteNumber(value);
    if (!Number.isFinite(n)) n = 0;
    return _formatItIT(n * 100, 1) + '%';
  }

  return { formatEur: formatEur, formatEurOrDash: formatEurOrDash,
    formatPdfMoney: formatPdfMoney, formatPct: formatPct };
}));
