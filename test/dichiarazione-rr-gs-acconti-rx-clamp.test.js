'use strict';
// v3 audit fixes: RR21 GS legge acconti versati, riduzione 35% warning,
// RX eccedenza clampata >= 0, integrativa warning.
var Engine = require('../dichiarazione-engine.js');

describe('v3-RR21-GS — acconti GS letti da pagamenti (parità con RR7)', function () {
  test('GS con 2 acconti versati 500 + 500 → RR21 = 1000, RR22 = max(0, contrib - 1000)', function () {
    var yearData = {
      pagamenti: [
        { tipo: 'contributi', importo: 500, linkedKeys: ['contributi_acc1_2026'] },
        { tipo: 'contributi', importo: 500, linkedKeys: ['contributi_acc2_2026'] },
        { tipo: 'altro', importo: 999, linkedKeys: ['ignored'] }
      ]
    };
    var settings = { inpsMode: 'gestione_separata', aliqContributi: 26.07 };
    var qLM = { LM4: { value: 10000 } };
    var rr = Engine.buildQuadroRR(yearData, settings, qLM, {});
    var contribAtteso = Math.round(10000 * 26.07) / 100; // 2607.00
    expect(rr.sezII.RR20.value).toBe(contribAtteso);
    expect(rr.sezII.RR21.value).toBe(1000);
    expect(rr.sezII.RR22.value).toBe(contribAtteso - 1000);
  });

  test('GS con acconti > contributi → RR22 = 0, RR22_credito = differenza', function () {
    var yearData = {
      pagamenti: [
        { tipo: 'contributi', importo: 3000, linkedKeys: ['contributi_acc1_2026'] }
      ]
    };
    var settings = { inpsMode: 'gestione_separata', aliqContributi: 26.07 };
    var qLM = { LM4: { value: 10000 } };
    var rr = Engine.buildQuadroRR(yearData, settings, qLM, {});
    expect(rr.sezII.RR22.value).toBe(0);
    expect(rr.sezII.RR22_credito.value).toBeGreaterThan(0);
  });

  test('GS con override RR21_value → vince sull\'auto-read', function () {
    var yearData = {
      pagamenti: [
        { tipo: 'contributi', importo: 500, linkedKeys: ['contributi_acc1_2026'] }
      ]
    };
    var settings = { inpsMode: 'gestione_separata', aliqContributi: 26.07 };
    var qLM = { LM4: { value: 10000 } };
    var rr = Engine.buildQuadroRR(yearData, settings, qLM, { RR21_value: 750 });
    expect(rr.sezII.RR21.value).toBe(750);
    expect(rr.sezII.RR21.source).toBe('override');
  });

  test('GS senza pagamenti → RR21 = 0, RR22 = contributi', function () {
    var yearData = { pagamenti: [] };
    var settings = { inpsMode: 'gestione_separata', aliqContributi: 26.07 };
    var qLM = { LM4: { value: 10000 } };
    var rr = Engine.buildQuadroRR(yearData, settings, qLM, {});
    expect(rr.sezII.RR21.value).toBe(0);
    expect(rr.sezII.RR22.value).toBe(rr.sezII.RR20.value);
  });
});

describe('v3-RIDUZIONE35 — warning verifica comunicazione INPS', function () {
  test('riduzione35=1 + artigiani_commercianti → warning RR_RIDUZIONE35_VERIFICA', function () {
    var settings = {
      inpsMode: 'artigiani_commercianti',
      riduzione35: 1,
      minimaleInps: 18808,
      aliqContributi: 24,
      contribFissi: 4521.36
    };
    var qLM = { LM4: { value: 30000 } };
    var rr = Engine.buildQuadroRR({ pagamenti: [] }, settings, qLM, {});
    var hit = (rr._warnings || []).some(function (w) {
      return w.code === 'RR_RIDUZIONE35_VERIFICA' && /comunic/i.test(w.message);
    });
    expect(hit).toBe(true);
  });

  test('riduzione35=0 → nessun warning', function () {
    var settings = {
      inpsMode: 'artigiani_commercianti',
      riduzione35: 0,
      minimaleInps: 18808,
      aliqContributi: 24,
      contribFissi: 4521.36
    };
    var qLM = { LM4: { value: 30000 } };
    var rr = Engine.buildQuadroRR({ pagamenti: [] }, settings, qLM, {});
    var hit = (rr._warnings || []).some(function (w) { return w.code === 'RR_RIDUZIONE35_VERIFICA'; });
    expect(hit).toBe(false);
  });

  test('riduzione35=1 ma gestione_separata → no warning (la riduzione vale solo art-comm)', function () {
    var settings = { inpsMode: 'gestione_separata', riduzione35: 1, aliqContributi: 26.07 };
    var qLM = { LM4: { value: 10000 } };
    var rr = Engine.buildQuadroRR({ pagamenti: [] }, settings, qLM, {});
    var hit = (rr._warnings || []).some(function (w) { return w.code === 'RR_RIDUZIONE35_VERIFICA'; });
    expect(hit).toBe(false);
  });
});

describe('v3-RX-CLAMP — eccedenza negativa clampata a 0', function () {
  test('precedente.eccedenza negativa → RX1 = 0 + warning', function () {
    var rx = Engine.buildQuadroRX({}, {}, { eccedenza: -500 }, {});
    expect(rx.RX1.value).toBe(0);
    expect(rx.eccedenza).toBe(0);
    var hit = (rx._warnings || []).some(function (w) { return w.code === 'RX_ECCEDENZA_NEGATIVA'; });
    expect(hit).toBe(true);
  });

  test('eccedenza positiva → RX1 = valore, no warning', function () {
    var rx = Engine.buildQuadroRX({}, {}, { eccedenza: 250 }, {});
    expect(rx.RX1.value).toBe(250);
    expect((rx._warnings || []).length).toBe(0);
  });
});

describe('v3-INTEGRATIVA — warning su tipoDichiarazione integrativa/correttiva', function () {
  function baseDich(tipo) {
    return {
      frontespizio: {
        codiceFiscale: 'RSSMRA80A01H501U',
        cognome: 'Rossi', nome: 'Mario', dataNascita: '1980-01-01',
        tipoDichiarazione: tipo
      }
    };
  }
  test('tipoDichiarazione=integrativa → warning DICHIARAZIONE_INTEGRATIVA', function () {
    var v = Engine.validateDichiarazione(baseDich('integrativa'));
    var hit = (v.warnings || []).some(function (w) { return w.code === 'DICHIARAZIONE_INTEGRATIVA'; });
    expect(hit).toBe(true);
  });

  test('tipoDichiarazione=correttiva → warning DICHIARAZIONE_CORRETTIVA', function () {
    var v = Engine.validateDichiarazione(baseDich('correttiva'));
    var hit = (v.warnings || []).some(function (w) { return w.code === 'DICHIARAZIONE_CORRETTIVA'; });
    expect(hit).toBe(true);
  });

  test('tipoDichiarazione=ordinaria → nessun warning specifico', function () {
    var v = Engine.validateDichiarazione(baseDich('ordinaria'));
    var hit = (v.warnings || []).some(function (w) {
      return w.code === 'DICHIARAZIONE_INTEGRATIVA' || w.code === 'DICHIARAZIONE_CORRETTIVA';
    });
    expect(hit).toBe(false);
  });
});
