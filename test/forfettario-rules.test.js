'use strict';
var FR = require('../forfettario-rules.js');

describe('ForfettarioRules.getRiduzioneFactor', function () {
  test('artigiani_commercianti + riduzione35=1 → 0.65', function () {
    expect(FR.getRiduzioneFactor({ inpsMode: 'artigiani_commercianti', riduzione35: 1 })).toBe(0.65);
  });
  test('artcom (alias legacy) + riduzione35=1 → 0.65', function () {
    expect(FR.getRiduzioneFactor({ inpsMode: 'artcom', riduzione35: 1 })).toBe(0.65);
  });
  test('artigiani_commercianti + riduzione35=true → 0.65', function () {
    expect(FR.getRiduzioneFactor({ inpsMode: 'artigiani_commercianti', riduzione35: true })).toBe(0.65);
  });
  test('artigiani_commercianti + riduzione35=0 → 1', function () {
    expect(FR.getRiduzioneFactor({ inpsMode: 'artigiani_commercianti', riduzione35: 0 })).toBe(1);
  });
  test('gestione_separata + riduzione35=1 → 1 (riduzione NON spetta)', function () {
    expect(FR.getRiduzioneFactor({ inpsMode: 'gestione_separata', riduzione35: 1 })).toBe(1);
  });
  test('inpsMode unknown + riduzione35=1 → 1', function () {
    expect(FR.getRiduzioneFactor({ inpsMode: 'inarcassa', riduzione35: 1 })).toBe(1);
  });
  test('settings null → 1', function () { expect(FR.getRiduzioneFactor(null)).toBe(1); });
  test('settings undefined → 1', function () { expect(FR.getRiduzioneFactor(undefined)).toBe(1); });
  test('settings vuoto → 1', function () { expect(FR.getRiduzioneFactor({})).toBe(1); });
});

describe('ForfettarioRules.isBolloDovuto', function () {
  test('marcaDaBollo=true + imponibile=100 → true', function () {
    expect(FR.isBolloDovuto(100, true)).toBe(true);
  });
  test('marcaDaBollo=true + imponibile=77.47 → false (operatore strict)', function () {
    expect(FR.isBolloDovuto(77.47, true)).toBe(false);
  });
  test('marcaDaBollo=true + imponibile=77.48 → true', function () {
    expect(FR.isBolloDovuto(77.48, true)).toBe(true);
  });
  test('marcaDaBollo=false + imponibile=100 → false', function () {
    expect(FR.isBolloDovuto(100, false)).toBe(false);
  });
  test('marcaDaBollo=true + imponibile=0 → false', function () {
    expect(FR.isBolloDovuto(0, true)).toBe(false);
  });
});

describe('ForfettarioRules constants', function () {
  test('BOLLO_THRESHOLD = 77.47', function () { expect(FR.BOLLO_THRESHOLD).toBe(77.47); });
  test('ACCONTO_THRESHOLD_NONE = 51.65', function () { expect(FR.ACCONTO_THRESHOLD_NONE).toBe(51.65); });
  test('ACCONTO_THRESHOLD_SINGLE = 257.52', function () { expect(FR.ACCONTO_THRESHOLD_SINGLE).toBe(257.52); });
});
