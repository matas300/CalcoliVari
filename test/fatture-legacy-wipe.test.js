'use strict';
const { describe, test, expect } = global;
const path = require('path');

function loadEnsureDataShape() {
  global.window = global.window || {};
  global.localStorage = global.localStorage || {
    _s: {},
    getItem(k) { return this._s[k] != null ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
    clear() { this._s = {}; }
  };
  global.currentProfile = 'Demo';
  global.currentYear = 2026;
  global.data = {};
  global.StorageKeys = global.StorageKeys || {
    yearData: (p, y) => `calcoliPIVA_${p}_${y}`,
    profileFiscalLegacy: (p) => `calcoliPIVA_${p}_profileFiscal`,
    profileFiscalMigrated: (p) => `calcoliPIVA_${p}_profileFiscalMigrated`,
    fattureEmesse: (p) => `calcoliPIVA_${p}_fattureEmesse`,
  };
  global.OFFICIAL_ARTCOM_INPS = global.OFFICIAL_ARTCOM_INPS || {
    2026: { artigiano: { contribFissi: 4500, minimaleInps: 18000, aliqContributi: 0.24 }, commerciante: {} }
  };
  delete require.cache[require.resolve(path.join(process.cwd(), 'app-storage.js'))];
  require(path.join(process.cwd(), 'app-storage.js'));
  return global.window.ensureDataShape || global.ensureDataShape;
}

describe('Wipe legacy data.fatture[m]', () => {
  test('Wipe quando data.fatture ha entries non vuote', () => {
    const ensureDataShape = loadEnsureDataShape();
    const target = {
      fatture: {
        3: [{ importo: 5000, desc: 'incasso marzo', pagMese: 3, pagAnno: 2026 }],
        7: [{ importo: 3000, desc: 'altro', pagMese: 7, pagAnno: 2026 }]
      }
    };
    const out = ensureDataShape(target, 2026);
    expect(out.fatture).toEqual({});
    expect(typeof out._fattureManualeWiped).toBe('string');
    expect(out._fattureManualeWipedBackup).toBeTruthy();
    expect(out._fattureManualeWipedBackup[3][0].importo).toBe(5000);
  });

  test('Idempotente: seconda chiamata non altera nulla', () => {
    const ensureDataShape = loadEnsureDataShape();
    const target = { fatture: { 1: [{ importo: 100 }] } };
    const out1 = ensureDataShape(target, 2026);
    const wipeAt = out1._fattureManualeWiped;
    const backup = out1._fattureManualeWipedBackup;
    const out2 = ensureDataShape(out1, 2026);
    expect(out2._fattureManualeWiped).toBe(wipeAt);
    expect(out2._fattureManualeWipedBackup).toBe(backup);
    expect(out2.fatture).toEqual({});
  });

  test('No wipe se data.fatture e vuoto', () => {
    const ensureDataShape = loadEnsureDataShape();
    const target = { fatture: {} };
    const out = ensureDataShape(target, 2026);
    expect(out._fattureManualeWiped).toBeFalsy();
    expect(out._fattureManualeWipedBackup).toBeFalsy();
  });
});
