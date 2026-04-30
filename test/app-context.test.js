'use strict';
// Reset globals tra i test (importante: i moduli precedenti settano window/localStorage)
function resetGlobals() {
  if (typeof global !== 'undefined') {
    global.window = global.window || {};
    delete global.window.currentProfile;
    delete global.window.getProfile;
    delete global.window.getCurrentYear;
    delete global.window.currentYear;
    delete global.window.getSettings;
  }
  if (typeof global !== 'undefined') {
    global.sessionStorage = { getItem: function () { return null; } };
  }
}

resetGlobals();
var AC = require('../app-context.js');

describe('AppContext.getProfile', function () {
  test('usa window.currentProfile se stringa non vuota', function () {
    resetGlobals();
    global.window.currentProfile = 'Mattia';
    expect(AC.getProfile()).toBe('Mattia');
  });

  test('preferisce window.getProfile() se funzione disponibile', function () {
    resetGlobals();
    global.window.getProfile = function () { return 'Peru'; };
    global.window.currentProfile = 'Mattia';
    // window.getProfile vince
    expect(AC.getProfile()).toBe('Peru');
  });

  test('fallback sessionStorage se window globali assenti', function () {
    resetGlobals();
    global.sessionStorage = { getItem: function (k) { return k === 'calcoliPIVA_profile' ? 'Demo' : null; } };
    expect(AC.getProfile()).toBe('Demo');
  });

  test('null se tutti assenti', function () {
    resetGlobals();
    expect(AC.getProfile()).toBe(null);
  });

  test('window.getProfile throws → fallback a currentProfile', function () {
    resetGlobals();
    global.window.getProfile = function () { throw new Error('boom'); };
    global.window.currentProfile = 'Peru';
    expect(AC.getProfile()).toBe('Peru');
  });

  test('stringa vuota in currentProfile NON è valida → fallback', function () {
    resetGlobals();
    global.window.currentProfile = '';
    global.sessionStorage = { getItem: function (k) { return k === 'calcoliPIVA_profile' ? 'Demo' : null; } };
    expect(AC.getProfile()).toBe('Demo');
  });
});

describe('AppContext.getYear', function () {
  test('usa window.currentYear se number', function () {
    resetGlobals();
    global.window.currentYear = 2026;
    expect(AC.getYear()).toBe(2026);
  });

  test('fallback window.getCurrentYear() se funzione', function () {
    resetGlobals();
    global.window.getCurrentYear = function () { return 2025; };
    expect(AC.getYear()).toBe(2025);
  });

  test('fallback new Date().getFullYear() se nulla disponibile', function () {
    resetGlobals();
    expect(AC.getYear()).toBe(new Date().getFullYear());
  });

  test('window.currentYear non-number → fallback', function () {
    resetGlobals();
    global.window.currentYear = '2026';  // stringa, non valido come number
    expect(typeof AC.getYear()).toBe('number');
  });
});

describe('AppContext.getSettings', function () {
  test('usa window.getSettings() se ritorna object', function () {
    resetGlobals();
    global.window.getSettings = function () { return { regime: 'forfettario' }; };
    expect(AC.getSettings()).toEqual({ regime: 'forfettario' });
  });

  test('try/catch: window.getSettings throws → {}', function () {
    resetGlobals();
    global.window.getSettings = function () { throw new Error('boom'); };
    expect(AC.getSettings()).toEqual({});
  });

  test('window.getSettings non funzione → {}', function () {
    resetGlobals();
    expect(AC.getSettings()).toEqual({});
  });

  test('window.getSettings ritorna null → {}', function () {
    resetGlobals();
    global.window.getSettings = function () { return null; };
    expect(AC.getSettings()).toEqual({});
  });

  test('window.getSettings ritorna primitive → {}', function () {
    resetGlobals();
    global.window.getSettings = function () { return 'invalid'; };
    expect(AC.getSettings()).toEqual({});
  });
});
