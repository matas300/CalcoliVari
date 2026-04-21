'use strict';

// ─── Stub globals BEFORE requiring the IIFE module ───────────────────────────

var storage = {};
global.localStorage = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.sessionStorage = global.localStorage;
if (!global.window) global.window = global;
if (!global.document) {
  global.document = {
    getElementById: function() { return null; },
    createElement: function() { return { appendChild: function(){}, setAttribute: function(){}, addEventListener: function(){} }; }
  };
}

// FattureSelectors + FattureStorico sono caricati dagli altri test; assicuriamoci che ci siano
if (!global.window.FattureSelectors) require('../fatture-selectors.js');
if (!global.window.FattureStorico) require('../fatture-storico.js');

var FS = global.window.FattureStorico;
var Sel = global.window.FattureSelectors;

function reset() { for (var k in storage) delete storage[k]; }

// Implementazione pura di hardDeleteFattura (logica estratta per test).
// Questo replica il contratto della funzione esposta su window in fatture-docs-feature.js,
// senza UI/confirm/recalcAll, in modo da poter testare solo la parte data.
function hardDeleteFatturaCore(profile, id) {
  var all = FS.load(profile);
  var target = all.find(function (f) { return f.id === id; });
  if (!target) return { ok: false, reason: 'not-found' };
  var next = all.filter(function (f) { return f.id !== id; });

  if (target.tipoDocumento === 'TD04' && target.fatturaOriginaleId) {
    var orig = next.find(function (f) { return f.id === target.fatturaOriginaleId; });
    if (orig) {
      orig.ncIds = (orig.ncIds || []).filter(function (x) { return x !== id; });
      var imp = Math.abs(Sel.getImportoSigned(target));
      orig.ncTotaleImporto = Math.max(0, (Number(orig.ncTotaleImporto) || 0) - imp);
      if (orig.ncTotaleImporto === 0 && orig.stato === 'stornata') {
        orig.stato = orig.dataPagamento ? 'pagata' : 'inviata';
      }
    }
  }
  FS.save(profile, next);
  return { ok: true, target: target };
}

var PROFILE = 'TestHard';

// ─── hardDelete rimuove il target ────────────────────────────────────────────

describe('hardDeleteFattura — rimozione base', function () {
  test('rimuove la fattura target dall\'array', function () {
    reset();
    FS.save(PROFILE, [
      { id: 'f1', numero: '2026/001', annoProgressivo: 2026, progressivo: 1, stato: 'inviata', tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 100 }] },
      { id: 'f2', numero: '2026/002', annoProgressivo: 2026, progressivo: 2, stato: 'pagata', tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 200 }] }
    ]);
    var res = hardDeleteFatturaCore(PROFILE, 'f1');
    expect(res.ok).toBe(true);
    var after = FS.load(PROFILE);
    expect(after.length).toBe(1);
    expect(after[0].id).toBe('f2');
  });

  test('id inesistente → no-op con flag not-found', function () {
    reset();
    FS.save(PROFILE, [
      { id: 'f1', numero: '2026/001', annoProgressivo: 2026, progressivo: 1, stato: 'inviata', tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 100 }] }
    ]);
    var res = hardDeleteFatturaCore(PROFILE, 'nonexistent');
    expect(res.ok).toBe(false);
    var after = FS.load(PROFILE);
    expect(after.length).toBe(1);
  });

  test('eliminare fattura non-NC non altera ncIds/ncTotaleImporto di altre fatture', function () {
    reset();
    FS.save(PROFILE, [
      { id: 'f1', numero: '2026/001', annoProgressivo: 2026, progressivo: 1, stato: 'pagata', tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 500 }], ncIds: ['nc1'], ncTotaleImporto: 50 },
      { id: 'f2', numero: '2026/002', annoProgressivo: 2026, progressivo: 2, stato: 'inviata', tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 300 }] }
    ]);
    hardDeleteFatturaCore(PROFILE, 'f2');
    var after = FS.load(PROFILE);
    expect(after.length).toBe(1);
    expect(after[0].id).toBe('f1');
    expect(after[0].ncTotaleImporto).toBe(50);
    expect(after[0].ncIds.length).toBe(1);
  });
});

// ─── Cancellazione NC → ripristino originale ──────────────────────────────────

describe('hardDeleteFattura — cancellazione NC → aggiornamento originale', function () {
  test('NC totale eliminata → originale stornata con dataPagamento torna pagata', function () {
    reset();
    FS.save(PROFILE, [
      {
        id: 'orig1', numero: '2026/001', annoProgressivo: 2026, progressivo: 1,
        stato: 'stornata', tipoDocumento: 'TD01',
        dataPagamento: '2026-03-15',
        righe: [{ quantita: 1, prezzoUnitario: 500 }],
        ncIds: ['nc1'], ncTotaleImporto: 500
      },
      {
        id: 'nc1', numero: '2026/002', annoProgressivo: 2026, progressivo: 2,
        stato: 'inviata', tipoDocumento: 'TD04',
        fatturaOriginaleId: 'orig1',
        righe: [{ quantita: 1, prezzoUnitario: 500 }]
      }
    ]);
    hardDeleteFatturaCore(PROFILE, 'nc1');
    var after = FS.load(PROFILE);
    expect(after.length).toBe(1);
    expect(after[0].id).toBe('orig1');
    expect(after[0].stato).toBe('pagata');
    expect(after[0].ncTotaleImporto).toBe(0);
    expect(after[0].ncIds.length).toBe(0);
  });

  test('NC totale eliminata → originale stornata SENZA dataPagamento torna inviata', function () {
    reset();
    FS.save(PROFILE, [
      {
        id: 'orig2', numero: '2026/010', annoProgressivo: 2026, progressivo: 10,
        stato: 'stornata', tipoDocumento: 'TD01',
        dataPagamento: null,
        righe: [{ quantita: 1, prezzoUnitario: 300 }],
        ncIds: ['nc2'], ncTotaleImporto: 300
      },
      {
        id: 'nc2', numero: '2026/011', annoProgressivo: 2026, progressivo: 11,
        stato: 'inviata', tipoDocumento: 'TD04',
        fatturaOriginaleId: 'orig2',
        righe: [{ quantita: 1, prezzoUnitario: 300 }]
      }
    ]);
    hardDeleteFatturaCore(PROFILE, 'nc2');
    var after = FS.load(PROFILE);
    expect(after.length).toBe(1);
    expect(after[0].stato).toBe('inviata');
    expect(after[0].ncTotaleImporto).toBe(0);
  });

  test('NC parziale eliminata → ncTotaleImporto decrementato, stato resta stornata', function () {
    reset();
    FS.save(PROFILE, [
      {
        id: 'orig3', numero: '2026/020', annoProgressivo: 2026, progressivo: 20,
        stato: 'stornata', tipoDocumento: 'TD01',
        dataPagamento: '2026-05-01',
        righe: [{ quantita: 1, prezzoUnitario: 1000 }],
        ncIds: ['nc3a', 'nc3b'], ncTotaleImporto: 400
      },
      {
        id: 'nc3a', numero: '2026/021', annoProgressivo: 2026, progressivo: 21,
        stato: 'inviata', tipoDocumento: 'TD04',
        fatturaOriginaleId: 'orig3',
        righe: [{ quantita: 1, prezzoUnitario: 100 }]
      },
      {
        id: 'nc3b', numero: '2026/022', annoProgressivo: 2026, progressivo: 22,
        stato: 'inviata', tipoDocumento: 'TD04',
        fatturaOriginaleId: 'orig3',
        righe: [{ quantita: 1, prezzoUnitario: 300 }]
      }
    ]);
    hardDeleteFatturaCore(PROFILE, 'nc3a');
    var after = FS.load(PROFILE);
    var orig = after.find(function (f) { return f.id === 'orig3'; });
    expect(orig).toBeTruthy();
    // ncTotaleImporto era 400 → rimossa NC da 100 → resta 300
    expect(orig.ncTotaleImporto).toBe(300);
    expect(orig.ncIds.length).toBe(1);
    expect(orig.ncIds[0]).toBe('nc3b');
    // Stato resta stornata perché c'è ancora una NC collegata
    expect(orig.stato).toBe('stornata');
  });

  test('NC senza fatturaOriginaleId → eliminata senza toccare altre fatture', function () {
    reset();
    FS.save(PROFILE, [
      {
        id: 'orig4', numero: '2026/030', annoProgressivo: 2026, progressivo: 30,
        stato: 'pagata', tipoDocumento: 'TD01',
        righe: [{ quantita: 1, prezzoUnitario: 200 }],
        ncIds: [], ncTotaleImporto: 0
      },
      {
        id: 'ncOrphan', numero: '2026/031', annoProgressivo: 2026, progressivo: 31,
        stato: 'inviata', tipoDocumento: 'TD04',
        fatturaOriginaleId: null,
        righe: [{ quantita: 1, prezzoUnitario: 50 }]
      }
    ]);
    var res = hardDeleteFatturaCore(PROFILE, 'ncOrphan');
    expect(res.ok).toBe(true);
    var after = FS.load(PROFILE);
    expect(after.length).toBe(1);
    expect(after[0].id).toBe('orig4');
    expect(after[0].stato).toBe('pagata');
  });
});
