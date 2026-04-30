'use strict';
var SK = require('../storage-keys.js');

describe('StorageKeys', function () {
  test('yearData', function () {
    expect(SK.yearData('Peru', 2026)).toBe('calcoliPIVA_Peru_2026');
  });
  test('fattureEmesse', function () {
    expect(SK.fattureEmesse('Peru')).toBe('calcoliPIVA_Peru_fattureEmesse');
  });
  test('clienti', function () {
    expect(SK.clienti('Mattia')).toBe('calcoliPIVA_Mattia_clienti');
  });
  test('giorniIncasso', function () {
    expect(SK.giorniIncasso('Peru')).toBe('calcoliPIVA_Peru_giorniIncasso');
  });
  test('icsExported', function () {
    expect(SK.icsExported('Peru', 2026)).toBe('calcoliPIVA_Peru_icsExported_2026');
  });
  test('crossYearReminderDismissed', function () {
    expect(SK.crossYearReminderDismissed('Peru', 2026)).toBe('calcoliPIVA_Peru_crossYearReminderDismissed_2026');
  });
  test('adeConservationAcknowledged', function () {
    expect(SK.adeConservationAcknowledged('Peru')).toBe('calcoliPIVA_Peru_adeConservationAcknowledged');
  });
  test('profileFiscal', function () {
    expect(SK.profileFiscal('Peru')).toBe('calcoliPIVA_profile_Peru');
  });
  test('profileFiscalLegacy', function () {
    expect(SK.profileFiscalLegacy('Peru')).toBe('calcoliPIVA_Peru_profileFiscal');
  });
  test('profileFiscalMigrated', function () {
    expect(SK.profileFiscalMigrated('Peru')).toBe('calcoliPIVA_Peru_profileFiscalMigrated');
  });
  test('profilePrefix', function () {
    expect(SK.profilePrefix('Peru')).toBe('calcoliPIVA_Peru_');
  });
  test('profile null → "_global"', function () {
    expect(SK.fattureEmesse(null)).toBe('calcoliPIVA__global_fattureEmesse');
    expect(SK.clienti(undefined)).toBe('calcoliPIVA__global_clienti');
  });
  test('PREFIX exposto', function () { expect(SK.PREFIX).toBe('calcoliPIVA_'); });
});
