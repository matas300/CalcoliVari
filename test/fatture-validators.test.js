'use strict';
var FV = require('../fatture-validators.js');

describe('FattureValidators.resolveCliente', function () {
  test('draft.clienteSnapshot canonico', function () {
    expect(FV.resolveCliente({ clienteSnapshot: { nome: 'X' } })).toEqual({ nome: 'X' });
  });
  test('draft.cliente legacy', function () {
    expect(FV.resolveCliente({ cliente: { nome: 'Y' } })).toEqual({ nome: 'Y' });
  });
  test('cliente legacy precede clienteSnapshot quando entrambi presenti', function () {
    expect(FV.resolveCliente({ cliente: { nome: 'L' }, clienteSnapshot: { nome: 'S' } })).toEqual({ nome: 'L' });
  });
  test('null draft → null', function () { expect(FV.resolveCliente(null)).toBe(null); });
  test('draft senza cliente né snapshot → null', function () {
    expect(FV.resolveCliente({})).toBe(null);
  });
});

describe('FattureValidators.validateRitenutaForfettario', function () {
  test('forfettario + ritenuta > 0 + context invio → msg invio', function () {
    var msg = FV.validateRitenutaForfettario({ ritenuta: 200 }, { regime: 'forfettario' });
    expect(typeof msg === 'string' && /esonerato/.test(msg) && /comunicare al committente/.test(msg)).toBe(true);
  });
  test('forfettario + ritenuta > 0 + context xml → msg xml', function () {
    var msg = FV.validateRitenutaForfettario({ ritenuta: 50 }, { regime: 'forfettario' }, { context: 'xml' });
    expect(typeof msg === 'string' && /scaricare\/visualizzare/.test(msg)).toBe(true);
  });
  test('forfettario + ritenuta = 0 → null', function () {
    expect(FV.validateRitenutaForfettario({ ritenuta: 0 }, { regime: 'forfettario' })).toBe(null);
  });
  test('ordinario + ritenuta > 0 → null', function () {
    expect(FV.validateRitenutaForfettario({ ritenuta: 100 }, { regime: 'ordinario' })).toBe(null);
  });
  test('settings null → null', function () {
    expect(FV.validateRitenutaForfettario({ ritenuta: 100 }, null)).toBe(null);
  });
  test('draft null → null', function () {
    expect(FV.validateRitenutaForfettario(null, { regime: 'forfettario' })).toBe(null);
  });
});

describe('FattureValidators.validateClienteIT', function () {
  test('IT con P.IVA valida (11 cifre) → null', function () {
    expect(FV.validateClienteIT({ nazione: 'IT', partitaIva: '12345678903' })).toBe(null);
  });
  test('IT con CF valido (16 char) → null', function () {
    expect(FV.validateClienteIT({ nazione: 'IT', codiceFiscale: 'RSSMRA80A01H501U' })).toBe(null);
  });
  test('IT senza P.IVA né CF → errore', function () {
    var msg = FV.validateClienteIT({ nazione: 'IT', nome: 'X' });
    expect(typeof msg === 'string' && /P\.IVA/.test(msg)).toBe(true);
  });
  test('Estero (DE) senza P.IVA → null (validazione solo IT)', function () {
    expect(FV.validateClienteIT({ nazione: 'DE' })).toBe(null);
  });
  test('cliente null → null', function () {
    expect(FV.validateClienteIT(null)).toBe(null);
  });
  test('IT P.IVA con spazi → trim funziona', function () {
    expect(FV.validateClienteIT({ nazione: 'IT', partitaIva: '12345678903   ' })).toBe(null);
  });
  test('validators custom: isValidPartitaIvaIT strict false → fallback CF check', function () {
    var msg = FV.validateClienteIT(
      { nazione: 'IT', partitaIva: '12345678903', codiceFiscale: '' },
      { isValidPartitaIvaIT: function () { return false; }, isValidCodiceFiscale: function () { return false; } }
    );
    expect(typeof msg === 'string').toBe(true);
  });
});
