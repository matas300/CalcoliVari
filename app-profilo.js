// app-profilo.js — Render del tab Profilo (C4)
// Estratto da app.js per separare la presentazione del profilo dal core (SRP).
// Caricato DOPO app.js: usa S, escapeHtml, saveSetting, saveTextSetting,
// saveAnagraficaField, saveAttivitaField, recalcAll come globali.

(function () {
  'use strict';

  function renderProfiloField(label, opts) {
    var o = opts || {};
    var ns = o.namespace || 'anagrafica';
    var key = o.key || '';
    var mode = o.mode || 'text';
    var settings = S();
    var source = ns === 'settings' ? settings : (settings[ns] || {});
    var rawVal = source[key];
    var isSelect = mode === 'select';
    var displayValue;
    if (isSelect && Array.isArray(o.options)) {
      var match = o.options.find(function (op) { return String(op.value) === String(rawVal == null ? '' : rawVal); });
      displayValue = (match && match.label) || (rawVal == null ? '-' : rawVal);
    } else {
      displayValue = (rawVal !== undefined && rawVal !== null && String(rawVal) !== '') ? rawVal : '-';
    }
    var fieldId = 'pf-' + ns + '-' + key;
    var onclick = "enterProfiloEdit('" + ns + "','" + key + "','" + mode + "', this)";
    var optsAttr = o.options ? " data-options='" + escapeHtml(JSON.stringify(o.options)) + "'" : '';
    return '<div class="profilo-row">' +
      '<span class="profilo-label">' + escapeHtml(label) + '</span>' +
      '<span class="profilo-value" id="' + fieldId + '" tabindex="0" role="button"' +
      ' data-ns="' + ns + '" data-key="' + key + '" data-mode="' + mode + '"' + optsAttr +
      ' onclick="' + onclick + '"' +
      ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();' + onclick + '}">' +
      escapeHtml(String(displayValue)) + '</span>' +
      '</div>';
  }

  function saveProfiloField(ns, key, value) {
    if (ns === 'anagrafica') saveAnagraficaField(key, value);
    else if (ns === 'attivita') saveAttivitaField(key, value);
    else {
      var trimmed = String(value == null ? '' : value).trim();
      var isNumeric = trimmed !== '' && /^-?[\d.,]+$/.test(trimmed);
      if (isNumeric) saveSetting(key, value);
      else saveTextSetting(key, value);
    }
  }

  function enterProfiloEdit(ns, key, mode, el) {
    if (!el || el.classList.contains('editing')) return;
    var settings = S();
    var source = ns === 'settings' ? settings : (settings[ns] || {});
    var current = source[key];
    if (current == null) current = '';
    el.classList.add('editing');
    function finish(newVal) {
      saveProfiloField(ns, key, newVal);
      if (typeof recalcAll === 'function') recalcAll();
      rerenderProfiloTabs();
    }
    var editorHtml;
    if (mode === 'select') {
      var opts = el.dataset.options ? JSON.parse(el.dataset.options) : [];
      editorHtml = '<select>' + opts.map(function (o) {
        return '<option value="' + escapeHtml(String(o.value)) + '"' +
          (String(o.value) === String(current) ? ' selected' : '') + '>' +
          escapeHtml(o.label) + '</option>';
      }).join('') + '</select>';
    } else {
      var inputType = mode === 'number' ? 'number' : 'text';
      editorHtml = '<input type="' + inputType + '" value="' + escapeHtml(String(current)) + '">';
    }
    el.replaceChildren();
    el.insertAdjacentHTML('afterbegin', editorHtml);
    var field = el.firstElementChild;
    field.focus();
    if (field.tagName === 'INPUT') field.select();
    if (mode === 'select') {
      field.addEventListener('change', function () { finish(field.value); });
      field.addEventListener('blur', function () { finish(field.value); });
    } else {
      field.addEventListener('blur', function () { finish(field.value); });
      field.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); field.blur(); }
        else if (e.key === 'Escape') { rerenderProfiloTabs(); }
      });
    }
  }

  function rerenderProfiloTabs() {
    var personale = document.getElementById('tab-profilo-personale');
    var piva = document.getElementById('tab-profilo-piva');
    if (personale && personale.classList.contains('active')) renderProfiloPersonale();
    if (piva && piva.classList.contains('active')) renderProfiloPiva();
  }

  function renderProfiloPersonale() {
    var host = document.getElementById('profilo-personale-content');
    if (!host) return;
    var html =
      '<div class="profilo-page">' +
      '<h2 class="profilo-title">Profilo personale</h2>' +
      '<p class="profilo-subtitle">Dati anagrafici e di fatturazione. Clicca un valore per modificarlo.</p>' +
      '<section class="profilo-group">' +
      '<h3 class="profilo-group-head">Anagrafica</h3>' +
      '<div class="profilo-rows">' +
      renderProfiloField('Nome', { namespace: 'anagrafica', key: 'nome' }) +
      renderProfiloField('Cognome', { namespace: 'anagrafica', key: 'cognome' }) +
      renderProfiloField('Codice fiscale', { namespace: 'anagrafica', key: 'codiceFiscale' }) +
      '</div></section>' +
      '<section class="profilo-group">' +
      '<h3 class="profilo-group-head">Residenza</h3>' +
      '<div class="profilo-rows">' +
      renderProfiloField('Indirizzo', { namespace: 'anagrafica', key: 'residenzaVia' }) +
      renderProfiloField('CAP', { namespace: 'anagrafica', key: 'residenzaCap' }) +
      renderProfiloField('Citta', { namespace: 'anagrafica', key: 'residenzaComune' }) +
      renderProfiloField('Provincia', { namespace: 'anagrafica', key: 'residenzaProv' }) +
      renderProfiloField('Nazione', { namespace: 'anagrafica', key: 'nazione' }) +
      '</div></section>' +
      '<section class="profilo-group">' +
      '<h3 class="profilo-group-head">Fatturazione</h3>' +
      '<div class="profilo-rows">' +
      renderProfiloField('IBAN', { namespace: 'anagrafica', key: 'iban' }) +
      renderProfiloField('Modalita pagamento', { namespace: 'anagrafica', key: 'modalitaPagamento' }) +
      '</div></section>' +
      '</div>';
    host.replaceChildren();
    host.insertAdjacentHTML('afterbegin', html);
  }

  function renderProfiloPiva() {
    var host = document.getElementById('profilo-piva-content');
    if (!host) return;
    var s = S();
    var inpsMode = s.inpsMode || 'artigiani_commercianti';
    var inpsModeOptions = [
      { value: 'artigiani_commercianti', label: 'Artigiani / Commercianti' },
      { value: 'gestione_separata', label: 'Gestione Separata' }
    ];
    var inpsCategoriaOptions = [
      { value: 'artigiano', label: 'Artigiano' },
      { value: 'commerciante', label: 'Commerciante' }
    ];
    var tipoGestSepOptions = [
      { value: 'senza_altra_copertura', label: 'Senza altra copertura previdenziale' },
      { value: 'con_altra_copertura', label: 'Con altra copertura previdenziale' }
    ];
    var agevolazioneOptions = [
      { value: 0, label: 'No' },
      { value: 1, label: 'Si' }
    ];

    var previdenzaRows = renderProfiloField('Gestione previdenziale', {
      namespace: 'settings', key: 'inpsMode', mode: 'select', options: inpsModeOptions
    });
    if (inpsMode === 'artigiani_commercianti') {
      previdenzaRows += renderProfiloField('Categoria INPS', {
        namespace: 'settings', key: 'inpsCategoria', mode: 'select', options: inpsCategoriaOptions
      });
    } else if (inpsMode === 'gestione_separata') {
      previdenzaRows += renderProfiloField('Tipologia Gestione Separata', {
        namespace: 'settings', key: 'inpsTipoGestSep', mode: 'select', options: tipoGestSepOptions
      });
    }

    var html =
      '<div class="profilo-page">' +
      '<h2 class="profilo-title">Profilo P.IVA</h2>' +
      '<p class="profilo-subtitle">Dati fiscali dell\'attivita. Clicca un valore per modificarlo.</p>' +
      '<section class="profilo-group">' +
      '<h3 class="profilo-group-head">Attivita</h3>' +
      '<div class="profilo-rows">' +
      renderProfiloField('Partita IVA', { namespace: 'attivita', key: 'partitaIva' }) +
      renderProfiloField('Codice ATECO', { namespace: 'attivita', key: 'codiceAteco' }) +
      renderProfiloField('Descrizione attivita', { namespace: 'attivita', key: 'descrizioneAttivita' }) +
      renderProfiloField('Note', { namespace: 'attivita', key: 'note' }) +
      '</div></section>' +
      '<section class="profilo-group">' +
      '<h3 class="profilo-group-head">Previdenza</h3>' +
      '<div class="profilo-rows">' + previdenzaRows + '</div></section>' +
      '<section class="profilo-group">' +
      '<h3 class="profilo-group-head">Agevolazioni</h3>' +
      '<div class="profilo-rows">' +
      renderProfiloField('Agevolazione start-up', { namespace: 'attivita', key: 'agevolazioneStartUp', mode: 'select', options: agevolazioneOptions }) +
      renderProfiloField('Primo anno agevolato', { namespace: 'attivita', key: 'primoAnnoAgevolato', mode: 'select', options: agevolazioneOptions }) +
      '</div></section>' +
      '</div>';
    host.replaceChildren();
    host.insertAdjacentHTML('afterbegin', html);
  }

  if (typeof window !== 'undefined') {
    window.renderProfiloField = renderProfiloField;
    window.saveProfiloField = saveProfiloField;
    window.enterProfiloEdit = enterProfiloEdit;
    window.rerenderProfiloTabs = rerenderProfiloTabs;
    window.renderProfiloPersonale = renderProfiloPersonale;
    window.renderProfiloPiva = renderProfiloPiva;
  }
})();
