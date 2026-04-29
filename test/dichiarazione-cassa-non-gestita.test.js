'use strict';
// CASSE-1: warning su cassa autonoma non gestita in buildQuadroRR
var Engine = require('../dichiarazione-engine.js');
if (!Engine) throw new Error('DichiarazioneEngine non caricato');

describe('CASSE-1 — cassa autonoma non gestita', function () {
  test('inpsMode="inarcassa" → warning RR_CASSA_NON_GESTITA', function () {
    var qLM = { LM4: { value: 30000 } };
    var rr = Engine.buildQuadroRR({ pagamenti: [] }, { inpsMode: 'inarcassa' }, qLM, {});
    expect(Array.isArray(rr._warnings)).toBe(true);
    var hit = (rr._warnings || []).some(function (w) {
      return w.code === 'RR_CASSA_NON_GESTITA' && /INARCASSA|CNPADC/.test(w.message);
    });
    expect(hit).toBe(true);
  });

  test('inpsMode="artcom" (alias legacy) → no warning', function () {
    var qLM = { LM4: { value: 30000 } };
    var rr = Engine.buildQuadroRR({ pagamenti: [] }, { inpsMode: 'artcom' }, qLM, {});
    var hit = (rr._warnings || []).some(function (w) { return w.code === 'RR_CASSA_NON_GESTITA'; });
    expect(hit).toBe(false);
  });

  test('inpsMode="artigiani_commercianti" → no warning', function () {
    var qLM = { LM4: { value: 30000 } };
    var rr = Engine.buildQuadroRR({ pagamenti: [] }, { inpsMode: 'artigiani_commercianti' }, qLM, {});
    var hit = (rr._warnings || []).some(function (w) { return w.code === 'RR_CASSA_NON_GESTITA'; });
    expect(hit).toBe(false);
  });

  test('inpsMode="gestione_separata" → no warning', function () {
    var qLM = { LM4: { value: 30000 } };
    var rr = Engine.buildQuadroRR({ pagamenti: [] }, { inpsMode: 'gestione_separata' }, qLM, {});
    var hit = (rr._warnings || []).some(function (w) { return w.code === 'RR_CASSA_NON_GESTITA'; });
    expect(hit).toBe(false);
  });

  test('inpsMode mancante (undefined) → no warning (default art-comm)', function () {
    var qLM = { LM4: { value: 30000 } };
    var rr = Engine.buildQuadroRR({ pagamenti: [] }, {}, qLM, {});
    var hit = (rr._warnings || []).some(function (w) { return w.code === 'RR_CASSA_NON_GESTITA'; });
    expect(hit).toBe(false);
  });

  test('validateDichiarazione propaga RR_CASSA_NON_GESTITA come warning', function () {
    var dich = {
      frontespizio: {
        codiceFiscale: 'RSSMRA80A01H501U',
        cognome: 'Rossi', nome: 'Mario', dataNascita: '1980-01-01'
      },
      quadroRR: {
        sezI: { RR8: { value: 0 } },
        _warnings: [
          { severity: 'error', code: 'RR_CASSA_NON_GESTITA', message: 'Cassa "inarcassa" non gestita' }
        ]
      }
    };
    var v = Engine.validateDichiarazione(dich);
    var hit = (v.errors || []).some(function (e) { return e.code === 'RR_CASSA_NON_GESTITA'; });
    expect(hit).toBe(true);
  });
});
