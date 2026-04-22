/* Fatture Import XML — parser puro FatturaPA + match cliente + dedup.
 *
 * API:
 *  - parseXml(xmlText) → draft fattura (throw su XML invalido)
 *  - matchCliente(snapshot, existingClienti) → { mode:'existing'|'new', cliente|draft }
 *  - dedupKey(draft) → string
 *
 * I flow UI (legacy/nuove) vivono in fatture-import-legacy.js / fatture-import-nuove.js.
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

  function norm(v) {
    return String(v || '').trim().toUpperCase();
  }

  function parseNumero(numeroXml) {
    var s = String(numeroXml || '').trim();
    var m = s.match(/(\d+)\s*\/\s*(\d{4})$/);
    if (m) return { progressivo: parseInt(m[1], 10), anno: parseInt(m[2], 10) };
    m = s.match(/(\d{4})\s*\/\s*(\d+)$/);
    if (m) return { anno: parseInt(m[1], 10), progressivo: parseInt(m[2], 10) };
    return { progressivo: 0, anno: 0 };
  }

  function parseXml(xmlText) {
    if (typeof xmlText !== 'string' || !xmlText.trim()) throw new Error('XML vuoto');
    if (typeof DOMParser !== 'function') throw new Error('DOMParser non disponibile');
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

    var cess = firstChild(header, 'CessionarioCommittente');
    var cessDati = firstChild(cess, 'DatiAnagrafici');
    var cessAnag = firstChild(cessDati, 'Anagrafica');
    var cessIva = firstChild(cessDati, 'IdFiscaleIVA');
    var cessSede = firstChild(cess, 'Sede');
    var clienteSnapshot = {
      denominazione: text(cessAnag, 'Denominazione'),
      nome: text(cessAnag, 'Nome'),
      cognome: text(cessAnag, 'Cognome'),
      partitaIva: text(cessIva, 'IdCodice'),
      idPaese: text(cessIva, 'IdPaese'),
      idCodice: text(cessIva, 'IdCodice'),
      codiceFiscale: text(cessDati, 'CodiceFiscale'),
      indirizzo: text(cessSede, 'Indirizzo'),
      cap: text(cessSede, 'CAP'),
      citta: text(cessSede, 'Comune'),
      provincia: text(cessSede, 'Provincia'),
      nazione: text(cessSede, 'Nazione') || 'IT'
    };

    var lineNodes = body.getElementsByTagName('DettaglioLinee');
    var righe = [];
    for (var i = 0; i < lineNodes.length; i++) {
      var ln = lineNodes[i];
      righe.push({
        descrizione: text(ln, 'Descrizione'),
        quantita: Math.abs(num(text(ln, 'Quantita')) || 1),
        prezzoUnitario: Math.abs(num(text(ln, 'PrezzoUnitario'))),
        iva: num(text(ln, 'AliquotaIVA'))
      });
    }
    if (righe.length === 0) {
      righe.push({ descrizione: '(importata senza righe dettaglio)', quantita: 1, prezzoUnitario: Math.abs(totaleDoc), iva: 0 });
    }

    var datiPag = firstChild(body, 'DatiPagamento');
    var dettPag = firstChild(datiPag, 'DettaglioPagamento');
    var modalita = text(dettPag, 'ModalitaPagamento');
    var scadenza = text(dettPag, 'DataScadenzaPagamento');
    var iban = text(dettPag, 'IBAN');

    var id = 'xmlimp_' + annoProgressivo + '_' + progressivo + '_' + tipoDoc + '_' + Math.round(Math.abs(totaleDoc) * 100);

    var issuedYear = 0, issuedMonth = 0;
    if (dataIso && /^\d{4}-\d{2}-\d{2}/.test(dataIso)) {
      issuedYear = parseInt(dataIso.slice(0, 4), 10);
      issuedMonth = parseInt(dataIso.slice(5, 7), 10);
    }

    return {
      id: id,
      numero: numeroXml,
      data: dataIso,
      anno: annoProgressivo,
      annoProgressivo: annoProgressivo,
      progressivo: progressivo,
      issuedYear: issuedYear,
      issuedMonth: issuedMonth,
      tipoDocumento: tipoDoc === 'TD04' ? 'TD04' : 'TD01',
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
      totaleDocumento: Math.abs(totaleDoc),
      totaleDocument: Math.abs(totaleDoc)
    };
  }

  function matchCliente(snapshot, existing) {
    existing = existing || [];
    var p = norm(snapshot && snapshot.partitaIva);
    if (p) {
      for (var i = 0; i < existing.length; i++) {
        if (norm(existing[i].partitaIva) === p) return { mode: 'existing', cliente: existing[i] };
      }
    }
    var cf = norm(snapshot && snapshot.codiceFiscale);
    if (cf) {
      for (var j = 0; j < existing.length; j++) {
        if (norm(existing[j].codiceFiscale) === cf) return { mode: 'existing', cliente: existing[j] };
      }
    }
    var idP = norm(snapshot && snapshot.idPaese);
    var idC = norm(snapshot && snapshot.idCodice);
    if (idP && idC) {
      for (var k = 0; k < existing.length; k++) {
        if (norm(existing[k].idPaese) + norm(existing[k].idCodice) === idP + idC) {
          return { mode: 'existing', cliente: existing[k] };
        }
      }
    }

    var nome = (snapshot && snapshot.denominazione) ||
      (((snapshot && snapshot.nome) || '') + ' ' + ((snapshot && snapshot.cognome) || '')).trim() ||
      '(senza nome)';
    var rand = Math.random().toString(36).slice(2, 8);
    return {
      mode: 'new',
      draft: {
        id: 'cli_' + Date.now() + '_' + rand,
        nome: nome,
        partitaIva: (snapshot && snapshot.partitaIva) || '',
        codiceFiscale: (snapshot && snapshot.codiceFiscale) || '',
        idPaese: (snapshot && snapshot.idPaese) || '',
        idCodice: (snapshot && snapshot.idCodice) || '',
        indirizzo: (snapshot && snapshot.indirizzo) || '',
        cap: (snapshot && snapshot.cap) || '',
        citta: (snapshot && snapshot.citta) || '',
        provincia: (snapshot && snapshot.provincia) || '',
        nazione: (snapshot && snapshot.nazione) || 'IT',
        pec: '',
        codiceSDI: '',
        note: ''
      }
    };
  }

  function dedupKey(f) {
    return (f.tipoDocumento || 'TD01') + '|' + (f.annoProgressivo || 0) + '|' + (f.progressivo || 0) + '|' + (f.numero || '');
  }

  var api = { parseXml: parseXml, matchCliente: matchCliente, dedupKey: dedupKey };
  root.FattureImportXml = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
