'use strict';
var Exports = require('../dichiarazione-exports.js');

describe('C-A3 v2 — esposizione IC nel CSV export', function () {
  test('CSV expose IC quando cripto presenti', function () {
    var dich = {
      quadroRW: {
        righi: [{ tipo: 'criptovalute', valoreFinale: 10000, quotaPossesso: 1, icRigoDovuto: 20 }],
        totali: { ivafeTotale: 0, ivieTotale: 0, icTotale: 20 }
      }
    };
    var csv = Exports.buildCSV(dich);
    expect(/RW,RW1_IC,20/.test(csv)).toBe(true);
    expect(/RW,_TOT_IC,20/.test(csv)).toBe(true);
  });

  test('CSV non emette righe IC quando IC=0 (backward-compat conto corrente)', function () {
    var dich = {
      quadroRW: {
        righi: [{ tipo: 'conto_corrente', paese: 'DE', valoreFinale: 10000, ivafeRigoDovuto: 20, icRigoDovuto: 0 }],
        totali: { ivafeTotale: 20, ivieTotale: 0, icTotale: 0 }
      }
    };
    var csv = Exports.buildCSV(dich);
    expect(/_IC/.test(csv)).toBe(false);
    expect(/RW,RW1_IVAFE,20/.test(csv)).toBe(true);
    expect(/RW,_TOT_IVAFE,20/.test(csv)).toBe(true);
  });
});
