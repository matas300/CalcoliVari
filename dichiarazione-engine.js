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
    buildQuadroRR: function(yearData, settings, quadroLM, overrides) {
      overrides = overrides || {};
      var reddito = (quadroLM && quadroLM.LM4) ? quadroLM.LM4.value : 0;
      var riduzione = (settings.riduzione35 == 1) ? 0.65 : 1;

      function rigo(val, desc, src) {
        return { value: Math.round(val * 100) / 100, descrizione: desc, source: src || 'computed' };
      }

      if (settings.inpsMode === 'gestione_separata') {
        var aliqGs = parseFloat(settings.aliqContributi) || 26.23;
        var contrib = Math.round(reddito * (aliqGs / 100) * 100) / 100;
        return {
          sezI: null,
          sezII: {
            RR19: rigo(reddito, 'Reddito imponibile gestione separata'),
            RR20: rigo(contrib, 'Contributi gestione separata'),
            RR21: rigo(0, 'Contributi già versati'),
            RR22: rigo(Math.max(0, contrib), 'Saldo contributi')
          }
        };
      }

      // Artigiani / Commercianti
      var minimale = parseFloat(settings.minimaleInps) || 0;
      var aliq = parseFloat(settings.aliqContributi) || 0;
      var fissiAnnui = parseFloat(settings.contribFissi) || 0;
      var eccedenti = reddito > minimale ? Math.round((reddito - minimale) * (aliq / 100) * 100) / 100 : 0;
      var rr2 = Math.round(fissiAnnui * riduzione * 100) / 100;
      var rr3 = Math.round(eccedenti * riduzione * 100) / 100;
      var rr4 = Math.round((rr2 + rr3) * 100) / 100;
      var rr5 = parseFloat(overrides.RR5_value) || 0;
      var rr8 = Math.max(0, Math.round((rr4 - rr5) * 100) / 100);

      return {
        sezI: {
          RR1: rigo(reddito, 'Reddito imponibile previdenziale'),
          RR2: rigo(rr2, 'Contributi sul minimale'),
          RR3: rigo(rr3, 'Contributi eccedenti il minimale'),
          RR4: rigo(rr4, 'Totale contributi dovuti'),
          RR5: rigo(rr5, 'Contributi già versati (acconti)'),
          RR8: rigo(rr8, 'Saldo contributi da versare')
        },
        sezII: null
      };
    },
    buildQuadroRS: function(yearData, settings, overrides) {
      overrides = overrides || {};

      function rigoRS(key, desc) {
        if (overrides[key + '_value'] != null) {
          return { value: parseFloat(overrides[key + '_value']), descrizione: desc, source: 'override' };
        }
        return { value: 0, descrizione: desc, source: 'computed' };
      }

      return {
        RS371: rigoRS('RS371', 'Acquisti di beni strumentali'),
        RS372: rigoRS('RS372', 'Spese per collaboratori'),
        RS373: rigoRS('RS373', 'Spese per prestazioni di lavoro'),
        RS374: rigoRS('RS374', 'Premi assicurazione RC professionale'),
        RS375: rigoRS('RS375', 'Acquisti di beni e servizi'),
        RS376: rigoRS('RS376', 'Spese per locazioni'),
        RS377: rigoRS('RS377', 'Altre spese'),
        RS378: rigoRS('RS378', 'Totale spese'),
        RS379: rigoRS('RS379', 'Ricavi dichiarati'),
        RS380: rigoRS('RS380', 'Numero clienti'),
        RS381: rigoRS('RS381', 'Numero dipendenti')
      };
    },
    buildQuadroRX: function(yearData, settings, precedente, overrides) {
      overrides = overrides || {};
      var eccedenza = 0;
      if (precedente && precedente.eccedenza != null) {
        eccedenza = parseFloat(precedente.eccedenza) || 0;
      } else if (settings.creditoAnnoPrecedente != null) {
        eccedenza = parseFloat(settings.creditoAnnoPrecedente) || 0;
      }

      function rigo(val, desc, src) {
        return { value: Math.round(val * 100) / 100, descrizione: desc, source: src || 'computed' };
      }

      return {
        RX1: rigo(eccedenza, 'Credito da anno precedente'),
        RX2: rigo(0, 'Importo chiesto a rimborso'),
        RX3: rigo(0, 'Importo portato in compensazione'),
        RX4: rigo(eccedenza, 'Importo portato al periodo successivo'),
        eccedenza: eccedenza
      };
    },
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
