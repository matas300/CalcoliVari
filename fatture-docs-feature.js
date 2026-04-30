/* Fatture PDF feature: create, preview, persist, and sync invoice history */
(function () {
  // Default Causale forfettario (art. 1 c. 54-89 L. 190/2014, D.L. 119/2018).
  // Solo caratteri ASCII + Latin-1 per compliance XSD String200LatinType.
  // (Il sanitizer comunque normalizza a runtime se l'utente sostituisce la nota.)
  const DEFAULT_FORFETTARIO_NOTE = "Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, della L. 190/2014 - regime forfettario, operazione in franchigia IVA e senza ritenuta d'acconto.";
  const DEFAULT_BONIFICO = 'Bonifico bancario';

  // ── XML helpers delegati a fatture-xml-helpers.js (Sprint 4) ─────────────
  const _XmlHelpers = (typeof window !== 'undefined' && window.FattureXmlHelpers) ? window.FattureXmlHelpers
    : (typeof require !== 'undefined' ? require('./fatture-xml-helpers.js') : null);
  if (!_XmlHelpers) throw new Error('fatture-docs-feature.js requires FattureXmlHelpers — load fatture-xml-helpers.js first');
  const MODALITA_TO_MP = _XmlHelpers.MODALITA_TO_MP;
  const modalitaToCodiceMP = _XmlHelpers.modalitaToCodiceMP;
  const XML_NAMESPACE = _XmlHelpers.XML_NAMESPACE;
  const XML_FORFETTARIO_REGIME = _XmlHelpers.XML_FORFETTARIO_REGIME;
  const sanitizeProgressivoInvio = _XmlHelpers.sanitizeProgressivoInvio;
  const isValidPartitaIvaIT = _XmlHelpers.isValidPartitaIvaIT;
  const isValidCodiceFiscale = _XmlHelpers.isValidCodiceFiscale;
  const parseMaybeNumber = _XmlHelpers.parseMaybeNumber;
  const fmtXmlNum = _XmlHelpers.fmtXmlNum;
  const sanitizeXmlLatin1 = _XmlHelpers.sanitizeXmlLatin1;
  const buildAnagraficaXml = _XmlHelpers.buildAnagraficaXml;
  function applicaBolloSeDovuto(imponibile, marcaDaBollo) {
    return _FRFatt.isBolloDovuto(imponibile, marcaDaBollo);
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

  const _HtmlUtilsFatt = (typeof HtmlUtils !== 'undefined') ? HtmlUtils
    : (typeof require !== 'undefined' ? require('./html-utils.js') : null);
  const esc = _HtmlUtilsFatt.escapeHtml;
  const xmlEscape = _HtmlUtilsFatt.xmlEscape;

  const AppContext = (typeof window !== 'undefined' && window.AppContext) ? window.AppContext
    : (typeof require !== 'undefined' ? require('./app-context.js') : null);
  if (!AppContext) throw new Error('fatture-docs-feature.js requires AppContext — load app-context.js first');

  const _FRFatt = (typeof window !== 'undefined' && window.ForfettarioRules) ? window.ForfettarioRules
    : (typeof require !== 'undefined' ? require('./forfettario-rules.js') : null);
  if (!_FRFatt) throw new Error('fatture-docs-feature.js requires ForfettarioRules — load forfettario-rules.js first');
  const BOLLO_THRESHOLD = _FRFatt.BOLLO_THRESHOLD;

  const _ValidatorsFatt = (typeof window !== 'undefined' && window.FattureValidators) ? window.FattureValidators
    : (typeof require !== 'undefined' ? require('./fatture-validators.js') : null);
  if (!_ValidatorsFatt) throw new Error('fatture-docs-feature.js requires FattureValidators — load fatture-validators.js first');

  const round2 = (typeof MathUtils !== 'undefined' && MathUtils.round2)
    ? MathUtils.round2
    : function (value) {
        const n = parseFloat(value);
        if (!Number.isFinite(n)) return 0;
        return Math.round((n + Number.EPSILON) * 100) / 100;
      };

  // todayIso / addDaysIso / parseDateParts delegati a date-utils.js (DUP-6 risolto)
  const _DateUtilsFatt = (typeof DateUtils !== 'undefined') ? DateUtils
    : (typeof require !== 'undefined' ? require('./date-utils.js') : null);
  if (!_DateUtilsFatt) throw new Error('fatture-docs-feature.js requires DateUtils — load date-utils.js first');
  const todayIso = _DateUtilsFatt.todayIso;
  const parseDateParts = _DateUtilsFatt.parseDateParts;
  // Wrapper compat: il chiamante può passare anche stringa ISO non valida o
  // vuota; in quel caso la versione legacy ricadeva su today. Preserviamo.
  function addDaysIso(dateIso, days) {
    var iso = (dateIso && typeof dateIso === 'string') ? dateIso : todayIso();
    var out = _DateUtilsFatt.addDaysIso(iso, days);
    return out || todayIso();
  }
  // Compat: il test fatture-mark-stato-tz.test.js legge window.__todayIso.
  // Manteniamo l'esposizione come passthrough.
  if (typeof window !== 'undefined') window.__todayIso = todayIso;

  // parseMaybeNumber e buildAnagraficaXml delegati a fatture-xml-helpers.js (Sprint 4)

  const _FormatUtilsFatt = (typeof FormatUtils !== 'undefined') ? FormatUtils
    : (typeof require !== 'undefined' ? require('./format-utils.js') : null);
  const formatPdfMoney = _FormatUtilsFatt.formatPdfMoney;

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

  const _StorageKeysFatt = (typeof window !== 'undefined' && window.StorageKeys) ? window.StorageKeys
    : (typeof require !== 'undefined' ? require('./storage-keys.js') : null);
  if (!_StorageKeysFatt) throw new Error('fatture-docs-feature.js requires StorageKeys — load storage-keys.js first');

  function getFattureEmesseStorageKey(profile = currentProfile) {
    return _StorageKeysFatt.fattureEmesse(profile || 'default');
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
    const thresholdHit = totals.subtotal + totals.contributoIntegrativo > BOLLO_THRESHOLD;
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
    const profile = AppContext.getProfile();
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

    // F4: banner cross-year a dicembre (replicato anche qui per visibilità)
    const crossYearBannerHtml = (typeof window !== 'undefined' && typeof window.buildCrossYearReminderBannerHtml === 'function')
      ? (window.buildCrossYearReminderBannerHtml() || '') : '';

    // F1: banner conservazione AdE — visibile finché l'utente non conferma l'adesione
    const ackedConservation = (typeof isAdeConservationAcknowledged === 'function')
      ? isAdeConservationAcknowledged() : true;
    const conservationBanner = ackedConservation ? '' :
      '<div class="ade-conservation-banner" role="status" style="margin-top:10px;padding:10px 12px;border-radius:6px;background:rgba(46,170,220,.10);border:1px solid #2eaadc;color:#2eaadc;font-size:13px;display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">'
      + '<div style="flex:1;min-width:200px"><strong>Conservazione AdE 15 anni</strong> — gratis, una sola volta. Senza adesione AdE conserva le fatture solo 2 anni e poi le cancella (rischio reale in caso di accertamento).</div>'
      + '<div style="display:flex;gap:8px;flex-shrink:0">'
      + '<button type="button" class="btn btn-ghost" style="font-size:12px;padding:4px 10px" onclick="window.showAdeConservationGuide && window.showAdeConservationGuide()">Come aderire</button>'
      + '<button type="button" class="btn btn-ghost" style="font-size:12px;padding:4px 10px" onclick="window.acknowledgeAdeConservation && window.acknowledgeAdeConservation()" title="Ho già aderito o non voglio essere ricordato">Già fatto</button>'
      + '</div>'
      + '</div>';

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
        crossYearBannerHtml +
        conservationBanner +
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
    draft.tipoRitenuta = '';
    draft.causaleRitenuta = '';
  }
  if (typeof window !== 'undefined') window.__clearRitenutaForForfettario = _clearRitenutaForForfettario;

  // NR-10 — fallback chain robusto per regime PDF (art. 6 c. 1 D.Lgs. 471/1997)
  // Mai PDF con dicitura legale silenziosamente assente: se il regime non è
  // determinabile, throw esplicito così l'utente è avvisato.
  function _resolveRegimeForPdf() {
    // 1. Try getSettings (path normale)
    try {
      if (typeof getSettings === 'function') {
        var s = getSettings();
        if (s && s.regime) return s.regime;
      }
    } catch (_e) { /* fallthrough */ }
    // 2. Fallback diretto a localStorage
    try {
      var profile = (typeof window !== 'undefined' && window.currentProfile)
        || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem && sessionStorage.getItem('calcoliPIVA_profile'));
      var year = (typeof window !== 'undefined' && window.currentYear) || new Date().getFullYear();
      if (profile && year) {
        var raw = localStorage.getItem(_StorageKeysFatt.yearData(profile, year));
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.settings && parsed.settings.regime) return parsed.settings.regime;
        }
      }
    } catch (_e) { /* fallthrough */ }
    // 3. Last resort: throw — mai dicitura silenziosamente assente
    throw new Error('PDF fattura: impossibile determinare il regime fiscale per la dicitura legale (NR-10).');
  }
  if (typeof window !== 'undefined') window.__resolveRegimeForPdf = _resolveRegimeForPdf;

  function renderStep3Html() {
    const draft = currentDraft();
    const isForfettarioRegime = AppContext.getSettings().regime === 'forfettario';
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
    // C-A2 — forfettario esonerato dalla ritenuta (DUP-1 risolto via FattureValidators)
    var ritenutaErr = _ValidatorsFatt.validateRitenutaForfettario(draft, AppContext.getSettings(), { context: 'invio' });
    if (ritenutaErr) errors.push(ritenutaErr);
    // A-A6 — cliente PA → CodiceIPA 6 caratteri alfanumerici (D.M. 55/2013 art. 2).
    // Senza codice IPA valido, SdI rifiuta con errore EC02. Il campo SDI è 7 char per
    // privati/PG, 6 char per PA (Indice IPA: https://indicepa.gov.it).
    var clientePAref = draft.cliente || draft.clienteSnapshot;
    if (clientePAref && clientePAref.tipoCliente === 'PA') {
      var ipa = String(clientePAref.codiceSDI || '').trim();
      if (!/^[A-Z0-9]{6}$/i.test(ipa)) {
        errors.push('Cliente PA: il Codice IPA deve essere 6 caratteri alfanumerici (D.M. 55/2013 art. 2).');
      }
    }
    // NR-2 — cliente IT P.IVA o CF (DUP-9 risolto via FattureValidators)
    var clienteErr = _ValidatorsFatt.validateClienteIT(_ValidatorsFatt.resolveCliente(draft), {
      isValidPartitaIvaIT: typeof isValidPartitaIvaIT === 'function' ? isValidPartitaIvaIT : null,
      isValidCodiceFiscale: typeof isValidCodiceFiscale === 'function' ? isValidCodiceFiscale : null
    });
    if (clienteErr) errors.push(clienteErr);
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
        // DUP-2: state machine canonica
        if (window.FattureStateMachine) {
          window.FattureStateMachine.markInviata(draft);
        } else {
          draft.stato = 'inviata';
          if (!draft.dataInvioSdi) draft.dataInvioSdi = todayIso();
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
      const profile = AppContext.getProfile();
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
  // Sub-helpers PDF (Sprint 4.3): ogni funzione disegna una sezione, mutando
  // doc e ritornando la nuova y. Stessa sequenza di chiamate dell'inline
  // originale → output PDF byte-identico.

  function _pdfDrawIntestazioneAndParti(doc, invoice, ctx, y, isNC) {
    var INK = ctx.INK, MUTED = ctx.MUTED, BORDER = ctx.BORDER;
    var PAGE_W = ctx.PAGE_W, MARGIN = ctx.MARGIN, CONTENT_W = ctx.CONTENT_W;
    var titolo = isNC ? 'NOTA DI CREDITO' : 'FATTURA';

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

    doc.setDrawColor.apply(doc, BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6;

    var colW = CONTENT_W / 2 - 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, MUTED);
    doc.text('EMITTENTE', MARGIN, y);
    doc.text('DESTINATARIO', MARGIN + colW + 10, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, INK);

    var emittente = invoice._emittente || {};
    var cliente = invoice.clienteSnapshot || {};
    var emLines = [
      emittente.denominazione || (emittente.nome + ' ' + (emittente.cognome || '')).trim(),
      emittente.partitaIva ? 'P.IVA ' + emittente.partitaIva : '',
      emittente.codiceFiscale ? 'CF ' + emittente.codiceFiscale : '',
      [emittente.indirizzo, emittente.cap, emittente.comune || emittente.citta, emittente.provincia].filter(Boolean).join(' ')
    ].filter(Boolean);
    var clLines = [
      cliente.denominazione || (cliente.nome + ' ' + (cliente.cognome || '')).trim(),
      cliente.partitaIva ? 'P.IVA ' + cliente.partitaIva : (cliente.codiceFiscale ? 'CF ' + cliente.codiceFiscale : ''),
      [cliente.indirizzo, cliente.cap, cliente.comune || cliente.citta, cliente.provincia].filter(Boolean).join(' ')
    ].filter(Boolean);

    var yL = y, yR = y;
    emLines.forEach(function (line) { doc.text(line, MARGIN, yL); yL += 5; });
    clLines.forEach(function (line) { doc.text(line, MARGIN + colW + 10, yR); yR += 5; });
    y = Math.max(yL, yR) + 4;

    doc.setDrawColor.apply(doc, BORDER);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6;
    return y;
  }

  function _pdfDrawTabellaRighe(doc, invoice, ctx, y, isNC) {
    var INK = ctx.INK, MUTED = ctx.MUTED, BORDER = ctx.BORDER, NEGATIVE = ctx.NEGATIVE;
    var PAGE_W = ctx.PAGE_W, PAGE_H = ctx.PAGE_H, MARGIN = ctx.MARGIN, FOOTER_RESERVE = ctx.FOOTER_RESERVE;

    var colDesc = MARGIN;
    var colQta  = MARGIN + 100;
    var colUnit = MARGIN + 130;
    var colTot  = PAGE_W - MARGIN;
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
    (invoice.righe || []).forEach(function (r) {
      if (y > PAGE_H - FOOTER_RESERVE) {
        doc.addPage();
        y = MARGIN;
      }
      var desc = String(r.descrizione || '');
      var qta = Number(r.quantita) || 0;
      var prezzo = Number(r.prezzoUnitario) || 0;
      var totRiga = qta * prezzo * (isNC ? -1 : 1);
      var wrapped = doc.splitTextToSize(desc, 95);
      wrapped.forEach(function (line, idx) {
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
    return y;
  }

  function _pdfDrawRiepilogoTotali(doc, invoice, totals, sign, ctx, y) {
    var INK = ctx.INK, ACCENT = ctx.ACCENT, NEGATIVE = ctx.NEGATIVE;
    var PAGE_W = ctx.PAGE_W, MARGIN = ctx.MARGIN;
    var labelX = PAGE_W - MARGIN - 60;
    var valX   = PAGE_W - MARGIN;
    doc.setFontSize(10);

    function row(label, val, opts) {
      opts = opts || {};
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setTextColor.apply(doc, opts.color || INK);
      doc.text(label, labelX, y);
      doc.text(formatEur(val * sign), valX, y, { align: 'right' });
      y += 5;
    }
    row('Imponibile', totals.subtotal || 0);
    if (totals.contributoIntegrativo) row('Contributo integrativo', totals.contributoIntegrativo);
    if (invoice.marcaDaBollo && invoice.bolloAddebitato && (totals.subtotal || 0) > BOLLO_THRESHOLD) row('Marca da bollo', 2);
    if (Number(invoice.ritenuta) > 0) {
      doc.setTextColor.apply(doc, NEGATIVE);
      doc.text('Ritenuta', labelX, y);
      doc.text('-' + formatEur(Number(invoice.ritenuta)), valX, y, { align: 'right' });
      doc.setTextColor.apply(doc, INK);
      y += 5;
    }
    doc.setDrawColor.apply(doc, ACCENT);
    doc.setLineWidth(0.4);
    doc.line(labelX, y, valX, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('TOTALE', labelX, y);
    doc.text(formatEur((totals.total || 0) * sign), valX, y, { align: 'right' });
    y += 10;
    return y;
  }

  function _pdfDrawFooterLegale(doc, invoice, ctx, y, isForfettario) {
    var MUTED = ctx.MUTED, BORDER = ctx.BORDER;
    var PAGE_W = ctx.PAGE_W, MARGIN = ctx.MARGIN, CONTENT_W = ctx.CONTENT_W;

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

    // A-A8: dicitura forfettario obbligatoria (D.L. 119/2018 art. 1 c. 909)
    var customNote = (invoice.note && String(invoice.note).trim()) ? String(invoice.note).trim() : '';
    var noteToPrint = customNote || (isForfettario ? DEFAULT_FORFETTARIO_NOTE : '');
    if (noteToPrint) {
      y += 4;
      doc.setDrawColor.apply(doc, BORDER);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 5;
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, MUTED);
      doc.splitTextToSize(noteToPrint, CONTENT_W).forEach(function (line) { doc.text(line, MARGIN, y); y += 3.5; });
    }
    return y;
  }

  function buildInvoicePdfMinimal(invoice) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF non disponibile (verifica caricamento html2pdf bundle)');
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // Layout + palette (Espresso & Mint)
    const ctx = {
      INK:      [18, 26, 36],
      MUTED:    [100, 116, 139],
      BORDER:   [226, 232, 240],
      ACCENT:   [60, 143, 145],
      NEGATIVE: [200, 50, 50],
      PAGE_W: 210,
      PAGE_H: 297,
      MARGIN: 20,
      CONTENT_W: 210 - 20 * 2,
      FOOTER_RESERVE: 60
    };
    let y = ctx.MARGIN;

    const isNC = invoice.tipoDocumento === 'TD04';
    const totals = invoice._totals || {};
    const sign = isNC ? -1 : 1;

    y = _pdfDrawIntestazioneAndParti(doc, invoice, ctx, y, isNC);
    y = _pdfDrawTabellaRighe(doc, invoice, ctx, y, isNC);
    y = _pdfDrawRiepilogoTotali(doc, invoice, totals, sign, ctx, y);

    // A-A8 / NR-10: regime fail-loud (D.L. 119/2018 + art. 6 D.Lgs. 471/1997)
    const isForfettario = _resolveRegimeForPdf() === 'forfettario';
    y = _pdfDrawFooterLegale(doc, invoice, ctx, y, isForfettario);

    return doc;
  }

  function formatDateIt(iso) {
    const parts = parseDateParts(iso);
    if (!parts) return String(iso || '');
    return String(parts.day).padStart(2, '0') + '/' + String(parts.month).padStart(2, '0') + '/' + parts.year;
  }
  const formatEur = _FormatUtilsFatt.formatEur;
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
  // fmtXmlNum delegato a fatture-xml-helpers.js (Sprint 4)

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
    // C-A2 bypass: blocca ritenuta forfettario su preview/download XML (DUP-1 v2)
    const ritenutaErrXml = _ValidatorsFatt.validateRitenutaForfettario(draft, AppContext.getSettings(), { context: 'xml' });
    if (ritenutaErrXml) errors.push(ritenutaErrXml);
    return { errors };
  }

  function buildFatturaElettronicaXmlNC(noteCredit, fatturaOriginale) {
    if (!fatturaOriginale) {
      throw new Error('NC: fattura originale richiesta per DatiFattureCollegate');
    }
    const draft = { ...noteCredit, tipoDocumento: 'TD04', _isNC: true };
    return buildFatturaElettronicaXml(draft, { fatturaOriginale });
  }

  // ── Sub-funzioni di buildFatturaElettronicaXml (Sprint 4.2) ──────────────
  // Decomposizione interna per leggibilità. Output XML byte-identico:
  // i test snapshot fatture-xml-*.test.js validano l'invarianza.

  // R6 — NC date >= original invoice date.
  function _validateNCDate(draft) {
    if (!(draft._isNC === true || draft.tipoDocumento === 'TD04')) return;
    var origRef = draft._originalForValidation;
    if (!origRef && draft.fatturaOriginaleId
        && typeof window !== 'undefined' && window.FattureStorico
        && typeof window.FattureStorico.load === 'function') {
      try {
        var allOrig = window.FattureStorico.load(currentProfile) || [];
        for (var i = 0; i < allOrig.length; i++) {
          if (allOrig[i] && allOrig[i].id === draft.fatturaOriginaleId) { origRef = allOrig[i]; break; }
        }
      } catch (e) { /* noop */ }
    }
    if (origRef && origRef.data && draft.data && String(draft.data) < String(origRef.data)) {
      throw new Error('Data NC (' + draft.data + ') anteriore alla fattura originale (' + origRef.data + '). La nota di credito non può precedere l’emissione originale.');
    }
  }

  // Costruisce l'array di <DettaglioLinee> + flag rimborso bollo.
  // A-A7 v2: rimborso bollo solo TD01 con marcaDaBollo+bolloAddebitato e imponibile > 77,47 €.
  function _buildXmlDettaglioLinee(draft, isNC, sign, totals, naturaLinea) {
    var lineNum = 0;
    var lines = (draft.righe || []).map(function (line) {
      lineNum++;
      var qta = parseMaybeNumber(line.quantita) || 1;
      var pu = round2(parseMaybeNumber(line.prezzoUnitario));
      var tot = round2(qta * pu * sign);
      // Descrizione: sanitize Latin-1 (XSD String1000LatinType) + xmlEscape
      var descSanitized = sanitizeXmlLatin1(line.descrizione || 'Prestazione professionale').slice(0, 1000);
      return '    <DettaglioLinee>\n' +
        '      <NumeroLinea>' + lineNum + '</NumeroLinea>\n' +
        '      <Descrizione>' + xmlEscape(descSanitized) + '</Descrizione>\n' +
        '      <Quantita>' + fmtXmlNum(qta) + '</Quantita>\n' +
        '      <PrezzoUnitario>' + fmtXmlNum(pu) + '</PrezzoUnitario>\n' +
        '      <PrezzoTotale>' + fmtXmlNum(tot) + '</PrezzoTotale>\n' +
        '      <AliquotaIVA>0.00</AliquotaIVA>\n' +
        '      <Natura>' + naturaLinea + '</Natura>\n' +
        '    </DettaglioLinee>';
    });

    var emetteRimborsoBollo = !isNC
      && draft.marcaDaBollo === true
      && draft.bolloAddebitato === true
      && (totals && (totals.subtotal || 0) > BOLLO_THRESHOLD);
    if (emetteRimborsoBollo) {
      lineNum++;
      lines.push('    <DettaglioLinee>\n' +
        '      <NumeroLinea>' + lineNum + '</NumeroLinea>\n' +
        '      <Descrizione>Rimborso imposta di bollo</Descrizione>\n' +
        '      <Quantita>1.00</Quantita>\n' +
        '      <PrezzoUnitario>2.00</PrezzoUnitario>\n' +
        '      <PrezzoTotale>2.00</PrezzoTotale>\n' +
        '      <AliquotaIVA>0.00</AliquotaIVA>\n' +
        '      <Natura>N1</Natura>\n' +
        '    </DettaglioLinee>');
    }
    return { dettaglioLinee: lines, emetteRimborsoBollo: emetteRimborsoBollo };
  }

  // F7 — ImportoRitenuta segue il segno; AliquotaRitenuta resta positiva.
  function _buildXmlDatiRitenuta(draft, sign) {
    if (!(Number(draft.ritenuta) > 0)) return '';
    var tipo = draft.tipoRitenuta || 'RT02';
    var caus = (draft.causaleRitenuta || 'A').toUpperCase().slice(0, 2);
    return '\n      <DatiRitenuta>\n' +
      '        <TipoRitenuta>' + tipo + '</TipoRitenuta>\n' +
      '        <ImportoRitenuta>' + fmtXmlNum(Number(draft.ritenuta) * sign) + '</ImportoRitenuta>\n' +
      '        <AliquotaRitenuta>' + Number(draft.aliquotaRitenuta || 0).toFixed(2) + '</AliquotaRitenuta>\n' +
      '        <CausalePagamento>' + xmlEscape(caus) + '</CausalePagamento>\n' +
      '      </DatiRitenuta>';
  }

  // NC — DatiFattureCollegate (XSD: dentro DatiGenerali, dopo DatiGeneraliDocumento).
  function _buildXmlDatiFattureCollegate(isNC, fatturaOriginale) {
    if (!isNC || !fatturaOriginale) return '';
    return '\n    <DatiFattureCollegate>\n' +
      '      <RiferimentoNumeroLinea>1</RiferimentoNumeroLinea>\n' +
      '      <IdDocumento>' + xmlEscape(String(fatturaOriginale.numero || '')) + '</IdDocumento>\n' +
      '      <Data>' + xmlEscape(String(fatturaOriginale.data || '')) + '</Data>\n' +
      '    </DatiFattureCollegate>';
  }

  // Identificativo fiscale cessionario — branchata su estero/IT-PIVA/IT-privato.
  // NR-3: strip prefisso paese duplicato per esteri (FatturaPA v1.2 §2.1.2.6).
  function _buildXmlCessionarioFiscale(cliente, clientePivaRaw, clientePivaValida, clienteEstero, cliNaz, clienteCF, clientePiva) {
    if (clienteEstero) {
      var vatEstero = clientePivaRaw || clienteCF;
      if (!vatEstero) {
        console.warn('Cliente estero senza VAT né CF: XML potrebbe essere rifiutato da SdI');
        return '';
      }
      var vatCodice = vatEstero.replace(new RegExp('^' + cliNaz, 'i'), '').trim() || vatEstero;
      return '\n        <IdFiscaleIVA>\n' +
        '          <IdPaese>' + cliNaz + '</IdPaese>\n' +
        '          <IdCodice>' + xmlEscape(vatCodice) + '</IdCodice>\n' +
        '        </IdFiscaleIVA>';
    }
    if (clientePivaValida) {
      var out = '\n        <IdFiscaleIVA>\n' +
        '          <IdPaese>IT</IdPaese>\n' +
        '          <IdCodice>' + xmlEscape(clientePiva) + '</IdCodice>\n' +
        '        </IdFiscaleIVA>';
      if (clienteCF) out += '\n        <CodiceFiscale>' + xmlEscape(clienteCF) + '</CodiceFiscale>';
      return out;
    }
    if (!clienteCF) {
      console.warn('Cessionario privato senza CF: XML potrebbe essere rifiutato da SdI');
      return '';
    }
    return '\n        <CodiceFiscale>' + xmlEscape(clienteCF) + '</CodiceFiscale>';
  }

  // C3 — XSD element order (fatturaordinaria_v1.2.xsd §2.1.1):
  // TipoDocumento → Divisa → Data → Numero → DatiRitenuta → DatiBollo → ImportoTotaleDocumento → Causale.
  function _buildXmlDatiGeneraliDocumento(tipoDoc, draft, totals, sign, xmlRitenuta, datiBollo, causaleXml) {
    var parts = [];
    parts.push('<TipoDocumento>' + xmlEscape(tipoDoc) + '</TipoDocumento>');
    parts.push('<Divisa>EUR</Divisa>');
    parts.push('<Data>' + xmlEscape(draft.data) + '</Data>');
    parts.push('<Numero>' + xmlEscape(draft.numero) + '</Numero>');
    if (xmlRitenuta && String(xmlRitenuta).trim()) parts.push(String(xmlRitenuta).trim());
    if (datiBollo && String(datiBollo).trim()) parts.push(String(datiBollo).trim());
    parts.push('<ImportoTotaleDocumento>' + fmtXmlNum(round2(totals.total * sign)) + '</ImportoTotaleDocumento>');
    if (causaleXml && String(causaleXml).trim()) parts.push(String(causaleXml).trim());
    return '<DatiGeneraliDocumento>' + parts.join('') + '</DatiGeneraliDocumento>';
  }

  function buildFatturaElettronicaXml(draft, opts = {}) {
    const isNC = draft._isNC === true || draft.tipoDocumento === 'TD04';
    const tipoDoc = isNC ? 'TD04' : 'TD01';
    const sign = isNC ? -1 : 1;

    _validateNCDate(draft);

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
    //  - cliente PA → Codice IPA 6 char alfanumerici as-is (D.M. 55/2013 art. 2)
    //  - cliente IT con SDI valorizzato → quello (7 char, padded)
    //  - cliente IT privato o senza SDI → 0000000
    const isClientePA = cliente.tipoCliente === 'PA';
    const codiceSDI = clienteEstero
      ? 'XXXXXXX'
      : (isClientePA
          ? String(cliente.codiceSDI || '').trim().toUpperCase()
          : (clientePivaValida
              ? String(cliente.codiceSDI || '0000000').trim().padEnd(7, '0').slice(0, 7)
              : String(cliente.codiceSDI || '').trim() || '0000000'));

    // Cedente Nome/Cognome dal profilo fiscale (campi già separati in getProfileFiscalData)
    const profileNome = String(profile.nome || '').replace(String(profile.cognome || ''), '').trim()
      || String(profile.nome || '').trim().split(/\s+/).slice(0, -1).join(' ');
    const profileCognome = String(profile.cognome || '').trim()
      || String(profile.nome || currentProfile).trim().split(/\s+/).slice(-1)[0];

    // IdTrasmittente.IdCodice (path 1.1.1.2): identificativo fiscale del soggetto
    // trasmittente. Per persona fisica autotrasmittente (regime forfettario) deve
    // essere il CODICE FISCALE (16 char alfanumerico), NON la P.IVA. SdI scarta con
    // errore 00300 "IdCodice non valido" se viene messa la P.IVA per PF: cerca
    // l'identificativo in AT come trasmittente abilitato e per PF lo trova solo via CF.
    // Per PG il CF coincide con la P.IVA (11 cifre) quindi nessun cambio effettivo.
    const cfTrim = String(profile.codiceFiscale || '').trim().toUpperCase();
    const isPersonaFisicaCF = /^[A-Z0-9]{16}$/.test(cfTrim);
    const trasmittenteIdCodice = isPersonaFisicaCF ? cfTrim : piva;

    // Natura + riferimento normativo — forfettario RF19 sempre N2.2.
    // art. 1 c. 58 L. 190/2014 + Circ. AdE 9/E 2019 §4.1: fuori campo IVA,
    // non ex artt. 7-7septies DPR 633/72. N2.1 è riservata al regime ordinario.
    const naturaLinea = 'N2.2';
    const riferimentoNormativo = "Regime forfettario: operazione in franchigia IVA e senza ritenuta d'acconto Art.1 c.54-89 L.190/2014";

    // Imponibile = somma righe (bollo e contributo integrativo esclusi dall'XML SdI)
    const imponibile = round2(totals.subtotal);

    // Lines + rimborso bollo — delegato a _buildXmlDettaglioLinee
    const lineeResult = _buildXmlDettaglioLinee(draft, isNC, sign, totals, naturaLinea);
    const dettaglioLinee = lineeResult.dettaglioLinee;
    const emetteRimborsoBollo = lineeResult.emetteRimborsoBollo;

    // Contributo integrativo: si applica SOLO alle casse autonome (es. TC01 avvocati,
    // TC02 ingegneri). Gestione separata INPS (TC22) non ha integrativo. Finché non
    // supportiamo TipoCassa + DatiCassaPrevidenziale, blocchiamo l'export se il
    // campo è valorizzato per evitare XML fiscalmente non conforme (lo standard
    // Fiscozen per gestione separata non emette integrativo — vedi campioni).

    // DatiBollo / DatiRitenuta / DatiFattureCollegate — delegati ai sub-helpers
    const datiBollo = (!isNC && applicaBolloSeDovuto(totals.subtotal, draft.marcaDaBollo))
      ? '\n      <DatiBollo>\n        <BolloVirtuale>SI</BolloVirtuale>\n        <ImportoBollo>2.00</ImportoBollo>\n      </DatiBollo>'
      : '';
    const xmlRitenuta = _buildXmlDatiRitenuta(draft, sign);
    const datiCollegate = _buildXmlDatiFattureCollegate(isNC, opts.fatturaOriginale);

    // Causale: sanitize Latin-1 (XSD String200LatinType) + xmlEscape, slice 200
    const causale = sanitizeXmlLatin1(String(draft.note || '').trim()).slice(0, 200);
    const causaleXml = causale ? `
      <Causale>${xmlEscape(causale)}</Causale>` : '';

    const ibanXml = String(profile.iban || '').trim()
      ? `\n        <IBAN>${xmlEscape(profile.iban.replace(/\s/g, ''))}</IBAN>` : '';

    const scadenzaXml = draft.scadenzaPagamento
      ? `\n        <DataScadenzaPagamento>${xmlEscape(draft.scadenzaPagamento)}</DataScadenzaPagamento>` : '';

    // Client sede — sanitize Latin-1 (XSD String60LatinType) + xmlEscape.
    // validateFatturaForXml garantisce non-empty per clienti IT.
    // Per estero: se provincia/cap mancanti, usiamo fallback minimali conformi XSD
    // (CAP "00000" accettato da SdI per nazioni ≠ IT).
    const cliInd = xmlEscape(sanitizeXmlLatin1(cliente.indirizzo || '').slice(0, 60));
    const cliCap = clienteEstero
      ? (String(cliente.cap || '').replace(/\D/g, '').padStart(5, '0').slice(0, 5) || '00000')
      : String(cliente.cap || '').replace(/\D/g, '').padStart(5, '0').slice(0, 5);
    const cliCom = xmlEscape(sanitizeXmlLatin1(cliente.citta || '').slice(0, 60));
    const cliProv = clienteEstero ? '' : String(cliente.provincia || '').slice(0, 2).trim().toUpperCase();
    const cliProvXml = cliProv ? `\n        <Provincia>${xmlEscape(cliProv)}</Provincia>` : '';

    const cedInd = xmlEscape(sanitizeXmlLatin1(profile.indirizzo || '').slice(0, 60));
    const cedCap = String(profile.cap || '').replace(/\D/g, '').padStart(5, '0').slice(0, 5);
    const cedCom = xmlEscape(sanitizeXmlLatin1(profile.citta || '').slice(0, 60));
    const cedProv = String(profile.provincia || '').slice(0, 2).trim();
    const cedNaz = String(profile.nazione || 'IT').slice(0, 2).toUpperCase();
    const cedProvXml = cedProv ? `\n        <Provincia>${xmlEscape(cedProv)}</Provincia>` : '';

    const cfCedenteXml = profile.codiceFiscale
      ? `\n        <CodiceFiscale>${xmlEscape(profile.codiceFiscale)}</CodiceFiscale>` : '';

    // Client fiscal ID + DatiGeneraliDocumento — delegati ai sub-helpers
    const cessionarioFiscaleXml = _buildXmlCessionarioFiscale(
      cliente, clientePivaRaw, clientePivaValida, clienteEstero, cliNaz, clienteCF, clientePiva
    );
    const datiGeneraliDocumentoXml = _buildXmlDatiGeneraliDocumento(
      tipoDoc, draft, totals, sign, xmlRitenuta, datiBollo, causaleXml
    );

    return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12"
  xmlns:p="${XML_NAMESPACE}"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="${XML_NAMESPACE} http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${xmlEscape(trasmittenteIdCodice)}</IdCodice>
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
          <Nome>${xmlEscape(sanitizeXmlLatin1(profileNome).slice(0, 60))}</Nome>
          <Cognome>${xmlEscape(sanitizeXmlLatin1(profileCognome).slice(0, 60))}</Cognome>
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
      </DatiRiepilogo>${emetteRimborsoBollo ? `
      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <Natura>N1</Natura>
        <ImponibileImporto>2.00</ImponibileImporto>
        <Imposta>0.00</Imposta>
        <RiferimentoNormativo>Rimborso imposta di bollo - Escluso art. 15 DPR 633/72 (Ris. AdE 444/E 2008)</RiferimentoNormativo>
      </DatiRiepilogo>` : ''}
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
    stepsWrap.appendChild(makeSdiStep(6,
      '<strong>Una volta sola, attiva la conservazione gratuita 15 anni</strong> dell\'AdE: senza adesione le fatture restano nel cassetto solo 2 anni. '
      + '<button type="button" class="sdi-guide-link" style="background:none;border:none;color:inherit;text-decoration:underline;cursor:pointer;padding:0;font:inherit" onclick="window.showAdeConservationGuide && window.showAdeConservationGuide()">Vedi guida adesione &rarr;</button>'));
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

  // ─── F1: Conservazione AdE gratuita ─────────────────────────────────
  // Servizio gratuito AdE accreditato AgID che conserva 15 anni le fatture
  // elettroniche transitate da SdI (D.Lgs. 82/2005 + DPCM 3/12/2013 +
  // D.M. 17/06/2014 + Provv. AdE 30/04/2018).
  // Senza adesione AdE conserva solo 2 anni in modalità transito.
  // Adesione una tantum, retroattiva alle fatture ancora nel cassetto.

  function _adeConservationFlagKey(profile) {
    return _StorageKeysFatt.adeConservationAcknowledged(profile);
  }
  function isAdeConservationAcknowledged() {
    try {
      const profile = AppContext.getProfile();
      return localStorage.getItem(_adeConservationFlagKey(profile)) === '1';
    } catch (_e) { return false; }
  }
  function acknowledgeAdeConservation() {
    try {
      const profile = AppContext.getProfile();
      localStorage.setItem(_adeConservationFlagKey(profile), '1');
    } catch (_e) { /* best-effort */ }
    if (typeof renderFattureDocsSection === 'function') renderFattureDocsSection();
  }
  function resetAdeConservationAck() {
    try {
      const profile = AppContext.getProfile();
      localStorage.removeItem(_adeConservationFlagKey(profile));
    } catch (_e) { /* best-effort */ }
    if (typeof renderFattureDocsSection === 'function') renderFattureDocsSection();
  }

  function _appendIntroPara(parent) {
    // Helper: build intro paragraph via DOM nodes (no innerHTML on dynamic content)
    const intro = document.createElement('div');
    intro.className = 'sdi-guide-note';
    intro.style.marginBottom = '12px';
    const b1 = document.createElement('strong');
    b1.textContent = 'Perché aderire: ';
    intro.appendChild(b1);
    intro.appendChild(document.createTextNode(
      'AdE conserva automaticamente per 15 anni tutte le fatture (emesse e ricevute) transitate da SdI. È un servizio accreditato AgID, gratuito, equivalente ai conservatori privati. '
    ));
    const b2 = document.createElement('strong');
    b2.textContent = 'Senza adesione le fatture restano nel cassetto solo 2 anni';
    intro.appendChild(b2);
    intro.appendChild(document.createTextNode(
      ' e poi vengono cancellate — in caso di accertamento (5-7 anni) potresti non avere più la copia conservata a norma. Riferimenti: DPCM 3/12/2013, D.M. 17/06/2014, Provv. AdE 30/04/2018.'
    ));
    parent.appendChild(intro);
  }

  function renderAdeConservationGuideInto(modalContent) {
    const guide = document.createElement('div');
    guide.className = 'sdi-upload-guide ade-conservation-guide';

    const h = document.createElement('div');
    h.className = 'sdi-guide-title';
    h.textContent = 'Conservazione AdE gratuita (15 anni)';
    guide.appendChild(h);

    _appendIntroPara(guide);

    const lbl = document.createElement('div');
    lbl.className = 'sdi-guide-label';
    lbl.textContent = 'Procedura — 5 minuti, una sola volta';
    guide.appendChild(lbl);

    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'sdi-steps-list';
    stepsWrap.appendChild(makeSdiStep(1,
      'Accedi al portale AdE con SPID, CIE o CNS: '
      + '<a href="https://ivaservizi.agenziaentrate.gov.it/portale/" target="_blank" rel="noopener" class="sdi-guide-link">ivaservizi.agenziaentrate.gov.it/portale</a>'));
    stepsWrap.appendChild(makeSdiStep(2,
      'Apri <strong>"Fatture e Corrispettivi"</strong> dal menu servizi.'));
    stepsWrap.appendChild(makeSdiStep(3,
      'Nel menu di sinistra vai su <strong>"Conservazione" &rarr; "Adesione/Recesso al servizio di Conservazione"</strong>.'));
    stepsWrap.appendChild(makeSdiStep(4,
      'Clicca <strong>"Aderisci"</strong>, indica la <strong>PEC</strong> del titolare P.IVA dove ricevere il manuale di conservazione, accetta le condizioni di servizio.'));
    stepsWrap.appendChild(makeSdiStep(5,
      'Conferma con SPID/firma digitale. Riceverai una PEC con il <strong>Manuale di conservazione</strong> da archiviare. Da quel momento tutte le fatture sono conservate per 15 anni.'));
    guide.appendChild(stepsWrap);

    const notes = document.createElement('div');
    notes.className = 'sdi-guide-problems';
    const nt = document.createElement('div');
    nt.className = 'sdi-guide-problems-title';
    nt.textContent = 'Cose importanti da sapere';
    notes.appendChild(nt);
    notes.appendChild(makeSdiProblem('Costo',
      'Zero. Sempre. È un servizio pubblico gratuito.'));
    notes.appendChild(makeSdiProblem('Retroattività',
      'L\'adesione copre anche le fatture degli ultimi <strong>2 anni</strong> ancora nel cassetto. Più aspetti, più ne perdi.'));
    notes.appendChild(makeSdiProblem('Doppia conservazione',
      'Compatibile con altri provider (Aruba, Fattureincloud, ecc.). Hai una copia in più senza conflitti.'));
    notes.appendChild(makeSdiProblem('Forfettari',
      'Anche per chi è in franchigia IVA: il D.M. 17/06/2014 art. 4 obbliga la conservazione delle fatture elettroniche emesse.'));
    guide.appendChild(notes);

    const actions = document.createElement('div');
    actions.className = 'sdi-guide-actions';
    const link = document.createElement('a');
    link.href = 'https://ivaservizi.agenziaentrate.gov.it/portale/';
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'btn-add sdi-portal-btn';
    link.textContent = 'Apri portale AdE';
    const ackBtn = document.createElement('button');
    ackBtn.type = 'button';
    ackBtn.className = 'btn-ghost';
    ackBtn.textContent = 'Ho già aderito — non ricordarmelo più';
    ackBtn.onclick = function () {
      acknowledgeAdeConservation();
      closeFatturaModal();
    };
    const closeB = document.createElement('button');
    closeB.type = 'button';
    closeB.className = 'btn-ghost';
    closeB.textContent = 'Chiudi';
    closeB.onclick = function () { closeFatturaModal(); };
    actions.appendChild(link);
    actions.appendChild(ackBtn);
    actions.appendChild(closeB);
    guide.appendChild(actions);

    while (modalContent.firstChild) modalContent.removeChild(modalContent.firstChild);
    modalContent.appendChild(guide);
  }

  function showAdeConservationGuide() {
    const modalContent = document.getElementById('fatturaModalContent');
    if (!modalContent) return;
    renderAdeConservationGuideInto(modalContent);
    const m = document.getElementById('fatturaModal');
    if (m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
    document.body.classList.add('profile-modal-open');
  }

  if (typeof window !== 'undefined') {
    window.showAdeConservationGuide = showAdeConservationGuide;
    window.isAdeConservationAcknowledged = isAdeConservationAcknowledged;
    window.acknowledgeAdeConservation = acknowledgeAdeConservation;
    window.resetAdeConservationAck = resetAdeConservationAck;
  }

  // ─── Task 8: Anteprima XML + Nota di credito da storico ─────────────────────

  function previewFatturaXml() {
    try {
      const saved = saveFatturaDraft(true);
      if (!saved) return;
      // C-A2 bypass: validate prima della preview
      const validation = validateFatturaForXml(saved);
      if (validation.errors && validation.errors.length) {
        showFatturaToast(validation.errors[0], 'error');
        return;
      }
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
    const profile = AppContext.getProfile();
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
        AppContext.getProfile(),
        sessionStorage.getItem('currentProfile')
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
    const profile = AppContext.getProfile();
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
  window.__validateFatturaForXml = validateFatturaForXml;
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
    const profile = AppContext.getProfile();
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
    const profile = AppContext.getProfile();
    if (!profile) return;
    const store = window.FattureStorico || { load: loadFattureEmesse, save: saveFattureEmesse };
    const all = store.load(profile);
    const idx = all.findIndex(f => f.id === id);
    if (idx < 0) return;
    if ((all[idx].stato || 'bozza') !== 'bozza') return;
    // DUP-2: state machine canonica
    if (window.FattureStateMachine) {
      window.FattureStateMachine.markInviata(all[idx]);
    } else {
      all[idx].stato = 'inviata';
      if (!all[idx].dataInvioSdi) all[idx].dataInvioSdi = todayIso();
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
    const profile = AppContext.getProfile();
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
    const profile = AppContext.getProfile();
    if (!profile) return;
    const store = window.FattureStorico || { load: loadFattureEmesse, save: saveFattureEmesse };
    const all = store.load(profile);
    const idx = all.findIndex(f => f.id === id);
    if (idx < 0) return;
    if ((all[idx].stato || 'bozza') !== 'inviata') return;
    // DUP-2: state machine canonica
    if (window.FattureStateMachine) {
      window.FattureStateMachine.markPagata(all[idx]);
    } else {
      const iso = todayIso();
      const today = new Date(iso + 'T00:00:00');
      all[idx].stato = 'pagata';
      all[idx].dataPagamento = iso;
      all[idx].pagMese = today.getMonth() + 1;
      all[idx].pagAnno = today.getFullYear();
    }
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
