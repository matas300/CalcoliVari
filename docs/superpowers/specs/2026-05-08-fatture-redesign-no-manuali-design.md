# Fatture Redesign — Rimozione manuale + tabella stati + wipe legacy

**Data**: 2026-05-08
**Branch sorgente**: `revert-portafoglio-scadenziario` (current HEAD `3d9595a`)
**Stato**: design approvato, in attesa di plan d'implementazione.

## Contesto

Dopo il revert del Portafoglio v2 + Scadenziario v2, la tab Fatture mostra ancora la vecchia tabella mensile editabile "Incassi manuali (mensili)" che permette di digitare importi cella-per-cella senza creare una vera fattura (no cliente, no numero, no XML). Questo crea due problemi:

1. **Bug — fatture non aggregate per cliente in Tasse Accantonate**: i record mensili scritti via "Incassi manuali" entrano in `data.fatture[m]` che ha schema minimal (`{ importo, desc, pagMese, pagAnno }`) senza campo cliente. Il path moderno di `getFattureForAccantonamentoForYear` aggrega correttamente per `(mese, cliente)` solo per dati in `fattureEmesse`; per i legacy entra in fallback non aggregante.
2. **UX confusa**: l'utente non sa se sta creando una fattura formale o una nota interna. La tabella mensile coesiste con il wizard "+ Nuova fattura" e l'import XML, generando duplicati e fatture-fantasma con `progressivo=0` (mostrate come "—" dopo il fix `b5b2af4`).

Decisione utente (sessione 2026-05-08): rimuovere completamente la possibilità di inserimento manuale. Le fatture entrano in app **solo via wizard o import XML**. I dati legacy in `data.fatture[m]` vengono **wipe-ati** una sola volta perché l'utente li ri-importerà via XML quando vuole.

## Obiettivo

Trasformare la tab Fatture in una vista esclusivamente basata su `fattureEmesse` (single source of truth):
- **UI**: tabella unica con colonne `Numero | Cliente | Emessa | Incassata | Importo | Stato | Azione`. Nessun input editabile inline tranne il mini date-picker per "segna pagata".
- **Storage**: wipe one-time di `data.fatture[m]` per tutti i profili. Idempotente via flag `data._fattureManualeWiped`.
- **Effetto collaterale risolto**: Tasse Accantonate aggrega correttamente per cliente perché tutti i dati passano per il path moderno con `FattureSelectors`.

## Layout tab Fatture

```
┌─────────────────────────────────────────────────────────┐
│  Fatture 2026          [Archivio] [📄 XML] [+ Nuova]    │
│                                                         │
│  2 da incassare · €4.300 su 4 emesse quest'anno         │
│  [cross-year banner se dicembre] [conservation banner]  │
│  [Tutte (4)] [Da pagare (2)] [Pagate (1)] [Bozze (1)]   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ NUM    │ Cliente    │ Emessa │ Incass │ €    │ S│A│ │
│  │ —      │ ACME (n.n.)│   —    │   —    │ 1.200│ B│✉×││
│  │ 2026/3 │ Beta SpA   │ 02/03  │   —    │ 2.500│ I│€ │ │
│  │ 2026/2 │ ACME Srl   │ 18/02  │ 03/03  │ 1.800│ P│— │ │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  Fatturato 2026: €4.300 / €85.000 [progress 5%]         │
│  [eventuale info "Fatture YYYY tassate in altro anno"]  │
└─────────────────────────────────────────────────────────┘
```

### Stati visibili
- **BOZZA**: numero `—`, date `—`, badge `BOZZA`, azioni `✉` (segna inviata) e `×` (elimina bozza). Click sulla riga → modal completo.
- **INVIATA**: numero formale `YYYY/NNN`, data emessa, incassata `—`, badge `INVIATA`, azione `€` (segna pagata).
- **PAGATA**: numero, data emessa, data incassata in verde, badge `PAGATA`, nessuna azione (basta click riga per modal).
- **STORNATA / NC TD04**: numero, data emessa, eventuale incassata, badge `STORNATA` o `NC`, segno negativo sull'importo per TD04. Behavior come oggi.

### Flusso "segna pagata" inline

1. Click su `€` nella riga INVIATA → la cella "Incassata" diventa un mini-form:
   ```html
   <input type="date" value="2026-05-08"> [OK] [×]
   ```
   `value` default = `todayIso()`. La cella stato si colora di "in transit" (es. `background: rgba(76,175,80,.05)`).

2. **OK** → chiama `window.FattureStateMachine.markPagata(invoice, { dataPagamento: chosenDate })`. Salva via `FattureStorico.save`. Sync Firebase. Rerender + recalcAll.

3. **×** → annulla, ripristina `—` nella cella, niente save.

4. **Esc / blur senza OK** → annulla (per UX simile a inline edit).

### Date format
- Display: `DD/MM` quando l'anno è quello corrente, `DD/MM/YY` cross-year (es. fattura 2025 incassata in 2026).
- Input HTML: `type="date"` (formato ISO YYYY-MM-DD nativo del browser).

## Storage

### Wipe legacy data.fatture[m]

In `app-storage.js` → `ensureDataShape(target, year)`:

```js
// One-time wipe: data.fatture[m] è il legacy della tabella mensile rimossa.
// Tutti i dati validi sono in fattureEmesse (wizard + XML). Il wipe è idempotente.
if (target && !target._fattureManualeWiped) {
  if (target.fatture && Object.keys(target.fatture).some(k =>
    Array.isArray(target.fatture[k]) && target.fatture[k].length > 0)) {
    target._fattureManualeWipedBackup = JSON.parse(JSON.stringify(target.fatture));
  }
  target.fatture = {};
  target._fattureManualeWiped = new Date().toISOString();
}
```

Il backup `_fattureManualeWipedBackup` è precauzione zero-cost: se l'utente realizza che mancavano dati, possiamo rigenerarli da quel JSON. **Resta in localStorage**, non sync su Firebase (escluderlo dai key sync via `firebase-sync.js` PROFILE_META_KEYS oppure rendendolo non-enumerable). In realtà `data._fattureManualeWipedBackup` vive dentro `yearData`, non profile-meta, quindi viene già sincronizzato; aggiungere a Firebase sync ignore list.

### Cleanup orfani

- `data._fattureMigratedAt` (era usato dalla migration legacy → fattureEmesse): ortogonale al wipe, ma probabilmente ora orfano. **Lasciato dov'è per ora** — rimosso in cleanup futuro.

## Modifiche file

### Rimozioni
- `index.html`:
  - Linee 196-204: blocco `<div class="manuali-card">` con `<table id="fattureTable">`.
  - Linea 205: `<div class="incasso-section" id="incassoSection">` rimossa dalla sua posizione attuale; il contenuto (cross-year + progress bar) viene **incorporato direttamente in `renderFattureDocsSection`** o spostato in cima al pannello.
- `app-fatture.js`: cancellare l'intero file. Verificare prima che nessun altro modulo lo importi (search `renderFatture\b` in tutto il repo, eccetto `app-fatture.js` stesso e markdown). Rimuovere il tag `<script src="app-fatture.js">` da `index.html`.
- `app-fatture-helpers.js`: rimosso `setFatturaImporto`, `setFatturaDesc`, `setFatturaPagamento`, `addFattura` e i loro window.* exports.
- `app-shell.js`: in `switchToTab('fatture')` rimuove eventuali chiamate a `renderFatture()` (sostituite da `renderFattureDocsSection()`).

### Modifiche
- `fatture-docs-feature.js`:
  - `renderFattureDocsSection`: rewrite della costruzione `markup` per produrre tabella con colonne. Cell formatter helpers: `_formatDataEmessa(inv)`, `_formatDataIncassata(inv)`.
  - Nuova funzione `quickMarkPagataInlineFromCard(id)` — vedi sezione "Flusso segna pagata".
  - `_renderRowActions(inv)` helper per generare le azioni contestuali per stato. Nuova azione `€` per inviata che invoca inline picker.
  - Cross-year banner + progress bar limite forfettario integrati nel markup principale (sostituiscono `incassoSection` rimosso).
- `app-storage.js` → `ensureDataShape`: aggiungere blocco wipe legacy come da snippet sopra.
- `firebase-sync.js`: nel merge `yearData`, eliminare `_fattureManualeWipedBackup` da entrambi i lati (locale e cloud) prima di scrivere su Firestore. Il backup resta solo in localStorage del device che ha fatto il wipe. Rationale: dato sensibile + grosso (~potenzialmente decine di KB), inutile syncare.
- `style.css`: nuove regole per la table layout. Sostituire `.fatture-row` flex con `.fatture-table` grid o table CSS. Header `.fatture-table-head`. Date cell `.fatture-cell-date`. Mini date-picker overlay `.fatture-pagata-inline-form`.

### Test nuovi
- `test/fatture-legacy-wipe.test.js`: yearData con `data.fatture[3]=[{importo:5000}]` → dopo `ensureDataShape`, `data.fatture` è `{}`, `data._fattureManualeWiped` settato. Idempotenza: seconda chiamata non altera nulla.
- `test/fatture-quick-paid-inline.test.js`: `quickMarkPagataInlineFromCard('id')` con `dataPagamento` diversa da oggi → invoice salvata con `stato='pagata'` e `dataPagamento` corretta.
- `test/fatture-no-manuali-section.test.js` (smoke): `index.html` parsato, `<div class="manuali-card">` non presente.

### Test rimossi
- Eventuali test che testano `setFatturaImporto/Desc/Pagamento` o `addFattura` (cercare in `test/`).

## Effetti collaterali confermati

### Tasse Accantonate
Il codice in `app-accantonamento.js` (path moderno linee 14-89) aggrega per `(mese emissione, cliente)` quando i dati sono in `fattureEmesse`. Dopo il wipe, il fallback legacy non si attiva più. **Nessuna modifica al codice**, solo verifica in smoke test che le fatture wizard/XML appaiano aggregate correttamente.

### Cross-year banner
`getCrossYearInvoices()` legge sia da `data.fatture[m]` (legacy) che da `fattureEmesse` (via `FattureSelectors.getCrossYearPaidIn`). Dopo il wipe, solo `fattureEmesse` cross-year sono visibili — comportamento desiderato.

### Dichiarazione Quadro LM
`buildQuadroLM` legge da `yearData.fattureEmesse` con fallback `yearData.fatture` legacy (D-A2 fix). Post-wipe, il fallback non trova nulla — i totali LM dipendono solo da fattureEmesse. **Nessuna regressione attesa** se l'utente ri-importa via XML.

### Budget / Spese / Scadenziario
Nessun consumer diretto di `data.fatture[m]` rimasto. Verifica in smoke test.

## Rischi

- **Dati persi**: se l'utente non ri-importa via XML i mesi storici 2024/2025, il fatturato di quegli anni risulterà zero finché non importa. Mitigation: backup JSON in `_fattureManualeWipedBackup` ricuperabile manualmente da DevTools localStorage.
- **Mobile responsive**: il layout C ha 7 colonne — su schermi stretti va testato. Possibile fallback: nascondere "Emessa" su < 600px e mostrarla nel modal-detail.
- **Click sulla cella incassata vs riga**: serve `event.stopPropagation()` sulla cella incassata per non aprire il modal quando l'utente vuole solo segnare pagata.

## Out of scope

- Re-design della Tasse Accantonate UI (resta come ora — donut + lista).
- Re-design dello Scadenziario (resta come pre-merge).
- Migrazione automatica `_fattureManualeWipedBackup` → `fattureEmesse` con cliente "Sconosciuto". Non richiesto dall'utente.
- Cleanup `_fattureMigratedAt` orfano. Follow-up separato.
- Fix bug del bollo trimestrale, dichiarazione, ecc. che potrebbero emergere post-wipe — eventuali regressioni gestite separatamente.

## Verifica e successo

### Pre-condizioni di successo
- [ ] `node test/run-tests.js` passa (≥ 646 + 2 nuovi).
- [ ] `index.html` non contiene più `<div class="manuali-card">` né `<table id="fattureTable">`.
- [ ] `app-fatture.js` (se mantenuto) non esporta più `setFatturaImporto/Desc/Pagamento/addFattura` su window.

### Smoke test browser obbligatorio
- [ ] Login Mattia: tab Fatture mostra solo lo storico in formato tabellare. Niente tabella mensile.
- [ ] Crea bozza con wizard → appare in elenco con BOZZA. Click su `✉` → diventa INVIATA.
- [ ] Click su `€` di una INVIATA → cella incassata diventa input date oggi. Cambio data, OK → diventa PAGATA con la data scelta.
- [ ] Tab Tasse Accantonate: 2 fatture stesso cliente stesso mese → una riga con netto sommato. NC TD04 stesso cliente stesso mese → netto = TD01 - TD04.
- [ ] localStorage del profilo: `data.fatture` è `{}`, `data._fattureManualeWiped` settato.
