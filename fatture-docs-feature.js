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
    const righeArr = Array.isArray(inv.righe) ? inv.righe : [];
    const imp = righeArr.reduce((s, r) => s + (Number(r && r.quantita) || 0) * (Number(r && r.prezzoUnitario) || 0), 0);
    const contr = Number(inv.contributoIntegrativo) || 0;
    const bolloIn = (inv.marcaDaBollo && inv.bolloAddebitato) ? 2 : 0;
    const computedTot = Math.round((imp + contr + bolloIn + Number.EPSILON) * 100) / 100 + 0;
    const savedTot = Number(inv.totaleDocument);
    const legacyTot = Number(inv.totaleDocumento);
    let totaleDocument;
    if (Number.isFinite(savedTot) && savedTot > 0) totaleDocument = savedTot;
    else if (computedTot > 0) totaleDocument = computedTot;
    else if (Number.isFinite(legacyTot) && legacyTot > 0) totaleDocument = legacyTot;
    else totaleDocument = 0;
    let issuedYear = Number(inv.issuedYear);
    let issuedMonth = Number(inv.issuedMonth);
    if ((!Number.isFinite(issuedYear) || !issuedYear || !Number.isFinite(issuedMonth) || !issuedMonth) && inv.data) {
      const m = String(inv.data).match(/^(\d{4})-(\d{2})/);
      if (m) { issuedYear = parseInt(m[1], 10); issuedMonth = parseInt(m[2], 10); }
    }
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
      causaleRitenuta: inv.causaleRitenuta || 'A',
      totaleDocument: totaleDocument,
      issuedYear: issuedYear || null,
      issuedMonth: issuedMonth || null
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
    const bolloAddebitato = !!raw.bolloAddebitato;
    const bollo = marcaDaBollo ? 2 : 0;
    const bolloInTotal = marcaDaBollo && bolloAddebitato ? 2 : 0;
    const totale = round2(subtotal + contributoIntegrativo + bolloInTotal);
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
      bolloAddebitato,
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
      totaleDocument: totale,

      // Workflow stati
      stato: (['bozza','inviata','pagata','stornata'].indexOf(String(raw.stato || '')) >= 0) ? String(raw.stato) : 'bozza',
      tipoDocumento: (String(raw.tipoDocumento || '') === 'TD04') ? 'TD04' : 'TD01',
      dataInvioSdi: raw.dataInvioSdi ? String(raw.dataInvioSdi) : null,
      dataPagamento: raw.dataPagamento ? String(raw.dataPagamento) : null,

      // Numerazione progressiva
      annoProgressivo: Number.isFinite(Number(raw.annoProgressivo)) ? Number(raw.annoProgressivo) : (parseInt(raw.anno || dateParts.year, 10) || dateParts.year),
      progressivo: Number.isFinite(Number(raw.progressivo)) ? Number(raw.progressivo) : 0,

      // Ritenuta d'acconto (forfettario mixed/ordinario)
      ritenuta: round2(raw.ritenuta || 0),
      aliquotaRitenuta: Number.isFinite(Number(raw.aliquotaRitenuta)) ? Number(raw.aliquotaRitenuta) : 0,
      tipoRitenuta: String(raw.tipoRitenuta || ''),
      causaleRitenuta: String(raw.causaleRitenuta || ''),

      // Nota di credito (TD04) — link alla fattura originale
      fatturaOriginaleId: raw.fatturaOriginaleId ? String(raw.fatturaOriginaleId) : null,
      tipoStorno: (raw.tipoStorno === 'totale' || raw.tipoStorno === 'parziale') ? raw.tipoStorno : null,

      // Sul TD01: elenco NC collegate + totale stornato
      ncIds: Array.isArray(raw.ncIds) ? raw.ncIds.map(String) : [],
      ncTotaleImporto: round2(raw.ncTotaleImporto || 0),

      // Cessionario dettagli (fallback per contratto passivo/privato)
      cessionarioRagione: String(raw.cessionarioRagione || ''),
      cessionarioNome: String(raw.cessionarioNome || ''),
      cessionarioCognome: String(raw.cessionarioCognome || ''),

      // Incasso (spostato da riga monthly a fattura — unificazione store)
      pagMese: (raw.pagMese != null && Number(raw.pagMese) >= 1 && Number(raw.pagMese) <= 12) ? Number(raw.pagMese) : null,
      pagAnno: Number.isFinite(Number(raw.pagAnno)) ? Number(raw.pagAnno) : null,

      // Origine record (wizard | manuale | legacy-migrated | xml-import | xml-import-legacy)
      origine: (['wizard','manuale','legacy-migrated','xml-import','xml-import-legacy'].indexOf(raw.origine) >= 0) ? raw.origine : 'wizard',

      // Legacy migration flag: true once wizard ha completato i dati
      _legacyCompleted: raw._legacyCompleted === true
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
      bolloAddebitato: false,
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
    // Marca da bollo: l'importo (2 €) rientra nel totale fattura solo se
    // viene addebitato al cliente. Se il pro lo paga di tasca sua (caso
    // più comune per il forfettario) resta in DatiBollo ma non incrementa
    // il totale né compare come riga a carico del cliente.
    const bolloAmount = draft.marcaDaBollo ? 2 : 0;
    const bolloInTotal = draft.marcaDaBollo && draft.bolloAddebitato ? 2 : 0;
    const total = round2(subtotal + contributoIntegrativo + bolloInTotal);
    return { subtotal, contributoIntegrativo, bollo: bolloAmount, bolloInTotal, total, lineCount: lines.length };
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
    const profile = (typeof window.getProfile === 'function') ? window.getProfile() : (currentProfile || sessionStorage.getItem('calcoliPIVA_profile'));
    const all = window.FattureStorico ? window.FattureStorico.load(profile) : loadFattureEmesse(profile);
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
          const snap = inv.clienteSnapshot || {};
          const clienteRaw = snap.denominazione
            || [snap.nome, snap.cognome].filter(Boolean).join(' ')
            || snap.nome
            || inv.cessionarioRagione
            || '';
          const cliente = clienteRaw ? escHtml(clienteRaw) : '';
          const dataDoc = inv.data
            ? new Date(inv.data).toLocaleDateString('it-IT')
            : (inv.dataDocumento ? new Date(inv.dataDocumento).toLocaleDateString('it-IT') : '');
          let clienteDataLine;
          if (cliente && dataDoc) clienteDataLine = cliente + ' — ' + dataDoc;
          else if (cliente) clienteDataLine = cliente;
          else if (dataDoc) clienteDataLine = dataDoc;
          else clienteDataLine = '—';
          const numero = window.FattureStorico
            ? window.FattureStorico.formatNumero(inv.annoProgressivo, inv.progressivo)
            : (inv.annoProgressivo + '/' + inv.progressivo);
          const statoCorrente = inv.stato || 'bozza';
          const isBozza = statoCorrente === 'bozza';
          const isInviata = statoCorrente === 'inviata';
          let rowActions = '';
          if (isBozza) {
            rowActions = '<button type="button" class="fatture-row-action" title="Segna come inviata" onclick="event.stopPropagation(); window.quickMarkInviataFromCard && window.quickMarkInviataFromCard(\'' + escHtml(inv.id) + '\')" aria-label="Segna come inviata">✉</button>' +
              '<button type="button" class="fatture-row-action is-danger" title="Elimina bozza" onclick="event.stopPropagation(); window.quickDeleteBozzaFromCard && window.quickDeleteBozzaFromCard(\'' + escHtml(inv.id) + '\')" aria-label="Elimina bozza">×</button>';
          } else if (isInviata) {
            rowActions = '<button type="button" class="fatture-row-action" title="Segna come pagata" onclick="event.stopPropagation(); window.quickMarkPagataFromCard && window.quickMarkPagataFromCard(\'' + escHtml(inv.id) + '\')" aria-label="Segna come pagata">€</button>';
          }
          return '<div class="fatture-row" data-id="' + escHtml(inv.id) + '" role="button" tabindex="0">' +
            '<div class="fatture-num">' + escHtml(numero) + '</div>' +
            '<div class="fatture-client">' + clienteDataLine + '</div>' +
            '<div class="fatture-amount">' + fmtEur(inv.totaleDocument || 0) + '</div>' +
            '<div class="fatture-row-end">' +
              '<span class="fatture-badge ' + badgeClass + '">' + escHtml(badgeLabel) + '</span>' +
              rowActions +
            '</div>' +
          '</div>';
        }).join('');

    const summaryHtml = summaryVisible
      ? '<div class="fatture-summary">' + nInviate + ' da incassare · ' + fmtEur(totInviate) + '<span class="muted"> su ' + cTutte + ' emesse quest\'anno</span></div>'
      : '';

    const markup =
      '<div class="fatture-card">' +
        '<div class="fatture-card-head">' +
          '<div class="fatture-card-title">Fatture ' + year + '</div>' +
          '<div class="fatture-card-actions">' +
            '<button type="button" class="btn btn-ghost" onclick="window.openArchivioFatture && window.openArchivioFatture()" title="Archivio fatture (tutti gli anni)">Archivio</button>' +
            '<button type="button" class="btn btn-ghost" onclick="openFatturaDaCalendarioPicker()" title="Fattura mensile da calendario">+ Da calendario</button>' +
            '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'inputImportXmlNuove\').click()" title="Importa fatture XML FatturaPA (stato: inviata)">📄 Importa da XML</button>' +
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
    const totale = (parseMaybeNumber(line.quantita) || 0) * (parseMaybeNumber(line.prezzoUnitario) || 0);
    return `
      <div class="fattura-line" data-line-index="${index}">
        <div class="fattura-line-head">
          <span class="fattura-line-title">Prestazione ${index + 1}</span>
          <span class="fattura-line-total">${typeof fmt === 'function' ? fmt(totale) : totale.toFixed(2)}</span>
          <button type="button" class="fattura-remove-line" onclick="removeFatturaLine(${index})" aria-label="Rimuovi riga">&times;</button>
        </div>
        <label class="fattura-field fattura-field-wide">
          <span>Descrizione</span>
          <textarea rows="2" placeholder="Inserisci una descrizione della prestazione…"
            oninput="updateFatturaLineField(${index}, 'descrizione', this.value)">${descrizione}</textarea>
        </label>
        <div class="fattura-line-amounts">
          <label class="fattura-field">
            <span>Importo (€)</span>
            <input type="number" min="0" step="0.01" value="${prezzo}" placeholder="0.00"
              oninput="updateFatturaLineField(${index}, 'prezzoUnitario', this.value)">
          </label>
          <label class="fattura-field">
            <span>Quantità</span>
            <input type="number" min="0" step="0.01" value="${quantita}" placeholder="1"
              oninput="updateFatturaLineField(${index}, 'quantita', this.value)">
          </label>
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
    if (state.mode === 'view') { renderFatturaViewMode(el); return; }
    if (!state.step) state.step = 1;
    const draft = currentDraft();
    const step = state.step;
    const stepLabels = ['Cliente & Date', 'Righe', 'Opzioni & Riepilogo'];
    const dotsHtml = stepLabels.map((label, i) => {
      const n = i + 1;
      const cls = n === step ? 'active' : (n < step ? 'done' : '');
      return `<button type="button" class="fattura-wiz-dot ${cls}" onclick="goToFatturaStep(${n})"><span class="fattura-wiz-num">${n}</span><span class="fattura-wiz-label">${label}</span></button>`;
    }).join('<span class="fattura-wiz-line"></span>');
    el.innerHTML = `
      <div class="fattura-sheet">
        <div class="fattura-sheet-header">
          <div class="fattura-sheet-copy">
            <h2 id="fatturaModalTitle">${esc(state.editingId ? 'Modifica fattura' : 'Nuova fattura')}</h2>
            <p>Numero <b>${esc(draft.numero)}</b> · ${esc(draft.data)}</p>
          </div>
          <div class="fattura-sheet-actions">
            <button type="button" class="btn-add profile-secondary-btn" onclick="closeFatturaModal()">Chiudi</button>
            <button type="button" class="btn-add profile-secondary-btn" onclick="saveFatturaDraft(true)">Salva bozza</button>
          </div>
        </div>
        <div id="fatturaModalToast" class="fattura-modal-toast"></div>
        <div class="fattura-wiz-progress">${dotsHtml}</div>
        <form class="fattura-builder" onsubmit="return false;">
          <div id="fatturaStepContent"></div>
          <div class="fattura-wiz-actions">
            <button type="button" class="btn-add profile-secondary-btn" onclick="prevFatturaStep()" ${step === 1 ? 'disabled' : ''}>← Indietro</button>
            ${step < 3 ? '<button type="button" class="btn-add" onclick="nextFatturaStep()">Avanti →</button>' : '<button type="button" class="btn-add" onclick="saveFatturaDraft(false)">✓ Salva e invia</button>'}
          </div>
        </form>
      </div>
    `;
    renderFatturaStepContent();
    syncBolloDefault();
  }

  function renderFatturaStepContent() {
    const host = document.getElementById('fatturaStepContent');
    if (!host) return;
    const step = state.step || 1;
    if (step === 1) host.innerHTML = renderStep1Html();
    else if (step === 2) host.innerHTML = renderStep2Html();
    else host.innerHTML = renderStep3Html();
    if (step === 3) {
      _bindRitenutaHandlers();
      renderFatturaSummary();
    }
  }

  function goToFatturaStep(n) { state.step = Math.max(1, Math.min(3, n)); renderFatturaModal(); }
  function nextFatturaStep() { goToFatturaStep((state.step || 1) + 1); }
  function prevFatturaStep() { goToFatturaStep((state.step || 1) - 1); }

  function renderStep1Html() {
    const draft = currentDraft();
    const clienteOptions = typeof getClientiOptionsHtml === 'function' ? getClientiOptionsHtml(draft.clienteId) : '<option value="">Nessun cliente</option>';
    return `
      <div class="fattura-form-grid">
        <label class="fattura-field fattura-field-wide">
          <span>Cliente</span>
          <select id="fatturaCliente" onchange="updateFatturaDraftField('clienteId', this.value)">
            <option value="">Seleziona cliente...</option>
            ${clienteOptions}
          </select>
        </label>
        <label class="fattura-field">
          <span>Data emissione</span>
          <input id="fatturaData" type="date" value="${esc(draft.data)}" oninput="updateFatturaDraftField('data', this.value)">
        </label>
        <label class="fattura-field">
          <span>Scadenza pagamento</span>
          <input id="fatturaScadenza" type="date" value="${esc(draft.scadenzaPagamento)}" oninput="updateFatturaDraftField('scadenzaPagamento', this.value)">
        </label>
        <label class="fattura-field">
          <span>Stato pagamento</span>
          <div class="fattura-bollo-wrap">
            <input id="fatturaIncassata" type="checkbox" ${draft.incassata ? 'checked' : ''} onchange="updateFatturaDraftField('incassata', this.checked)">
            <span>Già incassata</span>
          </div>
        </label>
        <label class="fattura-field">
          <span>Data incasso</span>
          <input id="fatturaDataIncasso" type="date" value="${esc(draft.dataIncasso)}" oninput="updateFatturaDraftField('dataIncasso', this.value)" ${!draft.incassata ? 'disabled' : ''}>
        </label>
      </div>
    `;
  }

  function renderStep2Html() {
    const draft = currentDraft();
    const rowHtml = (draft.righe || []).map((line, idx) => buildLineRowHtml(line, idx)).join('');
    return `
      <div class="fattura-lines-head">
        <h3>Righe fattura</h3>
        <button type="button" class="btn-add" onclick="addFatturaLine()">+ Riga</button>
      </div>
      <div class="fattura-lines">${rowHtml}</div>
    `;
  }

  function _clearRitenutaForForfettario(draft) {
    draft.ritenuta = 0;
    draft.aliquotaRitenuta = 0;
    if (draft.tipoRitenuta) draft.tipoRitenuta = '';
    if (draft.causaleRitenuta) draft.causaleRitenuta = '';
  }
  if (typeof window !== 'undefined') window._clearRitenutaForForfettario = _clearRitenutaForForfettario;

  function renderStep3Html() {
    const draft = currentDraft();
    const isForfettarioRegime = (() => {
      try { return (typeof getSettings === 'function') && getSettings().regime === 'forfettario'; }
      catch (_e) { return false; }
    })();
    if (isForfettarioRegime && Number(draft.ritenuta) > 0) {
      _clearRitenutaForForfettario(draft);
    }
    return `
      <div class="fattura-form-grid">
        <label class="fattura-field">
          <span>IBAN</span>
          <input id="fatturaIban" type="text" value="${esc(draft.iban)}" oninput="updateFatturaDraftField('iban', this.value)">
        </label>
        <label class="fattura-field">
          <span>Contributo integrativo (€)</span>
          <input id="fatturaContributoIntegrativo" type="number" min="0" step="0.01" value="${esc(draft.contributoIntegrativo)}" oninput="updateFatturaDraftField('contributoIntegrativo', this.value)">
        </label>
        <label class="fattura-field fattura-bollo-field">
          <span>Marca da bollo</span>
          <div style="font-size:11px; color:var(--color-text-muted); padding:6px 0;">
            ${draft.marcaDaBollo ? 'Applicata automaticamente (2,00 €)' : 'Non applicabile (imponibile ≤ 77,47 €)'}
          </div>
          <div class="fattura-bollo-wrap" style="opacity:${draft.marcaDaBollo ? '1' : '0.4'};">
            <input id="fatturaBolloAddebitato" type="checkbox" ${draft.bolloAddebitato ? 'checked' : ''} ${!draft.marcaDaBollo ? 'disabled' : ''} onchange="updateFatturaDraftField('bolloAddebitato', this.checked)">
            <span style="font-size:10px; color:var(--color-text-faint); text-transform:uppercase; letter-spacing:.04em;">Addebita al cliente</span>
          </div>
        </label>
        ${isForfettarioRegime ? `
        <div class="fattura-field fattura-field-wide">
          <span>Ritenuta d'acconto</span>
          <div style="font-size:11px; color:var(--color-text-muted); padding:6px 0;">
            Non applicabile: il regime forfettario è esonerato dalla ritenuta (art. 1 c. 67 L. 190/2014).
          </div>
        </div>
        ` : `
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
        `}
        <label class="fattura-field fattura-field-wide">
          <span>Nota</span>
          <textarea id="fatturaNota" rows="2" oninput="updateFatturaDraftField('note', this.value)">${esc(draft.note)}</textarea>
        </label>
      </div>
      <div id="fatturaSummary" class="fattura-summary"></div>
      <div class="fattura-export-row">
        <button type="button" class="btn-add profile-secondary-btn" onclick="previewFatturaPdf()">Anteprima PDF</button>
        <button type="button" class="btn-add profile-secondary-btn" onclick="previewFatturaXml()">Anteprima XML</button>
        <button type="button" class="btn-add profile-secondary-btn" onclick="downloadFatturaXml()">Scarica XML</button>
      </div>
    `;
  }

  function renderFatturaViewMode(el) {
    const draft = currentDraft();
    const totals = computeDraftTotals(draft);
    const cliente = (draft.clienteId && typeof getClienteById === 'function') ? getClienteById(draft.clienteId) : draft.clienteSnapshot;
    const clienteName = cliente && cliente.nome ? cliente.nome : '—';
    const righeRows = (draft.righe || []).map(r => `
      <tr>
        <td>${esc(r.descrizione || '')}</td>
        <td style="text-align:right;">${r.quantita}</td>
        <td style="text-align:right;">${formatEur(r.prezzoUnitario || 0)}</td>
        <td style="text-align:right;">${formatEur((r.quantita || 0) * (r.prezzoUnitario || 0))}</td>
      </tr>`).join('');
    const isNC = draft.tipoDocumento === 'TD04';
    const hardDeleteOn = (typeof data !== 'undefined' && data && data.settings && (parseInt(data.settings.devHardDelete, 10) || 0) === 1);
    const hardDeleteBtn = hardDeleteOn
      ? `<button type="button" class="btn-add btn-add-danger" onclick="hardDeleteFattura('${esc(draft.id)}')">🗑 Hard delete</button>`
      : '';
    const profileFiscal = (typeof getProfileFiscalData === 'function') ? getProfileFiscalData() : {};
    const ibanEffective = (draft.iban && String(draft.iban).trim()) || (profileFiscal.iban || '');
    el.innerHTML = `
      <div class="fattura-sheet fattura-view">
        <div class="fattura-sheet-header">
          <div class="fattura-sheet-copy">
            <h2>${isNC ? 'Nota di credito' : 'Fattura'} ${esc(draft.numero)}</h2>
            <p>${esc(draft.data)} · ${esc(clienteName)} · <b>${formatEur(totals.total)}</b> ${draft.incassata ? '· <span style="color:var(--color-success);">Incassata</span>' : ''}</p>
          </div>
          <div class="fattura-sheet-actions">
            <button type="button" class="btn-add profile-secondary-btn" onclick="closeFatturaModal()">Chiudi</button>
            ${(draft.stato || 'bozza') === 'bozza' ? '<button type="button" class="btn-add profile-secondary-btn" onclick="switchFatturaToEdit()">Modifica</button>' : ''}
            <button type="button" class="btn-add" onclick="downloadFatturaPdf()">Scarica PDF</button>
          </div>
        </div>
        <div id="fatturaModalToast" class="fattura-modal-toast"></div>
        <div class="fattura-view-body">
          <div class="fattura-view-grid">
            <div><span class="fattura-view-label">Cliente</span><b>${esc(clienteName)}</b></div>
            <div><span class="fattura-view-label">Data emissione</span><b>${esc(draft.data)}</b></div>
            <div><span class="fattura-view-label">Scadenza</span><b>${esc(draft.scadenzaPagamento || '—')}</b></div>
            <div><span class="fattura-view-label">Stato</span><b>${draft.incassata ? 'Incassata il ' + esc(draft.dataIncasso || draft.data) : 'Da incassare'}</b></div>
            <div><span class="fattura-view-label">IBAN</span><b>${esc(ibanEffective || '—')}</b></div>
            <div><span class="fattura-view-label">Bollo</span><b>${draft.marcaDaBollo ? '2,00 €' + (draft.bolloAddebitato ? ' (addebitato)' : ' (non addebitato)') : 'No'}</b></div>
          </div>
          <table class="fattura-view-table">
            <thead><tr><th>Descrizione</th><th style="text-align:right;">Q.tà</th><th style="text-align:right;">P.Unit.</th><th style="text-align:right;">Totale</th></tr></thead>
            <tbody>${righeRows}</tbody>
          </table>
          <div class="fattura-view-totals">
            <div><span>Imponibile</span><b>${formatEur(totals.subtotal)}</b></div>
            ${totals.contributoIntegrativo ? `<div><span>Contributo integrativo</span><b>${formatEur(totals.contributoIntegrativo)}</b></div>` : ''}
            ${totals.bolloInTotal ? `<div><span>Marca da bollo</span><b>${formatEur(totals.bolloInTotal)}</b></div>` : ''}
            ${Number(draft.ritenuta) > 0 ? `<div><span>Ritenuta</span><b>−${formatEur(draft.ritenuta)}</b></div>` : ''}
            <div class="fattura-view-totals-grand"><span>Totale</span><b>${formatEur(totals.total)}</b></div>
          </div>
          ${draft.note ? `<div class="fattura-view-note"><span class="fattura-view-label">Nota</span><div>${esc(draft.note)}</div></div>` : ''}
        </div>
        <div class="fattura-view-actions">
          <button type="button" class="btn-add profile-secondary-btn" onclick="previewFatturaXml()">Anteprima XML</button>
          <button type="button" class="btn-add profile-secondary-btn" onclick="downloadFatturaXml()">Scarica XML</button>
          ${(!isNC && (draft.stato === 'inviata' || draft.stato === 'pagata')) ? `<button type="button" class="btn-add profile-secondary-btn" onclick="createNCFromCurrentInvoice()">Crea nota di credito</button>` : ''}
          ${hardDeleteBtn}
        </div>
      </div>
    `;
  }

  function switchFatturaToEdit() { state.mode = 'edit'; state.step = 1; renderFatturaModal(); }
  function createNCFromCurrentInvoice() {
    const draft = currentDraft();
    if (!draft || !draft.id) {
      console.warn('[fatture] createNC: nessuna fattura corrente');
      return;
    }
    if (draft.stato !== 'inviata' && draft.stato !== 'pagata') {
      showFatturaToast('La NC si emette solo su fatture inviate o pagate.', 'error');
      return;
    }
    if (typeof openNotaCreditoModal === 'function') {
      openNotaCreditoModal(draft.id);
    } else {
      console.error('[fatture] openNotaCreditoModal non disponibile');
    }
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
      if (!draft.marcaDaBollo) draft.bolloAddebitato = false;
      const addEl = document.getElementById('fatturaBolloAddebitato');
      if (addEl) {
        addEl.disabled = !draft.marcaDaBollo;
        addEl.checked = !!draft.bolloAddebitato;
        if (addEl.parentElement) addEl.parentElement.style.opacity = draft.marcaDaBollo ? '1' : '0.5';
      }
    } else if (field === 'bolloAddebitato') {
      draft.bolloAddebitato = !!value;
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

  // Stima data incasso da data emissione e giorni incasso
  function estimaPagamento(isoDate, giorniIncasso) {
    const d = new Date(isoDate || todayIso());
    if (Number.isNaN(d.getTime())) return { mese: null, anno: null };
    d.setDate(d.getDate() + (Number(giorniIncasso) || 30));
    return { mese: d.getMonth() + 1, anno: d.getFullYear() };
  }

  // Imposta pagMese/pagAnno sulla fattura in base a stato e dataPagamento/dataIncasso
  function applyPagMesePagAnno(draft) {
    const stato = draft.stato || 'bozza';
    if (stato === 'bozza') {
      draft.pagMese = null;
      draft.pagAnno = null;
    } else if (stato === 'pagata') {
      const dp = draft.dataPagamento || draft.dataIncasso || draft.data;
      const parts = parseDateParts(dp);
      draft.pagMese = parts ? parts.month : null;
      draft.pagAnno = parts ? parts.year : null;
    } else {
      // inviata / stornata: use estimated cash date
      const refDate = draft.tipoDocumento === 'TD04'
        ? (draft.data || todayIso())
        : resolveInvoiceCashDate(draft);
      const giorniIncasso = (typeof S === 'function' && S().giorniIncasso) ? S().giorniIncasso : 30;
      const est = estimaPagamento(refDate, giorniIncasso);
      draft.pagMese = est.mese;
      draft.pagAnno = est.anno;
    }
    return draft;
  }

  function validateDraftForInvio(draft) {
    const errors = [];
    const snap = draft.clienteSnapshot || {};
    const hasCliente = !!draft.clienteId || !!snap.denominazione || !!(snap.nome || snap.cognome);
    if (!hasCliente) errors.push('Seleziona un cliente.');
    const righeValid = (draft.righe || []).some(r => {
      const desc = String(r.descrizione || '').trim();
      const tot = (parseFloat(r.quantita) || 0) * (parseFloat(r.prezzoUnitario) || 0);
      return desc && tot > 0;
    });
    if (!righeValid) errors.push('Aggiungi almeno una riga con descrizione e importo > 0.');
    if (!draft.modalitaPagamento) errors.push('Specifica la modalità di pagamento.');
    // IBAN check se bonifico (MP05)
    const mpCode = (typeof modalitaToCodiceMP === 'function') ? modalitaToCodiceMP(draft.modalitaPagamento) : '';
    if (mpCode === 'MP05') {
      const profileFiscal = (typeof getProfileFiscalData === 'function') ? getProfileFiscalData() : {};
      const ibanEffettivo = (draft.iban && String(draft.iban).trim()) || (profileFiscal.iban || '');
      if (!ibanEffettivo) errors.push('IBAN mancante (richiesto per bonifico).');
    }
    if (!draft.scadenzaPagamento) errors.push('Imposta la scadenza di pagamento.');
    if (!draft.numero) errors.push('Numero fattura mancante.');
    // R5 — ProgressivoInvio max 10 alfanumerici (FatturaPA §1.1.2).
    // Il sanitize rimuove separatori e tronca: due numeri diversi con stesso troncato
    // collidono nella catena SdI. Blocchiamo upfront.
    const rawNum = String(draft.numero || '').trim();
    const sanitizedNum = rawNum.replace(/[^A-Za-z0-9]/g, '');
    if (sanitizedNum.length > 10) {
      errors.push('Numero fattura troppo lungo: "' + rawNum + '" diventa "' + sanitizedNum + '" (' + sanitizedNum.length + ' char) dopo normalizzazione SdI. Max 10 alfanumerici. Abbrevia la numerazione.');
    }
    // C-A2 — forfettario esonerato dalla ritenuta d'acconto (art. 1 c. 67 L. 190/2014)
    // Fonte: Circ. AdE 9/E 2019 §4.1. Il committente non deve operare ritenuta;
    // se la trattiene per errore, il forfettario perde liquidità.
    try {
      var settingsRef = (typeof getSettings === 'function') ? getSettings() : null;
      if (settingsRef && settingsRef.regime === 'forfettario' && Number(draft.ritenuta) > 0) {
        errors.push("Il regime forfettario è esonerato dalla ritenuta d'acconto (art. 1 c. 67 L. 190/2014). Rimuovere la ritenuta dalla fattura e comunicare al committente la dichiarazione sostitutiva di non assoggettamento.");
      }
    } catch (_e) { /* getSettings non disponibile: skip */ }
    // F4 — NC: la data della nota di credito non può essere anteriore alla fattura originale
    if (draft.tipoDocumento === 'TD04' && draft.fatturaOriginaleId && draft.data) {
      const orig = getSavedInvoiceById(draft.fatturaOriginaleId);
      if (orig && orig.data
          && window.FattureNCSync
          && !window.FattureNCSync.isNCDateValid(draft.data, orig.data)) {
        errors.push(`Data NC (${draft.data}) anteriore alla fattura originale (${orig.data}).`);
      }
    }
    return errors;
  }

  function saveFatturaDraft(asDraft = false) {
    const draft = collectDraftFromState();

    // asDraft=false → promuove bozza→inviata, validazione obbligatoria
    // asDraft=true → salva qualsiasi stato senza validare e senza promuovere, no switch view
    if (!asDraft) {
      const errors = validateDraftForInvio(draft);
      if (errors.length) {
        showFatturaToast(errors.join(' · '), 'error');
        return null;
      }
      const statoCorrente = draft.stato || 'bozza';
      if (statoCorrente === 'bozza') {
        draft.stato = 'inviata';
        if (!draft.dataInvioSdi) {
          draft.dataInvioSdi = new Date().toISOString().slice(0, 10);
        }
      }
    } else {
      // Save as draft: solo un minimo di sanità (cliente) — ma non blocca
      if (!draft.clienteId && !(draft.clienteSnapshot && (draft.clienteSnapshot.denominazione || draft.clienteSnapshot.nome))) {
        showFatturaToast('Seleziona un cliente.', 'warn');
        return null;
      }
    }

    // Set pagMese/pagAnno on the fattura object (no monthly-store write needed)
    applyPagMesePagAnno(draft);

    // Promote legacy-migrated fatture to wizard-completed once cliente+numero sono valorizzati
    if (draft.origine === 'legacy-migrated' && draft.clienteId && draft.numero) {
      draft.origine = 'manuale';
      draft._legacyCompleted = true;
    }

    const history = loadFattureEmesse();
    const idx = history.findIndex(h => h.id === draft.id);
    if (idx >= 0) history[idx] = draft; else history.unshift(draft);

    // F1+F2+F3: sync NC TD04 → originale (ncTotaleImporto, ncIds, stato=stornata, tipoStorno)
    if (draft.tipoDocumento === 'TD04'
        && draft.stato === 'inviata'
        && draft.fatturaOriginaleId
        && window.FattureNCSync) {
      window.FattureNCSync.applyNCToOriginal(draft, history);
    }

    saveFattureEmesse(history);

    // Validazione XML asincrona via openapi.com — fire-and-forget.
    // Solo per fatture non-bozza (bozza = work-in-progress, manca ancora roba).
    // L'errore di validate non blocca il save: notifica via toast se fallisce.
    if (draft.stato && draft.stato !== 'bozza' && window.FattureXmlValidator) {
      try {
        const opts = (draft.tipoDocumento === 'TD04' && draft.fatturaOriginaleId)
          ? { fatturaOriginale: getSavedInvoiceById(draft.fatturaOriginaleId) || null }
          : {};
        const xml = buildFatturaElettronicaXml(draft, opts);
        window.FattureXmlValidator.validateAndNotify(xml, { label: draft.numero || draft.id });
      } catch (err) {
        console.warn('[saveFattura] skip validation — XML build failed:', err && err.message);
      }
    }

    state.editingId = draft.id;
    state.draft = draft;
    renderFattureDocsSection();
    if (!asDraft) {
      state.mode = 'view';
      renderFatturaModal();
      showFatturaToast('Fattura salvata e segnata come inviata.');
    }
    if (typeof recalcAll === 'function') recalcAll();
    return draft;
  }

  function collectDraftFromState() {
    const draft = currentDraft();
    const invoice = normalizeFatturaEmessa({ ...draft });
    invoice.id = state.editingId || draft.id;
    return invoice;
  }

  function openFatturaModal(id = null, opts = {}) {
    state.step = 1;
    if (id) {
      const inv = getSavedInvoiceById(id);
      if (inv) {
        state.draft = normalizeFatturaEmessa(inv);
        state.editingId = inv.id;
        state.numberAuto = false;
        const statoInv = inv.stato || 'bozza';
        if (opts.mode === 'view') state.mode = 'view';
        else if (opts.mode === 'edit') state.mode = 'edit';
        else state.mode = (statoInv === 'bozza') ? 'edit' : 'view';
      } else {
        state.mode = opts.mode === 'view' ? 'view' : 'edit';
      }
    } else {
      state.mode = 'edit';
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
    state.step = 1;
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
    if (invoice.marcaDaBollo && invoice.bolloAddebitato && (totals.subtotal || 0) > 77.47) row('Marca da bollo', 2);
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
    if (!String(profile.indirizzo || '').trim()) errors.push('Indirizzo del cedente mancante nell\'anagrafica profilo.');
    if (!String(profile.cap || '').trim()) errors.push('CAP del cedente mancante nell\'anagrafica profilo.');
    if (!String(profile.citta || '').trim()) errors.push('Comune del cedente mancante nell\'anagrafica profilo.');
    if (!draft.numero) errors.push('Numero fattura mancante.');
    if (!draft.data) errors.push('Data fattura mancante.');
    const totals = computeDraftTotals(draft);
    if (totals.subtotal <= 0) errors.push('Importo totale della fattura pari a zero.');
    if (totals.contributoIntegrativo > 0) {
      errors.push('Contributo integrativo non supportato in XML (richiede cassa autonoma con TipoCassa). Gestione separata INPS non prevede integrativo: azzera il campo.');
    }
    const cliente = draft.clienteSnapshot;
    if (!cliente || !cliente.nome) {
      errors.push('Cliente non selezionato o senza ragione sociale.');
    } else {
      if (!String(cliente.indirizzo || '').trim()) errors.push('Indirizzo del cliente mancante.');
      if (!String(cliente.cap || '').trim()) errors.push('CAP del cliente mancante.');
      if (!String(cliente.citta || '').trim()) errors.push('Comune del cliente mancante.');
      const nazCli = String(cliente.nazione || 'IT').toUpperCase();
      if (nazCli === 'IT') {
        const hasPivaIT = isValidPartitaIvaIT(String(cliente.partitaIva || '').replace(/\s+/g, ''));
        const hasCF = isValidCodiceFiscale(String(cliente.codiceFiscale || '').trim());
        if (!hasPivaIT && !hasCF) errors.push('Cliente IT senza P.IVA valida né CF valido: SdI rifiuterà.');
      }
    }
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

    // R6 — validate NC date >= original invoice date (fiscally NC cannot precede the invoice it stornas).
    if (isNC) {
      var origRef = draft._originalForValidation;
      if (!origRef && draft.fatturaOriginaleId && typeof window !== 'undefined' && window.FattureStorico && typeof window.FattureStorico.load === 'function') {
        try {
          var allOrig = window.FattureStorico.load(currentProfile) || [];
          for (var i = 0; i < allOrig.length; i++) {
            if (allOrig[i] && allOrig[i].id === draft.fatturaOriginaleId) { origRef = allOrig[i]; break; }
          }
        } catch (e) { /* noop */ }
      }
      if (origRef && origRef.data && draft.data && String(draft.data) < String(origRef.data)) {
        throw new Error('Data NC (' + draft.data + ') anteriore alla fattura originale (' + origRef.data + '). La nota di credito non può precedere l\u2019emissione originale.');
      }
    }

    const profile = getProfileFiscalData();
    const cliente = draft.clienteSnapshot || {};
    const totals = computeDraftTotals(draft);

    // Regime fiscale — letto da data.settings (module-scoped), fallback RF19 forfettario
    const regimeUtente = (typeof data !== 'undefined' && data && data.settings && data.settings.regime) || 'forfettario';
    const regimeFiscale = (regimeUtente === 'ordinario') ? 'RF01' : 'RF19';

    // ProgressivoInvio sanitizzato (max 10 alfanum)
    const progressivo = sanitizeProgressivoInvio(draft.numero || draft.id || '');

    const piva = String(profile.partitaIva || '').replace(/\s+/g, '');
    if (piva && !isValidPartitaIvaIT(piva)) {
      console.warn('P.IVA cedente non valida (non 11 cifre):', piva);
    }

    const cfCedente = String(profile.codiceFiscale || '').trim();
    if (cfCedente && !isValidCodiceFiscale(cfCedente)) {
      console.warn('CF cedente non valido:', cfCedente);
      if (typeof showToast === 'function') showToast('Attenzione: CF cedente non valido (verifica anagrafica)');
    }

    // Cliente — nazione, P.IVA, CF
    const clientePivaRaw = String(cliente.partitaIva || '').replace(/\s+/g, '');
    const clientePivaValida = isValidPartitaIvaIT(clientePivaRaw);
    const cliNaz = String(cliente.nazione || 'IT').slice(0, 2).toUpperCase() || 'IT';
    const clienteEstero = cliNaz !== 'IT';
    const clientePiva = clientePivaRaw;
    const clienteCF = String(cliente.codiceFiscale || '').trim();

    // CodiceDestinatario:
    //  - cliente estero → XXXXXXX (convenzione FatturaPA per operazioni transfrontaliere)
    //  - cliente IT con SDI valorizzato → quello
    //  - cliente IT privato o senza SDI → 0000000
    const codiceSDI = clienteEstero
      ? 'XXXXXXX'
      : (clientePivaValida
          ? String(cliente.codiceSDI || '0000000').trim().padEnd(7, '0').slice(0, 7)
          : String(cliente.codiceSDI || '').trim() || '0000000');

    // Cedente Nome/Cognome dal profilo fiscale (campi già separati in getProfileFiscalData)
    const profileNome = String(profile.nome || '').replace(String(profile.cognome || ''), '').trim()
      || String(profile.nome || '').trim().split(/\s+/).slice(0, -1).join(' ');
    const profileCognome = String(profile.cognome || '').trim()
      || String(profile.nome || currentProfile).trim().split(/\s+/).slice(-1)[0];

    // Natura + riferimento normativo — forfettario RF19 sempre N2.2.
    // art. 1 c. 58 L. 190/2014 + Circ. AdE 9/E 2019 §4.1: fuori campo IVA,
    // non ex artt. 7-7septies DPR 633/72. N2.1 è riservata al regime ordinario.
    const naturaLinea = 'N2.2';
    const riferimentoNormativo = "Regime forfettario: operazione in franchigia IVA e senza ritenuta d'acconto Art.1 c.54-89 L.190/2014";

    // Imponibile = somma righe (bollo e contributo integrativo esclusi dall'XML SdI)
    const imponibile = round2(totals.subtotal);

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
      <Natura>${naturaLinea}</Natura>
    </DettaglioLinee>`;
    });

    // Contributo integrativo: si applica SOLO alle casse autonome (es. TC01 avvocati,
    // TC02 ingegneri). Gestione separata INPS (TC22) non ha integrativo. Finché non
    // supportiamo TipoCassa + DatiCassaPrevidenziale, blocchiamo l'export se il
    // campo è valorizzato per evitare XML fiscalmente non conforme (lo standard
    // Fiscozen per gestione separata non emette integrativo — vedi campioni).

    // Fix #7 — DatiBollo solo se imponibile > 77,47 AND marcaDaBollo flag; mai su NC (spec §6).
    // F7 rationale: il bollo della fattura originale resta a carico dell'emittente anche in caso
    // di storno; la NC non genera obbligo di bollo autonomo (Risoluzione AdE 98/E del 2003
    // e prassi consolidata). Se mai dovesse servire — caso straordinario — il campo marcaDaBollo
    // sulla NC è lasciato editabile ma bypassato qui.
    const datiBollo = (!isNC && applicaBolloSeDovuto(totals.subtotal, draft.marcaDaBollo)) ? `
      <DatiBollo>
        <BolloVirtuale>SI</BolloVirtuale>
        <ImportoBollo>2.00</ImportoBollo>
      </DatiBollo>` : '';

    // Fix #9 — DatiRitenuta dentro DatiGeneraliDocumento (prima di ImportoTotaleDocumento).
    // F7 — ImportoRitenuta segue il segno del documento: per TD04 la ritenuta va negativa
    // per mantenere il bilancio con ImportoPagamento (che già applica sign in riga 1721).
    // AliquotaRitenuta resta positiva: è una percentuale, non un importo.
    let xmlRitenuta = '';
    if (Number(draft.ritenuta) > 0) {
      const tipo = draft.tipoRitenuta || 'RT02';
      const caus = (draft.causaleRitenuta || 'A').toUpperCase().slice(0, 2);
      xmlRitenuta = `
      <DatiRitenuta>
        <TipoRitenuta>${tipo}</TipoRitenuta>
        <ImportoRitenuta>${fmtXmlNum(Number(draft.ritenuta) * sign)}</ImportoRitenuta>
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

    // Client sede — validateFatturaForXml garantisce non-empty per clienti IT.
    // Per estero: se provincia/cap mancanti, usiamo fallback minimali conformi XSD
    // (CAP "00000" accettato da SdI per nazioni ≠ IT).
    const cliInd = xmlEscape(String(cliente.indirizzo || '').slice(0, 60));
    const cliCap = clienteEstero
      ? (String(cliente.cap || '').replace(/\D/g, '').padStart(5, '0').slice(0, 5) || '00000')
      : String(cliente.cap || '').replace(/\D/g, '').padStart(5, '0').slice(0, 5);
    const cliCom = xmlEscape(String(cliente.citta || '').slice(0, 60));
    const cliProv = clienteEstero ? '' : String(cliente.provincia || '').slice(0, 2).trim().toUpperCase();
    const cliProvXml = cliProv ? `\n        <Provincia>${xmlEscape(cliProv)}</Provincia>` : '';

    const cedInd = xmlEscape(String(profile.indirizzo || '').slice(0, 60));
    const cedCap = String(profile.cap || '').replace(/\D/g, '').padStart(5, '0').slice(0, 5);
    const cedCom = xmlEscape(String(profile.citta || '').slice(0, 60));
    const cedProv = String(profile.provincia || '').slice(0, 2).trim();
    const cedNaz = String(profile.nazione || 'IT').slice(0, 2).toUpperCase();
    const cedProvXml = cedProv ? `\n        <Provincia>${xmlEscape(cedProv)}</Provincia>` : '';

    const cfCedenteXml = profile.codiceFiscale
      ? `\n        <CodiceFiscale>${xmlEscape(profile.codiceFiscale)}</CodiceFiscale>` : '';

    // Client fiscal ID:
    //  - estero con codice fiscale estero (in campo partitaIva) → IdFiscaleIVA con IdPaese=cliNaz, niente CF
    //  - IT con P.IVA valida → IdFiscaleIVA IT + CodiceFiscale se presente
    //  - IT privato → solo CodiceFiscale
    let cessionarioFiscaleXml = '';
    if (clienteEstero) {
      // Estero: accetta piva "grezza" (non deve passare validazione IT)
      const vatEstero = clientePivaRaw || clienteCF;
      if (vatEstero) {
        cessionarioFiscaleXml = `
        <IdFiscaleIVA>
          <IdPaese>${cliNaz}</IdPaese>
          <IdCodice>${xmlEscape(vatEstero)}</IdCodice>
        </IdFiscaleIVA>`;
      } else {
        console.warn('Cliente estero senza VAT né CF: XML potrebbe essere rifiutato da SdI');
      }
    } else if (clientePivaValida) {
      cessionarioFiscaleXml = `
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${xmlEscape(clientePiva)}</IdCodice>
        </IdFiscaleIVA>`;
      if (clienteCF) cessionarioFiscaleXml += `\n        <CodiceFiscale>${xmlEscape(clienteCF)}</CodiceFiscale>`;
    } else {
      if (!clienteCF) {
        console.warn('Cessionario privato senza CF: XML potrebbe essere rifiutato da SdI');
      }
      if (clienteCF) cessionarioFiscaleXml = `\n        <CodiceFiscale>${xmlEscape(clienteCF)}</CodiceFiscale>`;
    }

    // C3 — XSD element order guarantee (fatturaordinaria_v1.2.xsd §2.1.1)
    // Ordine richiesto: TipoDocumento → Divisa → Data → Numero → DatiRitenuta → DatiBollo →
    // ImportoTotaleDocumento → Causale. L'interpolazione inline è fragile; costruiamo la
    // sezione via array per garantire l'ordine strutturalmente.
    var dgParts = [];
    dgParts.push('<TipoDocumento>' + xmlEscape(tipoDoc) + '</TipoDocumento>');
    dgParts.push('<Divisa>EUR</Divisa>');
    dgParts.push('<Data>' + xmlEscape(draft.data) + '</Data>');
    dgParts.push('<Numero>' + xmlEscape(draft.numero) + '</Numero>');
    if (xmlRitenuta && String(xmlRitenuta).trim()) dgParts.push(String(xmlRitenuta).trim());
    if (datiBollo && String(datiBollo).trim()) dgParts.push(String(datiBollo).trim());
    dgParts.push('<ImportoTotaleDocumento>' + fmtXmlNum(round2(totals.total * sign)) + '</ImportoTotaleDocumento>');
    if (causaleXml && String(causaleXml).trim()) dgParts.push(String(causaleXml).trim());
    var datiGeneraliDocumentoXml = '<DatiGeneraliDocumento>' + dgParts.join('') + '</DatiGeneraliDocumento>';

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
          ${buildAnagraficaXml(cliente)}
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
      ${datiGeneraliDocumentoXml}${datiCollegate}
    </DatiGenerali>
    <DatiBeniServizi>
${dettaglioLinee.join('\n')}
      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <Natura>${naturaLinea}</Natura>
        <ImponibileImporto>${fmtXmlNum(round2(imponibile * sign))}</ImponibileImporto>
        <Imposta>0.00</Imposta>
        <RiferimentoNormativo>${xmlEscape(riferimentoNormativo)}</RiferimentoNormativo>
      </DatiRiepilogo>
    </DatiBeniServizi>${clienteEstero ? '' : `
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${modalitaToCodiceMP(draft.modalitaPagamento)}</ModalitaPagamento>${scadenzaXml}
        <ImportoPagamento>${fmtXmlNum(round2((totals.total - (Number(draft.ritenuta) || 0)) * sign))}</ImportoPagamento>${ibanXml}
      </DettaglioPagamento>
    </DatiPagamento>`}
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
    let orig = getSavedInvoiceById(fatturaOriginaleId);
    if (!orig && window.FattureStorico) {
      const profiles = [
        (typeof window.getProfile === 'function' ? window.getProfile() : null),
        sessionStorage.getItem('currentProfile'),
        sessionStorage.getItem('calcoliPIVA_profile')
      ].filter(Boolean);
      for (const p of profiles) {
        const storico = window.FattureStorico.load(p) || [];
        orig = storico.find(f => f.id === fatturaOriginaleId);
        if (orig) break;
      }
    }
    if (!orig && state.draft && state.draft.id === fatturaOriginaleId) {
      orig = state.draft;
    }
    if (!orig) {
      console.warn('[NC] Fattura originale non trovata', { fatturaOriginaleId, stateDraftId: state.draft && state.draft.id });
      showFatturaToast('Fattura originale non trovata', 'error');
      return;
    }
    const annoOggi = new Date().getFullYear();
    const profile = (typeof window.getProfile === 'function') ? window.getProfile() : sessionStorage.getItem('calcoliPIVA_profile');
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
      contributoIntegrativo: orig.contributoIntegrativo || 0,
      // F5 — propaga ritenuta: se l'originale aveva una ritenuta d'acconto,
      // la NC deve stornarla. In XML il segno viene applicato a ImportoRitenuta.
      ritenuta: Number(orig.ritenuta) || 0,
      aliquotaRitenuta: Number(orig.aliquotaRitenuta) || 0,
      tipoRitenuta: orig.tipoRitenuta || '',
      causaleRitenuta: orig.causaleRitenuta || ''
    };
    state.draft = draft;
    state.editingId = null;
    state.numberAuto = false;
    state.mode = 'edit';
    state.step = 1;
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
  window.buildFatturaElettronicaXml = buildFatturaElettronicaXml;
  window.__buildAnagraficaXml = buildAnagraficaXml;
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
  window.__validateDraftForInvio = validateDraftForInvio;
  window.previewFatturaPdf = previewFatturaPdf;
  window.downloadFatturaPdf = downloadFatturaPdf;
  window.downloadFatturaXml = downloadFatturaXml;
  window.previewFatturaXml = previewFatturaXml;
  window.showXmlPreviewModal = showXmlPreviewModal;
  window.openNotaCreditoModal = openNotaCreditoModal;
  window.setFattureFilter = setFattureFilter;
  window.goToFatturaStep = goToFatturaStep;
  window.nextFatturaStep = nextFatturaStep;
  window.prevFatturaStep = prevFatturaStep;
  window.switchFatturaToEdit = switchFatturaToEdit;
  window.createNCFromCurrentInvoice = createNCFromCurrentInvoice;
  window.viewFatturaModal = (id) => openFatturaModal(id, { mode: 'view' });

  // ─── Hard-delete dev toggle (T13) ─────────────────────────────────────────
  function hardDeleteFattura(id) {
    const settings = (typeof data !== 'undefined' && data && data.settings) ? data.settings : {};
    if ((parseInt(settings.devHardDelete, 10) || 0) !== 1) return;
    const profile = (typeof window.getProfile === 'function')
      ? window.getProfile()
      : (currentProfile || sessionStorage.getItem('calcoliPIVA_profile'));
    if (!profile) return;
    const store = window.FattureStorico || { load: loadFattureEmesse, save: saveFattureEmesse };
    const all = store.load(profile);
    const target = all.find(f => f.id === id);
    if (!target) return;
    const numero = target.numero || id;
    // F6 — warning se la fattura ha NC collegate (diventerebbero orfane)
    const ncCollegate = (target.tipoDocumento !== 'TD04' && Array.isArray(target.ncIds)) ? target.ncIds.length : 0;
    let msg = `Eliminare definitivamente la fattura ${numero}? L'azione NON è reversibile.`;
    if (ncCollegate > 0) {
      msg += `\n\n⚠ Questa fattura ha ${ncCollegate} nota/e di credito collegate che resteranno senza riferimento.`;
    }
    const confirmer = (typeof window.showAppConfirm === 'function')
      ? (cb) => window.showAppConfirm({ title: 'Hard delete fattura', message: msg, okLabel: 'Elimina', danger: true }, cb)
      : (cb) => { if (window.confirm(msg)) cb(); };
    confirmer(() => {
      const next = all.filter(f => f.id !== id);
      if (target.tipoDocumento === 'TD04' && target.fatturaOriginaleId) {
        const orig = next.find(f => f.id === target.fatturaOriginaleId);
        if (orig) {
          orig.ncIds = (orig.ncIds || []).filter(x => x !== id);
          const imp = Math.abs(
            (window.FattureSelectors && window.FattureSelectors.getImportoSigned)
              ? window.FattureSelectors.getImportoSigned(target)
              : (target.righe || []).reduce((s, r) => s + (Number(r.quantita) || 0) * (Number(r.prezzoUnitario) || 0), 0)
          );
          orig.ncTotaleImporto = Math.max(0, (Number(orig.ncTotaleImporto) || 0) - imp);
          if (orig.ncTotaleImporto === 0 && orig.stato === 'stornata') {
            orig.stato = orig.dataPagamento ? 'pagata' : 'inviata';
          }
        }
      }
      store.save(profile, next);
      console.warn('[hard-delete]', id, numero);
      if (typeof closeFatturaModal === 'function') closeFatturaModal();
      if (typeof recalcAll === 'function') recalcAll();
      if (window.FattureStorico && typeof window.FattureStorico.renderStorico === 'function') {
        const sel = document.getElementById('archivioAnnoSelect');
        window.FattureStorico.renderStorico(Number(sel && sel.value) || new Date().getFullYear());
      }
    });
  }
  window.hardDeleteFattura = hardDeleteFattura;
  window.isDevHardDeleteOn = function () {
    try {
      var s = (typeof data !== 'undefined' && data && data.settings) ? data.settings : {};
      return (parseInt(s.devHardDelete, 10) || 0) === 1;
    } catch (_) { return false; }
  };

  // Quick actions on BOZZA rows in the main Fatture card
  function quickMarkInviataFromCard(id) {
    const profile = (typeof window.getProfile === 'function')
      ? window.getProfile()
      : (currentProfile || sessionStorage.getItem('calcoliPIVA_profile'));
    if (!profile) return;
    const store = window.FattureStorico || { load: loadFattureEmesse, save: saveFattureEmesse };
    const all = store.load(profile);
    const idx = all.findIndex(f => f.id === id);
    if (idx < 0) return;
    if ((all[idx].stato || 'bozza') !== 'bozza') return;
    all[idx].stato = 'inviata';
    if (!all[idx].dataInvioSdi) {
      all[idx].dataInvioSdi = new Date().toISOString().slice(0, 10);
    }
    // F1+F2+F3: sync NC TD04 → originale se applicabile
    if (all[idx].tipoDocumento === 'TD04'
        && all[idx].fatturaOriginaleId
        && window.FattureNCSync) {
      window.FattureNCSync.applyNCToOriginal(all[idx], all);
    }
    store.save(profile, all);
    if (typeof renderFattureDocsSection === 'function') renderFattureDocsSection();
    if (typeof recalcAll === 'function') recalcAll();
  }
  function quickDeleteBozzaFromCard(id) {
    const profile = (typeof window.getProfile === 'function')
      ? window.getProfile()
      : (currentProfile || sessionStorage.getItem('calcoliPIVA_profile'));
    if (!profile) return;
    const store = window.FattureStorico || { load: loadFattureEmesse, save: saveFattureEmesse };
    const all = store.load(profile);
    const target = all.find(f => f.id === id);
    if (!target) return;
    if ((target.stato || 'bozza') !== 'bozza') return;
    const numero = target.numero || id;
    const msg = `Eliminare la bozza ${numero}? Puoi sempre rifarla, ma l'operazione non è reversibile.`;
    const confirmer = (typeof window.showAppConfirm === 'function')
      ? (cb) => window.showAppConfirm({ title: 'Elimina bozza', message: msg, okLabel: 'Elimina', danger: true }, cb)
      : (cb) => { if (window.confirm(msg)) cb(); };
    confirmer(() => {
      const next = all.filter(f => f.id !== id);
      store.save(profile, next);
      if (typeof renderFattureDocsSection === 'function') renderFattureDocsSection();
      if (typeof recalcAll === 'function') recalcAll();
    });
  }
  function quickMarkPagataFromCard(id) {
    const profile = (typeof window.getProfile === 'function')
      ? window.getProfile()
      : (currentProfile || sessionStorage.getItem('calcoliPIVA_profile'));
    if (!profile) return;
    const store = window.FattureStorico || { load: loadFattureEmesse, save: saveFattureEmesse };
    const all = store.load(profile);
    const idx = all.findIndex(f => f.id === id);
    if (idx < 0) return;
    if ((all[idx].stato || 'bozza') !== 'inviata') return;
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    all[idx].stato = 'pagata';
    all[idx].dataPagamento = iso;
    all[idx].pagMese = today.getMonth() + 1;
    all[idx].pagAnno = today.getFullYear();
    store.save(profile, all);
    if (typeof renderFattureDocsSection === 'function') renderFattureDocsSection();
    if (typeof recalcAll === 'function') recalcAll();
  }
  window.quickMarkInviataFromCard = quickMarkInviataFromCard;
  window.quickDeleteBozzaFromCard = quickDeleteBozzaFromCard;
  window.quickMarkPagataFromCard = quickMarkPagataFromCard;

  if (currentProfile && document.getElementById('fattureDocsContent')) renderFattureDocsSection();

  // Test hook — accesso diretto per unit test Node.js
  if (typeof window !== 'undefined') { window.__normalizeFatturaEmessa = normalizeFatturaEmessa; }
})();
