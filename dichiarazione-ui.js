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

  // ── Core helper: renderRigo ──────────────────────────────────────────────────

  function renderRigo(key, rigoObj, stepLabel) {
    var val = rigoObj ? rigoObj.value : 0;
    var source = rigoObj ? rigoObj.source : 'computed';
    var desc = rigoObj ? rigoObj.descrizione : key;
    var isOverride = source === 'override';
    return '<div class="dich-rigo' + (isOverride ? ' dich-rigo-override' : '') + '">' +
      '<span class="dich-rigo-key">' + escHtml(stepLabel || key) + '</span>' +
      '<span class="dich-rigo-desc">' + escHtml(desc || '') + '</span>' +
      '<div class="dich-rigo-val-wrap">' +
        '<input type="number" step="0.01" class="dich-rigo-input" ' +
          'value="' + (val || 0) + '" ' +
          'data-key="' + escHtml(key) + '" ' +
          'onchange="window.DichiarazioneUI.saveRigoOverride(\'' + key + '\', parseFloat(this.value))" ' +
          'onblur="window.DichiarazioneUI.saveRigoOverride(\'' + key + '\', parseFloat(this.value))">' +
        '<span class="dich-rigo-badge ' + (isOverride ? 'badge-override' : 'badge-auto') + '">' + (isOverride ? 'override' : 'auto') + '</span>' +
      '</div>' +
    '</div>';
  }

  // ── Step 3: Quadro LM ────────────────────────────────────────────────────────

  function renderStep3() {
    var yd = getYearData() || {};
    var settings = yd.settings || {};
    var dich = yd.dichiarazione || {};
    var overrides = dich.overrides || {};
    var lm = window.DichiarazioneEngine ? window.DichiarazioneEngine.buildQuadroLM(yd, settings, overrides) : {};

    var html = '<div class="dich-step-content"><h2>Quadro LM &mdash; Regime forfettario</h2>';

    html += '<h3>Sezione I &mdash; Ricavi</h3>';
    html += renderRigo('LM1_value', lm.LM1, 'LM1');
    html += renderRigo('LM2_value', lm.LM2, 'LM2');

    html += '<h3>Sezione II &mdash; Determinazione reddito e imposta</h3>';
    html += renderRigo('LM3_value', lm.LM3, 'LM3');
    html += renderRigo('LM4_value', lm.LM4, 'LM4');
    html += renderRigo('LM34_value', lm.LM34, 'LM34');
    html += renderRigo('LM36_value', lm.LM36, 'LM36 \u2014 Imposta sostitutiva');

    html += '<h3>Sezione III &mdash; Perdite pregresse</h3>';
    var perdite = overrides.LM_perditePregresse || 0;
    html += '<div class="dich-field-group"><label>Perdite pregresse da scomputare</label>' +
      '<input type="number" step="0.01" value="' + perdite + '" ' +
      'onchange="window.DichiarazioneUI.saveRigoOverride(\'LM_perditePregresse\', parseFloat(this.value))">' +
      '</div>';

    html += '<div class="dich-nav-btns">' +
      '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(2)">&larr; Indietro</button>' +
      '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(4)">Avanti &rarr;</button>' +
      '</div></div>';
    return html;
  }

  // ── Step 4: Quadro RR ────────────────────────────────────────────────────────

  function renderStep4() {
    var yd = getYearData() || {};
    var settings = yd.settings || {};
    var dich = yd.dichiarazione || {};
    var overrides = dich.overrides || {};
    var lm = window.DichiarazioneEngine ? window.DichiarazioneEngine.buildQuadroLM(yd, settings, overrides) : {};
    var rr = window.DichiarazioneEngine ? window.DichiarazioneEngine.buildQuadroRR(yd, settings, lm, overrides) : {};

    var html = '<div class="dich-step-content"><h2>Quadro RR &mdash; Contributi previdenziali</h2>';

    if (settings.inpsMode === 'gestione_separata') {
      html += '<h3>Sezione II &mdash; Gestione Separata</h3>';
      var s2 = rr.sezII || {};
      html += renderRigo('RR19_value', s2.RR19, 'RR19 \u2014 Reddito imponibile');
      html += renderRigo('RR20_value', s2.RR20, 'RR20 \u2014 Contributi dovuti');
      html += renderRigo('RR21_value', s2.RR21, 'RR21 \u2014 Contributi versati');
      html += renderRigo('RR22_value', s2.RR22, 'RR22 \u2014 Saldo');
    } else if (rr.sezI) {
      html += '<h3>Sezione I &mdash; Artigiani / Commercianti</h3>';
      var s1 = rr.sezI;
      html += renderRigo('RR1_value', s1.RR1, 'RR1 \u2014 Reddito imponibile');
      html += renderRigo('RR2_value', s1.RR2, 'RR2 \u2014 Contributi sul minimale');
      html += renderRigo('RR3_value', s1.RR3, 'RR3 \u2014 Contributi eccedenti');
      html += renderRigo('RR4_value', s1.RR4, 'RR4 \u2014 Totale contributi');
      html += renderRigo('RR5_value', s1.RR5, 'RR5 \u2014 Contributi gi\u00e0 versati');
      html += renderRigo('RR8_value', s1.RR8, 'RR8 \u2014 Saldo da versare');
    } else {
      html += '<p class="dich-hint">Nessun regime INPS configurato. Configura il regime in Impostazioni.</p>';
    }

    html += '<div class="dich-nav-btns">' +
      '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(3)">&larr; Indietro</button>' +
      '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(5)">Avanti &rarr;</button>' +
      '</div></div>';
    return html;
  }

  // ── Step 5: Quadro RS ────────────────────────────────────────────────────────

  function renderStep5() {
    var yd = getYearData() || {};
    var settings = yd.settings || {};
    var dich = yd.dichiarazione || {};
    var overrides = dich.overrides || {};
    var rs = window.DichiarazioneEngine ? window.DichiarazioneEngine.buildQuadroRS(yd, settings, overrides) : {};

    var html = '<div class="dich-step-content"><h2>Quadro RS &mdash; Dati rilevanti forfettari</h2>' +
      '<p class="dich-hint">RS371-RS381: prospetti obbligatori per i forfettari. Inserisci i valori relativi all\'anno d\'imposta.</p>';

    ['RS371','RS372','RS373','RS374','RS375','RS376','RS377','RS378','RS379','RS380','RS381'].forEach(function(k) {
      html += renderRigo(k + '_value', rs[k], k);
    });

    html += '<div class="dich-nav-btns">' +
      '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(4)">&larr; Indietro</button>' +
      '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(6)">Avanti &rarr;</button>' +
      '</div></div>';
    return html;
  }

  // ── Step 6: Quadro RW ────────────────────────────────────────────────────────

  function renderStep6() {
    var yd = getYearData() || {};
    var dich = yd.dichiarazione || {};
    var contiEsteri = dich.contiEsteri || [];

    var html = '<div class="dich-step-content"><h2>Quadro RW &mdash; Attivit&agrave; estere</h2>' +
      '<p class="dich-hint">Elenca i conti correnti e depositi detenuti all\'estero durante l\'anno.</p>';

    contiEsteri.forEach(function(conto, idx) {
      html += '<div class="dich-conto-estero">' +
        '<h3>Conto ' + (idx + 1) + ' <button class="btn-remove" onclick="window.DichiarazioneUI.removeContoEstero(' + idx + ')">&#x2715; Rimuovi</button></h3>' +
        '<div class="dich-grid-2">' +
          '<div class="dich-field-group"><label>Paese (codice ISO)</label><input type="text" maxlength="2" value="' + escHtml(conto.paese || '') + '" onchange="window.DichiarazioneUI.updateContoEstero(' + idx + ', \'paese\', this.value)"></div>' +
          '<div class="dich-field-group"><label>Tipo conto</label><input type="text" value="' + escHtml(conto.tipoConto || '') + '" onchange="window.DichiarazioneUI.updateContoEstero(' + idx + ', \'tipoConto\', this.value)"></div>' +
          '<div class="dich-field-group"><label>IBAN / ID conto</label><input type="text" value="' + escHtml(conto.iban || '') + '" onchange="window.DichiarazioneUI.updateContoEstero(' + idx + ', \'iban\', this.value)"></div>' +
          '<div class="dich-field-group"><label>Valuta</label><input type="text" maxlength="3" value="' + escHtml(conto.valutaCodice || 'EUR') + '" onchange="window.DichiarazioneUI.updateContoEstero(' + idx + ', \'valutaCodice\', this.value)"></div>' +
          '<div class="dich-field-group"><label>Valore iniziale (&euro;)</label><input type="number" step="0.01" value="' + (conto.valoreIniziale || 0) + '" onchange="window.DichiarazioneUI.updateContoEstero(' + idx + ', \'valoreIniziale\', parseFloat(this.value))"></div>' +
          '<div class="dich-field-group"><label>Valore finale (&euro;)</label><input type="number" step="0.01" value="' + (conto.valoreFinale || 0) + '" onchange="window.DichiarazioneUI.updateContoEstero(' + idx + ', \'valoreFinale\', parseFloat(this.value))"></div>' +
          '<div class="dich-field-group"><label>Giorni detenzione</label><input type="number" value="' + (conto.giorniDetenzione || 365) + '" onchange="window.DichiarazioneUI.updateContoEstero(' + idx + ', \'giorniDetenzione\', parseInt(this.value))"></div>' +
        '</div>' +
      '</div>';
    });

    html += '<button class="btn-add" onclick="window.DichiarazioneUI.addContoEstero()">+ Aggiungi conto estero</button>';

    if (contiEsteri.length > 0) {
      var rw = window.DichiarazioneEngine ? window.DichiarazioneEngine.buildQuadroRW(contiEsteri) : { righi: [] };
      html += '<h3>Anteprima righi RW generati</h3>';
      (rw.righi || []).forEach(function(r, i) {
        html += '<div class="dich-rigo"><span class="dich-rigo-key">RW' + (i + 1) + '</span>' +
          '<span class="dich-rigo-desc">' + escHtml(r.paese) + ' \u2014 ' + escHtml(r.tipoConto) + ' \u2014 ' + (r.valoreFinale || 0).toLocaleString('it-IT') + ' \u20ac</span></div>';
      });
    }

    html += '<div class="dich-nav-btns">' +
      '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(5)">&larr; Indietro</button>' +
      '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(7)">Avanti &rarr;</button>' +
      '</div></div>';
    return html;
  }

  // ── Step 7: Quadro RX ────────────────────────────────────────────────────────

  function renderStep7() {
    var yd = getYearData() || {};
    var settings = yd.settings || {};
    var dich = yd.dichiarazione || {};
    var overrides = dich.overrides || {};
    var rx = window.DichiarazioneEngine ? window.DichiarazioneEngine.buildQuadroRX(yd, settings, null, overrides) : {};

    var html = '<div class="dich-step-content"><h2>Quadro RX &mdash; Compensazioni e crediti</h2>' +
      '<div class="dich-field-group"><label>Credito da anno precedente (&euro;)</label>' +
      '<input type="number" step="0.01" value="' + (settings.creditoAnnoPrecedente || 0) + '" ' +
      'onchange="window.DichiarazioneUI.setCreditoPrec(parseFloat(this.value))">' +
      '</div>';

    html += renderRigo('RX1_value', rx.RX1, 'RX1 \u2014 Credito da precedente');
    html += renderRigo('RX2_value', rx.RX2, 'RX2 \u2014 A rimborso');
    html += renderRigo('RX3_value', rx.RX3, 'RX3 \u2014 In compensazione');
    html += renderRigo('RX4_value', rx.RX4, 'RX4 \u2014 Al periodo successivo');

    html += '<div class="dich-nav-btns">' +
      '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(6)">&larr; Indietro</button>' +
      '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.nextStep(7))">Avanti &rarr;</button>' +
      '</div></div>';
    return html;
  }

  // ── Navigation helpers for conditional steps ────────────────────────────────

  function nextStep(current) {
    var dich = getDichiarazione();
    var flags = dich.flags || {};
    var order = [1,2,3,4,5,6,7];
    if (flags.annoMisto) order.push(8);
    if (flags.imposteEstere) order.push(9);
    if (flags.altriCrediti) order.push(10);
    order.push(11, 12);
    var idx = order.indexOf(current);
    return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : 12;
  }

  function prevStep(current) {
    var dich = getDichiarazione();
    var flags = dich.flags || {};
    var order = [1,2,3,4,5,6,7];
    if (flags.annoMisto) order.push(8);
    if (flags.imposteEstere) order.push(9);
    if (flags.altriCrediti) order.push(10);
    order.push(11, 12);
    var idx = order.indexOf(current);
    return idx > 0 ? order[idx - 1] : 1;
  }

  // ── Step 8: RN/RP/RV (anno misto) ───────────────────────────────────────────

  function renderStep8() {
    var dich = getDichiarazione();
    var flags = dich.flags || {};

    var html = '<div class="dich-step-content"><h2>RN / RP / RV &mdash; Anno misto</h2>';

    if (!flags.annoMisto) {
      html += '<div class="dich-alert dich-alert-warn">Questo quadro non &egrave; applicabile: la casella "Anno misto" non &egrave; selezionata nel passo 1.</div>';
      html += '<div class="dich-nav-btns">' +
        '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(7)">&larr; Indietro</button>' +
        '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.nextStep(8))">Avanti &rarr;</button>' +
        '</div></div>';
      return html;
    }

    var redditoDip = dich.redditoDipendente != null ? dich.redditoDipendente : '';
    var addReg = dich.addizionaleRegionale != null ? dich.addizionaleRegionale : '';
    var addCom = dich.addizionaleComunale != null ? dich.addizionaleComunale : '';
    var oneri = dich.oneriDetraibili || [];

    html += '<h3>Quadro RN &mdash; Redditi da lavoro dipendente e altri redditi</h3>';
    html += '<div class="dich-field-group"><label>Reddito da lavoro dipendente (&euro;)</label>' +
      '<input type="number" step="0.01" value="' + escHtml(String(redditoDip)) + '" ' +
      'onchange="window.saveDichField(\'redditoDipendente\', parseFloat(this.value) || 0)"></div>';

    html += '<h3>Quadro RV &mdash; Addizionali IRPEF</h3>';
    html += '<div class="dich-grid-2">' +
      '<div class="dich-field-group"><label>Addizionale regionale IRPEF (&euro;)</label>' +
      '<input type="number" step="0.01" value="' + escHtml(String(addReg)) + '" ' +
      'onchange="window.saveDichField(\'addizionaleRegionale\', parseFloat(this.value) || 0)"></div>' +
      '<div class="dich-field-group"><label>Addizionale comunale IRPEF (&euro;)</label>' +
      '<input type="number" step="0.01" value="' + escHtml(String(addCom)) + '" ' +
      'onchange="window.saveDichField(\'addizionaleComunale\', parseFloat(this.value) || 0)"></div>' +
      '</div>';

    html += '<h3>Quadro RP &mdash; Oneri detraibili</h3>';
    oneri.forEach(function(o, idx) {
      html += '<div class="dich-conto-estero">' +
        '<div class="dich-grid-2">' +
          '<div class="dich-field-group"><label>Tipo onere</label>' +
            '<input type="text" value="' + escHtml(o.tipo || '') + '" ' +
            'onchange="window.DichiarazioneUI.updateOnereDetraibile(' + idx + ', \'tipo\', this.value)"></div>' +
          '<div class="dich-field-group"><label>Importo (&euro;)</label>' +
            '<input type="number" step="0.01" value="' + (o.importo || 0) + '" ' +
            'onchange="window.DichiarazioneUI.updateOnereDetraibile(' + idx + ', \'importo\', parseFloat(this.value) || 0)"></div>' +
        '</div>' +
        '<button class="btn-remove" onclick="window.DichiarazioneUI.removeOnereDetraibile(' + idx + ')">&#x2715; Rimuovi</button>' +
        '</div>';
    });
    html += '<button class="btn-add" onclick="window.DichiarazioneUI.addOnereDetraibile()">+ Aggiungi onere detraibile</button>';

    // IRPEF preview
    if (window.DichiarazioneEngine) {
      var input = {
        flags: flags,
        redditoDipendente: parseFloat(dich.redditoDipendente) || 0,
        addizionaleRegionale: parseFloat(dich.addizionaleRegionale) || 0,
        addizionaleComunale: parseFloat(dich.addizionaleComunale) || 0,
        oneriDetraibili: oneri
      };
      var cond = window.DichiarazioneEngine.buildCondizionali(input, getYearData());
      if (cond.quadroRN) {
        html += '<div class="dich-rigo"><span class="dich-rigo-key">IRPEF lorda</span>' +
          '<span class="dich-rigo-desc">Anteprima calcolata sul reddito da dipendente</span>' +
          '<div class="dich-rigo-val-wrap"><input type="text" class="dich-readonly" readonly value="' + fmtEur(cond.quadroRN.irpefLorda) + '">' +
          '<span class="dich-rigo-badge badge-auto">auto</span></div></div>';
      }
    }

    html += '<div class="dich-nav-btns">' +
      '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.prevStep(8))">&larr; Indietro</button>' +
      '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.nextStep(8))">Avanti &rarr;</button>' +
      '</div></div>';
    return html;
  }

  // ── Step 9: Quadro CE (imposte estere) ──────────────────────────────────────

  function renderStep9() {
    var dich = getDichiarazione();
    var flags = dich.flags || {};

    var html = '<div class="dich-step-content"><h2>Quadro CE &mdash; Credito imposte estere</h2>';

    if (!flags.imposteEstere) {
      html += '<div class="dich-alert dich-alert-warn">Questo quadro non &egrave; applicabile: la casella "Imposte estere" non &egrave; selezionata nel passo 1.</div>';
      html += '<div class="dich-nav-btns">' +
        '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.prevStep(9))">&larr; Indietro</button>' +
        '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.nextStep(9))">Avanti &rarr;</button>' +
        '</div></div>';
      return html;
    }

    var credito = dich.creditoImposteEstere != null ? dich.creditoImposteEstere : '';
    var paese = dich.paeseImpostaPagata || '';

    html += '<div class="dich-field-group"><label>Credito per imposte pagate all\'estero (&euro;)</label>' +
      '<input type="number" step="0.01" value="' + escHtml(String(credito)) + '" ' +
      'onchange="window.saveDichField(\'creditoImposteEstere\', parseFloat(this.value) || 0)"></div>';

    html += '<div class="dich-field-group"><label>Paese in cui l\'imposta &egrave; stata pagata</label>' +
      '<input type="text" value="' + escHtml(paese) + '" ' +
      'onchange="window.saveDichField(\'paeseImpostaPagata\', this.value)"></div>';

    // CE1 preview
    if (window.DichiarazioneEngine) {
      var input = {
        flags: flags,
        creditoImposteEstere: parseFloat(dich.creditoImposteEstere) || 0
      };
      var cond = window.DichiarazioneEngine.buildCondizionali(input, getYearData());
      if (cond.quadroCE && cond.quadroCE.CE1) {
        html += '<div class="dich-rigo"><span class="dich-rigo-key">CE1</span>' +
          '<span class="dich-rigo-desc">' + escHtml(cond.quadroCE.CE1.descrizione || '') + '</span>' +
          '<div class="dich-rigo-val-wrap"><input type="text" class="dich-readonly" readonly value="' + fmtEur(cond.quadroCE.CE1.value) + '">' +
          '<span class="dich-rigo-badge badge-auto">auto</span></div></div>';
      }
    }

    html += '<div class="dich-nav-btns">' +
      '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.prevStep(9))">&larr; Indietro</button>' +
      '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.nextStep(9))">Avanti &rarr;</button>' +
      '</div></div>';
    return html;
  }

  // ── Step 10: Quadro CR (altri crediti) ──────────────────────────────────────

  function renderStep10() {
    var dich = getDichiarazione();
    var flags = dich.flags || {};

    var html = '<div class="dich-step-content"><h2>Quadro CR &mdash; Altri crediti d\'imposta</h2>';

    if (!flags.altriCrediti) {
      html += '<div class="dich-alert dich-alert-warn">Questo quadro non &egrave; applicabile: la casella "Altri crediti" non &egrave; selezionata nel passo 1.</div>';
      html += '<div class="dich-nav-btns">' +
        '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.prevStep(10))">&larr; Indietro</button>' +
        '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(11)">Avanti &rarr;</button>' +
        '</div></div>';
      return html;
    }

    var crediti = dich.altriCrediti || [];
    var tipiCredito = [
      { value: 'canone_rai', label: 'Canone RAI' },
      { value: 'detrazione_affitto', label: 'Detrazione affitto' },
      { value: 'ristrutturazione', label: 'Ristrutturazione' },
      { value: 'altro', label: 'Altro' }
    ];

    crediti.forEach(function(c, idx) {
      var tipoOpts = tipiCredito.map(function(t) {
        return '<option value="' + t.value + '"' + (c.tipo === t.value ? ' selected' : '') + '>' + escHtml(t.label) + '</option>';
      }).join('');

      html += '<div class="dich-conto-estero">' +
        '<div class="dich-grid-2">' +
          '<div class="dich-field-group"><label>Tipo credito</label>' +
            '<select onchange="window.DichiarazioneUI.updateAltroCredito(' + idx + ', \'tipo\', this.value)">' +
            tipoOpts + '</select></div>' +
          '<div class="dich-field-group"><label>Importo (&euro;)</label>' +
            '<input type="number" step="0.01" value="' + (c.importo || 0) + '" ' +
            'onchange="window.DichiarazioneUI.updateAltroCredito(' + idx + ', \'importo\', parseFloat(this.value) || 0)"></div>' +
        '</div>' +
        '<button class="btn-remove" onclick="window.DichiarazioneUI.removeAltroCredito(' + idx + ')">&#x2715; Rimuovi</button>' +
        '</div>';
    });

    html += '<button class="btn-add" onclick="window.DichiarazioneUI.addAltroCredito()">+ Aggiungi credito</button>';

    html += '<div class="dich-nav-btns">' +
      '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.prevStep(10))">&larr; Indietro</button>' +
      '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(11)">Avanti &rarr;</button>' +
      '</div></div>';
    return html;
  }

  // ── Step 11: Validazione ─────────────────────────────────────────────────────

  function renderStep11() {
    var snapshot = buildDichiarazioneSnapshot();
    var v = window.DichiarazioneEngine ? window.DichiarazioneEngine.validateDichiarazione(snapshot) : { errors: [], warnings: [] };
    var dich = getDichiarazione();
    var confirmedWarnings = dich._confirmedWarnings || {};

    var html = '<div class="dich-step-content"><h2>Validazione</h2>';

    if (v.errors.length === 0 && v.warnings.length === 0) {
      html += '<div class="dich-alert dich-alert-ok">&#x2713; Nessun errore o avviso. Puoi procedere al riepilogo.</div>';
    }

    if (v.errors.length > 0) {
      html += '<h3>Errori (da correggere prima dell\'export)</h3>';
      v.errors.forEach(function(e) {
        html += '<div class="dich-validation-item dich-error">' +
          '<strong>[' + escHtml(e.code) + ']</strong> ' + escHtml(e.message) +
          (e.quadro ? ' <a href="#" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.stepForQuadro(\'' + escHtml(e.quadro) + '\'));return false;">[Vai a ' + escHtml(e.quadro) + ']</a>' : '') +
          '</div>';
      });
    }

    if (v.warnings.length > 0) {
      html += '<h3>Avvisi (verificare)</h3>';
      v.warnings.forEach(function(w) {
        var confirmed = confirmedWarnings[w.code];
        html += '<div class="dich-validation-item dich-warn">' +
          '<label><input type="checkbox" ' + (confirmed ? 'checked' : '') + ' onchange="window.DichiarazioneUI.confirmWarning(\'' + escHtml(w.code) + '\', this.checked)">' +
          ' <strong>[' + escHtml(w.code) + ']</strong> ' + escHtml(w.message) + '</label>' +
          '</div>';
      });
    }

    var allWarningsConfirmed = v.warnings.every(function(w) { return confirmedWarnings[w.code]; });
    var canProceed = v.errors.length === 0 && allWarningsConfirmed;

    html += '<div class="dich-nav-btns">' +
      '<button class="btn-secondary" onclick="window.DichiarazioneUI.goToStep(window.DichiarazioneUI.prevStep(11))">&larr; Indietro</button>';

    if (canProceed) {
      html += '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(12)">Vai al riepilogo &rarr;</button>';
    } else if (v.errors.length === 0) {
      html += '<button class="btn-primary" onclick="window.DichiarazioneUI.goToStep(12)" style="opacity:0.5" title="Conferma gli avvisi prima">Vai al riepilogo &rarr;</button>';
    }

    html += '</div></div>';
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
      case 3:  return renderStep3();
      case 4:  return renderStep4();
      case 5:  return renderStep5();
      case 6:  return renderStep6();
      case 7:  return renderStep7();
      case 8:  return renderStep8();
      case 9:  return renderStep9();
      case 10: return renderStep10();
      case 11: return renderStep11();
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
    },
    saveRigoOverride: function(key, val) {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione) return;
      if (!yd.dichiarazione.overrides) yd.dichiarazione.overrides = {};
      yd.dichiarazione.overrides[key] = isNaN(val) ? 0 : val;
      if (typeof saveData === 'function') saveData();
      render();
    },
    addContoEstero: function() {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione) return;
      if (!yd.dichiarazione.contiEsteri) yd.dichiarazione.contiEsteri = [];
      yd.dichiarazione.contiEsteri.push({ paese: '', tipoConto: 'conto corrente', iban: '', valoreIniziale: 0, valoreFinale: 0, giorniDetenzione: 365, valutaCodice: 'EUR' });
      if (typeof saveData === 'function') saveData();
      render();
    },
    removeContoEstero: function(idx) {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione || !yd.dichiarazione.contiEsteri) return;
      yd.dichiarazione.contiEsteri.splice(idx, 1);
      if (typeof saveData === 'function') saveData();
      render();
    },
    updateContoEstero: function(idx, field, val) {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione || !yd.dichiarazione.contiEsteri) return;
      yd.dichiarazione.contiEsteri[idx][field] = val;
      if (typeof saveData === 'function') saveData();
    },
    setCreditoPrec: function(val) {
      var yd = getYearData();
      if (!yd || !yd.settings) return;
      yd.settings.creditoAnnoPrecedente = isNaN(val) ? 0 : val;
      if (typeof saveData === 'function') saveData();
      var main = document.getElementById('dich-main-content');
      if (main) main.innerHTML = renderCurrentStep();
    },
    // ── Step 8: oneri detraibili list helpers ──────────────────────────────────
    addOnereDetraibile: function() {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione) return;
      if (!yd.dichiarazione.oneriDetraibili) yd.dichiarazione.oneriDetraibili = [];
      yd.dichiarazione.oneriDetraibili.push({ tipo: '', importo: 0 });
      if (typeof saveData === 'function') saveData();
      render();
    },
    removeOnereDetraibile: function(idx) {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione || !yd.dichiarazione.oneriDetraibili) return;
      yd.dichiarazione.oneriDetraibili.splice(idx, 1);
      if (typeof saveData === 'function') saveData();
      render();
    },
    updateOnereDetraibile: function(idx, field, val) {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione || !yd.dichiarazione.oneriDetraibili) return;
      yd.dichiarazione.oneriDetraibili[idx][field] = val;
      if (typeof saveData === 'function') saveData();
    },
    // ── Step 10: altri crediti list helpers ───────────────────────────────────
    addAltroCredito: function() {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione) return;
      if (!yd.dichiarazione.altriCrediti) yd.dichiarazione.altriCrediti = [];
      yd.dichiarazione.altriCrediti.push({ tipo: 'altro', importo: 0 });
      if (typeof saveData === 'function') saveData();
      render();
    },
    removeAltroCredito: function(idx) {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione || !yd.dichiarazione.altriCrediti) return;
      yd.dichiarazione.altriCrediti.splice(idx, 1);
      if (typeof saveData === 'function') saveData();
      render();
    },
    updateAltroCredito: function(idx, field, val) {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione || !yd.dichiarazione.altriCrediti) return;
      yd.dichiarazione.altriCrediti[idx][field] = val;
      if (typeof saveData === 'function') saveData();
    },
    // ── Step 11: validation helpers ───────────────────────────────────────────
    confirmWarning: function(code, val) {
      var yd = getYearData();
      if (!yd || !yd.dichiarazione) return;
      if (!yd.dichiarazione._confirmedWarnings) yd.dichiarazione._confirmedWarnings = {};
      yd.dichiarazione._confirmedWarnings[code] = val;
      if (typeof saveData === 'function') saveData();
      var main = document.getElementById('dich-main-content');
      if (main) main.innerHTML = renderCurrentStep();
    },
    stepForQuadro: function(quadro) {
      var map = { 'Frontespizio': 2, 'LM': 3, 'RR': 4, 'RS': 5, 'RW': 6, 'RX': 7, 'RN': 8, 'CE': 9, 'CR': 10 };
      return map[quadro] || 1;
    }
  };

  // Expose navigation helpers for inline onclick use in step 8/9/10/11 templates
  DichiarazioneUI.nextStep = nextStep;
  DichiarazioneUI.prevStep = prevStep;

  if (typeof window !== 'undefined') window.DichiarazioneUI = DichiarazioneUI;
  if (typeof module !== 'undefined') module.exports = DichiarazioneUI;
})();
