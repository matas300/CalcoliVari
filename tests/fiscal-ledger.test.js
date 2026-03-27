const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const FiscalLedger = require(path.join('..', 'fiscal-ledger.js'));

test('builds stable ids and normalizes the canonical row model', () => {
  const baseRow = {
    scheduleKey: 'imposta_saldo_2025',
    competenceYear: 2025,
    dueDate: '2026-06-30',
    title: 'Imposta sostitutiva',
    family: 'substitute_tax',
    kind: 'tax',
    regimeType: 'forfettario',
    source: 'calculated',
    originType: 'schedule',
    amountDue: 1000
  };
  const variantRow = {
    ...baseRow,
    note: 'same obligation, different presentation',
    warnings: ['view-only warning'],
    cashYear: 2026
  };

  assert.equal(FiscalLedger.stableLedgerId(baseRow), FiscalLedger.stableLedgerId(variantRow));

  const normalized = FiscalLedger.normalizeLedgerRow(baseRow);
  const requiredFields = [
    'id',
    'scheduleKey',
    'competenceYear',
    'dueDate',
    'cashYear',
    'paidDate',
    'title',
    'family',
    'kind',
    'regimeType',
    'amountDue',
    'amountPaid',
    'residualAmount',
    'status',
    'source',
    'originType',
    'isCrossYear',
    'note',
    'warnings'
  ];

  assert.deepEqual(Object.keys(normalized).sort(), requiredFields.sort());
  assert.equal(normalized.id, 'ledger:imposta_saldo_2025');
  assert.equal(normalized.cashYear, 2026);
  assert.equal(normalized.isCrossYear, true);
  assert.equal(normalized.status, 'open');
  assert.equal(normalized.residualAmount, 1000);
  assert.match(normalized.warnings.join('\n'), /competence year/i);
});

test('groups by competence and cash year without cloning the same ledger row', () => {
  const row = FiscalLedger.normalizeLedgerRow({
    scheduleKey: 'contributi_acc1_2026',
    competenceYear: 2026,
    dueDate: '2027-06-30',
    title: 'Contributi INPS',
    family: 'inps_variable',
    kind: 'contribution',
    regimeType: 'forfettario',
    source: 'calculated',
    originType: 'schedule',
    amountDue: 400
  });

  const byCompetence = FiscalLedger.groupLedgerRowsByCompetenceYear([row]);
  const byCash = FiscalLedger.groupLedgerRowsByCashYear([row]);

  assert.equal(byCompetence[2026].length, 1);
  assert.strictEqual(byCompetence[2026][0], row);
  assert.equal(byCash[2027].length, 1);
  assert.strictEqual(byCash[2027][0], row);
});

test('splits open, archived and credit rows and derives totals without double counting', () => {
  const openRow = FiscalLedger.normalizeLedgerRow({
    scheduleKey: 'irpef_acc1_2026',
    competenceYear: 2026,
    dueDate: '2026-11-30',
    title: 'IRPEF acconto 1',
    family: 'substitute_tax',
    kind: 'tax',
    regimeType: 'forfettario',
    source: 'calculated',
    originType: 'schedule',
    amountDue: 1000
  });
  const paidRow = FiscalLedger.normalizeLedgerRow({
    scheduleKey: 'irpef_saldo_2025',
    competenceYear: 2025,
    dueDate: '2026-06-30',
    title: 'IRPEF saldo',
    family: 'substitute_tax',
    kind: 'tax',
    regimeType: 'forfettario',
    source: 'calculated',
    originType: 'schedule',
    amountDue: 800,
    amountPaid: 800
  });
  const creditRow = FiscalLedger.normalizeLedgerRow({
    id: 'manual-credit',
    competenceYear: 2026,
    dueDate: '2026-12-31',
    title: 'Credito',
    family: 'other',
    kind: 'adjustment',
    regimeType: 'forfettario',
    source: 'manual',
    originType: 'adjustment',
    amountDue: 0,
    amountPaid: 0
  });

  const split = FiscalLedger.splitLedgerRowsByState([openRow, paidRow, creditRow, paidRow]);
  const totals = FiscalLedger.deriveLedgerTotals([openRow, paidRow, creditRow, paidRow]);

  assert.equal(split.open.length, 1);
  assert.equal(split.archive.length, 1);
  assert.equal(split.credits.length, 1);
  assert.equal(totals.rowCount, 3);
  assert.equal(totals.amountDue, 1800);
  assert.equal(totals.amountPaid, 800);
  assert.equal(totals.residualAmount, 1000);
  assert.equal(totals.openCount, 1);
  assert.equal(totals.archiveCount, 1);
  assert.equal(totals.creditCount, 1);
  assert.equal(totals.crossYearCount, 1);
});
