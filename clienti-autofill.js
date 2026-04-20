/* Clienti Autofill — lookup anagrafica cliente da P.IVA
 * Integrazione openapi.it (imprese.openapi.it/advance/{piva}).
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
  var GLOBAL_OPENAPI_KEY = '__OPENAPI_KEY_PLACEHOLDER__';

  function getApiKey() {
    return (GLOBAL_OPENAPI_KEY || '').trim();
  }

  function hasApiKey() {
    var k = getApiKey();
    return k.length > 0 && k !== '__OPENAPI_KEY_PLACEHOLDER__';
  }

  function isValidPivaIT(piva) {
    return typeof piva === 'string' && /^\d{11}$/.test(piva.trim());
  }

  function normalizeResponse(raw) {
    var d = (raw && raw.data) || raw || {};
    return {
      nome: (d.denominazione || d.ragione_sociale || d.nome || '').trim(),
      cf: (d.codice_fiscale || d.cf || '').trim(),
      indirizzo: (d.indirizzo || d.address || '').trim(),
      cap: (d.cap || '').trim(),
      citta: (d.comune || d.citta || d.city || '').trim(),
      provincia: (d.provincia || d.province || '').trim().toUpperCase(),
      pec: (d.pec || d.email_pec || '').trim()
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
    return fetchImpl('https://imprese.openapi.it/advance/' + clean, {
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
