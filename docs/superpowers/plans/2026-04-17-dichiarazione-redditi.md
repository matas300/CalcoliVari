# Dichiarazione Redditi PF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the tax return preparation feature as a complete Redditi PF wizard covering 6 core quadri + 3 conditional quadri, with automatic prefill from existing app state, per-rigo manual overrides, 2-tier validation, and two exports (JSON+CSV and PDF).

**Architecture:** Pure engine module (`dichiarazione-engine.js`) + UI wizard (`dichiarazione-ui.js`) + exporters (`dichiarazione-exports.js`). Engine is DOM-free and unit-tested. UI persists edits live to `yearData.dichiarazione`. Silent migration replaces legacy `yearData.lmQuadro`. Profile settings extended with anagrafica + attività blocks.

**Tech Stack:** Vanilla HTML/CSS/JS, no build tools. Existing `tax-engine.js` reused for base forfettario calculations. `jsPDF` for C3 PDF export (already loaded in project for invoices). Custom unit test runner following pattern established by sub-project 1.

**Branch:** `codex/dichiarazione-redditi` (from `codex/dev-newfeatures`). Merge back when all tasks complete and tests green.

**Spec:** `docs/superpowers/specs/2026-04-17-dichiarazione-redditi-design.md`

---

## Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1:** From repo root on `codex/dev-newfeatures`, create and switch branch:
  ```bash
  git checkout -b codex/dichiarazione-redditi
  ```
- [ ] **Step 2:** Verify clean tree: `git status` → only the plan file already committed on parent branch.

---

## Task 1: Scaffolding & data model migration

**Files:**
- Create: `dichiarazione-engine.js` (stub)
- Create: `dichiarazione-ui.js` (stub)
- Create: `dichiarazione-exports.js` (stub)
- Modify: `app.js` — extend `ensureDataShape`, add migration function
- Modify: `index.html` — add `<script>` tags for new files (order: tax-engine → dichiarazione-engine → dichiarazione-exports → dichiarazione-ui)

**Goal:** Data structure in place, migration working, new files loadable, nothing rendered yet.

- [ ] **Step 1: Create engine stub** — `dichiarazione-engine.js`:
  ```js
  (function () {
    const DichiarazioneEngine = {
      buildFrontespizio() { return {}; },
      buildQuadroLM() { return {}; },
      buildQuadroRR() { return {}; },
      buildQuadroRS() { return {}; },
      buildQuadroRX() { return {}; },
      buildQuadroRW() { return {}; },
      buildCondizionali() { return {}; },
      buildDichiarazione() { return {}; },
      validateDichiarazione() { return { errors: [], warnings: [] }; },
      VERSION: '0.1.0'
    };
    if (typeof window !== 'undefined') window.DichiarazioneEngine = DichiarazioneEngine;
    if (typeof module !== 'undefined') module.exports = DichiarazioneEngine;
  })();
  ```
- [ ] **Step 2: Create UI stub** — `dichiarazione-ui.js` exporting `window.DichiarazioneUI = { mount(containerId, year){}, unmount(){} }`.
- [ ] **Step 3: Create exports stub** — `dichiarazione-exports.js` exporting `window.DichiarazioneExports = { exportC2(dich){}, exportC3(dich){} }`.
- [ ] **Step 4: Extend `ensureDataShape` in `app.js`** — add at the end, before return:
  ```js
  if (!out.dichiarazione || typeof out.dichiarazione !== 'object') {
    out.dichiarazione = {
      tipoDichiarazione: 'ordinaria',
      dataPresentazione: null,
      flags: { annoMisto: false, imposteEstere: false, altriCrediti: false },
      contiEsteri: [],
      coniuge: null,
      familiariCarico: [],
      overrides: {},
      computed: null,
      statoCompilazione: 'bozza'
    };
  }
  // Migrate legacy lmQuadro
  if (out.lmQuadro && out.lmQuadro.overrides) {
    Object.assign(out.dichiarazione.overrides, out.lmQuadro.overrides);
    delete out.lmQuadro;
  }
  ```
- [ ] **Step 5: Extend profile settings shape** — in the settings defaults block in `app.js`, add:
  ```js
  if (!out.settings.anagrafica) out.settings.anagrafica = {
    codiceFiscale: '', cognome: '', nome: '', sesso: '', dataNascita: '',
    comuneNascita: '', provNascita: '',
    residenzaVia: '', residenzaComune: '', residenzaProv: '', residenzaCap: '',
    domicilioFiscaleVia: '', domicilioFiscaleComune: '', domicilioFiscaleProv: '', domicilioFiscaleCap: '',
    telefono: '', email: '', statoCivile: ''
  };
  if (!out.settings.attivita) out.settings.attivita = {
    codiceAteco: '', descrizioneAttivita: '', dataInizioAttivita: '',
    sedeVia: '', sedeComune: '', sedeProv: '', sedeCap: ''
  };
  ```
- [ ] **Step 6: Add `<script>` tags to `index.html`** in order after tax-engine.js and before app.js.
- [ ] **Step 7: Manual smoke test:** open app in browser, login, verify no console errors, verify `sessionStorage` data includes new `dichiarazione` block for current year and `settings.anagrafica`/`attivita`.
- [ ] **Step 8: Commit:**
  ```bash
  git add dichiarazione-engine.js dichiarazione-ui.js dichiarazione-exports.js app.js index.html
  git commit -m "feat(dichiarazione): scaffolding + data model + lmQuadro migration"
  ```

---

## Task 2: Remove legacy Quadro LM modal

**Files:**
- Modify: `app.js` — delete `openQuadroLMModal`, `saveQuadroLMDraft`, `exportQuadroLMPrint`, all their helpers and the modal DOM builders
- Modify: `index.html` — remove modal container if present
- Modify: `app.js` — replace `Genera Quadro LM` button in Regime summary with new "Apri Dichiarazione" (wired to a placeholder `alert('Modulo in costruzione')` for now)

**Goal:** Old code gone, app still renders without errors.

- [ ] **Step 1:** `grep -n "openQuadroLMModal\|saveQuadroLMDraft\|exportQuadroLMPrint" app.js` → note line ranges.
- [ ] **Step 2:** Delete all referenced functions and inline templates. Remove calls/references globally.
- [ ] **Step 3:** Replace the button onclick in the regime summary panel with `onclick="alert('Modulo dichiarazione in costruzione')"` and id="btn-open-dichiarazione".
- [ ] **Step 4:** Manual smoke test: regime tab renders, clicking new button shows alert, no console errors.
- [ ] **Step 5: Commit:**
  ```bash
  git add app.js index.html
  git commit -m "refactor(dichiarazione): remove legacy Quadro LM modal"
  ```

---

## Task 3: Test runner setup

**Files:**
- Create: `test/dichiarazione-engine.test.js`
- Create or verify: `test/run-tests.js` (if already exists from sub-project 1, reuse it)
- Create: `test/dichiarazione-fixtures.js`

**Goal:** Test harness runs a placeholder test green.

- [ ] **Step 1: Check existing test infra:**
  ```bash
  ls test/
  ```
  If `run-tests.js` from sub-project 1 exists, reuse. Otherwise create a minimal Node-based runner that requires test files and prints pass/fail counts.
- [ ] **Step 2: Create fixtures** `test/dichiarazione-fixtures.js` with 3 reusable yearData fixtures: `artigianoStandard2025`, `commercianteRiduzione2025`, `gestSepStartup2025`. Each must include realistic `settings`, `fatture`, `pagamenti` consistent with existing app shape.
- [ ] **Step 3: Create `test/dichiarazione-engine.test.js`** with a placeholder test:
  ```js
  const DE = require('../dichiarazione-engine.js');
  describe('DichiarazioneEngine', () => {
    test('stub version', () => {
      expect(DE.VERSION).toBe('0.1.0');
    });
  });
  ```
  Adapt the `describe`/`test` helpers to whatever convention the existing runner uses.
- [ ] **Step 4: Run tests:**
  ```bash
  node test/run-tests.js
  ```
  Expected: 1 pass.
- [ ] **Step 5: Commit:**
  ```bash
  git add test/
  git commit -m "test(dichiarazione): add test harness + fixtures"
  ```

---

## Task 4: Profilo fiscale — anagrafica + attività UI

**Files:**
- Modify: `app.js` — add new settings panels in Impostazioni tab, wire save handlers
- Modify: `style.css` — add form layout for new blocks

**Goal:** User can enter and persist anagrafica + attività data; CF is validated client-side.

- [ ] **Step 1:** Write unit test for CF validator in `test/dichiarazione-engine.test.js`:
  ```js
  test('validateCodiceFiscale accepts RSSMRA80A01H501U', () => {
    expect(DE.validateCodiceFiscale('RSSMRA80A01H501U')).toBe(true);
  });
  test('validateCodiceFiscale rejects empty and short strings', () => {
    expect(DE.validateCodiceFiscale('')).toBe(false);
    expect(DE.validateCodiceFiscale('RSSMRA80')).toBe(false);
  });
  test('validateCodiceFiscale rejects wrong check digit', () => {
    expect(DE.validateCodiceFiscale('RSSMRA80A01H501X')).toBe(false);
  });
  ```
- [ ] **Step 2:** Run tests → FAIL.
- [ ] **Step 3:** Implement `DichiarazioneEngine.validateCodiceFiscale(cf)` with full 16-char regex + check digit algorithm (standard Italian CF algorithm: odd/even position table, mod 26). Export it.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** In `app.js` `renderSettings()` (or equivalent), add two new panels right after the existing "Profilo fiscale" block: **Anagrafica dichiarante** (16 inputs mapped to `settings.anagrafica.*`) and **Attività** (7 inputs mapped to `settings.attivita.*`). Use existing `saveTextSetting` / `saveSetting` patterns. Show inline validation state (red border + message) for the CF field using the new validator.
- [ ] **Step 6:** Add `style.css` rules for a 2-column grid layout for the new panels, respecting dark/light theme variables.
- [ ] **Step 7:** Manual smoke test: open Impostazioni, fill CF, name, date, residenza; reload page; verify persistence.
- [ ] **Step 8: Commit:**
  ```bash
  git add dichiarazione-engine.js app.js style.css test/
  git commit -m "feat(dichiarazione): profilo fiscale esteso con anagrafica + attività"
  ```

---

## Task 5: Engine — Frontespizio + Quadro LM

**Files:**
- Modify: `dichiarazione-engine.js`
- Modify: `test/dichiarazione-engine.test.js`

**Goal:** Two buildable quadri with unit tests covering happy path and override.

- [ ] **Step 1: Tests for `buildFrontespizio`:**
  ```js
  test('buildFrontespizio copies anagrafica into quadro', () => {
    const fp = DE.buildFrontespizio(fixtures.artigianoStandard2025, 2025, { tipoDichiarazione: 'ordinaria' });
    expect(fp.codiceFiscale).toBe('RSSMRA80A01H501U');
    expect(fp.annoImposta).toBe(2025);
    expect(fp.tipoDichiarazione).toBe('ordinaria');
  });
  ```
- [ ] **Step 2:** Run → FAIL. Implement `buildFrontespizio(profile, year, input)` reading `profile.settings.anagrafica`, `profile.settings.attivita`, merging with `input.tipoDichiarazione`/`input.dataPresentazione`/variazioni residenza.
- [ ] **Step 3: Run → PASS.**
- [ ] **Step 4: Tests for `buildQuadroLM`** — at least 5 cases:
  - 4a. Standard artigiano 60k, coeff 67%, aliquota 15% → verify LM1=60000, LM2=40200, LM34=40200-contributi, LM36=LM34*0.15
  - 4b. Start-up (reddito lordo sotto 5 anni + ATECO start-up) aliquota 5% → LM36=LM34*0.05
  - 4c. Perdite pregresse: `overrides.LM_perditePregresse = 5000` → LM34 ridotto di 5000
  - 4d. Override manuale LM2: `overrides.LM2_col2 = 41000` → LM2 uses 41000 instead of computed
  - 4e. Coefficiente multi-ATECO (attività mista): verify somma pesata coefficienti
- [ ] **Step 5: Run → FAIL (implementation missing).** Implement `buildQuadroLM(yearData, settings, overrides)`. Reuse `window.TaxEngine.buildForfettarioScenario` for base calcs where possible. Return object with keys `LM1`, `LM2`, `LM3` ... `LM36`, `LM47` each as `{ col1: ..., col2: ..., descrizione: ..., source: 'computed'|'override' }`.
- [ ] **Step 6: Run → PASS.**
- [ ] **Step 7: Commit:**
  ```bash
  git add dichiarazione-engine.js test/dichiarazione-engine.test.js
  git commit -m "feat(dichiarazione): engine Frontespizio + Quadro LM + tests"
  ```

---

## Task 6: Engine — Quadro RR + RS + RX

**Files:**
- Modify: `dichiarazione-engine.js`
- Modify: `test/dichiarazione-engine.test.js`

**Goal:** Three more buildable quadri with full test coverage.

- [ ] **Step 1: Tests for `buildQuadroRR`** — 4 cases:
  - Artigiano, INPS ufficiale 2025, reddito > minimale → compila Sez. I, RR8 = contributi eccedenti
  - Commerciante con riduzione 35% → RR riflette aliquote ridotte
  - Gestione separata, reddito 50k → compila solo Sez. II, nessun minimale
  - Reddito < minimale → RR8 = 0, nessun eccedente
- [ ] **Step 2: Run → FAIL. Implement `buildQuadroRR`** — consuma `settings.inpsCategoria`, `settings.riduzione35`, `OFFICIAL_ARTCOM_INPS` via `TaxEngine` helpers. Return Sez. I righi (minimale, eccedenti, contributi versati) + Sez. II (gest. sep. imponibile, aliquota, contributi).
- [ ] **Step 3: Run → PASS.**
- [ ] **Step 4: Tests for `buildQuadroRS`** — 2 cases:
  - Artigiano con `spese` vuote → righi RS371-381 tutti a 0 ma compilabili via override
  - Override manuale `RS371_col1 = 2500` → prevale
- [ ] **Step 5: Implement `buildQuadroRS`** — mappa categorie costi forfettari ai righi RS371-RS381; i forfettari hanno obbligo di compilazione solo per alcuni righi sintetici, non dettaglio spese. Usa default a 0 + override.
- [ ] **Step 6: Tests for `buildQuadroRX`** — 3 cases:
  - Nessun credito anno precedente → RX1, RX2 a 0
  - Credito anno precedente 800 € → RX1 col. credito = 800, propagato da `precedente.quadroRX.eccedenza`
  - Saldo a debito anno corrente 1200 € + credito 800 → RX risulta in 400 da pagare
- [ ] **Step 7: Implement `buildQuadroRX(yearData, settings, precedente, overrides)`** — riceve oggetto quadroRX anno precedente (opzionale) per eccedenza; altrimenti usa `settings.creditoAnnoPrecedente` se presente.
- [ ] **Step 8: Run full test suite → all PASS.**
- [ ] **Step 9: Commit:**
  ```bash
  git add dichiarazione-engine.js test/dichiarazione-engine.test.js
  git commit -m "feat(dichiarazione): engine Quadri RR + RS + RX + tests"
  ```

---

## Task 7: Engine — Quadro RW + Condizionali + aggregator + validator

**Files:**
- Modify: `dichiarazione-engine.js`
- Modify: `test/dichiarazione-engine.test.js`

**Goal:** RW + RN/RP/RV + CE + CR builders; top-level `buildDichiarazione` aggregator; full `validateDichiarazione` with errors+warnings.

- [ ] **Step 1: Tests `buildQuadroRW`** — 3 cases:
  - 2 conti esteri con dati completi → 2 righi RW
  - 1 conto con `valoreFinale` mancante → nessun errore in engine (validation gestirà)
  - Lista vuota → oggetto `{ righi: [] }`
- [ ] **Step 2: Implement `buildQuadroRW(input.contiEsteri)`** — return righi con mapping al tracciato RW (paese, codice, valore iniziale, valore finale, giorni, quota, valuta).
- [ ] **Step 3: Tests `buildCondizionali`** — 3 cases:
  - Flag `annoMisto=true` con reddito dipendente 30k → popola RN/RP/RV
  - Flag `imposteEstere=true` con credito 500 → popola CE
  - Nessun flag attivo → oggetto vuoto `{}`
- [ ] **Step 4: Implement `buildCondizionali(input, yearData)`** — delega al blocco corretto in base ai flag. Per RN/RP/RV in anno misto, usa scaglioni IRPEF 2024+ dalla tabella standard (23% fino 28k, 35% fino 50k, 43% oltre). Per CE, input diretto da `input.creditoEstero`.
- [ ] **Step 5: Tests `buildDichiarazione` aggregator** — 2 cases:
  - Artigiano standard → output contiene `frontespizio`, `quadroLM`, `quadroRR`, `quadroRS`, `quadroRW`, `quadroRX`, nessun condizionale
  - Con flag `annoMisto` → oltre ai core, contiene `quadroRN`, `quadroRP`, `quadroRV`
- [ ] **Step 6: Implement `buildDichiarazione(year, profile, input)`** — compone i builder, ritorna snapshot con timestamp.
- [ ] **Step 7: Tests `validateDichiarazione`** — 6 cases (uno per error rule nella spec Sez. 7) + 4 warning cases:
  - Error: CF invalido
  - Error: LM2 ≠ LM1 × coefficiente (manipola overrides per violare)
  - Error: LM36 ≠ LM34 × aliquota
  - Error: RR8 negativo
  - Error: RW con paese vuoto
  - Error: totale ricavi LM ≠ somma fatture incassate
  - Warning: reddito 90k (> 85k, < 100k)
  - Warning: reddito 110k (> 100k)
  - Warning: nessun contributo dedotto ma INPS attiva
  - Warning: acconti calcolati > versati
- [ ] **Step 8: Implement `validateDichiarazione(dichiarazione)`** — return `{ errors: [...], warnings: [...] }` dove ogni item è `{ code, message, quadro, rigo, severity }`.
- [ ] **Step 9: Run full suite → all PASS. Target: ≥ 20 test verdi.**
- [ ] **Step 10: Commit:**
  ```bash
  git add dichiarazione-engine.js test/dichiarazione-engine.test.js
  git commit -m "feat(dichiarazione): engine RW + condizionali + aggregator + validator"
  ```

---

## Task 8: Wizard shell + step 1 + step 2 + step 12

**Files:**
- Modify: `index.html` — add new tab button "Dichiarazione" in nav + main container
- Modify: `app.js` — wire tab switch + mount wizard
- Modify: `dichiarazione-ui.js` — wizard shell, progress sidebar, step 1 (anno/tipo/flag), step 2 (Frontespizio edit), step 12 (placeholder riepilogo)
- Modify: `style.css` — wizard layout, sidebar, stepper

**Goal:** User can open Dichiarazione tab, select year + tipo + flag, view/edit frontespizio, see empty riepilogo placeholder.

- [ ] **Step 1: `index.html`** — add button to tab-nav list (before Impostazioni) and `<div id="tab-dichiarazione" class="tab-content"></div>` container.
- [ ] **Step 2: `app.js`** — hook new tab in switch logic; on first activation call `window.DichiarazioneUI.mount('tab-dichiarazione', currentYear)`.
- [ ] **Step 3: `dichiarazione-ui.js`** — implement `mount`:
  - Build layout: left sidebar with step list (12 items, condizionali hidden per default), right main area
  - Render step 1: year selector + tipo dropdown + 3 flag checkboxes. On change, persist to `yearData.dichiarazione`, save, re-render sidebar to reflect step visibility.
  - Render step 2: form with fields from `profile.settings.anagrafica` + editable overrides for dati frontespizio (tipo, data presentazione, variazione residenza); show validation state for CF.
  - Render step 12: show `DichiarazioneEngine.buildDichiarazione(...)` output as a collapsed JSON tree with totali principali (reddito, imposta, saldo, contributi) in evidenza. 2 bottoni "Esporta C2" e "Esporta PDF C3" — entrambi disabilitati con tooltip "Non ancora implementato".
- [ ] **Step 4:** Navigazione step: click su voce sidebar → render step corrispondente. Progress indicator: step completati = verde, current = arancione, futuri = grigio. Persisti `currentStep` in `sessionStorage` (non in yearData, è UI state).
- [ ] **Step 5: `style.css`** — grid layout 280px sidebar + 1fr main, mobile: sidebar collapsed → top horizontal scroll.
- [ ] **Step 6:** Manual smoke test: apri tab Dichiarazione, cambia anno/flag, verifica step 8/9/10 compaiono/scompaiono, step 2 mostra CF dal profilo.
- [ ] **Step 7: Commit:**
  ```bash
  git add dichiarazione-ui.js index.html app.js style.css
  git commit -m "feat(dichiarazione): wizard shell + step 1/2/12"
  ```

---

## Task 9: Wizard quadri core — step 3 (LM), 4 (RR), 5 (RS), 6 (RW), 7 (RX)

**Files:**
- Modify: `dichiarazione-ui.js`
- Modify: `style.css`

**Goal:** All core quadri render with prefilled values + override inline per rigo.

- [ ] **Step 1:** Implement helper `renderRigo(rigo, key)` in `dichiarazione-ui.js`:
  - Receive rigo object from engine + storage key
  - Render numbered label (`LM2 col. 2`), description, input with current value
  - On blur: save to `yearData.dichiarazione.overrides[key]`, trigger full re-build, re-render current step
  - Badge `[auto]` o `[override]` accanto al valore per indicare origine
- [ ] **Step 2: Step 3 (LM)** — 3 sub-tabs: Sez. I (ricavi), Sez. II (reddito + imposta), Sez. III (perdite). Ogni sub-tab è una lista di righi via `renderRigo`.
- [ ] **Step 3: Step 4 (RR)** — sub-tab condizionali in base a `settings.inpsCategoria` (art/com → Sez. I, gestSep → Sez. II, nessuno → messaggio "Quadro non applicabile").
- [ ] **Step 4: Step 5 (RS)** — lista righi RS371-381 con override.
- [ ] **Step 5: Step 6 (RW)** — editor lista conti esteri: bottone "+", per ogni conto 7 campi + bottone rimuovi. Salva in `yearData.dichiarazione.contiEsteri`. Sotto la lista, anteprima righi RW generati dall'engine.
- [ ] **Step 6: Step 7 (RX)** — input campo "credito anno precedente" (persisti in `settings.creditoAnnoPrecedente`) + output rigo RX1/RX2/RX3 da engine.
- [ ] **Step 7:** Manual smoke test: cambia un override su LM2, verifica badge `[override]`, verifica che LM34 si ricalcola di conseguenza; aggiungi un conto estero, verifica RW compila un rigo.
- [ ] **Step 8: Commit:**
  ```bash
  git add dichiarazione-ui.js style.css
  git commit -m "feat(dichiarazione): wizard quadri core (LM/RR/RS/RW/RX)"
  ```

---

## Task 10: Wizard quadri condizionali — step 8 (RN/RP/RV), 9 (CE), 10 (CR)

**Files:**
- Modify: `dichiarazione-ui.js`

**Goal:** Condizionali rendered only when corresponding flag attivo; hidden otherwise.

- [ ] **Step 1:** Step 8 — se `flags.annoMisto`: input `redditoDipendente`, `dataInizioLavoro`, `dataFineLavoro`, `addizionaleRegionale`, `addizionaleComunale`, `oneriDetraibili[]` (editor lista con tipo/importo/percentuale). Se flag off → messaggio "Attiva flag anno misto nello step 1".
- [ ] **Step 2:** Step 9 — se `flags.imposteEstere`: input `creditoImposteEstere`, `paeseImpostaPagata`, `redditoEstero`. Output CE generato da engine.
- [ ] **Step 3:** Step 10 — se `flags.altriCrediti`: editor lista crediti (tipo: canone RAI, affitto, detrazione ristrutturazione; importo). Output CR.
- [ ] **Step 4:** Sidebar step list nasconde/mostra gli step condizionali in base ai flag (già parzialmente fatto in Task 8 step 3, qui verifichiamo integrazione).
- [ ] **Step 5:** Manual smoke test: attiva/disattiva ogni flag, verifica visibilità step e persistenza dati.
- [ ] **Step 6: Commit:**
  ```bash
  git add dichiarazione-ui.js
  git commit -m "feat(dichiarazione): wizard quadri condizionali (RN/RP/RV/CE/CR)"
  ```

---

## Task 11: Step 11 — Validazione

**Files:**
- Modify: `dichiarazione-ui.js`
- Modify: `style.css`

**Goal:** Errors + warnings renderizzati con link cliccabili al rigo; bottone "Procedi" gated da 0 errors + conferma warnings.

- [ ] **Step 1:** Step 11 render:
  - Top: summary badge `X errori, Y warning`
  - Due sezioni: Errori (rosso) e Avvisi (giallo)
  - Ogni item: `[codice]` + messaggio + link "Vai a {quadro}/{rigo}" che chiama `goToStep(stepIndex, highlightKey)` → apre step + scroll + highlight temporaneo riga
  - Per ogni warning: checkbox "Ho verificato"
  - Bottone grande in fondo: "Tutto ok, vai al riepilogo" → abilitato solo se errors=0 AND tutti warning confermati
- [ ] **Step 2:** `goToStep(stepIndex, highlightKey)` in wizard: switcha step, dopo render aggiunge classe `.rigo-highlight` all'input target per 3s.
- [ ] **Step 3:** `style.css` — colori validazione (errore `--color-chart-tasse`, warning `--color-cal-ferie`), animazione highlight.
- [ ] **Step 4:** Manual smoke test: forza un errore (CF vuoto), verifica blocco; accetta warning, verifica sblocco.
- [ ] **Step 5: Commit:**
  ```bash
  git add dichiarazione-ui.js style.css
  git commit -m "feat(dichiarazione): step validazione + link navigation"
  ```

---

## Task 12: Export C2 — JSON + CSV zip

**Files:**
- Modify: `dichiarazione-exports.js`
- Verify: `index.html` includes `jszip` library (if not, add CDN link — already present for other exports if applicable)
- Modify: `dichiarazione-ui.js` — wire export button

**Goal:** Clicking "Esporta C2" downloads `Dichiarazione_{anno}_{CF}.zip` containing JSON + CSV.

- [ ] **Step 1:** Unit test in `test/dichiarazione-engine.test.js`:
  ```js
  test('exportC2 CSV contains flat rigo rows', () => {
    const dich = DE.buildDichiarazione(2025, fixtures.artigianoStandard2025, {});
    const csv = DE_Exports.buildCSV(dich);
    expect(csv).toMatch(/LM,LM2,2,"Reddito lordo",/);
    expect(csv).toMatch(/RR,RR8,10,/);
  });
  ```
- [ ] **Step 2:** Implement `DichiarazioneExports.buildJSON(dich)` — deep clone snapshot, strip internal fields (`source`, `_meta`), pretty-print with 2-space indent.
- [ ] **Step 3:** Implement `DichiarazioneExports.buildCSV(dich)` — visita ricorsiva dei quadri, per ogni rigo/colonna emette `quadro,rigo,colonna,descrizione,valore`. Escape virgole/newline in `descrizione`.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Implement `DichiarazioneExports.exportC2(dich, cf, anno)` — usa jszip: aggiungi `dichiarazione.json` + `dichiarazione.csv`, genera blob, trigger download con nome `Dichiarazione_{anno}_{cf}.zip`.
- [ ] **Step 6:** Wire bottone in step 12 `dichiarazione-ui.js` → `DichiarazioneExports.exportC2(...)`. Abilita solo se validation passata.
- [ ] **Step 7:** Manual test: esegui export, apri zip, verifica JSON+CSV corretti.
- [ ] **Step 8: Commit:**
  ```bash
  git add dichiarazione-exports.js dichiarazione-ui.js test/dichiarazione-engine.test.js index.html
  git commit -m "feat(dichiarazione): export C2 (JSON+CSV zip)"
  ```

---

## Task 13: Export C3 — PDF modulo ministeriale

**Files:**
- Modify: `dichiarazione-exports.js`
- Modify: `dichiarazione-ui.js` — wire export button

**Goal:** Clicking "Esporta PDF C3" downloads `Dichiarazione_{anno}_{CF}.pdf` con layout tabellare che rispecchia modulo AdE.

- [ ] **Step 1:** Implement `buildPdfFrontespizio(doc, dich)` — pagina A4: header "Redditi PF {anno}", box anagrafica, box residenza, box tipo dichiarazione+firma. Font Helvetica, 10pt body, 14pt headers. Bordi tabellari 0.3pt.
- [ ] **Step 2:** Implement `buildPdfQuadro(doc, quadro, nomeQuadro)` generico — header quadro, tabella righi con colonne `Rigo | Descrizione | Col.1 | Col.2 | ...`. Multi-pagina automatica se > 40 righi.
- [ ] **Step 3:** Implement `exportC3(dich, cf, anno)`:
  ```js
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  buildPdfFrontespizio(doc, dich);
  doc.addPage(); buildPdfQuadro(doc, dich.quadroLM, 'LM');
  doc.addPage(); buildPdfQuadro(doc, dich.quadroRR, 'RR');
  doc.addPage(); buildPdfQuadro(doc, dich.quadroRS, 'RS');
  if (dich.quadroRW) { doc.addPage(); buildPdfQuadro(doc, dich.quadroRW, 'RW'); }
  if (dich.quadroRX) { doc.addPage(); buildPdfQuadro(doc, dich.quadroRX, 'RX'); }
  // condizionali se presenti
  doc.save(`Dichiarazione_${anno}_${cf}.pdf`);
  ```
- [ ] **Step 4:** Footer su ogni pagina: `doc.setPage(n)` in loop, stampa `Pag. n / tot` + data generazione + `CF {cf}`.
- [ ] **Step 5:** Wire bottone step 12 → `DichiarazioneExports.exportC3(...)`.
- [ ] **Step 6:** Manual test: export PDF, apri, verifica impaginazione pulita, tutti quadri presenti, numeri leggibili.
- [ ] **Step 7: Commit:**
  ```bash
  git add dichiarazione-exports.js dichiarazione-ui.js
  git commit -m "feat(dichiarazione): export C3 (PDF layout ministeriale)"
  ```

---

## Task 14: Polish + responsive mobile + CLAUDE.md

**Files:**
- Modify: `style.css`
- Modify: `CLAUDE.md`
- Modify: `dichiarazione-ui.js` (micro-fix)

**Goal:** Modulo usabile su mobile (safe-area, horizontal sidebar collapse), documentazione aggiornata.

- [ ] **Step 1: Mobile:** test su viewport 375×812. Sidebar diventa top-bar scrollable; righi quadri in layout 2-colonne su desktop, 1-colonna su mobile; bottoni full-width su mobile.
- [ ] **Step 2: Dark/Light:** switcha tema, verifica contrasti OK in wizard.
- [ ] **Step 3: Aggiorna `CLAUDE.md`** — aggiungi sezione "Dichiarazione Redditi PF":
  - File coinvolti
  - API `window.DichiarazioneEngine`, `window.DichiarazioneUI`, `window.DichiarazioneExports`
  - Data shape `settings.anagrafica`, `settings.attivita`, `yearData.dichiarazione`
  - Flow del wizard (12 step, condizionali)
  - Note: migrazione `lmQuadro` → `dichiarazione`
- [ ] **Step 4: Commit:**
  ```bash
  git add style.css dichiarazione-ui.js CLAUDE.md
  git commit -m "docs(dichiarazione): CLAUDE.md update + mobile polish"
  ```

---

## Task 15: Review finale

**Files:** all

**Goal:** Code review via subagent, fix issues, merge branch.

- [ ] **Step 1:** Dispatch `feature-dev:code-reviewer` subagent:
  > Review changes on branch `codex/dichiarazione-redditi` vs `codex/dev-newfeatures`. Focus: correctness of tax calculations (verify against spec section 7 validation rules), proper use of existing `tax-engine.js`, DOM/engine separation, test coverage ≥ 20 scenarios, no regressions to existing features (invoice, scadenziario, calendario). Report high-priority issues only.
- [ ] **Step 2:** Triage findings. Fix critical + high issues in separate commits, one per issue.
- [ ] **Step 3:** Run full test suite → all PASS.
- [ ] **Step 4:** Manual end-to-end smoke test: nuovo profilo → compila anagrafica → apri Dichiarazione → step 1-12 → export C2 + C3 → verifica files.
- [ ] **Step 5: Merge back to `codex/dev-newfeatures`:**
  ```bash
  git checkout codex/dev-newfeatures
  git merge --no-ff codex/dichiarazione-redditi -m "merge(dichiarazione): sub-project 2 complete"
  ```
- [ ] **Step 6:** Update memory bank: edit `project_audit_calcoli.md` marking sub-project 2 as COMPLETE with commit hashes.

---

## Acceptance criteria (whole plan)

- Tutti gli step unit test verdi (≥ 20 test in `test/dichiarazione-engine.test.js`)
- Validazione blocca export quando errors > 0
- Export C2 produce zip valido con JSON + CSV mappati ai righi
- Export C3 produce PDF leggibile multi-pagina
- Legacy `lmQuadro` migrato in maniera trasparente
- `CLAUDE.md` aggiornato
- Branch mergiato in `codex/dev-newfeatures`
- Nessuna regressione visibile a scadenziario, fatture, calendario, spese, budget
