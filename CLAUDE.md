# Calcoli P.IVA — Project Guide

## Overview
Single-page web app for Italian freelancers (Partita IVA) to track income, taxes, and contributions. Pure vanilla HTML/CSS/JS, no build tools, no frameworks. Data persisted in localStorage with Firebase Firestore cloud sync.

## Architecture
- **index.html** — Shell: login screen, tab navigation (8 visible tabs + 1 hidden), picker popups
- **app.js** — All application logic (~3500 lines). Sections delimited by `// ═══` headers
- **style.css** — Dark theme, CSS variables, responsive (mobile bottom nav with safe-area support)
- **firebase-sync.js** — Firebase Firestore sync module (bidirectional merge)
- **tax-engine.js** — Standalone tax computation engine (forfettario scenarios, method comparison, Fiscozen integration)

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

### Color System
- Canonical color CSS variables defined in `:root` (dark theme) and `html[data-theme="light"]`:
  - **Charts**: `--color-chart-netto` (#2EAADC), `--color-chart-tasse` (#E94560), `--color-chart-contributi` (#F5A623)
  - **Calendar day types**: `--color-cal-lavoro` (#4ECCA3), `--color-cal-ferie` (#F5A623), `--color-cal-festivo` (#E94560), `--color-cal-mezzagiornata` (#4A9EFF), `--color-cal-malattia` (#E67E22), `--color-cal-donazione` (#7C5CBF)
- `getCSSVar(name)` helper in `app.js`: reads a CSS variable at runtime via `getComputedStyle` — use this in JS wherever a resolved color value is needed (e.g. SVG fills, canvas)
- `DAY_TYPES` constant uses `var(--color-cal-*)` references; `drawDonut()` and `drawMiniBars()` call `getCSSVar()` at render time so colors update on theme switch

### FatturaPA / SdI
- **XML generation** (`fatture-docs-feature.js`): produces FatturaPA v1.2 XML compliant with AdE spec (`http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2`)
- **`MODALITA_TO_MP` map** + **`modalitaToCodiceMP(str)`**: fuzzy-matches a free-text payment method string to the correct FatturaPA `ModalitaPagamento` code (MP01–MP15); defaults to MP05 (bonifico)
- **`showSdiUploadGuide(fileName)`**: after XML download, replaces the modal with a 4-step guide for manual upload to the AdE "Fatture e Corrispettivi" portal (`ivaservizi.agenziaentrate.gov.it/portale/...`); includes a direct portal button
- No automated SdI submission — upload is always manual via the AdE portal

### Invoice PDF (`buildInvoicePdfModern`)
- Professional layout via jsPDF:
  - Full-width teal header band with "FATTURA" label + invoice number badge
  - Two-column issuer / client section (client in a rounded rect card)
  - Meta bar: date, due date, payment method, IBAN
  - Line-item table with teal header row and alternating soft rows
  - Right-aligned summary box with highlighted total row
  - Footer: payment info box + legal note box
- Key palette constants (inside the function): `ACCENT=[60,143,145]`, `ACCENT_LIGHT=[232,244,244]`, `INK=[18,26,36]`, `MUTED=[96,112,128]`, `BORDER=[210,218,226]`, `SOFT=[245,248,251]`

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
