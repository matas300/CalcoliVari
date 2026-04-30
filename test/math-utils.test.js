'use strict';
var MU = require('../math-utils.js');

describe('MathUtils.toNumber', function () {
  test('numero valido → identità', function () { expect(MU.toNumber(42)).toBe(42); });
  test('stringa numerica → numero', function () { expect(MU.toNumber('3.14')).toBe(3.14); });
  test('NaN → 0', function () { expect(MU.toNumber(NaN)).toBe(0); });
  test('undefined → 0', function () { expect(MU.toNumber(undefined)).toBe(0); });
  test('null → 0', function () { expect(MU.toNumber(null)).toBe(0); });
  test('Infinity → 0', function () { expect(MU.toNumber(Infinity)).toBe(0); });
  test('stringa non numerica → 0', function () { expect(MU.toNumber('abc')).toBe(0); });
  test('zero → 0', function () { expect(MU.toNumber(0)).toBe(0); });
});

describe('MathUtils.ceil2', function () {
  test('1.234 → 1.24', function () { expect(MU.ceil2(1.234)).toBe(1.24); });
  test('1.231 → 1.24', function () { expect(MU.ceil2(1.231)).toBe(1.24); });
  test('1.230 → 1.23', function () { expect(MU.ceil2(1.230)).toBe(1.23); });
  test('0 → 0', function () { expect(MU.ceil2(0)).toBe(0); });
  test('NaN → 0', function () { expect(MU.ceil2(NaN)).toBe(0); });
  test('undefined → 0', function () { expect(MU.ceil2(undefined)).toBe(0); });
  test('-1.234 → -1.23', function () { expect(MU.ceil2(-1.234)).toBe(-1.23); });
});

describe('MathUtils.round2', function () {
  test('1.234 → 1.23 (round half-up)', function () { expect(MU.round2(1.234)).toBe(1.23); });
  test('1.235 → 1.24', function () { expect(MU.round2(1.235)).toBe(1.24); });
  test('1.230 → 1.23', function () { expect(MU.round2(1.230)).toBe(1.23); });
  test('0 → 0', function () { expect(MU.round2(0)).toBe(0); });
  test('NaN → 0', function () { expect(MU.round2(NaN)).toBe(0); });
});

describe('MathUtils.euroToCents / centsToEuro', function () {
  test('roundtrip 12.34 EUR', function () {
    expect(MU.centsToEuro(MU.euroToCents(12.34))).toBe(12.34);
  });
  test('roundtrip 1000.00 EUR', function () {
    expect(MU.centsToEuro(MU.euroToCents(1000.00))).toBe(1000.00);
  });
  test('euroToCents(0) → 0', function () { expect(MU.euroToCents(0)).toBe(0); });
  test('euroToCents(NaN) → 0', function () { expect(MU.euroToCents(NaN)).toBe(0); });
  test('euroToCents(-5) → 0 (clamp negativi)', function () { expect(MU.euroToCents(-5)).toBe(0); });
  test('centsToEuro(123) → 1.23', function () { expect(MU.centsToEuro(123)).toBe(1.23); });
});

describe('MathUtils.splitAmountByWeights', function () {
  test('100 con [40,60] → [40, 60]', function () {
    expect(MU.splitAmountByWeights(100, [40, 60])).toEqual([40, 60]);
  });
  test('100 con [1,1,1,1] → [25,25,25,25]', function () {
    expect(MU.splitAmountByWeights(100, [1, 1, 1, 1])).toEqual([25, 25, 25, 25]);
  });
  test('0 con [40,60] → [0, 0]', function () {
    expect(MU.splitAmountByWeights(0, [40, 60])).toEqual([0, 0]);
  });
  test('weights array vuoto → []', function () {
    expect(MU.splitAmountByWeights(100, [])).toEqual([]);
  });
  test('totale dei pezzi = importo (no perdite per arrotondamento)', function () {
    var pieces = MU.splitAmountByWeights(257.52, [40, 60]);
    var sum = pieces.reduce(function (s, p) { return s + p; }, 0);
    expect(Math.abs(sum - 257.52) < 0.01).toBe(true);
  });
});
