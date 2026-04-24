'use strict';
var DE = require('../dichiarazione-engine.js');

describe('DichiarazioneEngine.validateDichiarazione — limite forfettario da settings (R4)', function() {
  function makeDich(lm2val, settings) {
    return {
      frontespizio: { codiceFiscale: 'RSSMRA80A01H501U', cognome: 'Rossi', nome: 'Mario', dataNascita: '1980-01-01' },
      quadroLM: { LM2: { value: lm2val } },
      quadroRR: {},
      quadroRW: {},
      _validationContext: { settings: settings || {}, yearData: {}, year: 2026 }
    };
  }

  test('limiteForfettario=100000, ricavi=95000 → nessun warning soglia', function() {
    var dich = makeDich(95000, { limiteForfettario: 100000 });
    var res = DE.validateDichiarazione(dich);
    var codes = res.warnings.map(function(w) { return w.code; });
    expect(codes.indexOf('REDDITO_OLTRE_SOGLIA_85K') < 0).toBe(true);
    expect(codes.indexOf('REDDITO_OLTRE_SOGLIA_100K') < 0).toBe(true);
  });

  test('limiteForfettario=85000, ricavi=95000 → warning soglia', function() {
    var dich = makeDich(95000, { limiteForfettario: 85000 });
    var res = DE.validateDichiarazione(dich);
    var codes = res.warnings.map(function(w) { return w.code; });
    expect(codes.some(function(c) { return /REDDITO_OLTRE_SOGLIA/.test(c); })).toBe(true);
  });

  test('settings assenti (fallback 85000), ricavi=90000 → warning soglia', function() {
    var dich = makeDich(90000, {});
    var res = DE.validateDichiarazione(dich);
    var codes = res.warnings.map(function(w) { return w.code; });
    expect(codes.some(function(c) { return /REDDITO_OLTRE_SOGLIA/.test(c); })).toBe(true);
  });

  test('limiteForfettario=85000, ricavi=85000 → no warning (> strict)', function() {
    var dich = makeDich(85000, { limiteForfettario: 85000 });
    var res = DE.validateDichiarazione(dich);
    var codes = res.warnings.map(function(w) { return w.code; });
    expect(codes.some(function(c) { return /REDDITO_OLTRE_SOGLIA/.test(c); })).toBe(false);
  });

  test('limiteForfettario=85000, ricavi=85001 → warning', function() {
    var dich = makeDich(85001, { limiteForfettario: 85000 });
    var res = DE.validateDichiarazione(dich);
    var codes = res.warnings.map(function(w) { return w.code; });
    expect(codes.some(function(c) { return /REDDITO_OLTRE_SOGLIA/.test(c); })).toBe(true);
  });

  test('limiteForfettario=100000, ricavi=100001 → warning decadenza immediata', function() {
    var dich = makeDich(100001, { limiteForfettario: 100000 });
    var res = DE.validateDichiarazione(dich);
    var codes = res.warnings.map(function(w) { return w.code; });
    expect(codes.some(function(c) { return /REDDITO_OLTRE_SOGLIA/.test(c); })).toBe(true);
  });
});
