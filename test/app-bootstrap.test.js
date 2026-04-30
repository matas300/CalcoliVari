'use strict';
// Smoke test JSDOM: carica index.html con TUTTI gli script in ordine reale
// e verifica che l'init non lanci ReferenceError. Cattura la classe di bug
// "estraggo X in IIFE → bare-name lookup fallisce a runtime browser".
// Gli unit test puri (Node) NON catturano questo perché non simulano il
// caricamento sequenziale di <script> tag con global scope condiviso.

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var jsdom;
try { jsdom = require('jsdom'); }
catch (e) {
  console.warn('  [skip] jsdom non installato — `npm install --no-save jsdom`');
  return;
}

var thrownErrors = [];
var consoleErrors = [];
var virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on('jsdomError', function (err) { thrownErrors.push(err); });
virtualConsole.on('error', function (err) { consoleErrors.push(err); });

var dom = new jsdom.JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8'), {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'file://' + ROOT + '/',
  virtualConsole: virtualConsole,
  pretendToBeVisual: true,
  // Stub globali esterni (Firebase, Tesseract, jsPDF, html2pdf, jszip, pdf.js)
  // sono tutti caricati via CDN che jsdom non scarica; inietto stub in window.
  beforeParse: function (window) {
    // window.crypto è getter-only in jsdom recente; non serve overridare
    // (doLogin non viene chiamato in questo smoke test).
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), writable: true, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: makeStorage(), writable: true, configurable: true });
    window.matchMedia = function () { return { matches: false, addEventListener: function () {}, removeEventListener: function () {} }; };
    window.fetch = function () { return Promise.resolve({ ok: false, status: 0, json: function () { return Promise.resolve({}); } }); };
  }
});

function makeStorage() {
  var store = {};
  return {
    getItem: function (k) { return store[k] === undefined ? null : store[k]; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; },
    key: function (i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; }
  };
}

describe('app bootstrap (jsdom)', function () {
  test('index.html carica tutti gli script senza ReferenceError critici', function () {
    return new Promise(function (resolve) {
      // Aspetta load + 200ms per catturare promise rejections async
      dom.window.addEventListener('load', function () {
        setTimeout(function () {
          var refErrors = thrownErrors.filter(function (e) {
            var msg = (e && e.message) || String(e);
            return /ReferenceError/.test(msg) || /is not defined/.test(msg);
          });
          var critical = refErrors.map(function (e) { return e.message || String(e); });
          if (critical.length > 0) {
            throw new Error('ReferenceError catturati al boot:\n  - ' + critical.join('\n  - '));
          }
          resolve();
        }, 300);
      });
    });
  });

  test('Funzioni chiave esposte su window dopo caricamento moduli', function () {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          var win = dom.window;
          var required = [
            'recalcAll', 'loadData', 'saveData', 'loadYearData', 'saveYearData',
            'renderCalcolo', 'renderRiepilogo', 'renderCalendar', 'renderFatture',
            'renderAccantonamento', 'renderScadenziario', 'renderBudget', 'renderClienti',
            'switchToTab', 'changeYear', 'doLogin', 'S', 'getProfileFiscalData'
          ];
          var missing = required.filter(function (fn) { return typeof win[fn] !== 'function'; });
          if (missing.length > 0) {
            throw new Error('Funzioni mancanti su window: ' + missing.join(', '));
          }
          resolve();
        } catch (e) { reject(e); }
      }, 1500);  // delay maggiore per permettere a tutti gli script CDN di caricare
    });
  });

  test('Bare-name lookup cross-script: escapeHtml accessibile da nuovo <script>', function () {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          var probe = dom.window.document.createElement('script');
          probe.textContent =
            'window.__probe_escapeHtml = (typeof escapeHtml === "function") ? escapeHtml("<x>") : "MISSING:" + (typeof escapeHtml);' +
            'window.__probe_xmlEscape = (typeof xmlEscape === "function") ? xmlEscape("<x>") : "MISSING:" + (typeof xmlEscape);' +
            'window.__probe_fmt = (typeof fmt === "function") ? "OK" : "MISSING";' +
            'window.__probe_MONTHS = (typeof MONTHS !== "undefined" && MONTHS.length === 12) ? "OK" : "MISSING";';
          dom.window.document.body.appendChild(probe);
          setTimeout(function () {
            var p = dom.window;
            if (p.__probe_escapeHtml !== '&lt;x&gt;') {
              return reject(new Error('escapeHtml non accessibile bare-name: ' + p.__probe_escapeHtml));
            }
            if (p.__probe_xmlEscape !== '&lt;x&gt;') {
              return reject(new Error('xmlEscape non accessibile bare-name: ' + p.__probe_xmlEscape));
            }
            if (p.__probe_fmt !== 'OK') return reject(new Error('fmt non accessibile bare-name'));
            if (p.__probe_MONTHS !== 'OK') return reject(new Error('MONTHS non accessibile bare-name'));
            resolve();
          }, 100);
        } catch (e) { reject(e); }
      }, 1500);
    });
  });
});
