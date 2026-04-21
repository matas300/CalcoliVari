'use strict';

// Ambiente browser minimo + DOMParser shim (getElementsByTagName ricorsivo)
global.window = global.window || {};

function makeNode(tag, text, children) {
  var node = {
    tagName: tag,
    textContent: text || '',
    _children: children || [],
    getElementsByTagName: function (t) {
      var out = [];
      function walk(n) {
        (n._children || []).forEach(function (c) {
          if (c.tagName === t) out.push(c);
          walk(c);
        });
      }
      walk(node);
      return out;
    }
  };
  return node;
}

function parseXmlToTree(xml) {
  var i = 0;
  xml = xml.replace(/<\?[^?]*\?>/g, '').trim();
  function skipWs() { while (i < xml.length && /\s/.test(xml[i])) i++; }
  function parseTag() {
    skipWs();
    if (xml[i] !== '<') return null;
    if (xml.substr(i, 4) === '<!--') {
      var end = xml.indexOf('-->', i);
      i = end + 3;
      return parseTag();
    }
    var close = xml.indexOf('>', i);
    var raw = xml.substring(i + 1, close);
    i = close + 1;
    var selfClosed = raw.endsWith('/');
    if (selfClosed) raw = raw.slice(0, -1).trim();
    var isClose = raw[0] === '/';
    if (isClose) return { close: raw.slice(1).trim().split(/\s+/)[0] };
    var tag = raw.split(/\s+/)[0].replace(/^[a-zA-Z]+:/, '');
    if (selfClosed) return makeNode(tag, '', []);
    var children = [];
    var textBuf = '';
    while (i < xml.length) {
      if (xml[i] === '<') {
        if (xml.substr(i, 4) === '<!--') { i = xml.indexOf('-->', i) + 3; continue; }
        if (xml[i + 1] === '/') {
          var c = xml.indexOf('>', i);
          i = c + 1;
          var node = makeNode(tag, children.length === 0 ? textBuf.trim() : textBuf.trim(), children);
          return node;
        }
        var child = parseTag();
        if (child && !child.close) children.push(child);
      } else {
        if (xml.substr(i, 5) === '&amp;') { textBuf += '&'; i += 5; continue; }
        if (xml.substr(i, 4) === '&lt;') { textBuf += '<'; i += 4; continue; }
        if (xml.substr(i, 4) === '&gt;') { textBuf += '>'; i += 4; continue; }
        if (xml.substr(i, 6) === '&quot;') { textBuf += '"'; i += 6; continue; }
        if (xml.substr(i, 6) === '&apos;') { textBuf += "'"; i += 6; continue; }
        if (xml.substr(i, 3) === '&#x') {
          var end = xml.indexOf(';', i);
          textBuf += String.fromCharCode(parseInt(xml.substring(i + 3, end), 16));
          i = end + 1;
          continue;
        }
        textBuf += xml[i];
        i++;
      }
    }
    return makeNode(tag, textBuf.trim(), children);
  }
  var root = parseTag();
  return root;
}

global.DOMParser = function () {};
global.DOMParser.prototype.parseFromString = function (xml) {
  var root = parseXmlToTree(xml);
  var doc = {
    _root: root,
    getElementsByTagName: function (tag) {
      var out = [];
      if (root.tagName === tag) out.push(root);
      out = out.concat(root.getElementsByTagName(tag));
      return out;
    }
  };
  return doc;
};
global.window.DOMParser = global.DOMParser;

// Assicura moduli caricati (idempotente: fatture-import-xml.js è IIFE che setta window.FattureImportXml)
require('../fatture-import-xml.js');
require('../fatture-import-nuove.js');

var win = global.window;

function buildSample(numero, piva) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<p:FatturaElettronica versione="FPR12" xmlns:p="http://foo">',
    '  <FatturaElettronicaHeader>',
    '    <CessionarioCommittente>',
    '      <DatiAnagrafici>',
    '        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>' + piva + '</IdCodice></IdFiscaleIVA>',
    '        <Anagrafica><Denominazione>ACME S.R.L.</Denominazione></Anagrafica>',
    '      </DatiAnagrafici>',
    '      <Sede><Indirizzo>VIA ROMA 1</Indirizzo><CAP>20100</CAP><Comune>Milano</Comune><Provincia>MI</Provincia><Nazione>IT</Nazione></Sede>',
    '    </CessionarioCommittente>',
    '  </FatturaElettronicaHeader>',
    '  <FatturaElettronicaBody>',
    '    <DatiGenerali>',
    '      <DatiGeneraliDocumento>',
    '        <TipoDocumento>TD01</TipoDocumento>',
    '        <Data>2026-03-24</Data>',
    '        <Numero>' + numero + '</Numero>',
    '        <ImportoTotaleDocumento>1000.00</ImportoTotaleDocumento>',
    '      </DatiGeneraliDocumento>',
    '    </DatiGenerali>',
    '    <DatiBeniServizi>',
    '      <DettaglioLinee>',
    '        <NumeroLinea>1</NumeroLinea>',
    '        <Descrizione>Consulenza</Descrizione>',
    '        <Quantita>1.00</Quantita>',
    '        <PrezzoUnitario>1000.00</PrezzoUnitario>',
    '        <AliquotaIVA>0.00</AliquotaIVA>',
    '      </DettaglioLinee>',
    '    </DatiBeniServizi>',
    '  </FatturaElettronicaBody>',
    '</p:FatturaElettronica>'
  ].join('\n');
}

var SAMPLE = buildSample('10/2026', '12437760965');
var SAMPLE_B = buildSample('11/2026', '12437760965'); // stesso cliente

describe('FattureImportNuove', function () {
  test('module esposto con API attesa', function () {
    expect(typeof win.FattureImportNuove).toBe('object');
    expect(typeof win.FattureImportNuove.importNuoveFromStrings).toBe('function');
    expect(typeof win.FattureImportNuove.handleFileInput).toBe('function');
  });

  test('crea fattura stato=inviata, origine=xml-import, pagMese/pagAnno null', function () {
    var saved = null, clientiSaved = null;
    win.FattureStorico = { load: function () { return []; }, save: function (p, f) { saved = f; } };
    win.getClienti = function () { return []; };
    win.saveClienti = function (list) { clientiSaved = list; };

    var res = win.FattureImportNuove.importNuoveFromStrings([{ name: 'x.xml', xml: SAMPLE }]);
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(0);
    expect(res.errors.length).toBe(0);
    expect(res.clientiCreati).toBe(1);
    expect(saved.length).toBe(1);
    expect(saved[0].stato).toBe('inviata');
    expect(saved[0].origine).toBe('xml-import');
    expect(saved[0].pagMese).toBe(null);
    expect(saved[0].pagAnno).toBe(null);
    expect(saved[0].dataPagamento).toBe('');
    expect(!!saved[0].dataInvioSdi).toBeTruthy();
    expect(!!saved[0].clienteId).toBeTruthy();
    expect(clientiSaved && clientiSaved.length).toBe(1);
  });

  test('silent skip duplicati (seen dedupKey)', function () {
    // Fattura esistente con stesso dedupKey del SAMPLE (TD01|2026|10|10/2026)
    var existing = [{
      id: 'existing1',
      tipoDocumento: 'TD01',
      annoProgressivo: 2026,
      progressivo: 10,
      numero: '10/2026'
    }];
    var saved = null;
    win.FattureStorico = { load: function () { return existing.slice(); }, save: function (p, f) { saved = f; } };
    win.getClienti = function () { return []; };
    win.saveClienti = function () {};

    var res = win.FattureImportNuove.importNuoveFromStrings([{ name: 'dup.xml', xml: SAMPLE }]);
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(1);
    expect(saved).toBe(null); // save non chiamato se imported=0
  });

  test('dedup intra-batch clienti: 2 fatture stesso cliente → UN cliente creato', function () {
    var saved = null, clientiSaved = null;
    win.FattureStorico = { load: function () { return []; }, save: function (p, f) { saved = f; } };
    win.getClienti = function () { return []; };
    win.saveClienti = function (list) { clientiSaved = list; };

    var res = win.FattureImportNuove.importNuoveFromStrings([
      { name: 'a.xml', xml: SAMPLE },
      { name: 'b.xml', xml: SAMPLE_B }
    ]);
    expect(res.imported).toBe(2);
    expect(res.clientiCreati).toBe(1);
    expect(saved.length).toBe(2);
    expect(saved[0].clienteId).toBe(saved[1].clienteId);
    expect(clientiSaved.length).toBe(1);
  });
});
