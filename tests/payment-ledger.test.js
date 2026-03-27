const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const PaymentLedger = require(path.join('..', 'payment-ledger.js'));

test('classifies payment states across unpaid, partial, paid, underpaid, overpaid and archived cases', () => {
  const futureRow = {
    scheduleKey: 'imposta_acc1_2026',
    amountDue: 100,
    dueDate: '2026-06-30',
    competenceYear: 2026,
    dueYear: 2026
  };
  assert.equal(PaymentLedger.buildPaymentStatus(futureRow, [], { now: new Date('2026-01-10T00:00:00Z') }).code, 'unpaid');
  assert.equal(PaymentLedger.buildPaymentStatus(futureRow, [{ amount: 40, cashYear: 2026 }], { now: new Date('2026-01-10T00:00:00Z') }).code, 'partial');
  assert.equal(PaymentLedger.buildPaymentStatus(futureRow, [{ amount: 120, cashYear: 2026 }], { now: new Date('2026-01-10T00:00:00Z') }).code, 'overpaid');
  assert.equal(PaymentLedger.buildPaymentStatus(futureRow, [{ amount: 100, cashYear: 2026 }], { now: new Date('2026-07-10T00:00:00Z') }).code, 'paid');

  const pastRow = {
    scheduleKey: 'imposta_saldo_2025',
    amountDue: 100,
    dueDate: '2025-06-30',
    competenceYear: 2025,
    dueYear: 2025
  };
  assert.equal(PaymentLedger.buildPaymentStatus(pastRow, [], { now: new Date('2025-07-10T00:00:00Z') }).code, 'underpaid');
  assert.equal(PaymentLedger.buildPaymentStatus({ ...futureRow, archived: true }, [], { now: new Date('2026-01-10T00:00:00Z') }).code, 'archived');
});

test('reconciles rows while preserving shared object identity', () => {
  const sharedRow = {
    scheduleKey: 'contributi_acc1_2026',
    amountDue: 500,
    dueDate: '2026-06-30',
    competenceYear: 2026,
    dueYear: 2026
  };
  const result = PaymentLedger.reconcileLedgerRows(
    [sharedRow, sharedRow],
    [
      { scheduleKey: 'contributi_acc1_2026', amount: 200, cashYear: 2026 },
      { scheduleKey: 'contributi_acc1_2026', amount: 300, cashYear: 2026 }
    ],
    { now: new Date('2026-01-10T00:00:00Z') }
  );

  assert.equal(result.rows[0], result.rows[1]);
});

test('patches payment events and keeps the cash year aligned with the edited date', () => {
  const updated = PaymentLedger.patchPaymentEvent([
    {
      id: 'pay_1',
      scheduleKey: 'imposta_acc1_2026',
      data: '2026-06-30',
      cashYear: 2026,
      amount: 40,
      tipo: 'tasse'
    }
  ], 'pay_1', {
    data: '2027-01-15',
    amount: 60
  });

  assert.equal(updated.length, 1);
  assert.equal(updated[0].amount, 60);
  assert.equal(updated[0].cashYear, 2027);
  assert.equal(updated[0].paymentDate, '2027-01-15');
});

test('sums linked payments by schedule key', () => {
  const total = PaymentLedger.sumPaymentsForScheduleKeys([
    { scheduleKey: 'imposta_acc1_2026', amount: 40 },
    { scheduleKey: 'imposta_acc2_2026', amount: 60 },
    { scheduleKey: 'altro', amount: 999 }
  ], ['imposta_acc1_2026', 'imposta_acc2_2026']);

  assert.equal(total, 100);
});
