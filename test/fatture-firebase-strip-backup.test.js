'use strict';
const { describe, test, expect } = global;
const path = require('path');

function loadCleanForFirestore() {
  global.window = global.window || {};
  global.document = global.document || { getElementById: () => null };
  delete require.cache[require.resolve(path.join(process.cwd(), 'firebase-sync.js'))];
  require(path.join(process.cwd(), 'firebase-sync.js'));
  return global.window.cleanForFirestore;
}

describe('cleanForFirestore strip _fattureManualeWipedBackup', () => {
  test('Esposta su window e rimuove il backup field', () => {
    const cleanForFirestore = loadCleanForFirestore();
    expect(typeof cleanForFirestore).toBe('function');
    const yearData = {
      settings: { regime: 'forfettario' },
      fatture: {},
      _fattureManualeWiped: '2026-05-08T10:00:00.000Z',
      _fattureManualeWipedBackup: { 3: [{ importo: 5000 }] }
    };
    const cleaned = cleanForFirestore(yearData);
    expect(cleaned.settings.regime).toBe('forfettario');
    expect(cleaned._fattureManualeWiped).toBe('2026-05-08T10:00:00.000Z');
    expect(cleaned._fattureManualeWipedBackup).toBeFalsy();
  });

  test('Pass-through quando il backup field non c e', () => {
    const cleanForFirestore = loadCleanForFirestore();
    const yearData = { settings: { regime: 'ordinario' } };
    const cleaned = cleanForFirestore(yearData);
    expect(cleaned.settings.regime).toBe('ordinario');
  });
});
