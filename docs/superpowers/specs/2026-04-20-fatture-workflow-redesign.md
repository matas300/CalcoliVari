# Fatture — Workflow stati + unificazione store

**Data**: 2026-04-20
**Branch**: `codex/dev-newfeatures`
**Stato**: Design approvato, pending writing-plans.

## 1. Contesto e problema

L'app ha attualmente **due store paralleli** per le fatture:

- `data.fatture[month]` (monthly) — letto da bollo trimestrale, budget, dashboard, scadenziario, tasse accantonate, cross-year, forfettario engine.
- `fattureEmesse` (array) — letto da archivio, XML/PDF, workflow stati.

Il bridge `upsertInvoiceRowInYearData` li sincronizza ma è fragile: la fix di sessione 2026-04-21 ("skip TD04 in upsert" per non mostrare NC negli incassi manuali) ha rotto il calcolo bollo trimestrale perché `calcBolloPerQuarter` legge solo dal monthly store.

Il workflow stati bozza→inviata→pagata + NC è stato implementato ma ha bug nascosti (es. `normalizeFatturaEmessa` che strippava campi workflow) dovuti proprio alla complessità dei due store.

## 2. Obiettivo

Unificare su **`fattureEmesse` come unica fonte di verità**, deprecare il monthly store, e chiudere il workflow stati + NC in modo consistente cross-feature.

## 3. Decisioni di design (approvate)

- **D1 — Single store**: `fattureEmesse` è fonte di verità. `data.fatture[month]` deprecato (mantenuto read-only come backup migrazione).
- **D2 — Migrazione automatica**: al primo load, righe legacy senza `invoiceId` vengono promosse a fatture sintetiche `origine='legacy-migrated'`, stato `pagata`.
- **D3 — Tabella mensile**: mostra tutto tranne `bozza`. NC visibili con importo negativo in rosso.
- **D4 — Hard-delete dev toggle**: setting `devHardDelete` per bypass workflow in fase di test. Banner warning attivo, pulsante nascosto in produzione.
- **D5 — OCR PDF**: predisposto ma non sviluppato (sub-progetto post-audit UI). Hook UI + schema `pdfAllegato` + stub `window.FattureOCR` con Tesseract.js come tech target.

## 4. Schema dati

### 4.1 Fattura (unificato)

```js
{
  id: string,
  numero: string,              // "YYYY/NNN"
  data: 'YYYY-MM-DD',          // data emissione
  anno: number,                // = anno emissione (competenza)
  annoProgressivo: number,
  progressivo: number,
  righe: [{ descrizione, quantita, prezzoUnitario }],
  clienteSnapshot: object|null,
  ritenuta, aliquotaRitenuta, tipoRitenuta, causaleRitenuta,
  contributoIntegrativo, marcaDaBollo,

  // Workflow
  stato: 'bozza'|'inviata'|'pagata'|'stornata',
  tipoDocumento: 'TD01'|'TD04',
  dataInvioSdi: 'YYYY-MM-DD'|null,
  dataPagamento: 'YYYY-MM-DD'|null,

  // Incasso (spostato da riga monthly a fattura)
  pagMese: 1..12|null,
  pagAnno: number|null,

  // NC (TD04)
  fatturaOriginaleId: string|null,
  tipoStorno: 'totale'|'parziale'|null,
  ncIds: string[],             // su originale: id delle NC collegate
  ncTotaleImporto: number,     // su originale: somma NC

  // Origine
  origine: 'wizard'|'manuale'|'legacy-migrated'|'ocr-import',
  pdfAllegato: { name, dataUrl }|null,

  // OCR (predisposto, non usato in questo spec)
  _ocrRawText: null,
  _ocrConfidence: null,
  _ocrFieldsExtracted: null
}
```

### 4.2 Settings nuovi

- `settings.devHardDelete: boolean` (default false)
- `data._fattureMigratedAt: ISO timestamp|undefined` (per-year)

## 5. Workflow stati

```
              ┌─────────┐  Salva   ┌──────────┐  Segna pagata  ┌─────────┐
     nuova → │  bozza  │ ──────→  │ inviata  │ ────────────→  │ pagata  │
              └─────────┘          └──────────┘                 └─────────┘
                  │                     │                           │
                  │ × Elimina           └───── NC totale ──────┬────┘
                  ▼                                            ▼
               deleted                                   ┌──────────┐
                                                         │ stornata │
                                                         └──────────┘
```

### 5.1 Regole per stato

| Stato | Editabile | In tabella mensile | Conta bollo | Azioni |
|---|---|---|---|---|
| bozza | Sì | No | No | Modifica, × Elimina, Salva (→ inviata) |
| inviata | No (solo data pag.) | Sì (mese = pagMese stimato da `settings.giorniIncasso`) | Sì | Segna pagata, Crea NC |
| pagata | No | Sì (mese = dataPagamento) | Sì | Crea NC |
| stornata | No | Sì (con netto = importo − ncTotaleImporto) | Sì | Vedi NC collegate |

### 5.2 NC (TD04) — regole

- NC ha proprio workflow (bozza→inviata→pagata) ma segno negativo nei conteggi.
- `tipoStorno='totale'` + stato NC diventa `inviata` → trigger: originale passa a `stornata`, `ncIds` aggiornato.
- `tipoStorno='parziale'`: somma delle NC parziali collegate ≥ totale originale → auto-stornata. Altrimenti originale resta `inviata`/`pagata`, ma l'importo effettivo in tabella mensile è `importo − ncTotaleImporto`.
- Eliminazione NC: stessa regola (solo bozza si cancella).

### 5.3 Hard-delete (modalità test)

- Checkbox in **Impostazioni → Debug**: *"Hard-delete fatture (solo test)"*.
- Quando attivo:
  - Pulsante `🗑 Hard delete` visibile in view-mode e archivio per qualsiasi stato.
  - Banner giallo in cima al tab Fatture: *"⚠ Hard-delete attivo"*.
  - Su click: `showAppConfirm` → rimuove da `fattureEmesse`. Se NC: aggiorna `ncIds[]` + `ncTotaleImporto` dell'originale, ricalcola stato originale (se era `stornata` per questa NC, torna `pagata`).
  - Console.warn per tracciabilità.

## 6. Migrazione legacy

### 6.1 Trigger
All'apertura del tab Fatture (o al login), per ogni anno in localStorage con `data.fatture` popolato e `data._fattureMigratedAt` assente.

### 6.2 Algoritmo
Per ogni mese `M` con righe in `data.fatture[M]`:
1. Se riga ha `invoiceId` → skip (già linked).
2. Se riga senza `invoiceId`:
   - Crea fattura sintetica:
     ```js
     {
       id: `legacy_${year}_${M}_${idx}_${Math.round(importo*100)}`,  // deterministic string, no hash needed
       numero: '—',
       data: `${year}-${String(M).padStart(2,'0')}-01`,
       anno: year,
       righe: [{ descrizione: r.desc || 'Incasso', quantita: 1, prezzoUnitario: r.importo }],
       clienteSnapshot: null,
       stato: 'pagata',
       tipoDocumento: 'TD01',
       pagMese: r.pagMese || M,
       pagAnno: r.pagAnno || year,
       origine: 'legacy-migrated'
     }
     ```
   - Push in `fattureEmesse`.
3. Set `data._fattureMigratedAt = new Date().toISOString()`.

### 6.3 Safety
- Idempotente: check su `id` deterministico (hash) evita duplicati.
- `data.fatture[M]` NON viene cancellato → rollback possibile.
- UI: legacy fatture hanno badge "Legacy" in archivio + pulsante "Completa dati" per arricchire (cliente, numero).

## 7. Selector nuovi

Helpers in un nuovo modulo `fatture-selectors.js` (o top di `fatture-docs-feature.js`):

```js
window.FattureSelectors = {
  // Tutte le fatture del profilo (cached per-call)
  all(profile) → Array<Fattura>,

  // Per mese (pagamento) — esclude bozza
  getByMonth(profile, year, month) → Array<Fattura>,

  // Per trimestre — include NC (segno già negativo nei calcoli consumer)
  getByQuarter(profile, year, quarter) → Array<Fattura>,

  // Per anno incasso — per forfettario per-cassa
  getByPagAnno(profile, year) → Array<Fattura>,

  // Cross-year: emesse in anno precedente ma incassate nell'anno
  getCrossYearPaidIn(profile, year) → Array<Fattura>,

  // Netto effettivo (importo − ncTotaleImporto)
  getNettoEffettivo(fattura) → number,

  // Importo signed per conteggi (NC negativi)
  getImportoSigned(fattura) → number
}
```

## 8. Feature da aggiornare

| File:fn | Cambio |
|---|---|
| `app.js` dashboard totals | Usa `FattureSelectors.getByMonth` invece di `data.fatture[M]` |
| `app.js:502` `calcBolloPerQuarter` | Usa `getByQuarter` — include NC negative |
| `app.js` `renderFatture` tabella mensile | Selector + render NC in rosso, stornate con netto |
| `app.js` `getCrossYearInvoices` | Usa `getCrossYearPaidIn` |
| `app.js` budget calc | Selector |
| `app.js` tasse accantonate | Selector |
| `scadenziario` / `tax-engine.js` `buildForfettarioScenario` | Input da selector |
| `fatture-docs-feature.js` `upsertInvoiceRowInYearData` | **Rimosso**. La fattura stessa contiene `pagMese`/`pagAnno`. |
| `fatture-docs-feature.js` `normalizeFatturaEmessa` | Già esteso in sessione precedente — verificare completezza |
| `fatture-storico.js` | Aggiungi filtro "Legacy" + azione "Completa dati" |
| `app.js` Impostazioni UI | Checkbox `devHardDelete` + banner warning |

## 9. Conteggi (regole di calcolo)

### 9.1 Incasso mensile (tabella "Tassato nel")
```
rows = FattureSelectors.getByMonth(profile, year, month)
       .filter(stato !== 'bozza')
totale = Σ getImportoSigned(f) per f in rows
// NC: importo negativo
// stornate: importo originale (resta visibile, netto separato in colonna)
```

### 9.2 Bollo trimestrale
```
fatture_Q = FattureSelectors.getByQuarter(profile, year, quarter)
           .filter(stato IN ['inviata', 'pagata', 'stornata'] OR (tipoDoc='TD04' AND stato IN ['inviata','pagata']))
imponibile_Q = Σ getImportoSigned(f)  // NC sottraggono
bolloDovuto = imponibile_Q > 77.47
```

### 9.3 Ricavi anno (forfettario, per cassa)
```
fatture_anno = FattureSelectors.getByPagAnno(profile, year)
              .filter(stato IN ['inviata','pagata','stornata'] + NC inviata/pagata)
ricavi = Σ getImportoSigned(f)
// Stornate: se tipoStorno='totale', imponibile = 0 (NC compensa)
// Stornate parziali: imponibile = importo − ncTotaleImporto
```

## 10. OCR — hook predisposto

### 10.1 UI
- Pulsante **"📄 Importa da PDF"** nel tab Fatture (accanto a "Nuova fattura").
- In questo spec: al click → toast *"Funzione in arrivo — per ora carica il PDF e completa manualmente nel wizard"*.
- Modal upload accetta `.pdf`, salva `pdfAllegato: { name, dataUrl }` nel record fattura se creata.

### 10.2 Schema
Già in sezione 4.1: `pdfAllegato`, `_ocrRawText`, `_ocrConfidence`, `_ocrFieldsExtracted`.

### 10.3 API futura (stub non implementato)
```js
window.FattureOCR = {
  extractFromPdf(file) → Promise<{ rawText, fields, confidence }>,
  proposeInvoiceFromOcr(ocrResult) → Partial<Fattura>
}
```

### 10.4 Sub-progetto separato
Dopo l'audit UI tab-per-tab. Tech target: Tesseract.js (client-side, offline, no API key). Documentare in `project_fatture_ocr_import.md`.

## 11. Strategia testing

- **Manuale**: dataset di test (bozza, inviata, pagata, NC totale, NC parziale, stornata, legacy migrated) per ogni scenario.
- **Hard-delete on** per cleanup rapido tra test.
- **Cross-feature smoke**: dopo ogni modifica di stato, verificare dashboard, scadenziario, bollo, tabella mensile, budget.
- **Migrazione**: testare su profilo "Mattia" con dati storici reali. Backup localStorage prima.

## 12. Out of scope

- Storno NC parziale con editing righe (backlog esistente).
- Sviluppo OCR completo (sub-progetto separato post-audit UI).
- Tab D rimanenti: Budget, Spese, Impostazioni, Profili (audit UI in parallelo).
- Sync Firebase per il nuovo flag `devHardDelete` (resta locale, è dev-only).

## 13. Rischi

- **R1 — Regressione conteggi**: l'unificazione tocca molte feature. Mitigazione: selector con test unit, rollback via `data.fatture[M]` intatto.
- **R2 — Migrazione dati reali**: errore di hash → duplicati. Mitigazione: idempotenza + backup pre-migrazione.
- **R3 — Performance**: `fattureEmesse` cresce → selector lineari. Mitigazione: accettabile per scala single-user; se serve, indice in-memory per pagAnno.
- **R4 — Firebase sync**: `fattureEmesse` già sincronizzato (`PROFILE_META_KEYS`), nessun cambio. Ma `data.fatture` continuerà a sincronizzarsi come backup finché non viene rimosso.
