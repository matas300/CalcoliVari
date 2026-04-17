'use strict';
var fixtures = require('./dichiarazione-fixtures.js');
var DE = require('../dichiarazione-engine.js');

describe('DichiarazioneEngine stubs', function() {
  test('VERSION is 0.1.0', function() {
    expect(DE.VERSION).toBe('0.1.0');
  });
  test('buildDichiarazione returns object', function() {
    var result = DE.buildDichiarazione();
    expect(typeof result).toBe('object');
  });
  test('validateDichiarazione returns errors and warnings arrays', function() {
    var result = DE.validateDichiarazione({});
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

describe('validateCodiceFiscale', function() {
  test('accepts valid CF RSSMRA80A01H501U', function() {
    expect(DE.validateCodiceFiscale('RSSMRA80A01H501U')).toBe(true);
  });
  test('rejects empty string', function() {
    expect(DE.validateCodiceFiscale('')).toBe(false);
  });
  test('rejects short string', function() {
    expect(DE.validateCodiceFiscale('RSSMRA80')).toBe(false);
  });
  test('rejects wrong check digit', function() {
    // RSSMRA80A01H501X has wrong last char (should be U)
    expect(DE.validateCodiceFiscale('RSSMRA80A01H501X')).toBe(false);
  });
  test('accepts CF in lowercase (auto-uppercase)', function() {
    expect(DE.validateCodiceFiscale('rssmra80a01h501u')).toBe(true);
  });
});

describe('buildFrontespizio', function() {
  test('copies CF and name from anagrafica', function() {
    var fp = DE.buildFrontespizio(fixtures.artigianoStandard2025, 2025, { tipoDichiarazione: 'ordinaria' });
    expect(fp.codiceFiscale).toBe('RSSMRA80A01H501U');
    expect(fp.cognome).toBe('Rossi');
    expect(fp.nome).toBe('Mario');
    expect(fp.annoImposta).toBe(2025);
    expect(fp.tipoDichiarazione).toBe('ordinaria');
  });
  test('uses input tipoDichiarazione', function() {
    var fp = DE.buildFrontespizio(fixtures.artigianoStandard2025, 2025, { tipoDichiarazione: 'integrativa' });
    expect(fp.tipoDichiarazione).toBe('integrativa');
  });
});

describe('buildQuadroLM', function() {
  test('4a: standard artigiano 60k ricavi, coeff 67%, aliquota 15%', function() {
    var yd = fixtures.artigianoStandard2025;
    var lm = DE.buildQuadroLM(yd, yd.settings, {});
    // LM1: 12 * 5000 = 60000
    expect(lm.LM1.value).toBe(60000);
    // LM2: 60000 * 0.67 = 40200
    expect(lm.LM2.value).toBe(40200);
    // LM36 = LM34 * 0.15 (rounded to 2 decimals)
    expect(lm.LM36.value).toBe(Math.round((lm.LM34.value * 0.15) * 100) / 100);
    expect(lm.LM36.source).toBe('computed');
  });
  test('4b: startup aliquota 5%', function() {
    var yd = fixtures.gestSepStartup2025;
    var lm = DE.buildQuadroLM(yd, yd.settings, {});
    expect(lm.LM36.value).toBe(Math.round((lm.LM34.value * 0.05) * 100) / 100);
  });
  test('4c: perdite pregresse reduce LM34', function() {
    var yd = fixtures.artigianoStandard2025;
    var lm = DE.buildQuadroLM(yd, yd.settings, { LM_perditePregresse: 5000 });
    var lmBase = DE.buildQuadroLM(yd, yd.settings, {});
    expect(lm.LM34.value).toBe(Math.max(0, lmBase.LM34.value - 5000));
  });
  test('4d: override LM2 prevale sul calcolato', function() {
    var yd = fixtures.artigianoStandard2025;
    var lm = DE.buildQuadroLM(yd, yd.settings, { LM2_value: 41000 });
    expect(lm.LM2.value).toBe(41000);
    expect(lm.LM2.source).toBe('override');
  });
  test('4e: LM34 cannot be negative', function() {
    var yd = fixtures.artigianoStandard2025;
    // Override with huge perdite
    var lm = DE.buildQuadroLM(yd, yd.settings, { LM_perditePregresse: 999999 });
    expect(lm.LM34.value).toBe(0);
  });
});

describe('buildQuadroRR', function() {
  test('artigiano: RR4 > 0, RR8 >= 0', function() {
    var yd = fixtures.artigianoStandard2025;
    var lm = DE.buildQuadroLM(yd, yd.settings, {});
    var rr = DE.buildQuadroRR(yd, yd.settings, lm, {});
    expect(rr.sezI).toBeTruthy();
    expect(rr.sezI.RR4.value).toBeGreaterThan(0);
    expect(rr.sezI.RR8.value).toBeGreaterThan(-1); // >= 0
  });
  test('commerciante con riduzione35: contributi ridotti', function() {
    var yd = fixtures.commercianteRiduzione2025;
    var lm = DE.buildQuadroLM(yd, yd.settings, {});
    var rrBase = DE.buildQuadroRR(yd, Object.assign({}, yd.settings, { riduzione35: 0 }), lm, {});
    var rrRid = DE.buildQuadroRR(yd, yd.settings, lm, {});
    expect(rrRid.sezI.RR4.value).toBeLessThan(rrBase.sezI.RR4.value);
  });
  test('gestione separata: popola sezII, nessuna sezI', function() {
    var yd = fixtures.gestSepStartup2025;
    var lm = DE.buildQuadroLM(yd, yd.settings, {});
    var rr = DE.buildQuadroRR(yd, yd.settings, lm, {});
    expect(rr.sezI).toBe(null);
    expect(rr.sezII).toBeTruthy();
    expect(rr.sezII.RR20.value).toBeGreaterThan(0);
  });
  test('reddito sotto minimale: RR3 = 0', function() {
    var yd = fixtures.artigianoStandard2025;
    var lowSettings = Object.assign({}, yd.settings, { minimaleInps: 99999 });
    var lm = DE.buildQuadroLM(yd, lowSettings, {});
    var rr = DE.buildQuadroRR(yd, lowSettings, lm, {});
    expect(rr.sezI.RR3.value).toBe(0);
  });
});

describe('buildQuadroRS', function() {
  test('spese vuote: tutti righi a 0', function() {
    var yd = fixtures.artigianoStandard2025;
    var rs = DE.buildQuadroRS(yd, yd.settings, {});
    expect(rs.RS371.value).toBe(0);
    expect(rs.RS381.value).toBe(0);
  });
  test('override RS371_value = 2500 prevale', function() {
    var yd = fixtures.artigianoStandard2025;
    var rs = DE.buildQuadroRS(yd, yd.settings, { RS371_value: 2500 });
    expect(rs.RS371.value).toBe(2500);
    expect(rs.RS371.source).toBe('override');
  });
});

describe('buildQuadroRX', function() {
  test('nessun credito precedente: RX1 = 0', function() {
    var yd = fixtures.artigianoStandard2025;
    var rx = DE.buildQuadroRX(yd, yd.settings, null, {});
    expect(rx.RX1.value).toBe(0);
  });
  test('credito anno precedente 800: RX1 = 800', function() {
    var yd = fixtures.artigianoStandard2025;
    var precedente = { eccedenza: 800 };
    var rx = DE.buildQuadroRX(yd, yd.settings, precedente, {});
    expect(rx.RX1.value).toBe(800);
  });
  test('credito 800 si compensa con debito', function() {
    var yd = fixtures.artigianoStandard2025;
    var precedente = { eccedenza: 800 };
    var rx = DE.buildQuadroRX(yd, yd.settings, precedente, {});
    // RX1 should hold the credit
    expect(rx.RX1.value).toBe(800);
  });
});

describe('buildQuadroRW', function() {
  test('2 conti esteri produce 2 righi', function() {
    var conti = [
      { paese: 'DE', tipoConto: 'conto corrente', iban: 'DE89370400440532013000', valoreIniziale: 5000, valoreFinale: 6000, giorniDetenzione: 365, valutaCodice: 'EUR' },
      { paese: 'US', tipoConto: 'conto deposito', iban: 'US12345', valoreIniziale: 2000, valoreFinale: 2500, giorniDetenzione: 180, valutaCodice: 'USD' }
    ];
    var rw = DE.buildQuadroRW(conti);
    expect(rw.righi.length).toBe(2);
    expect(rw.righi[0].paese).toBe('DE');
    expect(rw.righi[1].valoreFinale).toBe(2500);
  });
  test('lista vuota produce righi vuoti', function() {
    var rw = DE.buildQuadroRW([]);
    expect(rw.righi.length).toBe(0);
  });
  test('conto con valoreFinale mancante non blocca', function() {
    var conti = [{ paese: 'FR', tipoConto: 'test', iban: '', valoreIniziale: 0, giorniDetenzione: 100, valutaCodice: 'EUR' }];
    var rw = DE.buildQuadroRW(conti);
    expect(rw.righi.length).toBe(1);
  });
});

describe('buildCondizionali', function() {
  test('nessun flag: result vuoto', function() {
    var yd = fixtures.artigianoStandard2025;
    var input = { flags: { annoMisto: false, imposteEstere: false, altriCrediti: false } };
    var res = DE.buildCondizionali(input, yd);
    expect(Object.keys(res).length).toBe(0);
  });
  test('annoMisto: produce quadroRN con reddito dipendente', function() {
    var yd = fixtures.artigianoStandard2025;
    var input = { flags: { annoMisto: true, imposteEstere: false, altriCrediti: false }, redditoDipendente: 30000 };
    var res = DE.buildCondizionali(input, yd);
    expect(res.quadroRN).toBeTruthy();
    expect(res.quadroRN.redditoDipendente).toBe(30000);
  });
  test('imposteEstere: produce quadroCE', function() {
    var yd = fixtures.artigianoStandard2025;
    var input = { flags: { annoMisto: false, imposteEstere: true, altriCrediti: false }, creditoImposteEstere: 500 };
    var res = DE.buildCondizionali(input, yd);
    expect(res.quadroCE).toBeTruthy();
    expect(res.quadroCE.CE1.value).toBe(500);
  });
});

describe('buildDichiarazione', function() {
  test('artigiano standard produce tutti i quadri core', function() {
    var yd = fixtures.artigianoStandard2025;
    var input = { tipoDichiarazione: 'ordinaria', flags: { annoMisto: false, imposteEstere: false, altriCrediti: false }, contiEsteri: [], overrides: {} };
    var dich = DE.buildDichiarazione(2025, yd, input);
    expect(dich.frontespizio).toBeTruthy();
    expect(dich.quadroLM).toBeTruthy();
    expect(dich.quadroRR).toBeTruthy();
    expect(dich.quadroRS).toBeTruthy();
    expect(dich.quadroRX).toBeTruthy();
    expect(dich.quadroRW).toBeTruthy();
    expect(dich._meta.timestamp).toBeTruthy();
  });
  test('anno misto: produce quadroRN', function() {
    var yd = fixtures.artigianoStandard2025;
    var input = { tipoDichiarazione: 'ordinaria', flags: { annoMisto: true, imposteEstere: false, altriCrediti: false }, contiEsteri: [], overrides: {}, redditoDipendente: 25000 };
    var dich = DE.buildDichiarazione(2025, yd, input);
    expect(dich.quadroRN).toBeTruthy();
  });
});

describe('validateDichiarazione', function() {
  test('CF invalido produce error', function() {
    var yd = fixtures.artigianoStandard2025;
    var input = { flags: { annoMisto: false, imposteEstere: false, altriCrediti: false }, contiEsteri: [], overrides: {} };
    var dich = DE.buildDichiarazione(2025, yd, input);
    dich.frontespizio.codiceFiscale = 'INVALID';
    var v = DE.validateDichiarazione(dich);
    var cfError = v.errors.find(function(e) { return e.code === 'CF_INVALID'; });
    expect(cfError).toBeTruthy();
  });
  test('reddito > 85000 produce warning', function() {
    var yd = fixtures.artigianoStandard2025;
    var input = { flags: { annoMisto: false, imposteEstere: false, altriCrediti: false }, contiEsteri: [], overrides: { LM1_value: 130000, LM2_value: 87100 } };
    var dich = DE.buildDichiarazione(2025, yd, input);
    var v = DE.validateDichiarazione(dich);
    var warn = v.warnings.find(function(w) { return w.code === 'REDDITO_OLTRE_SOGLIA_85K'; });
    expect(warn).toBeTruthy();
  });
  test('reddito > 100000 produce warning critico', function() {
    var yd = fixtures.artigianoStandard2025;
    var input = { flags: { annoMisto: false, imposteEstere: false, altriCrediti: false }, contiEsteri: [], overrides: { LM1_value: 160000, LM2_value: 107200 } };
    var dich = DE.buildDichiarazione(2025, yd, input);
    var v = DE.validateDichiarazione(dich);
    var warn = v.warnings.find(function(w) { return w.code === 'REDDITO_OLTRE_SOGLIA_100K'; });
    expect(warn).toBeTruthy();
  });
  test('RW con paese vuoto produce error', function() {
    var yd = fixtures.artigianoStandard2025;
    var input = { flags: { annoMisto: false, imposteEstere: false, altriCrediti: false }, contiEsteri: [{ paese: '', valoreFinale: 1000, giorniDetenzione: 365 }], overrides: {} };
    var dich = DE.buildDichiarazione(2025, yd, input);
    var v = DE.validateDichiarazione(dich);
    var rwError = v.errors.find(function(e) { return e.code === 'RW_PAESE_MANCANTE'; });
    expect(rwError).toBeTruthy();
  });
  test('CF valido e dati completi: nessun error CF', function() {
    var yd = fixtures.artigianoStandard2025;
    var input = { flags: { annoMisto: false, imposteEstere: false, altriCrediti: false }, contiEsteri: [], overrides: {} };
    var dich = DE.buildDichiarazione(2025, yd, input);
    var v = DE.validateDichiarazione(dich);
    var cfError = v.errors.find(function(e) { return e.code === 'CF_INVALID'; });
    expect(cfError).toBeFalsy();
  });
});

var DichExports = require('../dichiarazione-exports.js');

describe('DichiarazioneExports.buildCSV', function() {
  test('produces CSV with header row', function() {
    var fakeDich = {
      quadroLM: { LM1: { value: 60000, descrizione: 'Ricavi', source: 'computed' } },
      quadroRR: { sezI: { RR4: { value: 4500, descrizione: 'Totale INPS', source: 'computed' } }, sezII: null }
    };
    var csv = DichExports.buildCSV(fakeDich);
    expect(csv).toMatch(/quadro,rigo,valore,descrizione,fonte/i);
    expect(csv).toMatch(/LM,LM1,60000/);
  });
  test('produces valid JSON string', function() {
    var fakeDich = { frontespizio: { codiceFiscale: 'RSSMRA80A01H501U' } };
    var json = DichExports.buildJSON(fakeDich);
    var parsed = JSON.parse(json);
    expect(parsed.frontespizio.codiceFiscale).toBe('RSSMRA80A01H501U');
  });
});
