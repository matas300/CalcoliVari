'use strict';
const { describe, test, expect } = global;
const path = require('path');

function loadStateMachine() {
  global.window = global.window || {};
  delete require.cache[require.resolve(path.join(process.cwd(), 'fatture-state-machine.js'))];
  return require(path.join(process.cwd(), 'fatture-state-machine.js'));
}

describe('markPagata con dataPagamento override', () => {
  test('Accetta opts.dataPagamento ISO YYYY-MM-DD', () => {
    const sm = loadStateMachine();
    const inv = { id: '1', stato: 'inviata' };
    sm.markPagata(inv, { date: '2026-04-15' });
    expect(inv.stato).toBe('pagata');
    expect(inv.dataPagamento).toBe('2026-04-15');
    expect(inv.pagMese).toBe(4);
    expect(inv.pagAnno).toBe(2026);
  });

  test('Default oggi se opts non passati', () => {
    const sm = loadStateMachine();
    const inv = { id: '2', stato: 'inviata' };
    sm.markPagata(inv);
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    expect(inv.stato).toBe('pagata');
    expect(inv.dataPagamento).toBe(isoToday);
  });

  test('Throw su data malformata', () => {
    const sm = loadStateMachine();
    const inv = { id: '3', stato: 'inviata' };
    let threw = false;
    try { sm.markPagata(inv, { date: 'not-a-date' }); }
    catch (e) { threw = true; }
    expect(threw).toBe(true);
  });
});
