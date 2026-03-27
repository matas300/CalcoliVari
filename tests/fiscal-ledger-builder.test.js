const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const FiscalLedgerBuilder = require(path.join('..', 'fiscal-ledger-builder.js'));

test('classifies empty and mixed years with vat start awareness', () => {
  assert.equal(FiscalLedgerBuilder.classifyFiscalYear({
    year: 2027,
    vatStartYear: 2024
  }), 'irrilevante');

  assert.equal(FiscalLedgerBuilder.classifyFiscalYear({
    year: 2024,
    vatStartYear: 2024,
    regime: 'ordinario',
    hasEmployeeIncome: true
  }), 'misto');
});

test('builds forfettario ledger rows for saldi, acconti and INPS fixed rates', () => {
  const ledger = FiscalLedgerBuilder.buildForfettarioLedger({
    year: 2026,
    vatStartYear: 2024,
    scheduleSettings: {
      regime: 'forfettario',
      haRedditoDipendente: 0
    },
    currentApplied: {
      tasse: 1200,
      inpsMode: 'artigiani_commercianti',
      useRiduzione: false
    },
    prevApplied: {
      tasse: 800
    },
    prevPrevApplied: {
      tasse: 1000
    },
    currentContribution: {
      mode: 'artigiani_commercianti',
      fixedAnnual: 400,
      fixedLabel: 'Contributi INPS fissi',
      saldoAccontoBase: 600,
      saldoLabel: 'Contributi INPS eccedenza'
    },
    prevContribution: {
      saldoAccontoBase: 500,
      saldoLabel: 'Contributi INPS eccedenza'
    },
    prevPrevContribution: {
      saldoAccontoBase: 400
    },
    forecastImposta: { amount: 1100, source: 'manual' },
    forecastContributi: { amount: 550, source: 'manual' },
    prevImpostaAccontiPaid: 100,
    prevContribAccontiPaid: 50,
    accontoMethod: 'storico',
    isClosedYear: false
  });

  assert.equal(ledger.classification, 'forfettario');
  assert.ok(ledger.rows.some(row => row.key === 'imposta_saldo_2025'));
  assert.ok(ledger.rows.some(row => row.key === 'imposta_acc1_2026'));
  assert.ok(ledger.rows.some(row => row.key === 'imposta_acc2_2026'));
  assert.ok(ledger.rows.some(row => row.key === 'contributi_saldo_2025'));
  assert.ok(ledger.rows.some(row => row.key === 'contributi_acc1_2026'));
  assert.ok(ledger.rows.some(row => row.key === 'inps_fissi_1_2026'));
  assert.ok(ledger.notes.length > 0);
});

test('emits manual override rows for mixed or unreconstructable years', () => {
  const ledger = FiscalLedgerBuilder.buildForfettarioLedger({
    year: 2025,
    vatStartYear: 2024,
    scheduleSettings: {
      regime: 'ordinario',
      haRedditoDipendente: 1
    },
    manualTotals: {
      tax: 900,
      contribution: 300
    },
    manualTotalsDueYear: 2026,
    accontoMethod: 'storico',
    isClosedYear: false
  });

  assert.equal(ledger.classification, 'misto');
  assert.ok(ledger.rows.some(row => row.key === 'manual_tax_2025'));
  assert.ok(ledger.rows.some(row => row.key === 'manual_contrib_2025'));
  assert.ok(ledger.notes.some(note => note.includes('Anno misto')));
});
