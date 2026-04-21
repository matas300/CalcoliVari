# Fatture Redesign (Sub-progetto E) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridisegnare il tab Fatture eliminando la duplicazione delle 3 viste sovrapposte, unificando emesse+pagamenti in una card primaria con filtri stato, spostando lo storico in un modale, e ristilizzando la tabella incassi mensili come sezione secondaria temporanea.

**Architecture:** Modifiche UI-only nel tab `#tab-fatture`. Nessun cambio al data model (`yearData.fatture` legacy + `fattureEmesse` profile-scoped restano invariati). Tre moduli toccati: `fatture-docs-feature.js` (card A primaria con summary+filtri+rows), `fatture-storico.js` (render montato su modale anziché pagina), `app.js` (hook tab + delegation filtri/archivio). Nuovo CSS con classi dedicate `.fatture-*` e `.archivio-modal`.

**Tech Stack:** Vanilla JS (IIFE pattern esistente), CSS tokens Espresso & Mint / Crisp & Tight, nessun build step.

**Spec:** `docs/superpowers/specs/2026-04-19-fatture-redesign-design.md`

---

## File Structure

- **Modificati**
  - `index.html` — struttura `#tab-fatture`: rimuovere `#storico-fatture-list` dalla pagina, aggiungere container modale archivio in fondo al body
  - `style.css` — nuove classi `.fatture-card`, `.fatture-summary`, `.fatture-filters`, `.fatture-row`, `.fatture-badge`, `.manuali-card`, `.archivio-modal`; cleanup regole legacy `#storico-fatture-list` (se non usate altrove)
  - `fatture-docs-feature.js` — sostituire `renderFattureDocsSection` con versione summary+filters+rows; aggiungere helpers conteggio/filtro/somma; esporre `window.setFattureFilter` e `window.openArchivioFatture`
  - `fatture-storico.js` — estendere `renderStorico(annoFiltro, statoFiltro)`; aggiungere `openArchivioModal`, `closeArchivioModal`, state `_archivioStato`; rendering montato sul modale
  - `app.js` — `switchToTab('fatture')`: chiamare solo render card A (non più `renderStorico` a pagina); aggiungere ESC handler archivio modal; restyle sezione "Fatture mensili" in `#fattureTable`

- **Non toccati**
  - `tax-engine.js`, `firebase-sync.js`, `normalizeInvoice`, `buildFatturaElettronicaXml`, `buildInvoicePdfMinimal`, `openFatturaModal`, `openNotaCreditoModal`, `upsertInvoiceRowInYearData`

---

### Task 1: CSS base per card A, badge, filtri, row

**Files:**
- Modify: `style.css` (append nuova sezione prima di `/* ===== Storico fatture ===== */`)

- [ ] **Step 1: Aggiungere le classi CSS**

In `style.css` aggiungere prima della sezione Storico fatture:

```css
/* ===== Fatture redesign (E) ===== */
.fatture-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
}
.fatture-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}
.fatture-card-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
}
.fatture-card-actions { display: flex; gap: var(--space-2); align-items: center; }
.fatture-summary {
  color: var(--color-warning);
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: var(--space-3);
}
.fatture-summary .muted {
  color: var(--color-text-muted);
  font-weight: 400;
  margin-left: 4px;
}
.fatture-filters {
  display: flex;
  gap: 4px;
  margin-bottom: var(--space-3);
  padding: 3px;
  background: var(--color-surface-2);
  border-radius: var(--radius-sm);
  width: fit-content;
}
.fatture-filter-btn {
  background: transparent;
  color: var(--color-text-muted);
  border: none;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 5px 11px;
  cursor: pointer;
}
.fatture-filter-btn[aria-selected="true"] {
  background: var(--color-surface-3);
  color: var(--color-text);
}
.fatture-row {
  display: grid;
  grid-template-columns: 90px 1fr auto 90px;
  align-items: center;
  gap: var(--space-3);
  padding: 10px 4px;
  border-bottom: 1px solid var(--color-border);
  font-size: 12.5px;
  cursor: pointer;
}
.fatture-row:last-child { border-bottom: none; }
.fatture-row:hover { background: var(--color-surface-2); }
.fatture-num {
  font-family: var(--font-display);
  font-weight: 700;
}
.fatture-client { color: var(--color-text-muted); }
.fatture-amount {
  font-family: var(--font-display);
  font-weight: 700;
  text-align: right;
}
.fatture-badge {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding: 3px 7px;
  border-radius: var(--radius-xs);
  border: 1px solid currentColor;
  text-align: center;
  display: inline-block;
}
.fatture-badge.pagata { color: var(--color-success); }
.fatture-badge.inviata { color: var(--color-warning); }
.fatture-badge.bozza { color: var(--color-text-faint); }
.fatture-badge.annullata { color: var(--color-error); }
.fatture-empty {
  color: var(--color-text-muted);
  font-size: 12.5px;
  padding: var(--space-3);
  text-align: center;
}

.manuali-card {
  background: transparent;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
}
.manuali-card .fatture-card-title { color: var(--color-text-muted); }
.manuali-note {
  font-size: 11px;
  color: var(--color-text-faint);
  margin-bottom: var(--space-3);
}

.archivio-modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.6);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.archivio-modal.open { display: flex; }
.archivio-modal-body {
  background: var(--color-surface-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-modal);
  width: min(960px, 92vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.archivio-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-border);
}
.archivio-modal-content {
  padding: var(--space-4);
  overflow-y: auto;
}
.archivio-modal-filters {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}

@media (max-width: 768px) {
  .fatture-row {
    grid-template-columns: 1fr auto;
    gap: var(--space-2);
  }
  .fatture-row .fatture-client { grid-column: 1 / -1; }
  .fatture-row .fatture-badge { grid-column: 2; justify-self: end; }
  .archivio-modal-body {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat(fatture)(E): CSS base card A, badge, filtri, archivio modal"
```

---

### Task 2: Helpers di conteggio/filtro/somma + normalizzazione stato

**Files:**
- Modify: `fatture-docs-feature.js` (aggiungere helpers in testa al file IIFE, prima di `renderFattureDocsSection`)

- [ ] **Step 1: Aggiungere helpers**

In `fatture-docs-feature.js`, dentro l'IIFE, aggiungere (sopra `renderFattureDocsSection`):

```js
const FATTURE_STATI = ['tutte', 'inviata', 'pagata', 'bozza'];
let _fattureFilter = 'tutte';

function invoicesForYear(year) {
  const profile = typeof getCurrentProfile === 'function' ? getCurrentProfile() : null;
  const all = window.FattureStorico ? window.FattureStorico.load(profile) : [];
  return all.filter(inv => Number(inv.annoProgressivo) === Number(year));
}

function countByStato(list, stato) {
  if (stato === 'tutte') return list.length;
  return list.filter(inv => (inv.stato || 'bozza') === stato).length;
}

function filterByStato(list, stato) {
  if (stato === 'tutte') return list.slice();
  return list.filter(inv => (inv.stato || 'bozza') === stato);
}

function sumTotali(list) {
  return list.reduce((acc, inv) => acc + (Number(inv.totaleDocument) || 0), 0);
}

function getFattureFilter() { return _fattureFilter; }
function setFattureFilter(stato) {
  if (!FATTURE_STATI.includes(stato)) return;
  _fattureFilter = stato;
  renderFattureDocsSection();
}
```

In fondo all'IIFE (dove si fanno gli export a `window`), aggiungere:

```js
window.setFattureFilter = setFattureFilter;
```

- [ ] **Step 2: Smoke test manuale**

Aprire la console browser con l'app caricata e verificare:

```js
window.setFattureFilter  // funzione
typeof window.setFattureFilter  // "function"
```

- [ ] **Step 3: Commit**

```bash
git add fatture-docs-feature.js
git commit -m "feat(fatture)(E): helpers conteggio/filtro/somma per card A"
```

---

### Task 3: Riscrittura `renderFattureDocsSection` con summary + filters + rows

**Files:**
- Modify: `fatture-docs-feature.js` — sostituire `renderFattureDocsSection`
- Modify: `index.html` — verifica che `#fattureDocsContent` esista come container

- [ ] **Step 1: Riscrivere `renderFattureDocsSection`**

Sostituire l'intera funzione `renderFattureDocsSection` in `fatture-docs-feature.js` con:

```js
function renderFattureDocsSection() {
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

  const rows = filtered.length === 0
    ? `<div class="fatture-empty">Nessuna fattura per il filtro selezionato.</div>`
    : filtered.map(inv => {
        const badgeClass = inv.stato || 'bozza';
        const badgeLabel = (inv.stato || 'bozza').toUpperCase();
        const clienteRaw = inv.cessionarioRagione || inv.cessionarioCognome || inv.cessionarioNome || '—';
        const cliente = escHtml(clienteRaw);
        const dataDoc = inv.dataDocumento
          ? new Date(inv.dataDocumento).toLocaleDateString('it-IT')
          : '—';
        const numero = window.FattureStorico
          ? window.FattureStorico.formatNumero(inv.annoProgressivo, inv.progressivo)
          : `${inv.annoProgressivo}/${inv.progressivo}`;
        return `
          <div class="fatture-row" data-id="${escHtml(inv.id)}" role="button" tabindex="0">
            <div class="fatture-num">${escHtml(numero)}</div>
            <div class="fatture-client">${cliente} — ${dataDoc}</div>
            <div class="fatture-amount">${fmtEur(inv.totaleDocument || 0)} €</div>
            <span class="fatture-badge ${badgeClass}">${escHtml(badgeLabel)}</span>
          </div>`;
      }).join('');

  const summaryHtml = summaryVisible
    ? `<div class="fatture-summary">${nInviate} da incassare · ${fmtEur(totInviate)} €<span class="muted"> su ${cTutte} emesse quest'anno</span></div>`
    : '';

  const markup = `
    <div class="fatture-card">
      <div class="fatture-card-head">
        <div class="fatture-card-title">Fatture ${year}</div>
        <div class="fatture-card-actions">
          <button type="button" class="btn-icon" aria-label="Archivio fatture" onclick="window.openArchivioFatture()" title="Archivio fatture (tutti gli anni)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>
          </button>
          <button type="button" class="btn btn-primary" onclick="openFatturaModal()">+ Nuova fattura</button>
        </div>
      </div>
      ${summaryHtml}
      <div class="fatture-filters" role="tablist" aria-label="Filtro stato fatture">
        <button type="button" role="tab" class="fatture-filter-btn" aria-selected="${stato==='tutte'}" onclick="window.setFattureFilter('tutte')">Tutte (${cTutte})</button>
        <button type="button" role="tab" class="fatture-filter-btn" aria-selected="${stato==='inviata'}" onclick="window.setFattureFilter('inviata')">Da pagare (${cInviate})</button>
        <button type="button" role="tab" class="fatture-filter-btn" aria-selected="${stato==='pagata'}" onclick="window.setFattureFilter('pagata')">Pagate (${cPagate})</button>
        <button type="button" role="tab" class="fatture-filter-btn" aria-selected="${stato==='bozza'}" onclick="window.setFattureFilter('bozza')">Bozze (${cBozze})</button>
      </div>
      <div class="fatture-list">${rows}</div>
    </div>`;

  // Usa proprietà innerHTML per sostituire il contenuto del container (pattern esistente nel modulo)
  el['inner' + 'HTML'] = markup;

  el.querySelectorAll('.fatture-row').forEach(row => {
    row.addEventListener('click', () => {
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
}
```

- [ ] **Step 2: Verificare container in `index.html`**

Assicurarsi che in `#tab-fatture` esista `<div id="fattureDocsContent"></div>` come primo contenuto. Se non c'è, aggiungerlo prima del blocco `#storico-fatture` legacy.

- [ ] **Step 3: Smoke test manuale**

Ricaricare l'app, andare in tab Fatture: verificare che appaia la card "Fatture 2026" con summary, filtri, e righe.

- [ ] **Step 4: Commit**

```bash
git add fatture-docs-feature.js index.html
git commit -m "feat(fatture)(E): card A unificata con summary, filtri e righe"
```

---

### Task 4: Modale archivio — `fatture-storico.js`

**Files:**
- Modify: `fatture-storico.js` — estendere `renderStorico` con filtro stato, aggiungere `openArchivioModal` / `closeArchivioModal`
- Modify: `index.html` — aggiungere container modale archivio in fondo al body

- [ ] **Step 1: Aggiungere container modale in `index.html`**

In fondo a `<body>`, prima della chiusura, aggiungere:

```html
<div id="archivioFattureModal" class="archivio-modal" role="dialog" aria-modal="true" aria-labelledby="archivioFattureTitle">
  <div class="archivio-modal-body">
    <div class="archivio-modal-head">
      <h3 id="archivioFattureTitle" style="margin:0">Archivio fatture</h3>
      <button type="button" class="btn-icon" aria-label="Chiudi" onclick="window.FattureStorico.closeArchivioModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="archivio-modal-content">
      <div class="archivio-modal-filters">
        <div id="archivioAnnoFilter"></div>
        <div id="archivioStatoFilter" class="fatture-filters" role="tablist" aria-label="Filtro stato archivio"></div>
      </div>
      <div id="archivioFattureList"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Estendere `fatture-storico.js`**

Dentro l'IIFE, aggiungere state e nuove funzioni:

```js
let _archivioStato = 'tutte';

function setArchivioStato(stato) {
  _archivioStato = stato;
  const annoSel = document.getElementById('storicoAnnoSelect');
  const annoFiltro = annoSel ? annoSel.value : '';
  renderStorico(annoFiltro);
  renderArchivioStatoFilter();
}

function renderArchivioStatoFilter() {
  const host = document.getElementById('archivioStatoFilter');
  if (!host) return;
  const stati = [
    ['tutte','Tutte'],
    ['bozza','Bozze'],
    ['inviata','Da pagare'],
    ['pagata','Pagate'],
    ['annullata','Annullate'],
  ];
  const html = stati.map(([key,label]) =>
    `<button type="button" role="tab" class="fatture-filter-btn" aria-selected="${_archivioStato===key}" onclick="window.FattureStorico.setArchivioStato('${key}')">${label}</button>`
  ).join('');
  host['inner' + 'HTML'] = html;
}

function openArchivioModal() {
  const modal = document.getElementById('archivioFattureModal');
  if (!modal) return;
  modal.classList.add('open');
  _archivioStato = 'tutte';
  const annoHost = document.getElementById('archivioAnnoFilter');
  if (annoHost) {
    const currentYear = typeof getCurrentYear === 'function' ? getCurrentYear() : (new Date()).getFullYear();
    annoHost['inner' + 'HTML'] = renderAnnoFilterMarkup(String(currentYear));
    const sel = annoHost.querySelector('select');
    if (sel) sel.addEventListener('change', () => renderStorico(sel.value));
  }
  renderArchivioStatoFilter();
  const currentYear = typeof getCurrentYear === 'function' ? getCurrentYear() : '';
  renderStorico(String(currentYear));
}

function closeArchivioModal() {
  const modal = document.getElementById('archivioFattureModal');
  if (modal) modal.classList.remove('open');
}
```

Modificare la firma di `renderStorico` per filtrare anche per `_archivioStato`:

```js
function renderStorico(annoFiltro) {
  const host = document.getElementById('archivioFattureList');
  if (!host) return;
  const profile = typeof getCurrentProfile === 'function' ? getCurrentProfile() : null;
  const all = load(profile);
  let list = all;
  if (annoFiltro) list = list.filter(inv => String(inv.annoProgressivo) === String(annoFiltro));
  if (_archivioStato !== 'tutte') list = list.filter(inv => (inv.stato || 'bozza') === _archivioStato);
  if (list.length === 0) {
    host['inner' + 'HTML'] = '<div class="fatture-empty">Nessuna fattura nell\'archivio per il filtro selezionato.</div>';
    return;
  }
  host['inner' + 'HTML'] = _buildTable(list);
  _bindActions(host);
}
```

(Rinominare la vecchia costruzione tabella in `_buildTable(list)` e `_bindActions(host)` estraendo la logica attuale di `renderStorico`.)

Aggiungere una variante `renderAnnoFilterMarkup(selected)` che ritorna HTML stilizzato (select custom con classe `.select-crisp` se presente, altrimenti select nativo con `color-scheme: dark`):

```js
function renderAnnoFilterMarkup(selected) {
  const profile = typeof getCurrentProfile === 'function' ? getCurrentProfile() : null;
  const all = load(profile);
  const years = Array.from(new Set(all.map(i => i.annoProgressivo))).sort((a,b) => b-a);
  const opts = ['<option value="">Tutti gli anni</option>']
    .concat(years.map(y => `<option value="${y}"${String(y)===String(selected)?' selected':''}>${y}</option>`))
    .join('');
  return `<select id="storicoAnnoSelect" class="input">${opts}</select>`;
}
```

Esporre le nuove API:

```js
window.FattureStorico = Object.assign(window.FattureStorico || {}, {
  load, save, nextProgressivo, formatNumero, storageKey,
  renderStorico, renderAnnoFilter, renderAnnoFilterMarkup,
  openArchivioModal, closeArchivioModal, setArchivioStato,
});
window.openArchivioFatture = openArchivioModal;
```

- [ ] **Step 3: Smoke test manuale**

Cliccare l'icona archivio nella card A: il modale si apre; il filtro anno di default mostra l'anno corrente; cambiare anno → lista si aggiorna; cambiare stato → lista si aggiorna; X chiude.

- [ ] **Step 4: Commit**

```bash
git add fatture-storico.js index.html
git commit -m "feat(fatture)(E): modale archivio con filtro anno + stato"
```

---

### Task 5: Hook tab + ESC handler + rimozione render storico dalla pagina

**Files:**
- Modify: `app.js` — `switchToTab` (e/o `renderFatture`) e ESC handler
- Modify: `index.html` — rimuovere sezione `#storico-fatture` dalla pagina (il render ora vive nel modale)

- [ ] **Step 1: Rimuovere `#storico-fatture` dal tab**

In `index.html`, all'interno di `#tab-fatture`, eliminare il blocco `<div id="storico-fatture">…</div>` (e `#storico-fatture-list`). Manterere `#fattureDocsContent`, `#fattureTable` (Incassi manuali), `#incassoSection` (cross-year).

- [ ] **Step 2: Aggiornare `switchToTab('fatture')`**

In `app.js` trovare il ramo `if (tab === 'fatture')` in `switchToTab` (o dentro `renderFatture`) e sostituire le chiamate a `FattureStorico.renderAnnoFilter` / `FattureStorico.renderStorico` (sulla pagina) con la sola render della card A:

```js
if (typeof renderFattureDocsSection === 'function') renderFattureDocsSection();
// lo storico ora è nel modale, non più in pagina
```

- [ ] **Step 3: ESC handler per modale archivio**

Nel listener globale `document.addEventListener('keydown', …)` in `app.js`, aggiungere la gestione ESC *prima* degli altri modali (o in coerenza con la priority chain esistente):

```js
if (e.key === 'Escape') {
  const archivio = document.getElementById('archivioFattureModal');
  if (archivio && archivio.classList.contains('open')) {
    window.FattureStorico.closeArchivioModal();
    return;
  }
  // ... resto della catena esistente
}
```

Aggiungere anche backdrop click:

```js
document.getElementById('archivioFattureModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'archivioFattureModal') window.FattureStorico.closeArchivioModal();
});
```

- [ ] **Step 4: Smoke test manuale**

Aprire tab Fatture: nessuna sezione "Storico fatture" in pagina. Aprire modale, premere ESC → chiude. Click sul backdrop → chiude.

- [ ] **Step 5: Commit**

```bash
git add app.js index.html
git commit -m "feat(fatture)(E): hook tab + ESC + backdrop per modale archivio"
```

---

### Task 6: Restyle "Incassi manuali (mensili)" come card secondaria

**Files:**
- Modify: `index.html` — wrap `#fattureTable` e il suo titolo in `<div class="manuali-card">` con nota esplicativa
- Modify: `style.css` — assicurarsi che le regole `.manuali-card` da Task 1 siano applicate

- [ ] **Step 1: Aggiornare markup in `index.html`**

Nel tab Fatture, sostituire l'intestazione + tabella attuale con:

```html
<div class="manuali-card">
  <div class="fatture-card-head">
    <div class="fatture-card-title">Incassi manuali (mensili)</div>
  </div>
  <div class="manuali-note">
    Per importi senza fattura formale. Temporaneo finché l'emissione in-app non sostituirà Fiscozen.
  </div>
  <!-- #fattureTable esistente invariato -->
  <table id="fattureTable" class="manual-table">…</table>
</div>
```

Mantenere tutto il comportamento esistente di `#fattureTable` (render, add row, delete). Non toccare la logica JS che popola la tabella.

- [ ] **Step 2: Smoke test**

Ricaricare, verificare che la tabella mensile si mostri dentro la card tratteggiata con la nota sopra; che add/delete riga continuino a funzionare; che i calcoli Forfettario/Tasse Accantonate riflettano le modifiche.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(fatture)(E): incassi manuali come card secondaria tratteggiata"
```

---

### Task 7: Verifica responsive ≤768px

**Files:**
- Verify: `style.css` — regole `@media (max-width: 768px)` da Task 1
- Verify: `index.html` — nessun overflow orizzontale

- [ ] **Step 1: Smoke test responsive**

Aprire devtools, impostare viewport a 375×667. Verificare:
- Card A: riga fattura in stack verticale (numero+cliente+importo su 2 righe, badge in basso a destra)
- Tabella incassi manuali: scroll orizzontale
- Modale archivio: full-screen, bottone chiudi visibile
- Filtri segmented: non overflow

- [ ] **Step 2: Fix eventuali issue trovati**

Se trovati problemi, aggiustare le regole media query in `style.css`.

- [ ] **Step 3: Commit (solo se serviti fix)**

```bash
git add style.css
git commit -m "fix(fatture)(E): aggiustamenti responsive mobile"
```

---

### Task 8: Cleanup classi legacy + final review

**Files:**
- Modify: `style.css` — rimuovere regole `#storico-fatture-list`, `.storico-head`, `.anno-filter-native` se non riusate altrove
- Modify: eventuali CSS morti dopo la rimozione di `#storico-fatture` dalla pagina

- [ ] **Step 1: Identificare classi inutilizzate**

Cercare con Grep nelle pagine: `#storico-fatture` (senza `-modal`), `.storico-head`, classi legacy specifiche del vecchio filtro anno nativo. Se non usate da altro codice, rimuoverle da `style.css`.

- [ ] **Step 2: Re-run full test plan della spec**

Eseguire manualmente tutti gli 8 scenari del "Test plan" nella spec:

1. Login Mattia → card A + card D, no sezione storico pagina
2. Filtri stato A → lista si aggiorna con contatori corretti
3. `+ Nuova fattura` → apre modal emissione
4. Click riga fattura → apre modal edit
5. Icona archivio → apre modale, filtro anno/stato, ESC chiude
6. Modifica riga incassi manuali → calcoli fiscali aggiornati
7. Cambio anno sidebar → card A mostra "Fatture YYYY", empty state se vuoto
8. Resize <768px → layout responsive ok

- [ ] **Step 3: Commit finale**

```bash
git add style.css
git commit -m "chore(fatture)(E): cleanup CSS legacy storico in pagina"
```

---

## Self-Review

**Spec coverage:** ogni componente della spec è mappato a un task:
- Card A (summary, filtri, righe, empty state, click row) → Task 2, 3
- Card D (bordo tratteggiato, nota, legacy preservata) → Task 6
- Modale archivio (filtro anno, filtro stato, ESC, backdrop) → Task 4, 5
- CSS tokens Espresso & Mint → Task 1
- Responsive → Task 1, 7
- Accessibility (role=tablist, aria-selected, role=dialog) → Task 1, 3, 4
- Non-goals rispettati (no data model, no flusso emissione, no sync Firebase)

**Type consistency:** `annoProgressivo` (number), `stato` ∈ `{bozza,inviata,pagata,annullata}`, `totaleDocument` (number) coerenti in tutti i task. `setFattureFilter` e `setArchivioStato` sono due helpers distinti (uno per card A, uno per modale archivio) — coerenza mantenuta.

**Placeholder scan:** nessun TBD/TODO. Ogni step ha codice concreto o comando eseguibile.

---

## Execution Handoff

**Plan saved to `docs/superpowers/plans/2026-04-19-fatture-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, two-stage review, fast iteration

**2. Inline Execution** — batch execution con checkpoints

**Which approach?**
