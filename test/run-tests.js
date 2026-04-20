'use strict';
// Minimal test runner — no dependencies
var passed = 0, failed = 0, total = 0;

function describe(name, fn) {
  console.log('\n' + name);
  fn();
}

function test(name, fn) {
  total++;
  try {
    fn();
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
require('./tax-engine.test.js');
require('./fatture-storico.test.js');
require('./fatture-selectors.test.js');
require('./fatture-normalize.test.js');
require('./fatture-migration.test.js');
require('./fatture-hard-delete.test.js');
require('./fatture-legacy-badge.test.js');
require('./fatture-ocr-stub.test.js');
require('./clienti-autofill.test.js');

console.log('\n' + passed + '/' + total + ' tests passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
