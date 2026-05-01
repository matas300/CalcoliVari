// app-calc.js - Calculations (forfettario/ordinario engine)
// Estratto da app.js (Sprint 6.3).

(function () {
  'use strict';

  // ═══════════════════ Calculations ═══════════════════
  // D-M4 (audit 2026-05-01): allinea convenzione di arrotondamento al
  // tax-engine (ceil2 fiscalmente prudente). Senza ceil2 il dashboard "competenza"
  // mostrava centesimi in drift rispetto a buildForfettarioScenario "cassa".
  const _ceil2 = (x) => Math.ceil(x * 100) / 100;
  function calcForfettarioValues(tot, settings, year) {
    const s = settings || {};
    const coeff = s.coefficiente / 100, imp = s.impostaSostitutiva / 100;
    const imponibile = tot * coeff;
    const inps = calcInpsContributions(imponibile, s, year);
    const cF = inps.cF, cV = inps.cV, cT = inps.cT;
    const rid = window.ForfettarioRules.getRiduzioneFactor({ riduzione35: s.riduzione35, inpsMode: inps.mode });
    const cFR = cF * rid, cVR = cV * rid, cTR = cFR + cVR;
    // Imposta sostitutiva: base = imponibile − contributi INPS effettivamente versati (deducibili)
    const tasse = _ceil2(Math.max((imponibile - cT) * imp, 0));
    const tasseR = _ceil2(Math.max((imponibile - cTR) * imp, 0));
    const n = tot - cT - tasse, nR = tot - cTR - tasseR;
    return {
      totale: tot, imponibile, tasse, tasseR, cF, cV, cT, cFR, cVR, cTR, n, nR, inpsMode: inps.mode,
      perc: tot > 0 ? (tot - n) / tot : 0,
      percR: tot > 0 ? (tot - nR) / tot : 0
    };
  }

  function calcForfettario() {
    return calcForfettarioValues(getTotalAnnuo(), S(), currentYear);
  }

  function calcForfettarioForYear(year, options) {
    const opts = options || {};
    const includeEstimates = shouldIncludeEstimatesForYear(year, opts);
    if (year === currentYear && includeEstimates) return calcForfettario();
    const yearData = getYearDataFor(year);
    if (!yearData || !yearData.settings) return null;
    if (opts.requireForfettarioRegime && yearData.settings.regime !== 'forfettario') return null;
    return calcForfettarioValues(
      getTotalAnnuoForYear(year, { includeEstimates }),
      yearData.settings,
      year
    );
  }

  function getAppliedForfettarioValues(calc, settings) {
    if (!calc) return null;
    const s = settings || {};
    const useRiduzione = s.riduzione35 == 1 && calc.inpsMode === 'artigiani_commercianti';
    return {
      ...calc,
      useRiduzione,
      tasse: useRiduzione ? calc.tasseR : calc.tasse,
      contribFissi: useRiduzione ? calc.cFR : calc.cF,
      contribVariabili: useRiduzione ? calc.cVR : calc.cV,
      contribTotali: useRiduzione ? calc.cTR : calc.cT,
      netto: useRiduzione ? calc.nR : calc.n,
      percEffettiva: useRiduzione ? calc.percR : calc.perc
    };
  }

  function getAppliedForfettarioForYear(year, options) {
    const calc = calcForfettarioForYear(year, options);
    if (!calc) return null;
    const yearData = getYearDataFor(year);
    return getAppliedForfettarioValues(calc, yearData && yearData.settings ? yearData.settings : S());
  }

  function getForfettarioSourceOfTruthForYear(year, options) {
    const opts = options || {};
    const yearData = getYearDataFor(year);
    if (!yearData || !yearData.settings || yearData.settings.regime !== 'forfettario') return null;

    const applied = getAppliedForfettarioForYear(year, options);
    if (!applied) return null;

    const comparison = buildForfettarioMethodComparisonForYear(year, {
      includeEstimates: opts.includeEstimates !== false
    });
    const selectedScenario = comparison ? comparison.selected : null;
    const totale = applied.totale;
    const contribTotali = applied.contribTotali;
    const tasseCompetenza = applied.tasse;
    const nettoCompetenza = applied.netto;
    const percCompetenza = applied.percEffettiva;
    const cashContributions = selectedScenario ? selectedScenario.deductibleContributionsPaid : contribTotali;

    return {
      ...applied,
      comparison,
      selectedScenario,
      tasse: tasseCompetenza,
      netto: nettoCompetenza,
      percEffettiva: percCompetenza,
      competenceTax: tasseCompetenza,
      competenceNetto: nettoCompetenza,
      competenceRate: percCompetenza,
      deductibleContributionsPaid: cashContributions
    };
  }

  function getForfettarioCashPerspectiveForYear(year) {
    const truth = getForfettarioSourceOfTruthForYear(year, { includeEstimates: true });
    if (!truth || truth.totale <= 0) return null;
    const schedule = buildForfettarioScheduleForYear(year);
    const rows = schedule && Array.isArray(schedule.rows) ? schedule.rows : [];
    const due = rows.reduce((sum, rowItem) => sum + ceil2(rowItem.amount), 0);
    const dueTax = rows.filter(rowItem => rowItem.kind === 'tasse').reduce((sum, rowItem) => sum + ceil2(rowItem.amount), 0);
    const dueContrib = rows.filter(rowItem => rowItem.kind === 'contributi').reduce((sum, rowItem) => sum + ceil2(rowItem.amount), 0);
    return {
      totalDue: ceil2(due),
      taxDue: ceil2(dueTax),
      contributionDue: ceil2(dueContrib),
      effectiveRate: truth.totale > 0 ? ceil2(due / truth.totale) : 0
    };
  }

  function getContributionBaseForYear(year, options) {
    const opts = options || {};
    const yearData = getYearDataFor(year);
    if (!yearData || !yearData.settings) return null;
    const settings = yearData.settings;
    const total = getTotalAnnuoForYear(year, { includeEstimates: opts.includeEstimates });
    let calc = null;
    if (settings.regime === 'ordinario') {
      calc = calcOrdinarioValues(total, calcSpeseTotalForYear(year), settings, year);
      return {
        mode: calc.inpsMode,
        fixedAnnual: calc.inpsMode === 'artigiani_commercianti' ? calc.cF : 0,
        saldoAccontoBase: calc.inpsMode === 'artigiani_commercianti' ? calc.cV : calc.cT,
        fixedLabel: 'Contributi INPS fissi',
        saldoLabel: calc.inpsMode === 'artigiani_commercianti' ? 'Contributi INPS eccedenza' : 'Contributi previdenziali'
      };
    }
    const applied = getAppliedForfettarioForYear(year, options);
    if (!applied) return null;
    return getForfettarioContributionBase(applied);
  }

  function getTaxEngine() {
    return typeof window !== 'undefined' ? window.TaxEngine || null : null;
  }

  function getScadenziarioEngine() {
    return typeof window !== 'undefined' ? window.ScadenziarioEngine || null : null;
  }

  function helpPill(text) {
    const safe = String(text || '').replace(/"/g, '&quot;');
    return `<span class="help-pill" title="${safe}" aria-label="${safe}">?</span>`;
  }

  function flattenFiscalEntries(entries) {
    const out = [];
    for (const entry of (entries || [])) {
      if (entry && entry.isAggregateBundle && Array.isArray(entry.children) && entry.children.length) {
        out.push(...entry.children.map(child => ({ ...child, parentBundleId: entry.id, parentAmount: entry.amount })));
      } else if (entry) {
        out.push(entry);
      }
    }
    return out;
  }

  function mapScheduleRowToFamily(rowItem) {
    const key = String(rowItem && rowItem.key || '');
    if (key.startsWith('imposta_')) return 'substitute_tax';
    if (key.startsWith('contributi_')) return 'inps_variable';
    if (key.startsWith('inps_fissi_')) return 'inps_fixed';
    if (key.startsWith('camera_')) return 'chamber_fee';
    if (key.startsWith('bollo_')) return 'tax_stamp';
    if (key.startsWith('inail_')) return 'inail';
    if (rowItem && rowItem.kind === 'tasse') return 'substitute_tax';
    if (rowItem && rowItem.kind === 'contributi') return 'inps_variable';
    return 'other';
  }

  function buildScheduleComparisonRows(scheduleRows) {
    return (scheduleRows || []).map(rowItem => ({
      family: mapScheduleRowToFamily(rowItem),
      dueYear: rowItem && rowItem.due ? rowItem.due.year : null,
      competenceYear: rowItem && rowItem.fiscalYear ? rowItem.fiscalYear : currentYear,
      amount: ceil2(rowItem && rowItem.amount),
      scheduleKey: rowItem && rowItem.key ? rowItem.key : '',
      kind: rowItem && rowItem.kind ? rowItem.kind : 'altro'
    }));
  }

  async function fetchJsonResource(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Impossibile caricare ${path}`);
    return response.json();
  }

  function getExternalFiscalData() {
    return externalFiscalState;
  }

  async function loadProfileExternalFiscalData(profile = currentProfile) {
    if (!profile) return externalFiscalState;
    if (externalFiscalState.profile === profile && externalFiscalState.loaded) return externalFiscalState;

    const empty = {
      profile,
      loaded: true,
      error: '',
      paidEntries: [],
      futureEntries: [],
      paidFlatEntries: [],
      futureFlatEntries: [],
      summaries: {},
      comparisonMatrix: []
    };

    if (profile !== 'Mattia' || typeof fetch !== 'function') {
      externalFiscalState = empty;
      return externalFiscalState;
    }

    const engine = getTaxEngine();
    if (!engine) {
      externalFiscalState = { ...empty, loaded: false, error: 'Motore fiscale non disponibile.' };
      return externalFiscalState;
    }

    try {
      const [futurePayload, paidPayload, summary2025, summary2024, breakdown2025] = await Promise.all([
        fetchJsonResource('./fiscozen/tasse_future.json'),
        fetchJsonResource('./fiscozen/tasse_pagate.json'),
        fetchJsonResource('./fiscozen/mattia_2025_summary.json'),
        fetchJsonResource('./fiscozen/mattia_2024_summary.json'),
        fetchJsonResource('./fiscozen/mattia_f24_breakdown_2025.json')
      ]);
      const futureEntries = engine.normalizeFiscozenFutureTaxes(futurePayload);
      const paidEntries = engine.normalizeFiscozenPaidTaxes(paidPayload);
      const paidFlatEntries = flattenFiscalEntries(paidEntries);
      externalFiscalState = {
        profile,
        loaded: true,
        error: '',
        paidEntries,
        futureEntries,
        paidFlatEntries,
        futureFlatEntries: flattenFiscalEntries(futureEntries),
        summaries: {
          summary2025,
          summary2024,
          breakdown2025
        },
        comparisonMatrix: []
      };
    } catch (err) {
      externalFiscalState = { ...empty, loaded: false, error: err && err.message ? err.message : 'Errore caricamento mock locali.' };
    }

    return externalFiscalState;
  }

  function getLinkedPagamentiTotal(keys) {
    const wanted = new Set((keys || []).filter(Boolean));
    if (wanted.size === 0) return 0;
    let total = 0;
    for (const pagamento of getPagamenti()) {
      if (wanted.has(pagamento.scheduleKey)) total += parseFloat(pagamento.importo) || 0;
    }
    return ceil2(total);
  }

  function buildForfettarioMethodComparisonForYear(year, options) {
    const engine = getTaxEngine();
    const opts = options || {};
    const yearData = getYearDataFor(year);
    if (!engine || !yearData || !yearData.settings || yearData.settings.regime !== 'forfettario') return null;
    if (isClosedFiscalYear(year)) return null;

    const prevYearData = getYearDataFor(year - 1);
    const prevCalc = calcForfettarioForYear(year - 1, { includeEstimates: true, requireForfettarioRegime: true });
    const prevApplied = prevCalc && prevYearData && prevYearData.settings
      ? getAppliedForfettarioValues(prevCalc, prevYearData.settings)
      : null;
    const currentApplied = getAppliedForfettarioForYear(year, { includeEstimates: opts.includeEstimates !== false });
    const currentContribution = getContributionBaseForYear(year, { includeEstimates: opts.includeEstimates !== false });
    const previousContribution = getContributionBaseForYear(year - 1, { includeEstimates: true });

    return engine.buildForfettarioMethodComparison({
      year,
      methodSetting: getScadenziarioMetodoAcconti(yearData.settings),
      currentSettings: yearData.settings,
      previousSettings: prevYearData ? prevYearData.settings : null,
      grossCollected: getTotalAnnuoForYear(year, { includeEstimates: opts.includeEstimates !== false }),
      currentContribution,
      previousContribution,
      previousTaxBase: prevApplied ? prevApplied.tasse : 0,
      previousContributionAccontiPaid: getLinkedPagamentiTotal([
        `contributi_acc1_${year - 1}`,
        `contributi_acc2_${year - 1}`
      ]),
      forecastContributionBase: resolveScadenziarioForecastBase(yearData.settings.scadenziarioPrevisionaleContributi, currentContribution ? currentContribution.saldoAccontoBase : 0).amount,
      forecastTaxBase: resolveScadenziarioForecastBase(yearData.settings.scadenziarioPrevisionaleImposta, currentApplied ? currentApplied.tasse : 0).amount
    });
  }

  function getScadenziarioMetodoAcconti(settings) {
    return settings && settings.scadenziarioMetodoAcconti === 'previsionale' ? 'previsionale' : 'storico';
  }

  function resolveScadenziarioForecastBase(rawValue, fallbackValue) {
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      return { amount: centsToEuro(euroToCents(fallbackValue)), source: 'auto' };
    }
    return { amount: centsToEuro(euroToCents(rawValue)), source: 'manual' };
  }

  function calcSpeseTotalFor(speseList) {
    let tot = 0;
    for (const sp of (speseList || [])) {
      const c = parseFloat(sp.costo) || 0;
      const d = parseFloat(sp.deducibilita) || 0;
      const a = parseInt(sp.anni) || 1;
      tot += (c * d) / a;
    }
    return tot;
  }

  function getSpeseAttiveForYear(year) {
    const items = [];
    for (const sourceYear of getStoredYears(year)) {
      const yearData = sourceYear === currentYear ? data : loadYearData(sourceYear);
      if (!yearData || !Array.isArray(yearData.spese)) continue;
      for (let idx = 0; idx < yearData.spese.length; idx++) {
        const sp = yearData.spese[idx] || {};
        const anni = Math.max(parseInt(sp.anni, 10) || 1, 1);
        if (year < sourceYear || year > sourceYear + anni - 1) continue;
        items.push({
          ...sp,
          anni,
          annoOrigine: sourceYear,
          quotaAnno: year - sourceYear + 1,
          annua: calcSpeseTotalFor([sp]),
          _idx: idx
        });
      }
    }
    return items;
  }

  function calcSpeseTotalForYear(year) {
    let total = 0;
    for (const sp of getSpeseAttiveForYear(year)) total += sp.annua;
    return total;
  }

  function calcSpeseCarryoverTotalForYear(year) {
    let total = 0;
    for (const sp of getSpeseAttiveForYear(year)) {
      if (sp.annoOrigine !== year) total += sp.annua;
    }
    return total;
  }

  function calcSpeseTotal() {
    return calcSpeseTotalForYear(currentYear);
  }

  function calcOrdinarioValues(totLordo, spese, settings, year) {
    const s = settings || {};
    const baseLordo = Math.max(parseFloat(totLordo) || 0, 0);
    const speseTot = Math.max(parseFloat(spese) || 0, 0);
    const baseSp = Math.max(baseLordo - speseTot, 0);
    const scaglioni = getIrpefBracketsForYear(year);

    function irpef(b) {
      let t = 0, p = 0, det = [];
      for (const sc of scaglioni) {
        if (b <= p) { det.push({b:0,t:0,a:sc.a}); continue; }
        const im = Math.min(b, sc.l) - p;
        const tx = im * sc.a;
        det.push({b:im,t:tx,a:sc.a}); t += tx; p = sc.l;
      }
      return { tasse: t, netto: b - t, det };
    }

    const inpsLordo = calcInpsContributions(baseLordo, s, year);
    const inps = calcInpsContributions(baseSp, s, year);
    const cTLordo = inpsLordo.cT, cT = inps.cT;
    const baseIrpefLordo = Math.max(baseLordo - cTLordo, 0);
    const baseIrpefSp = Math.max(baseSp - cT, 0);
    const senza = irpef(baseIrpefLordo), con = irpef(baseIrpefSp);
    const dovutoTotaleLordo = senza.tasse + cTLordo;
    const dovutoTotale = con.tasse + cT;
    const nettoLordo = baseLordo - cTLordo - senza.tasse;
    const netto = baseSp - cT - con.tasse;

    return {
      tot: baseLordo,
      totSp: baseSp,
      spese: speseTot,
      senza,
      con,
      cF: inps.cF,
      cV: inps.cV,
      cVLordo: inpsLordo.cV,
      cT,
      cTLordo,
      dovutoTotale,
      dovutoTotaleLordo,
      netto,
      nettoLordo,
      nettoSp: netto,
      inpsMode: inps.mode,
      perc: baseLordo > 0 ? dovutoTotale / baseLordo : 0,
      percImponibile: baseSp > 0 ? dovutoTotale / baseSp : 0
    };
  }

  function calcOrdinario() {
    return calcOrdinarioValues(getTotalAnnuo(), calcSpeseTotal(), S(), currentYear);
  }

  function getEffectiveTaxRate() {
    if (S().regime === 'ordinario') {
      const c = calcOrdinario();
      return c.perc;
    }
    const truth = getForfettarioSourceOfTruthForYear(currentYear, { includeEstimates: true });
    if (!truth) {
      const c = calcForfettario();
      return S().riduzione35 == 1 ? c.percR : c.perc;
    }
    return truth.percEffettiva;
  }

  function getEffectiveNetto() {
    if (S().regime === 'ordinario') return calcOrdinario().netto;
    const truth = getForfettarioSourceOfTruthForYear(currentYear, { includeEstimates: true });
    if (!truth) {
      const c = calcForfettario();
      return S().riduzione35 == 1 ? c.nR : c.n;
    }
    return truth.netto;
  }


  if (typeof window !== "undefined") {
    window.calcForfettarioValues = calcForfettarioValues;
    window.calcForfettario = calcForfettario;
    window.calcForfettarioForYear = calcForfettarioForYear;
    window.getAppliedForfettarioValues = getAppliedForfettarioValues;
    window.getAppliedForfettarioForYear = getAppliedForfettarioForYear;
    window.getForfettarioSourceOfTruthForYear = getForfettarioSourceOfTruthForYear;
    window.getForfettarioCashPerspectiveForYear = getForfettarioCashPerspectiveForYear;
    window.getContributionBaseForYear = getContributionBaseForYear;
    window.getTaxEngine = getTaxEngine;
    window.getScadenziarioEngine = getScadenziarioEngine;
    window.helpPill = helpPill;
    window.flattenFiscalEntries = flattenFiscalEntries;
    window.mapScheduleRowToFamily = mapScheduleRowToFamily;
    window.buildScheduleComparisonRows = buildScheduleComparisonRows;
    window.fetchJsonResource = fetchJsonResource;
    window.getExternalFiscalData = getExternalFiscalData;
    window.loadProfileExternalFiscalData = loadProfileExternalFiscalData;
    window.getLinkedPagamentiTotal = getLinkedPagamentiTotal;
    window.buildForfettarioMethodComparisonForYear = buildForfettarioMethodComparisonForYear;
    window.getScadenziarioMetodoAcconti = getScadenziarioMetodoAcconti;
    window.resolveScadenziarioForecastBase = resolveScadenziarioForecastBase;
    window.calcSpeseTotalFor = calcSpeseTotalFor;
    window.getSpeseAttiveForYear = getSpeseAttiveForYear;
    window.calcSpeseTotalForYear = calcSpeseTotalForYear;
    window.calcSpeseCarryoverTotalForYear = calcSpeseCarryoverTotalForYear;
    window.calcSpeseTotal = calcSpeseTotal;
    window.calcOrdinarioValues = calcOrdinarioValues;
    window.calcOrdinario = calcOrdinario;
    window.getEffectiveTaxRate = getEffectiveTaxRate;
    window.getEffectiveNetto = getEffectiveNetto;
  }
}());
