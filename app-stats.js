// app-stats.js - Stats (totali, percentuali, label aliquote)
// Estratto da app.js (Sprint 6.3).

(function () {
  'use strict';

  // ═══════════════════ Stats ═══════════════════
  function getMonthStats(month) {
    const dim = daysInMonth(currentYear, month);
    const stats = { worked: 0, F: 0, FS: 0, WE: 0, M: 0, Malattia: 0, Donazione: 0, total: dim };
    for (let d = 1; d <= dim; d++) {
      const act = getActivity(month, d);
      if (act === '8') stats.worked++;
      else if (stats[act] !== undefined) stats[act]++;
    }
    return stats;
  }

  function getMonthEuroRaw(month) {
    const fatture = getFatture(month);
    const totalFatt = fatture.reduce((s, f) => s + f.importo, 0);
    if (totalFatt > 0) return totalFatt;
    const s = getMonthStats(month);
    return s.worked * S().dailyRate + s.M * S().dailyRate / 2;
  }

  function isMonthFromFattura(month) { return getFatture(month).some(f => f.importo > 0); }

  function getMonthStimato(month) {
    const s = getMonthStats(month);
    return s.worked * S().dailyRate + s.M * S().dailyRate / 2;
  }

  // Check if an estimated invoice for a given month would be paid within the year
  // based on giorniIncasso setting (days from end of month to payment)
  function isEstimatePayableInYear(month) {
    const giorni = S().giorniIncasso || 30;
    // Assume invoice is issued at end of the month, paid giorniIncasso days later
    const lastDay = new Date(currentYear, month, 0); // last day of the month
    const payDate = new Date(lastDay);
    payDate.setDate(payDate.getDate() + giorni);
    return payDate.getFullYear() <= currentYear;
  }

  // Get the effective amount for a month considering payment year
  // Sums only fatture paid in current year (or no payment date set)
  // Excludes fatture deferred to another year
  // For estimates (no fattura): excludes if giorniIncasso pushes payment to next year
  function getMonthEuro(month) {
    const fatture = getFatture(month);
    const hasFatture = fatture.some(f => f.importo > 0);
    const includeEstimates = shouldIncludeEstimatesForYear(currentYear);

    if (!hasFatture) {
      // No fattura: use calendar estimate, but only if it would be paid this year
      if (!includeEstimates) return 0;
      if (!isEstimatePayableInYear(month)) return 0;
      const s = getMonthStats(month);
      return s.worked * S().dailyRate + s.M * S().dailyRate / 2;
    }

    let total = 0;
    for (const f of fatture) {
      if (f.importo > 0 && f.pagAnno && f.pagAnno !== currentYear) continue;
      total += f.importo;
    }
    return total;
  }

  // Get invoices from previous years that are paid in the target year
  function getCrossYearInvoicesForYear(year) {
    // Prefer unified store via FattureSelectors.getCrossYearPaidIn
    if (typeof window !== 'undefined' && window.FattureSelectors && currentProfile) {
      const crossFatture = window.FattureSelectors.getCrossYearPaidIn(currentProfile, year);
      return crossFatture.map(f => {
        const dataAnno = parseInt(String(f.data || '').slice(0, 4), 10) || null;
        const imp = window.FattureSelectors.getImportoSigned(f);
        const desc = (f.righe && f.righe[0] && f.righe[0].descrizione) || f.numero || '';
        return {
          mese: Number(f.pagMese) || null,
          anno: dataAnno,
          importo: imp,
          pagMese: f.pagMese || null,
          desc
        };
      }).filter(f => f.importo > 0 && f.anno && f.anno < year);
    }
    // Legacy fallback
    const results = [];
    for (const sourceYear of getStoredYears(year - 1)) {
      if (sourceYear >= year) continue;
      const sourceData = loadYearData(sourceYear);
      if (!sourceData || !sourceData.fatture) continue;
      for (let m = 1; m <= 12; m++) {
        for (const f of getFattureFromYearData(sourceData, m, sourceYear)) {
          const importo = parseFloat(f.importo) || 0;
          if (importo > 0 && f.pagAnno === year) {
            results.push({ mese: m, anno: sourceYear, importo, pagMese: f.pagMese, desc: f.desc || '' });
          }
        }
      }
    }
    return results;
  }

  function getCrossYearInvoices() {
    return getCrossYearInvoicesForYear(currentYear);
  }

  function getTotalAnnuo() {
    const usingSelectors = typeof window !== 'undefined' && window.FattureSelectors && currentProfile;
    let t = 0;
    for (let m = 1; m <= 12; m++) t += getMonthEuro(m);
    // When FattureSelectors is unavailable, monthly buckets are issued-year scoped;
    // cross-year invoices (issued prior year, paid this year) must be added explicitly.
    if (!usingSelectors) {
      for (const inv of getCrossYearInvoices()) t += inv.importo;
    }
    return t;
  }

  function getTotalWorkedDays() {
    let t = 0; for (let m = 1; m <= 12; m++) t += getMonthStats(m).worked; return t;
  }

  function getActivityFromYearData(yearData, year, month, day) {
    const key = month + '-' + day;
    const calendar = yearData && yearData.calendar ? yearData.calendar : {};
    return calendar[key] !== undefined ? calendar[key] : getDefaultActivity(year, month, day);
  }

  function getMonthStatsFromYearData(yearData, year, month) {
    const dim = daysInMonth(year, month);
    const stats = { worked: 0, F: 0, FS: 0, WE: 0, M: 0, Malattia: 0, Donazione: 0, total: dim };
    for (let d = 1; d <= dim; d++) {
      const act = getActivityFromYearData(yearData, year, month, d);
      if (act === '8') stats.worked++;
      else if (stats[act] !== undefined) stats[act]++;
    }
    return stats;
  }

  function isEstimatePayableInYearForSettings(year, month, settings) {
    const giorni = parseFloat(settings && settings.giorniIncasso) || 30;
    const lastDay = new Date(year, month, 0);
    const payDate = new Date(lastDay);
    payDate.setDate(payDate.getDate() + giorni);
    return payDate.getFullYear() <= year;
  }

  function shouldIncludeEstimatesForYear(year, options) {
    const opts = options || {};
    if (opts.includeEstimates === true) return true;
    if (opts.includeEstimates === false) return false;
    return !isClosedFiscalYear(year);
  }

  function getMonthEuroFromYearData(yearData, year, month, options) {
    const opts = options || {};
    const includeEstimates = shouldIncludeEstimatesForYear(year, opts);
    const fatture = getFattureFromYearData(yearData, month, year);
    const hasFatture = fatture.some(f => f.importo > 0);
    if (!hasFatture) {
      if (!includeEstimates) return 0;
      if (!isEstimatePayableInYearForSettings(year, month, yearData.settings || {})) return 0;
      const stats = getMonthStatsFromYearData(yearData, year, month);
      const rate = parseFloat(yearData.settings && yearData.settings.dailyRate) || 0;
      return stats.worked * rate + stats.M * rate / 2;
    }

    let total = 0;
    for (const f of fatture) {
      if (f.importo > 0 && f.pagAnno && f.pagAnno !== year) continue;
      total += f.importo;
    }
    return total;
  }

  function getYearDataFor(year) {
    return year === currentYear ? ensureDataShape(data, year) : loadYearData(year);
  }

  // Build a month→ricavi map from FattureSelectors for the given profile/year (per-cassa, pagAnno-based).
  // NC invoices (TD04) contribute negative amounts via getImportoSigned, netting stornate automatically.
  // Stornate with a linked TD04 are skipped to avoid double-counting: the TD04 NC already reduces the total.
  // Returns { 1: amount, 2: amount, ... } for months with non-zero ricavi.
  function buildRicaviMeseFromSelectors(profile, year) {
    const m2r = {};
    if (!window.FattureSelectors) return m2r;
    const fatture = window.FattureSelectors.getByPagAnno(profile, year);
    for (const f of fatture) {
      if (f.stato === 'bozza') continue;
      if (f.stato === 'stornata') continue; // TD04 NC already accounts for the cancellation
      const mese = Number(f.pagMese);
      if (!mese) continue;
      const imp = window.FattureSelectors.getImportoSigned(f); // NC (TD04) → negative
      m2r[mese] = (m2r[mese] || 0) + imp;
    }
    return m2r;
  }

  function getTotalAnnuoForYear(year, options) {
    const yearData = getYearDataFor(year);
    if (!yearData) return 0;

    // When selectors available and no estimates needed: use per-cassa ricavi map for accuracy.
    // ricaviMap is built from getByPagAnno which already includes cross-year invoices
    // (issued prior year, paid in this year), so do NOT re-add getCrossYearInvoicesForYear.
    if (typeof window !== 'undefined' && window.FattureSelectors && currentProfile &&
        options && options.includeEstimates === false) {
      const ricaviMap = buildRicaviMeseFromSelectors(currentProfile, year);
      let total = 0;
      for (const m in ricaviMap) total += ricaviMap[m];
      return total;
    }

    // Monthly buckets already include cross-year paid-in when FattureSelectors is available
    // (getByMonth filters by pagAnno=year). Only add cross-year when falling back to legacy
    // yearData.fatture (issued-year scoped).
    const usingSelectors = typeof window !== 'undefined' && window.FattureSelectors && currentProfile;
    let total = 0;
    for (let m = 1; m <= 12; m++) total += getMonthEuroFromYearData(yearData, year, m, options);
    if (!usingSelectors) {
      for (const inv of getCrossYearInvoicesForYear(year)) total += inv.importo;
    }
    return total;
  }


  if (typeof window !== "undefined") {
    window.getMonthStats = getMonthStats;
    window.getMonthEuroRaw = getMonthEuroRaw;
    window.isMonthFromFattura = isMonthFromFattura;
    window.getMonthStimato = getMonthStimato;
    window.isEstimatePayableInYear = isEstimatePayableInYear;
    window.getMonthEuro = getMonthEuro;
    window.getCrossYearInvoicesForYear = getCrossYearInvoicesForYear;
    window.getCrossYearInvoices = getCrossYearInvoices;
    window.getTotalAnnuo = getTotalAnnuo;
    window.getTotalWorkedDays = getTotalWorkedDays;
    window.getActivityFromYearData = getActivityFromYearData;
    window.getMonthStatsFromYearData = getMonthStatsFromYearData;
    window.isEstimatePayableInYearForSettings = isEstimatePayableInYearForSettings;
    window.shouldIncludeEstimatesForYear = shouldIncludeEstimatesForYear;
    window.getMonthEuroFromYearData = getMonthEuroFromYearData;
    window.getYearDataFor = getYearDataFor;
    window.buildRicaviMeseFromSelectors = buildRicaviMeseFromSelectors;
    window.getTotalAnnuoForYear = getTotalAnnuoForYear;
  }
}());
