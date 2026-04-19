/* Fatture PDF feature: create, preview, persist, and sync invoice history */
(function () {
  const DEFAULT_FORFETTARIO_NOTE = "Operazione senza applicazione dell'IVA ai sensi dell'art.1 commi 54-89 L.190/2014 e successive modifiche";
  const DEFAULT_BONIFICO = 'Bonifico bancario';
  // FatturaPA ModalitaPagamento codes (spec v1.2)
  const MODALITA_TO_MP = {
    'bonifico':       'MP05',
    'bonifico bancario': 'MP05',
    'assegno':        'MP01',
    'assegno circolare': 'MP02',
    'contanti':       'MP10',
    'carta di credito': 'MP08',
    'carta':          'MP08',
    'paypal':         'MP08',
    'rid':            'MP09',
    'sepa':           'MP15',
    'giroconto':      'MP06',
    'compensazione':  'MP07',
  };
  function modalitaToCodiceMP(str) {
    const key = String(str || '').toLowerCase().trim();
    for (const [k, v] of Object.entries(MODALITA_TO_MP)) {
      if (key.includes(k)) return v;
    }
    return 'MP05'; // default bonifico
  }
  const XML_NAMESPACE = 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2';
  const XML_FORFETTARIO_REGIME = 'RF19'; // kept for backward compat; buildFatturaElettronicaXml now reads settings

  // ── FatturaPA validation helpers (Task 5 audit) ──────────────────────────
  function sanitizeProgressivoInvio(s) {
    return String(s || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || '00001';
  }
  function isValidPartitaIvaIT(s) {
    return /^\d{11}$/.test(String(s || '').replace(/\s+/g, ''));
  }
  function isValidCodiceFiscale(cf) {
    if (typeof window.DichiarazioneEngine?.validateCodiceFiscale === 'function') {
      return window.DichiarazioneEngine.validateCodiceFiscale(cf);
    }
    return /^[A-Z0-9]{16}$/i.test(String(cf || '').trim());
  }
  function applicaBolloSeDovuto(imponibile, marcaDaBollo) {
    return marcaDaBollo && Number(imponibile) > 77.47;
  }
  // ─────────────────────────────────────────────────────────────────────────
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

  const state = {
    open: false,
    editingId: null,
    draft: null,
    numberAuto: true,
    toastTimer: null,
    previewUrl: null
  };

  function esc(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function round2(value) {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function todayIso() {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
  }

  function addDaysIso(dateIso, days) {
    const d = new Date(dateIso || todayIso());
    if (Number.isNaN(d.getTime())) return todayIso();
    d.setDate(d.getDate() + (parseInt(days, 10) || 0));
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
  }

  function parseDateParts(dateIso) {
    const parts = String(dateIso || '').split('-').map(v => parseInt(v, 10));
    if (parts.length < 3 || parts.some(n => !Number.isFinite(n))) return null;
    return { year: parts[0], month: parts[1], day: parts[2] };
  }

  function parseMaybeNumber(value) {
    const n = parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function xmlEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    }[ch]));
  }

  function formatPdfMoney(value) {
    const amount = round2(value);
    return `EUR ${amount.toLocaleString('it-IT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  function sanitizeDownloadFileName(value, fallback = 'documento') {
    const safe = String(value || fallback)
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return safe || fallback;
  }

  function formatDisplayDate(dateIso) {
    const parts = parseDateParts(dateIso);
    if (!parts) return '';
    return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
  }

  function resolveInvoiceCashDate(invoice) {
    if (invoice && invoice.incassata && invoice.dataIncasso) return String(invoice.dataIncasso);
    if (invoice && invoice.scadenzaPagamento) return String(invoice.scadenzaPagamento);
    return invoice && invoice.data ? String(invoice.data) : todayIso();
  }

  function getFattureEmesseStorageKey(profile = currentProfile) {
    return `calcoliPIVA_${profile || 'default'}_fattureEmesse`;
  }

  function loadFattureEmesse(profile = currentProfile) {
    const raw = localStorage.getItem(getFattureEmesseStorageKey(profile));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeFatturaEmessa).filter(Boolean);
    } catch {
      return [];
    }
  }

  function saveFattureEmesse(list, profile = currentProfile) {
    const normalized = (Array.isArray(list) ? list : []).map(normalizeFatturaEmessa).filter(Boolean);
    localStorage.setItem(getFattureEmesseStorageKey(profile), JSON.stringify(normalized));
    if (profile === currentProfile && typeof syncProfileMetaToCloud === 'function') {
      syncProfileMetaToCloud(profile);
    }
    return normalized;
  }

  function cloneLine(line) {
    return {
      descrizione: String(line?.descrizione || '').trim(),
      quantita: parseMaybeNumber(line?.quantita || 1) || 1,
      prezzoUnitario: round2(line?.prezzoUnitario || 0),
      iva: parseMaybeNumber(line?.iva || 0)
    };
  }

  function normalizeFatturaEmessa(item) {
    const raw = item || {};
    const dataIso = String(raw.data || todayIso());
    const dateParts = parseDateParts(dataIso) || { year: currentYear, month: new Date().getMonth() + 1, day: new Date().getDate() };
    const cliente = raw.clienteSnapshot && typeof raw.clienteSnapshot === 'object' ? raw.clienteSnapshot : null;
    const righe = Array.isArray(raw.righe) && raw.righe.length > 0 ? raw.righe.map(cloneLine) : [cloneLine({ descrizione: '', quantita: 1, prezzoUnitario: 0, iva: 0 })];
    const subtotal = righe.reduce((sum, r) => sum + (parseMaybeNumber(r.quantita) * parseMaybeNumber(r.prezzoUnitario)), 0);
    const contributoIntegrativo = round2(raw.contributoIntegrativo || 0);
    const marcaDaBollo = !!raw.marcaDaBollo;
    const bollo = marcaDaBollo ? 2 : 0;
    const totale = round2(subtotal + contributoIntegrativo + bollo);
    return {
      id: String(raw.id || `fatt_${Date.now().toString(36)}`),
      numero: String(raw.numero || ''),
      anno: parseInt(raw.anno || dateParts.year, 10) || dateParts.year,
      data: dataIso,
      clienteId: String(raw.clienteId || ''),
      clienteSnapshot: cliente,
      righe,
      contributoIntegrativo,
      marcaDaBollo,
      bolloImporto: bollo,
      note: String(raw.note || DEFAULT_FORFETTARIO_NOTE),
      modalitaPagamento: String(raw.modalitaPagamento || DEFAULT_BONIFICO),
      iban: String(raw.iban || ''),
      scadenzaPagamento: String(raw.scadenzaPagamento || addDaysIso(dataIso, 30)),
      incassata: !!raw.incassata,
      dataIncasso: String(raw.dataIncasso || ''),
      bolloAuto: raw.bolloAuto !== false,
      createdAt: String(raw.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
      issuedMonth: parseInt(raw.issuedMonth || dateParts.month, 10) || dateParts.month,
      issuedYear: parseInt(raw.issuedYear || dateParts.year, 10) || dateParts.year,
      totaleLordo: round2(subtotal),
      totaleDocument: totale
    };
  }

  function getNextInvoiceNumberForYear(year) {
    const invoices = loadFattureEmesse();
    const maxProgressive = invoices.reduce((max, invoice) => {
      const raw = String(invoice.numero || '');
      const match = raw.match(/(\d+)\s*\/\s*(\d{4})$/);
      if (!match) return max;
      const prog = parseInt(match[1], 10);
      const invoiceYear = parseInt(match[2], 10);
      if (invoiceYear !== parseInt(year, 10)) return max;
      return Math.max(max, prog);
    }, 0);
    return maxProgressive + 1;
  }

  function createDefaultDraft() {
    const profile = getProfileFiscalData();
    const issueDate = todayIso();
    const year = parseDateParts(issueDate)?.year || currentYear;
    const nextNumero = getNextInvoiceNumberForYear(year);
    const clienteList = typeof getClienti === 'function' ? getClienti() : [];
    const firstCliente = clienteList[0] || null;
    return normalizeFatturaEmessa({
      id: `fatt_${Date.now().toString(36)}`,
      numero: `${nextNumero}/${year}`,
      data: issueDate,
      anno: year,
      clienteId: firstCliente ? firstCliente.id : '',
      clienteSnapshot: firstCliente,
      righe: [cloneLine({ descrizione: '', quantita: 1, prezzoUnitario: 0, iva: 0 })],
      contributoIntegrativo: 0,
      marcaDaBollo: false,
      bolloAuto: true,
      note: DEFAULT_FORFETTARIO_NOTE,
      modalitaPagamento: profile.modalitaPagamento || DEFAULT_BONIFICO,
      iban: profile.iban || '',
      scadenzaPagamento: addDaysIso(issueDate, 30),
      incassata: false,
      dataIncasso: ''
    });
  }

  function currentDraft() {
    if (!state.draft) {
      state.draft = createDefaultDraft();
      state.numberAuto = true;
    }
    return state.draft;
  }

  function computeDraftTotals(draft) {
    const lines = Array.isArray(draft.righe) ? draft.righe.map(cloneLine) : [];
    const subtotal = round2(lines.reduce((sum, line) => sum + parseMaybeNumber(line.quantita) * parseMaybeNumber(line.prezzoUnitario), 0));
    const contributoIntegrativo = round2(draft.contributoIntegrativo || 0);
    const bollo = draft.marcaDaBollo ? 2 : 0;
    const total = round2(subtotal + contributoIntegrativo + bollo);
    return { subtotal, contributoIntegrativo, bollo, total, lineCount: lines.length };
  }

  function syncBolloDefault() {
    const draft = currentDraft();
    const totals = computeDraftTotals(draft);
    const thresholdHit = totals.subtotal + totals.contributoIntegrativo > 77.47;
    if (draft.bolloAuto !== false) {
      draft.marcaDaBollo = thresholdHit;
      const checkbox = document.getElementById('fatturaMarcaDaBollo');
      if (checkbox) checkbox.checked = !!draft.marcaDaBollo;
    }
  }

  function renderFatturaHistoryItemRich(invoice) {
    const cliente = invoice.clienteSnapshot || (typeof getClienteById === 'function' ? getClienteById(invoice.clienteId) : null) || {};
    const clienteLabel = cliente.nome || invoice.clienteId || 'Cliente';
    const issueLabel = formatDisplayDate(invoice.data) || invoice.data || `Anno ${invoice.anno || '-'}`;
    const statusLabel = invoice.incassata
      ? `Incassata il ${formatDisplayDate(invoice.dataIncasso) || invoice.dataIncasso || '-'}`
      : `Da incassare entro ${formatDisplayDate(invoice.scadenzaPagamento) || invoice.scadenzaPagamento || '-'}`;
    const totalLabel = typeof fmt === 'function' ? fmt(invoice.totaleDocument || 0) : `${round2(invoice.totaleDocument || 0).toFixed(2)} EUR`;
    return `
      <button class="fatture-docs-item" type="button" onclick="openFatturaModal('${esc(invoice.id)}')">
        <div class="fatture-docs-item-main">
          <strong>${esc(invoice.numero || 'Fattura')}</strong>
          <span>${esc(clienteLabel)} - ${esc(issueLabel)} - ${esc(statusLabel)}</span>
        </div>
        <div class="fatture-docs-item-meta">
          <span>${totalLabel}</span>
          <span>Apri</span>
        </div>
      </button>
    `;
  }

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

    const rowsHtml = filtered.length === 0
      ? '<div class="fatture-empty">Nessuna fattura per il filtro selezionato.</div>'
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
            : (inv.annoProgressivo + '/' + inv.progressivo);
          return '<div class="fatture-row" data-id="' + escHtml(inv.id) + '" role="button" tabindex="0">' +
            '<div class="fatture-num">' + escHtml(numero) + '</div>' +
            '<div class="fatture-client">' + cliente + ' — ' + dataDoc + '</div>' +
            '<div class="fatture-amount">' + fmtEur(inv.totaleDocument || 0) + ' €</div>' +
            '<span class="fatture-badge ' + badgeClass + '">' + escHtml(badgeLabel) + '</span>' +
          '</div>';
        }).join('');

    const summaryHtml = summaryVisible
      ? '<div class="fatture-summary">' + nInviate + ' da incassare · ' + fmtEur(totInviate) + ' €<span class="muted"> su ' + cTutte + ' emesse quest\'anno</span></div>'
      : '';

    const markup =
      '<div class="fatture-card">' +
        '<div class="fatture-card-head">' +
          '<div class="fatture-card-title">Fatture ' + year + '</div>' +
          '<div class="fatture-card-actions">' +
            '<button type="button" class="btn btn-ghost" onclick="window.openArchivioFatture && window.openArchivioFatture()" title="Archivio fatture (tutti gli anni)">Archivio</button>' +
            '<button type="button" class="btn btn-ghost" onclick="openFatturaDaCalendarioPicker()" title="Fattura mensile da calendario">+ Da calendario</button>' +
          '<button type="button" class="btn btn-primary" onclick="openFatturaModal()">+ Nuova fattura</button>' +
          '</div>' +
        '</div>' +
        summaryHtml +
        '<div class="fatture-filters" role="tablist" aria-label="Filtro stato fatture">' +
          '<button type="button" role="tab" class="fatture-filter-btn" aria-selected="' + (stato==='tutte') + '" onclick="window.setFattureFilter(\'tutte\')">Tutte (' + cTutte + ')</button>' +
          '<button type="button" role="tab" class="fatture-filter-btn" aria-selected="' + (stato==='inviata') + '" onclick="window.setFattureFilter(\'inviata\')">Da pagare (' + cInviate + ')</button>' +
          '<button type="button" role="tab" class="fatture-filter-btn" aria-selected="' + (stato==='pagata') + '" onclick="window.setFattureFilter(\'pagata\')">Pagate (' + cPagate + ')</button>' +
          '<button type="button" role="tab" class="fatture-filter-btn" aria-selected="' + (stato==='bozza') + '" onclick="window.setFattureFilter(\'bozza\')">Bozze (' + cBozze + ')</button>' +
        '</div>' +
        '<div class="fatture-list">' + rowsHtml + '</div>' +
      '</div>';

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

  function buildLineRowHtml(line, index) {
    const descrizione = esc(line.descrizione || '');
    const quantita = esc(line.quantita ?? 1);
    const prezzo = esc(line.prezzoUnitario ?? 0);
    const iva = esc(line.iva ?? 0);
    return `
      <div class="fattura-line" data-line-index="${index}">
        <div class="fattura-line-grid">
          <label class="fattura-field fattura-field-wide">
            <span>Descrizione</span>
            <input type="text" value="${descrizione}" placeholder="Descrizione servizio o attività" oninput="updateFatturaLineField(${index}, 'descrizione', this.value)">
          </label>
          <label class="fattura-field">
            <span>Quantità</span>
            <input type="number" min="0" step="0.01" value="${quantita}" oninput="updateFatturaLineField(${index}, 'quantita', this.value)">
          </label>
          <label class="fattura-field">
            <span>Prezzo unitario</span>
            <input type="number" min="0" step="0.01" value="${prezzo}" oninput="updateFatturaLineField(${index}, 'prezzoUnitario', this.value)">
          </label>
          <label class="fattura-field">
            <span>IVA %</span>
            <input type="number" min="0" step="0.01" value="${iva}" oninput="updateFatturaLineField(${index}, 'iva', this.value)">
          </label>
          <div class="fattura-line-actions">
            <button type="button" class="profile-secondary-btn fattura-remove-line" onclick="removeFatturaLine(${index})" aria-label="Rimuovi riga">&times;</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderFatturaSummary() {
    const container = document.getElementById('fatturaSummary');
    if (!container) return;
    const draft = currentDraft();
    const totals = computeDraftTotals(draft);
    const cliente = draft.clienteId && typeof getClienteById === 'function' ? getClienteById(draft.clienteId) : draft.clienteSnapshot;
    const clienteLabel = cliente && cliente.nome ? cliente.nome : 'Nessun cliente selezionato';
    container.innerHTML = `
      <div class="fattura-summary-grid">
        <div class="fattura-summary-card"><span>Imponibile</span><b>${typeof fmt === 'function' ? fmt(totals.subtotal) : totals.subtotal.toFixed(2)}</b></div>
        <div class="fattura-summary-card"><span>Contributo integrativo</span><b>${typeof fmt === 'function' ? fmt(totals.contributoIntegrativo) : totals.contributoIntegrativo.toFixed(2)}</b></div>
        <div class="fattura-summary-card"><span>Marca da bollo</span><b>${totals.bollo > 0 ? '2,00 €' : '0,00 €'}</b></div>
        <div class="fattura-summary-card fattura-summary-total"><span>Totale fattura</span><b>${typeof fmt === 'function' ? fmt(totals.total) : totals.total.toFixed(2)}</b></div>
      </div>
      <div class="fattura-summary-note">Cliente selezionato: <b>${esc(clienteLabel)}</b>.</div>
    `;
  }

  function renderFatturaModal() {
    const el = document.getElementById('fatturaModalContent');
    if (!el) return;
    const draft = currentDraft();
    const profile = getProfileFiscalData();
    const clienteOptions = typeof getClientiOptionsHtml === 'function' ? getClientiOptionsHtml(draft.clienteId) : '<option value="">Nessun cliente</option>';
    const rowHtml = (draft.righe || []).map((line, idx) => buildLineRowHtml(line, idx)).join('');
    el.innerHTML = `
      <div class="fattura-sheet">
        <div class="fattura-sheet-header">
          <div class="fattura-sheet-copy">
            <h2 id="fatturaModalTitle">${esc(state.editingId ? 'Modifica fattura' : 'Nuova fattura')}</h2>
            <p>Compila la fattura, genera il PDF e salva lo storico.</p>
          </div>
          <div class="fattura-sheet-actions">
            <button type="button" class="btn-add profile-secondary-btn" onclick="closeFatturaModal()">Chiudi</button>
            <button type="button" class="btn-add profile-secondary-btn" onclick="saveFatturaDraft(false)">Salva</button>
            <button type="button" class="btn-add profile-secondary-btn" onclick="previewFatturaPdf()">Anteprima</button>
            <button type="button" class="btn-add" onclick="downloadFatturaPdf()">Scarica PDF</button>
            <button type="button" class="btn-add profile-secondary-btn" onclick="previewFatturaXml()">Anteprima XML</button>
            <button type="button" class="btn-add profile-secondary-btn" onclick="downloadFatturaXml()">Scarica XML</button>
          </div>
        </div>
        <div id="fatturaModalToast" class="fattura-modal-toast"></div>
        <div class="fattura-sdi-note">
          <strong>FatturaPA XML FPR12</strong>
          <span>Il file XML viene generato per il download, ma l'invio al SdI non e automatizzato. Caricalo manualmente sul portale Fatture e Corrispettivi.</span>
        </div>
        <form class="fattura-builder" onsubmit="return false;">
          <div class="fattura-form-grid">
            <label class="fattura-field">
              <span>Numero fattura</span>
              <input id="fatturaNumero" type="text" value="${esc(draft.numero)}" oninput="updateFatturaDraftField('numero', this.value, true)">
            </label>
            <label class="fattura-field">
              <span>Data emissione</span>
              <input id="fatturaData" type="date" value="${esc(draft.data)}" oninput="updateFatturaDraftField('data', this.value)">
            </label>
            <label class="fattura-field fattura-field-wide">
              <span>Cliente</span>
              <select id="fatturaCliente" onchange="updateFatturaDraftField('clienteId', this.value)">
                <option value="">Seleziona cliente...</option>
                ${clienteOptions}
              </select>
            </label>
            <label class="fattura-field">
              <span>Scadenza pagamento</span>
              <input id="fatturaScadenza" type="date" value="${esc(draft.scadenzaPagamento)}" oninput="updateFatturaDraftField('scadenzaPagamento', this.value)">
            </label>
            <label class="fattura-field">
              <span>Fattura gia incassata?</span>
              <div class="fattura-bollo-wrap">
                <input id="fatturaIncassata" type="checkbox" ${draft.incassata ? 'checked' : ''} onchange="updateFatturaDraftField('incassata', this.checked)">
                <span>Gia incassata</span>
              </div>
            </label>
            <label class="fattura-field">
              <span>Data incasso</span>
              <input id="fatturaDataIncasso" type="date" value="${esc(draft.dataIncasso)}" oninput="updateFatturaDraftField('dataIncasso', this.value)" ${!draft.incassata ? 'disabled' : ''}>
            </label>
            <label class="fattura-field">
              <span>IBAN</span>
              <input id="fatturaIban" type="text" value="${esc(draft.iban)}" oninput="updateFatturaDraftField('iban', this.value)">
            </label>
            <label class="fattura-field">
              <span>Contributo integrativo (EUR)</span>
              <input id="fatturaContributoIntegrativo" type="number" min="0" step="0.01" value="${esc(draft.contributoIntegrativo)}" oninput="updateFatturaDraftField('contributoIntegrativo', this.value)">
            </label>
            <label class="fattura-field fattura-bollo-field">
              <span>Marca da bollo</span>
              <div class="fattura-bollo-wrap">
                <input id="fatturaMarcaDaBollo" type="checkbox" ${draft.marcaDaBollo ? 'checked' : ''} onchange="updateFatturaDraftField('marcaDaBollo', this.checked)">
                <span>Applica 2,00 € se supera 77,47 €</span>
              </div>
            </label>
            <div class="fattura-field fattura-field-wide">
              <span>Ritenuta d'acconto</span>
              <div class="fattura-bollo-wrap">
                <input type="checkbox" id="invHasRitenuta" ${Number(draft.ritenuta) > 0 ? 'checked' : ''}>
                <span>Applica ritenuta d'acconto</span>
              </div>
              <div id="invRitenutaFields" style="display:${Number(draft.ritenuta) > 0 ? 'block' : 'none'}; margin-top:8px;">
                <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
                  <label>Aliquota %
                    <input type="number" id="invAliquotaRitenuta" min="0" max="100" step="0.01" value="${draft.aliquotaRitenuta || 20}" style="width:80px;">
                  </label>
                  <label>Tipo ritenuta
                    <select id="invTipoRitenuta">
                      <option value="RT01" ${(draft.tipoRitenuta || 'RT02') === 'RT01' ? 'selected' : ''}>RT01 — Persone fisiche</option>
                      <option value="RT02" ${(draft.tipoRitenuta || 'RT02') === 'RT02' ? 'selected' : ''}>RT02 — Persone giuridiche</option>
                    </select>
                  </label>
                  <label>Causale
                    <input type="text" id="invCausaleRitenuta" maxlength="2" value="${esc(draft.causaleRitenuta || 'A')}" style="width:60px;">
                  </label>
                </div>
                <div style="margin-top:6px;">
                  <span>Importo ritenuta calcolato: <strong id="invRitenutaImporto">0,00 €</strong></span>
                </div>
              </div>
            </div>
            <label class="fattura-field fattura-field-wide">
              <span>Nota</span>
              <textarea id="fatturaNota" rows="2" oninput="updateFatturaDraftField('note', this.value)">${esc(draft.note)}</textarea>
            </label>
          </div>
          <div class="fattura-lines-head">
            <h3>Righe fattura</h3>
            <button type="button" class="btn-add" onclick="addFatturaLine()">+ Riga</button>
          </div>
          <div class="fattura-lines">${rowHtml}</div>
          <div id="fatturaSummary" class="fattura-summary"></div>
        </form>
      </div>
    `;
    syncBolloDefault();
    _bindRitenutaHandlers();
    renderFatturaSummary();
  }

  function _bindRitenutaHandlers() {
    const chk = document.getElementById('invHasRitenuta');
    const fields = document.getElementById('invRitenutaFields');
    const aliq = document.getElementById('invAliquotaRitenuta');
    const tipo = document.getElementById('invTipoRitenuta');
    const caus = document.getElementById('invCausaleRitenuta');
    const importoEl = document.getElementById('invRitenutaImporto');
    if (!chk || !fields) return;

    function recalc() {
      if (!chk.checked) {
        state.draft.ritenuta = 0;
        if (importoEl) importoEl.textContent = '0,00 €';
        return;
      }
      const totals = computeDraftTotals(state.draft);
      const a = Number(aliq ? aliq.value : 0) || 0;
      const importo = round2((totals.subtotal || 0) * a / 100);
      state.draft.ritenuta = importo;
      state.draft.aliquotaRitenuta = a;
      state.draft.tipoRitenuta = tipo ? tipo.value : 'RT02';
      state.draft.causaleRitenuta = ((caus ? caus.value : '') || 'A').toUpperCase().slice(0, 2);
      if (importoEl) importoEl.textContent = formatEur(importo);
    }

    chk.addEventListener('change', () => {
      fields.style.display = chk.checked ? 'block' : 'none';
      recalc();
    });
    if (aliq) aliq.addEventListener('input', recalc);
    if (tipo) tipo.addEventListener('input', recalc);
    if (caus) caus.addEventListener('input', recalc);

    recalc();
  }

  function showFatturaToast(message, tone = 'success') {
    const toast = document.getElementById('fatturaModalToast');
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.add('show');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function updateFatturaDraftField(field, value, manualNumber = false) {
    const draft = currentDraft();
    if (field === 'numero') {
      draft.numero = String(value).trim();
      if (manualNumber) state.numberAuto = false;
    } else if (field === 'data') {
      draft.data = value;
      const parts = parseDateParts(value);
      draft.anno = parts ? parts.year : currentYear;
      if (state.numberAuto) {
        draft.numero = `${getNextInvoiceNumberForYear(draft.anno)}/${draft.anno}`;
        const numEl = document.getElementById('fatturaNumero');
        if (numEl) numEl.value = draft.numero;
      }
      draft.scadenzaPagamento = addDaysIso(value, 30);
      const scadEl = document.getElementById('fatturaScadenza');
      if (scadEl) scadEl.value = draft.scadenzaPagamento;
    } else if (field === 'clienteId') {
      draft.clienteId = value;
      const cliente = typeof getClienteById === 'function' ? getClienteById(value) : null;
      draft.clienteSnapshot = cliente;
    } else if (field === 'incassata') {
      draft.incassata = !!value;
      const incEl = document.getElementById('fatturaDataIncasso');
      if (incEl) {
        incEl.disabled = !draft.incassata;
        if (draft.incassata && !draft.dataIncasso) {
          draft.dataIncasso = draft.data;
          incEl.value = draft.dataIncasso;
        }
      }
    } else if (field === 'contributoIntegrativo') {
      draft.contributoIntegrativo = round2(value);
    } else if (field === 'marcaDaBollo') {
      draft.marcaDaBollo = !!value;
      draft.bolloAuto = false;
    } else {
      draft[field] = value;
    }
    syncBolloDefault();
    renderFatturaSummary();
  }

  function updateFatturaLineField(index, field, value) {
    const draft = currentDraft();
    if (draft.righe[index]) {
      if (field === 'descrizione') draft.righe[index].descrizione = value;
      else draft.righe[index][field] = round2(value);
    }
    syncBolloDefault();
    renderFatturaSummary();
  }

  function addFatturaLine() {
    currentDraft().righe.push(cloneLine({}));
    renderFatturaModal();
  }

  function removeFatturaLine(index) {
    if (currentDraft().righe.length > 1) {
      currentDraft().righe.splice(index, 1);
      renderFatturaModal();
    }
  }

  function saveFatturaDraft(silent = false) {
    const draft = collectDraftFromState();
    if (!draft.clienteId) {
      if (!silent) showFatturaToast('Seleziona un cliente.', 'warn');
      return null;
    }
    const history = loadFattureEmesse();
    const idx = history.findIndex(h => h.id === draft.id);
    if (idx >= 0) history[idx] = draft; else history.unshift(draft);
    saveFattureEmesse(history);
    
    // Integrazione con tab mensile
    if (typeof upsertInvoiceRowInYearData === 'function') {
      upsertInvoiceRowInYearData(draft);
    }
    
    state.editingId = draft.id;
    renderFattureDocsSection();
    if (!silent) showFatturaToast('Fattura salvata.');
    if (typeof recalcAll === 'function') recalcAll();
    return draft;
  }

  function collectDraftFromState() {
    const draft = currentDraft();
    const invoice = normalizeFatturaEmessa({ ...draft });
    invoice.id = state.editingId || draft.id;
    return invoice;
  }

  function upsertInvoiceRowInYearData(invoice) {
    const year = invoice.anno;
    const month = invoice.issuedMonth;
    const yearData = getYearDataFor(year) || ensureDataShape({}, year);
    if (!yearData.fatture) yearData.fatture = {};
    const rows = Array.isArray(yearData.fatture[month]) ? yearData.fatture[month] : [];
    const filtered = rows.filter(r => String(r.invoiceId || r.fatturaId) !== String(invoice.id));
    filtered.push({
      invoiceId: invoice.id,
      importo: invoice.totaleDocument,
      pagMese: parseDateParts(resolveInvoiceCashDate(invoice))?.month || month,
      pagAnno: parseDateParts(resolveInvoiceCashDate(invoice))?.year || year,
      desc: `${invoice.numero} - ${invoice.clienteSnapshot?.nome || 'Cliente'}`,
      dataEmissione: invoice.data,
      incassata: invoice.incassata
    });
    yearData.fatture[month] = filtered;
    if (year === currentYear) { data.fatture = yearData.fatture; saveData(); }
    else saveYearData(year, yearData);
  }

  function openFatturaModal(id = null) {
    if (id) {
      const inv = getSavedInvoiceById(id);
      if (inv) {
        state.draft = normalizeFatturaEmessa(inv);
        state.editingId = inv.id;
        state.numberAuto = false;
      }
    } else {
      state.draft = createDefaultDraft();
      state.editingId = null;
      state.numberAuto = true;
      // Pre-fill progressivo via FattureStorico per coerenza con storico unificato
      const annoOggi = new Date().getFullYear();
      const profile = (typeof window.getProfile === 'function') ? window.getProfile() : sessionStorage.getItem('calcoliPIVA_profile');
      const fattureStorico = window.FattureStorico ? window.FattureStorico.load(profile) : [];
      const prog = window.FattureStorico ? window.FattureStorico.nextProgressivo(annoOggi, fattureStorico) : 1;
      state.draft.numero = window.FattureStorico ? window.FattureStorico.formatNumero(annoOggi, prog) : (annoOggi + '/001');
      state.draft.annoProgressivo = annoOggi;
      state.draft.progressivo = prog;
      state.draft.data = new Date().toISOString().slice(0, 10);
    }
    renderFatturaModal();
    const m = document.getElementById('fatturaModal');
    if (m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
    document.body.classList.add('profile-modal-open');
  }

  function closeFatturaModal() {
    const m = document.getElementById('fatturaModal');
    if (m) { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); }
    document.body.classList.remove('profile-modal-open');
    state.draft = null;
    state.editingId = null;
  }

  function getSavedInvoiceById(id) {
    return loadFattureEmesse().find(i => i.id === id);
  }

  // --- MOTORE PDF MINIMALISTA (jsPDF) ---
  function buildInvoicePdfMinimal(invoice) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF non disponibile (verifica caricamento html2pdf bundle)');
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const INK     = [18, 26, 36];
    const MUTED   = [100, 116, 139];
    const BORDER  = [226, 232, 240];
    const ACCENT  = [60, 143, 145];
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
      [emittente.indirizzo, emittente.cap, emittente.comune || emittente.citta, emittente.provincia].filter(Boolean).join(' ')
    ].filter(Boolean);
    const clLines = [
      cliente.denominazione || (cliente.nome + ' ' + (cliente.cognome || '')).trim(),
      cliente.partitaIva ? 'P.IVA ' + cliente.partitaIva : (cliente.codiceFiscale ? 'CF ' + cliente.codiceFiscale : ''),
      [cliente.indirizzo, cliente.cap, cliente.comune || cliente.citta, cliente.provincia].filter(Boolean).join(' ')
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
    const colQta  = MARGIN + 100;
    const colUnit = MARGIN + 130;
    const colTot  = PAGE_W - MARGIN;
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
      const desc   = String(r.descrizione || '');
      const qta    = Number(r.quantita) || 0;
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
    const valX   = PAGE_W - MARGIN;
    doc.setFontSize(10);

    function row(label, val, opts) {
      opts = opts || {};
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setTextColor.apply(doc, opts.color || INK);
      doc.text(label, labelX, y);
      doc.text(formatEur(val * sign), valX, y, { align: 'right' });
      y += 5;
    }
    // totals.subtotal = imponibile (from computeDraftTotals)
    row('Imponibile', totals.subtotal || 0);
    if (totals.contributoIntegrativo) row('Contributo integrativo', totals.contributoIntegrativo);
    if (invoice.marcaDaBollo && (totals.subtotal || 0) > 77.47) row('Marca da bollo', 2);
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
    // totals.total = totale finale (from computeDraftTotals)
    doc.text(formatEur((totals.total || 0) * sign), valX, y, { align: 'right' });
    y += 10;

    // Pagamento
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, MUTED);
    if (invoice.modalitaPagamento) {
      doc.text('Pagamento: ' + invoice.modalitaPagamento + (invoice.scadenzaPagamento ? ' \u2014 Scadenza ' + formatDateIt(invoice.scadenzaPagamento) : ''), MARGIN, y);
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
    return v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac';
  }
  function formatNumIt(n) {
    return Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function _enrichInvoiceForPdf(invoice) {
    const totals = computeDraftTotals(invoice);
    const profileRaw = getProfileFiscalData();
    // Map profile fields to emittente shape expected by buildInvoicePdfMinimal
    const emittente = {
      nome: profileRaw.nome || currentProfile,
      cognome: '',
      partitaIva: profileRaw.partitaIva || '',
      codiceFiscale: profileRaw.codiceFiscale || '',
      indirizzo: profileRaw.indirizzo || '',
      cap: profileRaw.cap || '',
      comune: profileRaw.citta || '',
      provincia: profileRaw.provincia || ''
    };
    return { ...invoice, _totals: totals, _emittente: emittente };
  }

  async function downloadFatturaPdf() {
    try {
      const saved = saveFatturaDraft(true);
      if (!saved) return;
      const enriched = _enrichInvoiceForPdf(saved);
      const doc = buildInvoicePdfMinimal(enriched);
      const filename = 'fattura_' + String(saved.numero || 'senza-numero').replace(/\//g, '-') + '.pdf';
      doc.save(filename);
      showFatturaToast('PDF scaricato.');
    } catch (err) {
      console.error('downloadFatturaPdf', err);
      showFatturaToast('Errore generazione PDF: ' + err.message, 'error');
    }
  }

  async function previewFatturaPdf() {
    try {
      const saved = saveFatturaDraft(true);
      if (!saved) return;
      const enriched = _enrichInvoiceForPdf(saved);
      const doc = buildInvoicePdfMinimal(enriched);
      const blob = doc.output('blob');
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(blob);
      window.open(state.previewUrl, '_blank');
    } catch (err) {
      console.error('previewFatturaPdf', err);
      showFatturaToast('Errore anteprima PDF: ' + err.message, 'error');
    }
  }

  // ── XML helpers ─────────────────────────────────────────────
  function fmtXmlNum(n) { return round2(n).toFixed(2); }

  function downloadTextFile(fileName, content) {
    const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function getXmlInvoiceProgressivo(draft) {
    const raw = String(draft.numero || '');
    const match = raw.match(/^(\d+)/);
    const n = match ? parseInt(match[1], 10) : 1;
    return String(n).padStart(5, '0');
  }

  function validateFatturaForXml(draft) {
    const errors = [];
    const profile = getProfileFiscalData();
    if (!String(profile.partitaIva || '').replace(/\D/g, '')) errors.push('Partita IVA del profilo mancante — configurala nel profilo fiscale.');
    if (!draft.numero) errors.push('Numero fattura mancante.');
    if (!draft.data) errors.push('Data fattura mancante.');
    const totals = computeDraftTotals(draft);
    if (totals.subtotal <= 0) errors.push('Importo totale della fattura pari a zero.');
    const cliente = draft.clienteSnapshot;
    if (!cliente || !cliente.nome) errors.push('Cliente non selezionato o senza ragione sociale.');
    return { errors };
  }

  function buildFatturaElettronicaXmlNC(noteCredit, fatturaOriginale) {
    if (!fatturaOriginale) {
      throw new Error('NC: fattura originale richiesta per DatiFattureCollegate');
    }
    const draft = { ...noteCredit, tipoDocumento: 'TD04', _isNC: true };
    return buildFatturaElettronicaXml(draft, { fatturaOriginale });
  }

  function buildFatturaElettronicaXml(draft, opts = {}) {
    const isNC = draft._isNC === true || draft.tipoDocumento === 'TD04';
    const tipoDoc = isNC ? 'TD04' : 'TD01';
    const sign = isNC ? -1 : 1;

    const profile = getProfileFiscalData();
    const cliente = draft.clienteSnapshot || {};
    const totals = computeDraftTotals(draft);

    // Fix #4 — RegimeFiscale dinamico da settings
    const regimeFiscale = (window.settings?.regime === 'ordinario') ? 'RF01' : 'RF19';

    // Fix #1 — ProgressivoInvio sanitizzato (max 10 alfanum)
    const progressivo = sanitizeProgressivoInvio(draft.numero || draft.id || '');

    const piva = String(profile.partitaIva || '').replace(/\s+/g, '');

    // Fix #3 — validazione P.IVA cedente
    if (piva && !isValidPartitaIvaIT(piva)) {
      console.warn('P.IVA cedente non valida (non 11 cifre):', piva);
    }

    // Fix #2 — validazione CF cedente con warning
    const cfCedente = String(profile.codiceFiscale || '').trim();
    if (cfCedente && !isValidCodiceFiscale(cfCedente)) {
      console.warn('CF cedente non valido:', cfCedente);
      if (typeof showToast === 'function') showToast('Attenzione: CF cedente non valido (verifica anagrafica)');
    }

    // Fix #8 — CodiceDestinatario: privato senza P.IVA → 0000000
    const clientePivaRaw = String(cliente.partitaIva || '').replace(/\s+/g, '');
    const clientePivaValida = isValidPartitaIvaIT(clientePivaRaw);
    const codiceSDI = clientePivaValida
      ? String(cliente.codiceSDI || '0000000').trim().padEnd(7, '0').slice(0, 7)
      : String(cliente.codiceSDI || '').trim() || '0000000';

    // Split profile name into Nome/Cognome (natural person)
    const nameParts = String(profile.nome || currentProfile).trim().split(/\s+/);
    const profileCognome = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
    const profileNome = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';

    // Client identification (Fix #3 + Fix #8)
    const clientePiva = clientePivaRaw; // already computed above (spaces stripped)
    const clienteCF = String(cliente.codiceFiscale || '').trim();

    // Imponibile = sum of all lines + contributo integrativo (bollo excluded)
    const imponibile = round2(totals.subtotal + totals.contributoIntegrativo);

    // Lines
    let lineNum = 0;
    const dettaglioLinee = (draft.righe || []).map(line => {
      lineNum++;
      const qta = parseMaybeNumber(line.quantita) || 1;
      const pu = round2(parseMaybeNumber(line.prezzoUnitario));
      const tot = round2(qta * pu * sign);
      return `    <DettaglioLinee>
      <NumeroLinea>${lineNum}</NumeroLinea>
      <Descrizione>${xmlEscape(line.descrizione || 'Prestazione professionale')}</Descrizione>
      <Quantita>${fmtXmlNum(qta)}</Quantita>
      <PrezzoUnitario>${fmtXmlNum(pu)}</PrezzoUnitario>
      <PrezzoTotale>${fmtXmlNum(tot)}</PrezzoTotale>
      <AliquotaIVA>0.00</AliquotaIVA>
      <Natura>N2.2</Natura>
    </DettaglioLinee>`;
    });

    if (totals.contributoIntegrativo > 0) {
      lineNum++;
      dettaglioLinee.push(`    <DettaglioLinee>
      <NumeroLinea>${lineNum}</NumeroLinea>
      <Descrizione>Contributo integrativo</Descrizione>
      <Quantita>1.00</Quantita>
      <PrezzoUnitario>${fmtXmlNum(totals.contributoIntegrativo)}</PrezzoUnitario>
      <PrezzoTotale>${fmtXmlNum(round2(totals.contributoIntegrativo * sign))}</PrezzoTotale>
      <AliquotaIVA>0.00</AliquotaIVA>
      <Natura>N2.2</Natura>
    </DettaglioLinee>`);
    }

    // Fix #7 — DatiBollo solo se imponibile > 77,47 AND marcaDaBollo flag; mai su NC (spec §6)
    const datiBollo = (!isNC && applicaBolloSeDovuto(totals.subtotal, draft.marcaDaBollo)) ? `
      <DatiBollo>
        <BolloVirtuale>SI</BolloVirtuale>
        <ImportoBollo>2.00</ImportoBollo>
      </DatiBollo>` : '';

    // Fix #9 — DatiRitenuta dentro DatiGeneraliDocumento (prima di ImportoTotaleDocumento)
    let xmlRitenuta = '';
    if (Number(draft.ritenuta) > 0) {
      const tipo = draft.tipoRitenuta || 'RT02';
      const caus = (draft.causaleRitenuta || 'A').toUpperCase().slice(0, 2);
      xmlRitenuta = `
      <DatiRitenuta>
        <TipoRitenuta>${tipo}</TipoRitenuta>
        <ImportoRitenuta>${Number(draft.ritenuta).toFixed(2)}</ImportoRitenuta>
        <AliquotaRitenuta>${Number(draft.aliquotaRitenuta || 0).toFixed(2)}</AliquotaRitenuta>
        <CausalePagamento>${xmlEscape(caus)}</CausalePagamento>
      </DatiRitenuta>`;
    }

    // NC — DatiFattureCollegate (XSD: inside DatiGenerali, after DatiGeneraliDocumento)
    let datiCollegate = '';
    if (isNC && opts.fatturaOriginale) {
      const orig = opts.fatturaOriginale;
      datiCollegate = `
    <DatiFattureCollegate>
      <RiferimentoNumeroLinea>1</RiferimentoNumeroLinea>
      <IdDocumento>${xmlEscape(String(orig.numero || ''))}</IdDocumento>
      <Data>${xmlEscape(String(orig.data || ''))}</Data>
    </DatiFattureCollegate>`;
    }

    const causale = String(draft.note || '').trim();
    const causaleXml = causale ? `
      <Causale>${xmlEscape(causale.slice(0, 200))}</Causale>` : '';

    const ibanXml = String(profile.iban || '').trim()
      ? `\n        <IBAN>${xmlEscape(profile.iban.replace(/\s/g, ''))}</IBAN>` : '';

    const scadenzaXml = draft.scadenzaPagamento
      ? `\n        <DataScadenzaPagamento>${xmlEscape(draft.scadenzaPagamento)}</DataScadenzaPagamento>` : '';

    // Client sede (can be empty — AdE requires Indirizzo+CAP+Comune+Nazione)
    const cliInd = xmlEscape(String(cliente.indirizzo || 'N/D').slice(0, 60));
    const cliCap = String(cliente.cap || '00000').replace(/\D/g, '').padStart(5, '0').slice(0, 5);
    const cliCom = xmlEscape(String(cliente.citta || 'N/D').slice(0, 60));
    const cliProv = String(cliente.provincia || '').slice(0, 2).trim();
    const cliNaz = String(cliente.nazione || 'IT').slice(0, 2).toUpperCase();
    const cliProvXml = cliProv ? `\n        <Provincia>${xmlEscape(cliProv)}</Provincia>` : '';

    const cedInd = xmlEscape(String(profile.indirizzo || 'N/D').slice(0, 60));
    const cedCap = String(profile.cap || '00000').replace(/\D/g, '').padStart(5, '0').slice(0, 5);
    const cedCom = xmlEscape(String(profile.citta || 'N/D').slice(0, 60));
    const cedProv = String(profile.provincia || '').slice(0, 2).trim();
    const cedNaz = String(profile.nazione || 'IT').slice(0, 2).toUpperCase();
    const cedProvXml = cedProv ? `\n        <Provincia>${xmlEscape(cedProv)}</Provincia>` : '';

    const cfCedenteXml = profile.codiceFiscale
      ? `\n        <CodiceFiscale>${xmlEscape(profile.codiceFiscale)}</CodiceFiscale>` : '';

    // Client fiscal ID — Fix #8: privato senza P.IVA → solo CodiceFiscale
    let cessionarioFiscaleXml = '';
    if (clientePivaValida) {
      const cliPaese = String(cliente.paese || 'IT').slice(0, 2).toUpperCase();
      cessionarioFiscaleXml = `
      <IdFiscaleIVA>
        <IdPaese>${cliPaese}</IdPaese>
        <IdCodice>${xmlEscape(clientePiva)}</IdCodice>
      </IdFiscaleIVA>`;
      if (clienteCF) cessionarioFiscaleXml += `\n        <CodiceFiscale>${xmlEscape(clienteCF)}</CodiceFiscale>`;
    } else {
      // Privato: solo CF
      if (!clienteCF) {
        console.warn('Cessionario privato senza CF: XML potrebbe essere rifiutato da SdI');
      }
      if (clienteCF) cessionarioFiscaleXml = `\n        <CodiceFiscale>${xmlEscape(clienteCF)}</CodiceFiscale>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12"
  xmlns:p="${XML_NAMESPACE}"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="${XML_NAMESPACE} http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${xmlEscape(piva)}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${progressivo}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${codiceSDI}</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${xmlEscape(piva)}</IdCodice>
        </IdFiscaleIVA>${cfCedenteXml}
        <Anagrafica>
          <Nome>${xmlEscape(profileNome)}</Nome>
          <Cognome>${xmlEscape(profileCognome)}</Cognome>
        </Anagrafica>
        <RegimeFiscale>${regimeFiscale}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${cedInd}</Indirizzo>
        <CAP>${cedCap}</CAP>
        <Comune>${cedCom}</Comune>${cedProvXml}
        <Nazione>${cedNaz}</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>${cessionarioFiscaleXml}
        <Anagrafica>
          <Denominazione>${xmlEscape(String(cliente.nome || '').slice(0, 80))}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${cliInd}</Indirizzo>
        <CAP>${cliCap}</CAP>
        <Comune>${cliCom}</Comune>${cliProvXml}
        <Nazione>${cliNaz}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${tipoDoc}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${xmlEscape(draft.data)}</Data>
        <Numero>${xmlEscape(draft.numero)}</Numero>${xmlRitenuta}${datiBollo}
        <ImportoTotaleDocumento>${fmtXmlNum(round2(totals.total * sign))}</ImportoTotaleDocumento>${causaleXml}
      </DatiGeneraliDocumento>${datiCollegate}
    </DatiGenerali>
    <DatiBeniServizi>
${dettaglioLinee.join('\n')}
      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <Natura>N2.2</Natura>
        <ImponibileImporto>${fmtXmlNum(round2(imponibile * sign))}</ImponibileImporto>
        <Imposta>0.00</Imposta>
        <RiferimentoNormativo>Art. 1, commi 54-89, L. 190/2014</RiferimentoNormativo>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${modalitaToCodiceMP(draft.modalitaPagamento)}</ModalitaPagamento>${scadenzaXml}
        <ImportoPagamento>${fmtXmlNum(round2((totals.total - (Number(draft.ritenuta) || 0)) * sign))}</ImportoPagamento>${ibanXml}
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
  }

  function downloadFatturaXml() {
    const draft = collectDraftFromState();
    const val = validateFatturaForXml(draft);
    if (val.errors.length) { showFatturaToast(val.errors[0], 'error'); return; }
    const xml = buildFatturaElettronicaXml(draft);
    const fileName = `IT${String(getProfileFiscalData().partitaIva).replace(/\D/g,'')}_${getXmlInvoiceProgressivo(draft)}.xml`;
    downloadTextFile(fileName, xml);
    showSdiUploadGuide(fileName);
  }

  function makeSdiStep(num, text) {
    const div = document.createElement('div');
    div.className = 'sdi-step';
    const badge = document.createElement('div');
    badge.className = 'sdi-step-badge';
    badge.textContent = String(num);
    const body = document.createElement('div');
    body.className = 'sdi-step-body';
    body.innerHTML = text; // eslint-disable-line -- caller passes trusted constant strings
    div.appendChild(badge);
    div.appendChild(body);
    return div;
  }

  function makeSdiProblem(label, desc) {
    const div = document.createElement('div');
    div.className = 'sdi-problem-row';
    const lbl = document.createElement('span');
    lbl.className = 'sdi-problem-label';
    lbl.textContent = label;
    const txt = document.createElement('span');
    txt.innerHTML = desc; // eslint-disable-line -- trusted constant strings
    div.appendChild(lbl);
    div.appendChild(txt);
    return div;
  }

  function renderSdiGuideInto(modalContent, fileName) {
    const fileCode = fileName ? esc(fileName) : 'IT{PIVA}_{numero}.xml';
    const guide = document.createElement('div');
    guide.className = 'sdi-upload-guide';

    // Header
    if (fileName) {
      const hdr = document.createElement('div');
      hdr.className = 'sdi-guide-file-row';
      const icon = document.createElement('span');
      icon.className = 'sdi-guide-file-icon';
      icon.textContent = '\u2713';
      const info = document.createElement('div');
      const t = document.createElement('div');
      t.className = 'sdi-guide-title';
      t.textContent = 'File XML scaricato';
      const s = document.createElement('div');
      s.className = 'sdi-guide-subtitle';
      s.textContent = fileName;
      info.appendChild(t);
      info.appendChild(s);
      hdr.appendChild(icon);
      hdr.appendChild(info);
      guide.appendChild(hdr);
    } else {
      const h = document.createElement('div');
      h.className = 'sdi-guide-title';
      h.textContent = 'Come inviare la fattura al SdI';
      guide.appendChild(h);
    }

    // Label
    const lbl = document.createElement('div');
    lbl.className = 'sdi-guide-label';
    lbl.textContent = 'Passi per l\'invio sul portale Fatture e Corrispettivi';
    guide.appendChild(lbl);

    // Steps
    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'sdi-steps-list';
    stepsWrap.appendChild(makeSdiStep(1,
      'Accedi al portale AdE con SPID o CIE: '
      + '<a href="https://ivaservizi.agenziaentrate.gov.it/portale/" target="_blank" rel="noopener" class="sdi-guide-link">ivaservizi.agenziaentrate.gov.it/portale</a>'));
    stepsWrap.appendChild(makeSdiStep(2,
      'Clicca in alto su <strong>\u201cFatture e Corrispettivi\u201d</strong> e accedi con le tue credenziali.'));
    stepsWrap.appendChild(makeSdiStep(3,
      'Nel menu a sinistra vai su <strong>\u201cFatture elettroniche\u201d &rarr; \u201cTrasmissione / ricezione\u201d</strong>.'
      + '<div class="sdi-guide-note">Se non lo vedi: cerca il riquadro \u201cFatturazione elettronica\u201d nella home del portale.</div>'));
    stepsWrap.appendChild(makeSdiStep(4,
      'Clicca <strong>\u201cTrasmetti un file\u201d</strong>, carica il file <code>' + fileCode + '</code> e conferma.'));
    stepsWrap.appendChild(makeSdiStep(5,
      'Attendi la <strong>ricevuta di presa in carico</strong>. Lo stato diventer\u00e0 <em>Consegnata</em> quando il cliente riceve la fattura.'));
    guide.appendChild(stepsWrap);

    // Problems
    const prob = document.createElement('div');
    prob.className = 'sdi-guide-problems';
    const pt = document.createElement('div');
    pt.className = 'sdi-guide-problems-title';
    pt.textContent = 'Problemi frequenti';
    prob.appendChild(pt);
    prob.appendChild(makeSdiProblem('Fattura scartata',
      'Controlla P.IVA emittente e dati cliente, poi rigenera e ricarica l\'XML.'));
    prob.appendChild(makeSdiProblem('Codice SDI mancante',
      'Inseriscilo nell\'Anagrafica Clienti (7 cifre). Senza di esso usa <code>0000000</code> e manda il PDF via email.'));
    prob.appendChild(makeSdiProblem('Non trovi "Trasmissione"',
      'Il portale AdE cambia layout &mdash; cerca \u201cTrasmetti file XML\u201d o \u201cInvia fattura\u201d nella sezione Fatturazione elettronica.'));
    guide.appendChild(prob);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'sdi-guide-actions';
    const link = document.createElement('a');
    link.href = 'https://ivaservizi.agenziaentrate.gov.it/portale/';
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'btn-add sdi-portal-btn';
    link.textContent = 'Apri portale AdE';
    const closeB = document.createElement('button');
    closeB.type = 'button';
    closeB.className = 'btn-ghost';
    closeB.textContent = 'Chiudi';
    closeB.onclick = function () { closeFatturaModal(); renderFattureDocsSection(); };
    actions.appendChild(link);
    actions.appendChild(closeB);
    guide.appendChild(actions);

    modalContent.innerHTML = '';
    modalContent.appendChild(guide);
  }

  function showSdiUploadGuide(fileName) {
    const modalContent = document.getElementById('fatturaModalContent');
    if (!modalContent) return;
    renderSdiGuideInto(modalContent, fileName);
    const m = document.getElementById('fatturaModal');
    if (m && !m.classList.contains('open')) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
      document.body.classList.add('profile-modal-open');
    }
  }

  function openSdiGuideModal() {
    const modalContent = document.getElementById('fatturaModalContent');
    if (!modalContent) return;
    renderSdiGuideInto(modalContent, null);
    const m = document.getElementById('fatturaModal');
    if (m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
    document.body.classList.add('profile-modal-open');
  }

  // ─── Task 8: Anteprima XML + Nota di credito da storico ─────────────────────

  function previewFatturaXml() {
    try {
      const saved = saveFatturaDraft(true);
      if (!saved) return;
      const xml = (saved.tipoDocumento === 'TD04' && saved.fatturaOriginaleId)
        ? buildFatturaElettronicaXmlNC(saved, _findOriginale(saved.fatturaOriginaleId))
        : buildFatturaElettronicaXml(saved);
      showXmlPreviewModal(xml, saved.numero);
    } catch (err) {
      console.error('previewFatturaXml', err);
      showFatturaToast('Errore anteprima XML: ' + err.message, 'error');
    }
  }

  function _findOriginale(id) {
    const profile = (typeof window.getProfile === 'function') ? window.getProfile() : sessionStorage.getItem('calcoliPIVA_profile');
    const fatture = loadFattureEmesse(profile);
    return fatture.find(f => f.id === id);
  }

  function _formatXml(xml) {
    // Pretty-print con indent 2 spazi
    let formatted = '';
    let pad = 0;
    xml.replace(/></g, '>\n<').split('\n').forEach(node => {
      let indent = 0;
      if (node.match(/^<\/\w/)) pad = Math.max(pad - 1, 0);
      else if (node.match(/^<\w[^>]*[^/]>$/)) indent = 1;
      formatted += '  '.repeat(pad) + node + '\n';
      pad += indent;
    });
    return formatted.trim();
  }

  function showXmlPreviewModal(xml, numero) {
    // Modal costruito via DOM API (NO innerHTML con XML — security)
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
        showFatturaToast('Errore copia: ' + err.message, 'error');
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

  function openNotaCreditoModal(fatturaOriginaleId) {
    const profile = (typeof window.getProfile === 'function') ? window.getProfile() : sessionStorage.getItem('calcoliPIVA_profile');
    const fatture = loadFattureEmesse(profile);
    const orig = fatture.find(f => f.id === fatturaOriginaleId);
    if (!orig) { showFatturaToast('Fattura originale non trovata', 'error'); return; }
    const annoOggi = new Date().getFullYear();
    const fattureStorico = window.FattureStorico ? window.FattureStorico.load(profile) : [];
    const prog = window.FattureStorico ? window.FattureStorico.nextProgressivo(annoOggi, fattureStorico) : 1;
    const draft = {
      ...DRAFT_TEMPLATE,
      id: 'nc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      numero: window.FattureStorico ? window.FattureStorico.formatNumero(annoOggi, prog) : (annoOggi + '/001'),
      annoProgressivo: annoOggi,
      progressivo: prog,
      data: new Date().toISOString().slice(0, 10),
      anno: annoOggi,
      clienteId: orig.clienteId,
      clienteSnapshot: { ...orig.clienteSnapshot },
      righe: (orig.righe || []).map(r => ({ ...r, descrizione: 'STORNO \u2014 ' + r.descrizione })),
      tipoDocumento: 'TD04',
      fatturaOriginaleId: orig.id,
      stato: 'bozza',
      marcaDaBollo: false,
      contributoIntegrativo: orig.contributoIntegrativo || 0
    };
    state.draft = draft;
    state.editingId = null;
    state.numberAuto = false;
    renderFatturaModal();
    const m = document.getElementById('fatturaModal');
    if (m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
    document.body.classList.add('profile-modal-open');
  }

  const MESI_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

  function openFatturaDaCalendarioPicker() {
    if (typeof getMonthStats !== 'function' || typeof S !== 'function') {
      alert('Calendario non disponibile in questo contesto.');
      return;
    }
    let modal = document.getElementById('calFatturaPicker');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'calFatturaPicker';
      modal.className = 'archivio-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      const body = document.createElement('div');
      body.className = 'archivio-modal-body';
      body.style.width = 'min(520px, 92vw)';
      const head = document.createElement('div');
      head.className = 'archivio-modal-head';
      const h3 = document.createElement('h3');
      h3.style.margin = '0';
      h3.textContent = 'Fattura da calendario';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn-icon';
      closeBtn.setAttribute('aria-label', 'Chiudi');
      closeBtn.addEventListener('click', () => modal.classList.remove('open'));
      closeBtn.appendChild(_svgClose());
      head.appendChild(h3);
      head.appendChild(closeBtn);
      const content = document.createElement('div');
      content.className = 'archivio-modal-content';
      content.id = 'calFatturaPickerContent';
      body.appendChild(head);
      body.appendChild(content);
      modal.appendChild(body);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
      document.body.appendChild(modal);
    }
    _renderCalFatturaPickerContent();
    modal.classList.add('open');
  }

  function _svgClose() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6');
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', 'M18 6L6 18M6 6l12 12');
    svg.appendChild(p);
    return svg;
  }

  function _renderCalFatturaPickerContent() {
    const host = document.getElementById('calFatturaPickerContent');
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    const year = (typeof currentYear !== 'undefined') ? currentYear : new Date().getFullYear();
    const rate = Number(S().dailyRate) || 0;

    const note = document.createElement('p');
    note.className = 'manuali-note';
    note.style.marginBottom = '12px';
    note.textContent = 'Seleziona il mese: verranno precompilate due righe (giornate intere + mezze giornate) usando la tariffa giornaliera di ' + rate.toLocaleString('it-IT') + ' € per l\'anno ' + year + '.';
    host.appendChild(note);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    grid.style.gap = '8px';

    for (let m = 1; m <= 12; m++) {
      const stats = getMonthStats(m);
      const gg = stats.worked || 0;
      const mm = stats.M || 0;
      const tot = gg * rate + mm * rate / 2;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fatture-filter-btn';
      btn.style.padding = '10px 8px';
      btn.style.textAlign = 'left';
      btn.style.background = 'var(--color-surface-2)';
      btn.style.color = 'var(--color-text)';
      btn.style.fontSize = '12px';
      btn.style.lineHeight = '1.35';
      btn.disabled = (gg === 0 && mm === 0);
      if (btn.disabled) btn.style.opacity = '0.4';
      const label = MESI_IT[m - 1];
      const detail = (gg > 0 ? gg + ' gg' : '') + (gg > 0 && mm > 0 ? ' + ' : '') + (mm > 0 ? mm + ' mezze' : '');
      const line1 = document.createElement('div');
      line1.style.fontWeight = '700';
      line1.textContent = label;
      const line2 = document.createElement('div');
      line2.style.color = 'var(--color-text-muted)';
      line2.style.fontSize = '11px';
      line2.textContent = detail ? (detail + ' · ' + tot.toLocaleString('it-IT') + ' €') : 'nessuna giornata';
      btn.appendChild(line1);
      btn.appendChild(line2);
      btn.addEventListener('click', () => {
        document.getElementById('calFatturaPicker').classList.remove('open');
        openFatturaDaCalendario(m, year);
      });
      grid.appendChild(btn);
    }
    host.appendChild(grid);
  }

  function openFatturaDaCalendario(month, year) {
    if (typeof getMonthStats !== 'function' || typeof S !== 'function') return;
    const stats = getMonthStats(month);
    const rate = Number(S().dailyRate) || 0;
    const gg = stats.worked || 0;
    const mm = stats.M || 0;
    if (gg === 0 && mm === 0) { alert('Nessuna giornata lavorata per ' + MESI_IT[month - 1] + ' ' + year + '.'); return; }

    openFatturaModal();
    if (!state.draft) return;
    const mese = MESI_IT[month - 1];
    const righe = [];
    if (gg > 0) {
      righe.push(cloneLine({
        descrizione: 'Consulenza ' + mese + ' ' + year + ' — giornate intere',
        quantita: gg,
        prezzoUnitario: rate,
        iva: 0
      }));
    }
    if (mm > 0) {
      righe.push(cloneLine({
        descrizione: 'Consulenza ' + mese + ' ' + year + ' — mezze giornate',
        quantita: mm,
        prezzoUnitario: rate / 2,
        iva: 0
      }));
    }
    state.draft.righe = righe;
    renderFatturaModal();
  }

  window.openFatturaDaCalendarioPicker = openFatturaDaCalendarioPicker;
  window.openFatturaDaCalendario = openFatturaDaCalendario;
  window.buildFatturaElettronicaXmlNC = buildFatturaElettronicaXmlNC;
  window.normalizeInvoice = normalizeInvoice;
  window.openFatturaModal = openFatturaModal;
  window.closeFatturaModal = closeFatturaModal;
  window.openSdiGuideModal = openSdiGuideModal;
  window.renderFattureDocsSection = renderFattureDocsSection;
  window.updateFatturaDraftField = updateFatturaDraftField;
  window.updateFatturaLineField = updateFatturaLineField;
  window.addFatturaLine = addFatturaLine;
  window.removeFatturaLine = removeFatturaLine;
  window.saveFatturaDraft = saveFatturaDraft;
  window.previewFatturaPdf = previewFatturaPdf;
  window.downloadFatturaPdf = downloadFatturaPdf;
  window.downloadFatturaXml = downloadFatturaXml;
  window.previewFatturaXml = previewFatturaXml;
  window.showXmlPreviewModal = showXmlPreviewModal;
  window.openNotaCreditoModal = openNotaCreditoModal;
  window.setFattureFilter = setFattureFilter;

  if (currentProfile && document.getElementById('fattureDocsContent')) renderFattureDocsSection();
})();
