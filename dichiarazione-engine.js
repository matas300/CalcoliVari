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

      // LM3: contributi INPS deducibili — art. 1 c. 64 L. 190/2014 (criterio di cassa)
      // Default: somma pagamenti tipo='contributi' nell'anno (yearData è già year-scoped).
      // Fallback: se pagamenti undefined/null → competenza (settings.contribFissi + contribVar computato).
      // Override: overrides.LM3_value vince sempre.
      var lm3, lm3Source;
      var pagamenti = yearData.pagamenti;
      if (overrides.LM3_value != null) {
        lm3 = parseFloat(overrides.LM3_value);
        lm3Source = 'override';
      } else if (Array.isArray(pagamenti)) {
        var sumContrib = 0;
        pagamenti.forEach(function (p) {
          if (p && p.tipo === 'contributi') {
            var imp = parseFloat(p.importo);
            if (!isNaN(imp)) sumContrib += imp;
          }
        });
        lm3 = Math.round(sumContrib * 100) / 100;
        lm3Source = 'pagamenti';
      } else {
        // Fallback competenza (backward compat quando pagamenti non è tracciato)
        var contribFissi = parseFloat(settings.contribFissi) || 0;
        var minimale = parseFloat(settings.minimaleInps) || 0;
        var aliqContrib = parseFloat(settings.aliqContributi) || 0;
        var redditoCassa = lm2;
        var contribVar = 0;
        if (aliqContrib > 0 && redditoCassa > minimale && settings.inpsMode !== 'gestione_separata') {
          contribVar = Math.round((redditoCassa - minimale) * (aliqContrib / 100) * 100) / 100;
        } else if (settings.inpsMode === 'gestione_separata' && aliqContrib > 0) {
          contribVar = Math.round(redditoCassa * (aliqContrib / 100) * 100) / 100;
          contribFissi = 0;
        }
        // Riduzione 35% INPS vale SOLO per artigiani/commercianti (art. 1 c. 77 L. 190/2014).
        // Per gestione separata non si applica.
        var riduzione = (settings.riduzione35 == 1
          && (settings.inpsMode === 'artigiani_commercianti' || settings.inpsMode === 'artcom'))
          ? 0.65 : 1;
        lm3 = Math.round((contribFissi + contribVar) * riduzione * 100) / 100;
        lm3Source = 'fallback-competenza';
      }

      // LM4: reddito netto
      var lm4 = Math.max(0, Math.round((lm2 - lm3) * 100) / 100);

      // LM34: after perdite pregresse — art. 84 TUIR: scadenza 5 periodi d'imposta
      // R3: se settings.perditePregresseDettaglio (array {anno,importo}) presente → filtra
      //     per anno >= year - 5 (perdita anno X utilizzabile fino a X+5); altrimenti fallback legacy.
      var perditeWarnings = [];
      var perditePregresse = 0;
      var dettaglio = (settings && Array.isArray(settings.perditePregresseDettaglio))
        ? settings.perditePregresseDettaglio
        : null;
      if (dettaglio && dettaglio.length > 0) {
        for (var pi = 0; pi < dettaglio.length; pi++) {
          var pd = dettaglio[pi] || {};
          var annoP = parseInt(pd.anno, 10);
          var impP = parseFloat(pd.importo) || 0;
          if (!annoP || impP <= 0) continue;
          if (annoP >= year - 5) {
            perditePregresse += impP;
          } else {
            perditeWarnings.push(
              'Perdita anno ' + annoP + ' (' + impP.toFixed(2).replace('.', ',') +
              ' \u20ac) scaduta: non pi\u00f9 utilizzabile dal ' + (annoP + 6)
            );
          }
        }
        perditePregresse = Math.round(perditePregresse * 100) / 100;
      } else {
        // Backward compat: overrides.LM_perditePregresse o settings.perditePregresse come numero aggregato
        var legacyVal = parseFloat(overrides.LM_perditePregresse);
        if (isNaN(legacyVal)) legacyVal = parseFloat(settings && settings.perditePregresse);
        if (!isNaN(legacyVal) && legacyVal > 0) {
          perditePregresse = legacyVal;
          perditeWarnings.push(
            'Dettaglio anno perdite mancante: impossibile verificare scadenza 5 anni art. 84 TUIR'
          );
        }
      }
      // Override esplicito numerico ha sempre la precedenza (mantiene compat test legacy)
      if (overrides.LM_perditePregresse != null && !dettaglio) {
        perditePregresse = parseFloat(overrides.LM_perditePregresse) || 0;
      }
      var lm34 = Math.max(0, Math.round((lm4 - perditePregresse) * 100) / 100);

      // LM36: imposta sostitutiva
      var lm36 = Math.round(lm34 * (aliquota / 100) * 100) / 100;

      // B3 — sezione II: imposta netta, ritenute, acconti, saldo (Modello Redditi PF 2026 quadro LM sez. II)
      if (overrides.LM34_value != null) {
        lm34 = Math.round(parseFloat(overrides.LM34_value) * 100) / 100;
      }
      var lm38 = Math.round(lm34 * (aliquota / 100) * 100) / 100;
      var lm39 = parseFloat(overrides.LM39_value) || 0;
      var lm40 = Math.max(0, Math.round((lm38 - lm39) * 100) / 100);
      var lm41 = parseFloat(overrides.LM41_value) || 0;
      var lm42 = parseFloat(overrides.LM42_value) || 0;
      var lm43 = parseFloat(overrides.LM43_value) || 0;
      var saldoLordo = Math.round((lm40 - lm41 - lm42 - lm43) * 100) / 100;
      var lm45 = saldoLordo > 0 ? saldoLordo : 0;
      var lm46 = saldoLordo < 0 ? Math.round(-saldoLordo * 100) / 100 : 0;
      // Ricalcola lm36 coerentemente con eventuale LM34 override
      lm36 = Math.round(lm34 * (aliquota / 100) * 100) / 100;

      function rigo(val, desc, source) {
        return { value: val, descrizione: desc, source: source || 'computed' };
      }

      return {
        LM1: rigo(lm1, 'Ricavi o compensi percepiti'),
        LM2: { value: lm2, descrizione: 'Reddito lordo (ricavi \u00d7 coefficiente)', source: lm2Source },
        LM3: rigo(lm3, 'Contributi previdenziali deducibili', lm3Source),
        LM4: rigo(lm4, 'Reddito al netto dei contributi'),
        LM34: rigo(lm34, 'Reddito imponibile (al netto perdite)'),
        LM36: rigo(lm36, 'Imposta sostitutiva'),
        LM38: rigo(lm38, 'Imposta lorda'),
        LM39: rigo(lm39, 'Detrazioni e crediti d\u2019imposta', overrides.LM39_value != null ? 'override' : 'computed'),
        LM40: rigo(lm40, 'Imposta netta'),
        LM41: rigo(lm41, 'Ritenute subite', overrides.LM41_value != null ? 'override' : 'computed'),
        LM42: rigo(lm42, 'Credito eccedenze anno precedente', overrides.LM42_value != null ? 'override' : 'computed'),
        LM43: rigo(lm43, 'Acconti versati', overrides.LM43_value != null ? 'override' : 'computed'),
        LM45: rigo(lm45, 'Imposta a debito (saldo)'),
        LM46: rigo(lm46, 'Imposta a credito'),
        LM47: rigo(lm36, 'Imposta sostitutiva (riepilogo)'),
        _perditeWarnings: perditeWarnings,
        _meta: { coeff: coeff, aliquota: aliquota, perditePregresse: perditePregresse }
      };
    },
    buildQuadroRR: function(yearData, settings, quadroLM, overrides) {
      overrides = overrides || {};
      var reddito = (quadroLM && quadroLM.LM4) ? quadroLM.LM4.value : 0;
      // Riduzione 35% INPS vale SOLO per artigiani/commercianti (art. 1 c. 77 L. 190/2014).
      // Per gestione separata non si applica.
      var riduzione = (settings.riduzione35 == 1
        && (settings.inpsMode === 'artigiani_commercianti' || settings.inpsMode === 'artcom'))
        ? 0.65 : 1;

      function rigo(val, desc, src) {
        return { value: Math.round(val * 100) / 100, descrizione: desc, source: src || 'computed' };
      }

      // CASSE-1: warning se cassa previdenziale non gestita (INARCASSA, CNPADC, ENPACL, EPAP, ecc.)
      // Le casse autonome richiedono compilazione manuale del quadro contributivo.
      var rrWarnings = [];
      var recognizedInpsModes = ['gestione_separata', 'artigiani_commercianti', 'artcom', '', null, undefined];
      if (recognizedInpsModes.indexOf(settings.inpsMode) === -1) {
        rrWarnings.push({
          severity: 'error',
          code: 'RR_CASSA_NON_GESTITA',
          message: 'Cassa previdenziale "' + settings.inpsMode + '" non gestita: il quadro RR è calcolato come artigiani/commercianti per default. Per casse autonome (INARCASSA, CNPADC, ENPACL, EPAP, ecc.) inserire i contributi manualmente e consultare l\'ordine professionale.'
        });
      }

      // v3-RIDUZIONE35: la riduzione 35% è un'agevolazione INPS che richiede
      // comunicazione formale all'ente (art. 1 c. 77 L. 190/2014). L'app la
      // applica al calcolo se attiva, ma non può sapere se il contribuente
      // l'ha effettivamente comunicata. Warning informativo per evitare
      // discrepanze tra calcolo app e F24 precompilati INPS.
      if ((settings.riduzione35 == 1 || settings.riduzione35 === true)
          && (settings.inpsMode === 'artigiani_commercianti' || settings.inpsMode === 'artcom')) {
        rrWarnings.push({
          severity: 'warning',
          code: 'RR_RIDUZIONE35_VERIFICA',
          message: 'Riduzione 35% INPS attiva: verifica di averla comunicata formalmente all\'INPS al momento dell\'iscrizione (art. 1 c. 77 L. 190/2014). Se non comunicata, gli F24 precompilati INPS non la applicheranno e i versamenti reali differiranno dal calcolo dell\'app.'
        });
      }

      // v3-RR21-GS: helper condiviso per leggere acconti contributi versati da pagamenti
      function readAccontiContributiVersati() {
        var pagamenti = (yearData && Array.isArray(yearData.pagamenti)) ? yearData.pagamenti : [];
        var tot = 0;
        for (var i = 0; i < pagamenti.length; i++) {
          var p = pagamenti[i];
          if (!p || p.tipo !== 'contributi') continue;
          var keys = Array.isArray(p.linkedKeys) ? p.linkedKeys : [];
          var match = false;
          for (var j = 0; j < keys.length; j++) {
            if (/^contributi_acc[12]_/.test(String(keys[j]))) { match = true; break; }
          }
          if (match) tot += parseFloat(p.importo) || 0;
        }
        return Math.round(tot * 100) / 100;
      }

      if (settings.inpsMode === 'gestione_separata') {
        // REG-2: aliquota Gestione Separata esclusivo 2024-2026 = 26,07% (Circ. INPS 26/2025 + 8/2026)
        var aliqGs = parseFloat(settings.aliqContributi) || 26.07;
        var contribGs = Math.round(reddito * (aliqGs / 100) * 100) / 100;
        // v3-RR21-GS: legge acconti versati da pagamenti (stesso pattern di RR7 sez. I)
        var rr21Source = 'computed';
        var rr21Value;
        if (overrides.RR21_value != null) {
          rr21Value = parseFloat(overrides.RR21_value) || 0;
          rr21Source = 'override';
        } else {
          rr21Value = readAccontiContributiVersati();
        }
        var saldoGs = Math.round((contribGs - rr21Value) * 100) / 100;
        return {
          sezI: null,
          sezII: {
            RR19: rigo(reddito, 'Reddito imponibile gestione separata'),
            RR20: rigo(contribGs, 'Contributi gestione separata'),
            RR21: rigo(rr21Value, 'Acconti contributi GS già versati', rr21Source),
            RR22: rigo(Math.max(0, saldoGs), 'Saldo contributi (max 0, RR20 − RR21)'),
            RR22_credito: rigo(saldoGs < 0 ? -saldoGs : 0, 'Contributi a credito (se RR20 − RR21 < 0)')
          },
          _warnings: rrWarnings
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

      // RR6 = RR4 − RR5 (totale contributi a saldo dopo compensazione manuale); override supportato
      var rr6Source = 'computed';
      var rr6;
      if (overrides.RR6_value != null) {
        rr6 = parseFloat(overrides.RR6_value) || 0;
        rr6Source = 'override';
      } else {
        rr6 = Math.round((rr4 - rr5) * 100) / 100;
      }

      // RR7 = acconti effettivamente versati per contributi_acc1_{year} e contributi_acc2_{year}
      // Sommati da yearData.pagamenti[] dove tipo==='contributi' e linkedKeys matcha /^contributi_acc[12]_/
      var rr7Source = 'computed';
      var rr7 = 0;
      if (overrides.RR7_value != null) {
        rr7 = parseFloat(overrides.RR7_value) || 0;
        rr7Source = 'override';
      } else {
        var pagamenti = (yearData && Array.isArray(yearData.pagamenti)) ? yearData.pagamenti : [];
        for (var i = 0; i < pagamenti.length; i++) {
          var p = pagamenti[i];
          if (!p || p.tipo !== 'contributi') continue;
          var keys = Array.isArray(p.linkedKeys) ? p.linkedKeys : [];
          var match = false;
          for (var j = 0; j < keys.length; j++) {
            if (/^contributi_acc[12]_/.test(String(keys[j]))) { match = true; break; }
          }
          if (match) rr7 += parseFloat(p.importo) || 0;
        }
        rr7 = Math.round(rr7 * 100) / 100;
      }

      var saldoNetto = Math.round((rr6 - rr7) * 100) / 100;
      var rr8 = saldoNetto > 0 ? saldoNetto : 0;
      var rr8Credito = saldoNetto < 0 ? Math.round(-saldoNetto * 100) / 100 : 0;

      return {
        sezI: {
          RR1: rigo(reddito, 'Reddito imponibile previdenziale'),
          RR2: rigo(rr2, 'Contributi sul minimale'),
          RR3: rigo(rr3, 'Contributi eccedenti il minimale'),
          RR4: rigo(rr4, 'Totale contributi dovuti'),
          RR5: rigo(rr5, 'Contributi compensati / già versati (override)', overrides.RR5_value != null ? 'override' : 'computed'),
          RR6: rigo(rr6, 'Totale contributi a saldo (RR4 − RR5)', rr6Source),
          RR7: rigo(rr7, 'Acconti effettivamente versati', rr7Source),
          RR8: rigo(rr8, 'Saldo contributi a debito (max 0, RR6 − RR7)'),
          RR8_credito: rigo(rr8Credito, 'Contributi a credito (se RR6 − RR7 < 0)')
        },
        sezII: null,
        _warnings: rrWarnings
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
        RS381: rigoRS('RS381', 'Numero dipendenti'),
        // R10 — i righi RS371-RS381 sono INFORMATIVI per i forfettari:
        // non deducono dal reddito (che è già determinato applicando il
        // coefficiente ATECO ai ricavi). Esposto come campo leggibile
        // dall'UI per mostrare un disclaimer all'utente.
        _disclaimer: 'Quadro RS per forfettari: i righi RS371-RS381 sono dati informativi (spese sostenute per lo svolgimento dell\'attività) e NON deducono dal reddito. Il reddito forfettario è già determinato applicando il coefficiente ai ricavi.'
      };
    },
    buildQuadroRX: function(yearData, settings, precedente, overrides) {
      overrides = overrides || {};
      var eccedenzaRaw = 0;
      if (precedente && precedente.eccedenza != null) {
        eccedenzaRaw = parseFloat(precedente.eccedenza) || 0;
      } else if (settings.creditoAnnoPrecedente != null) {
        eccedenzaRaw = parseFloat(settings.creditoAnnoPrecedente) || 0;
      }
      // v3-RX-CLAMP: un credito d'imposta non può essere negativo.
      var eccedenza = Math.max(0, eccedenzaRaw);
      var rxWarnings = [];
      if (eccedenzaRaw < 0) {
        rxWarnings.push({
          severity: 'warning',
          code: 'RX_ECCEDENZA_NEGATIVA',
          message: 'Eccedenza anno precedente negativa (' + eccedenzaRaw + '): clampata a 0. Verifica l\'input — un credito d\'imposta non può essere negativo.'
        });
      }

      function rigo(val, desc, src) {
        return { value: Math.round(val * 100) / 100, descrizione: desc, source: src || 'computed' };
      }

      return {
        RX1: rigo(eccedenza, 'Credito da anno precedente'),
        RX2: rigo(0, 'Importo chiesto a rimborso'),
        RX3: rigo(0, 'Importo portato in compensazione'),
        RX4: rigo(eccedenza, 'Importo portato al periodo successivo'),
        eccedenza: eccedenza,
        _warnings: rxWarnings
      };
    },
    buildQuadroRW: function(contiEsteri) {
      contiEsteri = contiEsteri || [];
      var r2 = function(n) { return Math.round(n * 100) / 100; };
      var FIN_TYPES = { conto_corrente: true, deposito: true, prodotti_finanziari: true };
      var ivafeTotale = 0;
      var ivieTotale = 0;
      var icTotale = 0; // imposta sul valore cripto-attività (L. 197/2022)
      var aggregateWarnings = [];
      var anyMissingDetail = false;

      var righi = contiEsteri.map(function(c, idx) {
        c = c || {};
        var tipo = c.tipo || null;
        var quotaRaw = (typeof c.quotaPossesso === 'number' && !isNaN(c.quotaPossesso)) ? c.quotaPossesso : 1;
        var quota = Math.min(1, Math.max(0, quotaRaw));
        var giacenza = parseFloat(c.giacenzaMediaAnnua);
        if (isNaN(giacenza)) giacenza = 0;
        var valoreImmobile = parseFloat(c.valoreImmobile);
        if (isNaN(valoreImmobile)) valoreImmobile = 0;
        var primaCasa = !!c.primaCasa;

        var ivafe = 0;
        var ivie = 0;
        var warnings = [];

        if (quota !== quotaRaw) {
          warnings.push('Quota possesso fuori range [0,1]: clampata da ' + quotaRaw + ' a ' + quota);
        }

        if (tipo === 'immobile') {
          var aliq = primaCasa ? 0.004 : 0.0106;
          var ivieRaw = valoreImmobile * aliq * quota;
          if (ivieRaw > 0 && ivieRaw < 200) {
            warnings.push('IVIE calcolata ' + r2(ivieRaw) + ' \u20ac sotto soglia minima 200 \u20ac: non dovuta');
            ivie = 0;
          } else {
            ivie = r2(ivieRaw);
          }
        } else if (tipo === 'criptovalute') {
          // Imposta sul valore cripto-attivit\u00e0 (L. 197/2022 art. 1 cc. 126-147; Provv. AdE 7/8/2023)
          // IC = 2 per mille del valore detenuto. Nessuna soglia 5.000 \u20ac (vale solo IVAFE conti UE/SEE).
          var valoreCriptoRaw = parseFloat(c.valoreFinale);
          if (isNaN(valoreCriptoRaw)) valoreCriptoRaw = 0;
          var valoreCripto = Math.max(0, valoreCriptoRaw);
          if (valoreCripto !== valoreCriptoRaw) {
            warnings.push('Valore cripto negativo (' + valoreCriptoRaw + '): trattato come 0. Verificare input.');
          }
          var ic = 0;
          if (valoreCripto > 0) {
            ic = r2(valoreCripto * 0.002 * quota);
            warnings.push('Cripto-attivit\u00e0: eventuali plusvalenze realizzate (cessione/conversione) sono soggette a imposta sostitutiva 26% \u2014 verificare quadro RT (fuori scope monitoraggio RW)');
          }
          icTotale += ic;
          return {
            paese: c.paese || c.codicePaese || '',
            codicePaese: c.codicePaese || c.paese || '',
            tipoConto: c.tipoConto || '',
            iban: c.iban || '',
            valoreIniziale: parseFloat(c.valoreIniziale) || 0,
            valoreFinale: valoreCripto,
            giorniDetenzione: parseInt(c.giorniDetenzione) || 0,
            valutaCodice: c.valutaCodice || 'EUR',
            tipo: 'criptovalute',
            exchange: c.exchange || '',
            walletAddress: c.walletAddress || '',
            giacenzaMediaAnnua: 0,
            valoreImmobile: 0,
            primaCasa: false,
            quotaPossesso: quota,
            ivafeRigoDovuto: 0,
            ivieRigoDovuto: 0,
            icRigoDovuto: ic,
            _warnings: warnings
          };
        } else if (tipo && FIN_TYPES[tipo]) {
          if (giacenza > 0) {
            ivafe = r2(giacenza * 0.002 * quota);
          }
          if (giacenza > 0 && giacenza <= 5000) {
            warnings.push('Giacenza < 5.000 \u20ac: IVAFE non dovuta per conti correnti/depositi ma obbligo monitoraggio RW attivo');
          }
        } else {
          // Backward compat: nessun tipo → rigo legacy, warning soglia IVAFE
          anyMissingDetail = true;
          warnings.push('Rigo ' + (idx + 1) + ': tipo/giacenza non specificati — verificare soglia IVAFE 5.000 \u20ac e calcolo imposta manualmente');
        }

        ivafeTotale += ivafe;
        ivieTotale += ivie;

        return {
          // Campi legacy (backward compat per UI existing)
          paese: c.paese || c.codicePaese || '',
          codicePaese: c.codicePaese || c.paese || '',
          tipoConto: c.tipoConto || '',
          iban: c.iban || '',
          valoreIniziale: parseFloat(c.valoreIniziale) || 0,
          valoreFinale: parseFloat(c.valoreFinale) || 0,
          giorniDetenzione: parseInt(c.giorniDetenzione) || 0,
          valutaCodice: c.valutaCodice || 'EUR',
          // Campi R2
          tipo: tipo || 'conto_corrente',
          giacenzaMediaAnnua: giacenza,
          valoreImmobile: valoreImmobile,
          primaCasa: primaCasa,
          quotaPossesso: quota,
          ivafeRigoDovuto: ivafe,
          ivieRigoDovuto: ivie,
          icRigoDovuto: 0,
          _warnings: warnings
        };
      });

      if (anyMissingDetail) {
        aggregateWarnings.push('Quadro RW: impostare tipo/giacenza/valore per ogni posizione estera per calcolo IVAFE/IVIE');
      }

      return {
        righi: righi,
        totali: { ivafeTotale: r2(ivafeTotale), ivieTotale: r2(ivieTotale), icTotale: r2(icTotale) },
        warnings: aggregateWarnings
      };
    },
    buildCondizionali: function(input, yearData) {
      input = input || {};
      var flags = input.flags || {};
      var result = {};

      if (flags.annoMisto) {
        var redditoDip = parseFloat(input.redditoDipendente) || 0;
        var irpef = 0;
        if (redditoDip <= 28000) irpef = redditoDip * 0.23;
        else if (redditoDip <= 50000) irpef = 28000 * 0.23 + (redditoDip - 28000) * 0.35;
        else irpef = 28000 * 0.23 + 22000 * 0.35 + (redditoDip - 50000) * 0.43;
        irpef = Math.round(irpef * 100) / 100;
        result.quadroRN = {
          redditoDipendente: redditoDip,
          irpefLorda: irpef,
          addizionaleRegionale: parseFloat(input.addizionaleRegionale) || 0,
          addizionaleComunale: parseFloat(input.addizionaleComunale) || 0
        };
        result.quadroRP = { oneriDetraibili: input.oneriDetraibili || [] };
        result.quadroRV = { addizionali: (parseFloat(input.addizionaleRegionale) || 0) + (parseFloat(input.addizionaleComunale) || 0) };
      }

      if (flags.imposteEstere) {
        var creditoEstero = parseFloat(input.creditoImposteEstere) || 0;
        result.quadroCE = {
          CE1: { value: creditoEstero, descrizione: 'Credito per imposte pagate all\'estero', source: 'input' }
        };
      }

      if (flags.altriCrediti) {
        result.quadroCR = { crediti: input.altriCrediti || [] };
      }

      return result;
    },
    buildDichiarazione: function(year, profile, input) {
      profile = profile || {};
      input = input || {};
      var overrides = input.overrides || {};
      var settings = (profile && profile.settings) || {};

      var quadroLM = this.buildQuadroLM(profile, settings, overrides);
      var quadroRR = this.buildQuadroRR(profile, settings, quadroLM, overrides);
      var quadroRS = this.buildQuadroRS(profile, settings, overrides);
      var quadroRX = this.buildQuadroRX(profile, settings, input.precedente || null, overrides);
      var quadroRW = this.buildQuadroRW(input.contiEsteri || (profile && profile.dichiarazione && profile.dichiarazione.contiEsteri) || []);
      var frontespizio = this.buildFrontespizio(profile, year, input);
      var condizionali = this.buildCondizionali(input, profile);

      var dich = {
        frontespizio: frontespizio,
        quadroLM: quadroLM,
        quadroRR: quadroRR,
        quadroRS: quadroRS,
        quadroRX: quadroRX,
        quadroRW: quadroRW,
        _meta: { timestamp: new Date().toISOString(), year: year }
      };

      Object.keys(condizionali).forEach(function(k) {
        dich[k] = condizionali[k];
      });

      return dich;
    },
    validateDichiarazione: function(dich) {
      dich = dich || {};
      var errors = [];
      var warnings = [];
      var fp = dich.frontespizio || {};
      var lm = dich.quadroLM || {};
      var rr = dich.quadroRR || {};
      var rw = dich.quadroRW || {};
      var rs = dich.quadroRS || {};

      // Errors
      if (!fp.codiceFiscale || !this.validateCodiceFiscale(fp.codiceFiscale)) {
        errors.push({ code: 'CF_INVALID', message: 'Codice fiscale mancante o non valido', quadro: 'Frontespizio', rigo: 'CF', severity: 'error' });
      }
      if (!fp.cognome || !fp.nome) {
        errors.push({ code: 'ANAGRAFICA_INCOMPLETA', message: 'Cognome e nome obbligatori', quadro: 'Frontespizio', rigo: 'anagrafica', severity: 'error' });
      }
      if (!fp.dataNascita) {
        errors.push({ code: 'DATA_NASCITA_MANCANTE', message: 'Data di nascita obbligatoria', quadro: 'Frontespizio', rigo: 'dataNascita', severity: 'error' });
      }
      // v3-INTEGRATIVA: warning su tipoDichiarazione integrativa/correttiva
      if (fp.tipoDichiarazione === 'integrativa') {
        warnings.push({
          code: 'DICHIARAZIONE_INTEGRATIVA',
          message: 'Dichiarazione integrativa: l\'app NON calcola il delta automatico rispetto alla dichiarazione originaria. Verifica tu i righi che modifichi e barra la casella corretta sul software AdE (1=ravvedimento, 2=correttiva favorevole entro termine, 3=integrativa entro l\'anno successivo). Art. 2 c. 8 DPR 322/1998.',
          quadro: 'Frontespizio', rigo: 'tipoDichiarazione', severity: 'warning'
        });
      } else if (fp.tipoDichiarazione === 'correttiva') {
        warnings.push({
          code: 'DICHIARAZIONE_CORRETTIVA',
          message: 'Dichiarazione correttiva nei termini: l\'app non calcola il delta automatico. Trasmetti via Entratel/Fisconline entro la scadenza ordinaria del modello.',
          quadro: 'Frontespizio', rigo: 'tipoDichiarazione', severity: 'warning'
        });
      }
      // v3-RX-CLAMP propagazione warnings
      if (dich.quadroRX && dich.quadroRX._warnings && dich.quadroRX._warnings.length) {
        dich.quadroRX._warnings.forEach(function (w) {
          var entry = { code: w.code || 'RX_WARN', message: w.message, quadro: 'RX', rigo: 'RX1', severity: w.severity || 'warning' };
          if (entry.severity === 'error') errors.push(entry);
          else warnings.push(entry);
        });
      }
      if (rw.righi && rw.righi.length > 0) {
        rw.righi.forEach(function(r, i) {
          if (!r.paese) {
            errors.push({ code: 'RW_PAESE_MANCANTE', message: 'Paese mancante per conto estero ' + (i + 1), quadro: 'RW', rigo: 'RW' + (i + 1), severity: 'error' });
          }
          if (r._warnings && r._warnings.length) {
            r._warnings.forEach(function(w, j) {
              warnings.push({ code: 'RW_RIGO_WARN', message: 'RW rigo ' + (i + 1) + ': ' + w, quadro: 'RW', rigo: 'RW' + (i + 1) + '_' + j, severity: 'warning' });
            });
          }
        });
      }
      if (rw.warnings && rw.warnings.length) {
        rw.warnings.forEach(function(msg, i) {
          warnings.push({ code: 'RW_AGGREGATE_WARN', message: msg, quadro: 'RW', rigo: 'RW_agg_' + i, severity: 'warning' });
        });
      }
      if (rr.sezI && rr.sezI.RR8 && rr.sezI.RR8.value < 0) {
        errors.push({ code: 'RR8_NEGATIVO', message: 'RR8 contributi eccedenti negativo', quadro: 'RR', rigo: 'RR8', severity: 'error' });
      }
      // CASSE-1: propaga warnings da buildQuadroRR (es. cassa autonoma non gestita)
      if (rr._warnings && rr._warnings.length) {
        rr._warnings.forEach(function(w) {
          var entry = (typeof w === 'object' && w !== null)
            ? { code: w.code || 'RR_WARN', message: w.message, quadro: 'RR', rigo: 'RR_meta', severity: w.severity || 'warning' }
            : { code: 'RR_WARN', message: String(w), quadro: 'RR', rigo: 'RR_meta', severity: 'warning' };
          if (entry.severity === 'error') errors.push(entry);
          else warnings.push(entry);
        });
      }

      // R3: perdite pregresse scadute (art. 84 TUIR — 5 periodi d'imposta)
      if (lm._perditeWarnings && lm._perditeWarnings.length) {
        lm._perditeWarnings.forEach(function(msg, i) {
          warnings.push({
            code: 'PERDITE_SCADUTE',
            message: msg,
            quadro: 'LM',
            rigo: 'LM34_' + i,
            severity: 'warning'
          });
        });
      }

      // Warnings — R4: limite forfettario letto da settings (no hardcoded 85k)
      var lm2val = lm.LM2 ? lm.LM2.value : 0;
      var ctxLimite = dich._validationContext && dich._validationContext.settings || {};
      var limiteForfettario = parseFloat(ctxLimite.limiteForfettario);
      if (!isFinite(limiteForfettario) || limiteForfettario <= 0) limiteForfettario = 85000;
      // Soglia decadenza immediata: limite + 15000 (storicamente 100k quando limite=85k).
      var limiteDecadenza = limiteForfettario + 15000;
      var fmtLim = function(n) {
        return n.toLocaleString('it-IT');
      };
      if (lm2val > limiteDecadenza) {
        warnings.push({
          code: 'REDDITO_OLTRE_SOGLIA_100K',
          message: 'Reddito > ' + fmtLim(limiteDecadenza) + ' \u20ac: decadenza forfettario nell\'anno corrente',
          quadro: 'LM', rigo: 'LM2', severity: 'warning'
        });
      } else if (lm2val > limiteForfettario) {
        warnings.push({
          code: 'REDDITO_OLTRE_SOGLIA_85K',
          message: 'Reddito > ' + fmtLim(limiteForfettario) + ' \u20ac: decadenza forfettario dal prossimo anno',
          quadro: 'LM', rigo: 'LM2', severity: 'warning'
        });
      }

      // Startup aliquota 5% validation (R1)
      var ctx = dich._validationContext;
      if (ctx && ctx.settings) {
        var startupRes = this.validateStartupAliquota(ctx.settings, ctx.yearData || {}, ctx.year);
        if (startupRes && startupRes.warnings && startupRes.warnings.length) {
          startupRes.warnings.forEach(function(msg, idx) {
            warnings.push({
              code: 'startup_aliquota_' + (idx + 1),
              message: msg,
              quadro: 'LM',
              rigo: 'LM10',
              severity: 'warning'
            });
          });
        }
      }

      // R10 — Quadro RS informativo: se l'utente ha popolato uno qualsiasi dei
      // righi RS371-RS381 con un importo > 0, emettiamo un warning severity
      // 'info' che ricorda come quei valori NON deducano dal reddito.
      var rsKeys = ['RS371','RS372','RS373','RS374','RS375','RS376','RS377','RS378','RS379','RS380','RS381'];
      var rsHasValues = false;
      for (var _i = 0; _i < rsKeys.length; _i++) {
        var _k = rsKeys[_i];
        var _v = rs[_k] && typeof rs[_k].value !== 'undefined' ? parseFloat(rs[_k].value) : 0;
        if (isFinite(_v) && _v > 0) { rsHasValues = true; break; }
      }
      if (rsHasValues) {
        warnings.push({
          code: 'RS_INFORMATIVO',
          message: 'Quadro RS compilato: i dati sono solo informativi, non deducono dal reddito forfettario',
          quadro: 'RS',
          rigo: 'RS371-RS381',
          severity: 'info'
        });
      }

      return { errors: errors, warnings: warnings };
    },
    validateStartupAliquota: function(settings, yearData, year) {
      settings = settings || {};
      var warnings = [];
      var meta = {};
      var aliquota = Number(settings.impostaSostitutiva);
      if (aliquota !== 5) {
        return { applicable: false, warnings: warnings, meta: meta };
      }
      var dataApertura = settings.dataAperturaPiva;
      if (!dataApertura) {
        warnings.push('Data apertura P.IVA mancante: impossibile verificare i 5 anni del regime start-up');
      } else {
        var annoApertura = parseInt(String(dataApertura).slice(0, 4), 10);
        if (!isNaN(annoApertura) && typeof year === 'number') {
          var diff = year - annoApertura;
          meta.yearsSincePivaOpen = diff;
          if (diff > 4) {
            warnings.push("Regime start-up: scaduti i 5 anni dall'apertura P.IVA (apertura " + (year - 5) + ' o prima)');
          }
        }
      }
      if (!settings.startupRequisitiAutocertificati) {
        warnings.push('Requisiti soggettivi art. 1 c. 65 L. 190/2014 non autocertificati: verifica (a) no attività prec 3 anni, (b) no prosecuzione dipendente/autonomo, (c) ricavi anno prec \u2264 limite forfettario se continuazione');
      }
      return {
        applicable: warnings.length === 0,
        warnings: warnings,
        meta: meta
      };
    },
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
