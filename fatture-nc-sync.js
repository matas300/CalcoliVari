/* Fatture NC sync — side-effects quando una NC TD04 passa a 'inviata'.
 *
 * Tiene coerenti i campi ncIds / ncTotaleImporto / stato / tipoStorno
 * tra la nota di credito e la fattura originale collegata via
 * fatturaOriginaleId. Puro modulo: muta array in-place, nessun IO.
 *
 * Invocato dai 3 call sites che promuovono una fattura a 'inviata':
 *  - saveFatturaDraft (wizard, fatture-docs-feature.js)
 *  - quickMarkInviataFromCard (card principale Fatture)
 *  - FattureStorico._markInviata (archivio storico)
 */
(function () {
  'use strict';

  var TOLERANZA_TOTALE = 0.01; // €: sotto questa soglia, lo storno parziale vale come totale

  function _sommaRighe(f) {
    var righe = (f && f.righe) || [];
    var s = 0;
    for (var i = 0; i < righe.length; i++) {
      s += (Number(righe[i].quantita) || 0) * (Number(righe[i].prezzoUnitario) || 0);
    }
    if (s === 0 && f) {
      var fb = Number(f.totaleDocument) || Number(f.totaleDocumento) || 0;
      if (fb > 0) return fb;
    }
    return s;
  }

  function _round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  /**
   * Applica gli effetti di una NC TD04 inviata sulla fattura originale.
   * Muta in-place la NC (setta tipoStorno) e l'originale (ncIds/ncTotaleImporto/stato).
   *
   * Idempotente: richiamare con la stessa NC non duplica l'incremento.
   *
   * @param nc   oggetto fattura NC (deve avere tipoDocumento='TD04' e fatturaOriginaleId)
   * @param fattureArr  array contenente originale + NC (stesso profilo)
   * @returns { applied, orig, ncTotaleImporto, stato, tipoStorno } oppure null se non applicabile
   */
  function applyNCToOriginal(nc, fattureArr) {
    if (!nc) return null;
    if (nc.tipoDocumento !== 'TD04') return null;
    if (!nc.fatturaOriginaleId) return null;
    var arr = fattureArr || [];
    var orig = null;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].id === nc.fatturaOriginaleId) { orig = arr[i]; break; }
    }
    if (!orig) return null;

    orig.ncIds = Array.isArray(orig.ncIds) ? orig.ncIds : [];
    var already = orig.ncIds.indexOf(nc.id) >= 0;
    var ncImp = Math.abs(_sommaRighe(nc));

    if (!already) {
      orig.ncIds.push(nc.id);
      orig.ncTotaleImporto = _round2((Number(orig.ncTotaleImporto) || 0) + ncImp);
    }

    var origImp = _sommaRighe(orig);
    // D-M2 (audit 2026-05-01): se l'originale ha imponibile <= 0 (fattura
    // corrotta, legacy senza righe, o solo descrittiva), la formula
    // `ncTotaleImporto + tolleranza >= origImp` ritornerebbe 'totale' anche
    // per NC da 0 €. Trattiamo come 'parziale' senza promuovere a 'stornata'.
    var tipoStorno;
    if (origImp <= 0) {
      tipoStorno = 'parziale';
    } else {
      tipoStorno = (orig.ncTotaleImporto + TOLERANZA_TOTALE >= origImp) ? 'totale' : 'parziale';
    }
    nc.tipoStorno = tipoStorno;

    if (tipoStorno === 'totale' && orig.stato !== 'stornata') {
      orig.stato = 'stornata';
    }

    return {
      applied: !already,
      orig: orig,
      ncTotaleImporto: orig.ncTotaleImporto,
      stato: orig.stato,
      tipoStorno: tipoStorno
    };
  }

  /**
   * Valida che data_NC >= data_originale (ISO YYYY-MM-DD).
   * Se una delle due manca, ritorna true (niente da validare).
   */
  function isNCDateValid(dataNC, dataOriginale) {
    if (!dataNC || !dataOriginale) return true;
    return String(dataNC) >= String(dataOriginale);
  }

  var api = {
    applyNCToOriginal: applyNCToOriginal,
    isNCDateValid: isNCDateValid,
    _sommaRighe: _sommaRighe,
    _TOLERANZA_TOTALE: TOLERANZA_TOTALE
  };

  if (typeof window !== 'undefined') window.FattureNCSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
