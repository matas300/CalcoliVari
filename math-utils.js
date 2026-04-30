// math-utils.js — Aritmetica condivisa (DRY: consolidamento di 4 copie ceil2 + 2 toNumber)
// Pattern UMD: utilizzabile sia in Node (require) sia in browser (window.MathUtils)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MathUtils = factory();
    if (typeof window !== 'undefined') window.MathUtils = root.MathUtils;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function toNumber(value) {
    if (value === null || value === undefined) return 0;
    var n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  function ceil2(value) {
    var n = toNumber(value);
    if (!n) return 0;
    return Math.ceil(n * 100 - Number.EPSILON) / 100;
  }

  function round2(value) {
    var n = toNumber(value);
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function euroToCents(amount) {
    return Math.max(Math.round(toNumber(amount) * 100), 0);
  }

  function centsToEuro(cents) {
    return toNumber(cents) / 100;
  }

  function splitAmountByWeights(amount, weights) {
    if (!Array.isArray(weights) || weights.length === 0) return [];
    var totalCents = euroToCents(amount);
    var totalWeight = weights.reduce(function (s, w) { return s + (toNumber(w) || 0); }, 0) || 1;
    var assigned = 0;
    return weights.map(function (w, i) {
      if (i === weights.length - 1) {
        return centsToEuro(totalCents - assigned);
      }
      var share = Math.floor(totalCents * (toNumber(w) || 0) / totalWeight);
      assigned += share;
      return centsToEuro(share);
    });
  }

  return {
    toNumber: toNumber,
    ceil2: ceil2,
    round2: round2,
    euroToCents: euroToCents,
    centsToEuro: centsToEuro,
    splitAmountByWeights: splitAmountByWeights
  };
}));
