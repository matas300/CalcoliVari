/* Fatture Import Legacy — onboarding retroattivo da XML FatturaPA.
 * Flow: parseToRows → (user edita pagamento in UI) → importConfirmed → salva stato='pagata'.
 *
 * Questo modulo ha una parte logica (parseToRows, importConfirmed) e una parte UI
 * (openModal/handleFileInput) aggiunta in Task 6. La logica è pura e testabile in Node.
 */
(function (root) {
  'use strict';

  function _getProfile() {
    if (typeof root.getProfile === 'function') return root.getProfile();
    return (root.sessionStorage && root.sessionStorage.getItem('calcoliPIVA_profile')) || 'Mattia';
  }

  function parseToRows(entries) {
    var X = root.FattureImportXml;
    var profile = _getProfile();
    var existingFatture = (root.FattureStorico && root.FattureStorico.load(profile)) || [];
    var existingClienti = (typeof root.getClienti === 'function') ? root.getClienti(profile) : [];
    var seen = Object.create(null);
    existingFatture.forEach(function (f) { seen[X.dedupKey(f)] = f; });

    return (entries || []).map(function (entry, idx) {
      var row = { idx: idx, file: (entry && entry.name) || ('xml_' + idx), selected: true };
      try {
        var xmlText = typeof entry === 'string' ? entry : entry.xml;
        var draft = X.parseXml(xmlText);
        row.draft = draft;
        row.match = X.matchCliente(draft.clienteSnapshot, existingClienti);
        row.pagamento = draft.scadenzaPagamento || '';
        var key = X.dedupKey(draft);
        if (seen[key]) {
          row.status = 'duplicate';
          row.existing = seen[key];
          row.selected = false;
        } else if (!row.pagamento) {
          row.status = 'missing_pagamento';
        } else {
          row.status = 'ok';
        }
      } catch (err) {
        row.status = 'parse_error';
        row.error = (err && err.message) || String(err);
        row.selected = false;
      }
      return row;
    });
  }

  function importConfirmed(rows) {
    var X = root.FattureImportXml;
    var profile = _getProfile();
    var existingFatture = (root.FattureStorico && root.FattureStorico.load(profile)) || [];
    var existingClienti = (typeof root.getClienti === 'function') ? root.getClienti(profile) : [];
    var seen = Object.create(null);
    existingFatture.forEach(function (f) { seen[X.dedupKey(f)] = f; });

    var imported = 0, skipped = 0, errors = [], clientiCreati = 0;
    var toSave = existingFatture.slice();
    var clientiNew = [];
    var clientiByKey = Object.create(null);

    (rows || []).forEach(function (row) {
      if (!row.selected || row.status === 'parse_error') { skipped++; return; }
      if (!row.pagamento) { skipped++; errors.push({ file: row.file, message: 'data pagamento mancante' }); return; }
      var d = new Date(row.pagamento);
      if (isNaN(d.getTime())) { skipped++; errors.push({ file: row.file, message: 'data non valida' }); return; }

      var key = X.dedupKey(row.draft);
      if (seen[key] && seen[key].origine !== 'xml-import-legacy') {
        skipped++;
        errors.push({ file: row.file, message: 'fattura esistente (creata altrove), non sovrascrivibile' });
        return;
      }

      var clienteId;
      if (row.match.mode === 'existing') {
        clienteId = row.match.cliente.id;
      } else {
        var ckey = (row.match.draft.partitaIva || '') + '|' + (row.match.draft.codiceFiscale || '') + '|' + (row.match.draft.idPaese + row.match.draft.idCodice);
        if (clientiByKey[ckey]) {
          clienteId = clientiByKey[ckey];
        } else {
          clientiNew.push(row.match.draft);
          clientiByKey[ckey] = row.match.draft.id;
          clienteId = row.match.draft.id;
          clientiCreati++;
        }
      }

      var fattura = row.draft;
      fattura.clienteId = clienteId;
      fattura.stato = 'pagata';
      fattura.dataInvioSdi = fattura.data || null;
      fattura.dataPagamento = row.pagamento;
      fattura.pagMese = d.getMonth() + 1;
      fattura.pagAnno = d.getFullYear();
      fattura.origine = 'xml-import-legacy';

      if (seen[key]) {
        for (var i = 0; i < toSave.length; i++) {
          if (X.dedupKey(toSave[i]) === key) { toSave[i] = fattura; break; }
        }
      } else {
        toSave.push(fattura);
        seen[key] = fattura;
      }
      imported++;
    });

    if (imported > 0) {
      root.FattureStorico.save(profile, toSave);
      if (clientiNew.length && typeof root.saveClienti === 'function') {
        root.saveClienti(existingClienti.concat(clientiNew), profile);
      }
    }
    return { imported: imported, skipped: skipped, errors: errors, clientiCreati: clientiCreati };
  }

  function _doc() { return root.document; }

  function _el(tag, attrs, children) {
    var d = _doc().createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') d.className = attrs[k];
        else if (k === 'dataset') Object.keys(attrs[k]).forEach(function (dk) { d.dataset[dk] = attrs[k][dk]; });
        else if (k.indexOf('on') === 0) d[k] = attrs[k];
        else d.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      if (typeof c === 'string') d.appendChild(_doc().createTextNode(c));
      else d.appendChild(c);
    });
    return d;
  }

  function _fmtImporto(f) {
    var tot = (f && f.totaleDocumento) || 0;
    var sign = (f && f.tipoDocumento === 'TD04') ? -1 : 1;
    return (sign * tot).toFixed(2) + ' \u20ac';
  }

  function _statusLabel(row) {
    if (row.status === 'ok') return 'ok';
    if (row.status === 'missing_pagamento') return 'manca data';
    if (row.status === 'duplicate') return 'gi\u00e0 presente';
    if (row.status === 'parse_error') return 'errore parsing';
    return row.status || '';
  }

  function _renderConfirmEnabled(rows, confirmBtn) {
    var anyMissing = rows.some(function (r) { return r.selected && r.status === 'missing_pagamento' && !r.pagamento; });
    var anySelected = rows.some(function (r) { return r.selected; });
    confirmBtn.disabled = anyMissing || !anySelected;
    var count = rows.filter(function (r) { return r.selected; }).length;
    confirmBtn.textContent = 'Conferma import ' + count + ' fatture';
  }

  function _buildRow(row, confirmBtn, rows) {
    var tr = _el('tr', { 'data-idx': String(row.idx) });

    var cbCell = _el('td');
    var cb = _el('input', { type: 'checkbox' });
    cb.checked = !!row.selected;
    cb.disabled = row.status === 'parse_error';
    cb.onchange = function () { row.selected = cb.checked; _renderConfirmEnabled(rows, confirmBtn); };
    cbCell.appendChild(cb);
    tr.appendChild(cbCell);

    tr.appendChild(_el('td', null, [String(row.idx + 1)]));
    tr.appendChild(_el('td', null, [row.draft ? (row.draft.numero || '\u2014') : row.file]));
    tr.appendChild(_el('td', null, [row.draft ? (row.draft.data || '\u2014') : '\u2014']));

    var clienteCell = _el('td');
    if (row.match) {
      var nome = row.match.mode === 'existing' ? row.match.cliente.nome : row.match.draft.nome;
      clienteCell.appendChild(_doc().createTextNode(nome + ' '));
      var badgeCls = row.match.mode === 'existing' ? 'badge-stato pagata' : 'badge-stato inviata';
      var badgeTxt = row.match.mode === 'existing' ? '\u2713 esistente' : '+ nuovo';
      clienteCell.appendChild(_el('span', { class: badgeCls }, [badgeTxt]));
    } else {
      clienteCell.appendChild(_doc().createTextNode('\u2014'));
    }
    tr.appendChild(clienteCell);

    tr.appendChild(_el('td', null, [row.draft ? _fmtImporto(row.draft) : '\u2014']));
    tr.appendChild(_el('td', null, [row.draft ? row.draft.tipoDocumento : '\u2014']));

    var pagCell = _el('td');
    var dateInput = _el('input', { type: 'date' });
    dateInput.value = row.pagamento || '';
    if (row.status === 'missing_pagamento' && !row.pagamento) dateInput.style.background = '#5a4a1a';
    dateInput.onchange = function () {
      row.pagamento = dateInput.value;
      if (row.pagamento && row.status === 'missing_pagamento') row.status = 'ok';
      if (!row.pagamento && row.status === 'ok') row.status = 'missing_pagamento';
      var statusCell = tr.querySelector('td.status-cell');
      if (statusCell) { statusCell.textContent = _statusLabel(row); }
      _renderConfirmEnabled(rows, confirmBtn);
    };
    pagCell.appendChild(dateInput);
    tr.appendChild(pagCell);

    tr.appendChild(_el('td', { class: 'status-cell' }, [_statusLabel(row)]));
    return tr;
  }

  function openModal(rows) {
    var doc = _doc();
    var overlay = _el('div', { id: 'importLegacyOverlay', class: 'modal-overlay' });
    var modal = _el('div', { class: 'modal-content', style: 'max-width:1100px;width:95vw;max-height:90vh;overflow:auto;' });

    var header = _el('div', { class: 'modal-header' }, [
      _el('h3', null, ['Import legacy \u2014 preview']),
      _el('button', { type: 'button', class: 'btn-close', onclick: function () { doc.body.removeChild(overlay); } }, ['\u00d7'])
    ]);
    modal.appendChild(header);

    var errors = rows.filter(function (r) { return r.status === 'parse_error'; });
    if (errors.length) {
      var errList = _el('ul', null, errors.map(function (e) {
        return _el('li', null, [e.file + ' \u2014 ' + (e.error || '')]);
      }));
      modal.appendChild(_el('div', { class: 'alert alert-error' }, [
        _el('strong', null, [errors.length + ' file non parseable:']),
        errList
      ]));
    }

    modal.appendChild(_el('p', null, ['Controlla i dati, inserisci la data di pagamento quando manca, poi conferma.']));

    var table = _el('table', { class: 'import-legacy-table' });
    var thead = _el('thead', null, [
      _el('tr', null, [
        _el('th'),
        _el('th', null, ['#']),
        _el('th', null, ['Numero']),
        _el('th', null, ['Data doc']),
        _el('th', null, ['Cliente']),
        _el('th', null, ['Importo']),
        _el('th', null, ['Tipo']),
        _el('th', null, ['Pagata il']),
        _el('th', null, ['Status'])
      ])
    ]);
    table.appendChild(thead);
    var tbody = _el('tbody');
    table.appendChild(tbody);
    modal.appendChild(table);

    var cancelBtn = _el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { doc.body.removeChild(overlay); } }, ['Annulla']);
    var confirmBtn = _el('button', { type: 'button', class: 'btn btn-primary' });
    var actions = _el('div', { class: 'modal-actions', style: 'margin-top:16px;display:flex;justify-content:flex-end;gap:8px;' }, [cancelBtn, confirmBtn]);
    modal.appendChild(actions);

    rows.forEach(function (row) { tbody.appendChild(_buildRow(row, confirmBtn, rows)); });
    _renderConfirmEnabled(rows, confirmBtn);

    confirmBtn.onclick = function () {
      var res = importConfirmed(rows);
      doc.body.removeChild(overlay);
      var msg = 'Importate ' + res.imported + ' fatture';
      if (res.clientiCreati) msg += ' (clienti nuovi: ' + res.clientiCreati + ')';
      if (res.skipped) msg += ' \u2014 skip ' + res.skipped;
      if (res.errors.length) msg += ' \u2014 ' + res.errors.length + ' errori';
      if (typeof root.showToast === 'function') root.showToast(msg, res.errors.length ? 'warning' : 'success');
      else if (typeof root.alert === 'function') root.alert(msg);
      if (root.FattureStorico && typeof root.FattureStorico.renderStorico === 'function') {
        var sel = doc.getElementById('archivioAnnoSelect');
        if (root.FattureStorico.renderAnnoFilter) root.FattureStorico.renderAnnoFilter();
        root.FattureStorico.renderStorico(Number(sel && sel.value) || new Date().getFullYear());
      }
      if (typeof root.renderClienti === 'function') root.renderClienti();
      if (typeof root.recalcAll === 'function') root.recalcAll();
    };

    overlay.appendChild(modal);
    doc.body.appendChild(overlay);
  }

  function handleFileInput(event) {
    var input = event && event.target;
    var files = input && input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    Promise.all(files.map(function (file) {
      return file.text().then(function (xml) { return { name: file.name, xml: xml }; });
    })).then(function (entries) {
      var rows = parseToRows(entries);
      if (input) input.value = '';
      openModal(rows);
    }).catch(function (err) {
      if (typeof root.alert === 'function') root.alert('Errore lettura file: ' + ((err && err.message) || err));
    });
  }

  root.FattureImportLegacy = {
    parseToRows: parseToRows,
    importConfirmed: importConfirmed,
    openModal: openModal,
    handleFileInput: handleFileInput
  };
})(typeof window !== 'undefined' ? window : globalThis);
