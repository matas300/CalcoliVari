'use strict';

// FattureStorico è già caricato dai test precedenti (fatture-storico.test.js).
// Accediamo al namespace tramite global.window.
var FS = global.window && global.window.FattureStorico;

describe('FattureStorico — legacy badge helpers', function () {
  test('shouldShowLegacyBadge → true per origine legacy-migrated', function () {
    expect(FS.shouldShowLegacyBadge({ origine: 'legacy-migrated' })).toBe(true);
  });

  test('shouldShowLegacyBadge → false per origine wizard/manuale', function () {
    expect(FS.shouldShowLegacyBadge({ origine: 'wizard' })).toBe(false);
    expect(FS.shouldShowLegacyBadge({ origine: 'manuale' })).toBe(false);
  });

  test('shouldShowLegacyBadge → false se _legacyCompleted=true anche con origine legacy-migrated', function () {
    expect(FS.shouldShowLegacyBadge({ origine: 'legacy-migrated', _legacyCompleted: true })).toBe(false);
  });

  test('shouldShowLegacyBadge → false su input invalido', function () {
    expect(FS.shouldShowLegacyBadge(null)).toBe(false);
    expect(FS.shouldShowLegacyBadge(undefined)).toBe(false);
    expect(FS.shouldShowLegacyBadge('string')).toBe(false);
  });

  test('markLegacyCompleted → promuove origine a manuale e setta _legacyCompleted', function () {
    var f = { id: 'x', origine: 'legacy-migrated', numero: '2026/001' };
    var out = FS.markLegacyCompleted(f);
    expect(out.origine).toBe('manuale');
    expect(out._legacyCompleted).toBe(true);
    // Non muta l'originale
    expect(f.origine).toBe('legacy-migrated');
    expect(f._legacyCompleted === true).toBe(false);
  });

  test('markLegacyCompleted → badge non mostrato dopo promozione', function () {
    var f = { origine: 'legacy-migrated' };
    var out = FS.markLegacyCompleted(f);
    expect(FS.shouldShowLegacyBadge(out)).toBe(false);
  });
});
