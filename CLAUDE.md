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
  - Official params in `OFFICIAL_ARTCOM_INPS` (2024-2026), with year fallback
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
5. **Fatture** — Monthly invoices with payment date tracking (cross-year support)
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
- Saldo (June 30): prior year's tax minus acconti paid
- Acconto primo (June 30): 40% of projected tax; Acconto secondo (Nov 30): 60%
- Thresholds: < 51.65€ = no acconti; < 257.52€ = single acconto in November
- INPS fixed dates: May 16, Aug 20, Nov 16, Feb 16
- Manual overrides per schedule entry (saldo/acconto imposta/contributi)
- Method comparison via `buildForfettarioMethodComparisonForYear`

### Firebase Sync
- Debounced (800ms) write on every save
- On login: pull all years from cloud, merge with local, then push local-only data
- Merge strategy: objects merged key-by-key (local wins for primitives; cloud fills undefined/null/empty), arrays keep longer version
- `syncAllToCloud` collects keys before iterating to avoid race conditions
- Export scoped to current profile; import filters keys by current profile prefix

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
