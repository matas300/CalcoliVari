(function () {
  'use strict';

  var _containerId = null;
  var _year = null;
  var _currentStep = 1;

  // ── Data accessors ──────────────────────────────────────────────────────────

  function getYearData() {
    // app.js exposes current year data as the global `data` variable
    if (typeof data !== 'undefined' && data) return data;
    // Fallback: try loadYearData if available
    if (typeof loadYearData === 'function') return loadYearData(_year);
    return null;
  }

  function getDichiarazione() {
    var yd = getYearData();
    return (yd && yd.dichiarazione) ? yd.dichiarazione : {};
  }

  function buildDichiarazioneSnapshot() {
    var yd = getYearData();
    if (!yd || !window.DichiarazioneEngine) return {};
    var dich = yd.dichiarazione || {};
    var input = {
      tipoDichiarazione: dich.tipoDichiarazione || 'ordinaria',
      flags: dich.flags || { annoMisto: false, imposteEstere: false, altriCrediti: false },
      contiEsteri: dich.contiEsteri || [],
      overrides: dich.overrides || {}
    };
    return window.DichiarazioneEngine.buildDichiarazione(_year, yd, input);
  }

  // ── Steps definition ────────────────────────────────────────────────────────

  var STEPS = [
    { id: 1,  label: 'Anno & tipo',        conditional: null },
    { id: 2,  label: 'Frontespizio',       conditional: null },
    { id: 3,  label: 'Quadro LM',          conditional: null },
    { id: 4,  label: 'Quadro RR',          conditional: null },
    { id: 5,  label: 'Quadro RS',          conditional: null },
    { id: 6,  label: 'Quadro RW',          conditional: null },
    { id: 7,  label: 'Quadro RX',          conditional: null },
    { id: 8,  label: 'RN/RP/RV',           conditional: 'annoMisto' },
    { id: 9,  label: 'Quadro CE',          conditional: 'imposteEstere' },
    { id: 10, label: 'Quadro CR',          conditional: 'altriCrediti' },
    { id: 11, label: 'Validazione',        conditional: null },
    { id: 12, label: 'Riepilogo & Export', conditional: null }
  ];

  function isStepVisible(step) {
    if (!step.conditional) return true;
    var dich = getDichiarazione();
    var flags = dich.flags || {};
    return !!flags[step.conditional];
  }

  // ── Utility ──────────────────────────────────────────────────────────────────

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtEur(val) {
    return (val || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  }

  function roField(label, val) {
    return '<div class="dich-field-group"><label>' + escHtml(label) + '</label>' +
      '<input type="text" value="' + escHtml(val || '') + '" readonly class="dich-readonly"></div>';
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────────

  function renderSidebar() {
    var html = '<div class="dich-sidebar">';
    STEPS.forEach(function (step) {
      if (!isStepVisible(step)) return;
      var cls = 'dich-step-item' + (step.id === _currentStep ? ' active' : '');
      html += '<div class="' + cls + '" onclick="window.DichiarazioneUI.goToStep(' + step.id + ')" data-step="' + step.id + '">';
      html += '<span class="dich-step-num">' + step.id + '</span>';
      html += '<span class="dich-step-label">' + escHtml(step.label) + '</span>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // ── Step 1: Anno & tipo ──────────────────────────────────────────────────────

  function renderStep1() {
    var dich = getDichiarazione();
    var flags = dich.flags || {};
    var yearOpts = [_year - 1, _year].map(function (y) {
      return '<option value="' + y + '"' + (y === _year ? ' selected' : '') + '>' + y + '</option>';
    }).join('');
    var tipoList = ['ordinaria', 'correttiva', 'integrativa'];
    var tipoOpts = tipoList.map(function (t) {
      return '<option value="' + t + '"' + (dich.tipoDichiarazione === t ? ' selected' : '') + '>' +
        t.charAt(0).toUpperCase() + t.slice(1) + '</option>';
    }).join('');

    var chkAnnoMisto = flags.annoMisto ? ' checked' : '';
    var chkImposte = flags.imposteEstere ? ' checked' : '';
    var chkCrediti = flags.altriCrediti ? ' checked' : '';

    return '<div class="dich-step-content">' +
      '<h2>Anno &amp; tipo dichiarazione</h2>' +
      '<div class="dich-field-group">' +
        '<label>Anno d\'imposta</label>' +
        '<select onchange="window.DichiarazioneUI.setYear(parseInt(this.value))">' + yearOpts + '</select>' +
      '</div>' +
      '<div class="dich-field-group">' +
        '<label>Tipo dichiarazione</label>' +
        '<select onchange="window.saveDichField(\'tipoDichiarazione\', this.value)">' + tipoOpts + '</select>' +
      '</div>' +
      '<div class="dich-field-group">' +
        '<label><input type="checkbox" onchange="window.saveDichFlag(\'annoMisto\', this.checked)"' + chkAnnoMisto + '>' +
        ' Anno misto (reddito da lavoro dipendente o altri redditi)</label>' +
      '</div>' +
      '<div class="dich-field-group">' +
        '<label><input type="checkbox" onchange="window.saveDichFlag(\'imposteEstere\', this.checked)"' + chkImposte + '>' +
        ' Ho pagato imposte all\'estero (Quadro CE)</label>' +
      '</div>' +
      '<div class="dich-field-group">' +
        '<label><input type="checkbox" onchange="window.saveDichFlag(\'altriCrediti\', this.checked)"' + chkCrediti + '>' +
        ' Ho altri crediti d\'imposta (Quadro CR)</label>' +
      '</div>' +
      '<div class="dich-nav-btns">' +
        '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(2)">Avanti &rarr;</button>' +
      '</div>' +
    '</div>';
  }

  // ── Step 2: Frontespizio ─────────────────────────────────────────────────────

  function renderStep2() {
    var snapshot = buildDichiarazioneSnapshot();
    var fp = snapshot.frontespizio || {};
    var dich = getDichiarazione();

    return '<div class="dich-step-content">' +
      '<h2>Frontespizio</h2>' +
      '<p class="dich-hint">I dati sono precompilati dal profilo. Per renderli permanenti modifica in ' +
        '<a href="#" onclick="if(typeof switchToTab===\'function\')switchToTab(\'settings\');return false;">Impostazioni</a>' +
        ' &rarr; Profilo fiscale.</p>' +
      '<div class="dich-grid-2">' +
        roField('Codice Fiscale', fp.codiceFiscale) +
        roField('Cognome', fp.cognome) +
        roField('Nome', fp.nome) +
        roField('Data di nascita', fp.dataNascita) +
        roField('Comune di nascita', fp.comuneNascita) +
        roField('Provincia nascita', fp.provNascita) +
      '</div>' +
      '<h3>Residenza</h3>' +
      '<div class="dich-grid-2">' +
        roField('Via', fp.residenzaVia) +
        roField('Comune', fp.residenzaComune) +
        roField('Provincia', fp.residenzaProv) +
        roField('CAP', fp.residenzaCap) +
      '</div>' +
      '<div class="dich-field-group">' +
        '<label>Tipo dichiarazione</label>' +
        '<input type="text" value="' + escHtml(dich.tipoDichiarazione || 'ordinaria') + '" readonly class="dich-readonly">' +
      '</div>' +
      '<div class="dich-nav-btns">' +
        '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(1)">&larr; Indietro</button>' +
        '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(3)">Avanti &rarr;</button>' +
      '</div>' +
    '</div>';
  }

  // ── Step 12: Riepilogo & Export ──────────────────────────────────────────────

  function renderStep12() {
    var snapshot = buildDichiarazioneSnapshot();
    var lm = snapshot.quadroLM || {};
    var rr = snapshot.quadroRR || {};
    var validation = { errors: [], warnings: [] };
    if (window.DichiarazioneEngine && typeof window.DichiarazioneEngine.validateDichiarazione === 'function') {
      validation = window.DichiarazioneEngine.validateDichiarazione(snapshot);
    }
    var errCount = validation.errors.length;
    var warnCount = validation.warnings.length;
    var canExport = errCount === 0;
    var disabledAttr = canExport ? '' : ' disabled title="Correggi gli errori prima"';

    var html = '<div class="dich-step-content"><h2>Riepilogo &amp; Export</h2>';

    if (errCount > 0) {
      html += '<div class="dich-alert dich-alert-error">&#x26a0; ' + errCount + ' errore/i da correggere prima di esportare</div>';
    }
    if (warnCount > 0) {
      html += '<div class="dich-alert dich-alert-warn">&#x26a0; ' + warnCount + ' avviso/i</div>';
    }

    html += '<div class="dich-summary-grid">';
    if (lm.LM1 && lm.LM1.value != null) {
      html += '<div class="dich-summary-item"><span>Ricavi totali</span><strong>' + fmtEur(lm.LM1.value) + '</strong></div>';
    }
    if (lm.LM2 && lm.LM2.value != null) {
      html += '<div class="dich-summary-item"><span>Reddito forfettario</span><strong>' + fmtEur(lm.LM2.value) + '</strong></div>';
    }
    if (lm.LM36 && lm.LM36.value != null) {
      html += '<div class="dich-summary-item"><span>Imposta sostitutiva</span><strong>' + fmtEur(lm.LM36.value) + '</strong></div>';
    }
    if (rr.sezI && rr.sezI.RR4 && rr.sezI.RR4.value != null) {
      html += '<div class="dich-summary-item"><span>Contributi INPS</span><strong>' + fmtEur(rr.sezI.RR4.value) + '</strong></div>';
    }
    html += '</div>';

    html += '<div class="dich-export-btns">';
    if (window.DichiarazioneExports && typeof window.DichiarazioneExports.exportC2 === 'function') {
      html += '<button class="btn-primary" id="dich-btn-c2"' + disabledAttr + '>Esporta dati (C2)</button>';
    }
    if (window.DichiarazioneExports && typeof window.DichiarazioneExports.exportC3 === 'function') {
      html += '<button class="btn-primary" id="dich-btn-c3"' + disabledAttr + '>Scarica PDF (C3)</button>';
    }
    html += '</div>';

    html += '<div class="dich-nav-btns"><button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(11)">&larr; Validazione</button></div>';
    html += '</div>';
    return html;
  }

  // ── Placeholder step ─────────────────────────────────────────────────────────

  function renderPlaceholderStep(stepNum, label) {
    return '<div class="dich-step-content">' +
      '<h2>' + escHtml(label) + '</h2>' +
      '<p class="dich-hint">Questo quadro sar&agrave; compilabile nella prossima sessione di sviluppo.</p>' +
      '<div class="dich-nav-btns">' +
        '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(' + (stepNum - 1) + ')">&larr; Indietro</button>' +
        '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(' + (stepNum + 1) + ')">Avanti &rarr;</button>' +
      '</div>' +
    '</div>';
  }

  function renderCurrentStep() {
    switch (_currentStep) {
      case 1:  return renderStep1();
      case 2:  return renderStep2();
      case 12: return renderStep12();
      default:
        var step = null;
        for (var i = 0; i < STEPS.length; i++) {
          if (STEPS[i].id === _currentStep) { step = STEPS[i]; break; }
        }
        return renderPlaceholderStep(_currentStep, step ? step.label : 'Step ' + _currentStep);
    }
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  function render() {
    var container = document.getElementById(_containerId);
    if (!container) return;
    // Build HTML string — consistent with existing app.js pattern (all tabs use innerHTML)
    container.innerHTML =
      '<div class="dich-wizard">' +
        renderSidebar() +
        '<div class="dich-main" id="dich-main-content">' +
          renderCurrentStep() +
        '</div>' +
      '</div>';

    // Attach export button handlers after DOM is built (avoids passing large JSON in onclick attr)
    if (_currentStep === 12) {
      var snapshot = buildDichiarazioneSnapshot();
      var btnC2 = document.getElementById('dich-btn-c2');
      if (btnC2 && window.DichiarazioneExports) {
        btnC2.addEventListener('click', function () { window.DichiarazioneExports.exportC2(snapshot); });
      }
      var btnC3 = document.getElementById('dich-btn-c3');
      if (btnC3 && window.DichiarazioneExports) {
        btnC3.addEventListener('click', function () { window.DichiarazioneExports.exportC3(snapshot); });
      }
    }
  }

  // ── Global helpers for inline event handlers ─────────────────────────────────

  window.saveDichField = function (key, val) {
    var yd = getYearData();
    if (!yd || !yd.dichiarazione) return;
    var parts = key.split('.');
    var obj = yd.dichiarazione;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = val;
    if (typeof saveData === 'function') saveData();
    render();
  };

  window.saveDichFlag = function (flagKey, val) {
    var yd = getYearData();
    if (!yd || !yd.dichiarazione) return;
    if (!yd.dichiarazione.flags) yd.dichiarazione.flags = {};
    yd.dichiarazione.flags[flagKey] = !!val;
    if (typeof saveData === 'function') saveData();
    render(); // re-render sidebar to show/hide conditional steps
  };

  // ── Public API ───────────────────────────────────────────────────────────────

  var DichiarazioneUI = {
    mount: function (containerId, year) {
      _containerId = containerId;
      _year = year || (typeof currentYear !== 'undefined' ? currentYear : new Date().getFullYear());
      var saved = parseInt(sessionStorage.getItem('dich_currentStep') || '1', 10);
      _currentStep = isNaN(saved) ? 1 : saved;
      render();
    },
    unmount: function () {
      var container = document.getElementById(_containerId);
      if (container) container.innerHTML = '';
    },
    goToStep: function (stepNum) {
      _currentStep = stepNum;
      sessionStorage.setItem('dich_currentStep', String(stepNum));
      render();
      var main = document.getElementById('dich-main-content');
      if (main) main.scrollTop = 0;
    },
    setYear: function (year) {
      _year = year;
      render();
    },
    refresh: function () {
      render();
    }
  };

  if (typeof window !== 'undefined') window.DichiarazioneUI = DichiarazioneUI;
  if (typeof module !== 'undefined') module.exports = DichiarazioneUI;
})();
