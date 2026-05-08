'use strict';
const { describe, test, expect } = global;
const path = require('path');

function loadAppStorage() {
  global.window = global.window || {};
  // Force fresh shim (other tests may have set a partial one without clear())
  global.localStorage = {
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
    clienti: (p) => `calcoliPIVA_${p}_clienti`,
  };
  global.OFFICIAL_ARTCOM_INPS = global.OFFICIAL_ARTCOM_INPS || {
    2026: { artigiano: { contribFissi: 4500, minimaleInps: 18000, aliqContributi: 0.24 }, commerciante: {} }
  };
  delete require.cache[require.resolve(path.join(process.cwd(), 'app-storage.js'))];
  require(path.join(process.cwd(), 'app-storage.js'));
  return {
    get: global.window.getClienteDefaultId,
    set: global.window.setClienteDefaultId,
    toggle: global.window.toggleClienteDefault,
  };
}

describe('cliente default id', () => {
  test('Default vuoto se non settato', () => {
    const api = loadAppStorage();
    expect(api.get()).toBe('');
  });

  test('set + get round-trip', () => {
    const api = loadAppStorage();
    api.set('cli_abc');
    expect(api.get()).toBe('cli_abc');
  });

  test('set vuoto rimuove la chiave', () => {
    const api = loadAppStorage();
    api.set('cli_xyz');
    expect(api.get()).toBe('cli_xyz');
    api.set('');
    expect(api.get()).toBe('');
  });

  test('toggle: imposta se vuoto, rimuove se uguale', () => {
    const api = loadAppStorage();
    api.toggle('cli_a');
    expect(api.get()).toBe('cli_a');
    api.toggle('cli_a');
    expect(api.get()).toBe('');
  });

  test('toggle: cambia se diverso (un solo default)', () => {
    const api = loadAppStorage();
    api.set('cli_a');
    api.toggle('cli_b');
    expect(api.get()).toBe('cli_b');
  });
});
