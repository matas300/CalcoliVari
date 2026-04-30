'use strict';
var H = require('../fatture-xml-helpers.js');

describe('fatture-xml-helpers — sanitizeProgressivoInvio', function () {
  test('strip non-alfanumerici e tronca a 10', function () {
    expect(H.sanitizeProgressivoInvio('2026/123-A')).toBe('2026123A');
  });
  test('tronca oltre 10 char', function () {
    expect(H.sanitizeProgressivoInvio('ABCDEFGHIJKL')).toBe('ABCDEFGHIJ');
  });
  test('fallback 00001 su input vuoto', function () {
    expect(H.sanitizeProgressivoInvio('')).toBe('00001');
    expect(H.sanitizeProgressivoInvio(null)).toBe('00001');
    expect(H.sanitizeProgressivoInvio('---')).toBe('00001');
  });
});

describe('fatture-xml-helpers — isValidPartitaIvaIT', function () {
  test('11 cifre valide', function () {
    expect(H.isValidPartitaIvaIT('12345678901')).toBe(true);
  });
  test('strip whitespace', function () {
    expect(H.isValidPartitaIvaIT(' 123 4567 8901 ')).toBe(true);
  });
  test('reject lunghezza errata o caratteri', function () {
    expect(H.isValidPartitaIvaIT('1234567890')).toBe(false);
    expect(H.isValidPartitaIvaIT('1234567890A')).toBe(false);
    expect(H.isValidPartitaIvaIT('')).toBe(false);
    expect(H.isValidPartitaIvaIT(null)).toBe(false);
  });
});

describe('fatture-xml-helpers — isValidCodiceFiscale', function () {
  test('16 char alfanumerici accettati (regex syntactic)', function () {
    expect(H.isValidCodiceFiscale('RSSMRA80A01H501Z')).toBe(true);
  });
  test('case-insensitive', function () {
    expect(H.isValidCodiceFiscale('rssmra80a01h501z')).toBe(true);
  });
  test('reject lunghezza errata', function () {
    expect(H.isValidCodiceFiscale('RSSMRA80A01H501')).toBe(false);
    expect(H.isValidCodiceFiscale('')).toBe(false);
  });
});

describe('fatture-xml-helpers — modalitaToCodiceMP', function () {
  test('match esatto', function () {
    expect(H.modalitaToCodiceMP('bonifico')).toBe('MP05');
    expect(H.modalitaToCodiceMP('contanti')).toBe('MP10');
  });
  test('match parziale (substring)', function () {
    expect(H.modalitaToCodiceMP('bonifico SEPA urgente')).toBe('MP05');
  });
  test('default MP05 su input ignoto', function () {
    expect(H.modalitaToCodiceMP('xyz123')).toBe('MP05');
    expect(H.modalitaToCodiceMP('')).toBe('MP05');
    expect(H.modalitaToCodiceMP(null)).toBe('MP05');
  });
});

describe('fatture-xml-helpers — parseMaybeNumber', function () {
  test('virgola decimale → punto', function () {
    expect(H.parseMaybeNumber('12,50')).toBe(12.5);
  });
  test('numero nativo', function () {
    expect(H.parseMaybeNumber(7)).toBe(7);
  });
  test('fallback 0 su NaN/null', function () {
    expect(H.parseMaybeNumber('abc')).toBe(0);
    expect(H.parseMaybeNumber(null)).toBe(0);
    expect(H.parseMaybeNumber(undefined)).toBe(0);
  });
});

describe('fatture-xml-helpers — fmtXmlNum', function () {
  test('2 decimali fissi', function () {
    expect(H.fmtXmlNum(7)).toBe('7.00');
    expect(H.fmtXmlNum(7.5)).toBe('7.50');
  });
  test('arrotondamento bancario MathUtils.round2', function () {
    expect(H.fmtXmlNum(1.005)).toBe('1.01');
    expect(H.fmtXmlNum(1.234)).toBe('1.23');
  });
  test('NaN/non-numerico → 0.00', function () {
    expect(H.fmtXmlNum('abc')).toBe('0.00');
  });
});

describe('fatture-xml-helpers — buildAnagraficaXml', function () {
  test('PG con denominazione', function () {
    var xml = H.buildAnagraficaXml({ denominazione: 'ACME S.r.l.' });
    expect(xml).toBe('<Denominazione>ACME S.r.l.</Denominazione>');
  });
  test('ragioneSociale come fallback denominazione', function () {
    var xml = H.buildAnagraficaXml({ ragioneSociale: 'Beta SpA' });
    expect(xml).toBe('<Denominazione>Beta SpA</Denominazione>');
  });
  test('PG con P.IVA ma senza denominazione → usa nome o piva', function () {
    var xml = H.buildAnagraficaXml({ partitaIva: '12345678901', nome: 'Mario' });
    expect(xml).toBe('<Denominazione>Mario</Denominazione>');
  });
  test('PF senza P.IVA → Nome + Cognome', function () {
    var xml = H.buildAnagraficaXml({ nome: 'Mario', cognome: 'Rossi' });
    expect(xml).toBe('<Nome>Mario</Nome><Cognome>Rossi</Cognome>');
  });
  test('escape XML su denominazione con caratteri speciali', function () {
    var xml = H.buildAnagraficaXml({ denominazione: 'A&B <Co>' });
    expect(xml).toMatch(/&amp;/);
    expect(xml).toMatch(/&lt;/);
  });
  test('tronca denominazione a 80 char', function () {
    var long = 'X'.repeat(120);
    var xml = H.buildAnagraficaXml({ denominazione: long });
    var inner = xml.replace(/^<Denominazione>|<\/Denominazione>$/g, '');
    expect(inner.length).toBe(80);
  });
});

describe('fatture-xml-helpers — costanti', function () {
  test('XML_NAMESPACE corretto', function () {
    expect(H.XML_NAMESPACE).toBe('http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2');
  });
  test('XML_FORFETTARIO_REGIME = RF19', function () {
    expect(H.XML_FORFETTARIO_REGIME).toBe('RF19');
  });
});

describe('fatture-xml-helpers — sanitizeXmlLatin1', function () {
  test('em-dash U+2014 → trattino ASCII', function () {
    expect(H.sanitizeXmlLatin1('a — b')).toBe('a - b');
  });
  test('en-dash U+2013 → trattino ASCII', function () {
    expect(H.sanitizeXmlLatin1('a – b')).toBe('a - b');
  });
  test('smart single quotes U+2018/U+2019 → ASCII apostrofo', function () {
    expect(H.sanitizeXmlLatin1('l’art.')).toBe("l'art.");
    expect(H.sanitizeXmlLatin1('‘test’')).toBe("'test'");
  });
  test('smart double quotes U+201C/U+201D → ASCII quote', function () {
    expect(H.sanitizeXmlLatin1('“ciao”')).toBe('"ciao"');
  });
  test('ellipsis U+2026 → tre punti ASCII', function () {
    expect(H.sanitizeXmlLatin1('eccetera…')).toBe('eccetera...');
  });
  test('€ U+20AC → EUR', function () {
    expect(H.sanitizeXmlLatin1('100€')).toBe('100EUR');
  });
  test('Latin-1 chars (à è ò ç ñ) preservati', function () {
    expect(H.sanitizeXmlLatin1('caffè à Bologna ñ')).toBe('caffè à Bologna ñ');
  });
  test('Caratteri completamente fuori range (CJK, emoji) stripati', function () {
    expect(H.sanitizeXmlLatin1('test 漢字 🚀 fine')).toBe('test   fine');
  });
  test('null/undefined/empty → stringa vuota', function () {
    expect(H.sanitizeXmlLatin1(null)).toBe('');
    expect(H.sanitizeXmlLatin1(undefined)).toBe('');
    expect(H.sanitizeXmlLatin1('')).toBe('');
  });
  test('Causale forfettario default (em-dash interno) sanificata', function () {
    var note = "Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, della L. 190/2014 — regime forfettario, operazione in franchigia IVA e senza ritenuta d'acconto.";
    var sanitized = H.sanitizeXmlLatin1(note);
    expect(sanitized.indexOf('—')).toBe(-1);
    expect(sanitized.indexOf(' - regime forfettario')).toBeGreaterThan(0);
  });
  test('NFC normalize: "café" decomposto (e + combining acute) preservato come precomposto', function () {
    var decomposed = 'café';  // e + combining U+0301
    var sanitized = H.sanitizeXmlLatin1(decomposed);
    expect(sanitized).toBe('café');  // U+00E9 (Latin-1)
  });
  test('Control chars (eccetto \\t \\n \\r) strippati', function () {
    var dirty = 'prepost';
    expect(H.sanitizeXmlLatin1(dirty)).toBe('prepost');
  });
  test('Tab, newline, carriage return preservati', function () {
    expect(H.sanitizeXmlLatin1('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });
});

describe('fatture-xml-helpers — buildAnagraficaXml sanifica input', function () {
  test('Denominazione con em-dash → output con trattino', function () {
    var xml = H.buildAnagraficaXml({ denominazione: 'AT&T—Cox Inc.' });
    expect(xml.indexOf('—')).toBe(-1);
    expect(xml.indexOf('AT&amp;T-Cox Inc.')).toBeGreaterThan(-1);
  });
  test('Nome con smart quote → ASCII apostrofo (escape XML lo rende &apos;)', function () {
    var xml = H.buildAnagraficaXml({ nome: "L’Oréal", cognome: 'Italia' });
    // sanitize: ’ → ', poi xmlEscape: ' → &apos;
    expect(xml.indexOf('L&apos;Oréal')).toBeGreaterThan(-1);
    expect(xml.indexOf('’')).toBe(-1);
  });
});
