'use strict';
var DE = require('../dichiarazione-engine.js');

describe('DichiarazioneEngine.validateStartupAliquota', function() {
  test('impostaSostitutiva=15 → applicable=false, no warnings', function() {
    var res = DE.validateStartupAliquota({ impostaSostitutiva: 15 }, {}, 2026);
    expect(res.applicable).toBe(false);
    expect(res.warnings.length).toBe(0);
  });

  test('impostaSostitutiva=5 + dataAperturaPiva missing → warn data mancante', function() {
    var res = DE.validateStartupAliquota({ impostaSostitutiva: 5 }, {}, 2026);
    expect(res.applicable).toBe(false);
    var joined = res.warnings.join('|');
    expect(/Data apertura P\.IVA mancante/.test(joined)).toBe(true);
  });

  test('impostaSostitutiva=5 + apertura 2021, year=2026 → warn scaduti 5 anni', function() {
    var res = DE.validateStartupAliquota({
      impostaSostitutiva: 5,
      dataAperturaPiva: '2021-03-15',
      startupRequisitiAutocertificati: true
    }, {}, 2026);
    expect(res.applicable).toBe(false);
    var joined = res.warnings.join('|');
    expect(/scaduti i 5 anni/.test(joined)).toBe(true);
    expect(res.meta.yearsSincePivaOpen).toBe(5);
  });

  test('impostaSostitutiva=5 + apertura 2022, year=2026 + autocertificati → applicable=true', function() {
    var res = DE.validateStartupAliquota({
      impostaSostitutiva: 5,
      dataAperturaPiva: '2022-06-01',
      startupRequisitiAutocertificati: true
    }, {}, 2026);
    expect(res.applicable).toBe(true);
    expect(res.warnings.length).toBe(0);
  });

  test('impostaSostitutiva=5 + apertura valida ma requisiti non autocertificati → warn requisiti', function() {
    var res = DE.validateStartupAliquota({
      impostaSostitutiva: 5,
      dataAperturaPiva: '2023-01-10',
      startupRequisitiAutocertificati: false
    }, {}, 2026);
    expect(res.applicable).toBe(false);
    var joined = res.warnings.join('|');
    expect(/Requisiti soggettivi/.test(joined)).toBe(true);
  });

  test('validateDichiarazione includes startup warnings when applicable', function() {
    // Build a minimal dich with a _validationContext we inject to trigger startup check
    var dich = {
      frontespizio: { codiceFiscale: 'RSSMRA80A01H501U', cognome: 'Rossi', nome: 'Mario', dataNascita: '1980-01-01' },
      quadroLM: { LM2: { value: 30000 } },
      quadroRR: {},
      quadroRW: {},
      _validationContext: {
        settings: { impostaSostitutiva: 5, dataAperturaPiva: '2021-01-01', startupRequisitiAutocertificati: true },
        yearData: {},
        year: 2026
      }
    };
    var res = DE.validateDichiarazione(dich);
    var codes = res.warnings.map(function(w) { return w.code; });
    var hasStartup = codes.some(function(c) { return /startup_aliquota/.test(c); });
    expect(hasStartup).toBe(true);
  });
});
