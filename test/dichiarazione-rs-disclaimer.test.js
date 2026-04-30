'use strict';
// R10 — Disclaimer Quadro RS informativo per forfettari.
// - buildQuadroRS deve ritornare _disclaimer (stringa non vuota)
// - validateDichiarazione emette warning 'RS_INFORMATIVO' severity 'info' se
//   almeno un rigo RS è > 0.

var fixtures = require('./dichiarazione-fixtures.js');
var DE = require('../dichiarazione-engine.js');

describe('R10 — Quadro RS disclaimer informativo', function () {
  test('buildQuadroRS espone _disclaimer come stringa non vuota', function () {
    var yd = fixtures.artigianoStandard2025;
    var rs = DE.buildQuadroRS(yd, yd.settings, {});
    expect(typeof rs._disclaimer).toBe('string');
    expect(rs._disclaimer.length > 0).toBe(true);
    // Sanity: menziona "informativi" o "NON deducono"
    expect(/informativ|non deducon|NON deducon/i.test(rs._disclaimer)).toBe(true);
  });

  test('buildQuadroRS: _disclaimer presente anche con override', function () {
    var yd = fixtures.artigianoStandard2025;
    var rs = DE.buildQuadroRS(yd, yd.settings, { RS371_value: 2500 });
    expect(typeof rs._disclaimer).toBe('string');
    expect(rs._disclaimer.length > 0).toBe(true);
  });

  test('validateDichiarazione: nessun warning RS_INFORMATIVO se tutti i righi sono 0', function () {
    var yd = fixtures.artigianoStandard2025;
    var rs = DE.buildQuadroRS(yd, yd.settings, {});
    var dich = { quadroRS: rs };
    var res = DE.validateDichiarazione(dich);
    var found = res.warnings.filter(function (w) { return w.code === 'RS_INFORMATIVO'; });
    expect(found.length).toBe(0);
  });

  test('validateDichiarazione: warning RS_INFORMATIVO se almeno un rigo > 0', function () {
    var yd = fixtures.artigianoStandard2025;
    var rs = DE.buildQuadroRS(yd, yd.settings, { RS371_value: 2500 });
    var dich = { quadroRS: rs };
    var res = DE.validateDichiarazione(dich);
    var found = res.warnings.filter(function (w) { return w.code === 'RS_INFORMATIVO'; });
    expect(found.length).toBe(1);
    expect(found[0].severity).toBe('info');
    expect(found[0].quadro).toBe('RS');
    expect(/informativ/i.test(found[0].message)).toBe(true);
  });

  test('validateDichiarazione: warning solo una volta anche con più righi valorizzati', function () {
    var yd = fixtures.artigianoStandard2025;
    var rs = DE.buildQuadroRS(yd, yd.settings, {
      RS371_value: 1000,
      RS375_value: 500,
      RS377_value: 200
    });
    var dich = { quadroRS: rs };
    var res = DE.validateDichiarazione(dich);
    var found = res.warnings.filter(function (w) { return w.code === 'RS_INFORMATIVO'; });
    expect(found.length).toBe(1);
  });

  test('validateDichiarazione: valore 0 esplicito non attiva warning', function () {
    var yd = fixtures.artigianoStandard2025;
    var rs = DE.buildQuadroRS(yd, yd.settings, { RS371_value: 0 });
    var dich = { quadroRS: rs };
    var res = DE.validateDichiarazione(dich);
    var found = res.warnings.filter(function (w) { return w.code === 'RS_INFORMATIVO'; });
    expect(found.length).toBe(0);
  });

  test('validateDichiarazione senza quadroRS: no warning e nessun crash', function () {
    var res = DE.validateDichiarazione({});
    var found = res.warnings.filter(function (w) { return w.code === 'RS_INFORMATIVO'; });
    expect(found.length).toBe(0);
  });
});
