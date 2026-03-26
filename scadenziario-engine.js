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

  function groupPaymentEventsByCashYear(rows) {
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
          competenceYear: row.competenceYear,
          dueYear: row.dueYear,
          title: row.title,
          competence: row.competence,
          family: row.family,
          kind: row.kind,
          scheduleKey: row.key || row.scheduleKey,
          paymentId: event.id || event.paymentId || (String(year) + '_' + j),
          paymentDate: event.data || event.paymentDate || '',
          cashYear: year,
          amount: ceil2(event.amount),
          note: event.note || event.descrizione || '',
          statusCode: row.paymentStatus ? row.paymentStatus.code : 'paid'
        });
      }
    }
    return groups;
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
    computeScheduleTotals: computeScheduleTotals,
    groupRowsByCompetenceYear: groupRowsByCompetenceYear,
    groupPaymentEventsByCashYear: groupPaymentEventsByCashYear,
    classifyFiscalYear: classifyFiscalYear,
    isRelevantFiscalYear: isRelevantFiscalYear,
    chooseMethodPolicy: chooseMethodPolicy
  };
}));
