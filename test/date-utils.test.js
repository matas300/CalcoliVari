'use strict';
var DU = require('../date-utils.js');

describe('DateUtils.todayIso', function () {
  test('formato YYYY-MM-DD', function () {
    expect(/^\d{4}-\d{2}-\d{2}$/.test(DU.todayIso())).toBe(true);
  });
  test('TZ-safe: matcha data locale', function () {
    var local = new Date();
    var iso = DU.todayIso();
    var parts = iso.split('-').map(function (s) { return parseInt(s, 10); });
    expect(parts[0]).toBe(local.getFullYear());
    expect(parts[1]).toBe(local.getMonth() + 1);
    expect(parts[2]).toBe(local.getDate());
  });
});

describe('DateUtils.pad2', function () {
  test('pad2(5) = "05"', function () { expect(DU.pad2(5)).toBe('05'); });
  test('pad2(15) = "15"', function () { expect(DU.pad2(15)).toBe('15'); });
  test('pad2(0) = "00"', function () { expect(DU.pad2(0)).toBe('00'); });
  test('pad2(99) = "99"', function () { expect(DU.pad2(99)).toBe('99'); });
});

describe('DateUtils.parseIsoDate', function () {
  test('ISO valido → oggetto', function () {
    expect(DU.parseIsoDate('2026-04-15')).toEqual({ year: 2026, month: 4, day: 15 });
  });
  test('formato non ISO → null', function () { expect(DU.parseIsoDate('15/04/2026')).toBe(null); });
  test('data invalida 31/02 → null', function () { expect(DU.parseIsoDate('2026-02-31')).toBe(null); });
  test('null → null', function () { expect(DU.parseIsoDate(null)).toBe(null); });
  test('undefined → null', function () { expect(DU.parseIsoDate(undefined)).toBe(null); });
  test('stringa vuota → null', function () { expect(DU.parseIsoDate('')).toBe(null); });
});

describe('DateUtils.parseDateParts (alias)', function () {
  test('è alias di parseIsoDate', function () {
    expect(DU.parseDateParts('2026-04-15')).toEqual({ year: 2026, month: 4, day: 15 });
  });
});

describe('DateUtils.addDaysIso', function () {
  test('add 7 giorni', function () { expect(DU.addDaysIso('2026-04-15', 7)).toBe('2026-04-22'); });
  test('add 0 → invariato', function () { expect(DU.addDaysIso('2026-04-15', 0)).toBe('2026-04-15'); });
  test('cross-month', function () { expect(DU.addDaysIso('2026-04-29', 5)).toBe('2026-05-04'); });
  test('cross-year', function () { expect(DU.addDaysIso('2026-12-30', 5)).toBe('2027-01-04'); });
  test('giorni negativi (sottrazione)', function () { expect(DU.addDaysIso('2026-04-15', -7)).toBe('2026-04-08'); });
});

describe('DateUtils.getEaster', function () {
  test('Pasqua 2026 = 5 aprile', function () { expect(DU.getEaster(2026)).toEqual([4, 5]); });
  test('Pasqua 2025 = 20 aprile', function () { expect(DU.getEaster(2025)).toEqual([4, 20]); });
  test('Pasqua 2024 = 31 marzo', function () { expect(DU.getEaster(2024)).toEqual([3, 31]); });
});

describe('DateUtils.isHoliday', function () {
  test('Capodanno 1 gennaio', function () { expect(DU.isHoliday(2026, 1, 1)).toBe(true); });
  test('Epifania 6 gennaio', function () { expect(DU.isHoliday(2026, 1, 6)).toBe(true); });
  test('Liberazione 25 aprile', function () { expect(DU.isHoliday(2026, 4, 25)).toBe(true); });
  test('Festa lavoro 1 maggio', function () { expect(DU.isHoliday(2026, 5, 1)).toBe(true); });
  test('Festa Repubblica 2 giugno', function () { expect(DU.isHoliday(2026, 6, 2)).toBe(true); });
  test('Ferragosto 15 agosto', function () { expect(DU.isHoliday(2026, 8, 15)).toBe(true); });
  test('Tutti i Santi 1 novembre', function () { expect(DU.isHoliday(2026, 11, 1)).toBe(true); });
  test('Immacolata 8 dicembre', function () { expect(DU.isHoliday(2026, 12, 8)).toBe(true); });
  test('Natale 25 dicembre', function () { expect(DU.isHoliday(2026, 12, 25)).toBe(true); });
  test('Santo Stefano 26 dicembre', function () { expect(DU.isHoliday(2026, 12, 26)).toBe(true); });
  test('Pasqua 2026 (5 aprile)', function () { expect(DU.isHoliday(2026, 4, 5)).toBe(true); });
  test('Pasquetta 2026 (6 aprile)', function () { expect(DU.isHoliday(2026, 4, 6)).toBe(true); });
  test('giorno feriale qualunque', function () { expect(DU.isHoliday(2026, 7, 15)).toBe(false); });
  test('Pasqua 2025 (20 aprile)', function () { expect(DU.isHoliday(2025, 4, 20)).toBe(true); });
});

describe('DateUtils.buildRolledDueDate', function () {
  test('giorno feriale → invariato', function () {
    // 30/06/2026 è martedì
    expect(DU.buildRolledDueDate(2026, 6, 30)).toEqual({ year: 2026, month: 6, day: 30 });
  });
  test('sabato → lunedì', function () {
    // 16/05/2026 è sabato → lunedì 18
    expect(DU.buildRolledDueDate(2026, 5, 16)).toEqual({ year: 2026, month: 5, day: 18 });
  });
  test('domenica → lunedì', function () {
    // 17/05/2026 è domenica → lunedì 18
    expect(DU.buildRolledDueDate(2026, 5, 17)).toEqual({ year: 2026, month: 5, day: 18 });
  });
  test('festività → giorno succ. lavorativo', function () {
    // Capodanno 1/1/2026 (giovedì) → 2/1/2026 (venerdì)
    expect(DU.buildRolledDueDate(2026, 1, 1)).toEqual({ year: 2026, month: 1, day: 2 });
  });
  test('festività + weekend a catena', function () {
    // 25/4/2026 sabato (Liberazione) → 26 dom → 27 lun
    expect(DU.buildRolledDueDate(2026, 4, 25)).toEqual({ year: 2026, month: 4, day: 27 });
  });
});
