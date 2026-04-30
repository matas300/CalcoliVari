/* Fatture: gestione storico, stati, numerazione progressiva (sub-project 3) */
(function () {
  const STORAGE_PREFIX = 'calcoliPIVA_';
  const STORAGE_SUFFIX = '_fattureEmesse';

  // todayIso TZ-safe via date-utils.js (DUP-6 risolto: niente più dipendenza da window.__todayIso)
  const _DateUtilsStorico = (typeof window !== 'undefined' && window.DateUtils) ? window.DateUtils
    : (typeof require !== 'undefined' ? require('./date-utils.js') : null);
  function _todayIso() {
    return _DateUtilsStorico
      ? _DateUtilsStorico.todayIso()
      : new Date().toISOString().slice(0, 10);
  }

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

  // Pure helpers (test-friendly, no DOM)
  function shouldShowLegacyBadge(f) {
    if (!f || typeof f !== 'object') return false;
    if (f._legacyCompleted === true) return false;
    return f.origine === 'legacy-migrated';
  }

  function markLegacyCompleted(f) {
    if (!f || typeof f !== 'object') return f;
    var out = Object.assign({}, f);
    out._legacyCompleted = true;
    out.origine = 'manuale';
    return out;
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
    cells.forEach((c, i) => {
      const td = document.createElement('td');
      td.textContent = c;
      if (i === 0 && shouldShowLegacyBadge(f)) {
        const b = document.createElement('span');
        b.className = 'badge-origine-legacy';
        b.textContent = 'Legacy';
        b.style.marginLeft = '6px';
        td.appendChild(b);
      }
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
    if (shouldShowLegacyBadge(f)) {
      btns.push(mk('Completa dati', () => window.openFatturaModal && window.openFatturaModal(f.id)));
    }
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
    const dataDefault = _todayIso();
    const data = prompt('Data invio SdI (YYYY-MM-DD):', dataDefault);
    if (!data) return;
    const fatture = load(profile);
    const idx = fatture.findIndex(f => f.id === id);
    if (idx < 0) return;
    fatture[idx].stato = 'inviata';
    fatture[idx].dataInvioSdi = data;
    // F1+F2+F3: sync NC TD04 → originale se applicabile
    if (fatture[idx].tipoDocumento === 'TD04'
        && fatture[idx].fatturaOriginaleId
        && window.FattureNCSync) {
      window.FattureNCSync.applyNCToOriginal(fatture[idx], fatture);
    }
    save(profile, fatture);
    const sel = document.getElementById('archivioAnnoSelect');
    renderStorico(Number(sel && sel.value) || new Date().getFullYear());
  }

  function _markPagata(id, profile) {
    // F3: validate ISO date format YYYY-MM-DD strict (no /, no DD-MM-YYYY)
    const today = _todayIso();
    let data;
    while (true) {
      data = prompt('Data pagamento (formato YYYY-MM-DD, es. ' + today + '):', today);
      if (data === null) return; // user cancelled
      data = String(data).trim();
      if (!data) return;
      // strict ISO YYYY-MM-DD validation + valid calendar date check
      const parts = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (parts) {
        const y = parseInt(parts[1], 10), mo = parseInt(parts[2], 10), d = parseInt(parts[3], 10);
        const dt = new Date(y, mo - 1, d);
        if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
            && y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12) {
          break; // valid
        }
      }
      alert('Data non valida. Usa il formato YYYY-MM-DD (es. ' + today + '). Niente "/", "." o ordine giorno/mese/anno.');
    }
    const fatture = load(profile);
    const idx = fatture.findIndex(f => f.id === id);
    if (idx < 0) return;
    fatture[idx].stato = 'pagata';
    fatture[idx].dataPagamento = data;
    // F2: aggiorna pagMese/pagAnno coerentemente (parità con quickMarkPagataFromCard).
    // Senza questo i selettori per-cassa (getByPagAnno, getByMonth, getCrossYearPaidIn)
    // non vedono la fattura come incassata nell'anno giusto.
    const dt2 = new Date(data + 'T00:00:00');
    if (!isNaN(dt2.getTime())) {
      fatture[idx].pagMese = dt2.getMonth() + 1;
      fatture[idx].pagAnno = dt2.getFullYear();
    }
    save(profile, fatture);
    const sel = document.getElementById('archivioAnnoSelect');
    renderStorico(Number(sel && sel.value) || new Date().getFullYear());
    // F2: trigger ricalcolo dashboard / dichiarazione / scadenziario (parità con quickMarkPagataFromCard)
    if (typeof window !== 'undefined') {
      if (typeof window.renderFattureDocsSection === 'function') window.renderFattureDocsSection();
      if (typeof window.recalcAll === 'function') window.recalcAll();
    }
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
  const _FormatUtilsStorico = (typeof FormatUtils !== 'undefined') ? FormatUtils
    : (typeof require !== 'undefined' ? require('./format-utils.js') : null);
  const _formatEur = _FormatUtilsStorico.formatEur;
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
    setArchivioStato,
    shouldShowLegacyBadge,
    markLegacyCompleted
  };
  window.openArchivioFatture = openArchivioModal;
})();
