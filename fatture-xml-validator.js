/* Fatture XML Validator — validazione asincrona via openapi.com
 *
 * API:
 * - validate(xml) → Promise<{ok, errors?, code?, message?}>
 * - validateAndNotify(xml, opts?) → Promise<void> — non-throwing, mostra toast/alert
 *   al termine. Pensata per fire-and-forget post-save.
 *
 * Codici errore:
 *  - NO_KEY        — API key non configurata (ClientiAutofill.hasApiKey() false)
 *  - NETWORK       — fetch non disponibile o errore di rete
 *  - INVALID_INPUT — xml vuoto/non stringa
 *  - HTTP_4xx/5xx  — risposta non 2xx dal server
 *  - INVALID_XML   — risposta 200 ma `valid=false`: `errors` contiene i dettagli SdI
 *
 * Endpoint:
 *  POST https://invoice.openapi.com/IT-invoices_validate
 *  Authorization: Bearer {GLOBAL_OPENAPI_KEY}
 *  Content-Type: application/xml
 *  Body: XML raw
 *
 * NOTA: il formato payload esatto va confermato al primo test live. Se il server
 * richiede JSON (`{xml: "..."}`) invece di raw, cambiare `BODY_FORMAT` qui sotto.
 */
(function (root) {
  'use strict';

  var ENDPOINT = 'https://invoice.openapi.com/IT-invoices_validate';
  var BODY_FORMAT = 'raw'; // 'raw' | 'json' — raw = XML as body, json = {xml:"..."}

  function getKey() {
    var autofill = root.ClientiAutofill;
    return (autofill && typeof autofill.getApiKey === 'function') ? autofill.getApiKey() : '';
  }

  function hasKey() {
    var autofill = root.ClientiAutofill;
    return !!(autofill && typeof autofill.hasApiKey === 'function' && autofill.hasApiKey());
  }

  function buildRequest(xml) {
    var headers = { 'Authorization': 'Bearer ' + getKey() };
    var body;
    if (BODY_FORMAT === 'json') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ xml: xml });
    } else {
      headers['Content-Type'] = 'application/xml';
      body = xml;
    }
    return { method: 'POST', headers: headers, body: body };
  }

  function parseErrors(json) {
    if (!json) return [];
    if (Array.isArray(json.errors)) return json.errors.slice();
    if (json.error) return [json.error];
    if (json.message && (json.valid === false || json.success === false)) return [json.message];
    return [];
  }

  function validate(xml) {
    if (typeof xml !== 'string' || !xml.trim()) {
      return Promise.resolve({ ok: false, code: 'INVALID_INPUT', message: 'XML vuoto o non valido' });
    }
    if (!hasKey()) {
      return Promise.resolve({ ok: false, code: 'NO_KEY', message: 'API key openapi non configurata' });
    }
    if (typeof root.fetch !== 'function') {
      return Promise.resolve({ ok: false, code: 'NETWORK', message: 'fetch non disponibile' });
    }
    return root.fetch(ENDPOINT, buildRequest(xml))
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (!res.ok) {
            var errs = parseErrors(json);
            return {
              ok: false,
              code: 'HTTP_' + res.status,
              message: errs.length ? errs.join(' · ') : ('HTTP ' + res.status),
              errors: errs
            };
          }
          var valid = json && (json.valid !== false && json.success !== false);
          var errs2 = parseErrors(json);
          if (!valid || errs2.length) {
            return { ok: false, code: 'INVALID_XML', message: errs2.join(' · ') || 'XML non valido', errors: errs2 };
          }
          return { ok: true };
        });
      })
      .catch(function (err) {
        return { ok: false, code: 'NETWORK', message: (err && err.message) || 'Errore di rete' };
      });
  }

  // Fire-and-forget: non lancia, mostra toast/alert in base all'esito.
  // opts.label = etichetta da mostrare accanto al messaggio (es. numero fattura).
  function validateAndNotify(xml, opts) {
    opts = opts || {};
    var label = opts.label ? (' [' + opts.label + ']') : '';
    return validate(xml).then(function (res) {
      if (res.ok) {
        if (typeof root.showToast === 'function') {
          root.showToast('XML fattura' + label + ' validato ✓');
        }
        return;
      }
      // NO_KEY è benign: utente non ha (ancora) abilitato il validator → silenzioso
      if (res.code === 'NO_KEY') return;
      var msg = 'XML fattura' + label + ' non valido: ' + (res.message || res.code);
      if (typeof root.showToast === 'function') {
        root.showToast(msg, 'error');
      } else if (typeof root.alert === 'function') {
        root.alert(msg);
      }
      console.warn('[FattureXmlValidator]', res);
    });
  }

  root.FattureXmlValidator = {
    validate: validate,
    validateAndNotify: validateAndNotify
  };
})(typeof window !== 'undefined' ? window : globalThis);
