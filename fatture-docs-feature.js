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
  const XML_FORFETTARIO_REGIME = 'RF19';
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
    dataIncasso: ''
  };

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

  function renderFattureDocsSection() {
    const el = document.getElementById('fattureDocsContent');
    if (!el) return;
    if (!currentProfile) {
      el.innerHTML = `<div class="fatture-docs-empty">Accedi per creare e salvare fatture.</div>`;
      return;
    }
    const invoices = loadFattureEmesse().sort((a, b) => {
      const da = `${a.data || ''} ${a.numero || ''}`;
      const db = `${b.data || ''} ${b.numero || ''}`;
      return db.localeCompare(da);
    });
    const yearInvoices = invoices.filter(inv => parseInt(inv.anno, 10) === currentYear);
    const recent = invoices.slice(0, 5);
    const total = yearInvoices.reduce((sum, inv) => sum + (parseMaybeNumber(inv.totaleDocument) || 0), 0);
    el.innerHTML = `
      <div class="fatture-docs-toolbar">
        <div class="fatture-docs-copy">
          <div class="fatture-docs-kicker">Crea fattura</div>
          <h4>Genera PDF e registra lo storico</h4>
          <p>La fattura salvata alimenta anche la tab mensile nel mese di emissione, così il riepilogo fiscale resta coerente.</p>
        </div>
        <div class="fatture-docs-actions">
          <button class="btn-add" type="button" onclick="openFatturaModal()">+ Crea fattura</button>
          <button class="btn-ghost sdi-guide-btn" type="button" onclick="openSdiGuideModal()">Guida invio SdI</button>
        </div>
      </div>
      <div class="fatture-docs-summary-grid">
        <div class="fatture-docs-card">
          <span>Fatture ${currentYear}</span>
          <b>${yearInvoices.length}</b>
        </div>
        <div class="fatture-docs-card">
          <span>Totale ${currentYear}</span>
          <b>${typeof fmt === 'function' ? fmt(total) : total.toFixed(2)}</b>
        </div>
        <div class="fatture-docs-card">
          <span>Storico salvato</span>
          <b>${invoices.length}</b>
        </div>
      </div>
      <div class="fatture-docs-history">
        ${recent.length ? recent.map(renderFatturaHistoryItemRich).join('') : '<div class="fatture-docs-empty">Nessuna fattura emessa ancora. Crea la prima dal pulsante qui sopra.</div>'}
      </div>
    `;
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
    renderFatturaSummary();
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

  // --- MOTORE PDF (html2pdf) ---
  function buildInvoiceHtmlNode(invoice) {
    const profile = getProfileFiscalData();
    const cliente = invoice.clienteSnapshot || (typeof getClienteById === 'function' ? getClienteById(invoice.clienteId) : null) || {};
    const totals = computeDraftTotals(invoice);
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute'; wrapper.style.left = '-9999px'; wrapper.style.top = '0'; wrapper.style.width = '800px';
    wrapper.innerHTML = `
      <div id="invoice-render-box" style="width: 100%; padding: 40px; font-family: 'Helvetica', sans-serif; color: #121a24; background: #fff; box-sizing: border-box;">
         <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px;">
           <div>
             <h1 style="margin: 0; color: #1e293b; font-size: 28px; letter-spacing: 1px; font-weight: 700; text-transform: uppercase;">FATTURA</h1>
             <div style="margin-top: 5px; font-size: 13px; color: #64748b; font-weight: 500;">N. ${esc(invoice.numero)} del ${formatDisplayDate(invoice.data)}</div>
           </div>
           <div style="text-align: right; font-size: 11px; color: #1e293b; line-height: 1.5;">
             <strong style="font-size: 14px;">${esc(profile.nome || currentProfile)}</strong><br>
             ${esc(profile.indirizzo)}<br>${esc(profile.cap)} ${esc(profile.citta)} ${esc(profile.provincia)}<br>
             P.IVA ${esc(profile.partitaIva)}<br>${profile.codiceFiscale ? 'C.F. ' + esc(profile.codiceFiscale) : ''}
           </div>
         </div>
         <div style="display: flex; gap: 30px; margin-bottom: 40px;">
           <div style="flex: 1; border: 1px solid #e2e8f0; padding: 15px; border-radius: 4px;">
             <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">Destinatario</div>
             <div style="font-size: 13px; font-weight: 700; margin-bottom: 4px; color: #0f172a;">${esc(cliente.nome || 'Cliente non selezionato')}</div>
             <div style="font-size: 11px; line-height: 1.5; color: #334155;">
               ${esc(cliente.indirizzo)}<br>${esc(cliente.cap)} ${esc(cliente.citta)} ${esc(cliente.provincia)}<br>
               ${cliente.partitaIva ? 'P.IVA ' + esc(cliente.partitaIva) + '<br>' : ''}${cliente.codiceFiscale ? 'C.F. ' + esc(cliente.codiceFiscale) + '<br>' : ''}
               ${cliente.codiceSDI ? 'SDI: ' + esc(cliente.codiceSDI) : ''}
             </div>
           </div>
           <div style="flex: 1; border: 1px solid #e2e8f0; padding: 15px; border-radius: 4px;">
             <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">Dettagli Pagamento</div>
             <div style="font-size: 11px; line-height: 1.6; color: #334155;">
               <strong>Scadenza:</strong> ${formatDisplayDate(invoice.scadenzaPagamento) || '-'}<br>
               <strong>Metodo:</strong> ${esc(invoice.modalitaPagamento)}<br>
               ${invoice.iban ? '<strong>IBAN:</strong> <span style="font-family: monospace;">' + esc(invoice.iban) + '</span><br>' : ''}
               <strong>Bollo:</strong> ${invoice.marcaDaBollo ? 'Assolto virtualmente (2,00 €)' : 'Non applicato'}
             </div>
           </div>
         </div>
         <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px;">
           <thead>
             <tr style="background: #1e293b; color: white;">
               <th style="padding: 12px 10px; text-align: left;">Descrizione</th>
               <th style="padding: 12px 10px; text-align: right; width: 60px;">Q.tà</th>
               <th style="padding: 12px 10px; text-align: right; width: 100px;">Prezzo Unit.</th>
               <th style="padding: 12px 10px; text-align: right; width: 100px;">Totale</th>
             </tr>
           </thead>
           <tbody>
             ${invoice.righe.map((line, idx) => `
               <tr style="border-bottom: 1px solid #f1f5f9; ${idx % 2 === 0 ? 'background: #ffffff;' : 'background: #f8fafc;'}">
                 <td style="padding: 12px 10px; color: #0f172a; font-weight: 500;">${esc(line.descrizione)}</td>
                 <td style="padding: 12px 10px; text-align: right; color: #475569;">${parseMaybeNumber(line.quantita)}</td>
                 <td style="padding: 12px 10px; text-align: right; color: #475569;">${formatPdfMoney(parseMaybeNumber(line.prezzoUnitario))}</td>
                 <td style="padding: 12px 10px; text-align: right; font-weight: 600; color: #0f172a;">${formatPdfMoney(parseMaybeNumber(line.quantita) * parseMaybeNumber(line.prezzoUnitario))}</td>
               </tr>
             `).join('')}
           </tbody>
         </table>
         <div style="display: flex; gap: 40px; align-items: flex-end;">
           <div style="flex: 1.5; font-size: 10px; color: #64748b; line-height: 1.6; border-top: 1px solid #f1f5f9; padding-top: 15px;">
             <strong>Informazioni aggiuntive:</strong><br>${esc(invoice.note)}
           </div>
           <div style="flex: 1;">
             <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
               <tr><td style="padding: 6px 0; color: #64748b;">Imponibile</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #0f172a;">${formatPdfMoney(totals.subtotal)}</td></tr>
               ${totals.contributoIntegrativo > 0 ? `<tr><td style="padding: 6px 0; color: #64748b;">Contributo integrativo</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #0f172a;">${formatPdfMoney(totals.contributoIntegrativo)}</td></tr>` : ''}
               ${totals.bollo > 0 ? `<tr><td style="padding: 6px 0; color: #64748b;">Marca da bollo</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #0f172a;">2,00 EUR</td></tr>` : ''}
               <tr style="border-top: 2px solid #1e293b;"><td style="padding: 12px 0; color: #1e293b; font-weight: 700; font-size: 15px;">TOTALE FATTURA</td><td style="padding: 12px 0; text-align: right; font-weight: 700; color: #1e293b; font-size: 15px;">${formatPdfMoney(totals.total)}</td></tr>
             </table>
           </div>
         </div>
      </div>
    `;
    return wrapper;
  }

  async function downloadFatturaPdf() {
    const saved = saveFatturaDraft(true); if (!saved) return;
    try {
      const node = buildInvoiceHtmlNode(saved); document.body.appendChild(node);
      const opt = { margin: 0, filename: `fattura_${saved.numero.replace(/\//g,'-')}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } };
      await window.html2pdf().set(opt).from(node.firstElementChild).save(); node.remove();
      showFatturaToast('PDF scaricato.');
    } catch (err) { console.error(err); showFatturaToast('Errore PDF', 'error'); }
  }

  async function previewFatturaPdf() {
    const saved = saveFatturaDraft(true); if (!saved) return;
    try {
      const node = buildInvoiceHtmlNode(saved); document.body.appendChild(node);
      const pdfBlob = await window.html2pdf().set({ margin: 0, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4' } }).from(node.firstElementChild).output('blob');
      node.remove();
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(pdfBlob);
      window.open(state.previewUrl, '_blank');
    } catch (err) { console.error(err); showFatturaToast('Errore Anteprima', 'error'); }
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

  function buildFatturaElettronicaXml(draft) {
    const profile = getProfileFiscalData();
    const cliente = draft.clienteSnapshot || {};
    const totals = computeDraftTotals(draft);

    const piva = String(profile.partitaIva || '').replace(/\D/g, '');
    const progressivo = getXmlInvoiceProgressivo(draft);
    const codiceSDI = String(cliente.codiceSDI || '0000000').trim().padEnd(7, '0').slice(0, 7);

    // Split profile name into Nome/Cognome (natural person)
    const nameParts = String(profile.nome || currentProfile).trim().split(/\s+/);
    const profileCognome = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
    const profileNome = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';

    // Client identification
    const clientePiva = String(cliente.partitaIva || '').replace(/\D/g, '');
    const clienteCF = String(cliente.codiceFiscale || '').trim();

    // Imponibile = sum of all lines + contributo integrativo (bollo excluded)
    const imponibile = round2(totals.subtotal + totals.contributoIntegrativo);

    // Lines
    let lineNum = 0;
    const dettaglioLinee = (draft.righe || []).map(line => {
      lineNum++;
      const qta = parseMaybeNumber(line.quantita) || 1;
      const pu = round2(parseMaybeNumber(line.prezzoUnitario));
      const tot = round2(qta * pu);
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
      <PrezzoTotale>${fmtXmlNum(totals.contributoIntegrativo)}</PrezzoTotale>
      <AliquotaIVA>0.00</AliquotaIVA>
      <Natura>N2.2</Natura>
    </DettaglioLinee>`);
    }

    const datiBollo = draft.marcaDaBollo ? `
      <DatiBollo>
        <BolloVirtuale>SI</BolloVirtuale>
        <ImportoBollo>2.00</ImportoBollo>
      </DatiBollo>` : '';

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

    // Client fiscal ID
    let cessionarioFiscaleXml = '';
    if (clientePiva) {
      cessionarioFiscaleXml = `
      <IdFiscaleIVA>
        <IdPaese>IT</IdPaese>
        <IdCodice>${xmlEscape(clientePiva)}</IdCodice>
      </IdFiscaleIVA>`;
      if (clienteCF) cessionarioFiscaleXml += `\n        <CodiceFiscale>${xmlEscape(clienteCF)}</CodiceFiscale>`;
    } else if (clienteCF) {
      cessionarioFiscaleXml = `\n        <CodiceFiscale>${xmlEscape(clienteCF)}</CodiceFiscale>`;
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
        <RegimeFiscale>${XML_FORFETTARIO_REGIME}</RegimeFiscale>
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
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${xmlEscape(draft.data)}</Data>
        <Numero>${xmlEscape(draft.numero)}</Numero>${datiBollo}${causaleXml}
        <ImportoTotaleDocumento>${fmtXmlNum(totals.total)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
${dettaglioLinee.join('\n')}
      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <Natura>N2.2</Natura>
        <ImponibileImporto>${fmtXmlNum(imponibile)}</ImponibileImporto>
        <Imposta>0.00</Imposta>
        <RiferimentoNormativo>Art. 1, commi 54-89, L. 190/2014</RiferimentoNormativo>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${modalitaToCodiceMP(draft.modalitaPagamento)}</ModalitaPagamento>${scadenzaXml}
        <ImportoPagamento>${fmtXmlNum(totals.total)}</ImportoPagamento>${ibanXml}
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

  function renderSdiGuideInto(modalContent, fileName) {
    const fileRow = fileName
      ? '<div class="sdi-guide-file-row"><span class="sdi-guide-file-icon">&#10003;</span>'
        + '<div><div class="sdi-guide-title">File XML scaricato</div>'
        + '<div class="sdi-guide-subtitle">' + esc(fileName) + '</div></div></div>'
      : '<div class="sdi-guide-title" style="margin-bottom:12px">Come inviare la fattura al SdI</div>';
    const fileCode = fileName ? esc(fileName) : 'IT{PIVA}_{numero}.xml';
    const closeBtn = '<button type="button" class="btn-ghost" onclick="closeFatturaModal(); renderFattureDocsSection();">Chiudi</button>';
    const html = '<div class="sdi-upload-guide">'
      + fileRow
      + '<div class="sdi-guide-body">'
      + '<div class="sdi-guide-label">Passi per l\'invio sul portale Fatture e Corrispettivi</div>'
      + '<ol class="sdi-guide-steps">'
      + '<li><strong>Accedi al portale AdE</strong> con SPID o CIE:<br>'
      + '<a href="https://ivaservizi.agenziaentrate.gov.it/portale/" target="_blank" rel="noopener" class="sdi-guide-link">ivaservizi.agenziaentrate.gov.it/portale</a></li>'
      + '<li>Clicca in alto su <strong>"Fatture e Corrispettivi"</strong> e accedi con le tue credenziali.</li>'
      + '<li>Nel menu a sinistra vai su <strong>"Fatture elettroniche" &rarr; "Trasmissione / ricezione"</strong>.<br>'
      + '<span class="sdi-guide-note">Se non lo vedi: cerca il riquadro "Fatturazione elettronica" nella home del portale.</span></li>'
      + '<li>Clicca <strong>"Trasmetti un file"</strong>, carica il file <code>' + fileCode + '</code> e conferma.</li>'
      + '<li>Attendi la <strong>ricevuta di presa in carico</strong>. Lo stato diventer&agrave; <em>Consegnata</em> quando il cliente riceve la fattura.</li>'
      + '</ol>'
      + '<div class="sdi-guide-problems">'
      + '<div class="sdi-guide-problems-title">Problemi frequenti</div>'
      + '<ul class="sdi-guide-steps">'
      + '<li><strong>Fattura scartata</strong>: controlla P.IVA emittente e dati cliente, poi rigenera e ricarica l\'XML.</li>'
      + '<li><strong>Codice SDI mancante</strong>: inseriscilo nell\'Anagrafica Clienti (7 cifre). Senza di esso usa <code>0000000</code> e manda il PDF via email.</li>'
      + '<li><strong>Non trovi "Trasmissione"</strong>: il portale AdE cambia layout — cerca "Trasmetti file XML" o "Invia fattura" nella sezione Fatturazione elettronica.</li>'
      + '</ul>'
      + '</div>'
      + '<div class="sdi-guide-actions">'
      + '<a href="https://ivaservizi.agenziaentrate.gov.it/portale/" target="_blank" rel="noopener" class="btn-add sdi-portal-btn">Apri portale AdE</a>'
      + closeBtn
      + '</div>'
      + '</div>'
      + '</div>';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html; // eslint-disable-line -- template built from escaped strings only
    modalContent.innerHTML = '';
    modalContent.appendChild(wrapper);
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

  if (currentProfile && document.getElementById('fattureDocsContent')) renderFattureDocsSection();
})();
