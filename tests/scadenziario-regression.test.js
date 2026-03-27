const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ScadenziarioEngine = require(path.join('..', 'scadenziario-engine.js'));
const TaxEngine = require(path.join('..', 'tax-engine.js'));
const futureTaxes = require(path.join('..', 'fiscozen', 'tasse_future.json'));

test('keeps closed-year saldi anchored to the competence year and due in the following year', () => {
  const rows = TaxEngine.normalizeFiscozenFutureTaxes(futureTaxes);
  const impostaSaldo = rows.find(row => row.scheduleKey === 'imposta_saldo_2025');
  const contribSaldo = rows.find(row => row.scheduleKey === 'contributi_saldo_2025');

  assert.ok(impostaSaldo, 'saldo imposta 2025 not found');
  assert.ok(contribSaldo, 'saldo contributi 2025 not found');

  assert.equal(impostaSaldo.referenceYear, 2025);
  assert.equal(impostaSaldo.competenceYear, 2025);
  assert.equal(impostaSaldo.dueYear, 2026);
  assert.equal(impostaSaldo.isTax, true);

  assert.equal(contribSaldo.referenceYear, 2025);
  assert.equal(contribSaldo.competenceYear, 2025);
  assert.equal(contribSaldo.dueYear, 2026);
  assert.equal(contribSaldo.isContribution, true);

  const totals = TaxEngine.buildYearFamilyTotals(rows);
  assert.ok((totals[2026] && totals[2026].substitute_tax && totals[2026].substitute_tax.amount) > 0);
  assert.ok((totals[2026] && totals[2026].inps_variable && totals[2026].inps_variable.amount) > 0);
});

test('keeps the first forfettario year visible even when ordinary history is present', () => {
  assert.equal(ScadenziarioEngine.classifyFiscalYear({
    regime: 'forfettario',
    hasActivity: true,
    hasRows: true,
    hasImportedData: true,
    importedFamilies: ['irpef', 'regional_surtax', 'municipal_surtax']
  }), 'forfettario');

  const policy = ScadenziarioEngine.chooseMethodPolicy({
    previousYearType: 'ordinario',
    previousYearComplete: true
  });

  assert.equal(policy.recommendedMethod, 'previsionale');
  assert.match(policy.methodWarning, /sconsigliato/i);
});

test('excludes empty or zero-only years from the relevant fiscal year set', () => {
  assert.equal(ScadenziarioEngine.isRelevantFiscalYear({}), false);
  assert.equal(ScadenziarioEngine.isRelevantFiscalYear({
    hasRows: false,
    hasPayments: false,
    hasOverrides: false,
    hasImportedData: false,
    realRevenue: 0,
    estimatedRevenue: 0,
    amountDue: 0,
    amountPaid: 0
  }), false);
});

test('keeps the F24 guide copy hooks in the app source', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  assert.match(appSource, /const F24_GUIDE = \{/);
  assert.match(appSource, /renderF24Guide\(guideKey, rowItem\)/);
  assert.match(appSource, /toggleF24Guide\(key\)/);
  assert.match(appSource, /scad-f24-inline/);
  assert.match(appSource, /F24\?/);
  assert.match(appSource, /F24 precompilato dall\\'INPS/);
  assert.match(appSource, /F24 Web/);
});

test('keeps manual first-year inputs visible in the active scadenziario method box', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  assert.match(appSource, /Dati manuali \$\{prevYearLabel\} \(anno ordinario o misto\)/);
  assert.match(appSource, /primoAnnoImpostaPrec/);
  assert.match(appSource, /primoAnnoAccontiImpostaPrec/);
  assert.match(appSource, /primoAnnoContribVariabiliPrec/);
  assert.match(appSource, /primoAnnoAccontiContribPrec/);
});

test('keeps current-year saldo rows available for the trailing settlement year', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  assert.match(appSource, /key: `imposta_saldo_\$\{year\}`/);
  assert.match(appSource, /key: `contributi_saldo_\$\{year\}`/);
  assert.match(appSource, /certainty: isClosedYear \? 'fixed' : 'estimated'/);
});
