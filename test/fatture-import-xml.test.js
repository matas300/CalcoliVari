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
    expect(typeof FI.matchCliente).toBe('function');
    expect(typeof FI.dedupKey).toBe('function');
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
});

describe('FattureImportXml.matchCliente', function () {
  var match = require('../fatture-import-xml').matchCliente || window.FattureImportXml.matchCliente;

  test('match by P.IVA normalizzata', function () {
    var existing = [{ id: 'c1', partitaIva: '12345678901', nome: 'ACME' }];
    var r = match({ partitaIva: ' 12345678901 ' }, existing);
    expect(r.mode).toBe('existing');
    expect(r.cliente.id).toBe('c1');
  });

  test('match by CF se P.IVA vuota', function () {
    var existing = [{ id: 'c2', codiceFiscale: 'RSSMRA80A01H501U' }];
    var r = match({ codiceFiscale: 'rssmra80a01h501u' }, existing);
    expect(r.mode).toBe('existing');
    expect(r.cliente.id).toBe('c2');
  });

  test('match by idPaese+idCodice per esteri', function () {
    var existing = [{ id: 'c3', idPaese: 'DE', idCodice: 'DE123' }];
    var r = match({ idPaese: 'DE', idCodice: 'DE123' }, existing);
    expect(r.mode).toBe('existing');
    expect(r.cliente.id).toBe('c3');
  });

  test('miss → draft con dati snapshot', function () {
    var r = match({ partitaIva: '99999999999', denominazione: 'Nuovo Srl', nazione: 'IT' }, []);
    expect(r.mode).toBe('new');
    expect(r.draft.partitaIva).toBe('99999999999');
    expect(r.draft.nome).toBe('Nuovo Srl');
  });

  test('P.IVA vince anche se denominazione diverge', function () {
    var existing = [{ id: 'c1', partitaIva: '12345678901', nome: 'ACME' }];
    var r = match({ partitaIva: '12345678901', denominazione: 'Nome Diverso' }, existing);
    expect(r.mode).toBe('existing');
    expect(r.cliente.id).toBe('c1');
  });
});

describe('FattureImportXml.dedupKey', function () {
  var dk = require('../fatture-import-xml').dedupKey || window.FattureImportXml.dedupKey;

  test('chiave include tipoDoc, anno, progressivo, numero', function () {
    expect(dk({ tipoDocumento: 'TD01', annoProgressivo: 2025, progressivo: 3, numero: '3/2025' }))
      .toBe('TD01|2025|3|3/2025');
  });

  test('TD04 distinto da TD01 con stesso progressivo', function () {
    var a = dk({ tipoDocumento: 'TD01', annoProgressivo: 2025, progressivo: 1, numero: '1/2025' });
    var b = dk({ tipoDocumento: 'TD04', annoProgressivo: 2025, progressivo: 1, numero: 'NC1/2025' });
    expect(a === b).toBe(false);
  });
});
