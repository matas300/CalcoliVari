// app-storage.js — Storage layer + clienti CRUD + profilo fiscale + INPS settings + yearData
// Estratto da app.js (Sprint 6.1) — sezione Storage (~1185 righe).
// Caricato DOPO app.js: usa currentProfile, currentYear, data, MONTHS, fmt, ceil2,
// recalcAll, parseIsoDate, OFFICIAL_ARTCOM_INPS, IRPEF_BRACKETS, ATECO_COEFFICIENTI,
// firebase sync helpers e altre globali condivise (script-binding cross-script).

(function () {
  'use strict';

  // ═══════════════════ Storage ═══════════════════
  // Wrapper sopra StorageKeys (UMD). Mantengono firma legacy (default a currentProfile/Year)
  // e fallback a 'default' invece di '_global' del modulo per backward compat con dati esistenti.
  function storageKey(y) { return window.StorageKeys.yearData(currentProfile, y || currentYear); }
  function profileStorageKey(profile = currentProfile) {
    return window.StorageKeys.profileFiscal(profile || 'default');
  }
  function clientiStorageKey(profile = currentProfile) {
    return window.StorageKeys.clienti(profile || 'default');
  }

  function getProfileFiscalDefaults(profile = currentProfile) {
    return { ...(PROFILE_FISCAL_LIBRARY[profile] || PROFILE_FISCAL_LIBRARY.Demo) };
  }

  function generateClientId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'cli_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function normalizeClienteField(value, fallback = '') {
    return String(value ?? fallback).trim();
  }

  function normalizeCliente(input, fallbackId) {
    const item = input || {};
    const id = normalizeClienteField(item.id, fallbackId || generateClientId()) || (fallbackId || generateClientId());
    return {
      id,
      nome: normalizeClienteField(item.nome),
      tipoCliente: ['PF', 'PG', 'PA', 'Estero'].indexOf(item.tipoCliente) >= 0 ? item.tipoCliente : 'PG',
      partitaIva: normalizeClienteField(item.partitaIva),
      codiceFiscale: normalizeClienteField(item.codiceFiscale),
      codiceSDI: normalizeClienteField(item.codiceSDI, '0000000') || '0000000',
      pec: normalizeClienteField(item.pec),
      indirizzo: normalizeClienteField(item.indirizzo),
      cap: normalizeClienteField(item.cap),
      citta: normalizeClienteField(item.citta),
      provincia: normalizeClienteField(item.provincia).toUpperCase(),
      nazione: normalizeClienteField(item.nazione, 'IT').toUpperCase() || 'IT',
      descrizioneStandard: normalizeClienteField(item.descrizioneStandard),
      note: normalizeClienteField(item.note)
    };
  }

  function getClienti(profile = currentProfile) {
    const key = clientiStorageKey(profile);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item, idx) => normalizeCliente(item, item && item.id ? item.id : `client_${idx}`));
    } catch {
      return [];
    }
  }

  function saveClienti(list, profile = currentProfile) {
    const normalized = (Array.isArray(list) ? list : []).map(item => normalizeCliente(item, item && item.id));
    localStorage.setItem(clientiStorageKey(profile), JSON.stringify(normalized));
    if (profile === currentProfile && typeof syncProfileMetaToCloud === 'function') {
      syncProfileMetaToCloud(profile);
    }
    return normalized;
  }

  // ─── Cliente di default (pre-selezionato nel wizard nuova fattura) ───
  function _clienteDefaultIdKey(profile = currentProfile) {
    return `calcoliPIVA_${profile || 'default'}_clienteDefaultId`;
  }
  function getClienteDefaultId(profile = currentProfile) {
    if (!profile) return '';
    const raw = localStorage.getItem(_clienteDefaultIdKey(profile));
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return typeof raw === 'string' ? raw : '';
    }
  }
  function setClienteDefaultId(id, profile = currentProfile) {
    if (!profile) return;
    const value = String(id || '');
    if (value) {
      localStorage.setItem(_clienteDefaultIdKey(profile), JSON.stringify(value));
    } else {
      localStorage.removeItem(_clienteDefaultIdKey(profile));
    }
    if (profile === currentProfile && typeof syncProfileMetaToCloud === 'function') {
      syncProfileMetaToCloud(profile);
    }
  }
  function toggleClienteDefault(id) {
    if (!id) return;
    const current = getClienteDefaultId();
    setClienteDefaultId(current === id ? '' : id);
    if (typeof renderClienti === 'function') renderClienti();
  }

  function setClientiSearch(value) {
    clientiUiState.search = String(value || '');
    renderClienti();
  }

  function addCliente() {
    const list = getClienti();
    const next = normalizeCliente({
      id: generateClientId(),
      nazione: 'IT',
      codiceSDI: '0000000'
    });
    saveClienti([next, ...list]);
    renderClienti();
    openClienteModal(next.id);
  }

  // ── Modal dettaglio cliente (Task 5) ──
  // XSS: tutti i valori passano via escapeHtml (pattern consolidato nel progetto).
  const clienteModalState = { id: null, escHandler: null };

  function openClienteModal(id) {
    const cliente = getClienti().find(c => c.id === id);
    if (!cliente) return;
    clienteModalState.id = id;
    renderClienteModal(id);
    const m = document.getElementById('clienteModal');
    if (m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
    document.body.classList.add('profile-modal-open');
    if (!clienteModalState.escHandler) {
      clienteModalState.escHandler = (ev) => {
        if (ev.key === 'Escape') closeClienteModal();
      };
      document.addEventListener('keydown', clienteModalState.escHandler);
    }
  }

  function closeClienteModal() {
    const m = document.getElementById('clienteModal');
    if (m) { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); m.innerHTML = ''; }
    document.body.classList.remove('profile-modal-open');
    clienteModalState.id = null;
    if (clienteModalState.escHandler) {
      document.removeEventListener('keydown', clienteModalState.escHandler);
      clienteModalState.escHandler = null;
    }
  }

  function renderClienteModal(id) {
    const m = document.getElementById('clienteModal');
    if (!m) return;
    const cliente = getClienti().find(c => c.id === id);
    if (!cliente) { closeClienteModal(); return; }
    const esc = (v) => escapeHtml(v ?? '');
    const titleText = cliente.nome ? esc(cliente.nome) : 'Nuovo cliente';
    const idEsc = esc(id);
    const on = (field) => `onchange="updateClienteField('${idEsc}', '${field}', this.value)"`;
    m.innerHTML = `
      <div class="cliente-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="clienteModalTitle">
        <div class="cliente-modal-header">
          <div class="cliente-modal-title" id="clienteModalTitle">${titleText}</div>
          <button type="button" class="cliente-modal-close" aria-label="Chiudi" onclick="closeClienteModal()">×</button>
        </div>

        <div class="cliente-section">
          <div class="cliente-section-label">Partita IVA</div>
          <div class="cliente-autofill-row">
            <input type="text" id="clienteModalPiva" value="${esc(cliente.partitaIva)}" placeholder="11 cifre" ${on('partitaIva')}>
            <button type="button" id="clienteAutofillBtn" class="btn-ghost" onclick="autofillClienteFromPiva('${idEsc}')">🔍 Autofill</button>
          </div>
          <div id="clienteModalToast" class="fattura-modal-toast"></div>
        </div>
        <hr>

        <div class="cliente-section">
          <div class="cliente-section-label">Anagrafica</div>
          <div class="cliente-field">
            <label>Nome / Ragione sociale</label>
            <input type="text" value="${esc(cliente.nome)}" ${on('nome')}>
          </div>
          <div class="cliente-field">
            <label>Codice fiscale</label>
            <input type="text" value="${esc(cliente.codiceFiscale)}" ${on('codiceFiscale')}>
          </div>
        </div>
        <hr>

        <div class="cliente-section">
          <div class="cliente-section-label">Sede</div>
          <div class="cliente-field">
            <label>Indirizzo</label>
            <input type="text" value="${esc(cliente.indirizzo)}" ${on('indirizzo')}>
          </div>
          <div class="cliente-sede-row">
            <div class="cliente-field">
              <label>CAP</label>
              <input type="text" autocomplete="off" value="${esc(cliente.cap)}" maxlength="5" ${on('cap')}>
            </div>
            <div class="cliente-field">
              <label>Città</label>
              <input type="text" autocomplete="off" value="${esc(cliente.citta)}" ${on('citta')}>
            </div>
            <div class="cliente-field">
              <label>Provincia</label>
              <input type="text" autocomplete="off" value="${esc(cliente.provincia)}" maxlength="2" ${on('provincia')}>
            </div>
            <div class="cliente-field">
              <label>Nazione</label>
              <input type="text" autocomplete="off" value="${esc(cliente.nazione)}" maxlength="2" ${on('nazione')}>
            </div>
          </div>
        </div>
        <hr>

        <div class="cliente-section">
          <div class="cliente-section-label">Fatturazione elettronica</div>
          <div class="cliente-field">
            <label>Tipo cliente</label>
            <select ${on('tipoCliente')}>
              <option value="PG" ${(!cliente.tipoCliente || cliente.tipoCliente === 'PG') ? 'selected' : ''}>Persona Giuridica (azienda)</option>
              <option value="PF" ${cliente.tipoCliente === 'PF' ? 'selected' : ''}>Persona Fisica</option>
              <option value="PA" ${cliente.tipoCliente === 'PA' ? 'selected' : ''}>Pubblica Amministrazione</option>
              <option value="Estero" ${cliente.tipoCliente === 'Estero' ? 'selected' : ''}>Estero</option>
            </select>
          </div>
          <div class="cliente-field">
            <label>${cliente.tipoCliente === 'PA' ? 'Codice IPA (6 char)' : 'Codice SDI (7 char)'}</label>
            <input type="text" value="${esc(cliente.codiceSDI)}" maxlength="${cliente.tipoCliente === 'PA' ? 6 : 7}" ${on('codiceSDI')}>
          </div>
          <div class="cliente-field">
            <label>PEC</label>
            <input type="email" value="${esc(cliente.pec)}" ${on('pec')}>
          </div>
        </div>
        <hr>

        <div class="cliente-section">
          <div class="cliente-section-label">Riga predefinita fattura</div>
          <div class="cliente-field">
            <label>Descrizione standard (riempie automaticamente la prima riga del wizard nuova fattura)</label>
            <textarea rows="2" placeholder="Es. Consulenza informatica mese corrente" ${on('descrizioneStandard')}>${esc(cliente.descrizioneStandard)}</textarea>
          </div>
        </div>
        <hr>

        <div class="cliente-section">
          <div class="cliente-section-label">Note interne</div>
          <div class="cliente-field">
            <textarea rows="3" ${on('note')}>${esc(cliente.note)}</textarea>
          </div>
        </div>

        <div class="cliente-modal-actions">
          <button type="button" class="btn-danger" onclick="deleteClienteFromModal('${idEsc}')">Elimina</button>
          <button type="button" class="btn-primary" onclick="closeClienteModal()">Chiudi</button>
        </div>
      </div>`;
  }

  function deleteClienteFromModal(id) {
    const cliente = getClienti().find(c => c.id === id);
    if (!cliente) return;
    const msg = `Eliminare ${cliente.nome || 'questo cliente'}? L'operazione è irreversibile.`;
    const onConfirm = () => {
      saveClienti(getClienti().filter(c => c.id !== id));
      closeClienteModal();
      renderClienti();
    };
    if (typeof window.showAppConfirm === 'function') {
      window.showAppConfirm({ title: 'Eliminare cliente?', message: msg, okLabel: 'Elimina', danger: true }, onConfirm);
    } else if (confirm(msg)) {
      onConfirm();
    }
  }

  function updateClienteField(id, key, value) {
    const list = getClienti().map(cliente => {
      if (cliente.id !== id) return cliente;
      return normalizeCliente({ ...cliente, [key]: value }, cliente.id);
    });
    saveClienti(list);
    renderClienti();
    // Non re-renderizzare l'intero modal (perderebbe il focus sull'input attivo).
    // Aggiorna solo il titolo se cambia il nome.
    // Eccezione: cambio tipoCliente → re-render per aggiornare label SDI/IPA e maxlength.
    if (clienteModalState.id === id && key === 'tipoCliente' && typeof renderClienteModal === 'function') {
      renderClienteModal(id);
    }
    if (clienteModalState.id === id && key === 'nome') {
      const titleEl = document.getElementById('clienteModalTitle');
      if (titleEl) titleEl.textContent = value || 'Nuovo cliente';
    }
  }

  function showClienteModalToast(message, tone = 'success') {
    const toast = document.getElementById('clienteModalToast');
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.add('show');
    if (showClienteModalToast._timer) clearTimeout(showClienteModalToast._timer);
    showClienteModalToast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  async function autofillClienteFromPiva(id) {
    const api = window.ClientiAutofill;
    if (!api || typeof api.lookupPartitaIva !== 'function') {
      showClienteModalToast('Modulo autofill non disponibile', 'error');
      return;
    }
    const input = document.getElementById('clienteModalPiva');
    const piva = (input ? input.value : '').trim();
    const btn = document.getElementById('clienteAutofillBtn');
    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Caricamento...'; }
    try {
      const res = await api.lookupPartitaIva(piva);
      if (!res || !res.ok) {
        const code = res && res.code;
        if (code === 'INVALID_PIVA') {
          showClienteModalToast('P.IVA non valida (deve essere 11 cifre)', 'error');
        } else if (code === 'NO_KEY') {
          showClienteModalToast('Configura API key openapi.it in Impostazioni', 'warn');
        } else if (code === 'NOT_FOUND') {
          showClienteModalToast('P.IVA non trovata in openapi.it', 'warn');
        } else if (code === 'NETWORK') {
          showClienteModalToast('Errore di rete, riprova', 'error');
        } else {
          showClienteModalToast((res && res.error) || 'Errore autofill', 'error');
        }
        return;
      }
      // ok: true — merge only into empty fields of the cliente record.
      const cliente = getClienti().find(c => c.id === id);
      if (!cliente) {
        showClienteModalToast('Cliente non trovato', 'error');
        return;
      }
      const payload = res.data || {};
      const mapping = [
        ['nome', 'nome'],
        ['cf', 'codiceFiscale'],
        ['indirizzo', 'indirizzo'],
        ['cap', 'cap'],
        ['citta', 'citta'],
        ['provincia', 'provincia'],
        ['pec', 'pec'],
        ['codiceSDI', 'codiceSDI']
      ];
      let applied = 0, skipped = 0, available = 0;
      for (const [srcKey, targetField] of mapping) {
        const incoming = (payload[srcKey] || '').toString().trim();
        if (!incoming) continue;
        available++;
        const current = (cliente[targetField] || '').toString().trim();
        if (current) { skipped++; continue; }
        updateClienteField(id, targetField, incoming);
        applied++;
      }
      // Re-render modal so new values display (updateClienteField intentionally
      // skips re-render to preserve input focus).
      if (clienteModalState.id === id) renderClienteModal(id);
      if (applied === 0 && available === 0) {
        showClienteModalToast('Nessun dato disponibile da openapi.it', 'warn');
      } else if (skipped > 0) {
        showClienteModalToast('Autofill completato (alcuni campi già compilati non sono stati modificati)');
      } else {
        showClienteModalToast('Dati cliente compilati');
      }
    } catch (err) {
      showClienteModalToast('Errore autofill: ' + ((err && err.message) || err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText || '🔍 Autofill'; }
    }
  }

  function matchesClienteSearch(cliente, query) {
    if (!query) return true;
    const haystack = [
      cliente.nome,
      cliente.partitaIva,
      cliente.codiceFiscale,
      cliente.codiceSDI,
      cliente.pec,
      cliente.indirizzo,
      cliente.citta,
      cliente.provincia,
      cliente.note
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  function validatePercentValue(value, fallback) {
    const num = parseFloat(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(Math.max(num, 0), 100);
  }

  function validateMoneyValue(value, fallback) {
    const num = parseFloat(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(num, 0);
  }

  function normalizeProfileFiscalData(input, profile = currentProfile) {
    const base = getProfileFiscalDefaults(profile);
    const merged = { ...base, ...(input || {}) };
    return {
      nome: String(merged.nome || base.nome || profile || ''),
      codiceFiscale: String(merged.codiceFiscale || ''),
      partitaIva: String(merged.partitaIva || ''),
      indirizzo: String(merged.indirizzo || ''),
      cap: String(merged.cap || ''),
      citta: String(merged.citta || ''),
      provincia: String(merged.provincia || '').toUpperCase(),
      nazione: String(merged.nazione || base.nazione || 'IT').toUpperCase(),
      ateco: String(merged.ateco || base.ateco || ''),
      atecoDescrizione: String(merged.atecoDescrizione || base.atecoDescrizione || ''),
      atecoGruppo: String(merged.atecoGruppo || base.atecoGruppo || ''),
      iban: String(merged.iban || ''),
      modalitaPagamento: String(merged.modalitaPagamento || base.modalitaPagamento || 'Bonifico bancario'),
      coefficiente: validatePercentValue(merged.coefficiente, base.coefficiente || 67),
      impostaSostitutiva: validatePercentValue(merged.impostaSostitutiva, base.impostaSostitutiva || 15),
      inpsMode: normalizeInpsMode(merged.inpsMode || base.inpsMode),
      inpsCategoria: normalizeInpsCategory(merged.inpsCategoria || base.inpsCategoria),
      inpsTipoGestSep: normalizeGestSepTipo(merged.inpsTipoGestSep || base.inpsTipoGestSep),
      usaInpsUfficiale: parseInt(merged.usaInpsUfficiale, 10) === 0 ? 0 : 1,
      riduzione35: parseInt(merged.riduzione35, 10) === 1 ? 1 : 0,
      limiteForfettario: validateMoneyValue(merged.limiteForfettario, base.limiteForfettario || 85000),
      agevolazioneStartUp: parseInt(merged.agevolazioneStartUp, 10) === 1 ? 1 : 0,
      primoAnnoAgevolato: parseInt(merged.primoAnnoAgevolato, 10) === 1 ? 1 : 0,
      note: String(merged.note || '')
    };
  }

  function getStoredProfileFiscal(profile = currentProfile) {
    const raw = localStorage.getItem(profileStorageKey(profile));
    return normalizeProfileFiscalData(raw ? JSON.parse(raw) : {}, profile);
  }

  function loadProfileFiscalData() {
    const data = getStoredProfileFiscal(currentProfile);
    updateProfileAvatar();
    return data;
  }

  function saveProfileFiscalData(nextData) {
    const normalized = normalizeProfileFiscalData(nextData, currentProfile);
    localStorage.setItem(profileStorageKey(currentProfile), JSON.stringify(normalized));
    updateProfileAvatar();
    return normalized;
  }

  function getProfileFiscalData() {
    // C4: compat shim — legacy shape synthesized from settings.anagrafica/attivita/settings
    const ana = (data && data.settings && data.settings.anagrafica) || {};
    const att = (data && data.settings && data.settings.attivita) || {};
    const s = (data && data.settings) || {};
    const nome = String(ana.nome || '').trim();
    const cognome = String(ana.cognome || '').trim();
    const displayName = [nome, cognome].filter(Boolean).join(' ') || (currentProfile || '');
    return {
      nome: displayName,
      cognome: cognome,
      codiceFiscale: String(ana.codiceFiscale || ''),
      partitaIva: String(att.partitaIva || ''),
      indirizzo: String(ana.residenzaVia || ''),
      cap: String(ana.residenzaCap || ''),
      citta: String(ana.residenzaComune || ''),
      provincia: String(ana.residenzaProv || '').toUpperCase(),
      nazione: String(ana.nazione || 'IT').toUpperCase(),
      ateco: String(att.codiceAteco || ''),
      atecoDescrizione: String(att.descrizioneAttivita || ''),
      atecoGruppo: String(att.atecoGruppo || ''),
      iban: String(ana.iban || ''),
      modalitaPagamento: String(ana.modalitaPagamento || 'Bonifico bancario'),
      coefficiente: parseFloat(s.coefficiente) || 67,
      impostaSostitutiva: parseFloat(s.impostaSostitutiva) || 15,
      inpsMode: s.inpsMode || 'artigiani_commercianti',
      inpsCategoria: s.inpsCategoria || 'artigiano',
      inpsTipoGestSep: s.inpsTipoGestSep || '',
      usaInpsUfficiale: parseInt(s.usaInpsUfficiale, 10) === 0 ? 0 : 1,
      riduzione35: parseInt(s.riduzione35, 10) === 1 ? 1 : 0,
      limiteForfettario: parseFloat(s.limiteForfettario) || 85000,
      agevolazioneStartUp: parseInt(att.agevolazioneStartUp, 10) === 1 ? 1 : 0,
      primoAnnoAgevolato: parseInt(att.primoAnnoAgevolato, 10) === 1 ? 1 : 0,
      note: String(att.note || ''),
      inailTasso: parseFloat(s.inailTasso) || 0
    };
  }

  function syncProfileFieldsToSettings(settings, year) {
    const target = settings || {};
    const profile = getProfileFiscalData();
    for (const field of PROFILE_SYNC_FIELDS) target[field] = profile[field];
    if (profile.usaInpsUfficiale === 1) syncOfficialInpsValues(target, year);
    return target;
  }

  function syncProfileFiscalToStoredYears() {
    const profile = getProfileFiscalData();
    if (data && data.settings) syncProfileFieldsToSettings(data.settings, currentYear);
    const prefix = window.StorageKeys.profilePrefix(currentProfile);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const year = parseInt(key.slice(prefix.length), 10);
      const parsed = ensureDataShape(JSON.parse(localStorage.getItem(key)), year);
      syncProfileFieldsToSettings(parsed.settings, year);
      localStorage.setItem(key, JSON.stringify(parsed));
    }
    if (data && data.settings) saveData();
  }

  function normalizeInpsMode(mode) {
    return mode === 'gestione_separata' ? 'gestione_separata' : 'artigiani_commercianti';
  }

  function normalizeInpsCategory(category) {
    return category === 'commerciante' ? 'commerciante' : 'artigiano';
  }

  function inferInpsMode(settings) {
    const s = settings || {};
    if (s.inpsMode !== undefined) return normalizeInpsMode(s.inpsMode);
    const contribFissi = parseFloat(s.contribFissi) || 0;
    const minimale = parseFloat(s.minimaleInps) || 0;
    return contribFissi <= 0 && minimale <= 0 ? 'gestione_separata' : 'artigiani_commercianti';
  }

  function getInpsMode(settings) {
    return inferInpsMode(settings);
  }

  function getInpsCategory(settings) {
    const s = settings || {};
    return normalizeInpsCategory(s.inpsCategoria);
  }

  function getInpsCategoryLabel(category) {
    return normalizeInpsCategory(category) === 'commerciante' ? 'Commerciante' : 'Artigiano';
  }

  function getOfficialArtComInpsParams(year, category) {
    const targetYear = parseInt(year, 10) || currentYear;
    const categoryKey = normalizeInpsCategory(category);
    const knownYears = Object.keys(OFFICIAL_ARTCOM_INPS).map(Number).sort((a, b) => a - b);
    const below = knownYears.filter(y => y <= targetYear);
    const fallbackYear = below.length > 0 ? below[below.length - 1] : knownYears[0];
    const yearUsed = OFFICIAL_ARTCOM_INPS[targetYear] ? targetYear : fallbackYear;
    const base = OFFICIAL_ARTCOM_INPS[yearUsed];
    if (!base) return null;
    return {
      minimaleInps: base.minimaleInps,
      contribFissi: base[categoryKey].contribFissi,
      aliqContributi: base[categoryKey].aliqContributi,
      category: categoryKey,
      yearUsed,
      isFallback: yearUsed !== targetYear
    };
  }

  function usesOfficialInpsValues(settings) {
    const s = settings || {};
    if ((parseInt(s.usaInpsUfficiale, 10) || 0) !== 1) return false;
    const mode = getInpsMode(s);
    return mode === 'artigiani_commercianti' || mode === 'gestione_separata';
  }

  function getResolvedInpsSettings(settings, year) {
    const s = settings || {};
    if (!usesOfficialInpsValues(s)) return { ...s };
    const mode = getInpsMode(s);
    if (mode === 'gestione_separata') {
      const official = getOfficialGestSepAliquota(year, s.inpsTipoGestSep);
      return {
        ...s,
        aliqContributi: official.aliqContributi,
        inpsTipoGestSep: official.tipo,
        _officialInpsYear: official.yearUsed,
        _officialInpsFallback: official.isFallback
      };
    }
    const official = getOfficialArtComInpsParams(year, getInpsCategory(s));
    if (!official) return { ...s };
    return {
      ...s,
      minimaleInps: official.minimaleInps,
      contribFissi: official.contribFissi,
      aliqContributi: official.aliqContributi,
      inpsCategoria: official.category,
      _officialInpsYear: official.yearUsed,
      _officialInpsFallback: official.isFallback
    };
  }

  function syncOfficialInpsValues(settings, year) {
    const s = settings || {};
    if (!usesOfficialInpsValues(s)) return s;
    const mode = getInpsMode(s);
    if (mode === 'gestione_separata') {
      const official = getOfficialGestSepAliquota(year, s.inpsTipoGestSep);
      s.aliqContributi = official.aliqContributi;
      s.inpsTipoGestSep = official.tipo;
      return s;
    }
    const official = getOfficialArtComInpsParams(year, getInpsCategory(s));
    if (!official) return s;
    s.minimaleInps = official.minimaleInps;
    s.contribFissi = official.contribFissi;
    s.aliqContributi = official.aliqContributi;
    s.inpsCategoria = official.category;
    return s;
  }

  function getInpsModeLabel(mode) {
    return mode === 'gestione_separata' ? 'Gestione Separata' : 'Artigiani/Commercianti';
  }

  function getGestSepTipoLabel(tipo) {
    return normalizeGestSepTipo(tipo) === 'altra_cassa'
      ? 'Altra cassa / pensionato'
      : 'Esclusivo (libero prof.)';
  }

  function getAtecoGruppoLabel(profile) {
    const groups = (window.ATECO_COEFFICIENTI && window.ATECO_COEFFICIENTI.GRUPPI) || [];
    const id = profile && profile.atecoGruppo;
    if (id) {
      const g = groups.find(x => x.id === id);
      if (g) return `${g.label} (${g.coefficiente}%)`;
    }
    if (profile && profile.coefficiente !== undefined && profile.coefficiente !== '') {
      const g = window.ATECO_COEFFICIENTI && window.ATECO_COEFFICIENTI.findGruppoByCoefficiente(profile.coefficiente);
      if (g) return `${g.label} (${g.coefficiente}%) [auto]`;
    }
    return 'Personalizzato';
  }

  function getContribLabel(mode) {
    return mode === 'gestione_separata' ? 'Contributi previdenziali' : 'Contributi INPS';
  }

  function getPaymentTypeLabel(type) {
    return PAYMENT_TYPES[type]?.label || PAYMENT_TYPES.altro.label;
  }

  function getIrpefBracketsForYear(year) {
    const y = parseInt(year, 10) || currentYear;
    if (y >= 2024) {
      return [
        { l: 28000, a: 0.23 },
        { l: 50000, a: 0.35 },
        { l: Infinity, a: 0.43 }
      ];
    }
    return [
      { l: 15000, a: 0.23 },
      { l: 28000, a: 0.25 },
      { l: 50000, a: 0.35 },
      { l: Infinity, a: 0.43 }
    ];
  }

  function getIrpefBracketLabelsForYear(year) {
    const y = parseInt(year, 10) || currentYear;
    if (y >= 2024) {
      return ['0-28.000 (23%)', '28.001-50.000 (35%)', 'Oltre 50.000 (43%)'];
    }
    return ['0-15.000 (23%)', '15.001-28.000 (25%)', '28.001-50.000 (35%)', 'Oltre 50.000 (43%)'];
  }

  function calcInpsContributions(imponibile, settings, year) {
    const s = getResolvedInpsSettings(settings, year || currentYear);
    const mode = getInpsMode(s);
    const base = Math.max(parseFloat(imponibile) || 0, 0);
    const aliquota = (parseFloat(s.aliqContributi) || 0) / 100;

    if (mode === 'gestione_separata') {
      const massimale = getGestSepMassimale(year || currentYear);
      const cappedBase = Math.min(base, massimale);
      const cV = cappedBase * aliquota;
      return { mode, cF: 0, cV, cT: cV, imponibile: base, massimale, cappedBase };
    }

    const cF = Math.max(parseFloat(s.contribFissi) || 0, 0);
    const minimale = Math.max(parseFloat(s.minimaleInps) || 0, 0);
    const eccedenza = Math.max(base - minimale, 0);
    const cV = eccedenza * aliquota;
    return { mode, cF, cV, cT: cF + cV, imponibile: base, minimale, eccedenza };
  }

  function migrateFattureFor(target) {
    const fatture = target.fatture || {};
    for (const m of Object.keys(fatture)) {
      const v = fatture[m];
      if (typeof v === 'number') {
        fatture[m] = [{ importo: v, pagMese: null, pagAnno: null, desc: '' }];
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (v.pagMese === undefined) v.pagMese = null;
        if (v.pagAnno === undefined) v.pagAnno = null;
        if (v.desc === undefined) v.desc = '';
        fatture[m] = [v];
      }
      // Already array: leave as-is
    }
  }

  function ensureDataShape(target, year = currentYear) {
    const targetYear = parseInt(year, 10) || currentYear;
    const out = target || {};
    const defaultSettings = getDefaultSettings(targetYear);
    if (!out.settings) out.settings = { ...defaultSettings };
    if (!out.fatture) out.fatture = {};
    if (!out.calendar) out.calendar = {};
    if (!out.accantonamento) out.accantonamento = {};
    if (!out.pagamenti) out.pagamenti = [];
    if (!out.budget) out.budget = [];
    if (!out.spese) out.spese = [];
    if (!out.lmQuadro || typeof out.lmQuadro !== 'object') out.lmQuadro = { overrides: {} };
    if (!out.lmQuadro.overrides || typeof out.lmQuadro.overrides !== 'object') out.lmQuadro.overrides = {};
    for (const [key, value] of Object.entries(defaultSettings)) {
      if (out.settings[key] === undefined) out.settings[key] = value;
    }
    out.settings.inpsMode = inferInpsMode(out.settings);
    out.settings.inpsCategoria = getInpsCategory(out.settings);
    syncOfficialInpsValues(out.settings, targetYear);
    migrateFattureFor(out);

    // Wipe one-time del legacy data.fatture[m] (vecchia tabella mensile rimossa).
    // I dati validi sono in fattureEmesse (wizard + XML import). Backup conservato
    // localmente per safety; non syncato su Firebase (vedi cleanForFirestore).
    if (!out._fattureManualeWiped) {
      const hasLegacyEntries = out.fatture && Object.keys(out.fatture).some(k =>
        Array.isArray(out.fatture[k]) && out.fatture[k].length > 0
      );
      if (hasLegacyEntries) {
        out._fattureManualeWipedBackup = JSON.parse(JSON.stringify(out.fatture));
        out.fatture = {};
        out._fattureManualeWiped = new Date().toISOString();
      }
    }

    if (!out.settings.anagrafica) out.settings.anagrafica = {
      codiceFiscale: '', cognome: '', nome: '', sesso: '', dataNascita: '',
      comuneNascita: '', provNascita: '',
      residenzaVia: '', residenzaComune: '', residenzaProv: '', residenzaCap: '',
      domicilioFiscaleVia: '', domicilioFiscaleComune: '', domicilioFiscaleProv: '', domicilioFiscaleCap: '',
      telefono: '', email: '', statoCivile: '',
      nazione: 'IT', iban: '', modalitaPagamento: 'Bonifico bancario'
    };
    const anaDefaults = { nazione: 'IT', iban: '', modalitaPagamento: 'Bonifico bancario' };
    for (const [k, v] of Object.entries(anaDefaults)) {
      if (out.settings.anagrafica[k] === undefined) out.settings.anagrafica[k] = v;
    }
    if (!out.settings.attivita) out.settings.attivita = {
      codiceAteco: '', descrizioneAttivita: '', dataInizioAttivita: '',
      sedeVia: '', sedeComune: '', sedeProv: '', sedeCap: '',
      partitaIva: '', atecoGruppo: '', note: '',
      agevolazioneStartUp: 0, primoAnnoAgevolato: 0
    };
    const attDefaults = { partitaIva: '', atecoGruppo: '', note: '', agevolazioneStartUp: 0, primoAnnoAgevolato: 0 };
    for (const [k, v] of Object.entries(attDefaults)) {
      if (out.settings.attivita[k] === undefined) out.settings.attivita[k] = v;
    }
    // Dichiarazione Redditi PF
    if (!out.dichiarazione || typeof out.dichiarazione !== 'object') {
      out.dichiarazione = {
        tipoDichiarazione: 'ordinaria',
        dataPresentazione: null,
        flags: { annoMisto: false, imposteEstere: false, altriCrediti: false },
        contiEsteri: [],
        coniuge: null,
        familiariCarico: [],
        overrides: {},
        computed: null,
        statoCompilazione: 'bozza'
      };
    }
    if (out.lmQuadro && out.lmQuadro.overrides) {
      if (!out.dichiarazione.overrides) out.dichiarazione.overrides = {};
      Object.assign(out.dichiarazione.overrides, out.lmQuadro.overrides);
      delete out.lmQuadro; // safe: in-memory only; saveData() caller persists
    }
    return out;
  }

  let _yearDataCache = new Map();

  function clearYearDataCache() {
    if (typeof _yearDataCache !== 'undefined') {
      _yearDataCache.clear();
    }
  }

  function loadYearData(y) {
    if (y === currentYear) {
      const shaped = ensureDataShape(data, y);
      syncProfileFieldsToSettings(shaped.settings, y);
      return shaped;
    }
    if (_yearDataCache.has(y)) {
      return _yearDataCache.get(y);
    }
    const raw = localStorage.getItem(storageKey(y));
    if (!raw) return null;
    const shaped = ensureDataShape(JSON.parse(raw), y);
    syncProfileFieldsToSettings(shaped.settings, y);
    _yearDataCache.set(y, shaped);
    return shaped;
  }

  function migrateProfileFiscalToSettings() {
    if (!currentProfile) return;
    const flagKey = window.StorageKeys.profileFiscalMigrated(currentProfile);
    if (localStorage.getItem(flagKey) === '1') return;
    const srcKey = window.StorageKeys.profileFiscalLegacy(currentProfile);
    const raw = localStorage.getItem(srcKey);
    if (!raw) { localStorage.setItem(flagKey, '1'); return; }
    let src; try { src = JSON.parse(raw); } catch { src = null; }
    if (!src || typeof src !== 'object') { localStorage.removeItem(srcKey); localStorage.setItem(flagKey, '1'); return; }
    const ana = data.settings.anagrafica;
    const att = data.settings.attivita;
    const s = data.settings;
    if (!ana.nome && !ana.cognome && src.nome) {
      const parts = String(src.nome).trim().split(/\s+/);
      ana.nome = parts[0] || '';
      ana.cognome = parts.slice(1).join(' ') || '';
    }
    const copyIfEmpty = (obj, key, val) => { if ((obj[key] === '' || obj[key] == null) && val) obj[key] = val; };
    copyIfEmpty(ana, 'codiceFiscale', src.codiceFiscale);
    copyIfEmpty(ana, 'residenzaVia', src.indirizzo);
    copyIfEmpty(ana, 'residenzaCap', src.cap);
    copyIfEmpty(ana, 'residenzaComune', src.citta);
    copyIfEmpty(ana, 'residenzaProv', src.provincia);
    copyIfEmpty(ana, 'nazione', src.nazione);
    copyIfEmpty(ana, 'iban', src.iban);
    copyIfEmpty(ana, 'modalitaPagamento', src.modalitaPagamento);
    copyIfEmpty(att, 'partitaIva', src.partitaIva);
    copyIfEmpty(att, 'codiceAteco', src.ateco);
    copyIfEmpty(att, 'descrizioneAttivita', src.atecoDescrizione);
    copyIfEmpty(att, 'atecoGruppo', src.atecoGruppo);
    copyIfEmpty(att, 'note', src.note);
    if (src.agevolazioneStartUp === 1) att.agevolazioneStartUp = 1;
    if (src.primoAnnoAgevolato === 1) att.primoAnnoAgevolato = 1;
    if ((s.coefficiente == null || s.coefficiente === '') && src.coefficiente) s.coefficiente = src.coefficiente;
    if ((s.impostaSostitutiva == null || s.impostaSostitutiva === '') && src.impostaSostitutiva) s.impostaSostitutiva = src.impostaSostitutiva;
    if ((s.limiteForfettario == null || s.limiteForfettario === '') && src.limiteForfettario) s.limiteForfettario = src.limiteForfettario;
    if (src.usaInpsUfficiale !== undefined) s.usaInpsUfficiale = src.usaInpsUfficiale;
    if (src.riduzione35 === 1 && (s.riduzione35 == null || s.riduzione35 === 0)) s.riduzione35 = 1;
    if (src.inpsMode) s.inpsMode = src.inpsMode;
    if (src.inpsCategoria) s.inpsCategoria = src.inpsCategoria;
    if (src.inpsTipoGestSep) s.inpsTipoGestSep = src.inpsTipoGestSep;
    saveData();
    localStorage.removeItem(srcKey);
    localStorage.setItem(flagKey, '1');
  }

  function loadData() {
    const raw = localStorage.getItem(storageKey());
    data = ensureDataShape(raw ? JSON.parse(raw) : {}, currentYear);
    syncProfileFieldsToSettings(data.settings, currentYear);
    applySettings();
    migrateProfileFiscalToSettings();
    backfillAnagraficaAttivitaFromAllYears();
    applySettings();
  }

  function migrateFatture() {
    migrateFattureFor(data);
  }

  function saveData() {
    clearYearDataCache();
    if (data && data.settings) syncProfileFieldsToSettings(data.settings, currentYear);
    localStorage.setItem(storageKey(), JSON.stringify(data));
    if (typeof syncToCloud === 'function' && currentProfile) {
      syncToCloud(currentProfile, currentYear, data);
    }
  }

  function saveYearData(year, yearData) {
    clearYearDataCache();
    const normalized = ensureDataShape(yearData, year);
    syncProfileFieldsToSettings(normalized.settings, year);
    if (year === currentYear) {
      data = normalized;
      saveData();
      return;
    }
    localStorage.setItem(storageKey(year), JSON.stringify(normalized));
    if (typeof syncToCloud === 'function' && currentProfile) {
      syncToCloud(currentProfile, year, normalized);
    }
  }

  function getStoredYears(maxYear = currentYear) {
    const years = new Set([maxYear]);
    const prefix = window.StorageKeys.profilePrefix(currentProfile);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (!key.startsWith(prefix)) continue;
      const year = parseInt(key.slice(prefix.length), 10);
      if (!Number.isFinite(year) || year > maxYear) continue;
      years.add(year);
    }
    return Array.from(years).sort((a, b) => a - b);
  }

  function getAllStoredYears() {
    const years = new Set([currentYear]);
    const prefix = window.StorageKeys.profilePrefix(currentProfile);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (!key.startsWith(prefix)) continue;
      const year = parseInt(key.slice(prefix.length), 10);
      if (!Number.isFinite(year)) continue;
      years.add(year);
    }
    return Array.from(years).sort((a, b) => a - b);
  }

  function getDefaultSettings(year = currentYear) {
    const profile = getProfileFiscalData();
    const category = getInpsCategory(profile);
    const official = getOfficialArtComInpsParams(year, category) || {
      minimaleInps: 18415,
      contribFissi: 4427.04,
      aliqContributi: 24.0,
      category
    };
    let defaultAliq = official.aliqContributi;
    if (profile.inpsMode === 'gestione_separata' && (parseInt(profile.usaInpsUfficiale, 10) || 0) === 1) {
      defaultAliq = getOfficialGestSepAliquota(year, 'esclusivo').aliqContributi;
    }
    return {
      dailyRate: 0, coefficiente: profile.coefficiente, impostaSostitutiva: profile.impostaSostitutiva,
      contribFissi: official.contribFissi, minimaleInps: official.minimaleInps, aliqContributi: defaultAliq,
      riduzione35: 0, limiteForfettario: profile.limiteForfettario, regime: 'forfettario',
      haRedditoDipendente: 0,
      inpsMode: profile.inpsMode,
      inpsCategoria: official.category,
      inpsTipoGestSep: 'esclusivo',
      usaInpsUfficiale: profile.usaInpsUfficiale,
      giorniIncasso: 30,
      scadenziarioRangePct: 5,
      scadenziarioMetodoAcconti: 'storico',
      scadenziarioPrevisionaleImposta: '',
      scadenziarioPrevisionaleContributi: '',
      scadenziarioSaldoImposta: '',
      scadenziarioAccontoImposta: '',
      scadenziarioSaldoContributi: '',
      scadenziarioAccontoContributi: '',
      scadenziarioOverrideDataSaldoImposta: '',
      scadenziarioDirittoCamerale: '',
      scadenziarioBolloPrecedenteQ4: '',
      scadenziarioBolloCorrenteQ4: '',
      scadenziarioInailCorrente: '',
      scadenziarioInailSuccessivo: '',
      primoAnnoFatturatoPrec: '',
      primoAnnoImpostaPrec: '',
      primoAnnoAccontiImpostaPrec: '',
      primoAnnoContribVariabiliPrec: '',
      primoAnnoAccontiContribPrec: ''
    };
  }

  function applySettings() {
    const s = data.settings;
    const fields = {
      settDailyRate: 'dailyRate',
      settDipendenteIncome: 'haRedditoDipendente',
      settRiduzione35: 'riduzione35'
    };
    for (const [id, key] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = s[key];
    }
    // giorniIncasso: lettura profile-scoped con fallback a yearData legacy
    var gipVal = getGiorniIncassoProfile();
    if (gipVal === null) {
      var legacy = (s && s.giorniIncasso !== undefined) ? parseFloat(s.giorniIncasso) : NaN;
      if (isFinite(legacy) && legacy !== 30) {
        setGiorniIncassoProfile(legacy);
        gipVal = legacy;
      } else {
        gipVal = 30;
      }
    }
    s.giorniIncasso = gipVal;
    var gIn = document.getElementById('settGiorniIncasso');
    if (gIn) gIn.value = gipVal;
    // Optional number fields (empty string = not set)
    const optFields = {
      settInailCorrente: 'scadenziarioInailCorrente',
      settInailSuccessivo: 'scadenziarioInailSuccessivo',
      settDirittoCamerale: 'scadenziarioDirittoCamerale'
    };
    for (const [id, key] of Object.entries(optFields)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = s[key] !== '' && s[key] !== null && s[key] !== undefined ? s[key] : '';
    }
    const speseBtn = document.querySelector('[data-tab="spese"]');
    if (speseBtn) speseBtn.style.display = s.regime === 'ordinario' ? '' : 'none';
    if (typeof updateNavLabels === 'function') updateNavLabels();
    // C4: parametri fiscali
    const coefI = document.getElementById('settCoefficiente'); if (coefI) coefI.value = s.coefficiente ?? '';
    const aliqI = document.getElementById('settAliquotaSost'); if (aliqI) aliqI.value = s.impostaSostitutiva ?? '';
    const uffI = document.getElementById('settUsaInpsUfficiale'); if (uffI) uffI.value = String(s.usaInpsUfficiale ?? 1);
    const devHD = document.getElementById('settDevHardDelete'); if (devHD) devHD.checked = (parseInt(s.devHardDelete, 10) || 0) === 1;
    populateAtecoGruppoSelect();
  }

  function populateAtecoGruppoSelect() {
    const sel = document.getElementById('settAtecoGruppo');
    if (!sel || !window.ATECO_COEFFICIENTI) return;
    const current = (S().attivita && S().attivita.atecoGruppo) || '';
    const options = ['<option value="">— scegli —</option>'];
    for (const [k, v] of Object.entries(window.ATECO_COEFFICIENTI)) {
      const label = `${k} — ${v.descrizione} (${v.coefficiente}%)`;
      options.push(`<option value="${escapeHtml(k)}" ${k===current?'selected':''}>${escapeHtml(label)}</option>`);
    }
    sel.replaceChildren();
    sel.insertAdjacentHTML('afterbegin', options.join(''));
  }

  function applyAtecoGruppo(value) {
    saveAttivitaField('atecoGruppo', value);
    if (value && window.ATECO_COEFFICIENTI && window.ATECO_COEFFICIENTI[value]) {
      const coeff = window.ATECO_COEFFICIENTI[value].coefficiente;
      saveSetting('coefficiente', coeff);
      const coefInput = document.getElementById('settCoefficiente');
      if (coefInput) coefInput.value = coeff;
    }
    if (typeof recalcAll === 'function') recalcAll();
  }

  function saveSetting(key, val) {
    data.settings[key] = parseFloat(val) || 0;
    saveData();
  }

  function saveTextSetting(key, val) {
    data.settings[key] = val;
    saveData();
    applySettings();
  }

  function saveOptionalNumberSetting(key, val) {
    data.settings[key] = String(val).trim() === '' ? '' : (parseFloat(val) || 0);
    saveData();
  }

  function saveBoolSetting(key, val) {
    data.settings[key] = val ? 1 : 0;
    saveData();
  }

  function saveAnagraficaField(key, val) {
    if (!data.settings.anagrafica) data.settings.anagrafica = {};
    data.settings.anagrafica[key] = val;
    saveData();
    propagateAnagraficaAttivitaAcrossYears();
  }

  function saveAttivitaField(key, val) {
    if (!data.settings.attivita) data.settings.attivita = {};
    data.settings.attivita[key] = val;
    saveData();
    propagateAnagraficaAttivitaAcrossYears();
  }

  // C4: anagrafica e attivita sono stabili fra anni — propaga da currentYear a tutti gli altri anni salvati del profilo
  function propagateAnagraficaAttivitaAcrossYears() {
    if (!currentProfile || !data || !data.settings) return;
    const ana = data.settings.anagrafica || {};
    const att = data.settings.attivita || {};
    const prefix = window.StorageKeys.profilePrefix(currentProfile);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const yearStr = key.slice(prefix.length);
      const year = parseInt(yearStr, 10);
      if (!Number.isFinite(year) || year === currentYear) continue;
      let doc; try { doc = JSON.parse(localStorage.getItem(key)); } catch { continue; }
      if (!doc || typeof doc !== 'object' || !doc.settings) continue;
      doc.settings.anagrafica = { ...(doc.settings.anagrafica || {}), ...ana };
      doc.settings.attivita = { ...(doc.settings.attivita || {}), ...att };
      localStorage.setItem(key, JSON.stringify(doc));
    }
  }

  // C4: al login, raccogli anagrafica/attivita da ogni anno (first-non-empty-wins) e propaga
  function backfillAnagraficaAttivitaFromAllYears() {
    if (!currentProfile) return;
    const prefix = window.StorageKeys.profilePrefix(currentProfile);
    const mergedAna = { ...(data.settings.anagrafica || {}) };
    const mergedAtt = { ...(data.settings.attivita || {}) };
    const fillFrom = (src, target) => {
      if (!src || typeof src !== 'object') return;
      for (const [k, v] of Object.entries(src)) {
        const existing = target[k];
        const empty = existing === undefined || existing === null || existing === '' || existing === 0;
        if (empty && v !== undefined && v !== null && v !== '' && v !== 0) target[k] = v;
      }
    };
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const yearStr = key.slice(prefix.length);
      if (!/^\d{4}$/.test(yearStr)) continue;
      let doc; try { doc = JSON.parse(localStorage.getItem(key)); } catch { continue; }
      if (!doc || !doc.settings) continue;
      fillFrom(doc.settings.anagrafica, mergedAna);
      fillFrom(doc.settings.attivita, mergedAtt);
    }
    // Fallback: PROFILE_FISCAL_LIBRARY legacy defaults (Mattia/Peru/Demo) — mappa legacy->nuovo
    const lib = PROFILE_FISCAL_LIBRARY[currentProfile];
    if (lib) {
      const nameParts = String(lib.nome || '').trim().split(/\s+/);
      const libAna = {
        nome: nameParts[0] || '',
        cognome: nameParts.slice(1).join(' ') || '',
        codiceFiscale: lib.codiceFiscale || '',
        residenzaVia: lib.indirizzo || '',
        residenzaCap: lib.cap || '',
        residenzaComune: lib.citta || '',
        residenzaProv: lib.provincia || '',
        nazione: lib.nazione || 'IT',
        iban: lib.iban || '',
        modalitaPagamento: lib.modalitaPagamento || ''
      };
      const libAtt = {
        partitaIva: lib.partitaIva || '',
        codiceAteco: lib.ateco || '',
        descrizioneAttivita: lib.atecoDescrizione || '',
        atecoGruppo: lib.atecoGruppo || '',
        note: lib.note || '',
        agevolazioneStartUp: lib.agevolazioneStartUp || 0,
        primoAnnoAgevolato: lib.primoAnnoAgevolato || 0
      };
      fillFrom(libAna, mergedAna);
      fillFrom(libAtt, mergedAtt);
      // parametri fiscali settings: se vuoti, prendi dal library
      const libSettings = { coefficiente: lib.coefficiente, impostaSostitutiva: lib.impostaSostitutiva,
        limiteForfettario: lib.limiteForfettario, inailTasso: lib.inailTasso,
        inpsMode: lib.inpsMode, inpsCategoria: lib.inpsCategoria, inpsTipoGestSep: lib.inpsTipoGestSep,
        usaInpsUfficiale: lib.usaInpsUfficiale };
      for (const [k, v] of Object.entries(libSettings)) {
        const ex = data.settings[k];
        const empty = ex === undefined || ex === null || ex === '' || ex === 0;
        if (empty && v !== undefined && v !== null && v !== '' && v !== 0) data.settings[k] = v;
      }
    }
    data.settings.anagrafica = mergedAna;
    data.settings.attivita = mergedAtt;
    saveData();
    propagateAnagraficaAttivitaAcrossYears();
  }

  function updateCfStatus(val) {
    const el = document.getElementById('cfStatus');
    if (!el) return;
    if (!val || val.trim() === '') { el.textContent = ''; el.className = 'cf-status'; return; }
    const ok = typeof DichiarazioneEngine !== 'undefined' && DichiarazioneEngine.validateCodiceFiscale(val);
    el.textContent = ok ? '\u2713' : '\u2717';
    el.className = 'cf-status ' + (ok ? 'ok' : 'err');
  }

  function saveYearTextSetting(year, key, val) {
    const yearData = getYearDataFor(year) || ensureDataShape({}, year);
    yearData.settings[key] = val;
    saveYearData(year, yearData);
  }

  function saveYearOptionalNumberSetting(year, key, val) {
    const yearData = getYearDataFor(year) || ensureDataShape({}, year);
    yearData.settings[key] = String(val).trim() === '' ? '' : (parseFloat(val) || 0);
    saveYearData(year, yearData);
  }

  function S() { return data.settings; }

  // Profile-scoped giorniIncasso (applicato a tutti gli anni).
  // Fallback: yearData.settings.giorniIncasso legacy, poi 30.
  function getGiorniIncassoProfile() {
    try {
      var profile = (typeof currentProfile !== 'undefined') ? currentProfile : null;
      if (!profile) return null;
      var raw = localStorage.getItem(window.StorageKeys.giorniIncasso(profile));
      if (raw === null || raw === '') return null;
      var parsed;
      try { parsed = JSON.parse(raw); } catch (_) { parsed = raw; }
      var n = parseFloat(parsed);
      return isFinite(n) ? n : null;
    } catch (_) { return null; }
  }

  function setGiorniIncassoProfile(val) {
    try {
      var profile = (typeof currentProfile !== 'undefined') ? currentProfile : null;
      if (!profile) return;
      var n = parseFloat(val);
      if (!isFinite(n)) n = 30;
      localStorage.setItem(window.StorageKeys.giorniIncasso(profile), JSON.stringify(n));
      if (typeof syncProfileMetaToCloud === 'function') {
        try { syncProfileMetaToCloud(profile); } catch (_) {}
      }
      if (data && data.settings) data.settings.giorniIncasso = n;
      if (typeof recalcAll === 'function') recalcAll();
    } catch (_) {}
  }

  function setRegime(r) {
    data.settings.regime = r;
    saveData();
    applySettings();
    recalcAll();
  }

  function changeYear(d) {
    closePicker();
    closePaymentDatePicker();
    saveData();
    currentYear += d;
    document.getElementById('yearDisplay').textContent = currentYear;
    loadData();
    recalcAll();
  }


  if (typeof window !== "undefined") {
    window.storageKey = storageKey;
    window.profileStorageKey = profileStorageKey;
    window.clientiStorageKey = clientiStorageKey;
    window.getProfileFiscalDefaults = getProfileFiscalDefaults;
    window.generateClientId = generateClientId;
    window.normalizeClienteField = normalizeClienteField;
    window.normalizeCliente = normalizeCliente;
    window.getClienti = getClienti;
    window.saveClienti = saveClienti;
    window.getClienteDefaultId = getClienteDefaultId;
    window.setClienteDefaultId = setClienteDefaultId;
    window.toggleClienteDefault = toggleClienteDefault;
    window.setClientiSearch = setClientiSearch;
    window.addCliente = addCliente;
    window.openClienteModal = openClienteModal;
    window.closeClienteModal = closeClienteModal;
    window.renderClienteModal = renderClienteModal;
    window.deleteClienteFromModal = deleteClienteFromModal;
    window.updateClienteField = updateClienteField;
    window.showClienteModalToast = showClienteModalToast;
    window.autofillClienteFromPiva = autofillClienteFromPiva;
    window.matchesClienteSearch = matchesClienteSearch;
    window.validatePercentValue = validatePercentValue;
    window.validateMoneyValue = validateMoneyValue;
    window.normalizeProfileFiscalData = normalizeProfileFiscalData;
    window.getStoredProfileFiscal = getStoredProfileFiscal;
    window.loadProfileFiscalData = loadProfileFiscalData;
    window.saveProfileFiscalData = saveProfileFiscalData;
    window.getProfileFiscalData = getProfileFiscalData;
    window.syncProfileFieldsToSettings = syncProfileFieldsToSettings;
    window.syncProfileFiscalToStoredYears = syncProfileFiscalToStoredYears;
    window.normalizeInpsMode = normalizeInpsMode;
    window.normalizeInpsCategory = normalizeInpsCategory;
    window.inferInpsMode = inferInpsMode;
    window.getInpsMode = getInpsMode;
    window.getInpsCategory = getInpsCategory;
    window.getInpsCategoryLabel = getInpsCategoryLabel;
    window.getOfficialArtComInpsParams = getOfficialArtComInpsParams;
    window.usesOfficialInpsValues = usesOfficialInpsValues;
    window.getResolvedInpsSettings = getResolvedInpsSettings;
    window.syncOfficialInpsValues = syncOfficialInpsValues;
    window.getInpsModeLabel = getInpsModeLabel;
    window.getGestSepTipoLabel = getGestSepTipoLabel;
    window.getAtecoGruppoLabel = getAtecoGruppoLabel;
    window.getContribLabel = getContribLabel;
    window.getPaymentTypeLabel = getPaymentTypeLabel;
    window.getIrpefBracketsForYear = getIrpefBracketsForYear;
    window.getIrpefBracketLabelsForYear = getIrpefBracketLabelsForYear;
    window.calcInpsContributions = calcInpsContributions;
    window.migrateFattureFor = migrateFattureFor;
    window.ensureDataShape = ensureDataShape;
    window.clearYearDataCache = clearYearDataCache;
    window.loadYearData = loadYearData;
    window.migrateProfileFiscalToSettings = migrateProfileFiscalToSettings;
    window.loadData = loadData;
    window.migrateFatture = migrateFatture;
    window.saveData = saveData;
    window.saveYearData = saveYearData;
    window.getStoredYears = getStoredYears;
    window.getAllStoredYears = getAllStoredYears;
    window.getDefaultSettings = getDefaultSettings;
    window.applySettings = applySettings;
    window.populateAtecoGruppoSelect = populateAtecoGruppoSelect;
    window.applyAtecoGruppo = applyAtecoGruppo;
    window.saveSetting = saveSetting;
    window.saveTextSetting = saveTextSetting;
    window.saveOptionalNumberSetting = saveOptionalNumberSetting;
    window.saveBoolSetting = saveBoolSetting;
    window.saveAnagraficaField = saveAnagraficaField;
    window.saveAttivitaField = saveAttivitaField;
    window.propagateAnagraficaAttivitaAcrossYears = propagateAnagraficaAttivitaAcrossYears;
    window.backfillAnagraficaAttivitaFromAllYears = backfillAnagraficaAttivitaFromAllYears;
    window.updateCfStatus = updateCfStatus;
    window.saveYearTextSetting = saveYearTextSetting;
    window.saveYearOptionalNumberSetting = saveYearOptionalNumberSetting;
    window.S = S;
    window.getGiorniIncassoProfile = getGiorniIncassoProfile;
    window.setGiorniIncassoProfile = setGiorniIncassoProfile;
    window.setRegime = setRegime;
    window.changeYear = changeYear;
  }
}());
