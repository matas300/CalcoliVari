(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PaymentLedger = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  const ENGINE_VERSION = '2026-03-27';

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function ceil2(value) {
    const num = toNumber(value);
    if (!num) return 0;
    const scaled = Math.abs(num) * 100;
    const rounded = Math.ceil(scaled - 1e-9) / 100;
    return num < 0 ? -rounded : rounded;
  }

  function parseIsoDate(value) {
    if (!value) return null;
    const parts = String(value).split('-').map(part => parseInt(part, 10));
    if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return null;
    const [year, month, day] = parts;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }

  function getDueTime(row) {
    if (!row) return null;
    if (row.dueDate instanceof Date) return row.dueDate.getTime();
    if (row.due && row.due.date instanceof Date) return row.due.date.getTime();
    if (row.dueDate && typeof row.dueDate === 'string') {
      const parsed = Date.parse(row.dueDate);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function getRowKeys(row) {
    const keys = [];
    const add = value => {
      if (!value) return;
      const key = String(value);
      if (!keys.includes(key)) keys.push(key);
    };
    if (row && typeof row === 'object') {
      add(row.rowKey);
      add(row.scheduleKey);
      add(row.key);
      add(row.id);
    }
    return keys;
  }

  function normalizePaymentEvent(event, context) {
    const source = event && typeof event === 'object' ? event : {};
    const ctx = context || {};
    const paymentDate = source.paymentDate || source.data || ctx.paymentDate || '';
    const parsedDate = parseIsoDate(paymentDate);
    const cashYear = toNumber(
      source.cashYear !== undefined && source.cashYear !== null
        ? source.cashYear
        : source.anno !== undefined && source.anno !== null
          ? source.anno
          : parsedDate && parsedDate.year
            ? parsedDate.year
            : ctx.cashYear !== undefined && ctx.cashYear !== null
              ? ctx.cashYear
              : null
    ) || null;
    const scheduleKey = source.scheduleKey || ctx.scheduleKey || '';
    const rowKey = source.rowKey || ctx.rowKey || scheduleKey || source.id || source.paymentId || '';
    const id = source.id || source.paymentId || ctx.id || (scheduleKey ? `${scheduleKey}:${paymentDate || cashYear || 'na'}` : rowKey || `payment_${Math.random().toString(36).slice(2, 10)}`);
    const amount = ceil2(source.amount);

    return {
      ...source,
      id,
      paymentId: source.paymentId || id,
      rowKey,
      scheduleKey,
      paymentDate,
      data: paymentDate,
      cashYear,
      anno: source.anno !== undefined && source.anno !== null ? source.anno : cashYear,
      amount,
      tipo: source.tipo || ctx.tipo || 'altro',
      descrizione: source.descrizione || source.note || '',
      note: source.note || source.descrizione || '',
      source: source.source || ctx.source || 'manual',
      voided: source.voided === true || source.deleted === true || source.cancelled === true
    };
  }

  function normalizePaymentEvents(events, context) {
    const list = Array.isArray(events) ? events : [];
    return list.map((event, index) => normalizePaymentEvent(event, {
      ...(context || {}),
      id: context && context.id ? `${context.id}:${index}` : undefined
    }));
  }

  function dedupePaymentEvents(events) {
    const seen = new Set();
    const out = [];
    for (const event of Array.isArray(events) ? events : []) {
      const normalized = normalizePaymentEvent(event);
      const key = normalized.id || normalized.paymentId || `${normalized.rowKey}|${normalized.paymentDate}|${normalized.amount}|${normalized.tipo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
    return out;
  }

  function sumPaymentEvents(events) {
    return ceil2((events || []).reduce((sum, event) => {
      if (!event || event.voided) return sum;
      return sum + toNumber(event.amount);
    }, 0));
  }

  function isExplicitArchive(row) {
    if (!row) return false;
    return row.archived === true
      || row.isArchived === true && row.paymentStatusCode === 'archived'
      || row.paymentStatus && row.paymentStatus.code === 'archived';
  }

  function buildPaymentStatus(row, paymentEvents, options) {
    const opts = options || {};
    const dueAmount = ceil2(row && row.amountDue !== undefined ? row.amountDue : row && row.amount);
    const low = ceil2(row && row.low !== undefined ? row.low : dueAmount);
    const high = ceil2(row && row.high !== undefined ? row.high : dueAmount);
    const normalizedEvents = normalizePaymentEvents(paymentEvents || [], {
      scheduleKey: row && (row.scheduleKey || row.key) ? (row.scheduleKey || row.key) : '',
      rowKey: row && (row.rowKey || row.scheduleKey || row.key || row.id) ? (row.rowKey || row.scheduleKey || row.key || row.id) : ''
    });
    const paid = sumPaymentEvents(normalizedEvents);
    const residual = ceil2(dueAmount - paid);
    const dueTime = getDueTime(row);
    const now = opts.now instanceof Date ? opts.now.getTime() : Date.now();
    const duePast = dueTime !== null ? dueTime < now : false;
    const competenceYear = row && row.competenceYear !== undefined ? row.competenceYear : row && row.fiscalYear;
    const dueYear = row && row.dueYear !== undefined ? row.dueYear : row && row.due && row.due.year;
    const cashYears = normalizedEvents.map(event => event && event.cashYear).filter(Boolean);
    const isCrossYear = !!(competenceYear && dueYear && competenceYear !== dueYear)
      || cashYears.some(cashYear => competenceYear && cashYear !== competenceYear);
    const estimated = row && row.certainty === 'estimated';

    if (dueAmount <= 0) {
      return {
        code: 'credit',
        label: 'Credito',
        tone: 'info',
        amountDue: dueAmount,
        amountPaid: paid,
        residualAmount: residual,
        overpaidAmount: 0,
        underpaidAmount: 0,
        isArchived: false,
        isCrossYear
      };
    }

    if (isExplicitArchive(row)) {
      return {
        code: 'archived',
        label: 'Archiviato',
        tone: 'info',
        amountDue: dueAmount,
        amountPaid: paid,
        residualAmount: residual,
        overpaidAmount: Math.max(paid - dueAmount, 0),
        underpaidAmount: Math.max(dueAmount - paid, 0),
        isArchived: true,
        isCrossYear
      };
    }

    if (paid <= 0) {
      if (estimated) {
        return {
          code: 'estimated',
          label: 'Stimato',
          tone: 'warn',
          amountDue: dueAmount,
          amountPaid: 0,
          residualAmount: dueAmount,
          overpaidAmount: 0,
          underpaidAmount: dueAmount,
          isArchived: false,
          isCrossYear
        };
      }
      return {
        code: duePast ? 'underpaid' : 'unpaid',
        label: duePast ? 'Sotto pagato' : 'Da pagare',
        tone: duePast ? 'danger' : 'info',
        amountDue: dueAmount,
        amountPaid: 0,
        residualAmount: dueAmount,
        overpaidAmount: 0,
        underpaidAmount: dueAmount,
        isArchived: false,
        isCrossYear
      };
    }

    if (paid < low) {
      return {
        code: duePast ? 'underpaid' : 'partial',
        label: duePast ? 'Sotto pagato' : 'Parziale',
        tone: duePast ? 'danger' : 'warn',
        amountDue: dueAmount,
        amountPaid: paid,
        residualAmount: residual,
        overpaidAmount: 0,
        underpaidAmount: Math.max(residual, 0),
        isArchived: false,
        isCrossYear
      };
    }

    if (paid > high) {
      return {
        code: 'overpaid',
        label: 'Sovra pagato',
        tone: 'warn',
        amountDue: dueAmount,
        amountPaid: paid,
        residualAmount: residual,
        overpaidAmount: Math.max(paid - dueAmount, 0),
        underpaidAmount: 0,
        isArchived: false,
        isCrossYear
      };
    }

    return {
      code: 'paid',
      label: 'Pagato',
      tone: 'ok',
      amountDue: dueAmount,
      amountPaid: paid,
      residualAmount: residual,
      overpaidAmount: 0,
      underpaidAmount: Math.max(residual, 0),
      isArchived: true,
      isCrossYear
    };
  }

  function collectEventsForRow(row, eventIndex, options) {
    const opts = options || {};
    const combined = [];
    const rowEvents = row && Array.isArray(row.paymentEvents) ? row.paymentEvents : [];
    combined.push(...normalizePaymentEvents(rowEvents, {
      scheduleKey: row && (row.scheduleKey || row.key) ? (row.scheduleKey || row.key) : '',
      rowKey: row && (row.rowKey || row.scheduleKey || row.key || row.id) ? (row.rowKey || row.scheduleKey || row.key || row.id) : '',
      source: row && row.source ? row.source : 'row'
    }));

    for (const key of getRowKeys(row)) {
      if (eventIndex.byRowKey[key]) combined.push(...eventIndex.byRowKey[key]);
      if (eventIndex.byScheduleKey[key]) combined.push(...eventIndex.byScheduleKey[key]);
    }

    if (Array.isArray(opts.paymentEvents)) {
      combined.push(...normalizePaymentEvents(opts.paymentEvents));
    }

    return dedupePaymentEvents(combined);
  }

  function indexPaymentEvents(events) {
    const normalized = normalizePaymentEvents(events);
    const byScheduleKey = {};
    const byRowKey = {};
    const byCashYear = {};
    const byId = {};

    for (const event of normalized) {
      if (event.id) byId[event.id] = event;
      if (event.paymentId) byId[event.paymentId] = event;
      if (event.scheduleKey) {
        if (!byScheduleKey[event.scheduleKey]) byScheduleKey[event.scheduleKey] = [];
        byScheduleKey[event.scheduleKey].push(event);
      }
      if (event.rowKey) {
        if (!byRowKey[event.rowKey]) byRowKey[event.rowKey] = [];
        byRowKey[event.rowKey].push(event);
      }
      if (event.cashYear) {
        if (!byCashYear[event.cashYear]) byCashYear[event.cashYear] = [];
        byCashYear[event.cashYear].push(event);
      }
    }

    return { normalized, byScheduleKey, byRowKey, byCashYear, byId };
  }

  function reconcileLedgerRow(row, paymentEvents, options) {
    const events = dedupePaymentEvents(
      Array.isArray(paymentEvents) && paymentEvents.length > 0
        ? paymentEvents
        : row && Array.isArray(row.paymentEvents)
          ? row.paymentEvents
          : []
    );
    const status = buildPaymentStatus(row, events, options);
    return {
      ...(row || {}),
      paymentEvents: events,
      paymentStatus: status,
      paymentStatusCode: status.code,
      amountDue: status.amountDue,
      amountPaid: status.amountPaid,
      residualAmount: status.residualAmount,
      isArchived: status.isArchived
    };
  }

  function reconcileLedgerRows(rows, paymentEvents, options) {
    const list = Array.isArray(rows) ? rows : [];
    const opts = options || {};
    const indexedEvents = indexPaymentEvents(paymentEvents || opts.paymentEvents || []);
    const rowCache = new WeakMap();
    const reconciled = [];
    const totals = {
      amountDue: 0,
      amountPaid: 0,
      residualAmount: 0,
      underpaidAmount: 0,
      overpaidAmount: 0,
      rowCount: 0,
      openCount: 0,
      archivedCount: 0,
      paidCount: 0,
      partialCount: 0,
      unpaidCount: 0,
      underpaidCount: 0,
      overpaidCount: 0,
      estimatedCount: 0,
      creditCount: 0,
      statusCounts: {
        unpaid: 0,
        partial: 0,
        paid: 0,
        underpaid: 0,
        overpaid: 0,
        archived: 0,
        estimated: 0,
        credit: 0
      }
    };
    let runningDue = 0;
    let runningPaid = 0;

    for (let index = 0; index < list.length; index++) {
      const row = list[index];
      let normalizedRow = row && typeof row === 'object' ? rowCache.get(row) : null;
      if (!normalizedRow) {
        const rowEvents = collectEventsForRow(row, indexedEvents, opts);
        normalizedRow = reconcileLedgerRow(row, rowEvents, opts);
        normalizedRow.ledgerIndex = index;
        if (row && typeof row === 'object') rowCache.set(row, normalizedRow);
      }
      runningDue = ceil2(runningDue + ceil2(normalizedRow.amountDue));
      runningPaid = ceil2(runningPaid + ceil2(normalizedRow.amountPaid));
      normalizedRow.ledgerRunningDue = runningDue;
      normalizedRow.ledgerRunningPaid = runningPaid;
      normalizedRow.ledgerRunningResidual = ceil2(runningDue - runningPaid);

      const status = normalizedRow.paymentStatus || buildPaymentStatus(normalizedRow, normalizedRow.paymentEvents, opts);
      totals.amountDue = ceil2(totals.amountDue + ceil2(status.amountDue));
      totals.amountPaid = ceil2(totals.amountPaid + ceil2(status.amountPaid));
      totals.residualAmount = ceil2(totals.residualAmount + ceil2(status.residualAmount));
      totals.underpaidAmount = ceil2(totals.underpaidAmount + Math.max(status.underpaidAmount || 0, 0));
      totals.overpaidAmount = ceil2(totals.overpaidAmount + Math.max(status.overpaidAmount || 0, 0));
      totals.rowCount += 1;
      totals.statusCounts[status.code] = (totals.statusCounts[status.code] || 0) + 1;

      if (status.code === 'paid' || status.code === 'archived') totals.archivedCount += 1;
      if (status.code === 'paid') totals.paidCount += 1;
      if (status.code === 'partial') totals.partialCount += 1;
      if (status.code === 'unpaid') totals.unpaidCount += 1;
      if (status.code === 'underpaid') totals.underpaidCount += 1;
      if (status.code === 'overpaid') totals.overpaidCount += 1;
      if (status.code === 'estimated') totals.estimatedCount += 1;
      if (status.code === 'credit') totals.creditCount += 1;
      if (!(status.code === 'paid' || status.code === 'archived')) totals.openCount += 1;

      reconciled.push(normalizedRow);
    }

    totals.balance = ceil2(totals.amountDue - totals.amountPaid);
    totals.isBalanced = Math.abs(totals.balance) < 0.005;

    return {
      rows: reconciled,
      totals,
      paymentEvents: indexedEvents.normalized,
      paymentEventsByScheduleKey: indexedEvents.byScheduleKey,
      paymentEventsByRowKey: indexedEvents.byRowKey,
      paymentEventsByCashYear: indexedEvents.byCashYear,
      paymentEventsById: indexedEvents.byId
    };
  }

  function computeLedgerTotals(rows, paymentEvents, options) {
    return reconcileLedgerRows(rows, paymentEvents, options).totals;
  }

  function sumPaymentsForScheduleKeys(events, scheduleKeys) {
    const keys = Array.isArray(scheduleKeys) ? scheduleKeys : [scheduleKeys];
    const keySet = new Set(keys.filter(Boolean).map(key => String(key)));
    return ceil2((normalizePaymentEvents(events) || []).reduce((sum, event) => {
      return keySet.has(String(event.scheduleKey || event.rowKey || '')) ? sum + toNumber(event.amount) : sum;
    }, 0));
  }

  function patchPaymentEvent(events, eventId, patch) {
    const list = normalizePaymentEvents(events);
    const update = patch && typeof patch === 'object' ? patch : {};
    const targetId = eventId && typeof eventId === 'object' ? (eventId.id || eventId.paymentId) : eventId;
    const index = list.findIndex(event => event.id === targetId || event.paymentId === targetId);
    const merged = { ...(index >= 0 ? list[index] : {}), ...update, id: targetId || update.id };
    if (update.data !== undefined) {
      merged.data = update.data;
      merged.paymentDate = update.data;
    } else if (update.paymentDate !== undefined) {
      merged.data = update.paymentDate;
      merged.paymentDate = update.paymentDate;
    }
    if ((update.data !== undefined || update.paymentDate !== undefined) && update.cashYear === undefined && update.anno === undefined) {
      delete merged.cashYear;
      delete merged.anno;
    }
    const nextEvent = normalizePaymentEvent(merged, update);
    if (index >= 0) {
      list[index] = nextEvent;
      return list;
    }
    list.unshift(nextEvent);
    return list;
  }

  function upsertPaymentEvent(events, event) {
    const normalized = normalizePaymentEvent(event);
    return patchPaymentEvent(events, normalized.id || normalized.paymentId, normalized);
  }

  function removePaymentEvent(events, eventId) {
    const list = normalizePaymentEvents(events);
    const targetId = eventId && typeof eventId === 'object' ? (eventId.id || eventId.paymentId) : eventId;
    return list.filter(event => event.id !== targetId && event.paymentId !== targetId);
  }

  function groupPaymentEventsByCashYear(rows) {
    const groups = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const events = row && Array.isArray(row.paymentEvents) ? row.paymentEvents : [];
      for (let index = 0; index < events.length; index++) {
        const event = normalizePaymentEvent(events[index], {
          scheduleKey: row && (row.scheduleKey || row.key) ? (row.scheduleKey || row.key) : ''
        });
        const year = event.cashYear;
        if (!year) continue;
        if (!groups[year]) groups[year] = [];
        groups[year].push({
          competenceYear: row && row.competenceYear !== undefined ? row.competenceYear : row && row.fiscalYear,
          dueYear: row && row.dueYear !== undefined ? row.dueYear : row && row.due && row.due.year,
          title: row && row.title ? row.title : '',
          competence: row && row.competence ? row.competence : '',
          family: row && row.family ? row.family : '',
          kind: row && row.kind ? row.kind : 'altro',
          scheduleKey: row && (row.scheduleKey || row.key) ? (row.scheduleKey || row.key) : '',
          paymentId: event.id || event.paymentId || `${year}_${index}`,
          paymentDate: event.paymentDate || '',
          cashYear: year,
          amount: ceil2(event.amount),
          note: event.note || event.descrizione || '',
          statusCode: row && row.paymentStatus ? row.paymentStatus.code : (row && row.paymentStatusCode ? row.paymentStatusCode : 'paid')
        });
      }
    }
    return groups;
  }

  return {
    ENGINE_VERSION,
    ceil2,
    parseIsoDate,
    normalizePaymentEvent,
    normalizePaymentEvents,
    dedupePaymentEvents,
    sumPaymentEvents,
    buildPaymentStatus,
    reconcileLedgerRow,
    reconcileLedgerRows,
    buildPaymentLedgerState: reconcileLedgerRows,
    computeLedgerTotals,
    sumPaymentsForScheduleKeys,
    indexPaymentEvents,
    patchPaymentEvent,
    upsertPaymentEvent,
    removePaymentEvent,
    groupPaymentEventsByCashYear
  };
});
