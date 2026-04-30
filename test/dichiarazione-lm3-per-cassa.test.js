'use strict';
var DE = require('../dichiarazione-engine.js');
if (!DE) throw new Error('DichiarazioneEngine not loaded');

function mkYd(opts) {
  opts = opts || {};
  var y = {
    year: 2025,
    settings: Object.assign({
      regime: 'forfettario',
      coefficiente: 78,
      impostaSostitutiva: 15,
      contribFissi: 4000,
      contribVar: 1000,
      aliqContributi: 0,
      inpsMode: 'artcom'
    }, opts.settings || {}),
    fatture: opts.fatture || {}
  };
  if ('pagamenti' in opts) y.pagamenti = opts.pagamenti;
  return y;
}

describe('C4 — LM3 contributi deducibili per cassa (art. 1 c. 64 L. 190/2014)', function () {

  test('pagamenti tipo=contributi sommati → LM3 = somma, source=pagamenti', function () {
    var y = mkYd({ pagamenti: [
      { data: '2025-05-16', tipo: 'contributi', importo: 1200.50 },
      { data: '2025-08-20', tipo: 'contributi', importo: 800 },
      { data: '2025-11-16', tipo: 'contributi', importo: 500.25 }
    ]});
    var q = DE.buildQuadroLM(y, y.settings, {});
    expect(q.LM3.value).toBe(2500.75);
    expect(q.LM3.source).toBe('pagamenti');
  });

  test('pagamenti tipo=tasse ignorati per LM3', function () {
    var y = mkYd({ pagamenti: [
      { data: '2025-05-16', tipo: 'contributi', importo: 1000 },
      { data: '2025-06-30', tipo: 'tasse', importo: 3000 }
    ]});
    var q = DE.buildQuadroLM(y, y.settings, {});
    expect(q.LM3.value).toBe(1000);
    expect(q.LM3.source).toBe('pagamenti');
  });

  test('overrides.LM3_value vince → source=override', function () {
    var y = mkYd({ pagamenti: [
      { data: '2025-05-16', tipo: 'contributi', importo: 1000 }
    ]});
    var q = DE.buildQuadroLM(y, y.settings, { LM3_value: 4200 });
    expect(q.LM3.value).toBe(4200);
    expect(q.LM3.source).toBe('override');
  });

  test('pagamenti absent (undefined) → fallback competenza contribFissi+contribVar', function () {
    var y = mkYd({}); // no pagamenti key
    // manual contribFissi=4000, contribVar=1000 direct (aliqContributi=0 so computed var=0)
    // With current engine logic contribVar is computed from aliqContributi; settings.contribVar is NOT used today.
    // To avoid coupling to that: set aliqContributi so computed contribVar matches.
    // Simpler: just check that source is fallback-competenza and value equals the legacy formula.
    var q = DE.buildQuadroLM(y, y.settings, {});
    expect(q.LM3.source).toBe('fallback-competenza');
    // legacy formula: contribFissi + computed(0) = 4000
    expect(q.LM3.value).toBe(4000);
  });

  test('pagamenti null → fallback competenza', function () {
    var y = mkYd({ pagamenti: null });
    var q = DE.buildQuadroLM(y, y.settings, {});
    expect(q.LM3.source).toBe('fallback-competenza');
  });

  test('pagamenti=[] (array vuoto, decisione esplicita) → LM3=0 source=pagamenti', function () {
    var y = mkYd({ pagamenti: [] });
    var q = DE.buildQuadroLM(y, y.settings, {});
    expect(q.LM3.value).toBe(0);
    expect(q.LM3.source).toBe('pagamenti');
  });

  test('LM4 ricalcolato coerentemente con LM3 per cassa', function () {
    // ricavi 30000, coeff 78 → LM2 = 23400
    // pagamenti contributi = 3000 → LM3 = 3000
    // LM4 = 23400 - 3000 = 20400
    var y = mkYd({
      pagamenti: [{ data: '2025-05-16', tipo: 'contributi', importo: 3000 }],
      fatture: { 1: [{ importo: 30000, pagAnno: 2025 }] }
    });
    var q = DE.buildQuadroLM(y, y.settings, {});
    expect(q.LM1.value).toBe(30000);
    expect(q.LM2.value).toBe(23400);
    expect(q.LM3.value).toBe(3000);
    expect(q.LM4.value).toBe(20400);
  });

  test('pagamenti con importo non-numerico filtrati', function () {
    var y = mkYd({ pagamenti: [
      { data: '2025-05-16', tipo: 'contributi', importo: 1000 },
      { data: '2025-06-16', tipo: 'contributi', importo: 'abc' },
      { data: '2025-07-16', tipo: 'contributi', importo: 500 }
    ]});
    var q = DE.buildQuadroLM(y, y.settings, {});
    expect(q.LM3.value).toBe(1500);
  });

});
