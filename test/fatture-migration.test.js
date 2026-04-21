'use strict';

var storage = {};
global.localStorage = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global;
global.document = { getElementById: function() { return null; } };
global.window.normalizeInvoice = function (x) { return x; };

require('../fatture-selectors.js');
require('../fatture-migration.js');
var Mig = global.window.FattureMigration;
var Sel = global.window.FattureSelectors;

function reset() { for (var k in storage) delete storage[k]; }

describe('FattureMigration.migrateLegacyYear', function () {
  test('promuove righe monthly senza invoiceId a fatture legacy-migrated', function () {
    reset();
    var year = 2026;
    var yearData = {
      fatture: {
        '3': [{ importo: 500, desc: 'Consulenza gennaio', pagMese: 3, pagAnno: 2026 }]
      }
    };
    var result = Mig.migrateLegacyYear('Mattia', year, yearData);
    expect(result.migrated).toBe(1);
    var fatture = Sel.all('Mattia');
    expect(fatture.length).toBe(1);
    expect(fatture[0].origine).toBe('legacy-migrated');
    expect(fatture[0].stato).toBe('pagata');
    expect(fatture[0].pagMese).toBe(3);
  });

  test('idempotente: seconda chiamata non duplica', function () {
    reset();
    var yearData = { fatture: { '3': [{ importo: 500, desc: 'x' }] } };
    Mig.migrateLegacyYear('Mattia', 2026, yearData);
    Mig.migrateLegacyYear('Mattia', 2026, yearData);
    expect(Sel.all('Mattia').length).toBe(1);
  });

  test('salta righe con invoiceId (già in fattureEmesse)', function () {
    reset();
    var yearData = {
      fatture: {
        '3': [{ importo: 500, invoiceId: 'fat_existing' }]
      }
    };
    var result = Mig.migrateLegacyYear('Mattia', 2026, yearData);
    expect(result.migrated).toBe(0);
    expect(Sel.all('Mattia').length).toBe(0);
  });

  test('salta righe con importo 0 (vuote)', function () {
    reset();
    var yearData = { fatture: { '3': [{ importo: 0, desc: '' }] } };
    var result = Mig.migrateLegacyYear('Mattia', 2026, yearData);
    expect(result.migrated).toBe(0);
  });

  test('conserva pagMese/pagAnno cross-year dalla riga originale', function () {
    reset();
    var yearData = {
      fatture: {
        '12': [{ importo: 300, desc: 'Dicembre pagata a gennaio', pagMese: 1, pagAnno: 2027 }]
      }
    };
    Mig.migrateLegacyYear('Mattia', 2026, yearData);
    var f = Sel.all('Mattia')[0];
    expect(f.pagMese).toBe(1);
    expect(f.pagAnno).toBe(2027);
  });

  test('non migra se yearData.fatture assente', function () {
    reset();
    var result = Mig.migrateLegacyYear('Mattia', 2026, { fatture: null });
    expect(result.migrated).toBe(0);
  });
});
