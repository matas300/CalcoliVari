(function initOcrPagamentiFeature() {
  if (window.__ocrPagamentiFeatureLoaded) return;
  window.__ocrPagamentiFeatureLoaded = true;

  const OCR_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  const OCR_LANG = 'ita+eng';

  const state = {
    open: false,
    processing: false,
    error: '',
    status: '',
    progress: 0,
    fileName: '',
    fileType: '',
    rawText: '',
    extractionMode: '',
    extractionNote: '',
    statusTone: 'info',
    runId: 0,
    parsed: createDefaultParsedState()
  };

  function createDefaultParsedState() {
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return {
      paymentDate: isoToday,
      paymentYear: today.getFullYear(),
      amount: '',
      tipo: 'tasse',
      descrizione: 'Pagamento importato da OCR',
      note: '',
      kind: 'generico',
      confidence: '0',
      codiceTributo: '',
      sezione: '',
      iban: ''
    };
  }

  function escapeText(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value == null ? '' : String(value));
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isPdfFile(file) {
    if (!file) return false;
    return /pdf$/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
  }

  function isImageFile(file) {
    if (!file) return false;
    return /^image\//i.test(file.type || '') || /\.(png|jpe?g|webp|gif)$/i.test(file.name || '');
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizeForMatch(value) {
    return normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  function parseEuroValue(raw) {
    if (!raw) return null;
    let clean = String(raw).trim();
    clean = clean.replace(/[€EUR\s]/gi, '');
    if (!clean) return null;
    if (clean.includes(',') && clean.includes('.')) {
      if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
        clean = clean.replace(/,/g, '');
      }
    } else if (clean.includes(',')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : null;
  }

  function fmtAmount(value) {
    if (typeof fmt === 'function') return fmt(value);
    const num = Number(value || 0);
    return num.toFixed(2);
  }

  function fmtDateIso(dateValue) {
    if (!dateValue) return '';
    const parsed = parseIsoDate(dateValue);
    if (!parsed) return '';
    return `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
  }

  function getProgressText() {
    if (!state.processing) return state.error ? state.error : state.status;
    const pct = Math.max(0, Math.min(100, Math.round(state.progress || 0)));
    const phase = state.status || 'Elaborazione OCR in corso...';
    return `${phase} ${pct > 0 ? `(${pct}%)` : ''}`.trim();
  }

  function setStatus(message, tone = '') {
    state.status = message || '';
    state.statusTone = tone;
    syncProgressUi();
  }

  function syncProgressUi() {
    const statusEl = document.getElementById('ocrStatusText');
    if (statusEl) {
      statusEl.textContent = getProgressText();
      statusEl.dataset.tone = state.error ? 'error' : (state.processing ? 'info' : (state.statusTone || ''));
    }
    const bar = document.getElementById('ocrProgressBarFill');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, state.progress || 0))}%`;
    const spinner = document.getElementById('ocrSpinner');
    if (spinner) spinner.classList.toggle('is-visible', !!state.processing);
    const preview = document.getElementById('ocrRawTextPreview');
    if (preview) preview.value = state.rawText || '';
    const fileMeta = document.getElementById('ocrFileMeta');
    if (fileMeta) fileMeta.textContent = state.fileName ? `${state.fileName}${state.fileType ? ` • ${state.fileType}` : ''}` : 'Nessun file caricato';
  }

  function resetParsedState() {
    state.error = '';
    state.status = 'Carica un file immagine o un PDF. Le immagini vengono lette con OCR; per i PDF proviamo prima a leggere il testo, poi la prima pagina come immagine.';
    state.statusTone = 'info';
    state.progress = 0;
    state.fileName = '';
    state.fileType = '';
    state.rawText = '';
    state.extractionMode = '';
    state.extractionNote = '';
    state.parsed = createDefaultParsedState();
  }

  function openOcrPagamentoModal() {
    if (!currentProfile) return;
    state.open = true;
    state.processing = false;
    state.runId += 1;
    resetParsedState();
    renderOcrPagamentoModal();
    const modal = document.getElementById('ocrPagamentoModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('profile-modal-open');
    syncProgressUi();
    const input = document.getElementById('ocrFileInput');
    if (input) setTimeout(() => input.focus(), 0);
  }

  function closeOcrPagamentoModal() {
    const modal = document.getElementById('ocrPagamentoModal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('profile-modal-open');
    state.open = false;
    state.processing = false;
    state.runId += 1;
  }

  function renderOcrPagamentoModal() {
    const target = document.getElementById('ocrPagamentoModalContent');
    if (!target) return;

    const previewText = escapeText(state.rawText || 'Nessun testo estratto ancora.');
    const parsed = state.parsed || createDefaultParsedState();
    const amountValue = parsed.amount !== '' && parsed.amount != null ? parsed.amount : '';
    const paymentYearValue = parsed.paymentYear || currentYear;
    const confidenceValue = parsed.confidence ? `${parsed.confidence}` : '0';
    const kindLabel = {
      f24: 'F24',
      bonifico: 'Bonifico',
      bollettino: 'Bollettino',
      generico: 'Generico'
    }[parsed.kind] || 'Generico';
    const kindTone = parsed.kind === 'f24' ? 'positive' : (parsed.kind === 'bonifico' ? 'info' : (parsed.kind === 'bollettino' ? 'warn' : 'muted'));
    const canSave = !state.processing && parseEuroValue(amountValue) > 0;

    target.innerHTML = `
      <div class="ocr-modal-shell">
        <div class="ocr-modal-header">
          <div class="ocr-modal-copy">
            <div class="profile-sheet-kicker">Pagamenti</div>
            <h2 id="ocrPagamentoModalTitle">Importa da foto/PDF</h2>
            <p>Carica un F24, un bonifico o un bollettino. L'app prova a estrarre data, importo e tipo pagamento; poi puoi correggere tutto prima di salvare.</p>
          </div>
          <button class="profile-close-btn" type="button" data-action="close" aria-label="Chiudi import OCR">&times;</button>
        </div>

        <div class="ocr-status-row">
          <div class="ocr-status-chip ${kindTone}">${kindLabel}</div>
          <div class="ocr-status-chip">${parsed.tipo === 'contributi' ? 'Contributi' : (parsed.tipo === 'tasse' ? 'Tasse' : 'Altro')}</div>
          <div class="ocr-status-chip">Affidabilita ${confidenceValue}%</div>
          <div class="ocr-status-chip">${paymentYearValue || currentYear}</div>
        </div>

        <div class="ocr-modal-grid">
          <section class="ocr-card">
            <h3>1. Carica file</h3>
            <p class="ocr-help">Supportati JPG, PNG, WEBP e PDF. Se il PDF non e leggibile in modo affidabile, viene mostrato un messaggio chiaro e puoi riprovare con un'immagine.</p>
            <div class="ocr-dropzone" id="ocrDropzone">
              <input id="ocrFileInput" class="ocr-file-input" type="file" accept="image/*,application/pdf" data-action="file">
              <div class="ocr-dropzone-icon">⇪</div>
              <div class="ocr-dropzone-copy">
                <strong>Trascina qui il file oppure scegli un allegato</strong>
                <span>Il browser elabora tutto in locale. Nessun file viene inviato a servizi esterni.</span>
              </div>
              <div class="ocr-dropzone-actions">
                <button type="button" class="btn-ghost" data-action="choose-file">Scegli file</button>
                <button type="button" class="btn-ghost" data-action="reset">Svuota</button>
              </div>
            </div>

            <div class="ocr-meta">
              <div><span>File</span><b id="ocrFileMeta">${escapeText(state.fileName ? `${state.fileName}${state.fileType ? ` • ${state.fileType}` : ''}` : 'Nessun file caricato')}</b></div>
              <div><span>Stato</span><b id="ocrStatusText">${escapeText(getProgressText())}</b></div>
            </div>
            <div id="ocrSpinner" class="ocr-spinner ${state.processing ? 'is-visible' : ''}" aria-hidden="${state.processing ? 'false' : 'true'}">
              <span class="ocr-spinner-dot"></span>
              <span>Elaborazione OCR in corso...</span>
            </div>
            <div class="ocr-progress">
              <div id="ocrProgressBarFill" class="ocr-progress-fill" style="width:${Math.max(0, Math.min(100, state.progress || 0))}%"></div>
            </div>
            ${state.error ? `<div class="ocr-alert error">${escapeText(state.error)}</div>` : ''}
            ${state.extractionNote ? `<div class="ocr-alert info">${escapeText(state.extractionNote)}</div>` : ''}
          </section>

          <section class="ocr-card">
            <h3>2. Dati estratti</h3>
            <div class="ocr-form-grid">
              <label class="ocr-field">
                <span>Data pagamento</span>
                <input type="date" data-ocr-field="paymentDate" value="${escapeText(fmtDateIso(parsed.paymentDate || ''))}">
              </label>
              <label class="ocr-field">
                <span>Anno registrazione</span>
                <input type="number" data-ocr-field="paymentYear" min="2000" max="2100" step="1" value="${escapeText(paymentYearValue)}">
              </label>
              <label class="ocr-field ocr-field-wide">
                <span>Importo</span>
                <input type="number" data-ocr-field="amount" min="0" step="0.01" inputmode="decimal" value="${escapeText(amountValue)}" placeholder="0,00">
              </label>
              <label class="ocr-field">
                <span>Tipo pagamento</span>
                <select data-ocr-field="tipo">
                  ${Object.entries(PAYMENT_TYPES).map(([key, info]) => `<option value="${key}" ${parsed.tipo === key ? 'selected' : ''}>${escapeText(info.label)}</option>`).join('')}
                </select>
              </label>
              <label class="ocr-field">
                <span>Fonte riconosciuta</span>
                <select data-ocr-field="kind">
                  <option value="generico" ${parsed.kind === 'generico' ? 'selected' : ''}>Generico</option>
                  <option value="f24" ${parsed.kind === 'f24' ? 'selected' : ''}>F24</option>
                  <option value="bonifico" ${parsed.kind === 'bonifico' ? 'selected' : ''}>Bonifico</option>
                  <option value="bollettino" ${parsed.kind === 'bollettino' ? 'selected' : ''}>Bollettino</option>
                </select>
              </label>
              <label class="ocr-field ocr-field-wide">
                <span>Descrizione</span>
                <input type="text" data-ocr-field="descrizione" value="${escapeText(parsed.descrizione || '')}" placeholder="es. F24 giugno, saldo INPS...">
              </label>
              <label class="ocr-field ocr-field-wide">
                <span>Note / dettagli OCR</span>
                <textarea data-ocr-field="note" rows="3" placeholder="Causale, codice tributo, sezione, altri dettagli...">${escapeText(parsed.note || '')}</textarea>
              </label>
            </div>
            <div class="ocr-preview-block">
              <div class="ocr-preview-head">
                <h4>Anteprima testo estratto</h4>
                <span>${escapeText(state.extractionMode || 'In attesa di file')}</span>
              </div>
              <textarea id="ocrRawTextPreview" class="ocr-preview-text" readonly>${previewText}</textarea>
            </div>
          </section>
        </div>

        <div class="ocr-footer">
          <div class="ocr-footer-note">
            Le informazioni estratte vanno sempre controllate prima di salvare. Se il PDF non viene letto bene, riprova con una scansione piu nitida o con un'immagine della prima pagina.
          </div>
          <div class="ocr-footer-actions">
            <button type="button" class="btn-ghost" data-action="close">Annulla</button>
            <button type="button" class="btn-add" data-action="save" ${canSave ? '' : 'disabled'}>Usa questi dati</button>
          </div>
        </div>
      </div>
    `;

    bindOcrDelegates();
    syncProgressUi();
  }

  function bindOcrDelegates() {
    const root = document.getElementById('ocrPagamentoModalContent');
    if (!root || root.dataset.ocrBound === '1') return;
    root.dataset.ocrBound = '1';

    root.addEventListener('click', evt => {
      const dropzone = evt.target.closest('#ocrDropzone');
      if (dropzone && !evt.target.closest('[data-action]')) {
        const input = document.getElementById('ocrFileInput');
        if (input) input.click();
        return;
      }
      const actionBtn = evt.target.closest('[data-action]');
      if (!actionBtn) return;
      const action = actionBtn.getAttribute('data-action');
      if (action === 'close') {
        closeOcrPagamentoModal();
        return;
      }
      if (action === 'choose-file') {
        const input = document.getElementById('ocrFileInput');
        if (input) input.click();
        return;
      }
      if (action === 'reset') {
        resetParsedState();
        renderOcrPagamentoModal();
        return;
      }
      if (action === 'save') {
        confirmOcrPagamento();
      }
      return;
    });

    root.addEventListener('change', evt => {
      if (evt.target && evt.target.id === 'ocrFileInput') {
        const file = evt.target.files && evt.target.files[0];
        if (file) handleSelectedFile(file);
        return;
      }
      const field = evt.target.closest('[data-ocr-field]');
      if (!field) return;
      updateFieldFromInput(field);
    });

    root.addEventListener('input', evt => {
      const field = evt.target.closest('[data-ocr-field]');
      if (!field) return;
      updateFieldFromInput(field, true);
    });

    root.addEventListener('dragover', evt => {
      const dz = evt.target.closest('#ocrDropzone');
      if (!dz) return;
      evt.preventDefault();
      dz.classList.add('is-dragover');
    });

    root.addEventListener('dragleave', evt => {
      const dz = evt.target.closest('#ocrDropzone');
      if (!dz) return;
      dz.classList.remove('is-dragover');
    });

    root.addEventListener('drop', evt => {
      const dz = evt.target.closest('#ocrDropzone');
      if (!dz) return;
      evt.preventDefault();
      dz.classList.remove('is-dragover');
      const file = evt.dataTransfer && evt.dataTransfer.files ? evt.dataTransfer.files[0] : null;
      if (file) handleSelectedFile(file);
    });
  }

  function updateFieldFromInput(input, silent = false) {
    if (!input || !input.dataset) return;
    const field = input.dataset.ocrField;
    if (!field) return;

    if (field === 'amount') {
      const parsed = parseEuroValue(input.value);
      state.parsed.amount = parsed === null ? '' : ceil2(parsed);
    } else if (field === 'paymentYear') {
      const y = parseInt(input.value, 10);
      state.parsed.paymentYear = Number.isFinite(y) ? y : currentYear;
    } else if (field === 'paymentDate') {
      state.parsed.paymentDate = input.value || '';
      const parsedDate = parseIsoDate(input.value);
      if (parsedDate && !silent && (!state.parsed.paymentYear || state.parsed.paymentYear === currentYear)) {
        state.parsed.paymentYear = parsedDate.year;
        const yearInput = document.querySelector('[data-ocr-field="paymentYear"]');
        if (yearInput) yearInput.value = parsedDate.year;
      }
    } else if (field === 'tipo' || field === 'kind') {
      state.parsed[field] = input.value;
      if (field === 'kind') {
        const guess = guessTypeFromKindAndText(input.value, state.rawText || '');
        if (guess && !silent) state.parsed.tipo = guess;
        const tipoInput = document.querySelector('[data-ocr-field="tipo"]');
        if (tipoInput && guess) tipoInput.value = guess;
      }
    } else if (field === 'descrizione') {
      state.parsed.descrizione = input.value || '';
    } else if (field === 'note') {
      state.parsed.note = input.value || '';
    }
    syncProgressUi();
  }

  function guessTypeFromKindAndText(kind, text) {
    const normalized = normalizeForMatch(text);
    const kindNorm = String(kind || '').toLowerCase();
    if (kindNorm === 'bonifico') return 'altro';
    if (kindNorm === 'f24') {
      if (/INPS|CONTRIBUT/i.test(normalized)) return 'contributi';
      return 'tasse';
    }
    if (kindNorm === 'bollettino') {
      if (/INPS|CONTRIBUT/i.test(normalized)) return 'contributi';
      return 'tasse';
    }
    if (/INPS|CONTRIBUT/i.test(normalized)) return 'contributi';
    if (/BONIFICO|IBAN|BENEFICIARIO/i.test(normalized)) return 'altro';
    return 'tasse';
  }

  function updateProgress(progress, statusText) {
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      state.progress = Math.max(0, Math.min(100, progress));
    }
    if (statusText) state.status = statusText;
    syncProgressUi();
  }

  function readFileAsArrayBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Impossibile leggere il file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  function ensurePdfWorkerConfigured() {
    if (!window.pdfjsLib || !window.pdfjsLib.GlobalWorkerOptions) return false;
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = OCR_WORKER_SRC;
    }
    return true;
  }

  async function extractTextFromPdf(file, runId) {
    if (!ensurePdfWorkerConfigured()) {
      throw new Error("Libreria PDF non disponibile. Prova con un'immagine JPG o PNG.");
    }

    const buffer = await readFileAsArrayBuffer(file);
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    const pageText = normalizeText((textContent.items || []).map(item => item.str || '').join(' '));
    if (isMeaningfulPdfText(pageText)) {
      return {
        text: pageText,
        method: 'pdf-text',
        note: 'Testo estratto direttamente dalla prima pagina del PDF.'
      };
    }

    if (runId !== state.runId) throw new Error('Operazione annullata.');

    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: ctx, viewport }).promise;
    const imageOcr = await runTesseract(canvas, runId, 'OCR prima pagina PDF');
    return {
      text: imageOcr.text,
      method: 'pdf-ocr',
      note: 'Il PDF non aveva testo affidabile, quindi ho provato la prima pagina come immagine.'
    };
  }

  function isMeaningfulPdfText(text) {
    const normalized = normalizeForMatch(text);
    if (!normalized) return false;
    if (normalized.length < 50) return false;
    return /(F24|BONIFICO|BOLLETTINO|PAGAMENTO|CONTRIB|TRIBUTO|RICEVUTA|IMPOSTA|SALDO|IMPORTO)/.test(normalized);
  }

  async function runTesseract(source, runId, phaseLabel) {
    if (!window.Tesseract || typeof window.Tesseract.recognize !== 'function') {
      throw new Error("OCR non disponibile nel browser. Riprova piu tardi o usa un'immagine piu nitida.");
    }
    const logger = message => {
      if (runId !== state.runId) return;
      if (!message || typeof message !== 'object') return;
      if (message.status) state.status = `${phaseLabel || 'OCR'}: ${message.status}`;
      if (typeof message.progress === 'number') state.progress = Math.round(message.progress * 100);
      syncProgressUi();
    };
    const result = await window.Tesseract.recognize(source, OCR_LANG, { logger });
    const confidence = result && result.data && Number.isFinite(result.data.confidence) ? result.data.confidence : 0;
    return {
      text: normalizeText(result && result.data && result.data.text ? result.data.text : ''),
      confidence
    };
  }

  async function extractTextFromImage(file, runId) {
    const imageOcr = await runTesseract(file, runId, 'OCR immagine');
    return {
      text: imageOcr.text,
      method: 'image-ocr',
      note: 'Immagine letta con Tesseract.js.',
      confidence: imageOcr.confidence
    };
  }

  function extractDateFromText(text) {
    const normalized = normalizeText(text);
    const iso = normalized.match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})\b/);
    if (iso) {
      const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`;
      if (parseIsoDate(candidate)) return candidate;
    }
    const dmy = normalized.match(/\b(\d{2})[-/](\d{2})[-/](20\d{2})\b/);
    if (dmy) {
      const candidate = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
      if (parseIsoDate(candidate)) return candidate;
    }
    const alt = normalized.match(/\b(\d{2})[.\/](\d{2})[.\/](20\d{2})\b/);
    if (alt) {
      const candidate = `${alt[3]}-${alt[2]}-${alt[1]}`;
      if (parseIsoDate(candidate)) return candidate;
    }
    return '';
  }

  function extractIban(text) {
    const match = normalizeForMatch(text).match(/\bIT\d{2}[A-Z]\d{10}[A-Z0-9]{12}\b/);
    return match ? match[0] : '';
  }

  function extractCodiceTributo(text) {
    const match = normalizeForMatch(text).match(/(?:CODICE\s*TRIBUTO|COD\.?\s*TRIB\.?)\s*[:\-]?\s*(\d{4})/);
    return match ? match[1] : '';
  }

  function extractSezione(text) {
    const match = normalizeForMatch(text).match(/\b(ERARIO|INPS|REGIONI|IMU)\b/);
    return match ? match[1] : '';
  }

  function extractAmount(text) {
    const lines = normalizeText(text).split(/\n+/).map(line => line.trim()).filter(Boolean);
    const keywordLines = [];
    for (const line of lines) {
      const matches = [...line.matchAll(/(?:€|EUR)?\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:[,.][0-9]{2})?|[0-9]+(?:[,.][0-9]{2}))\b/gi)];
      if (!matches.length) continue;
      const normalizedLine = normalizeForMatch(line);
      let score = 0;
      if (/(TOTALE|SALDO|IMPORTO|VERSATO|PAGATO|DA PAGARE)/.test(normalizedLine)) score += 4;
      if (/(F24|RICEVUTA|BONIFICO|BOLLETTINO|PAGAMENTO)/.test(normalizedLine)) score += 1;
      if (/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/.test(line)) score -= 2;
      for (const match of matches) {
        const parsed = parseEuroValue(match[1]);
        if (parsed !== null && parsed > 0) keywordLines.push({ value: parsed, score, line });
      }
    }
    if (keywordLines.length) {
      keywordLines.sort((a, b) => b.score - a.score || b.value - a.value);
      return keywordLines[0].value;
    }

    const fallbackMatches = [...normalizeText(text).matchAll(/(?:€|EUR)?\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:[,.][0-9]{2})?|[0-9]+(?:[,.][0-9]{2}))/gi)]
      .map(match => parseEuroValue(match[1]))
      .filter(value => value !== null && value > 0);
    if (!fallbackMatches.length) return null;
    return fallbackMatches.reduce((max, value) => Math.max(max, value), 0);
  }

  function detectDocumentKind(text, file) {
    const normalized = normalizeForMatch(text);
    const fileName = normalizeForMatch(file && file.name ? file.name : '');
    const isF24 = /(F24|CODICE TRIBUTO|SEZIONE\s+(ERARIO|INPS|REGIONI|IMU)|DELEGA F24)/.test(normalized) || /F24/.test(fileName);
    const isBonifico = /(BONIFICO|IBAN|BENEFICIARIO|CAUSALE|ORDINE DI BONIFICO)/.test(normalized) || /BONIFICO/.test(fileName);
    const isBollettino = /(BOLLETTINO|CONTO CORRENTE POSTALE|VERSAMENTO POSTALE)/.test(normalized) || /BOLLETTINO/.test(fileName);

    if (isF24) return 'f24';
    if (isBonifico) return 'bonifico';
    if (isBollettino) return 'bollettino';
    return 'generico';
  }

  function buildDescription(kind, text) {
    const codiceTributo = extractCodiceTributo(text);
    const sezione = extractSezione(text);
    const parts = [];
    if (kind === 'f24') {
      parts.push('F24 importato via OCR');
      if (codiceTributo) parts.push(`codice ${codiceTributo}`);
      if (sezione) parts.push(sezione);
    } else if (kind === 'bonifico') {
      parts.push('Bonifico importato via OCR');
    } else if (kind === 'bollettino') {
      parts.push('Bollettino importato via OCR');
    } else {
      parts.push('Pagamento importato via OCR');
    }
    return parts.join(' - ');
  }

  function buildNote(kind, text, extracted) {
    const notes = [];
    if (extracted.method === 'pdf-text') notes.push('PDF letto direttamente come testo.');
    if (extracted.method === 'pdf-ocr') notes.push('PDF letto con OCR sulla prima pagina.');
    if (extracted.method === 'image-ocr') notes.push('Immagine letta con Tesseract.js.');
    if (kind === 'f24') {
      const codiceTributo = extractCodiceTributo(text);
      const sezione = extractSezione(text);
      if (codiceTributo) notes.push(`Codice tributo ${codiceTributo}.`);
      if (sezione) notes.push(`Sezione ${sezione}.`);
    }
    const iban = extractIban(text);
    if (iban) notes.push(`IBAN rilevato: ${iban}`);
    return notes.join(' ');
  }

  function parseOcrText(text, file, extracted) {
    const normalized = normalizeText(text);
    const kind = detectDocumentKind(normalized, file);
    const amount = extractAmount(normalized);
    const paymentDate = extractDateFromText(normalized) || state.parsed.paymentDate || createDefaultParsedState().paymentDate;
    const paymentYear = (parseIsoDate(paymentDate) || {}).year || currentYear;
    const codiceTributo = extractCodiceTributo(normalized);
    const sezione = extractSezione(normalized);
    const iban = extractIban(normalized);
    const tipo = guessTypeFromKindAndText(kind, normalized);
    const confidence = extracted && Number.isFinite(extracted.confidence) ? Math.round(extracted.confidence) : (kind === 'generico' ? 32 : 74);

    return {
      paymentDate,
      paymentYear,
      amount: amount !== null ? ceil2(amount) : '',
      tipo,
      descrizione: buildDescription(kind, normalized),
      note: buildNote(kind, normalized, extracted),
      kind,
      confidence: String(confidence),
      codiceTributo,
      sezione,
      iban
    };
  }

  async function handleSelectedFile(file) {
    if (!file) return;
    if (!isImageFile(file) && !isPdfFile(file)) {
      state.error = 'Formato file non supportato. Usa JPG, PNG, WEBP o PDF.';
      state.processing = false;
      state.fileName = file.name || '';
      state.fileType = file.type || '';
      renderOcrPagamentoModal();
      return;
    }

    const runId = ++state.runId;
    state.processing = true;
    state.error = '';
    state.progress = 2;
    state.fileName = file.name || '';
    state.fileType = file.type || (isPdfFile(file) ? 'application/pdf' : 'image');
    state.extractionMode = isPdfFile(file) ? 'PDF' : 'Immagine';
    state.extractionNote = 'Sto leggendo il file...';
    renderOcrPagamentoModal();

    try {
      let extracted;
      if (isPdfFile(file)) {
        extracted = await extractTextFromPdf(file, runId);
      } else {
        extracted = await extractTextFromImage(file, runId);
      }
      if (runId !== state.runId) return;
      state.rawText = extracted.text || '';
      state.parsed = parseOcrText(state.rawText, file, extracted);
      state.extractionMode = extracted.method === 'pdf-text' ? 'PDF / testo' : (extracted.method === 'pdf-ocr' ? 'PDF / OCR' : 'OCR immagine');
      state.extractionNote = extracted.note || '';
      state.progress = 100;
      state.processing = false;
      state.error = '';
      renderOcrPagamentoModal();
    } catch (err) {
      if (runId !== state.runId) return;
      state.processing = false;
      state.progress = 0;
      state.error = err && err.message ? err.message : 'Impossibile leggere il file.';
      state.extractionNote = '';
      renderOcrPagamentoModal();
    }
  }

  function buildPaymentRecordFromState() {
    const parsed = state.parsed || createDefaultParsedState();
    const paymentDate = fmtDateIso(parsed.paymentDate || '') || createDefaultParsedState().paymentDate;
    const dateYear = (parseIsoDate(paymentDate) || {}).year || currentYear;
    const targetYear = Number.isFinite(parseInt(parsed.paymentYear, 10)) ? parseInt(parsed.paymentYear, 10) : dateYear;
    const amount = ceil2(parseEuroValue(parsed.amount) || 0);
    const tipo = PAYMENT_TYPES[parsed.tipo] ? parsed.tipo : 'altro';
    const descrizione = String(parsed.descrizione || '').trim() || buildDescription(parsed.kind || 'generico', state.rawText || '');
    return {
      targetYear,
      paymentDate,
      tipo,
      amount,
      descrizione
    };
  }

  function savePaymentRecord(year, payment) {
    const targetYear = Number.isFinite(year) ? year : currentYear;
    const yearData = getYearDataFor(targetYear) || ensureDataShape({}, targetYear);
    if (!Array.isArray(yearData.pagamenti)) yearData.pagamenti = [];
    yearData.pagamenti.unshift({
      data: payment.paymentDate || `${targetYear}-01-01`,
      tipo: payment.tipo || 'altro',
      descrizione: payment.descrizione || 'Pagamento importato da OCR',
      importo: ceil2(payment.amount || 0),
      scheduleKey: ''
    });
    saveYearData(targetYear, yearData);
    if (typeof recalcAll === 'function') recalcAll();
  }

  function confirmOcrPagamento() {
    if (state.processing) return;
    const payment = buildPaymentRecordFromState();
    if (!payment.amount || payment.amount <= 0) {
      state.error = 'Inserisci un importo valido prima di salvare.';
      renderOcrPagamentoModal();
      return;
    }
    savePaymentRecord(payment.targetYear, payment);
    state.processing = false;
    state.error = '';
    state.statusTone = 'positive';
    state.status = `Pagamento salvato nell'anno ${payment.targetYear}.`;
    renderOcrPagamentoModal();
    setTimeout(() => {
      if (state.open) closeOcrPagamentoModal();
    }, 550);
  }

  function bindGlobalModalEscape() {
    // The app.js key handler closes the OCR modal as well, but this hook keeps
    // the standalone module resilient if the handler is not yet in sync.
    window.addEventListener('keydown', evt => {
      if (evt.key !== 'Escape') return;
      const modal = document.getElementById('ocrPagamentoModal');
      if (modal && modal.classList.contains('open')) closeOcrPagamentoModal();
    });
  }

  bindGlobalModalEscape();
  window.openOcrPagamentoModal = openOcrPagamentoModal;
  window.closeOcrPagamentoModal = closeOcrPagamentoModal;
})();
