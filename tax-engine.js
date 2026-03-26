(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TaxEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  const ENGINE_VERSION = '2026-03-26';
  const DEFAULT_ACCONTO_RULES = {
    thresholdZero: 51.65,
    thresholdSingle: 257.52,
    weights: [40, 60]
  };

  function toNumber(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function ceil2(value) {
    return Math.ceil((toNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function euroToCents(amount) {
    return Math.max(Math.round(toNumber(amount) * 100), 0);
  }

  function centsToEuro(cents) {
    return cents / 100;
  }

  function stripHtml(text) {
    return String(text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractReferenceYear(text) {
    const clean = stripHtml(text);
    const match = clean.match(/rif\.?\s*(\d{4})/i);
    if (match) return parseInt(match[1], 10);
    const yearMatch = clean.match(/\b(20\d{2})\b/);
    return yearMatch ? parseInt(yearMatch[1], 10) : null;
  }

  function extractDueYear(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4})-\d{2}-\d{2}$/);
    if (!match) return null;
    const year = parseInt(match[1], 10);
    return Number.isFinite(year) ? year : null;
  }

  function splitAmountByWeights(amount, weights) {
    const totalCents = euroToCents(amount);
    const safeWeights = Array.isArray(weights) && weights.length ? weights : [1];
    const totalWeight = safeWeights.reduce((sum, weight) => sum + toNumber(weight), 0) || 1;
    let assigned = 0;
    return safeWeights.map((weight, index) => {
      if (index === safeWeights.length - 1) return centsToEuro(totalCents - assigned);
      const share = Math.floor(totalCents * toNumber(weight) / totalWeight);
      assigned += share;
      return centsToEuro(share);
    });
  }

  function buildAccontoPlan(baseAmount, rules) {
    const cfg = Object.assign({}, DEFAULT_ACCONTO_RULES, rules || {});
    const base = centsToEuro(euroToCents(baseAmount));
    if (base <= cfg.thresholdZero) {
      return { base, total: 0, first: 0, second: 0, mode: 'none' };
    }
    if (base < cfg.thresholdSingle) {
      return { base, total: base, first: 0, second: base, mode: 'single' };
    }
    const parts = splitAmountByWeights(base, cfg.weights);
    return {
      base,
      total: base,
      first: parts[0] || 0,
      second: parts[1] || 0,
      mode: 'double'
    };
  }

  function parseOrdinalIndex(text) {
    const lower = String(text || '').toLowerCase();
    if (/\bprima\b/.test(lower) || /\bprimo\b/.test(lower)) return 1;
    if (/\bseconda\b/.test(lower) || /\bsecondo\b/.test(lower)) return 2;
    if (/\bterza\b/.test(lower) || /\bterzo\b/.test(lower)) return 3;
    if (/\bquarta\b/.test(lower) || /\bquarto\b/.test(lower)) return 4;
    return null;
  }

  function parseQuarterTag(text) {
    const lower = String(text || '').toLowerCase();
    if (lower.includes('primo, secondo e terzo trimestre') || lower.includes('i/ii/iii trimestre')) return 'q123';
    if (lower.includes('quarto trimestre')) return 'q4';
    if (lower.includes('primo trimestre') || lower.includes('1 trimestre')) return 'q1';
    if (lower.includes('secondo trimestre') || lower.includes('2 trimestre')) return 'q2';
    if (lower.includes('terzo trimestre') || lower.includes('3 trimestre')) return 'q3';
    return null;
  }

  function parseF24BundleLines(description) {
    const source = String(description || '');
    const regex = /<li>\s*<small>(.*?)<\/small>\s*<\/li>/gi;
    const items = [];
    let match;
    while ((match = regex.exec(source)) !== null) {
      const line = stripHtml(match[1]);
      if (line) items.push(line);
    }
    return items;
  }

  function getKindFromFamily(family) {
    if (family === 'inps_fixed' || family === 'inps_variable' || family === 'inail') return 'contribution';
    if (family === 'substitute_tax' || family === 'tax_stamp' || family === 'chamber_fee' || family === 'irpef' || family === 'regional_surtax' || family === 'municipal_surtax') return 'tax';
    return 'other';
  }

  function buildScheduleKey(meta, fallbackYear) {
    const year = meta.competenceYear || meta.referenceYear || meta.dueYear || fallbackYear || null;
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
        return `other_${meta.subfamily || 'generic'}_${year || 'na'}`;
      default:
        return `${meta.family || 'other'}_${year || 'na'}`;
    }
  }

  function classifyFiscozenDescription(text) {
    const clean = stripHtml(text);
    const lower = clean.toLowerCase();
    const referenceYear = extractReferenceYear(clean);
    const meta = {
      family: 'other',
      subfamily: 'generic',
      label: clean,
      rawDescription: clean,
      referenceYear,
      competenceYear: referenceYear,
      dueYear: null,
      installmentType: 'one_off',
      installmentIndex: null,
      isContribution: false,
      isTax: false,
      isAggregateHint: /<li>\s*<small>/i.test(String(text || ''))
    };

    if (lower.includes('redditi di capitale esteri')) {
      meta.family = 'other';
      meta.subfamily = 'capital_income_substitute_tax';
      meta.label = 'Imposta sostitutiva redditi di capitale esteri';
      meta.isTax = true;
      return meta;
    }

    if (lower.includes('imposta sostitutiva')) {
      meta.family = 'substitute_tax';
      meta.label = 'Imposta sostitutiva';
      meta.isTax = true;
      if (lower.includes('saldo')) meta.installmentType = 'saldo';
      else if (lower.includes('secondo acconto') || lower.includes('seconda rata')) meta.installmentType = 'acconto_2';
      else if (lower.includes('primo acconto') || lower.includes('prima rata') || lower.includes('unica soluzione')) meta.installmentType = 'acconto_1';
      if (meta.installmentType === 'saldo') meta.label = 'Imposta sostitutiva - saldo';
      else meta.label = 'Imposta sostitutiva - acconto';
      return meta;
    }

    if (lower.includes('contributi minimi inps') || lower.includes('rata dei contributi minimi')) {
      meta.family = 'inps_fixed';
      meta.subfamily = 'art_com_fixed_rate';
      meta.label = 'INPS artigiani - quota fissa';
      meta.isContribution = true;
      meta.installmentType = 'fixed_rate';
      meta.installmentIndex = parseOrdinalIndex(clean) || parseOrdinalIndex(lower) || null;
      return meta;
    }

    if (lower.includes('contributi eccedenti') || (lower.includes('inps') && lower.includes('contributi'))) {
      meta.family = 'inps_variable';
      meta.subfamily = 'art_com_variable';
      meta.label = 'INPS artigiani - quota eccedente';
      meta.isContribution = true;
      if (lower.includes('saldo')) meta.installmentType = 'saldo';
      else if (lower.includes('secondo acconto') || lower.includes('seconda rata')) meta.installmentType = 'acconto_2';
      else meta.installmentType = 'acconto_1';
      if (meta.installmentType === 'saldo') meta.label = 'INPS artigiani - saldo';
      else meta.label = `INPS artigiani - acconto ${meta.installmentType === 'acconto_2' ? '2' : '1'}`;
      return meta;
    }

    if (lower.includes('bollo')) {
      meta.family = 'tax_stamp';
      meta.subfamily = 'f24_stamp';
      meta.label = 'Imposta di bollo';
      meta.isTax = true;
      const quarter = parseQuarterTag(lower);
      if (quarter === 'q123') meta.installmentType = 'q123';
      else if (quarter === 'q4') {
        meta.installmentType = referenceYear ? 'q4_prev' : 'q4';
      }
      return meta;
    }

    if (lower.includes('camera di commercio') || lower.includes('diritto camerale')) {
      meta.family = 'chamber_fee';
      meta.subfamily = 'annual_fee';
      meta.label = 'Diritto camerale';
      meta.isTax = true;
      meta.installmentType = 'annual_fee';
      return meta;
    }

    if (lower.includes('inail')) {
      meta.family = 'inail';
      meta.subfamily = 'annual_premium';
      meta.label = 'Autoliquidazione INAIL';
      meta.isContribution = true;
      meta.installmentType = 'annual_fee';
      return meta;
    }

    if (lower.includes('addizionale regionale')) {
      meta.family = 'regional_surtax';
      meta.subfamily = 'regional_irpef';
      meta.label = 'Addizionale regionale IRPEF';
      meta.isTax = true;
      meta.installmentType = 'saldo';
      return meta;
    }

    if (lower.includes('addizionale comunale')) {
      meta.family = 'municipal_surtax';
      meta.subfamily = 'municipal_irpef';
      meta.label = 'Addizionale comunale IRPEF';
      meta.isTax = true;
      if (lower.includes('acconto')) meta.installmentType = 'acconto_1';
      else meta.installmentType = 'saldo';
      meta.label = meta.installmentType === 'acconto_1' ? 'Addizionale comunale IRPEF - acconto' : 'Addizionale comunale IRPEF - saldo';
      return meta;
    }

    if (lower.includes('irpef')) {
      meta.family = 'irpef';
      meta.subfamily = 'income_tax';
      meta.label = 'IRPEF';
      meta.isTax = true;
      if (lower.includes('saldo')) meta.installmentType = 'saldo';
      else if (lower.includes('secondo acconto') || lower.includes('seconda rata')) meta.installmentType = 'acconto_2';
      else meta.installmentType = 'acconto_1';
      meta.label = meta.installmentType === 'saldo' ? 'IRPEF - saldo' : `IRPEF - acconto ${meta.installmentType === 'acconto_2' ? '2' : '1'}`;
      return meta;
    }

    if (lower.includes('imu')) {
      meta.family = 'other';
      meta.subfamily = 'imu';
      meta.label = 'IMU';
      meta.isTax = true;
      meta.installmentType = 'annual_fee';
      return meta;
    }

    if (lower.includes('sanzion') || lower.includes('ravvedimento')) {
      meta.family = 'other';
      meta.subfamily = 'penalty';
      meta.label = 'Sanzione o ravvedimento';
      meta.isTax = true;
      meta.installmentType = 'penalty';
      return meta;
    }

    return meta;
  }

  function buildNormalizedMeta(meta, extra) {
    const dueYear = extra && extra.dueYear ? extra.dueYear : null;
    const competenceYear = extra && extra.competenceYear ? extra.competenceYear : meta.referenceYear || dueYear;
    const normalized = {
      ...meta,
      dueYear,
      competenceYear,
      scheduleKey: buildScheduleKey({ ...meta, dueYear, competenceYear }, competenceYear || dueYear),
      kind: getKindFromFamily(meta.family),
      bundleId: extra && extra.bundleId ? extra.bundleId : null,
      bundleIndex: extra && extra.bundleIndex !== undefined ? extra.bundleIndex : null
    };
    return normalized;
  }

  function normalizeFutureItem(item, index) {
    const meta = classifyFiscozenDescription(item.description);
    const dueYear = extractDueYear(item.due_date);
    const competenceYear = meta.referenceYear || dueYear;
    const normalized = buildNormalizedMeta(meta, { dueYear, competenceYear });
    return {
      id: item.id || `future_${index + 1}`,
      sourceId: item.id || `future_${index + 1}`,
      source: 'fiscozen_future',
      sourceType: 'future',
      dueDate: item.due_date || null,
      dueYear,
      amount: ceil2(item.amount),
      amountRange: item.amount_range || '',
      description: meta.rawDescription,
      label: meta.label,
      family: meta.family,
      subfamily: meta.subfamily,
      referenceYear: meta.referenceYear,
      competenceYear,
      installmentType: meta.installmentType,
      installmentIndex: meta.installmentIndex,
      scheduleKey: normalized.scheduleKey,
      isContribution: meta.isContribution,
      isTax: meta.isTax,
      isAggregateBundle: false,
      bundleCount: 0,
      children: [],
      kind: normalized.kind,
      rawDescription: meta.rawDescription
    };
  }

  function normalizePaidLine(line, context) {
    const meta = classifyFiscozenDescription(line);
    const dueYear = context && context.dueYear ? context.dueYear : context && context.sourceDueYear ? context.sourceDueYear : null;
    const competenceYear = meta.referenceYear || dueYear;
    const normalized = buildNormalizedMeta(meta, {
      dueYear,
      competenceYear,
      bundleId: context && context.bundleId ? context.bundleId : null,
      bundleIndex: context && context.bundleIndex !== undefined ? context.bundleIndex : null
    });
    return {
      id: context && context.bundleId ? `${context.bundleId}:${context.bundleIndex}` : context && context.sourceId ? context.sourceId : null,
      sourceId: context && context.sourceId ? context.sourceId : null,
      source: 'fiscozen_paid_line',
      sourceType: 'paid_line',
      dueDate: context && context.dueDate ? context.dueDate : null,
      dueYear,
      amount: null,
      paidAmount: null,
      description: meta.rawDescription,
      label: meta.label,
      family: meta.family,
      subfamily: meta.subfamily,
      referenceYear: meta.referenceYear,
      competenceYear,
      installmentType: meta.installmentType,
      installmentIndex: meta.installmentIndex,
      scheduleKey: normalized.scheduleKey,
      isContribution: meta.isContribution,
      isTax: meta.isTax,
      isAggregateBundle: false,
      bundleCount: 0,
      children: [],
      kind: normalized.kind,
      rawDescription: meta.rawDescription
    };
  }

  function normalizeFiscozenFutureTaxes(payload) {
    const items = Array.isArray(payload) ? payload : [];
    return items.map((item, index) => normalizeFutureItem(item, index));
  }

  function normalizeFiscozenPaidTaxes(payload) {
    const items = Array.isArray(payload && payload.results) ? payload.results : [];
    return items.map((item, index) => {
      const dueYear = extractDueYear(item.due_date);
      const sourceLines = parseF24BundleLines(item.description);
      const isAggregateBundle = item.type === 'USER_F24' && sourceLines.length > 1;
      const paidAmount = ceil2(item.paid_amount || item.amount);
      if (isAggregateBundle) {
        const children = sourceLines.map((line, lineIndex) => normalizePaidLine(line, {
          bundleId: item.id || `bundle_${index + 1}`,
          bundleIndex: lineIndex + 1,
          sourceId: item.id || `bundle_${index + 1}`,
          dueDate: item.due_date || null,
          dueYear,
          sourceDueYear: dueYear
        }));
        const childYears = Array.from(new Set(children.map(child => child.referenceYear).filter(Boolean)));
        const childFamilies = Array.from(new Set(children.map(child => child.family).filter(Boolean)));
        return {
          id: item.id || `paid_${index + 1}`,
          sourceId: item.id || `paid_${index + 1}`,
          source: 'fiscozen_paid',
          sourceType: item.type || 'unknown',
          dueDate: item.due_date || null,
          dueYear,
          amount: ceil2(item.amount || item.paid_amount),
          paidAmount,
          description: stripHtml(item.description),
          label: 'F24 aggregato',
          family: 'mixed_f24',
          subfamily: 'bundle',
          referenceYear: childYears.length === 1 ? childYears[0] : null,
          competenceYear: childYears.length === 1 ? childYears[0] : null,
          installmentType: 'bundle',
          installmentIndex: null,
          scheduleKey: `f24_bundle_${item.id || index + 1}`,
          isContribution: childFamilies.some(family => family === 'inps_fixed' || family === 'inps_variable' || family === 'inail'),
          isTax: childFamilies.some(family => family === 'substitute_tax' || family === 'irpef' || family === 'regional_surtax' || family === 'municipal_surtax' || family === 'tax_stamp' || family === 'chamber_fee' || family === 'other'),
          isAggregateBundle: true,
          bundleCount: children.length,
          children,
          kind: 'other',
          doneByUser: item.done_by_user === true,
          rawDescription: stripHtml(item.description)
        };
      }

      const meta = classifyFiscozenDescription(item.description);
      const competenceYear = meta.referenceYear || dueYear;
      const normalized = buildNormalizedMeta(meta, { dueYear, competenceYear });
      return {
        id: item.id || `paid_${index + 1}`,
        sourceId: item.id || `paid_${index + 1}`,
        source: 'fiscozen_paid',
        sourceType: item.type || 'unknown',
        dueDate: item.due_date || null,
        dueYear,
        amount: ceil2(item.amount || item.paid_amount),
        paidAmount,
        description: meta.rawDescription,
        label: meta.label,
        family: meta.family,
        subfamily: meta.subfamily,
        referenceYear: meta.referenceYear,
        competenceYear,
        installmentType: meta.installmentType,
        installmentIndex: meta.installmentIndex,
        scheduleKey: normalized.scheduleKey,
        isContribution: meta.isContribution,
        isTax: meta.isTax,
        isAggregateBundle: false,
        bundleCount: 0,
        children: [],
        kind: normalized.kind,
        doneByUser: item.done_by_user === true,
        rawDescription: meta.rawDescription
      };
    });
  }

  function buildTransitionDiagnostics(input) {
    const year = parseInt(input && input.year, 10) || new Date().getFullYear();
    const currentSettings = (input && input.currentSettings) || {};
    const previousSettings = (input && input.previousSettings) || {};
    const warnings = [];
    const facts = [];
    const currentRegime = currentSettings.regime || 'forfettario';
    const previousRegime = previousSettings.regime || null;
    const previousHadEmployeeIncome = parseInt(previousSettings.haRedditoDipendente, 10) === 1;
    const isRegimeTransition = !!previousRegime && previousRegime !== currentRegime;

    if (previousHadEmployeeIncome) {
      warnings.push(`Nel ${year - 1} risultano anche redditi da lavoro dipendente: lo storico puo includere IRPEF e addizionali che non rappresentano il forfettario puro del ${year}.`);
      facts.push(`Anno ${year - 1} con redditi misti.`);
    }
    if (isRegimeTransition) {
      warnings.push(`Tra ${year - 1} e ${year} c'e una transizione di regime (${previousRegime} -> ${currentRegime}). Gli acconti storici possono essere prudenziali ma non ottimizzati.`);
      facts.push(`Cambio regime ${previousRegime} -> ${currentRegime}.`);
    }
    if (previousRegime && previousRegime !== 'forfettario' && currentRegime === 'forfettario') {
      warnings.push(`Lo storico ${year - 1} non e forfettario puro: confronta sempre metodo storico e previsionale prima di assumere che l'acconto storico sia il migliore.`);
    }

    return {
      year,
      currentRegime,
      previousRegime,
      previousHadEmployeeIncome,
      isRegimeTransition,
      warnings,
      facts
    };
  }

  function buildForfettarioScenario(input) {
    const year = parseInt(input && input.year, 10) || new Date().getFullYear();
    const method = input && input.method === 'previsionale' ? 'previsionale' : 'storico';
    const settings = (input && input.settings) || {};
    const currentContribution = (input && input.currentContribution) || null;
    const previousContribution = (input && input.previousContribution) || null;
    const contributionRules = (input && input.accontoRules) || DEFAULT_ACCONTO_RULES;
    const grossCollected = ceil2(input && input.grossCollected);
    const coeff = toNumber(settings.coefficiente) / 100;
    const substituteTaxRate = toNumber(settings.impostaSostitutiva) / 100;
    const forfettarioGrossIncome = ceil2(grossCollected * coeff);
    const previousContributionAccontiPaid = ceil2(input && input.previousContributionAccontiPaid);
    const previousFixedParts = previousContribution && previousContribution.mode === 'artigiani_commercianti'
      ? splitAmountByWeights(previousContribution.fixedAnnual, [1, 1, 1, 1])
      : [0, 0, 0, 0];
    const currentFixedParts = currentContribution && currentContribution.mode === 'artigiani_commercianti'
      ? splitAmountByWeights(currentContribution.fixedAnnual, [1, 1, 1, 1])
      : [0, 0, 0, 0];
    const previousFixedTail = ceil2(previousFixedParts[3] || 0);
    const currentFixedWithinYear = ceil2((currentFixedParts[0] || 0) + (currentFixedParts[1] || 0) + (currentFixedParts[2] || 0));
    const previousContributionSaldo = ceil2(Math.max(toNumber(previousContribution && previousContribution.saldoAccontoBase) - previousContributionAccontiPaid, 0));
    const contributionAccontoBase = ceil2(
      method === 'previsionale'
        ? toNumber(input && input.forecastContributionBase)
        : toNumber(previousContribution && previousContribution.saldoAccontoBase)
    );
    const contributionAcconti = buildAccontoPlan(contributionAccontoBase, contributionRules);
    const deductibleContributionsPaid = ceil2(previousFixedTail + currentFixedWithinYear + previousContributionSaldo + contributionAcconti.total);
    const taxableBase = ceil2(Math.max(forfettarioGrossIncome - deductibleContributionsPaid, 0));
    const substituteTax = ceil2(taxableBase * substituteTaxRate);
    const taxAccontoBase = ceil2(
      method === 'previsionale'
        ? (input && input.forecastTaxBase !== undefined && input.forecastTaxBase !== null
          ? toNumber(input.forecastTaxBase)
          : substituteTax)
        : toNumber(input && input.previousTaxBase)
    );
    const taxAcconti = buildAccontoPlan(taxAccontoBase, contributionRules);
    const managedCashOutflows = ceil2(deductibleContributionsPaid + taxAcconti.total);
    const formula = [
      { label: 'Ricavi incassati', amount: grossCollected },
      { label: `Reddito lordo forfettario (${ceil2(coeff * 100)}%)`, amount: forfettarioGrossIncome },
      { label: 'Contributi INPS deducibili pagati/stimati nell anno', amount: deductibleContributionsPaid },
      { label: 'Imponibile fiscale', amount: taxableBase },
      { label: `Imposta sostitutiva (${ceil2(substituteTaxRate * 100)}%)`, amount: substituteTax }
    ];
    const explanation = [
      `Parto dagli incassi ${year} e applico il coefficiente di redditivita ${ceil2(coeff * 100)}%.`,
      `Dalla base forfettaria sottraggo i contributi INPS obbligatori pagati o pianificati nel calendario ${year}.`,
      `Sull imponibile fiscale risultante applico l imposta sostitutiva del ${ceil2(substituteTaxRate * 100)}%.`,
      method === 'previsionale'
        ? 'Questo scenario usa basi previsionali per gli acconti.'
        : 'Questo scenario usa lo storico dell anno precedente per gli acconti.'
    ];

    return {
      year,
      method,
      grossCollected,
      forfettarioGrossIncome,
      deductibleContributionsPaid,
      taxableBase,
      substituteTax,
      taxAccontoBase,
      taxAcconti,
      contributionAccontoBase,
      contributionAcconti,
      previousFixedTail,
      currentFixedWithinYear,
      previousContributionSaldo,
      managedCashOutflows,
      formula,
      explanation
    };
  }

  function buildForfettarioMethodComparison(input) {
    const transition = buildTransitionDiagnostics(input);
    const historical = buildForfettarioScenario({
      year: input.year,
      method: 'storico',
      settings: input.currentSettings,
      grossCollected: input.grossCollected,
      currentContribution: input.currentContribution,
      previousContribution: input.previousContribution,
      previousTaxBase: input.previousTaxBase,
      previousContributionAccontiPaid: input.previousContributionAccontiPaid,
      accontoRules: input.accontoRules
    });
    const previsionale = buildForfettarioScenario({
      year: input.year,
      method: 'previsionale',
      settings: input.currentSettings,
      grossCollected: input.grossCollected,
      currentContribution: input.currentContribution,
      previousContribution: input.previousContribution,
      previousTaxBase: input.previousTaxBase,
      previousContributionAccontiPaid: input.previousContributionAccontiPaid,
      forecastContributionBase: input.forecastContributionBase,
      forecastTaxBase: input.forecastTaxBase,
      accontoRules: input.accontoRules
    });
    const selectedMethod = input && input.methodSetting === 'previsionale' ? 'previsionale' : 'storico';
    const selected = selectedMethod === 'previsionale' ? previsionale : historical;
    const prudential = historical.managedCashOutflows >= previsionale.managedCashOutflows ? historical : previsionale;
    const liquidity = prudential === historical ? previsionale : historical;
    const warnings = transition.warnings.slice();
    const deltaCash = ceil2(historical.managedCashOutflows - previsionale.managedCashOutflows);

    if (Math.abs(deltaCash) >= 0.01) {
      warnings.push(
        deltaCash > 0
          ? `Il metodo storico richiede ${deltaCash.toFixed(2)} EUR in piu di liquidita gestita rispetto al previsionale.`
          : `Il metodo previsionale richiede ${Math.abs(deltaCash).toFixed(2)} EUR in piu di liquidita gestita rispetto allo storico.`
      );
    }
    if (historical.taxAcconti.total > previsionale.taxAcconti.total) {
      warnings.push(`Lo storico ti fa anticipare piu imposta sostitutiva del previsionale (${historical.taxAcconti.total.toFixed(2)} vs ${previsionale.taxAcconti.total.toFixed(2)}).`);
    } else if (historical.taxAcconti.total < previsionale.taxAcconti.total) {
      warnings.push(`Il previsionale porta acconti imposta piu alti dello storico (${previsionale.taxAcconti.total.toFixed(2)} vs ${historical.taxAcconti.total.toFixed(2)}).`);
    }

    return {
      version: ENGINE_VERSION,
      selectedMethod,
      selected,
      historical,
      previsionale,
      prudential,
      liquidity,
      transition,
      warnings
    };
  }

  function buildInstallmentStatus(row, linkedPayment) {
    if (linkedPayment) {
      const paid = ceil2(linkedPayment.importo);
      const low = ceil2(row && row.low !== undefined ? row.low : row.amount);
      const high = ceil2(row && row.high !== undefined ? row.high : row.amount);
      if (paid < low) return { code: 'underpaid', label: 'Sottostimato', tone: 'danger' };
      if (paid > high) return { code: 'overpaid', label: 'Sovrastimato', tone: 'warn' };
      return { code: 'paid', label: 'Pagato', tone: 'ok' };
    }
    if (row && row.certainty === 'estimated') return { code: 'estimated', label: 'Stimato', tone: 'warn' };
    return { code: 'to_confirm', label: 'Da confermare', tone: 'info' };
  }

  function buildInstallmentExplanation(row) {
    if (!row) return '';
    const competence = row.competence || '';
    const title = row.title || '';

    if (row.kind === 'tasse' && /imposta sostitutiva/i.test(title) && /saldo/i.test(competence)) {
      return `Questo importo chiude l imposta sostitutiva dell anno di riferimento indicato (${competence}).`;
    }
    if (row.kind === 'tasse' && /imposta sostitutiva/i.test(title) && /acconto/i.test(competence)) {
      return `Questo importo anticipa l imposta sostitutiva futura ed e calcolato con metodo ${row.method.toLowerCase()}.`;
    }
    if (row.kind === 'contributi' && /rata/i.test(competence)) {
      return 'Questa e una rata fissa INPS artigiani sul minimale.';
    }
    if (row.kind === 'contributi' && /saldo/i.test(competence)) {
      return 'Questo e il saldo della quota contributiva eccedente il minimale riferita all anno indicato.';
    }
    if (row.kind === 'contributi' && /acconto/i.test(competence)) {
      return `Questo importo anticipa i contributi INPS eccedenti del periodo successivo con metodo ${row.method.toLowerCase()}.`;
    }
    if (/camera di commercio/i.test(title)) return 'Diritto annuale camerale dovuto per l anno in corso.';
    if (/bollo/i.test(title)) return 'Imposta di bollo sulle fatture elettroniche, dovuta solo se emerge dalle fatture emesse.';
    if (/inail/i.test(title)) return 'Autoliquidazione INAIL solo se pertinente alla posizione assicurativa.';
    return row.note || '';
  }

  function buildYearFamilyTotals(items, options) {
    const opts = options || {};
    const sourceYearKey = opts.yearKey || 'dueYear';
    const totals = {};
    for (const item of Array.isArray(items) ? items : []) {
      const year = item && item[sourceYearKey] !== undefined && item[sourceYearKey] !== null
        ? item[sourceYearKey]
        : item && item.competenceYear !== undefined && item.competenceYear !== null
          ? item.competenceYear
          : item && item.referenceYear !== undefined && item.referenceYear !== null
            ? item.referenceYear
            : null;
      if (!year) continue;
      const family = item.family || 'other';
      const amount = toNumber(item.amount !== undefined && item.amount !== null ? item.amount : item.paidAmount);
      if (!totals[year]) totals[year] = {};
      if (!totals[year][family]) totals[year][family] = { amount: 0, items: [], bundleCount: 0 };
      totals[year][family].amount = ceil2(totals[year][family].amount + amount);
      totals[year][family].items.push(item);
      if (item.isAggregateBundle) totals[year][family].bundleCount += 1;
    }
    return totals;
  }

  function buildYearFamilyComparisonMatrix(input) {
    const opts = input || {};
    const threshold = toNumber(opts.threshold) || 50;
    const paidTotals = buildYearFamilyTotals(opts.paid || [], { yearKey: 'dueYear' });
    const futureTotals = buildYearFamilyTotals(opts.future || [], { yearKey: 'dueYear' });
    const scheduleTotals = buildYearFamilyTotals(opts.schedule || [], { yearKey: 'dueYear' });
    const years = new Set([
      ...Object.keys(paidTotals),
      ...Object.keys(futureTotals),
      ...Object.keys(scheduleTotals)
    ]);
    const matrix = [];

    for (const year of Array.from(years).sort()) {
      const families = new Set([
        ...Object.keys(paidTotals[year] || {}),
        ...Object.keys(futureTotals[year] || {}),
        ...Object.keys(scheduleTotals[year] || {})
      ]);
      for (const family of Array.from(families).sort()) {
        const paid = paidTotals[year] && paidTotals[year][family] ? paidTotals[year][family].amount : 0;
        const future = futureTotals[year] && futureTotals[year][family] ? futureTotals[year][family].amount : 0;
        const schedule = scheduleTotals[year] && scheduleTotals[year][family] ? scheduleTotals[year][family].amount : 0;
        const delta = ceil2(schedule - future);
        const paidBundleCount = paidTotals[year] && paidTotals[year][family] ? paidTotals[year][family].bundleCount : 0;
        const comment = [];
        if (paidBundleCount > 0) comment.push('F24 aggregato non splittato');
        if (Math.abs(delta) > threshold) comment.push(delta > 0 ? 'App sopra Fiscozen' : 'App sotto Fiscozen');
        matrix.push({
          year: parseInt(year, 10),
          family,
          Fiscozen_paid: ceil2(paid),
          Fiscozen_future: ceil2(future),
          App_schedule: ceil2(schedule),
          Delta: delta,
          comment: comment.join('; '),
          flagged: Math.abs(delta) > threshold
        });
      }
    }
    return matrix;
  }

  function getRuleCatalog() {
    return {
      version: ENGINE_VERSION,
      hardRules: [
        'Forfettario: reddito lordo = incassato * coefficiente di redditivita.',
        'Forfettario: imponibile fiscale = reddito lordo - contributi previdenziali obbligatori deducibili pagati nell anno.',
        'INPS artigiani: quota fissa sul minimale + quota eccedente.',
        'Acconti: supporto a metodo storico e previsionale.'
      ],
      annualParameters: [
        'Coefficiente di redditivita per ATECO.',
        'Aliquota imposta sostitutiva.',
        'Parametri INPS annuali (minimale, quota fissa, aliquote).',
        'Eventuali proroghe di calendario.'
      ],
      assumptions: [
        'Le scadenze ordinarie vengono spostate al primo giorno lavorativo utile.',
        'Il metodo storico viene segnalato come prudenziale se c e cambio regime o anno misto.'
      ]
    };
  }

  return {
    ENGINE_VERSION,
    DEFAULT_ACCONTO_RULES,
    getRuleCatalog,
    normalizeFiscozenFutureTaxes,
    normalizeFiscozenPaidTaxes,
    buildTransitionDiagnostics,
    buildForfettarioScenario,
    buildForfettarioMethodComparison,
    buildInstallmentStatus,
    buildInstallmentExplanation,
    buildYearFamilyTotals,
    buildYearFamilyComparisonMatrix,
    classifyFiscozenDescription,
    extractReferenceYear,
    parseF24BundleLines,
    buildAccontoPlan
  };
});
