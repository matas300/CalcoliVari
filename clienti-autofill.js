/* Clienti Autofill — lookup anagrafica cliente da P.IVA
 * Integrazione openapi.it (imprese.openapi.it/advance/{piva}).
 * API key letta da settings.openapiKey (profilo-specifico).
 *
 * API:
 * - lookupPartitaIva(piva) → Promise<{ok, data?, code?, error?}>
 * - hasApiKey() → boolean
 * - getApiKey() → string
 *
 * Codici errore: INVALID_PIVA, NO_KEY, NOT_FOUND, NETWORK.
 */
(function (root) {
  'use strict';

  function getSettingsObject() {
    if (typeof root.S === 'function') {
      try { return root.S() || {}; } catch (_e) { return {}; }
    }
    return (root.data && root.data.settings) || {};
  }

  function getApiKey() {
    return (getSettingsObject().openapiKey || '').trim();
  }

  function hasApiKey() {
    return getApiKey().length > 0;
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
    var key = getApiKey();
    if (!key) {
      return Promise.resolve({ ok: false, code: 'NO_KEY', error: 'API key openapi.it non configurata' });
    }
    var fetchImpl = typeof root.fetch === 'function' ? root.fetch : null;
    if (!fetchImpl) {
      return Promise.resolve({ ok: false, code: 'NETWORK', error: 'fetch non disponibile' });
    }
    return fetchImpl('https://imprese.openapi.it/advance/' + clean, {
      headers: { 'Authorization': 'Bearer ' + key }
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
    getApiKey: getApiKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
