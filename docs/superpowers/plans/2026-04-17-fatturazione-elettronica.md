# Fatturazione Elettronica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migliorare la feature fatturazione del progetto Calcoli P.IVA con PDF jsPDF minimalista, audit FatturaPA v1.2 (11 fix), nota di credito TD04, numerazione automatica, storico fatture con stati e anteprima XML in-app.

**Architecture:** Estende `fatture-docs-feature.js` con nuove funzioni (jsPDF builder, NC builder, anteprima XML modal, fix audit) e introduce un nuovo IIFE `fatture-storico.js` (`window.FattureStorico`) per gestione stati, lista storico, numerazione progressiva. Data model esteso in modo backwards-compatible (tutti nuovi campi opzionali). Nessun build step — vanilla JS.

**Tech Stack:** Vanilla JS (IIFE pattern), jsPDF (già caricato via html2pdf bundle: `window.jspdf.jsPDF`), localStorage (`calcoliPIVA_{profile}_fatture`), Firebase sync via `syncProfileMetaToCloud`, CSS variables per dark/light theme.

**Spec di riferimento:** `docs/superpowers/specs/2026-04-17-fatturazione-elettronica-design.md`

---

## Task 0: Setup branch e worktree

**Files:**
- Nessun file modificato

- [ ] **Step 1: Verifica branch base**

Run:
```bash
cd "C:/Users/rossima/OneDrive - TXT e-solutions S.p.A/02_Sviluppo/Applicazioni_interne/Calcoli vari"
git status
git branch --show-current
```

Expected: branch `codex/dev-newfeatures`, working tree pulito (a parte file ignorati `.codex-temp/`, `.claude/settings.local.json`).

- [ ] **Step 2: Crea branch feature e worktree isolato**

Run:
```bash
git worktree add .claude/worktrees/fatturazione-elettronica -b codex/fatturazione-elettronica codex/dev-newfeatures
cd .claude/worktrees/fatturazione-elettronica
```

Expected: nuovo worktree creato, branch `codex/fatturazione-elettronica` checked-out nel worktree.

- [ ] **Step 3: Verifica plan e spec presenti nel worktree**

Run:
```bash
ls docs/superpowers/specs/2026-04-17-fatturazione-elettronica-design.md
ls docs/superpowers/plans/2026-04-17-fatturazione-elettronica.md
```

Expected: entrambi i file esistono (ereditati dal branch base).

- [ ] **Step 4: Commit iniziale di setup (vuoto, solo marker)**

Skip — niente da committare. Si parte direttamente con Task 1.

---

## Task 1: Estensione data model fattura

**Files:**
- Modify: `fatture-docs-feature.js` — `DRAFT_TEMPLATE` e funzioni di normalizzazione

**Obiettivo:** aggiungere i nuovi campi opzionali (`stato`, `dataInvioSdi`, `dataPagamento`, `fatturaOriginaleId`, `tipoDocumento`, `annoProgressivo`, `progressivo`) al template e garantire che le fatture esistenti vengano normalizzate al caricamento (default `stato='bozza'`, `tipoDocumento='TD01'`).

- [ ] **Step 1: Aggiorna `DRAFT_TEMPLATE` in `fatture-docs-feature.js` (dopo riga 41)**

Sostituisci il blocco `DRAFT_TEMPLATE` con:

```js
const DRAFT_TEMPLATE = {
  numero: '',
  data: '',
  clienteId: '',
  righe: [],
  contributoIntegrativo: 0,
  marcaDaBollo: true,
  note: DEFAULT_FORFETTARIO_NOTE,
  modalitaPagamento: DEFAULT_BONIFICO,
  scadenzaPagamento: '',
  incassata: false,
  dataIncasso: '',
  // Nuovi campi sub-project 3
  stato: 'bozza',
  dataInvioSdi: null,
  dataPagamento: null,
  fatturaOriginaleId: null,
  tipoDocumento: 'TD01',
  annoProgressivo: null,
  progressivo: null,
  ritenuta: 0,
  aliquotaRitenuta: 20,
  tipoRitenuta: 'RT02',
  causaleRitenuta: 'A'
};
```

Razionale: i campi `ritenuta`/`aliquotaRitenuta`/`tipoRitenuta`/`causaleRitenuta` servono al fix audit XML #9 (Task 5) e al modal ritenuta (Task 4). Aggiungerli ora evita migrazioni a posteriori.

- [ ] **Step 2: Aggiungi funzione `normalizeInvoice` in `fatture-docs-feature.js` (subito dopo `DRAFT_TEMPLATE`)**

```js
function normalizeInvoice(inv) {
  if (!inv || typeof inv !== 'object') return inv;
  return {
    ...DRAFT_TEMPLATE,
    ...inv,
    stato: inv.stato || 'bozza',
    tipoDocumento: inv.tipoDocumento || 'TD01',
    dataInvioSdi: inv.dataInvioSdi ?? null,
    dataPagamento: inv.dataPagamento ?? null,
    fatturaOriginaleId: inv.fatturaOriginaleId ?? null,
    annoProgressivo: inv.annoProgressivo ?? (inv.data ? parseInt(String(inv.data).slice(0, 4), 10) : null),
    progressivo: inv.progressivo ?? null,
    ritenuta: Number(inv.ritenuta) || 0,
    aliquotaRitenuta: Number(inv.aliquotaRitenuta) || 20,
    tipoRitenuta: inv.tipoRitenuta || 'RT02',
    causaleRitenuta: inv.causaleRitenuta || 'A'
  };
}
```

- [ ] **Step 3: Esponi `normalizeInvoice` su `window` (in fondo al file, sezione `window.*` già esistente)**

Aggiungi dopo `window.downloadFatturaPdf = downloadFatturaPdf;`:

```js
window.normalizeInvoice = normalizeInvoice;
```

Servirà a `FattureStorico` (Task 7).

- [ ] **Step 4: Smoke test in console browser**

Apri `index.html` nel browser, login profilo Demo, apri DevTools console:

```js
normalizeInvoice({ id: 'x', numero: '2024/001', data: '2024-05-12', righe: [] })
```

Expected: oggetto con `stato: 'bozza'`, `tipoDocumento: 'TD01'`, `annoProgressivo: 2024`, tutti i nuovi campi presenti.

- [ ] **Step 5: Commit**

```bash
git add fatture-docs-feature.js
git commit -m "feat(fatture): estende data model con stato/tipoDocumento/progressivo (sub-project 3 task 1)"
```

---

## Task 2: Modulo `fatture-storico.js` — fondamenta (load/save/numerazione)

**Files:**
- Create: `fatture-storico.js`

**Obiettivo:** creare l'IIFE `FattureStorico` con API minime: `load(profile)`, `save(profile, fatture)`, `nextProgressivo(anno, fatture)`, `formatNumero(anno, progressivo)`. Senza UI ancora — solo data layer.

- [ ] **Step 1: Crea `fatture-storico.js` con scheletro IIFE**

```js
/* Fatture: gestione storico, stati, numerazione progressiva (sub-project 3) */
(function () {
  const STORAGE_PREFIX = 'calcoliPIVA_';
  const STORAGE_SUFFIX = '_fatture';

  function storageKey(profile) {
    if (!profile) throw new Error('FattureStorico: profile richiesto');
    return STORAGE_PREFIX + profile + STORAGE_SUFFIX;
  }

  function load(profile) {
    try {
      const raw = localStorage.getItem(storageKey(profile));
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      const norm = typeof window.normalizeInvoice === 'function' ? window.normalizeInvoice : (x => x);
      return arr.map(norm);
    } catch (err) {
      console.warn('FattureStorico.load: errore parse', err);
      return [];
    }
  }

  function save(profile, fatture) {
    if (!Array.isArray(fatture)) throw new Error('FattureStorico.save: fatture deve essere array');
    localStorage.setItem(storageKey(profile), JSON.stringify(fatture));
    if (typeof window.syncProfileMetaToCloud === 'function') {
      try { window.syncProfileMetaToCloud(profile, 'fatture'); } catch (_) { /* sync best-effort */ }
    }
  }

  function nextProgressivo(anno, fatture) {
    const list = Array.isArray(fatture) ? fatture : [];
    const max = list
      .filter(f => Number(f.annoProgressivo) === Number(anno))
      .reduce((acc, f) => Math.max(acc, Number(f.progressivo) || 0), 0);
    return max + 1;
  }

  function formatNumero(anno, progressivo) {
    const a = Number(anno) || new Date().getFullYear();
    const p = Number(progressivo) || 1;
    return a + '/' + String(p).padStart(3, '0');
  }

  window.FattureStorico = {
    load,
    save,
    nextProgressivo,
    formatNumero,
    storageKey
  };
})();
```

- [ ] **Step 2: Aggiungi `<script>` tag in `index.html`**

Cerca la riga che include `fatture-docs-feature.js` (probabilmente verso la fine del `<body>`):

```bash
grep -n "fatture-docs-feature.js" index.html
```

Aggiungi subito SOTTO quella riga:

```html
<script src="fatture-storico.js"></script>
```

L'ordine conta: `fatture-storico.js` deve caricarsi DOPO `fatture-docs-feature.js` perché usa `window.normalizeInvoice`.

- [ ] **Step 3: Smoke test in console browser**

Ricarica `index.html`, console:

```js
FattureStorico.formatNumero(2025, 7)        // "2025/007"
FattureStorico.nextProgressivo(2025, [])    // 1
FattureStorico.nextProgressivo(2025, [{ annoProgressivo: 2025, progressivo: 3 }, { annoProgressivo: 2025, progressivo: 1 }])  // 4
FattureStorico.load('Demo')                  // array fatture esistenti normalizzate
```

Expected: tutti i risultati come commentato sopra. Nessun errore in console.

- [ ] **Step 4: Commit**

```bash
git add fatture-storico.js index.html
git commit -m "feat(fatture): nuovo modulo FattureStorico con load/save/numerazione (sub-project 3 task 2)"
```

---

## Task 3: PDF jsPDF minimalista — sostituzione html2pdf

**Files:**
- Modify: `fatture-docs-feature.js` — sostituisce `buildInvoiceHtmlNode`, `downloadFatturaPdf`, `previewFatturaPdf` (righe ~636-740)

**Obiettivo:** rimpiazzare il flusso html2pdf (rendering HTML → canvas → PDF) con generazione PDF puro via `window.jspdf.jsPDF`. Layout minimalista A4 portrait, margini 20mm, palette teal/ink/muted/border come da spec §4.

- [ ] **Step 1: Aggiungi helper `buildInvoicePdfMinimal(invoice)` in `fatture-docs-feature.js`**

Inserisci PRIMA di `buildInvoiceHtmlNode` (intorno a riga 636). Funzione completa:

```js
// --- MOTORE PDF MINIMALISTA (jsPDF) ---
function buildInvoicePdfMinimal(invoice) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error('jsPDF non disponibile (verifica caricamento html2pdf bundle)');
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const INK    = [18, 26, 36];
  const MUTED  = [100, 116, 139];
  const BORDER = [226, 232, 240];
  const ACCENT = [60, 143, 145];
  const NEGATIVE = [200, 50, 50];

  const PAGE_W = 210;
  const MARGIN = 20;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  const isNC = invoice.tipoDocumento === 'TD04';
  const titolo = isNC ? 'NOTA DI CREDITO' : 'FATTURA';

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor.apply(doc, INK);
  doc.text(titolo + ' N. ' + (invoice.numero || ''), MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor.apply(doc, MUTED);
  doc.text('Data: ' + formatDateIt(invoice.data), PAGE_W - MARGIN, y, { align: 'right' });
  y += 7;
  if (isNC && invoice.fatturaOriginaleId) {
    doc.setFontSize(9);
    doc.text('Storno fattura: ' + (invoice._fatturaOriginaleNumero || invoice.fatturaOriginaleId), MARGIN, y);
    y += 5;
  }

  // Linea separatrice
  doc.setDrawColor.apply(doc, BORDER);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  // Due colonne emittente/destinatario
  const colW = CONTENT_W / 2 - 5;
  const yStart = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor.apply(doc, MUTED);
  doc.text('EMITTENTE', MARGIN, y);
  doc.text('DESTINATARIO', MARGIN + colW + 10, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor.apply(doc, INK);

  const emittente = invoice._emittente || {};
  const cliente = invoice.clienteSnapshot || {};
  const emLines = [
    emittente.denominazione || (emittente.nome + ' ' + (emittente.cognome || '')).trim(),
    emittente.partitaIva ? 'P.IVA ' + emittente.partitaIva : '',
    emittente.codiceFiscale ? 'CF ' + emittente.codiceFiscale : '',
    [emittente.indirizzo, emittente.cap, emittente.comune, emittente.provincia].filter(Boolean).join(' ')
  ].filter(Boolean);
  const clLines = [
    cliente.denominazione || (cliente.nome + ' ' + (cliente.cognome || '')).trim(),
    cliente.partitaIva ? 'P.IVA ' + cliente.partitaIva : (cliente.codiceFiscale ? 'CF ' + cliente.codiceFiscale : ''),
    [cliente.indirizzo, cliente.cap, cliente.comune, cliente.provincia].filter(Boolean).join(' ')
  ].filter(Boolean);

  let yL = y, yR = y;
  emLines.forEach(line => { doc.text(line, MARGIN, yL); yL += 5; });
  clLines.forEach(line => { doc.text(line, MARGIN + colW + 10, yR); yR += 5; });
  y = Math.max(yL, yR) + 4;

  doc.setDrawColor.apply(doc, BORDER);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  // Tabella righe
  const colDesc = MARGIN;
  const colQta = MARGIN + 100;
  const colUnit = MARGIN + 130;
  const colTot = PAGE_W - MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor.apply(doc, MUTED);
  doc.text('DESCRIZIONE', colDesc, y);
  doc.text('Q.tà', colQta, y, { align: 'right' });
  doc.text('Prezzo', colUnit, y, { align: 'right' });
  doc.text('Totale', colTot, y, { align: 'right' });
  y += 3;
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor.apply(doc, INK);
  const PAGE_H = 297;
  const FOOTER_RESERVE = 60;
  (invoice.righe || []).forEach(r => {
    if (y > PAGE_H - FOOTER_RESERVE) {
      doc.addPage();
      y = MARGIN;
    }
    const desc = String(r.descrizione || '');
    const qta = Number(r.quantita) || 0;
    const prezzo = Number(r.prezzoUnitario) || 0;
    const totRiga = qta * prezzo * (isNC ? -1 : 1);
    const wrapped = doc.splitTextToSize(desc, 95);
    wrapped.forEach((line, idx) => {
      doc.text(line, colDesc, y);
      if (idx === 0) {
        doc.text(formatNumIt(qta), colQta, y, { align: 'right' });
        doc.text(formatEur(prezzo), colUnit, y, { align: 'right' });
        if (totRiga < 0) doc.setTextColor.apply(doc, NEGATIVE);
        doc.text(formatEur(totRiga), colTot, y, { align: 'right' });
        doc.setTextColor.apply(doc, INK);
      }
      y += 5;
    });
  });

  y += 3;
  doc.setDrawColor.apply(doc, BORDER);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  // Riepilogo
  const totals = invoice._totals || {};
  const sign = isNC ? -1 : 1;
  const labelX = PAGE_W - MARGIN - 60;
  const valX = PAGE_W - MARGIN;
  doc.setFontSize(10);

  function row(label, val, opts = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setTextColor.apply(doc, opts.color || INK);
    doc.text(label, labelX, y);
    doc.text(formatEur(val * sign), valX, y, { align: 'right' });
    y += 5;
  }
  row('Imponibile', totals.imponibile || 0);
  if (totals.contributoIntegrativo) row('Contributo integrativo', totals.contributoIntegrativo);
  if (invoice.marcaDaBollo && (totals.imponibile || 0) > 77.47) row('Marca da bollo', 2);
  if (Number(invoice.ritenuta) > 0) {
    doc.setTextColor.apply(doc, NEGATIVE);
    doc.text('Ritenuta', labelX, y);
    doc.text('-' + formatEur(Number(invoice.ritenuta)), valX, y, { align: 'right' });
    doc.setTextColor.apply(doc, INK);
    y += 5;
  }
  // Linea accent teal sopra il totale
  doc.setDrawColor.apply(doc, ACCENT);
  doc.setLineWidth(0.4);
  doc.line(labelX, y, valX, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TOTALE', labelX, y);
  doc.text(formatEur((totals.totalePagamento || totals.totale || 0) * sign), valX, y, { align: 'right' });
  y += 10;

  // Pagamento
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor.apply(doc, MUTED);
  if (invoice.modalitaPagamento) {
    doc.text('Pagamento: ' + invoice.modalitaPagamento + (invoice.scadenzaPagamento ? ' — Scadenza ' + formatDateIt(invoice.scadenzaPagamento) : ''), MARGIN, y);
    y += 4;
  }
  if (invoice.iban) {
    doc.text('IBAN: ' + invoice.iban, MARGIN, y);
    y += 4;
  }

  // Footer legale (forfettario)
  y += 4;
  doc.setDrawColor.apply(doc, BORDER);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor.apply(doc, MUTED);
  const note = invoice.note || DEFAULT_FORFETTARIO_NOTE;
  doc.splitTextToSize(note, CONTENT_W).forEach(line => { doc.text(line, MARGIN, y); y += 3.5; });

  return doc;
}

function formatDateIt(iso) {
  const parts = parseDateParts(iso);
  if (!parts) return String(iso || '');
  return String(parts.day).padStart(2, '0') + '/' + String(parts.month).padStart(2, '0') + '/' + parts.year;
}
function formatEur(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function formatNumIt(n) {
  return Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
```

NOTA: `invoice._totals` e `invoice._emittente` sono campi calcolati che il caller deve popolare. Vedi Step 2.

- [ ] **Step 2: Riscrivi `downloadFatturaPdf` e `previewFatturaPdf`**

Sostituisci entrambe le funzioni (righe ~714-740 originali) con:

```js
function _enrichInvoiceForPdf(invoice) {
  const totals = computeTotals(invoice);  // funzione esistente nel file
  const emittente = (typeof getEmittenteData === 'function') ? getEmittenteData() : (window.emittenteCorrente || {});
  return { ...invoice, _totals: totals, _emittente: emittente };
}

async function downloadFatturaPdf() {
  try {
    const saved = persistDraft();
    if (!saved) return;
    const enriched = _enrichInvoiceForPdf(saved);
    const doc = buildInvoicePdfMinimal(enriched);
    const filename = 'fattura_' + String(saved.numero || 'senza-numero').replace(/\//g, '-') + '.pdf';
    doc.save(filename);
    showToast('PDF scaricato');
  } catch (err) {
    console.error('downloadFatturaPdf', err);
    showToast('Errore generazione PDF: ' + err.message);
  }
}

async function previewFatturaPdf() {
  try {
    const saved = persistDraft();
    if (!saved) return;
    const enriched = _enrichInvoiceForPdf(saved);
    const doc = buildInvoicePdfMinimal(enriched);
    const blob = doc.output('blob');
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(blob);
    window.open(state.previewUrl, '_blank');
  } catch (err) {
    console.error('previewFatturaPdf', err);
    showToast('Errore anteprima PDF: ' + err.message);
  }
}
```

NOTA bene: `computeTotals`, `persistDraft`, `getEmittenteData`, `showToast` sono nomi presunti; **prima di scrivere, verifica i nomi reali** con:

```bash
grep -nE "function (compute|persistDraft|getEmittente|showToast|buildSummary|calcola)" fatture-docs-feature.js | head -30
```

Adatta le chiamate ai nomi effettivi (la struttura logica resta identica).

- [ ] **Step 3: Rimuovi `buildInvoiceHtmlNode` (deprecata)**

Cancella l'intera funzione `buildInvoiceHtmlNode` (righe originali ~637-712). Verifica che non sia chiamata altrove:

```bash
grep -n "buildInvoiceHtmlNode" fatture-docs-feature.js index.html app.js
```

Expected: nessun riferimento residuo dopo la rimozione.

- [ ] **Step 4: Smoke test PDF nel browser**

Apri `index.html`, login Demo, vai a tab Fatture, crea una fattura test con 3 righe + bollo + ritenuta 20%, click "Scarica PDF".

Expected:
- File `fattura_2025-XXX.pdf` scaricato
- Header "FATTURA N. 2025/XXX  Data: GG/MM/AAAA"
- Due colonne EMITTENTE/DESTINATARIO popolate
- Tabella righe con prezzi formattati it-IT
- Riepilogo con linea teal sopra TOTALE
- Footer legale forfettario presente

Se il layout è errato, fixa prima di committare.

- [ ] **Step 5: Smoke test multi-pagina**

Crea fattura con 25 righe (descrizioni lunghe). Scarica PDF.

Expected: PDF su 2 pagine, nessuna riga troncata, footer legale solo sull'ultima pagina (accettabile anche su entrambe — non bloccante).

- [ ] **Step 6: Commit**

```bash
git add fatture-docs-feature.js
git commit -m "feat(fatture): PDF jsPDF minimalista, rimuove html2pdf rendering (sub-project 3 task 3)"
```

---

## Task 4: Modal ritenuta e campi UI

**Files:**
- Modify: `fatture-docs-feature.js` — modal nuova fattura, sezione ritenuta
- Modify: `index.html` — eventuale markup del modal (se non generato in JS)

**Obiettivo:** aggiungere al modal "Nuova fattura" la sezione opzionale ritenuta con: importo (calcolato auto da aliquota × imponibile), aliquota (default 20%), tipo ritenuta (RT01 persone fisiche / RT02 persone giuridiche), causale pagamento (default 'A' = prestazioni di lavoro autonomo). I valori popolano i campi del data model aggiunti in Task 1.

- [ ] **Step 1: Trova la sezione del modal nuova fattura**

```bash
grep -n "marcaDaBollo\|contributoIntegrativo\|modalitaPagamento" fatture-docs-feature.js | head -20
```

Identifica dove vengono renderizzati i campi opzionali nel modal (probabilmente in una funzione `renderInvoiceModal` o `buildInvoiceForm`).

- [ ] **Step 2: Aggiungi blocco UI ritenuta**

Subito dopo il blocco `marcaDaBollo`, aggiungi (nel template di markup del modal):

```html
<div class="form-section">
  <label class="checkbox-label">
    <input type="checkbox" id="invHasRitenuta"> Applica ritenuta d'acconto
  </label>
  <div id="invRitenutaFields" style="display:none; margin-top:8px;">
    <div class="form-row">
      <label>Aliquota %
        <input type="number" id="invAliquotaRitenuta" min="0" max="100" step="0.01" value="20">
      </label>
      <label>Tipo ritenuta
        <select id="invTipoRitenuta">
          <option value="RT01">RT01 — Persone fisiche</option>
          <option value="RT02" selected>RT02 — Persone giuridiche</option>
        </select>
      </label>
      <label>Causale
        <input type="text" id="invCausaleRitenuta" maxlength="2" value="A" style="width:60px;">
      </label>
    </div>
    <div class="form-row">
      <span>Importo ritenuta calcolato: <strong id="invRitenutaImporto">0,00 €</strong></span>
    </div>
  </div>
</div>
```

Inseriscilo nella stringa template usata per generare il modal (probabilmente in una funzione che ritorna HTML come stringa).

- [ ] **Step 3: Aggiungi handler per toggle e calcolo automatico**

Nel punto in cui vengono attaccati gli event listener del modal (cerca `addEventListener` vicino al rendering del modal), aggiungi:

```js
function _bindRitenutaHandlers() {
  const chk = document.getElementById('invHasRitenuta');
  const fields = document.getElementById('invRitenutaFields');
  const aliq = document.getElementById('invAliquotaRitenuta');
  const tipo = document.getElementById('invTipoRitenuta');
  const caus = document.getElementById('invCausaleRitenuta');
  const importoEl = document.getElementById('invRitenutaImporto');
  if (!chk || !fields) return;

  // Init da draft
  const hasR = Number(state.draft.ritenuta) > 0;
  chk.checked = hasR;
  fields.style.display = hasR ? 'block' : 'none';
  if (hasR) {
    aliq.value = state.draft.aliquotaRitenuta;
    tipo.value = state.draft.tipoRitenuta || 'RT02';
    caus.value = state.draft.causaleRitenuta || 'A';
  }

  function recalc() {
    if (!chk.checked) {
      state.draft.ritenuta = 0;
      importoEl.textContent = '0,00 €';
      return;
    }
    const totals = computeTotals(state.draft);
    const a = Number(aliq.value) || 0;
    const importo = round2((totals.imponibile || 0) * a / 100);
    state.draft.ritenuta = importo;
    state.draft.aliquotaRitenuta = a;
    state.draft.tipoRitenuta = tipo.value;
    state.draft.causaleRitenuta = (caus.value || 'A').toUpperCase().slice(0, 2);
    importoEl.textContent = formatEur(importo);
  }

  chk.addEventListener('change', () => {
    fields.style.display = chk.checked ? 'block' : 'none';
    recalc();
  });
  [aliq, tipo, caus].forEach(el => el && el.addEventListener('input', recalc));

  // Trigger ricalcolo anche quando cambiano le righe (idealmente, una callback già esiste)
  recalc();
}
```

Chiama `_bindRitenutaHandlers()` subito dopo che il markup del modal è stato inserito nel DOM e dopo gli altri bind.

- [ ] **Step 4: Smoke test modal ritenuta**

Browser: Nuova fattura → spunta "Applica ritenuta" → cambia aliquota a 23% → aggiungi riga 1.000 €. Expected: "Importo ritenuta calcolato: 230,00 €".

Salva, riapri la fattura: expected checkbox e campi pre-compilati.

- [ ] **Step 5: Commit**

```bash
git add fatture-docs-feature.js
git commit -m "feat(fatture): modal ritenuta d'acconto con calcolo auto (sub-project 3 task 4)"
```

---

## Task 5: Audit FatturaPA XML — 11 fix

**Files:**
- Modify: `fatture-docs-feature.js` — funzione `buildFatturaElettronicaXml` (riga ~770) e helper

**Obiettivo:** applicare i fix 1-11 della checklist spec §5. Procediamo a step incrementali, uno per fix critico, per facilitare review e bisect.

- [ ] **Step 1: Aggiungi helper validazione**

In testa al file, dopo le costanti, aggiungi:

```js
function sanitizeProgressivoInvio(s) {
  return String(s || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || '00001';
}
function isValidPartitaIvaIT(s) {
  return /^\d{11}$/.test(String(s || '').replace(/\s+/g, ''));
}
function isValidCodiceFiscale(cf) {
  // Riusa validatore esistente se presente
  if (typeof window.DichiarazioneEngine?.validateCodiceFiscale === 'function') {
    return window.DichiarazioneEngine.validateCodiceFiscale(cf);
  }
  return /^[A-Z0-9]{16}$/i.test(String(cf || '').trim());
}
function applicaBolloSeDovuto(imponibile, marcaDaBollo) {
  return marcaDaBollo && Number(imponibile) > 77.47;
}
```

- [ ] **Step 2: Fix #1 — `ProgressivoInvio` sanitizzato**

Trova in `buildFatturaElettronicaXml` la riga che genera `<ProgressivoInvio>...</ProgressivoInvio>`. Sostituisci il valore con `sanitizeProgressivoInvio(invoice.numero || invoice.id)`.

- [ ] **Step 3: Fix #3 — `IdPaese` + `IdCodice` cedente/cessionario**

Verifica che il blocco `IdFiscaleIVA` produca:
```xml
<IdFiscaleIVA>
  <IdPaese>IT</IdPaese>
  <IdCodice>11122233344</IdCodice>
</IdFiscaleIVA>
```

con `IdCodice` = P.IVA strippata di spazi e validata via `isValidPartitaIvaIT`. Se invalida, log warning in console e mantieni il valore (lasciare passare l'XML; l'utente vedrà rifiuto SdI).

- [ ] **Step 4: Fix #4 — `RegimeFiscale` da settings**

Sostituisci eventuale `RF19` hardcodato con:

```js
const regimeFiscale = (window.settings?.regime === 'ordinario') ? 'RF01' : 'RF19';
```

(o legge dal contesto profilo come già fa il resto del file).

- [ ] **Step 5: Fix #5 e #6 — `Natura` e `AliquotaIVA` su ogni riga**

Nel loop di generazione `<DettaglioLinee>`, assicurati che ogni riga produca:

```xml
<DettaglioLinee>
  ...
  <PrezzoTotale>1000.00</PrezzoTotale>
  <AliquotaIVA>0.00</AliquotaIVA>
  <Natura>N2.2</Natura>
</DettaglioLinee>
```

Per il forfettario (RF19) la `Natura` di default è `N2.2`. Per ordinario senza IVA esente: `N1`. `AliquotaIVA=0.00` è obbligatoria SEMPRE (anche con Natura presente). Verifica e fixa.

- [ ] **Step 6: Fix #7 — `DatiBollo` solo se imponibile > 77,47**

Nel blocco che genera `<DatiBollo>`, wrappa con:

```js
if (applicaBolloSeDovuto(totals.imponibile, invoice.marcaDaBollo)) {
  // emetti <DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo>
}
```

- [ ] **Step 7: Fix #8 — Cessionario privato senza P.IVA**

Nella sezione `CessionarioCommittente`, gestisci il caso senza P.IVA:

```js
const c = invoice.clienteSnapshot || {};
let datiAnagrafici = '';
if (c.partitaIva && isValidPartitaIvaIT(c.partitaIva)) {
  datiAnagrafici = `
    <IdFiscaleIVA>
      <IdPaese>${c.paese || 'IT'}</IdPaese>
      <IdCodice>${esc(c.partitaIva)}</IdCodice>
    </IdFiscaleIVA>`;
} else {
  // Privato: CF obbligatorio
  if (!c.codiceFiscale) {
    console.warn('Cessionario privato senza CF: XML potrebbe essere rifiutato da SdI');
  }
  datiAnagrafici = `<CodiceFiscale>${esc(c.codiceFiscale || '')}</CodiceFiscale>`;
}
```

E nel blocco `DatiTrasmissione`, per privato usa `CodiceDestinatario=0000000`:

```js
const codDest = (c.codiceDestinatario && c.codiceDestinatario.trim()) || '0000000';
```

- [ ] **Step 8: Fix #9 — `DatiRitenuta`**

Subito DOPO il blocco `DatiBollo` (e PRIMA di `ImportoTotaleDocumento`), aggiungi:

```js
let xmlRitenuta = '';
if (Number(invoice.ritenuta) > 0) {
  const tipo = invoice.tipoRitenuta || 'RT02';
  const caus = (invoice.causaleRitenuta || 'A').toUpperCase().slice(0, 2);
  xmlRitenuta = `
    <DatiRitenuta>
      <TipoRitenuta>${tipo}</TipoRitenuta>
      <ImportoRitenuta>${Number(invoice.ritenuta).toFixed(2)}</ImportoRitenuta>
      <AliquotaRitenuta>${Number(invoice.aliquotaRitenuta).toFixed(2)}</AliquotaRitenuta>
      <CausalePagamento>${esc(caus)}</CausalePagamento>
    </DatiRitenuta>`;
}
```

E concatena `xmlRitenuta` nella stringa di output al posto giusto. `DatiRitenuta` va dentro `DatiGeneraliDocumento`, prima di `ImportoTotaleDocumento`.

- [ ] **Step 9: Fix #10 — Contributo integrativo come riga separata**

Verifica che, se `invoice.contributoIntegrativo > 0`, venga emessa una `<DettaglioLinee>` aggiuntiva (NumeroLinea = ultimo+1) con descrizione "Contributo integrativo X%", `PrezzoUnitario` calcolato, `AliquotaIVA=0.00`, `Natura` uguale alla natura delle altre righe (N2.2 per forfettario). Se la logica esistente lo include nella riga principale, scorporalo in linea separata.

- [ ] **Step 10: Fix #11 — `ImportoPagamento` netto ritenuta**

Nel blocco `<DatiPagamento><DettaglioPagamento>`, calcola:

```js
const totaleLordo = totals.imponibile + (totals.contributoIntegrativo || 0) + (applicaBolloSeDovuto(totals.imponibile, invoice.marcaDaBollo) ? 2 : 0);
const importoPagamento = totaleLordo - (Number(invoice.ritenuta) || 0);
```

ed emetti `<ImportoPagamento>${importoPagamento.toFixed(2)}</ImportoPagamento>`.

- [ ] **Step 11: Fix #2 — Validazione `CodiceFiscale` cedente con warning**

All'inizio di `buildFatturaElettronicaXml`, aggiungi:

```js
const cfCedente = (window.emittenteCorrente?.codiceFiscale) || '';
if (cfCedente && !isValidCodiceFiscale(cfCedente)) {
  console.warn('CF cedente non valido:', cfCedente);
  if (typeof showToast === 'function') showToast('Attenzione: CF cedente non valido (verifica anagrafica)');
}
```

- [ ] **Step 12: Smoke test XML — fattura standard forfettario**

Browser: crea fattura test (1 riga, 1.000 €, bollo on, ritenuta off, cliente con P.IVA), scarica XML.

Expected nel file XML:
- `<RegimeFiscale>RF19</RegimeFiscale>`
- `<AliquotaIVA>0.00</AliquotaIVA>` su ogni riga
- `<Natura>N2.2</Natura>` su ogni riga
- `<DatiBollo>` PRESENTE (imponibile 1.000 > 77,47)
- `<ImportoTotaleDocumento>1002.00</ImportoTotaleDocumento>`
- `<ImportoPagamento>1002.00</ImportoPagamento>`

- [ ] **Step 13: Smoke test XML — soglia bollo**

Crea fattura 50 €, bollo on. Expected: `<DatiBollo>` ASSENTE (sotto soglia 77,47).

- [ ] **Step 14: Smoke test XML — ritenuta 20%**

Crea fattura 1.000 €, bollo off, ritenuta 20%. Expected:
- `<DatiRitenuta>` con `<TipoRitenuta>RT02</TipoRitenuta>`, `<ImportoRitenuta>200.00</ImportoRitenuta>`, `<AliquotaRitenuta>20.00</AliquotaRitenuta>`, `<CausalePagamento>A</CausalePagamento>`
- `<ImportoTotaleDocumento>1000.00</ImportoTotaleDocumento>`
- `<ImportoPagamento>800.00</ImportoPagamento>`

- [ ] **Step 15: Smoke test XML — privato senza P.IVA**

Crea fattura a privato (solo CF, no P.IVA). Expected:
- Cessionario con `<CodiceFiscale>...</CodiceFiscale>` (no `<IdFiscaleIVA>`)
- `<CodiceDestinatario>0000000</CodiceDestinatario>`

- [ ] **Step 16: Validazione XML con xsd (opzionale ma consigliato)**

Se hai accesso a un validatore FatturaPA online (es. AdE simulatore SdI), upload un XML test e verifica zero errori bloccanti. Annota eventuali warning non bloccanti.

- [ ] **Step 17: Commit**

```bash
git add fatture-docs-feature.js
git commit -m "fix(fatture): audit FatturaPA v1.2 — 11 fix conformità (sub-project 3 task 5)"
```

---

## Task 6: Nota di credito TD04 — XML builder

**Files:**
- Modify: `fatture-docs-feature.js` — aggiunge `buildFatturaElettronicaXmlNC`

**Obiettivo:** generare XML TD04 con `DatiFattureCollegate` riferito alla fattura originale, importi negativi, righe prefissate "STORNO — ".

- [ ] **Step 1: Aggiungi `buildFatturaElettronicaXmlNC`**

Inserisci subito dopo `buildFatturaElettronicaXml`:

```js
function buildFatturaElettronicaXmlNC(noteCredit, fatturaOriginale) {
  if (!fatturaOriginale) {
    throw new Error('NC: fattura originale richiesta per DatiFattureCollegate');
  }
  // Forziamo il tipo
  const draft = { ...noteCredit, tipoDocumento: 'TD04', _isNC: true };

  // Riusa buildFatturaElettronicaXml passando draft con flag _isNC
  // Nel builder principale, gestire _isNC per:
  //   - <TipoDocumento>TD04</TipoDocumento>
  //   - aggiungere <DatiFattureCollegate> dopo <DatiGeneraliDocumento>
  //   - importi negativi (PrezzoTotale, ImportoTotaleDocumento)

  return buildFatturaElettronicaXml(draft, { fatturaOriginale });
}
```

- [ ] **Step 2: Estendi `buildFatturaElettronicaXml` per gestire `_isNC`**

Modifica firma: `function buildFatturaElettronicaXml(invoice, opts = {})`. Dentro:

```js
const isNC = invoice._isNC === true || invoice.tipoDocumento === 'TD04';
const tipoDoc = isNC ? 'TD04' : 'TD01';
const sign = isNC ? -1 : 1;
```

Sostituisci `<TipoDocumento>TD01</TipoDocumento>` con `<TipoDocumento>${tipoDoc}</TipoDocumento>`.

Per gli importi: applica `* sign` su `PrezzoTotale` di ogni riga, `ImportoTotaleDocumento`, `ImportoPagamento`. Per la NC il bollo NON va ripetuto (vedi spec §6); aggiungi guard:

```js
const emettiBollo = !isNC && applicaBolloSeDovuto(totals.imponibile, invoice.marcaDaBollo);
```

- [ ] **Step 3: Aggiungi `DatiFattureCollegate` per NC**

Subito dopo il blocco `</DatiGeneraliDocumento>`, prima di `<DatiBeniServizi>`:

```js
let datiCollegate = '';
if (isNC && opts.fatturaOriginale) {
  const orig = opts.fatturaOriginale;
  datiCollegate = `
    <DatiFattureCollegate>
      <RiferimentoNumeroLinea>1</RiferimentoNumeroLinea>
      <IdDocumento>${esc(orig.numero)}</IdDocumento>
      <Data>${esc(orig.data)}</Data>
    </DatiFattureCollegate>`;
}
```

E concatena `datiCollegate` nella stringa XML al punto giusto (FatturaPA v1.2: `DatiFattureCollegate` è dentro `DatiGenerali`, non dentro `DatiGeneraliDocumento` — verifica posizione esatta nella struttura esistente).

- [ ] **Step 4: Esponi `buildFatturaElettronicaXmlNC` su window**

In fondo al file:

```js
window.buildFatturaElettronicaXmlNC = buildFatturaElettronicaXmlNC;
```

- [ ] **Step 5: Smoke test XML NC**

In console browser, dopo aver creato una fattura test #2025/001:

```js
const orig = FattureStorico.load('Demo').find(f => f.numero === '2025/001');
const nc = { ...orig, numero: '2025/002', tipoDocumento: 'TD04', fatturaOriginaleId: orig.id, data: '2025-06-01' };
const xml = buildFatturaElettronicaXmlNC(nc, orig);
console.log(xml);
```

Expected nell'output:
- `<TipoDocumento>TD04</TipoDocumento>`
- `<DatiFattureCollegate>` con `<IdDocumento>2025/001</IdDocumento>` e `<Data>YYYY-MM-DD>`
- `<ImportoTotaleDocumento>` con valore NEGATIVO
- Nessun `<DatiBollo>` anche se l'originale ne aveva uno

- [ ] **Step 6: Commit**

```bash
git add fatture-docs-feature.js
git commit -m "feat(fatture): NC TD04 — builder XML con DatiFattureCollegate (sub-project 3 task 6)"
```

---

## Task 7: Storico fatture — UI lista, stati, azioni

**Files:**
- Modify: `fatture-storico.js` — aggiunge funzioni di rendering e azioni
- Modify: `index.html` — contenitore storico nel tab Fatture
- Modify: `style.css` — badge stato + tabella storico
- Possibly modify: `fatture-docs-feature.js` — entry point per "duplica" / "nota credito"

**Obiettivo:** rendere visibile la lista storico nel tab Fatture con badge stato, filtro anno, e azioni per riga (Riapri, Duplica, Segna inviata, Segna pagata, Nota di credito, Annulla).

- [ ] **Step 1: Aggiungi contenitore HTML in `index.html`**

Trova nel tab Fatture il pulsante "Nuova fattura":

```bash
grep -n "Nuova fattura\|openFatturaModal\|tab-fatture" index.html
```

Subito sotto quel pulsante, aggiungi:

```html
<div id="storico-fatture" class="card" style="margin-top:16px;">
  <div class="card-header">
    <h3>Storico fatture</h3>
    <select id="storico-anno-filter"></select>
  </div>
  <div id="storico-fatture-list">
    <p class="muted">Nessuna fattura ancora.</p>
  </div>
</div>
```

- [ ] **Step 2: Aggiungi stili badge in `style.css` (in fondo al file)**

```css
.badge-stato {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.badge-stato.bozza     { background: var(--text-secondary); color: var(--bg-primary); opacity: .8; }
.badge-stato.inviata   { background: var(--color-chart-netto); color: #fff; }
.badge-stato.pagata    { background: #2ecc71; color: #fff; }
.badge-stato.annullata { background: var(--color-chart-tasse); color: #fff; }
.storico-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.storico-table th, .storico-table td { padding: 8px; border-bottom: 1px solid var(--border); text-align: left; }
.storico-table th { color: var(--text-secondary); font-weight: 500; font-size: 11px; text-transform: uppercase; }
.storico-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.storico-actions button { padding: 4px 8px; font-size: 11px; }
```

- [ ] **Step 3: Aggiungi `renderStorico` e `renderAnnoFilter` in `fatture-storico.js`**

Dentro l'IIFE, sopra l'export `window.FattureStorico`:

```js
function getCurrentProfile() {
  return (typeof window.getProfile === 'function')
    ? window.getProfile()
    : sessionStorage.getItem('calcoliPIVA_profile');
}

function renderAnnoFilter(selectedAnno) {
  const sel = document.getElementById('storico-anno-filter');
  if (!sel) return;
  const fatture = load(getCurrentProfile());
  const anni = Array.from(new Set(fatture.map(f => f.annoProgressivo).filter(Boolean))).sort((a, b) => b - a);
  const annoCorrente = new Date().getFullYear();
  if (!anni.includes(annoCorrente)) anni.unshift(annoCorrente);
  const sel2 = selectedAnno || annoCorrente;
  // Build options usando DOM API (no innerHTML literal)
  while (sel.firstChild) sel.removeChild(sel.firstChild);
  anni.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    if (a === sel2) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = () => renderStorico(Number(sel.value));
}

function renderStorico(annoFiltro) {
  const container = document.getElementById('storico-fatture-list');
  if (!container) return;
  const profile = getCurrentProfile();
  const fatture = load(profile);
  const anno = annoFiltro || new Date().getFullYear();
  const filtered = fatture
    .filter(f => Number(f.annoProgressivo) === anno)
    .sort((a, b) => (b.progressivo || 0) - (a.progressivo || 0));

  while (container.firstChild) container.removeChild(container.firstChild);
  if (!filtered.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Nessuna fattura per l\u2019anno ' + anno;
    container.appendChild(p);
    return;
  }

  const table = document.createElement('table');
  table.className = 'storico-table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['Numero', 'Data', 'Cliente', 'Importo', 'Tipo', 'Stato', 'Azioni'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  filtered.forEach(f => tbody.appendChild(_buildRow(f, profile)));
  table.appendChild(tbody);
  container.appendChild(table);
}

function _buildRow(f, profile) {
  const tr = document.createElement('tr');
  const cells = [
    f.numero || '—',
    _formatDate(f.data),
    (f.clienteSnapshot && (f.clienteSnapshot.denominazione || (f.clienteSnapshot.nome + ' ' + (f.clienteSnapshot.cognome || '')).trim())) || '—',
    _formatEur(_calcTotale(f)),
    f.tipoDocumento || 'TD01'
  ];
  cells.forEach(c => {
    const td = document.createElement('td');
    td.textContent = c;
    tr.appendChild(td);
  });
  // Stato badge
  const tdStato = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'badge-stato ' + (f.stato || 'bozza');
  badge.textContent = f.stato || 'bozza';
  tdStato.appendChild(badge);
  tr.appendChild(tdStato);
  // Azioni
  const tdAct = document.createElement('td');
  tdAct.className = 'storico-actions';
  _buildActions(f, profile).forEach(btn => tdAct.appendChild(btn));
  tr.appendChild(tdAct);
  return tr;
}

function _buildActions(f, profile) {
  const btns = [];
  function mk(label, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-add';
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }
  if (f.stato === 'bozza') {
    btns.push(mk('Riapri', () => window.openFatturaModal && window.openFatturaModal(f.id)));
    btns.push(mk('Annulla', () => _changeStato(f.id, 'annullata', profile)));
  }
  btns.push(mk('Duplica', () => _duplicate(f, profile)));
  if (f.stato === 'bozza') {
    btns.push(mk('Segna inviata', () => _markInviata(f.id, profile)));
  }
  if (f.stato === 'inviata') {
    btns.push(mk('Segna pagata', () => _markPagata(f.id, profile)));
  }
  if (f.stato === 'inviata' || f.stato === 'pagata') {
    btns.push(mk('Nota di credito', () => window.openNotaCreditoModal && window.openNotaCreditoModal(f.id)));
  }
  return btns;
}

function _changeStato(id, nuovoStato, profile) {
  const fatture = load(profile);
  const idx = fatture.findIndex(f => f.id === id);
  if (idx < 0) return;
  fatture[idx].stato = nuovoStato;
  save(profile, fatture);
  renderStorico(Number(document.getElementById('storico-anno-filter')?.value) || new Date().getFullYear());
}

function _markInviata(id, profile) {
  const data = prompt('Data invio SdI (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!data) return;
  const fatture = load(profile);
  const idx = fatture.findIndex(f => f.id === id);
  if (idx < 0) return;
  fatture[idx].stato = 'inviata';
  fatture[idx].dataInvioSdi = data;
  save(profile, fatture);
  renderStorico(Number(document.getElementById('storico-anno-filter')?.value) || new Date().getFullYear());
}

function _markPagata(id, profile) {
  const data = prompt('Data pagamento (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!data) return;
  const fatture = load(profile);
  const idx = fatture.findIndex(f => f.id === id);
  if (idx < 0) return;
  fatture[idx].stato = 'pagata';
  fatture[idx].dataPagamento = data;
  save(profile, fatture);
  renderStorico(Number(document.getElementById('storico-anno-filter')?.value) || new Date().getFullYear());
}

function _duplicate(f, profile) {
  const fatture = load(profile);
  const annoOggi = new Date().getFullYear();
  const prog = nextProgressivo(annoOggi, fatture);
  const dup = {
    ...f,
    id: 'fat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    numero: formatNumero(annoOggi, prog),
    annoProgressivo: annoOggi,
    progressivo: prog,
    data: new Date().toISOString().slice(0, 10),
    stato: 'bozza',
    dataInvioSdi: null,
    dataPagamento: null,
    fatturaOriginaleId: null,
    tipoDocumento: 'TD01'
  };
  fatture.push(dup);
  save(profile, fatture);
  renderStorico(annoOggi);
}

function _formatDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : (iso || '—');
}
function _formatEur(n) {
  return (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function _calcTotale(f) {
  const imp = (f.righe || []).reduce((s, r) => s + (Number(r.quantita) || 0) * (Number(r.prezzoUnitario) || 0), 0);
  const bollo = (f.marcaDaBollo && imp > 77.47) ? 2 : 0;
  return imp + bollo + (Number(f.contributoIntegrativo) || 0) - (Number(f.ritenuta) || 0);
}
```

E aggiorna l'export:

```js
window.FattureStorico = {
  load, save, nextProgressivo, formatNumero, storageKey,
  renderStorico, renderAnnoFilter
};
```

- [ ] **Step 4: Trigger render quando si apre il tab Fatture**

In `app.js`, trova la funzione che gestisce il cambio tab (probabilmente `switchTab` o simile):

```bash
grep -n "switchTab\|activateTab\|tab-fatture\|renderFatture" app.js | head -20
```

Aggiungi al case del tab Fatture:

```js
if (typeof window.FattureStorico?.renderStorico === 'function') {
  window.FattureStorico.renderAnnoFilter();
  window.FattureStorico.renderStorico();
}
```

- [ ] **Step 5: Smoke test storico**

Browser: login Demo, tab Fatture. Expected:
- Sezione "Storico fatture" visibile sotto il pulsante "Nuova fattura"
- Filtro anno popolato (anno corrente selezionato)
- Lista fatture esistenti renderizzata con badge stato

Crea una nuova fattura → expected: appare nello storico con badge "bozza".

Click "Segna inviata" → prompt data → expected: badge cambia a "inviata".

Click "Duplica" → expected: nuova riga con numero incrementato.

- [ ] **Step 6: Commit**

```bash
git add fatture-storico.js index.html style.css app.js
git commit -m "feat(fatture): storico fatture con stati, filtro anno, azioni (sub-project 3 task 7)"
```

---

## Task 8: Numerazione automatica + anteprima XML modal

**Files:**
- Modify: `fatture-docs-feature.js` — pre-fill numero al modal aperture, modal anteprima XML

**Obiettivo:** quando si apre il modal "Nuova fattura", il campo numero è pre-compilato con `YYYY/NNN` calcolato via `FattureStorico.nextProgressivo`. Inoltre, aggiungere bottone "Anteprima XML" nel modal con un sotto-modal che mostra l'XML formattato e bottoni Copia/Scarica.

- [ ] **Step 1: Pre-fill numero alla apertura modal**

Trova la funzione `openFatturaModal` (o equivalente) in `fatture-docs-feature.js`:

```bash
grep -n "openFatturaModal\|state.draft = \|state.editingId" fatture-docs-feature.js | head -20
```

Nel ramo "nuova fattura" (quando `editingId` è null), subito dopo aver inizializzato `state.draft = { ...DRAFT_TEMPLATE }`:

```js
const annoOggi = new Date().getFullYear();
const profile = (typeof window.getProfile === 'function') ? window.getProfile() : sessionStorage.getItem('calcoliPIVA_profile');
const fatture = window.FattureStorico ? window.FattureStorico.load(profile) : [];
const prog = window.FattureStorico ? window.FattureStorico.nextProgressivo(annoOggi, fatture) : 1;
state.draft.numero = window.FattureStorico ? window.FattureStorico.formatNumero(annoOggi, prog) : (annoOggi + '/001');
state.draft.annoProgressivo = annoOggi;
state.draft.progressivo = prog;
state.draft.data = new Date().toISOString().slice(0, 10);
state.numberAuto = true;
```

Quando l'utente modifica manualmente il campo numero, setta `state.numberAuto = false` (per non sovrascrivere su re-render).

- [ ] **Step 2: Aggiungi bottone "Anteprima XML" nel modal**

Trova nel template del modal il bottone "Scarica XML":

```bash
grep -n "Scarica XML\|downloadFatturaXml" fatture-docs-feature.js
```

Aggiungi adiacente:

```html
<button type="button" class="btn-add profile-secondary-btn" onclick="previewFatturaXml()">Anteprima XML</button>
```

- [ ] **Step 3: Implementa `previewFatturaXml`**

Aggiungi in `fatture-docs-feature.js`:

```js
function previewFatturaXml() {
  try {
    const saved = persistDraft();
    if (!saved) return;
    const xml = (saved.tipoDocumento === 'TD04' && saved.fatturaOriginaleId)
      ? buildFatturaElettronicaXmlNC(saved, _findOriginale(saved.fatturaOriginaleId))
      : buildFatturaElettronicaXml(saved);
    showXmlPreviewModal(xml, saved.numero);
  } catch (err) {
    console.error('previewFatturaXml', err);
    showToast('Errore anteprima XML: ' + err.message);
  }
}

function _findOriginale(id) {
  const profile = (typeof window.getProfile === 'function') ? window.getProfile() : sessionStorage.getItem('calcoliPIVA_profile');
  const fatture = window.FattureStorico ? window.FattureStorico.load(profile) : [];
  return fatture.find(f => f.id === id);
}

function _formatXml(xml) {
  // Pretty-print con indent 2
  let formatted = '';
  let pad = 0;
  xml.replace(/></g, '>\n<').split('\n').forEach(node => {
    let indent = 0;
    if (node.match(/^<\/\w/)) pad = Math.max(pad - 1, 0);
    else if (node.match(/^<\w[^>]*[^\/]>$/)) indent = 1;
    formatted += '  '.repeat(pad) + node + '\n';
    pad += indent;
  });
  return formatted.trim();
}

function showXmlPreviewModal(xml, numero) {
  // Costruisci modal via DOM API per evitare assegnazioni inner-HTML su literal
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;';

  const modal = document.createElement('div');
  modal.className = 'modal-content';
  modal.style.cssText = 'background:var(--bg-secondary);border-radius:8px;padding:16px;max-width:90vw;max-height:90vh;width:800px;display:flex;flex-direction:column;gap:12px;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
  const h = document.createElement('h3');
  h.textContent = 'Anteprima XML — ' + (numero || '');
  h.style.margin = '0';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '\u00d7';
  closeBtn.style.cssText = 'background:none;border:none;font-size:24px;cursor:pointer;color:var(--text-primary);';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(h);
  header.appendChild(closeBtn);

  const pre = document.createElement('pre');
  pre.style.cssText = 'flex:1;overflow:auto;background:var(--bg-primary);padding:12px;border-radius:4px;font-size:12px;font-family:monospace;color:var(--text-primary);white-space:pre;';
  pre.textContent = _formatXml(xml);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn-add';
  copyBtn.textContent = 'Copia negli appunti';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent);
      copyBtn.textContent = 'Copiato!';
      setTimeout(() => { copyBtn.textContent = 'Copia negli appunti'; }, 1500);
    } catch (err) {
      showToast('Errore copia: ' + err.message);
    }
  });
  const dlBtn = document.createElement('button');
  dlBtn.type = 'button';
  dlBtn.className = 'btn-add';
  dlBtn.textContent = 'Scarica XML';
  dlBtn.addEventListener('click', () => {
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'IT_' + (numero || 'fattura').replace(/\//g, '_') + '.xml';
    a.click();
    URL.revokeObjectURL(url);
  });
  actions.appendChild(copyBtn);
  actions.appendChild(dlBtn);

  modal.appendChild(header);
  modal.appendChild(pre);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

window.previewFatturaXml = previewFatturaXml;
window.showXmlPreviewModal = showXmlPreviewModal;
```

- [ ] **Step 4: Wiring "Nota di credito" da storico**

Aggiungi in `fatture-docs-feature.js`:

```js
function openNotaCreditoModal(fatturaOriginaleId) {
  const profile = (typeof window.getProfile === 'function') ? window.getProfile() : sessionStorage.getItem('calcoliPIVA_profile');
  const fatture = window.FattureStorico ? window.FattureStorico.load(profile) : [];
  const orig = fatture.find(f => f.id === fatturaOriginaleId);
  if (!orig) { showToast('Fattura originale non trovata'); return; }
  const annoOggi = new Date().getFullYear();
  const prog = window.FattureStorico.nextProgressivo(annoOggi, fatture);
  const draft = {
    ...DRAFT_TEMPLATE,
    id: 'nc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    numero: window.FattureStorico.formatNumero(annoOggi, prog),
    annoProgressivo: annoOggi,
    progressivo: prog,
    data: new Date().toISOString().slice(0, 10),
    clienteId: orig.clienteId,
    clienteSnapshot: { ...orig.clienteSnapshot },
    righe: (orig.righe || []).map(r => ({ ...r, descrizione: 'STORNO \u2014 ' + r.descrizione })),
    tipoDocumento: 'TD04',
    fatturaOriginaleId: orig.id,
    stato: 'bozza',
    marcaDaBollo: false,  // bollo non si ripete su NC
    contributoIntegrativo: orig.contributoIntegrativo || 0
  };
  state.draft = draft;
  state.editingId = null;
  state.open = true;
  // Chiama il rendering del modal esistente (verifica nome funzione)
  if (typeof renderInvoiceModal === 'function') renderInvoiceModal();
  else if (typeof openFatturaModal === 'function') openFatturaModal();  // fallback
}

window.openNotaCreditoModal = openNotaCreditoModal;
```

- [ ] **Step 5: Smoke test numerazione**

Browser: tab Fatture → "Nuova fattura". Expected: campo numero pre-compilato con `2025/0NN` (NN = ultima esistente +1). Salva. Riapri "Nuova fattura". Expected: progressivo incrementato di 1.

- [ ] **Step 6: Smoke test anteprima XML**

Apri una fattura esistente, click "Anteprima XML". Expected:
- Modal con XML formattato (indentato, leggibile)
- Bottone "Copia" → al click testo cambia in "Copiato!" e clipboard contiene XML
- Bottone "Scarica XML" → download file `IT_2025_NNN.xml`

- [ ] **Step 7: Smoke test NC da storico**

Storico → fattura inviata → click "Nota di credito". Expected:
- Modal nuova fattura aperto
- Numero progressivo nuovo
- Cliente pre-compilato (stesso dell'originale)
- Righe pre-compilate con prefisso "STORNO — "
- Tipo TD04
- Bollo OFF di default

Salva, click "Anteprima XML". Expected: `<TipoDocumento>TD04</TipoDocumento>`, `<DatiFattureCollegate>` presente.

- [ ] **Step 8: Commit**

```bash
git add fatture-docs-feature.js
git commit -m "feat(fatture): numerazione auto + anteprima XML modal + NC da storico (sub-project 3 task 8)"
```

---

## Task 9: Regression test, docs, merge back

**Files:**
- Modify: `CLAUDE.md` — sezione "FatturaPA / SdI" e nuova sezione "Storico fatture"

**Obiettivo:** smoke test regressione completo, aggiornamento docs, merge in `codex/dev-newfeatures`.

- [ ] **Step 1: Smoke test regressione completo**

Browser, profilo Demo. Esegui in sequenza e verifica nessun errore:

1. Login → tab Fatture si apre senza errori
2. Crea fattura standard (1 riga, bollo on, no ritenuta) → salva → scarica PDF → scarica XML
3. Crea fattura con ritenuta 20% → verifica importo ritenuta calcolato → salva → anteprima XML
4. Crea fattura a privato (no P.IVA, solo CF) → salva → XML con CodiceDestinatario=0000000
5. Storico: filtro anno → cambia anno → lista aggiornata
6. Segna inviata → segna pagata → verifica badge
7. Duplica → nuova bozza con progressivo +1
8. Nota di credito da fattura pagata → modifica righe → salva → XML TD04
9. Sync Firebase: logout → login → verifica fatture ancora presenti
10. Verifica console DevTools: zero errori, zero warning non previsti

Annota qualsiasi anomalia. Se trovi bug, correggili in commit separati prima del merge.

- [ ] **Step 2: Verifica regressione altre tab**

Verifica che le tab non toccate funzionino:
- Tab Regime Forfettario → render OK
- Tab Scadenziario → render OK
- Tab Calendario → render OK
- Tab Dichiarazione Redditi PF → wizard si apre

- [ ] **Step 3: Aggiorna `CLAUDE.md` — sezione FatturaPA**

Trova la sezione `### FatturaPA / SdI` e sostituiscila con:

```markdown
### FatturaPA / SdI
- **XML generation** (`fatture-docs-feature.js`): produce FatturaPA v1.2 XML conforme spec AdE (`http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2`)
- **TD01** (fattura) e **TD04** (nota di credito) supportati
- **`buildFatturaElettronicaXml(invoice, opts)`**: builder principale; gestisce sia TD01 che TD04 (via `invoice.tipoDocumento` o `invoice._isNC`)
- **`buildFatturaElettronicaXmlNC(noteCredit, fatturaOriginale)`**: wrapper per NC, aggiunge `DatiFattureCollegate` con riferimento a fattura originale
- **Audit FatturaPA v1.2 (sub-project 3)**: 11 fix applicati
  - ProgressivoInvio sanitizzato (alfanumerico max 10 char)
  - CodiceFiscale cedente validato (warning se non valido)
  - IdPaese/IdCodice strippati e validati
  - RegimeFiscale dinamico (RF19 forfettario / RF01 ordinario)
  - Natura N2.2 forfettario / N1 escluse (condizionale)
  - AliquotaIVA 0.00 sempre presente
  - DatiBollo solo se imponibile > 77,47 €
  - Privato senza P.IVA: solo CodiceFiscale + CodiceDestinatario=0000000
  - DatiRitenuta con TipoRitenuta/CausalePagamento
  - Contributo integrativo come riga separata
  - ImportoPagamento netto ritenuta
- **`MODALITA_TO_MP` map** + **`modalitaToCodiceMP(str)`**: fuzzy-matching pagamento → codice MP01-MP15 (default MP05)
- **`showSdiUploadGuide(fileName)`**: guida 4-step upload portale AdE post-download XML
- No automated SdI submission — upload sempre manuale via portale AdE
- **Anteprima XML in-app** (`previewFatturaXml` / `showXmlPreviewModal`): modal con XML formattato, bottoni copia clipboard e scarica
```

- [ ] **Step 4: Aggiungi sezione "Storico fatture" in `CLAUDE.md`**

Subito dopo la sezione FatturaPA, aggiungi:

```markdown
### Storico fatture e numerazione (sub-project 3)
- **Modulo `fatture-storico.js`** (IIFE) esposto come `window.FattureStorico`
- **API:**
  - `load(profile)` / `save(profile, fatture)` — read/write su `calcoliPIVA_{profile}_fatture` con normalizzazione
  - `nextProgressivo(anno, fatture)` — restituisce max(progressivo dell'anno) + 1
  - `formatNumero(anno, progressivo)` — formato `YYYY/NNN` zero-padded
  - `renderStorico(annoFiltro)` — renderizza tabella storico nel tab Fatture
  - `renderAnnoFilter(selectedAnno)` — popola dropdown filtro anno
- **Stati fattura:** `bozza` | `inviata` | `pagata` | `annullata` (badge color-coded)
- **Numerazione auto:** alla apertura modal nuova fattura, campo numero pre-compilato; editabile manualmente
- **Azioni storico per riga:** Riapri, Duplica, Segna inviata, Segna pagata, Nota di credito, Annulla (visibilità in base allo stato corrente)
- **Data model esteso** (`DRAFT_TEMPLATE` in `fatture-docs-feature.js`): nuovi campi opzionali `stato`, `dataInvioSdi`, `dataPagamento`, `fatturaOriginaleId`, `tipoDocumento`, `annoProgressivo`, `progressivo`, `ritenuta`, `aliquotaRitenuta`, `tipoRitenuta`, `causaleRitenuta`
- **Backwards-compatible:** fatture esistenti normalizzate al caricamento via `normalizeInvoice` (default `bozza`/`TD01`)
```

- [ ] **Step 5: Aggiorna sezione "Invoice PDF" in `CLAUDE.md`**

Sostituisci la sezione `### Invoice PDF (`buildInvoicePdfModern`)` con:

```markdown
### Invoice PDF (`buildInvoicePdfMinimal`)
- Layout minimalista A4 portrait via jsPDF puro (no html2pdf rendering)
- Margini 20mm, font Helvetica built-in
- Header testuale: "FATTURA" o "NOTA DI CREDITO" + numero + data
- Due colonne emittente/destinatario
- Tabella righe con multi-pagina automatico
- Riepilogo con linea ACCENT teal sopra TOTALE
- Footer pagamento + nota legale forfettario
- Palette: `INK=[18,26,36]`, `MUTED=[100,116,139]`, `BORDER=[226,232,240]`, `ACCENT=[60,143,145]`, `NEGATIVE=[200,50,50]`
- Per NC: importi negativi in rosso, header "NOTA DI CREDITO"
```

- [ ] **Step 6: Commit docs**

```bash
git add CLAUDE.md
git commit -m "docs(fatture): aggiorna CLAUDE.md per sub-project 3 (storico + audit XML + NC)"
```

- [ ] **Step 7: Merge in `codex/dev-newfeatures`**

```bash
cd "C:/Users/rossima/OneDrive - TXT e-solutions S.p.A/02_Sviluppo/Applicazioni_interne/Calcoli vari"
git checkout codex/dev-newfeatures
git merge --no-ff codex/fatturazione-elettronica -m "merge(fatture): sub-project 3 complete \u2014 audit XML + NC + storico + PDF jsPDF"
```

Expected: merge senza conflitti (lavorato in worktree isolato sul solo `fatture-docs-feature.js` + nuovi file).

- [ ] **Step 8: Cleanup worktree**

```bash
git worktree remove .claude/worktrees/fatturazione-elettronica
```

- [ ] **Step 9: Verifica finale**

```bash
git log --oneline -15
git status
```

Expected: log mostra i 9 commit del sub-project + commit di merge. Working tree pulito.

- [ ] **Step 10: Aggiorna memory CLAUDE per stato sub-project**

Edit `CLAUDE.md` rimuovendo la sezione `### Sub-project 3 — Fatturazione Elettronica (IN PLANNING, paused 2026-04-17)` (ora completato e documentato nelle nuove sezioni).

```bash
git add CLAUDE.md
git commit -m "docs(claude): rimuove marker sub-project 3 paused (ora completato)"
```

---

## Note finali

- **Verifiche da non saltare:** Step 12-15 di Task 5 (smoke test XML) sono i più critici per evitare rifiuti SdI. Se possibile, validare almeno un XML generato sul simulatore AdE.
- **Bisect-friendly:** ogni task ha un singolo commit, ogni fix in Task 5 è uno step isolato; in caso di regressione, `git bisect` arriva al commit colpevole velocemente.
- **No build step:** ogni step è verificabile aprendo `index.html` nel browser e usando DevTools.
- **Italiano UI:** mantenere etichette e messaggi in italiano, error log in inglese (convenzione del progetto).
