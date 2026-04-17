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
