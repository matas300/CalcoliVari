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

// Parser XML minimale: niente CDATA, niente namespace prefix handling, niente attributi
// Sufficiente per i sample FatturaPA del test (tag annidati, testo, self-closed NO)
function parseXmlToTree(xml) {
  var i = 0;
  // Skip prolog
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
    var tag = raw.split(/\s+/)[0].replace(/^[a-zA-Z]+:/, ''); // strip namespace
    if (selfClosed) return makeNode(tag, '', []);
    var children = [];
    var textBuf = '';
    while (i < xml.length) {
      if (xml[i] === '<') {
        if (xml.substr(i, 4) === '<!--') { i = xml.indexOf('-->', i) + 3; continue; }
        if (xml[i + 1] === '/') {
          // closing
          var c = xml.indexOf('>', i);
          i = c + 1;
          var node = makeNode(tag, children.length === 0 ? textBuf.trim() : textBuf.trim(), children);
          return node;
        }
        var child = parseTag();
        if (child && !child.close) children.push(child);
      } else {
        // entity decode
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

// Stub FattureStorico + localStorage
var _store = [];
global.window.FattureStorico = {
  load: function () { return _store.slice(); },
  save: function (profile, list) { _store = list.slice(); }
};
global.window.getProfile = function () { return 'TestProfile'; };

require('../fatture-import-xml.js');

var FI = global.window.FattureImportXml;

var SAMPLE_TD01 = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<p:FatturaElettronica versione="FPR12" xmlns:p="http://foo">',
  '  <FatturaElettronicaHeader>',
  '    <CessionarioCommittente>',
  '      <DatiAnagrafici>',
  '        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>12437760965</IdCodice></IdFiscaleIVA>',
  '        <Anagrafica><Denominazione>TXT E-TECH S.R.L.</Denominazione></Anagrafica>',
  '      </DatiAnagrafici>',
  '      <Sede><Indirizzo>VIA MILANO 150</Indirizzo><CAP>20093</CAP><Comune>Cologno Monzese</Comune><Provincia>MI</Provincia><Nazione>IT</Nazione></Sede>',
  '    </CessionarioCommittente>',
  '  </FatturaElettronicaHeader>',
  '  <FatturaElettronicaBody>',
  '    <DatiGenerali>',
  '      <DatiGeneraliDocumento>',
  '        <TipoDocumento>TD01</TipoDocumento>',
  '        <Data>2026-03-24</Data>',
  '        <Numero>3/2026</Numero>',
  '        <DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo>',
  '        <ImportoTotaleDocumento>6930.00</ImportoTotaleDocumento>',
  '      </DatiGeneraliDocumento>',
  '    </DatiGenerali>',
  '    <DatiBeniServizi>',
  '      <DettaglioLinee>',
  '        <NumeroLinea>1</NumeroLinea>',
  '        <Descrizione>PLM Consultant</Descrizione>',
  '        <Quantita>22.00</Quantita>',
  '        <PrezzoUnitario>315.00</PrezzoUnitario>',
  '        <AliquotaIVA>0.00</AliquotaIVA>',
  '      </DettaglioLinee>',
  '    </DatiBeniServizi>',
  '    <DatiPagamento>',
  '      <DettaglioPagamento>',
  '        <ModalitaPagamento>MP05</ModalitaPagamento>',
  '        <DataScadenzaPagamento>2026-04-24</DataScadenzaPagamento>',
  '        <IBAN>LT773250072687231050</IBAN>',
  '      </DettaglioPagamento>',
  '    </DatiPagamento>',
  '  </FatturaElettronicaBody>',
  '</p:FatturaElettronica>'
].join('\n');

var SAMPLE_TD04 = SAMPLE_TD01
  .replace('<TipoDocumento>TD01</TipoDocumento>', '<TipoDocumento>TD04</TipoDocumento>')
  .replace('<Numero>3/2026</Numero>', '<Numero>NC/3/2025</Numero>')
  .replace('<Data>2026-03-24</Data>', '<Data>2025-05-30</Data>');

describe('FattureImportXml', function () {
  test('module esposto con API attesa', function () {
    expect(typeof FI).toBe('object');
    expect(typeof FI.parseXml).toBe('function');
    expect(typeof FI.importXmlStrings).toBe('function');
    expect(typeof FI.handleFileInput).toBe('function');
  });

  test('parseXml throw su input vuoto', function () {
    var threw = false;
    try { FI.parseXml(''); } catch (e) { threw = true; expect(/vuoto/i.test(e.message)).toBeTruthy(); }
    expect(threw).toBeTruthy();
  });

  test('parseXml TD01 — mappa numero/data/tipoDocumento', function () {
    var draft = FI.parseXml(SAMPLE_TD01);
    expect(draft.numero).toBe('3/2026');
    expect(draft.annoProgressivo).toBe(2026);
    expect(draft.progressivo).toBe(3);
    expect(draft.tipoDocumento).toBe('TD01');
    expect(draft.stato).toBe('inviata');
    expect(draft.origine).toBe('xml-import');
    expect(draft.data).toBe('2026-03-24');
  });

  test('parseXml TD01 — mappa cliente e bollo', function () {
    var draft = FI.parseXml(SAMPLE_TD01);
    expect(draft.clienteSnapshot.denominazione).toBe('TXT E-TECH S.R.L.');
    expect(draft.clienteSnapshot.partitaIva).toBe('12437760965');
    expect(draft.clienteSnapshot.nazione).toBe('IT');
    expect(draft.marcaDaBollo).toBe(true);
  });

  test('parseXml TD01 — mappa righe con quantita e prezzo positivi', function () {
    var draft = FI.parseXml(SAMPLE_TD01);
    expect(draft.righe.length).toBe(1);
    expect(draft.righe[0].descrizione).toBe('PLM Consultant');
    expect(draft.righe[0].quantita).toBe(22);
    expect(draft.righe[0].prezzoUnitario).toBe(315);
  });

  test('parseXml TD01 — mappa pagamento (IBAN, scadenza, modalita)', function () {
    var draft = FI.parseXml(SAMPLE_TD01);
    expect(draft.modalitaPagamento).toBe('MP05');
    expect(draft.iban).toBe('LT773250072687231050');
    expect(draft.scadenzaPagamento).toBe('2026-04-24');
  });

  test('parseXml TD04 — tipoDocumento e progressivo da "NC/3/2025"', function () {
    var draft = FI.parseXml(SAMPLE_TD04);
    expect(draft.tipoDocumento).toBe('TD04');
    expect(draft.annoProgressivo).toBe(2025);
    expect(draft.progressivo).toBe(3);
  });

  test('importXmlStrings dedupe per (anno,progressivo,tipoDoc,numero)', function () {
    _store = [];
    var res = FI.importXmlStrings([SAMPLE_TD01, SAMPLE_TD01]);
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.errors.length).toBe(0);
  });

  test('importXmlStrings su XML invalido → errore nel risultato', function () {
    _store = [];
    var res = FI.importXmlStrings(['<not-an-invoice/>', SAMPLE_TD01]);
    expect(res.imported).toBe(1);
    expect(res.errors.length).toBe(1);
  });
});
