const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const F24ImportPipeline = require(path.join('..', 'f24-import.js'));
const fixture = require('./fixtures/f24-import-sample.json');

test('normalizes raw imported payments and keeps the core F24 fields', () => {
  const normalized = F24ImportPipeline.normalizeF24ImportPayload(fixture.rawImport);

  assert.equal(normalized.records.length, 2);

  const saldo = normalized.records[0];
  assert.equal(saldo.paymentDate, '2026-06-30');
  assert.equal(saldo.amount, 1792);
  assert.equal(saldo.paymentKind, 'tax');
  assert.equal(saldo.paymentCode, '1792');
  assert.equal(saldo.referenceYear, 2025);
  assert.equal(saldo.competenceYear, 2025);

  const inps = normalized.records[1];
  assert.equal(inps.paymentDate, '2026-02-16');
  assert.equal(inps.amount, 1106.76);
  assert.equal(inps.paymentKind, 'contribution');
});

test('builds candidate ledger matches and confirmation-ready payloads', () => {
  const result = F24ImportPipeline.processF24Import(fixture.rawImport, fixture.ledgerRows);

  assert.equal(result.summary.importedCount, 2);
  assert.equal(result.summary.autoSelectedCount, 2);
  assert.equal(result.records[0].confirmation.state, 'ready');
  assert.equal(result.records[0].confirmation.canAutoApply, true);
  assert.equal(result.records[0].confirmation.ledgerRow.scheduleKey, 'imposta_saldo_2025');
  assert.equal(result.records[1].confirmation.ledgerRow.scheduleKey, 'inps_fissi_4_2025');
  assert.ok(result.records[0].candidateMatches[0].score >= 80);
});

test('parses raw text paste input with headers', () => {
  const rawText = [
    'payment_date;amount;description;code',
    '30/06/2026;1.792,00;Saldo imposta sostitutiva rif. 2025;1792'
  ].join('\n');

  const normalized = F24ImportPipeline.normalizeF24ImportPayload(rawText);

  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.records[0].amount, 1792);
  assert.equal(normalized.records[0].paymentCode, '1792');
  assert.equal(normalized.records[0].paymentDate, '2026-06-30');
});
