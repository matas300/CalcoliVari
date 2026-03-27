(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FiscalLedger = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Canonical fiscal ledger row model for scadenziario.
  // Other agents should normalize once, then reuse the same row objects
  // across competence, cash, and archive views. Do not clone rows per view.

  function toNumber(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function ceil2(value) {
    var num = toNumber(value);
    if (!num) return 0;
    var scaled = Math.abs(num) * 100;
    var rounded = Math.ceil(scaled - 1e-9) / 100;
    return num < 0 ? -rounded : rounded;
  }

  function compactText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function normalizeYear(value) {
    var num = toNumber(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
  }

  function formatDateKey(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function normalizeDateKey(value) {
    if (value instanceof Date) return formatDateKey(value);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return formatDateKey(new Date(value));
    }
    if (typeof value !== 'string') return '';
    var text = value.trim();
    if (!text) return '';
    var isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
    var parsed = Date.parse(text);
    return Number.isFinite(parsed) ? formatDateKey(new Date(parsed)) : text;
  }

  function getDateYear(value) {
    var key = normalizeDateKey(value);
    if (!key) return null;
    var year = parseInt(key.slice(0, 4), 10);
    return Number.isFinite(year) ? year : null;
  }

  function getEventDateKey(event) {
    if (!event) return '';
    return normalizeDateKey(event.paymentDate || event.data || event.date || event.dueDate || event.value || '');
  }

  function getEventCashYear(event) {
    if (!event) return null;
    var direct = normalizeYear(event.cashYear);
    if (direct) return direct;
    return getDateYear(getEventDateKey(event));
  }

  function sumPaymentEvents(events) {
    return ceil2((events || []).reduce(function (sum, event) {
      return sum + toNumber(event && event.amount);
    }, 0));
  }

  function getLatestPaymentDateKey(events) {
    var latest = '';
    for (var i = 0; i < (events || []).length; i++) {
      var key = getEventDateKey(events[i]);
      if (key && key > latest) latest = key;
    }
    return latest;
  }

  function getLatestPaymentCashYear(events) {
    var latestYear = null;
    for (var i = 0; i < (events || []).length; i++) {
      var year = getEventCashYear(events[i]);
      if (year && (!latestYear || year > latestYear)) latestYear = year;
    }
    return latestYear;
  }

  function collectPaymentYears(events) {
    var seen = Object.create(null);
    var years = [];
    for (var i = 0; i < (events || []).length; i++) {
      var year = getEventCashYear(events[i]);
      if (!year || seen[year]) continue;
      seen[year] = true;
      years.push(year);
    }
    return years;
  }

  function uniqueList(values) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < (values || []).length; i++) {
      var value = values[i];
      if (!value && value !== 0) continue;
      var key = String(value);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(value);
    }
    return out;
  }

  function buildLedgerSignature(row, options) {
    var input = row || {};
    var opts = options || {};
    return [
      'competenceYear=' + (normalizeYear(input.competenceYear || input.fiscalYear || input.referenceYear || opts.competenceYear) || ''),
      'dueDate=' + normalizeDateKey(input.dueDate || (input.due && (input.due.date || input.due.iso || input.due.value)) || opts.dueDate),
      'title=' + compactText(input.title || input.label || input.description || opts.title),
      'family=' + compactText(input.family || opts.family),
      'kind=' + compactText(input.kind || opts.kind),
      'regimeType=' + compactText(input.regimeType || input.regime || opts.regimeType),
      'source=' + compactText(input.source || opts.source),
      'originType=' + compactText(input.originType || opts.originType),
      'sourceRef=' + compactText(input.sourceRef || input.externalId || input.externalKey || input.legacyId || opts.sourceRef)
    ].join('|');
  }

  function hashString(value) {
    var hash = 2166136261;
    var text = String(value || '');
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(36);
  }

  function stableLedgerId(row, options) {
    var input = row || {};
    var opts = options || {};
    var scheduleKey = compactText(input.scheduleKey || opts.scheduleKey);
    if (scheduleKey) return 'ledger:' + scheduleKey;

    var explicitId = compactText(input.id || opts.id);
    if (explicitId) return explicitId;

    return 'ledger:' + hashString(buildLedgerSignature(input, opts));
  }

  function deriveLedgerRowStatus(row) {
    var input = row || {};
    var amountDue = ceil2(input.amountDue !== undefined ? input.amountDue : input.amount);
    var amountPaid = ceil2(input.amountPaid !== undefined ? input.amountPaid : input.paidAmount);
    var residualAmount = input.residualAmount !== undefined ? ceil2(input.residualAmount) : ceil2(amountDue - amountPaid);

    if (amountDue <= 0) return 'credit';
    if (amountPaid <= 0) return 'open';
    if (residualAmount <= 0) return 'paid';
    return 'partial';
  }

  function isCrossYearLedgerRow(row) {
    var input = row || {};
    var competenceYear = normalizeYear(input.competenceYear || input.fiscalYear || input.referenceYear);
    var dueYear = getDateYear(input.dueDate || (input.due && input.due.date) || input.dueYear);
    var cashYear = normalizeYear(input.cashYear || input.paidYear);
    var paidDateYear = getDateYear(input.paidDate || input.paymentDate);
    var events = Array.isArray(input.paymentEvents) ? input.paymentEvents : [];
    var eventYears = collectPaymentYears(events);

    if (!cashYear && paidDateYear) cashYear = paidDateYear;
    if (!cashYear && dueYear) cashYear = dueYear;

    if (competenceYear && dueYear && competenceYear !== dueYear) return true;
    if (competenceYear && cashYear && competenceYear !== cashYear) return true;
    return eventYears.length > 1;
  }

  function normalizeLedgerRow(row, options) {
    var input = row || {};
    var opts = options || {};
    var scheduleKey = compactText(input.scheduleKey || opts.scheduleKey);
    var title = compactText(input.title || input.label || input.description || opts.title) || 'Scadenza';
    var family = compactText(input.family || opts.family) || 'other';
    var kind = compactText(input.kind || opts.kind) || 'other';
    var regimeType = compactText(input.regimeType || input.regime || opts.regimeType) || 'unknown';
    var source = compactText(input.source || opts.source) || (scheduleKey ? 'calculated' : 'manual');
    var originType = compactText(input.originType || opts.originType) || (scheduleKey ? 'schedule' : 'manual');
    var competenceYear = normalizeYear(input.competenceYear || input.fiscalYear || input.referenceYear || opts.competenceYear);
    var dueDate = normalizeDateKey(input.dueDate || (input.due && (input.due.date || input.due.iso || input.due.value)) || input.dueOn || opts.dueDate);
    var dueYear = getDateYear(dueDate);
    var paymentEvents = Array.isArray(input.paymentEvents) ? input.paymentEvents : [];
    var paidDate = normalizeDateKey(input.paidDate || input.paymentDate || getLatestPaymentDateKey(paymentEvents) || opts.paidDate);
    var amountPaidFromEvents = paymentEvents.length ? sumPaymentEvents(paymentEvents) : 0;
    var amountDue = ceil2(input.amountDue !== undefined ? input.amountDue : input.amount !== undefined ? input.amount : input.expectedAmount !== undefined ? input.expectedAmount : amountPaidFromEvents);
    var amountPaid = ceil2(input.amountPaid !== undefined ? input.amountPaid : input.paidAmount !== undefined ? input.paidAmount : amountPaidFromEvents);
    var residualAmount = input.residualAmount !== undefined ? ceil2(input.residualAmount) : ceil2(amountDue - amountPaid);
    var cashYear = normalizeYear(input.cashYear || input.paidYear || getDateYear(paidDate) || getLatestPaymentCashYear(paymentEvents) || dueYear || competenceYear || opts.cashYear);
    var id = stableLedgerId(input, {
      scheduleKey: scheduleKey,
      title: title,
      family: family,
      kind: kind,
      regimeType: regimeType,
      source: source,
      originType: originType,
      competenceYear: competenceYear,
      dueDate: dueDate,
      sourceRef: opts.sourceRef
    });
    var status = deriveLedgerRowStatus({
      amountDue: amountDue,
      amountPaid: amountPaid,
      residualAmount: residualAmount
    });
    var warnings = [];

    if (Array.isArray(input.warnings)) {
      for (var i = 0; i < input.warnings.length; i++) {
        if (compactText(input.warnings[i])) warnings.push(compactText(input.warnings[i]));
      }
    } else if (compactText(input.warnings)) {
      warnings.push(compactText(input.warnings));
    }

    if (!scheduleKey) warnings.push('missing scheduleKey');
    if (!dueDate) warnings.push('missing dueDate');
    if (competenceYear && dueYear && competenceYear !== dueYear) warnings.push('due year differs from competence year');
    if (competenceYear && cashYear && competenceYear !== cashYear) warnings.push('cash year differs from competence year');
    if (paymentEvents.length > 1 && uniqueList(collectPaymentYears(paymentEvents)).length > 1) {
      warnings.push('multiple cash years collapsed into one row');
    }
    if (amountDue < 0) warnings.push('negative amountDue');
    if (amountPaid < 0) warnings.push('negative amountPaid');
    if (input.status && compactText(input.status).toLowerCase() !== status) {
      warnings.push('input status normalized to ledger status');
    }

    warnings = uniqueList(warnings);

    return {
      id: id,
      scheduleKey: scheduleKey,
      competenceYear: competenceYear,
      dueDate: dueDate,
      cashYear: cashYear,
      paidDate: paidDate,
      title: title,
      family: family,
      kind: kind,
      regimeType: regimeType,
      amountDue: amountDue,
      amountPaid: amountPaid,
      residualAmount: residualAmount,
      status: status,
      source: source,
      originType: originType,
      isCrossYear: isCrossYearLedgerRow({
        competenceYear: competenceYear,
        dueDate: dueDate,
        dueYear: dueYear,
        cashYear: cashYear,
        paidDate: paidDate,
        paymentDate: input.paymentDate,
        paymentEvents: paymentEvents
      }),
      note: compactText(input.note || input.memo || input.comments || ''),
      warnings: warnings
    };
  }

  function normalizeLedgerRows(rows, options) {
    var input = rows || [];
    var opts = options || {};
    var out = [];
    var seen = Object.create(null);

    for (var i = 0; i < input.length; i++) {
      var normalized = normalizeLedgerRow(input[i], opts);
      if (opts.preserveDuplicates) {
        out.push(normalized);
        continue;
      }
      if (seen[normalized.id]) continue;
      seen[normalized.id] = true;
      out.push(normalized);
    }
    return out;
  }

  // View helpers below always reuse the same row reference when possible.
  // That lets competence, cash, and archive screens point at one ledger row
  // instead of materializing separate row objects for the same obligation.
  function getRowIdentity(row) {
    return stableLedgerId(row || {});
  }

  function getRowYear(row, type) {
    var input = row || {};
    if (type === 'competence') {
      return normalizeYear(input.competenceYear || input.fiscalYear || input.referenceYear);
    }
    if (type === 'cash') {
      var cashYear = normalizeYear(input.cashYear || input.paidYear);
      if (cashYear) return cashYear;
      var paidYear = getDateYear(input.paidDate || input.paymentDate);
      if (paidYear) return paidYear;
      var dueYear = getDateYear(input.dueDate || (input.due && input.due.date));
      if (dueYear) return dueYear;
      return normalizeYear(input.competenceYear || input.fiscalYear || input.referenceYear);
    }
    return null;
  }

  function getRowStatus(row) {
    var input = row || {};
    var status = compactText(input.status).toLowerCase();
    if (!status) status = deriveLedgerRowStatus(input);
    if (status === 'archived') return 'paid';
    return status;
  }

  function addToYearGroup(groups, year, row) {
    if (!year) return;
    if (!groups[year]) groups[year] = [];
    groups[year].push(row);
  }

  function groupLedgerRowsByCompetenceYear(rows) {
    var groups = Object.create(null);
    var seen = Object.create(null);
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i];
      if (!row) continue;
      var id = getRowIdentity(row);
      if (seen[id]) continue;
      seen[id] = true;
      addToYearGroup(groups, getRowYear(row, 'competence'), row);
    }
    return groups;
  }

  function groupLedgerRowsByCashYear(rows) {
    var groups = Object.create(null);
    var seen = Object.create(null);
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i];
      if (!row) continue;
      var id = getRowIdentity(row);
      if (seen[id]) continue;
      seen[id] = true;
      addToYearGroup(groups, getRowYear(row, 'cash'), row);
    }
    return groups;
  }

  function splitLedgerRowsByState(rows) {
    var groups = { open: [], archive: [], credits: [] };
    var seen = Object.create(null);
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i];
      if (!row) continue;
      var id = getRowIdentity(row);
      if (seen[id]) continue;
      seen[id] = true;

      var status = getRowStatus(row);
      if (status === 'credit') groups.credits.push(row);
      else if (status === 'paid') groups.archive.push(row);
      else groups.open.push(row);
    }
    return groups;
  }

  function deriveLedgerTotals(rows) {
    var totals = {
      rowCount: 0,
      amountDue: 0,
      amountPaid: 0,
      residualAmount: 0,
      openCount: 0,
      archiveCount: 0,
      creditCount: 0,
      crossYearCount: 0,
      statusCounts: { open: 0, partial: 0, paid: 0, credit: 0 }
    };
    var seen = Object.create(null);

    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i];
      if (!row) continue;
      var id = getRowIdentity(row);
      if (seen[id]) continue;
      seen[id] = true;

      var amountDue = ceil2(row.amountDue !== undefined ? row.amountDue : row.amount);
      var amountPaid = ceil2(row.amountPaid !== undefined ? row.amountPaid : row.paidAmount);
      var residualAmount = row.residualAmount !== undefined ? ceil2(row.residualAmount) : ceil2(amountDue - amountPaid);
      var status = getRowStatus(row);

      totals.rowCount += 1;
      totals.amountDue = ceil2(totals.amountDue + amountDue);
      totals.amountPaid = ceil2(totals.amountPaid + amountPaid);
      totals.residualAmount = ceil2(totals.residualAmount + residualAmount);
      if (status === 'paid') {
        totals.archiveCount += 1;
        totals.statusCounts.paid += 1;
      } else if (status === 'credit') {
        totals.creditCount += 1;
        totals.statusCounts.credit += 1;
      } else if (status === 'partial') {
        totals.openCount += 1;
        totals.statusCounts.partial += 1;
      } else {
        totals.openCount += 1;
        totals.statusCounts.open += 1;
      }
      if (isCrossYearLedgerRow(row)) totals.crossYearCount += 1;
    }
    return totals;
  }

  return {
    toNumber: toNumber,
    ceil2: ceil2,
    compactText: compactText,
    normalizeYear: normalizeYear,
    normalizeDateKey: normalizeDateKey,
    getDateYear: getDateYear,
    sumPaymentEvents: sumPaymentEvents,
    stableLedgerId: stableLedgerId,
    deriveLedgerRowStatus: deriveLedgerRowStatus,
    isCrossYearLedgerRow: isCrossYearLedgerRow,
    normalizeLedgerRow: normalizeLedgerRow,
    canonicalizeLedgerRow: normalizeLedgerRow,
    normalizeLedgerRows: normalizeLedgerRows,
    groupLedgerRowsByCompetenceYear: groupLedgerRowsByCompetenceYear,
    groupRowsByCompetenceYear: groupLedgerRowsByCompetenceYear,
    groupLedgerRowsByCashYear: groupLedgerRowsByCashYear,
    groupRowsByCashYear: groupLedgerRowsByCashYear,
    splitLedgerRowsByState: splitLedgerRowsByState,
    splitOpenArchiveLedgerRows: splitLedgerRowsByState,
    deriveLedgerTotals: deriveLedgerTotals,
    computeLedgerTotals: deriveLedgerTotals
  };
}));
