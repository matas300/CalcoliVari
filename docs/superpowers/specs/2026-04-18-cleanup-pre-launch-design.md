# Cleanup pre-launch — Sub-progetto A

**Data**: 2026-04-18
**Branch**: `codex/dev-newfeatures` (commit per fase, no nuovo branch)
**Stato**: design approvato, in attesa di plan

## Obiettivo

Ripulire il codice da dead code accumulato dopo i merge dei sub-projects 1-3 (audit forfettario, dichiarazione PF, fatturazione elettronica), prima del primo avvio in locale dell'app per il testing end-to-end. Il restyling grafico è **out of scope** (sub-progetto B separato).

## Vincoli

- **Conservativo**: si rimuove solo dead code dimostrabilmente non chiamato. Funzioni e dati marcati "superseded/backward-compat" in CLAUDE.md (es. `legacyBuildForfettarioScheduleForYear`, `openQuadroLMModal`/`saveQuadroLMDraft`/`exportQuadroLMPrint`, migrazione silenziosa `lmQuadro` → `dichiarazione`) **rimangono**.
- **Scope esteso**: JS + CSS + HTML + chiavi del data model (`settings`, `yearData`).
- **Test minimi prima**: prima di rimuovere si aggiunge copertura smoke per `tax-engine` e `fatture-storico`, oggi non testati.
- **Branch corrente**: si continua su `codex/dev-newfeatures`, un commit per fase per consentire `git revert` chirurgico.

## Fasi

Sequenziali, ognuna è un commit isolato.

### Fase 1 — Inventory (read-only)

- Produrre `docs/superpowers/specs/cleanup-inventory.md` con, per ogni file `.js`/`.css`/`.html` nella root: lista dei simboli "candidati a rimozione" + prova (`grep` con zero hit fuori dalla definizione).
- Categorie da inventariare:
  - Funzioni JS top-level mai chiamate
  - Variabili/costanti mai lette
  - Classi CSS mai matchate da HTML/JS
  - CSS variables mai referenziate
  - `id` HTML mai cercati da `getElementById`/`querySelector`
  - Chiavi `settings.X`/`yearData.X` mai lette **né** scritte
- Nessun cambiamento di codice in questa fase. Output revisionato dall'utente prima di procedere.

### Fase 2 — Test minimi

Aggiungere a `test/`:

- **`tax-engine.test.js`** — smoke test di:
  - `buildForfettarioScenario` (caso artigiano + caso gestione separata)
  - `buildAccontoPlan` (sotto soglia 51,65 / tra 51,65 e 257,52 / sopra 257,52)
  - `buildForfettarioMethodComparison` (storico vs previsionale base)
- **`fatture-storico.test.js`** — smoke test di:
  - `nextProgressivo` (anno vuoto, anno con fatture, anno misto)
  - `formatNumero` (zero-padding 3 cifre)
  - `normalizeInvoice` (default su campi mancanti, idempotenza)

Aggiornare `test/run-tests.js` per includerli. Tutti i test devono passare prima di procedere alla fase 3.

### Fase 3 — JS dead code

Rimuovere funzioni/variabili/export di IIFE non referenziati, sulla base dell'inventario di fase 1. Per ogni rimozione, ri-eseguire il grep finale per confermare zero hit. Eseguire `node test/run-tests.js` al termine.

### Fase 4 — CSS orfano

Rimuovere classi CSS e CSS variables non usate. Verifica: grep su tutti i `.html` + `.js` + (eventuali) altri `.css`.

### Fase 5 — HTML orfano

Rimuovere `id`, popup, blocchi `<template>` o sezioni hidden in `index.html` non referenziati da JS o CSS.

### Fase 6 — Settings / data model

Rimuovere chiavi in `settings`/`yearData` che soddisfano **entrambe** le condizioni:

- Mai lette (`settings.X` / `yearData.X` non appare in nessun `.js`)
- Mai scritte (nessun `saveSetting('X', …)` / `saveTextSetting('X', …)` / `saveOptionalNumberSetting('X', …)` / assegnazione diretta)

La migration silenziosa `yearData.lmQuadro.overrides` → `yearData.dichiarazione.overrides` resta (è "superseded", non "dead": dati utente potrebbero ancora esistere in localStorage / Firestore).

### Fase 7 — Verifica e documentazione

- **Smoke test manuale** (checklist):
  - Login con tutti e 3 i profili (Mattia, Peru, Demo)
  - Navigazione di ogni tab visibile
  - Tab Fatture: creazione fattura, anteprima XML, generazione PDF, NC TD04 da storico
  - Tab Scadenziario: cambio metodo storico/previsionale, "segna pagato"
  - Tab Calendario: assegnazione attività a un giorno
  - Tab Dichiarazione: apertura wizard, navigazione step
  - Cambio anno
  - Export/import JSON
- **Aggiornare CLAUDE.md**: rimuovere riferimenti a simboli/chiavi rimossi (sezioni "Important Notes", elenco file, data model).

## Verifica e rollback

- Ogni fase è un commit isolato → `git revert <hash>` chirurgico se una rimozione causa una regressione scoperta dopo.
- Test automatici (`test/run-tests.js`) eseguiti dopo fase 2, 3, 6.
- Smoke manuale in fase 7 prima di considerare il sub-progetto chiuso.

## Out of scope esplicito

- Refactoring strutturale (rinomina file, split di `app.js`, estrazione moduli).
- Rimozione di simboli marcati "legacy/superseded/backward-compat" in CLAUDE.md.
- Restyling grafico, palette, layout — sub-progetto B separato.
- Aggiunta di test oltre i due file smoke definiti in fase 2.

## Deliverable

- Inventory document (`docs/superpowers/specs/cleanup-inventory.md`)
- 2 nuovi file di test (`test/tax-engine.test.js`, `test/fatture-storico.test.js`)
- 5 commit di rimozione (fasi 3-7)
- CLAUDE.md aggiornato
