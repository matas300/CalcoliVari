'use strict';
const { describe, test, expect } = global;
const path = require('path');

function loadAppStorage() {
  global.window = global.window || {};
  global.localStorage = global.localStorage || {
    _s: {},
    getItem(k) { return this._s[k] != null ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
    clear() { this._s = {}; },
    get length() { return Object.keys(this._s).length; },
    key(i) { return Object.keys(this._s)[i]; }
  };
  global.currentProfile = 'Demo';
  global.currentYear = 2026;
  global.data = {};
  global.StorageKeys = global.StorageKeys || {
    yearData: (p, y) => `calcoliPIVA_${p}_${y}`,
    profileFiscalLegacy: (p) => `calcoliPIVA_${p}_profileFiscal`,
    profileFiscalMigrated: (p) => `calcoliPIVA_${p}_profileFiscalMigrated`,
    fattureEmesse: (p) => `calcoliPIVA_${p}_fattureEmesse`,
    profilePrefix: (p) => `calcoliPIVA_${p}_`,
  };
  global.OFFICIAL_ARTCOM_INPS = global.OFFICIAL_ARTCOM_INPS || {
    2026: { artigiano: { contribFissi: 4500, minimaleInps: 18000, aliqContributi: 0.24 }, commerciante: {} }
  };
  delete require.cache[require.resolve(path.join(process.cwd(), 'app-storage.js'))];
  require(path.join(process.cwd(), 'app-storage.js'));
  return global.window.normalizeCliente || global.normalizeCliente;
}

describe('cliente.descrizioneStandard', () => {
  test('Default vuoto se non specificato', () => {
    const norm = loadAppStorage();
    const c = norm({ nome: 'Foo' }, 'c1');
    expect(c.descrizioneStandard).toBe('');
  });

  test('Preserva valore se passato', () => {
    const norm = loadAppStorage();
    const c = norm({ nome: 'Foo', descrizioneStandard: 'Consulenza mensile' }, 'c2');
    expect(c.descrizioneStandard).toBe('Consulenza mensile');
  });

  test('Trim whitespace', () => {
    const norm = loadAppStorage();
    const c = norm({ nome: 'Foo', descrizioneStandard: '  Servizio   ' }, 'c3');
    expect(c.descrizioneStandard).toBe('Servizio');
  });

  test('Note resta indipendente da descrizioneStandard', () => {
    const norm = loadAppStorage();
    const c = norm({ nome: 'Foo', descrizioneStandard: 'X', note: 'Y' }, 'c4');
    expect(c.descrizioneStandard).toBe('X');
    expect(c.note).toBe('Y');
  });
});
