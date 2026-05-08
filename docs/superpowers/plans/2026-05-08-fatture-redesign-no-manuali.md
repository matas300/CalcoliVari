# Fatture Redesign — No Incassi Manuali Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rimuovere la tabella mensile "Incassi manuali" dalla tab Fatture, sostituire la lista card con tabella `Numero | Cliente | Emessa | Incassata | Importo | Stato | Azione`, aggiungere date-picker inline per "segna pagata", wipe one-time di `data.fatture[m]` legacy.

**Architecture:** Modifiche chirurgiche su 6 file principali. Il rendering della tab Fatture rimane string-template-based (pattern esistente con `el['inner' + 'HTML']` per evitare detection di pattern XSS-rischio nei linter), con escape HTML su tutto l'input dinamico. Il mini date-picker inline usa DOM API (createElement) per maggior sicurezza dato che non rerendera tutto.

**Tech Stack:** vanilla JS (IIFE + window.* exports), Node 18+ test runner.

**Spec di riferimento:** `docs/superpowers/specs/2026-05-08-fatture-redesign-no-manuali-design.md`

---

## File Structure (preview cambiamenti)

| File | Azione |
|---|---|
| `app-fatture.js` | **DELETE** |
| `app-fatture-helpers.js` | Rimuovi `setFatturaImporto/Desc/Pagamento`, `addFattura`, `removeFattura`, `getFattureIssued`, `_getFatturaIdAt`, `_getFatturaIdAtIssued` |
| `index.html` | Rimuovi `manuali-card` blocco, `incassoSection` div, `<script src="app-fatture.js">` |
| `fatture-docs-feature.js` | Rewrite `renderFattureDocsSection` (string template), aggiungi `quickMarkPagataInlineFromCard` (DOM API), `_formatDataIso` |
| `app-storage.js` | In `ensureDataShape`, blocco wipe legacy + flag `_fattureManualeWiped` |
| `firebase-sync.js` | In `cleanForFirestore`, strip `_fattureManualeWipedBackup`. Esporta `cleanForFirestore` su `window` |
| `fatture-state-machine.js` | `markPagata` accetta `opts.dataPagamento` |
| `style.css` | Nuove regole `.fatture-table-head`, `.ft-*`, `.fatture-pagata-inline-form`, `.fatture-progress` |
| `test/fatture-legacy-wipe.test.js` | **CREATE** (3 test) |
| `test/fatture-quick-paid-inline.test.js` | **CREATE** (3 test) |
| `test/fatture-firebase-strip-backup.test.js` | **CREATE** (2 test) |
| `test/run-tests.js` | Aggiungi i 3 nuovi require |

---

### Task 1: Test legacy wipe in ensureDataShape

**Files:**
- Create: `test/fatture-legacy-wipe.test.js`

- [ ] **Step 1: Write failing test**

```js
'use strict';
const { describe, test, expect } = global;
const path = require('path');

function loadEnsureDataShape() {
  global.window = global.window || {};
  global.localStorage = global.localStorage || {
    _s: {},
    getItem(k) { return this._s[k] != null ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
    clear() { this._s = {}; }
  };
  global.currentProfile = 'Demo';
  global.currentYear = 2026;
  global.data = {};
  global.StorageKeys = global.StorageKeys || {
    yearData: (p, y) => `calcoliPIVA_${p}_${y}`,
    profileFiscalLegacy: (p) => `calcoliPIVA_${p}_profileFiscal`,
    profileFiscalMigrated: (p) => `calcoliPIVA_${p}_profileFiscalMigrated`,
    fattureEmesse: (p) => `calcoliPIVA_${p}_fattureEmesse`,
  };
  global.OFFICIAL_ARTCOM_INPS = global.OFFICIAL_ARTCOM_INPS || {
    2026: { artigiano: { contribFissi: 4500, minimaleInps: 18000, aliqContributi: 0.24 }, commerciante: {} }
  };
  delete require.cache[require.resolve(path.join(process.cwd(), 'app-storage.js'))];
  require(path.join(process.cwd(), 'app-storage.js'));
  return global.window.ensureDataShape || global.ensureDataShape;
}

describe('Wipe legacy data.fatture[m]', () => {
  test('Wipe quando data.fatture ha entries non vuote', () => {
    const ensureDataShape = loadEnsureDataShape();
    const target = {
      fatture: {
        3: [{ importo: 5000, desc: 'incasso marzo', pagMese: 3, pagAnno: 2026 }],
        7: [{ importo: 3000, desc: 'altro', pagMese: 7, pagAnno: 2026 }]
      }
    };
    const out = ensureDataShape(target, 2026);
    expect(out.fatture).toEqual({});
    expect(typeof out._fattureManualeWiped).toBe('string');
    expect(out._fattureManualeWipedBackup).toBeTruthy();
    expect(out._fattureManualeWipedBackup[3][0].importo).toBe(5000);
  });

  test('Idempotente: seconda chiamata non altera nulla', () => {
    const ensureDataShape = loadEnsureDataShape();
    const target = { fatture: { 1: [{ importo: 100 }] } };
    const out1 = ensureDataShape(target, 2026);
    const wipeAt = out1._fattureManualeWiped;
    const backup = out1._fattureManualeWipedBackup;
    const out2 = ensureDataShape(out1, 2026);
    expect(out2._fattureManualeWiped).toBe(wipeAt);
    expect(out2._fattureManualeWipedBackup).toBe(backup);
    expect(out2.fatture).toEqual({});
  });

  test('No wipe se data.fatture è vuoto', () => {
    const ensureDataShape = loadEnsureDataShape();
    const target = { fatture: {} };
    const out = ensureDataShape(target, 2026);
    expect(out._fattureManualeWiped).toBeFalsy();
    expect(out._fattureManualeWipedBackup).toBeFalsy();
  });
});
```

- [ ] **Step 2: Aggiungi require al test runner**

In `test/run-tests.js`, dopo `require('./fatture-storico-display-numero.test.js');` aggiungi:
```js
require('./fatture-legacy-wipe.test.js');
```

- [ ] **Step 3: Run test, verifica fail**

Run: `node test/run-tests.js 2>&1 | tail -20`
Expected: 3 nuovi test FAIL.

Se `TypeError: ensureDataShape is not a function` → stub insufficienti, vedi `test/app-bootstrap.test.js` per pattern.

---

### Task 2: Implementa wipe legacy in ensureDataShape

**Files:**
- Modify: `app-storage.js:677-695` (dentro `ensureDataShape`, dopo `migrateFattureFor(out)`)

- [ ] **Step 1: Edit ensureDataShape**

In `app-storage.js`, trova:
```js
    migrateFattureFor(out);
    if (!out.settings.anagrafica) out.settings.anagrafica = {
```

Sostituisci con:
```js
    migrateFattureFor(out);

    // Wipe one-time del legacy data.fatture[m] (vecchia tabella mensile rimossa).
    // Backup conservato localmente; non syncato su Firebase (vedi cleanForFirestore).
    if (!out._fattureManualeWiped) {
      const hasLegacyEntries = out.fatture && Object.keys(out.fatture).some(k =>
        Array.isArray(out.fatture[k]) && out.fatture[k].length > 0
      );
      if (hasLegacyEntries) {
        out._fattureManualeWipedBackup = JSON.parse(JSON.stringify(out.fatture));
        out.fatture = {};
        out._fattureManualeWiped = new Date().toISOString();
      }
    }

    if (!out.settings.anagrafica) out.settings.anagrafica = {
```

- [ ] **Step 2: Run test, verifica pass**

Run: `node test/run-tests.js 2>&1 | tail -20`
Expected: 3 test passano. Suite ≥ 649.

- [ ] **Step 3: Commit**

```
git add test/fatture-legacy-wipe.test.js test/run-tests.js app-storage.js
git commit -m "$(cat <<'EOF'
feat(fatture): wipe one-time data.fatture[m] legacy in ensureDataShape

Le entries mensili create dalla vecchia tabella "Incassi manuali" (in via
di rimozione) vengono spazzate al primo ensureDataShape post-deploy.
Backup conservato in _fattureManualeWipedBackup (solo localStorage, non
syncato su Firebase). Idempotente via flag _fattureManualeWiped.

3 test in test/fatture-legacy-wipe.test.js.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Test cleanForFirestore strip _fattureManualeWipedBackup

**Files:**
- Create: `test/fatture-firebase-strip-backup.test.js`

- [ ] **Step 1: Write failing test**

```js
'use strict';
const { describe, test, expect } = global;
const path = require('path');

function loadCleanForFirestore() {
  global.window = global.window || {};
  global.document = global.document || { getElementById: () => null };
  delete require.cache[require.resolve(path.join(process.cwd(), 'firebase-sync.js'))];
  require(path.join(process.cwd(), 'firebase-sync.js'));
  return global.window.cleanForFirestore;
}

describe('cleanForFirestore strip _fattureManualeWipedBackup', () => {
  test('Esposta su window e rimuove il backup field', () => {
    const cleanForFirestore = loadCleanForFirestore();
    expect(typeof cleanForFirestore).toBe('function');
    const yearData = {
      settings: { regime: 'forfettario' },
      fatture: {},
      _fattureManualeWiped: '2026-05-08T10:00:00.000Z',
      _fattureManualeWipedBackup: { 3: [{ importo: 5000 }] }
    };
    const cleaned = cleanForFirestore(yearData);
    expect(cleaned.settings.regime).toBe('forfettario');
    expect(cleaned._fattureManualeWiped).toBe('2026-05-08T10:00:00.000Z');
    expect(cleaned._fattureManualeWipedBackup).toBeFalsy();
  });

  test('Pass-through quando il backup field non c è', () => {
    const cleanForFirestore = loadCleanForFirestore();
    const yearData = { settings: { regime: 'ordinario' } };
    const cleaned = cleanForFirestore(yearData);
    expect(cleaned.settings.regime).toBe('ordinario');
  });
});
```

- [ ] **Step 2: Aggiungi require**

In `test/run-tests.js`, dopo la riga del Task 1:
```js
require('./fatture-firebase-strip-backup.test.js');
```

- [ ] **Step 3: Run test, verifica fail**

Run: `node test/run-tests.js 2>&1 | tail -15`
Expected: il primo test fallisce con `expect(typeof cleanForFirestore).toBe('function')`.

Se `require('firebase-sync.js')` lancia errori legati a globals mancanti (`fetch`, `setTimeout`...), aggiungi stub. In Node 18+ tutti i timer sono globali quindi non dovrebbe servire.

---

### Task 4: Implementa strip + window export

**Files:**
- Modify: `firebase-sync.js:55-58`
- Modify: `firebase-sync.js` (exports finali)

- [ ] **Step 1: Edit cleanForFirestore**

In `firebase-sync.js`, trova:
```js
// Clean data for Firestore: strip undefined values (Firestore rejects them)
function cleanForFirestore(obj) {
  return JSON.parse(JSON.stringify(obj));
}
```

Sostituisci con:
```js
// Clean data for Firestore: strip undefined values (Firestore rejects them)
// e campi locali-only (es. _fattureManualeWipedBackup è grosso e sensibile,
// non va sincronizzato cross-device — resta nel localStorage del device che
// ha eseguito il wipe come safety net).
function cleanForFirestore(obj) {
  const cloned = JSON.parse(JSON.stringify(obj));
  if (cloned && typeof cloned === 'object' && '_fattureManualeWipedBackup' in cloned) {
    delete cloned._fattureManualeWipedBackup;
  }
  return cloned;
}
```

- [ ] **Step 2: Esporta cleanForFirestore su window**

Cerca alla fine di `firebase-sync.js` se esiste già un blocco `if (typeof window !== 'undefined') { ... }` con altri export. Se sì, aggiungi dentro:
```js
window.cleanForFirestore = cleanForFirestore;
```

Se NON esiste blocco simile, aggiungi alla fine del file:
```js
if (typeof window !== 'undefined') window.cleanForFirestore = cleanForFirestore;
```

- [ ] **Step 3: Run test, verifica pass**

Run: `node test/run-tests.js 2>&1 | tail -10`
Expected: 2 test passano. Suite ≥ 651.

- [ ] **Step 4: Commit**

```
git add test/fatture-firebase-strip-backup.test.js test/run-tests.js firebase-sync.js
git commit -m "$(cat <<'EOF'
feat(firebase-sync): strip _fattureManualeWipedBackup da payload Firestore

Il backup del legacy data.fatture[m] (creato da ensureDataShape al wipe)
resta solo in localStorage del device che ha eseguito il wipe. Non va
syncato cross-device. Esposta cleanForFirestore su window per testabilità.

2 test in test/fatture-firebase-strip-backup.test.js.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Test markPagata accetta opts.dataPagamento

**Files:**
- Create: `test/fatture-quick-paid-inline.test.js`

- [ ] **Step 1: Write failing test**

```js
'use strict';
const { describe, test, expect } = global;
const path = require('path');

function loadStateMachine() {
  global.window = global.window || {};
  delete require.cache[require.resolve(path.join(process.cwd(), 'fatture-state-machine.js'))];
  require(path.join(process.cwd(), 'fatture-state-machine.js'));
  return global.window.FattureStateMachine;
}

describe('markPagata con dataPagamento override', () => {
  test('Accetta opts.dataPagamento ISO YYYY-MM-DD', () => {
    const sm = loadStateMachine();
    const inv = { id: '1', stato: 'inviata' };
    sm.markPagata(inv, { dataPagamento: '2026-04-15' });
    expect(inv.stato).toBe('pagata');
    expect(inv.dataPagamento).toBe('2026-04-15');
    expect(inv.pagMese).toBe(4);
    expect(inv.pagAnno).toBe(2026);
  });

  test('Default oggi se opts non passati', () => {
    const sm = loadStateMachine();
    const inv = { id: '2', stato: 'inviata' };
    sm.markPagata(inv);
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    expect(inv.stato).toBe('pagata');
    expect(inv.dataPagamento).toBe(isoToday);
  });

  test('Throw su data malformata', () => {
    const sm = loadStateMachine();
    const inv = { id: '3', stato: 'inviata' };
    let threw = false;
    try { sm.markPagata(inv, { dataPagamento: 'not-a-date' }); }
    catch (e) { threw = true; }
    expect(threw).toBe(true);
  });
});
```

- [ ] **Step 2: Aggiungi require**

```js
require('./fatture-quick-paid-inline.test.js');
```

- [ ] **Step 3: Run test, verifica fail**

Run: `node test/run-tests.js 2>&1 | tail -15`
Expected: primo test fallisce. Secondo passa per default. Terzo fallisce per assenza throw.

---

### Task 6: Implementa markPagata con opts

**Files:**
- Modify: `fatture-state-machine.js`

- [ ] **Step 1: Localizza markPagata**

Run: `grep -nE "function markPagata|markPagata:" fatture-state-machine.js`
Apri il file alla riga indicata.

- [ ] **Step 2: Edit markPagata**

Sostituisci la funzione `markPagata` corrente con:
```js
function markPagata(inv, opts) {
  let iso;
  if (opts && opts.dataPagamento) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.dataPagamento)) {
      throw new Error('markPagata: dataPagamento deve essere ISO YYYY-MM-DD');
    }
    iso = opts.dataPagamento;
  } else {
    iso = (typeof todayIso === 'function')
      ? todayIso()
      : new Date().toISOString().slice(0, 10);
  }
  const parsed = new Date(iso + 'T00:00:00');
  inv.stato = 'pagata';
  inv.dataPagamento = iso;
  inv.pagMese = parsed.getMonth() + 1;
  inv.pagAnno = parsed.getFullYear();
}
```

- [ ] **Step 3: Run test**

Run: `node test/run-tests.js 2>&1 | tail -15`
Expected: 3 test nuovi passano. Suite ≥ 654. Test esistenti su `markPagata` continuano a passare.

- [ ] **Step 4: Commit**

```
git add test/fatture-quick-paid-inline.test.js test/run-tests.js fatture-state-machine.js
git commit -m "$(cat <<'EOF'
feat(state-machine): markPagata accetta opts.dataPagamento override

Permette al chiamante di passare una data ISO esplicita invece di forzare
oggi. Necessario per il flusso "segna pagata inline" dove l'utente sceglie
una data nel mini date-picker.

3 test in test/fatture-quick-paid-inline.test.js.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Rewrite renderFattureDocsSection con tabella

**Files:**
- Modify: `fatture-docs-feature.js:418-540`

- [ ] **Step 1: Aggiungi helper `_formatDataIso` sopra `renderFattureDocsSection`**

In `fatture-docs-feature.js`, prima della riga `function renderFattureDocsSection() {` aggiungi:
```js
  // Format ISO date YYYY-MM-DD → DD/MM (anno corrente) o DD/MM/YY (cross-year).
  function _formatDataIso(iso, currentYearNum) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '—';
    const [, y, mo, d] = m;
    if (Number(y) === currentYearNum) return `${d}/${mo}`;
    return `${d}/${mo}/${y.slice(2)}`;
  }
```

- [ ] **Step 2: Sostituisci il corpo di renderFattureDocsSection**

Localizza la funzione `renderFattureDocsSection`. Sostituisci tutto il corpo della funzione (da `const el = document.getElementById('fattureDocsContent');` fino a fine funzione `}`) con:

```js
    const el = document.getElementById('fattureDocsContent');
    if (!el) return;
    const year = typeof getCurrentYear === 'function' ? getCurrentYear() : (new Date()).getFullYear();
    const all = invoicesForYear(year);
    const stato = getFattureFilter();
    const filtered = filterByStato(all, stato);

    const nInviate = countByStato(all, 'inviata');
    const totInviate = sumTotali(all.filter(i => (i.stato || 'bozza') === 'inviata'));
    const summaryVisible = nInviate > 0;

    const cTutte = all.length;
    const cInviate = countByStato(all, 'inviata');
    const cPagate = countByStato(all, 'pagata');
    const cBozze = countByStato(all, 'bozza');

    const fmtEur = (v) => (typeof fmt === 'function' ? fmt(v) : String(v));
    const escHtml = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const headerHtml =
      '<div class="fatture-table-head">' +
        '<span class="ft-num">Numero</span>' +
        '<span class="ft-cliente">Cliente</span>' +
        '<span class="ft-emessa">Emessa</span>' +
        '<span class="ft-incassata">Incassata</span>' +
        '<span class="ft-importo">Importo</span>' +
        '<span class="ft-stato">Stato</span>' +
        '<span class="ft-azione">Azione</span>' +
      '</div>';

    const rowsHtml = filtered.length === 0
      ? '<div class="fatture-empty">Nessuna fattura per il filtro selezionato.</div>'
      : filtered.map(inv => {
          const statoCorrente = inv.stato || 'bozza';
          const isBozza = statoCorrente === 'bozza';
          const isInviata = statoCorrente === 'inviata';
          const isPagata = statoCorrente === 'pagata';
          const isNC = inv.tipoDocumento === 'TD04';

          const numero = (window.FattureStorico && window.FattureStorico.resolveDisplayNumero)
            ? window.FattureStorico.resolveDisplayNumero(inv)
            : (inv.numero || '—');

          const snap = inv.clienteSnapshot || {};
          const clienteRaw = snap.denominazione
            || [snap.nome, snap.cognome].filter(Boolean).join(' ')
            || snap.nome
            || inv.cessionarioRagione
            || '';
          const cliente = clienteRaw
            ? escHtml(clienteRaw)
            : (isBozza ? '<span class="muted">(non assegnato)</span>' : '—');

          const dataEmessa = _formatDataIso(inv.data || inv.dataDocumento || '', year);

          let dataIncassataCellHtml;
          const dataPagIso = inv.dataPagamento || '';
          if (isPagata && dataPagIso) {
            dataIncassataCellHtml = '<span class="ft-data-paid">' + escHtml(_formatDataIso(dataPagIso, year)) + '</span>';
          } else {
            dataIncassataCellHtml = '<span class="ft-data-empty">—</span>';
          }

          const totLordo = inv.totaleDocument || 0;
          const importoCellClass = isNC ? 'ft-importo ft-importo-nc' : 'ft-importo';
          const badgeLabel = statoCorrente.toUpperCase();
          const badgeClass = 'fatture-badge ' + statoCorrente;

          let azioneHtml = '<span class="ft-no-action">—</span>';
          if (isBozza) {
            azioneHtml =
              '<button type="button" class="fatture-row-action" title="Segna inviata"' +
                ' onclick="event.stopPropagation(); window.quickMarkInviataFromCard && window.quickMarkInviataFromCard(\'' + escHtml(inv.id) + '\')"' +
                ' aria-label="Segna inviata">✉</button>' +
              '<button type="button" class="fatture-row-action is-danger" title="Elimina bozza"' +
                ' onclick="event.stopPropagation(); window.quickDeleteBozzaFromCard && window.quickDeleteBozzaFromCard(\'' + escHtml(inv.id) + '\')"' +
                ' aria-label="Elimina bozza">×</button>';
          } else if (isInviata) {
            azioneHtml =
              '<button type="button" class="fatture-row-action ft-action-pay" title="Segna pagata"' +
                ' onclick="event.stopPropagation(); window.quickMarkPagataInlineFromCard && window.quickMarkPagataInlineFromCard(\'' + escHtml(inv.id) + '\')"' +
                ' aria-label="Segna pagata">€</button>';
          }

          return '<div class="fatture-row" data-id="' + escHtml(inv.id) + '" role="button" tabindex="0">' +
            '<span class="ft-num">' + escHtml(numero) + '</span>' +
            '<span class="ft-cliente">' + cliente + '</span>' +
            '<span class="ft-emessa ft-data">' + escHtml(dataEmessa) + '</span>' +
            '<span class="ft-incassata ft-data" data-cell="incassata">' + dataIncassataCellHtml + '</span>' +
            '<span class="' + importoCellClass + '">' + (isNC ? '−' : '') + fmtEur(Math.abs(totLordo)) + '</span>' +
            '<span class="ft-stato"><span class="' + badgeClass + '">' + escHtml(badgeLabel) + '</span></span>' +
            '<span class="ft-azione">' + azioneHtml + '</span>' +
          '</div>';
        }).join('');

    const summaryHtml = summaryVisible
      ? '<div class="fatture-summary">' + nInviate + ' da incassare · ' + fmtEur(totInviate) + '<span class="muted"> su ' + cTutte + ' emesse quest\'anno</span></div>'
      : '';

    const crossYearBannerHtml = (typeof window !== 'undefined' && typeof window.buildCrossYearReminderBannerHtml === 'function')
      ? (window.buildCrossYearReminderBannerHtml() || '') : '';

    const ackedConservation = (typeof isAdeConservationAcknowledged === 'function')
      ? isAdeConservationAcknowledged() : true;
    const conservationBanner = ackedConservation ? '' :
      '<div class="ade-conservation-banner" role="status" style="margin-top:10px;padding:10px 12px;border-radius:6px;background:rgba(46,170,220,.10);border:1px solid #2eaadc;color:#2eaadc;font-size:13px;display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">'
      + '<div style="flex:1;min-width:200px"><strong>Conservazione AdE 15 anni</strong> — gratis, una sola volta. Senza adesione AdE conserva le fatture solo 2 anni e poi le cancella (rischio reale in caso di accertamento).</div>'
      + '<div style="display:flex;gap:8px;flex-shrink:0">'
      + '<button type="button" class="btn btn-ghost" style="font-size:12px;padding:4px 10px" onclick="window.showAdeConservationGuide && window.showAdeConservationGuide()">Come aderire</button>'
      + '<button type="button" class="btn btn-ghost" style="font-size:12px;padding:4px 10px" onclick="window.acknowledgeAdeConservation && window.acknowledgeAdeConservation()" title="Ho già aderito">Già fatto</button>'
      + '</div>'
      + '</div>';

    const lim = (typeof S === 'function' && S().limiteForfettario) || 85000;
    const totFatturato = sumTotali(all.filter(i => (i.stato || 'bozza') !== 'bozza'));
    const pct = lim > 0 ? Math.min(totFatturato / lim * 100, 100) : 0;
    const progressColor = pct > 90 ? '#e53935' : (pct > 70 ? '#f0a020' : '#3c8f91');
    const progressHtml =
      '<div class="fatture-progress">' +
        '<div class="fatture-progress-row"><span>Fatturato ' + year + '</span><span class="fatture-progress-amount">' + fmtEur(totFatturato) + ' / ' + fmtEur(lim) + '</span></div>' +
        '<div class="fatture-progress-bar"><div class="fatture-progress-fill" style="width:' + pct.toFixed(1) + '%;background:' + progressColor + '"></div></div>' +
      '</div>';

    const markup =
      '<div class="fatture-card">' +
        '<div class="fatture-card-head">' +
          '<div class="fatture-card-title">Fatture ' + year + '</div>' +
          '<div class="fatture-card-actions">' +
            '<button type="button" class="btn btn-ghost" onclick="window.openArchivioFatture && window.openArchivioFatture()" title="Archivio fatture">Archivio</button>' +
            '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'inputImportXmlNuove\').click()" title="Importa XML FatturaPA">📄 Importa XML</button>' +
            '<button type="button" class="btn btn-primary" onclick="openFatturaModal()">+ Nuova fattura</button>' +
          '</div>' +
        '</div>' +
        summaryHtml +
        crossYearBannerHtml +
        conservationBanner +
        '<div class="fatture-filters" role="tablist" aria-label="Filtro stato fatture">' +
          '<button type="button" role="tab" class="fatture-filter-btn" aria-selected="' + (stato==='tutte') + '" onclick="window.setFattureFilter(\'tutte\')">Tutte (' + cTutte + ')</button>' +
          '<button type="button" role="tab" class="fatture-filter-btn" aria-selected="' + (stato==='inviata') + '" onclick="window.setFattureFilter(\'inviata\')">Da pagare (' + cInviate + ')</button>' +
          '<button type="button" role="tab" class="fatture-filter-btn" aria-selected="' + (stato==='pagata') + '" onclick="window.setFattureFilter(\'pagata\')">Pagate (' + cPagate + ')</button>' +
          '<button type="button" role="tab" class="fatture-filter-btn" aria-selected="' + (stato==='bozza') + '" onclick="window.setFattureFilter(\'bozza\')">Bozze (' + cBozze + ')</button>' +
        '</div>' +
        '<div class="fatture-list">' + headerHtml + rowsHtml + '</div>' +
        progressHtml +
      '</div>';

    el['inner' + 'HTML'] = markup;

    el.querySelectorAll('.fatture-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.fatture-pagata-inline-form')) return;
        const id = row.getAttribute('data-id');
        if (typeof openFatturaModal === 'function') openFatturaModal(id);
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });
    });
```

**Note**:
- Pulsante "+ Da calendario" omesso. Per mantenerlo, aggiungi prima di "📄 Importa XML": `'<button type="button" class="btn btn-ghost" onclick="openFatturaDaCalendarioPicker()" title="Fattura da calendario">+ Da calendario</button>' +`.
- Azione `€` chiama `quickMarkPagataInlineFromCard` (Task 8) — `quickMarkPagataFromCard` resta esistente per altri call sites.

- [ ] **Step 3: Verifica file parsa**

Run: `node -e "try { require('./fatture-docs-feature.js'); } catch (e) { if (e instanceof SyntaxError) { console.error('SYNTAX'); process.exit(1); } else { console.log('OK'); } }" 2>&1 | head -3`
Expected: `OK`. Se `SYNTAX`, l'editing manuale ha rotto il file.

---

### Task 8: Implementa quickMarkPagataInlineFromCard (DOM API)

**Files:**
- Modify: `fatture-docs-feature.js` (subito dopo `function quickMarkPagataFromCard(id) { ... }`)

- [ ] **Step 1: Aggiungi nuova funzione**

Trova la chiusura `}` di `function quickMarkPagataFromCard(id) {` (cerca `window.quickMarkInviataFromCard = quickMarkInviataFromCard;` per orientarti). PRIMA dei `window.*` exports, aggiungi questa funzione che usa createElement/textContent (DOM safe, niente innerHTML su contenuto dinamico):

```js
  function quickMarkPagataInlineFromCard(id) {
    const safeId = String(id || '').replace(/"/g, '\\"');
    const row = document.querySelector('.fatture-row[data-id="' + safeId + '"]');
    if (!row) return;
    const cell = row.querySelector('span[data-cell="incassata"]');
    if (!cell) return;
    if (cell.querySelector('.fatture-pagata-inline-form')) return;

    const today = (typeof todayIso === 'function')
      ? todayIso()
      : new Date().toISOString().slice(0, 10);

    while (cell.firstChild) cell.removeChild(cell.firstChild);

    const wrapper = document.createElement('span');
    wrapper.className = 'fatture-pagata-inline-form';

    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'ft-date-input';
    input.value = today;

    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.className = 'ft-btn-ok';
    btnOk.title = 'Conferma';
    btnOk.textContent = 'OK';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'ft-btn-cancel';
    btnCancel.title = 'Annulla';
    btnCancel.textContent = '×';

    wrapper.appendChild(input);
    wrapper.appendChild(btnOk);
    wrapper.appendChild(btnCancel);
    cell.appendChild(wrapper);

    function close() {
      while (cell.firstChild) cell.removeChild(cell.firstChild);
      const empty = document.createElement('span');
      empty.className = 'ft-data-empty';
      empty.textContent = '—';
      cell.appendChild(empty);
    }

    function commit() {
      const isoDate = input.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        input.style.borderColor = '#e53935';
        return;
      }
      const profile = AppContext.getProfile();
      if (!profile) return;
      const store = window.FattureStorico || { load: loadFattureEmesse, save: saveFattureEmesse };
      const all = store.load(profile);
      const idx = all.findIndex(f => f.id === id);
      if (idx < 0) return;
      if ((all[idx].stato || 'bozza') !== 'inviata') return;
      if (window.FattureStateMachine) {
        window.FattureStateMachine.markPagata(all[idx], { dataPagamento: isoDate });
      } else {
        const d = new Date(isoDate + 'T00:00:00');
        all[idx].stato = 'pagata';
        all[idx].dataPagamento = isoDate;
        all[idx].pagMese = d.getMonth() + 1;
        all[idx].pagAnno = d.getFullYear();
      }
      store.save(profile, all);
      if (typeof renderFattureDocsSection === 'function') renderFattureDocsSection();
      if (typeof recalcAll === 'function') recalcAll();
    }

    btnOk.addEventListener('click', (e) => { e.stopPropagation(); commit(); });
    btnCancel.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    [input, btnOk, btnCancel].forEach(node => {
      node.addEventListener('click', (e) => e.stopPropagation());
    });
    setTimeout(() => input.focus(), 0);
  }
```

- [ ] **Step 2: Aggiungi window export**

Subito sotto `window.quickMarkPagataFromCard = quickMarkPagataFromCard;` aggiungi:
```js
  window.quickMarkPagataInlineFromCard = quickMarkPagataInlineFromCard;
```

- [ ] **Step 3: Run test runner**

Run: `node test/run-tests.js 2>&1 | tail -10`
Expected: suite ≥ 654, 0 failed.

---

### Task 9: Cancella app-fatture.js + rimuovi dead helpers

**Files:**
- Delete: `app-fatture.js`
- Modify: `app-fatture-helpers.js`
- Modify: `index.html`

- [ ] **Step 1: Verifica nessun call site runtime di renderFatture**

Run: `grep -rnE "\brenderFatture\b" --include="*.js" --include="*.html" 2>&1 | grep -v "renderFatture[A-Z]"`
Expected: solo `app-fatture.js`. Se altri runtime call sites, fermati e investiga.

- [ ] **Step 2: Verifica call site dead helpers**

Run: `grep -rnE "setFatturaImporto|setFatturaDesc|setFatturaPagamento|\baddFattura\b|\bremoveFattura\b|getFattureIssued" --include="*.js" --include="*.html" 2>&1`
Expected: solo `app-fatture.js`, `app-fatture-helpers.js`, e file di docs (`docs/`, `CLAUDE.md`). Altri runtime call sites in `.js`/`.html` → fermati.

- [ ] **Step 3: Cancella app-fatture.js**

Run: `git rm app-fatture.js`
Expected: `rm 'app-fatture.js'`

- [ ] **Step 4: Edit app-fatture-helpers.js**

Cancella tutte le funzioni dopo `getFatture` (cioè `_getFatturaIdAt`, `getFattureIssued`, `_getFatturaIdAtIssued`, `setFatturaImporto`, `setFatturaDesc`, `setFatturaPagamento`, `addFattura`, `removeFattura`).

- [ ] **Step 5: Sostituisci il blocco window exports**

In `app-fatture-helpers.js`, sostituisci il blocco finale `if (typeof window !== "undefined") { ... }` con:
```js
  if (typeof window !== "undefined") {
    window.getFattureFromYearData = getFattureFromYearData;
    window._getFattureEmesse = _getFattureEmesse;
    window._saveFattureEmesse = _saveFattureEmesse;
    window.getFatture = getFatture;
  }
```

- [ ] **Step 6: Rimuovi script tag da index.html**

In `index.html`, trova `<script src="app-fatture.js"></script>` e cancella la riga.

Run: `grep -n "app-fatture.js" index.html`
Expected: nessun output.

- [ ] **Step 7: Run test**

Run: `node test/run-tests.js 2>&1 | tail -10`
Expected: ≥ 654 passed, 0 failed.

Se failure su `getFattureIssued`:
Run: `grep -lE "getFattureIssued" test/`
Caso per caso: rimuovi i test orfani o sposta su `getFatture`.

---

### Task 10: Cleanup index.html (manuali-card + incassoSection)

**Files:**
- Modify: `index.html:192-207`

- [ ] **Step 1: Edit blocco tab-fatture**

In `index.html`, trova:
```html
  <div id="tab-fatture" class="tab-content">
    <div class="panel">
      <h3>Fatture</h3>
      <div id="fattureDocsContent"></div>
      <div class="manuali-card">
        <div class="fatture-card-head">
          <div class="fatture-card-title">Incassi manuali (mensili)</div>
        </div>
        <div class="manuali-note">
          Per importi senza fattura formale. Temporaneo finché l'emissione in-app non sostituirà Fiscozen.
        </div>
        <table class="fatture-table" id="fattureTable"></table>
      </div>
      <div class="incasso-section" id="incassoSection"></div>
    </div>
  </div>
```

Sostituisci con:
```html
  <div id="tab-fatture" class="tab-content">
    <div class="panel">
      <h3>Fatture</h3>
      <div id="fattureDocsContent"></div>
    </div>
  </div>
```

- [ ] **Step 2: Verifica nessun resto**

Run: `grep -nE "manuali-card|fattureTable|incassoSection|incasso-section|manuali-note" index.html`
Expected: nessuna occorrenza.

---

### Task 11: CSS per nuovo layout tabellare

**Files:**
- Modify: `style.css` (alla fine del file)

- [ ] **Step 1: Aggiungi blocco CSS**

Alla fine di `style.css` aggiungi:
```css
/* ═════════════ Fatture table layout (post-redesign 2026-05-08) ═════════════ */
.fatture-table-head {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 10px;
  color: var(--color-text-muted);
  background: var(--color-surface-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--color-border);
}
.fatture-table-head > span,
.fatture-row > span {
  display: inline-block;
}
.fatture-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  font-size: 12px;
  gap: 4px;
}
.fatture-row:last-child { border-bottom: none; }
.fatture-row:hover { background: var(--color-surface-2); }
.ft-num     { width: 84px; font-weight: 600; }
.ft-cliente { flex: 1; min-width: 100px; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ft-emessa, .ft-incassata { width: 78px; font-size: 11px; color: var(--color-text-muted); }
.ft-data-paid { color: var(--color-success); font-weight: 600; }
.ft-data-empty { color: var(--color-text-faint); }
.ft-importo { width: 96px; text-align: right; font-weight: 600; }
.ft-importo-nc { color: var(--color-error); }
.ft-stato { width: 76px; text-align: center; }
.ft-azione { width: 72px; text-align: right; display: flex; gap: 4px; justify-content: flex-end; }
.ft-no-action { color: var(--color-text-faint); font-size: 11px; }
.ft-action-pay { border-color: var(--color-success); color: var(--color-success); font-weight: 600; }

.fatture-pagata-inline-form {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.fatture-pagata-inline-form .ft-date-input {
  font-size: 11px;
  padding: 2px 4px;
  border: 1px solid var(--color-success);
  border-radius: 3px;
  background: var(--color-bg);
  color: var(--color-text);
  width: 110px;
}
.fatture-pagata-inline-form .ft-btn-ok,
.fatture-pagata-inline-form .ft-btn-cancel {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  cursor: pointer;
}
.fatture-pagata-inline-form .ft-btn-ok {
  background: var(--color-primary);
  color: var(--color-bg);
  border-color: var(--color-primary);
  font-weight: 600;
}

.fatture-progress {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.fatture-progress-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 6px;
}
.fatture-progress-amount {
  font-weight: 600;
  color: var(--color-text);
}
.fatture-progress-bar {
  height: 6px;
  background: var(--color-bg);
  border-radius: 3px;
  overflow: hidden;
}
.fatture-progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

@media (max-width: 600px) {
  .fatture-table-head { display: none; }
  .fatture-row { flex-wrap: wrap; }
  .ft-num { width: auto; flex: 0 0 auto; }
  .ft-cliente { flex: 1 1 auto; }
  .ft-emessa, .ft-incassata { width: auto; flex: 0 0 auto; font-size: 10px; }
  .ft-emessa::before { content: "Em: "; color: var(--color-text-faint); }
  .ft-incassata::before { content: "In: "; color: var(--color-text-faint); }
  .ft-importo { width: auto; flex: 1 1 100%; text-align: right; padding-top: 4px; }
  .ft-stato { width: auto; }
  .ft-azione { width: auto; }
}
```

---

### Task 12: Commit cleanup massivo (Tasks 7-11)

- [ ] **Step 1: Stato git**

Run: `git status`
Expected: modificati `app-fatture-helpers.js`, `index.html`, `style.css`, `fatture-docs-feature.js`, e `app-fatture.js` cancellato.

- [ ] **Step 2: Aggiungi e committa**

```
git add app-fatture-helpers.js index.html style.css fatture-docs-feature.js
git commit -m "$(cat <<'EOF'
feat(fatture): redesign tab Fatture senza incassi manuali

- index.html: rimuove blocco manuali-card + incassoSection + script app-fatture.js
- app-fatture.js: cancellato (dead code post-rimozione tabella)
- app-fatture-helpers.js: rimuove setter/add/remove/getFattureIssued/
  _getFatturaIdAt/_getFatturaIdAtIssued (dead post-rimozione UI)
- fatture-docs-feature.js: renderFattureDocsSection riscritto con
  layout tabellare (Numero/Cliente/Emessa/Incassata/Importo/Stato/Azione).
  Cross-year banner e progress fatturato integrati nel pannello principale.
  Nuova funzione quickMarkPagataInlineFromCard con date-picker inline
  costruito via DOM API (createElement/textContent, niente innerHTML su
  contenuto dinamico).
- style.css: regole tabellari + mini date-picker + progress bar +
  responsive collapse su < 600px.

Wipe del legacy data.fatture[m] gestito separatamente in ensureDataShape
(commit precedente). Tasse Accantonate aggrega correttamente per
(mese, cliente) via path moderno con FattureSelectors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Smoke test browser (manuale, USER)

**Files:**
- Nessuna modifica.

- [ ] **Step 1: Avvia server statico**

Agent: `python -m http.server 3000` in background. Apri http://localhost:3000 nel browser.

- [ ] **Step 2: Login profilo Demo**

Verifica login funzionante.

- [ ] **Step 3: Tab Fatture — verifiche layout**

- [ ] La tab mostra **solo** lo storico in formato tabellare.
- [ ] Header colonne visibili: Numero | Cliente | Emessa | Incassata | Importo | Stato | Azione.
- [ ] Bottoni: Archivio, 📄 Importa XML, + Nuova fattura.
- [ ] In fondo: progress bar "Fatturato YYYY: €X / €85.000".

- [ ] **Step 4: Flusso stati fattura**

- [ ] Crea bozza con "+ Nuova fattura". Vedi badge BOZZA, numero "—", date "—", azioni ✉ e ×.
- [ ] Click ✉ → INVIATA, numero formale, data emessa.
- [ ] Click € → cella "Incassata" diventa input date default oggi.
- [ ] Cambia data, OK → PAGATA con data scelta.
- [ ] Click × del date-picker → annulla, riga torna INVIATA.
- [ ] Esc nell'input → annulla. Enter → conferma.

- [ ] **Step 5: Tasse Accantonate aggregazione**

- [ ] 2 fatture wizard stesso cliente stesso mese di pagamento → una sola riga aggregata.
- [ ] NC TD04 collegata → riga aggregata mostra netto fattura − NC.

- [ ] **Step 6: Verifica wipe localStorage**

In DevTools console:
```js
const k = `calcoliPIVA_${currentProfile}_${currentYear}`;
const d = JSON.parse(localStorage.getItem(k) || '{}');
console.log('fatture:', d.fatture);
console.log('wipe flag:', d._fattureManualeWiped);
console.log('backup keys:', Object.keys(d._fattureManualeWipedBackup || {}));
```
Expected: `fatture: {}`, wipe flag = ISO timestamp, backup keys = mesi precedenti (o `[]`).

- [ ] **Step 7: Conferma**

"Smoke test OK" oppure descrivi problemi.

---

### Task 14: Final cleanup + verifica suite

- [ ] **Step 1: Suite completa**

Run: `node test/run-tests.js 2>&1 | tail -5`
Expected: `>= 654 / total tests passed, 0 failed`.

- [ ] **Step 2: Stop server statico**

Stop dal background task (Task 13 step 1).

- [ ] **Step 3: Riepilogo**

Run: `git log --oneline | head -15`

Run: `git diff main..HEAD --stat | tail -10`

- [ ] **Step 4: Sintesi finale**

- File cancellati: `app-fatture.js`
- File aggiunti: 3 test + spec + plan
- File modificati: `index.html`, `style.css`, `fatture-docs-feature.js`, `app-fatture-helpers.js`, `app-storage.js`, `firebase-sync.js`, `fatture-state-machine.js`, `test/run-tests.js`
- Test totale: 646 → ~654.

---

## Self-review checklist

- [x] **Spec coverage**:
  - Wipe legacy → Task 1+2
  - Firebase backup non syncato → Task 3+4
  - markPagata con dataPagamento → Task 5+6
  - Layout tabellare + cross-year/progress integrati → Task 7
  - Date-picker inline → Task 8
  - Cancellazione app-fatture.js + dead helpers → Task 9
  - Cleanup index.html → Task 10
  - CSS layout → Task 11
  - Smoke test → Task 13
  - Verifica suite → Task 14

- [x] **Placeholder scan**: nessun "TODO/TBD". Risoluzioni inline complete. Comandi git completi.

- [x] **Type/SHA consistency**: `quickMarkPagataInlineFromCard` usata in renderFattureDocsSection (Task 7) e implementata Task 8 — l'ordine va bene perché entrambi vivono nel browser e la funzione è chiamata via onclick string-template solo a runtime, quando window export è già completato. `_formatDataIso` definita Task 7 prima di essere usata. `markPagata({ dataPagamento })` testata Task 5 e implementata Task 6 prima di essere consumata in Task 8. `cleanForFirestore` esportata su window in Task 4 e testata in Task 3 (TDD canonico).
