'use strict';
var DE = require('../dichiarazione-engine.js');

describe('buildQuadroRW — criptovalute IC 2‰ (L. 197/2022)', function() {

  test('cripto valoreFinale 10.000 produce IC 20 (2 per mille)', function() {
    var rw = DE.buildQuadroRW([
      { tipo: 'criptovalute', exchange: 'Binance', walletAddress: '0xABC...', valoreFinale: 10000, quotaPossesso: 1 }
    ]);
    expect(rw.righi.length).toBe(1);
    expect(rw.righi[0].icRigoDovuto).toBe(20);
    expect(rw.totali.icTotale).toBe(20);
    expect(rw.righi[0].ivafeRigoDovuto).toBe(0);
    expect(rw.righi[0].ivieRigoDovuto).toBe(0);
  });

  test('cripto con quota 50% su 10.000 produce IC 10', function() {
    var rw = DE.buildQuadroRW([
      { tipo: 'criptovalute', exchange: 'Coinbase', valoreFinale: 10000, quotaPossesso: 0.5 }
    ]);
    expect(rw.righi[0].icRigoDovuto).toBe(10);
    expect(rw.totali.icTotale).toBe(10);
  });

  test('cripto valoreFinale=0 — rigo presente per obbligo monitoraggio, IC=0', function() {
    var rw = DE.buildQuadroRW([
      { tipo: 'criptovalute', exchange: 'Kraken', walletAddress: '0xDEF...', valoreFinale: 0, quotaPossesso: 1 }
    ]);
    expect(rw.righi.length).toBe(1);
    expect(rw.righi[0].icRigoDovuto).toBe(0);
    expect(rw.totali.icTotale).toBe(0);
    expect(rw.righi[0].tipo).toBe('criptovalute');
  });

  test('backward-compat conto corrente — IVAFE 20 invariata + icTotale=0', function() {
    var rw = DE.buildQuadroRW([
      { paese: 'DE', tipo: 'conto_corrente', giacenzaMediaAnnua: 10000, quotaPossesso: 1 }
    ]);
    expect(rw.righi[0].ivafeRigoDovuto).toBe(20);
    expect(rw.totali.ivafeTotale).toBe(20);
    expect(rw.totali.icTotale).toBe(0);
    // shape consistency: icRigoDovuto presente anche su righi non-cripto
    expect(rw.righi[0].icRigoDovuto).toBe(0);
  });
});

describe('C-A3 v2 — sanitize input cripto', function () {
  var Engine = DE;

  test('valoreFinale negativo → trattato come 0 + warning', function () {
    var r = Engine.buildQuadroRW([{ tipo: 'criptovalute', valoreFinale: -500, quotaPossesso: 1 }]);
    expect(r.righi[0].icRigoDovuto).toBe(0);
    expect(r.righi[0].valoreFinale >= 0).toBe(true);
    var hasWarn = (r.warnings && r.warnings.length > 0)
      || (r.righi[0]._warnings && r.righi[0]._warnings.length > 0);
    expect(hasWarn).toBe(true);
  });

  test('quotaPossesso > 1 clampata a 1', function () {
    var r = Engine.buildQuadroRW([{ tipo: 'criptovalute', valoreFinale: 10000, quotaPossesso: 1.5 }]);
    expect(r.righi[0].quotaPossesso).toBe(1);
    expect(r.righi[0].icRigoDovuto).toBe(20);
  });

  test('quotaPossesso negativa clampata a 0', function () {
    var r = Engine.buildQuadroRW([{ tipo: 'criptovalute', valoreFinale: 10000, quotaPossesso: -0.3 }]);
    expect(r.righi[0].quotaPossesso).toBe(0);
    expect(r.righi[0].icRigoDovuto).toBe(0);
  });

  test('quotaPossesso fuori range emette warning', function () {
    var r = Engine.buildQuadroRW([{ tipo: 'criptovalute', valoreFinale: 10000, quotaPossesso: 2 }]);
    var hasWarn = (r.warnings || []).concat(r.righi[0]._warnings || []).some(function (w) {
      return /quota/i.test(String(w));
    });
    expect(hasWarn).toBe(true);
  });
});
