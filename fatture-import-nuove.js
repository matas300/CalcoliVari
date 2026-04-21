/* Fatture Import Nuove — import rapido XML FatturaPA, stato 'inviata'.
 * Nessuna preview: parse + match + save atomico.
 */
(function (root) {
  'use strict';

  function _getProfile() {
    if (typeof root.getProfile === 'function') return root.getProfile();
    return (root.sessionStorage && root.sessionStorage.getItem('calcoliPIVA_profile')) || 'Mattia';
  }

  function importNuoveFromStrings(entries) {
    var X = root.FattureImportXml;
    var profile = _getProfile();
    var store = root.FattureStorico;
    if (!X || !store) {
      return { imported: 0, skipped: 0, errors: [{ file: '(n/a)', message: 'moduli non disponibili' }], clientiCreati: 0 };
    }
    var existingFatture = store.load(profile);
    var existingClienti = (typeof root.getClienti === 'function') ? root.getClienti(profile) : [];
    var seen = Object.create(null);
    existingFatture.forEach(function (f) { seen[X.dedupKey(f)] = true; });
    var clientiByKey = Object.create(null);

    var imported = 0, skipped = 0, errors = [], clientiCreati = 0;
    var toSave = existingFatture.slice();
    var clientiNew = [];

    (entries || []).forEach(function (entry) {
      try {
        var xmlText = typeof entry === 'string' ? entry : entry.xml;
        var draft = X.parseXml(xmlText);
        var key = X.dedupKey(draft);
        if (seen[key]) { skipped++; return; }
        seen[key] = true;

        var matched = X.matchCliente(draft.clienteSnapshot, existingClienti.concat(clientiNew));
        var clienteId;
        if (matched.mode === 'existing') {
          clienteId = matched.cliente.id;
        } else {
          var ckey = (matched.draft.partitaIva || '') + '|' + (matched.draft.codiceFiscale || '') + '|' + (matched.draft.idPaese + matched.draft.idCodice);
          if (clientiByKey[ckey]) {
            clienteId = clientiByKey[ckey];
          } else {
            clientiNew.push(matched.draft);
            clientiByKey[ckey] = matched.draft.id;
            clienteId = matched.draft.id;
            clientiCreati++;
          }
        }

        draft.clienteId = clienteId;
        draft.stato = 'inviata';
        draft.dataInvioSdi = draft.data || null;
        draft.pagMese = null;
        draft.pagAnno = null;
        draft.dataPagamento = '';
        draft.origine = 'xml-import';
        toSave.push(draft);
        imported++;
      } catch (err) {
        errors.push({ file: (entry && entry.name) || '(xml)', message: (err && err.message) || String(err) });
      }
    });

    if (imported > 0) {
      store.save(profile, toSave);
      if (clientiNew.length && typeof root.saveClienti === 'function') {
        root.saveClienti(existingClienti.concat(clientiNew), profile);
      }
    }
    return { imported: imported, skipped: skipped, errors: errors, clientiCreati: clientiCreati };
  }

  function handleFileInput(event) {
    var input = event && event.target;
    var files = input && input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    Promise.all(files.map(function (file) {
      return file.text().then(function (xml) { return { name: file.name, xml: xml }; });
    })).then(function (entries) {
      var res = importNuoveFromStrings(entries);
      var msg = 'Importate ' + res.imported + ' fatture';
      if (res.clientiCreati) msg += ' (clienti nuovi: ' + res.clientiCreati + ')';
      if (res.skipped) msg += ' — skip ' + res.skipped + ' duplicate';
      if (res.errors.length) msg += ' — ' + res.errors.length + ' errori';
      if (typeof root.showToast === 'function') root.showToast(msg, res.errors.length ? 'error' : 'success');
      else if (typeof root.alert === 'function') root.alert(msg);
      if (res.errors.length) console.warn('[FattureImportNuove] errori:', res.errors);
      if (input) input.value = '';
      if (root.FattureStorico && typeof root.FattureStorico.renderStorico === 'function') {
        var sel = document.getElementById('archivioAnnoSelect');
        if (root.FattureStorico.renderAnnoFilter) root.FattureStorico.renderAnnoFilter();
        root.FattureStorico.renderStorico(Number(sel && sel.value) || new Date().getFullYear());
      }
      if (typeof root.renderClienti === 'function') root.renderClienti();
      if (typeof root.recalcAll === 'function') root.recalcAll();
    }).catch(function (err) {
      console.error('[FattureImportNuove] lettura file fallita:', err);
      if (typeof root.alert === 'function') root.alert('Errore lettura file: ' + ((err && err.message) || err));
    });
  }

  root.FattureImportNuove = {
    importNuoveFromStrings: importNuoveFromStrings,
    handleFileInput: handleFileInput
  };
})(typeof window !== 'undefined' ? window : globalThis);
