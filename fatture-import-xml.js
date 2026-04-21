/* Fatture Import XML — onboarding retroattivo da file FatturaPA (SdI, Fiscozen, ecc.)
 *
 * API:
 *  - parseXml(xmlText) → fattura draft (throw su XML non valido)
 *  - importXmlStrings(arr) → { imported, skipped, errors }
 *  - handleFileInput(event) → letto dal <input type="file">: parsa + salva + render
 *
 * Dedupe: (annoProgressivo, progressivo, tipoDocumento) — re-import stesso file skipped.
 * Stato default: 'inviata' (file XML = già trasmesso a SdI). L'utente può poi segnare pagata.
 * Origine: 'xml-import'.
 */
(function (root) {
  'use strict';

  var DOMParser = root.DOMParser;

  function text(node, tag) {
    if (!node) return '';
    var el = node.getElementsByTagName(tag)[0];
    return el ? String(el.textContent || '').trim() : '';
  }

  function firstChild(node, tag) {
    if (!node) return null;
    var el = node.getElementsByTagName(tag)[0];
    return el || null;
  }

  function num(v) {
    var n = parseFloat(String(v || '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function parseNumero(numeroXml) {
    // Accetta formati: "3/2026", "NC/3/2025", "2026/003", "FT-12/2025"
    var s = String(numeroXml || '').trim();
    var m = s.match(/(\d+)\s*\/\s*(\d{4})$/);
    if (m) return { progressivo: parseInt(m[1], 10), anno: parseInt(m[2], 10) };
    m = s.match(/(\d{4})\s*\/\s*(\d+)$/);
    if (m) return { anno: parseInt(m[1], 10), progressivo: parseInt(m[2], 10) };
    // fallback: nessun parse, progressivo=0 (l'utente può correggere)
    return { progressivo: 0, anno: 0 };
  }

  function parseXml(xmlText) {
    if (typeof xmlText !== 'string' || !xmlText.trim()) {
      throw new Error('XML vuoto');
    }
    if (typeof DOMParser !== 'function') {
      throw new Error('DOMParser non disponibile in questo ambiente');
    }
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    var err = doc.getElementsByTagName('parsererror')[0];
    if (err) throw new Error('XML non valido: ' + (err.textContent || '').slice(0, 200));

    var body = doc.getElementsByTagName('FatturaElettronicaBody')[0];
    var header = doc.getElementsByTagName('FatturaElettronicaHeader')[0];
    if (!body || !header) throw new Error('Struttura FatturaElettronica mancante');

    var datiGen = firstChild(body, 'DatiGeneraliDocumento');
    if (!datiGen) throw new Error('DatiGeneraliDocumento mancante');

    var tipoDoc = text(datiGen, 'TipoDocumento') || 'TD01';
    var dataIso = text(datiGen, 'Data');
    var numeroXml = text(datiGen, 'Numero');
    var totaleDoc = num(text(datiGen, 'ImportoTotaleDocumento'));
    var datiBollo = firstChild(datiGen, 'DatiBollo');
    var bolloImporto = datiBollo ? num(text(datiBollo, 'ImportoBollo')) : 0;

    var parsed = parseNumero(numeroXml);
    var annoProgressivo = parsed.anno || (dataIso ? parseInt(dataIso.slice(0, 4), 10) : new Date().getFullYear());
    var progressivo = parsed.progressivo || 0;

    // Cessionario → clienteSnapshot
    var cess = firstChild(header, 'CessionarioCommittente');
    var cessDati = firstChild(cess, 'DatiAnagrafici');
    var cessAnag = firstChild(cessDati, 'Anagrafica');
    var cessIva = firstChild(cessDati, 'IdFiscaleIVA');
    var cessSede = firstChild(cess, 'Sede');
    var denom = text(cessAnag, 'Denominazione');
    var nomeCli = text(cessAnag, 'Nome');
    var cognomeCli = text(cessAnag, 'Cognome');
    var clienteSnapshot = {
      denominazione: denom,
      nome: nomeCli,
      cognome: cognomeCli,
      partitaIva: text(cessIva, 'IdCodice'),
      codiceFiscale: text(cessDati, 'CodiceFiscale'),
      indirizzo: text(cessSede, 'Indirizzo'),
      cap: text(cessSede, 'CAP'),
      citta: text(cessSede, 'Comune'),
      provincia: text(cessSede, 'Provincia'),
      nazione: text(cessSede, 'Nazione') || 'IT'
    };

    // Righe
    var lineNodes = body.getElementsByTagName('DettaglioLinee');
    var righe = [];
    for (var i = 0; i < lineNodes.length; i++) {
      var ln = lineNodes[i];
      var prezzoUnit = num(text(ln, 'PrezzoUnitario'));
      var qta = num(text(ln, 'Quantita')) || 1;
      var desc = text(ln, 'Descrizione');
      // TD04: importi nel XML sono positivi ma il documento è una NC — teniamo positivi nel draft
      // (il segno negativo viene applicato a runtime via getImportoSigned)
      righe.push({
        descrizione: desc,
        quantita: Math.abs(qta),
        prezzoUnitario: Math.abs(prezzoUnit),
        iva: num(text(ln, 'AliquotaIVA'))
      });
    }
    if (righe.length === 0) {
      righe.push({ descrizione: '(importata senza righe dettaglio)', quantita: 1, prezzoUnitario: Math.abs(totaleDoc), iva: 0 });
    }

    // Pagamento
    var datiPag = firstChild(body, 'DatiPagamento');
    var dettPag = firstChild(datiPag, 'DettaglioPagamento');
    var modalita = text(dettPag, 'ModalitaPagamento');
    var scadenza = text(dettPag, 'DataScadenzaPagamento');
    var iban = text(dettPag, 'IBAN');

    var id = 'xmlimp_' + annoProgressivo + '_' + progressivo + '_' + tipoDoc + '_' + Math.round(Math.abs(totaleDoc) * 100);

    return {
      id: id,
      numero: numeroXml,
      data: dataIso,
      anno: annoProgressivo,
      annoProgressivo: annoProgressivo,
      progressivo: progressivo,
      tipoDocumento: tipoDoc === 'TD04' ? 'TD04' : 'TD01',
      stato: 'inviata',
      dataInvioSdi: dataIso || null,
      clienteId: '',
      clienteSnapshot: clienteSnapshot,
      righe: righe,
      contributoIntegrativo: 0,
      marcaDaBollo: bolloImporto > 0,
      bolloAddebitato: bolloImporto > 0,
      bolloAuto: false,
      modalitaPagamento: modalita || '',
      iban: iban || '',
      scadenzaPagamento: scadenza || '',
      origine: 'xml-import'
    };
  }

  function _getProfile() {
    if (typeof root.getProfile === 'function') return root.getProfile();
    return (root.sessionStorage && root.sessionStorage.getItem('calcoliPIVA_profile')) || 'Mattia';
  }

  function _dedupKey(f) {
    return (f.tipoDocumento || 'TD01') + '|' + (f.annoProgressivo || 0) + '|' + (f.progressivo || 0) + '|' + (f.numero || '');
  }

  function importXmlStrings(arr) {
    var profile = _getProfile();
    var store = root.FattureStorico;
    if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
      return { imported: 0, skipped: 0, errors: [{ file: '(n/a)', message: 'FattureStorico non disponibile' }] };
    }
    var existing = store.load(profile);
    var seen = Object.create(null);
    existing.forEach(function (f) { seen[_dedupKey(f)] = true; });

    var imported = 0, skipped = 0, errors = [];
    (arr || []).forEach(function (entry) {
      try {
        var xmlText = typeof entry === 'string' ? entry : entry.xml;
        var label = typeof entry === 'string' ? '' : (entry.name || '');
        var draft = parseXml(xmlText);
        var key = _dedupKey(draft);
        if (seen[key]) { skipped++; return; }
        seen[key] = true;
        existing.push(draft);
        imported++;
      } catch (err) {
        errors.push({ file: (entry && entry.name) || '(xml)', message: (err && err.message) || String(err) });
      }
    });

    if (imported > 0) store.save(profile, existing);
    return { imported: imported, skipped: skipped, errors: errors };
  }

  function handleFileInput(event) {
    var input = event && event.target;
    var files = input && input.files ? Array.from(input.files) : [];
    if (!files.length) return;

    Promise.all(files.map(function (file) {
      return file.text().then(function (xml) { return { name: file.name, xml: xml }; });
    })).then(function (entries) {
      var res = importXmlStrings(entries);
      var msg = 'Importate ' + res.imported + ' fatture';
      if (res.skipped) msg += ' (skip ' + res.skipped + ' duplicate)';
      if (res.errors.length) msg += ' — ' + res.errors.length + ' errori';
      if (typeof root.showToast === 'function') {
        root.showToast(msg, res.errors.length ? 'error' : 'success');
      } else if (typeof root.alert === 'function') {
        root.alert(msg);
      }
      if (res.errors.length) console.warn('[FattureImportXml] errori:', res.errors);
      if (input) input.value = '';
      // Re-render archivio se aperto
      if (root.FattureStorico && typeof root.FattureStorico.renderStorico === 'function') {
        var sel = document.getElementById('archivioAnnoSelect');
        if (root.FattureStorico.renderAnnoFilter) root.FattureStorico.renderAnnoFilter();
        root.FattureStorico.renderStorico(Number(sel && sel.value) || new Date().getFullYear());
      }
      if (typeof root.recalcAll === 'function') root.recalcAll();
    }).catch(function (err) {
      console.error('[FattureImportXml] lettura file fallita:', err);
      if (typeof root.alert === 'function') root.alert('Errore lettura file: ' + ((err && err.message) || err));
    });
  }

  root.FattureImportXml = {
    parseXml: parseXml,
    importXmlStrings: importXmlStrings,
    handleFileInput: handleFileInput
  };
})(typeof window !== 'undefined' ? window : globalThis);
