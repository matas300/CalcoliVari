// fatture-validators.js — Validator puri condivisi
// Risolve DUP-1 (ritenuta forfettario duplicata in 2 validate) +
// DUP-9 (cascade resolveCliente ripetuta).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FattureValidators = factory();
    if (typeof window !== 'undefined') window.FattureValidators = root.FattureValidators;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MSG_RITENUTA_INVIO = "Il regime forfettario è esonerato dalla ritenuta d'acconto (art. 1 c. 67 L. 190/2014). Rimuovere la ritenuta dalla fattura e comunicare al committente la dichiarazione sostitutiva di non assoggettamento.";
  var MSG_RITENUTA_XML = "Il regime forfettario è esonerato dalla ritenuta d'acconto (art. 1 c. 67 L. 190/2014). Rimuovere la ritenuta dalla fattura prima di scaricare/visualizzare l'XML.";
  var MSG_CLIENTE_IT = "Cliente IT deve avere almeno la P.IVA o il Codice Fiscale (FatturaPA v1.2 §1.4.1.2). SdI rifiuterà l'XML senza questo dato.";

  // Cliente è esposto sia come draft.cliente (legacy) sia come draft.clienteSnapshot
  // (canonico post-redesign). Resolver unico.
  function resolveCliente(draft) {
    if (!draft) return null;
    return draft.cliente || draft.clienteSnapshot || null;
  }

  // C-A2: forfettario esonerato dalla ritenuta. Ritorna stringa errore o null.
  // opts.context: 'invio' (path Salva/Invia) o 'xml' (path preview/download XML).
  function validateRitenutaForfettario(draft, settings, opts) {
    if (!draft || !settings) return null;
    if (settings.regime !== 'forfettario') return null;
    var ritenuta = Number(draft.ritenuta);
    if (!(ritenuta > 0)) return null;
    var ctx = (opts && opts.context) || 'invio';
    return ctx === 'xml' ? MSG_RITENUTA_XML : MSG_RITENUTA_INVIO;
  }

  // NR-2: cliente IT deve avere P.IVA o CF. Ritorna stringa errore o null.
  // validators: { isValidPartitaIvaIT, isValidCodiceFiscale } opzionali; fallback length-only.
  function validateClienteIT(cliente, validators) {
    if (!cliente) return null;
    var nazione = String(cliente.nazione || 'IT').toUpperCase();
    if (nazione !== 'IT') return null;
    var pivaRaw = String(cliente.partitaIva || '').replace(/\s+/g, '');
    var cfRaw = String(cliente.codiceFiscale || '').trim();
    var v = validators || {};
    var hasPiva = pivaRaw && (typeof v.isValidPartitaIvaIT === 'function'
      ? v.isValidPartitaIvaIT(pivaRaw)
      : pivaRaw.length === 11);
    var hasCF = cfRaw && (typeof v.isValidCodiceFiscale === 'function'
      ? v.isValidCodiceFiscale(cfRaw)
      : cfRaw.length === 16);
    if (!hasPiva && !hasCF) return MSG_CLIENTE_IT;
    return null;
  }

  return {
    resolveCliente: resolveCliente,
    validateRitenutaForfettario: validateRitenutaForfettario,
    validateClienteIT: validateClienteIT,
    MSG_RITENUTA_INVIO: MSG_RITENUTA_INVIO,
    MSG_RITENUTA_XML: MSG_RITENUTA_XML,
    MSG_CLIENTE_IT: MSG_CLIENTE_IT
  };
}));
