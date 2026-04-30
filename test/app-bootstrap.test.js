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

  test('XML generato: Causale e Descrizione conformi XSD Latin-1 (no em-dash, smart quotes, ecc.)', function () {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          var win = dom.window;
          win.getProfileFiscalData = function () {
            return {
              partitaIva: '12345678901', codiceFiscale: 'PRURSS80A01H501Z',
              nome: 'Mario', cognome: 'Peru',
              indirizzo: 'Via Roma 1', cap: '00100', citta: 'Roma',
              provincia: 'RM', nazione: 'IT',
              iban: 'IT60X0542811101000000123456'
            };
          };
          win.currentProfile = 'Peru';
          win.data = win.data || {};
          win.data.settings = { regime: 'forfettario' };

          var draft = {
            id: 't1', numero: '2026/001', data: '2026-04-30',
            tipoDocumento: 'TD01',
            note: "Operazione effettuata ai sensi dell'art. 1 — regime forfettario — fine.",
            righe: [{ quantita: 1, prezzoUnitario: 100, descrizione: 'Servizio “premium” – 2026 € 100' }],
            modalitaPagamento: 'bonifico',
            scadenzaPagamento: '2026-05-30',
            ritenuta: 0, marcaDaBollo: false,
            clienteSnapshot: {
              denominazione: 'Café — Münster Co.',
              partitaIva: '11223344556',
              indirizzo: 'Straße der République 1',
              cap: '20100', citta: 'Milano', provincia: 'MI',
              nazione: 'IT', tipoCliente: 'PG'
            }
          };
          var xml = win.buildFatturaElettronicaXml(draft);

          function extractTexts(tag) {
            var re = new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>', 'g');
            var out = []; var m = xml.match(re) || [];
            m.forEach(function (raw) {
              var inner = raw.replace(new RegExp('^<' + tag + '>'), '').replace(new RegExp('<\\/' + tag + '>$'), '');
              out.push(inner);
            });
            return out;
          }
          var fields = ['Causale', 'Descrizione', 'Denominazione', 'Nome', 'Cognome', 'Indirizzo', 'Comune'];
          var problems = [];
          fields.forEach(function (tag) {
            extractTexts(tag).forEach(function (v) {
              for (var i = 0; i < v.length; i++) {
                var code = v.charCodeAt(i);
                if (code > 0xFF) {
                  problems.push('<' + tag + '>: char U+' + code.toString(16).toUpperCase().padStart(4,'0') + ' in "' + v + '"');
                  break;
                }
              }
            });
          });
          if (problems.length > 0) {
            return reject(new Error('Campi XSD String*LatinType con caratteri fuori range:\n  - ' + problems.join('\n  - ')));
          }
          var causaleArr = extractTexts('Causale');
          if (!causaleArr.length) return reject(new Error('Causale tag missing'));
          if (causaleArr[0].indexOf('—') !== -1) return reject(new Error('em-dash ancora in Causale: ' + causaleArr[0]));
          if (causaleArr[0].indexOf(' - regime') === -1) return reject(new Error('em-dash non sostituito da hyphen: ' + causaleArr[0]));

          var descArr = extractTexts('Descrizione');
          var descPremium = descArr.find(function (d) { return d.indexOf('premium') !== -1; });
          if (!descPremium) return reject(new Error('Descrizione premium missing'));
          if (descPremium.indexOf('“') !== -1 || descPremium.indexOf('”') !== -1) {
            return reject(new Error('smart quotes ancora in Descrizione: ' + descPremium));
          }
          if (descPremium.indexOf('€') !== -1) {
            return reject(new Error('€ ancora in Descrizione: ' + descPremium));
          }
          resolve();
        } catch (e) { reject(e); }
      }, 1500);
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
