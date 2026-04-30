# Audit fiscale post-fix (2026-04-29)

**Data audit:** 2026-04-29
**Branch:** `dev-taxaudit`
**Suite test:** 353/353 verde
**Scope:** verifica chiusura dei 7 rilievi del plan `2026-04-29-tax-audit-remediation.md` (commit `73aa8d6` → `ac36be7`) + ricerca regressioni + caccia ostile a nuovi rilievi su tutto il perimetro app (tax engine, scadenziario+F24, dichiarazione, FatturaPA XML+NC, PDF).

**Metodologia:** 3 explore-agent paralleli + cross-check ostile su ogni finding. Solo fonti AdE/GdF/INPS + normativa primaria.

---

## Sintesi esecutiva

| Severità | Verifica fix | Regressioni | Nuovi rilievi |
|---|---|---|---|
| 🔴 CRITICO | 0 aperti | 0 | **1** (NR-10) |
| 🟡 ALTO | **3 parziali** (C-A2, C-A3, A-A7) | **1** (REG-2) | **3** (NR-2, NR-3, C-A2 bypass XML) |
| 🟢 MEDIO | 2 con riserva (C-A4, A-A8) | 2 (REG-3, REG-4) | 3 (NR-6, NR-7, RR massimale) |
| ⚪ BASSO | 1 (A-A6 UX) | 0 | 2 (NR-8, NR-1) |

**Stato dei 7 rilievi del plan:**

| Rilievo | Stato | Note |
|---|---|---|
| **C-A1 / R8** soglia 257,52 | ✅ **CHIUSO** | Operatore `<=` su entrambi i call site; test boundary verde |
| **C-A2** ritenuta forfettario | ⚠️ **PARZIALE** | Bloccato il path "Invia" ma `previewFatturaXml` e `downloadFatturaXml` bypassano il check |
| **C-A3** RW criptovalute | ⚠️ **PARZIALE** | Formula IC corretta + monitoraggio puro, ma IC non visibile nel PDF/CSV; no sanitize valori negativi/quota fuori range |
| **C-A4** PDF watermark BOZZA | ✅ **CHIUSO** | Tutte le pagine + footer disclaimer; riserva minore: fallback colore poco visibile B/N |
| **A-A6** cliente PA IPA | ✅ **CHIUSO** | Validate + XML + UI corretti; osservazione UX su lowercase non normalizzato |
| **A-A7** rimborso bollo XML | ⚠️ **PARZIALE** | `emetteRimborsoBollo` non verifica soglia 77,47 € — possibile XML incoerente |
| **A-A8** dicitura forfettario PDF | ✅ **CHIUSO** | Testo completo, gating regime; rischio residuo: nota custom sovrascrive |

**Conclusione:** branch `dev-taxaudit` **non ancora chiudibile** per launch.
- 3 fix completi (C-A1, C-A4, A-A6, A-A8 con riserve minori).
- 3 fix con bypass/lacune che richiedono secondo giro (C-A2, C-A3, A-A7).
- 1 critico nuovo (NR-10) + 4 alti nuovi (REG-2, NR-2, NR-3, C-A2 XML bypass) emersi dal nuovo passaggio ostile.

---

## PARTE 1 — Verifica chiusura 7 rilievi

### ✅ C-A1 / R8 — CHIUSO

- `tax-engine.js:80` → `if (base <= cfg.thresholdSingle)` ✅
- `app.js:4087` → `if (base <= FORFETTARIO_RULES.singleAccontoThreshold)` ✅
- Costanti coerenti: `thresholdSingle: 257.52`, `singleAccontoThreshold: 257.52`.
- Test boundary 257.52 → mode `single` con `first=0`, `second=257.52`. Verde.
- Edge case `<= 51.65` → mode `none`: anch'esso inclusivo (coerente con stessa norma).
- Floating-point: il codice normalizza via `centsToEuro(euroToCents(base))` prima del confronto → robusto.

**Nessun residuo di rischio.** Conforme art. 17 c. 3 DPR 435/2001.

---

### ⚠️ C-A2 — PARZIALE

**Cosa è chiuso:**
- `validateDraftForInvio` (`fatture-docs-feature.js:1067-1075`) push errore bloccante quando `regime==='forfettario' && draft.ritenuta > 0`. Il `saveFatturaDraft(asDraft=false)` blocca via `errors.length`.
- UI: checkbox sostituita da messaggio "Non applicabile" (`fatture-docs-feature.js:754`).
- Auto-clear `__clearRitenutaForForfettario` (`fatture-docs-feature.js:717-722`) chiamato a render time in `renderStep3Html`. Idempotente.

**Bypass aperto (severità ALTA):**
1. **`previewFatturaXml`** (`fatture-docs-feature.js:2019-2031`) chiama `saveFatturaDraft(true)` con `asDraft=true` → SALTA `validateDraftForInvio` → genera XML con `<DatiRitenuta>` su forfettario.
2. **`downloadFatturaXml`** (`fatture-docs-feature.js:1868-1876`) chiama `validateFatturaForXml` (`fatture-docs-feature.js:1510-1539`) ma **questa funzione NON contiene il check C-A2**.

Un utente con draft pre-caricato (regime=forfettario, ritenuta=200) può ottenere XML con DatiRitenuta tramite "Anteprima XML" o "Scarica XML".

**Fix richiesto:** aggiungere il check ritenuta-forfettario anche in `validateFatturaForXml`, e/o forzare `validateDraftForInvio` come pre-requisito di `previewFatturaXml`/`downloadFatturaXml`.

**Fonte:** Art. 1 c. 67 L. 190/2014; Circ. AdE 9/E 2019 §4.1.

---

### ⚠️ C-A3 — PARZIALE

**Cosa è chiuso:**
- Ramo `tipo === 'criptovalute'` in `dichiarazione-engine.js:360`.
- Formula IC corretta: `r2(valoreCripto * 0.002 * quota)` (riga 367).
- Soglia esenzione 5.000 € NON applicata a cripto (corretto: vale solo IVAFE conti UE/SEE).
- Rigo emesso anche con `valoreFinale=0` (obbligo monitoraggio puro).
- `totali.icTotale` esposto (riga 437).

**Lacune aperte:**

1. **IC NON visibile nel PDF/CSV** (severità ALTA):
   - PDF (`dichiarazione-exports.js:260-269`): mostra solo `paese`/`tipoConto`/`valoreFinale`. Nessuna colonna per `icRigoDovuto`.
   - CSV (`dichiarazione-exports.js:34-38`): esporta solo `valoreFinale` e `paese`. Nessun `icRigoDovuto` né `totali.icTotale`.
   - Il contribuente che stampa la dichiarazione **non vede l'IC dovuto** → rischio omissione versamento → sanzione 3-15% su valore non dichiarato (D.L. 167/1990 art. 5 c. 2).

2. **Valori negativi non sanitizzati** (severità MEDIA): `valoreFinale=-500` accettato as-is, rigo emesso con valore negativo (fiscalmente privo di senso).

3. **`quotaPossesso` fuori range [0,1]** (severità ALTA): `quota=1.5` o `-0.3` accettate. Quota negativa produce IC negativo che abbatte `icTotale`. Nessun clamping.

4. **Warning plusvalenze NON emesso se `valoreFinale=0`** (severità BASSA): caso "vendita totale durante l'anno" non promemoria.

5. **Quadro RT non implementato** (severità MEDIA — NR-7): il warning cita "verificare quadro RT" ma l'app non genera RT. Disclaimer presente ma poco prominente.

**Fix richiesto:**
- Esporre `icRigoDovuto` e `icTotale` nel PDF/CSV con colonna dedicata.
- `valoreCripto = Math.max(0, parseFloat(c.valoreFinale))` + warning su negativo.
- Clamp `quota = Math.min(1, Math.max(0, quota))` con warning su out-of-range.
- Warning RT con severità `error` (non solo `warning`).

**Fonte:** L. 197/2022 art. 1 cc. 126-147; Provv. AdE 7/8/2023; D.L. 167/1990 art. 5 c. 2.

---

### ✅ C-A4 — CHIUSO con riserva minore

- `addBozzaWatermark` (`dichiarazione-exports.js:299-326`) presente e applicato a TUTTE le pagine via loop `setPage(p)` (riga 327-333).
- Footer disclaimer cita "art. 3 DPR 322/1998" testualmente.
- Posizione disclaimer `pH-14`, footer pre-esistente `pH-6` → margine ~4pt.

**Riserve minori:**
- **Sovrapposizione visiva su disclaimer multi-line:** se il testo va su 2 righe (per `maxWidth: pW-20`), l'ultima riga avvicina al footer pagina. Estetico, non normativo.
- **Fallback colore quasi invisibile in B/N (NR-6):** `setTextColor(220, 200, 200)` (rosa chiaro) → in stampa B/N o conversione luminosità ≈85% → quasi invisibile. Il principio di chiarezza (Circ. AdE 23/E 2014) è messo a rischio. **Fix:** `setTextColor(150, 150, 150)` o più scuro.
- **Mancano test unit per `exportC3`/`addBozzaWatermark`:** test indiretti via suite, niente test dedicati al watermark.

**Nessun rischio normativo aperto** — il watermark non è una sicurezza tecnica (un PDF è editabile esternamente), serve come disclaimer legale per scaricare la responsabilità da uso improprio.

**Fonte:** Art. 3 DPR 322/1998; art. 1 c. 1 D.Lgs. 471/1997 (sanzione dichiarazione omessa).

---

### ✅ A-A6 — CHIUSO con osservazione UX

- `normalizeCliente` (`app.js:870`): whitelist `['PF','PG','PA','Estero']` con default `'PG'`. Backward compat OK.
- UI modal (`app.js:1024-1033`): select tipoCliente + label dinamica + maxlength dinamico (6 per PA, 7 altrimenti).
- `validateDraftForInvio` (`fatture-docs-feature.js:1079-1084`): regex `/^[A-Z0-9]{6}$/i` su PA, errore bloccante con riferimento a D.M. 55/2013.
- `buildFatturaElettronicaXml` (`fatture-docs-feature.js:1605-1612`): per PA emette il codice `.toUpperCase()` SENZA padding a 7 zeri. Per non-PA padding `.padEnd(7,'0').slice(0,7)`. Distinzione corretta.

**Osservazione UX (severità BASSA):**
- Flag `/i` accetta lowercase nella validate (es. "ufy9mh" passa). XML normalizza poi a uppercase, quindi il risultato è corretto, ma l'UI non normalizza visivamente al submit. Possibile sorpresa per l'utente meticoloso.

**Fix opzionale:** sostituire flag `/i` con regex case-sensitive + auto-uppercase nell'`onchange` del campo, oppure normalizzare nell'UI a render time.

**Fonte:** D.M. 55/2013 art. 2.

---

### ⚠️ A-A7 — PARZIALE

**Cosa è chiuso:**
- Condizione: `!isNC && marcaDaBollo && bolloAddebitato` (`fatture-docs-feature.js:1651`). TD04 escluso correttamente.
- DettaglioLinee con `Descrizione="Rimborso imposta di bollo"`, `Natura="N1"`, `AliquotaIVA="0.00"`, `PrezzoUnitario=2.00`.
- `NumeroLinea` = ultima riga normale + 1.
- `<DatiRiepilogo>` separato per Natura N1 con `RiferimentoNormativo` art. 15 DPR 633/72.
- `ImportoTotaleDocumento` include il bollo via `bolloInTotal`.

**Bug aperto (severità ALTA):**

`emetteRimborsoBollo` (riga 1651) **NON verifica la soglia 77,47 €**. Mentre `applicaBolloSeDovuto(totals.subtotal, draft.marcaDaBollo)` (riga 1676) usa la soglia per emettere/non emettere `<DatiBollo>`.

**Caso patologico:**
- Fattura imponibile 50 € (sotto soglia 77,47 €).
- `marcaDaBollo=true`, `bolloAddebitato=true` (forzato via UI legacy o import).
- `<DatiBollo>` NON emesso (soglia non raggiunta).
- Riga `<DettaglioLinee>` "Rimborso imposta di bollo" Natura N1 + `<DatiRiepilogo>` N1 da 2,00 € **vengono emessi**.
- XML: dichiara rimborso bollo senza la marca da bollo → incoerenza interna → SdI può rifiutare per controllo formale.

**Fix richiesto:** la condizione `emetteRimborsoBollo` deve includere la soglia 77,47 € (stesso controllo di `applicaBolloSeDovuto`):
```javascript
const emetteRimborsoBollo = !isNC && draft.marcaDaBollo === true
  && draft.bolloAddebitato === true
  && totals.subtotal > 77.47;
```

**Difformità testo PDF/XML (severità BASSA):** PDF emette "Marca da bollo" (riga 1376), XML "Rimborso imposta di bollo". Entrambi accettabili, ma per coerenza in eventuali controlli incrociati cartaceo/SdI raccomandata uniformità ("Rimborso imposta di bollo" è il termine tecnico corretto).

**Fonte:** Ris. AdE 444/E del 18/11/2008; art. 15 DPR 633/72; D.M. 17/06/2014 art. 6 (soglia 77,47 €).

---

### ✅ A-A8 — CHIUSO con rischio residuo

- `DEFAULT_FORFETTARIO_NOTE` (`fatture-docs-feature.js:3`): testo completo con tutti e 4 gli elementi richiesti dalla norma (commi 54-89, regime forfettario, franchigia IVA, senza ritenuta d'acconto).
- Footer condizionale: `noteToPrint = customNote || (isForfettario ? DEFAULT_FORFETTARIO_NOTE : '')`.
- Regime ordinario senza nota custom: niente dicitura (no falsa attribuzione).
- NC TD04 forfettario: dicitura presente (coerente con TD01).

**Rischi residui:**

1. **Nota custom sovrascrive dicitura obbligatoria** (severità MEDIA): operatore `||` non concatena. Un forfettario che scrive "Pagamento entro 30 gg" **perde la dicitura art. 1 c. 58 L. 190/2014** che è obbligatoria. Sanzione formale: 250-2000 € (art. 6 c. 1 D.Lgs. 471/1997). Mitigazione attuale: il campo `note` viene pre-popolato con `DEFAULT_FORFETTARIO_NOTE` (riga 274), ma se l'utente lo sovrascrive intenzionalmente è perso.
   **Fix:** concatenare invece di sostituire: `noteToPrint = customNote && isForfettario ? customNote + '\n' + DEFAULT_FORFETTARIO_NOTE : (customNote || DEFAULT_FORFETTARIO_NOTE)`.

2. **NR-10 — CRITICO: `getSettings()` lancia → dicitura assente** (vedi PARTE 3 nuovi rilievi).

**Fonte:** D.L. 119/2018 art. 1 c. 909; Circ. AdE 9/E 2019; art. 6 c. 1 D.Lgs. 471/1997.

---

## PARTE 2 — Regressioni rilevate

### 🟡 REG-2 ALTO — Aliquota Gestione Separata fallback obsoleta (26,23% vs 26,07%)

**File:** `dichiarazione-engine.js:203`

**Codice:**
```javascript
var aliqGs = parseFloat(settings.aliqContributi) || 26.23;
```

**Problema:** Fallback hardcoded `26.23` (aliquota 2022-2023). Dal 2024 l'aliquota esclusivo INPS GS è **26,07%** (Circ. INPS 24/2024, 26/2025, 8/2026). Quando `settings.aliqContributi` è assente o NaN, il quadro RR sez. II calcola **0,16 punti percentuali in eccesso** sui contributi.

**Effetto:** sovrastima contributi GS → saldo a debito errato → versamenti F24 in eccesso (l'utente paga di più del dovuto). Non genera contestazione AdE ma è un errore quantitativo a sfavore dell'utente.

**Fix:** sostituire `|| 26.23` con `|| 26.07`. Aggiungere comment con riferimento Circ. INPS 8/2026.

**Fonte:** Circ. INPS n. 26 del 2025; Circ. INPS n. 8 del 2026.

---

### 🟢 REG-3 MEDIO — RR21 (acconti versati GS) hardcoded a 0

**File:** `dichiarazione-engine.js:210-211`

**Codice:**
```javascript
RR21: rigo(0, 'Contributi già versati'),
RR22: rigo(Math.max(0, contrib), 'Saldo contributi')
```

**Problema:** Il ramo Gestione Separata non legge `yearData.pagamenti[]` per dedurre acconti già versati (ramo art-comm lo fa correttamente alle righe 237-260). Saldo sovrastimato → utente paga doppia volta gli acconti già fatti.

**Fix:** replicare la logica art-comm filtrando chiavi `/^contributi_acc[12]_/` da `pagamenti[]`.

**Fonte:** Modello Redditi PF 2026 — istruzioni Quadro RR sez. II (RR21 = acconti versati nell'anno).

---

### 🟢 REG-4 MEDIO — LM36/LM38/LM47 ridondanza

**File:** `dichiarazione-engine.js:151-188`

**Problema:** LM36 e LM38 calcolate con stessa formula → identiche. LM47 alias di LM36. Il modello AdE prevede LM38 = LM36 - LM39 (detrazioni). In assenza di detrazioni nel forfettario è funzionalmente corretto ma il campo LM47 come alias di LM36 è "fantasma" non previsto dal modello ufficiale → confusione consumer/CSV.

**Fix:** allineare LM38 = max(0, LM36 - LM39) anche se LM39=0; rimuovere l'alias LM47 o documentarlo.

**Fonte:** Modello Redditi PF 2026 istruzioni Quadro LM.

---

## PARTE 3 — Nuovi rilievi (caccia ostile)

### 🔴 NR-10 CRITICO — Dicitura forfettario assente se `getSettings()` lancia

**File:** `fatture-docs-feature.js:1411-1413`

**Codice:**
```javascript
let isForfettario = false;
try { isForfettario = (typeof getSettings === 'function') && getSettings().regime === 'forfettario'; }
catch (_e) { /* silently fallback */ }
```

**Problema:** se `getSettings()` lancia (storage corrotto, race condition), `isForfettario` resta `false` → la dicitura art. 1 c. 58 L. 190/2014 **non viene emessa nel PDF**. La fattura PDF cartacea/email risulta priva della dicitura obbligatoria.

**Effetto:** sanzione formale 250-2000 € per fattura non conforme (art. 6 c. 1 D.Lgs. 471/1997). In una verifica AdE/GdF la mancanza è contestabile.

**Fix:** fallback su variabile module-scope `data.settings.regime` o errore esplicito (mai silenzioso) se settings non disponibili durante PDF generation.

**Fonte:** L. 190/2014 art. 1 c. 58; D.L. 119/2018 art. 1 c. 909; Circ. AdE 9/E 2019.

---

### 🟡 NR-2 ALTO — Cliente IT senza P.IVA né CF: XML non conforme XSD

**File:** `fatture-docs-feature.js:1746-1771`, `1822-1826`

**Problema:** `validateFatturaForXml` (riga 1535) blocca correttamente cliente IT senza P.IVA né CF. Ma `validateDraftForInvio` **non chiama** `validateFatturaForXml`. Un draft può essere salvato e successivamente l'XML costruito direttamente: `cessionarioFiscaleXml` resta vuoto → `<DatiAnagrafici>` privo di `<IdFiscaleIVA>` o `<CodiceFiscale>` → **violazione XSD FatturaPA v1.2 §1.4** → SdI rifiuta con errore EC02/ER0100.

**Fix:** integrare il check P.IVA-OR-CF di `validateFatturaForXml` direttamente in `validateDraftForInvio`.

**Fonte:** FatturaPA v1.2 §1.4.1.2 / §2.1.2.6; specifiche tecniche AdE.

---

### 🟡 NR-3 ALTO — Cliente UE: P.IVA con prefisso paese duplicato in `IdCodice`

**File:** `fatture-docs-feature.js:1747-1756`

**Codice:**
```javascript
const vatEstero = clientePivaRaw || clienteCF;
if (vatEstero) {
  cessionarioFiscaleXml = `
    <IdFiscaleIVA>
      <IdPaese>${cliNaz}</IdPaese>
      <IdCodice>${xmlEscape(vatEstero)}</IdCodice>
```

**Problema:** se l'utente inserisce `partitaIva = "DE123456789"`, `IdCodice` conterrà `DE123456789` con `IdPaese=DE` → prefisso duplicato. SdI può accettarlo (campo libero 28 char) ma le specifiche UBL e la prassi consolidata richiedono numero IVA puro in `IdCodice`.

**Fix:**
```javascript
const vatCodice = vatEstero.replace(new RegExp('^' + cliNaz.toUpperCase(), 'i'), '').trim() || vatEstero;
```

**Fonte:** FatturaPA v1.2 §2.1.2.6 — `IdCodice` semantica numerica nazionale.

---

### 🟡 C-A2 BYPASS XML (vedi PARTE 1) — recap come ALTO nuovo

Il fix C-A2 ha protetto solo il path "Invia". I path `previewFatturaXml` e `downloadFatturaXml` permettono di scaricare/visualizzare XML SdI con `<DatiRitenuta>` su forfettario. **Apertura ALTA** che l'audit precedente non aveva flaggato perché l'integrazione bypass UI non era stata mappata.

---

### 🟢 NR-6 MEDIO — Watermark fallback colore poco visibile B/N

(vedi C-A4 sopra)

---

### 🟢 NR-7 MEDIO — Warning cripto cita Quadro RT non implementato

**File:** `dichiarazione-engine.js:368`

**Problema:** il warning rimanda all'utente "verificare quadro RT" ma l'app **non** genera RT. Disclaimer presente ma di severità `warning`, non `error`.

**Fix:** elevare il warning a severità `error` con testo: "ATTENZIONE: Quadro RT per plusvalenze cripto NON è generato da questa app. Rivolgersi a un commercialista."

**Fonte:** L. 197/2022 art. 1 cc. 126-147; art. 67 c. 1 lett. c-sexies TUIR.

---

### 🟢 RR sez. II senza massimale GS (severità MEDIO)

**File:** `dichiarazione-engine.js` zona `buildQuadroRR` sez. II

**Problema:** `app.js:1485-1488` applica correttamente il massimale GS (~120.607 € 2025) tramite `cappedBase`. Ma `dichiarazione-engine.js:buildQuadroRR` sez. II **non applica il cap**. Per redditi GS sopra il massimale → contributi sovrastimati.

**Effetto:** improbabile sotto soglia 85k forfettario, ma se il regime è ordinario+GS e il reddito supera 120k il quadro RR sovrastima il debito INPS.

**Fix:** chiamare `getGestSepMassimale(year)` (se non già esposto, esporlo) e applicare cap su `imponibileGS`.

**Fonte:** Art. 2 c. 18 L. 335/95; Circ. INPS annuale.

---

### ⚪ NR-8 BASSO — INPS 2026: contribFissi commerciante 4.611,63 vs formula 4.611,64

**File:** `app.js:437`

**Calcolo:** `18.808 × 24,48% = 4.604,20` + `7,44` = `4.611,64`. Codice `4.611,63`. Delta 1 cent. Trascurabile.

---

### ⚪ NR-1 BASSO — Test commento fuorviante `ceil2(0)` GS

**File:** `test/tax-engine.test.js:187-190`

Il commento "ceil2(0) produce 0.01 per effetto di Number.EPSILON nel motore — bug noto, non fixare qui" è errato: `ceil2` ha early-return su `!num`. Rimuovere il commento per chiarezza.

---

## PARTE 4 — Falsi positivi confermati

| Falso positivo | Conferma |
|---|---|
| EsigibilitaIVA mancante per N2.2 | ✅ opzionale per AdE FatturaPA v1.2 §2.2.2 |
| Hard-delete dev toggle | ✅ gated da `settings.devHardDelete`, confirm utente |
| IBAN bloccante | ✅ warning UI in `validateDraftForInvio:1055` |
| R7 bollo Q4 weekend | ✅ `pushDueRow` chiama `buildRolledDueDate` |
| Massimale GS in `app.js` | ✅ implementato con cap su `cappedBase` (riga 1485-1488); APERTO in `dichiarazione-engine.js` (vedi sopra) |

---

## Conclusione

**Branch `dev-taxaudit` NON pronto per merge in `main`.**

### Da chiudere prima del launch (ALTA priorità)

🔴 **Critici:**
1. **NR-10** — fallback regime sicuro per dicitura forfettario PDF.

🟡 **Alti (bypass / inconsistenze):**
2. **C-A2 bypass XML** — aggiungere check ritenuta-forfettario in `validateFatturaForXml` + forzare validate prima di preview/download.
3. **C-A3 visibilità IC** — esporre `icRigoDovuto` e `icTotale` in PDF e CSV; sanitize valori negativi e quota fuori range.
4. **A-A7 soglia 77,47 €** — `emetteRimborsoBollo` deve includere la soglia.
5. **REG-2** — aliquota GS fallback 26.07 (non 26.23).
6. **NR-2** — bloccare in `validateDraftForInvio` cliente IT senza P.IVA né CF.
7. **NR-3** — strip prefisso paese da `IdCodice` per cliente UE.

### Migliorabili (MEDIA priorità, post-launch)

🟢 REG-3 (RR21 GS), REG-4 (LM47 alias), NR-6 (watermark colore B/N), NR-7 (warning RT severity), RR massimale GS, A-A8 nota custom concatenazione.

### Cosmetici (BASSA priorità)

⚪ A-A6 UX uppercase normalizzazione, NR-8 1 cent commerciante, NR-1 commento test.

### Gap funzionali ancora aperti

- UI input dedicata per cripto-attività in Quadro RW (form con `exchange`, `walletAddress`, `valoreFinale`, `quotaPossesso`).
- Quadro RT generation (plusvalenze cripto, art. 67 TUIR).
- Ravvedimento operoso (gap audit precedente, ancora non implementato).
- Trasmissione Entratel (gap noto, accettabile fuori scope).

### Stima cassa Mattia/Peru

I rilievi personali del precedente audit (P-M1/P-M2 INPS art-comm vs GS, P-P1 5% start-up Peru) **restano aperti** — sono verifiche documentali extra-app che il contribuente deve eseguire sul cassetto previdenziale INPS. Non risolvibili via codice.

---

## Note metodologiche

- 3 explore-agent paralleli, cross-check ostile su ogni rilievo.
- Lettura diretta del codice sorgente per ogni claim del commit message.
- Fonti citate: AdE, GdF, INPS, normativa primaria; nessun riferimento a fonti non ufficiali.
- L'auditor non ha fatto stress test runtime, solo audit statico del codice.
- Test suite verde non implica conformità fiscale: indica solo l'assenza di regressioni rispetto ai test scritti, che possono mancare casi edge.
