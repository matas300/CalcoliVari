# Clienti Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rimpiazzare la griglia di card espandibili del tab Clienti con tabella compatta + modal di dettaglio, e mettere in piedi lo scaffolding per l'autofill anagrafica da P.IVA via openapi.it (API key rimandata).

**Architecture:** Nuovo modulo `clienti-autofill.js` (IIFE su `window.ClientiAutofill`) con contratto `lookupPartitaIva(piva)` → `{ok, data|error, code}`. `app.js` viene modificato per: rendere la nuova tabella, aprire il modal, gestire l'autofill. La API key sta in `settings.openapiKey`. Pattern HTML: stringhe template-literal assemblate e assegnate al DOM con la stessa convenzione dei render esistenti (`renderFatture`, `renderScadenziario`, ecc.), con `escapeHtml` su tutti i valori dinamici (già in uso nel codice).

**Tech Stack:** Vanilla JS (no-build), IIFE modules, Node minimal test runner (`test/run-tests.js`), CSS tokens.

**Spec di riferimento:** `docs/superpowers/specs/2026-04-20-clienti-redesign-design.md`.

**Pattern di riferimento nel codice esistente:**
- Render tab: `renderFatture()` in `app.js` — usa stringa HTML assemblata + `escapeHtml` + assegnazione DOM.
- Modal: `openFatturaModal` / `closeFatturaModal` / `renderFatturaModal` in `fatture-docs-feature.js` — aggiunta/rimozione classe `.open`, `aria-hidden`, body class `profile-modal-open`.
- Save inline: `updateClienteField(id, key, value)` già esistente in `app.js`.
- Toast: cercare `showFatturaToast` / `showToast` in `app.js` per riuso.
- Modulo IIFE stile: `fatture-ocr.js` e suo test `test/fatture-ocr-stub.test.js`.

---

## File Structure

**Nuovi:**
- `clienti-autofill.js`
- `test/clienti-autofill.test.js`

**Modificati:**
- `app.js` — rewrite `renderClienti`, nuove `openClienteModal/closeClienteModal/renderClienteModal/deleteClienteFromModal/autofillClienteFromPiva`, rimozione `renderClienteCard`/`renderClienteField`, `ensureDataShape` per `openapiKey`, bind tab Impostazioni.
- `index.html` — `<div id="clienteModal">`, `<script src="clienti-autofill.js" defer>`, campo API key in tab Impostazioni.
- `style.css` — classi `.clienti-table*`, `.cliente-modal*`, `.cliente-section*`, `.cliente-autofill-*`; rimozione classi morte `.cliente-card*`, `.clienti-grid`, `.cliente-chip`.
- `test/run-tests.js` — `require('./clienti-autofill.test.js')`.
- `CLAUDE.md` — sezione Clienti aggiornata.

---

### Task 1: Scaffolding `clienti-autofill.js` + test base

**Files:**
- Create: `clienti-autofill.js`
- Create: `test/clienti-autofill.test.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Scrivi il test base che fallisce**

Modella il file `test/clienti-autofill.test.js` sullo stile di `test/fatture-ocr-stub.test.js` (stessa forma: `global.window = global.window || {}; require('../clienti-autofill.js');`). Verifica nei primi due test:
1. `typeof global.window.ClientiAutofill === 'object'` e truthy.
2. Esistono le funzioni `lookupPartitaIva`, `hasApiKey`, `getApiKey` (tutte `function`).

Aggiungi `require('./clienti-autofill.test.js');` in `test/run-tests.js` dopo `require('./fatture-ocr-stub.test.js');`.

- [ ] **Step 2: Run — verifica che fallisca**

Comando: `node test/run-tests.js`
Atteso: `Cannot find module '../clienti-autofill.js'`.

- [ ] **Step 3: Implementa il modulo**

Crea `clienti-autofill.js` come IIFE `(function (root) { ... })(typeof window !== 'undefined' ? window : globalThis)`. Espone `root.ClientiAutofill = { lookupPartitaIva, hasApiKey, getApiKey }`.

Implementazione:
- `getSettingsObject()`: se `root.S` è funzione, tenta `root.S()`; else torna `root.data?.settings || {}`.
- `getApiKey()`: ritorna `(settings.openapiKey || '').trim()`.
- `hasApiKey()`: ritorna `getApiKey().length > 0`.
- `isValidPivaIT(piva)`: `typeof piva === 'string' && /^\d{11}$/.test(piva.trim())`.
- `normalizeResponse(raw)`: estrae `raw.data || raw`, mappa `denominazione|ragione_sociale|nome → nome`, `codice_fiscale|cf → cf`, `indirizzo|address → indirizzo`, `cap → cap`, `comune|citta|city → citta`, `provincia|province → provincia` (uppercase), `pec|email_pec → pec`. Tutti `.trim()`.
- `lookupPartitaIva(piva)` ritorna **sempre una Promise** che risolve con `{ok, ...}`:
  - Se `isValidPivaIT` falso → `{ok:false, code:'INVALID_PIVA', error:'P.IVA non valida (11 cifre)'}`.
  - Se key vuota → `{ok:false, code:'NO_KEY', error:'API key openapi.it non configurata'}`.
  - Se `root.fetch` non disponibile → `{ok:false, code:'NETWORK', error:'fetch non disponibile'}`.
  - Fetch `https://imprese.openapi.it/advance/{piva}` con header `Authorization: Bearer {key}`.
    - 404 → `{ok:false, code:'NOT_FOUND'}`.
    - `!res.ok` → `{ok:false, code:'NETWORK', error:'HTTP ' + res.status}`.
    - ok → `res.json()` → `{ok:true, data: normalizeResponse(json)}`.
    - catch → `{ok:false, code:'NETWORK', error: err.message}`.

- [ ] **Step 4: Run — verifica pass**

Comando: `node test/run-tests.js`
Atteso: i 2 test nuovi passano; il totale precedente + 2.

- [ ] **Step 5: Commit**

```bash
git add clienti-autofill.js test/clienti-autofill.test.js test/run-tests.js
git commit -m "feat(clienti): scaffolding modulo autofill P.IVA openapi.it"
```

---

### Task 2: Test casi di errore + happy path

**Files:**
- Modify: `test/clienti-autofill.test.js`

- [ ] **Step 1: Aggiungi 5 test**

Dentro il `describe` esistente, aggiungi test che ritornano la promise (pattern del test runner: `return promise.then(...)`):

1. **INVALID_PIVA**: `lookupPartitaIva('abc')` → `r.ok === false && r.code === 'INVALID_PIVA'`.
2. **NO_KEY**: set `global.data = { settings: {} }`, poi `lookupPartitaIva('12345678901')` → `code === 'NO_KEY'`.
3. **happy path**: set `global.data.settings.openapiKey = 'test-key'`, stubba `global.window.fetch` a una Promise.resolve di `{ok:true, status:200, json: () => Promise.resolve({data:{denominazione:'Acme Spa', codice_fiscale:'01234567890', indirizzo:'Via Roma 1', cap:'20100', comune:'Milano', provincia:'mi', pec:'acme@pec.it'}})}`. Verifica `r.ok===true`, `r.data.nome==='Acme Spa'`, `r.data.provincia==='MI'`, `r.data.cap==='20100'`.
4. **NOT_FOUND**: stub fetch → `{ok:false, status:404}`. Verifica `code === 'NOT_FOUND'`.
5. **NETWORK**: stub fetch → `Promise.reject(new Error('boom'))`. Verifica `code === 'NETWORK'`.

- [ ] **Step 2: Run**

Comando: `node test/run-tests.js`
Atteso: tutti pass, 7 test ClientiAutofill (2+5).

- [ ] **Step 3: Commit**

```bash
git add test/clienti-autofill.test.js
git commit -m "test(clienti): copertura error codes autofill P.IVA"
```

---

### Task 3: Setting `openapiKey` + UI Impostazioni

**Files:**
- Modify: `app.js`
- Modify: `index.html`

- [ ] **Step 1: Default in `ensureDataShape`**

In `app.js` (Grep: `function ensureDataShape`), dove vengono applicati i default a `target.settings`, aggiungi:
```js
if (typeof target.settings.openapiKey !== 'string') target.settings.openapiKey = '';
```

- [ ] **Step 2: Campo in tab Impostazioni**

In `index.html` (Grep: `id="tab-impostazioni"`), in una posizione sensata della lista sezioni, aggiungi un blocco `.settings-section` con:
- titolo `<h4>Autofill anagrafica clienti</h4>`
- label + `<input type="password" id="openapiKeyInput" oninput="saveTextSetting('openapiKey', this.value)">`
- paragrafo hint con link `<a href="https://openapi.it/" target="_blank" rel="noopener">openapi.it</a>` che spiega "100 req/mese gratis, serve per autocompilare anagrafica da P.IVA".

- [ ] **Step 3: Bind valore all'attivazione tab**

In `app.js` trova la logica di `switchToTab` (Grep: `function switchToTab`). Quando `tabName === 'impostazioni'`, leggi `S().openapiKey || ''` e assegnalo a `document.getElementById('openapiKeyInput').value`.

- [ ] **Step 4: Include script**

In `index.html`, prima di `<script src="app.js"`, aggiungi:
```html
<script src="clienti-autofill.js" defer></script>
```

- [ ] **Step 5: Smoke manuale**

Apri l'app, va su Impostazioni, verifica campo presente. Scrivi valore, ricarica → persiste. In console: `ClientiAutofill.hasApiKey()` → `true`.

- [ ] **Step 6: Commit**

```bash
git add app.js index.html
git commit -m "feat(clienti): settings.openapiKey + campo API key in Impostazioni"
```

---

### Task 4: Tabella clienti (rimpiazza cards)

**Files:**
- Modify: `app.js` (funzione `renderClienti`)
- Modify: `style.css`

- [ ] **Step 1: Rewrite `renderClienti`**

Localizza `renderClienti` in `app.js` (circa linee 6007-6054). Mantieni identici:
- guard `!currentProfile`
- preservazione focus/selection su `#clientiSearch`
- toolbar (search + counter + btn `+ Nuovo cliente`)
- empty state

Sostituisci SOLO il blocco della griglia di card con la tabella:
- Wrapper `<div class="clienti-table">`
- Header row: `<div class="clienti-table-header">` con 4 colonne (`Nome`, `P.IVA`, `Città`, colonna vuota chevron).
- Per ogni cliente filtrato, una riga `<div class="clienti-table-row" onclick="openClienteModal('...')">` con 4 celle: nome (bold), P.IVA (o `—`), città (o `—`), chevron `›`. Tutti i valori passati attraverso `escapeHtml` come nel codice esistente (vedi `renderClienteCard` come riferimento).
- Rimuovi il loop `renderClienteCard`.

- [ ] **Step 2: CSS tabella**

In `style.css`, in fondo ma prima dei `@media` finali, aggiungi un blocco `/* ═════ Clienti — Tabella ═════ */` con:
- `.clienti-table` — `background: var(--color-surface)`, `border: 1px solid var(--color-border)`, `border-radius: var(--radius-md)`, `overflow: hidden`, `margin-top: var(--space-3)`.
- `.clienti-table-header, .clienti-table-row` — `display: grid`, `grid-template-columns: 2fr 1.2fr 1fr 28px`, `gap: var(--space-3)`, `padding: var(--space-3) var(--space-4)`, `align-items: center`.
- `.clienti-table-header` — font 11px uppercase letter-spacing .06em, bg `--color-surface-2`, border-bottom 1px.
- `.clienti-table-row` — border-top 1px, cursor pointer, transition 120ms, font 13px; `:hover { background: var(--color-surface-2); }`; `:first-of-type { border-top: none; }`.
- `.clienti-row-nome` — font-weight 600.
- `.clienti-row-piva` — `font-variant-numeric: tabular-nums; color: var(--color-text-muted)`.
- `.clienti-row-citta` — `color: var(--color-text-muted)`.
- `.clienti-row-chev` — `color: var(--color-text-faint); text-align: right`.
- `@media (max-width: 640px)` — `.clienti-table-header, .clienti-table-row { grid-template-columns: 1fr auto; }` e nascondi `.clienti-row-piva, .clienti-row-chev`.

- [ ] **Step 3: Smoke**

Ricarica, tab Clienti → tabella visibile, search filtra, `+ Nuovo cliente` crea record (modal non esiste ancora → nessun errore, solo nessuna apertura). Click su riga → solleva `openClienteModal is not defined` in console: atteso finché non completi Task 5.

- [ ] **Step 4: Commit**

```bash
git add app.js style.css
git commit -m "feat(clienti): tabella compatta rimpiazza card espandibili"
```

---

### Task 5: Modal cliente (render + apri/chiudi + elimina)

**Files:**
- Modify: `index.html` (markup modale)
- Modify: `app.js` (state + funzioni modal)
- Modify: `style.css` (classi `.cliente-modal*`)

- [ ] **Step 1: Markup modale in `index.html`**

Subito dopo `#fatturaModal` (Grep: `id="fatturaModal"`), aggiungi il blocco markup:
- `<div id="clienteModal" class="cliente-modal" aria-hidden="true" role="dialog" aria-labelledby="clienteModalTitle">`
- Overlay: `<div class="cliente-modal-overlay" onclick="closeClienteModal()"></div>`.
- Dialog: `<div class="cliente-modal-dialog">`.
  - Header `<div class="cliente-modal-header">`: `<h3 id="clienteModalTitle">Cliente</h3>` e bottone close `×`.
  - Body `<div class="cliente-modal-body" id="clienteModalBody">` (vuoto, verrà popolato dal render JS).

- [ ] **Step 2: State + funzioni in `app.js`**

Dopo `clientiUiState` (Grep `clientiUiState`), aggiungi:
- `const clienteModalState = { id: null };`
- `openClienteModal(id)`: cerca cliente in `getClienti()`, se non esiste return. Setta `clienteModalState.id = id`, chiama `renderClienteModal()`, aggiunge classe `open` e `aria-hidden="false"` a `#clienteModal`, aggiunge `profile-modal-open` al body. (Stesso pattern di `openFatturaModal`.)
- `closeClienteModal()`: rimuove classi, setta `aria-hidden="true"`, resetta state.
- `renderClienteModal()`: legge il cliente dallo state; se non esiste → `closeClienteModal`. Aggiorna `#clienteModalTitle.textContent` con `cliente.nome || 'Nuovo cliente'`. Costruisce HTML del body come stringa template-literal con le 5 sezioni richieste dalla spec (Partita IVA + autofill, Anagrafica, Sede, Fatturazione elettronica, Note, Footer con Elimina/Chiudi). Ogni `<input>`/`<textarea>` salva via `oninput="updateClienteField('ID','KEY',this.value)"`. Per il nome, dopo l'update aggiorna anche il titolo modale. Applica `escapeHtml` su tutti i valori, come fa `renderClienteCard` oggi. Assegnazione finale al `.cliente-modal-body` con lo stesso pattern usato in `renderFatture` / `renderClienti` (stringa HTML assemblata e assegnata al nodo DOM).
- `deleteClienteFromModal(id)`: recupera cliente, se esiste `showAppConfirm({title:'Eliminare cliente?', message:'...', okLabel:'Elimina', danger:true})` (fallback `confirm(...)`). Se conferma: `saveClienti(getClienti().filter(c => c.id !== id))`, `closeClienteModal()`, `renderClienti()`.

- [ ] **Step 3: Aggancia `addCliente` e `updateClienteField`**

- In `addCliente` (Grep: `function addCliente`), dopo `renderClienti();` aggiungi `openClienteModal(next.id);` per aprire subito il modal sul nuovo record.
- In `updateClienteField`, in fondo (dopo `renderClienti();`), aggiungi:
```js
if (clienteModalState.id === id) renderClienteModal();
```

- [ ] **Step 4: CSS modale**

In `style.css`, dopo il blocco `.clienti-table` del Task 4:
- `.cliente-modal` — `position: fixed`, `inset: 0`, `z-index: 1000`, `display: none`, `align-items: center`, `justify-content: center`, `padding: var(--space-4)`.
- `.cliente-modal.open` — `display: flex`.
- `.cliente-modal-overlay` — `position: absolute`, `inset: 0`, `background: rgba(0,0,0,.4)`.
- `.cliente-modal-dialog` — `position: relative`, `width: 100%`, `max-width: 520px`, `max-height: 90vh`, `overflow-y: auto`, `background: var(--color-surface-3)`, `border`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-modal)`.
- `.cliente-modal-header` — flex space-between, padding, `background: var(--color-surface-2)`, border-bottom, `border-radius: var(--radius-lg) var(--radius-lg) 0 0`.
- `.cliente-modal-header h3` — `font-size: 15px; margin: 0`.
- `.cliente-modal-close` — transparent button, font 22px, color muted, cursor pointer; `:hover` colora testo.
- `.cliente-modal-body` — `padding: var(--space-4)`.
- `.cliente-modal-body input, .cliente-modal-body textarea` — `width: 100%`, `margin-bottom: var(--space-2)`.
- `.cliente-modal-body label, .cliente-section > label` — block, `font-size: 11px`, color muted, `margin: var(--space-2) 0 2px`.
- `.cliente-section-label` — `font-size: 10px`, uppercase, letter-spacing .06em, color faint, margin-bottom.
- `.cliente-sep` — border none, border-top 1px `--color-border`, margin `var(--space-3) 0`.
- `.cliente-autofill-input` — `display: flex; gap: var(--space-2)`; child `input` `flex:1`, `margin-bottom: 0`.
- `.cliente-grid-2` — 2 colonne.
- `.cliente-grid-3` — `grid-template-columns: 90px 1fr 70px 70px`; `@media (max-width: 640px)` → `1fr 1fr`.
- `.cliente-modal-footer` — flex space-between, margin-top, padding-top, border-top.

- [ ] **Step 5: Smoke**

Ricarica, tab Clienti → click riga → modal si apre con tutti i campi. Edita nome → titolo si aggiorna live, save inline. Click × o fuori dal dialog → chiude. `+ Nuovo cliente` → crea record e apre subito il modal. Elimina → conferma, chiude, sparisce dalla tabella.

- [ ] **Step 6: Commit**

```bash
git add app.js index.html style.css
git commit -m "feat(clienti): modal dettaglio con sezioni Anagrafica/Sede/FE/Note"
```

---

### Task 6: Wiring autofill dal modal

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Funzione `autofillClienteFromPiva`**

Aggiungi dopo `deleteClienteFromModal`. Comportamento:
1. Guardia `window.ClientiAutofill` presente; altrimenti toast error.
2. Cerca cliente in `getClienti()`. Legge `cliente.partitaIva`.
3. Se `!ClientiAutofill.hasApiKey()` → toast info `"Configura la tua API key openapi.it in Impostazioni"`; return.
4. Disabilita il pulsante (cambia label a `"… cerco"`).
5. Chiama `ClientiAutofill.lookupPartitaIva(piva).then(res => ...)`.
6. Riabilita pulsante.
7. Se `!res.ok`: toast errore con messaggio derivato dal `code` (`INVALID_PIVA`, `NOT_FOUND`, `NO_KEY`, `NETWORK`).
8. Se ok: merge campi `nome, codiceFiscale (←cf), indirizzo, cap, citta, provincia, pec` nel cliente. Regola: se il campo è già valorizzato e diverso dal valore in arrivo, NON sovrascrivere e incrementa `skipped`. Se il campo è vuoto → assegna.
9. `saveClienti` del nuovo array, `renderClienteModal()`, `renderClienti()`.
10. Toast success con `"Autofill completato"` o `"Autofill completato · N campi già compilati non modificati"` se `skipped > 0`.

- [ ] **Step 2: Uniforma il nome del toast**

Grep in `app.js` per `function show.*[Tt]oast` e scegli la funzione toast standard del progetto (probabilmente `showToast` o `showFatturaToast`). Usala nelle 4 chiamate del passo 1 al posto di un nome generico (rimpiazza il placeholder `showToastGeneric` se usato).

- [ ] **Step 3: Smoke**

Apri modal cliente, digita 11 cifre casuali come P.IVA, click `🔍 Autofill`:
- Senza API key configurata → toast info.
- Con API key fake → toast error NETWORK o NOT_FOUND.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(clienti): wiring autofill P.IVA dal modal con gestione stati"
```

---

### Task 7: Cleanup dead code

**Files:**
- Modify: `app.js`
- Modify: `style.css`

- [ ] **Step 1: Rimuovi funzioni morte**

Cancella da `app.js`:
- `renderClienteCard` (intera funzione).
- `renderClienteField` (se esiste).
- `deleteCliente` se non è più chiamato da nessuna parte. Verifica: `grep -n "deleteCliente(" app.js index.html` → se 0 chiamanti oltre alla definizione, cancella anche la definizione. Altrimenti lasciala.

- [ ] **Step 2: Rimuovi CSS morti**

In `style.css` cerca blocchi `.cliente-card`, `.clienti-grid`, `.cliente-chip`, `.cliente-card-summary`, `.cliente-card-body`, `.cliente-card-footer`, `.cliente-card-title`, `.cliente-card-badges`, `.cliente-card-hint`, `.cliente-delete-btn`, `.cliente-grid` e cancellali. Fai un pass di verifica finale con Grep.

- [ ] **Step 3: Run test + smoke**

Comando: `node test/run-tests.js` → tutti pass.
Apri l'app → tab Clienti funziona, console pulita, nessuna regressione UI in altri tab.

- [ ] **Step 4: Commit**

```bash
git add app.js style.css
git commit -m "chore(clienti): rimozione dead code card layout"
```

---

### Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Aggiorna sezione Clienti**

In `CLAUDE.md`, localizza la sezione Clienti (Grep `clienti`). Aggiungi/aggiorna i punti:
- Vista principale: tabella compatta in `renderClienti()`. Click riga → `openClienteModal(id)`.
- Modal dettaglio `#clienteModal`, render `renderClienteModal()`, sezioni Anagrafica/Sede/FE/Note, save inline via `updateClienteField`.
- Autofill P.IVA: `window.ClientiAutofill.lookupPartitaIva(piva) → Promise<{ok, data|error, code}>` in `clienti-autofill.js`. Codici: `INVALID_PIVA | NO_KEY | NOT_FOUND | NETWORK`.
- API key in `settings.openapiKey` (vuota default). Configurabile dal tab Impostazioni. Nota: la key è sincronizzata su Firebase con le altre settings.
- Storage invariato: `calcoliPIVA_{profile}_clienti`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — tab Clienti redesign + autofill stub"
```

---

## Self-review

- **Spec coverage:**
  - §1 tabella → Task 4.
  - §2 modal → Task 5.
  - §3 autofill scaffolding → Task 1-2 (modulo), Task 3 (settings + UI), Task 6 (wiring).
  - §4 data model invariato → nessun task (verificato).
  - §5 file list → tutti coperti.
  - §6 testing → Task 1-2 (5 casi + 2 smoke tests sul modulo).
  - §7 a11y/mobile → coperto nei CSS dei Task 4 e 5.
  - §8 out-of-scope → rispettato (nessuna chiamata live obbligatoria, zero dipendenze nuove).
  - §9 rischi → documentato in Task 8 (API key su Firebase).
- **Nessun placeholder TBD/TODO.** Ogni task ha comandi e criteri di successo specifici.
- **Naming:** `openClienteModal / closeClienteModal / renderClienteModal / deleteClienteFromModal / autofillClienteFromPiva` — consistenti fra Task 5/6/7.
- **Riferimenti a codice esistente:** il plan rimanda esplicitamente ai pattern di `renderFatture`, `openFatturaModal`, `renderClienteCard` (vecchio), `fatture-ocr.js` per il test. L'engineer che esegue il plan legge quei file per replicare lo stile del progetto invece di copiare codice qui.
