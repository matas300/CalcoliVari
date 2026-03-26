# Tax Engine Notes

## Goal
Build a Fiscozen-like fiscal engine that keeps the UI simple while separating:
- fiscal competence
- actual cash payments
- planned installments
- historical declarations
- simulations and warnings

This file is the durable project memory for the tax-engine rollout.

## Real Reference Case
- 2024: employee income + P.IVA ordinario
- 2025: P.IVA forfettario
- INPS: artigiani
- ATECO: 62.10.00
- coefficiente forfettario: 67%
- imposta sostitutiva: 15%

Key rule:
- reddito lordo forfettario = incassato * coefficiente
- imponibile fiscale = reddito lordo forfettario - contributi INPS obbligatori pagati/deducibili nell'anno
- imposta sostitutiva = imponibile fiscale * aliquota

## Domain Model

### Core entities
- `TaxYear`: year, settings, regime, hasEmployeeIncome, transitionFlags
- `RevenueEvent`: invoice/payment, issue date, payment date, amount, source year
- `TaxAssessment`: substitute tax, IRPEF, addizionali, INPS fixed/variable, competence year, method
- `TaxInstallment`: due date, amount, family, competence year, certainty, payment status
- `PaymentRecord`: actual paid amount, date, schedule link, family, source
- `HistoricalDeclarationImport`: imported source, normalized rows, reference year
- `TransitionEvent`: previous regime, next regime, notes/warnings

### Rule layers
- **Hard rules**: forfettario formula, INPS artigiani fixed+variable, storico vs previsionale, acconto thresholds (51.65€/257.52€), 40/60 split
- **Annual parameters**: INPS yearly values (`OFFICIAL_ARTCOM_INPS` 2024-2026), profitability coefficient, tax rates, due-date overrides
- **Assumptions**: estimated months, planning ranges, fallback values
- **User overrides**: manual saldo/acconto values, imported official/professional numbers

## Current Implementation

### tax-engine.js (standalone, IIFE on `window.TaxEngine`)
- `buildForfettarioScenario(input)`: per-cassa contribution deduction, substitute tax, acconto plans
- `buildForfettarioMethodComparison(input)`: storico vs previsionale side-by-side, warnings, prudential pick
- `buildAccontoPlan(baseAmount, rules)`: threshold logic (none < 51.65€, single < 257.52€, double with 40/60 weights)
- `buildTransitionDiagnostics(input)`: regime change / mixed income warnings
- `buildInstallmentStatus(row, linkedPayment)`: paid/underpaid/overpaid/estimated status
- `buildInstallmentExplanation(row)`: Italian-language explanation per deadline type
- `normalizeFiscozenFutureTaxes(payload)`: classify planned taxes from Fiscozen API
- `normalizeFiscozenPaidTaxes(payload)`: classify paid taxes with family/reference year
- `classifyFiscozenDescription(text)`: family detection (substitute_tax, inps_fixed, inps_variable, etc.)
- `getRuleCatalog()`: hard rules, annual parameters, assumptions for transparency

### app.js integration
- `buildForfettarioMethodComparisonForYear(year)`: bridges app data to engine, passes correct INPS/acconto params
- `getForfettarioSourceOfTruthForYear(year)`: uses engine when available, falls back to basic calc
- `getAppliedForfettarioForYear(year)`: riduzione 35% applied post-engine
- `calcForfettarioForYear(year)`: year-aware tax computation
- `getContributionBaseForYear(year)`: INPS contribution base for engine input
- `getTaxEngine()`: safe accessor for `window.TaxEngine`

### Product behavior
- Explain every number in simple Italian
- Show installment status: stimato, da confermare, pagato, sovrastimato, sottostimato
- Keep storico and previsionale visible in parallel with warnings
- Highlight transition-year uncertainty
- In `Scadenziario`, keep competence as the default lens and cash as a secondary lens
- Show only fiscally relevant years by default, plus the single trailing settlement year after the last year with real revenues
- Keep `ordinario` / `misto` hidden behind toggle and never use them as automatic forfettario history without an explicit warning

## Planned data shape extension

Per year we want a richer fiscal block:

```js
{
  fiscalEngine: {
    declarations: [],
    plannedInstallments: [],
    importedSources: [],
    transitionEvents: [],
    warnings: []
  }
}
```

This is not fully persisted yet in UI flows, but the engine/module is designed for it.

## Import strategy

### Fiscozen planned taxes
- source fixture: `fiscozen/tasse_future.json`
- normalize into planned installments
- keep: due date, amount, amount range, description, family, reference year

### Fiscozen paid taxes
- source fixture: `fiscozen/tasse_pagate.json`
- normalize into actual payment records
- classify: imposta sostitutiva, INPS fisso, INPS eccedente, bollo, diritto camerale, INAIL, IRPEF/addizionali legacy

## Next implementation steps
1. Persist normalized imports in yearly state
2. Make scadenziario row explanations fully engine-driven
3. Finish migrating scadenziario to a full payment-event model for native partial payments
4. Add declaration/history UI
5. Add simulator: "se fatturo X entro dicembre", "storico vs previsionale delta"
6. Extend to gestione separata / casse professionali
