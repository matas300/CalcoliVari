'use strict';
var DE = require('../dichiarazione-engine.js');
if (!DE) throw new Error('DichiarazioneEngine not loaded');

function yd(extraSettings, pagamenti) {
  return {
    settings: Object.assign({
      regime: 'forfettario',
      coefficiente: 78,
      impostaSostitutiva: 15,
      contribFissi: 4000,
      aliqContributi: 24,
      minimaleInps: 18000,
      inpsMode: 'artcom'
    }, extraSettings || {}),
    fatture: {},
    pagamenti: pagamenti || []
  };
}

// Stub quadroLM con reddito controllabile
function lmWith(reddito) {
  return { LM4: { value: reddito, descrizione: '', source: 'computed' } };
}

describe('B4 — Quadro RR sezione I completa (artigiani/commercianti)', function () {

  test('RR7 somma acconti da pagamenti (contributi_acc1 + contributi_acc2)', function () {
    var y = yd({}, [
      { data: '2026-06-30', tipo: 'contributi', importo: 300, linkedKeys: ['contributi_acc1_2026'] },
      { data: '2026-11-30', tipo: 'contributi', importo: 450, linkedKeys: ['contributi_acc2_2026'] }
    ]);
    var lm = lmWith(20000);
    var q = DE.buildQuadroRR(y, y.settings, lm, {});
    expect(q.sezI.RR7.value).toBe(750);
  });

  test('RR7 ignora pagamenti tipo=tasse anche con linkedKeys simili', function () {
    var y = yd({}, [
      { data: '2026-06-30', tipo: 'tasse', importo: 300, linkedKeys: ['contributi_acc1_2026'] },
      { data: '2026-11-30', tipo: 'contributi', importo: 200, linkedKeys: ['contributi_acc2_2026'] }
    ]);
    var q = DE.buildQuadroRR(y, y.settings, lmWith(20000), {});
    expect(q.sezI.RR7.value).toBe(200);
  });

  test('RR8 saldo positivo: RR6=1000, RR7=400 → RR8=600, RR8_credito=0', function () {
    var y = yd({}, []);
    var q = DE.buildQuadroRR(y, y.settings, lmWith(20000), {
      RR6_value: 1000,
      RR7_value: 400
    });
    expect(q.sezI.RR6.value).toBe(1000);
    expect(q.sezI.RR7.value).toBe(400);
    expect(q.sezI.RR8.value).toBe(600);
    expect(q.sezI.RR8_credito.value).toBe(0);
  });

  test('RR8 credito: RR6=500, RR7=800 → RR8=0, RR8_credito=300', function () {
    var y = yd({}, []);
    var q = DE.buildQuadroRR(y, y.settings, lmWith(20000), {
      RR6_value: 500,
      RR7_value: 800
    });
    expect(q.sezI.RR8.value).toBe(0);
    expect(q.sezI.RR8_credito.value).toBe(300);
  });

  test('Override RR7_value vince sui pagamenti', function () {
    var y = yd({}, [
      { data: '2026-06-30', tipo: 'contributi', importo: 1000, linkedKeys: ['contributi_acc1_2026'] }
    ]);
    var q = DE.buildQuadroRR(y, y.settings, lmWith(20000), { RR7_value: 250 });
    expect(q.sezI.RR7.value).toBe(250);
    expect(q.sezI.RR7.source).toBe('override');
  });

  test('Override RR6_value ricalcola RR8 coerentemente', function () {
    var y = yd({}, [
      { data: '2026-06-30', tipo: 'contributi', importo: 200, linkedKeys: ['contributi_acc1_2026'] }
    ]);
    var q = DE.buildQuadroRR(y, y.settings, lmWith(20000), { RR6_value: 900 });
    // RR7 = 200 (da pagamenti), RR6 override = 900 → RR8 = 700
    expect(q.sezI.RR6.value).toBe(900);
    expect(q.sezI.RR6.source).toBe('override');
    expect(q.sezI.RR7.value).toBe(200);
    expect(q.sezI.RR8.value).toBe(700);
  });

  test('Gestione separata resta invariata — no RR6/RR7/RR8_credito in sezII', function () {
    var y = yd({ inpsMode: 'gestione_separata', aliqContributi: 26.23 }, []);
    var q = DE.buildQuadroRR(y, y.settings, lmWith(10000), {});
    expect(q.sezI).toBe(null);
    expect(q.sezII).toBeTruthy();
    expect(q.sezII.RR6).toBe(undefined);
    expect(q.sezII.RR7).toBe(undefined);
    expect(q.sezII.RR8_credito).toBe(undefined);
  });
});
