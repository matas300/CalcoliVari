'use strict';
var FSM = require('../fatture-state-machine.js');

describe('FattureStateMachine.markInviata', function () {
  test('bozza → inviata + dataInvioSdi', function () {
    var f = { id: 'a', stato: 'bozza' };
    FSM.markInviata(f, { date: '2026-04-15' });
    expect(f.stato).toBe('inviata');
    expect(f.dataInvioSdi).toBe('2026-04-15');
  });
  test('senza opts.date → usa today', function () {
    var f = { id: 'a', stato: 'bozza' };
    FSM.markInviata(f);
    expect(f.stato).toBe('inviata');
    expect(/^\d{4}-\d{2}-\d{2}$/.test(f.dataInvioSdi)).toBe(true);
  });
  test('inviata già → idempotente (re-applica stessa data)', function () {
    var f = { id: 'a', stato: 'inviata', dataInvioSdi: '2026-01-01' };
    FSM.markInviata(f, { date: '2026-04-15' });
    expect(f.dataInvioSdi).toBe('2026-04-15');
  });
  test('stato diverso da bozza/inviata → throw', function () {
    var f = { id: 'a', stato: 'pagata' };
    var threw = false;
    try { FSM.markInviata(f, { date: '2026-04-15' }); } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });
  test('senza fattura → throw', function () {
    var threw = false;
    try { FSM.markInviata(null); } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });
});

describe('FattureStateMachine.markPagata', function () {
  test('inviata → pagata + dataPagamento + pagMese + pagAnno', function () {
    var f = { id: 'a', stato: 'inviata' };
    FSM.markPagata(f, { date: '2026-04-15' });
    expect(f.stato).toBe('pagata');
    expect(f.dataPagamento).toBe('2026-04-15');
    expect(f.pagMese).toBe(4);
    expect(f.pagAnno).toBe(2026);
  });
  test('senza opts.date → today', function () {
    var f = { id: 'a', stato: 'inviata' };
    FSM.markPagata(f);
    expect(f.stato).toBe('pagata');
    expect(/^\d{4}-\d{2}-\d{2}$/.test(f.dataPagamento)).toBe(true);
    expect(typeof f.pagMese === 'number').toBe(true);
    expect(typeof f.pagAnno === 'number').toBe(true);
  });
  test('pagata → idempotente con data update', function () {
    var f = { id: 'a', stato: 'pagata', dataPagamento: '2026-01-01', pagMese: 1, pagAnno: 2026 };
    FSM.markPagata(f, { date: '2026-04-15' });
    expect(f.dataPagamento).toBe('2026-04-15');
    expect(f.pagMese).toBe(4);
  });
  test('stato bozza → throw', function () {
    var f = { id: 'a', stato: 'bozza' };
    var threw = false;
    try { FSM.markPagata(f, { date: '2026-04-15' }); } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });
  test('data non ISO → throw', function () {
    var f = { id: 'a', stato: 'inviata' };
    var threw = false;
    try { FSM.markPagata(f, { date: '15/04/2026' }); } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });
  test('cross-year: dicembre 2025 fattura, pagata gennaio 2026', function () {
    var f = { id: 'a', stato: 'inviata', dataInvioSdi: '2025-12-31' };
    FSM.markPagata(f, { date: '2026-01-15' });
    expect(f.pagMese).toBe(1);
    expect(f.pagAnno).toBe(2026);
  });
});

describe('FattureStateMachine.markBozza', function () {
  test('reset di pagata', function () {
    var f = { id: 'a', stato: 'pagata', dataInvioSdi: '2026-01-01', dataPagamento: '2026-04-15', pagMese: 4, pagAnno: 2026 };
    FSM.markBozza(f);
    expect(f.stato).toBe('bozza');
    expect(f.dataInvioSdi).toBe(null);
    expect(f.dataPagamento).toBe(null);
    expect(f.pagMese).toBe(null);
    expect(f.pagAnno).toBe(null);
  });
  test('reset di inviata', function () {
    var f = { id: 'a', stato: 'inviata', dataInvioSdi: '2026-01-01' };
    FSM.markBozza(f);
    expect(f.stato).toBe('bozza');
    expect(f.dataInvioSdi).toBe(null);
  });
});
