(function () {
  'use strict';

  var DichiarazioneExports = {

    buildCSV: function(dich) {
      dich = dich || {};
      var rows = ['quadro,rigo,valore,descrizione,fonte'];

      function processQuadro(nome, obj) {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach(function(rigoKey) {
          var r = obj[rigoKey];
          if (r && typeof r === 'object' && r.value !== undefined) {
            var desc = (r.descrizione || '').replace(/,/g, ';').replace(/\n/g, ' ');
            rows.push(nome + ',' + rigoKey + ',' + r.value + ',"' + desc + '",' + (r.source || 'computed'));
          }
        });
      }

      if (dich.frontespizio) {
        var fp = dich.frontespizio;
        rows.push('Frontespizio,CF,' + (fp.codiceFiscale || '') + ',Codice Fiscale,input');
        rows.push('Frontespizio,annoImposta,' + (fp.annoImposta || '') + ',Anno di imposta,computed');
        rows.push('Frontespizio,tipoDichiarazione,' + (fp.tipoDichiarazione || '') + ',Tipo,input');
      }
      if (dich.quadroLM) processQuadro('LM', dich.quadroLM);
      if (dich.quadroRR) {
        if (dich.quadroRR.sezI) processQuadro('RR', dich.quadroRR.sezI);
        if (dich.quadroRR.sezII) processQuadro('RR', dich.quadroRR.sezII);
      }
      if (dich.quadroRS) processQuadro('RS', dich.quadroRS);
      if (dich.quadroRX) processQuadro('RX', dich.quadroRX);
      if (dich.quadroRW && dich.quadroRW.righi) {
        dich.quadroRW.righi.forEach(function(r, i) {
          rows.push('RW,RW' + (i + 1) + ',' + (r.valoreFinale || 0) + ',' + r.paese + ',input');
        });
      }
      if (dich.quadroRN) rows.push('RN,redditoDipendente,' + (dich.quadroRN.redditoDipendente || 0) + ',Reddito da lavoro dipendente,input');
      if (dich.quadroCE) processQuadro('CE', dich.quadroCE);

      return rows.join('\n');
    },

    buildJSON: function(dich) {
      var clean = JSON.parse(JSON.stringify(dich || {}));
      if (clean._meta) delete clean._meta;
      return JSON.stringify(clean, null, 2);
    },

    exportC2: function(dich, cf, anno) {
      dich = dich || {};
      cf = cf || (dich.frontespizio && dich.frontespizio.codiceFiscale) || 'CF';
      anno = anno || (dich._meta && dich._meta.year) || new Date().getFullYear();

      var json = this.buildJSON(dich);
      var csv = this.buildCSV(dich);
      var filename = 'Dichiarazione_' + anno + '_' + cf;

      if (typeof JSZip !== 'undefined') {
        var zip = new JSZip();
        zip.file(filename + '.json', json);
        zip.file(filename + '.csv', csv);
        zip.generateAsync({ type: 'blob' }).then(function(blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = filename + '.zip';
          a.click();
          setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        });
      } else {
        // Fallback: download just JSON
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename + '.json';
        a.click();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      }
    },

    exportC3: function(dich, cf, anno) {
      dich = dich || {};
      cf = cf || (dich.frontespizio && dich.frontespizio.codiceFiscale) || 'CF';
      anno = anno || (dich._meta && dich._meta.year) || new Date().getFullYear();
      var filename = 'Dichiarazione_' + anno + '_' + cf + '.pdf';

      // Get jsPDF constructor — html2pdf bundles it as window.jspdf.jsPDF
      var JsPDF = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) ||
                  (typeof window !== 'undefined' && window.jsPDF);
      if (!JsPDF) {
        if (typeof alert !== 'undefined') alert('jsPDF non disponibile. Ricarica la pagina.');
        return;
      }

      var doc = new JsPDF('p', 'mm', 'a4');
      var pageW = 210, pageH = 297;
      var margin = 15, contentW = pageW - margin * 2;
      var ACCENT = [46, 170, 220];
      var INK = [18, 26, 36];
      var MUTED = [120, 140, 160];
      var y = margin;
      var pageNum = 1;

      function header() {
        doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.rect(0, 0, pageW, 18, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('REDDITI PF ' + anno, margin, 12);
        doc.setFontSize(9);
        doc.text('CF: ' + cf, pageW - margin, 12, { align: 'right' });
        y = 24;
      }

      function footer() {
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Pag. ' + pageNum + '  \u2014  Generato il ' + new Date().toLocaleDateString('it-IT'), pageW / 2, pageH - 6, { align: 'center' });
      }

      function newPage(title) {
        footer();
        doc.addPage();
        pageNum++;
        header();
        doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(title, margin, y);
        y += 8;
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
      }

      function checkPageBreak(needed) {
        if (y + needed > pageH - 15) {
          footer();
          doc.addPage();
          pageNum++;
          header();
        }
      }

      function renderRigoRow(label, rigoObj) {
        if (!rigoObj) return;
        checkPageBreak(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.text(label, margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        var desc = rigoObj.descrizione || '';
        if (desc.length > 55) desc = desc.substring(0, 52) + '...';
        doc.text(desc, margin + 22, y);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        var valStr = (rigoObj.value || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        doc.text(valStr, pageW - margin, y, { align: 'right' });
        if (rigoObj.source === 'override') {
          doc.setTextColor(245, 166, 35);
          doc.text('*', pageW - margin - 20, y);
        }
        doc.setTextColor(INK[0], INK[1], INK[2]);
        y += 7;
      }

      function renderQuadroTitle(title) {
        checkPageBreak(12);
        doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.rect(margin, y - 4, contentW, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Quadro ' + title, margin + 2, y + 1);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.setFontSize(9);
        y += 10;
      }

      // PAGE 1: Frontespizio
      header();
      doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('FRONTESPIZIO', margin, y);
      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      var fp = dich.frontespizio || {};
      var fields = [
        ['Codice Fiscale', fp.codiceFiscale || ''],
        ['Cognome e Nome', (fp.cognome || '') + ' ' + (fp.nome || '')],
        ['Data di nascita', fp.dataNascita || ''],
        ['Comune di nascita', fp.comuneNascita || ''],
        ['Residenza', (fp.residenzaVia || '') + ', ' + (fp.residenzaComune || '') + ' (' + (fp.residenzaProv || '') + ')'],
        ['Anno d\'imposta', String(anno)],
        ['Tipo dichiarazione', fp.tipoDichiarazione || 'ordinaria']
      ];
      fields.forEach(function(f) {
        checkPageBreak(8);
        doc.setFont('helvetica', 'bold');
        doc.text(f[0] + ':', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(f[1], margin + 50, y);
        y += 7;
      });

      // Quadro LM
      if (dich.quadroLM) {
        newPage('Quadro LM \u2014 Regime Forfettario');
        renderQuadroTitle('LM');
        var lm = dich.quadroLM;
        ['LM1','LM2','LM3','LM4','LM34','LM36','LM47'].forEach(function(k) {
          if (lm[k]) renderRigoRow(k, lm[k]);
        });
      }

      // Quadro RR
      if (dich.quadroRR) {
        newPage('Quadro RR \u2014 Contributi Previdenziali');
        renderQuadroTitle('RR');
        var rr = dich.quadroRR;
        if (rr.sezI) {
          doc.setFont('helvetica', 'italic');
          doc.text('Sezione I \u2014 Artigiani/Commercianti', margin, y);
          y += 6;
          doc.setFont('helvetica', 'normal');
          ['RR1','RR2','RR3','RR4','RR5','RR8'].forEach(function(k) { if (rr.sezI[k]) renderRigoRow(k, rr.sezI[k]); });
        }
        if (rr.sezII) {
          doc.setFont('helvetica', 'italic');
          doc.text('Sezione II \u2014 Gestione Separata', margin, y);
          y += 6;
          doc.setFont('helvetica', 'normal');
          ['RR19','RR20','RR21','RR22'].forEach(function(k) { if (rr.sezII[k]) renderRigoRow(k, rr.sezII[k]); });
        }
      }

      // Quadro RS
      if (dich.quadroRS) {
        newPage('Quadro RS \u2014 Dati Rilevanti Forfettari');
        renderQuadroTitle('RS');
        var rs = dich.quadroRS;
        ['RS371','RS372','RS373','RS374','RS375','RS376','RS377','RS378','RS379','RS380','RS381'].forEach(function(k) {
          if (rs[k]) renderRigoRow(k, rs[k]);
        });
      }

      // Quadro RW
      if (dich.quadroRW && dich.quadroRW.righi && dich.quadroRW.righi.length > 0) {
        newPage('Quadro RW \u2014 Attivit\u00e0 Estere');
        renderQuadroTitle('RW');
        dich.quadroRW.righi.forEach(function(r, i) {
          checkPageBreak(7);
          doc.setFont('helvetica', 'bold');
          doc.text('RW' + (i + 1), margin, y);
          doc.setFont('helvetica', 'normal');
          doc.text(r.paese + ' \u2014 ' + r.tipoConto, margin + 22, y);
          var val = (r.valoreFinale || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' \u20ac';
          doc.text(val, pageW - margin, y, { align: 'right' });
          y += 7;
        });
      }

      // Quadro RX
      if (dich.quadroRX) {
        newPage('Quadro RX \u2014 Compensazioni');
        renderQuadroTitle('RX');
        var rx = dich.quadroRX;
        ['RX1','RX2','RX3','RX4'].forEach(function(k) { if (rx[k]) renderRigoRow(k, rx[k]); });
      }

      // Condizionali
      if (dich.quadroRN) {
        newPage('Quadro RN \u2014 Redditi Diversi (Anno Misto)');
        renderQuadroTitle('RN');
        checkPageBreak(7);
        doc.text('Reddito da lavoro dipendente: ' + (dich.quadroRN.redditoDipendente || 0).toLocaleString('it-IT') + ' \u20ac', margin, y);
        y += 7;
        doc.text('IRPEF lorda: ' + (dich.quadroRN.irpefLorda || 0).toLocaleString('it-IT') + ' \u20ac', margin, y);
        y += 7;
      }
      if (dich.quadroCE && dich.quadroCE.CE1) {
        newPage('Quadro CE \u2014 Crediti Imposte Estere');
        renderQuadroTitle('CE');
        renderRigoRow('CE1', dich.quadroCE.CE1);
      }

      footer();
      doc.save(filename);
    }
  };

  if (typeof window !== 'undefined') window.DichiarazioneExports = DichiarazioneExports;
  if (typeof module !== 'undefined') module.exports = DichiarazioneExports;
})();
