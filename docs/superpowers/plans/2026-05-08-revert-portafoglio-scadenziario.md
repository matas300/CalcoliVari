# Revert Portafoglio v2 + Scadenziario v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ripristinare lo stato del repo a com'era immediatamente prima del merge `7b41a41` (Portafoglio v2 + Scadenziario v2), creando una nuova branch `revert-portafoglio-scadenziario` partendo da `364d807` con i 4 fix recenti su fatture cherry-pickati sopra.

**Architecture:** Operazione puramente git: branch from pre-merge SHA + 4 cherry-pick in ordine cronologico + 1 conflict resolution previsto + verification suite. Nessuna scrittura di codice nuovo. La branch corrente `fix-incassi-fatture-ghost` resta intatta come backup.

**Tech Stack:** git (cherry-pick), Node 18+ (test runner), browser (smoke test manuale).

**Spec di riferimento:** `docs/superpowers/specs/2026-05-08-revert-portafoglio-scadenziario-design.md`

---

## Pre-condizioni

- Branch attivo: `fix-incassi-fatture-ghost`.
- Working tree pulito (eccezione tollerata: `.claude/settings.local.json` modificato — è file locale, ignorato dal flusso).
- SHA chiave (validati nella spec):
  - `364d807` — base pre-merge (`Merge dev-ui-fixes-audit-2026-05`).
  - `743d18d` — chore .gitignore.
  - `b5b2af4` — fix fatture-storico display numero.
  - `f7dbf79` — fix incassi manuali no auto-promote.
  - `c1f4646` — fix fatture mensile dropdown nomi mese.

---

### Task 1: Crea la nuova branch dal commit pre-merge

**Files:**
- Nessuna modifica file.

- [ ] **Step 1: Verifica stato corrente**

Run: `git status; git log --oneline -1`
Expected: branch `fix-incassi-fatture-ghost`, HEAD `c1f4646` o successivo (commit dello spec).

- [ ] **Step 2: Stash di settings.local.json se modificato**

Run: `git diff --name-only`
Se output include `.claude/settings.local.json`, eseguire:
```
git stash push -m "settings.local.json wip" -- .claude/settings.local.json
```
Altrimenti skip.

- [ ] **Step 3: Crea la nuova branch da 364d807**

Run: `git checkout -b revert-portafoglio-scadenziario 364d807`
Expected: `Switched to a new branch 'revert-portafoglio-scadenziario'`

- [ ] **Step 4: Verifica HEAD**

Run: `git log --oneline -3`
Expected: top commit è `364d807 Merge dev-ui-fixes-audit-2026-05` o messaggio analogo.

- [ ] **Step 5: Verifica file pre-merge presenti**

Run: `git ls-files | grep -E '^(app-accantonamento|portafoglio|app-portafoglio-ui|app-scadenziario-v2|pagamenti-storage)\.js$'`
Expected: solo `app-accantonamento.js` (il vecchio). Nessun `portafoglio.js`, nessun `app-portafoglio-ui.js`, nessun `app-scadenziario-v2.js`, nessun `pagamenti-storage.js`.

---

### Task 2: Cherry-pick 743d18d (.gitignore .codex-temp)

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Cherry-pick**

Run: `git cherry-pick 743d18d`
Expected: clean, nessun conflitto. Output:
```
[revert-portafoglio-scadenziario <new-sha>] chore: ignora .codex-temp...
 1 file changed, 1 insertion(+)
```

- [ ] **Step 2: Verifica**

Run: `git diff HEAD~1 -- .gitignore`
Expected: una riga aggiunta `.codex-temp/`.

---

### Task 3: Cherry-pick b5b2af4 (fatture-storico display numero) con conflitto

**Files:**
- Modify: `fatture-docs-feature.js`
- Modify: `fatture-storico.js`
- Modify: `test/run-tests.js` (**conflitto previsto**)
- Create: `test/fatture-storico-display-numero.test.js`

- [ ] **Step 1: Cherry-pick**

Run: `git cherry-pick b5b2af4`
Expected: **conflitto in `test/run-tests.js`**. Output simile a:
```
Auto-merging fatture-docs-feature.js
Auto-merging fatture-storico.js
Auto-merging test/run-tests.js
CONFLICT (content): Merge conflict in test/run-tests.js
error: could not apply b5b2af4...
```

- [ ] **Step 2: Verifica nessun altro conflitto**

Run: `git status`
Expected: unmerged path solo `test/run-tests.js`. `fatture-docs-feature.js`, `fatture-storico.js`, `test/fatture-storico-display-numero.test.js` devono essere staged senza conflitti.

- [ ] **Step 3: Risolvi conflitto in `test/run-tests.js`**

Apri `test/run-tests.js`. Trova il blocco intorno alla riga 119:

```
require('./fatture-xml-helpers.test.js');
<<<<<<< HEAD
require('./accantonamento-bugfix.test.js');
=======
require('./portafoglio-engine.test.js');
require('./portafoglio-nc-release.test.js');
require('./portafoglio-deposito.test.js');
require('./portafoglio-migration.test.js');
require('./portafoglio-aliquota.test.js');
require('./scadenziario-v2-hero.test.js');
require('./scadenziario-v2-paid-state.test.js');
require('./scadenziario-override-audit.test.js');
require('./pagamenti-storage.test.js');
require('./firebase-sync-portafoglio-merge.test.js');
require('./firebase-sync-overrides-history-merge.test.js');
require('./fatture-storico-display-numero.test.js');
>>>>>>> b5b2af4 (fix(fatture-storico): mostra "—" per fatture senza progressivo (no più 2026/001 ghost))
require('./app-bootstrap.test.js');
```

Sostituiscilo con:

```
require('./fatture-xml-helpers.test.js');
require('./accantonamento-bugfix.test.js');
require('./fatture-storico-display-numero.test.js');
require('./app-bootstrap.test.js');
```

Razionale: tieni il `require` del pre-merge (`accantonamento-bugfix`) + aggiungi il nuovo del fix (`fatture-storico-display-numero`). Tutti i `require` Portafoglio v2 / Scadenziario v2 / pagamenti-storage / firebase-sync-portafoglio-merge / firebase-sync-overrides-history-merge **vanno scartati** (i file sorgente non esistono nel pre-merge).

- [ ] **Step 4: Stage del file risolto**

Run: `git add test/run-tests.js`

- [ ] **Step 5: Continue cherry-pick**

Run: `git cherry-pick --continue --no-edit`
Expected:
```
[revert-portafoglio-scadenziario <new-sha>] fix(fatture-storico): mostra "—" per fatture senza progressivo...
 4 files changed, 61 insertions(+), 3 deletions(-)
 create mode 100644 test/fatture-storico-display-numero.test.js
```

Nota: l'errore `failed to delete '.git/worktrees/dichiarazione-redditi': Permission denied` è atteso e innocuo (worktree stale, non blocca il cherry-pick).

- [ ] **Step 6: Verifica risoluzione**

Run: `git status`
Expected: working tree clean.

Run: `cat test/run-tests.js | grep -E "accantonamento-bugfix|fatture-storico-display-numero|portafoglio|scadenziario-v2"`
Expected:
```
require('./accantonamento-bugfix.test.js');
require('./fatture-storico-display-numero.test.js');
```
Nessuna riga `portafoglio` né `scadenziario-v2`.

---

### Task 4: Cherry-pick f7dbf79 (incassi manuali)

**Files:**
- Modify: `app-fatture-helpers.js`
- Modify: `app-shell.js`

- [ ] **Step 1: Cherry-pick**

Run: `git cherry-pick f7dbf79`
Expected: auto-merge in `app-shell.js`, no conflict. Output:
```
Auto-merging app-shell.js
[revert-portafoglio-scadenziario <new-sha>] fix(incassi-manuali): no più auto-promote...
 2 files changed, 41 insertions(+), 77 deletions(-)
```

- [ ] **Step 2: Verifica**

Run: `git status; git log --oneline -1`
Expected: clean working tree, top commit messaggio fix incassi manuali.

---

### Task 5: Cherry-pick c1f4646 (dropdown mesi estesi)

**Files:**
- Modify: `app-fatture.js`

- [ ] **Step 1: Cherry-pick**

Run: `git cherry-pick c1f4646`
Expected: clean. Output:
```
[revert-portafoglio-scadenziario <new-sha>] fix(fatture-mensile): dropdown "Tassato nel" usa nomi mese estesi
 1 file changed, 2 insertions(+), 2 deletions(-)
```

- [ ] **Step 2: Verifica**

Run: `git log --oneline -5`
Expected: 4 commit cherry-picked sopra `364d807`. Esempio:
```
<sha> fix(fatture-mensile): dropdown "Tassato nel" usa nomi mese estesi
<sha> fix(incassi-manuali): no più auto-promote a fattureEmesse + stop migrazione automatica
<sha> fix(fatture-storico): mostra "—" per fatture senza progressivo (no più 2026/001 ghost)
<sha> chore: ignora .codex-temp (snapshot LevelDB Edge dell'agente Codex)
364d807 Merge dev-ui-fixes-audit-2026-05: ...
```

---

### Task 6: Verifica suite test

**Files:**
- Nessuna modifica.

- [ ] **Step 1: Run del test runner**

Run: `node test/run-tests.js`
Expected: `646/646 tests passed, 0 failed` (validato in dry-run).

Se il numero è diverso ma > 600 e `0 failed`: OK, può variare se il pre-merge ha aggiunto/rimosso suite.

Se ci sono `failed > 0`: STOP. Investigare prima di procedere. Possibili cause:
- Conflitto di Task 3 risolto male.
- Cherry-pick out-of-order.
- File mancante post-cherry-pick.

- [ ] **Step 2: Verifica file Portafoglio v2 / Scadenziario v2 effettivamente assenti**

Run: `git ls-files | grep -E '^(portafoglio|app-portafoglio-ui|app-scadenziario-v2|pagamenti-storage)\.js$'`
Expected: nessun output (file non esistono).

Run: `git ls-files | grep '^app-accantonamento\.js$'`
Expected: `app-accantonamento.js` (presente, è il file vecchio).

- [ ] **Step 3: Verifica index.html ha i container vecchi**

Run: `grep -nE 'tab-accantonamento|tab-scadenziario|portafoglio-root|scad-v2-root' index.html`
Expected:
```
180:  <div id="tab-accantonamento" class="tab-content">
181:    <div class="calc-grid" id="accantonamentoGrid"></div>
184:  <div id="tab-scadenziario" class="tab-content">
185:    <div class="calc-grid" id="scadenziarioGrid"></div>
```
Nessuna riga `portafoglio-root` né `scad-v2-root`.

---

### Task 7: Smoke test browser (manuale, USER)

**Files:**
- Nessuna modifica.

- [ ] **Step 1: Apri l'app nel browser**

Run: `Start-Process index.html`
oppure aprire `index.html` direttamente da Esplora Risorse.

- [ ] **Step 2: Login profilo Mattia (o Demo)**

Inserisci la password del profilo. Verifica che il login funzioni e i dati anno corrente si caricano.

- [ ] **Step 3: Tab "Tasse Accantonate"**

Click sulla tab. Verifica:
- Mostra una lista di fatture pagate nell'anno (intra-year + cross-year).
- Per ogni riga c'è un input numerico per accantonamento.
- Se in `localStorage` esistevano valori in `data.accantonamento`, **dovrebbero essere mostrati**.
- Donut chart in alto con totali "Dovuto / Accantonato / Pagato F24".

- [ ] **Step 4: Tab "Scadenziario"**

Click sulla tab. Verifica:
- Mostra lista flat di righe: saldo/acconti imposta sostitutiva, INPS fissi quarterly, INPS variabili saldo/acconti, bollo trimestri, INAIL, CCIAA.
- Click "Segna pagato" su una riga apre il `quickPayModal` (modal con input importo + split su più scadenze).
- Sezione pagamenti CRUD inline funzionante.
- Drawer override (5 sezioni) accessibile.

- [ ] **Step 5: Tab "Fatture" — verifica i 3 fix recenti**

- (a) **Storico fatture**: cerca una fattura legacy-migrated con `progressivo=0`. Deve mostrare "—" nella colonna numero, non "2026/001".
- (b) **Incassi manuali**: scrivi un importo in una cella mensile. Salva. Vai allo storico fatture e verifica che **NON** sia stata creata una nuova fattura sintetica `legacy_*`.
- (c) **Dropdown "Tassato nel"** (vista mensile): apri il select e verifica che mostri "Gennaio", "Febbraio", … "Dicembre" estesi (non "Gen", "Feb", …).

- [ ] **Step 6: Conferma all'agente**

Conferma all'agente: "Smoke test OK" oppure segnala specifico problema riscontrato.

---

### Task 8: Cleanup e backup awareness

**Files:**
- Nessuna modifica.

- [ ] **Step 1: Verifica branch backup**

Run: `git branch | grep -E 'fix-incassi-fatture-ghost|revert-portafoglio-scadenziario'`
Expected:
```
  fix-incassi-fatture-ghost
* revert-portafoglio-scadenziario
```
La branch `fix-incassi-fatture-ghost` rimane locale come backup. **Non cancellarla**.

- [ ] **Step 2: Pop dello stash se in Task 1.2 era stato fatto**

Run: `git stash list`
Se output mostra "settings.local.json wip", eseguire:
```
git stash pop
```
Risolvere eventuali conflitti su `.claude/settings.local.json` con `git checkout --theirs .claude/settings.local.json` (è file locale).

- [ ] **Step 3: Sintesi finale**

Run: `git log --oneline -6`
Expected: 4 fix cherry-picked sopra `364d807`. Branch attiva = `revert-portafoglio-scadenziario`.

Run: `git diff fix-incassi-fatture-ghost..revert-portafoglio-scadenziario --stat | tail -5`
Expected: differenza grossa (~17000 righe in delta) che riflette la rimozione di Portafoglio v2 + Scadenziario v2 + fix audit.

---

## Note operative

### Se qualcosa va storto
- **Hard abort**: `git cherry-pick --abort` (durante un cherry-pick attivo).
- **Reset branch**: dato che la branch è nuova e locale, `git checkout fix-incassi-fatture-ghost` ripristina lo stato precedente. Poi `git branch -D revert-portafoglio-scadenziario` per ripartire da zero.
- **Recovery completa**: la branch `fix-incassi-fatture-ghost` non è mai toccata. Tornare lì restaura tutto come prima del piano.

### Memory utente
Dopo il revert, alcuni file in `~/.claude/projects/.../memory/` documentano feature ora rimosse:
- `project_p0_audit_2026_05_03.md`
- `project_session_2026_05_01.md` (sezione Portafoglio v2 / Scadenziario v2)

Vanno aggiornati o marcati come "abbandonati". **Out of scope di questo piano** — operazione di follow-up separata.

### Push su origin
Decisione operativa. La branch è locale; per pushare:
```
git push -u origin revert-portafoglio-scadenziario
```
Discutere con l'utente se sia il momento di farlo (es. dopo conferma smoke test) o se aspettare che sia mergiato in main.

---

## Self-review checklist

- [x] **Spec coverage**: ogni sezione dello spec ha un task corrispondente. "Strategia git" → Task 1-5. "Risoluzione conflitto" → Task 3 step 3. "Verifica" → Task 6. "Smoke test browser" → Task 7. "Branch backup" → Task 8 step 1.
- [x] **Placeholder scan**: nessun TODO/TBD/"implement later". Risoluzioni conflitti scritte per intero. Comandi git completi.
- [x] **Type/SHA consistency**: i 4 SHA `743d18d`, `b5b2af4`, `f7dbf79`, `c1f4646` sono coerenti tra spec e plan. Branch name `revert-portafoglio-scadenziario` consistent.
