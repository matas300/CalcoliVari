'use strict';
// R9 — nota/methodText saldo contributi N-1 coerente con disponibilità dati.
// Testa la funzione pura estratta in `scadenziario-saldo-helpers.js`.

var helpers = require('../scadenziario-saldo-helpers.js');
var build = helpers.buildSaldoContribN1MethodText;

describe('R9 — buildSaldoContribN1MethodText', function () {
  test('override manuale utente → "Importo manuale"', function () {
    expect(build(true, false, true, 0, 2026)).toBe('Importo manuale');
    // vince anche se non c'è storico
    expect(build(false, false, true, 0, 2026)).toBe('Importo manuale');
  });

  test('firstYearManualUsed (primoAnno*) → "Manuale primo utilizzo"', function () {
    expect(build(false, true, false, 0, 2026)).toBe('Manuale primo utilizzo');
  });

  test('nessuno storico né primoAnno* → "Dati anno precedente non disponibili"', function () {
    expect(build(false, false, false, 0, 2026)).toBe('Dati anno precedente non disponibili');
  });

  test('storico presente con acconti N-1 già pagati → "{year-1} netto acconti"', function () {
    expect(build(true, false, false, 1500, 2026)).toBe('2025 netto acconti');
  });

  test('storico presente senza acconti pagati → "Totale {year-1}"', function () {
    expect(build(true, false, false, 0, 2026)).toBe('Totale 2025');
  });

  test('year param usato correttamente per anni diversi', function () {
    expect(build(true, false, false, 0, 2024)).toBe('Totale 2023');
    expect(build(true, false, false, 100, 2024)).toBe('2023 netto acconti');
  });

  test('priorità: manual > firstYear > hasHistorical', function () {
    // manual vince anche con firstYear + historical
    expect(build(true, true, true, 500, 2026)).toBe('Importo manuale');
    // firstYear vince anche con historical
    expect(build(true, true, false, 500, 2026)).toBe('Manuale primo utilizzo');
  });
});
