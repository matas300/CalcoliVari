'use strict';

var storage = {};
global.localStorage = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global;
global.document = { getElementById: function() { return null; } };

// normalize stub (the real one lives in fatture-docs-feature.js; tests don't need it)
global.window.normalizeInvoice = function (x) { return x; };

require('../fatture-storico.js');  // needed for storage key helpers
require('../fatture-selectors.js');
var Sel = global.window.FattureSelectors;

function reset() { for (var k in storage) delete storage[k]; }
function seed(profile, arr) {
  storage['calcoliPIVA_' + profile + '_fattureEmesse'] = JSON.stringify(arr);
}

describe('FattureSelectors.all — carica fatture per profilo', function () {
  test('ritorna array vuoto se nessun dato', function () {
    reset();
    expect(Sel.all('Mattia')).toEqual([]);
  });

  test('ritorna tutte le fatture del profilo', function () {
    reset();
    seed('Mattia', [
      { id: 'a', stato: 'pagata', pagAnno: 2026, pagMese: 3 },
      { id: 'b', stato: 'bozza' }
    ]);
    var res = Sel.all('Mattia');
    expect(res.length).toBe(2);
  });
});
