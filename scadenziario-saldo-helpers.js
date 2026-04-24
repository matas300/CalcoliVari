'use strict';
// Helper puri per il calcolo del saldo (imposta sostitutiva / contributi) al netto
// degli acconti, con la semantica corretta per anno aperto vs anno chiuso.
//
// Contesto — audit fiscale 2026 fix C1:
//   - Anno CHIUSO (passato): logica invariata, si usa `accontiTotals.total`
//     (cioè la cifra calcolata dall'engine). Negli anni chiusi la discrepanza
//     non esiste perché i pagamenti ricalcano il calcolato.
//   - Anno APERTO (corrente/futuro): dobbiamo nettare il saldo degli acconti
//     EFFETTIVAMENTE versati (pagamenti registrati con `scheduleKey` =
//     `{prefix}_acc1_{year}` o `{prefix}_acc2_{year}`), non della cifra
//     pianificata. Altrimenti se l'utente ha già pagato 2.000 € ma il piano
//     ne prevedeva 1.500 €, il saldo calcolato sarebbe sovrastimato.
//
// Nota sul filtro: seguiamo il pattern già usato a app.js:4462-4468 per gli
// acconti anno N-1 — filtriamo per `scheduleKey` esatto e ignoriamo `tipo`.
// La `scheduleKey` identifica univocamente il bucket (imposta vs contributi),
// quindi un pagamento `tipo='misto'` con `scheduleKey='imposta_acc1_2026'`
// viene contato correttamente sul lato imposte. Non c'è doppio conteggio
// perché un pagamento ha un solo `scheduleKey`.
(function () {
  function ceil2(n) {
    var v = parseFloat(n);
    if (!isFinite(v)) return 0;
    return Math.ceil(v * 100) / 100;
  }

  function sumPagamentiForSaldoKeys(pagamenti, keys) {
    if (!Array.isArray(pagamenti) || pagamenti.length === 0) return 0;
    var wanted = {};
    for (var i = 0; i < keys.length; i++) wanted[keys[i]] = true;
    var total = 0;
    for (var j = 0; j < pagamenti.length; j++) {
      var p = pagamenti[j];
      if (!p) continue;
      if (wanted[p.scheduleKey]) {
        total += parseFloat(p.importo) || 0;
      }
    }
    return ceil2(total);
  }

  // type: 'imposta' | 'contributi'
  // Ritorna: { saldo, accontiUsati, source: 'paid' | 'planned' }
  function computeAutoSaldoAnnoAperto(base, accontiTotals, pagamenti, year, isClosedYear, type) {
    var prefix = type === 'contributi' ? 'contributi' : 'imposta';
    if (isClosedYear) {
      var planned = (accontiTotals && typeof accontiTotals.total === 'number') ? accontiTotals.total : 0;
      return {
        saldo: ceil2((base || 0) - planned),
        accontiUsati: ceil2(planned),
        source: 'planned'
      };
    }
    var paid = sumPagamentiForSaldoKeys(pagamenti, [
      prefix + '_acc1_' + year,
      prefix + '_acc2_' + year
    ]);
    return {
      saldo: ceil2((base || 0) - paid),
      accontiUsati: paid,
      source: 'paid'
    };
  }

  var api = {
    computeAutoSaldoAnnoAperto: computeAutoSaldoAnnoAperto,
    sumPagamentiForSaldoKeys: sumPagamentiForSaldoKeys
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.ScadenziarioSaldoHelpers = api;
  }
})();
