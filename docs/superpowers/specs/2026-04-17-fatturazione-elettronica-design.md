# Fatturazione Elettronica — Design Spec (Sub-project 3)

**Data:** 2026-04-17
**Branch:** `codex/fatturazione-elettronica` (da `codex/dev-newfeatures`)
**Stato:** Design approvato, pronto per writing-plans

## 1. Scope & obiettivo

Sub-project 3 migliora la feature di fatturazione su 4 aree:

1. **PDF redesign** — sostituire html2pdf con jsPDF puro, stile minimalista corporate
2. **Audit FatturaPA XML** — verifica sistematica + fix conformità spec AdE v1.2
3. **Nota di credito TD04** — generazione XML storno + UI dedicata
4. **UX miglioramenti** — numerazione automatica, storico fatture con stati, anteprima XML in-app

## 2. Architettura file

### File modificati

- **`fatture-docs-feature.js`**:
  - Sostituisce `buildInvoiceHtmlNode` + `downloadFatturaPdf` + `previewFatturaPdf` con implementazione jsPDF
  - Aggiunge `buildFatturaElettronicaXmlNC(invoice)` per TD04
  - Fix audit XML (11 punti)
  - Aggiunge `showXmlPreviewModal(invoice)`
  - Rimuove dipendenza da html2pdf per la generazione PDF (html2pdf rimane solo se usato altrove — verificare)

- **`index.html`**:
  - Aggiunge UI storico nel tab Fatture
  - Aggiunge script tag per `fatture-storico.js`

### File nuovo

- **`fatture-storico.js`** — gestione stato fatture, storico lista, azioni, numerazione progressiva. Esposto come `window.FattureStorico`

### File NON modificati

`app.js` (tab mensile rimane invariato), `firebase-sync.js`, `clienti-feature.js`

## 3. Data model

Estensione dell'oggetto fattura salvato (backwards-compatible — tutti i nuovi campi opzionali):

```js
{
  // Campi esistenti (invariati)
  id, numero, data, clienteId, clienteSnapshot,
  righe, note, iban, modalitaPagamento, scadenzaPagamento,
  marcaDaBollo, contributoIntegrativo, aliquotaContributo,
  ritenuta, aliquotaRitenuta,

  // Nuovi campi
  stato: 'bozza' | 'inviata' | 'pagata' | 'annullata',  // default: 'bozza'
  dataInvioSdi: string | null,       // ISO date, popolato quando stato → 'inviata'
  dataPagamento: string | null,      // ISO date, popolato quando stato → 'pagata'
  fatturaOriginaleId: string | null, // ID fattura stornata (solo per TD04)
  tipoDocumento: 'TD01' | 'TD04',    // default: 'TD01'
  annoProgressivo: number,           // anno di emissione per numerazione
  progressivo: number                // 1, 2, 3... per anno (usato in numero auto)
}
```

**Storage:** array `calcoliPIVA_{profile}_fatture` in localStorage (già esistente). `FattureStorico` legge/scrive su questa chiave.

**Numerazione:** formato `YYYY/NNN` dove NNN è zero-padded a 3 cifre. `FattureStorico.nextProgressivo(anno)` scansiona tutte le fatture dell'anno e ritorna `max(progressivo) + 1`.

## 4. PDF minimalista (jsPDF)

### Layout A4 portrait, margini 20mm

```
┌─────────────────────────────────────────────┐
│  FATTURA N. 2025/001          Data: 01/01   │  header testo, no bande colore
│  Tipo: Fattura / Nota di credito            │
├─────────────────────────────────────────────┤
│  EMITTENTE              │  DESTINATARIO     │  due colonne
│  Mario Rossi            │  Acme Srl         │
│  P.IVA 01234567890      │  P.IVA...         │
│  Via..., Città          │  Via..., Città    │
├─────────────────────────────────────────────┤
│  Descrizione     Q.tà   P.Unit.     Totale  │  tabella righe
│  Servizio web    1      1.000,00  1.000,00  │
├─────────────────────────────────────────────┤
│                     Imponibile    1.000,00  │
│                     Bollo             2,00  │
│                     Ritenuta       -200,00  │  se presente
│                  ─────────────────────────  │  unica linea ACCENT teal
│                     TOTALE        1.002,00  │  bold 14pt
├─────────────────────────────────────────────┤
│  Pagamento: Bonifico entro 30gg             │
│  IBAN: IT60X0542811101000000123456          │
├─────────────────────────────────────────────┤
│  Operazione in franchigia IVA art. 1 c. 58  │  footer legale fisso
│  L. 190/2014. Imposta di bollo assolta...   │
└─────────────────────────────────────────────┘
```

### Palette colori
```js
const INK    = [18, 26, 36];      // #121a24 — testo principale
const MUTED  = [100, 116, 139];   // #64748b — testo secondario
const BORDER = [226, 232, 240];   // #e2e8f0 — linee tabella
const ACCENT = [60, 143, 145];    // #3C8F91 — unica linea teal sopra totale
```

### Specifiche tecniche
- Constructor: `window.jspdf.jsPDF` (già caricato via html2pdf bundle)
- Font: Helvetica (built-in jsPDF, no CDN aggiuntivo)
- Multi-pagina: se righe > ~20, aggiunge pagina con header ripetuto
- Nota di credito: stesso layout, "NOTA DI CREDITO" nell'header, importi negativi in rosso

## 5. Audit FatturaPA XML — checklist completa

| # | Campo/Regola | Verifica | Fix se necessario |
|---|-------------|----------|-------------------|
| 1 | `ProgressivoInvio` | Max 10 char alfanumerico | Troncare/sanitizzare |
| 2 | `CodiceFiscale` cedente | 16 char + check digit valido | Validazione + warning |
| 3 | `IdPaese` + `IdCodice` | `IT` + 11 cifre esatte per P.IVA | Padding/strip spazi |
| 4 | `RegimeFiscale` | RF19 forfettario, RF01 ordinario | Leggi da settings.regime |
| 5 | `Natura` righe | N2.2 forfettario default; N1 per escluse; N6 reverse charge | Render condizionale |
| 6 | `AliquotaIVA` | 0.00 obbligatorio anche con Natura (non omissibile) | Aggiungere se mancante |
| 7 | `DatiBollo` soglia | Solo se imponibile > 77,47 € | Fix soglia (attuale: sempre se flag) |
| 8 | Fattura a privato | `CodiceDestinatario=0000000`, `CodiceFiscale` cessionario obbligatorio | Gestione senza P.IVA |
| 9 | `DatiRitenuta` | Presente se `ritenuta > 0`: `TipoRitenuta` (A=lavoro autonomo), `ImportoRitenuta`, `CausalePagamento` (es. Q) | Aggiungere blocco |
| 10 | Contributo integrativo | Riga separata con propria `Natura` (N2.2 o N1) | Verificare corretta separazione |
| 11 | `DatiPagamento.ImportoPagamento` | = totale lordo - ritenuta (non totale con ritenuta inclusa) | Fix calcolo importo |

## 6. Nota di credito TD04

### XML generato
- `TipoDocumento = TD04`
- `DatiFattureCollegate`: blocco con `IdDocumento` = numero fattura originale, `Data` = data originale
- Righe: stesse della fattura originale, descrizione prefissata con "STORNO — "
- `ImportoTotaleDocumento`: negativo
- Natura, AliquotaIVA, bollo: stesse regole della fattura originale (bollo non ripetuto su NC)

### UI
- Bottone "Emetti nota di credito" nello storico (visibile solo per fatture con stato `inviata` o `pagata`)
- Apre modal prefillato con dati fattura originale: numero auto-generato, data = oggi, righe copiate con descrizione "STORNO — [originale]"
- Campo "Numero fattura originale" (editabile, pre-filled con numero fattura)
- Salvataggio con `fatturaOriginaleId`, `tipoDocumento: 'TD04'`
- Stato iniziale: `bozza`; può essere inviata/annullata come una fattura normale

## 7. UX miglioramenti

### 7a. Numerazione automatica

- Funzione `FattureStorico.nextProgressivo(anno)`: scansiona tutte le fatture dell'anno, ritorna `max(progressivo) + 1` (default 1 se nessuna)
- All'apertura del modal "Nuova fattura": campo numero pre-filled con `YYYY/NNN` calcolato
- Campo numero rimane editabile (override manuale possibile)
- Al salvataggio: `annoProgressivo` e `progressivo` salvati sull'oggetto fattura
- Nessuna enforced uniqueness — responsabilità dell'utente (warning se duplicato rilevato)

### 7b. Storico fatture

Sezione aggiunta nel tab Fatture, **sotto** il pulsante "Nuova fattura", implementata in `fatture-storico.js`:

**Colonne:**
- Numero | Data | Cliente | Importo | Tipo | Stato | Azioni

**Stato con badge:**
- `bozza` — grigio (`var(--text-secondary)`)
- `inviata` — blu (`var(--color-chart-netto)`)
- `pagata` — verde (`#2ecc71`)
- `annullata` — rosso (`var(--color-chart-tasse)`)

**Azioni per riga:**
- **Riaprire** (bozza): apre modal di modifica
- **Duplica** (qualsiasi stato): nuova bozza con stessi dati, nuovo progressivo
- **Segna inviata** (da bozza): chiede data invio SDI, aggiorna stato
- **Segna pagata** (da inviata): chiede data pagamento, aggiorna stato
- **Nota di credito** (inviata/pagata): apre modal TD04 prefillato
- **Annulla** (bozza): cambia stato in annullata (no XML richiesto)

**Filtro:** select anno (default anno corrente)

**Persistenza:** `FattureStorico.load(profile)` / `FattureStorico.save(profile, fatture)` — read/write su `calcoliPIVA_{profile}_fatture`

### 7c. Anteprima XML in-app

- Bottone "Anteprima XML" nel modal fattura (accanto a "Scarica XML")
- Funzione `showXmlPreviewModal(invoice)` in `fatture-docs-feature.js`
- Modal con `<pre>` scrollabile, XML formattato con indent 2 spazi
- Syntax highlight minimal via regex inline: tag `<...>` in colore teal, valori in testo normale
- Bottoni: "Copia negli appunti" (`navigator.clipboard.writeText`) + "Scarica XML" (stesso flusso attuale)

## 8. Testing

Nessun unit test aggiuntivo (feature DOM-heavy, impossibile in Node.js). Smoke test manuali:

**PDF:**
- [ ] Fattura standard: PDF scaricato, layout corretto, tutte le sezioni visibili
- [ ] Con bollo: riga bollo nel riepilogo
- [ ] Con ritenuta: riga ritenuta negativa nel riepilogo
- [ ] Righe > 20: multi-pagina senza troncare contenuto
- [ ] Nota di credito: header "NOTA DI CREDITO", importi negativi

**XML:**
- [ ] Fattura forfettario standard: N2.2, RF19, AliquotaIVA=0.00
- [ ] Fattura con bollo > 77,47 €: DatiBollo presente
- [ ] Fattura con bollo ≤ 77,47 €: DatiBollo assente
- [ ] Fattura a privato: CodiceDestinatario=0000000
- [ ] Con ritenuta: blocco DatiRitenuta presente, ImportoPagamento corretto
- [ ] Nota di credito TD04: TipoDocumento=TD04, DatiFattureCollegate presente

**Storico e UX:**
- [ ] Numerazione auto: prima fattura = `2025/001`, seconda = `2025/002`
- [ ] Cambio stato: bozza → inviata → pagata
- [ ] Duplica: nuova bozza con numero incrementato
- [ ] Nota di credito da storico: modal prefillato correttamente
- [ ] Anteprima XML: modal aperto, XML leggibile, copia appunti funziona

## 9. Branch strategy

- Nuova branch **`codex/fatturazione-elettronica`** da `codex/dev-newfeatures`
- Merge back in `codex/dev-newfeatures` a completamento
- `codex/dev-newfeatures` → `main` solo dopo tutti e 4 i sub-project completati

## 10. Convenzioni da rispettare

- Vanilla HTML/CSS/JS, no build tools
- Italiano in tutta l'UI
- Dark/light theme via CSS variables
- `saveData()` per persistenza (o `syncProfileMetaToCloud` per fatture profile-scoped)
- Mobile-friendly (safe-area, responsive)
