'use strict';
// test/fatture-storico-display-numero.test.js — verifica che fatture con
// progressivo: 0 (legacy-migrated) NON vengano mostrate come "YYYY/001" nello
// storico. Bug: Number(0) || 1 collassa a 1 in formatNumero.
if (!global.window) global.window = global;
delete require.cache[require.resolve('../fatture-storico.js')];
require('../fatture-storico.js');

describe('FattureStorico — resolveDisplayNumero', function () {
  test('progressivo > 0 → format "YYYY/NNN"', function () {
    var inv = { annoProgressivo: 2026, progressivo: 5, numero: '2026/005' };
    expect(window.FattureStorico.resolveDisplayNumero(inv)).toBe('2026/005');
  });

  test('progressivo === 0 → fallback a inv.numero (em-dash)', function () {
    var inv = { annoProgressivo: 2026, progressivo: 0, numero: '—' };
    expect(window.FattureStorico.resolveDisplayNumero(inv)).toBe('—');
  });

  test('progressivo === 0 e numero mancante → "—" placeholder', function () {
    var inv = { annoProgressivo: 2026, progressivo: 0 };
    expect(window.FattureStorico.resolveDisplayNumero(inv)).toBe('—');
  });

  test('progressivo null/undefined → fallback', function () {
    var inv = { annoProgressivo: 2026, progressivo: null, numero: '—' };
    expect(window.FattureStorico.resolveDisplayNumero(inv)).toBe('—');
  });

  test('inv senza annoProgressivo + progressivo > 0 → usa anno corrente', function () {
    var inv = { progressivo: 3 };
    var current = new Date().getFullYear();
    expect(window.FattureStorico.resolveDisplayNumero(inv)).toBe(current + '/003');
  });

  test('progressivo grande (1000+) NON tronca', function () {
    var inv = { annoProgressivo: 2026, progressivo: 1234 };
    expect(window.FattureStorico.resolveDisplayNumero(inv)).toBe('2026/1234');
  });
});
