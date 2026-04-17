# Audit Calcoli — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eseguire l'audit dei calcoli fiscali del progetto Calcoli P.IVA secondo lo spec `docs/superpowers/specs/2026-04-17-audit-calcoli-design.md`. Identificare ogni discrepanza tra codice e normativa italiana per il regime forfettario sugli anni 2024-2026, classificarla per severity, e produrre una lista di issues approvate dall'utente prima di applicare qualunque fix.

**Architecture:** Audit a 3 step (A: parametri normativi → B: scenari simulati → C: regression test, condizionato). Niente codice di produzione modificato in questo plan: solo lettura del codice, ricerca normativa, e aggiornamento dello spec con i risultati. Le issues raccolte diventeranno l'input per piani di fix separati.

**Tech Stack:** Node 22 (per `npm test`), `node:test` runner, JS vanilla. Skill `commercialista-fiscale` come fonte metodologica per i calcoli a mano. Web search per la verifica normativa.

**Spec di riferimento:** `docs/superpowers/specs/2026-04-17-audit-calcoli-design.md`

**Convenzioni:**
- Severity: `critico` (errore di calcolo che cambia il dovuto), `medio` (label/codice/data sbagliata che non altera importi), `cosmetico` (documentazione, naming).
- Format calcolo a mano: Scenario / Regole applicate / Calcolo passo-passo / Riepilogo / Punti da verificare (vedi skill `commercialista-fiscale`).
- Commit cadence: 1 commit alla fine di ogni Phase (A, B, C, D), non per task.

---

## Phase A — Checklist parametri normativi

Confronto i valori hardcoded nel codice contro le fonti ufficiali (circolari INPS/INAIL, risoluzioni AdE, decreti).

### Task A1: Verifica tabella INPS artigiani/commercianti 2024-2026

**Files:**
- Read: `app.js:264-300` (`OFFICIAL_ARTCOM_INPS`)
- Update: `docs/superpowers/specs/2026-04-17-audit-calcoli-design.md` (sezione "Step A — Risultati", subitems A1-A7, A28)

- [ ] **Step 1: Estrai i valori dal codice in formato tabellare**

Leggi `app.js:264-300` e produci una tabella mentale con: anno | minimaleInps | artigiano.contribFissi | artigiano.aliqContributi | commerciante.contribFissi | commerciante.aliqContributi.

- [ ] **Step 2: Verifica vs circolari INPS 2024**

WebFetch o WebSearch su "circolare INPS 2024 artigiani commercianti minimale aliquota". Fonti accettabili: inps.it, sito ufficiale del CNDCEC, Sole24Ore, FiscoOggi. Confronta contro:
- `minimaleInps` 2024 = 18.415 (atteso da circolare INPS 33/2024: 18.415,00)
- `contribFissi` artigiano 2024 = 4.427,04
- `contribFissi` commerciante 2024 = 4.515,43
- aliquote 24,00% / 24,48%

- [ ] **Step 3: Verifica vs circolari INPS 2025**

Stessa procedura per:
- `minimaleInps` 2025 = 18.555
- `contribFissi` artigiano 2025 = 4.460,64
- `contribFissi` commerciante 2025 = 4.549,70
- aliquote 24,00% / 24,48%

Fonte attesa: circolare INPS 38/2025 (data esatta da verificare).

- [ ] **Step 4: Verifica vs circolari INPS 2026**

Stessa procedura per:
- `minimaleInps` 2026 = 18.808
- `contribFissi` artigiano 2026 = 4.521,36
- `contribFissi` commerciante 2026 = 4.611,63
- aliquote 24,00% / 24,48%

Se la circolare 2026 non è ancora pubblicata al 17/04/2026, segnalalo e marca come "da rivedere".

- [ ] **Step 5: Verifica riduzione 35% (A28)**

Leggi `app.js:1468-1469`:
```javascript
const rid = s.riduzione35 == 1 && inps.mode === 'artigiani_commercianti' ? 0.65 : 1;
const cFR = cF * rid, cVR = cV * rid, cTR = cFR + cVR;
```

Verifica vs L. 145/2018 art. 1 c. 20: la riduzione del 35% si applica sui contributi minimi (cF) E sui contributi eccedenti (cV). Atteso: `cFR = cF * 0.65` e `cVR = cV * 0.65`. Se entrambe le righe applicano `rid=0.65`, OK.

- [ ] **Step 6: Aggiorna lo spec con i risultati A1-A7, A28**

Apri lo spec, vai alla tabella sotto `## Step A — Checklist parametri normativi`, aggiungi tre colonne `Atteso | Trovato | Esito` per le righe A1-A7 e A28 (oppure crea una nuova sezione `## Step A — Risultati` con la tabella popolata). Esempio formato:

```markdown
| # | Parametro | Atteso (fonte) | Trovato (codice) | Esito |
|---|---|---|---|---|
| A1 | Minimale INPS art/com 2024 | 18.415,00 (Circ. INPS 33/2024) | 18.415 (`app.js:286`) | ✓ |
```

Per ogni mismatch crea anche una entry nella sezione `## Issues raccolte` con: ID (es. `ISS-A1`), severity, descrizione, fix proposto.

### Task A2: Verifica gestione separata e massimale contributivo

**Files:**
- Read: `app.js` (cerca `gestione_separata`, `massimale`, aliquote default)
- Update: spec doc (A8, A9)

- [ ] **Step 1: Localizza i parametri nel codice**

Esegui Grep su `app.js`:
- pattern `gestione_separata.*aliq|aliquota.*gestione|massimale|26,07|24,73|massimaleContribut`
- pattern `getDefaultSettings`

Identifica dove e come vengono settate le aliquote di gestione separata. Probabili posizioni: `getDefaultSettings` (~app.js:1060), `PROFILE_FISCAL_LIBRARY` (app.js:7-83), o caricate per anno.

- [ ] **Step 2: Verifica massimale INPS 2024-2026**

WebSearch su "massimale contributivo INPS 2024 2025 2026". Valori attesi (da verificare):
- 2024: 119.650,00 (Circ. INPS 19/2024)
- 2025: ~120.607,00 (da verificare)
- 2026: da verificare

Controlla se il codice applica il massimale (clamp dell'imponibile sopra il massimale). Se non lo applica, è un bug critico per redditi alti.

- [ ] **Step 3: Verifica aliquote gestione separata 2024-2026**

Cerca il valore di `aliqContributi` quando `inpsMode === 'gestione_separata'` o quando l'utente seleziona gest.sep. Aliquote attese:
- Senza altra copertura previdenziale: 26,07% (2024-2025), 26,07% (2026 da verificare)
- Con altra copertura/pensionato: 24,00%

Se il codice usa un solo valore o non distingue i casi → issue medio.

- [ ] **Step 4: Aggiorna spec con A8, A9**

Aggiungi entries nella tabella risultati. Se trovi che il massimale non è applicato → issue critico (`ISS-A8`).

### Task A3: Verifica regole acconto (soglie e pesi)

**Files:**
- Read: `tax-engine.js:11-15`, `tax-engine.js:70-87` (`buildAccontoPlan`), `app.js:571-580` (`FORFETTARIO_RULES`)
- Update: spec doc (A10, A11, A12)

- [ ] **Step 1: Estrai i valori dal codice**

Da `tax-engine.js:11-15`:
```javascript
const DEFAULT_ACCONTO_RULES = {
  thresholdZero: 51.65,
  thresholdSingle: 257.52,
  weights: [40, 60]
};
```

Da `app.js:571-580`:
```javascript
const FORFETTARIO_RULES = {
  accontoThreshold: 51.65,
  singleAccontoThreshold: 257.52,
  ...
  fixedAccontoWeights: [40, 60]
};
```

- [ ] **Step 2: Verifica vs DPR 435/2001**

Verifica art. 17 c. 3 DPR 435/2001:
- Soglia "no acconto": ≤ 51,65 €
- Soglia "unica rata novembre": < 257,52 €
- Sopra 257,52: doppio acconto 40% (giugno) + 60% (novembre)

Per imposta sostitutiva forfettario, le stesse regole si applicano (rinvio normativo). Verifica anche che la documentazione di `buildAccontoPlan` (commenti) corrisponda al codice.

- [ ] **Step 3: Verifica logica `buildAccontoPlan`**

Leggi `tax-engine.js:70-87` riga per riga:
```javascript
function buildAccontoPlan(baseAmount, rules) {
  if (base <= cfg.thresholdZero) return { ..., mode: 'none' };
  if (base < cfg.thresholdSingle) return { ..., first: 0, second: base, mode: 'single' };
  ...
}
```

Verifica che:
- `base <= 51.65` → 0 acconti (corretto)
- `51.65 < base < 257.52` → unica rata a novembre (corretto: `first: 0, second: base`)
- `base >= 257.52` → split 40/60 (corretto)

NB: nota che il confronto `base <= cfg.thresholdZero` usa `<=`, mentre la norma dice "non superiore" (cioè `<=`). Corretto. Ma `base < cfg.thresholdSingle` usa `<` mentre la norma per "inferiore a 257,52" usa `<` — corretto.

- [ ] **Step 4: Aggiorna spec con A10, A11, A12**

Probabile esito: tutto OK. Se OK, marca ✓.

### Task A4: Verifica scadenze (saldo, acconti, INPS fissi, bollo)

**Files:**
- Read: `app.js:574-579` (date saldo/acconti/INPS), `app.js:323-330` (date bollo)
- Update: spec doc (A13-A18)

- [ ] **Step 1: Estrai date dal codice**

Da `app.js:571-580`:
```javascript
saldoMonth: 6, saldoDay: 30,
secondoAccontoMonth: 11, secondoAccontoDay: 30,
fixedInpsDates: [[5, 16], [8, 20], [11, 16], [2, 16]],
```

Da `app.js:325-330`:
```javascript
const BOLLO_QUARTERS = [
  { label: '1o trimestre', months: [1,2,3], dueMonth: 5, dueDay: 31, codice: '2521' },
  { label: '2o trimestre', months: [4,5,6], dueMonth: 9, dueDay: 30, codice: '2522' },
  { label: '3o trimestre', months: [7,8,9], dueMonth: 11, dueDay: 30, codice: '2523' },
  { label: '4o trimestre', months: [10,11,12], dueMonth: 2, dueDay: 28, codice: '2524', nextYear: true }
];
```

- [ ] **Step 2: Verifica scadenze imposte**

Date attese (calendario fiscale ordinario, senza proroghe):
- Saldo + 1° acconto: 30/6
- 2° acconto: 30/11

Atteso: ✓.

NB: l'app non gestisce le proroghe annuali (quando il governo sposta il saldo a luglio o le rateizza con maggiorazione 0,40%). Se vuoi che l'audit segnali questo, marca come issue medio "manca gestione proroghe". Altrimenti cosmetico.

- [ ] **Step 3: Verifica scadenze INPS art/com**

Date attese (Circolare INPS standard):
- I rata: 16/5
- II rata: 20/8 (perché il 16/8 cade in periodo agostano e viene posticipato di 4 giorni)
- III rata: 16/11
- IV rata: 16/2 anno successivo

Atteso: ✓.

- [ ] **Step 4: Verifica scadenze bollo trimestrale**

Date attese (DM 4/12/2020):
- Q1: 31/5 (anno corrente)
- Q2: 30/9
- Q3: 30/11
- Q4: 28/2 anno successivo

Atteso: ✓. Nota: nel 2024 e 2025 il D.L. omnibus ha posticipato alcune scadenze; verificare se serve gestirle (probabile issue cosmetico).

- [ ] **Step 5: Aggiorna spec con A13-A18**

### Task A5: Verifica codici tributo F24, coefficienti ATECO, INAIL

**Files:**
- Read: `app.js:346-509` (`F24_GUIDE`), `app.js:303-318` (INAIL), `app.js:7-83` (`PROFILE_FISCAL_LIBRARY`)
- Update: spec doc (A19-A27)

- [ ] **Step 1: Estrai codici tributo dal `F24_GUIDE`**

Leggi `app.js:346-509`. Verifica che:
- `imposta_acc1.codiceTributo` = `1790`
- `imposta_acc2.codiceTributo` = `1791`
- `imposta_saldo.codiceTributo` = `1792`
- `bollo.codiceTributo` riga `2521-2524`
- `camera.codiceTributo` = `3850`

- [ ] **Step 2: Verifica vs Risoluzioni AdE**

Codici attesi:
- 1790 (1° acconto imposta sost.) — Ris. AdE 60/E/2015
- 1791 (2° acconto) — Ris. AdE 60/E/2015
- 1792 (saldo) — Ris. AdE 60/E/2015
- 2521 (bollo Q1), 2522 (Q2), 2523 (Q3), 2524 (Q4) — Ris. AdE 42/E/2019
- 3850 (diritto camerale) — Ris. AdE 30/E/2009

Atteso: ✓ tutti.

- [ ] **Step 3: Verifica coefficienti ATECO (A24)**

Leggi `app.js:7-83` (`PROFILE_FISCAL_LIBRARY`). Tutti e 3 i profili (Mattia, Peru, Demo) hanno `coefficiente: 67` per ATECO `62.10.00` (programmazione informatica).

Verifica vs DM 23/1/2015 e successive integrazioni:
- ATECO 62.x (servizi informatici): coefficiente atteso 67% — ✓.

L'app permette di cambiare il coefficiente nelle settings? Sì (`coefficiente` è un setting numerico). OK, niente da fare per A24.

- [ ] **Step 4: Verifica imposta sostitutiva 5%/15% (A25)**

Default: `impostaSostitutiva: 15`. Cerca con Grep dove vengono settati i valori 5 (start-up) o 15 (regime base).

Verifica:
- `agevolazioneStartUp` campo esiste in `PROFILE_FISCAL_LIBRARY` ma non viene applicato automaticamente al campo `impostaSostitutiva`?
- Se l'utente attiva `agevolazioneStartUp = 1`, l'app dovrebbe abbassare automaticamente l'aliquota a 5%? Oppure è solo informativo?

Se è solo informativo (l'utente deve cambiare a mano `impostaSostitutiva: 5`), marca come issue medio: "agevolazione start-up non auto-applica aliquota 5%".

- [ ] **Step 5: Verifica INAIL (A26, A27)**

Leggi `app.js:303-318`:
```javascript
const INAIL_MINIMALE_RENDITA = {
  2024: 18415.40, 2025: 18415.40, 2026: 18689.79
};
function calcInailPremio(year, tassoPerMille) {
  const base = getInailMinimale(year);
  return Math.round(base * tassoPerMille / 1000 * 1.01 * 100) / 100;
}
```

Verifica vs circolari INAIL:
- Minimale rendita 2024: atteso 18.415,40 (Circ. INAIL 13/2024) — ✓
- Minimale rendita 2025: atteso 18.415,40? oppure aggiornato? Verifica.
- Minimale rendita 2026: 18.689,79 — verifica

Formula: `base × tasso‰ × 1,01` (dove 1% è l'addizionale ANMIL). ✓.

- [ ] **Step 6: Aggiorna spec con A19-A27**

### Task A6: Commit Phase A

**Files:**
- Update: `docs/superpowers/specs/2026-04-17-audit-calcoli-design.md`

- [ ] **Step 1: Verifica che lo spec contenga tutte le righe A1-A28 popolate**

Apri lo spec, scorri la sezione `## Step A`. Per ogni riga A1-A28 deve esserci `Atteso | Trovato | Esito`. Per ogni `✗` deve esserci una entry nella sezione `## Issues raccolte`.

- [ ] **Step 2: Aggiungi sommario Phase A in cima alla sezione Step A**

Aggiungi una riga del tipo:
```markdown
**Sintesi Step A**: 28 parametri verificati, X conformi, Y discrepanze (Z critiche, W medie, V cosmetiche). Dettaglio sotto.
```

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\rossima\OneDrive - TXT e-solutions S.p.A\02_Sviluppo\Applicazioni_interne\Calcoli vari"
git add docs/superpowers/specs/2026-04-17-audit-calcoli-design.md
git commit -m "docs(audit): complete Step A — checklist parametri normativi

Verificati 28 parametri (tabelle INPS art/com, gestione separata,
soglie acconto, scadenze, codici tributo F24, coefficienti ATECO,
INAIL, riduzione 35%). Risultati e issues nella sezione Step A.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase B — Scenari di simulazione

Per ogni scenario calcolo il risultato a mano usando la metodologia della skill `commercialista-fiscale`, poi confronto col codice e segnalo i mismatch ≥ 1 €.

### Setup B (preliminare a tutti i task B)

**Files:**
- Read: skill `commercialista-fiscale` (già caricata in sessione, sezione "Procedura obbligatoria - Forfettario" e "Formato di output obbligatorio")

I task B usano questo formato fisso per il calcolo a mano:

```
1. Scenario: [tipo, anno, dati noti, ipotesi]
2. Regole applicate: [regime, gest.previd., aliquote, parametri annuali]
3. Calcolo passo-passo:
   - Ricavi
   - Imponibile = Ricavi × coeff
   - Contributi (cF + cV con/senza riduzione)
   - Imposta sost. = max((Imponibile - cT) × imp, 0)
   - Netto = Ricavi - cT - Tasse
4. Riepilogo: [imposte tot, contributi tot, netto annuo, netto mensile, incidenza %]
5. Punti da verificare
```

Per il confronto col codice: invocare mentalmente `calcForfettarioValues` (`app.js:1462`) con gli stessi input, e `buildForfettarioScenario` (`tax-engine.js:528`) per la parte cassa/acconti.

### Task B1: Scenario Artigiano puro 2026

**Files:**
- Read: `app.js:1462-1479` (`calcForfettarioValues`), `app.js:917-933` (`calcInpsContributions`), `tax-engine.js:528-602` (`buildForfettarioScenario`)
- Update: spec doc (sezione `## Step B — Risultati`, sotto-sezione B1)

- [ ] **Step 1: Definisci gli input**

```
Scenario: Artigiano puro 2026
Input:
  - regime: forfettario
  - coefficiente: 67 (ATECO 62.10.00)
  - impostaSostitutiva: 15
  - inpsMode: artigiani_commercianti
  - inpsCategoria: artigiano
  - usaInpsUfficiale: 1
  - riduzione35: 0
  - haRedditoDipendente: 0
  - primoAnno: no
Anno: 2026 (parametri ufficiali: minimale 18.808, contribFissi 4.521,36, aliquota 24%)
Ricavi incassati 2026: 50.000 €
```

- [ ] **Step 2: Calcolo a mano**

Segui il formato della skill:

```
Ricavi: 50.000,00
Imponibile: 50.000 × 67% = 33.500,00
Eccedenza minimale: 33.500 - 18.808 = 14.692,00
cF: 4.521,36
cV: 14.692 × 24% = 3.526,08
cT: 4.521,36 + 3.526,08 = 8.047,44
Imposta sost.: max((33.500 - 8.047,44) × 15%, 0) = 25.452,56 × 15% = 3.817,88
Netto: 50.000 - 8.047,44 - 3.817,88 = 38.134,68
Incidenza: (50.000 - 38.134,68) / 50.000 = 23,73%
```

Ricontrolla i numeri.

- [ ] **Step 3: Confronta col codice**

Esegui mentalmente `calcForfettarioValues(50000, settings, 2026)`:
- `coeff = 0.67`, `imp = 0.15`
- `imponibile = 50000 * 0.67 = 33500`
- `calcInpsContributions(33500, settings, 2026)`:
  - `mode = 'artigiani_commercianti'`
  - `cF = 4521.36`
  - `minimale = 18808`
  - `eccedenza = max(33500 - 18808, 0) = 14692`
  - `cV = 14692 * 0.24 = 3526.08`
  - `cT = 4521.36 + 3526.08 = 8047.44`
- `tasse = max((33500 - 8047.44) * 0.15, 0) = 3817.884`
- `n = 50000 - 8047.44 - 3817.884 = 38134.676`

Confronto:
- Tasse: 3.817,88 (mano) vs 3.817,884 (codice) — delta < 0,01 ✓
- Netto: 38.134,68 (mano) vs 38.134,68 (codice, dopo arrotondamento) ✓

Esito atteso: ✓.

- [ ] **Step 4: Verifica `buildForfettarioScenario`**

Costruisci input per `buildForfettarioScenario`:
- `year: 2026`
- `method: 'storico'`
- `settings: {coefficiente: 67, impostaSostitutiva: 15}`
- `grossCollected: 50000`
- `currentContribution: { mode: 'artigiani_commercianti', fixedAnnual: 4521.36, saldoAccontoBase: 3526.08 }`
- `previousContribution: { mode: 'artigiani_commercianti', fixedAnnual: 4460.64 (2025), saldoAccontoBase: <da scenario 2025> }`

Per B1 isolato (no dato 2025), assumi `previousContribution = currentContribution` per semplicità del confronto.

Verifica che:
- `forfettarioGrossIncome = 33500`
- `deductibleContributionsPaid = previousFixedTail + currentFixedWithinYear + previousContributionSaldo + contributionAcconti.total`
  - `previousFixedTail = 4460.64 / 4 = 1115.16` (4° rata 2025 pagata feb 2026)
  - `currentFixedWithinYear = 4521.36 * 3/4 = 3391.02` (rate 1-3 2026)
  - `previousContributionSaldo` = saldo contributi variabili 2025 (in B1 isolato, assumi 0)
  - `contributionAcconti` = acconti su `saldoAccontoBase = 3526.08` → mode='double', first=1410.43, second=2115.65, total=3526.08
  - Totale: 1115.16 + 3391.02 + 0 + 3526.08 = 8.032,26

Confronto col `cT` di `calcForfettarioValues`: 8.047,44 vs 8.032,26.

**Differenza: 15,18 €.** Questa è la "doppia logica competenza vs cassa" prevista dal spec:
- `calcForfettarioValues` deduce `cF + cV` calcolati per competenza 2026 (4.521,36 + 3.526,08).
- `buildForfettarioScenario` deduce per cassa: 3 rate fisse 2026 + 4° rata 2025 (che ammonta a 4.460,64/4 = 1.115,16, non 4.521,36/4 = 1.130,34).

La differenza è 4.521,36 - 4.460,64 / 4 effetto = (4521.36 - 4460.64) / 4 = 15,18 €. **Spiegabile**, severity cosmetico. Documenta nello spec.

Attenzione: in B1 ho assunto `previousContributionSaldo = 0`. Se questa assunzione non è realistica (in produzione c'è quasi sempre un saldo precedente), il confronto va rifatto su scenario realistico in B6.

- [ ] **Step 5: Aggiorna spec con sotto-sezione B1**

Aggiungi nella sezione `## Step B — Risultati` una sotto-sezione B1 con:
- Input
- Calcolo a mano (output di Step 2)
- Risultato codice (output di Step 3 e 4)
- Delta e esito (✓ / ✗)
- Eventuali issues raccolte

### Task B2: Scenario Commerciante con riduzione 35% 2026

**Files:** stessi di B1, sezione spec B2

- [ ] **Step 1: Input**

```
Input:
  - coefficiente: 40 (commercio dettaglio, ATECO 47.x)
  - inpsCategoria: commerciante
  - riduzione35: 1
Anno: 2026 (commerciante: minimale 18.808, contribFissi 4.611,63, aliquota 24,48%)
Ricavi: 30.000 €
```

- [ ] **Step 2: Calcolo a mano**

```
Imponibile: 30.000 × 40% = 12.000,00
Eccedenza: max(12.000 - 18.808, 0) = 0
cF (lordo): 4.611,63
cV (lordo): 0
cF ridotto: 4.611,63 × 0,65 = 2.997,56
cV ridotto: 0
cT ridotto: 2.997,56
Imposta sost.: max((12.000 - 2.997,56) × 15%, 0) = 9.002,44 × 15% = 1.350,37
Netto: 30.000 - 2.997,56 - 1.350,37 = 25.652,07
```

- [ ] **Step 3: Confronta col codice**

`calcForfettarioValues(30000, {...riduzione35:1, inpsCategoria:'commerciante'...}, 2026)`:
- `imponibile = 12000`
- `cF = 4611.63`, `cV = 0`, `cT = 4611.63`
- `rid = 0.65` (riduzione35==1 e art/com)
- `cFR = 2997.56`, `cVR = 0`, `cTR = 2997.56`
- `tasseR = max((12000 - 2997.56) * 0.15, 0) = 1350.366`
- `nR = 30000 - 2997.56 - 1350.37 = 25652.07`

Confronto: ✓ (delta < 0,01).

NB importante: verifica che `getAppliedForfettarioValues` (`app.js:1499`) selezioni `tasseR` invece di `tasse` quando `riduzione35==1`. Leggi quella funzione e assicurati che la selezione avvenga.

- [ ] **Step 4: Aggiorna spec con sotto-sezione B2**

### Task B3: Scenario Gestione separata 2026

**Files:** stessi di B1, sezione spec B3

- [ ] **Step 1: Input**

```
Input:
  - coefficiente: 78 (servizi professionali)
  - inpsMode: gestione_separata
  - aliqContributi gestione separata 2026: ASSUNTO 26,07% (verifica in Task A2)
  - riduzione35: N/A (non si applica a gest.sep.)
Ricavi: 40.000 €
```

- [ ] **Step 2: Calcolo a mano**

```
Imponibile: 40.000 × 78% = 31.200,00
cF: 0 (gest.sep. non ha contributi fissi)
cV: 31.200 × 26,07% = 8.133,84
cT: 8.133,84
Imposta sost.: max((31.200 - 8.133,84) × 15%, 0) = 23.066,16 × 15% = 3.459,92
Netto: 40.000 - 8.133,84 - 3.459,92 = 28.406,24
```

- [ ] **Step 3: Confronta col codice**

`calcInpsContributions(31200, {...inpsMode:'gestione_separata', aliqContributi:26.07...}, 2026)`:
- `mode = 'gestione_separata'`
- `aliquota = 0.2607`
- `cV = 31200 * 0.2607 = 8133.84`
- Return: `{ mode: 'gestione_separata', cF: 0, cV: 8133.84, cT: 8133.84, imponibile: 31200 }`

Verifica che NON ci siano `minimale` o `eccedenza` applicati per gest.sep. — corretto, il codice ritorna early dopo `if (mode === 'gestione_separata')`.

`calcForfettarioValues(40000, settings, 2026)`:
- Tasse: max((31200 - 8133.84) * 0.15, 0) = 3459.924 → ✓
- Netto: 40000 - 8133.84 - 3459.92 = 28406.24 → ✓

NB: se in Task A2 trovi che l'aliquota gest.sep. nel codice è diversa da 26,07% per il 2026, refit B3 con il valore corretto.

- [ ] **Step 4: Aggiorna spec con sotto-sezione B3**

### Task B4: Scenario Anno chiuso 2024 con cross-year

**Files:**
- Read: `app.js` (cerca `getCrossYearInvoices`, `getCrossYearInvoicesForYear`, `getTotalAnnuoForYear`, `getMonthEuroFromYearData`)
- Update: spec doc B4

- [ ] **Step 1: Setup mentale dei dati**

Costruisci uno yearData sintetico per 2024:
```javascript
data2024 = {
  settings: { regime: 'forfettario', coefficiente: 67, ... },
  fatture: {
    11: [{ importo: 5000, pagMese: 11, pagAnno: 2024, desc: 'incassata 2024' }],
    12: [{ importo: 3000, pagMese: 1, pagAnno: 2025, desc: 'cross-year' }]
  }
}
```

E per 2025:
```javascript
data2025 = { settings: {...}, fatture: { 1: [], ... } }
```

Aspettativa:
- `getTotalAnnuoForYear(2024)` deve includere SOLO la fattura di novembre (5000), non quella di dicembre (incassata 2025).
- `getCrossYearInvoicesForYear(2025)` deve restituire la fattura cross-year (3000), in modo che `getTotalAnnuoForYear(2025)` la includa.

- [ ] **Step 2: Verifica logica `getMonthEuroFromYearData`**

Leggi la funzione (~`app.js:1426`). La condizione chiave:
```javascript
if (f.importo > 0 && f.pagAnno && f.pagAnno !== year) continue;
```

Esegui mentalmente per la fattura di dicembre 2024 con `pagAnno = 2025`:
- `f.importo = 3000 > 0` ✓
- `f.pagAnno = 2025` (truthy) ✓
- `f.pagAnno !== year (2024)` → `true` → CONTINUE (skip)

Quindi NON viene contata nel 2024. ✓ corretto.

- [ ] **Step 3: Verifica logica `getCrossYearInvoicesForYear`**

Cerca la funzione con Grep su `app.js`. Leggila. Verifica che per `getCrossYearInvoicesForYear(2025)` il loop guardi negli anni precedenti (es. 2024) e raccolga le fatture con `pagAnno === 2025`.

Se la funzione esiste e fa quello, ✓.

- [ ] **Step 4: Aggiorna spec con sotto-sezione B4**

### Task B5: Scenario Primo anno 2026 senza storico

**Files:**
- Read: `app.js:4492` (`buildForfettarioScheduleForYear`), `tax-engine.js:528` (`buildForfettarioScenario`), spec CLAUDE.md sezione "First-Year Onboarding"
- Update: spec doc B5

- [ ] **Step 1: Setup mentale**

Profilo Demo, anno 2026, nessun dato 2025 in localStorage. Settings 2026:
```
coefficiente: 67, impostaSostitutiva: 15, inpsCategoria: artigiano, usaInpsUfficiale: 1
primoAnnoFatturatoPrec: 20000
primoAnnoImpostaPrec: 1500
primoAnnoAccontiImpostaPrec: 0
primoAnnoContribVariabiliPrec: 800
primoAnnoAccontiContribPrec: 0
```

Aspettativa: `buildForfettarioScheduleForYear(2026)` produce:
- Saldo imposta sost. 2025: 1.500 - 0 = 1.500 € (entro 30/6/2026)
- 1° acconto 2026: 1.500 × 40% = 600 € (entro 30/6/2026)
- 2° acconto 2026: 1.500 × 60% = 900 € (entro 30/11/2026)
- Saldo contributi 2025: 800 - 0 = 800 € (entro 30/6/2026)
- Acconti contributi 2026: base 800, soglie sotto 257,52 → unica rata novembre 800 €? oppure split? **Verifica!** 800 > 257.52, quindi split 40/60: 320 + 480.

- [ ] **Step 2: Leggi `buildForfettarioScheduleForYear`**

Apri `app.js:4492`. Cerca dove vengono usati i settings `primoAnno*`. Verifica che il fallback funzioni: se `loadYearData(2025)` ritorna null o yearData vuoto, allora i `primoAnno*` settings vengono usati come `previousTaxBase` e `previousContributionAccontiPaid` per il calcolo.

- [ ] **Step 3: Verifica numeri attesi**

Probabili posizioni del fallback:
- Costruzione di `previousTaxBase`: deve usare `s.primoAnnoImpostaPrec` se non c'è 2025.
- Costruzione di `previousContribution.saldoAccontoBase`: deve usare `s.primoAnnoContribVariabiliPrec`.
- Costruzione di `previousContributionAccontiPaid`: deve usare `s.primoAnnoAccontiContribPrec`.

Se i nomi/uso non corrispondono → issue medio.

- [ ] **Step 4: Aggiorna spec con sotto-sezione B5**

### Task B6: Scenario Transizione regime 2025 ord → 2026 forf

**Files:**
- Read: `tax-engine.js:494-526` (`buildTransitionDiagnostics`), `tax-engine.js:604-661` (`buildForfettarioMethodComparison`), `scadenziario-engine.js:433-461` (`chooseMethodPolicy`)
- Update: spec doc B6

- [ ] **Step 1: Setup mentale**

```
data2025 = { settings: { regime: 'ordinario', haRedditoDipendente: 1 } }
data2026 = { settings: { regime: 'forfettario', ... } }
```

- [ ] **Step 2: Esegui `buildTransitionDiagnostics`**

Input:
```javascript
{ year: 2026, currentSettings: data2026.settings, previousSettings: data2025.settings }
```

Output atteso:
- `currentRegime: 'forfettario'`
- `previousRegime: 'ordinario'`
- `previousHadEmployeeIncome: true`
- `isRegimeTransition: true`
- `warnings`: 3 warning (transizione regime + redditi misti + non forfettario puro)
- `facts`: 2 fatti

Verifica che il codice produca esattamente questi.

- [ ] **Step 3: Esegui `chooseMethodPolicy`**

Input:
```javascript
{ previousYearType: 'ordinario', previousYearComplete: true, isClosedYear: false }
```

Output atteso:
- `recommendedMethod: 'previsionale'`
- `methodWarning: 'L anno precedente non e un forfettario puro: storico disponibile ma sconsigliato come base automatica.'`
- `methodConfidence: 'warning'`

- [ ] **Step 4: Verifica integrazione UI**

Cerca dove `chooseMethodPolicy` viene invocato. Verifica che il warning emerga effettivamente nello scadenziario UI (almeno via `comparison.warnings`). Se il warning resta solo in struttura dati ma non viene mostrato → issue cosmetico.

- [ ] **Step 5: Aggiorna spec con sotto-sezione B6**

### Task B7: Scenario Ordinario gest. separata 2026 (smoke)

**Files:**
- Read: `app.js:1818` (`calcOrdinarioValues`)
- Update: spec doc B7

- [ ] **Step 1: Input**

```
regime: ordinario, fatturato 60.000 €, spese deducibili 5.000 €, gestione separata, no riduzione
```

- [ ] **Step 2: Verifica smoke (non TDD pieno)**

Esegui `calcOrdinarioValues(60000, 5000, settings, 2026)` mentalmente. Verifica solo:
- Output non lancia eccezioni.
- `tasse` (IRPEF) > 0 e < 60.000.
- `cT` > 0.
- `netto > 0` e `netto + tasse + cT ≈ 60.000` (con tolleranza per arrotondamenti).
- `inpsMode === 'gestione_separata'` riconosciuto.

Non controllo accuratamente lo scaglione IRPEF. Se uno dei check sopra fallisce → issue.

- [ ] **Step 3: Aggiorna spec con sotto-sezione B7**

### Task B8: Commit Phase B

**Files:**
- Update: spec doc

- [ ] **Step 1: Verifica completezza spec**

Sezione `## Step B — Risultati` deve avere 7 sotto-sezioni (B1-B7) con input, calcolo a mano, risultato codice, esito.

- [ ] **Step 2: Aggiungi sintesi**

```markdown
**Sintesi Step B**: 7 scenari eseguiti, X conformi, Y discrepanze (Z critiche, W medie, V cosmetiche). Lista completa in "Issues raccolte".
```

- [ ] **Step 3: Decisione Step C**

Se in `## Issues raccolte` c'è almeno una issue **critica** → procedi alla Phase C.
Se solo medie/cosmetiche o nessuna → salta la Phase C, vai direttamente alla Phase D.

Annota la decisione nello spec come "Decisione: Step C [eseguito/saltato] perché [motivo]".

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-17-audit-calcoli-design.md
git commit -m "docs(audit): complete Step B — 7 scenari simulati

Scenari forfettario B1-B6 + smoke ordinario B7. Risultati e issues
nella sezione Step B. Decisione Step C: [eseguito/saltato].

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase C — Test harness (CONDIZIONALE)

**Eseguito solo se Phase B ha trovato almeno una issue critica.** Se saltata, vai direttamente alla Phase D.

### Task C1: Aggiungi regression test per il bug critico

**Files:**
- Create or modify: `tests/tax-engine.test.js` o `tests/scadenziario-engine.test.js` o nuovo `tests/audit-regression.test.js` (decidi in base al modulo bacato)
- Create: `tests/scenarios.fixtures.js` (se non esiste già qualcosa di simile in `tests/fixtures/`)

- [ ] **Step 1: Identifica il bug specifico**

Apri lo spec, leggi la prima issue critica nella sezione `## Issues raccolte`. Estrai:
- Funzione bacata (es. `buildAccontoPlan`, `calcInpsContributions`)
- Input che riproduce il bug
- Output osservato
- Output atteso

- [ ] **Step 2: Decidi dove va il test**

- Se la funzione è in `tax-engine.js` → estendi `tests/tax-engine.test.js`.
- Se è in `scadenziario-engine.js` → estendi `tests/scadenziario-engine.test.js`.
- Se è in `app.js` → due opzioni:
  - **C1a** Estrai la funzione minimale in nuovo file `calc-core.js` (UMD pattern come `tax-engine.js`), includila in `index.html`, e crea `tests/calc-core.test.js`.
  - **C1b** Lascia il bug "spec-only" e segnala che richiede refactor estrattivo (issue separata).

Per default usa C1a. Solo se l'estrazione richiede toccare più di 50 righe di `app.js`, opta per C1b e ferma la Phase C.

- [ ] **Step 3: Scrivi il test (failing)**

Esempio (adatta al bug effettivo):
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const TaxEngine = require('../tax-engine.js');

test('REGRESSION: <descrizione bug>', () => {
  const result = TaxEngine.<funzione>(<input dal bug>);
  assert.equal(result.<campo>, <valore atteso>);
});
```

- [ ] **Step 4: Esegui per verificare che fallisca**

```bash
cd "C:\Users\rossima\OneDrive - TXT e-solutions S.p.A\02_Sviluppo\Applicazioni_interne\Calcoli vari"
npm test
```

Atteso: il nuovo test FALLISCE. Se invece passa, allora il bug non è riproducibile come pensato — riapri lo spec e marca l'issue come "non riproducibile" o rivedi il calcolo a mano.

- [ ] **Step 5: NON correggere il bug**

Phase C produce solo il test rosso. Il fix avviene in un piano separato dopo l'approvazione utente delle issues. Lascia il test in stato `test.skip(...)` con una nota:

```javascript
test.skip('REGRESSION: <descrizione> — fix in plan TBD', () => { ... });
```

Oppure usa `test.todo(...)` se preferisci.

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "test(audit): add skipped regression test for <bug name>

Test riproduce il bug critico identificato in Step B (issue ISS-Bx).
Lasciato in test.skip in attesa del fix in piano separato.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task C2 (e successivi): ripeti per ogni issue critica

Una task per ogni issue critica trovata in Step B. Stessi step di C1 con input/funzione/atteso adattati. Se ci sono N issues critiche, avrai task C1 ... C(N).

---

## Phase D — Wrap-up e approvazione

### Task D1: Presenta il summary all'utente

**Files:**
- Update: spec doc (sezione finale)

- [ ] **Step 1: Aggiungi sezione "Summary finale" allo spec**

In fondo allo spec aggiungi:

```markdown
## Summary finale audit

**Conformità globale**: X/35 voci conformi (28 parametri + 7 scenari).

**Issues raccolte**:
- Critiche: N (lista ID)
- Medie: M (lista ID)
- Cosmetiche: K (lista ID)

**Test regression aggiunti**: N (in `test.skip`, in attesa di fix).

**Prossimi passi consigliati**:
1. Approvazione utente sulle issues da fixare.
2. Per ogni gruppo di fix, piano separato (es. `2026-04-17-fix-issues-critiche.md`).
3. Una volta applicati i fix, sblocca i `test.skip` → `test`.
```

- [ ] **Step 2: Commit finale**

```bash
git add docs/superpowers/specs/2026-04-17-audit-calcoli-design.md
git commit -m "docs(audit): close audit calcoli with summary and next steps

Vedi sezione 'Summary finale audit' nello spec.
Audit chiuso: pronto per approvazione utente sulle issues e
pianificazione dei fix.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 3: Output sintetico per l'utente**

Fai un report all'utente in 5-10 righe:
- Numero issues per severity.
- Le 3 issues più critiche (titolo + 1 riga di spiegazione).
- Cosa serve da lui: approvazione lista issues e priorità di fix.
- Path al spec aggiornato.

NB: questo step NON è una azione di codice — è un messaggio testuale finale al utente. Non fare commit qui.

---

## Note operative finali

- **Niente fix di bug in questo plan**. I fix vanno in piani separati creati DOPO l'approvazione utente sulle issues.
- **Test regression rimangono skipped** finché non si applicano i fix.
- **Web search uso conservativo**: massimo 1-2 fetch per task A, e solo per parametri di cui non ho già conferma esplicita nel contesto.
- **Stop-condition Phase C**: se l'estrazione richiesta da un bug è troppo invasiva (>50 righe toccate in `app.js`), fermati e segnala come "fix richiede refactor estrattivo, valutare in piano separato".
