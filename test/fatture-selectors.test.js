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

describe('FattureSelectors.getImportoSigned — segno per NC', function () {
  test('TD01 ritorna importo positivo', function () {
    var f = { tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 100 }] };
    expect(Sel.getImportoSigned(f)).toBe(100);
  });
  test('TD04 ritorna importo negativo', function () {
    var f = { tipoDocumento: 'TD04', righe: [{ quantita: 1, prezzoUnitario: 50 }] };
    expect(Sel.getImportoSigned(f)).toBe(-50);
  });
});

describe('FattureSelectors.getNettoEffettivo — importo meno NC collegate', function () {
  test('fattura senza NC ritorna importo pieno', function () {
    var f = { tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 200 }], ncTotaleImporto: 0 };
    expect(Sel.getNettoEffettivo(f)).toBe(200);
  });
  test('fattura con NC parziale sottrae ncTotaleImporto', function () {
    var f = { tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 200 }], ncTotaleImporto: 80 };
    expect(Sel.getNettoEffettivo(f)).toBe(120);
  });
});

describe('FattureSelectors.getByMonth — fatture con pagamento nel mese, escluse bozze', function () {
  test('esclude bozze', function () {
    reset();
    seed('Mattia', [
      { id: 'a', stato: 'bozza', pagAnno: 2026, pagMese: 3, tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 100 }] },
      { id: 'b', stato: 'inviata', pagAnno: 2026, pagMese: 3, tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 200 }] }
    ]);
    var res = Sel.getByMonth('Mattia', 2026, 3);
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('b');
  });

  test('include NC (TD04) nel mese', function () {
    reset();
    seed('Mattia', [
      { id: 'orig', stato: 'inviata', pagAnno: 2026, pagMese: 3, tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 200 }] },
      { id: 'nc', stato: 'inviata', pagAnno: 2026, pagMese: 3, tipoDocumento: 'TD04', righe: [{ quantita: 1, prezzoUnitario: 80 }] }
    ]);
    var res = Sel.getByMonth('Mattia', 2026, 3);
    expect(res.length).toBe(2);
  });

  test('filtra per pagAnno+pagMese, non per data emissione', function () {
    reset();
    seed('Mattia', [
      { id: 'a', stato: 'pagata', data: '2025-12-20', pagAnno: 2026, pagMese: 1, tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 300 }] }
    ]);
    expect(Sel.getByMonth('Mattia', 2026, 1).length).toBe(1);
    expect(Sel.getByMonth('Mattia', 2025, 12).length).toBe(0);
  });
});

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
