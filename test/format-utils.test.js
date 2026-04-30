'use strict';
var FU = require('../format-utils.js');

describe('FormatUtils.formatEur', function () {
  test('1234.56 → "1.234,56 €"', function () {
    expect(FU.formatEur(1234.56)).toBe('1.234,56 €');
  });
  test('0 → "0,00 €"', function () { expect(FU.formatEur(0)).toBe('0,00 €'); });
  test('NaN → "0,00 €"', function () { expect(FU.formatEur(NaN)).toBe('0,00 €'); });
  test('null → "0,00 €"', function () { expect(FU.formatEur(null)).toBe('0,00 €'); });
  test('stringa numerica → numero', function () {
    expect(FU.formatEur('1234.56')).toBe('1.234,56 €');
  });
  test('numero negativo', function () {
    expect(FU.formatEur(-100.5)).toBe('-100,50 €');
  });
});

describe('FormatUtils.formatEurOrDash', function () {
  test('numero valido → euro', function () {
    expect(FU.formatEurOrDash(100)).toBe('100,00 €');
  });
  test('null → "—"', function () { expect(FU.formatEurOrDash(null)).toBe('—'); });
  test('undefined → "—"', function () { expect(FU.formatEurOrDash(undefined)).toBe('—'); });
  test('NaN → "—"', function () { expect(FU.formatEurOrDash(NaN)).toBe('—'); });
  test('Infinity → "—"', function () { expect(FU.formatEurOrDash(Infinity)).toBe('—'); });
  test('0 → "0,00 €"', function () { expect(FU.formatEurOrDash(0)).toBe('0,00 €'); });
});

describe('FormatUtils.formatPdfMoney', function () {
  test('1234.56 → "EUR 1.234,56"', function () {
    expect(FU.formatPdfMoney(1234.56)).toBe('EUR 1.234,56');
  });
  test('0 → "EUR 0,00"', function () { expect(FU.formatPdfMoney(0)).toBe('EUR 0,00'); });
  test('NaN → "EUR 0,00"', function () { expect(FU.formatPdfMoney(NaN)).toBe('EUR 0,00'); });
});

describe('FormatUtils.formatPct', function () {
  test('0.156 → "15,6%"', function () { expect(FU.formatPct(0.156)).toBe('15,6%'); });
  test('0 → "0,0%"', function () { expect(FU.formatPct(0)).toBe('0,0%'); });
  test('1 → "100,0%"', function () { expect(FU.formatPct(1)).toBe('100,0%'); });
  test('NaN → "0,0%"', function () { expect(FU.formatPct(NaN)).toBe('0,0%'); });
});
