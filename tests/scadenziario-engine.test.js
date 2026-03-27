const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ScadenziarioEngine = require(path.join('..', 'scadenziario-engine.js'));

test('classifies fiscal years coherently', () => {
  assert.equal(ScadenziarioEngine.classifyFiscalYear({
    regime: 'forfettario',
    hasActivity: true,
    hasRows: true
  }), 'forfettario');

  assert.equal(ScadenziarioEngine.classifyFiscalYear({
    regime: 'ordinario',
    hasActivity: true,
    hasRows: true
  }), 'ordinario');

  assert.equal(ScadenziarioEngine.classifyFiscalYear({
    regime: 'ordinario',
    hasActivity: true,
    hasRows: true,
    hasEmployeeIncome: true
  }), 'misto');

  assert.equal(ScadenziarioEngine.classifyFiscalYear({}), 'vuoto');
});

test('marks year relevance only when there is meaningful fiscal data', () => {
  assert.equal(ScadenziarioEngine.isRelevantFiscalYear({}), false);
  assert.equal(ScadenziarioEngine.isRelevantFiscalYear({ realRevenue: 10 }), true);
  assert.equal(ScadenziarioEngine.isRelevantFiscalYear({ hasRows: true }), true);
  assert.equal(ScadenziarioEngine.isRelevantFiscalYear({ hasPayments: true }), true);
});

test('computes payment status with partial, paid and cross-year cases', () => {
  const row = {
    competenceYear: 2025,
    dueYear: 2026,
    dueDate: '2026-06-30',
    amountDue: 1000
  };
  const partial = ScadenziarioEngine.buildPaymentStatus(row, [
    { amount: 400, cashYear: 2026 }
  ], { now: new Date('2026-01-10T00:00:00Z') });
  assert.equal(partial.code, 'partial');
  assert.equal(partial.amountPaid, 400);
  assert.equal(partial.residualAmount, 600);
  assert.equal(partial.isCrossYear, true);

  const paid = ScadenziarioEngine.buildPaymentStatus(row, [
    { amount: 1000, cashYear: 2026 }
  ], { now: new Date('2026-07-10T00:00:00Z') });
  assert.equal(paid.code, 'paid');
  assert.equal(paid.isArchived, true);
});

test('groups payment events by cash year preserving competence year', () => {
  const grouped = ScadenziarioEngine.groupPaymentEventsByCashYear([
    {
      scheduleKey: 'imposta_saldo_2025',
      competenceYear: 2025,
      title: 'Imposta sostitutiva',
      paymentStatus: { code: 'paid' },
      paymentEvents: [
        { amount: 100, paymentDate: '2026-06-30', cashYear: 2026 },
        { amount: 50, paymentDate: '2027-01-10', cashYear: 2027 }
      ]
    }
  ]);

  assert.equal(grouped[2026].length, 1);
  assert.equal(grouped[2026][0].competenceYear, 2025);
  assert.equal(grouped[2027].length, 1);
  assert.equal(grouped[2027][0].amount, 50);
});

test('normalizes a legacy row once and reuses the same row object in cash grouping', () => {
  const row = ScadenziarioEngine.normalizeLegacyScheduleRow({
    key: 'imposta_saldo_2025',
    title: 'Saldo imposta sostitutiva',
    competence: 'Saldo 2025',
    due: { year: 2026, label: '30 Giu 2026', date: new Date('2026-06-30T00:00:00Z') },
    amount: 1200,
    fiscalYear: 2025,
    paymentEvents: [
      { amount: 1200, cashYear: 2026, paymentDate: '2026-06-30' }
    ]
  }, { now: new Date('2026-03-27T00:00:00Z') });

  assert.equal(row.scheduleKey, 'imposta_saldo_2025');
  assert.equal(row.competenceYear, 2025);
  assert.equal(row.dueYear, 2026);
  assert.equal(row.dueDate, '2026-06-30');
  assert.equal(row.isCrossYear, true);
  assert.equal(row.paymentStatus.code, 'paid');

  const grouped = ScadenziarioEngine.groupRowsByCashYear([row]);
  assert.equal(grouped[2026].length, 1);
  assert.equal(grouped[2026][0].row, row);
  assert.equal(grouped[2026][0].paymentEvent.amount, 1200);
});

test('normalizes imported historical rows as manual-only cross-year entries', () => {
  const row = ScadenziarioEngine.normalizeImportedFiscalEntry({
    id: 'import-1',
    scheduleKey: 'irpef_acc1_2025',
    label: 'IRPEF - Acconto - I Rata',
    referenceYear: 2025,
    dueYear: 2026,
    dueDate: '2026-06-30',
    paidAmount: 946,
    isTax: true
  }, { year: 2025, regimeType: 'ordinario' });

  assert.equal(row.source, 'fiscozen_import');
  assert.equal(row.paymentMode, 'manual_only');
  assert.equal(row.supportsPartialPayment, false);
  assert.equal(row.paymentStatus.code, 'paid');
  assert.equal(row.isCrossYear, true);
});

test('picks the trailing settlement source only from compiled forfettario years', () => {
  const trailingYear = ScadenziarioEngine.resolveTrailingSettlementSourceYear([
    { year: 2025, classification: 'forfettario', hasCompiledRevenueAnchor: true },
    { year: 2026, classification: 'forfettario', hasCompiledRevenueAnchor: true },
    { year: 2027, classification: 'forfettario', hasCompiledRevenueAnchor: false },
    { year: 2024, classification: 'misto', hasCompiledRevenueAnchor: false, hasHistoricalAnchor: true }
  ]);

  assert.equal(trailingYear, 2026);
});

test('displays only compiled forfettario years plus historical years on demand', () => {
  assert.equal(ScadenziarioEngine.shouldDisplayFiscalYear({
    year: 2026,
    classification: 'forfettario',
    hasCompiledRevenueAnchor: true,
    hasHistoricalAnchor: false
  }, { includeHistoricalYears: false, includeEmptyYears: false }), true);

  assert.equal(ScadenziarioEngine.shouldDisplayFiscalYear({
    year: 2027,
    classification: 'forfettario',
    hasCompiledRevenueAnchor: false,
    hasHistoricalAnchor: false
  }, { includeHistoricalYears: false, includeEmptyYears: false }), false);

  assert.equal(ScadenziarioEngine.shouldDisplayFiscalYear({
    year: 2024,
    classification: 'misto',
    hasCompiledRevenueAnchor: false,
    hasHistoricalAnchor: true
  }, { includeHistoricalYears: false, includeEmptyYears: false }), false);

  assert.equal(ScadenziarioEngine.shouldDisplayFiscalYear({
    year: 2024,
    classification: 'misto',
    hasCompiledRevenueAnchor: false,
    hasHistoricalAnchor: true
  }, { includeHistoricalYears: true, includeEmptyYears: false }), true);
});

test('recommends previsionale when previous year is ordinary or mixed', () => {
  const closed = ScadenziarioEngine.chooseMethodPolicy({ isClosedYear: true });
  assert.equal(closed.recommendedMethod, 'consuntivo');

  const ordinary = ScadenziarioEngine.chooseMethodPolicy({
    previousYearType: 'ordinario',
    previousYearComplete: true
  });
  assert.equal(ordinary.recommendedMethod, 'previsionale');
  assert.match(ordinary.methodWarning, /sconsigliato/i);

  const pureForfettario = ScadenziarioEngine.chooseMethodPolicy({
    previousYearType: 'forfettario',
    previousYearComplete: true
  });
  assert.equal(pureForfettario.recommendedMethod, 'storico');
});
