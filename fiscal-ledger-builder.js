(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.FiscalLedgerBuilder = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  const DEFAULT_RULES = {
    accontoThreshold: 51.65,
    singleAccontoThreshold: 257.52,
    saldoMonth: 6,
    saldoDay: 30,
    secondoAccontoMonth: 11,
    secondoAccontoDay: 30,
    fixedInpsDates: [[5, 16], [8, 20], [11, 16], [2, 16]],
    fixedAccontoWeights: [40, 60]
  };

  function toNumber(value) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : 0;
  }

  function ceil2(value) {
    const num = toNumber(value);
    if (!num) return 0;
    const scaled = Math.abs(num) * 100;
    const rounded = Math.ceil(scaled - 1e-9) / 100;
    return num < 0 ? -rounded : rounded;
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
    const cfg = Object.assign({}, DEFAULT_RULES, rules || {});
    const base = centsToEuro(euroToCents(baseAmount));
    if (base <= cfg.accontoThreshold) {
      return { base, total: 0, first: 0, second: 0, mode: 'none' };
    }
    if (base < cfg.singleAccontoThreshold) {
      return { base, total: base, first: 0, second: base, mode: 'single' };
    }
    const parts = splitAmountByWeights(base, cfg.fixedAccontoWeights);
    return {
      base,
      total: base,
      first: parts[0] || 0,
      second: parts[1] || 0,
      mode: 'double'
    };
  }

  function roundToTen(value) {
    return Math.round(toNumber(value) / 10) * 10;
  }

  function buildRolledDueDate(year, month, day, options) {
    const opts = options || {};
    const isHoliday = typeof opts.isHoliday === 'function' ? opts.isHoliday : null;
    const d = new Date(year, month - 1, day);
    while (
      d.getDay() === 0
      || d.getDay() === 6
      || (isHoliday && isHoliday(d.getFullYear(), d.getMonth() + 1, d.getDate()))
    ) {
      d.setDate(d.getDate() + 1);
    }
    const rolledYear = d.getFullYear();
    const rolledMonth = d.getMonth() + 1;
    const rolledDay = d.getDate();
    const pad2 = (v) => String(v).padStart(2, '0');
    const shortMonths = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    return {
      year: rolledYear,
      month: rolledMonth,
      day: rolledDay,
      date: d,
      iso: `${rolledYear}-${pad2(rolledMonth)}-${pad2(rolledDay)}`,
      label: `${pad2(rolledDay)} ${shortMonths[rolledMonth - 1]} ${rolledYear}`
    };
  }

  function getScheduleStatus(dateObj, now) {
    const today = now instanceof Date ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const diffDays = Math.round((due - today) / 86400000);
    if (diffDays < 0) return { label: 'Scaduta', cls: 'danger' };
    if (diffDays === 0) return { label: 'Oggi', cls: 'warn' };
    if (diffDays <= 30) return { label: 'Entro 30 gg', cls: 'warn' };
    return { label: 'Futura', cls: 'info' };
  }

  function isRelevantFiscalYear(meta) {
    const input = meta || {};
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

  function classifyFiscalYear(meta) {
    const input = meta || {};
    const year = parseInt(input.year, 10);
    const vatStartYear = parseInt(input.vatStartYear, 10);
    const hasVatStart = Number.isFinite(vatStartYear);
    const hasSignals = !!(
      input.hasRows
      || input.hasPayments
      || input.hasOverrides
      || input.hasImportedData
      || input.hasActivity
      || input.hasEmployeeIncome
      || (Array.isArray(input.importedFamilies) && input.importedFamilies.length)
    );
    const regime = String(input.regime || '').toLowerCase();
    const importedFamilies = Array.isArray(input.importedFamilies) ? input.importedFamilies : [];
    const hasOrdinarySignals = importedFamilies.some(function (family) {
      return family === 'irpef' || family === 'regional_surtax' || family === 'municipal_surtax';
    }) || !!input.hasEmployeeIncome;
    const hasForfettarioSignals = !!(input.hasRows || input.hasPayments || input.hasActivity);

    if (regime === 'forfettario') {
      return hasOrdinarySignals ? 'misto' : 'forfettario';
    }
    if (regime === 'ordinario') {
      return hasOrdinarySignals ? 'misto' : 'ordinario';
    }

    if (!hasSignals) return 'irrilevante';

    if (hasVatStart && Number.isFinite(year) && year > vatStartYear && !hasForfettarioSignals && !hasOrdinarySignals) {
      return 'irrilevante';
    }

    if (hasOrdinarySignals && hasForfettarioSignals) return 'misto';
    if (hasOrdinarySignals) return 'misto';
    if (hasForfettarioSignals) return 'forfettario';
    return 'irrilevante';
  }

  function buildLedgerRow(options) {
    const input = options || {};
    const year = parseInt(input.year, 10);
    const dueYear = parseInt(input.dueYear, 10);
    const month = parseInt(input.month, 10);
    const day = parseInt(input.day, 10);
    const amount = ceil2(input.amount);
    const due = input.due || buildRolledDueDate(
      Number.isFinite(dueYear) ? dueYear : (Number.isFinite(year) ? year : new Date().getFullYear()),
      month,
      day,
      { isHoliday: input.isHoliday }
    );
    const low = input.low !== undefined ? ceil2(input.low) : amount;
    const high = input.high !== undefined ? ceil2(input.high) : amount;
    const competenceYear = input.competenceYear !== undefined ? parseInt(input.competenceYear, 10) : (Number.isFinite(year) ? year : null);
    const fiscalYear = input.fiscalYear !== undefined ? parseInt(input.fiscalYear, 10) : competenceYear;
    const key = String(input.key || input.scheduleKey || '').trim();
    const row = {
      id: key || `ledger_${fiscalYear || 'na'}_${Math.random().toString(36).slice(2, 8)}`,
      key,
      scheduleKey: key,
      title: String(input.title || 'Scadenza'),
      competence: String(input.competence || `Anno ${competenceYear || ''}`),
      competenceLabel: String(input.competenceLabel || input.competence || `Anno ${competenceYear || ''}`),
      competenceYear,
      fiscalYear,
      dueYear: due.year,
      due,
      amount,
      amountDue: amount,
      low,
      high,
      kind: String(input.kind || 'altro'),
      family: String(input.family || 'other'),
      method: String(input.method || 'Calcolato'),
      note: String(input.note || ''),
      certainty: String(input.certainty || 'fixed'),
      source: String(input.source || 'ledger_builder'),
      ledgerType: String(input.ledgerType || 'due'),
      isManualOverride: !!input.isManualOverride,
      isCrossYear: input.isCrossYear !== undefined ? !!input.isCrossYear : !!(competenceYear !== null && due.year !== competenceYear),
      status: input.status || getScheduleStatus(due.date, input.now),
      dueDate: due.iso
    };
    return row;
  }

  function normalizeManualRow(row, year, options) {
    const input = row || {};
    const opts = options || {};
    const due = input.due || (input.dueYear && input.month && input.day
      ? buildRolledDueDate(input.dueYear, input.month, input.day, { isHoliday: opts.isHoliday })
      : null);
    return buildLedgerRow({
      year: year,
      due: due || undefined,
      dueYear: input.dueYear !== undefined ? input.dueYear : (input.fiscalYear !== undefined ? input.fiscalYear + 1 : year + 1),
      month: input.month,
      day: input.day,
      title: input.title || input.label || 'Importo manuale',
      competence: input.competence || input.competenceLabel || `Anno ${year}`,
      competenceLabel: input.competenceLabel || input.competence || `Anno ${year}`,
      competenceYear: input.competenceYear !== undefined ? input.competenceYear : year,
      fiscalYear: input.fiscalYear !== undefined ? input.fiscalYear : year,
      amount: input.amount !== undefined ? input.amount : input.amountDue,
      low: input.low,
      high: input.high,
      kind: input.kind || 'altro',
      family: input.family || 'other',
      method: input.method || 'Importo manuale',
      note: input.note || 'Importo manuale',
      certainty: input.certainty || 'fixed',
      key: input.key || input.scheduleKey || '',
      source: input.source || 'manual_override',
      ledgerType: input.ledgerType || 'manual_override',
      isManualOverride: true,
      isCrossYear: input.isCrossYear,
      isHoliday: opts.isHoliday,
      status: input.status
    });
  }

  function pushRow(target, row) {
    if (!row || !Number.isFinite(row.amount) || row.amount <= 0) return;
    target.push(row);
  }

  function buildForfettarioLedger(input) {
    const ctx = input || {};
    const year = parseInt(ctx.year, 10) || new Date().getFullYear();
    const scheduleSettings = ctx.scheduleSettings || {};
    const classification = ctx.classification || classifyFiscalYear({
      year,
      vatStartYear: ctx.vatStartYear,
      regime: scheduleSettings.regime || (ctx.currentApplied ? 'forfettario' : ''),
      hasEmployeeIncome: !!Number(scheduleSettings.haRedditoDipendente),
      hasRows: !!(ctx.rows && ctx.rows.length),
      hasPayments: !!ctx.hasPayments,
      hasOverrides: !!ctx.hasOverrides,
      hasImportedData: !!ctx.hasImportedData,
      importedFamilies: ctx.importedFamilies || []
    });
    const currentApplied = ctx.currentApplied || null;
    const prevApplied = ctx.prevApplied || null;
    const prevPrevApplied = ctx.prevPrevApplied || null;
    const currentContribution = ctx.currentContribution || null;
    const prevContribution = ctx.prevContribution || null;
    const prevPrevContribution = ctx.prevPrevContribution || null;
    const forecastImposta = ctx.forecastImposta || { amount: currentApplied ? currentApplied.tasse : 0, source: 'auto' };
    const forecastContributi = ctx.forecastContributi || {
      amount: currentContribution ? currentContribution.saldoAccontoBase : 0,
      source: 'auto'
    };
    const accontoMethod = ctx.isClosedYear ? 'storico' : (ctx.accontoMethod || 'storico');
    const projectionRange = ctx.projectionRange || null;
    const prevImpostaAccontiPaid = ceil2(ctx.prevImpostaAccontiPaid || 0);
    const prevContribAccontiPaid = ceil2(ctx.prevContribAccontiPaid || 0);
    const prevHasEst = !!ctx.prevHasEst;
    const transitionFromNonForfettario = !!ctx.transitionFromNonForfettario;
    const prevYearWasForfettario = !!ctx.prevYearWasForfettario;
    let firstYearManualUsed = !!ctx.firstYearManualUsed;
    const rows = [];
    const notes = [
      'Le date seguono le scadenze ordinarie e slittano al primo giorno lavorativo utile. Eventuali proroghe straordinarie non sono incluse automaticamente.',
      ctx.isClosedYear
        ? `L'anno ${year} e chiuso: questa vista mostra un consuntivo e il toggle storico/previsionale non si applica.`
        : (accontoMethod === 'previsionale'
          ? 'Gli acconti sono calcolati con il metodo previsionale. Verifica che le basi inserite siano coerenti con il reddito atteso.'
          : 'Gli acconti sono calcolati con il metodo storico standard. Se usi il metodo previsionale, gli importi possono cambiare.')
    ];
    const warnings = [];
    const credits = [];

    function pushDueRow(month, day, title, competence, amount, kind, method, note, options) {
      const opts = options || {};
      const normalized = centsToEuro(euroToCents(amount));
      if (normalized <= 0) return;
      const dueYear = opts.dueYear || (year + (month < 3 ? 1 : 0));
      const certainty = opts.certainty || 'fixed';
      const rangePct = projectionRange ? toNumber(projectionRange.variancePct) : 0;
      let low = normalized;
      let high = normalized;
      if (certainty === 'estimated' && rangePct > 0) {
        low = roundToTen(normalized * (1 - rangePct / 100));
        high = roundToTen(normalized * (1 + rangePct / 100));
      }
      pushRow(rows, buildLedgerRow({
        year,
        dueYear,
        month,
        day,
        title,
        competence,
        competenceLabel: competence,
        competenceYear: opts.fiscalYear !== undefined ? opts.fiscalYear : year,
        fiscalYear: opts.fiscalYear !== undefined ? opts.fiscalYear : year,
        amount: normalized,
        low,
        high,
        kind,
        family: opts.family || (kind === 'contributi' ? 'inps_variable' : (kind === 'tasse' ? 'substitute_tax' : 'other')),
        method,
        note: note || '',
        certainty,
        key: opts.key || '',
        source: opts.source || 'ledger_builder',
        ledgerType: opts.ledgerType || 'due',
        isManualOverride: !!opts.isManualOverride,
        isCrossYear: opts.isCrossYear,
        status: opts.status,
        isHoliday: ctx.isHoliday
      }));
    }

    function pushManualOverrideRow(definition) {
      const manualRow = normalizeManualRow(definition, year, { isHoliday: ctx.isHoliday });
      pushRow(rows, manualRow);
    }

    if (ctx.vatStartYear !== undefined && ctx.vatStartYear !== null && ctx.vatStartYear !== '') {
      const vatStartYear = parseInt(ctx.vatStartYear, 10);
      if (Number.isFinite(vatStartYear)) {
        if (year < vatStartYear) {
          notes.push(`Anno precedente all avvio IVA ${vatStartYear}: non lo inferisco automaticamente senza segnali espliciti.`);
        } else if (year > vatStartYear && classification === 'irrilevante') {
          notes.push(`Anno successivo all avvio IVA ${vatStartYear}: senza segnali fiscali espliciti non genero il ledger automatico.`);
        }
      }
    }

    if (classification === 'misto') {
      if (ctx.manualTotals || Array.isArray(ctx.manualOverrideRows) || firstYearManualUsed) {
        notes.push('Anno misto: il totale manuale prevale sulla ricostruzione automatica del periodo successivo.');
      } else {
        warnings.push('Anno misto: inserisci un totale manuale per tasse e contributi dovuti nel periodo successivo.');
      }
    }

    if (!prevApplied) {
      if (transitionFromNonForfettario) {
        notes.push(`Il ${year - 1} non risulta forfettario: tratto il ${year} come inizio di un nuovo ciclo e non genero acconti storici sullo stesso anno.`);
      } else if (ctx.hasPrimoAnnoData) {
        firstYearManualUsed = true;
        notes.push("I dati dell'anno precedente sono stati inseriti manualmente (primo utilizzo).");
      } else {
        notes.push(`Manca lo storico forfettario ${year - 1}: saldo e acconti imposta vengono stimati usando i dati dell'anno ${year}.`);
      }
    } else if (prevImpostaAccontiPaid > 0) {
      notes.push(`Il saldo imposta ${year - 1} sottrae gli acconti registrati come pagati (${prevImpostaAccontiPaid.toFixed(2)} EUR).`);
    }
    if (accontoMethod === 'previsionale') {
      notes.push(`Base previsionale imposta sostitutiva: ${forecastImposta.amount.toFixed(2)} EUR (${forecastImposta.source === 'manual' ? 'manuale' : 'stima automatica'}).`);
      if (currentContribution) {
        notes.push(`Base previsionale ${String(currentContribution.saldoLabel || 'contributi').toLowerCase()}: ${forecastContributi.amount.toFixed(2)} EUR (${forecastContributi.source === 'manual' ? 'manuale' : 'stima automatica'}).`);
      }
    }
    if (ctx.manualSaldoImposta !== null || ctx.manualAccontoImposta !== null || ctx.manualSaldoContributi !== null || ctx.manualAccontoContributi !== null) {
      notes.push('Sono attivi uno o piu override manuali: i relativi importi prevalgono sul calcolo automatico.');
    }

    const autoImpostaSaldo = prevApplied
      ? ceil2(prevApplied.tasse) - prevImpostaAccontiPaid
      : (firstYearManualUsed && ctx.primoAnnoImpostaPrec !== null
        ? ceil2(ctx.primoAnnoImpostaPrec) - ceil2(ctx.primoAnnoAccontiImpostaPrec || 0)
        : 0);
    const impostaSaldo = ctx.manualSaldoImposta !== null && ctx.manualSaldoImposta !== undefined
      ? ceil2(ctx.manualSaldoImposta)
      : autoImpostaSaldo;
    if (impostaSaldo > 0) {
      pushDueRow(
        DEFAULT_RULES.saldoMonth,
        DEFAULT_RULES.saldoDay,
        'Imposta sostitutiva',
        `Saldo ${year - 1}`,
        impostaSaldo,
        'tasse',
        ctx.manualSaldoImposta !== null && ctx.manualSaldoImposta !== undefined
          ? 'Importo manuale'
          : (firstYearManualUsed ? 'Manuale primo utilizzo' : (prevImpostaAccontiPaid > 0 ? `${year - 1} netto acconti` : `Totale ${year - 1}`)),
        '',
        { key: `imposta_saldo_${year - 1}`, certainty: ctx.manualSaldoImposta !== null && ctx.manualSaldoImposta !== undefined ? 'fixed' : ((firstYearManualUsed || prevHasEst) ? 'estimated' : 'fixed'), fiscalYear: year - 1 }
      );
    } else if ((ctx.manualSaldoImposta === null || ctx.manualSaldoImposta === undefined) && autoImpostaSaldo < 0) {
      credits.push({ title: 'Imposta sostitutiva', competence: `Credito da saldo ${year - 1}`, amount: Math.abs(autoImpostaSaldo), fiscalYear: year - 1 });
    }

    const impostaAccontiBase = ctx.manualAccontoImposta !== null && ctx.manualAccontoImposta !== undefined
      ? ctx.manualAccontoImposta
      : (accontoMethod === 'previsionale'
        ? forecastImposta.amount
        : (prevApplied
          ? prevApplied.tasse
          : (firstYearManualUsed && ctx.primoAnnoImpostaPrec !== null
            ? ctx.primoAnnoImpostaPrec
            : (transitionFromNonForfettario ? 0 : (currentApplied ? currentApplied.tasse : 0)))));
    const impostaAcconti = buildAccontoPlan(impostaAccontiBase, ctx.accontoRules);
    const impostaAccCertainty = ctx.manualAccontoImposta !== null && ctx.manualAccontoImposta !== undefined
      ? 'fixed'
      : (accontoMethod === 'previsionale' ? 'estimated' : (prevHasEst ? 'estimated' : 'fixed'));
    if (impostaAcconti.first > 0) {
      pushDueRow(
        DEFAULT_RULES.saldoMonth,
        DEFAULT_RULES.saldoDay,
        'Imposta sostitutiva',
        `1o acconto ${year}`,
        impostaAcconti.first,
        'tasse',
        ctx.manualAccontoImposta !== null && ctx.manualAccontoImposta !== undefined
          ? 'Importo manuale'
          : (accontoMethod === 'previsionale'
            ? `Previsionale ${forecastImposta.source === 'manual' ? 'manuale' : 'auto'}`
            : (prevApplied ? `Storico ${year - 1}` : (firstYearManualUsed ? 'Manuale primo utilizzo' : `Stima ${year}`))),
        '',
        { key: `imposta_acc1_${year}`, certainty: impostaAccCertainty, fiscalYear: year }
      );
    }
    if (impostaAcconti.second > 0) {
      pushDueRow(
        DEFAULT_RULES.secondoAccontoMonth,
        DEFAULT_RULES.secondoAccontoDay,
        'Imposta sostitutiva',
        `${impostaAcconti.first > 0 ? '2o' : 'Unico'} acconto ${year}`,
        impostaAcconti.second,
        'tasse',
        ctx.manualAccontoImposta !== null && ctx.manualAccontoImposta !== undefined
          ? 'Importo manuale'
          : (accontoMethod === 'previsionale'
            ? `Previsionale ${forecastImposta.source === 'manual' ? 'manuale' : 'auto'}`
            : (prevApplied ? `Storico ${year - 1}` : (firstYearManualUsed ? 'Manuale primo utilizzo' : `Stima ${year}`))),
        '',
        { key: `imposta_acc2_${year}`, certainty: impostaAccCertainty, fiscalYear: year }
      );
    }

    if (currentContribution && currentContribution.mode === 'artigiani_commercianti' && currentContribution.fixedAnnual > 0) {
      const fixedParts = splitAmountByWeights(currentContribution.fixedAnnual, [1, 1, 1, 1]);
      DEFAULT_RULES.fixedInpsDates.forEach(function (pair, idx) {
        const month = pair[0];
        const day = pair[1];
        pushDueRow(
          month,
          day,
          currentContribution.fixedLabel || 'Contributi INPS fissi',
          `Rata ${idx + 1}/4 ${year}`,
          fixedParts[idx],
          'contributi',
          currentApplied && currentApplied.useRiduzione ? 'Riduzione 35% inclusa' : 'Quota fissa sul minimale',
          '',
          { key: `inps_fissi_${idx + 1}_${year}`, certainty: 'fixed', fiscalYear: year, family: 'inps_fixed' }
        );
      });
    } else if (currentContribution) {
      notes.push(`Con ${String(currentContribution.saldoLabel || 'contributi')} non risultano rate fisse trimestrali sul minimale per il ${year}.`);
    }

    const autoCurrentContribSaldo = prevContribution
      ? ceil2(prevContribution.saldoAccontoBase) - prevContribAccontiPaid
      : (firstYearManualUsed && ctx.primoAnnoContribVariabiliPrec !== null
        ? ceil2(ctx.primoAnnoContribVariabiliPrec) - ceil2(ctx.primoAnnoAccontiContribPrec || 0)
        : 0);
    const contribSaldo = ctx.manualSaldoContributi !== null && ctx.manualSaldoContributi !== undefined
      ? ceil2(ctx.manualSaldoContributi)
      : autoCurrentContribSaldo;
    if (contribSaldo > 0) {
      pushDueRow(
        DEFAULT_RULES.saldoMonth,
        DEFAULT_RULES.saldoDay,
        currentContribution ? currentContribution.saldoLabel : 'Contributi',
        `Saldo ${year - 1}`,
        contribSaldo,
        'contributi',
        ctx.manualSaldoContributi !== null && ctx.manualSaldoContributi !== undefined
          ? 'Importo manuale'
          : (firstYearManualUsed ? 'Manuale primo utilizzo' : `${year - 1} netto acconti`),
        '',
        { key: `contributi_saldo_${year - 1}`, certainty: ctx.manualSaldoContributi !== null && ctx.manualSaldoContributi !== undefined ? 'fixed' : ((firstYearManualUsed || prevHasEst) ? 'estimated' : 'fixed'), fiscalYear: year - 1 }
      );
    } else if ((ctx.manualSaldoContributi === null || ctx.manualSaldoContributi === undefined) && autoCurrentContribSaldo < 0) {
      credits.push({ title: currentContribution ? currentContribution.saldoLabel : 'Contributi', competence: `Credito da saldo ${year - 1}`, amount: Math.abs(autoCurrentContribSaldo), fiscalYear: year - 1 });
    }

    const contribBase = ctx.manualAccontoContributi !== null && ctx.manualAccontoContributi !== undefined
      ? ctx.manualAccontoContributi
      : (accontoMethod === 'previsionale'
        ? forecastContributi.amount
        : (prevContribution
          ? prevContribution.saldoAccontoBase
          : (firstYearManualUsed && ctx.primoAnnoContribVariabiliPrec !== null
            ? ctx.primoAnnoContribVariabiliPrec
            : (transitionFromNonForfettario ? 0 : (currentContribution ? currentContribution.saldoAccontoBase : 0)))));
    const contribAcconti = buildAccontoPlan(contribBase, ctx.accontoRules);
    const contribAccCertainty = ctx.manualAccontoContributi !== null && ctx.manualAccontoContributi !== undefined
      ? 'fixed'
      : (accontoMethod === 'previsionale' ? 'estimated' : (prevHasEst ? 'estimated' : 'fixed'));
    if (contribAcconti.first > 0) {
      pushDueRow(
        DEFAULT_RULES.saldoMonth,
        DEFAULT_RULES.saldoDay,
        currentContribution ? currentContribution.saldoLabel : 'Contributi',
        `1o acconto ${year}`,
        contribAcconti.first,
        'contributi',
        ctx.manualAccontoContributi !== null && ctx.manualAccontoContributi !== undefined
          ? 'Importo manuale'
          : (accontoMethod === 'previsionale'
            ? `Previsionale ${forecastContributi.source === 'manual' ? 'manuale' : 'auto'}`
            : (prevContribution ? `Storico ${year - 1}` : (firstYearManualUsed ? 'Manuale primo utilizzo' : `Stima ${year}`))),
        '',
        { key: `contributi_acc1_${year}`, certainty: contribAccCertainty, fiscalYear: year }
      );
    }
    if (contribAcconti.second > 0) {
      pushDueRow(
        DEFAULT_RULES.secondoAccontoMonth,
        DEFAULT_RULES.secondoAccontoDay,
        currentContribution ? currentContribution.saldoLabel : 'Contributi',
        `${contribAcconti.first > 0 ? '2o' : 'Unico'} acconto ${year}`,
        contribAcconti.second,
        'contributi',
        ctx.manualAccontoContributi !== null && ctx.manualAccontoContributi !== undefined
          ? 'Importo manuale'
          : (accontoMethod === 'previsionale'
            ? `Previsionale ${forecastContributi.source === 'manual' ? 'manuale' : 'auto'}`
            : (prevContribution ? `Storico ${year - 1}` : (firstYearManualUsed ? 'Manuale primo utilizzo' : `Stima ${year}`))),
        '',
        { key: `contributi_acc2_${year}`, certainty: contribAccCertainty, fiscalYear: year }
      );
    }

    if (ctx.manualCamera !== null && ctx.manualCamera !== undefined) {
      pushDueRow(
        DEFAULT_RULES.saldoMonth,
        DEFAULT_RULES.saldoDay,
        'Diritto camerale',
        `Anno ${year}`,
        ctx.manualCamera,
        'altro',
        'Importo configurato',
        '',
        { key: `camera_${year}`, certainty: 'fixed', fiscalYear: year, family: 'chamber_fee' }
      );
    }
    if (ctx.manualBolloPrevQ4 !== null && ctx.manualBolloPrevQ4 !== undefined) {
      pushDueRow(
        2,
        28,
        'Imposta di bollo fatture elettroniche',
        `4o trimestre ${year - 1}`,
        ctx.manualBolloPrevQ4,
        'altro',
        'Importo configurato',
        '',
        { dueYear: year, key: `bollo_q4prev_${year - 1}`, certainty: 'fixed', fiscalYear: year - 1, family: 'tax_stamp' }
      );
    }
    if (ctx.manualBollo123 !== null && ctx.manualBollo123 !== undefined) {
      pushDueRow(
        DEFAULT_RULES.saldoMonth,
        DEFAULT_RULES.saldoDay,
        'Imposta di bollo fatture elettroniche',
        `1o-3o trimestre ${year}`,
        ctx.manualBollo123,
        'altro',
        'Importo configurato',
        '',
        { key: `bollo_q123_${year}`, certainty: 'fixed', fiscalYear: year, family: 'tax_stamp' }
      );
    }
    if (ctx.manualBolloQ4 !== null && ctx.manualBolloQ4 !== undefined) {
      pushDueRow(
        2,
        28,
        'Imposta di bollo fatture elettroniche',
        `4o trimestre ${year}`,
        ctx.manualBolloQ4,
        'altro',
        'Importo configurato',
        '',
        { key: `bollo_q4_${year}`, certainty: 'fixed', fiscalYear: year, family: 'tax_stamp' }
      );
    }
    if (ctx.manualInailCurrent !== null && ctx.manualInailCurrent !== undefined) {
      pushDueRow(
        2,
        16,
        'Autoliquidazione INAIL',
        `Rif. ${year}`,
        ctx.manualInailCurrent,
        'altro',
        'Importo configurato',
        '',
        { dueYear: year, key: `inail_${year}`, certainty: 'fixed', fiscalYear: year, family: 'inail' }
      );
    }
    if (ctx.manualInailNext !== null && ctx.manualInailNext !== undefined) {
      pushDueRow(
        2,
        16,
        'Autoliquidazione INAIL',
        `Rif. ${year + 1}`,
        ctx.manualInailNext,
        'altro',
        'Importo configurato',
        '',
        { key: `inail_${year + 1}`, certainty: 'fixed', fiscalYear: year + 1, family: 'inail' }
      );
    }

    if (Array.isArray(ctx.manualOverrideRows)) {
      ctx.manualOverrideRows.forEach(function (row) {
        pushManualOverrideRow(row);
      });
    }
    if (ctx.manualTotals) {
      const manualTax = ctx.manualTotals.tax !== undefined ? ctx.manualTotals.tax : ctx.manualTotals.taxes;
      const manualContrib = ctx.manualTotals.contribution !== undefined ? ctx.manualTotals.contribution : ctx.manualTotals.contributions;
      const dueYear = parseInt(ctx.manualTotalsDueYear, 10) || (year + 1);
      if (manualTax !== undefined && manualTax !== null && toNumber(manualTax) > 0) {
        pushDueRow(
          6,
          30,
          ctx.manualTotals.taxTitle || 'Totale manuale imposte',
          `Anno ${year}`,
          manualTax,
          'tasse',
          'Totale manuale',
          'Totale manuale inserito per anno misto o non ricostruibile.',
          { dueYear, key: `manual_tax_${year}`, certainty: 'fixed', fiscalYear: year, family: ctx.manualTotals.taxFamily || (classification === 'ordinario' ? 'irpef' : 'substitute_tax'), ledgerType: 'manual_total', isManualOverride: true }
        );
      }
      if (manualContrib !== undefined && manualContrib !== null && toNumber(manualContrib) > 0) {
        pushDueRow(
          6,
          30,
          ctx.manualTotals.contributionTitle || 'Totale manuale contributi',
          `Anno ${year}`,
          manualContrib,
          'contributi',
          'Totale manuale',
          'Totale manuale inserito per anno misto o non ricostruibile.',
          { dueYear, key: `manual_contrib_${year}`, certainty: 'fixed', fiscalYear: year, family: ctx.manualTotals.contributionFamily || 'inps_variable', ledgerType: 'manual_total', isManualOverride: true }
        );
      }
    }

    if (classification === 'irrilevante' && rows.length === 0 && credits.length === 0) {
      warnings.push('Anno irrilevante: nessun ledger automatico generato senza dati fiscali espliciti.');
    }

    const visibleRows = ctx.isClosedYear ? rows.filter(function (row) { return row.fiscalYear === year; }) : rows.slice();
    const visibleCredits = ctx.isClosedYear ? credits.filter(function (credit) { return credit.fiscalYear === year; }) : credits.slice();
    visibleRows.sort(function (a, b) {
      return a.due.date - b.due.date || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title);
    });

    return {
      year,
      classification,
      rows: visibleRows,
      notes,
      warnings,
      credits: visibleCredits,
      currentApplied,
      currentContribution,
      prevApplied,
      transitionFromNonForfettario,
      prevYearWasForfettario,
      firstYearManualUsed,
      accontoMethod,
      isClosedYear: !!ctx.isClosedYear,
      uiMethodLabel: ctx.isClosedYear ? 'Consuntivo' : (accontoMethod === 'previsionale' ? 'Previsionale' : 'Storico'),
      uiTitle: ctx.isClosedYear ? `Scadenze di competenza ${year}` : `Scadenziario Forfettario ${year}`,
      forecastImposta,
      forecastContributi,
      projectionRange,
      overrides: {
        saldoImposta: ctx.manualSaldoImposta,
        accontoImposta: ctx.manualAccontoImposta,
        saldoContributi: ctx.manualSaldoContributi,
        accontoContributi: ctx.manualAccontoContributi
      },
      vatStartYear: ctx.vatStartYear !== undefined ? ctx.vatStartYear : null,
      isMixed: classification === 'misto',
      isIrrelevant: classification === 'irrilevante'
    };
  }

  return {
    ceil2,
    euroToCents,
    centsToEuro,
    splitAmountByWeights,
    buildAccontoPlan,
    buildRolledDueDate,
    getScheduleStatus,
    classifyFiscalYear,
    isRelevantFiscalYear,
    buildLedgerRow,
    buildForfettarioLedger
  };
});
