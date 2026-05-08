# Revert Portafoglio v2 + Scadenziario v2

**Data**: 2026-05-08
**Branch sorgente**: `fix-incassi-fatture-ghost`
**Branch nuovo**: `revert-portafoglio-scadenziario`
**Stato**: design approvato, in attesa di plan d'implementazione.

## Contesto

Il merge `7b41a41` (2026-05-05) ha portato in `main` il branch `dev-portafoglio-scadenziario` con:

- **Portafoglio v2**: la tab "Tasse Accantonate" è stata trasformata in un portafoglio cassa-virtuale a saldo manuale (saldoIniziale + depositi + rettifiche − pagamenti F24), con onboarding wizard, banner anno misto, modal deposita con picker fatture, banner rettifiche pendenti NC, riconciliazione bancaria.
- **Scadenziario v2**: timeline raggruppata per categoria (TASSE / CONTRIBUTI / BOLLO / CAMERA / INAIL) con hero countdown, drawer Personalizzazioni con cronologia override, sezione pagamenti embedded con CRUD inline, badge categorie e filter chips.
- **Fix audit P0#1-P0#5** (2026-05-03): bug fixes specifici al codice Portafoglio/Scadenziario v2 (`_aliquota` con `getEffectiveTaxRate`, NC release proporzionale, override hint+warning+history, firebase merge cross-device, protocollo F24 validation).

Il proprietario del repo non è soddisfatto del nuovo design: lo trova **troppo complicato** rispetto alla versione precedente. Vuole tornare al modello pre-merge per **entrambe** le tab.

## Obiettivo

Ripristinare lo stato del repository a com'era immediatamente prima del merge `7b41a41`, su una nuova branch `revert-portafoglio-scadenziario`, preservando i 4 commit di fix sulle fatture che sono stati prodotti **dopo** il merge ma sono **indipendenti** dal codice Portafoglio/Scadenziario v2.

## Strategia git

### Branch
- Sorgente: tag git `364d807` (commit `Merge dev-ui-fixes-audit-2026-05`, primo parent del merge `7b41a41`).
- Nuova branch: `revert-portafoglio-scadenziario`.
- Branch attuale `fix-incassi-fatture-ghost` viene **mantenuto** come backup per qualunque ripensamento; non viene cancellato né riscritto.

### Cherry-pick — ordine cronologico
1. `743d18d` — chore: ignora .codex-temp (.gitignore) — atteso: clean.
2. `b5b2af4` — fix(fatture-storico): mostra "—" per fatture senza progressivo (4 file: `fatture-docs-feature.js`, `fatture-storico.js`, `test/fatture-storico-display-numero.test.js`, `test/run-tests.js`) — atteso: **conflitto in `test/run-tests.js`**.
3. `f7dbf79` — fix(incassi-manuali): no più auto-promote a fattureEmesse + stop migrazione automatica (2 file: `app-fatture-helpers.js`, `app-shell.js`) — atteso: clean (auto-merge).
4. `c1f4646` — fix(fatture-mensile): dropdown "Tassato nel" usa nomi mese estesi (1 file: `app-fatture.js`) — atteso: clean.

### Risoluzione conflitto in `test/run-tests.js`
Il pre-merge ha alla riga ~119 `require('./accantonamento-bugfix.test.js');`. Il fix `b5b2af4` aggiunge alla fine `require('./fatture-storico-display-numero.test.js');`. La risoluzione corretta (validata in dry-run): mantenere `accantonamento-bugfix.test.js` e aggiungere `fatture-storico-display-numero.test.js`. Tutti i `require` per i moduli Portafoglio v2 / Scadenziario v2 / pagamenti-storage / firebase-sync-portafoglio-merge / firebase-sync-overrides-history-merge **vanno rimossi** (i file sorgente non esistono nel pre-merge).

```
require('./fatture-xml-helpers.test.js');
require('./accantonamento-bugfix.test.js');
require('./fatture-storico-display-numero.test.js');
require('./app-bootstrap.test.js');
```

### Verifica dry-run
Effettuata su branch temporaneo `_drytest_revert` partendo da `364d807` con i 4 cherry-pick applicati nell'ordine sopra. Risultato: **646/646 test passano**, branch eliminato dopo verifica.

## Cosa torna in vita

- **Tab "Tasse Accantonate"** (renderizzata da `app-accantonamento.js` 637 righe + `app-storage.js`):
  - Una riga per ogni fattura pagata nell'anno corrente (intra-year + cross-year invoices).
  - Aggregazione per `(mese emissione, cliente)` con netto effettivo NC parziali; logica `getFattureForAccantonamentoForYear`.
  - Input numerico per accantonamento per riga, persistito in `data.accantonamento[key]`.
  - Grafico cumulativo donut (dovuto vs accantonato vs pagato F24).
  - Totali aggregati cross-year (tutti gli anni storicizzati).

- **Tab "Scadenziario"** (renderizzata da `renderScadenziario` in `app-calendar.js`):
  - Lista flat di righe: saldi/acconti imposta sostitutiva + INPS fissi quarterly + INPS variabili saldi/acconti + bollo trimestri + INAIL + Camera di Commercio.
  - Pannello pagamenti CRUD inline (data, tipo, descrizione, importo).
  - Modal **quickPayModal** per "Segna pagato" con split di un F24 cumulativo su più scadenze (`splitAmountByWeights`).
  - Override drawer con 5 sezioni (saldo/acconto imposta, saldo/acconto contributi, bollo, INAIL, CCIAA).
  - Toggle metodo storico/previsionale.
  - F24 guide inline per ogni voce.

- **Engine, dichiarazione, fatture, profili**: invariati. Sono sul lato "main" pre-merge e non sono toccati dal revert.

- **Recupero dati storici**: il vecchio store `data.accantonamento` (chiave `key → amount` per anno) è preservato in localStorage perché il merge non lo cancellava (era usato come backup per la migration al Portafoglio v2). L'app vecchia lo legge nativamente: i valori storici di accantonamento manuale **dovrebbero ricomparire** automaticamente al primo refresh post-revert.

## Cosa scompare

### File cancellati
- `portafoglio.js` (252 righe)
- `app-portafoglio-ui.js` (794 righe)
- `app-scadenziario-v2.js` (969 righe)
- `pagamenti-storage.js` (177 righe)
- `preview-fatture.html` (253 righe)
- `preview-portafoglio-scadenziario.html` (880 righe)
- `test/portafoglio-*.test.js` (5 file)
- `test/scadenziario-v2-*.test.js`, `test/scadenziario-override-*.test.js` (3 file)
- `test/firebase-sync-portafoglio-merge.test.js`
- `test/firebase-sync-overrides-history-merge.test.js`
- `test/pagamenti-storage.test.js`
- `test/fatture-nc-sync.test.js` (NB: il file in `364d807` ha la versione pre-merge con 0 test sul `releaseFromPortafoglio` signal; quel signal viene rimosso)
- `test/build-cloudflare.test.js`

### Codice rollback collaterale
- `firebase-sync.js`: rimossi i merge specifici `mergePortafoglio` e `mergeOverridesHistory` introdotti dai fix audit.
- `fatture-nc-sync.js`: rimosso il signal `releaseFromPortafoglio` (non c'è più un Portafoglio da rilasciare).
- `app-storage.js`: rimossa la chiamata di migrazione legacy → Portafoglio.
- `index.html`: i `<div id="portafoglio-root">` e `<div id="scad-v2-root">` tornano a `<div class="calc-grid" id="accantonamentoGrid">` e `<div class="calc-grid" id="scadenziarioGrid">`. I tag `<script>` per i moduli Portafoglio/Scadenziario v2 spariscono.
- `app-calendar.js`: torna alle ~747 righe pre-REF-7 (con `renderScadenziario` + 12 helper interni).
- `app-shell.js`: torna ai 24 hook precedenti per la tab navigation.
- `style.css`: ~600 righe di CSS Portafoglio/Scadenziario v2 spariscono.
- `scripts/build-cloudflare.mjs`: torna alla versione hardcoded 5-asset (la versione regex-based del fix BLOCKER è dentro al merge).

### localStorage residuo nei profili reali
La chiave `calcoliPIVA_{profile}_portafoglio` può contenere depositi, rettifiche e saldoIniziale creati dall'utente durante l'uso di Portafoglio v2. Dopo il revert quei dati **non vengono cancellati** dal browser ma diventano inutilizzati (l'app vecchia non li legge). Sono recuperabili in qualunque momento: tornando al merge `7b41a41` (o re-applicando dev-portafoglio-scadenziario) i dati ricompaiono.

## Test e verifiche

### Pre-condizioni di successo
- [ ] `node test/run-tests.js` → **646/646 test passano** (verificato in dry-run).
- [ ] `git diff 364d807..HEAD --stat` mostra solo le modifiche dei 4 cherry-pick (no file Portafoglio/Scadenziario v2 inattesi).
- [ ] Working tree pulito dopo l'ultimo cherry-pick.

### Smoke test browser obbligatorio
- [ ] Login profilo Mattia (o Demo).
- [ ] Tab "Tasse Accantonate": verifica che mostri le fatture pagate dell'anno con i valori di accantonamento storici (se presenti in `data.accantonamento`). Donut renderizza correttamente.
- [ ] Tab "Scadenziario": lista flat con tutte le righe (saldi/acconti, INPS fissi, INPS variabili, bollo, INAIL, CCIAA). Click "Segna pagato" apre quickPayModal.
- [ ] Tab "Fatture": verifica che i 3 fix siano funzionanti:
  - Storico fatture: progressivo 0 mostra "—" non "2026/001".
  - Incassi manuali: scrivere un importo NON crea automaticamente una fattura sintetica in `fattureEmesse`.
  - Dropdown "Tassato nel": mostra "Gennaio", "Febbraio", … (non "Gen", "Feb").

## Rischi

- **CLAUDE.md**: la versione attuale (post-merge) documenta Portafoglio v2 e Scadenziario v2 per ~110 righe. Tornando al pre-merge, CLAUDE.md torna alla versione precedente (coerente con il codice ripristinato). I 4 cherry-pick non toccano CLAUDE.md, quindi nessun conflitto. **Non è necessaria post-revert**: il file pre-merge è già corretto per il codice pre-merge.
- **Memory utente**: alcuni file in `~/.claude/projects/.../memory/` documentano il P0 audit del 2026-05-03 e le sessioni Portafoglio/Scadenziario v2. Vanno aggiornati o marcati come "abbandonati" dopo il revert. **Follow-up post-revert, fuori scope di questo piano**.
- **Branch fix-incassi-fatture-ghost**: rimane locale, non viene toccato. Se mai dovessi pentirti del revert, basta tornarci con `git checkout fix-incassi-fatture-ghost` e tutto è come ora.

## Out of scope

- Aggiornamento dei file di memory `~/.claude/projects/...`.
- Cleanup della chiave localStorage `calcoliPIVA_{profile}_portafoglio` nei profili reali (resta come dato latente, recuperabile).
- Push della nuova branch su origin (decisione operativa post-implementazione).
- Re-design futuro dell'accumulo tasse (eventuale terza versione, da brainstormare separatamente).
