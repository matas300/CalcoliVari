# Audit fiscale post-fix v2 — passata FINALE pre-launch (2026-04-29)

**Data audit:** 2026-04-29
**Branch:** `dev-taxaudit`
**Suite test:** 378/378 verde
**Scope:** verifica chiusura dei 7 rilievi v2 del plan `2026-04-29-tax-audit-postfix-remediation.md` (commit `b833a89`...`736afc9`) + verifica residui v1 + caccia ostile finale per gap residui pre-launch.

**Metodologia:** 2 explore-agent paralleli su perimetri separati (verifica chiusura + caccia residui), cross-check ostile su ogni finding. Solo fonti AdE/GdF/INPS + normativa primaria.

---

## Sintesi esecutiva

| Severità | Verifica fix v2 | Residui v1 | Regressioni | Nuovi rilievi | Falsi positivi |
|---|---|---|---|---|---|
| 🔴 CRITICO | **0 aperti** | 0 | 0 | **0** | — |
| 🟡 ALTO | **0 aperti** | 0 chiusi v2 | 0 | **1 condizionale** (CASSE-1) | — |
| 🟢 MEDIO | **0** | — | 0 | 5 (INPS-MIN, INPS-MAX, GS-MAX, RF01-RACE, IC-F24) | — |
| ⚪ BASSO/GAP | — | — | 0 | 4 (cripto UI, IPA UX, ravvedimento, save async path) | 10 conferme |

**Stato dei 7 fix v2:**

| Rilievo | Stato | Evidence file:line |
|---|---|---|
| **NR-10** PDF regime fallback | ✅ **CHIUSO** | `fatture-docs-feature.js:728-752, 1457-1462` |
| **C-A2 bypass** preview/download XML | ✅ **CHIUSO** | `fatture-docs-feature.js:1589-1595, 1935, 2089` |
| **REG-2** aliquota GS 26.07 | ✅ **CHIUSO** | `dichiarazione-engine.js:204` |
| **NR-2** cliente IT senza P.IVA/CF | ✅ **CHIUSO** | `fatture-docs-feature.js:1115-1130` |
| **NR-3** strip prefisso paese UE | ✅ **CHIUSO** | `fatture-docs-feature.js:1814-1815` |
| **A-A7 v2** soglia 77,47 € rimborso bollo | ✅ **CHIUSO** | `fatture-docs-feature.js:1711-1714` |
| **C-A3 v2** sanitize cripto + IC visibile | ✅ **CHIUSO** | `dichiarazione-engine.js:342, 371-373` + `dichiarazione-exports.js:41, 47, 286-303` |

**Stato residui v1:**

| Residuo v1 | Stato post-v2 |
|---|---|
| C-A2 path "Invia" + bypass XML | ✅ Copertura completa via fix v2 |
| C-A3 IC visibile in PDF/CSV | ✅ Visibile via fix v2 |
| A-A7 soglia 77,47 € | ✅ Coerente con `applicaBolloSeDovuto` via fix v2 |

**Suite test:** 378/378 verde. Zero regressioni rilevate.

**Conclusione:** **branch CHIUDIBILE per merge in `main`** con due azioni quick-win raccomandate (~10-15 min ciascuna) — vedi sezione "Raccomandazioni pre-merge".

---

## PARTE 1 — Verifica chiusura 7 rilievi v2

### ✅ NR-10 (CRITICO) — `_resolveRegimeForPdf` fallback chain

**File:** `fatture-docs-feature.js:728-752` + chiamata in `buildInvoicePdfMinimal:1457-1462`

**Verificato:**
- Funzione a modulo-scope con 3 step di fallback: `getSettings()` → `localStorage[calcoliPIVA_${profile}_${year}]` → `throw`.
- `window.__resolveRegimeForPdf` esposta per test.
- `buildInvoicePdfMinimal` ri-throwa l'errore (non catch silenzioso).
- I caller (`previewFatturaPdf:1534`, `downloadFatturaPdf:1519`) catturano e mostrano `showFatturaToast(...)` all'utente.
- 4 test in `test/fatture-pdf-regime-fallback.test.js`: forfettario via fallback, ordinario, throw senza regime, throw senza storage.

**Nessun rischio residuo.** La propagazione del throw è la condotta corretta: l'utente non ottiene mai un PDF con dicitura ambigua.

### ✅ C-A2 bypass (ALTO) — preview/download XML

**File:** `fatture-docs-feature.js:1589-1595` (validate), `1935` (download), `2089` (preview)

**Verificato:**
- `validateFatturaForXml` contiene check `regime==='forfettario' && ritenuta>0` → push errore.
- `previewFatturaXml` chiama `validateFatturaForXml(saved)` prima di `buildFatturaElettronicaXml`. Su errori → toast + abort.
- `downloadFatturaXml` chiamava già `validateFatturaForXml`.
- `window.__validateFatturaForXml` esposta.
- 2 test in `test/fatture-ritenuta-forfettario.test.js` describe "C-A2 bypass".

**⚠️ Nota tecnica non bloccante:** esiste un terzo call site in `fatture-docs-feature.js:~1200` (validazione XSD asincrona post-save via `FattureXmlValidator.validateAndNotify`) che chiama `buildFatturaElettronicaXml` SENZA passare per `validateFatturaForXml`. Non è un path utente-facing (l'XML non viene scaricato) ma può produrre falsi positivi dal validatore esterno se un draft con ritenuta forfettario era salvato pre-fix. **Severità: MEDIO**, da chiudere in prossimo sprint per coerenza interna. NON bloccante per launch.

### ✅ REG-2 (ALTO) — aliquota GS 26.07

**File:** `dichiarazione-engine.js:204`

**Verificato:**
- Fallback `parseFloat(settings.aliqContributi) || 26.07` (non più 26.23).
- Comment con riferimento `Circ. INPS 26/2025 + 8/2026`.
- Grep globale: nessun `26.23` hardcoded spurio nel codice produzione (le occorrenze residue sono fixture di test legittime per anni 2022-2023).
- Test in `test/dichiarazione-quadro-rr-aliquota-gs.test.js` con asserzione su 2607.00.

**Nessun residuo.**

### ✅ NR-2 (ALTO) — cliente IT senza P.IVA/CF

**File:** `fatture-docs-feature.js:1115-1130`

**Verificato:**
- Check tollera `draft.cliente || draft.clienteSnapshot` (doppia shape come A-A6).
- `nazione === 'IT'` → richiede P.IVA o CF valido. Se entrambi assenti → push errore con riferimento `FatturaPA v1.2 §1.4.1.2`.
- `isValidPartitaIvaIT` (regex 11 cifre) e `isValidCodiceFiscale` (regex 16 char + check digit) usate, fallback per ambiente test.
- Replicato in `validateFatturaForXml:1583-1586`.
- 4 test case: bloccante, P.IVA ok, CF only ok, estero ok.

**Edge case verificati:** P.IVA 5 cifre → bloccato; CF 15 char → bloccato.

### ✅ NR-3 (ALTO) — strip prefisso paese UE

**File:** `fatture-docs-feature.js:1814-1815`

**Verificato:**
- Regex case-insensitive: `replace(new RegExp('^' + cliNaz, 'i'), '').trim() || vatEstero`.
- Fallback `|| vatEstero` evita stringa vuota.
- `cliNaz` derivato da `String(cliente.nazione || 'IT').slice(0,2).toUpperCase() || 'IT'` → sempre 2 char nei casi normali.
- Edge case verificati: `cliNaz` vuoto → regex `^` non rimuove nulla; `cliNaz` 1-3 char → no crash.
- 4 test: prefisso DE, lowercase, no prefisso, IT non toccato.

### ✅ A-A7 v2 (ALTO) — soglia 77,47 € rimborso bollo

**File:** `fatture-docs-feature.js:1711-1714`

**Verificato:**
- `emetteRimborsoBollo = !isNC && marcaDaBollo && bolloAddebitato && (totals && totals.subtotal > 77.47)`.
- Operatore strict `>` coerente con D.M. 17/06/2014 art. 6 ("superiore a").
- `totals.subtotal` esclude il bollo addebitato (verificato in `computeDraftTotals:387-388` — `bolloInTotal` è separato e va in `total`, non in `subtotal`).
- 3 test: sotto soglia, soglia esatta 77.47, sopra soglia.

**Coerenza globale:** `emetteRimborsoBollo` e `applicaBolloSeDovuto` ora usano la stessa soglia → mai più caso XML incoerente.

### ✅ C-A3 v2 (ALTO) — sanitize cripto + esposizione IC

**File:** `dichiarazione-engine.js:342, 371-373` + `dichiarazione-exports.js:41, 47, 286-303`

**Verificato:**
- `quota = Math.min(1, Math.max(0, quotaRaw))` con warning se fuori range.
- `valoreCripto = Math.max(0, valoreCriptoRaw)` con warning se negativo.
- `quotaPossesso` esposta sanitizzata nel return del rigo.
- CSV: righe `RW{i}_IC` + `_TOT_IC` solo se IC > 0 (additivo, no break consumer).
- PDF: colonna IC nella tabella RW (label `IC xxx €` allineata destra) + total IC in fondo sezione (`Totale IC cripto-attività (2‰): € xxx`).
- 4 test sanitize + 2 test CSV.

**`_warnings` propagation:** verificato in `validateDichiarazione:540-544` — i `_warnings` rigo-level del RW vengono emessi come `code: 'RW_RIGO_WARN'` con severity `'warning'`.

---

## PARTE 2 — Verifica residui v1 chiusi

| Residuo v1 | Conferma chiusura post-v2 |
|---|---|
| **C-A2 path "Invia"** (chiuso v1) + **bypass XML** (aperto v1) | ✅ Copertura completa: `validateDraftForInvio` + `validateFatturaForXml` + `previewFatturaXml` + `downloadFatturaXml` tutti coprono. |
| **C-A3 IC non visibile** (aperto v1) | ✅ PDF + CSV ora espongono IC e total IC. Sanitize copre input fuori range. |
| **A-A7 soglia mancante** (aperto v1) | ✅ Soglia 77,47 € su `emetteRimborsoBollo` coerente con `applicaBolloSeDovuto`. |

**Tutti i parziali v1 sono chiusi.**

---

## PARTE 3 — Regressioni

**Nessuna regressione rilevata.**

Test verificati:
- `test/dichiarazione-rw-soglie.test.js` (IVAFE/IVIE su conto/immobile) → verde.
- `test/dichiarazione-quadro-rr-completo.test.js` (RR sez. II con override 26.23) → verde (override esplicito non tocca il fallback).
- `test/fatture-xml-anagrafica.test.js` (PF/PG IT/Estero) → verde.
- `test/fatture-xml-element-order.test.js` (XSD `DatiGeneraliDocumento`) → verde.
- `test/fatture-xml-natura.test.js`, `fatture-xml-progressivo.test.js`, `fatture-xml-nc-date.test.js` → verdi.

Suite globale: 378/378.

---

## PARTE 4 — Nuovi rilievi (caccia ostile finale)

### 🟡 CASSE-1 ALTO condizionale — Casse autonome non gestite

**File:** `dichiarazione-engine.js:202-214` (`buildQuadroRR`)

**Problema:** l'app gestisce solo `inpsMode === 'artigiani_commercianti'` o `inpsMode === 'gestione_separata'`. Nessuna copertura per casse autonome (INARCASSA, CNPADC, ENPACL, EPAP, ecc.). Un utente architetto in regime forfettario con INARCASSA che usa l'app potrebbe vedere contributi calcolati come "artigiano" — completamente errati.

**Effetto:** dichiarazione errata + versamenti F24 errati → comunicazione di irregolarità AdE.

**Bloccante per launch?** **DIPENDE DAL POSITIONING:**
- Se il prodotto è marketed come "per tutti i forfettari italiani" → **BLOCCANTE**.
- Se lo scope è esplicitamente "artigiani / commercianti / GS" → ACCETTABILE con disclaimer in UI.

**Fix proposto (5 min):** in `buildQuadroRR`, se `inpsMode` non è uno dei due valori riconosciuti, emettere un `_warning` di severity `error`:
```javascript
if (settings.inpsMode !== 'artigiani_commercianti' && settings.inpsMode !== 'gestione_separata') {
  warnings.push({ severity: 'error', message: 'Cassa previdenziale non gestita: i contributi vanno inseriti manualmente. Consultare il proprio ordine professionale (es. INARCASSA, CNPADC, ENPACL).' });
}
```

**Fonte:** L. 45/1987 + statuti casse autonome.

### 🟢 INPS-MIN-1 MEDIO — Minimale INPS 2026 non validato

**File:** `dichiarazione-engine.js:219`

`buildQuadroRR` legge `parseFloat(settings.minimaleInps) || 0`. Senza validazione di range, un utente che lascia il campo a 0 o inserisce un valore obsoleto (es. 18.415 € del 2025) produce un quadro RR silenziosamente errato.

**Minimale 2026 atteso:** 18.808 € (Circ. INPS 8/2026).

**Fix:** warning se `minimale < 18000 || minimale > 20000` (range di ragionevolezza).

**Pre-launch:** ACCETTABILE. Il valore è oggi pre-popolato dal profilo, e l'utente può sovrascrivere.

### 🟢 INPS-MAX-1 + GS-MAX-1 MEDIO — Massimale 119.650 € non applicato

**File:** `dichiarazione-engine.js:205, 221`

`buildQuadroRR` non applica il cap `min(reddito, 119.650 €)` né per sez. I (art-comm) né per sez. II (GS). Per ricavi forfettario sotto 85k il rischio è zero (reddito imponibile mai supera il massimale), ma per anno misto / regime ordinario il problema esiste.

**Pre-launch:** ACCETTABILE per scope forfettario puro. Da chiudere in prossimo sprint per scope ordinario/misto.

**Fonte:** Circ. INPS 8/2026; art. 1 L. 233/1990 (artigiani/commercianti); art. 2 c. 18 L. 335/95 (GS).

### 🟢 RF01-RACE-1 MEDIO — `RegimeFiscale` race condition

**File:** `fatture-docs-feature.js:1633`

```javascript
const regimeUtente = (typeof data !== 'undefined' && data && data.settings && data.settings.regime) || 'forfettario';
const regimeFiscale = (regimeUtente === 'ordinario') ? 'RF01' : 'RF19';
```

Se `data` non è ancora caricato quando si invoca XML build, il fallback è `forfettario` → emette `RF19` anche per utenti ordinario. Race condition rara ma teoricamente possibile.

**Fix:** usare lo stesso pattern di `_resolveRegimeForPdf()` (fallback localStorage).

**Pre-launch:** ACCETTABILE. Il modal fattura si apre solo dopo idratazione `data`.

### 🟢 IC-F24-1 MEDIO — Codice tributo F24 per IC cripto non esposto

**File:** `dichiarazione-exports.js` sezione PDF RW

**Problema:** PDF e CSV ora espongono l'IC dovuta, ma non riportano il codice tributo F24 da usare per il versamento.

**Codice tributo:** **1727** (Risoluzione AdE n. 36/E del 14/06/2023).

**Fix proposto (10 min):** nel PDF, sotto il totale IC, aggiungere riga:
```
Versamento F24: codice tributo 1727 — Sezione Erario (Ris. AdE 36/E del 14/06/2023)
```

**Pre-launch:** ACCETTABILE come gap, BLOCCANTE come UX se l'utente ha cripto.

### ⚪ CRIPTO-UI-1 GAP — Form RW senza UI per cripto

**Stato:** documentato già nell'audit precedente. Engine pronto, UI assente. Inserimento solo via JSON/import.

**Pre-launch:** ACCETTABILE se il prodotto NON dichiara supporto cripto in marketing. Bloccante se sì.

### ⚪ IPA-UX BASSO — Campo IPA non normalizza visivamente lowercase

Validate accetta lowercase, XML emette uppercase → divergenza UX. Non causa errori SdI.

### ⚪ Path async XML validator senza check (segnalazione)

Vedi C-A2 v2 nota tecnica: il path `:~1200` (validatore esterno) non chiama `validateFatturaForXml`. Non è un bypass utente-facing ma incoerenza interna.

### ⚪ Ravvedimento operoso — gap noto, non bloccante

Documentato in audit precedenti. Fuori scope.

---

## PARTE 5 — Falsi positivi confermati (10)

| Check | Conferma |
|---|---|
| `buildAccontoPlan(0)`, `buildAccontoPlan(NaN)`, `buildAccontoPlan(Infinity)` | ✅ Coperti da `toNumber` (riga 31) — tutti producono `base=0` → mode `none` |
| Leakage cripto in `buildForfettarioScenario` | ✅ Zero contatto: `quadroRW.icTotale` non entra mai nel calcolo imposta sostitutiva |
| Cliente con `nazione=null/''` | ✅ JS `null \|\| 'IT'` = `'IT'` correttamente |
| Throw `_resolveRegimeForPdf` swallowed | ✅ Re-thrown a UI, mostrato come toast |
| Fix C-A2 interferenza con regime ordinario | ✅ Check `regime === 'forfettario'` chirurgico, no false positive |
| NR-2/NR-3 su NC TD04 | ✅ Copertura completa (validate non distingue tipoDocumento) |
| EsigibilitaIVA per N2.2 | ✅ Opzionale per AdE FatturaPA v1.2 §2.2.2 |
| Hard-delete dev toggle | ✅ Gated da `settings.devHardDelete === 1` |
| IBAN bloccante | ✅ Warning UI in `validateDraftForInvio:1083-1085` |
| C-A1 boundary 257.52 | ✅ `<=` confermato chiuso |

---

## Conclusione

**Branch `dev-taxaudit` CHIUDIBILE per merge in `main`.**

### Stato sintetico

- ✅ **0 critici aperti**
- ✅ **0 alti aperti senza condizionalità**
- 🟡 **1 alto condizionale** (CASSE-1) — bloccante solo se positioning marketing dichiara "per tutti i forfettari"
- 🟢 **5 medi** non bloccanti, schedulabili in prossimo sprint
- ⚪ **4 gap/bassi** documentati e accettabili pre-launch
- ✅ **378/378 test verde**, 0 regressioni

### Raccomandazioni pre-merge (quick win, ~15 min totali)

**Priorità ALTA (5 min ciascuno):**

1. **CASSE-1 disclaimer** — aggiungere warning in `buildQuadroRR` se `inpsMode` non è gestita. Anche solo come `_warning` informativo evita l'errore silenzioso per utenti con cassa autonoma.

2. **IC-F24-1 codice tributo** — aggiungere nel PDF dichiarazione (sezione RW) la nota:
   ```
   Versamento F24 IC cripto: codice tributo 1727 (Ris. AdE 36/E del 14/06/2023) — Sezione Erario
   ```

### Schedulabili in prossimo sprint (post-launch)

- INPS-MIN-1: warning su minimale fuori range
- INPS-MAX-1 / GS-MAX-1: applicare massimale 119.650 €
- RF01-RACE-1: fallback localStorage anche per RegimeFiscale XML
- C-A2 path async validator: aggiungere check anche al path `:~1200`
- CRIPTO-UI-1: form RW per cripto-attività

### Gap noti accettabili (no fix richiesto)

- Ravvedimento operoso (fuori scope dichiarato)
- IPA UX uppercase (cosmetico)

---

## Note metodologiche

- 2 explore-agent paralleli, lettura diretta del codice sorgente.
- Cross-check ostile su ogni claim (es. verifica `null || 'IT'` semantica JS, edge case `cliNaz` malformato, leakage cripto in tax engine).
- Fonti citate: AdE, GdF, INPS, normativa primaria.
- Suite verde non implica conformità fiscale assoluta: indica solo assenza di regressioni rispetto ai test scritti. La caccia ostile è il complemento.

**L'auditor severo ritiene il branch maturo per il merge** salvo eventuale chiusura dei due quick win raccomandati (CASSE-1 + IC-F24-1) per evitare rilievi formali post-launch su utenti con cassa autonoma o cripto-attività.
