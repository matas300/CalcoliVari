(function () {
  'use strict';
  var DichiarazioneEngine = {
    buildFrontespizio: function(profile, year, input) {
      var ana = (profile.settings && profile.settings.anagrafica) || {};
      var att = (profile.settings && profile.settings.attivita) || {};
      var inp = input || {};
      return {
        codiceFiscale: ana.codiceFiscale || '',
        cognome: ana.cognome || '',
        nome: ana.nome || '',
        sesso: ana.sesso || '',
        dataNascita: ana.dataNascita || '',
        comuneNascita: ana.comuneNascita || '',
        provNascita: ana.provNascita || '',
        residenzaVia: inp.residenzaVia || ana.residenzaVia || '',
        residenzaComune: inp.residenzaComune || ana.residenzaComune || '',
        residenzaProv: inp.residenzaProv || ana.residenzaProv || '',
        residenzaCap: inp.residenzaCap || ana.residenzaCap || '',
        domicilioFiscaleVia: ana.domicilioFiscaleVia || '',
        domicilioFiscaleComune: ana.domicilioFiscaleComune || '',
        domicilioFiscaleProv: ana.domicilioFiscaleProv || '',
        domicilioFiscaleCap: ana.domicilioFiscaleCap || '',
        telefono: ana.telefono || '',
        email: ana.email || '',
        codiceAteco: att.codiceAteco || '',
        descrizioneAttivita: att.descrizioneAttivita || '',
        dataInizioAttivita: att.dataInizioAttivita || '',
        annoImposta: year,
        tipoDichiarazione: inp.tipoDichiarazione || 'ordinaria',
        dataPresentazione: inp.dataPresentazione || null,
        annoDeclarazione: year + 1
      };
    },
    buildQuadroLM: function(yearData, settings, overrides) {
      overrides = overrides || {};
      var year = yearData.year || new Date().getFullYear();

      // Compute total ricavi (fatture paid in year)
      var totalRicavi = 0;
      var fatture = yearData.fatture || {};
      Object.keys(fatture).forEach(function(mese) {
        var lista = fatture[mese] || [];
        lista.forEach(function(f) {
          var pagAnno = f.pagAnno != null ? f.pagAnno : year;
          if (pagAnno === year) {
            totalRicavi += (parseFloat(f.importo) || 0);
          }
        });
      });
      totalRicavi = Math.round(totalRicavi * 100) / 100;

      var coeff = parseFloat(settings.coefficiente) || 0;
      var aliquota = parseFloat(settings.impostaSostitutiva) || 15;

      // LM1: ricavi
      var lm1 = totalRicavi;

      // LM2: reddito lordo (with override support)
      var lm2, lm2Source;
      if (overrides.LM2_value != null) {
        lm2 = parseFloat(overrides.LM2_value);
        lm2Source = 'override';
      } else {
        lm2 = Math.round(lm1 * (coeff / 100) * 100) / 100;
        lm2Source = 'computed';
      }

      // LM3: contributi INPS deducibili (stima da settings)
      var contribFissi = parseFloat(settings.contribFissi) || 0;
      var minimale = parseFloat(settings.minimaleInps) || 0;
      var aliqContrib = parseFloat(settings.aliqContributi) || 0;
      var redditoCassa = lm2;
      var contribVar = 0;
      if (aliqContrib > 0 && redditoCassa > minimale && settings.inpsMode === 'artigiani') {
        contribVar = Math.round((redditoCassa - minimale) * (aliqContrib / 100) * 100) / 100;
      } else if (settings.inpsMode === 'gestione_separata' && aliqContrib > 0) {
        contribVar = Math.round(redditoCassa * (aliqContrib / 100) * 100) / 100;
        contribFissi = 0;
      }
      var riduzione = (settings.riduzione35 == 1) ? 0.65 : 1;
      var lm3 = Math.round((contribFissi + contribVar) * riduzione * 100) / 100;
      if (overrides.LM3_value != null) { lm3 = parseFloat(overrides.LM3_value); }

      // LM4: reddito netto
      var lm4 = Math.max(0, Math.round((lm2 - lm3) * 100) / 100);

      // LM34: after perdite pregresse
      var perditePregresse = parseFloat(overrides.LM_perditePregresse) || 0;
      var lm34 = Math.max(0, Math.round((lm4 - perditePregresse) * 100) / 100);

      // LM36: imposta sostitutiva
      var lm36 = Math.round(lm34 * (aliquota / 100) * 100) / 100;

      function rigo(val, desc, source) {
        return { value: val, descrizione: desc, source: source || 'computed' };
      }

      return {
        LM1: rigo(lm1, 'Ricavi o compensi percepiti'),
        LM2: { value: lm2, descrizione: 'Reddito lordo (ricavi \u00d7 coefficiente)', source: lm2Source },
        LM3: rigo(lm3, 'Contributi previdenziali deducibili'),
        LM4: rigo(lm4, 'Reddito al netto dei contributi'),
        LM34: rigo(lm34, 'Reddito imponibile (al netto perdite)'),
        LM36: rigo(lm36, 'Imposta sostitutiva'),
        LM47: rigo(lm36, 'Imposta sostitutiva (riepilogo)'),
        _meta: { coeff: coeff, aliquota: aliquota, perditePregresse: perditePregresse }
      };
    },
    buildQuadroRR: function() { return {}; },
    buildQuadroRS: function() { return {}; },
    buildQuadroRX: function() { return {}; },
    buildQuadroRW: function() { return {}; },
    buildCondizionali: function() { return {}; },
    buildDichiarazione: function() { return {}; },
    validateDichiarazione: function() { return { errors: [], warnings: [] }; },
    validateCodiceFiscale: function(cf) {
      if (!cf || typeof cf !== 'string') return false;
      cf = cf.toUpperCase().trim();
      if (!/^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/.test(cf)) return false;
      var ODD = {0:1,1:0,2:5,3:7,4:9,5:13,6:15,7:17,8:19,9:21,
        A:1,B:0,C:5,D:7,E:9,F:13,G:15,H:17,I:19,J:21,
        K:2,L:4,M:18,N:20,O:11,P:3,Q:6,R:8,S:12,T:14,
        U:16,V:10,W:22,X:25,Y:24,Z:23};
      var EVEN = {0:0,1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,
        A:0,B:1,C:2,D:3,E:4,F:5,G:6,H:7,I:8,J:9,
        K:10,L:11,M:12,N:13,O:14,P:15,Q:16,R:17,S:18,T:19,
        U:20,V:21,W:22,X:23,Y:24,Z:25};
      var sum = 0;
      for (var i = 0; i < 15; i++) {
        var c = cf[i];
        sum += (i % 2 === 0) ? ODD[c] : EVEN[c];
      }
      return String.fromCharCode(65 + (sum % 26)) === cf[15];
    },
    VERSION: '0.1.0'
  };
  if (typeof window !== 'undefined') window.DichiarazioneEngine = DichiarazioneEngine;
  if (typeof module !== 'undefined') module.exports = DichiarazioneEngine;
})();
