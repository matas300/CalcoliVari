# Impostazioni Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ripulire e riorganizzare il tab Impostazioni: rimuovere campi duplicati/obsoleti, fix giorniIncasso profile-scoped, spostare openapiKey a costante globale, migliorare hint INAIL/CdC.

**Architettura:** Cambi isolati e sequenziali su `index.html`, `app.js`, `clienti-autofill.js`, `firebase-sync.js`. Nessuna nuova dipendenza. Test automatizzati aggiornati in `test/clienti-autofill.test.js`; per il resto manual smoke.

**Tech Stack:** Vanilla JS, IIFE, no-build, localStorage + Firebase Firestore sync.

---

## File map

| File | Responsabilità |
|---|---|
| `index.html` | Rimozione input `settTassoInail`/`settLimiteForfettario`/`settOpenapiKey`, rimozione pannello anagrafica nascosto, info-box limite forfettario, riorganizzazione 3 sezioni |
| `app.js` | Cleanup `applySettings` binding, rimozione default `openapiKey`, nuovo helper giorniIncasso profile-scoped, migrazione, hint INAIL/CdC |
| `clienti-autofill.js` | Costante `GLOBAL_OPENAPI_KEY`, firma `lookupPartitaIva(piva)` a 1-arg, test-only `_setKeyForTests`, rimozione `getSettingsObject` |
| `firebase-sync.js` | Aggiunta `'giorniIncasso'` a `PROFILE_META_KEYS` |
| `test/clienti-autofill.test.js` | Aggiornare test ai nuovi 1-arg (niente stub settings) |
| `CLAUDE.md` | Aggiornare sezione Clienti (key globale) e Settings (giorniIncasso profile-scoped) |

---

### Task 1: openapiKey globale in clienti-autofill.js

**Files:**
- Modify: `clienti-autofill.js:12-90`
- Modify: `test/clienti-autofill.test.js`

- [ ] **Step 1: Sostituisci il body del IIFE in `clienti-autofill.js`**

Sostituisci l'intero body della IIFE (righe 12-89) con:

```js
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
```

- [ ] **Step 2: Aggiorna i test `test/clienti-autofill.test.js`**

Sostituisci l'intero file con:

```js
'use strict';

function loadAutofill(key) {
  delete require.cache[require.resolve('../clienti-autofill.js')];
  global.window = global.window || globalThis;
  require('../clienti-autofill.js');
  const A = global.window.ClientiAutofill;
  A._setKeyForTests(key);
  return A;
}

module.exports = async function runClientiAutofillTests(t) {
  await t('ClientiAutofill: INVALID_PIVA su input non 11 cifre', async () => {
    const A = loadAutofill('test-key');
    const r = await A.lookupPartitaIva('123');
    t.assert(r.ok === false && r.code === 'INVALID_PIVA', 'Expected INVALID_PIVA');
  });

  await t('ClientiAutofill: NO_KEY se placeholder non sostituito', async () => {
    const A = loadAutofill('__OPENAPI_KEY_PLACEHOLDER__');
    const r = await A.lookupPartitaIva('12485671007');
    t.assert(r.ok === false && r.code === 'NO_KEY', 'Expected NO_KEY');
  });

  await t('ClientiAutofill: happy path 200', async () => {
    const A = loadAutofill('test-key');
    global.window.fetch = () => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({
        data: { denominazione: 'Acme Spa', codice_fiscale: '01234567890',
                indirizzo: 'Via Roma 1', cap: '20100', comune: 'Milano',
                provincia: 'mi', pec: 'a@pec.it' }
      })
    });
    const r = await A.lookupPartitaIva('12485671007');
    t.assert(r.ok === true, 'Expected ok');
    t.assert(r.data.nome === 'Acme Spa', 'nome');
    t.assert(r.data.provincia === 'MI', 'provincia uppercase');
    delete global.window.fetch;
  });

  await t('ClientiAutofill: NOT_FOUND su 404', async () => {
    const A = loadAutofill('test-key');
    global.window.fetch = () => Promise.resolve({ ok: false, status: 404 });
    const r = await A.lookupPartitaIva('12485671007');
    t.assert(r.ok === false && r.code === 'NOT_FOUND', 'Expected NOT_FOUND');
    delete global.window.fetch;
  });

  await t('ClientiAutofill: NETWORK su fetch reject', async () => {
    const A = loadAutofill('test-key');
    global.window.fetch = () => Promise.reject(new Error('boom'));
    const r = await A.lookupPartitaIva('12485671007');
    t.assert(r.ok === false && r.code === 'NETWORK', 'Expected NETWORK');
    delete global.window.fetch;
  });
};
```

- [ ] **Step 3: Esegui i test**

Run: `node test/run-tests.js`
Expected: tutti verdi incluso i 5 test ClientiAutofill.

- [ ] **Step 4: Rimuovi wiring `apiKeyOverride` in `app.js`**

Cerca in `app.js` (Grep `const apiKey = (data && data.settings && data.settings.openapiKey)`):

Sostituisci il blocco (linee ~1069-1071):
```js
    const apiKey = (data && data.settings && data.settings.openapiKey) || '';
    const res = await api.lookupPartitaIva(piva, apiKey);
```
con:
```js
    const res = await api.lookupPartitaIva(piva);
```

- [ ] **Step 5: Commit**

```bash
git add clienti-autofill.js test/clienti-autofill.test.js app.js
git commit -m "feat(clienti): openapiKey globale in clienti-autofill.js"
```

---

### Task 2: Rimozione UI openapiKey da Impostazioni

**Files:**
- Modify: `index.html:323-331`
- Modify: `app.js:1712` (default ensureDataShape)
- Modify: `app.js:1740-1741` (applySettings)

- [ ] **Step 1: Rimuovi la subsection "Clienti — Autofill anagrafica" da `index.html`**

Cancella le righe 323-331 (dalla `<div class="settings-subsection-title">Clienti — Autofill anagrafica</div>` fino al `</div>` di chiusura del `settings-group` che la contiene, incluso l'hint openapi.it).

- [ ] **Step 2: Rimuovi default `openapiKey` da `ensureDataShape`**

In `app.js:1712`, rimuovi la riga `openapiKey: ''`. Se è l'ultima chiave dell'oggetto, sistema la virgola sulla riga precedente.

- [ ] **Step 3: Rimuovi binding in `applySettings`**

In `app.js:1740-1741`, rimuovi:
```js
  const openapiKeyEl = document.getElementById('settOpenapiKey');
  if (openapiKeyEl) openapiKeyEl.value = s.openapiKey || '';
```

- [ ] **Step 4: Smoke test manuale**

Apri l'app, vai in Impostazioni: nessuna subsection "Clienti — Autofill anagrafica". Nessun errore console. Tab Clienti → autofill deve rispondere NO_KEY (placeholder ancora attivo).

- [ ] **Step 5: Commit**

```bash
git add index.html app.js
git commit -m "refactor(settings): rimuove UI openapiKey (ora globale)"
```

---

### Task 3: Rimozione campo duplicato settTassoInail

**Files:**
- Modify: `index.html:259-263`
- Modify: `app.js:1791`

- [ ] **Step 1: Rimuovi l'input `settTassoInail` da `index.html`**

In `index.html`, rimuovi l'intero `<div class="settings-group">` alle righe 259-263 contenente il label "Tasso INAIL (%)" e l'input `id="settTassoInail"`.

- [ ] **Step 2: Rimuovi il binding in `applySettings`**

In `app.js:1791`, rimuovi:
```js
  const inailI = document.getElementById('settTassoInail'); if (inailI) inailI.value = s.inailTasso ?? '';
```

- [ ] **Step 3: Smoke test manuale**

Apri Impostazioni: il campo "Tasso INAIL (%)" non compare. Resta in Profilo P.IVA.

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "refactor(settings): rimuove duplicato settTassoInail (vive in Profilo P.IVA)"
```

---

### Task 4: Limite forfettario → info-box read-only

**Files:**
- Modify: `index.html:254-258`
- Modify: `app.js:1790`

- [ ] **Step 1: Sostituisci input con info-box in `index.html`**

In `index.html`, rimpiazza le righe 254-258 con:

```html
        <div class="settings-group">
          <label>Limite forfettario</label>
          <div style="padding:8px 10px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-sm);font-size:12px;color:var(--color-text-muted)">
            <b style="color:var(--color-text)">85.000 EUR</b> &mdash; D.L. 34/2023, art. 1 c. 54 (dal 2023)
          </div>
        </div>
```

- [ ] **Step 2: Rimuovi il binding in `applySettings`**

In `app.js:1790`, rimuovi:
```js
  const limI = document.getElementById('settLimiteForfettario'); if (limI) limI.value = s.limiteForfettario ?? '';
```

- [ ] **Step 3: Smoke test manuale**

Apri Impostazioni: al posto dell'input c'è la card "85.000 EUR — D.L. 34/2023". La dashboard continua a mostrare la barra limite forfettario (legge da `S().limiteForfettario` → default 85000 intatto).

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "refactor(settings): limite forfettario ora info-box read-only"
```

---

### Task 5: Rimozione pannello anagrafica nascosto + bind orfani

**Files:**
- Modify: `index.html:352-` (pannello `display:none`)
- Modify: `app.js:1745-1807` (blocchi anagraficaMap / attivitaMap)

- [ ] **Step 1: Cancella il pannello anagrafica da `index.html`**

Trova il `<div class="panel" style="max-width:560px;margin-top:20px;display:none">` a riga ~353 con `<h3>Anagrafica dichiarante</h3>`. Rimuovi l'intero pannello: dall'apertura del div fino al `</div>` di chiusura corrispondente (include residenza, domicilio fiscale, contatti, attivita, stato civile). Fermati prima del `</div>` che chiude `tab-settings`.

- [ ] **Step 2: Rimuovi `anagraficaMap` e `attivitaMap` da `applySettings` in `app.js`**

In `app.js` trova (Grep `const anagraficaMap`):

Rimuovi il blocco dalla riga `// Anagrafica fields` (circa 1745) fino a includere tutto `attivitaMap` e il suo for-loop — ma NON rimuovere le righe che vengono dopo `attivitaMap` (inail, limite, etc., gestite nei task 3-4).

Il blocco da rimuovere è approssimativamente:
```js
  // Anagrafica fields
  const ana = s.anagrafica || {};
  const anagraficaMap = { ...16 entries... };
  for (const [id, key] of Object.entries(anagraficaMap)) {
    const el = document.getElementById(id);
    if (el) el.value = ana[key] || '';
  }
  if (ana.codiceFiscale !== undefined) updateCfStatus(ana.codiceFiscale);
  // Attivita fields
  const att = s.attivita || {};
  const attivitaMap = { ...entries... };
  for (const [id, key] of Object.entries(attivitaMap)) { ... }
```

Preserva tutto ciò che viene dopo.

- [ ] **Step 3: Smoke test manuale**

1. Impostazioni → nessun campo anagrafica (erano già nascosti, ora proprio assenti dal DOM)
2. Profilo personale → tutti i campi anagrafica presenti e salvano
3. Profilo P.IVA → tutti i campi attività presenti e salvano
4. Console pulita

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "chore(settings): rimuove pannello anagrafica nascosto + bind orfani"
```

---

### Task 6: giorniIncasso profile-scoped

**Files:**
- Modify: `firebase-sync.js:17`
- Modify: `app.js` (nuove funzioni + migrazione + S() fallback)
- Modify: `index.html:298-301` (label aggiornata)

- [ ] **Step 1: Aggiungi `'giorniIncasso'` a `PROFILE_META_KEYS`**

In `firebase-sync.js:17`, sostituisci:
```js
const PROFILE_META_KEYS = ['clienti', 'fattureEmesse'];
```
con:
```js
const PROFILE_META_KEYS = ['clienti', 'fattureEmesse', 'giorniIncasso'];
```

- [ ] **Step 2: Aggiungi helper get/set in `app.js`**

Dopo `function S()` in `app.js` (riga ~1965), aggiungi:

```js
// Profile-scoped giorniIncasso (applicato a tutti gli anni).
// Fallback: yearData.settings.giorniIncasso legacy, poi 30.
function getGiorniIncassoProfile() {
  try {
    var profile = (typeof currentProfile !== 'undefined') ? currentProfile : null;
    if (!profile) return null;
    var raw = localStorage.getItem('calcoliPIVA_' + profile + '_giorniIncasso');
    if (raw === null || raw === '') return null;
    var n = parseFloat(raw);
    return isFinite(n) ? n : null;
  } catch (_) { return null; }
}

function setGiorniIncassoProfile(val) {
  try {
    var profile = (typeof currentProfile !== 'undefined') ? currentProfile : null;
    if (!profile) return;
    var n = parseFloat(val);
    if (!isFinite(n)) n = 30;
    localStorage.setItem('calcoliPIVA_' + profile + '_giorniIncasso', String(n));
    if (typeof syncProfileMetaToCloud === 'function') {
      try { syncProfileMetaToCloud(profile); } catch (_) {}
    }
    if (data && data.settings) data.settings.giorniIncasso = n;
    if (typeof recalcAll === 'function') recalcAll();
  } catch (_) {}
}
```

- [ ] **Step 3: Modifica l'input HTML**

In `index.html:298-301`, sostituisci:
```html
      <div class="settings-group">
        <label>Giorni medi per incasso fattura</label>
        <input type="number" id="settGiorniIncasso" value="30" min="0" max="120" onchange="saveSetting('giorniIncasso', this.value); recalcAll()">
      </div>
```
con:
```html
      <div class="settings-group">
        <label>Giorni medi per incasso fattura</label>
        <input type="number" id="settGiorniIncasso" value="30" min="0" max="120" onchange="setGiorniIncassoProfile(this.value)">
        <div style="margin-top:4px;color:var(--color-text-muted);font-size:.72rem">
          Impostazione di profilo, applicata a tutti gli anni.
        </div>
      </div>
```

- [ ] **Step 4: Aggiungi migrazione one-shot e override in `applySettings`**

In `app.js` `applySettings`, dopo il loop `for (const [id, key] of Object.entries(fields))` (dopo riga ~1728), aggiungi:

```js
  // giorniIncasso: lettura profile-scoped con fallback a yearData legacy
  var gipVal = getGiorniIncassoProfile();
  if (gipVal === null) {
    var legacy = (s && s.giorniIncasso !== undefined) ? parseFloat(s.giorniIncasso) : NaN;
    if (isFinite(legacy) && legacy !== 30) {
      setGiorniIncassoProfile(legacy);
      gipVal = legacy;
    } else {
      gipVal = 30;
    }
  }
  s.giorniIncasso = gipVal;
  var gIn = document.getElementById('settGiorniIncasso');
  if (gIn) gIn.value = gipVal;
```

- [ ] **Step 5: Rimuovi `settGiorniIncasso` dal mapping `fields`**

In `app.js:1719-1723`, rimuovi la riga `settGiorniIncasso: 'giorniIncasso',` dal `const fields = {...}`. Il codice del Step 4 la gestisce.

- [ ] **Step 6: Smoke test manuale**

1. Impostazioni → cambia "Giorni medi per incasso fattura" da 30 a 45
2. Cambia anno dal picker → il campo resta 45
3. F5 → resta 45
4. Logout/login → resta 45
5. Verifica localStorage: `calcoliPIVA_<profile>_giorniIncasso` = `"45"`

- [ ] **Step 7: Commit**

```bash
git add firebase-sync.js app.js index.html
git commit -m "fix(settings): giorniIncasso profile-scoped (no più reset tra anni)"
```

---

### Task 7: Hint INAIL/CdC quando tasso = 0 o default

**Files:**
- Modify: `app.js` (funzione scadenziario, near line 4635)

- [ ] **Step 1: Localizza la generazione delle entry INAIL/CdC**

Run (via Bash in shell bash): `grep -n "scadenziarioInail\|scadenziarioDirittoCamerale\|profileInailTasso" app.js`
Identifica la funzione `buildForfettarioScheduleForYear` (o equivalente) dove vengono create le entry INAIL e CdC.

- [ ] **Step 2: Aggiungi un campo `hint` quando il premio INAIL è 0 senza override**

Nel blocco dove viene calcolato il premio INAIL (dopo la lettura di `profileInailTasso` a ~4635), identifica l'oggetto entry (es. `inailEntry` / push in array `entries`). Prima del push, aggiungi:

```js
if (!profileInailTasso && !manualInailCurrent) {
  inailEntry.hint = 'Imposta il tasso in Profilo P.IVA oppure override manuale in Impostazioni.';
}
```

(Adatta il nome della variabile dell'entry al codice reale.)

- [ ] **Step 3: Aggiungi hint analogo per CdC quando manca override**

Nel blocco CdC (cerca `scadenziarioDirittoCamerale`):
```js
if (!manualCdc) {
  cdcEntry.hint = 'Valore di default: 53 EUR (artigiani/commercianti). Sovrascrivi da Impostazioni se diverso.';
}
```

- [ ] **Step 4: Render del hint**

Cerca la funzione che renderizza una riga scadenziario (Grep `renderScadenziario` o simile). Nel template della riga, dopo la label/data:
```js
if (row.hint) {
  html += `<div style="font-size:.72rem;color:var(--color-warning);margin-top:4px">⚠ ${escapeHtml(row.hint)}</div>`;
}
```

Se non esiste `escapeHtml`, usa equivalente già in uso nel file (Grep `function escapeHtml`). Fallback: attributo `title="${row.hint}"` sulla riga.

- [ ] **Step 5: Smoke test manuale**

1. Profilo con `inailTasso=0` → scadenziario mostra hint sotto riga INAIL
2. Imposta tasso in Profilo P.IVA → hint sparisce
3. CdC senza override → hint visibile con label "default 53 EUR"

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat(scadenziario): hint INAIL/CdC quando tasso=0 o default"
```

---

### Task 8: Riorganizzazione 3 sezioni in index.html

**Files:**
- Modify: `index.html:232-` (tab `tab-settings`)

- [ ] **Step 1: Riscrivi il contenuto di `#tab-settings`**

Dopo le rimozioni dei task 2-5, il tab ha già un contenuto ridotto. Riscrivi l'intero `<div id="tab-settings" class="tab-content">...</div>` con questa struttura canonica:

```html
<div id="tab-settings" class="tab-content">
  <div class="panel">
    <h3>Impostazioni Annuali</h3>
    <div style="font-size:.82rem;color:var(--color-text-muted);line-height:1.5;margin-bottom:18px">
      Qui restano le impostazioni operative dell'anno selezionato. I dati stabili si gestiscono nelle tab <b>Profilo personale</b> e <b>Profilo P.IVA</b>.
    </div>

    <div class="settings-subsection-title">Parametri fiscali (anno)</div>
    <div class="settings-group">
      <label>Gruppo ATECO</label>
      <select id="settAtecoGruppo" onchange="applyAtecoGruppo(this.value)"></select>
    </div>
    <div class="settings-grid-2">
      <div class="settings-group">
        <label>Coefficiente redditività (%)</label>
        <input type="number" id="settCoefficiente" step="0.01" min="0" max="100"
          onchange="saveSetting('coefficiente', this.value); recalcAll()">
      </div>
      <div class="settings-group">
        <label>Aliquota imposta sostitutiva (%)</label>
        <input type="number" id="settAliquotaSost" step="0.01" min="0" max="100"
          onchange="saveSetting('impostaSostitutiva', this.value); recalcAll()">
      </div>
      <div class="settings-group">
        <label>Limite forfettario</label>
        <div style="padding:8px 10px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-sm);font-size:12px;color:var(--color-text-muted)">
          <b style="color:var(--color-text)">85.000 EUR</b> &mdash; D.L. 34/2023, art. 1 c. 54 (dal 2023)
        </div>
      </div>
      <div class="settings-group">
        <label>Usa parametri INPS ufficiali</label>
        <select id="settUsaInpsUfficiale" onchange="saveSetting('usaInpsUfficiale', this.value); recalcAll()">
          <option value="1">Sì (auto da anno)</option>
          <option value="0">No (manuale)</option>
        </select>
      </div>
      <div class="settings-group">
        <label>Riduzione contributi 35%</label>
        <select id="settRiduzione35" onchange="saveSetting('riduzione35', this.value); recalcAll()">
          <option value="0">No</option>
          <option value="1">Sì</option>
        </select>
        <div style="margin-top:4px;color:var(--color-text-muted);font-size:.72rem">
          Solo INPS Artigiani/Commercianti, solo per questo anno.
        </div>
      </div>
      <div class="settings-group">
        <label>Anno con reddito da lavoro dipendente</label>
        <select id="settDipendenteIncome" onchange="saveSetting('haRedditoDipendente', this.value); recalcAll()">
          <option value="0">No</option>
          <option value="1">Sì</option>
        </select>
      </div>
    </div>

    <div class="settings-subsection-title">Operatività</div>
    <div class="settings-grid-2">
      <div class="settings-group">
        <label>Paga giornaliera (EUR)</label>
        <input type="number" id="settDailyRate" value="0" onchange="saveSetting('dailyRate', this.value); recalcAll()">
      </div>
      <div class="settings-group">
        <label>Giorni medi per incasso fattura</label>
        <input type="number" id="settGiorniIncasso" value="30" min="0" max="120" onchange="setGiorniIncassoProfile(this.value)">
        <div style="margin-top:4px;color:var(--color-text-muted);font-size:.72rem">
          Impostazione di profilo, applicata a tutti gli anni.
        </div>
      </div>
      <div class="settings-group">
        <label>Override INAIL anno corrente (EUR)</label>
        <input type="number" id="settInailCorrente" step="0.01" placeholder="auto dal tasso"
          onchange="saveOptionalNumberSetting('scadenziarioInailCorrente', this.value); recalcAll()">
        <div style="margin-top:4px;color:var(--color-text-muted);font-size:.72rem">
          Il premio è calcolato dal tasso INAIL in Profilo P.IVA. Compila qui solo per sovrascrivere.
        </div>
      </div>
      <div class="settings-group">
        <label>Override INAIL anno successivo (EUR)</label>
        <input type="number" id="settInailSuccessivo" step="0.01" placeholder="auto dal tasso"
          onchange="saveOptionalNumberSetting('scadenziarioInailSuccessivo', this.value); recalcAll()">
      </div>
      <div class="settings-group">
        <label>Diritto Camera di Commercio (EUR)</label>
        <input type="number" id="settDirittoCamerale" step="0.01" placeholder="default: 53,00"
          onchange="saveOptionalNumberSetting('scadenziarioDirittoCamerale', this.value); recalcAll()">
        <div style="margin-top:4px;color:var(--color-text-muted);font-size:.72rem">
          Vuoto = valore standard 53 EUR (artigiani/commercianti).
        </div>
      </div>
    </div>

    <div class="settings-subsection-title">Dati & backup</div>
    <div class="settings-group" style="margin-top:12px">
      <button class="btn-add" onclick="exportData()" style="background:var(--color-info)">Esporta dati (JSON)</button>
      <button class="btn-add" onclick="document.getElementById('importFile').click()" style="background:var(--color-secondary);margin-left:8px">Importa dati</button>
      <input type="file" id="importFile" accept=".json" style="display:none" onchange="importData(event)">
    </div>
    <div class="settings-group" style="margin-top:12px">
      <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer;">
        <input type="checkbox" id="settDevHardDelete" style="margin-top:3px;"
          onchange="saveBoolSetting('devHardDelete', this.checked); recalcAll()">
        <span>
          <b>Hard-delete fatture (solo test)</b><br>
          <span style="color:var(--color-text-muted); font-size:.75rem;">&#9888; Disattivare prima del rilascio. Elimina fatture bypassando il workflow fiscale.</span>
        </span>
      </label>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Smoke test completo**

1. Impostazioni → 3 subsection: "Parametri fiscali (anno)", "Operatività", "Dati & backup"
2. Tutti gli `onchange` rispondono (cambia coefficiente → dashboard aggiorna)
3. Export/Import JSON funzionante
4. Nessun errore console
5. `node test/run-tests.js` verde

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "refactor(settings): riorganizza tab in 3 sezioni"
```

---

### Task 9: Aggiorna CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (sezioni Clienti e Settings)

- [ ] **Step 1: Aggiorna la sezione Clienti**

In `CLAUDE.md`, trova `#### Autofill da P.IVA (clienti-autofill.js)`. Sostituisci il bullet Settings:

Da:
> **Settings**: `settings.openapiKey` (string, default `''`), editabile dal tab **Impostazioni → sezione "Clienti"**.

A:
> **API key**: costante globale `GLOBAL_OPENAPI_KEY` hardcoded in `clienti-autofill.js`, condivisa tra tutti i profili. Non esposta nell'UI. Per aggiornarla: editare il file e ridistribuire. Placeholder `'__OPENAPI_KEY_PLACEHOLDER__'` → `hasApiKey()` ritorna false.

Rimuovi anche la nota sicurezza sulla sync Firebase (non più valida).

- [ ] **Step 2: Aggiorna il Data Model**

Nel blocco `### Data Model (per year)`, cerca la riga con `giorniIncasso,`. Aggiungi commento:
```
giorniIncasso,            // legacy; override da chiave profilo `calcoliPIVA_{profile}_giorniIncasso`
```

Se `openapiKey` compare nel data model di esempio, rimuovilo.

- [ ] **Step 3: Aggiungi nota profile-scoped in Firebase Sync**

Sotto `### Firebase Sync`, aggiungi in fondo:

> - `giorniIncasso` è profile-scoped via `PROFILE_META_KEYS`: letto/scritto da `getGiorniIncassoProfile()`/`setGiorniIncassoProfile()`. Al primo `applySettings` post-deploy, se l'anno corrente ha un valore != 30, viene promosso alla chiave di profilo (migrazione one-shot idempotente).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: aggiorna CLAUDE.md (openapiKey globale, giorniIncasso profile-scoped)"
```

---

### Task 10: Final smoke + segnale key placeholder

**Files:** nessuna modifica (solo verifica)

- [ ] **Step 1: Run tutti i test**

Run: `node test/run-tests.js`
Expected: 100% verde.

- [ ] **Step 2: Smoke E2E manuale**

1. Login → tutte le tab caricano
2. Impostazioni → 3 sezioni, nessun duplicato, nessun campo anagrafica
3. Cambio anno → giorniIncasso persiste
4. Profilo P.IVA → tasso INAIL settabile
5. Clienti → autofill risponde NO_KEY (placeholder)
6. Scadenziario → hint INAIL visibile se tasso=0; hint CdC visibile se no override
7. Export/Import JSON → no regressioni

- [ ] **Step 3: Segnalazione**

Comunica all'utente: "Pronto. Sostituisci `__OPENAPI_KEY_PLACEHOLDER__` in `clienti-autofill.js` con la chiave reale quando pronta."

---

## Self-review

- **Spec coverage**: Cleanup (T2-T5), fix bug giorniIncasso (T6), openapiKey globale (T1), hint INAIL/CdC (T7), riorganizzazione (T8), docs (T9). ✅
- **Placeholder scan**: `__OPENAPI_KEY_PLACEHOLDER__` è intenzionale (segnalato all'utente in T10). Nessun TBD/TODO. ✅
- **Type consistency**: `getGiorniIncassoProfile`/`setGiorniIncassoProfile` coerenti in T6 e T8. `GLOBAL_OPENAPI_KEY`/`hasApiKey`/`getApiKey`/`_setKeyForTests` coerenti in T1. ✅
- **Backward compat**: `limiteForfettario` default preservato in ensureDataShape. `openapiKey` legacy in localStorage → ignorato. Nessuna scrittura distruttiva. ✅
