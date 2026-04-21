# Fatture Import XML Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separare l'import XML FatturaPA in due flussi distinti (legacy archivio → `pagata` con `pagMese`, nuove tab Fatture → `inviata`) con parser condiviso, auto-match/auto-create clienti e dedup.

**Architecture:** Un parser puro + match cliente + dedup (`fatture-import-xml.js`) consumato da due moduli UI separati: `fatture-import-legacy.js` (modale preview editabile, stato finale `pagata`) e `fatture-import-nuove.js` (import rapido senza preview, stato `inviata`). `fattureEmesse` resta single source of truth; `normalizeFatturaEmessa` già preserva i campi chiave — basta aggiungere `'xml-import-legacy'` alla whitelist `origine`.

**Tech Stack:** Vanilla ES5-ish in IIFE (no build), DOMParser nativo (con shim Node per test), localStorage + Firebase sync, test runner Node `test/run-tests.js`. App su `http://localhost:3333` per smoke test manuali.

**Branch:** `fatture-import-redesign` (già creato da commit `874dfdd`, spec committata in `5b22f43`).

**Spec:** `docs/superpowers/specs/2026-04-21-fatture-import-xml-redesign-design.md`.

---

## File Structure

**Create:**
- `fatture-import-legacy.js` — UI modale preview archivio + flusso conferma
- `fatture-import-nuove.js` — UI import rapido tab Fatture
- `test/fatture-import-legacy.test.js`
- `test/fatture-import-nuove.test.js`

**Modify:**
- `fatture-import-xml.js` — estrai parser puro, aggiungi `matchCliente` + `dedupKey`, rimuovi `importXmlStrings`/`handleFileInput` (spostati nei moduli nuove/legacy)
- `fatture-docs-feature.js` — whitelist `origine` estesa a `'xml-import-legacy'` (riga 283)
- `index.html` — nuovo bottone "Importa da XML" nel tab Fatture + wiring input legacy
- `app.js` — registrazione hook del nuovo bottone (se serve passaggio da `onclick` a listener)
- `test/run-tests.js` — require dei due nuovi test file
- `test/fatture-import-xml.test.js` — aggiungi casi `matchCliente`, `dedupKey`, `idPaese`/`idCodice`; rimuovi i test di `importXmlStrings` (spostati)
- `CLAUDE.md` — sezione "Fatture: single source of truth" + nuovi moduli

---

## Task 0: Baseline verde

**Files:**
- Read: `test/run-tests.js`

- [ ] **Step 1: Eseguire suite test esistente**

Run:
```bash
node test/run-tests.js
```
Expected: tutti i test passano (baseline). Se fallisce qualcosa di non correlato, stop e segnala.

- [ ] **Step 2: Avviare il server locale in background**

Run:
```bash
npx http-server -p 3333 -c-1 .
```
Expected: server up su http://localhost:3333. Tenere aperto per smoke test successivi.

---

## Task 1: Refactor `fatture-import-xml.js` → parser puro + matchCliente + dedupKey

**Files:**
- Modify: `fatture-import-xml.js`
- Modify: `test/fatture-import-xml.test.js`

- [ ] **Step 1: Scrivere test falliti per `matchCliente`**

Aggiungi a `test/fatture-import-xml.test.js`:

```javascript
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
```

- [ ] **Step 2: Run — verifica fallimento**

```bash
node test/run-tests.js
```
Expected: FAIL sui nuovi test (funzioni non esposte).

- [ ] **Step 3: Refactor `fatture-import-xml.js`**

Riscrivi il file così:

```javascript
/* Fatture Import XML — parser puro FatturaPA + match cliente + dedup.
 *
 * API:
 *  - parseXml(xmlText) → draft fattura (throw su XML invalido)
 *  - matchCliente(snapshot, existingClienti) → { mode:'existing'|'new', cliente|draft }
 *  - dedupKey(draft) → string
 *
 * I flow UI (legacy/nuove) vivono in fatture-import-legacy.js / fatture-import-nuove.js.
 */
(function (root) {
  'use strict';

  var DOMParser = root.DOMParser;

  function text(node, tag) {
    if (!node) return '';
    var el = node.getElementsByTagName(tag)[0];
    return el ? String(el.textContent || '').trim() : '';
  }

  function firstChild(node, tag) {
    if (!node) return null;
    var el = node.getElementsByTagName(tag)[0];
    return el || null;
  }

  function num(v) {
    var n = parseFloat(String(v || '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function norm(v) {
    return String(v || '').trim().toUpperCase();
  }

  function parseNumero(numeroXml) {
    var s = String(numeroXml || '').trim();
    var m = s.match(/(\d+)\s*\/\s*(\d{4})$/);
    if (m) return { progressivo: parseInt(m[1], 10), anno: parseInt(m[2], 10) };
    m = s.match(/(\d{4})\s*\/\s*(\d+)$/);
    if (m) return { anno: parseInt(m[1], 10), progressivo: parseInt(m[2], 10) };
    return { progressivo: 0, anno: 0 };
  }

  function parseXml(xmlText) {
    if (typeof xmlText !== 'string' || !xmlText.trim()) throw new Error('XML vuoto');
    if (typeof DOMParser !== 'function') throw new Error('DOMParser non disponibile');
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    var err = doc.getElementsByTagName('parsererror')[0];
    if (err) throw new Error('XML non valido: ' + (err.textContent || '').slice(0, 200));

    var body = doc.getElementsByTagName('FatturaElettronicaBody')[0];
    var header = doc.getElementsByTagName('FatturaElettronicaHeader')[0];
    if (!body || !header) throw new Error('Struttura FatturaElettronica mancante');

    var datiGen = firstChild(body, 'DatiGeneraliDocumento');
    if (!datiGen) throw new Error('DatiGeneraliDocumento mancante');

    var tipoDoc = text(datiGen, 'TipoDocumento') || 'TD01';
    var dataIso = text(datiGen, 'Data');
    var numeroXml = text(datiGen, 'Numero');
    var totaleDoc = num(text(datiGen, 'ImportoTotaleDocumento'));
    var datiBollo = firstChild(datiGen, 'DatiBollo');
    var bolloImporto = datiBollo ? num(text(datiBollo, 'ImportoBollo')) : 0;

    var parsed = parseNumero(numeroXml);
    var annoProgressivo = parsed.anno || (dataIso ? parseInt(dataIso.slice(0, 4), 10) : new Date().getFullYear());
    var progressivo = parsed.progressivo || 0;

    var cess = firstChild(header, 'CessionarioCommittente');
    var cessDati = firstChild(cess, 'DatiAnagrafici');
    var cessAnag = firstChild(cessDati, 'Anagrafica');
    var cessIva = firstChild(cessDati, 'IdFiscaleIVA');
    var cessSede = firstChild(cess, 'Sede');
    var clienteSnapshot = {
      denominazione: text(cessAnag, 'Denominazione'),
      nome: text(cessAnag, 'Nome'),
      cognome: text(cessAnag, 'Cognome'),
      partitaIva: text(cessIva, 'IdCodice'),
      idPaese: text(cessIva, 'IdPaese'),
      idCodice: text(cessIva, 'IdCodice'),
      codiceFiscale: text(cessDati, 'CodiceFiscale'),
      indirizzo: text(cessSede, 'Indirizzo'),
      cap: text(cessSede, 'CAP'),
      citta: text(cessSede, 'Comune'),
      provincia: text(cessSede, 'Provincia'),
      nazione: text(cessSede, 'Nazione') || 'IT'
    };

    var lineNodes = body.getElementsByTagName('DettaglioLinee');
    var righe = [];
    for (var i = 0; i < lineNodes.length; i++) {
      var ln = lineNodes[i];
      righe.push({
        descrizione: text(ln, 'Descrizione'),
        quantita: Math.abs(num(text(ln, 'Quantita')) || 1),
        prezzoUnitario: Math.abs(num(text(ln, 'PrezzoUnitario'))),
        iva: num(text(ln, 'AliquotaIVA'))
      });
    }
    if (righe.length === 0) {
      righe.push({ descrizione: '(importata senza righe dettaglio)', quantita: 1, prezzoUnitario: Math.abs(totaleDoc), iva: 0 });
    }

    var datiPag = firstChild(body, 'DatiPagamento');
    var dettPag = firstChild(datiPag, 'DettaglioPagamento');
    var modalita = text(dettPag, 'ModalitaPagamento');
    var scadenza = text(dettPag, 'DataScadenzaPagamento');
    var iban = text(dettPag, 'IBAN');

    var id = 'xmlimp_' + annoProgressivo + '_' + progressivo + '_' + tipoDoc + '_' + Math.round(Math.abs(totaleDoc) * 100);

    return {
      id: id,
      numero: numeroXml,
      data: dataIso,
      anno: annoProgressivo,
      annoProgressivo: annoProgressivo,
      progressivo: progressivo,
      tipoDocumento: tipoDoc === 'TD04' ? 'TD04' : 'TD01',
      clienteId: '',
      clienteSnapshot: clienteSnapshot,
      righe: righe,
      contributoIntegrativo: 0,
      marcaDaBollo: bolloImporto > 0,
      bolloAddebitato: bolloImporto > 0,
      bolloAuto: false,
      modalitaPagamento: modalita || '',
      iban: iban || '',
      scadenzaPagamento: scadenza || '',
      totaleDocumento: Math.abs(totaleDoc)
    };
  }

  function matchCliente(snapshot, existing) {
    existing = existing || [];
    var p = norm(snapshot && snapshot.partitaIva);
    if (p) {
      for (var i = 0; i < existing.length; i++) {
        if (norm(existing[i].partitaIva) === p) return { mode: 'existing', cliente: existing[i] };
      }
    }
    var cf = norm(snapshot && snapshot.codiceFiscale);
    if (cf) {
      for (var j = 0; j < existing.length; j++) {
        if (norm(existing[j].codiceFiscale) === cf) return { mode: 'existing', cliente: existing[j] };
      }
    }
    var idP = norm(snapshot && snapshot.idPaese);
    var idC = norm(snapshot && snapshot.idCodice);
    if (idP && idC) {
      for (var k = 0; k < existing.length; k++) {
        if (norm(existing[k].idPaese) + norm(existing[k].idCodice) === idP + idC) {
          return { mode: 'existing', cliente: existing[k] };
        }
      }
    }

    var nome = (snapshot && snapshot.denominazione) ||
      (((snapshot && snapshot.nome) || '') + ' ' + ((snapshot && snapshot.cognome) || '')).trim() ||
      '(senza nome)';
    var rand = Math.random().toString(36).slice(2, 8);
    return {
      mode: 'new',
      draft: {
        id: 'cli_' + Date.now() + '_' + rand,
        nome: nome,
        partitaIva: (snapshot && snapshot.partitaIva) || '',
        codiceFiscale: (snapshot && snapshot.codiceFiscale) || '',
        idPaese: (snapshot && snapshot.idPaese) || '',
        idCodice: (snapshot && snapshot.idCodice) || '',
        indirizzo: (snapshot && snapshot.indirizzo) || '',
        cap: (snapshot && snapshot.cap) || '',
        citta: (snapshot && snapshot.citta) || '',
        provincia: (snapshot && snapshot.provincia) || '',
        nazione: (snapshot && snapshot.nazione) || 'IT',
        pec: '',
        codiceSDI: '',
        note: ''
      }
    };
  }

  function dedupKey(f) {
    return (f.tipoDocumento || 'TD01') + '|' + (f.annoProgressivo || 0) + '|' + (f.progressivo || 0) + '|' + (f.numero || '');
  }

  var api = { parseXml: parseXml, matchCliente: matchCliente, dedupKey: dedupKey };
  root.FattureImportXml = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test — verifica pass**

```bash
node test/run-tests.js
```
Expected: tutti i test di `FattureImportXml.matchCliente` e `FattureImportXml.dedupKey` passano. I vecchi test di `importXmlStrings` in `fatture-import-xml.test.js` potrebbero fallire — rimuoverli nello Step 5.

- [ ] **Step 5: Rimuovere i test di `importXmlStrings` e `handleFileInput`**

In `test/fatture-import-xml.test.js`, cancella i blocchi `describe('FattureImportXml.importXmlStrings'...` e `describe('FattureImportXml.handleFileInput'...` (saranno ricreati in `fatture-import-nuove.test.js`).

- [ ] **Step 6: Run test — verifica verde totale**

```bash
node test/run-tests.js
```
Expected: tutti verdi (no `importXmlStrings` riferimenti).

- [ ] **Step 7: Commit**

```bash
git add fatture-import-xml.js test/fatture-import-xml.test.js
git commit -m "refactor(fatture-import): estrae parser puro + matchCliente + dedupKey"
```

---

## Task 2: Whitelist `origine: 'xml-import-legacy'` in `normalizeFatturaEmessa`

**Files:**
- Modify: `fatture-docs-feature.js:283`
- Modify: `test/fatture-normalize.test.js` (se esistente, altrimenti aggiungi test inline)

- [ ] **Step 1: Test fallito — whitelist accetta xml-import-legacy**

Aggiungi in `test/fatture-normalize.test.js` (o crea un nuovo blocco in `fatture-import-xml.test.js`):

```javascript
test('normalizeFatturaEmessa preserva origine xml-import-legacy', function () {
  var n = window.normalizeFatturaEmessa({ id: 'x', origine: 'xml-import-legacy', righe: [] });
  expect(n.origine).toBe('xml-import-legacy');
});
```

- [ ] **Step 2: Run test — verifica fallimento**

```bash
node test/run-tests.js
```
Expected: FAIL — la whitelist attuale collassa a `'wizard'`.

- [ ] **Step 3: Modifica whitelist**

In `fatture-docs-feature.js`, localizza la riga con la whitelist `origine` (circa riga 283):

```javascript
origine: (['wizard','manuale','legacy-migrated','ocr-import','xml-import'].indexOf(raw.origine) >= 0) ? raw.origine : 'wizard',
```

Sostituisci con:

```javascript
origine: (['wizard','manuale','legacy-migrated','ocr-import','xml-import','xml-import-legacy'].indexOf(raw.origine) >= 0) ? raw.origine : 'wizard',
```

- [ ] **Step 4: Run test — verifica pass**

```bash
node test/run-tests.js
```
Expected: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add fatture-docs-feature.js test/fatture-normalize.test.js
git commit -m "feat(fatture): whitelist origine 'xml-import-legacy' per flusso archivio"
```

---

## Task 3: `fatture-import-nuove.js` — import rapido stato `inviata`

**Files:**
- Create: `fatture-import-nuove.js`
- Create: `test/fatture-import-nuove.test.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Test fallito**

Crea `test/fatture-import-nuove.test.js`:

```javascript
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function makeWindow() {
  var store = {};
  return {
    localStorage: {
      getItem: function (k) { return k in store ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    sessionStorage: { getItem: function () { return 'TestUser'; }, setItem: function () {} },
    console: console,
    DOMParser: require('@xmldom/xmldom').DOMParser
  };
}

describe('FattureImportNuove.importNuove', function () {
  test('crea fattura stato=inviata, origine=xml-import, pagMese null', function () {
    var win = makeWindow();
    win.FattureStorico = {
      load: function () { return []; },
      save: function (_, f) { win._saved = f; }
    };
    win.getClienti = function () { return []; };
    win.saveClienti = function (list) { win._clienti = list; };
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fatture-import-xml.js'), 'utf8'), win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fatture-import-nuove.js'), 'utf8'), win);

    var xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-td01.xml'), 'utf8');
    var res = win.FattureImportNuove.importNuoveFromStrings([{ name: 's.xml', xml: xml }]);
    expect(res.imported).toBe(1);
    expect(win._saved[0].stato).toBe('inviata');
    expect(win._saved[0].origine).toBe('xml-import');
    expect(win._saved[0].pagMese == null).toBeTruthy();
    expect(win._saved[0].pagAnno == null).toBeTruthy();
  });

  test('silent skip duplicati', function () {
    var win = makeWindow();
    var existing = [{ tipoDocumento: 'TD01', annoProgressivo: 2025, progressivo: 1, numero: '1/2025' }];
    win.FattureStorico = { load: function () { return existing.slice(); }, save: function (_, f) { win._saved = f; } };
    win.getClienti = function () { return []; };
    win.saveClienti = function () {};
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fatture-import-xml.js'), 'utf8'), win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fatture-import-nuove.js'), 'utf8'), win);

    var xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-td01.xml'), 'utf8');
    var res = win.FattureImportNuove.importNuoveFromStrings([{ name: 's.xml', xml: xml }]);
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(1);
  });
});
```

Aggiungi `require('./fatture-import-nuove.test.js');` in `test/run-tests.js`.

Crea fixture `test/fixtures/sample-td01.xml` se non esiste:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>12345678901</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>ACME Srl</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede><Indirizzo>Via Roma 1</Indirizzo><CAP>20100</CAP><Comune>Milano</Comune><Provincia>MI</Provincia><Nazione>IT</Nazione></Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento>
      <TipoDocumento>TD01</TipoDocumento>
      <Data>2025-06-15</Data>
      <Numero>1/2025</Numero>
      <ImportoTotaleDocumento>1000.00</ImportoTotaleDocumento>
    </DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi><DettaglioLinee>
      <Descrizione>Consulenza</Descrizione>
      <Quantita>1.00</Quantita>
      <PrezzoUnitario>1000.00</PrezzoUnitario>
      <AliquotaIVA>0.00</AliquotaIVA>
    </DettaglioLinee></DatiBeniServizi>
    <DatiPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>2025-07-15</DataScadenzaPagamento>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>
```

- [ ] **Step 2: Run — verifica fallimento**

```bash
node test/run-tests.js
```
Expected: FAIL (modulo non esiste).

- [ ] **Step 3: Implementa `fatture-import-nuove.js`**

```javascript
/* Fatture Import Nuove — import rapido XML FatturaPA, stato 'inviata'.
 * Nessuna preview: parse + match + save atomico.
 */
(function (root) {
  'use strict';

  function _getProfile() {
    if (typeof root.getProfile === 'function') return root.getProfile();
    return (root.sessionStorage && root.sessionStorage.getItem('calcoliPIVA_profile')) || 'Mattia';
  }

  function importNuoveFromStrings(entries) {
    var X = root.FattureImportXml;
    var profile = _getProfile();
    var store = root.FattureStorico;
    if (!X || !store) {
      return { imported: 0, skipped: 0, errors: [{ file: '(n/a)', message: 'moduli non disponibili' }], clientiCreati: 0 };
    }
    var existingFatture = store.load(profile);
    var existingClienti = (typeof root.getClienti === 'function') ? root.getClienti(profile) : [];
    var seen = Object.create(null);
    existingFatture.forEach(function (f) { seen[X.dedupKey(f)] = true; });
    var clientiByKey = Object.create(null);

    var imported = 0, skipped = 0, errors = [], clientiCreati = 0;
    var toSave = existingFatture.slice();
    var clientiNew = [];

    (entries || []).forEach(function (entry) {
      try {
        var xmlText = typeof entry === 'string' ? entry : entry.xml;
        var draft = X.parseXml(xmlText);
        var key = X.dedupKey(draft);
        if (seen[key]) { skipped++; return; }
        seen[key] = true;

        var matched = X.matchCliente(draft.clienteSnapshot, existingClienti.concat(clientiNew));
        var clienteId;
        if (matched.mode === 'existing') {
          clienteId = matched.cliente.id;
        } else {
          var ckey = (matched.draft.partitaIva || '') + '|' + (matched.draft.codiceFiscale || '') + '|' + (matched.draft.idPaese + matched.draft.idCodice);
          if (clientiByKey[ckey]) {
            clienteId = clientiByKey[ckey];
          } else {
            clientiNew.push(matched.draft);
            clientiByKey[ckey] = matched.draft.id;
            clienteId = matched.draft.id;
            clientiCreati++;
          }
        }

        draft.clienteId = clienteId;
        draft.stato = 'inviata';
        draft.dataInvioSdi = draft.data || null;
        draft.pagMese = null;
        draft.pagAnno = null;
        draft.dataPagamento = '';
        draft.origine = 'xml-import';
        toSave.push(draft);
        imported++;
      } catch (err) {
        errors.push({ file: (entry && entry.name) || '(xml)', message: (err && err.message) || String(err) });
      }
    });

    if (imported > 0) {
      store.save(profile, toSave);
      if (clientiNew.length && typeof root.saveClienti === 'function') {
        root.saveClienti(existingClienti.concat(clientiNew), profile);
      }
    }
    return { imported: imported, skipped: skipped, errors: errors, clientiCreati: clientiCreati };
  }

  function handleFileInput(event) {
    var input = event && event.target;
    var files = input && input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    Promise.all(files.map(function (file) {
      return file.text().then(function (xml) { return { name: file.name, xml: xml }; });
    })).then(function (entries) {
      var res = importNuoveFromStrings(entries);
      var msg = 'Importate ' + res.imported + ' fatture';
      if (res.clientiCreati) msg += ' (clienti nuovi: ' + res.clientiCreati + ')';
      if (res.skipped) msg += ' — skip ' + res.skipped + ' duplicate';
      if (res.errors.length) msg += ' — ' + res.errors.length + ' errori';
      if (typeof root.showToast === 'function') root.showToast(msg, res.errors.length ? 'error' : 'success');
      else if (typeof root.alert === 'function') root.alert(msg);
      if (res.errors.length) console.warn('[FattureImportNuove] errori:', res.errors);
      if (input) input.value = '';
      if (root.FattureStorico && typeof root.FattureStorico.renderStorico === 'function') {
        var sel = document.getElementById('archivioAnnoSelect');
        if (root.FattureStorico.renderAnnoFilter) root.FattureStorico.renderAnnoFilter();
        root.FattureStorico.renderStorico(Number(sel && sel.value) || new Date().getFullYear());
      }
      if (typeof root.renderClienti === 'function') root.renderClienti();
      if (typeof root.recalcAll === 'function') root.recalcAll();
    }).catch(function (err) {
      console.error('[FattureImportNuove] lettura file fallita:', err);
      if (typeof root.alert === 'function') root.alert('Errore lettura file: ' + ((err && err.message) || err));
    });
  }

  root.FattureImportNuove = {
    importNuoveFromStrings: importNuoveFromStrings,
    handleFileInput: handleFileInput
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run — verifica pass**

```bash
node test/run-tests.js
```
Expected: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add fatture-import-nuove.js test/fatture-import-nuove.test.js test/fixtures/sample-td01.xml test/run-tests.js
git commit -m "feat(fatture-import): modulo 'nuove' per import rapido stato inviata"
```

---

## Task 4: Bottone "Importa da XML" nel tab Fatture principale

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Aggiungi script tag**

In `index.html`, vicino agli altri script nel `<head>` o prima di `app.js`:

```html
<script src="fatture-import-xml.js" defer></script>
<script src="fatture-import-nuove.js" defer></script>
<script src="fatture-import-legacy.js" defer></script>
```

(verifica che siano presenti; se `fatture-import-xml.js` era già caricato, aggiungi solo i due nuovi).

- [ ] **Step 2: Aggiungi bottone + input nel tab Fatture**

Individua nel tab Fatture la sezione con "Importa da PDF (OCR)" (circa `index.html:503`). Aggiungi accanto:

```html
<input type="file" id="inputImportXmlNuove" accept=".xml" multiple style="display:none"
       onchange="window.FattureImportNuove && window.FattureImportNuove.handleFileInput(event)">
<button type="button" class="btn-ghost" onclick="document.getElementById('inputImportXmlNuove').click()">
  📄 Importa da XML
</button>
```

- [ ] **Step 3: Smoke manuale**

Apri http://localhost:3333, login, tab Fatture → verifica bottone presente. Click → apre file picker. Carica `test/fixtures/sample-td01.xml` → toast "Importate 1 fatture (clienti nuovi: 1)". Verifica in archivio stato = `inviata`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(ui): bottone 'Importa da XML' nel tab Fatture principale"
```

---

## Task 5: `fatture-import-legacy.js` — core logic (no UI)

**Files:**
- Create: `fatture-import-legacy.js`
- Create: `test/fatture-import-legacy.test.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Test fallito**

Crea `test/fatture-import-legacy.test.js`:

```javascript
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function makeWindow() {
  var store = {};
  return {
    localStorage: {
      getItem: function (k) { return k in store ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    sessionStorage: { getItem: function () { return 'TestUser'; }, setItem: function () {} },
    console: console,
    document: { getElementById: function () { return null; } },
    DOMParser: require('@xmldom/xmldom').DOMParser
  };
}

describe('FattureImportLegacy.importConfirmed', function () {
  test('crea fatture stato=pagata con pagMese/pagAnno applicati', function () {
    var win = makeWindow();
    win.FattureStorico = { load: function () { return []; }, save: function (_, f) { win._saved = f; } };
    win.getClienti = function () { return []; };
    win.saveClienti = function (list) { win._clienti = list; };
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fatture-import-xml.js'), 'utf8'), win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fatture-import-legacy.js'), 'utf8'), win);

    var xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-td01.xml'), 'utf8');
    var rows = win.FattureImportLegacy.parseToRows([{ name: 's.xml', xml: xml }]);
    expect(rows.length).toBe(1);
    rows[0].pagamento = '2025-07-15';
    rows[0].selected = true;

    var res = win.FattureImportLegacy.importConfirmed(rows);
    expect(res.imported).toBe(1);
    expect(win._saved[0].stato).toBe('pagata');
    expect(win._saved[0].origine).toBe('xml-import-legacy');
    expect(win._saved[0].pagMese).toBe(7);
    expect(win._saved[0].pagAnno).toBe(2025);
  });

  test('status=missing_pagamento se data assente', function () {
    var win = makeWindow();
    win.FattureStorico = { load: function () { return []; }, save: function () {} };
    win.getClienti = function () { return []; };
    win.saveClienti = function () {};
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fatture-import-xml.js'), 'utf8'), win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fatture-import-legacy.js'), 'utf8'), win);

    var xmlNoScad = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-td01.xml'), 'utf8')
      .replace(/<DataScadenzaPagamento>[^<]+<\/DataScadenzaPagamento>/, '');
    var rows = win.FattureImportLegacy.parseToRows([{ name: 's.xml', xml: xmlNoScad }]);
    expect(rows[0].status).toBe('missing_pagamento');
  });

  test('dedup intra-batch clienti nuovi crea UN cliente', function () {
    var win = makeWindow();
    win.FattureStorico = { load: function () { return []; }, save: function (_, f) { win._saved = f; } };
    win.getClienti = function () { return []; };
    win.saveClienti = function (list) { win._clienti = list; };
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fatture-import-xml.js'), 'utf8'), win);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fatture-import-legacy.js'), 'utf8'), win);

    var xml1 = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-td01.xml'), 'utf8');
    var xml2 = xml1.replace('<Numero>1/2025</Numero>', '<Numero>2/2025</Numero>');
    var rows = win.FattureImportLegacy.parseToRows([
      { name: '1.xml', xml: xml1 },
      { name: '2.xml', xml: xml2 }
    ]);
    rows.forEach(function (r) { r.pagamento = '2025-07-15'; r.selected = true; });
    var res = win.FattureImportLegacy.importConfirmed(rows);
    expect(res.imported).toBe(2);
    expect(res.clientiCreati).toBe(1);
  });
});
```

Aggiungi `require('./fatture-import-legacy.test.js');` in `test/run-tests.js`.

- [ ] **Step 2: Run — verifica fallimento**

```bash
node test/run-tests.js
```
Expected: FAIL.

- [ ] **Step 3: Implementa core di `fatture-import-legacy.js` (no UI)**

```javascript
/* Fatture Import Legacy — onboarding retroattivo da XML FatturaPA.
 * Flow: parseToRows → (user edita pagamento in UI) → importConfirmed → salva stato='pagata'.
 *
 * Questo modulo ha una parte logica (parseToRows, importConfirmed) e una parte UI
 * (openModal/render) definita più avanti. La logica è pura e testabile in Node.
 */
(function (root) {
  'use strict';

  function _getProfile() {
    if (typeof root.getProfile === 'function') return root.getProfile();
    return (root.sessionStorage && root.sessionStorage.getItem('calcoliPIVA_profile')) || 'Mattia';
  }

  function parseToRows(entries) {
    var X = root.FattureImportXml;
    var profile = _getProfile();
    var existingFatture = (root.FattureStorico && root.FattureStorico.load(profile)) || [];
    var existingClienti = (typeof root.getClienti === 'function') ? root.getClienti(profile) : [];
    var seen = Object.create(null);
    existingFatture.forEach(function (f) { seen[X.dedupKey(f)] = f; });

    return (entries || []).map(function (entry, idx) {
      var row = { idx: idx, file: (entry && entry.name) || ('xml_' + idx), selected: true };
      try {
        var xmlText = typeof entry === 'string' ? entry : entry.xml;
        var draft = X.parseXml(xmlText);
        row.draft = draft;
        row.match = X.matchCliente(draft.clienteSnapshot, existingClienti);
        row.pagamento = draft.scadenzaPagamento || '';
        var key = X.dedupKey(draft);
        if (seen[key]) {
          row.status = 'duplicate';
          row.existing = seen[key];
          row.selected = false;
        } else if (!row.pagamento) {
          row.status = 'missing_pagamento';
        } else {
          row.status = 'ok';
        }
      } catch (err) {
        row.status = 'parse_error';
        row.error = (err && err.message) || String(err);
        row.selected = false;
      }
      return row;
    });
  }

  function importConfirmed(rows) {
    var X = root.FattureImportXml;
    var profile = _getProfile();
    var existingFatture = (root.FattureStorico && root.FattureStorico.load(profile)) || [];
    var existingClienti = (typeof root.getClienti === 'function') ? root.getClienti(profile) : [];
    var seen = Object.create(null);
    existingFatture.forEach(function (f) { seen[X.dedupKey(f)] = f; });

    var imported = 0, skipped = 0, errors = [], clientiCreati = 0;
    var toSave = existingFatture.slice();
    var clientiNew = [];
    var clientiByKey = Object.create(null);

    (rows || []).forEach(function (row) {
      if (!row.selected || row.status === 'parse_error') { skipped++; return; }
      if (!row.pagamento) { skipped++; errors.push({ file: row.file, message: 'data pagamento mancante' }); return; }
      var d = new Date(row.pagamento);
      if (isNaN(d.getTime())) { skipped++; errors.push({ file: row.file, message: 'data non valida' }); return; }

      var key = X.dedupKey(row.draft);
      if (seen[key] && seen[key].origine !== 'xml-import-legacy') {
        skipped++;
        errors.push({ file: row.file, message: 'fattura esistente (creata altrove), non sovrascrivibile' });
        return;
      }

      var clienteId;
      if (row.match.mode === 'existing') {
        clienteId = row.match.cliente.id;
      } else {
        var ckey = (row.match.draft.partitaIva || '') + '|' + (row.match.draft.codiceFiscale || '') + '|' + (row.match.draft.idPaese + row.match.draft.idCodice);
        if (clientiByKey[ckey]) {
          clienteId = clientiByKey[ckey];
        } else {
          clientiNew.push(row.match.draft);
          clientiByKey[ckey] = row.match.draft.id;
          clienteId = row.match.draft.id;
          clientiCreati++;
        }
      }

      var fattura = row.draft;
      fattura.clienteId = clienteId;
      fattura.stato = 'pagata';
      fattura.dataInvioSdi = fattura.data || null;
      fattura.dataPagamento = row.pagamento;
      fattura.pagMese = d.getMonth() + 1;
      fattura.pagAnno = d.getFullYear();
      fattura.origine = 'xml-import-legacy';

      if (seen[key]) {
        for (var i = 0; i < toSave.length; i++) {
          if (X.dedupKey(toSave[i]) === key) { toSave[i] = fattura; break; }
        }
      } else {
        toSave.push(fattura);
        seen[key] = fattura;
      }
      imported++;
    });

    if (imported > 0) {
      root.FattureStorico.save(profile, toSave);
      if (clientiNew.length && typeof root.saveClienti === 'function') {
        root.saveClienti(existingClienti.concat(clientiNew), profile);
      }
    }
    return { imported: imported, skipped: skipped, errors: errors, clientiCreati: clientiCreati };
  }

  root.FattureImportLegacy = {
    parseToRows: parseToRows,
    importConfirmed: importConfirmed
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run — verifica pass**

```bash
node test/run-tests.js
```
Expected: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add fatture-import-legacy.js test/fatture-import-legacy.test.js test/run-tests.js
git commit -m "feat(fatture-import): core logic modulo legacy (parseToRows + importConfirmed)"
```

---

## Task 6: UI preview modale per flow legacy

**Files:**
- Modify: `fatture-import-legacy.js`
- Modify: `style.css` (opzionale per styling tabella)

- [ ] **Step 1: Aggiungi al modulo le funzioni UI (DOM construction, no innerHTML)**

In coda a `fatture-import-legacy.js` (prima della chiusura IIFE e dell'export `root.FattureImportLegacy`), aggiungi:

```javascript
  function _doc() { return root.document; }

  function _el(tag, attrs, children) {
    var d = _doc().createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') d.className = attrs[k];
        else if (k === 'dataset') Object.keys(attrs[k]).forEach(function (dk) { d.dataset[dk] = attrs[k][dk]; });
        else if (k.indexOf('on') === 0) d[k] = attrs[k];
        else d.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      if (typeof c === 'string') d.appendChild(_doc().createTextNode(c));
      else d.appendChild(c);
    });
    return d;
  }

  function _fmtImporto(f) {
    var tot = (f && f.totaleDocumento) || 0;
    var sign = (f && f.tipoDocumento === 'TD04') ? -1 : 1;
    return (sign * tot).toFixed(2) + ' €';
  }

  function _statusLabel(row) {
    if (row.status === 'ok') return 'ok';
    if (row.status === 'missing_pagamento') return 'manca data';
    if (row.status === 'duplicate') return 'già presente';
    if (row.status === 'parse_error') return 'errore parsing';
    return row.status || '';
  }

  function _renderConfirmEnabled(rows, confirmBtn) {
    var anyMissing = rows.some(function (r) { return r.selected && r.status === 'missing_pagamento' && !r.pagamento; });
    var anySelected = rows.some(function (r) { return r.selected; });
    confirmBtn.disabled = anyMissing || !anySelected;
    var count = rows.filter(function (r) { return r.selected; }).length;
    confirmBtn.textContent = 'Conferma import ' + count + ' fatture';
  }

  function _buildRow(row, confirmBtn, rows) {
    var tr = _el('tr', { 'data-idx': String(row.idx) });

    var cbCell = _el('td');
    var cb = _el('input', { type: 'checkbox' });
    cb.checked = !!row.selected;
    cb.disabled = row.status === 'parse_error';
    cb.onchange = function () { row.selected = cb.checked; _renderConfirmEnabled(rows, confirmBtn); };
    cbCell.appendChild(cb);
    tr.appendChild(cbCell);

    tr.appendChild(_el('td', null, [String(row.idx + 1)]));
    tr.appendChild(_el('td', null, [row.draft ? (row.draft.numero || '—') : row.file]));
    tr.appendChild(_el('td', null, [row.draft ? (row.draft.data || '—') : '—']));

    var clienteCell = _el('td');
    if (row.match) {
      var nome = row.match.mode === 'existing' ? row.match.cliente.nome : row.match.draft.nome;
      clienteCell.appendChild(_doc().createTextNode(nome + ' '));
      var badgeCls = row.match.mode === 'existing' ? 'badge-stato pagata' : 'badge-stato inviata';
      var badgeTxt = row.match.mode === 'existing' ? '✓ esistente' : '+ nuovo';
      clienteCell.appendChild(_el('span', { class: badgeCls }, [badgeTxt]));
    } else {
      clienteCell.appendChild(_doc().createTextNode('—'));
    }
    tr.appendChild(clienteCell);

    tr.appendChild(_el('td', null, [row.draft ? _fmtImporto(row.draft) : '—']));
    tr.appendChild(_el('td', null, [row.draft ? row.draft.tipoDocumento : '—']));

    var pagCell = _el('td');
    var dateInput = _el('input', { type: 'date' });
    dateInput.value = row.pagamento || '';
    if (row.status === 'missing_pagamento' && !row.pagamento) dateInput.style.background = '#5a4a1a';
    dateInput.onchange = function () {
      row.pagamento = dateInput.value;
      if (row.pagamento && row.status === 'missing_pagamento') row.status = 'ok';
      if (!row.pagamento && row.status === 'ok') row.status = 'missing_pagamento';
      var statusCell = tr.querySelector('td.status-cell');
      if (statusCell) { statusCell.textContent = _statusLabel(row); }
      _renderConfirmEnabled(rows, confirmBtn);
    };
    pagCell.appendChild(dateInput);
    tr.appendChild(pagCell);

    var statusCell = _el('td', { class: 'status-cell' }, [_statusLabel(row)]);
    tr.appendChild(statusCell);
    return tr;
  }

  function openModal(rows) {
    var doc = _doc();
    var overlay = _el('div', { id: 'importLegacyOverlay', class: 'modal-overlay' });
    var modal = _el('div', { class: 'modal-content', style: 'max-width:1100px;width:95vw;max-height:90vh;overflow:auto;' });

    var header = _el('div', { class: 'modal-header' }, [
      _el('h3', null, ['Import legacy — preview']),
      _el('button', { type: 'button', class: 'btn-close', onclick: function () { doc.body.removeChild(overlay); } }, ['×'])
    ]);
    modal.appendChild(header);

    var errors = rows.filter(function (r) { return r.status === 'parse_error'; });
    if (errors.length) {
      var errBox = _el('div', { class: 'alert alert-error' }, [
        _el('strong', null, [errors.length + ' file non parseable:']),
        _el('ul', null, errors.map(function (e) { return _el('li', null, [e.file + ' — ' + (e.error || '')]); }))
      ]);
      modal.appendChild(errBox);
    }

    modal.appendChild(_el('p', null, ['Controlla i dati, inserisci la data di pagamento quando manca, poi conferma.']));

    var table = _el('table', { class: 'import-legacy-table' });
    var thead = _el('thead', null, [
      _el('tr', null, [
        _el('th'),
        _el('th', null, ['#']),
        _el('th', null, ['Numero']),
        _el('th', null, ['Data doc']),
        _el('th', null, ['Cliente']),
        _el('th', null, ['Importo']),
        _el('th', null, ['Tipo']),
        _el('th', null, ['Pagata il']),
        _el('th', null, ['Status'])
      ])
    ]);
    table.appendChild(thead);
    var tbody = _el('tbody');
    table.appendChild(tbody);
    modal.appendChild(table);

    var actions = _el('div', { class: 'modal-actions', style: 'margin-top:16px;display:flex;justify-content:flex-end;gap:8px;' });
    var cancelBtn = _el('button', { type: 'button', class: 'btn-ghost', onclick: function () { doc.body.removeChild(overlay); } }, ['Annulla']);
    var confirmBtn = _el('button', { type: 'button', class: 'btn-primary' });
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    modal.appendChild(actions);

    rows.forEach(function (row) {
      tbody.appendChild(_buildRow(row, confirmBtn, rows));
    });
    _renderConfirmEnabled(rows, confirmBtn);

    confirmBtn.onclick = function () {
      var res = importConfirmed(rows);
      doc.body.removeChild(overlay);
      var msg = 'Importate ' + res.imported + ' fatture';
      if (res.clientiCreati) msg += ' (clienti nuovi: ' + res.clientiCreati + ')';
      if (res.skipped) msg += ' — skip ' + res.skipped;
      if (res.errors.length) msg += ' — ' + res.errors.length + ' errori';
      if (typeof root.showToast === 'function') root.showToast(msg, res.errors.length ? 'warning' : 'success');
      else if (typeof root.alert === 'function') root.alert(msg);
      if (root.FattureStorico && typeof root.FattureStorico.renderStorico === 'function') {
        var sel = doc.getElementById('archivioAnnoSelect');
        if (root.FattureStorico.renderAnnoFilter) root.FattureStorico.renderAnnoFilter();
        root.FattureStorico.renderStorico(Number(sel && sel.value) || new Date().getFullYear());
      }
      if (typeof root.renderClienti === 'function') root.renderClienti();
      if (typeof root.recalcAll === 'function') root.recalcAll();
    };

    overlay.appendChild(modal);
    doc.body.appendChild(overlay);
  }

  function handleFileInput(event) {
    var input = event && event.target;
    var files = input && input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    Promise.all(files.map(function (file) {
      return file.text().then(function (xml) { return { name: file.name, xml: xml }; });
    })).then(function (entries) {
      var rows = parseToRows(entries);
      if (input) input.value = '';
      openModal(rows);
    }).catch(function (err) {
      if (typeof root.alert === 'function') root.alert('Errore lettura file: ' + ((err && err.message) || err));
    });
  }
```

Aggiorna l'export:

```javascript
  root.FattureImportLegacy = {
    parseToRows: parseToRows,
    importConfirmed: importConfirmed,
    openModal: openModal,
    handleFileInput: handleFileInput
  };
```

- [ ] **Step 2: Run test — verifica non regressione**

```bash
node test/run-tests.js
```
Expected: tutti verdi (UI non toccata da test).

- [ ] **Step 3: Commit**

```bash
git add fatture-import-legacy.js
git commit -m "feat(fatture-import): UI modale preview editabile flow legacy"
```

---

## Task 7: Rewire bottone "Importa XML" archivio → flow legacy

**Files:**
- Modify: `index.html:402` (e `:410` se presente)

- [ ] **Step 1: Cambia onchange dell'input archivio**

Localizza in `index.html`:

```html
<input type="file" id="inputImportXml" accept=".xml" multiple style="display:none"
       onchange="window.FattureImportXml && window.FattureImportXml.handleFileInput(event)">
```

Sostituisci con:

```html
<input type="file" id="inputImportXml" accept=".xml" multiple style="display:none"
       onchange="window.FattureImportLegacy && window.FattureImportLegacy.handleFileInput(event)">
```

- [ ] **Step 2: Smoke manuale**

Apri http://localhost:3333 → tab Fatture → archivio → "Importa XML" → carica 2 file (uno con DataScadenzaPagamento, uno senza). Modale appare. Modifica data mancante. Conferma. Verifica:
- Archivio mostra fatture con stato `pagata`.
- Tabella mensile del mese di pagamento mostra il totale.
- Badge cliente `+ nuovo` → cliente in rubrica.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): archivio 'Importa XML' usa flow legacy con preview"
```

---

## Task 8: Smoke manuale con 27 file utente

**Files:** nessuno (verifica).

- [ ] **Step 1: Preparazione**

Verifica server attivo su :3333. Cartella utente con XML: `C:\Users\rossima\Downloads\xml`.

- [ ] **Step 2: Hard-delete 27 fatture esistenti**

Attiva `settings.devHardDelete = true`, cancella le 27 fatture legacy importate su `codex/dev-newfeatures2` (tutte stato `inviata`, origine `xml-import`). Rimuovi il toggle dopo.

In alternativa console (senza toggle UI):

```javascript
var profile = getProfile();
var key = 'calcoliPIVA_' + profile + '_fattureEmesse';
var arr = JSON.parse(localStorage.getItem(key) || '[]');
var kept = arr.filter(function (f) { return f.origine !== 'xml-import' || f.pagMese != null; });
localStorage.setItem(key, JSON.stringify(kept));
location.reload();
```

- [ ] **Step 3: Import legacy 27 file**

Archivio → "Importa XML" → seleziona tutti e 27. Modale preview:
- Tutti parseable? Se no, annota errori.
- Date scadenza presenti? Righe senza: sfondo giallo.
- Clienti esistenti vs nuovi correttamente classificati?

Compila le date mancanti, click "Conferma import N fatture".

- [ ] **Step 4: Verifiche post-import**

- Archivio: tutti 27 stato `pagata`, origine `xml-import-legacy`.
- Tab Fatture tabelle mensili: importi aggregati corretti per anno/mese.
- Dashboard forfettario anno corrente: incluso.
- Tasse accantonate: righe popolate.
- Clienti: rubrica contiene i nuovi senza duplicati.

- [ ] **Step 5: Test re-import (dedup)**

Archivio → "Importa XML" → stessi 27 file. Modale: tutti marcati `già presente`, checkbox off. Nessun duplicato creato confermando.

- [ ] **Step 6: Test import nuove**

Tab Fatture → "Importa da XML" → prendi un file a campione, modificalo cambiando `<Numero>` per evitare dedup. Verifica: stato `inviata`, non compare in tabelle mensili, compare in archivio, "Segna pagata" popola il mese.

- [ ] **Step 7: Commit note smoke**

Se necessario:

```bash
git commit --allow-empty -m "test(smoke): validato import legacy 27 file + re-import + import nuove"
```

---

## Task 9: Aggiornamento `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Aggiorna sezione "Fatture: single source of truth"**

Aggiungi dopo la lista `origine`:

```markdown
- **Import XML** è in due moduli separati:
  - `fatture-import-xml.js` — parser puro FatturaPA + `matchCliente(snapshot, existingClienti)` + `dedupKey(f)`.
  - `fatture-import-nuove.js` — import rapido tab Fatture; stato `inviata`, `pagMese/pagAnno = null`, `origine='xml-import'`.
  - `fatture-import-legacy.js` — archivio, preview modale editabile, conferma → stato `pagata`, `pagMese/pagAnno` obbligatori, `origine='xml-import-legacy'`.
  - Entrambi auto-creano clienti assenti dalla rubrica con match per P.IVA → CF → `idPaese+idCodice`.
  - Dedup fatture: `tipoDoc|annoProgressivo|progressivo|numero`. Legacy permette override re-import solo su record con `origine='xml-import-legacy'`; nuove silent skip sempre.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: aggiorna CLAUDE.md con architettura import XML redesign"
```

---

## Task 10: Cleanup finale

**Files:** nessuno (verifica + PR).

- [ ] **Step 1: Test finale + coverage visiva**

```bash
node test/run-tests.js
```
Expected: tutti verdi.

- [ ] **Step 2: Diff summary**

```bash
git log --oneline main..HEAD
git diff --stat main..HEAD
```
Expected: ~10 commit, cambiamenti circoscritti ai file previsti.

- [ ] **Step 3: Auto-review checklist**

Verifica manualmente:
- Nessun `innerHTML` in nuovi file.
- Nessun residuo di `importXmlStrings`/`handleFileInput` in `fatture-import-xml.js`.
- `fattureEmesse` mai letto/scritto direttamente fuori da `FattureStorico.load/save`.
- `normalizeFatturaEmessa` inalterata tranne whitelist.
- Nessun badge aggiuntivo su righe legacy imported in `renderStorico`.

- [ ] **Step 4: Push del branch**

(Solo dopo conferma utente esplicita.)

```bash
git push -u origin fatture-import-redesign
```

---

## Self-Review

**Spec coverage:**
- Due entry point distinti: Task 4 (nuove), Task 7 (legacy) ✓
- Parser condiviso + matchCliente + dedupKey: Task 1 ✓
- Auto-create clienti con dedup intra-batch: Task 3, Task 5 ✓
- Whitelist `xml-import-legacy`: Task 2 ✓
- Preview modale editabile: Task 6 (DOM construction, no innerHTML) ✓
- Re-import legacy override selettivo: Task 5 (`importConfirmed` check `origine === 'xml-import-legacy'`) ✓
- Smoke 27 file: Task 8 ✓
- CLAUDE.md: Task 9 ✓

**Placeholder scan:** nessun TBD/TODO.

**Type consistency:** `row.draft`, `row.match`, `row.status`, `row.pagamento` usati consistentemente in Task 5 e Task 6. `FattureImportXml.parseXml/matchCliente/dedupKey` firme coerenti.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-fatture-import-xml-redesign.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?
