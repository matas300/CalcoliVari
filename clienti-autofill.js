/* Clienti Autofill — lookup anagrafica cliente da P.IVA
 * Integrazione openapi.com (company.openapi.com/IT-start/{piva}).
 * API key globale condivisa tra tutti i profili (hardcoded in questo file).
 *
 * API:
 * - lookupPartitaIva(piva) → Promise<{ok, data?, code?, error?}>
 * - hasApiKey() → boolean
 * - getApiKey() → string
 * - _setKeyForTests(k) → void (solo test)
 *
 * Codici errore: INVALID_PIVA, NO_KEY, NOT_FOUND, NETWORK.
 */
(function (root) {
  'use strict';

  // Chiave globale openapi.it — condivisa fra tutti i profili/utenti.
  // Sostituire il placeholder con la key reale dopo deploy.
  var GLOBAL_OPENAPI_KEY = '69e7278d88ec1fa6250e18e7';

  function getApiKey() {
    return (GLOBAL_OPENAPI_KEY || '').trim();
  }

  function hasApiKey() {
    var k = getApiKey();
    return k.length > 0 && !/^__.*_PLACEHOLDER__$/.test(k);
  }

  function isValidPivaIT(piva) {
    return typeof piva === 'string' && /^\d{11}$/.test(piva.trim());
  }

  function pickAddress(d) {
    // IT-start ritorna address come oggetto con registeredOffice/sub-fields.
    var addr = d.address || {};
    var reg = addr.registeredOffice || addr.registered_office || (d.address ? addr : d);
    return {
      street: (reg.streetName || reg.street || reg.toponimo || reg.via || reg.indirizzo || '').toString().trim(),
      streetNumber: (reg.streetNumber || reg.street_number || reg.civico || '').toString().trim(),
      zip: (reg.zipCode || reg.zip_code || reg.zip || reg.cap || '').toString().trim(),
      city: (reg.town || reg.city || reg.comune || reg.citta || '').toString().trim(),
      province: (reg.province || reg.provincia || '').toString().trim().toUpperCase()
    };
  }

  function normalizeResponse(raw) {
    // openapi.com avvolge la risposta in { success, data: {...} }.
    var d = (raw && raw.data) || raw || {};
    var a = pickAddress(d);
    var indirizzo = a.street;
    if (indirizzo && a.streetNumber) indirizzo += ' ' + a.streetNumber;
    return {
      nome: (d.companyName || d.denominazione || d.ragione_sociale || d.nome || '').toString().trim(),
      cf: (d.taxCode || d.codice_fiscale || d.cf || '').toString().trim(),
      indirizzo: indirizzo.trim(),
      cap: a.zip,
      citta: a.city,
      provincia: a.province,
      pec: (d.pec || d.email_pec || '').toString().trim()
    };
  }

  function lookupPartitaIva(piva) {
    var clean = (piva || '').replace(/\s/g, '');
    if (!isValidPivaIT(clean)) {
      return Promise.resolve({ ok: false, code: 'INVALID_PIVA', error: 'P.IVA non valida (11 cifre)' });
    }
    if (!hasApiKey()) {
      return Promise.resolve({ ok: false, code: 'NO_KEY', error: 'API key openapi.it non configurata' });
    }
    var fetchImpl = typeof root.fetch === 'function' ? root.fetch : null;
    if (!fetchImpl) {
      return Promise.resolve({ ok: false, code: 'NETWORK', error: 'fetch non disponibile' });
    }
    return fetchImpl('https://company.openapi.com/IT-start/' + clean, {
      headers: { 'Authorization': 'Bearer ' + getApiKey() }
    }).then(function (res) {
      if (res.status === 404) {
        return { ok: false, code: 'NOT_FOUND', error: 'P.IVA non trovata' };
      }
      if (!res.ok) {
        return { ok: false, code: 'NETWORK', error: 'HTTP ' + res.status };
      }
      return res.json().then(function (json) {
        return { ok: true, data: normalizeResponse(json) };
      });
    }).catch(function (err) {
      return { ok: false, code: 'NETWORK', error: (err && err.message) || 'Errore di rete' };
    });
  }

  root.ClientiAutofill = {
    lookupPartitaIva: lookupPartitaIva,
    hasApiKey: hasApiKey,
    getApiKey: getApiKey,
    // Test-only hook: permette ai test unitari di forzare la key senza
    // rileggere il file. Safe in prod: chi ha accesso al JS può già mutarla.
    _setKeyForTests: function (k) { GLOBAL_OPENAPI_KEY = k; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
