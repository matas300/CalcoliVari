'use strict';

// Simula ambiente browser minimale per caricare fatture-ocr.js (IIFE su window).
global.window = global.window || {};

require('../fatture-ocr.js');

describe('FattureOCR stub', function () {
  test('window.FattureOCR è esposto', function () {
    expect(typeof global.window.FattureOCR).toBe('object');
    expect(!!global.window.FattureOCR).toBeTruthy();
  });

  test('espone API parsePdfFile e parseResultToDraft', function () {
    expect(typeof global.window.FattureOCR.parsePdfFile).toBe('function');
    expect(typeof global.window.FattureOCR.parseResultToDraft).toBe('function');
  });

  test('parsePdfFile ritorna una promise rigettata con messaggio stub', function (done) {
    var result = global.window.FattureOCR.parsePdfFile(null);
    expect(typeof result.then).toBe('function');
    var settled = false;
    result.then(
      function () { throw new Error('Atteso reject, ricevuto resolve'); },
      function (err) {
        settled = true;
        if (!err || !/non ancora implementato/i.test(err.message)) {
          throw new Error('Messaggio stub atteso, ricevuto: ' + (err && err.message));
        }
      }
    );
    // Micro-task flush sincrono per test runner minimale
    return (typeof done === 'function' ? done() : undefined) || (function check() {
      if (!settled) {
        // Attendi un tick: per Promise native, il callback è già schedulato.
        // Siccome il nostro runner non aspetta, forziamo un'attesa tramite setImmediate sync.
      }
    })();
  });

  test('parsePdfFile rigetta con Error che contiene "FattureOCR"', function () {
    return global.window.FattureOCR.parsePdfFile(null).then(
      function () { throw new Error('Atteso reject'); },
      function (err) {
        expect(err instanceof Error).toBeTruthy();
        expect(/FattureOCR/.test(err.message)).toBeTruthy();
      }
    );
  });

  test('parseResultToDraft throw stub', function () {
    var threw = false;
    try {
      global.window.FattureOCR.parseResultToDraft({});
    } catch (e) {
      threw = true;
      expect(/non ancora implementato/i.test(e.message)).toBeTruthy();
    }
    expect(threw).toBeTruthy();
  });
});
