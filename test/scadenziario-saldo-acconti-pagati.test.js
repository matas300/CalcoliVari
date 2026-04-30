'use strict';
// Test per fix C1 (tax audit 2026-04-24):
// Il saldo dell'anno aperto deve essere calcolato netto degli acconti
// effettivamente versati (pagamenti con scheduleKey = `{prefix}_acc[12]_{year}`),
// non degli acconti pianificati (accontiTotals.total).
// Gli anni chiusi devono mantenere la logica pre-esistente.
var Helpers = require('../scadenziario-saldo-helpers.js');
var computeAutoSaldoAnnoAperto = Helpers.computeAutoSaldoAnnoAperto;
var sumPagamentiForSaldoKeys = Helpers.sumPagamentiForSaldoKeys;

describe('scadenziario saldo — acconti effettivamente versati (fix C1)', function () {
  describe('imposta sostitutiva', function () {
    test('anno aperto con pagamenti: saldo = tasse − pagati (non − planned)', function () {
      var pagamenti = [
        { scheduleKey: 'imposta_acc1_2026', importo: 800, tipo: 'tasse' },
        { scheduleKey: 'imposta_acc2_2026', importo: 1200, tipo: 'tasse' }
      ];
      var res = computeAutoSaldoAnnoAperto(
        5000,               // currentApplied.tasse
        { total: 1500 },    // impostaAcconti.total pianificato
        pagamenti,
        2026,
        false,              // anno aperto
        'imposta'
      );
      expect(res.source).toBe('paid');
      expect(res.accontiUsati).toBe(2000);
      // 5000 − 2000 = 3000 (non 5000 − 1500 = 3500)
      expect(res.saldo).toBe(3000);
    });

    test('anno aperto senza pagamenti: saldo = tasse − 0 (non tasse − planned)', function () {
      var res = computeAutoSaldoAnnoAperto(
        5000,
        { total: 1500 },
        [],                 // nessun pagamento
        2026,
        false,
        'imposta'
      );
      expect(res.source).toBe('paid');
      expect(res.accontiUsati).toBe(0);
      expect(res.saldo).toBe(5000);
    });

    test('anno chiuso: logica invariata (usa accontiTotals.total)', function () {
      var pagamenti = [
        { scheduleKey: 'imposta_acc1_2024', importo: 2000, tipo: 'tasse' }
      ];
      var res = computeAutoSaldoAnnoAperto(
        5000,
        { total: 1500 },
        pagamenti,          // i pagamenti qui NON devono essere usati
        2024,
        true,               // anno chiuso
        'imposta'
      );
      expect(res.source).toBe('planned');
      expect(res.accontiUsati).toBe(1500);
      expect(res.saldo).toBe(3500);
    });

    test('anno aperto: pagamenti su altre chiavi vengono ignorati', function () {
      var pagamenti = [
        { scheduleKey: 'imposta_saldo_2025', importo: 1000, tipo: 'tasse' },
        { scheduleKey: 'contributi_acc1_2026', importo: 500, tipo: 'contributi' },
        { scheduleKey: 'imposta_acc1_2026', importo: 700, tipo: 'tasse' }
      ];
      var res = computeAutoSaldoAnnoAperto(
        5000,
        { total: 2000 },
        pagamenti,
        2026,
        false,
        'imposta'
      );
      expect(res.accontiUsati).toBe(700);
      expect(res.saldo).toBe(4300);
    });
  });

  describe('contributi (INPS variabile)', function () {
    test('anno aperto con pagamenti: saldo = base − pagati', function () {
      var pagamenti = [
        { scheduleKey: 'contributi_acc1_2026', importo: 300, tipo: 'contributi' },
        { scheduleKey: 'contributi_acc2_2026', importo: 450, tipo: 'contributi' }
      ];
      var res = computeAutoSaldoAnnoAperto(
        2000,               // currentContribution.saldoAccontoBase
        { total: 600 },
        pagamenti,
        2026,
        false,
        'contributi'
      );
      expect(res.source).toBe('paid');
      expect(res.accontiUsati).toBe(750);
      expect(res.saldo).toBe(1250);
    });

    test('anno aperto senza pagamenti contributivi: saldo = base', function () {
      var res = computeAutoSaldoAnnoAperto(
        2000,
        { total: 600 },
        [],
        2026,
        false,
        'contributi'
      );
      expect(res.accontiUsati).toBe(0);
      expect(res.saldo).toBe(2000);
    });

    test('anno chiuso contributi: logica invariata', function () {
      var res = computeAutoSaldoAnnoAperto(
        2000,
        { total: 600 },
        [{ scheduleKey: 'contributi_acc1_2024', importo: 900, tipo: 'contributi' }],
        2024,
        true,
        'contributi'
      );
      expect(res.source).toBe('planned');
      expect(res.saldo).toBe(1400);
    });
  });

  describe('edge case: pagamento tipo misto', function () {
    // DECISIONE: seguiamo il pattern già in uso a app.js:4462-4468 per gli
    // acconti anno N-1 — filtriamo per scheduleKey esatto e ignoriamo il campo
    // `tipo`. La scheduleKey identifica il bucket (imposta vs contributi),
    // quindi un pagamento misto con scheduleKey='imposta_acc1_2026' viene
    // contato correttamente sul lato imposte. Non c'è doppio conteggio
    // perché ogni pagamento ha al più una scheduleKey.
    test('pagamento misto con scheduleKey imposta viene contato sul lato imposta', function () {
      var pagamenti = [
        { scheduleKey: 'imposta_acc1_2026', importo: 1000, tipo: 'misto' }
      ];
      var resImposta = computeAutoSaldoAnnoAperto(
        3000, { total: 500 }, pagamenti, 2026, false, 'imposta'
      );
      expect(resImposta.accontiUsati).toBe(1000);

      var resContrib = computeAutoSaldoAnnoAperto(
        1500, { total: 500 }, pagamenti, 2026, false, 'contributi'
      );
      // Stesso pagamento NON viene contato sui contributi
      expect(resContrib.accontiUsati).toBe(0);
    });
  });

  describe('sumPagamentiForSaldoKeys', function () {
    test('somma solo le scheduleKey richieste', function () {
      var pagamenti = [
        { scheduleKey: 'imposta_acc1_2026', importo: 100 },
        { scheduleKey: 'imposta_acc2_2026', importo: 200 },
        { scheduleKey: 'imposta_saldo_2025', importo: 999 }
      ];
      expect(sumPagamentiForSaldoKeys(pagamenti, [
        'imposta_acc1_2026', 'imposta_acc2_2026'
      ])).toBe(300);
    });

    test('input non-array o vuoto → 0', function () {
      expect(sumPagamentiForSaldoKeys(null, ['x'])).toBe(0);
      expect(sumPagamentiForSaldoKeys([], ['x'])).toBe(0);
    });

    test('importi non numerici vengono ignorati', function () {
      var pagamenti = [
        { scheduleKey: 'imposta_acc1_2026', importo: 'abc' },
        { scheduleKey: 'imposta_acc1_2026', importo: 50 }
      ];
      expect(sumPagamentiForSaldoKeys(pagamenti, ['imposta_acc1_2026'])).toBe(50);
    });
  });
});
