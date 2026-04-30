// fatture-xml-helpers.js — pure helpers FatturaPA XML v1.2
// Estratti da fatture-docs-feature.js (Sprint 4 bottom-up). Nessuna dipendenza
// da window/DOM/state interno: solo MathUtils.round2 e HtmlUtils.xmlEscape.
// L'unico ramo runtime-aware è isValidCodiceFiscale: se window.DichiarazioneEngine
// è caricato, delega alla validazione completa; altrimenti regex syntactic.

(function (root, factory) {
  'use strict';
  var MathUtils = (typeof root !== 'undefined' && root.MathUtils)
    ? root.MathUtils
    : (typeof require !== 'undefined' ? require('./math-utils.js') : null);
  var HtmlUtils = (typeof root !== 'undefined' && root.HtmlUtils)
    ? root.HtmlUtils
    : (typeof require !== 'undefined' ? require('./html-utils.js') : null);
  if (!MathUtils) throw new Error('fatture-xml-helpers requires MathUtils');
  if (!HtmlUtils) throw new Error('fatture-xml-helpers requires HtmlUtils');
  var api = factory(MathUtils, HtmlUtils);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.FattureXmlHelpers = api;
}(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this), function (MathUtils, HtmlUtils) {
  'use strict';

  var XML_NAMESPACE = 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2';
  // Backward-compat: buildFatturaElettronicaXml ora legge il regime dai settings.
  var XML_FORFETTARIO_REGIME = 'RF19';

  // FatturaPA ModalitaPagamento codes (spec v1.2).
  var MODALITA_TO_MP = {
    'bonifico':           'MP05',
    'bonifico bancario':  'MP05',
    'assegno':            'MP01',
    'assegno circolare':  'MP02',
    'contanti':           'MP10',
    'carta di credito':   'MP08',
    'carta':              'MP08',
    'paypal':             'MP08',
    'rid':                'MP09',
    'sepa':               'MP15',
    'giroconto':          'MP06',
    'compensazione':      'MP07'
  };

  function modalitaToCodiceMP(str) {
    var key = String(str || '').toLowerCase().trim();
    var keys = Object.keys(MODALITA_TO_MP);
    for (var i = 0; i < keys.length; i++) {
      if (key.indexOf(keys[i]) !== -1) return MODALITA_TO_MP[keys[i]];
    }
    return 'MP05'; // default bonifico
  }

  // ProgressivoInvio: max 10 char alfanumerici (FatturaPA §1.1.2).
  function sanitizeProgressivoInvio(s) {
    return String(s || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || '00001';
  }

  function isValidPartitaIvaIT(s) {
    return /^\d{11}$/.test(String(s || '').replace(/\s+/g, ''));
  }

  // Lazy delegate: se DichiarazioneEngine è caricato usa la validazione completa
  // (lunghezza + check digit). Fallback a regex syntactic.
  function isValidCodiceFiscale(cf) {
    var DE = (typeof window !== 'undefined') ? window.DichiarazioneEngine : null;
    if (DE && typeof DE.validateCodiceFiscale === 'function') {
      return DE.validateCodiceFiscale(cf);
    }
    return /^[A-Z0-9]{16}$/i.test(String(cf || '').trim());
  }

  function parseMaybeNumber(value) {
    var n = parseFloat(String(value == null ? '' : value).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function fmtXmlNum(n) {
    return MathUtils.round2(n).toFixed(2);
  }

  // sanitizeXmlLatin1 — Conformità FatturaPA v1.2 String*LatinType.
  // I tipi String35LatinType, String60LatinType, String80LatinType, String200LatinType,
  // String1000LatinType usano pattern XSD `[\p{IsBasicLatin}\p{IsLatin-1Supplement}]{1,N}`
  // (Basic Latin U+0000-U+007F + Latin-1 Supplement U+00A0-U+00FF).
  // Caratteri tipici outside this range (em-dash, smart quotes, ellipsis, €, ™, …) vengono
  // mappati a equivalenti ASCII/Latin-1; il resto stripato. Applica a Causale (200), Descrizione (1000),
  // Denominazione/Nome/Cognome/Indirizzo/Comune (60/80) prima dell'xmlEscape.
  function sanitizeXmlLatin1(s) {
    if (s == null) return '';
    var str = String(s);
    // NFC normalize: pre-compone diacritici decomposti (es. "café" da macOS/iOS spesso è
    // U+0065 + U+0301 invece di U+00E9). Senza normalize, il combining U+0301 cadrebbe
    // fuori Latin-1 e verrebbe strippato → "cafe". Con NFC resta "café" (U+00E9 in Latin-1).
    if (typeof str.normalize === 'function') str = str.normalize('NFC');
    return str
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')   // strip control chars (mantieni \t \n \r)
      .replace(/[‘’‚‛′]/g, "'")          // ‘ ’ ‚ ‛ ′ → '
      .replace(/[“”„‟″]/g, '"')          // “ ” „ ‟ ″ → "
      .replace(/[‐‑‒–—―]/g, '-')    // ‐ ‑ ‒ – — ― → -
      .replace(/…/g, '...')                                  // … → ...
      .replace(/€/g, 'EUR')                                  // € (fuori Latin-1) → EUR
      .replace(/•/g, '-')                                    // • → -
      .replace(/™/g, '(TM)')                                 // ™ → (TM)
      .replace(/[^\x00-\xFF]/g, '');                              // strip resto (CJK, emoji, BOM, ZWS, ecc.)
  }

  // CessionarioCommittente.DatiAnagrafici.Anagrafica children.
  // Regola: Denominazione (PG/cliente con P.IVA) XOR Nome+Cognome (PF senza P.IVA).
  // Sanitize Latin-1 prima dell'escape per conformità XSD String*LatinType.
  function buildAnagraficaXml(cliente) {
    var c = cliente || {};
    var denom = sanitizeXmlLatin1(c.denominazione || c.ragioneSociale || '').trim();
    var nome = sanitizeXmlLatin1(c.nome || '').trim();
    var cognome = sanitizeXmlLatin1(c.cognome || '').trim();
    var piva = String(c.partitaIva || '').replace(/\D/g, '');
    var hasPiva = piva.length === 11;
    var xe = HtmlUtils.xmlEscape;
    if (denom) {
      return '<Denominazione>' + xe(denom.slice(0, 80)) + '</Denominazione>';
    }
    if (hasPiva) {
      return '<Denominazione>' + xe((nome || piva).slice(0, 80)) + '</Denominazione>';
    }
    if (nome && cognome) {
      return '<Nome>' + xe(nome.slice(0, 60)) + '</Nome><Cognome>' + xe(cognome.slice(0, 60)) + '</Cognome>';
    }
    return '<Denominazione>' + xe(sanitizeXmlLatin1(c.nome || '').slice(0, 80)) + '</Denominazione>';
  }

  return {
    XML_NAMESPACE: XML_NAMESPACE,
    XML_FORFETTARIO_REGIME: XML_FORFETTARIO_REGIME,
    MODALITA_TO_MP: MODALITA_TO_MP,
    modalitaToCodiceMP: modalitaToCodiceMP,
    sanitizeProgressivoInvio: sanitizeProgressivoInvio,
    isValidPartitaIvaIT: isValidPartitaIvaIT,
    isValidCodiceFiscale: isValidCodiceFiscale,
    parseMaybeNumber: parseMaybeNumber,
    fmtXmlNum: fmtXmlNum,
    sanitizeXmlLatin1: sanitizeXmlLatin1,
    buildAnagraficaXml: buildAnagraficaXml
  };
}));
