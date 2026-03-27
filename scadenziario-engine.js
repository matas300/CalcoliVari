(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScadenziarioEngine = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function ceil2(value) {
    const num = toNumber(value);
    if (!num) return 0;
    const scaled = Math.abs(num) * 100;
    const rounded = Math.ceil(scaled - 1e-9) / 100;
    return num < 0 ? -rounded : rounded;
  }

  function sumPaymentEvents(events) {
    return ceil2((events || []).reduce(function (sum, event) {
      return sum + toNumber(event && event.amount);
    }, 0));
  }

  function getDueTime(row) {
    if (!row) return null;
    if (row.dueDate instanceof Date) return row.dueDate.getTime();
    if (row.due && row.due.date instanceof Date) return row.due.date.getTime();
    if (row.dueDate && typeof row.dueDate === 'string') {
      var parsed = Date.parse(row.dueDate);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function buildPaymentStatus(row, paymentEvents, options) {
    var opts = options || {};
    var dueAmount = ceil2(row && row.amountDue !== undefined ? row.amountDue : row && row.amount);
    var low = ceil2(row && row.low !== undefined ? row.low : dueAmount);
    var high = ceil2(row && row.high !== undefined ? row.high : dueAmount);
    var paid = sumPaymentEvents(paymentEvents);
    var residual = ceil2(dueAmount - paid);
    var now = opts.now instanceof Date ? opts.now.getTime() : Date.now();
    var dueTime = getDueTime(row);
    var duePast = dueTime !== null ? dueTime < now : false;
    var cashYears = (paymentEvents || []).map(function (event) { return event && event.cashYear; }).filter(Boolean);
    var competenceYear = row && row.competenceYear !== undefined ? row.competenceYear : row && row.fiscalYear;
    var dueYear = row && row.dueYear !== undefined ? row.dueYear : row && row.due && row.due.year;
    var isCrossYear = !!(competenceYear && dueYear && competenceYear !== dueYear)
      || cashYears.some(function (cashYear) { return competenceYear && cashYear !== competenceYear; });

    if (dueAmount <= 0) {
      return {
        code: 'credit',
        label: 'Credito',
        tone: 'ok',
        amountPaid: paid,
        residualAmount: residual,
        isArchived: false,
        isCrossYear: isCrossYear
      };
    }

    if (paid <= 0) {
      if (row && row.certainty === 'estimated') {
        return {
          code: 'estimated',
          label: 'Stimato',
          tone: 'warn',
          amountPaid: 0,
          residualAmount: dueAmount,
          isArchived: false,
          isCrossYear: isCrossYear
        };
      }
      return {
        code: duePast ? 'underpaid' : 'unpaid',
        label: duePast ? 'Scaduto' : 'Da pagare',
        tone: duePast ? 'danger' : 'info',
        amountPaid: 0,
        residualAmount: dueAmount,
        isArchived: false,
        isCrossYear: isCrossYear
      };
    }

    if (paid < low) {
      return {
        code: duePast ? 'underpaid' : 'partial',
        label: duePast ? 'Sotto pagato' : 'Parziale',
        tone: duePast ? 'danger' : 'warn',
        amountPaid: paid,
        residualAmount: residual,
        isArchived: false,
        isCrossYear: isCrossYear
      };
    }

    if (paid > high) {
      return {
        code: 'overpaid',
        label: 'Sovra pagato',
        tone: 'warn',
        amountPaid: paid,
        residualAmount: residual,
        isArchived: false,
        isCrossYear: isCrossYear
      };
    }

    return {
      code: 'paid',
      label: 'Pagato',
      tone: 'ok',
      amountPaid: paid,
      residualAmount: residual,
      isArchived: true,
      isCrossYear: isCrossYear
    };
  }

  function splitRowsByPaymentState(rows) {
    var groups = { open: [], archived: [], credits: [] };
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i];
      if (!row || !row.paymentStatus) continue;
      if (row.paymentStatus.code === 'credit') groups.credits.push(row);
      else if (row.paymentStatus.isArchived) groups.archived.push(row);
      else groups.open.push(row);
    }
    return groups;
  }

  function buildDueView(dueDate, dueYear, title) {
    var parsed = dueDate && typeof dueDate === 'string' ? Date.parse(dueDate) : NaN;
    var date = Number.isFinite(parsed) ? new Date(parsed) : (dueYear ? new Date(dueYear, 0, 1) : new Date());
    return {
      year: dueYear,
      label: dueDate || (dueYear ? String(dueYear) : ''),
      date: date,
      title: title || ''
    };
  }

  function toIsoDate(value) {
    if (!(value instanceof Date)) return '';
    var year = value.getFullYear();
    var month = String(value.getMonth() + 1).padStart(2, '0');
    var day = String(value.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function splitNormalizationArgs(overrides, options) {
    var extra = overrides || {};
    var opts = options || {};
    var hasExplicitOverride = extra
      && typeof extra === 'object'
      && (
        extra.id !== undefined
        || extra.scheduleKey !== undefined
        || extra.competenceYear !== undefined
        || extra.cashYear !== undefined
        || extra.dueDate !== undefined
        || extra.dueYear !== undefined
        || extra.title !== undefined
        || extra.competenceLabel !== undefined
        || extra.kind !== undefined
        || extra.family !== undefined
        || extra.amountDue !== undefined
        || extra.paymentEvents !== undefined
        || extra.source !== undefined
        || extra.regimeType !== undefined
      );
    if (!options && !hasExplicitOverride) {
      opts = extra || {};
      extra = {};
    }
    return { extra: extra || {}, opts: opts || {} };
  }

  function buildNormalizedLedgerRow(base, overrides, options) {
    var row = base || {};
    var extra = overrides || {};
    var opts = options || {};
    var paymentEvents = Array.isArray(extra.paymentEvents)
      ? extra.paymentEvents.slice()
      : (Array.isArray(row.paymentEvents) ? row.paymentEvents.slice() : []);
    var competenceYear = extra.competenceYear !== undefined
      ? extra.competenceYear
      : (row.competenceYear !== undefined ? row.competenceYear : (row.fiscalYear !== undefined ? row.fiscalYear : opts.year));
    var dueYear = extra.dueYear !== undefined
      ? extra.dueYear
      : (row.dueYear !== undefined ? row.dueYear : (row.due && row.due.year !== undefined ? row.due.year : competenceYear));
    var dueDate = extra.dueDate !== undefined
      ? extra.dueDate
      : (row.dueDate !== undefined ? row.dueDate : (row.due && row.due.date instanceof Date ? toIsoDate(row.due.date) : ''));
    var amountDue = ceil2(extra.amountDue !== undefined ? extra.amountDue : (row.amountDue !== undefined ? row.amountDue : row.amount));
    var low = ceil2(extra.low !== undefined ? extra.low : (row.low !== undefined ? row.low : amountDue));
    var high = ceil2(extra.high !== undefined ? extra.high : (row.high !== undefined ? row.high : amountDue));
    var normalized = {
      id: extra.id !== undefined ? extra.id : (row.id || row.key || row.scheduleKey || ('sched_' + (competenceYear || '0') + '_' + Math.random().toString(36).slice(2, 8))),
      scheduleKey: extra.scheduleKey !== undefined ? extra.scheduleKey : (row.scheduleKey || row.key || ''),
      competenceYear: competenceYear,
      cashYear: extra.cashYear !== undefined ? extra.cashYear : (dueYear !== undefined ? dueYear : competenceYear),
      dueDate: dueDate,
      dueYear: dueYear,
      title: extra.title !== undefined ? extra.title : (row.title || 'Scadenza'),
      competenceLabel: extra.competenceLabel !== undefined ? extra.competenceLabel : (row.competenceLabel || row.competence || ('Anno ' + (competenceYear || ''))),
      competence: extra.competence !== undefined ? extra.competence : (row.competence || row.competenceLabel || ('Anno ' + (competenceYear || ''))),
      kind: extra.kind !== undefined ? extra.kind : (row.kind || 'altro'),
      family: extra.family !== undefined ? extra.family : (row.family || 'other'),
      method: extra.method !== undefined ? extra.method : (row.method || 'Calcolato'),
      certainty: extra.certainty !== undefined ? extra.certainty : (row.certainty || 'fixed'),
      amountDue: amountDue,
      amount: amountDue,
      low: low,
      high: high,
      source: extra.source !== undefined ? extra.source : (row.source || 'calculated'),
      regimeType: extra.regimeType !== undefined ? extra.regimeType : (row.regimeType || 'forfettario'),
      isCrossYear: extra.isCrossYear !== undefined ? extra.isCrossYear : !!(competenceYear && dueYear && competenceYear !== dueYear),
      supportsPartialPayment: extra.supportsPartialPayment !== undefined ? extra.supportsPartialPayment : (row.supportsPartialPayment !== undefined ? row.supportsPartialPayment : true),
      paymentMode: extra.paymentMode !== undefined ? extra.paymentMode : (row.paymentMode || 'partial_allowed'),
      paymentEvents: paymentEvents,
      note: extra.note !== undefined ? extra.note : (row.note || ''),
      warnings: extra.warnings !== undefined ? extra.warnings : (row.warnings ? row.warnings.slice() : []),
      due: extra.due !== undefined ? extra.due : (row.due || buildDueView(dueDate, dueYear, row.title)),
      legacyRow: extra.legacyRow !== undefined ? extra.legacyRow : (row.legacyRow !== undefined ? row.legacyRow : row)
    };
    normalized.paymentStatus = buildPaymentStatus(normalized, paymentEvents, { now: opts.now || new Date() });
    return normalized;
  }

  function normalizeLegacyScheduleRow(row, overrides, options) {
    var args = splitNormalizationArgs(overrides, options);
    return buildNormalizedLedgerRow(row, Object.assign({
      source: 'calculated',
      regimeType: 'forfettario',
      supportsPartialPayment: true,
      paymentMode: 'partial_allowed',
      legacyRow: row
    }, args.extra), args.opts);
  }

  function normalizeImportedFiscalEntry(entry, overrides, options) {
    var args = splitNormalizationArgs(overrides, options);
    var extra = args.extra;
    var opts = args.opts;
    var amount = ceil2(entry && (entry.paidAmount || entry.amount));
    var dueDate = entry && entry.dueDate ? entry.dueDate : '';
    var parsed = dueDate && typeof dueDate === 'string' ? Date.parse(dueDate) : NaN;
    var dueYear = entry && entry.dueYear !== undefined
      ? entry.dueYear
      : (Number.isFinite(parsed) ? new Date(parsed).getFullYear() : (opts.year || new Date().getFullYear()));
    var competenceYear = entry && (entry.referenceYear || entry.competenceYear) !== undefined
      ? (entry.referenceYear || entry.competenceYear)
      : (opts.year !== undefined ? opts.year : dueYear);
    var paymentEvents = amount > 0 ? [{
      id: 'import_' + (entry && entry.id ? entry.id : (opts.year || dueYear)),
      paymentId: 'import_' + (entry && entry.id ? entry.id : (opts.year || dueYear)),
      scheduleKey: entry && entry.scheduleKey ? entry.scheduleKey : '',
      paymentDate: dueDate,
      data: dueDate,
      cashYear: dueYear,
      amount: amount,
      note: 'Importato da Fiscozen / prospetto storico',
      source: 'fiscozen_import'
    }] : [];
    return buildNormalizedLedgerRow(entry, Object.assign({
      id: entry && entry.id ? 'imported_' + entry.id : 'imported_' + (opts.year || dueYear) + '_' + Math.random().toString(36).slice(2, 8),
      scheduleKey: entry && entry.scheduleKey ? entry.scheduleKey : '',
      competenceYear: competenceYear,
      cashYear: dueYear,
      dueDate: dueDate || (dueYear ? String(dueYear) : ''),
      dueYear: dueYear,
      title: entry && (entry.label || entry.description) ? (entry.label || entry.description) : 'Pagamento storico',
      competenceLabel: 'Storico ' + (opts.year || dueYear),
      competence: 'Storico ' + (opts.year || dueYear),
      kind: entry && entry.isContribution ? 'contributi' : (entry && entry.isTax ? 'tasse' : 'altro'),
      family: entry && entry.family ? entry.family : 'other',
      method: 'Importato',
      certainty: 'historical',
      amountDue: amount,
      low: amount,
      high: amount,
      source: 'fiscozen_import',
      regimeType: opts.regimeType || 'ordinario',
      isCrossYear: dueYear !== competenceYear,
      supportsPartialPayment: false,
      paymentMode: 'manual_only',
      paymentEvents: paymentEvents,
      note: entry && entry.isAggregateBundle ? ('F24 storico con ' + (entry.bundleCount || 0) + ' sottovoci.') : '',
      warnings: [],
      due: buildDueView(dueDate, dueYear, entry && (entry.label || entry.description) ? (entry.label || entry.description) : 'Pagamento storico'),
      legacyRow: null
    }, extra), { now: opts.now || new Date() });
  }

  function computeScheduleTotals(rows) {
    return (rows || []).reduce(function (acc, row) {
      var due = ceil2(row && row.amountDue !== undefined ? row.amountDue : row && row.amount);
      var paid = row && row.paymentStatus ? ceil2(row.paymentStatus.amountPaid) : 0;
      var residual = row && row.paymentStatus ? ceil2(row.paymentStatus.residualAmount) : due;
      acc.amountDue = ceil2(acc.amountDue + due);
      acc.amountPaid = ceil2(acc.amountPaid + paid);
      acc.residualAmount = ceil2(acc.residualAmount + residual);
      if (row && row.paymentStatus && row.paymentStatus.isCrossYear) acc.crossYearCount += 1;
      return acc;
    }, { amountDue: 0, amountPaid: 0, residualAmount: 0, crossYearCount: 0 });
  }

  function groupRowsByCompetenceYear(rows) {
    var groups = {};
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i];
      var year = row && row.competenceYear;
      if (!year) continue;
      if (!groups[year]) groups[year] = [];
      groups[year].push(row);
    }
    return groups;
  }

  function groupRowsByCashYear(rows) {
    var groups = {};
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i] || {};
      var events = row.paymentEvents || [];
      for (var j = 0; j < events.length; j++) {
        var event = events[j] || {};
        var year = event.cashYear;
        if (!year) continue;
        if (!groups[year]) groups[year] = [];
        groups[year].push({
          row: row,
          paymentEvent: event,
          paymentIndex: j,
          paymentId: event.id || event.paymentId || (String(year) + '_' + j),
          paymentDate: event.paymentDate || event.data || '',
          cashYear: year,
          amount: ceil2(event.amount),
          note: event.note || event.descrizione || '',
          statusCode: row.paymentStatus ? row.paymentStatus.code : 'paid'
        });
      }
    }
    return groups;
  }

  function groupPaymentEventsByCashYear(rows) {
    var groups = groupRowsByCashYear(rows);
    var flattened = {};
    Object.keys(groups).forEach(function (year) {
      flattened[year] = groups[year].map(function (item) {
        return {
          competenceYear: item.row.competenceYear,
          dueYear: item.row.dueYear,
          title: item.row.title,
          competence: item.row.competence,
          family: item.row.family,
          kind: item.row.kind,
          scheduleKey: item.row.key || item.row.scheduleKey,
          paymentId: item.paymentId,
          paymentDate: item.paymentDate,
          cashYear: item.cashYear,
          amount: item.amount,
          note: item.note,
          statusCode: item.statusCode
        };
      });
    });
    return flattened;
  }

  function resolveTrailingSettlementSourceYear(metas) {
    var sourceYears = (metas || [])
      .filter(function (meta) {
        return meta
          && meta.classification === 'forfettario'
          && !!meta.hasCompiledRevenueAnchor;
      })
      .map(function (meta) { return parseInt(meta.year, 10); })
      .filter(Number.isFinite);
    return sourceYears.length ? Math.max.apply(Math, sourceYears) : null;
  }

  function shouldDisplayFiscalYear(meta, options) {
    var input = meta || {};
    var opts = options || {};
    if (opts.includeEmptyYears) return true;
    if (input.isTrailingSettlementYear) return !!((input.rows || []).length);
    if (input.classification === 'forfettario') return !!input.hasCompiledRevenueAnchor;
    if (opts.includeHistoricalYears) {
      return !!input.hasHistoricalAnchor || !!input.hasCompiledRevenueAnchor;
    }
    return false;
  }

  function classifyFiscalYear(meta) {
    var input = meta || {};
    if (!input.hasActivity && !input.hasRows && !input.hasPayments && !input.hasOverrides && !input.hasImportedData) {
      return 'vuoto';
    }
    var regime = input.regime || '';
    var ordinaryFamilies = input.importedFamilies || [];
    var hasOrdinarySignals = ordinaryFamilies.some(function (family) {
      return family === 'irpef' || family === 'regional_surtax' || family === 'municipal_surtax';
    });
    var mixed = !!input.hasEmployeeIncome || (regime === 'ordinario' && hasOrdinarySignals && !!input.hasActivity);
    if (regime === 'forfettario' && !mixed) return 'forfettario';
    if (regime === 'ordinario' && mixed) return 'misto';
    if (regime === 'ordinario') return 'ordinario';
    if (mixed || hasOrdinarySignals) return 'misto';
    if (input.hasRows || input.hasPayments || input.hasActivity) return 'forfettario';
    return 'vuoto';
  }

  function isRelevantFiscalYear(meta) {
    var input = meta || {};
    return !!(
      input.hasRows
      || input.hasPayments
      || input.hasOverrides
      || input.hasImportedData
      || input.realRevenue > 0
      || input.estimatedRevenue > 0
      || input.amountDue > 0
      || input.amountPaid > 0
    );
  }

  function chooseMethodPolicy(meta) {
    var input = meta || {};
    if (input.isClosedYear) {
      return {
        recommendedMethod: 'consuntivo',
        methodWarning: '',
        methodConfidence: 'fixed'
      };
    }
    if (input.previousYearType === 'forfettario' && input.previousYearComplete) {
      return {
        recommendedMethod: 'storico',
        methodWarning: '',
        methodConfidence: 'normal'
      };
    }
    if (input.previousYearType === 'ordinario' || input.previousYearType === 'misto') {
      return {
        recommendedMethod: 'previsionale',
        methodWarning: 'L anno precedente non e un forfettario puro: storico disponibile ma sconsigliato come base automatica.',
        methodConfidence: 'warning'
      };
    }
    return {
      recommendedMethod: 'previsionale',
      methodWarning: 'Manca uno storico forfettario pulito: meglio usare una base previsionale.',
      methodConfidence: 'warning'
    };
  }

  return {
    ceil2: ceil2,
    sumPaymentEvents: sumPaymentEvents,
    buildPaymentStatus: buildPaymentStatus,
    splitRowsByPaymentState: splitRowsByPaymentState,
    buildNormalizedLedgerRow: buildNormalizedLedgerRow,
    normalizeLegacyScheduleRow: normalizeLegacyScheduleRow,
    normalizeImportedFiscalEntry: normalizeImportedFiscalEntry,
    computeScheduleTotals: computeScheduleTotals,
    groupRowsByCompetenceYear: groupRowsByCompetenceYear,
    groupRowsByCashYear: groupRowsByCashYear,
    groupPaymentEventsByCashYear: groupPaymentEventsByCashYear,
    resolveTrailingSettlementSourceYear: resolveTrailingSettlementSourceYear,
    shouldDisplayFiscalYear: shouldDisplayFiscalYear,
    classifyFiscalYear: classifyFiscalYear,
    isRelevantFiscalYear: isRelevantFiscalYear,
    chooseMethodPolicy: chooseMethodPolicy
  };
}));
