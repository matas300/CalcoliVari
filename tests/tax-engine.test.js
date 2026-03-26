const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const TaxEngine = require(path.join('..', 'tax-engine.js'));
const futureTaxes = require(path.join('..', 'fiscozen', 'tasse_future.json'));
const paidTaxes = require(path.join('..', 'fiscozen', 'tasse_pagate.json'));
const mattiaSummary2025 = require(path.join('..', 'fiscozen', 'mattia_2025_summary.json'));
const mattiaBreakdown2025 = require(path.join('..', 'fiscozen', 'mattia_f24_breakdown_2025.json'));

function amountFor(rows, predicate) {
  return rows
    .filter(predicate)
    .reduce((sum, row) => sum + (row.amount || row.paidAmount || 0), 0);
}

test('normalizes future taxes with family, reference year and schedule keys', () => {
  const rows = TaxEngine.normalizeFiscozenFutureTaxes(futureTaxes);

  const saldoImposta = rows.find(row => row.family === 'substitute_tax' && row.installmentType === 'saldo');
  assert.ok(saldoImposta, 'saldo imposta sostitutiva not found');
  assert.equal(saldoImposta.scheduleKey, 'imposta_saldo_2025');
  assert.equal(saldoImposta.referenceYear, 2025);
  assert.equal(saldoImposta.competenceYear, 2025);
  assert.equal(saldoImposta.isTax, true);

  const firstInpsRate = rows.find(row => row.family === 'inps_fixed' && row.installmentIndex === 1);
  assert.ok(firstInpsRate, 'first INPS fixed rate not found');
  assert.equal(firstInpsRate.scheduleKey, 'inps_fissi_1_2026');
  assert.equal(firstInpsRate.isContribution, true);

  const totals = TaxEngine.buildYearFamilyTotals(rows);
  assert.equal(totals[2026].substitute_tax.amount, 12287.16);
  assert.equal(totals[2026].inps_fixed.amount, 3391.02);
  assert.equal(totals[2026].inps_variable.amount, 6869.52);
  assert.equal(totals[2026].chamber_fee.amount, 53);
  assert.equal(totals[2026].tax_stamp.amount, 4);
});

test('normalizes paid taxes and preserves aggregate F24 bundles', () => {
  const rows = TaxEngine.normalizeFiscozenPaidTaxes(paidTaxes);
  const bundle = rows.find(row => row.id === '340897');

  assert.ok(bundle, 'bundle 340897 not found');
  assert.equal(bundle.isAggregateBundle, true);
  assert.equal(bundle.family, 'mixed_f24');
  assert.equal(bundle.bundleCount, 7);
  assert.equal(bundle.scheduleKey, 'f24_bundle_340897');
  assert.equal(bundle.children.length, 7);
  assert.deepEqual(
    bundle.children.map(child => child.family),
    ['other', 'irpef', 'irpef', 'inps_variable', 'regional_surtax', 'municipal_surtax', 'municipal_surtax']
  );

  const taxStamp = rows.find(row => row.id === '108406');
  assert.ok(taxStamp, 'tax stamp payment not found');
  assert.equal(taxStamp.family, 'tax_stamp');
  assert.equal(taxStamp.scheduleKey, 'bollo_q4prev_2025');
  assert.equal(taxStamp.paidAmount, 6);
});

test('builds year x family comparison rows with deltas and comments', () => {
  const futureRows = TaxEngine.normalizeFiscozenFutureTaxes(futureTaxes);
  const appScheduleRows = futureRows.map((row, index) => {
    const amount = row.family === 'substitute_tax' && row.referenceYear === 2025 && row.installmentType === 'saldo'
      ? row.amount + 100
      : row.amount;
    return {
      ...row,
      source: 'app_schedule',
      amount
    };
  });

  const matrix = TaxEngine.buildYearFamilyComparisonMatrix({
    future: futureRows,
    schedule: appScheduleRows,
    paid: TaxEngine.normalizeFiscozenPaidTaxes(paidTaxes),
    threshold: 50
  });

  const substitute2026 = matrix.find(row => row.year === 2026 && row.family === 'substitute_tax');
  assert.ok(substitute2026, 'comparison row not found');
  assert.equal(substitute2026.Fiscozen_future, 12287.16);
  assert.equal(substitute2026.App_schedule, 12387.16);
  assert.equal(substitute2026.Delta, 100);
  assert.equal(substitute2026.flagged, true);
  assert.match(substitute2026.comment, /App sopra Fiscozen/);
});

test('detects regime transition from ordinary to forfettario', () => {
  const diag = TaxEngine.buildTransitionDiagnostics({
    year: 2025,
    currentSettings: { regime: 'forfettario' },
    previousSettings: { regime: 'ordinario', haRedditoDipendente: 1 }
  });

  assert.equal(diag.isRegimeTransition, true);
  assert.ok(diag.warnings.some(warning => warning.includes('transizione di regime')));
  assert.ok(diag.warnings.some(warning => warning.includes('redditi da lavoro dipendente')));
});

test('keeps Mattia summary and F24 breakdown fixtures readable', () => {
  assert.equal(mattiaSummary2025.revenueTotal, 68992.12);
  assert.equal(mattiaSummary2025.regime, 'forfettario');
  assert.equal(mattiaBreakdown2025.lines.length, 7);
  assert.equal(amountFor(mattiaBreakdown2025.lines, row => row.family === 'irpef'), 0);
  assert.equal(mattiaBreakdown2025.allocationStatus, 'unallocated');
});
