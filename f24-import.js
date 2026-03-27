(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.F24ImportPipeline = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (root) {
  const VERSION = '2026-03-27';
  const DEFAULT_OPTIONS = {
    candidateLimit: 5,
    autoAcceptThreshold: 80,
    reviewThreshold: 60,
    ambiguousGap: 8,
    sourceLabel: 'raw_f24_import'
  };

  const DATE_KEYS = ['paymentDate', 'payment_date', 'paidAt', 'paid_at', 'date', 'data', 'dueDate', 'due_date'];
  const AMOUNT_KEYS = ['amount', 'importo', 'paidAmount', 'paid_amount', 'value', 'total', 'totale'];
  const KIND_KEYS = ['paymentKind', 'payment_kind', 'kind', 'tipo', 'category', 'famiglia'];
  const CODE_KEYS = ['paymentCode', 'payment_code', 'codiceTributo', 'codice_tributo', 'taxCode', 'tax_code', 'code', 'tributo'];
  const REFERENCE_YEAR_KEYS = ['referenceYear', 'reference_year', 'annoRiferimento', 'anno_riferimento', 'competenceYear', 'competence_year'];

  const KIND_ALIASES = {
    tax: 'tax',
    tasse: 'tax',
    erario: 'tax',
    imposta: 'tax',
    f24: 'tax',
    contribution: 'contribution',
    contributi: 'contribution',
    previdenziale: 'contribution',
    previdenziali: 'contribution',
    inps: 'contribution',
    inail: 'contribution',
    mixed: 'mixed',
    misto: 'mixed',
    bundle: 'mixed',
    aggregate: 'mixed',
    other: 'other',
    altro: 'other'
  };

  const STOP_WORDS = new Set([
    'a', 'ad', 'al', 'allo', 'alla', 'alle', 'agli', 'anche', 'che', 'da', 'dal', 'dallo', 'dalla', 'dalle', 'degli',
    'dei', 'del', 'della', 'delle', 'di', 'e', 'ed', 'fra', 'gli', 'i', 'il', 'in', 'l', 'la', 'le', 'nel', 'nella',
    'nelle', 'nei', 'per', 'su', 'sul', 'sulla', 'sulle', 'tra', 'un', 'una', 'uno', 'versamento', 'pagamento',
    'scarica', 'paga', 'relativo', 'relativa', 'relativi', 'seguendo', 'guida', 'f24'
  ]);

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function toString(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function normalizeWhitespace(text) {
    return toString(text).replace(/\s+/g, ' ').trim();
  }

  function stripHtml(text) {
    return normalizeWhitespace(toString(text).replace(/<[^>]+>/g, ' '));
  }

  function parseAmount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100;
    const text = normalizeWhitespace(value);
    if (!text) return 0;
    let cleaned = text.replace(/\s/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
    cleaned = cleaned.replace(/[^0-9.-]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
    const text = normalizeWhitespace(value);
    if (!text) return null;
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const date = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slashMatch) {
      const date = new Date(Date.UTC(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1])));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) {
      const date = new Date(parsed);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  function toIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function firstDefined(object, keys) {
    if (!isObject(object)) return null;
    for (const key of keys || []) {
      if (object[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
    }
    return null;
  }

  function removeAccents(text) {
    return normalizeWhitespace(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function tokenize(text) {
    const normalized = removeAccents(text).toLowerCase();
    return normalized
      .split(/[^a-z0-9]+/g)
      .map(token => token.trim())
      .filter(token => token && !STOP_WORDS.has(token) && token.length > 1);
  }

  function uniqueValues(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function scoreTokenOverlap(leftTokens, rightTokens) {
    const left = new Set(leftTokens || []);
    const right = new Set(rightTokens || []);
    if (left.size === 0 || right.size === 0) return 0;
    let shared = 0;
    left.forEach(token => {
      if (right.has(token)) shared += 1;
    });
    const base = Math.min(shared * 4, 20);
    const union = left.size + right.size - shared;
    const jaccard = union > 0 ? shared / union : 0;
    return Math.min(20, base + Math.round(jaccard * 8));
  }

  function normalizeKind(value, description, code) {
    const raw = removeAccents(value).toLowerCase();
    if (raw && KIND_ALIASES[raw]) return KIND_ALIASES[raw];
    const text = removeAccents(description).toLowerCase();
    const codeText = normalizeWhitespace(code);
    if (/inps|contribut|previdenz/.test(text)) return 'contribution';
    if (/inail/.test(text)) return 'contribution';
    if (/imposta|tassa|erario|addizionale|bollo|imu|irpef|tribut/i.test(text)) return 'tax';
    if (/misto|bundle|aggregat/.test(text)) return 'mixed';
    if (codeText && /^\d{4,5}$/.test(codeText)) {
      if (codeText === '1792' || codeText === '1790' || codeText === '1791') return 'tax';
    }
    return 'other';
  }

  function extractYear(text) {
    const clean = removeAccents(text);
    const explicitMatch = clean.match(/\b(?:rif|riferimento|anno(?:\s+di)?\s+riferimento)\.?\s*(20\d{2})\b/i);
    if (explicitMatch) return Number(explicitMatch[1]);
    const yearMatch = clean.match(/\b(20\d{2})\b/);
    return yearMatch ? Number(yearMatch[1]) : null;
  }

  function extractCode(text) {
    const clean = removeAccents(text);
    const explicitMatch = clean.match(/\b(?:cod(?:ice)?(?:\s+tributo)?|tributo)\s*[:#-]?\s*([0-9]{3,5})\b/i);
    if (explicitMatch) return explicitMatch[1];
    const codeMatch = clean.match(/\b([0-9]{4})\b/);
    return codeMatch ? codeMatch[1] : null;
  }

  function parseYearValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 1900 ? parsed : null;
  }

  function getRecordText(record) {
    const values = [];
    for (const key of ['description', 'descrizione', 'note', 'label', 'title', 'titolo', 'memo']) {
      if (record && record[key]) values.push(record[key]);
    }
    return stripHtml(values.join(' '));
  }

  function parseDelimitedLine(line, delimiter) {
    const cells = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (quote) {
        if (char === quote) {
          if (line[i + 1] === quote) {
            current += char;
            i += 1;
          } else {
            quote = null;
          }
        } else {
          current += char;
        }
        continue;
      }
      if (char === '"' || char === '\'') {
        quote = char;
        continue;
      }
      if (char === delimiter) {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    cells.push(current.trim());
    return cells;
  }

  function isHeaderRow(cells) {
    return (cells || []).some(cell => /date|data|amount|import|descr|description|code|codice|ref|rifer/i.test(removeAccents(cell).toLowerCase()));
  }

  function parseTextImport(text) {
    const lines = toString(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return [];
    const delimiter = [';', '\t', '|'].find(candidate => lines.some(line => line.includes(candidate))) || null;
    if (!delimiter) {
      return lines.map(line => ({ description: line }));
    }
    const headerCells = parseDelimitedLine(lines[0], delimiter);
    const hasHeader = isHeaderRow(headerCells);
    const out = [];
    for (let i = hasHeader ? 1 : 0; i < lines.length; i += 1) {
      const cells = parseDelimitedLine(lines[i], delimiter);
      if (!cells.length) continue;
      if (hasHeader) {
        const item = {};
        for (let j = 0; j < headerCells.length && j < cells.length; j += 1) {
          const key = removeAccents(headerCells[j]).toLowerCase().replace(/[^a-z0-9]+/g, '_');
          if (!key) continue;
          item[key] = cells[j];
        }
        out.push(item);
        continue;
      }
      if (cells.length === 1) {
        out.push({ description: cells[0] });
      } else if (cells.length === 2) {
        out.push({ payment_date: cells[0], amount: cells[1] });
      } else if (cells.length === 3) {
        out.push({ payment_date: cells[0], amount: cells[1], description: cells[2] });
      } else {
        out.push({
          payment_date: cells[0],
          amount: cells[1],
          code: cells[2],
          description: cells.slice(3).join(delimiter)
        });
      }
    }
    return out;
  }

  function coerceRawItems(payload) {
    if (Array.isArray(payload)) return payload.slice();
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (!trimmed) return [];
      try {
        return coerceRawItems(JSON.parse(trimmed));
      } catch (err) {
        return parseTextImport(trimmed);
      }
    }
    if (isObject(payload)) {
      for (const key of ['records', 'results', 'items', 'payments', 'rows']) {
        if (Array.isArray(payload[key])) return payload[key].slice();
      }
      if (isObject(payload.data) && Array.isArray(payload.data.records)) return payload.data.records.slice();
      return [payload];
    }
    return [];
  }

  function normalizeSourceMeta(payload, options) {
    if (Array.isArray(payload)) {
      return {
        sourceType: 'array',
        sourceLabel: (options && options.sourceLabel) || DEFAULT_OPTIONS.sourceLabel,
        sourceCount: payload.length
      };
    }
    if (typeof payload === 'string') {
      return {
        sourceType: 'text',
        sourceLabel: (options && options.sourceLabel) || DEFAULT_OPTIONS.sourceLabel,
        sourceCount: null
      };
    }
    if (isObject(payload)) {
      const arrayLike = payload.records || payload.results || payload.items || payload.payments || payload.rows;
      return {
        sourceType: payload.sourceType || payload.type || 'object',
        sourceLabel: payload.source || payload.sourceLabel || (options && options.sourceLabel) || DEFAULT_OPTIONS.sourceLabel,
        sourceCount: Array.isArray(arrayLike) ? arrayLike.length : null
      };
    }
    return {
      sourceType: 'unknown',
      sourceLabel: (options && options.sourceLabel) || DEFAULT_OPTIONS.sourceLabel,
      sourceCount: null
    };
  }

  function getClassifier(rootContext, options) {
    if (options && typeof options.classifier === 'function') return options.classifier;
    if (rootContext && rootContext.TaxEngine && typeof rootContext.TaxEngine.classifyFiscozenDescription === 'function') {
      return rootContext.TaxEngine.classifyFiscozenDescription;
    }
    return null;
  }

  function inferScheduleKeyHint(meta) {
    const year = meta.competenceYear || meta.referenceYear || meta.dueYear || null;
    if (!year) return null;
    switch (meta.family) {
      case 'substitute_tax':
        if (meta.installmentType === 'saldo') return `imposta_saldo_${year}`;
        if (meta.installmentType === 'acconto_2') return `imposta_acc2_${year}`;
        return `imposta_acc1_${year}`;
      case 'inps_fixed':
        return `inps_fissi_${meta.installmentIndex || 1}_${year}`;
      case 'inps_variable':
        if (meta.installmentType === 'saldo') return `contributi_saldo_${year}`;
        if (meta.installmentType === 'acconto_2') return `contributi_acc2_${year}`;
        return `contributi_acc1_${year}`;
      case 'tax_stamp':
        if (meta.installmentType === 'q4_prev') return `bollo_q4prev_${year}`;
        if (meta.installmentType === 'q4') return `bollo_q4_${year}`;
        return `bollo_q123_${year}`;
      case 'chamber_fee':
        return `camera_${year}`;
      case 'inail':
        return `inail_${year}`;
      case 'irpef':
        if (meta.installmentType === 'saldo') return `irpef_saldo_${year}`;
        if (meta.installmentType === 'acconto_2') return `irpef_acc2_${year}`;
        return `irpef_acc1_${year}`;
      case 'regional_surtax':
        return `regional_surtax_${year}`;
      case 'municipal_surtax':
        if (meta.installmentType === 'acconto_1') return `municipal_surtax_acc1_${year}`;
        return `municipal_surtax_saldo_${year}`;
      case 'other':
        return `other_${meta.subfamily || 'generic'}_${year}`;
      default:
        return `${meta.family || 'other'}_${year}`;
    }
  }

  function normalizeImportedPaymentRecord(rawItem, index, options, rootContext) {
    const raw = isObject(rawItem) ? rawItem : { description: toString(rawItem) };
    const text = getRecordText(raw);
    const classifier = getClassifier(rootContext, options);
    const classifierMeta = classifier ? classifier(text) || {} : {};
    const paymentDate = parseDate(firstDefined(raw, DATE_KEYS));
    const dueDate = parseDate(firstDefined(raw, ['dueDate', 'due_date'])) || paymentDate;
    const amount = parseAmount(firstDefined(raw, AMOUNT_KEYS));
    const rawCode = firstDefined(raw, CODE_KEYS);
    const paymentCode = normalizeWhitespace(rawCode || extractCode(text));
    const rawReferenceYear = firstDefined(raw, REFERENCE_YEAR_KEYS);
    const referenceYear = parseYearValue(rawReferenceYear) || (classifierMeta.referenceYear || extractYear(text) || null);
    const dueYear = dueDate ? dueDate.getUTCFullYear() : (paymentDate ? paymentDate.getUTCFullYear() : null);
    const competenceYear = classifierMeta.competenceYear || referenceYear || dueYear || null;
    const paymentKind = normalizeKind(firstDefined(raw, KIND_KEYS) || classifierMeta.kind || classifierMeta.family, text, paymentCode);
    const installmentType = classifierMeta.installmentType || null;
    const installmentIndex = classifierMeta.installmentIndex || null;
    const familyHint = classifierMeta.family || paymentKind;
    const kindHint = classifierMeta.isContribution ? 'contribution' : (classifierMeta.isTax ? 'tax' : paymentKind);
    const scheduleKeyHint = inferScheduleKeyHint({
      family: familyHint,
      installmentType,
      installmentIndex,
      referenceYear,
      competenceYear,
      dueYear
    });
    const tokens = tokenize([text, paymentKind, paymentCode, scheduleKeyHint].filter(Boolean).join(' '));
    const confidence = {
      date: paymentDate ? 1 : 0,
      amount: amount > 0 ? 1 : 0,
      code: paymentCode ? 0.9 : 0,
      year: referenceYear ? 0.9 : (dueYear ? 0.5 : 0),
      kind: paymentKind !== 'other' ? 0.8 : 0.2,
      description: text ? 0.8 : 0
    };

    return {
      id: raw.id || raw.paymentId || raw.sourceId || `f24_import_${index + 1}`,
      sourceId: raw.id || raw.paymentId || raw.sourceId || null,
      sourceType: raw.sourceType || raw.type || 'f24-import',
      sourceLabel: (options && options.sourceLabel) || raw.source || DEFAULT_OPTIONS.sourceLabel,
      sourceIndex: index,
      raw,
      rawText: normalizeWhitespace(typeof rawItem === 'string' ? rawItem : text),
      description: text,
      paymentDate: toIsoDate(paymentDate),
      dueDate: toIsoDate(dueDate),
      amount,
      paymentKind,
      paymentCode: paymentCode || null,
      referenceYear,
      dueYear,
      competenceYear,
      cashYear: paymentDate ? paymentDate.getUTCFullYear() : dueYear,
      installmentType,
      installmentIndex,
      familyHint,
      kindHint,
      scheduleKeyHint,
      tokens,
      confidence,
      notes: []
    };
  }

  function normalizeLedgerRow(rawRow, index, options, rootContext) {
    const raw = isObject(rawRow) ? rawRow : { description: toString(rawRow) };
    const classifier = getClassifier(rootContext, options);
    const text = getRecordText(raw);
    const classifierMeta = classifier ? classifier(text) || {} : {};
    const paymentDate = parseDate(firstDefined(raw, ['paymentDate', 'payment_date', 'data', 'date']));
    const dueDate = parseDate(firstDefined(raw, ['dueDate', 'due_date'])) || paymentDate;
    const amount = parseAmount(firstDefined(raw, ['amount', 'importo', 'paidAmount', 'paid_amount', 'amountDue', 'amount_due']));
    const rawCode = firstDefined(raw, CODE_KEYS);
    const paymentCode = normalizeWhitespace(rawCode || extractCode(text));
    const paymentKind = normalizeKind(firstDefined(raw, KIND_KEYS) || classifierMeta.family || classifierMeta.kind, text, paymentCode);
    const rawReferenceYear = firstDefined(raw, REFERENCE_YEAR_KEYS);
    const referenceYear = parseYearValue(rawReferenceYear) || (classifierMeta.referenceYear || extractYear(text) || null);
    const dueYear = parseYearValue(raw.dueYear) || (dueDate ? dueDate.getUTCFullYear() : null);
    const competenceYear = parseYearValue(raw.competenceYear) || (classifierMeta.competenceYear || referenceYear || dueYear || null);
    const installmentType = raw.installmentType || classifierMeta.installmentType || null;
    const installmentIndex = raw.installmentIndex || classifierMeta.installmentIndex || null;
    const familyHint = classifierMeta.family || paymentKind;
    const kindHint = classifierMeta.isContribution ? 'contribution' : (classifierMeta.isTax ? 'tax' : paymentKind);
    const scheduleKey = normalizeWhitespace(firstDefined(raw, ['scheduleKey', 'schedule_key']) || null) || inferScheduleKeyHint({
      family: familyHint,
      installmentType,
      installmentIndex,
      referenceYear,
      competenceYear,
      dueYear
    });
    const title = normalizeWhitespace(firstDefined(raw, ['title', 'label', 'description', 'descrizione']) || text);
    const tokens = tokenize([title, text, paymentKind, paymentCode, scheduleKey].filter(Boolean).join(' '));

    return {
      id: raw.id || raw.scheduleKey || raw.paymentId || `ledger_${index + 1}`,
      sourceId: raw.id || raw.scheduleKey || raw.paymentId || null,
      scheduleKey,
      title,
      description: text,
      paymentDate: toIsoDate(paymentDate),
      dueDate: toIsoDate(dueDate),
      amount,
      paymentKind,
      paymentCode: paymentCode || null,
      referenceYear,
      dueYear,
      competenceYear,
      kind: normalizeKind(raw.kind || raw.paymentKind || paymentKind, text, paymentCode),
      kindHint,
      tokens,
      raw
    };
  }

  function amountScore(importedAmount, ledgerAmount) {
    if (!(importedAmount > 0) || !(ledgerAmount > 0)) return { score: 0, reason: null, diff: null };
    const diff = Math.abs(importedAmount - ledgerAmount);
    if (diff <= 0.01) return { score: 35, reason: 'amount_exact', diff };
    if (diff <= 0.5) return { score: 30, reason: 'amount_near_exact', diff };
    if (diff <= 1) return { score: 25, reason: 'amount_close', diff };
    if (diff <= 5) return { score: 15, reason: 'amount_reasonably_close', diff };
    if (diff <= 20) return { score: 8, reason: 'amount_loose', diff };
    return { score: Math.max(0, 8 - Math.min(diff / 10, 8)), reason: 'amount_far', diff };
  }

  function dateScore(importedDate, ledgerDate) {
    if (!importedDate || !ledgerDate) return { score: 0, reason: null, diffDays: null };
    const left = parseDate(importedDate);
    const right = parseDate(ledgerDate);
    if (!left || !right) return { score: 0, reason: null, diffDays: null };
    const diffDays = Math.round(Math.abs(left.getTime() - right.getTime()) / 86400000);
    if (diffDays === 0) return { score: 10, reason: 'date_exact', diffDays };
    if (diffDays <= 3) return { score: 9, reason: 'date_near', diffDays };
    if (diffDays <= 7) return { score: 7, reason: 'date_close', diffDays };
    if (diffDays <= 30) return { score: 4, reason: 'date_loose', diffDays };
    if (diffDays <= 60) return { score: 2, reason: 'date_far', diffDays };
    return { score: 0, reason: 'date_mismatch', diffDays };
  }

  function yearScore(imported, ledger) {
    const importedYears = uniqueValues([imported.referenceYear, imported.competenceYear, imported.dueYear, imported.cashYear]);
    const ledgerYears = uniqueValues([ledger.referenceYear, ledger.competenceYear, ledger.dueYear]);
    if (!importedYears.length || !ledgerYears.length) return { score: 0, reason: null };
    for (const year of importedYears) {
      if (ledgerYears.includes(year)) {
        return { score: 15, reason: 'year_match' };
      }
    }
    const gaps = [];
    for (const iYear of importedYears) {
      for (const lYear of ledgerYears) {
        gaps.push(Math.abs(iYear - lYear));
      }
    }
    const maxGap = gaps.length ? Math.min.apply(null, gaps) : null;
    if (Number.isFinite(maxGap) && maxGap === 1) return { score: 5, reason: 'year_near_match' };
    return { score: 0, reason: 'year_mismatch' };
  }

  function scheduleKeyScore(imported, ledger) {
    if (!imported.scheduleKeyHint || !ledger.scheduleKey) return { score: 0, reason: null };
    if (imported.scheduleKeyHint === ledger.scheduleKey) return { score: 40, reason: 'schedule_key_exact' };
    if (ledger.scheduleKey.includes(imported.scheduleKeyHint) || imported.scheduleKeyHint.includes(ledger.scheduleKey)) {
      return { score: 18, reason: 'schedule_key_partial' };
    }
    return { score: 0, reason: 'schedule_key_mismatch' };
  }

  function codeScore(imported, ledger) {
    if (!imported.paymentCode || !ledger.paymentCode) return { score: 0, reason: null };
    const left = normalizeWhitespace(imported.paymentCode);
    const right = normalizeWhitespace(ledger.paymentCode);
    if (!left || !right) return { score: 0, reason: null };
    if (left === right) return { score: 30, reason: 'code_exact' };
    return { score: 0, reason: 'code_mismatch' };
  }

  function kindScore(imported, ledger) {
    if (!imported.paymentKind || !ledger.paymentKind) return { score: 0, reason: null };
    if (imported.paymentKind === ledger.paymentKind) return { score: 10, reason: 'kind_match' };
    if (imported.paymentKind === 'mixed' || ledger.paymentKind === 'mixed') return { score: 4, reason: 'kind_mixed' };
    return { score: -8, reason: 'kind_conflict' };
  }

  function textScore(imported, ledger) {
    return {
      score: scoreTokenOverlap(imported.tokens, ledger.tokens),
      reason: 'text_overlap'
    };
  }

  function scoreLedgerMatch(imported, ledger, options) {
    const schedule = scheduleKeyScore(imported, ledger);
    const code = codeScore(imported, ledger);
    const kind = kindScore(imported, ledger);
    const amount = amountScore(imported.amount, ledger.amount);
    const date = dateScore(imported.paymentDate || imported.dueDate, ledger.paymentDate || ledger.dueDate);
    const year = yearScore(imported, ledger);
    const text = textScore(imported, ledger);
    let score = 0;
    const reasons = [];

    for (const component of [schedule, code, kind, amount, date, year, text]) {
      if (component.score) score += component.score;
      if (component.reason) reasons.push(component.reason);
    }

    if (imported.kindHint && ledger.kind && imported.kindHint !== 'other') {
      score += imported.kindHint === ledger.kind ? 5 : 0;
    }

    if (imported.scheduleKeyHint && ledger.scheduleKey && imported.scheduleKeyHint !== ledger.scheduleKey) {
      const samePrefix = imported.scheduleKeyHint.split('_').slice(0, 2).join('_') === ledger.scheduleKey.split('_').slice(0, 2).join('_');
      if (samePrefix) {
        score += 4;
        reasons.push('schedule_prefix_match');
      }
    }

    if (imported.paymentKind && ledger.paymentKind && imported.paymentKind !== ledger.paymentKind && imported.paymentKind !== 'mixed' && ledger.paymentKind !== 'mixed') {
      score -= 4;
      reasons.push('kind_penalty');
    }

    if (options && options.requireExactAmount && amount.reason !== 'amount_exact' && amount.reason !== 'amount_near_exact') {
      score -= 10;
      reasons.push('amount_required');
    }

    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    return {
      score: clamped,
      matchType: schedule.score >= 40
        ? 'schedule_key'
        : code.score >= 30
          ? 'code'
          : amount.score >= 25 && text.score >= 10
            ? 'semantic'
            : 'review',
      reasons: uniqueValues(reasons),
      details: {
        schedule,
        code,
        kind,
        amount,
        date,
        year,
        text
      }
    };
  }

  function buildCandidateLedgerMatches(importedRecord, ledgerRows, options, rootContext) {
    const normalizedLedgerRows = (Array.isArray(ledgerRows) ? ledgerRows : []).map((row, index) => normalizeLedgerRow(row, index, options, rootContext));
    const candidates = normalizedLedgerRows.map(ledger => {
      const result = scoreLedgerMatch(importedRecord, ledger, options);
      return {
        ledger,
        score: result.score,
        matchType: result.matchType,
        reasons: result.reasons,
        details: result.details
      };
    });

    candidates.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftDiff = left.details && left.details.amount ? (left.details.amount.diff || Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      const rightDiff = right.details && right.details.amount ? (right.details.amount.diff || Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      if (leftDiff !== rightDiff) return leftDiff - rightDiff;
      return String(left.ledger.id).localeCompare(String(right.ledger.id));
    });

    return candidates.slice(0, (options && options.candidateLimit) || DEFAULT_OPTIONS.candidateLimit);
  }

  function pickCandidate(candidates, options) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) {
      return {
        selectedCandidate: null,
        autoCandidate: null,
        state: 'unmatched',
        ambiguous: false,
        canAutoApply: false
      };
    }
    const top = list[0];
    const second = list[1] || null;
    const threshold = Number(options && options.autoAcceptThreshold) || DEFAULT_OPTIONS.autoAcceptThreshold;
    const reviewThreshold = Number(options && options.reviewThreshold) || DEFAULT_OPTIONS.reviewThreshold;
    const ambiguousGap = Number(options && options.ambiguousGap) || DEFAULT_OPTIONS.ambiguousGap;
    const scoreGap = second ? top.score - second.score : top.score;
    const ambiguous = !!second && scoreGap < ambiguousGap;
    const canAutoApply = top.score >= threshold && !ambiguous;
    let state = 'needs_review';
    if (canAutoApply) state = 'ready';
    else if (top.score >= reviewThreshold) state = ambiguous ? 'ambiguous' : 'proposed';
    return {
      selectedCandidate: top,
      autoCandidate: canAutoApply ? top : null,
      state,
      ambiguous,
      canAutoApply
    };
  }

  function buildConfirmationPayload(importedRecord, candidates, options) {
    const selection = pickCandidate(candidates, options);
    const selectedLedger = selection.selectedCandidate ? selection.selectedCandidate.ledger : null;
    const importedSummary = {
      id: importedRecord.id,
      sourceId: importedRecord.sourceId,
      sourceType: importedRecord.sourceType,
      sourceLabel: importedRecord.sourceLabel,
      paymentDate: importedRecord.paymentDate,
      dueDate: importedRecord.dueDate,
      amount: importedRecord.amount,
      paymentKind: importedRecord.paymentKind,
      paymentCode: importedRecord.paymentCode,
      referenceYear: importedRecord.referenceYear,
      dueYear: importedRecord.dueYear,
      competenceYear: importedRecord.competenceYear,
      scheduleKeyHint: importedRecord.scheduleKeyHint,
      description: importedRecord.description,
      rawText: importedRecord.rawText
    };

    return {
      importedPayment: importedSummary,
      bestCandidate: selection.selectedCandidate,
      autoCandidate: selection.autoCandidate,
      candidateMatches: candidates,
      confirmation: {
        state: selection.state,
        readyToConfirm: true,
        canAutoApply: selection.canAutoApply,
        ambiguous: selection.ambiguous,
        action: selection.canAutoApply
          ? 'link_existing'
          : (selection.selectedCandidate ? 'review_existing' : 'create_new'),
        ledgerRow: selectedLedger ? {
          id: selectedLedger.id,
          sourceId: selectedLedger.sourceId,
          scheduleKey: selectedLedger.scheduleKey,
          title: selectedLedger.title,
          description: selectedLedger.description,
          paymentDate: selectedLedger.paymentDate,
          dueDate: selectedLedger.dueDate,
          amount: selectedLedger.amount,
          paymentKind: selectedLedger.paymentKind,
          paymentCode: selectedLedger.paymentCode,
          referenceYear: selectedLedger.referenceYear,
          dueYear: selectedLedger.dueYear,
          competenceYear: selectedLedger.competenceYear
        } : null,
        summary: {
          candidateCount: candidates.length,
          topScore: selection.selectedCandidate ? selection.selectedCandidate.score : 0,
          scoreGap: selection.selectedCandidate && candidates[1] ? selection.selectedCandidate.score - candidates[1].score : null
        }
      }
    };
  }

  function normalizeF24ImportPayload(payload, options, rootContext) {
    const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
    const items = coerceRawItems(payload);
    const source = normalizeSourceMeta(payload, opts);
    const records = items.map((item, index) => normalizeImportedPaymentRecord(item, index, opts, rootContext));
    return {
      version: VERSION,
      source,
      records,
      rawCount: items.length,
      normalizedCount: records.length,
      warnings: []
    };
  }

  function processF24Import(payload, ledgerRows, options, rootContext) {
    const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
    const normalized = normalizeF24ImportPayload(payload, opts, rootContext);
    const importedPayments = normalized.records.map(record => {
      const candidateMatches = buildCandidateLedgerMatches(record, ledgerRows, opts, rootContext);
      return {
        importedPayment: record,
        candidateMatches,
        ...buildConfirmationPayload(record, candidateMatches, opts)
      };
    });
    const summary = importedPayments.reduce((acc, item) => {
      acc.importedCount += 1;
      if (item.confirmation.canAutoApply) acc.autoSelectedCount += 1;
      if (item.confirmation.state === 'ready') acc.readyCount += 1;
      if (item.confirmation.state === 'proposed' || item.confirmation.state === 'ambiguous') acc.needsReviewCount += 1;
      if (item.confirmation.state === 'unmatched') acc.unmatchedCount += 1;
      return acc;
    }, { importedCount: 0, autoSelectedCount: 0, readyCount: 0, needsReviewCount: 0, unmatchedCount: 0 });

    return {
      version: VERSION,
      source: normalized.source,
      records: importedPayments,
      summary
    };
  }

  return {
    VERSION,
    normalizeF24ImportPayload,
    normalizeImportedPaymentRecord,
    normalizeLedgerRow,
    buildCandidateLedgerMatches,
    buildConfirmationPayload,
    processF24Import,
    scoreLedgerMatch,
    parseAmount,
    parseDate,
    extractYear,
    extractCode,
    tokenize
  };
});
