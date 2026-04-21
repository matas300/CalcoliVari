# Fatture Workflow Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificare le fatture su `fattureEmesse` come unica fonte di verità, chiudere workflow stati bozza→inviata→pagata + NC→stornata, predisporre hook OCR PDF.

**Architecture:** Nuovo modulo `fatture-selectors.js` centralizza tutti gli accessi a `fattureEmesse` (by month, quarter, pagAnno, cross-year). Tutte le feature (bollo, dashboard, budget, scadenziario, forfettario) migrano dai vecchi accessi a `data.fatture[month]` ai selector. Migrazione legacy automatica idempotente. Hard-delete toggle per fase test.

**Tech Stack:** Vanilla JS no-build, IIFE pattern, localStorage, Node test runner minimale (`test/run-tests.js`).

**Spec:** `docs/superpowers/specs/2026-04-20-fatture-workflow-redesign.md`

---

## File Structure

- **Create**: `fatture-selectors.js` — helper selector per query fatture unificate
- **Create**: `fatture-migration.js` — logica migrazione legacy monthly → fattureEmesse
- **Create**: `test/fatture-selectors.test.js` — unit test selectors
- **Create**: `test/fatture-migration.test.js` — unit test migrazione
- **Modify**: `fatture-docs-feature.js` — estendi normalize, sposta pagMese/pagAnno su fattura, rimuovi upsert
- **Modify**: `app.js` — refactor `calcBolloPerQuarter`, `renderFatture` tabella mensile, dashboard totals, `getCrossYearInvoices`, budget calc, tasse accantonate, Impostazioni UI (devHardDelete)
- **Modify**: `tax-engine.js` — `buildForfettarioScenario` input via selector
- **Modify**: `fatture-storico.js` — badge "Legacy" + azione "Completa dati"
- **Modify**: `index.html` — pulsante "Importa da PDF" (stub) + checkbox debug
- **Modify**: `style.css` — badge legacy, banner warning hard-delete
- **Modify**: `test/run-tests.js` — registra nuovi test file
- **Modify**: `CLAUDE.md` — documentazione nuova architettura
- **Modify**: `MEMORY.md` — aggiorna project_d_audit_fatture_wizard

---

## Task 1: Selectors module scaffolding (TDD)

**Files:**
- Create: `fatture-selectors.js`
- Create: `test/fatture-selectors.test.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Scrivere test fallente per `FattureSelectors.all(profile)`**

File `test/fatture-selectors.test.js`:
```js
'use strict';

var storage = {};
global.localStorage = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global;
global.document = { getElementById: function() { return null; } };

// normalize stub (the real one lives in fatture-docs-feature.js; tests don't need it)
global.window.normalizeInvoice = function (x) { return x; };

require('../fatture-storico.js');  // needed for storage key helpers
require('../fatture-selectors.js');
var Sel = global.window.FattureSelectors;

function reset() { for (var k in storage) delete storage[k]; }
function seed(profile, arr) {
  storage['calcoliPIVA_' + profile + '_fattureEmesse'] = JSON.stringify(arr);
}

describe('FattureSelectors.all — carica fatture per profilo', function () {
  test('ritorna array vuoto se nessun dato', function () {
    reset();
    expect(Sel.all('Mattia')).toEqual([]);
  });

  test('ritorna tutte le fatture del profilo', function () {
    reset();
    seed('Mattia', [
      { id: 'a', stato: 'pagata', pagAnno: 2026, pagMese: 3 },
      { id: 'b', stato: 'bozza' }
    ]);
    var res = Sel.all('Mattia');
    expect(res.length).toBe(2);
  });
});
```

- [ ] **Step 2: Aggiungere test file a `test/run-tests.js`**

Modifica `test/run-tests.js` aggiungendo dopo `require('./fatture-storico.test.js');`:
```js
require('./fatture-selectors.test.js');
```

- [ ] **Step 3: Run test — deve fallire con "Cannot find module '../fatture-selectors.js'"**

Comando: `node test/run-tests.js`
Expected: FAIL

- [ ] **Step 4: Creare `fatture-selectors.js` con `all()`**

```js
/* Fatture selectors — single source of truth query helpers */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'calcoliPIVA_';
  var STORAGE_SUFFIX = '_fattureEmesse';

  function storageKey(profile) {
    if (!profile) throw new Error('FattureSelectors: profile richiesto');
    return STORAGE_PREFIX + profile + STORAGE_SUFFIX;
  }

  function all(profile) {
    try {
      var raw = localStorage.getItem(storageKey(profile));
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      var norm = typeof window.normalizeInvoice === 'function' ? window.normalizeInvoice : function (x) { return x; };
      return arr.map(norm);
    } catch (err) {
      console.warn('FattureSelectors.all: errore parse', err);
      return [];
    }
  }

  window.FattureSelectors = {
    all: all,
    storageKey: storageKey
  };
})();
```

- [ ] **Step 5: Run test — deve passare**

Comando: `node test/run-tests.js`
Expected: PASS (2 nuovi test verdi)

- [ ] **Step 6: Commit**

```bash
git add fatture-selectors.js test/fatture-selectors.test.js test/run-tests.js
git commit -m "feat(fatture): scaffold FattureSelectors.all con test"
```

---

## Task 2: Selector getImportoSigned + getNettoEffettivo

**Files:**
- Modify: `fatture-selectors.js`
- Modify: `test/fatture-selectors.test.js`

- [ ] **Step 1: Scrivere test per `getImportoSigned` e `getNettoEffettivo`**

Appendere a `test/fatture-selectors.test.js`:
```js
describe('FattureSelectors.getImportoSigned — segno per NC', function () {
  test('TD01 ritorna importo positivo', function () {
    var f = { tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 100 }] };
    expect(Sel.getImportoSigned(f)).toBe(100);
  });
  test('TD04 ritorna importo negativo', function () {
    var f = { tipoDocumento: 'TD04', righe: [{ quantita: 1, prezzoUnitario: 50 }] };
    expect(Sel.getImportoSigned(f)).toBe(-50);
  });
});

describe('FattureSelectors.getNettoEffettivo — importo meno NC collegate', function () {
  test('fattura senza NC ritorna importo pieno', function () {
    var f = { tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 200 }], ncTotaleImporto: 0 };
    expect(Sel.getNettoEffettivo(f)).toBe(200);
  });
  test('fattura con NC parziale sottrae ncTotaleImporto', function () {
    var f = { tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 200 }], ncTotaleImporto: 80 };
    expect(Sel.getNettoEffettivo(f)).toBe(120);
  });
});
```

- [ ] **Step 2: Run test — fallisce (getImportoSigned non esiste)**

Comando: `node test/run-tests.js`
Expected: FAIL

- [ ] **Step 3: Implementare in `fatture-selectors.js`**

Aggiungere prima di `window.FattureSelectors`:
```js
  function _calcImporto(fattura) {
    var righe = (fattura && fattura.righe) || [];
    var imp = 0;
    for (var i = 0; i < righe.length; i++) {
      imp += (Number(righe[i].quantita) || 0) * (Number(righe[i].prezzoUnitario) || 0);
    }
    return imp;
  }

  function getImportoSigned(fattura) {
    var imp = _calcImporto(fattura);
    return (fattura && fattura.tipoDocumento === 'TD04') ? -imp : imp;
  }

  function getNettoEffettivo(fattura) {
    var imp = _calcImporto(fattura);
    var nc = Number(fattura && fattura.ncTotaleImporto) || 0;
    return imp - nc;
  }
```

Ed esporre in `window.FattureSelectors`:
```js
  window.FattureSelectors = {
    all: all,
    storageKey: storageKey,
    getImportoSigned: getImportoSigned,
    getNettoEffettivo: getNettoEffettivo
  };
```

- [ ] **Step 4: Run test — deve passare**

Comando: `node test/run-tests.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add fatture-selectors.js test/fatture-selectors.test.js
git commit -m "feat(fatture): selector getImportoSigned + getNettoEffettivo"
```

---

## Task 3: Selector getByMonth (esclude bozza, usa pagMese/pagAnno)

**Files:**
- Modify: `fatture-selectors.js`
- Modify: `test/fatture-selectors.test.js`

- [ ] **Step 1: Scrivere test**

Appendere:
```js
describe('FattureSelectors.getByMonth — fatture con pagamento nel mese, escluse bozze', function () {
  test('esclude bozze', function () {
    reset();
    seed('Mattia', [
      { id: 'a', stato: 'bozza', pagAnno: 2026, pagMese: 3, tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 100 }] },
      { id: 'b', stato: 'inviata', pagAnno: 2026, pagMese: 3, tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 200 }] }
    ]);
    var res = Sel.getByMonth('Mattia', 2026, 3);
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('b');
  });

  test('include NC (TD04) nel mese', function () {
    reset();
    seed('Mattia', [
      { id: 'orig', stato: 'inviata', pagAnno: 2026, pagMese: 3, tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 200 }] },
      { id: 'nc', stato: 'inviata', pagAnno: 2026, pagMese: 3, tipoDocumento: 'TD04', righe: [{ quantita: 1, prezzoUnitario: 80 }] }
    ]);
    var res = Sel.getByMonth('Mattia', 2026, 3);
    expect(res.length).toBe(2);
  });

  test('filtra per pagAnno+pagMese, non per data emissione', function () {
    reset();
    seed('Mattia', [
      { id: 'a', stato: 'pagata', data: '2025-12-20', pagAnno: 2026, pagMese: 1, tipoDocumento: 'TD01', righe: [{ quantita: 1, prezzoUnitario: 300 }] }
    ]);
    expect(Sel.getByMonth('Mattia', 2026, 1).length).toBe(1);
    expect(Sel.getByMonth('Mattia', 2025, 12).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test — fallisce**

Comando: `node test/run-tests.js`
Expected: FAIL

- [ ] **Step 3: Implementare getByMonth**

Aggiungere a `fatture-selectors.js`:
```js
  function getByMonth(profile, year, month) {
    return all(profile).filter(function (f) {
      if (f.stato === 'bozza') return false;
      return Number(f.pagAnno) === Number(year) && Number(f.pagMese) === Number(month);
    });
  }
```

Esporre in `window.FattureSelectors.getByMonth = getByMonth;`.

- [ ] **Step 4: Run test — PASS**

Comando: `node test/run-tests.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add fatture-selectors.js test/fatture-selectors.test.js
git commit -m "feat(fatture): selector getByMonth (esclude bozze, include NC)"
```

---

## Task 4: Selector getByQuarter + getByPagAnno + getCrossYearPaidIn

**Files:**
- Modify: `fatture-selectors.js`
- Modify: `test/fatture-selectors.test.js`

- [ ] **Step 1: Scrivere test per tutti e tre**

Appendere:
```js
describe('FattureSelectors.getByQuarter', function () {
  test('trimestre 1 = mesi 1-2-3', function () {
    reset();
    seed('Mattia', [
      { id: 'a', stato: 'pagata', pagAnno: 2026, pagMese: 1, tipoDocumento: 'TD01', righe: [] },
      { id: 'b', stato: 'pagata', pagAnno: 2026, pagMese: 3, tipoDocumento: 'TD01', righe: [] },
      { id: 'c', stato: 'pagata', pagAnno: 2026, pagMese: 4, tipoDocumento: 'TD01', righe: [] }
    ]);
    expect(Sel.getByQuarter('Mattia', 2026, 1).length).toBe(2);
  });

  test('include stornate e NC', function () {
    reset();
    seed('Mattia', [
      { id: 'orig', stato: 'stornata', pagAnno: 2026, pagMese: 2, tipoDocumento: 'TD01', righe: [] },
      { id: 'nc', stato: 'inviata', pagAnno: 2026, pagMese: 2, tipoDocumento: 'TD04', righe: [] }
    ]);
    expect(Sel.getByQuarter('Mattia', 2026, 1).length).toBe(2);
  });
});

describe('FattureSelectors.getByPagAnno', function () {
  test('filtra solo per anno di pagamento', function () {
    reset();
    seed('Mattia', [
      { id: 'a', stato: 'pagata', pagAnno: 2026, pagMese: 1, tipoDocumento: 'TD01', righe: [] },
      { id: 'b', stato: 'pagata', pagAnno: 2025, pagMese: 12, tipoDocumento: 'TD01', righe: [] }
    ]);
    expect(Sel.getByPagAnno('Mattia', 2026).length).toBe(1);
  });
});

describe('FattureSelectors.getCrossYearPaidIn', function () {
  test('emesse in anno precedente ma pagate nel year', function () {
    reset();
    seed('Mattia', [
      { id: 'a', stato: 'pagata', data: '2025-11-10', pagAnno: 2026, pagMese: 1, tipoDocumento: 'TD01', righe: [] },
      { id: 'b', stato: 'pagata', data: '2026-01-05', pagAnno: 2026, pagMese: 2, tipoDocumento: 'TD01', righe: [] }
    ]);
    var res = Sel.getCrossYearPaidIn('Mattia', 2026);
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('a');
  });
});
```

- [ ] **Step 2: Run — FAIL**

Comando: `node test/run-tests.js`
Expected: FAIL

- [ ] **Step 3: Implementare**

Aggiungere a `fatture-selectors.js`:
```js
  function getByQuarter(profile, year, quarter) {
    var months = [quarter * 3 - 2, quarter * 3 - 1, quarter * 3];
    return all(profile).filter(function (f) {
      if (f.stato === 'bozza') return false;
      if (Number(f.pagAnno) !== Number(year)) return false;
      return months.indexOf(Number(f.pagMese)) !== -1;
    });
  }

  function getByPagAnno(profile, year) {
    return all(profile).filter(function (f) {
      if (f.stato === 'bozza') return false;
      return Number(f.pagAnno) === Number(year);
    });
  }

  function getCrossYearPaidIn(profile, year) {
    return all(profile).filter(function (f) {
      if (f.stato === 'bozza') return false;
      if (Number(f.pagAnno) !== Number(year)) return false;
      var dataAnno = Number(String(f.data || '').slice(0, 4));
      return dataAnno && dataAnno < Number(year);
    });
  }
```

Esporre tutti e tre in `window.FattureSelectors`.

- [ ] **Step 4: Run — PASS**

Comando: `node test/run-tests.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add fatture-selectors.js test/fatture-selectors.test.js
git commit -m "feat(fatture): selector getByQuarter/getByPagAnno/getCrossYearPaidIn"
```

---

## Task 5: Estendere schema fattura — pagMese/pagAnno + origine + pdfAllegato

**Files:**
- Modify: `fatture-docs-feature.js` (`normalizeFatturaEmessa`)

- [ ] **Step 1: Leggere `normalizeFatturaEmessa` per trovare la funzione esistente**

Comando: grep `normalizeFatturaEmessa` in `fatture-docs-feature.js` — la funzione è a `fatture-docs-feature.js:223`.

- [ ] **Step 2: Aggiungere campi nuovi al return di `normalizeFatturaEmessa`**

Nel return object di `normalizeFatturaEmessa`, aggiungere (o verificare presenti):
```js
    // Incasso (spostato da riga monthly a fattura)
    pagMese: (raw.pagMese != null && Number(raw.pagMese) >= 1 && Number(raw.pagMese) <= 12) ? Number(raw.pagMese) : null,
    pagAnno: Number.isFinite(Number(raw.pagAnno)) ? Number(raw.pagAnno) : null,

    // Origine (per tracciare import vs wizard vs legacy)
    origine: (['wizard', 'manuale', 'legacy-migrated', 'ocr-import'].indexOf(raw.origine) >= 0)
      ? raw.origine
      : 'wizard',

    // PDF allegato (predisposto per OCR)
    pdfAllegato: (raw.pdfAllegato && typeof raw.pdfAllegato.dataUrl === 'string')
      ? { name: String(raw.pdfAllegato.name || 'allegato.pdf'), dataUrl: raw.pdfAllegato.dataUrl }
      : null,

    // OCR stubs (non usati in questo spec, presenti per forward compat)
    _ocrRawText: raw._ocrRawText || null,
    _ocrConfidence: raw._ocrConfidence || null,
    _ocrFieldsExtracted: raw._ocrFieldsExtracted || null
```

- [ ] **Step 3: Ricaricare index.html nel browser, verificare nessun errore console**

Comando browser: F12 console. Verificare nessun `TypeError` sulle fatture esistenti.

- [ ] **Step 4: Commit**

```bash
git add fatture-docs-feature.js
git commit -m "feat(fatture): schema — pagMese/pagAnno su fattura, origine, pdfAllegato"
```

---

## Task 6: Migration module (legacy monthly → fattureEmesse)

**Files:**
- Create: `fatture-migration.js`
- Create: `test/fatture-migration.test.js`
- Modify: `test/run-tests.js`

- [ ] **Step 1: Scrivere test `migrateLegacyYear`**

File `test/fatture-migration.test.js`:
```js
'use strict';

var storage = {};
global.localStorage = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global;
global.document = { getElementById: function() { return null; } };
global.window.normalizeInvoice = function (x) { return x; };

require('../fatture-selectors.js');
require('../fatture-migration.js');
var Mig = global.window.FattureMigration;
var Sel = global.window.FattureSelectors;

function reset() { for (var k in storage) delete storage[k]; }

describe('FattureMigration.migrateLegacyYear', function () {
  test('promuove righe monthly senza invoiceId a fatture legacy-migrated', function () {
    reset();
    var year = 2026;
    var yearData = {
      fatture: {
        '3': [{ importo: 500, desc: 'Consulenza gennaio', pagMese: 3, pagAnno: 2026 }]
      }
    };
    var result = Mig.migrateLegacyYear('Mattia', year, yearData);
    expect(result.migrated).toBe(1);
    var fatture = Sel.all('Mattia');
    expect(fatture.length).toBe(1);
    expect(fatture[0].origine).toBe('legacy-migrated');
    expect(fatture[0].stato).toBe('pagata');
    expect(fatture[0].pagMese).toBe(3);
  });

  test('idempotente: seconda chiamata non duplica', function () {
    reset();
    var yearData = { fatture: { '3': [{ importo: 500, desc: 'x' }] } };
    Mig.migrateLegacyYear('Mattia', 2026, yearData);
    Mig.migrateLegacyYear('Mattia', 2026, yearData);
    expect(Sel.all('Mattia').length).toBe(1);
  });

  test('salta righe con invoiceId (già in fattureEmesse)', function () {
    reset();
    var yearData = {
      fatture: {
        '3': [{ importo: 500, invoiceId: 'fat_existing' }]
      }
    };
    var result = Mig.migrateLegacyYear('Mattia', 2026, yearData);
    expect(result.migrated).toBe(0);
    expect(Sel.all('Mattia').length).toBe(0);
  });
});
```

- [ ] **Step 2: Registrare test in `test/run-tests.js`**

Aggiungere:
```js
require('./fatture-migration.test.js');
```

- [ ] **Step 3: Run — FAIL**

Comando: `node test/run-tests.js`
Expected: FAIL

- [ ] **Step 4: Implementare `fatture-migration.js`**

```js
/* Fatture migration — legacy monthly rows → fattureEmesse */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'calcoliPIVA_';
  var STORAGE_SUFFIX = '_fattureEmesse';

  function storageKey(profile) {
    return STORAGE_PREFIX + profile + STORAGE_SUFFIX;
  }

  function loadFattureEmesse(profile) {
    try {
      var raw = localStorage.getItem(storageKey(profile));
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function saveFattureEmesse(profile, arr) {
    localStorage.setItem(storageKey(profile), JSON.stringify(arr));
  }

  function makeLegacyId(year, month, idx, importoCents) {
    return 'legacy_' + year + '_' + month + '_' + idx + '_' + importoCents;
  }

  function migrateLegacyYear(profile, year, yearData) {
    if (!profile || !yearData || !yearData.fatture) return { migrated: 0 };
    var existing = loadFattureEmesse(profile);
    var existingIds = {};
    for (var i = 0; i < existing.length; i++) existingIds[existing[i].id] = true;

    var migrated = 0;
    for (var m = 1; m <= 12; m++) {
      var rows = yearData.fatture[String(m)] || yearData.fatture[m] || [];
      if (!Array.isArray(rows)) continue;
      for (var idx = 0; idx < rows.length; idx++) {
        var r = rows[idx];
        if (r && r.invoiceId) continue;  // già linked
        var importo = Number(r && r.importo) || 0;
        if (importo === 0) continue;     // riga vuota, skip
        var importoCents = Math.round(importo * 100);
        var id = makeLegacyId(year, m, idx, importoCents);
        if (existingIds[id]) continue;   // già migrata

        existing.push({
          id: id,
          numero: '\u2014',
          data: year + '-' + String(m).padStart(2, '0') + '-01',
          anno: year,
          annoProgressivo: year,
          progressivo: 0,
          righe: [{ descrizione: (r.desc || 'Incasso'), quantita: 1, prezzoUnitario: importo }],
          clienteSnapshot: null,
          stato: 'pagata',
          tipoDocumento: 'TD01',
          pagMese: (r.pagMese ? Number(r.pagMese) : m),
          pagAnno: (r.pagAnno ? Number(r.pagAnno) : year),
          dataInvioSdi: null,
          dataPagamento: year + '-' + String(m).padStart(2, '0') + '-01',
          origine: 'legacy-migrated',
          ritenuta: 0,
          contributoIntegrativo: 0,
          marcaDaBollo: false,
          fatturaOriginaleId: null,
          ncIds: [],
          ncTotaleImporto: 0
        });
        existingIds[id] = true;
        migrated++;
      }
    }

    if (migrated > 0) saveFattureEmesse(profile, existing);
    return { migrated: migrated };
  }

  window.FattureMigration = {
    migrateLegacyYear: migrateLegacyYear
  };
})();
```

- [ ] **Step 5: Run — PASS**

Comando: `node test/run-tests.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add fatture-migration.js test/fatture-migration.test.js test/run-tests.js
git commit -m "feat(fatture): modulo migrazione legacy monthly → fattureEmesse"
```

---

## Task 7: Trigger migrazione al load tab Fatture

**Files:**
- Modify: `app.js` (switchToTab o initFatture)
- Modify: `index.html` (aggiungere `<script src="fatture-migration.js"></script>` e `<script src="fatture-selectors.js"></script>` prima di `fatture-docs-feature.js`)

- [ ] **Step 1: Aggiungere script tag in `index.html`**

Cerca `<script src="fatture-storico.js"></script>` in `index.html` e aggiungi prima:
```html
<script src="fatture-selectors.js"></script>
<script src="fatture-migration.js"></script>
```

- [ ] **Step 2: Trigger migrazione quando si apre il tab Fatture**

Cerca in `app.js` la funzione `switchToTab` (o equivalente hook attivazione tab Fatture). Aggiungere prima del render Fatture:
```js
    // Migrazione legacy one-shot per-anno
    if (window.FattureMigration && typeof window.FattureMigration.migrateLegacyYear === 'function') {
      try {
        var profile = currentProfile;
        for (var y = 2020; y <= new Date().getFullYear() + 1; y++) {
          var yd = getYearData(y);  // usa funzione esistente o equivalente
          if (yd && yd.fatture && !yd._fattureMigratedAt) {
            var res = window.FattureMigration.migrateLegacyYear(profile, y, yd);
            if (res.migrated > 0) console.log('[migration] anno', y, 'migrate', res.migrated, 'righe');
            yd._fattureMigratedAt = new Date().toISOString();
            saveYearData(y, yd);  // usa funzione esistente
          }
        }
      } catch (err) { console.warn('migration error', err); }
    }
```

Adatta `getYearData`/`saveYearData` ai nomi effettivi (leggi `app.js` per i veri helper).

- [ ] **Step 3: Smoke test browser**

1. Apri app, login Mattia.
2. Console: `localStorage.getItem('calcoliPIVA_Mattia_2026_data')` → verifica che ci sia `_fattureMigratedAt`
3. Console: `window.FattureSelectors.all('Mattia').length` → deve essere ≥ quelle pre-migrazione

- [ ] **Step 4: Commit**

```bash
git add app.js index.html
git commit -m "feat(fatture): trigger migrazione legacy al load tab Fatture"
```

---

## Task 8: Refactor `calcBolloPerQuarter` a usare `getByQuarter`

**Files:**
- Modify: `app.js:502` (`calcBolloPerQuarter`)

- [ ] **Step 1: Leggere `calcBolloPerQuarter` attuale**

Grep `function calcBolloPerQuarter` in `app.js`. Annotare la logica esistente (legge `data.fatture[M]` per mesi del trimestre, somma `importo`).

- [ ] **Step 2: Sostituire body**

```js
function calcBolloPerQuarter(year, quarter) {
  var profile = currentProfile;
  if (!profile || !window.FattureSelectors) return { imponibile: 0, dovuto: false };
  var fatture = window.FattureSelectors.getByQuarter(profile, year, quarter);
  var imponibile = 0;
  for (var i = 0; i < fatture.length; i++) {
    imponibile += window.FattureSelectors.getImportoSigned(fatture[i]);
  }
  return { imponibile: imponibile, dovuto: imponibile > 77.47 };
}
```

Se la firma attuale è diversa, adattare ma mantenere il contratto.

- [ ] **Step 3: Smoke test browser**

1. Crea 2 fatture nel Q1 2026 da 50€ ciascuna → imponibile 100€, bollo dovuto.
2. Crea NC totale su una → imponibile 50€, bollo dovuto.
3. NC parziale 30€ → imponibile 70€, bollo NON dovuto (sotto 77,47).

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "refactor(fatture): calcBolloPerQuarter usa FattureSelectors (include NC)"
```

---

## Task 9: Refactor tabella mensile "Tassato nel" — `renderFatture`

**Files:**
- Modify: `app.js` `renderFatture`
- Modify: `style.css` (classe `.fatture-row-nc` per render negativo in rosso)

- [ ] **Step 1: Individuare `renderFatture` in `app.js`**

Grep `function renderFatture`. Attuale: itera `data.fatture[month]` per ogni mese, renderizza righe.

- [ ] **Step 2: Sostituire fonte dati con selector**

Per ogni mese `M`:
```js
  var fatture = window.FattureSelectors.getByMonth(currentProfile, currentYear, M);
  fatture.forEach(function (f) {
    var importoSigned = window.FattureSelectors.getImportoSigned(f);
    var isNC = f.tipoDocumento === 'TD04';
    var isStornata = f.stato === 'stornata';
    var netto = isStornata ? window.FattureSelectors.getNettoEffettivo(f) : importoSigned;
    // render riga con class 'fatture-row-nc' se isNC, 'fatture-row-stornata' se stornata
    // importo = fmt(importoSigned) — il segno nel fmt già appare
    // colonna secondaria "netto" se stornata o ha ncTotaleImporto > 0
  });
```

Rimuovere uso diretto `data.fatture[month]` nel render.

- [ ] **Step 3: Aggiungere CSS**

In `style.css`:
```css
.fatture-row-nc { color: var(--color-error); }
.fatture-row-nc .fatture-row-amount::before { content: '− '; }
.fatture-row-stornata { opacity: .6; text-decoration: line-through; }
.fatture-row-stornata-netto { color: var(--color-text-muted); font-size: 11px; }
```

- [ ] **Step 4: Smoke test**

1. Crea fattura 200€ (inviata) mese 3 → riga verde normale.
2. Crea NC parziale 50€ → riga rossa "− 50,00 €" nello stesso mese.
3. Crea NC totale 200€ → originale diventa stornata → riga originale barrata + riga NC rossa.

- [ ] **Step 5: Commit**

```bash
git add app.js style.css
git commit -m "refactor(fatture): tabella mensile usa selector + render NC negative"
```

---

## Task 10: Rimuovere `upsertInvoiceRowInYearData` — pagMese/pagAnno solo su fattura

**Files:**
- Modify: `fatture-docs-feature.js` (`saveFatturaDraft`)

- [ ] **Step 1: Individuare `upsertInvoiceRowInYearData` chiamate**

Grep `upsertInvoiceRowInYearData` in `fatture-docs-feature.js`.

- [ ] **Step 2: Sostituire comportamento**

In `saveFatturaDraft`, invece di chiamare `upsertInvoiceRowInYearData`, assicurarsi che la fattura stessa contenga `pagMese`/`pagAnno`:
- Se stato=`inviata`: `pagMese = stimaMeseFromGiorniIncasso(data, settings.giorniIncasso)`, `pagAnno` di conseguenza.
- Se stato=`pagata`: `pagMese = month(dataPagamento)`, `pagAnno = year(dataPagamento)`.
- Se stato=`bozza`: `pagMese = null`, `pagAnno = null`.
- Se TD04: `pagMese` = pagamento NC se esiste, altrimenti stimato dalla data NC.

Helper `stimaMeseFromGiorniIncasso` (se non esiste):
```js
function stimaMeseFromGiorniIncasso(isoDate, giorniIncasso) {
  var d = new Date(isoDate);
  d.setDate(d.getDate() + (Number(giorniIncasso) || 30));
  return { mese: d.getMonth() + 1, anno: d.getFullYear() };
}
```

Rimuovere TUTTE le chiamate a `upsertInvoiceRowInYearData` e il codice che scrive in `data.fatture[M]`.

- [ ] **Step 3: Smoke test**

1. Crea bozza → NON compare in tabella mensile. ✓
2. Promuovi a inviata (Salva) → compare nel mese stimato. ✓
3. Segna pagata con data odierna → si sposta al mese odierno se diverso. ✓

- [ ] **Step 4: Commit**

```bash
git add fatture-docs-feature.js
git commit -m "refactor(fatture): rimuovi upsertInvoiceRowInYearData — pagMese/pagAnno su fattura"
```

---

## Task 11: Refactor dashboard totals, getCrossYearInvoices, budget, tasse accantonate

**Files:**
- Modify: `app.js` (più funzioni)

- [ ] **Step 1: Grep tutti gli accessi a `data.fatture`**

Grep `data\.fatture\[` e `yearData\.fatture\[` in `app.js`. Annotare ogni occorrenza in una lista.

- [ ] **Step 2: Per ogni occorrenza, sostituire con selector**

Mappatura:
- Iterazione mese per mese nell'anno corrente → `getByPagAnno(profile, year)` poi groupBy mese.
- `getCrossYearInvoices(year)` → `getCrossYearPaidIn(profile, year)`.
- Totale anno (budget, tasse accantonate) → `getByPagAnno(profile, year)` poi `reduce(sum importo)`.

Per ogni funzione modificata, eseguire manualmente in console per verificare output identico pre/post (usare dati esistenti come oracle).

- [ ] **Step 3: Smoke test cross-feature**

1. Dashboard: totale annuo matcha tabella Fatture mensile.
2. Scadenziario storico 2025: usa correttamente fatture pagAnno=2025.
3. Budget: ricalcolo corretto.
4. Tasse accantonate: cumulativo corretto.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "refactor(fatture): dashboard/cross-year/budget/tasse usano selector"
```

---

## Task 12: Refactor `buildForfettarioScenario` input

**Files:**
- Modify: `tax-engine.js` (`buildForfettarioScenario` e helper input)
- Modify: `app.js` (chiamanti di `buildForfettarioScenario`)

- [ ] **Step 1: Identificare come `buildForfettarioScenario` riceve i ricavi**

Leggi `tax-engine.js` — cerca la funzione. Probabilmente accetta un `yearData` o un array di `{ mese, importo }`.

- [ ] **Step 2: Mantenere la firma ma aggiornare il builder che la chiama**

In `app.js`, il builder che prepara l'input per `buildForfettarioScenario` (cerca chiamante) deve ora usare:
```js
var fatture = window.FattureSelectors.getByPagAnno(currentProfile, year);
var ricaviPerMese = {};
fatture.forEach(function (f) {
  var m = f.pagMese;
  if (!m) return;
  var imp = window.FattureSelectors.getImportoSigned(f);  // NC negative
  // se stornata parziale: usa netto effettivo
  if (f.stato === 'stornata') imp = window.FattureSelectors.getNettoEffettivo(f);
  ricaviPerMese[m] = (ricaviPerMese[m] || 0) + imp;
});
// poi passare ricaviPerMese al builder come prima riceveva data.fatture
```

Se `tax-engine.js` accetta direttamente `data.fatture`, convertire `ricaviPerMese` in struttura equivalente.

- [ ] **Step 3: Smoke test**

1. Apri Regime forfettario → totale ricavi matcha somma fatture pagAnno.
2. Scadenziario anni precedenti usa saldo storico corretto.
3. NC correttamente sottratte dal totale.

- [ ] **Step 4: Commit**

```bash
git add app.js tax-engine.js
git commit -m "refactor(fatture): forfettario engine input via selector"
```

---

## Task 13: Hard-delete dev toggle in Impostazioni

**Files:**
- Modify: `app.js` (render Impostazioni + logica toggle)
- Modify: `index.html` (checkbox)
- Modify: `style.css` (banner warning)
- Modify: `fatture-docs-feature.js` (pulsante hard-delete in view-mode)
- Modify: `fatture-storico.js` (pulsante in archivio)

- [ ] **Step 1: Checkbox in Impostazioni**

In `index.html` tab Impostazioni (sezione Debug, crearla se non esiste):
```html
<section class="settings-section">
  <h3>Debug / Test</h3>
  <label class="settings-row">
    <input type="checkbox" id="settingDevHardDelete">
    <span>Hard-delete fatture (solo test) — bypassa workflow fiscale</span>
  </label>
  <p class="settings-hint">Disattivare prima del rilascio.</p>
</section>
```

In `app.js` `renderImpostazioni` (o equivalente): bind su `settings.devHardDelete`, toggle `saveSetting('devHardDelete', val ? 1 : 0)`.

- [ ] **Step 2: Banner warning in tab Fatture**

In `app.js` `renderFatture`, all'inizio:
```js
if (getCurrentSettings().devHardDelete) {
  var banner = document.createElement('div');
  banner.className = 'fatture-banner-warning';
  banner.textContent = '\u26A0 Hard-delete attivo — modalità test';
  container.prepend(banner);
}
```

CSS `style.css`:
```css
.fatture-banner-warning {
  background: var(--color-warning);
  color: #000;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-weight: 600;
  margin-bottom: var(--space-3);
}
```

- [ ] **Step 3: Funzione `hardDeleteFattura(id)`**

In `fatture-docs-feature.js`:
```js
function hardDeleteFattura(id) {
  if (!getCurrentSettings().devHardDelete) return;
  showAppConfirm('Eliminare definitivamente? Bypassa il workflow fiscale.', function () {
    var profile = currentProfile;
    var all = FattureStorico.load(profile);
    var target = all.find(function (f) { return f.id === id; });
    var next = all.filter(function (f) { return f.id !== id; });

    // Se è una NC, aggiorna originale
    if (target && target.tipoDocumento === 'TD04' && target.fatturaOriginaleId) {
      var orig = next.find(function (f) { return f.id === target.fatturaOriginaleId; });
      if (orig) {
        orig.ncIds = (orig.ncIds || []).filter(function (x) { return x !== id; });
        orig.ncTotaleImporto = Math.max(0, (orig.ncTotaleImporto || 0) - Math.abs(window.FattureSelectors.getImportoSigned(target)));
        if (orig.ncTotaleImporto === 0 && orig.stato === 'stornata') {
          orig.stato = orig.dataPagamento ? 'pagata' : 'inviata';
        }
      }
    }
    FattureStorico.save(profile, next);
    console.warn('[hard-delete]', id, target);
    recalcAll();
  });
}
window.hardDeleteFattura = hardDeleteFattura;
```

- [ ] **Step 4: Pulsante hard-delete in view-mode e archivio**

In `fatture-docs-feature.js` `renderFatturaViewMode`: se `devHardDelete`, aggiungere bottone:
```js
if (getCurrentSettings().devHardDelete) {
  actions.innerHTML += '<button type="button" class="btn-danger" onclick="hardDeleteFattura(\'' + f.id + '\')">🗑 Hard delete</button>';
}
```

In `fatture-storico.js` `_buildActions`: stesso pulsante condizionato.

- [ ] **Step 5: Smoke test**

1. Impostazioni → attiva checkbox → banner appare in tab Fatture.
2. View una fattura pagata → bottone "🗑 Hard delete" visibile.
3. Click → conferma → fattura sparisce.
4. Disattiva checkbox → banner e bottone spariscono.

- [ ] **Step 6: Commit**

```bash
git add app.js index.html style.css fatture-docs-feature.js fatture-storico.js
git commit -m "feat(fatture): hard-delete dev toggle con banner warning"
```

---

## Task 14: Legacy badge + "Completa dati" in archivio

**Files:**
- Modify: `fatture-storico.js` (`_buildRow`, `_buildActions`)
- Modify: `style.css` (`.badge-origine-legacy`)

- [ ] **Step 1: Badge "Legacy" in tabella archivio**

In `fatture-storico.js` `_buildRow`, modificare la cella "Numero" per aggiungere badge se `f.origine === 'legacy-migrated'`:
```js
if (f.origine === 'legacy-migrated') {
  var badge = document.createElement('span');
  badge.className = 'badge-origine-legacy';
  badge.textContent = 'Legacy';
  cells[0] = ''; // svuota testo numero
  // oppure concatena: td0.appendChild(badge);
}
```

- [ ] **Step 2: Azione "Completa dati"**

In `_buildActions`, se `f.origine === 'legacy-migrated'`:
```js
btns.push(mk('Completa dati', function () {
  window.openFatturaModal && window.openFatturaModal(f.id);
}));
```

Nel wizard modal, quando si apre una fattura `legacy-migrated`, pre-compilare con i dati minimi esistenti e permettere editing completo. Quando si salva con cliente + numero validi, settare `origine='manuale'`.

- [ ] **Step 3: CSS**

```css
.badge-origine-legacy {
  background: var(--color-surface-3);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  font-size: 10px;
  letter-spacing: .04em;
  text-transform: uppercase;
}
```

- [ ] **Step 4: Smoke test**

1. Archivio: righe migrate mostrano badge "Legacy".
2. Click "Completa dati" → wizard si apre con dati pre-compilati.
3. Salva con cliente + numero reali → badge sparisce (origine='manuale').

- [ ] **Step 5: Commit**

```bash
git add fatture-storico.js style.css fatture-docs-feature.js
git commit -m "feat(fatture): badge Legacy + azione Completa dati in archivio"
```

---

## Task 15: OCR stub — pulsante "Importa da PDF"

**Files:**
- Modify: `app.js` (tab Fatture header)
- Modify: `fatture-docs-feature.js` (handler upload)
- Modify: `index.html` (input file hidden)

- [ ] **Step 1: Pulsante nel tab Fatture**

In `app.js` `renderFatture` o dove vivono i bottoni "Nuova fattura":
```js
var btnImport = document.createElement('button');
btnImport.type = 'button';
btnImport.className = 'btn-ghost';
btnImport.textContent = '📄 Importa da PDF';
btnImport.addEventListener('click', function () {
  document.getElementById('inputImportPdf').click();
});
container.appendChild(btnImport);
```

- [ ] **Step 2: Input hidden + handler**

In `index.html` (fuori dal tab, body end):
```html
<input type="file" id="inputImportPdf" accept=".pdf" style="display:none">
```

In `fatture-docs-feature.js`:
```js
document.addEventListener('DOMContentLoaded', function () {
  var input = document.getElementById('inputImportPdf');
  if (!input) return;
  input.addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var dataUrl = ev.target.result;
      // Per ora: apri wizard con pdfAllegato pre-compilato, campi vuoti
      openFatturaModal(null, {
        pdfAllegato: { name: file.name, dataUrl: dataUrl },
        origine: 'ocr-import'
      });
      showToast('Funzione OCR in arrivo — compila manualmente per ora');
    };
    reader.readAsDataURL(file);
    input.value = '';  // reset per riselezione
  });
});
```

- [ ] **Step 3: Stub `window.FattureOCR`**

In un nuovo file `fatture-ocr.js` (stub):
```js
/* Fatture OCR — stub, implementazione differita */
(function () {
  'use strict';
  window.FattureOCR = {
    extractFromPdf: function (/*file*/) {
      return Promise.reject(new Error('FattureOCR: non ancora implementato'));
    },
    proposeInvoiceFromOcr: function (/*ocrResult*/) {
      return null;
    }
  };
})();
```

Aggiungere script tag in `index.html`.

- [ ] **Step 4: Smoke test**

1. Tab Fatture → bottone "📄 Importa da PDF" visibile.
2. Click → dialog file system → seleziona PDF.
3. Wizard si apre con `pdfAllegato` salvato, campi vuoti. Toast "Funzione OCR in arrivo".
4. Compila a mano + salva → fattura salvata con `origine='ocr-import'` e PDF allegato.

- [ ] **Step 5: Commit**

```bash
git add app.js fatture-docs-feature.js fatture-ocr.js index.html
git commit -m "feat(fatture): stub Importa da PDF + predisposizione OCR"
```

---

## Task 16: Aggiornare CLAUDE.md + memory

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/projects/.../memory/project_d_audit_fatture_wizard.md`
- Create: `.claude/projects/.../memory/project_fatture_ocr_import.md`

- [ ] **Step 1: CLAUDE.md — sezione "Fatture: single source of truth"**

Sostituire la sezione "Storico fatture e numerazione (sub-project 3)" aggiornandola con:
- `fattureEmesse` è fonte di verità unica
- Tutti i selector in `FattureSelectors`
- Migrazione automatica via `FattureMigration`
- Campi nuovi: `origine`, `pagMese`/`pagAnno`, `pdfAllegato`, `devHardDelete`
- `data.fatture[M]` deprecato (backup read-only)

- [ ] **Step 2: Aggiornare memoria progetto**

`project_d_audit_fatture_wizard.md`: segnare workflow + unificazione store come **completato** con riferimento a questo plan.

Creare `project_fatture_ocr_import.md`:
```markdown
---
name: Fatture OCR import PDF
description: Sub-progetto post-audit UI — OCR client-side con Tesseract.js per import fatture legacy da PDF
type: project
---

**Stato**: Stub predisposto 2026-04-20. Sviluppo differito a dopo audit UI tab-per-tab.

**Hook già presenti**:
- Pulsante "📄 Importa da PDF" nel tab Fatture
- Schema `pdfAllegato: { name, dataUrl }` in fattura
- `origine: 'ocr-import'` marker
- `window.FattureOCR` stub con API `extractFromPdf`, `proposeInvoiceFromOcr`

**Tech target**: Tesseract.js (client-side, offline, no API key).

**Flusso target**:
1. Upload PDF → Tesseract.js estrae testo
2. Regex/parser propone campi (numero, data, cliente, importo)
3. Wizard pre-compilato, utente verifica/corregge
4. PDF allegato per referenza

**Ref**: spec `docs/superpowers/specs/2026-04-20-fatture-workflow-redesign.md` sezione 10.
```

Aggiungere riga in `MEMORY.md`:
```
- [Fatture OCR import PDF](project_fatture_ocr_import.md) — Backlog: Tesseract.js client-side per import fatture legacy, stub predisposto
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: aggiorna CLAUDE.md — fatture single source of truth + OCR stub"
```

(Il commit memoria avviene fuori repo, nel tuo `.claude`.)

---

## Task 17: Final smoke test + cleanup

- [ ] **Step 1: Run full test suite**

Comando: `node test/run-tests.js`
Expected: PASS tutti i test (nuovi + esistenti).

- [ ] **Step 2: Smoke manuale end-to-end**

1. Login Mattia → verifica migrazione (console log).
2. Tab Fatture → verifica totali identici a prima.
3. Nuova fattura → bozza (no in tabella) → Salva (inviata, in tabella) → Segna pagata (data aggiornata).
4. Crea NC parziale → riga rossa negativa in tabella mese.
5. Crea NC totale → originale stornata, pill rosso.
6. Bollo trimestrale: controlla che imponibile scenda con NC.
7. Dashboard/scadenziario/budget/tasse accantonate: totali consistent.
8. Hard-delete ON → elimina una fattura → ricalcolo OK.
9. Importa PDF → wizard con allegato → salva → compare in archivio con origine ocr-import.
10. Archivio legacy → bottone "Completa dati" → wizard apre → salva → origine diventa manuale.

- [ ] **Step 3: Cleanup codice morto**

- Rimuovere `upsertInvoiceRowInYearData` e helper correlati.
- Rimuovere `_legacyRenderFatturaModalDISABLED` se non più referenziata.
- Verificare che `data.fatture[M]` sia letto solo dal modulo migration.

- [ ] **Step 4: Commit finale**

```bash
git add -A
git commit -m "chore(fatture): cleanup codice morto post-unificazione"
```

- [ ] **Step 5: Push**

```bash
git push origin codex/dev-newfeatures
```
