# Redesign tab Clienti — Design Spec

**Data:** 2026-04-20
**Branch:** `codex/dev-newfeatures`
**Goal:** Sostituire la vista a card espandibili con una tabella compatta + modal di dettaglio, form più pulito suddiviso in sezioni, scaffolding per autofill anagrafica da P.IVA via openapi.it (configurazione API key rimandata).

---

## 1. Vista principale (tabella)

**Layout:** tabella compatta che rimpiazza `clienti-grid`.

**Toolbar (invariata):**
- Input search (`#clientiSearch`) — filtra come oggi su `nome/piva/cf/sdi/pec/indirizzo/citta/provincia/note`
- Contatore `N filtrati / N totali`
- Pulsante `+ Nuovo cliente`

**Tabella:**
- Header: `NOME` · `P.IVA` · `CITTÀ` · (chevron)
- Riga: nome in bold, P.IVA mono, città in text-muted, cursor:pointer, hover evidenzia
- Click riga → `openClienteModal(id)`
- Click `+ Nuovo cliente` → crea record con id generato + `openClienteModal(newId)`
- Empty state: messaggio centrato se 0 clienti o nessun match

**Classi CSS nuove:**
- `.clienti-table` (wrapper)
- `.clienti-table-header` (grid row con font-size 11px, uppercase, text-muted)
- `.clienti-table-row` (grid row, hover, click-target)

---

## 2. Modal dettaglio cliente

**Struttura** (stile dei modal esistenti del progetto — `.profile-modal-open` overlay + `--color-surface-3` bg):

```
┌─ Header: "Cliente" / "Nuovo cliente" + × chiudi ─────┐
│                                                      │
│  PARTITA IVA                                         │
│  [________________]  [🔍 Autofill]                   │
│  ─────────────────────────────────────────────       │
│  ANAGRAFICA                                          │
│  Nome / Ragione sociale                              │
│  [_________________________________________]         │
│  Codice fiscale                                      │
│  [_________________________________________]         │
│  ─────────────────────────────────────────────       │
│  SEDE                                                │
│  Indirizzo                                           │
│  [_________________________________________]         │
│  [CAP] [Città____________] [PR] [Nazione]            │
│  ─────────────────────────────────────────────       │
│  FATTURAZIONE ELETTRONICA                            │
│  [Codice SDI      ] [PEC_______________]             │
│  ─────────────────────────────────────────────       │
│  NOTE                                                │
│  [textarea]                                          │
│                                                      │
│                            [Elimina]  [Chiudi]       │
└──────────────────────────────────────────────────────┘
```

**Comportamento:**
- Salvataggio inline a ogni `change` (come oggi). Nessun pulsante "Salva" esplicito — il modal riflette sempre lo stato persistito.
- Pulsante `Elimina`: conferma via `showAppConfirm` (già disponibile), poi chiude modal.
- Pulsante `Chiudi`: semplice close overlay.
- Esc chiude.
- Separatori tra sezioni: `hr` con border 1px `--color-border`.
- Label sezioni: 10px uppercase, `--color-text-faint`.

**Classi CSS nuove:**
- `.cliente-modal` (overlay + dialog)
- `.cliente-section` (gruppo label + campi)
- `.cliente-autofill-row` (input P.IVA + pulsante)

---

## 3. Autofill da P.IVA (scaffolding + stub)

**Obiettivo round attuale:** preparare tutta la struttura, **senza** richiedere API key. Quando l'utente premerà il pulsante `🔍 Autofill` senza key configurata, riceve toast `"Configura la tua API key openapi.it in Impostazioni > Clienti"` e nessuna chiamata parte.

**File nuovo:** `clienti-autofill.js`
- IIFE che espone `window.ClientiAutofill` con:
  - `async lookupPartitaIva(piva)` → ritorna `{ ok: true, data: {...} }` o `{ ok: false, error: string, code: 'NO_KEY' | 'NOT_FOUND' | 'NETWORK' | 'INVALID_PIVA' }`
  - `hasApiKey()` → boolean
  - `getApiKey()` → stringa o `''`
- Validazione P.IVA (11 cifre) prima di chiamare endpoint
- Endpoint target (documentato in codice, non implementato live): `https://imprese.openapi.it/advance/{piva}` con header `Authorization: Bearer {apiKey}`
- Mapping response → `{ nome, cf, indirizzo, cap, citta, provincia, pec }`

**Settings:**
- `settings.openapiKey` (stringa, default `''`)
- Campo `input[type=password]` in tab Impostazioni, sezione "Clienti / Autofill anagrafica"
- Link help accanto al campo: "Ottieni una chiave gratuita su openapi.it (100 req/mese gratis)"

**UX Autofill nel modal:**
1. Utente digita P.IVA e clicca `🔍 Autofill`
2. Valida 11 cifre → se no, toast errore
3. Se `hasApiKey()` falso → toast info "Configura API key"
4. Altrimenti: pulsante diventa spinner, `disabled`
5. On success: popola campi **vuoti** con dati. Se un campo ha già valore, NON sovrascrive; mostra notice "Alcuni campi erano già compilati e non sono stati modificati" se appropriato
6. On error: toast rosso con messaggio

**Include script:** `<script src="clienti-autofill.js" defer></script>` in `index.html` prima di `app.js` (o dopo, basta sia prima dell'uso).

---

## 4. Data model

Invariato rispetto a oggi:
- Storage key: `calcoliPIVA_{profile}_clienti` (array di clienti normalizzati via `normalizeCliente`)
- Sync: `PROFILE_META_KEYS` già include `'clienti'` in `firebase-sync.js`
- Campi: `id, nome, partitaIva, codiceFiscale, codiceSDI, pec, indirizzo, cap, citta, provincia, nazione, note`

---

## 5. File da modificare

**Modifica:**
- `app.js`
  - Riscrittura `renderClienti()` — da grid a table layout
  - Nuova `renderClienteTableRow(cliente)` (rimpiazza `renderClienteCard`)
  - Nuova `openClienteModal(id)`, `closeClienteModal()`, `renderClienteModal()`
  - Rimozione `renderClienteCard` e `renderClienteField` legacy (dead code dopo redesign)
  - Wiring `addCliente()`: dopo create → apre modal
  - Settings: nuovo field `openapiKey` in `ensureDataShape` (default `''`)
- `index.html`
  - `<div id="clienteModal" class="cliente-modal" aria-hidden="true">` vuoto (renderizzato da JS)
  - Nuovo campo `#openapiKeyInput` nel tab Impostazioni
- `style.css`
  - Classi `.clienti-table`, `.clienti-table-header`, `.clienti-table-row`
  - Classi `.cliente-modal`, `.cliente-section`, `.cliente-autofill-row`
  - Rimozione classi morte `.cliente-card*`, `.cliente-grid`, `.cliente-chip`
- `CLAUDE.md` — aggiornamento sezione Clienti con nuovi pattern

**Crea:**
- `clienti-autofill.js` — modulo IIFE
- `test/clienti-autofill.test.js` — unit tests su `lookupPartitaIva` con fetch stubbato

---

## 6. Testing

Test runner esistente: `node test/run-tests.js`.

Casi copertura `clienti-autofill.test.js`:
- P.IVA invalida (non 11 cifre) → `{ ok: false, code: 'INVALID_PIVA' }`
- API key assente → `{ ok: false, code: 'NO_KEY' }`
- fetch 404 → `{ ok: false, code: 'NOT_FOUND' }`
- fetch network error → `{ ok: false, code: 'NETWORK' }`
- happy path (response stubbato) → `{ ok: true, data: { nome, ..., pec } }`

Nessun test E2E UI (coerente con il resto del progetto).

---

## 7. Accessibility & mobile

- Tabella scrollabile orizzontalmente su mobile (`overflow-x:auto`)
- Modal full-screen su mobile (@media max-width: 768px)
- Focus trap nel modal coerente con pattern `fatturaModal`
- Labels associate agli input via `for=`/`id=`

---

## 8. Out of scope (backlog)

- Chiamata live a openapi.it (attende API key utente)
- Autofill anche da VIES via proxy server-side
- Export CSV clienti
- Gruppi / tag / categorie cliente
- Allegati cliente (logo, contratti)

---

## 9. Rischi / note

- **Dead code:** dopo redesign, confermare rimozione di `renderClienteCard`, `renderClienteField`, CSS card-related. Fare grep prima di cancellare per sicurezza.
- **Breaking change visivo:** utenti abituati alle card vedranno una tabella; l'UX cambia ma l'interazione è più efficiente (scan più veloce).
- **API key storage:** salvata in `settings.openapiKey` e quindi sincronizzata su Firebase. Documentare nel CLAUDE.md che è dato sensibile: se l'utente condivide profilo, condivide anche la key.
