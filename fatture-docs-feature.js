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

  
  function buildInvoiceHtmlNode(invoice) {
    const profile = getProfileFiscalData();
    const cliente = invoice.clienteSnapshot || (typeof getClienteById === 'function' ? getClienteById(invoice.clienteId) : null) || {};
    const totals = computeDraftTotals(invoice);
    
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.width = '800px';
    
    wrapper.innerHTML = `
      <div id="invoice-render-box" style="width: 100%; padding: 40px; font-family: 'Helvetica', sans-serif; color: #121a24; background: #fff; box-sizing: border-box;">
         <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--color-primary, #4FA3A5); padding-bottom: 20px; margin-bottom: 30px;">
           <div>
             <h1 style="margin: 0; color: var(--color-primary, #4FA3A5); font-size: 32px; text-transform: uppercase;">FATTURA</h1>
             <div style="margin-top: 5px; font-size: 14px; color: #607080;">N. ${esc(invoice.numero)} del ${formatDisplayDate(invoice.data)}</div>
           </div>
           <div style="text-align: right; font-size: 12px; color: #4a5568; line-height: 1.4;">
             <strong>${esc(profile.nome || currentProfile)}</strong><br>
             ${esc(profile.indirizzo)}<br>
             ${esc(profile.cap)} ${esc(profile.citta)} ${esc(profile.provincia)}<br>
             P.IVA ${esc(profile.partitaIva)}<br>
             ${profile.codiceFiscale ? 'C.F. ' + esc(profile.codiceFiscale) : ''}
           </div>
         </div>
         
         <div style="display: flex; gap: 40px; margin-bottom: 40px;">
           <div style="flex: 1; background: #f5f8fb; padding: 15px; border-radius: 8px;">
             <div style="font-size: 10px; font-weight: bold; color: #607080; text-transform: uppercase; margin-bottom: 5px;">Fatturato a</div>
             <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">${esc(cliente.nome || 'Cliente non selezionato')}</div>
             <div style="font-size: 12px; line-height: 1.4; color: #4a5568;">
               ${esc(cliente.indirizzo)}<br>
               ${esc(cliente.cap)} ${esc(cliente.citta)} ${esc(cliente.provincia)}<br>
               ${cliente.partitaIva ? 'P.IVA ' + esc(cliente.partitaIva) + '<br>' : ''}
               ${cliente.codiceFiscale ? 'C.F. ' + esc(cliente.codiceFiscale) + '<br>' : ''}
               ${cliente.codiceSDI ? 'SDI: ' + esc(cliente.codiceSDI) : ''}
             </div>
           </div>
           <div style="flex: 1; background: #f5f8fb; padding: 15px; border-radius: 8px;">
             <div style="font-size: 10px; font-weight: bold; color: #607080; text-transform: uppercase; margin-bottom: 5px;">Dettagli Pagamento</div>
             <div style="font-size: 12px; line-height: 1.4; color: #4a5568;">
               <strong>Scadenza:</strong> ${formatDisplayDate(invoice.scadenzaPagamento) || '-'}<br>
               <strong>Metodo:</strong> ${esc(invoice.modalitaPagamento)}<br>
               ${invoice.iban ? '<strong>IBAN:</strong> ' + esc(invoice.iban) + '<br>' : ''}
               <strong>Marca da bollo:</strong> ${invoice.marcaDaBollo ? 'Sì (2,00 €)' : 'No'}
             </div>
           </div>
         </div>
         
         <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px;">
           <thead>
             <tr style="background: var(--color-primary, #4FA3A5); color: white;">
               <th style="padding: 10px; text-align: left; border-radius: 6px 0 0 6px;">Descrizione</th>
               <th style="padding: 10px; text-align: right;">Q.tà</th>
               <th style="padding: 10px; text-align: right;">Prezzo Unitario</th>
               <th style="padding: 10px; text-align: right;">IVA %</th>
               <th style="padding: 10px; text-align: right; border-radius: 0 6px 6px 0;">Totale</th>
             </tr>
           </thead>
           <tbody>
             ${invoice.righe.map((line, idx) => `
               <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? 'background: #fcfcfc;' : ''}">
                 <td style="padding: 12px 10px; color: #121a24;">${esc(line.descrizione)}</td>
                 <td style="padding: 12px 10px; text-align: right; color: #4a5568;">${parseMaybeNumber(line.quantita)}</td>
                 <td style="padding: 12px 10px; text-align: right; color: #4a5568;">${formatPdfMoney(parseMaybeNumber(line.prezzoUnitario))}</td>
                 <td style="padding: 12px 10px; text-align: right; color: #4a5568;">${round2(line.iva).toFixed(2)}%</td>
                 <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #121a24;">${formatPdfMoney(parseMaybeNumber(line.quantita) * parseMaybeNumber(line.prezzoUnitario))}</td>
               </tr>
             `).join('')}
           </tbody>
         </table>
         
         <div style="display: flex; gap: 40px;">
           <div style="flex: 1.5; font-size: 11px; color: #607080; line-height: 1.5;">
             <strong>Note / Riferimento normativo:</strong><br>
             ${esc(invoice.note)}
           </div>
           <div style="flex: 1;">
             <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
               <tr>
                 <td style="padding: 8px 0; color: #4a5568;">Imponibile</td>
                 <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatPdfMoney(totals.subtotal)}</td>
               </tr>
               ${totals.contributoIntegrativo > 0 ? `
               <tr>
                 <td style="padding: 8px 0; color: #4a5568;">Contributo integrativo</td>
                 <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatPdfMoney(totals.contributoIntegrativo)}</td>
               </tr>` : ''}
               ${totals.bollo > 0 ? `
               <tr>
                 <td style="padding: 8px 0; color: #4a5568;">Marca da bollo virtuale</td>
                 <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatPdfMoney(totals.bollo)}</td>
               </tr>` : ''}
               <tr style="border-top: 2px solid var(--color-primary, #4FA3A5); font-size: 16px;">
                 <td style="padding: 12px 0; color: var(--color-primary, #4FA3A5); font-weight: bold;">Totale da pagare</td>
                 <td style="padding: 12px 0; text-align: right; font-weight: bold; color: var(--color-primary, #4FA3A5);">${formatPdfMoney(totals.total)}</td>
               </tr>
             </table>
           </div>
         </div>
      </div>
    `;
    return wrapper;
  }

  async function downloadFatturaPdf() {
    const saved = saveFatturaDraft(false);
    if (!saved) return;
    try {
      if (!window.html2pdf) throw new Error('html2pdf non disponibile (attendi caricamento pagina).');
      const node = buildInvoiceHtmlNode(saved);
      document.body.appendChild(node);
      const fileName = `fattura_${sanitizeDownloadFileName(saved.numero, 'documento')}.pdf`;
      const opt = {
        margin:       [0, 0, 0, 0],
        filename:     fileName,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
      };
      await window.html2pdf().set(opt).from(node.firstElementChild).save();
      node.remove();
      showFatturaToast('PDF scaricato e fattura salvata nello storico.', 'success');
    } catch (err) {
      console.error(err);
      showFatturaToast('Errore nella generazione del PDF', 'error');
    }
  }

  async function previewFatturaPdf() {
    const saved = saveFatturaDraft(false);
    if (!saved) return;
    try {
      if (!window.html2pdf) throw new Error('html2pdf non disponibile.');
      const node = buildInvoiceHtmlNode(saved);
      document.body.appendChild(node);
      const opt = {
        margin:       [0, 0, 0, 0],
        filename:     'anteprima.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
      };
      const pdfBlob = await window.html2pdf().set(opt).from(node.firstElementChild).output('blob');
      node.remove();
      
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(pdfBlob);
      const win = window.open(state.previewUrl, '_blank', 'noopener,noreferrer');
      if (!win) {
        showFatturaToast('Popup bloccato dal browser.', 'warn');
        return;
      }
      showFatturaToast('Anteprima PDF aperta in una nuova scheda.', 'success');
    } catch (err) {
      console.error(err);
      showFatturaToast('Errore nella generazione dell anteprima', 'error');
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
