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

  function toPdfSafeText(value) {
    return String(value ?? '')
      .replace(/€/g, 'EUR')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/\u2022/g, '-')
      .replace(/\u00A0/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
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

  function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find(script => script.src === src);
      if (existing) {
        if (existing.dataset.loaded === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Caricamento fallito: ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = '1';
        resolve();
      };
      script.onerror = () => reject(new Error(`Caricamento fallito: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureJsPdfAvailable() {
    if (window.jspdf && typeof window.jspdf.jsPDF === 'function') return;
    const sources = [
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
    ];
    let lastError = null;
    for (const src of sources) {
      try {
        await loadExternalScript(src);
        if (window.jspdf && typeof window.jspdf.jsPDF === 'function') return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('jsPDF non disponibile.');
  }

  function normalizeDigits(value) {
    return String(value ?? '').replace(/\D+/g, '');
  }

  function normalizeProgressivo(value) {
    const cleaned = String(value ?? '').replace(/[^A-Za-z0-9]/g, '');
    if (cleaned) return cleaned.slice(0, 20);
    return `F${Date.now().toString(36).toUpperCase()}`;
  }

  function getInvoiceXmlFileName(invoice) {
    const profile = getProfileFiscalData();
    const piva = normalizeDigits(profile.partitaIva || '').replace(/^IT/i, '');
    return `IT${piva || '00000000000'}_${normalizeProgressivo(invoice.numero || invoice.id || invoice.data)}.xml`;
  }

  function normalizeCodiceDestinatario(value) {
    const code = String(value || '').trim().toUpperCase();
    return /^[A-Z0-9]{7}$/.test(code) ? code : '0000000';
  }

  function formatXmlDate(dateIso) {
    const parts = parseDateParts(dateIso);
    if (!parts) return '';
    const month = String(parts.month).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');
    return `${parts.year}-${month}-${day}`;
  }

  function buildXmlAddress(address) {
    return [
      `<Indirizzo>${xmlEscape(address.indirizzo || '')}</Indirizzo>`,
      `<CAP>${xmlEscape(normalizeDigits(address.cap || ''))}</CAP>`,
      `<Comune>${xmlEscape(address.citta || '')}</Comune>`,
      `<Provincia>${xmlEscape((address.provincia || '').toString().trim().toUpperCase())}</Provincia>`,
      `<Nazione>${xmlEscape((address.nazione || 'IT').toString().trim().toUpperCase())}</Nazione>`
    ].join('');
  }

  function buildXmlAnagrafica(nome) {
    return `<Anagrafica><Denominazione>${xmlEscape(nome || '')}</Denominazione></Anagrafica>`;
  }

  function buildXmlIdFiscaleIva(piva) {
    const normalized = normalizeDigits(piva || '').replace(/^IT/i, '');
    if (!normalized) return '';
    return `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${xmlEscape(normalized)}</IdCodice></IdFiscaleIVA>`;
  }

  function buildXmlCodiceFiscale(cf) {
    const normalized = String(cf || '').trim();
    return normalized ? `<CodiceFiscale>${xmlEscape(normalized)}</CodiceFiscale>` : '';
  }

  function getXmlInvoiceProgressivo(invoice) {
    const rawNumber = String(invoice?.numero || '').trim();
    if (rawNumber) {
      const match = rawNumber.match(/^(\d+)/);
      if (match) return normalizeProgressivo(`${match[1]}${invoice.anno || ''}`);
      return normalizeProgressivo(rawNumber);
    }
    return normalizeProgressivo(invoice?.id || invoice?.data || invoice?.anno || '');
  }

  function validateFatturaForXml(invoice) {
    const errors = [];
    const warnings = [];
    const profile = getProfileFiscalData();
    const cliente = invoice.clienteSnapshot || (typeof getClienteById === 'function' ? getClienteById(invoice.clienteId) : null) || {};
    const lines = Array.isArray(invoice.righe) ? invoice.righe : [];

    if (!invoice.numero) errors.push('Numero fattura mancante.');
    if (!invoice.data) errors.push('Data emissione mancante.');
    if (!invoice.clienteId) errors.push('Seleziona un cliente prima di generare l XML.');
    if (!profile.nome) errors.push('Compila il nome del profilo fiscale emittente.');
    if (!profile.partitaIva) errors.push('Compila la Partita IVA del profilo fiscale emittente.');
    if (!profile.codiceFiscale) errors.push('Compila il codice fiscale del profilo fiscale emittente.');
    if (!profile.indirizzo || !profile.cap || !profile.citta || !profile.provincia) {
      errors.push('Compila indirizzo, CAP, citta e provincia del profilo fiscale emittente.');
    }

    if (!cliente.nome) errors.push('Il cliente selezionato non ha un nome valido.');
    if (!cliente.partitaIva && !cliente.codiceFiscale) {
      errors.push('Il cliente deve avere almeno Partita IVA o Codice Fiscale.');
    }
    if (!cliente.indirizzo || !cliente.cap || !cliente.citta || !cliente.provincia) {
      errors.push('Compila indirizzo, CAP, citta e provincia del cliente.');
    }

    if (!lines.length) errors.push('Aggiungi almeno una riga fattura.');
    const xmlLines = lines.filter(line => String(line?.descrizione || '').trim() || parseMaybeNumber(line?.prezzoUnitario) > 0 || parseMaybeNumber(line?.quantita) > 0);
    if (!xmlLines.length) errors.push('Aggiungi almeno una riga fattura valida.');

    xmlLines.forEach((line, index) => {
      const descrizione = String(line.descrizione || '').trim();
      if (!descrizione) errors.push(`Riga ${index + 1}: inserisci una descrizione.`);
      const quantita = parseMaybeNumber(line.quantita);
      if (!(quantita > 0)) errors.push(`Riga ${index + 1}: la quantita deve essere maggiore di zero.`);
      const iva = parseMaybeNumber(line.iva);
      if (iva > 0) {
        errors.push(`Riga ${index + 1}: per il forfettario l IVA deve essere 0,00%.`);
      }
    });

    const paymentLabel = String(invoice.modalitaPagamento || '').trim();
    if (!paymentLabel) errors.push('Inserisci la modalita di pagamento.');
    if (typeof paymentLabel === 'string' && /bonifico/i.test(paymentLabel) && !String(invoice.iban || '').trim()) {
      errors.push('Inserisci l IBAN per il pagamento tramite bonifico.');
    }

    if (invoice.marcaDaBollo && parseMaybeNumber(invoice.bolloImporto || 2) <= 0) {
      warnings.push('La marca da bollo e attiva ma non ha un importo valido.');
    }

    if (!cliente.codiceSDI && !cliente.pec) {
      warnings.push('Il cliente non ha SDI/PEC: nel file XML useremo 0000000 come codice destinatario.');
    }

    return { errors, warnings };
  }

  function buildFatturaElettronicaXml(invoice) {
    const profile = getProfileFiscalData();
    const cliente = invoice.clienteSnapshot || (typeof getClienteById === 'function' ? getClienteById(invoice.clienteId) : null) || {};
    const lines = Array.isArray(invoice.righe) ? invoice.righe : [];
    const progressivo = getXmlInvoiceProgressivo(invoice);
    const documentoData = formatXmlDate(invoice.data);
    const scadenzaData = formatXmlDate(invoice.scadenzaPagamento || invoice.data);
    const pivaEmittente = normalizeDigits(profile.partitaIva || '').replace(/^IT/i, '');
    const pivaCliente = normalizeDigits(cliente.partitaIva || '').replace(/^IT/i, '');
    const codDestinatario = normalizeCodiceDestinatario(cliente.codiceSDI);
    const bolloXml = invoice.marcaDaBollo ? `
        <DatiBollo>
          <BolloVirtuale>SI</BolloVirtuale>
          <ImportoBollo>${round2(invoice.bolloImporto || 2).toFixed(2)}</ImportoBollo>
        </DatiBollo>` : '';
    const dettLinesXml = lines.map((line, index) => {
      const descrizione = String(line.descrizione || '').trim();
      const quantita = round2(line.quantita || 1).toFixed(2);
      const prezzoUnitario = round2(line.prezzoUnitario || 0).toFixed(2);
      const totaleLinea = round2(parseMaybeNumber(line.quantita) * parseMaybeNumber(line.prezzoUnitario)).toFixed(2);
      return `
        <DettaglioLinee>
          <NumeroLinea>${index + 1}</NumeroLinea>
          <Descrizione>${xmlEscape(descrizione)}</Descrizione>
          <Quantita>${quantita}</Quantita>
          <PrezzoUnitario>${prezzoUnitario}</PrezzoUnitario>
          <PrezzoTotale>${totaleLinea}</PrezzoTotale>
          <AliquotaIVA>0.00</AliquotaIVA>
          <Natura>N2.2</Natura>
        </DettaglioLinee>`;
    }).join('');
    const subtotal = round2(lines.reduce((sum, line) => sum + parseMaybeNumber(line.quantita) * parseMaybeNumber(line.prezzoUnitario), 0));
    const contributoIntegrativo = round2(invoice.contributoIntegrativo || 0);
    const totaleBollo = invoice.marcaDaBollo ? round2(invoice.bolloImporto || 2) : 0;
    const totaleDocument = round2(subtotal + contributoIntegrativo + totaleBollo);
    const imponibileRiepilogo = round2(subtotal + contributoIntegrativo);
    const note = String(invoice.note || DEFAULT_FORFETTARIO_NOTE).trim();

    return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="${XML_NAMESPACE}" versione="FPR12">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${xmlEscape(pivaEmittente || '00000000000')}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${xmlEscape(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${xmlEscape(codDestinatario)}</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        ${buildXmlIdFiscaleIva(pivaEmittente)}
        ${buildXmlCodiceFiscale(profile.codiceFiscale)}
        ${buildXmlAnagrafica(profile.nome)}
        <RegimeFiscale>${XML_FORFETTARIO_REGIME}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>${buildXmlAddress(profile)}</Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        ${buildXmlIdFiscaleIva(pivaCliente)}
        ${buildXmlCodiceFiscale(cliente.codiceFiscale)}
        ${buildXmlAnagrafica(cliente.nome)}
      </DatiAnagrafici>
      <Sede>${buildXmlAddress(cliente)}</Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${xmlEscape(documentoData)}</Data>
        <Numero>${xmlEscape(String(invoice.numero || '').trim())}</Numero>
        <Causale>${xmlEscape(note)}</Causale>${bolloXml}
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>${dettLinesXml}
      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <Natura>N2.2</Natura>
        <ImponibileImporto>${imponibileRiepilogo.toFixed(2)}</ImponibileImporto>
        <Imposta>0.00</Imposta>
        <RiferimentoNormativo>${xmlEscape(DEFAULT_FORFETTARIO_NOTE)}</RiferimentoNormativo>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${modalitaToCodiceMP(invoice.modalitaPagamento)}</ModalitaPagamento>
        <DataScadenzaPagamento>${xmlEscape(scadenzaData)}</DataScadenzaPagamento>
        <ImportoPagamento>${totaleDocument.toFixed(2)}</ImportoPagamento>
        <IBAN>${xmlEscape(String(invoice.iban || profile.iban || '').trim())}</IBAN>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
  }

  function downloadTextFile(filename, content, mimeType = 'application/xml;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    const dateParts = parseDateParts(dataIso) || parseDateParts(todayIso()) || { year: currentYear, month: new Date().getMonth() + 1, day: new Date().getDate() };
    const cliente = raw.clienteSnapshot && typeof raw.clienteSnapshot === 'object' ? raw.clienteSnapshot : null;
    const righe = Array.isArray(raw.righe) && raw.righe.length > 0 ? raw.righe.map(cloneLine) : [cloneLine({ descrizione: '', quantita: 1, prezzoUnitario: 0, iva: 0 })];
    const subtotal = righe.reduce((sum, r) => sum + (parseMaybeNumber(r.quantita) * parseMaybeNumber(r.prezzoUnitario)), 0);
    const contributoIntegrativo = round2(raw.contributoIntegrativo || 0);
    const marcaDaBollo = parseMaybeNumber(raw.marcaDaBollo) > 0 || raw.marcaDaBollo === true;
    const bollo = marcaDaBollo ? 2 : 0;
    const totale = round2(subtotal + contributoIntegrativo + bollo);
    return {
      id: String(raw.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fatt_${Date.now().toString(36)}`)),
      numero: String(raw.numero || ''),
      anno: parseInt(raw.anno || dateParts.year, 10) || dateParts.year,
      data: dataIso,
      clienteId: String(raw.clienteId || ''),
      clienteSnapshot: cliente ? {
        id: String(cliente.id || raw.clienteId || ''),
        nome: String(cliente.nome || ''),
        partitaIva: String(cliente.partitaIva || ''),
        codiceFiscale: String(cliente.codiceFiscale || ''),
        codiceSDI: String(cliente.codiceSDI || '0000000'),
        pec: String(cliente.pec || ''),
        indirizzo: String(cliente.indirizzo || ''),
        cap: String(cliente.cap || ''),
        citta: String(cliente.citta || ''),
        provincia: String(cliente.provincia || ''),
        nazione: String(cliente.nazione || 'IT'),
        note: String(cliente.note || '')
      } : null,
      righe,
      contributoIntegrativo,
      marcaDaBollo: marcaDaBollo ? true : false,
      bolloImporto: bollo,
      note: String(raw.note || DEFAULT_FORFETTARIO_NOTE),
      modalitaPagamento: String(raw.modalitaPagamento || (typeof currentProfile !== 'undefined' && currentProfile ? getProfileFiscalData().modalitaPagamento : '') || DEFAULT_BONIFICO),
      iban: String(raw.iban || (typeof currentProfile !== 'undefined' && currentProfile ? getProfileFiscalData().iban : '') || ''),
      scadenzaPagamento: String(raw.scadenzaPagamento || addDaysIso(dataIso, 30)),
      incassata: raw.incassata === true || String(raw.incassata) === 'true',
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

  function createDefaultDraft() {
    const profile = getProfileFiscalData();
    const issueDate = todayIso();
    const year = parseDateParts(issueDate)?.year || currentYear;
    const nextNumero = getNextInvoiceNumberForYear(year);
    const clienteList = typeof getClienti === 'function' ? getClienti() : [];
    const firstCliente = clienteList[0] || null;
    return normalizeFatturaEmessa({
      ...DRAFT_TEMPLATE,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fatt_${Date.now().toString(36)}`,
      numero: `${nextNumero}/${year}`,
      data: issueDate,
      anno: year,
      clienteId: firstCliente ? firstCliente.id : '',
      clienteSnapshot: firstCliente || null,
      righe: [cloneLine({ descrizione: '', quantita: 1, prezzoUnitario: 0, iva: 0 })],
      contributoIntegrativo: 0,
      marcaDaBollo: null,
      bolloAuto: true,
      note: DEFAULT_FORFETTARIO_NOTE,
      modalitaPagamento: profile.modalitaPagamento || DEFAULT_BONIFICO,
      iban: profile.iban || '',
      scadenzaPagamento: addDaysIso(issueDate, 30),
      incassata: false,
      dataIncasso: ''
    });
  }

  function getNextInvoiceNumberForYear(year) {
    const invoices = loadFattureEmesse();
    const maxProgressive = invoices.reduce((max, invoice) => {
      const raw = String(invoice.numero || '');
      const match = raw.match(/(\d+)\s*\/\s*(\d{4})$/);
      if (!match) return max;
      const prog = parseInt(match[1], 10);
      const invoiceYear = parseInt(match[2], 10);
      if (!Number.isFinite(prog) || !Number.isFinite(invoiceYear)) return max;
      if (invoiceYear !== parseInt(year, 10)) return max;
      return Math.max(max, prog);
    }, 0);
    return maxProgressive + 1;
  }

  function getSavedInvoiceById(id) {
    return loadFattureEmesse().find(inv => inv.id === id) || null;
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

  function syncBolloDefault(force = false) {
    const draft = currentDraft();
    const totals = computeDraftTotals(draft);
    const thresholdHit = totals.subtotal + totals.contributoIntegrativo > 77.47;
    if (force || draft.bolloAuto !== false) {
      draft.marcaDaBollo = thresholdHit;
    }
    const checkbox = document.getElementById('fatturaMarcaDaBollo');
    if (checkbox && !checkbox.dataset.userTouched) {
      checkbox.checked = !!draft.marcaDaBollo;
    }
  }

  function renderFatturaHistoryItem(invoice) {
    const cliente = invoice.clienteSnapshot || (typeof getClienteById === 'function' ? getClienteById(invoice.clienteId) : null) || {};
    const clienteLabel = cliente.nome || invoice.clienteId || 'Cliente';
    const dateLabel = invoice.data ? invoice.data : `Anno ${invoice.anno || '-'}`;
    const statusLabel = invoice.incassata
      ? `Incassata il ${formatDisplayDate(invoice.dataIncasso) || invoice.dataIncasso || '-'}`
      : `Da incassare entro ${formatDisplayDate(invoice.scadenzaPagamento) || invoice.scadenzaPagamento || '-'}`;
    const totalLabel = typeof fmt === 'function' ? fmt(invoice.totaleDocument || 0) : `${round2(invoice.totaleDocument || 0).toFixed(2)} €`;
    return `
      <button class="fatture-docs-item" type="button" onclick="openFatturaModal('${esc(invoice.id)}')">
        <div class="fatture-docs-item-main">
          <strong>${esc(invoice.numero || 'Fattura')}</strong>
          <span>${esc(clienteLabel)} · ${esc(dateLabel)}</span>
        </div>
        <div class="fatture-docs-item-meta">
          <span>${totalLabel}</span>
          <span>Apri</span>
        </div>
      </button>
    `;
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
    const statusLabel = draft.incassata
      ? `Incassata il ${formatDisplayDate(draft.dataIncasso) || draft.dataIncasso || '-'}`
      : `Da incassare entro ${formatDisplayDate(draft.scadenzaPagamento) || draft.scadenzaPagamento || '-'}`;
    container.innerHTML = `
      <div class="fattura-summary-grid">
        <div class="fattura-summary-card"><span>Imponibile</span><b>${typeof fmt === 'function' ? fmt(totals.subtotal) : totals.subtotal.toFixed(2)}</b></div>
        <div class="fattura-summary-card"><span>Contributo integrativo</span><b>${typeof fmt === 'function' ? fmt(totals.contributoIntegrativo) : totals.contributoIntegrativo.toFixed(2)}</b></div>
        <div class="fattura-summary-card"><span>Marca da bollo</span><b>${totals.bollo > 0 ? '2,00 €' : '0,00 €'}</b></div>
        <div class="fattura-summary-card fattura-summary-total"><span>Totale fattura</span><b>${typeof fmt === 'function' ? fmt(totals.total) : totals.total.toFixed(2)}</b></div>
      </div>
      <div class="fattura-summary-note">Cliente selezionato: <b>${esc(clienteLabel)}</b>. Stato: <b>${esc(statusLabel)}</b>.</div>
    `;
  }

  function renderFatturaModal() {
    const el = document.getElementById('fatturaModalContent');
    if (!el) return;
    const draft = currentDraft();
    const profile = getProfileFiscalData();
    const clienteOptions = typeof getClientiOptionsHtml === 'function' ? getClientiOptionsHtml(draft.clienteId) : '<option value="">Nessun cliente</option>';
    const rowHtml = (draft.righe || []).map((line, idx) => buildLineRowHtml(line, idx)).join('');
    const scadenza = draft.scadenzaPagamento || addDaysIso(draft.data, 30);
    el.innerHTML = `
      <div class="fattura-sheet">
        <div class="fattura-sheet-header">
          <div class="fattura-sheet-copy">
            <div class="fattura-sheet-kicker">Crea fattura</div>
            <h2 id="fatturaModalTitle">${esc(state.editingId ? 'Modifica fattura' : 'Nuova fattura')}</h2>
            <p>Compila la fattura, genera il PDF e salva lo storico. La riga viene aggiunta anche nel mese corretto della tab Fatture.</p>
          </div>
          <div class="fattura-sheet-actions">
            <button type="button" class="btn-add profile-secondary-btn" onclick="closeFatturaModal()">Chiudi</button>
            ${state.editingId ? `<button type="button" class="btn-add profile-secondary-btn" onclick="deleteFatturaEmessa('${esc(state.editingId)}')">Elimina fattura</button>` : ''}
            <button type="button" class="btn-add profile-secondary-btn" onclick="saveFatturaDraft(false)">Salva</button>
            <button type="button" class="btn-add profile-secondary-btn" onclick="previewFatturaPdf()">Anteprima</button>
            <button type="button" class="btn-add" onclick="downloadFatturaPdf()">Scarica PDF</button>
            <button type="button" class="btn-add profile-secondary-btn" onclick="downloadFatturaXml()">Scarica XML</button>
          </div>
        </div>
        <div id="fatturaModalToast" class="fattura-modal-toast" aria-live="polite"></div>
        <div class="fattura-sdi-note">
          <strong>FatturaPA XML FPR12</strong>
          <span>Il file XML viene generato per il download, ma l'invio al SdI non e automatizzato. Caricalo manualmente sul portale Fatture e Corrispettivi oppure tramite un intermediario accreditato.</span>
        </div>
        <form class="fattura-builder" onsubmit="return false;">
          <div class="fattura-form-grid">
            <label class="fattura-field">
              <span>Numero fattura</span>
              <input id="fatturaNumero" type="text" value="${esc(draft.numero || '')}" oninput="updateFatturaDraftField('numero', this.value, true)">
            </label>
            <label class="fattura-field">
              <span>Data emissione</span>
              <input id="fatturaData" type="date" value="${esc(draft.data || todayIso())}" oninput="updateFatturaDraftField('data', this.value)">
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
              <input id="fatturaScadenza" type="date" value="${esc(scadenza)}" oninput="updateFatturaDraftField('scadenzaPagamento', this.value)">
            </label>
            <label class="fattura-field">
              <span>Fattura gia incassata?</span>
              <div class="fattura-bollo-wrap">
                <label><input type="radio" name="fatturaIncassata" value="0" ${draft.incassata ? '' : 'checked'} onchange="updateFatturaDraftField('incassata', this.value)"> No</label>
                <label><input type="radio" name="fatturaIncassata" value="1" ${draft.incassata ? 'checked' : ''} onchange="updateFatturaDraftField('incassata', this.value)"> Si</label>
              </div>
            </label>
            <label class="fattura-field">
              <span>Data incasso</span>
              <input id="fatturaDataIncasso" type="date" value="${esc(draft.dataIncasso || '')}" oninput="updateFatturaDraftField('dataIncasso', this.value)" ${draft.incassata ? '' : 'disabled'}>
            </label>
            <label class="fattura-field">
              <span>Modalità pagamento</span>
              <input id="fatturaModalitaPagamento" type="text" value="${esc(draft.modalitaPagamento || profile.modalitaPagamento || DEFAULT_BONIFICO)}" oninput="updateFatturaDraftField('modalitaPagamento', this.value)">
            </label>
            <label class="fattura-field">
              <span>IBAN</span>
              <input id="fatturaIban" type="text" value="${esc(draft.iban || profile.iban || '')}" oninput="updateFatturaDraftField('iban', this.value)">
            </label>
            <label class="fattura-field">
              <span>Contributo integrativo (EUR)</span>
              <input id="fatturaContributoIntegrativo" type="number" min="0" step="0.01" value="${esc(draft.contributoIntegrativo || 0)}" oninput="updateFatturaDraftField('contributoIntegrativo', this.value)">
            </label>
            <label class="fattura-field fattura-bollo-field">
              <span>Marca da bollo</span>
              <div class="fattura-bollo-wrap">
                <input id="fatturaMarcaDaBollo" type="checkbox" ${draft.marcaDaBollo ? 'checked' : ''} onchange="this.dataset.userTouched='1'; updateFatturaDraftField('marcaDaBollo', this.checked ? 1 : 0)">
                <span>Applica 2,00 € se il totale supera 77,47 €</span>
              </div>
            </label>
            <label class="fattura-field fattura-field-wide">
              <span>Nota forfettario</span>
              <textarea id="fatturaNota" rows="3" oninput="updateFatturaDraftField('note', this.value)">${esc(draft.note || DEFAULT_FORFETTARIO_NOTE)}</textarea>
            </label>
          </div>
          <div class="fattura-lines-head">
            <div>
              <h3>Righe fattura</h3>
              <p>Puoi aggiungere più righe. La base PDF considera imponibile + contributo integrativo + bollo.</p>
            </div>
            <button type="button" class="btn-add" onclick="addFatturaLine()">+ Riga</button>
          </div>
          <div class="fattura-lines">
            ${rowHtml || '<div class="fattura-empty">Aggiungi almeno una riga per poter generare la fattura.</div>'}
          </div>
          <div id="fatturaSummary" class="fattura-summary"></div>
          <div class="fattura-note">La fattura salvata viene memorizzata in <code>calcoliPIVA_{profile}_fattureEmesse</code> e sincronizzata con il profilo cloud.</div>
        </form>
      </div>
    `;
    syncBolloDefault();
    renderFatturaSummary();
    const clientiSelect = document.getElementById('fatturaCliente');
    if (clientiSelect) clientiSelect.value = draft.clienteId || '';
  }

  function openFatturaModal(invoiceId = null) {
    if (!currentProfile) return;
    if (invoiceId) {
      const existing = getSavedInvoiceById(invoiceId);
      if (!existing) {
        showFatturaToast('Fattura non trovata nello storico', 'warn');
        return;
      }
      state.draft = normalizeFatturaEmessa(existing);
      state.editingId = existing.id;
      state.numberAuto = false;
    } else {
      state.draft = createDefaultDraft();
      state.editingId = null;
      state.numberAuto = true;
    }
    state.open = true;
    renderFatturaModal();
    const modal = document.getElementById('fatturaModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('profile-modal-open');
  }

  function closeFatturaModal() {
    const modal = document.getElementById('fatturaModal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('profile-modal-open');
    state.open = false;
    state.editingId = null;
    state.draft = null;
    state.numberAuto = true;
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
    }
  }

  function updateFatturaDraftField(field, value, manualNumber = false) {
    const draft = currentDraft();
    if (field === 'numero') {
      draft.numero = String(value || '').trim();
      if (manualNumber) state.numberAuto = false;
    } else if (field === 'data') {
      draft.data = String(value || todayIso());
      const parts = parseDateParts(draft.data);
      draft.anno = parts ? parts.year : currentYear;
      draft.issuedYear = draft.anno;
      draft.issuedMonth = parts ? parts.month : (new Date()).getMonth() + 1;
      if (state.numberAuto) {
        draft.numero = `${getNextInvoiceNumberForYear(draft.anno)}/${draft.anno}`;
        const numberEl = document.getElementById('fatturaNumero');
        if (numberEl) numberEl.value = draft.numero;
      }
      draft.scadenzaPagamento = addDaysIso(draft.data, 30);
      const dueEl = document.getElementById('fatturaScadenza');
      if (dueEl) dueEl.value = draft.scadenzaPagamento;
      if (draft.incassata && !draft.dataIncasso) {
        draft.dataIncasso = draft.data;
        const incassoEl = document.getElementById('fatturaDataIncasso');
        if (incassoEl) incassoEl.value = draft.dataIncasso;
      }
    } else if (field === 'clienteId') {
      draft.clienteId = String(value || '');
      const cliente = typeof getClienteById === 'function' ? getClienteById(draft.clienteId) : null;
      draft.clienteSnapshot = cliente ? { ...cliente } : null;
      if (cliente) {
        if (!draft.modalitaPagamento || draft.modalitaPagamento === DEFAULT_BONIFICO) {
          draft.modalitaPagamento = getProfileFiscalData().modalitaPagamento || DEFAULT_BONIFICO;
        }
        if (!draft.iban) draft.iban = getProfileFiscalData().iban || '';
      }
    } else if (field === 'contributoIntegrativo') {
      draft.contributoIntegrativo = round2(value);
    } else if (field === 'marcaDaBollo') {
      draft.marcaDaBollo = !!value;
      draft.bolloAuto = false;
      const checkbox = document.getElementById('fatturaMarcaDaBollo');
      if (checkbox) checkbox.dataset.userTouched = '1';
    } else if (field === 'incassata') {
      draft.incassata = parseInt(value, 10) === 1 || value === true;
      if (draft.incassata && !draft.dataIncasso) draft.dataIncasso = draft.data || todayIso();
      const incassoEl = document.getElementById('fatturaDataIncasso');
      if (incassoEl) {
        incassoEl.disabled = !draft.incassata;
        if (draft.incassata && draft.dataIncasso) incassoEl.value = draft.dataIncasso;
      }
    } else if (field === 'dataIncasso') {
      draft.dataIncasso = String(value || '');
    } else if (field === 'note') {
      draft.note = String(value || '');
    } else if (field === 'modalitaPagamento') {
      draft.modalitaPagamento = String(value || '');
    } else if (field === 'iban') {
      draft.iban = String(value || '');
    } else if (field === 'scadenzaPagamento') {
      draft.scadenzaPagamento = String(value || '');
    }
    renderFatturaSummary();
    syncBolloDefault();
  }

  function updateFatturaLineField(index, field, value) {
    const draft = currentDraft();
    if (!draft.righe || !draft.righe[index]) return;
    const line = draft.righe[index];
    if (field === 'descrizione') line.descrizione = String(value || '');
    else if (field === 'quantita') line.quantita = round2(value) || 0;
    else if (field === 'prezzoUnitario') line.prezzoUnitario = round2(value);
    else if (field === 'iva') line.iva = round2(value);
    renderFatturaSummary();
    syncBolloDefault();
  }

  function addFatturaLine() {
    const draft = currentDraft();
    draft.righe = Array.isArray(draft.righe) ? draft.righe : [];
    draft.righe.push(cloneLine({ descrizione: '', quantita: 1, prezzoUnitario: 0, iva: 0 }));
    renderFatturaModal();
  }

  function removeFatturaLine(index) {
    const draft = currentDraft();
    if (!Array.isArray(draft.righe) || draft.righe.length <= 1) return;
    draft.righe.splice(index, 1);
    renderFatturaModal();
  }

  function upsertHistoryRecord(invoice) {
    const history = loadFattureEmesse();
    const normalized = normalizeFatturaEmessa(invoice);
    const idx = history.findIndex(item => item.id === normalized.id);
    if (idx >= 0) history[idx] = normalized;
    else history.unshift(normalized);
    saveFattureEmesse(history);
    return normalized;
  }

  function deleteFatturaEmessa(invoiceId, options = {}) {
    const id = String(invoiceId || '').trim();
    if (!id) return false;
    const history = loadFattureEmesse();
    const target = history.find(item => String(item.id) === id);
    if (!target) {
      if (!options.silent) showFatturaToast('Fattura non trovata nello storico.', 'warn');
      return false;
    }
    if (!options.skipConfirm) {
      const ok = window.confirm(`Eliminare la fattura ${target.numero || ''}? Questa azione rimuove anche la riga dalla tab Fatture.`);
      if (!ok) return false;
    }
    saveFattureEmesse(history.filter(item => String(item.id) !== id));
    if (!options.skipMonthCleanup) removeInvoiceRowsFromStoredYears(id);
    renderFattureDocsSection();
    if (state.editingId === id) closeFatturaModal();
    if (typeof recalcAll === 'function') recalcAll();
    if (!options.silent) showFatturaToast('Fattura eliminata dallo storico e dalla tab mensile.', 'success');
    return true;
  }

  function removeInvoiceRowsFromStoredYears(invoiceId) {
    const years = typeof getAllStoredYears === 'function' ? getAllStoredYears() : [currentYear];
    for (const year of years) {
      const yearData = getYearDataFor(year);
      if (!yearData || !yearData.fatture) continue;
      let changed = false;
      for (const month of Object.keys(yearData.fatture)) {
        const rows = Array.isArray(yearData.fatture[month]) ? yearData.fatture[month] : [];
        const filtered = rows.filter(row => String(row.invoiceId || row.fatturaId || '') !== String(invoiceId));
        if (filtered.length !== rows.length) {
          yearData.fatture[month] = filtered;
          changed = true;
        }
      }
      if (changed) {
        if (year === currentYear) saveData();
        else saveYearData(year, yearData);
      }
    }
  }

  function upsertInvoiceRowInYearData(invoice) {
    const normalized = normalizeFatturaEmessa(invoice);
    const emissionYear = parseInt(normalized.anno, 10) || currentYear;
    const emissionMonth = parseInt(normalized.issuedMonth, 10) || ((parseDateParts(normalized.data) || {}).month || 1);
    const cashParts = parseDateParts(resolveInvoiceCashDate(normalized));
    const yearData = getYearDataFor(emissionYear) || ensureDataShape({}, emissionYear);
    if (!yearData.fatture) yearData.fatture = {};
    for (let m = 1; m <= 12; m++) {
      const rows = Array.isArray(yearData.fatture[m]) ? yearData.fatture[m] : [];
      const filtered = rows.filter(row => String(row.invoiceId || row.fatturaId || '') !== normalized.id);
      yearData.fatture[m] = filtered;
    }
    const monthRows = Array.isArray(yearData.fatture[emissionMonth]) ? yearData.fatture[emissionMonth] : [];
    monthRows.push({
      invoiceId: normalized.id,
      importo: normalized.totaleDocument,
      pagMese: cashParts ? cashParts.month : emissionMonth,
      pagAnno: cashParts ? cashParts.year : emissionYear,
      desc: `${normalized.numero || 'Fattura'}${normalized.clienteSnapshot && normalized.clienteSnapshot.nome ? ` - ${normalized.clienteSnapshot.nome}` : ''}`,
      dataEmissione: normalized.data,
      scadenzaPagamento: normalized.scadenzaPagamento,
      incassata: normalized.incassata,
      dataIncasso: normalized.dataIncasso || ''
    });
    yearData.fatture[emissionMonth] = monthRows;
    if (emissionYear === currentYear) {
      data.fatture = yearData.fatture;
      saveData();
    } else {
      saveYearData(emissionYear, yearData);
    }
    return normalized;
  }

  function collectDraftFromState() {
    const draft = currentDraft();
    const profile = getProfileFiscalData();
    const cliente = draft.clienteId && typeof getClienteById === 'function' ? getClienteById(draft.clienteId) : null;
    const lines = Array.isArray(draft.righe) ? draft.righe.map(cloneLine).filter(line => line.descrizione || line.prezzoUnitario > 0 || line.quantita > 0) : [];
    const normalized = normalizeFatturaEmessa({
      ...draft,
      numero: String(draft.numero || '').trim(),
      data: String(draft.data || todayIso()),
      clienteId: String(draft.clienteId || ''),
      clienteSnapshot: cliente || draft.clienteSnapshot,
      righe: lines.length ? lines : [cloneLine({ descrizione: '', quantita: 1, prezzoUnitario: 0, iva: 0 })],
      contributoIntegrativo: round2(draft.contributoIntegrativo || 0),
      marcaDaBollo: !!draft.marcaDaBollo,
      incassata: !!draft.incassata,
      dataIncasso: String(draft.dataIncasso || ''),
      note: String(draft.note || DEFAULT_FORFETTARIO_NOTE).trim() || DEFAULT_FORFETTARIO_NOTE,
      modalitaPagamento: String(draft.modalitaPagamento || profile.modalitaPagamento || DEFAULT_BONIFICO),
      iban: String(draft.iban || profile.iban || ''),
      scadenzaPagamento: String(draft.scadenzaPagamento || addDaysIso(draft.data, 30))
    });
    normalized.id = state.editingId || normalized.id;
    normalized.anno = parseDateParts(normalized.data)?.year || currentYear;
    normalized.issuedMonth = parseDateParts(normalized.data)?.month || (new Date().getMonth() + 1);
    normalized.issuedYear = normalized.anno;
    normalized.updatedAt = new Date().toISOString();
    return normalized;
  }

  function showFatturaToast(message, tone = 'success') {
    const toast = document.getElementById('fatturaModalToast');
    if (!toast) {
      alert(message);
      return;
    }
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.add('show');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  function saveFatturaDraft(silent = false) {
    if (!currentProfile) return null;
    const invoice = collectDraftFromState();
    if (!invoice.clienteId) {
      if (!silent) showFatturaToast('Seleziona un cliente prima di salvare.', 'warn');
      return null;
    }
    if (!invoice.numero) {
      if (!silent) showFatturaToast('Inserisci il numero fattura.', 'warn');
      return null;
    }
    if (!invoice.data) {
      if (!silent) showFatturaToast('Inserisci la data di emissione.', 'warn');
      return null;
    }
    const rows = invoice.righe.filter(r => String(r.descrizione || '').trim() || parseMaybeNumber(r.prezzoUnitario) > 0 || parseMaybeNumber(r.quantita) > 0);
    if (rows.length === 0) {
      if (!silent) showFatturaToast('Aggiungi almeno una riga fattura.', 'warn');
      return null;
    }
    invoice.righe = rows;
    const saved = upsertHistoryRecord(invoice);
    removeInvoiceRowsFromStoredYears(saved.id);
    upsertInvoiceRowInYearData(saved);
    state.draft = saved;
    state.editingId = saved.id;
    state.numberAuto = false;
    renderFattureDocsSection();
    if (!silent) showFatturaToast('Fattura salvata nello storico e nella tab mensile.', 'success');
    if (typeof recalcAll === 'function') recalcAll();
    return saved;
  }

  function buildInvoicePdf(invoice) {
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (typeof jsPDFCtor !== 'function') {
      throw new Error('jsPDF non disponibile.');
    }
    const pdf = new jsPDFCtor({ orientation: 'p', unit: 'pt', format: 'a4' });
    pdf.setProperties({
      title: `Fattura ${invoice.numero || ''}`,
      subject: 'Fattura PDF Calcoli P.IVA',
      author: getProfileFiscalData().nome || currentProfile || 'Calcoli P.IVA'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    const bodyWidth = pageWidth - margin * 2;
    const profile = getProfileFiscalData();
    const cliente = invoice.clienteSnapshot || (typeof getClienteById === 'function' ? getClienteById(invoice.clienteId) : null) || {};
    const totals = computeDraftTotals(invoice);
    let y = 48;
    const safeProfileLines = [
      profile.nome || currentProfile || '',
      profile.indirizzo || '',
      `${profile.cap || ''} ${profile.citta || ''} ${profile.provincia || ''}`.trim(),
      `P.IVA ${profile.partitaIva || ''}`,
      profile.codiceFiscale ? `CF ${profile.codiceFiscale}` : '',
      profile.ateco ? `ATECO ${profile.ateco}` : ''
    ].filter(Boolean).map(toPdfSafeText);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(23, 31, 39);
    pdf.text('FATTURA', margin, y);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(74, 85, 104);
    pdf.text(safeProfileLines, pageWidth - margin - 170, 38);

    y += 14;
    pdf.setDrawColor(208, 215, 222);
    pdf.setLineWidth(1);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 18;

    const leftBoxTop = y;
    const rightBoxTop = y;
    const leftBoxWidth = bodyWidth * 0.56;
    const rightBoxX = margin + bodyWidth * 0.58;
    pdf.setFillColor(245, 247, 249);
    pdf.roundedRect(margin, leftBoxTop, leftBoxWidth, 122, 10, 10, 'S');
    pdf.roundedRect(rightBoxX, rightBoxTop, bodyWidth - leftBoxWidth - 12, 122, 10, 10, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Cliente', margin + 12, y + 16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const clienteLines = [
      cliente.nome || 'Cliente non selezionato',
      cliente.partitaIva ? `P.IVA ${cliente.partitaIva}` : '',
      cliente.codiceFiscale ? `CF ${cliente.codiceFiscale}` : '',
      cliente.indirizzo || '',
      `${cliente.cap || ''} ${cliente.citta || ''} ${cliente.provincia || ''}`.trim(),
      cliente.pec ? `PEC ${cliente.pec}` : '',
      cliente.codiceSDI ? `SDI ${cliente.codiceSDI}` : ''
    ].filter(Boolean).map(toPdfSafeText);
    pdf.text(pdf.splitTextToSize(clienteLines.join('\n'), leftBoxWidth - 24), margin + 12, y + 32);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Documento', rightBoxX + 12, y + 16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const docLines = [
      `Numero: ${invoice.numero || ''}`,
      `Data emissione: ${invoice.data || ''}`,
      `Scadenza pagamento: ${invoice.scadenzaPagamento || ''}`,
      `Modalita pagamento: ${invoice.modalitaPagamento || DEFAULT_BONIFICO}`,
      invoice.iban ? `IBAN: ${invoice.iban}` : '',
      invoice.marcaDaBollo ? 'Marca da bollo: SI' : 'Marca da bollo: NO'
    ].filter(Boolean).map(toPdfSafeText);
    pdf.text(pdf.splitTextToSize(docLines.join('\n'), bodyWidth - leftBoxWidth - 24), rightBoxX + 12, y + 32);

    y += 142;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Righe fattura', margin, y);
    y += 8;

    const tableX = margin;
    const tableW = bodyWidth;
    const cols = {
      desc: tableX + 8,
      qty: tableX + tableW * 0.56,
      unit: tableX + tableW * 0.67,
      iva: tableX + tableW * 0.79,
      total: tableX + tableW * 0.89
    };
    const headerY = y + 10;
    pdf.setFillColor(234, 238, 241);
    pdf.roundedRect(tableX, headerY - 12, tableW, 24, 8, 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(55, 65, 81);
    pdf.text('Descrizione', cols.desc, headerY);
    pdf.text('Q.tà', cols.qty, headerY, { align: 'right' });
    pdf.text('Prezzo unit.', cols.unit, headerY, { align: 'right' });
    pdf.text('IVA %', cols.iva, headerY, { align: 'right' });
    pdf.text('Totale', cols.total, headerY, { align: 'right' });
    y = headerY + 10;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(23, 31, 39);
    invoice.righe.forEach((line, index) => {
      const lineTotal = round2(parseMaybeNumber(line.quantita) * parseMaybeNumber(line.prezzoUnitario));
      const wrapped = pdf.splitTextToSize(toPdfSafeText(line.descrizione || `Riga ${index + 1}`), tableW * 0.50);
      const rowHeight = Math.max(18, wrapped.length * 10 + 6);
      if (y + rowHeight > pageHeight - 140) {
        pdf.addPage();
        y = 50;
      }
      if (index % 2 === 1) {
        pdf.setFillColor(250, 251, 252);
        pdf.rect(tableX, y - 8, tableW, rowHeight, 'F');
      }
      pdf.text(wrapped, cols.desc, y);
      pdf.text(String(parseMaybeNumber(line.quantita) || 1), cols.qty, y, { align: 'right' });
      pdf.text(formatPdfMoney(parseMaybeNumber(line.prezzoUnitario)), cols.unit, y, { align: 'right' });
      pdf.text(`${round2(line.iva || 0).toFixed(2)}%`, cols.iva, y, { align: 'right' });
      pdf.text(formatPdfMoney(lineTotal), cols.total, y, { align: 'right' });
      y += rowHeight;
      pdf.setDrawColor(226, 232, 240);
      pdf.line(tableX, y - 4, tableX + tableW, y - 4);
    });

    y += 10;
    const summaryX = pageWidth - margin - 210;
    const summaryH = 96;
    pdf.setFillColor(246, 248, 250);
    pdf.roundedRect(summaryX, y, 210, summaryH, 10, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(55, 65, 81);
    pdf.text('Riepilogo', summaryX + 12, y + 18);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const summaryLines = [
      ['Imponibile', totals.subtotal],
      ['Contributo integrativo', totals.contributoIntegrativo],
      ['Marca da bollo', totals.bollo],
      ['Totale fattura', totals.total]
    ];
    let sy = y + 34;
    summaryLines.forEach(([label, amount], index) => {
      const strong = index === summaryLines.length - 1;
      if (strong) pdf.setFont('helvetica', 'bold');
      pdf.text(toPdfSafeText(label), summaryX + 12, sy);
      pdf.text(formatPdfMoney(amount), summaryX + 198, sy, { align: 'right' });
      if (strong) pdf.setFont('helvetica', 'normal');
      sy += 16;
    });

    y += summaryH + 22;
    const noteText = [
      invoice.note || DEFAULT_FORFETTARIO_NOTE,
      'Fattura generata dall\'app Calcoli P.IVA.',
      'Per il caricamento su Fatture e Corrispettivi / SdI serve un intermediario o il portale ministeriale.'
    ].map(toPdfSafeText).join(' ');
    const wrappedNote = pdf.splitTextToSize(noteText, bodyWidth);
    if (y + wrappedNote.length * 11 > pageHeight - 80) {
      pdf.addPage();
      y = 50;
    }
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.5);
    pdf.setTextColor(74, 85, 104);
    pdf.text(wrappedNote, margin, y);

    return pdf;
  }

  function buildInvoicePdfModern(invoice) {
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (typeof jsPDFCtor !== 'function') throw new Error('jsPDF non disponibile.');

    const pdf = new jsPDFCtor({ orientation: 'p', unit: 'pt', format: 'a4' });
    const profile = getProfileFiscalData();
    const cliente = invoice.clienteSnapshot || (typeof getClienteById === 'function' ? getClienteById(invoice.clienteId) : null) || {};
    const totals = computeDraftTotals(invoice);
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const ML = 48, MR = 48;
    const cW = W - ML - MR;

    // palette (static for PDF — no CSS vars in print context)
    const INK    = [18, 26, 36];
    const MUTED  = [96, 112, 128];
    const BORDER = [210, 218, 226];
    const SOFT   = [245, 248, 251];
    const ACCENT = [60, 143, 145];    // teal primary
    const ACCENT_LIGHT = [232, 244, 244];
    const WHITE  = [255, 255, 255];

    const safe  = v => toPdfSafeText(v);
    const money = v => formatPdfMoney(v);
    const lineItems = Array.isArray(invoice.righe) && invoice.righe.length
      ? invoice.righe
      : [{ descrizione: 'Prestazione professionale', quantita: 1, prezzoUnitario: totals.subtotal }];

    let y = 0;

    function newPage() { pdf.addPage(); y = 48; }
    function ensureSpace(h) { if (y + h > H - 48) newPage(); }

    function partyLines(entity, primaryFallback) {
      const out = [];
      const name = entity.nome || primaryFallback || '';
      if (name) out.push(name);
      if (entity.indirizzo) out.push(entity.indirizzo);
      const loc = [entity.cap, entity.citta, entity.provincia].filter(Boolean).join(' ');
      if (loc) out.push(loc);
      if (entity.partitaIva) out.push(`P.IVA ${entity.partitaIva}`);
      if (entity.codiceFiscale) out.push(`C.F. ${entity.codiceFiscale}`);
      return out.map(safe);
    }

    function drawTextBlock(lines, x, startY, maxW, size = 9, style = 'normal', color = INK, lineH = 13) {
      pdf.setFont('helvetica', style);
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      let cy = startY;
      lines.forEach(line => {
        const wrapped = pdf.splitTextToSize(safe(line), maxW);
        wrapped.forEach(wl => { pdf.text(wl, x, cy); cy += lineH; });
      });
      return cy;
    }

    function label(text, x, ly) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...MUTED);
      pdf.text(text.toUpperCase(), x, ly);
    }

    pdf.setProperties({
      title: safe(`Fattura ${invoice.numero || ''}`),
      author: safe(profile.nome || currentProfile || 'Calcoli P.IVA')
    });

    // ── HEADER BAND ──────────────────────────────────────────────────────────
    const BAND_H = 72;
    pdf.setFillColor(...ACCENT);
    pdf.rect(0, 0, W, BAND_H, 'F');

    // "FATTURA" title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor(...WHITE);
    pdf.text('FATTURA', ML, 44);

    // Invoice number badge (white pill on right)
    const numText = safe(invoice.numero ? `N. ${invoice.numero}` : 'Bozza');
    pdf.setFontSize(13);
    const numW = pdf.getTextWidth(numText) + 28;
    const numX = W - MR - numW;
    pdf.setFillColor(...WHITE);
    pdf.roundedRect(numX, 18, numW, 28, 6, 6, 'F');
    pdf.setTextColor(...ACCENT);
    pdf.text(numText, numX + 14, 36);

    y = BAND_H + 20;

    // ── ISSUER / CLIENT BLOCK ─────────────────────────────────────────────
    const COL_W = (cW - 20) / 2;

    // Issuer (left)
    label('Cedente / Prestatore', ML, y);
    y += 8;
    const issuerLines = partyLines(profile, currentProfile || 'Emittente');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...INK);
    pdf.text(issuerLines[0] || '', ML, y + 3);
    let iy = y + 16;
    if (issuerLines.length > 1) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...MUTED);
      issuerLines.slice(1).forEach(l => { pdf.text(l, ML, iy); iy += 12; });
    }

    // Client (right)
    const CX = ML + COL_W + 20;
    label('Fatturato a', CX, y - 8);
    // client card
    const clientLinesParsed = partyLines(cliente, 'Cliente non selezionato');
    const clientH = Math.max(50, clientLinesParsed.length * 13 + 24);
    pdf.setFillColor(...SOFT);
    pdf.setDrawColor(...BORDER);
    pdf.roundedRect(CX, y, COL_W, clientH, 6, 6, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...INK);
    pdf.text(clientLinesParsed[0] || '', CX + 14, y + 17);
    if (clientLinesParsed.length > 1) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...MUTED);
      let cy2 = y + 30;
      clientLinesParsed.slice(1).forEach(l => { pdf.text(l, CX + 14, cy2); cy2 += 12; });
    }

    y += Math.max(iy - y + 10, clientH + 10);

    // ── META BAR ─────────────────────────────────────────────────────────────
    y += 8;
    const metaCols = [
      ['Data emissione', safe(formatDisplayDate(invoice.data) || invoice.data || '-')],
      ['Scadenza', safe(formatDisplayDate(invoice.scadenzaPagamento) || invoice.scadenzaPagamento || '-')],
      ['Modalità pagamento', safe(invoice.modalitaPagamento || DEFAULT_BONIFICO)],
      ...(invoice.iban ? [['IBAN', safe(invoice.iban)]] : [])
    ];
    const META_H = 50;
    pdf.setFillColor(...SOFT);
    pdf.roundedRect(ML, y, cW, META_H, 6, 6, 'F');
    const colW2 = cW / metaCols.length;
    metaCols.forEach(([lbl, val], i) => {
      const mx = ML + 14 + i * colW2;
      label(lbl, mx, y + 14);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...INK);
      const wrapped = pdf.splitTextToSize(val, colW2 - 20);
      pdf.text(wrapped[0] || val, mx, y + 30);
    });
    y += META_H + 22;

    // ── LINE ITEMS TABLE ──────────────────────────────────────────────────────
    const COL_DESC_W = cW - 200;
    const COL_QTY_X  = ML + COL_DESC_W + 10;
    const COL_UNIT_X = ML + COL_DESC_W + 90;
    const COL_TOT_X  = ML + cW;
    const TH = 26;

    pdf.setFillColor(...ACCENT);
    pdf.roundedRect(ML, y, cW, TH, 4, 4, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...WHITE);
    pdf.text('Descrizione', ML + 12, y + 17);
    pdf.text('Q.tà',   COL_QTY_X + 30,  y + 17, { align: 'right' });
    pdf.text('Unitario', COL_UNIT_X,     y + 17, { align: 'right' });
    pdf.text('Totale',   COL_TOT_X - 12, y + 17, { align: 'right' });
    y += TH;

    pdf.setDrawColor(...BORDER);
    lineItems.forEach((line, idx) => {
      const desc = pdf.splitTextToSize(safe(line.descrizione || `Prestazione ${idx + 1}`), COL_DESC_W - 22);
      const ROW_H = Math.max(26, desc.length * 12 + 10);
      ensureSpace(ROW_H + 60);
      if (idx % 2 === 0) {
        pdf.setFillColor(...SOFT);
        pdf.rect(ML, y, cW, ROW_H, 'F');
      }
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...INK);
      pdf.text(desc, ML + 12, y + 14);
      const qty = String(parseMaybeNumber(line.quantita) || 1);
      pdf.text(qty, COL_QTY_X + 30, y + 14, { align: 'right' });
      pdf.text(money(parseMaybeNumber(line.prezzoUnitario)), COL_UNIT_X, y + 14, { align: 'right' });
      pdf.text(money(parseMaybeNumber(line.quantita) * parseMaybeNumber(line.prezzoUnitario)), COL_TOT_X - 12, y + 14, { align: 'right' });
      pdf.setDrawColor(...BORDER);
      pdf.line(ML, y + ROW_H, ML + cW, y + ROW_H);
      y += ROW_H;
    });
    y += 16;

    // ── TOTALS ────────────────────────────────────────────────────────────────
    const summaryRows = [['Imponibile', totals.subtotal]];
    if (round2(totals.contributoIntegrativo) > 0) summaryRows.push(['Contributo integrativo', totals.contributoIntegrativo]);
    if (round2(totals.bollo) > 0) summaryRows.push(['Marca da bollo (virtuale)', totals.bollo]);
    summaryRows.push(['Totale documento', totals.total]);

    const SUM_W = 240;
    const SUM_ROW_H = 22;
    const SUM_H = (summaryRows.length - 1) * SUM_ROW_H + 36;
    ensureSpace(SUM_H + 60);
    const SX = ML + cW - SUM_W;

    pdf.setDrawColor(...BORDER);
    pdf.setFillColor(...WHITE);
    pdf.roundedRect(SX, y, SUM_W, SUM_H, 6, 6, 'FD');

    let sy = y + 16;
    summaryRows.forEach(([lbl, amt], i) => {
      const isTotal = i === summaryRows.length - 1;
      if (isTotal) {
        pdf.setFillColor(...ACCENT_LIGHT);
        pdf.rect(SX, sy - 13, SUM_W, SUM_ROW_H + 6, 'F');
        pdf.setDrawColor(...ACCENT);
        pdf.setLineWidth(0.5);
        pdf.line(SX, sy - 13, SX + SUM_W, sy - 13);
        pdf.setLineWidth(0.3);
      }
      pdf.setFont('helvetica', isTotal ? 'bold' : 'normal');
      pdf.setFontSize(isTotal ? 10 : 9);
      pdf.setTextColor(isTotal ? ACCENT[0] : INK[0], isTotal ? ACCENT[1] : INK[1], isTotal ? ACCENT[2] : INK[2]);
      pdf.text(safe(lbl), SX + 16, sy);
      pdf.setFont('helvetica', 'bold');
      pdf.text(money(amt), SX + SUM_W - 16, sy, { align: 'right' });
      sy += SUM_ROW_H;
    });
    y += SUM_H + 24;

    // ── FOOTER: PAYMENT + NOTE ────────────────────────────────────────────────
    const noteText = safe(invoice.note || DEFAULT_FORFETTARIO_NOTE);
    const payLines = [
      invoice.modalitaPagamento || DEFAULT_BONIFICO,
      invoice.iban ? `IBAN: ${invoice.iban}` : null,
      `Scadenza: ${safe(formatDisplayDate(invoice.scadenzaPagamento) || invoice.scadenzaPagamento || '-')}`
    ].filter(Boolean).map(safe);

    const PAY_W = cW * 0.42;
    const NOTE_W = cW - PAY_W - 16;
    const noteWrapped = pdf.splitTextToSize(noteText, NOTE_W - 28);
    const BOX_H = Math.max(70, Math.max(payLines.length, noteWrapped.length) * 13 + 36);
    ensureSpace(BOX_H + 20);

    pdf.setDrawColor(...BORDER);
    pdf.setFillColor(...SOFT);
    pdf.roundedRect(ML, y, PAY_W, BOX_H, 6, 6, 'FD');
    pdf.roundedRect(ML + PAY_W + 16, y, NOTE_W, BOX_H, 6, 6, 'FD');

    label('Dati pagamento', ML + 14, y + 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...INK);
    payLines.forEach((l, i) => pdf.text(l, ML + 14, y + 28 + i * 13));

    label('Note e riferimento normativo', ML + PAY_W + 30, y + 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...MUTED);
    pdf.text(noteWrapped, ML + PAY_W + 30, y + 28);

    return pdf;
  }

  async function downloadFatturaPdf() {
    const saved = saveFatturaDraft(false);
    if (!saved) return;
    try {
      await ensureJsPdfAvailable();
      const pdf = buildInvoicePdfModern(saved);
      const fileName = `fattura_${sanitizeDownloadFileName(saved.numero, 'documento')}.pdf`;
      pdf.save(fileName);
      showFatturaToast('PDF scaricato e fattura salvata nello storico.', 'success');
    } catch (err) {
      console.error(err);
      const reason = err && err.message ? `: ${String(err.message).slice(0, 120)}` : '.';
      showFatturaToast(`Errore nella generazione del PDF${reason}`, 'error');
    }
  }

  function downloadFatturaXml() {
    const candidate = collectDraftFromState();
    const validation = validateFatturaForXml(candidate);
    if (validation.errors.length > 0) {
      showFatturaToast(validation.errors[0], 'error');
      return;
    }
    if (validation.warnings.length > 0) {
      console.warn('Fattura XML warning:', validation.warnings.join(' | '));
    }
    const saved = saveFatturaDraft(true);
    if (!saved) return;
    try {
      const xml = buildFatturaElettronicaXml(saved);
      const fileName = getInvoiceXmlFileName(saved);
      downloadTextFile(fileName, xml, 'application/xml;charset=utf-8');
      showSdiUploadGuide(fileName);
    } catch (err) {
      console.error(err);
      showFatturaToast('Errore nella generazione dell XML.', 'error');
    }
  }

  function showSdiUploadGuide(fileName) {
    const modalContent = document.getElementById('fatturaModalContent');
    if (!modalContent) return;
    const guide = document.createElement('div');
    guide.className = 'sdi-upload-guide';
    guide.innerHTML = `
      <div class="sdi-guide-header">
        <div class="sdi-guide-icon">&#10003;</div>
        <div>
          <div class="sdi-guide-title">File XML scaricato</div>
          <div class="sdi-guide-subtitle">${fileName}</div>
        </div>
      </div>
      <div class="sdi-guide-body">
        <div class="sdi-guide-label">Ora invia la fattura al Sistema di Interscambio (SdI)</div>
        <ol class="sdi-guide-steps">
          <li>
            <span class="sdi-step-num">1</span>
            <div>
              <strong>Accedi al portale Fatture e Corrispettivi</strong>
              <div class="sdi-step-sub">Usa SPID, CIE o credenziali Fisconline/Entratel</div>
            </div>
          </li>
          <li>
            <span class="sdi-step-num">2</span>
            <div>
              <strong>Vai su "Fatture elettroniche" → "Trasmissione"</strong>
              <div class="sdi-step-sub">Sezione per il caricamento manuale dei file XML</div>
            </div>
          </li>
          <li>
            <span class="sdi-step-num">3</span>
            <div>
              <strong>Carica il file <code>${fileName}</code></strong>
              <div class="sdi-step-sub">Clicca "Scegli file", seleziona il file scaricato e conferma l'invio</div>
            </div>
          </li>
          <li>
            <span class="sdi-step-num">4</span>
            <div>
              <strong>Attendi la ricevuta di consegna</strong>
              <div class="sdi-step-sub">SdI risponde entro pochi minuti fino a 5 giorni. Controlla la tua email o il portale per l'esito.</div>
            </div>
          </li>
        </ol>
        <div class="sdi-guide-alt">
          <strong>In alternativa via PEC:</strong> allega il file XML a una PEC e invialo a <code>sdi01@pec.fatturapa.it</code>
        </div>
        <div class="sdi-guide-actions">
          <a href="https://ivaservizi.agenziaentrate.gov.it/portale/web/guest/home-page/fatture-e-corrispettivi" target="_blank" rel="noopener" class="btn-add sdi-portal-btn">Apri portale AdE</a>
          <button type="button" class="profile-secondary-btn" onclick="this.closest('.sdi-upload-guide').remove(); document.getElementById('fatturaModal').setAttribute('aria-hidden','true');">Chiudi</button>
        </div>
      </div>
    `;
    // Replace modal content with guide
    modalContent.innerHTML = '';
    modalContent.appendChild(guide);
    const modal = document.getElementById('fatturaModal');
    if (modal) modal.setAttribute('aria-hidden', 'false');
  }

  async function previewFatturaPdf() {
    const saved = saveFatturaDraft(false);
    if (!saved) return;
    try {
      await ensureJsPdfAvailable();
      const pdf = buildInvoicePdfModern(saved);
      const blob = pdf.output('blob');
      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }
      state.previewUrl = URL.createObjectURL(blob);
      const win = window.open(state.previewUrl, '_blank', 'noopener,noreferrer');
      if (!win) {
        showFatturaToast('Popup bloccato dal browser.', 'warn');
        return;
      }
      showFatturaToast('Anteprima PDF aperta in una nuova scheda.', 'success');
    } catch (err) {
      console.error(err);
      const reason = err && err.message ? `: ${String(err.message).slice(0, 120)}` : '.';
      showFatturaToast(`Errore nella generazione dell anteprima${reason}`, 'error');
    }
  }

  window.openFatturaModal = openFatturaModal;
  window.closeFatturaModal = closeFatturaModal;
  window.renderFattureDocsSection = renderFattureDocsSection;
  window.updateFatturaDraftField = updateFatturaDraftField;
  window.updateFatturaLineField = updateFatturaLineField;
  window.addFatturaLine = addFatturaLine;
  window.removeFatturaLine = removeFatturaLine;
  window.saveFatturaDraft = saveFatturaDraft;
  window.deleteFatturaEmessa = deleteFatturaEmessa;
  window.previewFatturaPdf = previewFatturaPdf;
  window.downloadFatturaPdf = downloadFatturaPdf;
  window.downloadFatturaXml = downloadFatturaXml;

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('fatturaModal');
    if (modal && modal.classList.contains('open')) closeFatturaModal();
  });

  if (currentProfile && document.getElementById('fattureDocsContent')) {
    renderFattureDocsSection();
  }
})();
