'use strict';
const { describe, test, expect } = global;
const path = require('path');

function loadParser() {
  global.window = global.window || {};
  global.window.DOMParser = global.window.DOMParser || require('jsdom').JSDOM.fragment;
  // Use jsdom's DOMParser
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM();
  global.DOMParser = dom.window.DOMParser;
  delete require.cache[require.resolve(path.join(process.cwd(), 'fatture-import-xml.js'))];
  require(path.join(process.cwd(), 'fatture-import-xml.js'));
  return global.window.FattureImportXml;
}

function buildXml(numero, data) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" versione="FPR12">' +
    '<FatturaElettronicaHeader>' +
    '<DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>01654920089</IdCodice></IdTrasmittente><ProgressivoInvio>00001</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>0000000</CodiceDestinatario></DatiTrasmissione>' +
    '<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01654920089</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Test</Denominazione></Anagrafica><RegimeFiscale>RF19</RegimeFiscale></DatiAnagrafici><Sede><Indirizzo>Via</Indirizzo><CAP>00100</CAP><Comune>Roma</Comune><Provincia>RM</Provincia><Nazione>IT</Nazione></Sede></CedentePrestatore>' +
    '<CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>12345678901</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici><Sede><Indirizzo>Via</Indirizzo><CAP>00100</CAP><Comune>Roma</Comune><Provincia>RM</Provincia><Nazione>IT</Nazione></Sede></CessionarioCommittente>' +
    '</FatturaElettronicaHeader>' +
    '<FatturaElettronicaBody>' +
    '<DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>' + data + '</Data><Numero>' + numero + '</Numero><ImportoTotaleDocumento>1000.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>' +
    '<DatiBeniServizi><DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Test</Descrizione><Quantita>1.00</Quantita><PrezzoUnitario>1000.00</PrezzoUnitario><PrezzoTotale>1000.00</PrezzoTotale><AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura></DettaglioLinee><DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura><ImponibileImporto>1000.00</ImponibileImporto><Imposta>0.00</Imposta></DatiRiepilogo></DatiBeniServizi>' +
    '</FatturaElettronicaBody>' +
    '</p:FatturaElettronica>';
}

describe('parseXml — numero senza anno (intero puro)', () => {
  test('Numero "1" con data 2026 → progressivo=1, anno=2026', () => {
    const FI = loadParser();
    const xml = buildXml('1', '2026-01-28');
    const draft = FI.parseXml(xml);
    expect(draft.numero).toBe('1');
    expect(draft.progressivo).toBe(1);
    expect(draft.annoProgressivo).toBe(2026);
  });

  test('Numero "42" con data 2025 → progressivo=42, anno=2025', () => {
    const FI = loadParser();
    const xml = buildXml('42', '2025-06-15');
    const draft = FI.parseXml(xml);
    expect(draft.progressivo).toBe(42);
    expect(draft.annoProgressivo).toBe(2025);
  });

  test('Numero con prefisso "FT-001" → progressivo=0 (formato non riconosciuto)', () => {
    const FI = loadParser();
    const xml = buildXml('FT-001', '2026-01-28');
    const draft = FI.parseXml(xml);
    expect(draft.numero).toBe('FT-001');
    expect(draft.progressivo).toBe(0);
  });

  test('Numero "1/2024" continua a funzionare → progressivo=1, anno=2024', () => {
    const FI = loadParser();
    const xml = buildXml('1/2024', '2024-01-28');
    const draft = FI.parseXml(xml);
    expect(draft.progressivo).toBe(1);
    expect(draft.annoProgressivo).toBe(2024);
  });
});
