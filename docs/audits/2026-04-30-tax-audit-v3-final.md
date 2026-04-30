# Audit fiscale v3 finale + UX mobile (2026-04-30)

**Data audit:** 2026-04-30
**Branch:** `dev-taxaudit`
**Suite test:** 396/396 verde
**Scope:** verifica chiusura dei 6 fix v3 (chiusura GAP 🔴 e WATCH 🟡 segnalati dal commercialista nell'audit del 2026-04-29) + UX mobile (font scale-up smartphone) + ultima caccia ostile pre-merge.

**Metodologia:** doppio audit parallelo — auditor severo (mentalità ostile) + commercialista (correttezza pratica). Cross-check ostile su ogni claim. Solo fonti AdE/GdF/INPS + normativa primaria.

---

## Sintesi esecutiva

| Severità | Verifica fix v3 | Mobile UX | Caccia residui | Falsi positivi |
|---|---|---|---|---|
| 🔴 CRITICO | **0** | 0 | **0** | — |
| 🟡 ALTO | **0** | 0 | **0** | — |
| 🟢 MEDIO | 0 | 0 | 0 | — |
| ⚪ BASSO | 0 | 0 | 1 (commento normativo, già sistemato) | — |

**Stato 6 fix v3:**

| Fix | Stato | Evidence |
|---|---|---|
| **v3-RR21-GS** acconti GS letti da pagamenti | ✅ **CHIUSO** | `dichiarazione-engine.js:229-243` `readAccontiContributiVersati`; `:245-270` ramo gestione_separata; RR22_credito esposto |
| **v3-RIDUZIONE35** warning comunicazione INPS | ✅ **CHIUSO** | `dichiarazione-engine.js:214-226` warning solo per art-comm |
| **v3-RX-CLAMP** eccedenza ≥ 0 | ✅ **CHIUSO** | `dichiarazione-engine.js:372` `Math.max(0, eccedenzaRaw)`; `validateDichiarazione:618-624` propagazione |
| **v3-INTEGRATIVA** warning no delta automatico | ✅ **CHIUSO** | `dichiarazione-engine.js:604-616` warning `DICHIARAZIONE_INTEGRATIVA`/`DICHIARAZIONE_CORRETTIVA` |
| **v3-F24-AP-AF** causali in F24_GUIDE | ✅ **CHIUSO** | `app.js:669, 685, 700` causali AP/AF/APR/APF/P10/CF |
| **v3-LIMITE-ALERT** banner 80/95/100/decadenza | ✅ **CHIUSO** | `app.js:3118-3156` 4 livelli alert |

**Mobile UX:** ✅ scritte sidebar 16px (era 13), tabelle 14px (era 12), topbar 17px. Nessun impatto desktop. Media query `@media (max-width: 768px)` e `@media (max-width: 480px)` correttamente isolate.

**Conclusione:** **branch CHIUDIBILE per merge in `main`** — verdetto unanime auditor severo + commercialista.

---

## PARTE 1 — Verifica chiusura 6 fix v3

### ✅ v3-RR21-GS — CHIUSO

`dichiarazione-engine.js`:
- `readAccontiContributiVersati()` (righe 229-243) — helper condiviso che legge `yearData.pagamenti[]`, filtra `tipo='contributi'` con `linkedKeys` matching `/^contributi_acc[12]_/`.
- Ramo `gestione_separata` (righe 245-270): RR21 popolato da `readAccontiContributiVersati()` (con override `RR21_value` rispettato), RR22 = `Math.max(0, contribGs - rr21Value)`, RR22_credito esposto se acconti > contributi.
- 4 test in `test/dichiarazione-rr-gs-acconti-rx-clamp.test.js`: 2 acconti + GS, acconti > contributi, override, no pagamenti.

**Logica simmetrica a RR7 sez. I.** Nessuna regressione su sez. I (artigiani/commercianti).

### ✅ v3-RIDUZIONE35 — CHIUSO

`dichiarazione-engine.js:214-226`: condizione precisa `riduzione35==1 || ===true` AND `inpsMode === 'artigiani_commercianti' || 'artcom'`. Warning `RR_RIDUZIONE35_VERIFICA` push in `rrWarnings` con riferimento art. 1 c. 77 L. 190/2014.

**Branch GS non emette il warning** (riduzione vale solo per art-comm). 3 test coprono: art-comm con/senza riduzione, GS con riduzione (no warning).

### ✅ v3-RX-CLAMP — CHIUSO

`dichiarazione-engine.js`:
- Riga 365: `eccedenzaRaw` da input (precedente o settings).
- Riga 372: `eccedenza = Math.max(0, eccedenzaRaw)` — clamp difensivo.
- Righe 374-380: warning `RX_ECCEDENZA_NEGATIVA` se input < 0.
- Propagazione in `validateDichiarazione:618-624`.

2 test: negativa → 0+warning, positiva → invariata.

### ✅ v3-INTEGRATIVA — CHIUSO

`dichiarazione-engine.js:604-616`: warning distinti per `'integrativa'` (cita istruzioni AdE: 1=ravvedimento, 2=correttiva favorevole, 3=integrativa entro anno succ.) e `'correttiva'`. Cita `Art. 2 c. 8 DPR 322/1998`.

3 test: integrativa, correttiva, ordinaria (no warning).

### ✅ v3-F24-AP-AF — CHIUSO

`app.js` `F24_GUIDE`:
- `contributi_saldo` (riga 658): istruzioni includono "Causali contributo: AP / AF / APR/APF / P10 / CF". Note ricapitolativi.
- `contributi_acc1` (riga 674): stesso pattern.
- `contributi_acc2` (riga 689): stesso pattern.

Causali ufficiali INPS:
- **AP** = artigiani saldo/acconti
- **AF** = commercianti saldo/acconti
- **APR/APF** = come AP/AF con riduzione 35%
- **P10** = gestione separata, professionisti senza altra gestione
- **CF** = gestione separata, collaboratori

### ✅ v3-LIMITE-ALERT — CHIUSO

`app.js:3118-3156` `buildForfettarioLimitBar`:

| Soglia | Banner | Norma |
|---|---|---|
| ≥ 80% | info azzurro: percentuale + mancante | — (early warning) |
| ≥ 95% | warn arancione: vicino al limite, suggerisce rinvio incassi | — |
| > limite | high arancione: uscita regime anno succ | art. 1 c. 71 L. 190/2014 |
| > limite + 15.000 | critical rosso: decadenza immediata + IVA retroattiva | art. 1 c. 71 L. 190/2014 mod. L. 197/2022; Circ. AdE 9/E 2019 |

Ordine `if/else if` corretto: priorità decrescente, no overlap.

---

## PARTE 2 — Mobile UX

`style.css` — 70 nuove regole CSS dentro media query mobile esistenti, additive:

**`@media (max-width: 768px)` (esteso, riga 3955+):**
- `.sb-item` 16px (era 13px) + padding 12px per tap area
- `.sb-section-label` 12px (era 10px)
- `.sb-profile`, `.sb-name`, `.sb-meta` ingranditi
- `.mobile-topbar-title` 17px (era 15px)
- `.fatture-table`, `.accant-table`, `.monthly-breakdown` 14px (era 12-13px)
- `.row label` 14px, `.row .val` 15px
- Card heading `.fatture-docs-copy h4` 1.15rem
- Status box, settings, year-selector tutti scaled-up coerentemente

**`@media (max-width: 480px)` (esteso):**
- `.scad-main` 0.95rem (era 0.84), `.scad-sub` 0.8rem (era 0.68)
- Tabelle .8rem → .9rem

**Verifica integrità:** nessuna media query desktop modificata. `@media (min-width: 769px)` (sidebar collapsed) intatta. CSS sintatticamente valido.

---

## PARTE 3 — Caccia residui ostili

### ⚪ BASSO — Riferimento normativo D.L. 50/2017 → L. 197/2022 (sistemato)

Il commento in `buildForfettarioLimitBar` citava `D.L. 50/2017 art. 1-bis` come base della decadenza immediata a +15.000 €. **Nota dell'auditor severo:** la norma corretta è `art. 1 c. 71 L. 190/2014 come modificato da L. 197/2022 art. 1 c. 54 lett. a` (Legge di Bilancio 2023). L'importo (100.000 €) restava invariato — solo il riferimento testuale era impreciso.

**Sistemato** in `app.js:3125-3128, 3140` con riferimento aggiornato. Banner critical decadenza mostra ora "art. 1 c. 71 L. 190/2014 come modificato da L. 197/2022".

### Falsi positivi confermati

Nessun nuovo falso positivo emerso. I 10 falsi positivi confermati negli audit precedenti restano:
- EsigibilitaIVA opzionale per N2.2
- Hard-delete dev toggle gated
- IBAN warning UI
- C-A1 boundary 257.52 inclusivo
- `buildAccontoPlan(0/NaN/Infinity)` gestiti da `toNumber`
- Leakage cripto in forfettario: assente
- Cliente nazione `null/''` gestito
- Throw `_resolveRegimeForPdf` propagato
- C-A2 fix specifico per forfettario, no false positive su ordinario
- NR-2/NR-3 copertura completa NC TD04

---

## Conclusione

**Branch `dev-taxaudit` CHIUDIBILE per merge in `main`. Verdetto unanime.**

### Statistiche complessive

- **Audit completati:** 4 (2026-04-25, 2026-04-29, 2026-04-29 v2, 2026-04-30)
- **Fix complessivi:** 21 (7 v1 + 7 v2 + 2 quick-win + 5 v3 + 1 mobile UX)
- **Suite test:** 396/396 verde (da 330 iniziali)
- **Test nuovi creati:** ~66 nei 4 round
- **Critici/Alti aperti:** 0

### Disclaimer residui per materiali utente

I caveat segnalati dal commercialista da inserire in onboarding/help dell'app:

1. **Casse autonome non gestite** (INARCASSA, CNPADC, ENPACL, EPAP) — il warning `RR_CASSA_NON_GESTITA` c'è in-app, da rinforzare nei materiali utente.
2. **Riduzione 35% INPS richiede comunicazione formale all'INPS** all'iscrizione — non basta spuntare il flag.
3. **Dichiarazione integrativa: no delta automatico** — usare software AdE per la trasmissione.
4. **Criterio di cassa:** inserire data di incasso (`pagAnno`/`pagMese`), non data di emissione, per monitoraggio corretto soglia 85k.

### Schedulabili post-launch (backlog non bloccante)

- Massimale INPS 119.650 € in `buildQuadroRR` (irrilevante per forfettario puro <85k)
- C-A2 path async XML validator (`fatture-docs-feature.js:~1200`) — incoerenza interna, non bypass utente
- Form UI dedicato per cripto-attività in Quadro RW
- Validazione minimale INPS fuori range

---

## Note metodologiche

- 2 explore-agent paralleli, lettura diretta del codice + test.
- Cross-check su tutti i claim con file:line evidence.
- Solo fonti ufficiali AdE/GdF/INPS + normativa primaria.
- Suite verde non implica conformità fiscale assoluta: la caccia ostile è il complemento.
- Mobile UX testato solo via inspection CSS (no run real-device).
