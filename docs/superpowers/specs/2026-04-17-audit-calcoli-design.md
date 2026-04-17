# Audit calcoli — Calcoli P.IVA

**Data**: 2026-04-17
**Branch**: codex/dev-newfeatures
**Sub-progetto**: 1 di 4 (verifica calcoli → dichiarazione → fattura → UX)

## Obiettivo

Verificare che il motore di calcolo fiscale produca numeri corretti su tutti gli scenari forfettario realistici per il 2026 e per gli anni chiusi 2024-2025. Identificare ogni discrepanza tra il codice e la normativa italiana vigente, classificarla per severity, e proporre fix puntuali. Ordinario coperto solo da smoke check.

## Vincoli

- Niente fix prima dell'approvazione finale dello spec.
- Ogni categoria di fix → commit separato.
- Nessuna nuova dipendenza npm.
- Nessuna refactor non strettamente necessaria all'audit.
- Skill `commercialista-fiscale` come fonte di metodologia (formato output, regole, separazione competenza/cassa/imposta/contributi/netto).

## Scope

### In scope

- **Regimi**: Forfettario (artigiani/commercianti + gestione separata, con/senza riduzione 35%, primo anno).
- **Anni**: 2024 e 2025 (chiusi), 2026 (corrente).
- **Profili di riferimento**: Mattia (anno corrente con dati reali), Demo (anno vuoto / primo anno), Peru (veterano forfettario — da confermare leggendo i seed).
- **File toccati**: `tax-engine.js`, `scadenziario-engine.js`, `app.js` (sezioni di calcolo), `tests/`.

### Smoke only

- Regime ordinario: 1 scenario (gestione separata, 2026), verifica solo che i numeri siano nell'ordine di grandezza atteso.

### Fuori scope

- Dichiarazione dei redditi (Quadro LM, RR) — sub-progetto 2.
- Fatturazione elettronica e XML SdI — sub-progetto 3.
- UI/UX — sub-progetto 4.
- Anni 2020-2023 (storici troppo lontani per essere materialmente rilevanti).

## Approccio (D + B + C)

L'audit procede in 3 step con stop opzionale dopo ogni step se non emerge nulla di critico:

1. **Step A — Checklist parametri normativi**: confronto valori hardcoded vs fonti ufficiali.
2. **Step B — Scenari di simulazione**: 7 scenari calcolati a mano e confrontati col codice.
3. **Step C — Test harness**: estende i test `tests/` esistenti con regression test sugli scenari di B.

**Severity**:
- **Critico** = errore di calcolo che cambia l'importo dovuto al fisco / INPS.
- **Medio** = comportamento che diverge dalla normativa ma non altera l'importo (es. label sbagliata, codice tributo errato in guida F24, data di scadenza off-by-one).
- **Cosmetico** = note di documentazione, ambiguità di naming, ecc.

## Step A — Checklist parametri normativi

Confronto i valori costanti nel codice contro le fonti ufficiali. Per ogni parametro: valore attuale (file:linea), valore atteso, fonte, esito (✓ / ✗ / N/A).

| # | Parametro | Riferimento codice | Fonte di verità |
|---|---|---|---|
| A1 | Minimale INPS art/com 2024 | `app.js:285` (18.415) | Circolare INPS 2024 |
| A2 | Minimale INPS art/com 2025 | `app.js:290` (18.555) | Circolare INPS 2025 |
| A3 | Minimale INPS art/com 2026 | `app.js:295` (18.808) | Circolare INPS 2026 |
| A4 | Contributi fissi artigiano 2024-2026 | `app.js:285-298` | Circolari INPS |
| A5 | Contributi fissi commerciante 2024-2026 | `app.js:285-298` | Circolari INPS |
| A6 | Aliquota artigiano (24,00%) | `app.js:267,272,277,282,287,292,297` | Circolari INPS |
| A7 | Aliquota commerciante (24,48%) | `app.js:268,273,278,283,288,293,298` | Circolari INPS |
| A8 | Massimale contributivo INPS art/com | da localizzare durante l'audit | Circolare INPS |
| A9 | Aliquote gestione separata 2024-2026 | da localizzare (probabili sedi: `getDefaultSettings`, `PROFILE_FISCAL_LIBRARY`) | Circolari INPS |
| A10 | Soglia acconto 51,65 € | `tax-engine.js:13`, `app.js:572` | Art. 17 DPR 435/2001 |
| A11 | Soglia unica rata 257,52 € | `tax-engine.js:14`, `app.js:573` | Art. 17 DPR 435/2001 |
| A12 | Pesi acconto 40/60 | `tax-engine.js:14`, `app.js:579` | Art. 17 DPR 435/2001 |
| A13 | Saldo + 1° acconto 30/6 | `app.js:574-575` | Calendario fiscale |
| A14 | 2° acconto 30/11 | `app.js:576-577` | Calendario fiscale |
| A15 | INPS fissi 16/5, 20/8, 16/11, 16/2 | `app.js:578` | Calendario INPS |
| A16 | Soglia bollo 77,47 € | `app.js:323` | DM 17/6/2014 |
| A17 | Importo bollo 2,00 € | `app.js:324` | DM 17/6/2014 |
| A18 | Date bollo (31/5, 30/9, 30/11, 28/2) | `app.js:326-329` | DM 4/12/2020 |
| A19 | Codice tributo 1790 (1° acc imposta sost.) | `app.js:367` `F24_GUIDE.imposta_acc1` | Risoluzione AdE 60/E/2015 |
| A20 | Codice tributo 1791 (2° acc imposta sost.) | `app.js:382` | Risoluzione AdE 60/E/2015 |
| A21 | Codice tributo 1792 (saldo imposta sost.) | `app.js:349` | Risoluzione AdE 60/E/2015 |
| A22 | Codici bollo 2521-2524 | `app.js:326-329`, `app.js:489` | Risoluzione AdE 42/E/2019 |
| A23 | Codice 3850 camera commercio | `app.js:469` | Risoluzione AdE |
| A24 | Coefficienti redditività ATECO | da localizzare (probabili sedi: `coefficiente`, `PROFILE_FISCAL_LIBRARY`) | DM 23/1/2015 + agg. |
| A25 | Aliquota imposta sostitutiva 5% start-up / 15% | da localizzare (probabili sedi: `impostaSostitutiva`) | L. 190/2014 |
| A26 | INAIL minimale rendita 2024-2026 | `app.js:303-307` | Circolare INAIL |
| A27 | Formula INAIL (base × tasso‰ × 1,01) | `app.js:317` | Norme INAIL |
| A28 | Riduzione 35% applicata sia a cF sia a cV | `app.js:1469` `cFR = cF*rid, cVR = cV*rid` | L. 145/2018 art. 1 c. 20 |

**Output Step A**: tabella `## Step A — Risultati` da popolare durante l'audit con colonne `Atteso | Trovato | Esito`.

## Step B — Scenari di simulazione

Per ogni scenario eseguo il calcolo a mano nel formato della skill `commercialista-fiscale` (Scenario / Regole / Calcolo passo-passo / Riepilogo / Punti da verificare), poi confronto col risultato del codice. Mismatch ≥ 1 € → issue.

### Scenari forfettario

**B1 — Artigiano puro 2026**
- Input: coefficiente 67%, fatturato incassato 50.000 €, INPS artigiano ufficiale 2026 (minimale 18.808, fissi 4.521,36, aliquota 24%), no riduzione 35%, no primo anno, no redditi dipendenti.
- Verifica: `calcForfettarioValues` → imponibile, cF, cV, tasse, netto. `buildForfettarioScenario` → contributi per cassa, acconti.

**B2 — Commerciante con riduzione 35% 2026**
- Input: coefficiente 40%, fatturato 30.000 €, INPS commerciante 2026 (fissi 4.611,63, aliquota 24,48%), riduzione 35% attiva.
- Verifica: cFR = cF × 0,65 e cVR = cV × 0,65 (entrambe ridotte).

**B3 — Gestione separata 2026**
- Input: coefficiente 78%, fatturato 40.000 €, regime gestione separata.
- Verifica: cF = 0, cV = imponibile × aliquota gest.sep. Nessun minimale, nessuna riduzione 35%.

**B4 — Anno chiuso 2024 con cross-year**
- Input: fatture emesse a dicembre 2024 con `pagAnno = 2025`.
- Verifica: `getTotalAnnuoForYear(2024)` non include le fatture incassate nel 2025; `getCrossYearInvoicesForYear(2025)` le include nel 2025.

**B5 — Primo anno 2026 senza storico**
- Input: nessun dato 2025 in localStorage, settings `primoAnnoFatturatoPrec = 20.000`, `primoAnnoImpostaPrec = 1.500`, `primoAnnoAccontiImpostaPrec = 0`, `primoAnnoContribVariabiliPrec = 800`, `primoAnnoAccontiContribPrec = 0`.
- Verifica: `buildForfettarioScheduleForYear(2026)` usa i valori `primoAnno*` come fallback per saldo 2025 e per la base storica acconti 2026.

**B6 — Transizione regime 2025 ordinario → 2026 forfettario**
- Input: `loadYearData(2025).settings.regime = 'ordinario'`, 2026 forfettario.
- Verifica: `buildTransitionDiagnostics` produce warning; `buildForfettarioMethodComparisonForYear` segnala che lo storico non è forfettario puro; il metodo previsionale viene preferito.

### Scenario ordinario (smoke)

**B7 — Ordinario gest. separata 2026**
- Input: regime ordinario, fatturato 60.000 €, spese deducibili 5.000 €, gestione separata.
- Verifica solo: IRPEF calcolata su (reddito − contributi), netto > 0, totale (tasse + contributi) < fatturato, nessuna eccezione runtime.

### Aree di validazione trasversali (per tutti gli scenari)

- **Soglie acconto**: tutti e 3 i casi (< 51,65 / [51,65; 257,52) / ≥ 257,52) coperti tra B1-B6.
- **Saldo**: dovuto = totale anno − acconti versati. Se negativo, `paymentStatus.code === 'credit'`.
- **Doppia logica competenza/cassa** (`calcForfettarioValues` vs `buildForfettarioScenario`):
  - Test concreto: in B1 (artigiano puro, no cross-year, no primo anno, contributi tutti pagati entro l'anno) i due numeri di "contributi totali deducibili" devono coincidere a meno di 0,02 € (errore di arrotondamento). Se non coincidono → bug critico.
  - Se in scenari più complessi (B4, B5, B6) la differenza è spiegabile dalla diversa semantica (competenza vs cassa) → la marco come "comportamento da documentare in CLAUDE.md", severity cosmetico.
  - Se invece la differenza è inspiegabile → bug critico.

**Output Step B**: una sotto-sezione per scenario con tabella "Calcolo a mano vs Codice" e delta. Issues raccolte nella sezione finale.

## Step C — Test harness automatizzato

**Eseguito solo se Step A o B trovano almeno un bug critico** (coerente con l'opzione D scelta dall'utente: stop dopo ogni step se nulla di critico). Bug medi e cosmetici vanno comunque nello spec ma non triggherano lo Step C.

**Infrastruttura già presente**:
- Runner: `node --test` (built-in, nessuna nuova dipendenza).
- Comando: `npm test` già configurato in `package.json`.
- File esistenti: `tests/tax-engine.test.js`, `tests/scadenziario-engine.test.js`, `tests/scadenziario-regression.test.js`, `tests/profile-settings-regression.test.js`, `tests/fixtures/`.

**Approccio**:
- Estendo i file esistenti, non ne creo di nuovi inutilmente.
- Aggiungo `tests/scenarios.fixtures.js` con i 7 scenari di Step B come oggetti `{nome, input, expected}`.
- Aggiungo test in `tests/tax-engine.test.js` per `buildAccontoPlan` (3 soglie: < 51,65 / [51,65; 257,52) / ≥ 257,52).
- Aggiungo test che invocano `buildForfettarioScenario` con i dati di B1-B6, passando i valori di `currentContribution` e `previousContribution` calcolati a mano nel fixture (così il test non dipende da `calcInpsContributions` di `app.js`).
- Per le funzioni di calcolo dentro `app.js` (`calcForfettarioValues`, `calcInpsContributions`, `calcBolloPerQuarter`):
  - Estrazione opzionale: solo se un bug trovato in Step B richiede una regression test e la funzione non è raggiungibile da Node.
  - Se necessaria, estrazione in `calc-core.js` come UMD (stesso pattern di `tax-engine.js`), incluso in `index.html` con `<script>`. Nessuna modifica al comportamento, solo cut/paste + re-export.

**Cosa non testo in questa fase**:
- Rendering UI / DOM.
- Firebase sync.
- `buildForfettarioScheduleForYear` end-to-end (è in `app.js`, troppo legato a globali; eventuale fase 2).

## Output e governance

### Spec finale

Questo documento, aggiornato dopo ogni step con i risultati. Le sezioni `## Step A — Risultati`, `## Step B — Risultati`, `## Issues raccolte` vengono popolate nel corso dell'audit.

### Issues

Tabella in `## Issues raccolte`:

| ID | Step | Severity | Descrizione | File:linea | Fix proposto |
|----|------|----------|-------------|------------|--------------|

### Commit strategy

- 1° commit: solo questo spec doc (alla fine del brainstorming, prima di iniziare l'audit).
- Durante l'audit: nessun commit, lo spec viene aggiornato in working directory e committato in batch.
- Dopo l'approvazione delle issues:
  - 1 commit per fix delle costanti (Step A).
  - 1 commit per fix di logica (Step B).
  - 1 commit per nuovi test (Step C, se presente).
  - 1 commit finale per aggiornamento dello spec con esito ("audit chiuso").

### Stima tempi

- Step A: 30-45 min.
- Step B: 1,5-2 h.
- Step C: 1-2 h se necessario.
- Aggiornamento spec + self-review + commit: 30 min.

## Decisioni rinviate

Da popolare durante l'audit. Esempi attesi:
- "Doppia logica competenza/cassa: documentare in CLAUDE.md o consolidare in unica API?"
- "Coefficienti ATECO: caricare da JSON esterno o lasciare nel codice?"
