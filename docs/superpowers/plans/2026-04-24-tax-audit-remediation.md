# Tax Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistemare i 18 findings fiscali identificati nell'audit 2026-04-24 (XML FatturaPA conformity, quadri dichiarazione LM/RR, scadenziario, validazioni) senza refactor oltre scope.

**Architecture:** Fix in-place sui file esistenti (`fatture-docs-feature.js`, `dichiarazione-engine.js`, `app.js`, `tax-engine.js`). Un test per fix nella dir `test/` esistente (pattern Node `require` + stub globals). 4 fasi ordinate per dipendenze (XML → Dichiarazione → Scadenziario → Validazioni). TDD per ogni item: failing test → minimal impl → verify → commit.

**Tech Stack:** Vanilla JS ES5/ES2015, no build, runner `node test/run-tests.js`. Test stub pattern da `test/fatture-normalize.test.js`.

**Input spec:** `docs/audits/2026-04-24-tax-audit-remediation.md`

**Branch:** `dev-taxaudit`

---

## File Structure

Files toccati (nessun file nuovo salvo test):

**Produzione:**
- `fatture-docs-feature.js` — XML builder FatturaPA (B1, B2, C3, R5, R6)
- `dichiarazione-engine.js` — Quadri LM/RR + validazioni (B3, B4, C4, R1, R2, R3, R4, R10)
- `app.js` — Scadenziario (C1, C2, R7, R9)
- `tax-engine.js` — Soglia acconto (R8)

**Test nuovi:**
- `test/fatture-xml-anagrafica.test.js` — B1
- `test/fatture-xml-natura.test.js` — B2
- `test/fatture-xml-element-order.test.js` — C3
- `test/fatture-xml-progressivo.test.js` — R5
- `test/fatture-xml-nc-date.test.js` — R6
- `test/dichiarazione-quadro-lm-completo.test.js` — B3
- `test/dichiarazione-quadro-rr-completo.test.js` — B4
- `test/dichiarazione-lm3-cassa.test.js` — C4
- `test/dichiarazione-startup-validation.test.js` — R1
- `test/dichiarazione-rw-soglie.test.js` — R2
- `test/dichiarazione-perdite-scadenza.test.js` — R3
- `test/scadenziario-saldo-acconti.test.js` — C1, C2, R7, R8 (un file per fase 3)

**Test esistenti da aggiornare:**
- `test/dichiarazione-engine.test.js` — R4 (limite forfettario da settings)
- `test/run-tests.js` — register nuovi test files

---

## Fase 1 — Blocker XML (SdI compliance)

### Task 1: B1 — Helper anagrafica PF vs PG

**Files:**
- Modify: `fatture-docs-feature.js:1697-1708` (CessionarioCommittente/Anagrafica block)
- Create: `test/fatture-xml-anagrafica.test.js`
- Modify: `test/run-tests.js` (register)

- [ ] **Step 1: Write failing test**

```javascript
// test/fatture-xml-anagrafica.test.js
'use strict';
var storage = {};
global.localStorage = global.localStorage || {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global.window || global;
global.document = global.document || { getElementById: function() { return null; } };
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
require('../fatture-docs-feature.js');

var buildAnagrafica = global.__buildAnagraficaXml;
if (!buildAnagrafica) throw new Error('__buildAnagraficaXml not exposed');

describe('buildAnagraficaXml — classificazione PF/PG', function () {
  test('cliente con P.IVA IT 11 cifre → Denominazione', function () {
    var xml = buildAnagrafica({ nome: 'Acme Srl', partitaIva: '12345678903' });
    expect(/<Denominazione>Acme Srl<\/Denominazione>/.test(xml)).toBe(true);
    expect(/<Nome>/.test(xml)).toBe(false);
  });

  test('cliente PF con solo CF + nome + cognome → Nome/Cognome', function () {
    var xml = buildAnagrafica({ codiceFiscale: 'RSSMRA80A01H501U', nome: 'Mario', cognome: 'Rossi' });
    expect(/<Nome>Mario<\/Nome>/.test(xml)).toBe(true);
    expect(/<Cognome>Rossi<\/Cognome>/.test(xml)).toBe(true);
    expect(/<Denominazione>/.test(xml)).toBe(false);
  });

  test('cliente legacy con solo campo nome monco → fallback Denominazione', function () {
    var xml = buildAnagrafica({ nome: 'Legacy Client' });
    expect(/<Denominazione>Legacy Client<\/Denominazione>/.test(xml)).toBe(true);
  });

  test('denominazione esplicita vince su nome + cognome', function () {
    var xml = buildAnagrafica({ denominazione: 'Acme Srl', nome: 'Mario', cognome: 'Rossi', partitaIva: '12345678903' });
    expect(/<Denominazione>Acme Srl<\/Denominazione>/.test(xml)).toBe(true);
  });
});
```

Register in `test/run-tests.js`:

```javascript
require('./fatture-xml-anagrafica.test.js');
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
node test/run-tests.js
```

Expected: `__buildAnagraficaXml not exposed` error.

- [ ] **Step 3: Implement helper + wire**

In `fatture-docs-feature.js`, add helper (before `buildFatturaElettronicaXml`):

```javascript
function buildAnagraficaXml(cliente) {
  var denom = String((cliente.denominazione || cliente.ragioneSociale || '')).trim();
  var nome = String(cliente.nome || '').trim();
  var cognome = String(cliente.cognome || '').trim();
  var piva = String(cliente.partitaIva || '').replace(/\D/g, '');
  var hasPiva = piva.length === 11;
  if (denom) {
    return '<Denominazione>' + xmlEscape(denom.slice(0, 80)) + '</Denominazione>';
  }
  if (hasPiva) {
    return '<Denominazione>' + xmlEscape((nome || piva).slice(0, 80)) + '</Denominazione>';
  }
  if (nome && cognome) {
    return '<Nome>' + xmlEscape(nome.slice(0, 60)) + '</Nome><Cognome>' + xmlEscape(cognome.slice(0, 60)) + '</Cognome>';
  }
  return '<Denominazione>' + xmlEscape(String(cliente.nome || '').slice(0, 80)) + '</Denominazione>';
}
window.__buildAnagraficaXml = buildAnagraficaXml;
```

Replace line 1699-1701:

```javascript
      <Anagrafica>
        ${buildAnagraficaXml(cliente)}
      </Anagrafica>
```

- [ ] **Step 4: Run test — expect PASS**

```bash
node test/run-tests.js
```

- [ ] **Step 5: Commit**

```bash
git add fatture-docs-feature.js test/fatture-xml-anagrafica.test.js test/run-tests.js
git commit -m "fix(B1): XML cessionario PF emette Nome/Cognome (FatturaPA v1.2 §1.4.1.3.1)"
```

---

### Task 2: B2 — Natura N2.2 sempre per forfettario

**Files:**
- Modify: `fatture-docs-feature.js:1529-1532`
- Create: `test/fatture-xml-natura.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// test/fatture-xml-natura.test.js
'use strict';
var storage = {};
global.localStorage = global.localStorage || {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global.window || global;
global.document = global.document || { getElementById: function() { return null; } };
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
require('../fatture-docs-feature.js');

var build = global.buildFatturaElettronicaXml || global.window.buildFatturaElettronicaXml;
if (!build) throw new Error('buildFatturaElettronicaXml not exposed');

function baseDraft(cliente) {
  return {
    numero: '2026/001', data: '2026-04-01', tipoDocumento: 'TD01',
    righe: [{ descrizione: 'X', quantita: 1, prezzoUnitario: 100 }],
    cliente: cliente, modalitaPagamento: 'bonifico'
  };
}

describe('XML Natura — forfettario RF19', function () {
  test('cliente IT → N2.2', function () {
    var xml = build(baseDraft({ nome: 'Acme Srl', partitaIva: '12345678903', nazione: 'IT' }));
    expect(/<Natura>N2\.2<\/Natura>/.test(xml)).toBe(true);
    expect(/<Natura>N2\.1<\/Natura>/.test(xml)).toBe(false);
  });

  test('cliente estero → N2.2 (non N2.1)', function () {
    var xml = build(baseDraft({ denominazione: 'Foreign GmbH', nazione: 'DE', partitaIva: 'DE123456789' }));
    expect(/<Natura>N2\.2<\/Natura>/.test(xml)).toBe(true);
    expect(/<Natura>N2\.1<\/Natura>/.test(xml)).toBe(false);
  });
});
```

Register in `test/run-tests.js`.

- [ ] **Step 2: Run test — expect FAIL** (N2.1 presente per estero).

- [ ] **Step 3: Fix**

`fatture-docs-feature.js:1526-1532`:

```javascript
    // Natura + riferimento normativo — forfettario RF19 sempre N2.2
    // Rationale: art. 1 c. 58 L. 190/2014 mette il forfettario FUORI campo IVA
    // (non ex art. 7-7septies DPR 633/72). Vedi Circ. AdE 9/E 2019 §4.1 +
    // Guida AdE fatturazione elettronica v1.7 (2020). N2.1 è riservata a operazioni
    // extraterritoriali del regime ordinario.
    const naturaLinea = 'N2.2';
    const riferimentoNormativo = "Regime forfettario: operazione in franchigia IVA e senza ritenuta d'acconto Art.1 c.54-89 L.190/2014";
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add fatture-docs-feature.js test/fatture-xml-natura.test.js test/run-tests.js
git commit -m "fix(B2): Natura N2.2 sempre per forfettario RF19 (Circ. AdE 9/E 2019)"
```

---

### Task 3: C3 — XSD element order garantito in DatiGeneraliDocumento

**Files:**
- Modify: `fatture-docs-feature.js:1711-1719`
- Create: `test/fatture-xml-element-order.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// test/fatture-xml-element-order.test.js
'use strict';
var storage = {};
global.localStorage = global.localStorage || {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global.window || global;
global.document = global.document || { getElementById: function() { return null; } };
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
require('../fatture-docs-feature.js');
var build = global.buildFatturaElettronicaXml || global.window.buildFatturaElettronicaXml;

function posOf(xml, tag) { return xml.indexOf('<' + tag); }

describe('DatiGeneraliDocumento — XSD element order', function () {
  test('Numero → DatiBollo → ImportoTotaleDocumento → Causale', function () {
    var xml = build({
      numero: '2026/010', data: '2026-04-01', tipoDocumento: 'TD01',
      righe: [{ descrizione: 'X', quantita: 1, prezzoUnitario: 200 }],
      cliente: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' },
      modalitaPagamento: 'bonifico',
      marcaDaBollo: true,
      causale: 'Test causale'
    });
    expect(posOf(xml, 'Numero') < posOf(xml, 'DatiBollo')).toBe(true);
    expect(posOf(xml, 'DatiBollo') < posOf(xml, 'ImportoTotaleDocumento')).toBe(true);
    expect(posOf(xml, 'ImportoTotaleDocumento') < posOf(xml, 'Causale')).toBe(true);
  });

  test('con ritenuta: Numero → DatiRitenuta → DatiBollo → Importo', function () {
    var xml = build({
      numero: '2026/011', data: '2026-04-01', tipoDocumento: 'TD01',
      righe: [{ descrizione: 'X', quantita: 1, prezzoUnitario: 200 }],
      cliente: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' },
      modalitaPagamento: 'bonifico',
      marcaDaBollo: true,
      ritenuta: 40, aliquotaRitenuta: 20, tipoRitenuta: 'RT01', causaleRitenuta: 'A'
    });
    expect(posOf(xml, 'DatiRitenuta') > 0).toBe(true);
    expect(posOf(xml, 'DatiRitenuta') < posOf(xml, 'DatiBollo')).toBe(true);
    expect(posOf(xml, 'DatiBollo') < posOf(xml, 'ImportoTotaleDocumento')).toBe(true);
  });
});
```

Register.

- [ ] **Step 2: Run — may PASS today by accident; goal is to make it structural.** If it passes, still refactor for guarantee.

- [ ] **Step 3: Refactor DatiGeneraliDocumento block**

Replace the inline template around `fatture-docs-feature.js:1712-1719` with:

```javascript
      const dgParts = [];
      dgParts.push('<TipoDocumento>' + xmlEscape(tipoDoc) + '</TipoDocumento>');
      dgParts.push('<Divisa>EUR</Divisa>');
      dgParts.push('<Data>' + xmlEscape(draft.data) + '</Data>');
      dgParts.push('<Numero>' + xmlEscape(draft.numero) + '</Numero>');
      if (xmlRitenuta) dgParts.push(xmlRitenuta.trim());
      if (datiBollo) dgParts.push(datiBollo.trim());
      dgParts.push('<ImportoTotaleDocumento>' + fmtXmlNum(round2(totals.total * sign)) + '</ImportoTotaleDocumento>');
      if (causaleXml) dgParts.push(causaleXml.trim());
      const datiGeneraliDocumentoXml = '<DatiGeneraliDocumento>' + dgParts.join('') + '</DatiGeneraliDocumento>';
```

Then in the main template, replace the inline block:

```javascript
    <DatiGenerali>
      ${datiGeneraliDocumentoXml}${datiCollegate}
    </DatiGenerali>
```

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Commit**

```bash
git add fatture-docs-feature.js test/fatture-xml-element-order.test.js test/run-tests.js
git commit -m "fix(C3): DatiGeneraliDocumento element order garantito (XSD v1.2)"
```

---

### Task 4: R5 — ProgressivoInvio validation upfront

**Files:**
- Modify: `fatture-docs-feature.js` — `validateDraftForInvio` (circa 1018-1024)
- Create: `test/fatture-xml-progressivo.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// test/fatture-xml-progressivo.test.js
'use strict';
var storage = {};
global.localStorage = global.localStorage || {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global.window || global;
global.document = global.document || { getElementById: function() { return null; } };
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
require('../fatture-docs-feature.js');
var validate = global.__validateDraftForInvio || global.window.__validateDraftForInvio;
if (!validate) throw new Error('__validateDraftForInvio not exposed');

function base(numero) {
  return { numero: numero, data: '2026-04-01', tipoDocumento: 'TD01',
    righe: [{ descrizione: 'X', quantita: 1, prezzoUnitario: 100 }],
    cliente: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' } };
}

describe('ProgressivoInvio validation', function () {
  test('numero che dopo sanitize resta univoco OK', function () {
    var res = validate(base('2026/0001'));
    var hasErr = (res.errors || []).some(function(e) { return /progressivo/i.test(e); });
    expect(hasErr).toBe(false);
  });

  test('numero troncato (>10 char alfanumerici) → errore bloccante', function () {
    var res = validate(base('FATT/2026/1234')); // sanitized → FATT202612 (troncato, collision risk)
    var hasErr = (res.errors || []).some(function(e) { return /progressivo|10/i.test(e); });
    expect(hasErr).toBe(true);
  });
});
```

Register.

- [ ] **Step 2: Run — FAIL** (helper non esposto; errore non emesso).

- [ ] **Step 3: Implement**

In `fatture-docs-feature.js`, dentro `validateDraftForInvio` aggiungere (dopo check numero presente):

```javascript
    // R5 — check ProgressivoInvio (max 10 alfanumerici tracciato FatturaPA 1.1.2)
    var rawNum = String(draft.numero || '').trim();
    var sanitized = rawNum.replace(/[^A-Za-z0-9]/g, '');
    if (sanitized.length > 10) {
      errors.push('Numero fattura troppo lungo: "' + rawNum + '" dopo normalizzazione SdI (rimozione separatori) genera "' + sanitized + '" (' + sanitized.length + ' char, max 10). Rischio collisione ProgressivoInvio. Abbrevia la numerazione.');
    }
```

Expose at bottom of IIFE:

```javascript
window.__validateDraftForInvio = validateDraftForInvio;
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add fatture-docs-feature.js test/fatture-xml-progressivo.test.js test/run-tests.js
git commit -m "fix(R5): validate ProgressivoInvio max 10 char alfanumerici upfront"
```

---

### Task 5: R6 — Data NC validata in buildFatturaElettronicaXml

**Files:**
- Modify: `fatture-docs-feature.js` — `buildFatturaElettronicaXml` inizio funzione
- Create: `test/fatture-xml-nc-date.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// test/fatture-xml-nc-date.test.js
'use strict';
var storage = {};
global.localStorage = global.localStorage || {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global.window || global;
global.document = global.document || { getElementById: function() { return null; } };
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
require('../fatture-docs-feature.js');
var build = global.buildFatturaElettronicaXml || global.window.buildFatturaElettronicaXml;

describe('TD04 date validation', function () {
  test('NC con data anteriore originale → throw', function () {
    var fnThrow = function () {
      build({
        numero: '2026/NC01', data: '2026-03-01', tipoDocumento: 'TD04',
        fatturaOriginaleId: 'orig_1',
        _originalForValidation: { data: '2026-04-15', numero: '2026/005' },
        righe: [{ descrizione: 'Storno', quantita: 1, prezzoUnitario: -100 }],
        cliente: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' }
      });
    };
    var threw = false;
    try { fnThrow(); } catch (e) { threw = /anteriore|precedente|nc/i.test(e.message); }
    expect(threw).toBe(true);
  });

  test('NC con data successiva OK', function () {
    var xml = build({
      numero: '2026/NC02', data: '2026-05-01', tipoDocumento: 'TD04',
      fatturaOriginaleId: 'orig_2',
      _originalForValidation: { data: '2026-04-15', numero: '2026/006' },
      righe: [{ descrizione: 'Storno', quantita: 1, prezzoUnitario: -100 }],
      cliente: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' }
    });
    expect(typeof xml).toBe('string');
    expect(/TD04/.test(xml)).toBe(true);
  });
});
```

Register.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

At top of `buildFatturaElettronicaXml`, after destructuring `isNC`:

```javascript
    // R6 — validate NC date against original
    if (isNC) {
      var origRef = draft._originalForValidation;
      if (!origRef && draft.fatturaOriginaleId && window.FattureStorico) {
        try {
          var all = window.FattureStorico.load(currentProfile) || [];
          origRef = all.filter(function(f) { return f.id === draft.fatturaOriginaleId; })[0];
        } catch (e) { /* noop */ }
      }
      if (origRef && origRef.data && draft.data && String(draft.data) < String(origRef.data)) {
        throw new Error('Data NC (' + draft.data + ') anteriore alla fattura originale (' + origRef.data + '). La nota di credito non può precedere l\u2019emissione originale.');
      }
    }
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add fatture-docs-feature.js test/fatture-xml-nc-date.test.js test/run-tests.js
git commit -m "fix(R6): validate data NC >= data originale in buildFatturaElettronicaXml"
```

---

## Fase 2 — Dichiarazione (compilabilità Modello Redditi PF)

### Task 6: B3 — Quadro LM completo (LM38, LM40, LM41, LM42, LM43, LM45, LM46)

**Files:**
- Modify: `dichiarazione-engine.js:99-108` (`buildQuadroLM`)
- Create: `test/dichiarazione-quadro-lm-completo.test.js`

**Nota:** codici rigo nominali in spec; validare su istruzioni AdE Modello Redditi PF 2026 prima del commit. Se AdE 2026 mantiene numerazione diversa, adattare nomi ma preservare la logica di calcolo (imposta netta, saldo, credito).

- [ ] **Step 1: Write failing test**

```javascript
// test/dichiarazione-quadro-lm-completo.test.js
'use strict';
require('../dichiarazione-engine.js');
var DE = global.DichiarazioneEngine || global.window.DichiarazioneEngine;
if (!DE) throw new Error('DichiarazioneEngine not loaded');

function yd(opts) {
  opts = opts || {};
  return {
    settings: {
      regime: 'forfettario',
      coefficiente: 78,
      impostaSostitutiva: opts.aliquota != null ? opts.aliquota : 15,
      contribFissi: 0,
      aliqContributi: 0,
    },
    fatture: {},
    pagamenti: opts.pagamenti || []
  };
}

describe('Quadro LM — sezione imposta / saldo / acconti', function () {
  test('LM34=20000 aliquota 15% no ritenute no acconti → LM38=3000 LM45=3000', function () {
    var q = DE.buildQuadroLM(yd(), { impostaSostitutiva: 15 }, { LM34_override: 20000 });
    expect(q.LM38).toBe(3000);
    expect(q.LM40).toBe(3000);
    expect(q.LM41).toBe(0);
    expect(q.LM45).toBe(3000);
    expect(q.LM46).toBe(0);
  });

  test('con ritenute LM41=500 → saldo 2500', function () {
    var q = DE.buildQuadroLM(yd(), { impostaSostitutiva: 15 }, { LM34_override: 20000, LM41_override: 500 });
    expect(q.LM45).toBe(2500);
  });

  test('con acconti versati LM43=1500 → saldo 1500', function () {
    var q = DE.buildQuadroLM(yd(), { impostaSostitutiva: 15 }, { LM34_override: 20000, LM43_override: 1500 });
    expect(q.LM45).toBe(1500);
  });

  test('acconti > imposta → a credito LM46', function () {
    var q = DE.buildQuadroLM(yd(), { impostaSostitutiva: 15 }, { LM34_override: 20000, LM43_override: 4000 });
    expect(q.LM45).toBe(0);
    expect(q.LM46).toBe(1000);
  });

  test('start-up 5%: LM34=20000 aliquota 5% → LM38=1000', function () {
    var q = DE.buildQuadroLM(yd({ aliquota: 5 }), { impostaSostitutiva: 5 }, { LM34_override: 20000 });
    expect(q.LM38).toBe(1000);
  });
});
```

Register in `run-tests.js`.

- [ ] **Step 2: Run — FAIL** (campi LM38/LM40/LM41/LM43/LM45/LM46 non presenti).

- [ ] **Step 3: Implement in `buildQuadroLM`**

Dopo il calcolo di `LM34` e `LM36/LM47` esistenti, aggiungere:

```javascript
  // B3 — sezione imposta/saldo/acconti (Modello Redditi PF 2026 quadro LM sez. II)
  var aliquota = parseFloat(settings.impostaSostitutiva) || 15;
  var lm34 = (overrides && overrides.LM34_override != null) ? overrides.LM34_override : q.LM34;
  q.LM34 = lm34;
  q.LM38 = Math.round(lm34 * aliquota / 100 * 100) / 100;
  q.LM39 = (overrides && overrides.LM39_override) || 0;
  q.LM40 = Math.max(0, Math.round((q.LM38 - q.LM39) * 100) / 100);
  q.LM41 = (overrides && overrides.LM41_override) || 0;
  q.LM42 = (overrides && overrides.LM42_override) || 0;
  q.LM43 = (overrides && overrides.LM43_override) || 0;
  var debitoLordo = Math.round((q.LM40 - q.LM41 - q.LM42 - q.LM43) * 100) / 100;
  q.LM45 = debitoLordo > 0 ? debitoLordo : 0;
  q.LM46 = debitoLordo < 0 ? Math.round(-debitoLordo * 100) / 100 : 0;
```

Assicurati che `q` sia il result object già esistente della funzione.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add dichiarazione-engine.js test/dichiarazione-quadro-lm-completo.test.js test/run-tests.js
git commit -m "fix(B3): quadro LM sez. II completa (LM38/LM40-46 imposta, ritenute, acconti, saldo)"
```

---

### Task 7: B4 — Quadro RR sez. I con acconti versati

**Files:**
- Modify: `dichiarazione-engine.js:110-154` (`buildQuadroRR`)
- Create: `test/dichiarazione-quadro-rr-completo.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// test/dichiarazione-quadro-rr-completo.test.js
'use strict';
require('../dichiarazione-engine.js');
var DE = global.DichiarazioneEngine || global.window.DichiarazioneEngine;

function yd(pagamenti) {
  return {
    settings: { regime: 'forfettario', inpsMode: 'artcom', inpsCategoria: 'artigiano' },
    fatture: {},
    pagamenti: pagamenti || []
  };
}

describe('Quadro RR — saldo al netto acconti', function () {
  test('RR6 eccedente + 2 acconti versati 500+500 → RR7=1000 RR8=max(0,RR6-1000)', function () {
    var pagamenti = [
      { data: '2025-06-30', tipo: 'contributi', importo: 500, linkedKeys: ['contributi_acc1_2025'] },
      { data: '2025-11-30', tipo: 'contributi', importo: 500, linkedKeys: ['contributi_acc2_2025'] }
    ];
    var qLM = { LM4: 30000 };
    var q = DE.buildQuadroRR(yd(pagamenti), { inpsMode: 'artcom', inpsCategoria: 'artigiano' }, qLM, { RR6_override: 2000 });
    expect(q.RR7).toBe(1000);
    expect(q.RR8).toBe(1000);
  });

  test('acconti > RR6 → credito', function () {
    var pagamenti = [
      { data: '2025-06-30', tipo: 'contributi', importo: 1500, linkedKeys: ['contributi_acc1_2025'] }
    ];
    var q = DE.buildQuadroRR(yd(pagamenti), { inpsMode: 'artcom', inpsCategoria: 'artigiano' }, { LM4: 30000 }, { RR6_override: 1000 });
    expect(q.RR8).toBe(0);
    expect(q.RR8_credito).toBe(500);
  });
});
```

Register.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

In `buildQuadroRR`, aggiungere dopo calcolo `RR6`:

```javascript
  // B4 — acconti versati sottratti al saldo
  var accontiRegex = /^contributi_acc[12]_/;
  var rr7 = (yearData.pagamenti || [])
    .filter(function(p) { return p && p.tipo === 'contributi' && Array.isArray(p.linkedKeys) && p.linkedKeys.some(function(k) { return accontiRegex.test(String(k)); }); })
    .reduce(function(s, p) { return s + (parseFloat(p.importo) || 0); }, 0);
  q.RR7 = Math.round(rr7 * 100) / 100;
  var rr6Val = (overrides && overrides.RR6_override != null) ? overrides.RR6_override : q.RR6;
  var diff = Math.round((rr6Val - q.RR7) * 100) / 100;
  q.RR8 = diff > 0 ? diff : 0;
  q.RR8_credito = diff < 0 ? -diff : 0;
```

Simmetrico per GS (`rr12`) se la funzione gestisce entrambi i rami.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add dichiarazione-engine.js test/dichiarazione-quadro-rr-completo.test.js test/run-tests.js
git commit -m "fix(B4): quadro RR sez. I sottrae acconti versati (RR7/RR8, credito)"
```

---

### Task 8: C4 — LM3 contributi per cassa

**Files:**
- Modify: `dichiarazione-engine.js:69-82` (dentro `buildQuadroLM`)
- Create: `test/dichiarazione-lm3-cassa.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// test/dichiarazione-lm3-cassa.test.js
'use strict';
require('../dichiarazione-engine.js');
var DE = global.DichiarazioneEngine || global.window.DichiarazioneEngine;

describe('LM3 per cassa', function () {
  test('somma pagamenti contributi dell\u2019anno', function () {
    var yearData = {
      settings: { regime: 'forfettario', coefficiente: 78, impostaSostitutiva: 15 },
      fatture: {},
      pagamenti: [
        { data: '2025-05-16', tipo: 'contributi', importo: 1000 },
        { data: '2025-08-20', tipo: 'contributi', importo: 1000 },
        { data: '2025-11-16', tipo: 'contributi', importo: 1000 },
        { data: '2024-12-15', tipo: 'contributi', importo: 500 } // anno diverso, escluso
      ]
    };
    var q = DE.buildQuadroLM(yearData, { year: 2025, impostaSostitutiva: 15 }, {});
    expect(q.LM3).toBe(3000);
  });

  test('nessun pagamento → LM3=0', function () {
    var q = DE.buildQuadroLM({ settings: {}, fatture: {}, pagamenti: [] }, { year: 2025, impostaSostitutiva: 15 }, {});
    expect(q.LM3).toBe(0);
  });

  test('override manuale vince su pagamenti', function () {
    var yd = { settings: {}, fatture: {}, pagamenti: [ { data: '2025-05-16', tipo: 'contributi', importo: 1000 } ] };
    var q = DE.buildQuadroLM(yd, { year: 2025, impostaSostitutiva: 15 }, { LM3_override: 2500 });
    expect(q.LM3).toBe(2500);
  });
});
```

Register.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

In `buildQuadroLM`, dove calcola `LM3`, sostituire con:

```javascript
  // C4 — contributi deducibili per cassa (art. 1 c. 64 L. 190/2014)
  var targetYear = (input && input.year) || yearData.__year || new Date().getFullYear();
  var contribPagati = (yearData.pagamenti || [])
    .filter(function(p) {
      return p && p.tipo === 'contributi' && p.data &&
        new Date(p.data).getFullYear() === targetYear;
    })
    .reduce(function(s, p) { return s + (parseFloat(p.importo) || 0); }, 0);
  var lm3 = (overrides && overrides.LM3_override != null)
    ? overrides.LM3_override
    : Math.round(contribPagati * 100) / 100;
  q.LM3 = lm3;
```

Rimuovere il vecchio calcolo per competenza (`contribFissi + contribVar`).

- [ ] **Step 4: Run — PASS + esegui tutti i test, verifica nessuna regressione**

```bash
node test/run-tests.js
```

- [ ] **Step 5: Commit**

```bash
git add dichiarazione-engine.js test/dichiarazione-lm3-cassa.test.js test/run-tests.js
git commit -m "fix(C4): LM3 per cassa da pagamenti (art. 1 c. 64 L. 190/2014)"
```

---

## Fase 3 — Scadenziario

### Task 9: C1 — Saldo anno N sottrae acconti effettivamente versati

**Files:**
- Modify: `app.js:4753-4769`
- Create: `test/scadenziario-saldo-acconti.test.js` (shared per C1/C2/R7/R8)

- [ ] **Step 1: Write failing test — helper `getAccontiVersatiForYear`**

```javascript
// test/scadenziario-saldo-acconti.test.js
'use strict';
var storage = {};
global.localStorage = global.localStorage || {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global.window || global;
global.document = global.document || {
  getElementById: function() { return null; },
  querySelectorAll: function() { return []; },
  addEventListener: function() {},
  body: { appendChild: function() {} }
};
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
// Non richiediamo app.js intero (side effects troppi). Testiamo solo l'helper esposto.
require('../app.js');

describe('C1 — getAccontiVersatiForYear', function () {
  test('somma acconti imposta con linkedKeys coerenti', function () {
    var fn = global.__getAccontiVersatiForYear || global.window.__getAccontiVersatiForYear;
    if (!fn) throw new Error('__getAccontiVersatiForYear not exposed');
    var pagamenti = [
      { data: '2026-06-30', tipo: 'tasse', importo: 1000, linkedKeys: ['imposta_acc1_2026'] },
      { data: '2026-11-30', tipo: 'tasse', importo: 1500, linkedKeys: ['imposta_acc2_2026'] },
      { data: '2026-06-30', tipo: 'tasse', importo: 2000, linkedKeys: ['imposta_saldo_2025'] }
    ];
    expect(fn(2026, 'imposta', pagamenti)).toBe(2500);
  });

  test('tipo contributi simmetrico', function () {
    var fn = global.__getAccontiVersatiForYear || global.window.__getAccontiVersatiForYear;
    var pagamenti = [
      { data: '2026-06-30', tipo: 'contributi', importo: 500, linkedKeys: ['contributi_acc1_2026'] },
      { data: '2026-11-30', tipo: 'contributi', importo: 700, linkedKeys: ['contributi_acc2_2026'] }
    ];
    expect(fn(2026, 'contributi', pagamenti)).toBe(1200);
  });
});
```

Register.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement helper + wire**

In `app.js`, aggiungere helper (in prossimità del calcolo scadenziario):

```javascript
function getAccontiVersatiForYear(year, tipo, pagamentiOverride) {
  var pags = pagamentiOverride || (typeof getPagamenti === 'function' ? getPagamenti() : []);
  var keyPrefix = (tipo === 'contributi') ? 'contributi_acc' : 'imposta_acc';
  var yearSuffix = '_' + year;
  return pags.reduce(function(sum, p) {
    if (!p || p.tipo !== (tipo === 'contributi' ? 'contributi' : 'tasse')) return sum;
    var lk = Array.isArray(p.linkedKeys) ? p.linkedKeys : [];
    var matches = lk.some(function(k) {
      var s = String(k);
      return s.indexOf(keyPrefix) === 0 && s.indexOf(yearSuffix) === s.length - yearSuffix.length;
    });
    return matches ? sum + (parseFloat(p.importo) || 0) : sum;
  }, 0);
}
window.__getAccontiVersatiForYear = getAccontiVersatiForYear;
```

Modificare `app.js:4753-4769` (saldo imposta anno N):

```javascript
  // C1 — anno corrente: usa acconti effettivi versati invece di calcolato
  var isAnnoCorrente = (year === (typeof getCurrentYear === 'function' ? getCurrentYear() : new Date().getFullYear()));
  var accontiVersati = isAnnoCorrente ? getAccontiVersatiForYear(year, 'imposta') : impostaAcconti.total;
  var saldoNetto = Math.max(0, currentApplied.tasse - accontiVersati);
  // (usa saldoNetto nel pushDueRow al posto di currentApplied.tasse - impostaAcconti.total)
```

Identica modifica per il saldo contributi variabili.

- [ ] **Step 4: Run — PASS** (+ run full suite).

- [ ] **Step 5: Commit**

```bash
git add app.js test/scadenziario-saldo-acconti.test.js test/run-tests.js
git commit -m "fix(C1): saldo anno N sottrae acconti effettivamente versati (imposta+contributi)"
```

---

### Task 10: C2 — 1° acconto segue override saldo

**Files:**
- Modify: `app.js:4537-4549`

- [ ] **Step 1: Write failing test**

Aggiungi al file `test/scadenziario-saldo-acconti.test.js`:

```javascript
describe('C2 — override saldo propaga al 1° acconto', function () {
  test('overrideSaldoImposta {month:8,day:31} → 1° acconto stessa data', function () {
    var fn = global.__buildScheduleDueDates || global.window.__buildScheduleDueDates;
    if (!fn) throw new Error('__buildScheduleDueDates not exposed');
    var res = fn(2026, { overrideSaldoImposta: { month: 8, day: 31 } });
    expect(res.saldoImposta.month).toBe(8);
    expect(res.saldoImposta.day).toBe(31);
    expect(res.accontoImposta1.month).toBe(8);
    expect(res.accontoImposta1.day).toBe(31);
  });

  test('senza override → default 30/6', function () {
    var fn = global.__buildScheduleDueDates || global.window.__buildScheduleDueDates;
    var res = fn(2026, {});
    expect(res.accontoImposta1.month).toBe(6);
    expect(res.accontoImposta1.day).toBe(30);
  });
});
```

- [ ] **Step 2: Run — FAIL** (helper non esposto).

- [ ] **Step 3: Implement**

In `app.js`, dove si costruiscono le date di saldo/acconto (4537-4549), estrarre helper:

```javascript
function buildScheduleDueDates(year, settings) {
  var s = settings || {};
  var saldoDef = { month: FORFETTARIO_RULES.saldoMonth, day: FORFETTARIO_RULES.saldoDay };
  var saldoImposta = s.overrideSaldoImposta || saldoDef;
  var saldoContributi = s.overrideSaldoContributi || saldoDef;
  return {
    saldoImposta: saldoImposta,
    accontoImposta1: saldoImposta,  // C2: 1° acconto segue saldo
    accontoImposta2: { month: FORFETTARIO_RULES.acconto2Month, day: FORFETTARIO_RULES.acconto2Day },
    saldoContributi: saldoContributi,
    accontoContributi1: saldoContributi,
    accontoContributi2: { month: FORFETTARIO_RULES.acconto2Month, day: FORFETTARIO_RULES.acconto2Day }
  };
}
window.__buildScheduleDueDates = buildScheduleDueDates;
```

Usarlo al posto dei literal `{month:6,day:30}` nei 4 `pushDueRow` del blocco 4537-4549.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add app.js test/scadenziario-saldo-acconti.test.js
git commit -m "fix(C2): override saldo propaga al 1° acconto (imposta + contributi)"
```

---

### Task 11: R7 — Bollo Q4 anno precedente con buildRolledDueDate

**Files:**
- Modify: `app.js:4678-4715`

- [ ] **Step 1: Write failing test** (stesso file)

```javascript
describe('R7 — bollo Q4 previous year rolled', function () {
  test('28/2/2026 sabato → slitta a lunedì 2/3/2026', function () {
    var fn = global.__getBolloQ4PrevDue || global.window.__getBolloQ4PrevDue;
    if (!fn) throw new Error('__getBolloQ4PrevDue not exposed');
    var due = fn(2026);
    // 28 feb 2026 is Saturday → should roll to 2 mar 2026 Monday
    expect(due.month).toBe(3);
    expect(due.day).toBe(2);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

In `app.js:4678-4715`, sostituire `pushDueRow(2, 28, ...)` con:

```javascript
    function getBolloQ4PrevDue(year) {
      return buildRolledDueDate(year, 2, 28);
    }
    window.__getBolloQ4PrevDue = getBolloQ4PrevDue;
    var q4due = getBolloQ4PrevDue(year);
    pushDueRow(q4due.month, q4due.day, /* resto argomenti originali */);
```

(Riutilizzare gli argomenti del `pushDueRow` originale: label, importo, key, ecc.)

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add app.js test/scadenziario-saldo-acconti.test.js
git commit -m "fix(R7): bollo Q4 anno precedente slitta al primo giorno lavorativo (DPR 558/1999)"
```

---

### Task 12: R8 — Soglia unico acconto `<` in tax-engine.js

**Files:**
- Modify: `tax-engine.js:80`

- [ ] **Step 1: Write failing test** (aggiungi a `test/tax-engine.test.js` esistente o nuovo blocco)

```javascript
// dentro test/tax-engine.test.js
describe('R8 — soglia acconto strict <', function () {
  test('base = 257.52 esatto → split 40/60 (non unico)', function () {
    var plan = TaxEngine.buildAccontoPlan(257.52, 2026);
    expect(plan.splitMode).toBe('40_60');
  });

  test('base = 257.51 → unico a novembre', function () {
    var plan = TaxEngine.buildAccontoPlan(257.51, 2026);
    expect(plan.splitMode).toBe('single');
  });
});
```

- [ ] **Step 2: Run — FAIL** (a 257.52 oggi `<=` dà single).

- [ ] **Step 3: Fix**

`tax-engine.js:80`: cambiare `<= 257.52` in `< 257.52`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add tax-engine.js test/tax-engine.test.js
git commit -m "fix(R8): soglia unico acconto strict < 257,52 (art. 17 DPR 435/2001 c. 3)"
```

---

## Fase 4 — Validazioni / safeguards

### Task 13: R1 — Validazione requisiti start-up 5%

**Files:**
- Modify: `dichiarazione-engine.js` — aggiungere `validateStartupAliquota` + integrare in `validateDichiarazione`
- Create: `test/dichiarazione-startup-validation.test.js`

- [ ] **Step 1: Write failing test**

```javascript
'use strict';
require('../dichiarazione-engine.js');
var DE = global.DichiarazioneEngine || global.window.DichiarazioneEngine;

describe('R1 — start-up 5% validation', function () {
  test('anno inizio 2020 + dichiarazione 2026 → errore "scaduto"', function () {
    var res = DE.validateStartupAliquota({
      impostaSostitutiva: 5,
      attivita: { dataInizioAttivita: '2020-01-01' },
      startupConfermaRequisiti: true
    }, 2026);
    var hasErr = (res.errs || []).some(function(e) { return /scaduto|5 anni/i.test(e); });
    expect(hasErr).toBe(true);
  });

  test('anno inizio 2023 + conferma requisiti → OK', function () {
    var res = DE.validateStartupAliquota({
      impostaSostitutiva: 5,
      attivita: { dataInizioAttivita: '2023-01-01' },
      startupConfermaRequisiti: true
    }, 2026);
    expect(res.ok).toBe(true);
  });

  test('aliquota 15% → skip (no validation)', function () {
    var res = DE.validateStartupAliquota({ impostaSostitutiva: 15 }, 2026);
    expect(res.ok).toBe(true);
    expect((res.errs || []).length).toBe(0);
  });

  test('nessuna data inizio → warning', function () {
    var res = DE.validateStartupAliquota({ impostaSostitutiva: 5 }, 2026);
    var hasWarn = (res.warn || []).some(function(w) { return /data inizio/i.test(w); });
    expect(hasWarn).toBe(true);
  });
});
```

Register.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

In `dichiarazione-engine.js`, aggiungere nel public API:

```javascript
  function validateStartupAliquota(settings, year) {
    var errs = [];
    var warn = [];
    var aliquota = parseFloat(settings && settings.impostaSostitutiva) || 15;
    if (aliquota !== 5) return { ok: true, errs: errs, warn: warn };
    var inizio = settings.attivita && settings.attivita.dataInizioAttivita;
    if (!inizio) { warn.push('Data inizio attivita non impostata — requisiti start-up 5% non verificabili'); return { ok: false, errs: errs, warn: warn }; }
    var annoInizio = parseInt(String(inizio).slice(0, 4), 10);
    if (!isFinite(annoInizio)) { warn.push('Data inizio attivita non leggibile'); return { ok: false, errs: errs, warn: warn }; }
    var anniTrascorsi = year - annoInizio;
    if (anniTrascorsi > 4) errs.push('Aliquota start-up 5% scaduta (oltre 5 anni da ' + annoInizio + ') — art. 1 c. 65 L. 190/2014');
    if (!settings.startupConfermaRequisiti) warn.push('Requisiti start-up L. 190/2014 c. 65 non confermati: 3 anni senza attivita, no prosecuzione, soglia ricavi periodo precedente');
    return { ok: errs.length === 0, errs: errs, warn: warn };
  }

  // espone
  // ... nel return/exports: validateStartupAliquota: validateStartupAliquota
```

Aggiungere chiamata in `validateDichiarazione` per propagare.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add dichiarazione-engine.js test/dichiarazione-startup-validation.test.js test/run-tests.js
git commit -m "fix(R1): validate requisiti start-up 5% (art. 1 c. 65 L. 190/2014)"
```

---

### Task 14: R2 — RW soglie IVAFE/IVIE warnings

**Files:**
- Modify: `dichiarazione-engine.js:201-214` (`buildQuadroRW`) + aggiungere `validateRW`
- Create: `test/dichiarazione-rw-soglie.test.js`

- [ ] **Step 1: Write failing test**

```javascript
'use strict';
require('../dichiarazione-engine.js');
var DE = global.DichiarazioneEngine || global.window.DichiarazioneEngine;

describe('R2 — RW soglie', function () {
  test('conto 6000 € giacenza media → warning IVAFE monitoraggio, no imposta', function () {
    var res = DE.validateRW([{ tipo: 'conto', valoreFinale: 6000, giacenzaMedia: 6000, giorniDetenzione: 365 }]);
    expect((res.warn || []).some(function(w) { return /ivafe|monitoraggio/i.test(w); })).toBe(true);
  });

  test('immobile < 200 € imposta IVIE → warning esonero imposta ma monitoraggio obbligatorio', function () {
    var res = DE.validateRW([{ tipo: 'immobile', valoreFinale: 10000, giacenzaMedia: 10000, giorniDetenzione: 365 }]);
    expect(res.ok).toBe(true);
  });

  test('conto vuoto (0/0) → skip monitoraggio ok', function () {
    var res = DE.validateRW([{ tipo: 'conto', valoreFinale: 0, giacenzaMedia: 0, giorniDetenzione: 0 }]);
    expect((res.warn || []).length).toBe(0);
  });
});
```

Register.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```javascript
  function validateRW(contiEsteri) {
    var errs = [], warn = [];
    (contiEsteri || []).forEach(function(c, i) {
      var v = parseFloat(c.valoreFinale) || 0;
      var g = parseFloat(c.giacenzaMedia) || 0;
      if (v === 0 && g === 0) return;
      if (c.tipo === 'conto' || !c.tipo) {
        if (g > 5000 || v > 15000) {
          warn.push('Conto #' + (i + 1) + ': soglie IVAFE superate (giacenza media ' + g + ', valore ' + v + ') — imposta 0,2% dovuta');
        } else {
          warn.push('Conto #' + (i + 1) + ': sotto soglia IVAFE (esente imposta) ma monitoraggio RW obbligatorio (D.L. 167/1990)');
        }
      }
      if (!c.giorniDetenzione) warn.push('RW #' + (i + 1) + ': giorniDetenzione mancante (richiesto dalla tracciatura)');
    });
    return { ok: errs.length === 0, errs: errs, warn: warn };
  }
```

Espone su API.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add dichiarazione-engine.js test/dichiarazione-rw-soglie.test.js test/run-tests.js
git commit -m "fix(R2): validateRW soglie IVAFE/IVIE + obbligo monitoraggio (D.L. 167/1990)"
```

---

### Task 15: R3 — Perdite pregresse scadenza 5 anni

**Files:**
- Modify: `dichiarazione-engine.js:89-90`
- Create: `test/dichiarazione-perdite-scadenza.test.js`

- [ ] **Step 1: Write failing test**

```javascript
'use strict';
require('../dichiarazione-engine.js');
var DE = global.DichiarazioneEngine || global.window.DichiarazioneEngine;

describe('R3 — perdite pregresse scadenza 5 anni', function () {
  test('perdita 2019 usata nel 2026 → esclusa (> 5 anni)', function () {
    var res = DE.filterPerditeUtilizzabili([
      { annoFormazione: 2019, importo: 1000 },
      { annoFormazione: 2023, importo: 500 }
    ], 2026);
    expect(res.utilizzabili).toBe(500);
    expect(res.scadute.length).toBe(1);
  });

  test('tutte entro 5 anni → tutte utilizzabili', function () {
    var res = DE.filterPerditeUtilizzabili([
      { annoFormazione: 2022, importo: 1000 },
      { annoFormazione: 2024, importo: 500 }
    ], 2026);
    expect(res.utilizzabili).toBe(1500);
  });

  test('formato legacy numero singolo → utilizzabile senza warning', function () {
    var res = DE.filterPerditeUtilizzabili(1000, 2026);
    expect(res.utilizzabili).toBe(1000);
  });
});
```

Register.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```javascript
  function filterPerditeUtilizzabili(perdite, year) {
    if (typeof perdite === 'number') return { utilizzabili: perdite, scadute: [] };
    if (!Array.isArray(perdite)) return { utilizzabili: 0, scadute: [] };
    var util = 0;
    var scadute = [];
    perdite.forEach(function(p) {
      if (!p) return;
      var a = parseInt(p.annoFormazione, 10);
      var imp = parseFloat(p.importo) || 0;
      if (!isFinite(a)) { util += imp; return; }
      if (year - a > 5) scadute.push(p);
      else util += imp;
    });
    return { utilizzabili: Math.round(util * 100) / 100, scadute: scadute };
  }
```

Integrare in `buildQuadroLM` dove calcola `LM34`: `var p = filterPerditeUtilizzabili(overrides.LM_perditePregresse, year);` e usare `p.utilizzabili`. Warning se `p.scadute.length > 0`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add dichiarazione-engine.js test/dichiarazione-perdite-scadenza.test.js test/run-tests.js
git commit -m "fix(R3): perdite pregresse escluse se > 5 anni (art. 84 TUIR)"
```

---

### Task 16: R4 — Limite forfettario da settings

**Files:**
- Modify: `dichiarazione-engine.js:313-317`
- Modify: `test/dichiarazione-engine.test.js` (aggiornare asserzioni esistenti)

- [ ] **Step 1: Write failing test — aggiungi a dichiarazione-engine.test.js**

```javascript
describe('R4 — limite forfettario da settings', function () {
  test('settings.limiteForfettario=100000 → warning sopra 100k non 85k', function () {
    var yd = { settings: { regime: 'forfettario', limiteForfettario: 100000 }, fatture: {}, pagamenti: [] };
    var res = DichiarazioneEngine.validateDichiarazione({
      quadroLM: { LM2: 95000 },
      __yearData: yd
    });
    var hasWarn = (res.warnings || []).some(function(w) { return /100000|limite/i.test(w); });
    expect(hasWarn).toBe(false); // sotto soglia 100k
  });

  test('default 85k se settings manca', function () {
    var yd = { settings: { regime: 'forfettario' }, fatture: {}, pagamenti: [] };
    var res = DichiarazioneEngine.validateDichiarazione({
      quadroLM: { LM2: 90000 },
      __yearData: yd
    });
    var hasWarn = (res.warnings || []).some(function(w) { return /85000|limite/i.test(w); });
    expect(hasWarn).toBe(true);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Sostituire hardcoded `85000` / `100000` con:

```javascript
  var limite = (yearData && yearData.settings && yearData.settings.limiteForfettario)
    ? parseFloat(yearData.settings.limiteForfettario)
    : 85000;
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add dichiarazione-engine.js test/dichiarazione-engine.test.js
git commit -m "fix(R4): limite forfettario letto da settings (default 85k L. 197/2022)"
```

---

### Task 17: R9 — Nota UI saldo contributi N-1 allineata

**Files:**
- Modify: `app.js:4481` (nota UI) + `app.js:4589-4607` (comportamento)

- [ ] **Step 1: Grep per trovare la stringa esatta della nota UI**

```bash
grep -n "stima su dati" app.js
```

- [ ] **Step 2: Aggiornare la nota**

Cambiare il testo in qualcosa come:

```javascript
// Nota UI saldo contributi N-1:
'Senza storico contributi dell\u2019anno precedente e senza il valore "primo anno — contributi variabili", il saldo N-1 non e calcolabile e resta a 0.'
```

Nessun cambio comportamento (lasciare 0 è conforme). Questo fix è solo testuale, no test automatizzato.

- [ ] **Step 3: Smoke test manuale**

Aprire scadenziario primo anno senza storico, verificare nota coerente con 0.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "fix(R9): nota UI saldo contributi N-1 allineata a comportamento (0 se storico mancante)"
```

---

### Task 18: R10 — Disclaimer quadro RS forfettario informativo

**Files:**
- Modify: `dichiarazione-engine.js:156-178` (aggiungere `isInformativo: true` meta)
- Modify: UI step RS (in `dichiarazione-ui.js` se esiste) — aggiungere banner

- [ ] **Step 1: Grep UI file**

```bash
grep -l "RS37" *.js
```

- [ ] **Step 2: In `buildQuadroRS`**

Aggiungere al result object:

```javascript
  q.isInformativo = true;
  q._disclaimer = 'I righi RS371-RS381 sono informativi per il regime forfettario: NON riducono l\u2019imposta sostitutiva.';
```

- [ ] **Step 3: Nella UI (cerca il render dello step)**

Prima del render dei righi aggiungere:

```javascript
if (quadroRS && quadroRS.isInformativo) {
  container.insertAdjacentHTML('afterbegin',
    '<div class="banner-info">I dati di questo quadro sono <b>informativi</b> per il regime forfettario. NON riducono l\u2019imposta sostitutiva.</div>');
}
```

- [ ] **Step 4: Smoke test manuale**

Aprire wizard dichiarazione → step RS → banner visibile.

- [ ] **Step 5: Commit**

```bash
git add dichiarazione-engine.js dichiarazione-ui.js
git commit -m "fix(R10): disclaimer quadro RS informativo per forfettario"
```

---

## Finale — Verifica globale

- [ ] **Step 1: Run full test suite**

```bash
node test/run-tests.js
```

Expected: tutti i test passano, nessuna regressione.

- [ ] **Step 2: Smoke manuale in browser**

Su localhost (server app esistente):
1. Tab Fatture → crea fattura a persona fisica IT → download XML → verifica `<Nome>/<Cognome>` ✓
2. Tab Fatture → NC TD04 con data anteriore originale → preview deve mostrare errore ✓
3. Tab Dichiarazione → wizard completo → verifica LM38/LM40/LM45 popolati ✓
4. Tab Scadenziario → registra acconto imposta anno corrente → saldo anno N si riduce ✓

- [ ] **Step 3: Push branch**

```bash
git push -u origin dev-taxaudit
```

- [ ] **Step 4: Aggiornare memory**

Nota in `memory/project_tax_audit_2026.md`: "COMPLETATO 2026-04-24: 18 fix applicati su dev-taxaudit, suite 239+N tests green."

---

## Riferimenti normativi per i commit

| Fix | Riferimento |
|---|---|
| B1 | FatturaPA v1.2 tracciato §1.4.1.3.1 |
| B2 | Art. 1 c. 58 L. 190/2014 + Circ. AdE 9/E 2019 §4.1 |
| B3 | Istr. Modello Redditi PF 2026 quadro LM sez. II |
| B4 | Istr. Modello Redditi PF 2026 quadro RR sez. I |
| C1 | Art. 17 DPR 435/2001 (per cassa) |
| C2 | DPCM proroghe annuali + L. 27/2022 |
| C3 | XSD `fatturaordinaria_v1.2.xsd` |
| C4 | Art. 1 c. 64 L. 190/2014 (deducibilita per cassa) |
| R1 | Art. 1 c. 65 L. 190/2014 (start-up 5%) |
| R2 | D.L. 167/1990 art. 5 + Circ. AdE 2/E 2013 |
| R3 | Art. 84 TUIR (perdite 5 anni) |
| R4 | L. 197/2022 (soglia 85k) |
| R5 | FatturaPA §1.1.2 ProgressivoInvio |
| R6 | Prassi AdE NC successiva emissione |
| R7 | DPR 558/1999 art. 1 (weekend roll) |
| R8 | Art. 17 DPR 435/2001 c. 3 (soglia 257,52 €) |
