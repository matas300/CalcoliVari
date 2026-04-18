# Cleanup pre-launch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rimuovere dead code (JS/CSS/HTML/data-model) accumulato dopo i merge dei sub-projects 1-3, in modo conservativo, prima del primo avvio in locale dell'app.

**Architecture:** Cleanup guidato da un inventory artifact (Fase 1, read-only). Test smoke aggiunti su `tax-engine` e `fatture-storico` (Fase 2) prima delle rimozioni (Fasi 3-6). Branch `codex/dev-newfeatures`, un commit per fase per consentire `git revert` chirurgico.

**Tech Stack:** Node.js (test runner minimal in `test/run-tests.js`), vanilla JS/CSS/HTML, jsdom-style stubbing per testare moduli IIFE che usano `window`/`localStorage`.

**Spec:** `docs/superpowers/specs/2026-04-18-cleanup-pre-launch-design.md`

---

## File Map

**Create:**
- `docs/superpowers/specs/cleanup-inventory.md` — Fase 1 deliverable
- `test/tax-engine.test.js` — Fase 2 deliverable
- `test/fatture-storico.test.js` — Fase 2 deliverable

**Modify:**
- `test/run-tests.js` — wire dei nuovi file di test
- `app.js` — rimozioni JS (Fase 3)
- `tax-engine.js`, `dichiarazione-engine.js`, `dichiarazione-ui.js`, `dichiarazione-exports.js`, `fatture-docs-feature.js`, `fatture-storico.js`, `clienti-feature.js`, `firebase-sync.js`, `scadenziario-engine.js`, `ocr-pagamenti-feature.js`, `ateco-coefficienti.js` — rimozioni JS mirate (Fase 3) se l'inventory ne trova
- `style.css` — rimozioni CSS (Fase 4)
- `index.html` — rimozioni HTML (Fase 5)
- `CLAUDE.md` — aggiornamento riferimenti (Fase 7)

**Out of scope (non toccare):**
- `legacyBuildForfettarioScheduleForYear`, `openQuadroLMModal`, `saveQuadroLMDraft`, `exportQuadroLMPrint`
- Migrazione `lmQuadro.overrides` → `dichiarazione.overrides` in `ensureDataShape`
- Qualunque palette/colore/layout (sub-progetto B)

---

## Task 1 — Inventory (Fase 1, read-only)

**Files:**
- Create: `docs/superpowers/specs/cleanup-inventory.md`

- [ ] **Step 1.1: Scansione funzioni JS top-level**

Per ciascun `.js` nella root, elencare le funzioni top-level. Usare `grep -nE "^\s*function\s+[A-Za-z_]+|^\s*const\s+[A-Za-z_]+\s*=\s*function|^\s*[A-Za-z_]+\s*:\s*function"` per `app.js` e analoghi pattern IIFE per gli altri file.

- [ ] **Step 1.2: Filtrare candidati a rimozione**

Per ogni simbolo, eseguire:

```bash
# Esempio per la funzione "fooBar" definita in app.js
grep -nE "\bfooBar\b" *.js *.html
```

Se l'unica occorrenza è la definizione (riga di `function fooBar(...)`) e non compare da nessun'altra parte, è candidato. Escludere esplicitamente i nomi nella whitelist "out of scope" sopra.

- [ ] **Step 1.3: Scansione classi CSS**

Estrarre tutte le classi definite in `style.css`:

```bash
grep -oE "\.[a-zA-Z_-][a-zA-Z0-9_-]*" style.css | sort -u > /tmp/css-classes.txt
```

Per ciascuna classe, verificare presenza in `*.html` e `*.js` (sia come stringa `"className"` che come `classList.add('…')`). Le orfane finiscono nell'inventory.

- [ ] **Step 1.4: Scansione CSS variables**

```bash
grep -oE "\-\-[a-zA-Z][a-zA-Z0-9-]*" style.css | sort -u
```

Per ciascuna `--var`, cercare `var(--var)` nel resto di `style.css` e nelle stringhe inline JS/HTML. Le orfane (definite ma mai referenziate) finiscono nell'inventory. Le canoniche `--color-*` documentate in CLAUDE.md restano sempre.

- [ ] **Step 1.5: Scansione id HTML**

```bash
grep -oE 'id="[^"]+"' index.html | sed 's/id="//;s/"$//' | sort -u
```

Per ciascun id, cercare `getElementById('id')`, `querySelector('#id')`, `#id` (in selettori CSS) nei `.js` e `.css`. Gli orfani finiscono nell'inventory.

- [ ] **Step 1.6: Scansione chiavi data model**

Per ciascuna chiave nota di `settings` e `yearData` (vedi CLAUDE.md "Data Model"), eseguire:

```bash
# Esempio per "primoAnnoFatturatoPrec"
grep -nE "primoAnnoFatturatoPrec" *.js
```

Una chiave è candidata solo se:
- Mai appare a destra di `settings\.` o `yearData\.` (mai letta), **E**
- Non compare in `saveSetting('chiave',`, `saveTextSetting('chiave',`, `saveOptionalNumberSetting('chiave',`, né in assegnazioni dirette `settings.chiave =`, `yearData.chiave =` (mai scritta).

- [ ] **Step 1.7: Scrivere `cleanup-inventory.md`**

Struttura:

```markdown
# Cleanup inventory — 2026-04-18

## JS — funzioni candidate
| File | Simbolo | Riga | Verifica grep |
|------|---------|------|---------------|
| app.js | fooBar | 1234 | `grep "\bfooBar\b" *.js *.html` → 1 hit (definizione) |

## CSS — classi orfane
...

## CSS — variabili orfane
...

## HTML — id orfani
...

## Data model — chiavi mai lette/scritte
...
```

- [ ] **Step 1.8: Commit**

```bash
git add docs/superpowers/specs/cleanup-inventory.md
git commit -m "docs(cleanup): inventory dead code candidates (fase 1)"
```

---

## Task 2 — Test smoke `tax-engine` (Fase 2, parte 1)

**Files:**
- Create: `test/tax-engine.test.js`

- [ ] **Step 2.1: Scrivere test smoke**

```javascript
'use strict';
var TE = require('../tax-engine.js');

describe('TaxEngine — buildAccontoPlan', function() {
  test('sotto soglia (51,65) ritorna piano vuoto', function() {
    var plan = TE.buildAccontoPlan(40);
    expect(plan.total).toBe(0);
  });
  test('tra 51,65 e 257,52 ritorna acconto unico in novembre (100%)', function() {
    var plan = TE.buildAccontoPlan(150);
    expect(plan.total).toBe(150);
    expect(plan.installments.length).toBe(1);
  });
  test('sopra 257,52 split 40/60', function() {
    var plan = TE.buildAccontoPlan(1000);
    expect(plan.total).toBe(1000);
    expect(plan.installments.length).toBe(2);
    expect(plan.installments[0].amount).toBe(400);
    expect(plan.installments[1].amount).toBe(600);
  });
});

describe('TaxEngine — buildForfettarioScenario', function() {
  function baseInput(overrides) {
    return Object.assign({
      year: 2026,
      method: 'storico',
      grossCollected: 50000,
      settings: { coefficiente: 78, impostaSostitutiva: 5 },
      currentContribution: { mode: 'artigiani_commercianti', fixedAnnual: 4521.36, saldoAccontoBase: 0 },
      previousContribution: { mode: 'artigiani_commercianti', fixedAnnual: 4460.64, saldoAccontoBase: 0 },
      previousContributionAccontiPaid: 0,
      previousTaxBase: 1000
    }, overrides || {});
  }

  test('artigiano 2026 — calcola imposta sostitutiva > 0', function() {
    var s = TE.buildForfettarioScenario(baseInput());
    expect(s.year).toBe(2026);
    expect(s.method).toBe('storico');
    expect(s.substituteTax).toBeGreaterThan(0);
  });
  test('reddito lordo forfettario = grossCollected * coefficiente', function() {
    var s = TE.buildForfettarioScenario(baseInput());
    expect(s.forfettarioGrossIncome).toBe(39000); // 50000 * 0.78
  });
  test('gestione separata — fixedParts a zero', function() {
    var s = TE.buildForfettarioScenario(baseInput({
      currentContribution: { mode: 'gestione_separata', fixedAnnual: 0 },
      previousContribution: { mode: 'gestione_separata', fixedAnnual: 0 }
    }));
    expect(s.previousFixedTail).toBe(0);
    expect(s.currentFixedWithinYear).toBe(0);
  });
});

describe('TaxEngine — buildForfettarioMethodComparison', function() {
  test('ritorna oggetto con storico + previsionale', function() {
    var cmp = TE.buildForfettarioMethodComparison({
      year: 2026,
      grossCollected: 50000,
      settings: { coefficiente: 78, impostaSostitutiva: 5 },
      currentContribution: { mode: 'artigiani_commercianti', fixedAnnual: 4521.36, saldoAccontoBase: 0 },
      previousContribution: { mode: 'artigiani_commercianti', fixedAnnual: 4460.64, saldoAccontoBase: 0 },
      previousContributionAccontiPaid: 0,
      previousTaxBase: 1000,
      forecastTaxBase: 2000,
      forecastContributionBase: 5000
    });
    expect(typeof cmp).toBe('object');
    expect(cmp.historical).toBeTruthy();
    expect(cmp.forecast).toBeTruthy();
  });
});
```

- [ ] **Step 2.2: Verificare esistenza chiavi attese**

Aprire `tax-engine.js` riga 604+ (`buildForfettarioMethodComparison`) e confermare che il valore di ritorno ha le chiavi `historical` e `forecast`. Se i nomi differiscono (es. `storico`/`previsionale`), aggiornare i test.

- [ ] **Step 2.3: Aggiungere il file al runner**

Modificare `test/run-tests.js` riga 55:

```javascript
require('./dichiarazione-engine.test.js');
require('./tax-engine.test.js');
```

- [ ] **Step 2.4: Eseguire i test**

```bash
node test/run-tests.js
```

Atteso: tutti i test passano. Se un test fallisce per asserzione errata sulla forma dei dati, aggiustare il test (non il codice).

- [ ] **Step 2.5: Commit**

```bash
git add test/tax-engine.test.js test/run-tests.js
git commit -m "test(tax-engine): smoke test su buildAccontoPlan, buildForfettarioScenario, buildForfettarioMethodComparison (fase 2)"
```

---

## Task 3 — Test smoke `fatture-storico` (Fase 2, parte 2)

**Files:**
- Create: `test/fatture-storico.test.js`

- [ ] **Step 3.1: Scrivere test con stub minimi di window/localStorage**

`fatture-storico.js` è un IIFE che assegna `window.FattureStorico` e usa `localStorage`. In Node serve stub.

```javascript
'use strict';

// Stub minimo di ambiente browser PRIMA di require
var storage = {};
global.localStorage = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.sessionStorage = global.localStorage;
global.window = global;
global.document = { getElementById: function() { return null; } };

require('../fatture-storico.js');
var FS = global.window.FattureStorico;

function reset() { for (var k in storage) delete storage[k]; }

describe('FattureStorico — formatNumero', function() {
  test('zero-padding a 3 cifre', function() {
    expect(FS.formatNumero(2026, 1)).toBe('2026/001');
    expect(FS.formatNumero(2026, 42)).toBe('2026/042');
    expect(FS.formatNumero(2026, 999)).toBe('2026/999');
  });
  test('progressivo > 999 non pad', function() {
    expect(FS.formatNumero(2026, 1000)).toBe('2026/1000');
  });
  test('default progressivo a 1 se nullish', function() {
    expect(FS.formatNumero(2026, null)).toBe('2026/001');
  });
});

describe('FattureStorico — nextProgressivo', function() {
  test('anno vuoto ritorna 1', function() {
    expect(FS.nextProgressivo(2026, [])).toBe(1);
  });
  test('anno con fatture ritorna max+1', function() {
    var fatture = [
      { annoProgressivo: 2026, progressivo: 1 },
      { annoProgressivo: 2026, progressivo: 5 },
      { annoProgressivo: 2026, progressivo: 3 }
    ];
    expect(FS.nextProgressivo(2026, fatture)).toBe(6);
  });
  test('anno misto considera solo l anno richiesto', function() {
    var fatture = [
      { annoProgressivo: 2025, progressivo: 99 },
      { annoProgressivo: 2026, progressivo: 2 }
    ];
    expect(FS.nextProgressivo(2026, fatture)).toBe(3);
    expect(FS.nextProgressivo(2025, fatture)).toBe(100);
  });
});

describe('FattureStorico — storageKey', function() {
  test('formato calcoliPIVA_<profile>_fattureEmesse', function() {
    expect(FS.storageKey('Mattia')).toBe('calcoliPIVA_Mattia_fattureEmesse');
  });
  test('throw se profile vuoto', function() {
    var threw = false;
    try { FS.storageKey(''); } catch (_) { threw = true; }
    expect(threw).toBe(true);
  });
});

describe('FattureStorico — load/save round-trip', function() {
  test('save poi load ritorna stesse fatture (con normalizzazione)', function() {
    reset();
    var input = [{ id: 'fat_1', numero: '2026/001', annoProgressivo: 2026, progressivo: 1, righe: [] }];
    FS.save('Demo', input);
    var loaded = FS.load('Demo');
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('fat_1');
  });
  test('load su profilo vuoto ritorna array vuoto', function() {
    reset();
    expect(FS.load('Demo').length).toBe(0);
  });
});
```

- [ ] **Step 3.2: Aggiungere al runner**

Modificare `test/run-tests.js` aggiungendo dopo la riga di `tax-engine.test.js`:

```javascript
require('./fatture-storico.test.js');
```

- [ ] **Step 3.3: Eseguire i test**

```bash
node test/run-tests.js
```

Atteso: tutti i test passano (39 dichiarazione + ~9 tax-engine + ~10 fatture-storico).

- [ ] **Step 3.4: Commit**

```bash
git add test/fatture-storico.test.js test/run-tests.js
git commit -m "test(fatture-storico): smoke test con stub window/localStorage (fase 2)"
```

---

## Task 4 — Rimozione JS dead code (Fase 3)

**Files:** secondo `cleanup-inventory.md` sezione "JS — funzioni candidate".

- [ ] **Step 4.1: Per ciascun candidato JS**

Aprire l'inventory. Per ogni voce della tabella "JS — funzioni candidate":

1. Riconfermare il grep:
   ```bash
   grep -nE "\b<simbolo>\b" *.js *.html
   ```
2. Se l'unica occorrenza è ancora la definizione, rimuoverla con Edit (delezione esatta del blocco function … }).
3. Se la rimozione lascia un `,` orfano in un export object o un blank line doppia, sistemare.

- [ ] **Step 4.2: Eseguire i test**

```bash
node test/run-tests.js
```

Atteso: tutti i test passano.

- [ ] **Step 4.3: Commit**

```bash
git add -u
git commit -m "chore(cleanup): rimuove funzioni JS non usate (fase 3)"
```

---

## Task 5 — Rimozione CSS orfano (Fase 4)

**Files:** `style.css` secondo `cleanup-inventory.md` sezioni "CSS — classi orfane" e "CSS — variabili orfane".

- [ ] **Step 5.1: Per ciascuna classe orfana**

Riconfermare grep:

```bash
grep -nE "(class\s*=\s*[\"'][^\"']*\b<class>\b|classList\.(add|remove|toggle|contains)\([\"']<class>[\"']|[\"']\.<class>[\"']|\\.<class>\\b)" *.html *.js *.css
```

Se zero hit fuori da `style.css` (e dentro `style.css` solo la definizione), rimuovere il blocco di regole.

- [ ] **Step 5.2: Per ciascuna CSS variable orfana**

Riconfermare:

```bash
grep -n "var(--<nome>)" *.css *.js *.html
```

Se zero hit, rimuovere la riga `--nome: …;` dalla `:root` (e dal `html[data-theme="light"]` se presente).

- [ ] **Step 5.3: Verifica visiva rapida**

Aprire `index.html` nel browser. Login Demo. Cliccare in tutti i tab. Confermare che nulla appare visivamente rotto.

- [ ] **Step 5.4: Commit**

```bash
git add style.css
git commit -m "chore(cleanup): rimuove classi e variabili CSS non usate (fase 4)"
```

---

## Task 6 — Rimozione HTML orfano (Fase 5)

**Files:** `index.html` secondo `cleanup-inventory.md` sezione "HTML — id orfani".

- [ ] **Step 6.1: Per ciascun id orfano**

Riconfermare:

```bash
grep -nE "(getElementById\([\"']<id>[\"']|querySelector(All)?\([\"']#<id>|#<id>\\b)" *.js *.css
```

Se zero hit, valutare se l'elemento è puramente strutturale (es. wrapper di layout): in tal caso lasciarlo (non è "dead", solo senza id). Se invece l'elemento intero non serve (es. popup mai aperto, tab nascosta non più referenziata), rimuoverlo per intero.

- [ ] **Step 6.2: Verifica visiva**

Aprire l'app, login Demo, cliccare ogni tab. Nulla deve mancare nell'UI rispetto a prima.

- [ ] **Step 6.3: Commit**

```bash
git add index.html
git commit -m "chore(cleanup): rimuove id e nodi HTML non usati (fase 5)"
```

---

## Task 7 — Rimozione chiavi data model (Fase 6)

**Files:** `app.js` (e altri se necessario) secondo `cleanup-inventory.md` sezione "Data model — chiavi mai lette/scritte".

- [ ] **Step 7.1: Per ciascuna chiave candidata**

Riconfermare:

```bash
# Lettura
grep -nE "(settings|yearData)\.<chiave>\\b" *.js
# Scrittura
grep -nE "(saveSetting|saveTextSetting|saveOptionalNumberSetting)\(['\"]<chiave>['\"]" *.js
grep -nE "(settings|yearData)\.<chiave>\\s*=" *.js
```

Solo se TUTTI e tre i grep sono a zero hit, procedere alla rimozione. Rimuovere:
- La definizione del default in `ensureDataShape` (se presente)
- L'eventuale rendering nelle pagine settings/scadenziario (riconfermato già da grep zero)

- [ ] **Step 7.2: Eseguire i test**

```bash
node test/run-tests.js
```

Atteso: pass.

- [ ] **Step 7.3: Commit**

```bash
git add -u
git commit -m "chore(cleanup): rimuove chiavi settings/yearData mai lette ne scritte (fase 6)"
```

---

## Task 8 — Smoke manuale + aggiornamento CLAUDE.md (Fase 7)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 8.1: Smoke test manuale**

Aprire l'app nel browser (`index.html`) e seguire la checklist. Per ogni voce, confermare che funziona ancora come prima del cleanup:

- [ ] Login con Mattia
- [ ] Login con Peru
- [ ] Login con Demo
- [ ] Tab "Regime Forfettario" — donut chart appare, cifre coerenti
- [ ] Tab "Tasse Accantonate" — accrual visibile
- [ ] Tab "Scadenziario" — switch storico/previsionale, click "Segna pagato" su una scadenza
- [ ] Tab "Calendario" — assegnare un'attività a un giorno
- [ ] Tab "Fatture" — creare bozza, anteprima XML, generazione PDF
- [ ] Tab "Fatture" — duplica una fattura dallo storico, crea NC TD04
- [ ] Tab "Budget" — visualizzazione voci
- [ ] Tab "Spese" (solo regime ordinario)
- [ ] Tab "Impostazioni" — toggle INPS ufficiale/manuale, export JSON, import JSON
- [ ] Cambio anno (selettore in alto)
- [ ] Wizard Dichiarazione — apertura, navigazione tra step
- [ ] Modal Quadro LM legacy (`openQuadroLMModal`) — ancora apribile (non rimosso)

Se qualcosa non funziona, identificare il commit colpevole con `git log --oneline -10` e fare `git revert <hash>` mirato sulla fase responsabile.

- [ ] **Step 8.2: Aggiornare CLAUDE.md**

Per ciascun simbolo/chiave rimosso nelle fasi 3-6, cercarlo in `CLAUDE.md` e:
- Se citato in "Data Model": rimuovere la riga
- Se citato in elenco file/funzioni: rimuovere la riga
- Se citato in "Important Notes": rimuovere o aggiornare il riferimento

- [ ] **Step 8.3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(cleanup): aggiorna CLAUDE.md rimuovendo riferimenti a simboli/chiavi rimosse (fase 7)"
```

- [ ] **Step 8.4: Aggiornare memory**

Nel directory memory dell'utente:
- Aggiornare `MEMORY.md` aggiungendo riga di chiusura per `project_polish_pre_launch.md`
- Aggiornare `project_polish_pre_launch.md` con stato "Sub-progetto A completato 2026-04-XX"

(Questo step usa Write/Edit sui file di memory, non commit nel repo.)

---

## Self-review note

- **Spec coverage**: tutte le 7 fasi dello spec (Inventory, Test, JS, CSS, HTML, Data model, Smoke + CLAUDE.md) hanno una task corrispondente (1-8). ✓
- **Placeholder scan**: nessun "TBD"/"TODO". Le rimozioni nelle fasi 3-6 sono guidate dall'inventory artifact prodotto in fase 1, che è esso stesso un deliverable concreto. ✓
- **Type consistency**: nomi di funzioni (`buildForfettarioScenario`, `buildAccontoPlan`, `buildForfettarioMethodComparison`, `nextProgressivo`, `formatNumero`, `storageKey`) coerenti tra Task 2/3 e i file sorgente verificati prima della scrittura. ✓
