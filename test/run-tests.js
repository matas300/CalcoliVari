'use strict';
// Minimal test runner — no dependencies
var passed = 0, failed = 0, total = 0;

function describe(name, fn) {
  console.log('\n' + name);
  fn();
}

var asyncQueue = [];
function test(name, fn) {
  total++;
  try {
    var r = fn();
    if (r && typeof r.then === 'function') {
      // Async test: defer the pass/fail verdict until promise settles.
      total--; // will re-count when resolved
      asyncQueue.push(r.then(function () {
        total++;
        console.log('  ✓ ' + name);
        passed++;
      }, function (e) {
        total++;
        console.log('  ✗ ' + name);
        console.log('    ' + (e && e.message ? e.message : e));
        failed++;
      }));
      return;
    }
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.log('  ✗ ' + name);
    console.log('    ' + e.message);
    failed++;
  }
}

function expect(val) {
  return {
    toBe: function(expected) {
      if (val !== expected) throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(val));
    },
    toEqual: function(expected) {
      var a = JSON.stringify(val), b = JSON.stringify(expected);
      if (a !== b) throw new Error('Expected ' + b + ' but got ' + a);
    },
    toMatch: function(pattern) {
      if (!pattern.test(val)) throw new Error('Expected ' + JSON.stringify(val) + ' to match ' + pattern);
    },
    toBeTruthy: function() {
      if (!val) throw new Error('Expected truthy but got ' + JSON.stringify(val));
    },
    toBeFalsy: function() {
      if (val) throw new Error('Expected falsy but got ' + JSON.stringify(val));
    },
    toBeGreaterThan: function(n) {
      if (!(val > n)) throw new Error('Expected ' + val + ' > ' + n);
    },
    toBeLessThan: function(n) {
      if (!(val < n)) throw new Error('Expected ' + val + ' < ' + n);
    }
  };
}

global.describe = describe;
global.test = test;
global.expect = expect;

// Load test files
require('./dichiarazione-engine.test.js');
require('./dichiarazione-quadro-lm-completo.test.js');
require('./dichiarazione-quadro-rr-completo.test.js');
require('./tax-engine.test.js');
require('./fatture-storico.test.js');
require('./fatture-selectors.test.js');
require('./fatture-normalize.test.js');
require('./fatture-migration.test.js');
require('./fatture-hard-delete.test.js');
require('./fatture-legacy-badge.test.js');
require('./clienti-autofill.test.js');
require('./fatture-import-xml.test.js');
require('./fatture-import-nuove.test.js');
require('./fatture-import-legacy.test.js');
require('./fatture-nc-sync.test.js');
require('./fatture-xml-anagrafica.test.js');
require('./fatture-xml-natura.test.js');
require('./fatture-xml-element-order.test.js');
require('./fatture-xml-progressivo.test.js');
require('./fatture-xml-nc-date.test.js');
require('./dichiarazione-lm3-per-cassa.test.js');
require('./scadenziario-saldo-acconti-pagati.test.js');
require('./dichiarazione-startup-aliquota.test.js');
require('./dichiarazione-rw-soglie.test.js');
require('./dichiarazione-rw-cripto.test.js');
require('./dichiarazione-rw-cripto-export.test.js');
require('./dichiarazione-perdite-scadenza.test.js');
require('./dichiarazione-limite-forfettario.test.js');
require('./scadenziario-nota-saldo-contrib-n1.test.js');
require('./dichiarazione-rs-disclaimer.test.js');
require('./fatture-ritenuta-forfettario.test.js');
require('./fatture-ritenuta-forfettario-cleanup.test.js');
require('./fatture-bollo-addebitato-xml.test.js');
require('./fatture-cliente-pa.test.js');
require('./fatture-pdf-regime-fallback.test.js');
require('./dichiarazione-quadro-rr-aliquota-gs.test.js');
require('./fatture-cliente-anagrafica-validate.test.js');
require('./fatture-xml-cliente-ue.test.js');
require('./dichiarazione-cassa-non-gestita.test.js');

Promise.all(asyncQueue).then(function () {
  console.log('\n' + passed + '/' + total + ' tests passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
});
