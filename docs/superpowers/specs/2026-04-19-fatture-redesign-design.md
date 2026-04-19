# Fatture — Redesign (Sub-progetto E)

**Data:** 2026-04-19
**Branch:** `codex/dev-newfeatures`
**Relazione con altri sub-progetti:** viene dopo C2 (sidebar nav). Indipendente da C3/D.

## Problema

Il tab Fatture oggi ha **4 sezioni sovrapposte** che mostrano in parte gli stessi dati:

1. `#fattureDocsContent` — lista delle fatture emesse con numerazione `YYYY/NNN` (sub-progetto 3)
2. `#storico-fatture-list` — tabella "Storico fatture" con filtro anno via `<select>` nativo non stilizzato; header tabella compare anche quando vuoto
3. `#fattureTable` — tabella "Fatture mensili" legacy per incassi senza fattura formale
4. `#incassoSection` — cross-year payments

Feedback utente (screenshot 2026-04-19): "brutta", "duplicato", "rivedrei tutta la parte fatture fatte".

## Priorità d'uso (utente)

1. **A — Emettere nuova fattura** (flusso principale)
2. **D — Registrare incasso mensile "grezzo"** senza fattura formale (in uso finché le fatture vere passano da Fiscozen)
3. **B — Controllare stato pagamenti** delle fatture emesse
4. **C — Consultare archivio storico** (quasi mai)

`D` è dichiarata **temporanea**: sparirà quando l'emissione in-app sarà matura e sostituirà Fiscozen.

## Design approvato

### Layout (stacked verticale)

```
Fatture
Gestisci le fatture emesse e gli incassi registrati manualmente.

┌─────────────────────────────────────────────────┐
│  Fatture 2026            [📂]  [+ Nuova fattura]│
│  3 da incassare · 1.240 €   su 5 emesse         │
│  [Tutte] [Da pagare] [Pagate] [Bozze]           │
│                                                 │
│  2026/005  Rossi Mario — 15/04/2026             │
│            780,00 €           [INVIATA]         │
│  2026/004  Bianchi Srl — 08/04/2026             │
│            1.050,00 €         [PAGATA]          │
│  …                                              │
└─────────────────────────────────────────────────┘

┌ ── Incassi manuali (mensili) ────────────────── ┐  ← bordo tratteggiato
│  Per importi senza fattura formale.             │
│  Temporaneo finché l'emissione in-app non       │
│  sostituirà Fiscozen.                           │
│  ┌─────────┬──────────────────┬──────────┐      │
│  │ Mese    │ Descrizione      │ Importo  │      │
│  │ Gennaio │ Fiscozen         │ 5.670 €  │      │
│  │ …       │                  │          │      │
└─────────────────────────────────────────────────┘

Incassi cross-year (condizionale, solo se presenti)
```

### Componenti

**Card "Fatture [anno corrente]" (A + B)**
- Header: titolo `Fatture YYYY` a sinistra; a destra bottone icona archivio + CTA primaria `+ Nuova fattura`.
- Riassuntiva: `N da incassare · TOT €` in arancione (`--color-warning`) quando ci sono fatture non pagate; testo tenue `su M emesse quest'anno` accanto. Nascosta se `N = 0`.
- Filtri: segmented control `Tutte (x) | Da pagare (x) | Pagate (x) | Bozze (x)`. Default `Tutte`. I contatori si aggiornano live.
- Lista fatture: una riga per fattura dell'anno corrente, grid a 4 colonne:
  - Numero (`2026/005`, font Satoshi bold)
  - Cliente — data (`Rossi Mario — 15/04/2026`, testo muted)
  - Importo (allineato a destra, Satoshi bold)
  - Badge stato (outline, colorato per stato): `BOZZA` text-faint, `INVIATA` warning, `PAGATA` success, `ANNULLATA` error.
- Click su una riga → apre il modal fattura esistente (`openFatturaModal(id)`).
- Empty state: quando non ci sono fatture per l'anno, mostrare prompt compatto "Nessuna fattura emessa per YYYY. [+ Crea la prima]".

**Card secondaria "Incassi manuali (mensili)" (D)**
- Stile visivamente "di servizio": bordo tratteggiato, titolo muted, nota esplicativa sopra la tabella che dichiara l'intento temporaneo.
- Tabella mensile: `Mese | Descrizione | Importo | azione` (la colonna azione resta per eventuali delete rows; il comportamento attuale di `#fattureTable` viene preservato).
- Mantenuta la logica legacy di lettura/scrittura di `data.fatture[month]` per non toccare i calcoli fiscali a valle.

**Modal "Archivio fatture" (C)**
- Aperto dal bottone icona archivio nell'header della card A.
- Struttura identica alla tabella `FattureStorico.renderStorico()` esistente (colonne: numero, data, cliente, importo, tipo, stato, azioni), ma in un modale full-screen.
- Filtro anno come select stilizzato (stile Crisp & Tight dei select esistenti, non nativo).
- Filtro stato (stesso segmented control di A ma con anche "Annullate").
- Empty state pulito: "Nessuna fattura nell'archivio per il filtro selezionato."
- ESC chiude; backdrop click chiude; focus-trap standard.

**Sezione "Incassi cross-year" (condizionale)**
- Stessa logica attuale: si mostra solo se `getCrossYearInvoices()` ritorna non-vuoto.
- Rimane sotto la card D.

## Non-goals

- Nessuna modifica al data model: `yearData.fatture` (legacy mensile) e `fattureEmesse` (storico profile-scoped) restano invariati.
- Nessuna modifica al flusso di emissione (`openFatturaModal`, XML, PDF, nota di credito): solo UI del tab Fatture.
- Nessuna modifica alla sync Firebase.
- Nessuna modifica ai calcoli fiscali a valle.

## File impattati

- `index.html` — struttura del `#tab-fatture`: rimozione `#storico-fatture-list` dalla pagina e spostamento nel modal; aggiunta card A e card D ristilizzate; bottone icona archivio.
- `style.css` — nuove classi `.fatture-card`, `.fatture-summary`, `.fatture-filters`, `.fatture-row`, `.fatture-badge`, `.manuali-card`, `.archivio-modal`. Cleanup di classi legacy inutilizzate.
- `fatture-storico.js` — `renderStorico()` ora monta sul modale invece che sulla pagina; nuova `openArchivioModal()` e `closeArchivioModal()`. L'API esistente (`load`, `save`, `nextProgressivo`, `formatNumero`) resta invariata.
- `fatture-docs-feature.js` — modifiche alla render della lista (`#fattureDocsContent`): aggiunta riassuntiva + filtri + nuovo layout riga. API pubblica invariata.
- `app.js` — `switchToTab('fatture')` chiama solo la render della card A (non più `renderStorico` a pagina). Delegate per filtri e bottone archivio.

## Comportamento

- **Filtri stato (A)**: applicati client-side sulla lista delle fatture emesse dell'anno corrente. Persistenza in memoria della sessione; reset alla riapertura del tab.
- **Riassuntiva (A)**: `N` = numero fatture con `stato === 'inviata'`; `TOT` = somma `totaleDocument` delle stesse. Si aggiorna dopo ogni azione (segna pagata, annulla, ecc.).
- **Archivio (C)**: al primo open, filtro anno default = anno corrente. Cambiando anno la tabella si aggiorna senza ricaricare il modale.
- **Empty states**: ogni sezione vuota mostra un messaggio chiaro, mai un header di tabella orfano.

## Accessibility

- Tutti i bottoni hanno `type="button"` e `aria-label` dove serve.
- Segmented control dei filtri: `role="tablist"`, ogni filtro `role="tab"` con `aria-selected`.
- Modale archivio: `role="dialog"`, `aria-modal="true"`, focus iniziale sul select anno, ESC chiude.
- Badge stato: testo visibile (non solo colore) per screen reader.

## Responsive

- ≥769px: layout attuale (grid 4 colonne per riga fattura).
- ≤768px: riga fattura diventa stack verticale (numero + cliente + importo su 2 righe, badge in fondo). Tabella incassi manuali resta orizzontale scroll come adesso.
- Modale archivio: su mobile diventa full-screen.

## Test plan (manuale, utente)

1. Login Mattia, tab Fatture: vedere card "Fatture 2026" con CTA e lista; card "Incassi manuali" sotto; nessuna sezione "Storico fatture" nella pagina.
2. Cliccare filtri `Da pagare`: vede solo fatture `inviata`. `Bozze`: solo bozze. `Pagate`: solo pagate. `Tutte`: reset.
3. Click `+ Nuova fattura`: apre modal fattura (comportamento attuale preservato).
4. Click su una riga fattura: apre modal fattura in modalità edit.
5. Click icona archivio: apre modal archivio con tutte le fatture, filtro anno e stato funzionanti, ESC chiude.
6. Aggiungere/modificare un incasso manuale nella card D: i calcoli fiscali nei tab "Regime Forfettario" e "Tasse Accantonate" riflettono il cambiamento (equivalente al comportamento attuale).
7. Cambiare anno dalla sidebar: la card A mostra `Fatture YYYY` e la lista dell'anno nuovo. Anno senza fatture → empty state prompt.
8. Resize <768px: layout responsive coerente, nessun overflow orizzontale indesiderato.

## Cosa NON cambia

- Tutti i comandi/azioni contestuali delle fatture (Riapri, Annulla, Duplica, Segna inviata/pagata, Nota di credito) restano esattamente come adesso, solo raggiungibili dal modale archivio invece che dalla pagina.
- Logica XML, PDF, FatturaPA, stati: invariata.
- `buildFatturaElettronicaXml`, `buildInvoicePdfMinimal`, `normalizeInvoice`, `PROFILE_META_KEYS`: invariati.
