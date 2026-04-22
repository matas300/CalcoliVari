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
      if (root && root.tagName === tag) out.push(root);
      if (root) out = out.concat(root.getElementsByTagName(tag));
      return out;
    }
  };
  return doc;
};
global.window.DOMParser = global.DOMParser;

require('../fatture-import-xml.js');
require('../fatture-import-legacy.js');

var win = global.window;

function buildSample(numero, piva, opts) {
  opts = opts || {};
  var lines = [
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
    '    </DatiBeniServizi>'
  ];
  if (opts.scadenza) {
    lines.push('    <DatiPagamento>');
    lines.push('      <DettaglioPagamento>');
    lines.push('        <DataScadenzaPagamento>' + opts.scadenza + '</DataScadenzaPagamento>');
    lines.push('        <ImportoPagamento>1000.00</ImportoPagamento>');
    lines.push('      </DettaglioPagamento>');
    lines.push('    </DatiPagamento>');
  }
  lines.push('  </FatturaElettronicaBody>');
  lines.push('</p:FatturaElettronica>');
  return lines.join('\n');
}

var SAMPLE_WITH_SCAD = buildSample('20/2026', '12437760965', { scadenza: '2026-04-15' });
var SAMPLE_NO_SCAD = buildSample('21/2026', '12437760965');
var SAMPLE_B = buildSample('22/2026', '12437760965', { scadenza: '2026-04-20' });

describe('FattureImportLegacy', function () {
  test('module esposto con API attesa', function () {
    expect(typeof win.FattureImportLegacy).toBe('object');
    expect(typeof win.FattureImportLegacy.parseToRows).toBe('function');
    expect(typeof win.FattureImportLegacy.importConfirmed).toBe('function');
  });

  test('parseToRows: XML valido con scadenza → status=ok, pagamento prefilled', function () {
    win.FattureStorico = { load: function () { return []; }, save: function () {} };
    win.getClienti = function () { return []; };
    var rows = win.FattureImportLegacy.parseToRows([{ name: 'a.xml', xml: SAMPLE_WITH_SCAD }]);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('ok');
    expect(rows[0].selected).toBe(true);
    expect(rows[0].pagamento).toBe('2026-04-15');
    expect(!!rows[0].draft).toBeTruthy();
    expect(!!rows[0].match).toBeTruthy();
  });

  test('parseToRows: XML senza DataScadenzaPagamento → default = data+1m, pagamentoAuto=true', function () {
    win.FattureStorico = { load: function () { return []; }, save: function () {} };
    win.getClienti = function () { return []; };
    var rows = win.FattureImportLegacy.parseToRows([{ name: 'b.xml', xml: SAMPLE_NO_SCAD }]);
    expect(rows[0].status).toBe('ok');
    expect(rows[0].pagamento).toBe('2026-04-24');
    expect(rows[0].pagamentoAuto).toBe(true);
    expect(rows[0].selected).toBe(true);
  });

  test('parseToRows: XML duplicato (dedupKey esistente) → status=duplicate, selected=false', function () {
    var existing = [{
      id: 'existing1',
      tipoDocumento: 'TD01',
      annoProgressivo: 2026,
      progressivo: 20,
      numero: '20/2026'
    }];
    win.FattureStorico = { load: function () { return existing.slice(); }, save: function () {} };
    win.getClienti = function () { return []; };
    var rows = win.FattureImportLegacy.parseToRows([{ name: 'dup.xml', xml: SAMPLE_WITH_SCAD }]);
    expect(rows[0].status).toBe('duplicate');
    expect(rows[0].selected).toBe(false);
    expect(!!rows[0].existing).toBeTruthy();
    expect(rows[0].existing.id).toBe('existing1');
  });

  test('parseToRows: XML rotto → status=parse_error, selected=false, error popolato', function () {
    win.FattureStorico = { load: function () { return []; }, save: function () {} };
    win.getClienti = function () { return []; };
    var rows = win.FattureImportLegacy.parseToRows([{ name: 'bad.xml', xml: '' }]);
    expect(rows[0].status).toBe('parse_error');
    expect(rows[0].selected).toBe(false);
    expect(typeof rows[0].error).toBe('string');
  });

  test('importConfirmed: row ok → stato=pagata, pagMese/pagAnno corretti, origine xml-import-legacy', function () {
    var saved = null, clientiSaved = null;
    win.FattureStorico = { load: function () { return []; }, save: function (p, f) { saved = f; } };
    win.getClienti = function () { return []; };
    win.saveClienti = function (list) { clientiSaved = list; };

    var rows = win.FattureImportLegacy.parseToRows([{ name: 'a.xml', xml: SAMPLE_WITH_SCAD }]);
    var res = win.FattureImportLegacy.importConfirmed(rows);
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(0);
    expect(res.errors.length).toBe(0);
    expect(res.clientiCreati).toBe(1);
    expect(saved.length).toBe(1);
    expect(saved[0].stato).toBe('pagata');
    expect(saved[0].origine).toBe('xml-import-legacy');
    expect(saved[0].dataPagamento).toBe('2026-04-15');
    expect(saved[0].pagMese).toBe(4);
    expect(saved[0].pagAnno).toBe(2026);
    expect(!!saved[0].dataInvioSdi).toBeTruthy();
    expect(!!saved[0].clienteId).toBeTruthy();
    expect(clientiSaved && clientiSaved.length).toBe(1);
  });

  test('importConfirmed: row con pagamento vuoto manualmente → skipped + errore', function () {
    win.FattureStorico = { load: function () { return []; }, save: function () {} };
    win.getClienti = function () { return []; };
    win.saveClienti = function () {};

    var rows = win.FattureImportLegacy.parseToRows([{ name: 'b.xml', xml: SAMPLE_NO_SCAD }]);
    rows[0].pagamento = ''; // simula utente che cancella il default
    var res = win.FattureImportLegacy.importConfirmed(rows);
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(1);
    expect(res.errors.length).toBe(1);
    expect(/data pagamento mancante/.test(res.errors[0].message)).toBe(true);
  });

  test('importConfirmed: dedup esistente NON xml-import-legacy → skipped + errore "non sovrascrivibile"', function () {
    var existing = [{
      id: 'manuale1',
      tipoDocumento: 'TD01',
      annoProgressivo: 2026,
      progressivo: 20,
      numero: '20/2026',
      origine: 'manuale'
    }];
    win.FattureStorico = { load: function () { return existing.slice(); }, save: function () {} };
    win.getClienti = function () { return []; };
    win.saveClienti = function () {};

    // parseToRows la marca come duplicate/selected=false; per testare path di importConfirmed forziamo selected=true
    var rows = win.FattureImportLegacy.parseToRows([{ name: 'x.xml', xml: SAMPLE_WITH_SCAD }]);
    rows[0].selected = true;
    var res = win.FattureImportLegacy.importConfirmed(rows);
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(1);
    expect(res.errors.length).toBe(1);
    expect(/non sovrascrivibile/.test(res.errors[0].message)).toBe(true);
  });

  test('importConfirmed: dedup esistente origine=xml-import-legacy → sovrascrive, toSave invariato', function () {
    var existing = [{
      id: 'legacy1',
      tipoDocumento: 'TD01',
      annoProgressivo: 2026,
      progressivo: 20,
      numero: '20/2026',
      origine: 'xml-import-legacy',
      stato: 'pagata'
    }];
    var saved = null;
    win.FattureStorico = { load: function () { return existing.slice(); }, save: function (p, f) { saved = f; } };
    win.getClienti = function () { return []; };
    win.saveClienti = function () {};

    var rows = win.FattureImportLegacy.parseToRows([{ name: 'x.xml', xml: SAMPLE_WITH_SCAD }]);
    rows[0].selected = true;
    var res = win.FattureImportLegacy.importConfirmed(rows);
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(0);
    expect(saved.length).toBe(1); // invariato: sovrascritto, non aggiunto
    expect(saved[0].origine).toBe('xml-import-legacy');
  });

  test('importConfirmed: dedup intra-batch clienti → un solo cliente creato', function () {
    var saved = null, clientiSaved = null;
    win.FattureStorico = { load: function () { return []; }, save: function (p, f) { saved = f; } };
    win.getClienti = function () { return []; };
    win.saveClienti = function (list) { clientiSaved = list; };

    var rows = win.FattureImportLegacy.parseToRows([
      { name: 'a.xml', xml: SAMPLE_WITH_SCAD },
      { name: 'b.xml', xml: SAMPLE_B }
    ]);
    var res = win.FattureImportLegacy.importConfirmed(rows);
    expect(res.imported).toBe(2);
    expect(res.clientiCreati).toBe(1);
    expect(saved.length).toBe(2);
    expect(saved[0].clienteId).toBe(saved[1].clienteId);
    expect(clientiSaved.length).toBe(1);
  });
});
