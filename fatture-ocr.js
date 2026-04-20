/* Fatture OCR — STUB
 * Sub-progetto separato, pianificato post-audit UI.
 * API definita per permettere hook UI e forward-compat; implementazione differita.
 *
 * Design previsto:
 * - `parsePdfFile(file)` estrae testo dal PDF (pdf.js) + OCR fallback (Tesseract.js)
 *   e ritorna un oggetto strutturato con campi candidati (numero, data, cliente,
 *   partitaIva, righe, totale, ecc.).
 * - `parseResultToDraft(ocrResult)` converte l'output OCR in una bozza fattura
 *   compatibile con lo schema di `fattureEmesse` (pronta per openFatturaModal).
 */
(function () {
  'use strict';

  var STUB_MSG = 'FattureOCR non ancora implementato';

  window.FattureOCR = {
    /**
     * Estrae dati strutturati da un file PDF.
     * @param {File} _file
     * @returns {Promise<Object>} — attualmente sempre rejected con STUB_MSG
     */
    parsePdfFile: function (_file) {
      return Promise.reject(new Error(STUB_MSG));
    },

    /**
     * Converte il risultato OCR in una bozza fattura.
     * @param {Object} _ocrResult
     * @returns {Object} — attualmente throw, stub non implementato
     */
    parseResultToDraft: function (_ocrResult) {
      throw new Error(STUB_MSG);
    },

    // Alias forward-compat per la naming del plan (extractFromPdf / proposeInvoiceFromOcr)
    extractFromPdf: function (_file) {
      return Promise.reject(new Error(STUB_MSG));
    },
    proposeInvoiceFromOcr: function (_ocrResult) {
      return null;
    },

    __stub: true,
    __stubMessage: STUB_MSG
  };
})();
