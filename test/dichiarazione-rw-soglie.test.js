'use strict';
var DE = require('../dichiarazione-engine.js');

describe('buildQuadroRW — soglie IVAFE/IVIE (R2)', function() {

  test('conto corrente giacenza 10.000 produce IVAFE 20 (2 per mille)', function() {
    var rw = DE.buildQuadroRW([
      { paese: 'DE', codicePaese: 'DE', tipo: 'conto_corrente', giacenzaMediaAnnua: 10000, quotaPossesso: 1 }
    ]);
    expect(rw.righi.length).toBe(1);
    expect(rw.righi[0].ivafeRigoDovuto).toBe(20);
    expect(rw.totali.ivafeTotale).toBe(20);
    expect(rw.totali.ivieTotale).toBe(0);
  });

  test('conto corrente giacenza 3.000 produce IVAFE 6 e warning monitoraggio RW', function() {
    var rw = DE.buildQuadroRW([
      { paese: 'DE', tipo: 'conto_corrente', giacenzaMediaAnnua: 3000, quotaPossesso: 1 }
    ]);
    expect(rw.righi[0].ivafeRigoDovuto).toBe(6);
    // Warning su monitoraggio obbligatorio sotto soglia 5.000
    var hasRwWarn = (rw.righi[0]._warnings || []).some(function(w) {
      return /monitoraggio/i.test(w) || /5\.?000/.test(w);
    });
    expect(hasRwWarn).toBe(true);
  });

  test('immobile prima casa valore 100.000 produce IVIE 400 (0,4%)', function() {
    var rw = DE.buildQuadroRW([
      { paese: 'FR', tipo: 'immobile', valoreImmobile: 100000, primaCasa: true, quotaPossesso: 1 }
    ]);
    expect(rw.righi[0].ivieRigoDovuto).toBe(400);
    expect(rw.totali.ivieTotale).toBe(400);
    expect(rw.totali.ivafeTotale).toBe(0);
  });

  test('immobile non prima casa valore 40.000 produce IVIE 424 (1,06%)', function() {
    var rw = DE.buildQuadroRW([
      { paese: 'ES', tipo: 'immobile', valoreImmobile: 40000, primaCasa: false, quotaPossesso: 1 }
    ]);
    expect(rw.righi[0].ivieRigoDovuto).toBe(424);
  });

  test('immobile valore 10.000 sotto soglia minima 200 — IVIE=0 con warning', function() {
    var rw = DE.buildQuadroRW([
      { paese: 'US', tipo: 'immobile', valoreImmobile: 10000, primaCasa: false, quotaPossesso: 1 }
    ]);
    // 10000*0.0106 = 106 < 200 → azzerato
    expect(rw.righi[0].ivieRigoDovuto).toBe(0);
    var hasSogliaWarn = (rw.righi[0]._warnings || []).some(function(w) {
      return /soglia/i.test(w) || /200/.test(w);
    });
    expect(hasSogliaWarn).toBe(true);
  });

  test('quota possesso 0,5 su giacenza 20.000 produce IVAFE 20', function() {
    var rw = DE.buildQuadroRW([
      { paese: 'CH', tipo: 'deposito', giacenzaMediaAnnua: 20000, quotaPossesso: 0.5 }
    ]);
    // 20000 * 0.002 * 0.5 = 20
    expect(rw.righi[0].ivafeRigoDovuto).toBe(20);
  });

  test('rigo senza tipo/giacenza genera warning di default (backward compat)', function() {
    var rw = DE.buildQuadroRW([
      { paese: 'DE', iban: 'DE89370400440532013000', valoreIniziale: 5000, valoreFinale: 6000, giorniDetenzione: 365 }
    ]);
    expect(rw.righi.length).toBe(1);
    // Campi legacy preservati
    expect(rw.righi[0].paese).toBe('DE');
    expect(rw.righi[0].valoreFinale).toBe(6000);
    // Warning su soglia IVAFE da verificare
    var hasWarn = (rw.righi[0]._warnings || []).some(function(w) {
      return /soglia IVAFE/i.test(w) || /verificare/i.test(w);
    });
    expect(hasWarn).toBe(true);
  });

  test('totali aggregati su più righi (2 conti + 1 immobile)', function() {
    var rw = DE.buildQuadroRW([
      { paese: 'DE', tipo: 'conto_corrente', giacenzaMediaAnnua: 10000, quotaPossesso: 1 },
      { paese: 'CH', tipo: 'prodotti_finanziari', giacenzaMediaAnnua: 50000, quotaPossesso: 1 },
      { paese: 'FR', tipo: 'immobile', valoreImmobile: 200000, primaCasa: false, quotaPossesso: 1 }
    ]);
    // IVAFE: 10000*0.002 + 50000*0.002 = 20 + 100 = 120
    expect(rw.totali.ivafeTotale).toBe(120);
    // IVIE: 200000*0.0106 = 2120
    expect(rw.totali.ivieTotale).toBe(2120);
  });

  test('validateDichiarazione: warning aggregato quando contiEsteri presenti senza dettaglio', function() {
    // Costruisco una dichiarazione minima con un conto senza dettaglio
    var dich = DE.buildDichiarazione(2025, {
      settings: {
        anagrafica: { codiceFiscale: 'RSSMRA80A01H501U', nome: 'Mario', cognome: 'Rossi', dataNascita: '1980-01-01' }
      }
    }, {
      contiEsteri: [{ paese: 'DE', iban: 'X' }]
    });
    var res = DE.validateDichiarazione(dich);
    var hasRwAgg = (res.warnings || []).some(function(w) {
      return /Quadro RW/i.test(w.message || '') && /IVAFE|IVIE|tipo/i.test(w.message || '');
    });
    expect(hasRwAgg).toBe(true);
  });

  test('lista vuota — totali a zero', function() {
    var rw = DE.buildQuadroRW([]);
    expect(rw.righi.length).toBe(0);
    expect(rw.totali.ivafeTotale).toBe(0);
    expect(rw.totali.ivieTotale).toBe(0);
  });
});
