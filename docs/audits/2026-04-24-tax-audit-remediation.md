# Remediation fiscale — piano dettagliato

**Input:** `2026-04-24-tax-audit.md` · **Branch:** `dev-taxaudit`

Ogni item ha:
- **Stato attuale** · **Regola** · **Comportamento atteso** · **Passi fix** · **Test** · **Rischio se non fixato**

Ordinati per priorità (blocker fiscali pre-launch, poi bug, poi rischi).

---

## BLOCKER B1 — XML cessionario PF emette `<Denominazione>` invece di `<Nome>/<Cognome>`

**File:** `fatture-docs-feature.js:1700`

**Stato attuale:**
```javascript
'<Denominazione>' + xmlEscape(String(cliente.nome || '').slice(0, 80)) + '</Denominazione>'
```
Usato per **tutti** i cessionari, inclusa la persona fisica italiana.

**Regola:** FatturaPA v1.2 tracciato `1.4.1.3.1` (CessionarioCommittente/DatiAnagrafici/Anagrafica) richiede:
- **PG** (ha P.IVA o Denominazione sociale) → elemento `<Denominazione>`
- **PF** (persona fisica, no P.IVA o solo CF) → elementi `<Nome>` + `<Cognome>` (entrambi obbligatori, esclusivi con Denominazione)
- **Ditta individuale** (PF con P.IVA) → ammesse entrambe, ma best practice AdE è `<Denominazione>` = ragione sociale o `<Nome>/<Cognome>` = titolare

**Comportamento atteso:** classificare cliente come PF/PG in base a presenza di P.IVA/CF/denominazione e emettere il tag corretto.

**Passi fix:**
1. In `fatture-docs-feature.js` aggiungere helper `buildAnagraficaXml(cliente)` che ritorna stringa `<Anagrafica>...</Anagrafica>`:
   - Se `cliente.partitaIva` presente (11 cifre IT valide) OR `cliente.denominazione/ragioneSociale` non vuoto → `<Denominazione>`
   - Se solo `cliente.codiceFiscale` (16 char, no P.IVA) AND `cliente.nome` + `cliente.cognome` presenti → `<Nome>` + `<Cognome>`
   - Caso ambiguo (solo `cliente.nome` monco) → fallback a `<Denominazione>` con warning console
2. Sostituire riga 1700 con chiamata all'helper
3. Aggiornare modello cliente `normalizeCliente` per introdurre campi `nome`/`cognome` separati se mancano (già presenti per anagrafica emittente)
4. UI `#clienteModal` — aggiungere switch tipo cliente (PF / PG / Ditta individuale / Estero) che abilita campi coerenti

**Test (`test/fatture-xml-anagrafica.test.js`, nuovo):**
- cliente con P.IVA → emette `<Denominazione>`
- cliente con solo CF + nome/cognome → emette `<Nome>/<Cognome>`
- cliente senza dati validi → rifiuta build XML con errore chiaro
- retrocompatibilità: cliente legacy con solo `nome` → fallback Denominazione + warning

**Rischio se non fixato:** SdI rifiuta le fatture a persone fisiche italiane (B2C). Utente non può emettere fatture a privati conformi — blocca uso produttivo.

---

## BLOCKER B2 — Natura N2.1 per clienti esteri è sbagliata

**File:** `fatture-docs-feature.js:1529`

**Stato attuale:**
```javascript
const naturaLinea = clienteEstero ? 'N2.1' : 'N2.2';
```

**Regola:**
- **N2.1** = "operazioni non soggette a IVA ai sensi degli artt. da 7 a 7-septies del DPR 633/72" (riservato a operazioni extraterritoriali IVA ordinario)
- **N2.2** = "operazioni non soggette – altri casi"
- Forfettario opera fuori dal campo IVA per art. 1 c. 58 L. 190/2014, **non** per gli artt. 7-7septies → la natura corretta è **N2.2 sempre**, anche verso UE/Extra-UE

**Riferimento:** Guida AdE fatturazione elettronica v1.7 (2020), Circolare AdE 9/E 2019 §4.1 (regime forfettario).

**Comportamento atteso:** `naturaLinea = 'N2.2'` sempre per forfettario (RF19), indipendentemente dal cliente.

**Passi fix:**
1. Sostituire riga 1529 con `const naturaLinea = 'N2.2';`
2. Aggiungere commento con riferimento normativo
3. Se in futuro regime passa a ordinario, la natura va calcolata in base all'operazione (N6.x reverse-charge, N2.1 per art.7-7septies, ecc.) — scope out

**Test:** modificare `test/fatture-import-xml.test.js` o aggiungere caso in XML builder test: forfettario con cliente estero → Natura deve essere N2.2.

**Rischio se non fixato:** XML formalmente accettato da SdI (sono entrambe nature valide), ma fattura classificata male a fini fiscali → possibili contestazioni AdE. Inoltre N2.1 verso UE B2B è concettualmente errata per un regime fuori IVA.

---

## BLOCKER B3 — Quadro LM incompleto (manca LM38, LM40, LM42)

**File:** `dichiarazione-engine.js:99-108`

**Stato attuale:** `buildQuadroLM` ritorna solo LM1, LM2, LM3, LM4, LM34, LM36, LM47. Manca la sezione finale di imposta/saldo/acconti.

**Regola:** Istruzioni Modello Redditi PF 2026, quadro LM sez. II (commi 54-89 L. 190/2014):
- **LM38** = imposta lorda = LM34 × aliquota/100 (5% o 15%) — *parzialmente presente come LM36 ma il rigo corretto in sez. II è LM38 per il 2026*
- **LM39** = detrazioni e crediti d'imposta (se presenti)
- **LM40** = imposta netta = LM38 − LM39
- **LM41** = ritenute subite (importo già trattenuto da sostituti)
- **LM42** = crediti/eccedenze anno precedente (compensazione)
- **LM43** = acconti versati in F24 per l'anno di riferimento (1° + 2°)
- **LM45** = imposta a debito (se > 0 → saldo da versare) oppure LM46 = a credito

**Verifica**: il mapping rigo-codice varia anno per anno; *prima del fix* recuperare istruzioni ufficiali modello "Redditi PF 2026" (anno d'imposta 2025) sezione LM per i codici rigo esatti.

**Comportamento atteso:** l'engine deve:
1. Calcolare imposta netta dopo detrazioni
2. Sottrarre ritenute, crediti, acconti
3. Produrre saldo finale (a debito o a credito)
4. Distinguere 1° e 2° acconto per anno successivo (40/60 se > 257,52 €)

**Passi fix:**
1. Leggere istruzioni AdE Modello Redditi PF 2026 (online, PDF scaricabile) per confermare codici LM38-LM46
2. Aggiungere in `buildQuadroLM`:
   - `LM38 = Math.round(LM34 * aliquota/100 * 100) / 100`
   - `LM39` override da input (detrazioni rare per forfettario, di norma 0)
   - `LM40 = Math.max(0, LM38 - LM39)`
   - `LM41` = ritenute subite (dalle fatture emesse con ritenuta → somma `ritenuta` sulle fatture `pagata` nell'anno)
   - `LM42` = credito anno precedente (da input)
   - `LM43` = acconti versati (da `pagamenti` tipo=tasse con descrizione match regex acconto)
   - `LM45/LM46` = saldo a debito o a credito
3. Aggiungere calcolo acconti per anno successivo: `accontoAnnoSucc = LM40 × 1.0` (o ridotto per start-up), split 40/60 se > 257,52 €

**Test (`test/dichiarazione-engine.test.js`):**
- caso base: LM34 = 20k, aliquota 15% → LM38 = 3k, LM40 = 3k (no det), LM43 = 0 → LM45 = 3k
- con ritenute: LM41 = 500 → saldo = 2500
- con acconti: LM43 = 1500 → saldo = 1000
- a credito: LM43 > LM40 → LM46 = eccedenza
- start-up 5%: LM34 = 20k, aliquota 5% → LM38 = 1000

**Rischio se non fixato:** dichiarazione incompleta; utente non sa quanto versare in F24 a saldo/acconti; esportazioni C2/C3 inutili per uso fiscale reale.

---

## BLOCKER B4 — Quadro RR sez. I incompleto (manca RR40, RR41)

**File:** `dichiarazione-engine.js:110-154`

**Stato attuale:** calcola RR4 (totale contributi dovuti) ma RR8 (saldo) non sottrae gli acconti INPS già versati.

**Regola:** Istruzioni Redditi PF 2026, quadro RR sez. I (art-comm):
- **RR4** = contributi totali dovuti (fissi + variabili)
- **RR5** = contributi minimali già dovuti (informativi, già versati nelle 4 rate fisse)
- **RR6** = contributi eccedenti il minimale
- **RR7** = acconti versati nell'anno
- **RR8** = saldo dovuto = RR6 − RR7 (se > 0, altrimenti credito)

Per GS (sez. II):
- **RR11-RR13** = contributi GS dovuti, acconti versati, saldo

**Comportamento atteso:** engine deve leggere `yearData.pagamenti` tipo=contributi, filtrare quelli categorizzati come acconto, e sottrarli.

**Passi fix:**
1. In `buildQuadroRR` aggiungere `RR7` (o `RR12` per GS) calcolato da `yearData.pagamenti`:
   - Filtrare pagamenti con `tipo === 'contributi'` e `linkedKeys` che matchano acconto INPS variabile dell'anno
   - Sommare importi
2. `RR8 = Math.max(0, RR6 - RR7)` + rigo saldo a credito se negativo

**Test:**
- pagamenti con 2 acconti INPS variabili da 500 → RR7 = 1000
- saldo = RR6 - RR7
- GS: RR12 simmetrico

**Rischio se non fixato:** saldo INPS sovrastimato; utente paga due volte (già versato come acconto + saldo gonfiato).

---

## BUG C1 — Saldo imposta anno N non sottrae acconti già versati

**File:** `app.js:4753-4769`

**Stato attuale:** saldo anno N = `currentApplied.tasse − impostaAcconti.total` usa l'importo *calcolato* degli acconti, non i versamenti *effettivi* registrati.

**Regola:** Il saldo è per definizione `imposta dovuta − acconti effettivamente versati`. Se l'utente ha pagato meno del dovuto (o nulla) del primo acconto, il saldo deve aumentare.

**Comportamento atteso:**
- Anno chiuso (passato): saldo storico fisso, lasciare com'è
- Anno aperto (corrente): sommare `pagamenti[]` con `linkedKeys` che matchano acconto → sottrarre quella somma da `currentApplied.tasse`

**Passi fix:**
1. Isolare helper `getAccontiVersatiForYear(year, tipo)` che scorre `getPagamenti()` e somma gli importi con `linkedKeys` che iniziano con `imposta_acc1_{year}` o `imposta_acc2_{year}`
2. Nel calcolo saldo imposta (riga 4753-ish):
   ```javascript
   const isAnnoCorrente = year === getCurrentYear();
   const accontiVersati = isAnnoCorrente ? getAccontiVersatiForYear(year, 'imposta') : impostaAcconti.total;
   const saldoNetto = Math.max(0, currentApplied.tasse - accontiVersati);
   ```
3. Simmetrico per contributi variabili (linkedKeys `contributi_acc1_{year}`, `contributi_acc2_{year}`)

**Test manuale:** impostare anno corrente, versare 1° acconto da scadenziario → saldo si riduce della quota versata.

**Rischio se non fixato:** saldo visualizzato gonfiato → utente paga due volte o disinforma se stesso sul dovuto reale.

---

## BUG C2 — 1° acconto imposta non segue override saldo

**File:** `app.js:4537-4549`

**Stato attuale:** Il 1° acconto N scade sempre 30 giugno, anche se `overrideSaldoImposta` sposta il saldo N-1 (es. proroga AdE al 31/8).

**Regola:** Art. 17 DPR 435/2001 e proroghe annuali: saldo imposta anno N-1 + 1° acconto anno N scadono lo **stesso giorno**. Quando AdE proroga (DPCM), scivolano insieme.

**Comportamento atteso:** `overrideSaldoImposta` deve spostare entrambi. Idem `overrideSaldoContributi` per 1° acconto contributi variabili.

**Passi fix:**
1. In `app.js:4537-4549`, leggere l'override e applicarlo anche al 1° acconto:
   ```javascript
   const dueMonth = overrideSaldoImposta ? overrideSaldoImposta.month : FORFETTARIO_RULES.saldoMonth;
   const dueDay = overrideSaldoImposta ? overrideSaldoImposta.day : FORFETTARIO_RULES.saldoDay;
   ```
2. Simmetrico per `overrideSaldoContributi`

**Test manuale:** impostare override saldo imposta al 31/08 → sia saldo N-1 sia 1° acconto N mostrano scadenza 31/08.

**Rischio se non fixato:** date discordanti; utente versa 1° acconto alla data sbagliata se fa riferimento all'app.

---

## BUG C3 — XML `DatiGeneraliDocumento` element order non garantito

**File:** `fatture-docs-feature.js:1717` (template string)

**Stato attuale:** il template emette `${xmlRitenuta}${datiBollo}` inline; se `DatiRitenuta` è vuoto, `DatiBollo` può finire prima di `ImportoTotaleDocumento` nell'ordine giusto solo per fortuna, ma non è garantito per il futuro.

**Regola:** XSD `fatturaordinaria_v1.2.xsd` ordine elementi `<DatiGeneraliDocumento>`:
1. `TipoDocumento`
2. `Divisa`
3. `Data`
4. `Numero`
5. `DatiRitenuta` (0..N)
6. `DatiBollo` (0..1)
7. `DatiCassaPrevidenziale` (0..N)
8. `ScontoMaggiorazione` (0..N)
9. `ImportoTotaleDocumento` (0..1)
10. `ArrotondamentoSomme` (0..1)
11. `Causale` (0..N)
12. `Art73` (0..1)

**Passi fix:**
1. Rifattorizzare il blocco `<DatiGeneraliDocumento>` usando un array concatenato:
   ```javascript
   const parts = [];
   parts.push('<TipoDocumento>' + tipoDoc + '</TipoDocumento>');
   parts.push('<Divisa>EUR</Divisa>');
   parts.push('<Data>' + data + '</Data>');
   parts.push('<Numero>' + progressivo + '</Numero>');
   if (ritenuta > 0) parts.push(buildDatiRitenuta(...));
   if (bolloApplicabile) parts.push(buildDatiBollo(...));
   parts.push('<ImportoTotaleDocumento>' + fmtXmlNum(totale * sign) + '</ImportoTotaleDocumento>');
   if (causale) parts.push('<Causale>' + xmlEscape(causale) + '</Causale>');
   const datiGenerali = '<DatiGeneraliDocumento>' + parts.join('') + '</DatiGeneraliDocumento>';
   ```
2. Aggiungere validatore XSD post-build (se disponibile libreria) oppure smoke test con esempio ufficiale AdE

**Test:**
- fattura con ritenuta + bollo → ordine corretto
- fattura senza ritenuta con bollo → `DatiBollo` resta in posizione 6
- fattura senza ritenuta né bollo → non emessi, `ImportoTotaleDocumento` direttamente dopo `Numero`

**Rischio se non fixato:** SdI rifiuta fatture con ordine XSD non conforme. Attualmente probabilmente funziona per casi comuni ma fragile.

---

## BUG C4 — LM3 contributi deducibili per competenza invece di cassa

**File:** `dichiarazione-engine.js:69-82`

**Stato attuale:**
```javascript
var contribFissi = parseFloat(settings.contribFissi) || 0;
// ...
var contribVar = calcolato su lm2 - minimale
// somma teorica, non cashflow reale
```

**Regola:** Art. 1 c. 64 L. 190/2014: sono deducibili **i contributi previdenziali obbligatori versati in ottemperanza a disposizioni di legge**. La deduzione è **per cassa** — solo contributi effettivamente pagati nell'anno.

**Comportamento atteso:** LM3 = somma `pagamenti[]` dell'anno con `tipo === 'contributi'` (tutti: fissi, variabili saldo/acconti).

**Passi fix:**
1. In `buildQuadroLM` sostituire il calcolo teorico con lettura da `yearData.pagamenti`:
   ```javascript
   var contribuPagatiInYear = (yearData.pagamenti || [])
     .filter(function(p) { return p.tipo === 'contributi' && new Date(p.data).getFullYear() === year; })
     .reduce(function(sum, p) { return sum + (parseFloat(p.importo) || 0); }, 0);
   var lm3 = Math.round(contribuPagatiInYear * 100) / 100;
   ```
2. Mantenere `overrides.LM3_value` come escape manuale
3. Rimuovere `riduzione35` dal calcolo (la riduzione è già applicata quando si versa, quindi il pagato riflette il valore ridotto)

**Test:**
- pagamenti: 3 rate fissi art-comm 1000 + 1 acconto variabile 500 = 3500 → LM3 = 3500
- override presente → usa override
- nessun pagamento → LM3 = 0 (caso onboarding primo anno)

**Rischio se non fixato:** dichiarazione con deduzione non corretta (sovra o sottostimata) → rischio accertamento AdE.

---

## RISCHIO R1 — Aliquota start-up 5% senza verifica requisiti

**File:** `dichiarazione-engine.js:54`

**Stato attuale:** `aliquota = parseFloat(settings.impostaSostitutiva) || 15` — se utente imposta 5 senza averne diritto, il calcolo passa.

**Regola:** Art. 1 c. 65 L. 190/2014 — requisiti start-up (cumulativi):
1. Non aver esercitato attività artistica, professionale o d'impresa nei 3 anni precedenti l'inizio
2. L'attività non è mera prosecuzione di altra già svolta (eccetto praticantato obbligatorio)
3. Se prosegue attività svolta da altro soggetto, i ricavi realizzati nel periodo d'imposta precedente all'inizio non devono superare la soglia di accesso

Durata: **5 anni** dall'apertura P.IVA.

**Passi fix:**
1. Aggiungere funzione `validateStartupAliquota(settings, year)`:
   ```javascript
   function validateStartupAliquota(settings, year) {
     var errs = [];
     var warn = [];
     var inizio = settings.attivita && settings.attivita.dataInizioAttivita;
     if (!inizio) { warn.push('Data inizio attività non impostata'); return { ok: false, errs, warn }; }
     var annoInizio = parseInt(String(inizio).slice(0, 4), 10);
     if (!Number.isFinite(annoInizio)) { warn.push('Data inizio non parseable'); return { ok: false, errs, warn }; }
     var anniTrascorsi = year - annoInizio;
     if (anniTrascorsi > 4) errs.push('Start-up scaduto (>' + 5 + ' anni da ' + annoInizio + ')');
     // flags manuali da settings
     if (!settings.startupConfermaRequisiti) warn.push('Requisiti start-up non confermati manualmente (3 anni senza attività, no prosecuzione)');
     return { ok: errs.length === 0, errs: errs, warn: warn };
   }
   ```
2. In `validateDichiarazione`, se aliquota = 5 chiamare `validateStartupAliquota` e push errors/warnings
3. UI `settings.startupConfermaRequisiti` checkbox in profilo attività

**Test:**
- anno 2020 inizio + dichiarazione 2026 → errore "start-up scaduto"
- anno 2023 inizio + conferma requisiti → OK
- aliquota 15% → validate skip

**Rischio se non fixato:** utente applica 5% senza diritto → accertamento AdE + sanzioni (ricalcolo con 15%).

---

## RISCHIO R2 — Quadro RW senza check soglie IVAFE/IVIE

**File:** `dichiarazione-engine.js:201-214`

**Stato attuale:** `buildQuadroRW(contiEsteri)` accetta array senza validare soglie.

**Regola:**
- **IVAFE** (imposta valore attività finanziarie estere): 0,2% su conti correnti, prodotti finanziari, etc. Esente solo se giacenza media annua **≤ 5.000 €** e saldo massimo **≤ 15.000 €** (Circ. AdE 2/E 2013)
- **IVIE** (imposta valore immobili esteri): 0,76% su immobili; esente se importo dovuto < 200 €
- **Monitoraggio RW**: obbligatorio indipendentemente dalle soglie di tassazione se detenuti durante l'anno (anche < 15k)

**Passi fix:**
1. Aggiungere `validateRW(contiEsteri)`:
   - Per ogni conto: se `valoreFinale === 0 && giacenzaMedia === 0` → skip monitoraggio
   - Altrimenti: push warning se sotto soglia IVAFE (utente potrebbe essere esente da imposta ma obbligato al monitoraggio)
2. In `buildQuadroRW`, ogni rigo deve avere `giorniDetenzione` (richiesto) e `imposteCalcolate`
3. UI step RW (wizard step 6) aggiungere campi `giorniDetenzione`, `tipoAttivita` (conto / immobile / partecipazione)

**Rischio se non fixato:** dimenticanza RW = sanzione 3-15% del valore non dichiarato (D.L. 167/1990 art. 5).

---

## RISCHIO R3 — `perditePregresse` senza check scadenza temporale

**File:** `dichiarazione-engine.js:89-90`

**Stato attuale:** `lm34 = max(0, lm4 - perditePregresse)` senza verificare se le perdite sono ancora utilizzabili.

**Regola:** Art. 84 TUIR per forfettario (comma 1 art. 8 TUIR richiamato): perdite fiscali **riportabili per 5 anni** dall'anno di formazione (regola generale post riforma 2019).

**Passi fix:**
1. Modificare shape `overrides.LM_perditePregresse` da numero a array `[{annoFormazione, importo}]`
2. In `buildQuadroLM`: filtrare perdite con `year - annoFormazione <= 5` prima della somma
3. Warning se perdite escluse perché scadute
4. UI: step LM — input multi-riga per perdite con anno

**Rischio se non fixato:** deduzione perdite scadute → accertamento.

---

## RISCHIO R4 — Limite forfettario hardcoded 85k/100k

**File:** `dichiarazione-engine.js:313-317`

**Stato attuale:** warning hardcoded su 85k/100k.

**Regola:** Soglia 85.000 € fissata dalla L. 197/2022 (Legge di Bilancio 2023). Può cambiare con leggi di bilancio future.

**Passi fix:**
1. Sostituire con `settings.limiteForfettario || 85000` (già presente in settings)

**Rischio se non fixato:** informazione potenzialmente obsoleta se il legislatore modifica la soglia.

---

## RISCHIO R5 — `sanitizeProgressivoInvio` tronca silenziosamente

**File:** `fatture-docs-feature.js:31-32`

**Stato attuale:** `String(s).replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || '00001'`

**Regola:** Tracciato FatturaPA `1.1.2 ProgressivoInvio` max 10 alfanumerici.

**Passi fix:**
1. Aggiungere check upfront in `validateDraftForInvio`: se `sanitizeProgressivoInvio(numero)` differisce dal previsto (es. troncato), errore bloccante "numero fattura non valido per SdI (max 10 alfanumerici dopo normalizzazione)"
2. In `openFatturaModal`, la numerazione auto deve produrre stringhe sempre ≤ 10 char sanitized

**Rischio se non fixato:** due fatture diverse possono generare stesso ProgressivoInvio troncato → SdI scarta la seconda con errore.

---

## RISCHIO R6 — Data NC validata solo in `saveFatturaDraft`

**File:** `fatture-docs-feature.js:1018-1024` (validateDraftForInvio) vs `previewFatturaXml`/`downloadFatturaXml`

**Stato attuale:** `FattureNCSync.isNCDateValid(draft.data, orig.data)` chiamato solo in save, non in anteprima/download XML. Utente può scaricare XML NC antidatato.

**Passi fix:**
1. In `buildFatturaElettronicaXml` (inizio funzione), se `tipoDocumento === 'TD04'` e `fatturaOriginaleId` presente, recuperare originale e validare data
2. Se invalida, throw error bloccante
3. In UI: disabilitare bottoni "Scarica XML" / "Anteprima XML" se bozza ha data NC anteriore a originale

**Rischio se non fixato:** utente scarica XML TD04 antidatato, lo invia manualmente a SdI → rifiutato.

---

## RISCHIO R7 — Bollo Q4 anno precedente hardcoded senza `buildRolledDueDate`

**File:** `app.js:4678-4715`

**Stato attuale:** scadenza 28/2 hardcoded, non slitta in caso di weekend.

**Passi fix:**
1. Sostituire `pushDueRow(2, 28, ...)` con `const due = buildRolledDueDate(year, 2, 28); pushDueRow(due.month, due.day, ...)`

**Test:** anno 2026 → 28/2/2026 è sabato, deve slittare a lunedì 2/3/2026.

**Rischio se non fixato:** utente paga bollo sabato o tenta di farlo via home banking (chiuso) → tardivo.

---

## RISCHIO R8 — Soglia unico acconto con operatore incoerente tra file

**File:** `app.js:4073` (`<`) vs `tax-engine.js:80` (`<=`)

**Stato attuale:** incoerenza. Se entrambi i rami sono attivi, comportamento può differire a `base = 257,52 €` esatti.

**Regola:** Art. 17 DPR 435/2001 c. 3: "l'acconto non è dovuto se l'importo ... è inferiore a 51,65 €. L'acconto non è dovuto nella prima rata se l'importo ... è inferiore a 257,52 €". Quindi: `< 257,52 €` → acconto unico; `≥ 257,52 €` → split 40/60. L'operatore corretto è `<` (strict).

**Passi fix:**
1. `tax-engine.js:80` cambiare da `<=` a `<`
2. Verificare altre occorrenze con `grep` e allineare tutte

**Rischio se non fixato:** minimal — a `base = 257,52` esatto, divergenza tra display e calcolo.

---

## RISCHIO R9 — Contributi saldo N-1 senza storico né `primoAnno*` = 0

**File:** `app.js:4589-4607` vs nota UI `app.js:4481`

**Stato attuale:** incoerenza testuale — nota dice "stima su anno N", codice mette 0.

**Passi fix:**
1. Allineare nota UI al comportamento: "senza storico anno precedente, saldo contributi N-1 non calcolabile"
2. OPPURE attivare stima su base anno N con disclaimer (preferito per UX primo anno)

**Rischio:** solo comunicativo.

---

## RISCHIO R10 — Quadro RS forfettario senza disclaimer "informativo"

**File:** `dichiarazione-engine.js:156-178` + UI

**Passi fix:**
1. Nella UI step Quadro RS: banner informativo "I dati RS372-RS381 sono informativi e NON riducono l'imposta sostitutiva"
2. Nei righi generati, aggiungere `isInformativo: true` come meta

**Rischio:** confusione utente.

---

## Ordine di esecuzione raccomandato

**Fase 1 — Blocker XML (SdI compliance):**
1. B1 (anagrafica PF)
2. B2 (Natura N2.2)
3. C3 (XSD element order)
4. R5 (ProgressivoInvio validation)
5. R6 (data NC validation)

**Fase 2 — Blocker Dichiarazione (compilabilità):**
6. B3 (LM38-46)
7. B4 (RR40-41)
8. C4 (LM3 per cassa)

**Fase 3 — Bug Scadenziario:**
9. C1 (saldo N − acconti versati)
10. C2 (1° acconto segue override)
11. R7 (bollo Q4 prev)
12. R8 (soglia `<` vs `<=`)

**Fase 4 — Validazioni / safeguards:**
13. R1 (start-up 5% requisiti)
14. R2 (RW soglie)
15. R3 (perdite scadute)
16. R4 (limite forfettario da settings)
17. R9 (nota UI saldo contributi N-1)
18. R10 (disclaimer RS)

**Stima**: 18 fix, ~4-6 task per fase → 1 giorno di lavoro con subagent-driven-development disciplinato.

---

## Note operative sulla conformità

- **Riferimenti normativi** sempre citati nei commit messages e nei test
- **Test regressione** obbligatorio per ogni fix: copre il comportamento pre-fix (fallimento) e post-fix (successo)
- **Fonte di verità** per istruzioni Modello Redditi PF 2026: <https://www.agenziaentrate.gov.it> sezione "Modelli e istruzioni"
- **Fonte di verità** per tracciato FatturaPA v1.2: <https://www.fatturapa.gov.it> specifiche tecniche
- Prima di B3/B4, **scaricare manualmente le istruzioni AdE 2026** per confermare codici rigo (LM38 vs LM47, RR7 vs RR40, ecc.) — alcuni numeri in questo documento sono nominali e vanno validati sul PDF ufficiale dell'anno di competenza
