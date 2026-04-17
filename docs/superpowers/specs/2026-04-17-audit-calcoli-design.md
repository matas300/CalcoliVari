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

## Step A — Risultati

Verifiche eseguite il 2026-04-17. Fonti ufficiali: Circ. INPS 33/2024 (07-02-2024), Circ. INPS 38/2025 (07-02-2025), Circ. INPS 14/2026 (09-02-2026) — tutte pubblicate e consultabili su inps.it.

**Sintesi Step A**: 28 parametri verificati — 23 conformi (✓), 1 non conforme (✗ ISS-A8 massimale gest. sep.), 4 da rivedere (⚠ ISS-A9 aliquota gest. sep., ISS-A24 tabella ATECO, ISS-A25 agevolazione start-up, ISS-A26 minimale INAIL 2025/2026). Issues totali raccolte: **1 critica**, **5 medie**, **1 cosmetica**. Nessun bug bloccante sui parametri standard forfettario artigiano/commerciante (A1-A7, A10-A18 tutti ✓).

### Tabella risultati A1–A7 e A28

Gli ID seguono la numerazione della checklist alla sezione precedente. La colonna "Trovato (codice)" riporta i valori raw così come appaiono nel sorgente JS (senza formattazione italiana).

| # | Parametro | Atteso (fonte) | Trovato (codice) | Esito |
|---|---|---|---|---|
| A1 | Minimale INPS art/com 2024 | 18.415,00 (Circ. INPS 33/2024) | 18415 (`app.js:286`) | ✓ |
| A2 | Minimale INPS art/com 2025 | 18.555,00 (Circ. INPS 38/2025) | 18555 (`app.js:291`) | ✓ |
| A3 | Minimale INPS art/com 2026 | 18.808,00 (Circ. INPS 14/2026) | 18808 (`app.js:296`) | ✓ |
| A4 | Contributi fissi artigiano 2024-2026 | 4.427,04 / 4.460,64 / 4.521,36 (Circ. INPS 33/2024, 38/2025, 14/2026) | 4427.04 / 4460.64 / 4521.36 (`app.js:287,292,297`) | ✓ |
| A5 | Contributi fissi commerciante 2024-2026 | 4.515,43 / 4.549,70 / 4.611,63 (Circ. INPS 33/2024, 38/2025, 14/2026) | 4515.43 / 4549.70 / 4611.63 (`app.js:288,293,298`) | ✓ |
| A6 | Aliquota artigiano 2024-2026 | 24,00% (Circ. INPS 33/2024, 38/2025, 14/2026) | 24.0 (`app.js:287,292,297`) | ✓ |
| A7 | Aliquota commerciante 2024-2026 | 24,48% (Circ. INPS 33/2024, 38/2025, 14/2026) | 24.48 (`app.js:288,293,298`) | ✓ |
| A28 | Riduzione 35% applicata sia a cF sia a cV | Entrambi ridotti: `cFR = cF × 0,65`, `cVR = cV × 0,65` (L. 145/2018 art. 1 c. 20) | `const rid = ... ? 0.65 : 1; const cFR = cF * rid, cVR = cV * rid` (`app.js:1468-1469`) | ✓ |

### Note

- **Circolare 2024**: il task prompt citava "Circ. INPS 33/2024"; la ricerca ha confermato l'esistenza di sia Circ. 24/2024 (30-01-2024) sia Circ. 33/2024 (07-02-2024). La n. 33 è quella con i valori definitivi della contribuzione — coerente col riferimento del task.
- **Anno 2026**: la Circ. INPS 14/2026 del 09-02-2026 è pubblicata; i valori 2026 non sono "da rivedere" ma verificati.
- **Riduzione 35%**: la variabile `rid` viene calcolata una volta e moltiplicata sia a `cF` che a `cV` nella stessa istruzione (`cFR = cF * rid, cVR = cV * rid`). La logica è corretta: entrambe le componenti (fissa e variabile) vengono ridotte del 35% come previsto dalla legge.
- **Nessun issue trovato** per i parametri A1–A7 e A28.

### Tabella risultati A8–A9

| # | Parametro | Atteso (fonte) | Trovato (codice) | Esito |
|---|---|---|---|---|
| A8 | Massimale contributivo INPS gestione separata 2024-2026 | 119.650 / 120.607 / 122.295 € (Circ. INPS 24/2024, 26/2025, 8/2026) | Non applicato — `calcInpsContributions` non fa `Math.min(base, massimale)` per `gestione_separata` (`app.js:923-925`) | ✗ |
| A9 | Aliquote gestione separata 2024-2026 (liberi prof. esclusivi / pensionati) | Esclusivi: 26,07%; Pensionati/altra cassa: 24,00% (stabile 2024-2026, Circ. INPS 24/2024, 26/2025, 8/2026) | Campo unico `aliqContributi` impostabile dall'utente. Nessuna tabella `OFFICIAL_GESTIONE_SEPARATA_INPS`. Default ereditato da `OFFICIAL_ARTCOM_INPS` artigiano = 24.0 (`app.js:1066,1071`). Nessun flag "esclusivi vs altra copertura". | ⚠ |

#### Note A8–A9

- **A8 — Massimale non applicato (critico)**: il ramo `gestione_separata` in `calcInpsContributions` (`app.js:923-925`) calcola `cV = base * aliquota` senza mai cappare `base` al massimale annuo. Per un libero professionista con imponibile forfettario > 119.650 € (2024) i contributi vengono sovrastimati. Formalmente il cap è previsto dalla normativa INPS; nella pratica forfettaria il coefficiente riduce il reddito imponibile (es. 67% × fatturato), per cui il cap scatta solo per fatturati molto elevati (> ~178.000 € con coeff. 67%) — raro ma non impossibile.
- **A9 — Aliquota non ufficializzata per gest. separata (medio)**: il codice non ha una tabella analoga a `OFFICIAL_ARTCOM_INPS` per la gestione separata. Il valore di default viene letto da `OFFICIAL_ARTCOM_INPS` (artigiano = 24,0%), che però è l'aliquota dei **pensionati/altra cassa**, non quella dei **liberi professionisti esclusivi** (26,07%). Se un utente in gestione separata non modifica manualmente `aliqContributi`, la UI mostra e calcola con 24,0% invece del 26,07% corretto. Non esiste distinzione UI tra i due sottocasi. Severity: medio (il valore sbagliato porta a sottostima dei contributi; l'utente può correggerlo a mano, ma il default è fuorviante).

### Tabella risultati A10–A12

| # | Parametro | Atteso (fonte) | Trovato (codice) | Esito |
|---|---|---|---|---|
| A10 | Soglia acconto 51,65 € | ≤ 51,65 → nessun acconto dovuto (Art. 17 c. 3 DPR 435/2001) | `thresholdZero: 51.65` (`tax-engine.js:12`); `accontoThreshold: 51.65` (`app.js:572`) | ✓ |
| A11 | Soglia unica rata 257,52 € | < 257,52 → unica rata novembre (Art. 17 c. 3 DPR 435/2001) | `thresholdSingle: 257.52` (`tax-engine.js:13`); `singleAccontoThreshold: 257.52` (`app.js:573`) | ✓ |
| A12 | Pesi acconto 40/60 | 40% giugno + 60% novembre (Art. 17 c. 3 DPR 435/2001) | `weights: [40, 60]` (`tax-engine.js:14`); `fixedAccontoWeights: [40, 60]` (`app.js:579`) | ✓ |

#### Note A10–A12

- **Comparatori corretti**: `buildAccontoPlan` (`tax-engine.js:70-87`) usa `<=` sulla soglia zero (`base <= cfg.thresholdZero`) e `<` sulla soglia singola (`base < cfg.thresholdSingle`). Questa distinzione è corretta rispetto alla norma: "non superiore a 51,65 €" è inclusivo (≤), mentre "inferiore a 257,52 €" è strettamente minore (<).
- **Test mentale casi limite**:
  - `base = 51.65` → `51.65 <= 51.65` → `true` → `mode: 'none'` ✓ (nessun acconto)
  - `base = 51.66` → `51.66 <= 51.65` → `false`; `51.66 < 257.52` → `true` → `mode: 'single'` ✓
  - `base = 257.51` → `257.51 < 257.52` → `true` → `mode: 'single'` ✓
  - `base = 257.52` → `257.52 < 257.52` → `false` → `mode: 'double'` ✓ (split 40/60)
  - Tutti i casi limite sono gestiti correttamente. Nessun issue.
- **Arrotondamento**: `splitAmountByWeights` (`tax-engine.js:57-68`) converte in centesimi prima di dividere (`euroToCents` → `Math.round`) e assegna il resto all'ultima rata (`totalCents - assigned`). Questo garantisce che `first + second = base` esattamente per qualunque importo rappresentabile, senza accumulo di errori floating-point.
- **Duplicazione tax-engine vs app.js**: le stesse tre costanti (51.65, 257.52, [40, 60]) sono definite sia in `DEFAULT_ACCONTO_RULES` (`tax-engine.js:11-15`) sia in `FORFETTARIO_RULES` (`app.js:571-580`). La duplicazione è un rischio latente di drift: se una delle due costanti venisse aggiornata (ad es. per una modifica normativa) senza aggiornare l'altra, le due logiche divergerebbero. Severity: medio. Non classificato come issue critico perché attualmente i valori sono identici e la norma non cambia questi importi da decenni.

### Tabella risultati A13–A18

| # | Parametro | Atteso (fonte) | Trovato (codice) | Esito |
|---|---|---|---|---|
| A13 | Saldo + 1° acconto 30/6 | 30/6 (calendario fiscale — termine ordinario per il versamento del saldo anno N-1 e 1° acconto anno N) | `saldoMonth: 6, saldoDay: 30` (`app.js:574-575`) | ✓ |
| A14 | 2° acconto 30/11 | 30/11 (calendario fiscale) | `secondoAccontoMonth: 11, secondoAccontoDay: 30` (`app.js:576-577`) | ✓ |
| A15 | INPS fissi 16/5, 20/8, 16/11, 16/2 (N+1) | 16/5 (I rata), 20/8 (II rata — posticipata dal 16/8 per sospensione agostana ex art. 37 c. 11-bis D.L. 223/2006), 16/11 (III rata), 16/2 N+1 (IV rata) — (Circ. INPS standard, prassi consolidata artigiani/commercianti) | `fixedInpsDates: [[5,16],[8,20],[11,16],[2,16]]` (`app.js:578`) | ✓ |
| A16 | Soglia bollo 77,47 € | 77,47 € (art. 13 Tariffa, Allegato A, parte I al DPR 642/1972 — fatture non soggette a IVA, importo > 77,47 €) | `BOLLO_SOGLIA = 77.47` (`app.js:323`) | ✓ |
| A17 | Importo bollo 2,00 € | 2,00 € (art. 13 Tariffa, Allegato A, parte I al DPR 642/1972) | `BOLLO_IMPORTO = 2.00` (`app.js:324`) | ✓ |
| A18 | Date bollo 31/5, 30/9, 30/11, 28/2 (N+1) | Q1 → 31/5, Q2 → 30/9, Q3 → 30/11, Q4 → 28/2 N+1 — (art. 6 c. 2 DM 17/6/2014, come modificato dal DM 4/12/2020; codici 2521-2524) | Q1: `dueMonth:5, dueDay:31`; Q2: `dueMonth:9, dueDay:30`; Q3: `dueMonth:11, dueDay:30`; Q4: `dueMonth:2, dueDay:28, nextYear:true` (`app.js:326-329`) | ✓ con avvisi — v. note |

#### Note A13–A18

- **A13–A15 — nessuna anomalia**: le date di saldo/acconto imposta sostitutiva e le quattro rate INPS fissi corrispondono esattamente al calendario fiscale vigente. La pausa agostana (II rata al 20/8 invece del 16/8) è codificata correttamente.

- **A16–A17 — nessuna anomalia**: soglia e importo del bollo virtuale sono quelli normativi. La logica di conteggio in `calcBolloPerQuarter` (`app.js:331-344`) applica correttamente `importo > BOLLO_SOGLIA` (strettamente maggiore, come previsto dalla norma: il bollo non si applica per importo esattamente pari a 77,47 €).

- **A18 — date scadenza bollo corrette, due avvisi**:
  1. **Anno bisestile (Q4, 28/2 fisso)**: il codice usa `dueDay: 28` per il Q4, ma la norma dice "entro il giorno 28 febbraio" — non "ultimo giorno di febbraio". Il DM 4/12/2020 fissa la data al 28 febbraio indipendentemente dall'anno bisestile. Pertanto il valore 28 è corretto anche per il 2028. Nessun issue.
  2. **Differimento cumulativo bollo < 5.000 € (ISS-A18-a)**: il commento a `app.js:322` riconosce la regola ("Se bollo trimestrale ≤ 5000€, si puo accorpare al trimestre successivo"), ma `calcBolloPerQuarter` non implementa nessuna logica di differimento. La funzione restituisce sempre 4 righe con le rispettive scadenze, senza verificare se l'importo del trimestre precedente è inferiore a 5.000 € (soglia introdotta dal D.L. 73/2022 art. 22). Per contribuenti forfettari tipici (poche fatture di piccolo importo) il bollo trimestrale raramente supera 5.000 €, quindi quasi sempre avrebbero diritto al differimento — ma l'app non lo calcola né lo segnala. Severity: medio (non altera l'importo dovuto ma la scadenza di versamento è sbagliata in quasi tutti i casi pratici).

- **Proroghe annuali del saldo (non gestite)**: nessun riferimento a `proroga`, `maggiorazione`, `20/7`, `31/7` in tutto il codebase. L'app mostra sempre la scadenza ordinaria del 30/6. Ogni anno il governo emette una proroga (tipicamente al 20/7 con maggiorazione 0,40% o al 31/7 senza). La mancata gestione è una scelta di design esplicita (l'utente può ignorare la data mostrata e pagare entro la proroga reale), ma genera date di scadenza teoricamente errate per tutti gli anni in cui la proroga viene concessa. Severity: medio (data di scadenza sbagliata; non altera importo salvo l'0,40% di maggiorazione per chi paga tra 30/6 e 20/7).

### Tabella risultati A19–A27

| # | Parametro | Atteso (fonte) | Trovato (codice) | Esito |
|---|---|---|---|---|
| A19 | Cod. trib. 1790 (1° acc imposta sost.) | 1790 (Ris. AdE 60/E/2015) | `codiceTributo: '1790'` (`app.js:366`, `F24_GUIDE.imposta_acc1`) | ✓ |
| A20 | Cod. trib. 1791 (2° acc imposta sost.) | 1791 (Ris. AdE 60/E/2015) | `codiceTributo: '1791'` (`app.js:381`, `F24_GUIDE.imposta_acc2`) | ✓ |
| A21 | Cod. trib. 1792 (saldo imposta sost.) | 1792 (Ris. AdE 60/E/2015) | `codiceTributo: '1792'` (`app.js:349`, `F24_GUIDE.imposta_saldo`) | ✓ |
| A22 | Cod. trib. bollo 2521–2524 | 2521 Q1 / 2522 Q2 / 2523 Q3 / 2524 Q4 (Ris. AdE 42/E/2019) | `codice: '2521'/'2522'/'2523'/'2524'` in `BOLLO_QUARTERS` (`app.js:326-329`); riepilogo `'2521-2524'` in `F24_GUIDE.bollo` (`app.js:477, 489`) | ✓ |
| A23 | Cod. trib. 3850 (diritto annuale camera di commercio) | 3850 (Ris. AdE 30/E/2009) | `codiceTributo: '3850'` (`app.js:460`, `F24_GUIDE.camera`) | ✓ |
| A24 | Coefficienti redditività ATECO | Coefficiente 67% per ATECO 62.x (servizi informatici) — DM 23/1/2015 allegato 4 | Tutti e 3 i profili (Mattia, Peru, Demo): `coefficiente: 67`, ATECO `62.10.00` (`app.js:21, 46, 71`). Nessuna tabella ATECO integrata: il coefficiente è un campo numerico modificabile manualmente dall'utente in Impostazioni profilo. | ✓ / ⚠ |
| A25 | Aliquota imposta sost. 15% / 5% start-up | 15% regime base, 5% primi 5 anni per nuove attività agevolate (L. 190/2014 art. 1 c. 65 e c. 65-bis) | Default `impostaSostitutiva: 15` in tutti i profili (`app.js:22, 47, 72`). Campo `agevolazioneStartUp` esiste ma è etichettato "Campo informativo per futuri scenari" (`app.js:2263`): non abbassa automaticamente `impostaSostitutiva` a 5. `agevolazioneStartUp` non è referenziato in `tax-engine.js`. | ⚠ |
| A26 | INAIL minimale di rendita annua per artigiani senza dipendenti 2024–2026 | Valore 2024 atteso: 18.415,40 € (Circ. INAIL 13/2024, confermato). Per 2025 e 2026 serve consultare la **tabella dei "premi speciali unitari artigiani"** della circolare INAIL dedicata, non la sezione "retribuzione convenzionale minima giornaliera" (concetto diverso, applicato ai lavoratori dipendenti). | `INAIL_MINIMALE_RENDITA = { 2024: 18415.40, 2025: 18415.40, 2026: 18689.79 }` (`app.js:303-306`). Valore 2024 ✓; valori 2025/2026 non verificati contro la circolare corretta. | ⚠ |
| A27 | Formula INAIL: base × tasso‰ × 1,01 | `base × tassoPerMille / 1000 × 1,01` (addizionale ANMIL 1% — stabile per tutti gli anni recenti) | `Math.round(base * tassoPerMille / 1000 * 1.01 * 100) / 100` (`app.js:317`) | ✓ |

#### Note A19–A27

- **A19–A21 (codici erario forfettario)**: tutti e tre i codici (1790, 1791, 1792) sono corretti e allineati alla Risoluzione AdE 60/E/2015. Ogni entry di `F24_GUIDE` ha il campo `codiceTributo` valorizzato esplicitamente. La sezione è sempre "Erario", il campo `annoRif` descrive correttamente l'anno di riferimento da usare nell'F24.

- **A22 (codici bollo)**: i codici 2521-2524 sono correttamente associati ai 4 trimestri in `BOLLO_QUARTERS` (`app.js:326-329`) e ripetuti nella guida F24 (`app.js:489`). La sezione è "Erario" (`app.js:478`), coerente con la Risoluzione AdE 42/E/2019.

- **A23 (diritto camerale)**: codice 3850 nella sezione "IMU e altri tributi locali" (`app.js:461-462`). La Risoluzione AdE 30/E/2009 ha istituito il codice 3850 per il diritto annuale delle camere di commercio — riferimento corretto.

- **A24 (coefficienti ATECO — avviso medio)**: il valore 67% per ATECO 62.10.00 è corretto (DM 23/1/2015 allegato 4). L'app non fornisce nessuna tabella o dropdown degli ATECO con i relativi coefficienti: il campo `coefficiente` è un numero libero editabile dall'utente. Il rischio è l'inserimento di un valore errato per un ATECO diverso da 62.x. Per i 3 profili presenti il default 67% è corretto, ma l'assenza di guardrail espone utenti con ATECO diversi a errori silenziosi. Severity: medio.

- **A25 (agevolazione start-up — medio)**: il campo `agevolazioneStartUp` è puro dato informativo — non viene letto né da `calcForfettarioValues`, né da `buildForfettarioScenario`, né da `tax-engine.js`. Se un utente start-up attiva il flag ma non modifica manualmente `impostaSostitutiva` da 15 a 5, il calcolo rimane al 15%. L'agevolazione prevista dall'art. 1 c. 65-bis L. 190/2014 (aliquota 5% per i primi 5 anni di attività, al ricorrere dei requisiti) non viene mai auto-applicata. Severity: medio (rischio sottovalutazione del vantaggio fiscale; l'utente deve ricordarsi di cambiare anche `impostaSostitutiva` a mano).

- **A26 (INAIL minimale — da verificare)**: la variabile `INAIL_MINIMALE_RENDITA` è etichettata come "Retribuzione convenzionale INAIL (minimale di rendita) per artigiani senza dipendenti" (`app.js:301-302`). L'INAIL usa due concetti distinti che non vanno confusi: (1) il **minimale di rendita annua** (base per il calcolo dei premi speciali unitari degli artigiani autonomi, usato dalla formula `base × tasso‰ × 1,01`); (2) la **retribuzione convenzionale minima giornaliera** (limite giornaliero applicato ai lavoratori dipendenti, ~57,32 €/giorno nel 2025). Il valore 2024 codificato (18.415,40 €) coincide con il minimale di rendita pubblicato dalla Circ. INAIL 13/2024 — confermato. Per 2025 (18.415,40) e 2026 (18.689,79) i valori devono essere verificati contro la **tabella dei premi speciali unitari artigiani** della circolare annuale INAIL corrispondente, non contro la sezione della retribuzione giornaliera. Stato attuale: 2024 ✓; 2025/2026 da verificare con fonte corretta.

- **A27 (addizionale ANMIL 1%)**: il fattore 1,01 è corretto e stabile per tutti gli anni recenti. La formula include correttamente l'arrotondamento al centesimo via `Math.round(...*100)/100`.

## Issues raccolte

| ID | Step | Severity | Descrizione | File:linea | Fix proposto |
|----|------|----------|-------------|------------|--------------|
| ISS-A8 | A | critico | Il massimale contributivo INPS non viene applicato all'imponibile in modalità `gestione_separata`. Per redditi imponibili > 119.650 € (2024) / 120.607 € (2025) / 122.295 € (2026) il calcolo sovrastima i contributi. | `app.js:923-925` | Aggiungere `const cappedBase = Math.min(base, massimaleGestSep(year)); const cV = cappedBase * aliquota;` nel ramo `gestione_separata`. Definire una tabella `OFFICIAL_GESTIONE_SEPARATA_MASSIMALE` (2024: 119650, 2025: 120607, 2026: 122295) analoga a `OFFICIAL_ARTCOM_INPS`. |
| ISS-A9 | A | medio | L'aliquota di default per `gestione_separata` viene ereditata da `OFFICIAL_ARTCOM_INPS.artigiano.aliqContributi` (= 24,0%), che corrisponde all'aliquota dei pensionati/altra cassa. Il valore corretto per i liberi professionisti esclusivi è 26,07%. Non esiste distinzione UI tra i due sottocasi. | `app.js:1063-1071` | Aggiungere tabella `OFFICIAL_GESTIONE_SEPARATA_INPS` con aliquote per anno (esclusivi: 26,07; altra copertura: 24,00). In `getDefaultSettings`, se `inpsMode === 'gestione_separata'`, usare i valori dalla nuova tabella invece di `OFFICIAL_ARTCOM_INPS`. Esporre in Impostazioni un toggle "Esclusivo / Pensionato-altra cassa". |
| ISS-A18-a | A | medio | Il commento a `app.js:322` riconosce la regola di differimento bollo (Q trimestrale < 5.000 € → accorpato al trimestre successivo, ex D.L. 73/2022 art. 22), ma `calcBolloPerQuarter` non la implementa. L'app mostra sempre le 4 scadenze fisse, anche quando il contribuente avrebbe diritto al differimento. Per i forfettari tipici quasi ogni trimestre rientra sotto soglia, quindi la scadenza mostrata è quasi sempre errata. | `app.js:322, 331-344` | Dopo `calcBolloPerQuarter`, aggiungere un passo di "consolidamento" che somma i trimestri sub-5.000 € con quello successivo, aggiornando le scadenze di conseguenza. Mostrare in UI un badge "differito" quando applicabile. |
| ISS-A18-b | A | medio | L'app mostra sempre la scadenza del saldo imposta sostitutiva al 30/6 (e 1° acconto nella stessa data). In quasi tutti gli anni fiscali il governo emette una proroga (tipicamente 20/7 con maggiorazione 0,40% o 31/7 senza). Nessuna gestione di questo meccanismo in tutto il codebase (grep confermato su `proroga`, `maggiorazione`, `luglio`). | `app.js:574-575`, `FORFETTARIO_RULES` | Scelta di design da documentare esplicitamente in CLAUDE.md ("le proroghe annuali non sono gestite — l'utente deve verificare il calendario fiscale aggiornato"). In alternativa, implementare un meccanismo di override manuale della data di scadenza per il saldo, con avviso in UI. |
| ISS-A24 | A | medio | L'app non fornisce alcuna tabella ATECO integrata con i coefficienti di redditività. Il campo `coefficiente` (in Impostazioni profilo) è un campo numerico libero senza elenco di riferimento. L'utente con un ATECO diverso da 62.10.00 potrebbe inserire un coefficiente errato senza alcun avviso (es. 78 invece di 67, o viceversa), alterando l'imponibile forfettario e quindi tasse e contributi. | `app.js:21, 46, 71` (default profili); sezione Impostazioni profilo (campo `coefficiente`) | Aggiungere una tabella JSON dei coefficienti ufficiali (DM 23/1/2015 + aggiornamenti) e mostrare in UI un dropdown o un helper che suggerisca il coefficiente corretto in base all'ATECO inserito dall'utente. In alternativa, aggiungere un avviso informativo che rimandi alla tabella ufficiale AdE. |
| ISS-A25 | A | medio | Il campo `agevolazioneStartUp` è puramente informativo e non ha alcun effetto sui calcoli. Attivarlo non abbassa automaticamente `impostaSostitutiva` da 15 a 5. Un utente che attiva il flag senza modificare manualmente l'aliquota continuerà a calcolare (e accantonare) il 15% invece del 5%, sovrastimando le imposte di 10 punti percentuali sull'imponibile per i primi 5 anni. La legge (L. 190/2014 art. 1 c. 65-bis) prevede esplicitamente l'agevolazione per i nuovi forfettari nei requisiti previsti. | `app.js:2259-2267` (campo UI); `app.js:1464` (`calcForfettarioValues` — `agevolazioneStartUp` non letto) | Quando `agevolazioneStartUp === 1`, applicare automaticamente `impostaSostitutiva = 5` nel calcolo (non sovrascrivere il setting, ma usare 5 nel motore fiscale). Oppure, aggiungere un avviso in UI che ricordi all'utente di abbassare manualmente l'aliquota a 5%. |
| ISS-A26 | A | cosmetico | `INAIL_MINIMALE_RENDITA` per 2025 (18.415,40) e 2026 (18.689,79) non è stato verificato contro la tabella INAIL dei "premi speciali unitari artigiani" della circolare corrispondente. Il valore 2024 è confermato (Circ. INAIL 13/2024). Prima di correggere, serve lettura diretta della Circ. INAIL 2025 e 2026 (sezione artigiani autonomi, NON sezione retribuzione giornaliera dipendenti). | `app.js:303-306` | Verifica fonte dedicata per 2025 e 2026; aggiorna i valori se diversi. In alternativa, documentare la fonte usata (commit message, CLAUDE.md) per rendere tracciabile l'origine. |

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
