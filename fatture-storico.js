/* Fatture: gestione storico, stati, numerazione progressiva (sub-project 3) */
(function () {
  const STORAGE_PREFIX = 'calcoliPIVA_';
  const STORAGE_SUFFIX = '_fattureEmesse';

  let _archivioStato = 'tutte';

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
      try { window.syncProfileMetaToCloud(profile, 'fattureEmesse'); } catch (_) { /* sync best-effort */ }
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

  function getCurrentProfile() {
    return (typeof window.getProfile === 'function')
      ? window.getProfile()
      : sessionStorage.getItem('calcoliPIVA_profile');
  }

  function renderAnnoFilter(selectedAnno) {
    const sel = document.getElementById('archivioAnnoSelect');
    if (!sel) return;
    const fatture = load(getCurrentProfile());
    const anni = Array.from(new Set(fatture.map(f => f.annoProgressivo).filter(Boolean))).sort((a, b) => b - a);
    const annoCorrente = new Date().getFullYear();
    if (!anni.includes(annoCorrente)) anni.unshift(annoCorrente);
    const sel2 = Number(selectedAnno) || annoCorrente;
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    anni.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      if (Number(a) === Number(sel2)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = () => renderStorico(Number(sel.value));
  }

  function renderStorico(annoFiltro) {
    const container = document.getElementById('archivioFattureList');
    if (!container) return;
    const profile = getCurrentProfile();
    const fatture = load(profile);
    const anno = Number(annoFiltro) || new Date().getFullYear();
    let filtered = fatture
      .filter(f => Number(f.annoProgressivo) === anno)
      .sort((a, b) => (b.progressivo || 0) - (a.progressivo || 0));
    if (_archivioStato !== 'tutte') {
      filtered = filtered.filter(f => (f.stato || 'bozza') === _archivioStato);
    }

    while (container.firstChild) container.removeChild(container.firstChild);
    if (!filtered.length) {
      const p = document.createElement('div');
      p.className = 'fatture-empty';
      p.textContent = 'Nessuna fattura nell\u2019archivio per il filtro selezionato.';
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
      f.numero || '\u2014',
      _formatDate(f.data),
      (f.clienteSnapshot && (f.clienteSnapshot.denominazione || (f.clienteSnapshot.nome + ' ' + (f.clienteSnapshot.cognome || '')).trim())) || '\u2014',
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
    btns.push(mk('Visualizza', () => window.viewFatturaModal && window.viewFatturaModal(f.id)));
    if (f.stato === 'bozza') {
      btns.push(mk('Modifica', () => window.openFatturaModal && window.openFatturaModal(f.id)));
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
    // Hard-delete dev toggle (T13)
    if (typeof window.isDevHardDeleteOn === 'function' && window.isDevHardDeleteOn() && typeof window.hardDeleteFattura === 'function') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-danger';
      b.textContent = '🗑 Hard delete';
      b.addEventListener('click', () => window.hardDeleteFattura(f.id));
      btns.push(b);
    }
    return btns;
  }

  function _changeStato(id, nuovoStato, profile) {
    const fatture = load(profile);
    const idx = fatture.findIndex(f => f.id === id);
    if (idx < 0) return;
    fatture[idx].stato = nuovoStato;
    save(profile, fatture);
    const sel = document.getElementById('archivioAnnoSelect');
    renderStorico(Number(sel && sel.value) || new Date().getFullYear());
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
    const sel = document.getElementById('archivioAnnoSelect');
    renderStorico(Number(sel && sel.value) || new Date().getFullYear());
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
    const sel = document.getElementById('archivioAnnoSelect');
    renderStorico(Number(sel && sel.value) || new Date().getFullYear());
  }

  function _duplicate(f, profile) {
    const fatture = load(profile);
    const annoOggi = new Date().getFullYear();
    const prog = nextProgressivo(annoOggi, fatture);
    const dup = Object.assign({}, f, {
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
    });
    fatture.push(dup);
    save(profile, fatture);
    renderAnnoFilter(annoOggi);
    renderStorico(annoOggi);
  }

  function _formatDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : (iso || '\u2014');
  }
  function _formatEur(n) {
    return (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac';
  }
  function _calcTotale(f) {
    const imp = (f.righe || []).reduce((s, r) => s + (Number(r.quantita) || 0) * (Number(r.prezzoUnitario) || 0), 0);
    const bollo = (f.marcaDaBollo && imp > 77.47) ? 2 : 0;
    return imp + bollo + (Number(f.contributoIntegrativo) || 0) - (Number(f.ritenuta) || 0);
  }

  function renderArchivioStatoFilter() {
    const host = document.getElementById('archivioStatoFilter');
    if (!host) return;
    const stati = [
      ['tutte', 'Tutte'],
      ['bozza', 'Bozze'],
      ['inviata', 'Da pagare'],
      ['pagata', 'Pagate'],
      ['annullata', 'Annullate']
    ];
    while (host.firstChild) host.removeChild(host.firstChild);
    stati.forEach(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.className = 'fatture-filter-btn';
      b.setAttribute('aria-selected', String(_archivioStato === key));
      b.textContent = label;
      b.addEventListener('click', () => setArchivioStato(key));
      host.appendChild(b);
    });
  }

  function setArchivioStato(stato) {
    _archivioStato = stato;
    const sel = document.getElementById('archivioAnnoSelect');
    renderStorico(Number(sel && sel.value) || new Date().getFullYear());
    renderArchivioStatoFilter();
  }

  function openArchivioModal() {
    const modal = document.getElementById('archivioFattureModal');
    if (!modal) return;
    _archivioStato = 'tutte';
    modal.classList.add('open');
    const annoCorrente = new Date().getFullYear();
    renderAnnoFilter(annoCorrente);
    renderArchivioStatoFilter();
    renderStorico(annoCorrente);
  }

  function closeArchivioModal() {
    const modal = document.getElementById('archivioFattureModal');
    if (modal) modal.classList.remove('open');
  }

  window.FattureStorico = {
    load,
    save,
    nextProgressivo,
    formatNumero,
    storageKey,
    renderStorico,
    renderAnnoFilter,
    openArchivioModal,
    closeArchivioModal,
    setArchivioStato
  };
  window.openArchivioFatture = openArchivioModal;
})();
