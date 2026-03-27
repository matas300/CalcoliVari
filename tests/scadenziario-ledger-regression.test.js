const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ScadenziarioEngine = require(path.join('..', 'scadenziario-engine.js'));
const TaxEngine = require(path.join('..', 'tax-engine.js'));
const futureTaxes = require(path.join('..', 'fiscozen', 'tasse_future.json'));
const paidTaxes = require(path.join('..', 'fiscozen', 'tasse_pagate.json'));
const mattiaSummary2025 = require(path.join('..', 'fiscozen', 'mattia_2025_summary.json'));

function attachStatus(row, paymentEvents, nowIso) {
  const paymentStatus = ScadenziarioEngine.buildPaymentStatus(row, paymentEvents, {
    now: new Date(nowIso)
  });

  return {
    ...row,
    paymentEvents: paymentEvents || [],
    paymentStatus
  };
}

test('keeps a pure forfettario year open until rows are actually paid', () => {
  const futureRows = TaxEngine.normalizeFiscozenFutureTaxes(futureTaxes);
  const rows = [
    futureRows.find(row => row.scheduleKey === 'imposta_saldo_2025'),
    futureRows.find(row => row.scheduleKey === 'imposta_acc1_2026'),
    futureRows.find(row => row.scheduleKey === 'imposta_acc2_2026'),
    futureRows.find(row => row.scheduleKey === 'contributi_saldo_2025'),
    futureRows.find(row => row.scheduleKey === 'contributi_acc1_2026')
  ].filter(Boolean);
  const datedRows = rows.map(row => attachStatus(row, [], '2026-03-27T00:00:00Z'));

  assert.equal(
    ScadenziarioEngine.classifyFiscalYear({
      regime: 'forfettario',
      hasActivity: true,
      hasRows: true
    }),
    'forfettario'
  );

  const split = ScadenziarioEngine.splitRowsByPaymentState(datedRows);
  const totals = ScadenziarioEngine.computeScheduleTotals(datedRows);

  assert.equal(split.open.length, datedRows.length);
  assert.equal(split.archived.length, 0);
  assert.equal(totals.amountPaid, 0);
  assert.equal(
    totals.amountDue,
    datedRows.reduce((sum, row) => sum + (row.amountDue || row.amount || 0), 0)
  );
});

test('moves a cross-year saldo out of open views once the payment is linked', () => {
  const futureRows = TaxEngine.normalizeFiscozenFutureTaxes(futureTaxes);
  const row = futureRows.find(item => item.scheduleKey === 'imposta_saldo_2025');
  assert.ok(row, 'cross-year saldo not found in fixture');

  const paymentEvents = [
    {
      id: 'f24-2026-06-30',
      paymentDate: '2026-06-30',
      cashYear: 2026,
      amount: row.amount,
      note: 'semi-automatic import'
    }
  ];
  const paidRow = attachStatus(row, paymentEvents, '2026-07-01T00:00:00Z');
  const split = ScadenziarioEngine.splitRowsByPaymentState([paidRow]);
  const cashGroups = ScadenziarioEngine.groupPaymentEventsByCashYear([paidRow]);

  assert.equal(paidRow.paymentStatus.code, 'paid');
  assert.equal(paidRow.paymentStatus.isArchived, true);
  assert.equal(paidRow.paymentStatus.isCrossYear, true);
  assert.equal(split.open.length, 0);
  assert.equal(split.archived.length, 1);
  assert.equal(cashGroups[2026].length, 1);
  assert.equal(cashGroups[2026][0].competenceYear, 2025);
  assert.equal(cashGroups[2026][0].scheduleKey, 'imposta_saldo_2025');
});

test('keeps partial payments, undo and totals aligned without double counting', () => {
  const row = {
    title: 'Contributi INPS eccedenza',
    scheduleKey: 'contributi_acc1_2026',
    kind: 'contribution',
    family: 'inps_variable',
    competenceYear: 2026,
    dueYear: 2026,
    dueDate: '2026-11-30',
    amountDue: 1000
  };
  const partialEvents = [
    { amount: 400, paymentDate: '2026-06-30', cashYear: 2026 },
    { amount: 100, paymentDate: '2026-07-15', cashYear: 2026 }
  ];
  const partialRow = attachStatus(row, partialEvents, '2026-07-16T00:00:00Z');
  const reopenedRow = attachStatus(row, [], '2026-07-16T00:00:00Z');
  const partialTotals = ScadenziarioEngine.computeScheduleTotals([partialRow]);
  const reopenedSplit = ScadenziarioEngine.splitRowsByPaymentState([reopenedRow]);

  assert.equal(partialRow.paymentStatus.code, 'partial');
  assert.equal(partialRow.paymentStatus.amountPaid, 500);
  assert.equal(partialRow.paymentStatus.residualAmount, 500);
  assert.equal(partialTotals.amountDue, 1000);
  assert.equal(partialTotals.amountPaid, 500);
  assert.equal(partialTotals.residualAmount, 500);
  assert.equal(reopenedRow.paymentStatus.code, 'unpaid');
  assert.equal(reopenedSplit.open.length, 1);
  assert.equal(reopenedSplit.archived.length, 0);
});

test('recomputes future saldi after payments and preserves manual previsionale overrides', () => {
  const withNoLinkedPayments = TaxEngine.buildForfettarioMethodComparison({
    year: 2026,
    methodSetting: 'previsionale',
    currentSettings: {
      regime: 'forfettario',
      coefficiente: 67,
      impostaSostitutiva: 15
    },
    previousSettings: {
      regime: 'ordinario',
      haRedditoDipendente: 1
    },
    grossCollected: mattiaSummary2025.revenueTotal,
    currentContribution: {
      mode: 'artigiani_commercianti',
      saldoAccontoBase: 6869.52
    },
    previousContribution: {
      mode: 'artigiani_commercianti',
      saldoAccontoBase: 6869.52
    },
    previousContributionAccontiPaid: 0,
    forecastContributionBase: 7777.77,
    forecastTaxBase: 8888.88
  });

  const withLinkedPayments = TaxEngine.buildForfettarioMethodComparison({
    year: 2026,
    methodSetting: 'previsionale',
    currentSettings: {
      regime: 'forfettario',
      coefficiente: 67,
      impostaSostitutiva: 15
    },
    previousSettings: {
      regime: 'ordinario',
      haRedditoDipendente: 1
    },
    grossCollected: mattiaSummary2025.revenueTotal,
    currentContribution: {
      mode: 'artigiani_commercianti',
      saldoAccontoBase: 6869.52
    },
    previousContribution: {
      mode: 'artigiani_commercianti',
      saldoAccontoBase: 6869.52
    },
    previousContributionAccontiPaid: 1100,
    forecastContributionBase: 7777.77,
    forecastTaxBase: 8888.88
  });

  assert.equal(withLinkedPayments.selectedMethod, 'previsionale');
  assert.equal(withLinkedPayments.selected.contributionAccontoBase, 7777.77);
  assert.equal(withLinkedPayments.selected.taxAccontoBase, 8888.88);
  assert.match(withLinkedPayments.warnings.join('\n'), /transizione di regime/i);
  assert.ok(withLinkedPayments.historical.previousContributionSaldo < withNoLinkedPayments.historical.previousContributionSaldo);
  assert.ok(withLinkedPayments.historical.managedCashOutflows < withNoLinkedPayments.historical.managedCashOutflows);
});

test('matches an imported payment to the ledger row and keeps yearly totals stable', () => {
  const paidRows = TaxEngine.normalizeFiscozenPaidTaxes(paidTaxes);
  const importedPayment = paidRows.find(row => row.scheduleKey === 'irpef_acc1_2025');
  assert.ok(importedPayment, 'imported payment fixture not found');

  const ledgerRow = {
    title: 'IRPEF - acconto 1',
    scheduleKey: 'irpef_acc1_2025',
    kind: 'tax',
    family: 'irpef',
    competenceYear: 2025,
    dueYear: 2025,
    dueDate: '2025-12-01',
    amountDue: importedPayment.paidAmount,
    low: importedPayment.paidAmount,
    high: importedPayment.paidAmount
  };
  const paymentEvents = [
    {
      paymentId: importedPayment.id,
      paymentDate: importedPayment.dueDate,
      cashYear: importedPayment.dueYear,
      amount: importedPayment.paidAmount,
      note: importedPayment.description
    }
  ];
  const matchedRow = attachStatus(ledgerRow, paymentEvents, '2025-12-02T00:00:00Z');
  const split = ScadenziarioEngine.splitRowsByPaymentState([matchedRow]);
  const cashGroups = ScadenziarioEngine.groupPaymentEventsByCashYear([matchedRow]);
  const totals = ScadenziarioEngine.computeScheduleTotals([matchedRow]);

  assert.equal(matchedRow.paymentStatus.code, 'paid');
  assert.equal(split.open.length, 0);
  assert.equal(split.archived.length, 1);
  assert.equal(cashGroups[2025].length, 1);
  assert.equal(cashGroups[2025][0].scheduleKey, 'irpef_acc1_2025');
  assert.equal(cashGroups[2025][0].competenceYear, 2025);
  assert.equal(totals.amountDue, importedPayment.paidAmount);
  assert.equal(totals.amountPaid, importedPayment.paidAmount);
  assert.equal(totals.residualAmount, 0);
});
