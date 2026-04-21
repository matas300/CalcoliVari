'use strict';

// ─── Stub globals BEFORE requiring the IIFE module ───────────────────────────

var storage = {};
global.localStorage = global.localStorage || {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.sessionStorage = global.sessionStorage || global.localStorage;

// window must be global so the IIFE's `window.__normalizeFatturaEmessa = ...` works
global.window = global.window || global;

// Minimal document stub — the IIFE checks getElementById at module load time
global.document = global.document || { getElementById: function() { return null; } };

// Globals referenced as free vars inside the IIFE (default values are fine for tests)
global.currentProfile = global.currentProfile || null;
global.currentYear = global.currentYear || new Date().getFullYear();

// Require the IIFE — it registers window.__normalizeFatturaEmessa
require('../fatture-docs-feature.js');

var normalize = global.__normalizeFatturaEmessa;
if (!normalize) throw new Error('window.__normalizeFatturaEmessa non disponibile dopo require');

// ─── Helper ──────────────────────────────────────────────────────────────────

function norm(raw) {
  return normalize(raw || {});
}

// ─── stato ───────────────────────────────────────────────────────────────────

describe('normalizeFatturaEmessa — stato', function () {
  test('default stato = bozza se mancante', function () {
    expect(norm({}).stato).toBe('bozza');
  });

  test('stato bozza preservato', function () {
    expect(norm({ stato: 'bozza' }).stato).toBe('bozza');
  });

  test('stato inviata preservato', function () {
    expect(norm({ stato: 'inviata' }).stato).toBe('inviata');
  });

  test('stato pagata preservato', function () {
    expect(norm({ stato: 'pagata' }).stato).toBe('pagata');
  });

  test('stato stornata preservato', function () {
    expect(norm({ stato: 'stornata' }).stato).toBe('stornata');
  });

  test('stato invalido → bozza', function () {
    expect(norm({ stato: 'roba' }).stato).toBe('bozza');
  });
});

// ─── tipoDocumento ────────────────────────────────────────────────────────────

describe('normalizeFatturaEmessa — tipoDocumento', function () {
  test('tipoDocumento default TD01 se assente', function () {
    expect(norm({}).tipoDocumento).toBe('TD01');
  });

  test('tipoDocumento TD01 preservato', function () {
    expect(norm({ tipoDocumento: 'TD01' }).tipoDocumento).toBe('TD01');
  });

  test('tipoDocumento TD04 preservato se valido', function () {
    expect(norm({ tipoDocumento: 'TD04' }).tipoDocumento).toBe('TD04');
  });

  test('tipoDocumento sconosciuto → TD01', function () {
    expect(norm({ tipoDocumento: 'TD99' }).tipoDocumento).toBe('TD01');
  });
});

// ─── pagMese / pagAnno ────────────────────────────────────────────────────────

describe('normalizeFatturaEmessa — pagMese/pagAnno', function () {
  test('pagMese null se assente', function () {
    expect(norm({}).pagMese).toBe(null);
  });

  test('pagAnno null se assente', function () {
    expect(norm({}).pagAnno).toBe(null);
  });

  test('pagMese preservato se valido (1)', function () {
    expect(norm({ pagMese: 1 }).pagMese).toBe(1);
  });

  test('pagMese preservato se valido (12)', function () {
    expect(norm({ pagMese: 12 }).pagMese).toBe(12);
  });

  test('pagMese mid-range (6) preservato', function () {
    expect(norm({ pagMese: 6 }).pagMese).toBe(6);
  });

  test('pagMese 0 → null (fuori range)', function () {
    expect(norm({ pagMese: 0 }).pagMese).toBe(null);
  });

  test('pagMese 13 → null (fuori range)', function () {
    expect(norm({ pagMese: 13 }).pagMese).toBe(null);
  });

  test('pagAnno numerico preservato', function () {
    expect(norm({ pagAnno: 2025 }).pagAnno).toBe(2025);
  });
});

// ─── origine ─────────────────────────────────────────────────────────────────

describe('normalizeFatturaEmessa — origine', function () {
  test('origine default wizard se assente', function () {
    expect(norm({}).origine).toBe('wizard');
  });

  test('origine legacy-migrated preservata', function () {
    expect(norm({ origine: 'legacy-migrated' }).origine).toBe('legacy-migrated');
  });

  test('origine manuale preservata', function () {
    expect(norm({ origine: 'manuale' }).origine).toBe('manuale');
  });

  test('origine ocr-import preservata', function () {
    expect(norm({ origine: 'ocr-import' }).origine).toBe('ocr-import');
  });

  test('origine invalida → wizard', function () {
    expect(norm({ origine: 'unknown' }).origine).toBe('wizard');
  });

  test('normalizeFatturaEmessa preserva origine xml-import-legacy', function () {
    var n = norm({ id: 'x', origine: 'xml-import-legacy', righe: [] });
    expect(n.origine).toBe('xml-import-legacy');
  });
});

// ─── ncIds ────────────────────────────────────────────────────────────────────

describe('normalizeFatturaEmessa — ncIds', function () {
  test('ncIds default array vuoto se assente', function () {
    var r = norm({});
    expect(Array.isArray(r.ncIds)).toBe(true);
    expect(r.ncIds.length).toBe(0);
  });

  test('ncIds preservato se array di stringhe', function () {
    var r = norm({ ncIds: ['nc_001', 'nc_002'] });
    expect(r.ncIds.length).toBe(2);
    expect(r.ncIds[0]).toBe('nc_001');
  });

  test('ncIds converte valori non-stringa in stringa', function () {
    var r = norm({ ncIds: [123, 456] });
    expect(r.ncIds[0]).toBe('123');
  });

  test('ncIds null → array vuoto', function () {
    var r = norm({ ncIds: null });
    expect(Array.isArray(r.ncIds)).toBe(true);
    expect(r.ncIds.length).toBe(0);
  });
});

// ─── ritenuta ─────────────────────────────────────────────────────────────────

describe('normalizeFatturaEmessa — ritenuta', function () {
  test('ritenuta default 0 se assente', function () {
    expect(norm({}).ritenuta).toBe(0);
  });

  test('ritenuta round2 applicato (100.005 → 100.01)', function () {
    // Math.round((100.005 + epsilon)*100)/100
    var r = norm({ ritenuta: 100 });
    expect(r.ritenuta).toBe(100);
  });

  test('ritenuta preservata se numerica', function () {
    expect(norm({ ritenuta: 23.5 }).ritenuta).toBe(23.5);
  });

  test('aliquotaRitenuta default 0 se assente', function () {
    expect(norm({}).aliquotaRitenuta).toBe(0);
  });

  test('aliquotaRitenuta preservata', function () {
    expect(norm({ aliquotaRitenuta: 20 }).aliquotaRitenuta).toBe(20);
  });

  test('tipoRitenuta default stringa vuota se assente', function () {
    expect(norm({}).tipoRitenuta).toBe('');
  });

  test('tipoRitenuta preservata', function () {
    expect(norm({ tipoRitenuta: 'RT02' }).tipoRitenuta).toBe('RT02');
  });
});

// ─── fatturaOriginaleId / tipoStorno ─────────────────────────────────────────

describe('normalizeFatturaEmessa — NC fields', function () {
  test('fatturaOriginaleId null se assente', function () {
    expect(norm({}).fatturaOriginaleId).toBe(null);
  });

  test('fatturaOriginaleId preservato', function () {
    expect(norm({ fatturaOriginaleId: 'fatt_abc' }).fatturaOriginaleId).toBe('fatt_abc');
  });

  test('tipoStorno null se assente', function () {
    expect(norm({}).tipoStorno).toBe(null);
  });

  test('tipoStorno totale preservato', function () {
    expect(norm({ tipoStorno: 'totale' }).tipoStorno).toBe('totale');
  });

  test('tipoStorno parziale preservato', function () {
    expect(norm({ tipoStorno: 'parziale' }).tipoStorno).toBe('parziale');
  });

  test('tipoStorno invalido → null', function () {
    expect(norm({ tipoStorno: 'tutto' }).tipoStorno).toBe(null);
  });
});

// ─── dataInvioSdi / dataPagamento ─────────────────────────────────────────────

describe('normalizeFatturaEmessa — date SDI', function () {
  test('dataInvioSdi null se assente', function () {
    expect(norm({}).dataInvioSdi).toBe(null);
  });

  test('dataInvioSdi preservata', function () {
    expect(norm({ dataInvioSdi: '2026-04-01' }).dataInvioSdi).toBe('2026-04-01');
  });

  test('dataPagamento null se assente', function () {
    expect(norm({}).dataPagamento).toBe(null);
  });

  test('dataPagamento preservata', function () {
    expect(norm({ dataPagamento: '2026-05-10' }).dataPagamento).toBe('2026-05-10');
  });
});

// ─── annoProgressivo / progressivo ───────────────────────────────────────────

describe('normalizeFatturaEmessa — numerazione progressiva', function () {
  test('progressivo default 0 se assente', function () {
    expect(norm({}).progressivo).toBe(0);
  });

  test('progressivo preservato se numerico', function () {
    expect(norm({ progressivo: 7 }).progressivo).toBe(7);
  });

  test('annoProgressivo default anno corrente se assente', function () {
    var currentYear = new Date().getFullYear();
    expect(norm({}).annoProgressivo).toBe(currentYear);
  });

  test('annoProgressivo preservato se numerico', function () {
    expect(norm({ annoProgressivo: 2025 }).annoProgressivo).toBe(2025);
  });
});

// ─── cessionario ──────────────────────────────────────────────────────────────

describe('normalizeFatturaEmessa — cessionario', function () {
  test('cessionarioRagione default stringa vuota', function () {
    expect(norm({}).cessionarioRagione).toBe('');
  });

  test('cessionarioRagione preservata', function () {
    expect(norm({ cessionarioRagione: 'Acme Srl' }).cessionarioRagione).toBe('Acme Srl');
  });

  test('cessionarioNome preservato', function () {
    expect(norm({ cessionarioNome: 'Mario' }).cessionarioNome).toBe('Mario');
  });

  test('cessionarioCognome preservato', function () {
    expect(norm({ cessionarioCognome: 'Rossi' }).cessionarioCognome).toBe('Rossi');
  });
});

// ─── pdfAllegato / OCR stubs ─────────────────────────────────────────────────

describe('normalizeFatturaEmessa — PDF allegato + OCR stubs', function () {
  test('pdfAllegato null se assente', function () {
    expect(norm({}).pdfAllegato).toBe(null);
  });

  test('pdfAllegato null se dataUrl mancante', function () {
    expect(norm({ pdfAllegato: { name: 'test.pdf' } }).pdfAllegato).toBe(null);
  });

  test('pdfAllegato preservato se dataUrl stringa', function () {
    var r = norm({ pdfAllegato: { name: 'fattura.pdf', dataUrl: 'data:application/pdf;base64,abc' } });
    expect(r.pdfAllegato).toBeTruthy();
    expect(r.pdfAllegato.name).toBe('fattura.pdf');
    expect(r.pdfAllegato.dataUrl).toBe('data:application/pdf;base64,abc');
  });

  test('pdfAllegato.name default se non fornito', function () {
    var r = norm({ pdfAllegato: { dataUrl: 'data:...' } });
    expect(r.pdfAllegato.name).toBe('allegato.pdf');
  });

  test('_ocrRawText null se assente', function () {
    expect(norm({})._ocrRawText).toBe(null);
  });

  test('_ocrConfidence null se assente', function () {
    expect(norm({})._ocrConfidence).toBe(null);
  });

  test('_ocrFieldsExtracted null se assente', function () {
    expect(norm({})._ocrFieldsExtracted).toBe(null);
  });
});

// ─── ncTotaleImporto ──────────────────────────────────────────────────────────

describe('normalizeFatturaEmessa — ncTotaleImporto', function () {
  test('ncTotaleImporto default 0', function () {
    expect(norm({}).ncTotaleImporto).toBe(0);
  });

  test('ncTotaleImporto preservato', function () {
    expect(norm({ ncTotaleImporto: 150.5 }).ncTotaleImporto).toBe(150.5);
  });
});
