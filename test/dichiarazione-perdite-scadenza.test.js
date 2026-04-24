'use strict';
var DE = require('../dichiarazione-engine.js');

describe('DichiarazioneEngine.buildQuadroLM — perdite pregresse scadenza 5 anni (R3)', function() {
  function baseYearData(year) {
    return {
      year: year,
      fatture: { 1: [{ importo: 20000, pagAnno: year }] },
      pagamenti: []
    };
  }
  var baseSettings = { coefficiente: 78, impostaSostitutiva: 15 };

  test('year=2026, dettaglio misto: solo perdita 2021 valida, 2019 scaduta', function() {
    var yd = baseYearData(2026);
    var settings = Object.assign({}, baseSettings, {
      perditePregresseDettaglio: [
        { anno: 2021, importo: 1000 },
        { anno: 2019, importo: 500 }
      ]
    });
    var lm = DE.buildQuadroLM(yd, settings, {});
    // LM4 = 20000*0.78 = 15600. LM34 = 15600 - 1000 = 14600
    expect(lm.LM34.value).toBe(14600);
    expect(lm._meta.perditePregresse).toBe(1000);
    expect(Array.isArray(lm._perditeWarnings)).toBe(true);
    var joined = lm._perditeWarnings.join('|');
    expect(/2019/.test(joined)).toBe(true);
    expect(/2025/.test(joined)).toBe(true); // anno+6
  });

  test('year=2026, dettaglio solo 2022: valida, no warning', function() {
    var yd = baseYearData(2026);
    var settings = Object.assign({}, baseSettings, {
      perditePregresseDettaglio: [{ anno: 2022, importo: 2000 }]
    });
    var lm = DE.buildQuadroLM(yd, settings, {});
    expect(lm.LM34.value).toBe(13600); // 15600 - 2000
    expect(lm._perditeWarnings.length).toBe(0);
  });

  test('legacy: overrides.LM_perditePregresse numerico senza dettaglio → warning dettaglio mancante', function() {
    var yd = baseYearData(2026);
    var lm = DE.buildQuadroLM(yd, baseSettings, { LM_perditePregresse: 3000 });
    expect(lm.LM34.value).toBe(12600); // 15600 - 3000, no filter
    var joined = (lm._perditeWarnings || []).join('|');
    expect(/Dettaglio anno perdite mancante/.test(joined)).toBe(true);
  });

  test('dettaglio tutte scadute: LM34 = LM4, warnings multipli', function() {
    var yd = baseYearData(2026);
    var settings = Object.assign({}, baseSettings, {
      perditePregresseDettaglio: [
        { anno: 2018, importo: 400 },
        { anno: 2019, importo: 600 }
      ]
    });
    var lm = DE.buildQuadroLM(yd, settings, {});
    expect(lm.LM34.value).toBe(15600); // LM4
    expect(lm._perditeWarnings.length).toBe(2);
  });

  test('no perdite: LM34 = LM4, no warning', function() {
    var yd = baseYearData(2026);
    var lm = DE.buildQuadroLM(yd, baseSettings, {});
    expect(lm.LM34.value).toBe(15600);
    expect((lm._perditeWarnings || []).length).toBe(0);
  });

  test('validateDichiarazione propaga warnings perdite da LM', function() {
    var dich = {
      frontespizio: { codiceFiscale: 'RSSMRA80A01H501U', cognome: 'Rossi', nome: 'Mario', dataNascita: '1980-01-01' },
      quadroLM: {
        LM2: { value: 30000 },
        _perditeWarnings: ['Perdita anno 2019 (500,00 €) scaduta: non più utilizzabile dal 2025']
      },
      quadroRR: {},
      quadroRW: {}
    };
    var res = DE.validateDichiarazione(dich);
    var codes = res.warnings.map(function(w) { return w.code; });
    expect(codes.indexOf('PERDITE_SCADUTE') >= 0 || codes.some(function(c) { return /PERDITE/.test(c); })).toBe(true);
  });

  test('edge: year=2026, perdita anno 2020 scaduta (boundary — fino al 2025)', function() {
    var yd = baseYearData(2026);
    var settings = Object.assign({}, baseSettings, {
      perditePregresseDettaglio: [{ anno: 2020, importo: 800 }]
    });
    var lm = DE.buildQuadroLM(yd, settings, {});
    expect(lm.LM34.value).toBe(15600);
    expect(lm._perditeWarnings.length).toBe(1);
  });

  test('edge: year=2026, perdita anno 2021 ammessa (boundary — anno-5)', function() {
    var yd = baseYearData(2026);
    var settings = Object.assign({}, baseSettings, {
      perditePregresseDettaglio: [{ anno: 2021, importo: 700 }]
    });
    var lm = DE.buildQuadroLM(yd, settings, {});
    expect(lm.LM34.value).toBe(14900); // 15600 - 700
    expect((lm._perditeWarnings || []).length).toBe(0);
  });
});
