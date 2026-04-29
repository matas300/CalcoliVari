'use strict';
var DE = require('../dichiarazione-engine.js');
if (!DE) throw new Error('DichiarazioneEngine non caricato');

function lmWith(reddito) {
  return { LM4: { value: reddito, descrizione: '', source: 'computed' } };
}

describe('REG-2 — aliquota GS fallback 26.07', function () {

  test('settings senza aliqContributi → fallback 26.07 (non 26.23)', function () {
    var yearData = { pagamenti: [] };
    var settings = {
      regime: 'forfettario',
      inpsMode: 'gestione_separata'
      // aliqContributi assente — deve usare fallback
    };
    var quadroLM = lmWith(10000);

    var rr = DE.buildQuadroRR(yearData, settings, quadroLM, {});

    // RR20 = imponibile × aliquota / 100
    // atteso post-fix:  10000 × 26.07 / 100 = 2607.00
    // valore bug pre-fix: 10000 × 26.23 / 100 = 2623.00
    var actual = rr.sezII && rr.sezII.RR20 && rr.sezII.RR20.value;
    if (actual === undefined || actual === null) {
      throw new Error('REG-2 test: rr.sezII.RR20 non trovato (sezII = ' + JSON.stringify(rr.sezII) + ')');
    }
    if (Math.abs(actual - 2607) > 0.5) {
      throw new Error('REG-2 FAIL: RR20.value = ' + actual + ', atteso 2607.00 (10000 × 26.07%). Fallback aliquota 26.23 non aggiornato a 26.07?');
    }
  });

  test('settings con aliqContributi esplicita → usa il valore fornito, non il fallback', function () {
    var yearData = { pagamenti: [] };
    var settings = {
      regime: 'forfettario',
      inpsMode: 'gestione_separata',
      aliqContributi: 26.23   // override esplicito (storico 2022-2023)
    };
    var quadroLM = lmWith(10000);

    var rr = DE.buildQuadroRR(yearData, settings, quadroLM, {});

    // 10000 × 26.23 / 100 = 2623.00
    var actual = rr.sezII && rr.sezII.RR20 && rr.sezII.RR20.value;
    if (Math.abs(actual - 2623) > 0.5) {
      throw new Error('REG-2 aliq esplicita FAIL: RR20.value = ' + actual + ', atteso 2623.00 (10000 × 26.23%)');
    }
  });

});
