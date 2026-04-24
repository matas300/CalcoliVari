'use strict';
var DE = require('../dichiarazione-engine.js');
if (!DE) throw new Error('DichiarazioneEngine not loaded');

function yd(extraSettings, pagamenti) {
  return {
    settings: Object.assign({
      regime: 'forfettario',
      coefficiente: 78,
      impostaSostitutiva: 15,
      contribFissi: 0,
      aliqContributi: 0,
      inpsMode: 'artcom'
    }, extraSettings || {}),
    fatture: {},
    pagamenti: pagamenti || []
  };
}

describe('B3 — Quadro LM sezione II completa', function () {
  test('LM34=20000 aliq 15% → LM38=3000 LM40=3000 LM45=3000', function () {
    var y = yd();
    var q = DE.buildQuadroLM(y, y.settings, { LM34_value: 20000 });
    expect(q.LM38.value).toBe(3000);
    expect(q.LM40.value).toBe(3000);
    expect(q.LM41.value).toBe(0);
    expect(q.LM45.value).toBe(3000);
    expect(q.LM46.value).toBe(0);
  });

  test('con ritenute LM41=500 → saldo LM45=2500', function () {
    var y = yd();
    var q = DE.buildQuadroLM(y, y.settings, { LM34_value: 20000, LM41_value: 500 });
    expect(q.LM45.value).toBe(2500);
  });

  test('con acconti LM43=1500 → saldo LM45=1500', function () {
    var y = yd();
    var q = DE.buildQuadroLM(y, y.settings, { LM34_value: 20000, LM43_value: 1500 });
    expect(q.LM45.value).toBe(1500);
  });

  test('acconti > imposta → LM46 a credito', function () {
    var y = yd();
    var q = DE.buildQuadroLM(y, y.settings, { LM34_value: 20000, LM43_value: 4000 });
    expect(q.LM45.value).toBe(0);
    expect(q.LM46.value).toBe(1000);
  });

  test('start-up 5%: LM34=20000 → LM38=1000', function () {
    var y = yd({ impostaSostitutiva: 5 });
    var q = DE.buildQuadroLM(y, y.settings, { LM34_value: 20000 });
    expect(q.LM38.value).toBe(1000);
  });

  test('detrazioni LM39=100 → LM40 = LM38 − 100', function () {
    var y = yd();
    var q = DE.buildQuadroLM(y, y.settings, { LM34_value: 20000, LM39_value: 100 });
    expect(q.LM38.value).toBe(3000);
    expect(q.LM40.value).toBe(2900);
  });

  test('backward compat: LM36 e LM47 ancora presenti', function () {
    var y = yd();
    var q = DE.buildQuadroLM(y, y.settings, { LM34_value: 20000 });
    expect(q.LM36.value).toBe(3000);
    expect(q.LM47.value).toBe(3000);
  });
});
