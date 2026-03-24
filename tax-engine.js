(function (global) {
  const ENGINE_VERSION = '2026-03-17';
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

  function classifyFiscozenDescription(text) {
    const clean = stripHtml(text);
    const lower = clean.toLowerCase();
    let family = 'other';
    let label = clean;

    if (lower.includes('imposta sostitutiva')) family = 'substitute_tax';
    else if (lower.includes('contributi minimi inps') || lower.includes('rata dei contributi minimi')) family = 'inps_fixed';
    else if (lower.includes('contributi inps')) family = 'inps_variable';
    else if (lower.includes('bollo')) family = 'tax_stamp';
    else if (lower.includes('camera di commercio') || lower.includes('diritto camerale')) family = 'chamber_fee';
    else if (lower.includes('inail')) family = 'inail';
    else if (lower.includes('irpef')) family = 'irpef';
    else if (lower.includes('addizionale regionale')) family = 'regional_surtax';
    else if (lower.includes('addizionale comunale')) family = 'municipal_surtax';

    if (family === 'substitute_tax' && lower.includes('acconto')) label = 'Imposta sostitutiva - acconto';
    else if (family === 'substitute_tax') label = 'Imposta sostitutiva - saldo';
    else if (family === 'inps_fixed') label = 'INPS artigiani - quota fissa';
    else if (family === 'inps_variable') label = 'INPS artigiani - quota eccedente';
    else if (family === 'tax_stamp') label = 'Imposta di bollo';
    else if (family === 'chamber_fee') label = 'Diritto camerale';
    else if (family === 'inail') label = 'INAIL';

    return {
      family,
      label,
      referenceYear: extractReferenceYear(clean),
      rawDescription: clean,
      isContribution: family === 'inps_fixed' || family === 'inps_variable',
      isTax: family === 'substitute_tax' || family === 'irpef' || family === 'regional_surtax' || family === 'municipal_surtax' || family === 'tax_stamp',
      isMixedLegacy: family === 'irpef' || family === 'regional_surtax' || family === 'municipal_surtax'
    };
  }

  function normalizeFiscozenFutureTaxes(payload) {
    const items = Array.isArray(payload) ? payload : [];
    return items.map((item, index) => {
      const meta = classifyFiscozenDescription(item.description);
      return {
        id: item.id || `future_${index + 1}`,
        dueDate: item.due_date || null,
        amount: ceil2(item.amount),
        amountRange: item.amount_range || '',
        source: 'fiscozen_future',
        description: meta.rawDescription,
        label: meta.label,
        family: meta.family,
        referenceYear: meta.referenceYear,
        isContribution: meta.isContribution,
        isTax: meta.isTax
      };
    });
  }

  function normalizeFiscozenPaidTaxes(payload) {
    const items = Array.isArray(payload && payload.results) ? payload.results : [];
    return items.map((item) => {
      const meta = classifyFiscozenDescription(item.description);
      return {
        id: item.id || '',
        dueDate: item.due_date || null,
        amount: ceil2(item.amount || item.paid_amount),
        paidAmount: ceil2(item.paid_amount),
        source: 'fiscozen_paid',
        description: meta.rawDescription,
        label: meta.label,
        family: meta.family,
        referenceYear: meta.referenceYear,
        isContribution: meta.isContribution,
        isTax: meta.isTax,
        isMixedLegacy: meta.isMixedLegacy,
        doneByUser: item.done_by_user === true
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

  global.TaxEngine = {
    ENGINE_VERSION,
    getRuleCatalog,
    normalizeFiscozenFutureTaxes,
    normalizeFiscozenPaidTaxes,
    buildTransitionDiagnostics,
    buildForfettarioScenario,
    buildForfettarioMethodComparison,
    buildInstallmentStatus,
    buildInstallmentExplanation
  };
})(window);
