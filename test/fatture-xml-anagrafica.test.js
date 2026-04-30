'use strict';
var storage = {};
global.localStorage = global.localStorage || {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global.window || global;
global.document = global.document || { getElementById: function() { return null; } };
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
require('../fatture-docs-feature.js');

var buildAnagrafica = global.__buildAnagraficaXml;
if (!buildAnagrafica) throw new Error('__buildAnagraficaXml not exposed');

describe('buildAnagraficaXml — classificazione PF/PG', function () {
  test('cliente con P.IVA IT 11 cifre → Denominazione', function () {
    var xml = buildAnagrafica({ nome: 'Acme Srl', partitaIva: '12345678903' });
    expect(/<Denominazione>Acme Srl<\/Denominazione>/.test(xml)).toBe(true);
    expect(/<Nome>/.test(xml)).toBe(false);
  });

  test('cliente PF con solo CF + nome + cognome → Nome/Cognome', function () {
    var xml = buildAnagrafica({ codiceFiscale: 'RSSMRA80A01H501U', nome: 'Mario', cognome: 'Rossi' });
    expect(/<Nome>Mario<\/Nome>/.test(xml)).toBe(true);
    expect(/<Cognome>Rossi<\/Cognome>/.test(xml)).toBe(true);
    expect(/<Denominazione>/.test(xml)).toBe(false);
  });

  test('cliente legacy con solo campo nome monco → fallback Denominazione', function () {
    var xml = buildAnagrafica({ nome: 'Legacy Client' });
    expect(/<Denominazione>Legacy Client<\/Denominazione>/.test(xml)).toBe(true);
  });

  test('denominazione esplicita vince su nome + cognome', function () {
    var xml = buildAnagrafica({ denominazione: 'Acme Srl', nome: 'Mario', cognome: 'Rossi', partitaIva: '12345678903' });
    expect(/<Denominazione>Acme Srl<\/Denominazione>/.test(xml)).toBe(true);
  });
});
