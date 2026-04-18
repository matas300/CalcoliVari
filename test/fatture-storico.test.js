'use strict';

// ─── Stub globals BEFORE requiring the IIFE module ───────────────────────────

var storage = {};
global.localStorage = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.sessionStorage = global.localStorage;
global.window = global;
global.document = { getElementById: function() { return null; } };

require('../fatture-storico.js');
var FS = global.window.FattureStorico;

function reset() { for (var k in storage) delete storage[k]; }

// ─── formatNumero ─────────────────────────────────────────────────────────────

describe('FattureStorico.formatNumero — zero-padding e formato', function () {
  test('progressivo 1 → zero-paddato a 3 cifre (2026/001)', function () {
    expect(FS.formatNumero(2026, 1)).toBe('2026/001');
  });

  test('progressivo 42 → zero-paddato a 3 cifre (2026/042)', function () {
    expect(FS.formatNumero(2026, 42)).toBe('2026/042');
  });

  test('progressivo 999 → 3 cifre esatte (2026/999)', function () {
    expect(FS.formatNumero(2026, 999)).toBe('2026/999');
  });

  test('progressivo > 999 NON troncato (2026/1000)', function () {
    expect(FS.formatNumero(2026, 1000)).toBe('2026/1000');
  });

  test('progressivo null → default 1 (2026/001)', function () {
    expect(FS.formatNumero(2026, null)).toBe('2026/001');
  });

  test('progressivo undefined → default 1 (2026/001)', function () {
    expect(FS.formatNumero(2026, undefined)).toBe('2026/001');
  });

  test('anno nullish → usa anno corrente', function () {
    var currentYear = new Date().getFullYear();
    var result = FS.formatNumero(null, 1);
    expect(result).toBe(currentYear + '/001');
  });

  test('formato generale: inizia con anno + "/" + parte numerica', function () {
    var result = FS.formatNumero(2025, 7);
    expect(result).toBe('2025/007');
  });
});

// ─── nextProgressivo ─────────────────────────────────────────────────────────

describe('FattureStorico.nextProgressivo — calcolo prossimo numero', function () {
  test('array vuoto → 1', function () {
    expect(FS.nextProgressivo(2026, [])).toBe(1);
  });

  test('null al posto di array → 1 (fallback)', function () {
    expect(FS.nextProgressivo(2026, null)).toBe(1);
  });

  test('anno con una fattura progressivo 5 → 6', function () {
    var fatture = [{ annoProgressivo: 2026, progressivo: 5 }];
    expect(FS.nextProgressivo(2026, fatture)).toBe(6);
  });

  test('anno con più fatture → max(progressivo) + 1', function () {
    var fatture = [
      { annoProgressivo: 2026, progressivo: 3 },
      { annoProgressivo: 2026, progressivo: 7 },
      { annoProgressivo: 2026, progressivo: 1 }
    ];
    expect(FS.nextProgressivo(2026, fatture)).toBe(8);
  });

  test('fatture di anni diversi → considera solo l\'anno richiesto', function () {
    var fatture = [
      { annoProgressivo: 2025, progressivo: 99 },
      { annoProgressivo: 2026, progressivo: 2 }
    ];
    expect(FS.nextProgressivo(2026, fatture)).toBe(3);
  });

  test('fatture senza annoProgressivo → ignorate', function () {
    var fatture = [
      { progressivo: 50 },                       // nessun annoProgressivo
      { annoProgressivo: 2026, progressivo: 3 }
    ];
    expect(FS.nextProgressivo(2026, fatture)).toBe(4);
  });

  test('fatture con progressivo non numerico → trattato come 0', function () {
    var fatture = [
      { annoProgressivo: 2026, progressivo: 'abc' },
      { annoProgressivo: 2026, progressivo: 4 }
    ];
    expect(FS.nextProgressivo(2026, fatture)).toBe(5);
  });
});

// ─── storageKey ──────────────────────────────────────────────────────────────

describe('FattureStorico.storageKey — formato e validazione', function () {
  test('formato corretto per profilo "Mattia"', function () {
    expect(FS.storageKey('Mattia')).toBe('calcoliPIVA_Mattia_fattureEmesse');
  });

  test('formato corretto per profilo "Demo"', function () {
    expect(FS.storageKey('Demo')).toBe('calcoliPIVA_Demo_fattureEmesse');
  });

  test('throw se profile è stringa vuota', function () {
    var threw = false;
    try { FS.storageKey(''); } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });

  test('throw se profile è null', function () {
    var threw = false;
    try { FS.storageKey(null); } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });

  test('throw se profile è undefined', function () {
    var threw = false;
    try { FS.storageKey(undefined); } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });
});

// ─── load / save round-trip ──────────────────────────────────────────────────

describe('FattureStorico.load/save — round-trip e edge cases', function () {
  var PROFILE = 'TestProfile';

  // Pulisce storage prima di ogni test
  test('load su profilo nuovo (storage vuoto) → []', function () {
    reset();
    var result = FS.load(PROFILE);
    expect(result).toEqual([]);
  });

  test('save poi load → stesse fatture', function () {
    reset();
    var fatture = [
      { id: 'fat_001', numero: '2026/001', annoProgressivo: 2026, progressivo: 1, stato: 'bozza' },
      { id: 'fat_002', numero: '2026/002', annoProgressivo: 2026, progressivo: 2, stato: 'inviata' }
    ];
    FS.save(PROFILE, fatture);
    var loaded = FS.load(PROFILE);
    expect(loaded.length).toBe(2);
    expect(loaded[0].id).toBe('fat_001');
    expect(loaded[1].id).toBe('fat_002');
  });

  test('save poi load: i campi base sono preservati', function () {
    reset();
    var fatture = [{ id: 'fat_x', numero: '2026/005', stato: 'pagata', annoProgressivo: 2026, progressivo: 5 }];
    FS.save(PROFILE, fatture);
    var loaded = FS.load(PROFILE);
    expect(loaded[0].numero).toBe('2026/005');
    expect(loaded[0].stato).toBe('pagata');
    expect(loaded[0].progressivo).toBe(5);
  });

  test('save array vuoto poi load → []', function () {
    reset();
    FS.save(PROFILE, []);
    var loaded = FS.load(PROFILE);
    expect(loaded).toEqual([]);
  });

  test('save con array non-array → throw', function () {
    reset();
    var threw = false;
    try { FS.save(PROFILE, { not: 'array' }); } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });

  test('load con JSON malformato in storage → [] (fallback silenzioso)', function () {
    reset();
    storage[FS.storageKey(PROFILE)] = '{invalid json{{';
    var result = FS.load(PROFILE);
    expect(result).toEqual([]);
  });

  test('load con valore non-array in storage → []', function () {
    reset();
    storage[FS.storageKey(PROFILE)] = JSON.stringify({ not: 'array' });
    var result = FS.load(PROFILE);
    expect(result).toEqual([]);
  });

  test('load applica normalizeInvoice se window.normalizeInvoice disponibile', function () {
    reset();
    // Installa normalizzatore che aggiunge campo _normalizzato=true
    var origNorm = global.window.normalizeInvoice;
    global.window.normalizeInvoice = function(inv) { return Object.assign({}, inv, { _normalizzato: true }); };
    var fatture = [{ id: 'fat_norm', annoProgressivo: 2026, progressivo: 1 }];
    FS.save(PROFILE, fatture);
    var loaded = FS.load(PROFILE);
    expect(loaded[0]._normalizzato).toBe(true);
    // Ripristina
    if (origNorm !== undefined) global.window.normalizeInvoice = origNorm;
    else delete global.window.normalizeInvoice;
  });

  test('load senza normalizeInvoice non crasha (identity fallback)', function () {
    reset();
    var origNorm = global.window.normalizeInvoice;
    delete global.window.normalizeInvoice;
    var fatture = [{ id: 'fat_bare', annoProgressivo: 2026, progressivo: 1 }];
    FS.save(PROFILE, fatture);
    var loaded = FS.load(PROFILE);
    expect(loaded[0].id).toBe('fat_bare');
    // Ripristina se era definito
    if (origNorm !== undefined) global.window.normalizeInvoice = origNorm;
  });
});
