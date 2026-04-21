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

  root.FattureImportLegacy = {
    parseToRows: parseToRows,
    importConfirmed: importConfirmed
  };
})(typeof window !== 'undefined' ? window : globalThis);
