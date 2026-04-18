# Calcoli P.IVA — Project Guide

## Overview
Single-page web app for Italian freelancers (Partita IVA) to track income, taxes, and contributions. Pure vanilla HTML/CSS/JS, no build tools, no frameworks. Data persisted in localStorage with Firebase Firestore cloud sync.

## Architecture
- **index.html** — Shell: login screen, tab navigation (8 visible tabs + 1 hidden), picker popups
- **app.js** — All application logic (~3500 lines). Sections delimited by `// ═══` headers
- **style.css** — Dark theme, CSS variables, responsive (mobile bottom nav with safe-area support)
- **firebase-sync.js** — Firebase Firestore sync module (bidirectional merge)
- **tax-engine.js** — Standalone tax computation engine (forfettario scenarios, method comparison, Fiscozen integration)
- **ateco-coefficienti.js** — Tabella ufficiale DM 23/1/2015 (9 gruppi ATECO con coefficiente 40-86%). Esposta come `window.ATECO_COEFFICIENTI`. Usata dal dropdown "Gruppo ATECO" nel profilo fiscale per autofillare il `coefficiente`.

## Key Concepts

### Profiles & Auth
- Password-based login via SHA-256 hash matching (`PROFILE_HASHES`)
- Profiles: Mattia, Peru, Demo — each with independent data
- Session stored in `sessionStorage`, data keyed by `calcoliPIVA_{profile}_{year}` in localStorage

### Data Model (per year)
```
{
  settings: {
    regime, coefficiente, impostaSostitutiva, dailyRate, inpsMode,
    inpsCategoria,            // 'artigiano' | 'commerciante'
    usaInpsUfficiale,         // 1 = use official INPS params, 0 = manual
    contribFissi, minimaleInps, aliqContributi,
    riduzione35,              // 1 = apply 35% reduction
    haRedditoDipendente,      // 1 = mixed income year
    giorniIncasso,
    limiteForfettario,
    scadenziarioMetodo,       // 'storico' | 'previsionale'
    scadenziarioSaldoImposta, scadenziarioAccontoImposta,
    scadenziarioSaldoContributi, scadenziarioAccontoContributi,
    scadenziarioRangePct,     // projection range percentage
    scadenziarioBollo, scadenziarioInail, scadenziarioCameraDiCommercio,
    primoAnnoFatturatoPrec,       // first-year onboarding: prior year revenue (optional)
    primoAnnoImpostaPrec,         // first-year onboarding: prior year tax (optional)
    primoAnnoAccontiImpostaPrec,  // first-year onboarding: prior year tax acconti paid (optional)
    primoAnnoContribVariabiliPrec,// first-year onboarding: prior year variable contributions (optional)
    primoAnnoAccontiContribPrec,  // first-year onboarding: prior year contribution acconti paid (optional)
    ...
  },
  calendar: { "M-D": activityCode },     // M=1-12, D=1-31
  fatture: { "M": [{ importo, desc, pagMese, pagAnno }] },  // M=1-12
  accantonamento: { "key": amount },
  pagamenti: [{ data, tipo, descrizione, importo, linkedKeys }],
  budget: [{ nome, importo, auto }],      // array of budget line items
  spese: [{ titolo, costo, deducibilita, anni }]  // deducibilita: 0-1 decimal
}
```

### Tax Regimes
- **Forfettario** (primary): coefficient-based income, flat substitute tax, INPS contributions
- **Ordinario**: full IRPEF brackets (INPS deducted before applying brackets), deductible expenses
- Regime set per-year in settings

### INPS Modes
- **Artigiani/Commercianti**: fixed quarterly contributions + variable on excess over minimale
  - Categories: artigiano vs commerciante (different rates/fixed amounts)
  - Official params in `OFFICIAL_ARTCOM_INPS` (2020-2026), with year fallback (past years fall back to 2020, future to 2026)
  - Can use official values (`usaInpsUfficiale=1`) or manual override
- **Gestione Separata**: percentage on full taxable income, no fixed contributions, no minimale
- Riduzione 35%: applies to artigiani/commercianti contributions only (both fixed and variable)

### Tax Engine (`tax-engine.js`)
- `buildForfettarioScenario`: per-cassa contribution deduction, accurate imposta sostitutiva
- `buildForfettarioMethodComparison`: storico vs previsionale side-by-side
- `buildAccontoPlan`: handles threshold logic (none/single/double acconto) with 40/60 split
- `normalizeFiscozenFutureTaxes` / `normalizeFiscozenPaidTaxes`: Fiscozen API data normalization
- `buildInstallmentStatus` / `buildInstallmentExplanation`: deadline status and tooltips
- Exposed via `window.TaxEngine`

### Doppia logica competenza vs cassa
The forfettario engine has two parallel calculators with intentionally different semantics:
- `calcForfettarioValues` (`app.js:1462`) — **per competenza**: deduces all 4 INPS fixed quarters of the current year + the full annual variable INPS, regardless of when paid.
- `buildForfettarioScenario` (`tax-engine.js:528`) — **per cassa**: deduces only the INPS rates actually paid in-year (typically 3 fixed quarters of year N pagate in-year + the 4th of N-1 paid in February of N + variable saldo/acconti by cash flow).

A small delta between the two views is **expected**, not a bug. Audit B1 documents a 15,18 € delta on the fixed component for an artigiano 2026 scenario (= `(4521,36 − 4460,64) / 4`, i.e. the difference between the 4th-quarter INPS fissi 2026 and 2025). The dashboard summary uses competenza; the scadenziario uses cassa. Whenever values seem to disagree, check first whether one is competenza and the other is cassa.

### Tabs
1. **Regime Forfettario/Ordinario** — Main tax calculation summary with donut chart
2. **Tasse Accantonate** — Monthly tax accrual tracking per invoice, cumulative chart
3. **Scadenziario** — Tax deadline calendar with embedded payments section. Supports storico/previsionale methods, manual overrides, projection ranges, bollo/INAIL/camera di commercio, "segna pagato" quick-pay
4. **Calendario** — Day-by-day work calendar with activity picker (Lavoro, Ferie, Festivo, etc.)
5. **Fatture** — Monthly invoices with payment date tracking (cross-year support) plus invoice history, PDF export, and FatturaPA XML download for manual SdI upload
6. **Budget** — Monthly budget breakdown based on net income
7. **Spese** — Deductible expenses (ordinario only, tab hidden in forfettario)
8. **Impostazioni** — All settings, INPS official/manual toggle, export/import JSON

### Cross-Year Logic
- Invoices can have payment in a different year (`pagMese`/`pagAnno`)
- `getCrossYearInvoices()` pulls invoices paid in current year but issued in prior years
- `isClosedFiscalYear(year)` distinguishes past years from current/future
- Scadenziario looks back 2 years for storico acconto calculation
- `calcForfettarioForYear(year)` / `getAppliedForfettarioForYear(year)` — compute taxes for any year
- `getForfettarioSourceOfTruthForYear(year)` — uses tax engine when available, fallback otherwise
- Pagamenti aggregated across all stored years via `getPagamenti()`

### Scadenziario Engine
- `buildForfettarioScheduleForYear(year)` — main schedule builder
- Manual overrides per schedule entry (saldo/acconto imposta/contributi)
- Method comparison via `buildForfettarioMethodComparisonForYear`

#### Payment Calendar (Forfettario)
- **Imposta sostitutiva**: saldo year N-1 + 1° acconto year N (40%) on June 30; 2° acconto year N (60%) on Nov 30; saldo year N on June 30 of N+1
- **INPS fixed** (artigiani/commercianti): 4 quarterly rates on May 16, Aug 20, Nov 16, Feb 16 (next year)
- **INPS variable** (contributi eccedenti il minimale): same saldo/acconto structure as imposta sostitutiva
- **Saldo** = actual tax/contribution for the year minus acconti already paid
- **Thresholds**: < 51.65€ = no acconti; < 257.52€ = single acconto in November (100%); otherwise 40/60 split

#### First-Year Onboarding
- When no previous year data exists in localStorage, the schedule builder uses `primoAnno*` settings as fallback
- Settings: `primoAnnoFatturatoPrec`, `primoAnnoImpostaPrec`, `primoAnnoAccontiImpostaPrec`, `primoAnnoContribVariabiliPrec`, `primoAnnoAccontiContribPrec`
- Stored as empty string (not set) or number, using `saveOptionalNumberSetting`
- Shown in scadenziario "Opzioni avanzate" section, auto-disabled when previous year data exists
- Used as fallback in `buildForfettarioScheduleForYear()` for saldo and storico acconto calculations

#### F24 Payment Guide
- `F24_GUIDE` constant: maps schedule entry types to F24 payment instructions
- Each guide includes: codice tributo, sezione F24, anno di riferimento, step-by-step instructions, notes
- `getF24GuideKey(scheduleRowKey)` — maps schedule row keys to guide keys
- `renderF24Guide(guideKey, rowItem)` — renders inline guide HTML
- `toggleF24Guide(key)` — toggles visibility of guide panel
- Supported types: imposta_saldo, imposta_acc1, imposta_acc2, inps_fissi, contributi_saldo, contributi_acc1, contributi_acc2, camera, bollo, inail

#### F24 Codici Tributo Reference
| Tipo | Codice | Sezione |
|------|--------|---------|
| Imposta sostitutiva — 1° acconto | 1790 | Erario |
| Imposta sostitutiva — 2° acconto | 1791 | Erario |
| Imposta sostitutiva — saldo | 1792 | Erario |
| Camera di commercio | 3850 | IMU e altri tributi locali |
| Imposta di bollo — rata 1 | 2521 | Erario |
| Imposta di bollo — rata 2 | 2522 | Erario |
| Imposta di bollo — rata 3 | 2523 | Erario |
| Imposta di bollo — rata 4 | 2524 | Erario |
| INPS artigiani/commercianti | — | INPS (codice sede + matricola) |
| INAIL | — | INAIL (codice sede + PAT) |

### Firebase Sync
- Debounced (800ms) write on every save
- On login: pull all years from cloud, merge with local, then push local-only data
- Merge strategy: objects merged key-by-key (local wins for primitives; cloud fills undefined/null/empty), arrays keep longer version; **exception: `pagamenti` deduplicated by `data|importo|tipo|descrizione` signature** (not "keep longer")
- `syncAllToCloud` collects keys before iterating to avoid race conditions
- Export scoped to current profile; import filters keys by current profile prefix
- Profile-scoped meta storage is supported too: `calcoliPIVA_{profile}_clienti` syncs separately from yearly docs and is merged with the same profile namespace.

### Quadro LM
- Accessed from the `Regime Forfettario` view with `openQuadroLMModal()`
- Prefills LM1, LM2, LM22, LM27, LM34, LM35, LM40 and related fields from the yearly source of truth
- Stores manual edits per year in `yearData.lmQuadro.overrides`
- `saveQuadroLMDraft()` persists the current year snapshot, `exportQuadroLMPrint()` opens a print-friendly HTML view
- No telematic XML or PDF generation: the feature is a compilation aid only
- **Superseded** by the Dichiarazione Redditi PF module (see below); legacy functions kept for backward compatibility

### Dichiarazione Redditi PF
- **Files**: `dichiarazione-engine.js`, `dichiarazione-ui.js`, `dichiarazione-exports.js`
- **Replaces** legacy `openQuadroLMModal`, `saveQuadroLMDraft`, `exportQuadroLMPrint`
- **APIs**: `window.DichiarazioneEngine`, `window.DichiarazioneUI`, `window.DichiarazioneExports`

#### Data Shape
- `settings.anagrafica` — per-profile, stable: codice fiscale, nome, cognome, comune, etc.
- `settings.attivita` — per-profile: P.IVA, codice ATECO, comune domicilio fiscale
- `yearData.dichiarazione` — per-anno:
  - `tipoDichiarazione` — `'ordinaria'` | `'correttiva'` | `'integrativa'`
  - `flags` — `{ annoMisto, imposteEstere, altriCrediti }` (boolean toggles for conditional quadri)
  - `contiEsteri` — array of foreign account records for Quadro RW
  - `overrides` — per-rigo manual overrides (same structure as legacy `lmQuadro.overrides`)
  - `statoCompilazione` — progress tracker per step
  - `_confirmedWarnings` — set of suppressed validation warning keys

#### Migration
- On load, `ensureDataShape` silently migrates `yearData.lmQuadro.overrides` → `yearData.dichiarazione.overrides`
- No data loss: migration is additive; legacy key is preserved until explicitly cleared

#### Wizard
- 12 steps, activated via `openDichiarazione()` or tab click
- Steps 8 (`annoMisto`), 9 (`imposteEstere`), 10 (`altriCrediti`) are conditional on the corresponding flag
- Progress is persisted in `yearData.dichiarazione.statoCompilazione`

#### Engine Functions (`DichiarazioneEngine`)
| Function | Description |
|---|---|
| `buildFrontespizio(profile, year, input)` | Frontespizio section from anagrafica + tipoDichiarazione |
| `buildQuadroLM(yearData, settings, overrides)` | Quadro LM: ricavi, reddito netto, imposta sostitutiva |
| `buildQuadroRR(yearData, settings, quadroLM, overrides)` | Quadro RR: INPS sezione I (artigiani/commercianti) or sezione II (gestione separata) |
| `buildQuadroRS(yearData, settings, overrides)` | Quadro RS: spese deducibili |
| `buildQuadroRX(yearData, settings, precedente, overrides)` | Quadro RX: crediti d'imposta, compensazioni |
| `buildQuadroRW(contiEsteri)` | Quadro RW: conti e investimenti esteri (one rigo per account) |
| `buildCondizionali(input, yearData)` | Conditional quadri: quadroRN (annoMisto), quadroCE (imposteEstere) |
| `buildDichiarazione(year, profile, input)` | Assembles all quadri into the full dichiarazione object |
| `validateDichiarazione(dich)` | Returns `{ errors, warnings }` arrays; errors block export, warnings are confirmable |
| `validateCodiceFiscale(cf)` | Validates CF format + check digit; case-insensitive |

#### Exports (`DichiarazioneExports`)
- **C2 — JSON + CSV zip**: `DichiarazioneExports.exportC2(dich)` — zips a structured JSON and a human-readable CSV of all righi values
- **C3 — PDF ministeriale**: `DichiarazioneExports.exportC3(dich)` — generates a print-ready PDF mimicking the Modello Redditi PF layout

#### Unit Tests
- `test/dichiarazione-engine.test.js` — 39 tests covering all engine functions
- Run with: `node test/run-tests.js`

### Color System
- Canonical color CSS variables defined in `:root` (dark theme) and `html[data-theme="light"]`:
  - **Charts**: `--color-chart-netto` (#2EAADC), `--color-chart-tasse` (#E94560), `--color-chart-contributi` (#F5A623)
  - **Calendar day types**: `--color-cal-lavoro` (#4ECCA3), `--color-cal-ferie` (#F5A623), `--color-cal-festivo` (#E94560), `--color-cal-mezzagiornata` (#4A9EFF), `--color-cal-malattia` (#E67E22), `--color-cal-donazione` (#7C5CBF)
- `getCSSVar(name)` helper in `app.js`: reads a CSS variable at runtime via `getComputedStyle` — use this in JS wherever a resolved color value is needed (e.g. SVG fills, canvas)
- `DAY_TYPES` constant uses `var(--color-cal-*)` references; `drawDonut()` and `drawMiniBars()` call `getCSSVar()` at render time so colors update on theme switch

### FatturaPA / SdI
- **XML generation** (`fatture-docs-feature.js`): produces FatturaPA v1.2 XML compliant with AdE spec (`http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2`)
- **`buildFatturaElettronicaXml(draft, opts)`**: genera XML TD01 (fattura) o TD04 (nota di credito) a seconda di `opts.isNC`; quando isNC=true, applica segni negativi agli importi e inserisce `DatiFattureCollegate` con `IdDocumento`/`Data` dalla fattura originale
- **`buildFatturaElettronicaXmlNC(noteCredit, fatturaOriginale)`**: wrapper per generazione NC
- **XML audit fixes (11 punti conformità AdE v1.2):**
  - `sanitizeProgressivoInvio` — max 10 char alfanumerici
  - `isValidPartitaIvaIT` — 11 cifre IT
  - `isValidCodiceFiscale` — 16 char + check digit
  - `RegimeFiscale` da `settings.regime` (RF19 forfettario / RF01 ordinario)
  - Natura riga (N2.2 forfettario / N1 escluse / N6 reverse charge) con `AliquotaIVA=0.00` sempre presente
  - `applicaBolloSeDovuto` — soglia 77,47 € per `DatiBollo`
  - Fattura a privato: `CodiceDestinatario=0000000`, CF cessionario obbligatorio
  - `DatiRitenuta` con `TipoRitenuta`, `ImportoRitenuta`, `CausalePagamento` se `ritenuta > 0`
  - Contributo integrativo su riga separata con propria `Natura`
  - `DatiPagamento.ImportoPagamento` = totale lordo − ritenuta
  - XSD element order in `DatiGeneraliDocumento`: Numero → DatiRitenuta → DatiBollo → ImportoTotaleDocumento → Causale
- **`MODALITA_TO_MP` map** + **`modalitaToCodiceMP(str)`**: fuzzy-match payment method → MP01–MP15, default MP05 (bonifico)
- **`showXmlPreviewModal(invoice)`** + **`previewFatturaXml()`**: anteprima XML in-app con pre-scrollabile, indent 2 spazi, bottoni "Copia negli appunti" + "Scarica XML"; bottone "Anteprima XML" accanto a "Scarica XML" nel modal fattura
- **`showSdiUploadGuide(fileName)`**: 4-step guide per upload manuale sul portale AdE "Fatture e Corrispettivi"
- **`openNotaCreditoModal(fatturaOriginaleId)`**: apre modal NC TD04 prefillato con dati fattura originale (righe con prefisso "STORNO — "), `tipoDocumento='TD04'`, `fatturaOriginaleId`
- No automated SdI submission — upload is always manual via the AdE portal

### Storico fatture e numerazione (sub-project 3)
- **File**: `fatture-storico.js` (IIFE, espone `window.FattureStorico`)
- **Storage key**: `calcoliPIVA_{profile}_fattureEmesse` (array di fatture); sync via `syncProfileMetaToCloud(profile, 'fattureEmesse')` (`PROFILE_META_KEYS` in `firebase-sync.js` già include `'fattureEmesse'`)
- **API**: `load(profile)`, `save(profile, fatture)`, `nextProgressivo(anno, fatture)`, `formatNumero(anno, progressivo)`, `storageKey(profile)`, `renderStorico(annoFiltro)`, `renderAnnoFilter(selectedAnno)`
- **Numerazione**: formato `YYYY/NNN` (zero-padded 3 cifre). `nextProgressivo` scansiona fatture dell'anno e ritorna `max(progressivo)+1`. Pre-filled al nuovo fattura, editabile come override manuale.
- **Stati**: `bozza` | `inviata` | `pagata` | `annullata` (badge CSS `.badge-stato.{stato}` in `style.css`)
- **Campi estesi** sull'oggetto fattura (tutti backwards-compatible): `stato`, `dataInvioSdi`, `dataPagamento`, `fatturaOriginaleId`, `tipoDocumento` (TD01/TD04), `annoProgressivo`, `progressivo`, `ritenuta`, `aliquotaRitenuta`, `tipoRitenuta`, `causaleRitenuta`
- **Normalizzazione**: `window.normalizeInvoice(inv)` applica default ai campi mancanti al load; chiamata da `FattureStorico.load`
- **UI storico** (`#storico-fatture` card in tab Fatture): tabella Numero/Data/Cliente/Importo/Tipo/Stato/Azioni, filtro anno, azioni contestuali per stato (Riapri/Annulla su bozza, Duplica ovunque, Segna inviata/pagata, Nota di credito su inviata/pagata)
- **Hook tab**: `switchToTab()` in `app.js` chiama `FattureStorico.renderAnnoFilter()` + `renderStorico()` all'attivazione tab Fatture

### Invoice PDF (`buildInvoicePdfMinimal`)
- Layout minimalista A4 portrait, margini 20 mm, font Helvetica (built-in jsPDF):
  - Header testo "FATTURA N. YYYY/NNN" + Data, senza bande colore; "NOTA DI CREDITO" per TD04
  - Due colonne EMITTENTE / DESTINATARIO (no card colorate)
  - Tabella righe: Descrizione / Q.tà / P.Unit. / Totale
  - Riepilogo allineato a destra con unica linea ACCENT teal sopra TOTALE (bold 14pt)
  - TD04: importi in rosso (`NEGATIVE`)
  - Footer payment info + nota legale franchigia IVA art. 1 c. 58 L. 190/2014
  - Multi-pagina con header ripetuto se righe > ~20
- Palette: `INK=[18,26,36]`, `MUTED=[100,116,139]`, `BORDER=[226,232,240]`, `ACCENT=[60,143,145]`, `NEGATIVE=[220,53,69]`
- Costruttore: `window.jspdf.jsPDF` (bundle caricato via html2pdf)

## Conventions
- Italian UI language throughout
- Currency: EUR, formatted with `fmt()` (locale it-IT)
- Rounding: `ceil2()` rounds to 2 decimal places (Math.ceil * 100)
- All amounts in euros (not cents), except `splitAmountByWeights` which uses cents internally
- Activity codes: '8' (work), 'WE' (weekend), 'F' (vacation), 'FS' (holiday), 'M' (half-day), etc.
- Payment types: tasse, contributi, misto, altro
- FORFETTARIO_RULES constant: acconto thresholds, saldo/acconto dates, INPS fixed dates, 40/60 weights

## Important Notes
- No build step — edit files directly and refresh browser
- Seed data functions (`seedMattiaData`, `seedPeruData`) pre-populate historical data on first login
- Settings use `saveSetting` (numeric) / `saveTextSetting` (string) / `saveOptionalNumberSetting` (nullable numeric)
- The `recalcAll()` function re-renders all active tabs
- Scadenziario has both legacy (`legacyBuildForfettarioScheduleForYear`) and current (`buildForfettarioScheduleForYear`) schedule builders — the current one is used in `renderScadenziario()`
- `ensureDataShape(target, year)` is year-aware: syncs official INPS values and applies defaults per year
- Dark theme: all selects use `color-scheme: dark` with explicit option styling
- Mobile: safe-area-inset-bottom for iPhone home indicator, responsive card layouts for tables
