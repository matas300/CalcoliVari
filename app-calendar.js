// app-calendar.js — Render: Calendar + Scadenziario + payment date pickers + giorno picker
// Estratto da app.js (Sprint 6.2 — MOSTRO 2) — sezione Render: Calendar (~2018 righe).
// Caricato DOPO app.js + app-storage.js: usa data, currentYear, MONTHS, MONTHS_SHORT,
// fmt, fmtPct, ceil2, parseIsoDate, pad2, getEaster, isHoliday, daysInMonth, getEffectiveTaxRate,
// loadYearData, saveYearData, getStoredYears, S, getInpsMode, ScadenziarioEngine,
// CalendarExport, getPagamenti, getPaymentEventsForScheduleKey, removePagamentoByScheduleKey,
// reopenPaidScheduleItem, recalcAll e altre globali condivise.

(function () {
  'use strict';

  // ═══════════════════ Render: Calendar ═══════════════════
  function getPagamentiSummaryData() {
    const pagamenti = getPagamenti();
    const totAcc = getTotalAccantonato();
    const totPag = getTotalPagamenti();
    const totDov = getTotalDovutoAccantonamento();
    const fondoResiduo = ceil2(totAcc - totPag);
    const residuoDaVersare = ceil2(totDov - totPag);
    const copertura = ceil2(totAcc - totDov);

    const perTipo = {};
    for (const p of getPagamenti()) {
      const tipo = PAYMENT_TYPES[p.tipo] ? p.tipo : 'altro';
      perTipo[tipo] = ceil2((perTipo[tipo] || 0) + ceil2(parseFloat(p.importo) || 0));
    }

    return {
      pagamenti,
      totAcc,
      totPag,
      totDov,
      fondoResiduo,
      residuoDaVersare,
      copertura,
      perTipo,
      tipiUsati: Object.keys(PAYMENT_TYPES).filter(k => perTipo[k] > 0)
    };
  }

  function buildPagamentiSummaryPanel(summary) {
    let h = `<div class="panel"><h3>Fondo e Versamenti</h3>`;
    h += row('Totale accantonato', fmt(summary.totAcc), 'highlight', 'positive');
    h += row('Dovuto stimato', fmt(summary.totDov));
    h += row('Pagamenti registrati', fmt(summary.totPag), '', 'negative');
    h += row('Fondo residuo', fmt(summary.fondoResiduo), 'highlight', summary.fondoResiduo >= 0 ? 'positive' : 'negative');
    if (summary.residuoDaVersare > 0) {
      h += row('Ancora da versare', fmt(summary.residuoDaVersare), '', 'negative');
    } else if (summary.residuoDaVersare < 0) {
      h += row('Pagato oltre il dovuto', fmt(Math.abs(summary.residuoDaVersare)), '', 'positive');
    } else {
      h += row('In pari col dovuto', fmt(0), '', 'positive');
    }
    h += `<div style="font-size:.78rem;color:var(--text2);line-height:1.5;margin-top:8px">`;
    h += `Il fondo accantonato resta separato dai versamenti gia fatti, cosi vedi subito quanta liquidita hai ancora disponibile.`;
    h += `</div></div>`;
    return h;
  }

  function buildPagamentiLedgerPanel(summary, options) {
    const opts = options || {};
    let body = `<div style="font-size:.82rem;color:var(--text2);margin-bottom:12px">`;
    body += `Registra F24, contributi o altri versamenti gia effettuati. Lo storico resta salvato per anno, ma qui viene mostrato in modo cumulato.`;
    body += `</div>`;

    if (summary.tipiUsati.length > 0) {
      body += `<div class="scad-inline-meta">`;
      for (const tipo of summary.tipiUsati) {
        body += `<span>${getPaymentTypeLabel(tipo)}: <b>${fmt(summary.perTipo[tipo])}</b></span>`;
      }
      body += `</div>`;
    }

    body += `<div class="pagamenti-header"><span>Data</span><span>Tipo</span><span>Descrizione</span><span>Importo</span><span></span></div>`;

    if (summary.pagamenti.length === 0) {
      body += `<div style="font-size:.88rem;color:var(--text2);padding:18px 0;text-align:center">`;
      body += `Nessun pagamento registrato fino al ${currentYear}.`;
      body += `</div>`;
    } else {
      for (const p of summary.pagamenti) {
        const idx = p._idx;
        const anno = p.anno;
        const storicoLabel = anno !== currentYear ? ` (${anno})` : '';
        const dateLabel = formatPaymentDateDisplay(p.data);
        const dateMeta = formatPaymentDateMeta(anno, p.data);
        body += `<div class="pagamenti-row">
          <button type="button" class="payment-date-btn" title="Scegli data${storicoLabel}" onclick="openPaymentDatePicker(${anno}, ${idx}, event)">
            <span class="payment-date-main">${dateLabel}</span>
            <span class="payment-date-meta">${dateMeta}</span>
          </button>
          <select onchange="setPagamentoField(${anno}, ${idx}, 'tipo', this.value)">
            ${Object.entries(PAYMENT_TYPES).map(([key, info]) => `<option value="${key}" ${p.tipo===key?'selected':''}>${info.label}</option>`).join('')}
          </select>
          <input type="text" value="${p.descrizione || ''}" placeholder="es. F24 giugno, saldo INPS..." onchange="setPagamentoField(${anno}, ${idx}, 'descrizione', this.value)">
          <input type="number" value="${p.importo || ''}" placeholder="0" step="0.01" onchange="setPagamentoImporto(${anno}, ${idx}, this.value)">
          <button class="btn-del" title="Elimina pagamento${storicoLabel}" aria-label="Elimina pagamento${storicoLabel}" onclick="removePagamento(${anno}, ${idx})">&times;</button>
        </div>`;
      }
    }

    body += `<div class="pagamenti-actions">
      <button class="btn-add" onclick="addPagamento()">+ Aggiungi pagamento</button>
      <button type="button" class="btn-ghost ocr-import-btn" onclick="openOcrPagamentoModal()">Importa da foto/PDF</button>
    </div>`;
    body += `<div style="font-size:.78rem;color:var(--text2);margin-top:8px">I nuovi pagamenti vengono aggiunti all'anno ${currentYear}.</div>`;
    body += `<div style="margin-top:16px">${row('Totale pagamenti registrati', fmt(summary.totPag), 'highlight', 'negative')}</div>`;

    if (!opts.embedded) {
      return `<div class="panel" style="grid-column:1/-1"><h3>Pagamenti fino al ${currentYear}</h3>${body}</div>`;
    }

    return `<div class="panel" style="grid-column:1/-1"><details class="scad-collapsible">
      <summary><span>Versamenti registrati</span><span class="scad-collapsible-meta">${summary.pagamenti.length} movimenti • ${fmt(summary.totPag)}</span></summary>
      <div class="scad-collapsible-body">${body}</div>
    </details></div>`;
  }

  function buildPagamentiSection(options) {
    const opts = options || {};
    const summary = getPagamentiSummaryData();
    let h = '';
    h += buildPagamentiSummaryPanel(summary);
    if (!opts.compact) {
      h += `<div class="panel"><h3>Copertura Fondo</h3>`;
      h += row('Copertura accantonamento', fmt(summary.copertura), 'highlight', summary.copertura >= 0 ? 'positive' : 'negative');
      h += row('Movimenti registrati', summary.pagamenti.length);
      h += `<div style="font-size:.78rem;color:var(--text2);line-height:1.5;margin-top:8px">`;
      h += `Il dovuto stimato cumula i valori del tab Tasse Accantonate fino al ${currentYear}.`;
      h += `</div></div>`;
    }
    h += buildPagamentiLedgerPanel(summary, { embedded: !!opts.embedded });
    return h;
  }

  // euroToCents / centsToEuro / splitAmountByWeights importati da math-utils.js (vedi top-of-file)

  function buildAccontoPlan(baseAmount) {
    const base = centsToEuro(euroToCents(baseAmount));
    if (base <= FORFETTARIO_RULES.accontoThreshold) {
      return { base, total: 0, first: 0, second: 0, mode: 'none' };
    }
    if (base <= FORFETTARIO_RULES.singleAccontoThreshold) {
      return { base, total: base, first: 0, second: base, mode: 'single' };
    }
    const [first, second] = splitAmountByWeights(base, FORFETTARIO_RULES.fixedAccontoWeights);
    return { base, total: base, first, second, mode: 'double' };
  }

  // Wrapper attorno a DateUtils.buildRolledDueDate: la versione UMD ritorna
  // {year, month, day} mentre i consumer in app.js richiedono anche
  // `date` (oggetto Date), `iso` (YYYY-MM-DD) e `label` (DD MMM YYYY).
  function buildRolledDueDate(year, month, day) {
    const r = _DateUtils.buildRolledDueDate(year, month, day);
    const d = new Date(r.year, r.month - 1, r.day);
    return {
      year: r.year,
      month: r.month,
      day: r.day,
      date: d,
      iso: `${r.year}-${pad2(r.month)}-${pad2(r.day)}`,
      label: `${pad2(r.day)} ${MONTHS_SHORT[r.month - 1]} ${r.year}`
    };
  }

  function getScheduleStatus(dateObj) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const diffDays = Math.round((due - today) / 86400000);
    if (diffDays < 0) return { label: 'Scaduta', cls: 'danger' };
    if (diffDays === 0) return { label: 'Oggi', cls: 'warn' };
    if (diffDays <= 30) return { label: 'Entro 30 gg', cls: 'warn' };
    return { label: 'Futura', cls: 'info' };
  }

  function getForfettarioContributionBase(applied) {
    if (!applied) return null;
    return {
      mode: applied.inpsMode,
      fixedAnnual: applied.inpsMode === 'artigiani_commercianti' ? applied.contribFissi : 0,
      saldoAccontoBase: applied.inpsMode === 'artigiani_commercianti' ? applied.contribVariabili : applied.contribTotali,
      fixedLabel: 'Contributi INPS fissi',
      saldoLabel: applied.inpsMode === 'artigiani_commercianti' ? 'Contributi INPS eccedenza' : 'Contributi previdenziali'
    };
  }

  function getForfettarioAppliedForYear(year) {
    const calc = calcForfettarioForYear(year);
    if (!calc) return null;
    const yearData = year === currentYear ? data : loadYearData(year);
    return getAppliedForfettarioValues(calc, yearData && yearData.settings ? yearData.settings : S());
  }

  function legacyBuildForfettarioScheduleForYear(year) {
    const yearData = year === currentYear ? data : loadYearData(year);
    const scheduleSettings = yearData && yearData.settings ? yearData.settings : S();
    const accontoMethod = getScadenziarioMetodoAcconti(scheduleSettings);
    const rows = [];
    const notes = [
      'Le date seguono le scadenze ordinarie e slittano al primo giorno lavorativo utile. Eventuali proroghe straordinarie non sono incluse automaticamente.',
      accontoMethod === 'previsionale'
        ? 'Gli acconti sono calcolati con il metodo previsionale. Verifica che le basi inserite siano coerenti con il reddito atteso.'
        : 'Gli acconti sono calcolati con il metodo storico standard. Se usi il metodo previsionale, gli importi possono cambiare.'
    ];
    const credits = [];
    const currentApplied = getForfettarioAppliedForYear(year) || getAppliedForfettarioValues(calcForfettarioValues(0, S()), S());
    const prevApplied = getForfettarioAppliedForYear(year - 1);
    const prevPrevApplied = getForfettarioAppliedForYear(year - 2);
    const currentContribution = getForfettarioContributionBase(currentApplied);
    const prevContribution = getForfettarioContributionBase(prevApplied);
    const prevPrevContribution = getForfettarioContributionBase(prevPrevApplied);
    const forecastImposta = resolveScadenziarioForecastBase(scheduleSettings.scadenziarioPrevisionaleImposta, currentApplied.tasse);
    const forecastContributi = resolveScadenziarioForecastBase(
      scheduleSettings.scadenziarioPrevisionaleContributi,
      currentContribution ? currentContribution.saldoAccontoBase : 0
    );

    function pushDueRow(month, day, title, competence, amount, kind, method, note) {
      const normalized = centsToEuro(euroToCents(amount));
      if (normalized <= 0) return;
      const due = buildRolledDueDate(year + (month < 3 ? 1 : 0), month, day);
      rows.push({
        due,
        title,
        competence,
        amount: normalized,
        kind,
        method,
        note: note || '',
        status: getScheduleStatus(due.date)
      });
    }

    if (!prevApplied) {
      notes.push(`Manca lo storico ${year - 1}: saldo e acconti vengono stimati usando i dati dell'anno ${year}.`);
    } else if (!prevPrevApplied) {
      notes.push(`Manca lo storico ${year - 2}: il saldo ${year - 1} viene mostrato senza sottrarre gli acconti dell'anno precedente.`);
    }
    if (accontoMethod === 'previsionale') {
      notes.push(
        `Base previsionale imposta sostitutiva: ${fmt(forecastImposta.amount)} (${forecastImposta.source === 'manual' ? 'manuale' : 'stima automatica dal ' + year}).`
      );
      if (currentContribution) {
        notes.push(
          `Base previsionale ${currentContribution.saldoLabel.toLowerCase()}: ${fmt(forecastContributi.amount)} (${forecastContributi.source === 'manual' ? 'manuale' : 'stima automatica dal ' + year}).`
        );
      }
    }

    const impostaSaldo = prevApplied ? prevApplied.tasse - (prevPrevApplied ? buildAccontoPlan(prevPrevApplied.tasse).total : 0) : 0;
    if (impostaSaldo > 0) {
      pushDueRow(
        FORFETTARIO_RULES.saldoMonth,
        FORFETTARIO_RULES.saldoDay,
        'Imposta sostitutiva',
        `Saldo ${year - 1}`,
        impostaSaldo,
        'tasse',
        prevPrevApplied ? `Storico ${year - 2} -> ${year - 1}` : `Totale ${year - 1}`
      );
    } else if (impostaSaldo < 0) {
      credits.push({ title: 'Imposta sostitutiva', competence: `Credito da saldo ${year - 1}`, amount: Math.abs(impostaSaldo) });
    }

    const impostaAcconti = buildAccontoPlan(
      accontoMethod === 'previsionale'
        ? forecastImposta.amount
        : (prevApplied ? prevApplied.tasse : currentApplied.tasse)
    );
    if (impostaAcconti.first > 0) {
      pushDueRow(
        FORFETTARIO_RULES.saldoMonth,
        FORFETTARIO_RULES.saldoDay,
        'Imposta sostitutiva',
        `1° acconto ${year}`,
        impostaAcconti.first,
        'tasse',
        accontoMethod === 'previsionale'
          ? `Previsionale ${forecastImposta.source === 'manual' ? 'manuale' : 'auto'}`
          : (prevApplied ? `Storico ${year - 1}` : `Stima ${year}`)
      );
    }
    if (impostaAcconti.second > 0) {
      pushDueRow(
        FORFETTARIO_RULES.secondoAccontoMonth,
        FORFETTARIO_RULES.secondoAccontoDay,
        'Imposta sostitutiva',
        `${impostaAcconti.first > 0 ? '2°' : 'Unico'} acconto ${year}`,
        impostaAcconti.second,
        'tasse',
        accontoMethod === 'previsionale'
          ? `Previsionale ${forecastImposta.source === 'manual' ? 'manuale' : 'auto'}`
          : (prevApplied ? `Storico ${year - 1}` : `Stima ${year}`)
      );
    }

    if (currentContribution && currentContribution.mode === 'artigiani_commercianti' && currentContribution.fixedAnnual > 0) {
      const fixedParts = splitAmountByWeights(currentContribution.fixedAnnual, [1, 1, 1, 1]);
      FORFETTARIO_RULES.fixedInpsDates.forEach(([month, day], idx) => {
        pushDueRow(
          month,
          day,
          currentContribution.fixedLabel,
          `Rata ${idx + 1}/4 ${year}`,
          fixedParts[idx],
          'contributi',
          currentApplied.useRiduzione ? 'Riduzione 35% inclusa' : 'Quota fissa sul minimale'
        );
      });
    } else {
      notes.push(`Con ${getContribLabel(currentApplied.inpsMode)} non risultano rate fisse trimestrali sul minimale per il ${year}.`);
    }

    const contribSaldo = prevContribution ? prevContribution.saldoAccontoBase - (prevPrevContribution ? buildAccontoPlan(prevPrevContribution.saldoAccontoBase).total : 0) : 0;
    if (contribSaldo > 0) {
      pushDueRow(
        FORFETTARIO_RULES.saldoMonth,
        FORFETTARIO_RULES.saldoDay,
        prevContribution.saldoLabel,
        `Saldo ${year - 1}`,
        contribSaldo,
        'contributi',
        prevPrevContribution ? `Storico ${year - 2} -> ${year - 1}` : `Totale ${year - 1}`
      );
    } else if (contribSaldo < 0) {
      credits.push({ title: prevContribution ? prevContribution.saldoLabel : 'Contributi', competence: `Credito da saldo ${year - 1}`, amount: Math.abs(contribSaldo) });
    }

    const contribBase = accontoMethod === 'previsionale'
      ? forecastContributi.amount
      : (prevContribution ? prevContribution.saldoAccontoBase : (currentContribution ? currentContribution.saldoAccontoBase : 0));
    const contribAcconti = buildAccontoPlan(contribBase);
    if (contribAcconti.first > 0) {
      pushDueRow(
        FORFETTARIO_RULES.saldoMonth,
        FORFETTARIO_RULES.saldoDay,
        prevContribution ? prevContribution.saldoLabel : getContribLabel(currentApplied.inpsMode),
        `1° acconto ${year}`,
        contribAcconti.first,
        'contributi',
        accontoMethod === 'previsionale'
          ? `Previsionale ${forecastContributi.source === 'manual' ? 'manuale' : 'auto'}`
          : (prevContribution ? `Storico ${year - 1}` : `Stima ${year}`)
      );
    }
    if (contribAcconti.second > 0) {
      pushDueRow(
        FORFETTARIO_RULES.secondoAccontoMonth,
        FORFETTARIO_RULES.secondoAccontoDay,
        prevContribution ? prevContribution.saldoLabel : getContribLabel(currentApplied.inpsMode),
        `${contribAcconti.first > 0 ? '2°' : 'Unico'} acconto ${year}`,
        contribAcconti.second,
        'contributi',
        accontoMethod === 'previsionale'
          ? `Previsionale ${forecastContributi.source === 'manual' ? 'manuale' : 'auto'}`
          : (prevContribution ? `Storico ${year - 1}` : `Stima ${year}`)
      );
    }

    rows.sort((a, b) => a.due.date - b.due.date || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
    return { rows, notes, credits, currentApplied, accontoMethod, forecastImposta, forecastContributi };
  }

  function getOptionalAmountSetting(value) {
    if (value === '' || value === null || value === undefined) return null;
    return centsToEuro(euroToCents(value));
  }

  function yearHasEstimates(year) {
    const yearData = getYearDataFor(year);
    if (!yearData) return true;
    for (let month = 1; month <= 12; month++) {
      const amount = getMonthEuroFromYearData(yearData, year, month, { includeEstimates: true });
      if (amount <= 0) continue;
      const hasFatture = getFattureFromYearData(yearData, month, year).some(f => f.importo > 0);
      if (!hasFatture) return true;
    }
    return false;
  }

  function roundToTen(v) {
    return Math.round(v / 10) * 10;
  }

  function getForfettarioProjectionRange(year, variancePct) {
    const yearData = getYearDataFor(year);
    if (!yearData || !yearData.settings || yearData.settings.regime !== 'forfettario') return null;
    const pct = Math.max(parseFloat(variancePct) || 0, 0) / 100;
    let baseGross = 0, lowGross = 0, highGross = 0, estimatedGross = 0;

    for (let month = 1; month <= 12; month++) {
      const amount = getMonthEuroFromYearData(yearData, year, month, { includeEstimates: true });
      if (amount <= 0) continue;
      const hasFatture = getFattureFromYearData(yearData, month, year).some(f => f.importo > 0);
      baseGross += amount;
      if (hasFatture || pct <= 0) {
        lowGross += amount;
        highGross += amount;
      } else {
        const delta = amount * pct;
        estimatedGross += amount;
        lowGross += Math.max(amount - delta, 0);
        highGross += amount + delta;
      }
    }
    for (const inv of getCrossYearInvoicesForYear(year)) {
      baseGross += inv.importo;
      lowGross += inv.importo;
      highGross += inv.importo;
    }

    const settings = yearData.settings;
    const baseApplied = getAppliedForfettarioValues(calcForfettarioValues(baseGross, settings, year), settings);
    const lowApplied = getAppliedForfettarioValues(calcForfettarioValues(lowGross, settings, year), settings);
    const highApplied = getAppliedForfettarioValues(calcForfettarioValues(highGross, settings, year), settings);
    return {
      variancePct: pct * 100,
      estimatedGross,
      baseGross,
      lowGross,
      highGross,
      baseApplied,
      lowApplied,
      highApplied,
      baseDue: baseApplied ? baseApplied.tasse + baseApplied.contribTotali : 0,
      lowDue: lowApplied ? lowApplied.tasse + lowApplied.contribTotali : 0,
      highDue: highApplied ? highApplied.tasse + highApplied.contribTotali : 0
    };
  }

  function buildForfettarioScheduleForYear(year) {
    const yearData = getYearDataFor(year);
    const scheduleSettings = yearData && yearData.settings ? yearData.settings : S();
    const isClosedYear = isClosedFiscalYear(year);
    const accontoMethod = isClosedYear ? 'storico' : getScadenziarioMetodoAcconti(scheduleSettings);
    const rows = [];
    const notes = [
      'Le date seguono le scadenze ordinarie e slittano al primo giorno lavorativo utile. Eventuali proroghe straordinarie non sono incluse automaticamente.',
      isClosedYear
        ? `L'anno ${year} e chiuso: questa vista mostra un consuntivo e il toggle storico/previsionale non si applica.`
        : (accontoMethod === 'previsionale'
          ? 'Gli acconti sono calcolati con il metodo previsionale. Verifica che le basi inserite siano coerenti con il reddito atteso.'
          : 'Gli acconti sono calcolati con il metodo storico standard. Se usi il metodo previsionale, gli importi possono cambiare.')
    ];
    const credits = [];
    const currentApplied = getAppliedForfettarioForYear(year, { requireForfettarioRegime: true })
      || getAppliedForfettarioValues(calcForfettarioValues(0, scheduleSettings, year), scheduleSettings);
    const prevApplied = getAppliedForfettarioForYear(year - 1, { requireForfettarioRegime: true });
    const prevPrevApplied = getAppliedForfettarioForYear(year - 2, { requireForfettarioRegime: true });
    const currentContribution = getContributionBaseForYear(year, { includeEstimates: true });
    const prevContribution = getContributionBaseForYear(year - 1, { includeEstimates: true });
    const prevPrevContribution = getContributionBaseForYear(year - 2, { includeEstimates: true });
    const prevYearData = getYearDataFor(year - 1);
    const prevPrevYearData = getYearDataFor(year - 2);
    const prevYearRegime = prevYearData && prevYearData.settings ? prevYearData.settings.regime : '';
    const prevYearWasForfettario = prevYearRegime === 'forfettario';
    const transitionFromNonForfettario = !!prevYearRegime && prevYearRegime !== 'forfettario';
    const prevForfettarioContribution = prevYearWasForfettario ? prevContribution : null;
    const forecastImposta = resolveScadenziarioForecastBase(scheduleSettings.scadenziarioPrevisionaleImposta, currentApplied.tasse);
    const forecastContributi = resolveScadenziarioForecastBase(
      scheduleSettings.scadenziarioPrevisionaleContributi,
      currentContribution ? currentContribution.saldoAccontoBase : 0
    );
    const manualSaldoImposta = getOptionalAmountSetting(scheduleSettings.scadenziarioSaldoImposta);
    const manualAccontoImposta = getOptionalAmountSetting(scheduleSettings.scadenziarioAccontoImposta);
    const manualSaldoContributi = getOptionalAmountSetting(scheduleSettings.scadenziarioSaldoContributi);
    const manualAccontoContributi = getOptionalAmountSetting(scheduleSettings.scadenziarioAccontoContributi);
    const manualCamera = getOptionalAmountSetting(scheduleSettings.scadenziarioDirittoCamerale);
    const manualBolloPrevQ4 = getOptionalAmountSetting(scheduleSettings.scadenziarioBolloPrecedenteQ4);
    const manualBolloQ4 = getOptionalAmountSetting(scheduleSettings.scadenziarioBolloCorrenteQ4);
    const manualInailCurrent = getOptionalAmountSetting(scheduleSettings.scadenziarioInailCorrente);
    const manualInailNext = getOptionalAmountSetting(scheduleSettings.scadenziarioInailSuccessivo);
    const projectionRange = isClosedYear ? null : getForfettarioProjectionRange(year, scheduleSettings.scadenziarioRangePct);
    const prevHasEst = yearHasEstimates(year - 1);

    // Override data saldo/1o acconto imposta (proroga AdE): se impostato, sposta le 4 scadenze
    // del 30/06 relative a imposta sostitutiva (saldo + 1o acconto) e contributi variabili
    // (saldo + 1o acconto). 2o acconto e INPS fissi non sono interessati.
    const overrideRaw = (scheduleSettings.scadenziarioOverrideDataSaldoImposta || '').trim();
    let overrideSaldoImposta = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(overrideRaw)) {
      const [oy, om, od] = overrideRaw.split('-').map(n => parseInt(n, 10));
      const odt = new Date(oy, om - 1, od);
      if (odt.getFullYear() === oy && odt.getMonth() === om - 1 && odt.getDate() === od) {
        overrideSaldoImposta = { year: oy, month: om, day: od };
      }
    }

    // Campi primo utilizzo: fallback manuale quando manca lo storico anno precedente
    const primoAnnoImpostaPrec = getOptionalAmountSetting(scheduleSettings.primoAnnoImpostaPrec);
    const primoAnnoAccontiImpostaPrec = getOptionalAmountSetting(scheduleSettings.primoAnnoAccontiImpostaPrec);
    const primoAnnoContribVariabiliPrec = getOptionalAmountSetting(scheduleSettings.primoAnnoContribVariabiliPrec);
    const primoAnnoAccontiContribPrec = getOptionalAmountSetting(scheduleSettings.primoAnnoAccontiContribPrec);
    const hasPrimoAnnoData = primoAnnoImpostaPrec !== null || primoAnnoContribVariabiliPrec !== null;
    let firstYearManualUsed = false;

    function pushDueRow(month, day, title, competence, amount, kind, method, note, options) {
      const opts = options || {};
      const normalized = centsToEuro(euroToCents(amount));
      if (normalized <= 0) return;
      const dueYear = opts.dueYear || (year + (month < 3 ? 1 : 0));
      const due = buildRolledDueDate(dueYear, month, day);
      const certainty = opts.certainty || 'fixed';
      const rangePct = projectionRange ? projectionRange.variancePct : 0;
      let low = normalized, high = normalized;
      if (certainty === 'estimated' && rangePct > 0) {
        low = roundToTen(normalized * (1 - rangePct / 100));
        high = roundToTen(normalized * (1 + rangePct / 100));
      }
      rows.push({
        due,
        title,
        competence,
        fiscalYear: opts.fiscalYear || year,
        amount: normalized,
        low,
        high,
        kind,
        method,
        note: note || '',
        status: getScheduleStatus(due.date),
        key: opts.key || '',
        certainty,
        hint: opts.hint || ''
      });
    }

    // Subtract only actually registered payments linked to prior year acconto keys
    const allPay = getPagamenti();
    const prevImpostaAccontiPaid = allPay
      .filter(p => p.scheduleKey === `imposta_acc1_${year - 1}` || p.scheduleKey === `imposta_acc2_${year - 1}`)
      .reduce((s, p) => s + p.importo, 0);
    const prevContribAccontiPaid = allPay
      .filter(p => p.scheduleKey === `contributi_acc1_${year - 1}` || p.scheduleKey === `contributi_acc2_${year - 1}`)
      .reduce((s, p) => s + p.importo, 0);

    if (!prevApplied) {
      if (hasPrimoAnnoData) {
        firstYearManualUsed = true;
        notes.push(
          transitionFromNonForfettario
            ? `Il ${year - 1} non era forfettario puro: uso i valori manuali inseriti per costruire saldo e acconti iniziali del ${year}.`
            : `I dati dell'anno precedente sono stati inseriti manualmente (primo utilizzo).`
        );
      } else if (transitionFromNonForfettario) {
        notes.push(`Il ${year - 1} non risulta forfettario: gli acconti ${year} sono stimati sul fatturato corrente. Per maggiore precisione, inserisci i dati dell'anno precedente o usa il metodo previsionale.`);
      } else {
        notes.push(`Manca lo storico forfettario ${year - 1}: saldo e acconti imposta vengono stimati usando i dati dell'anno ${year}.`);
      }
    } else if (prevImpostaAccontiPaid > 0) {
      notes.push(`Il saldo imposta ${year - 1} sottrae gli acconti registrati come pagati (${fmt(prevImpostaAccontiPaid)}). Per aggiungerne, usa "Segna pagato" nello scadenziario ${year - 1}.`);
    }
    if (accontoMethod === 'previsionale') {
      notes.push(`Base previsionale imposta sostitutiva: ${fmt(forecastImposta.amount)} (${forecastImposta.source === 'manual' ? 'manuale' : 'stima automatica dal ' + year}).`);
      if (currentContribution) {
        notes.push(`Base previsionale ${currentContribution.saldoLabel.toLowerCase()}: ${fmt(forecastContributi.amount)} (${forecastContributi.source === 'manual' ? 'manuale' : 'stima automatica dal ' + year}).`);
      }
    }
    if (manualSaldoImposta !== null || manualAccontoImposta !== null || manualSaldoContributi !== null || manualAccontoContributi !== null) {
      notes.push('Sono attivi uno o piu override manuali nello scadenziario: i relativi importi prevalgono sul calcolo automatico.');
    }
    if (overrideSaldoImposta) {
      notes.push(`Proroga applicata: saldo e 1o acconto spostati al ${overrideSaldoImposta.day.toString().padStart(2, '0')}/${overrideSaldoImposta.month.toString().padStart(2, '0')}/${overrideSaldoImposta.year}.`);
    }

    const autoImpostaSaldo = prevApplied
      ? prevApplied.tasse - prevImpostaAccontiPaid
      : (firstYearManualUsed && primoAnnoImpostaPrec !== null
        ? primoAnnoImpostaPrec - (primoAnnoAccontiImpostaPrec || 0)
        : 0);
    const impostaSaldo = manualSaldoImposta !== null ? manualSaldoImposta : autoImpostaSaldo;
    if (impostaSaldo > 0) {
      pushDueRow(
        overrideSaldoImposta ? overrideSaldoImposta.month : FORFETTARIO_RULES.saldoMonth,
        overrideSaldoImposta ? overrideSaldoImposta.day : FORFETTARIO_RULES.saldoDay,
        'Imposta sostitutiva',
        `Saldo ${year - 1}`,
        impostaSaldo,
        'tasse',
        manualSaldoImposta !== null ? 'Importo manuale'
          : (firstYearManualUsed ? 'Manuale primo utilizzo'
            : (prevImpostaAccontiPaid > 0 ? `${year - 1} netto acconti` : `Totale ${year - 1}`)),
        '',
        { key: `imposta_saldo_${year - 1}`, certainty: manualSaldoImposta !== null ? 'fixed' : (firstYearManualUsed || prevHasEst ? 'estimated' : 'fixed'), fiscalYear: year - 1, dueYear: overrideSaldoImposta ? overrideSaldoImposta.year : undefined }
      );
    } else if (manualSaldoImposta === null && autoImpostaSaldo < 0) {
      credits.push({ title: 'Imposta sostitutiva', competence: `Credito da saldo ${year - 1}`, amount: Math.abs(autoImpostaSaldo), fiscalYear: year - 1 });
    }

    const impostaAccontiBase = manualAccontoImposta !== null
      ? manualAccontoImposta
      : (accontoMethod === 'previsionale'
        ? forecastImposta.amount
        : (prevApplied
          ? prevApplied.tasse
          : (firstYearManualUsed && primoAnnoImpostaPrec !== null
            ? primoAnnoImpostaPrec
            : currentApplied.tasse)));
    const impostaAcconti = buildAccontoPlan(impostaAccontiBase);
    const impostaAccCertainty = manualAccontoImposta !== null ? 'fixed'
      : (accontoMethod === 'previsionale' ? 'estimated' : (prevHasEst ? 'estimated' : 'fixed'));
    if (impostaAcconti.first > 0) {
      pushDueRow(
        overrideSaldoImposta ? overrideSaldoImposta.month : FORFETTARIO_RULES.saldoMonth,
        overrideSaldoImposta ? overrideSaldoImposta.day : FORFETTARIO_RULES.saldoDay,
        'Imposta sostitutiva',
        `1o acconto ${year}`,
        impostaAcconti.first,
        'tasse',
        manualAccontoImposta !== null
          ? 'Importo manuale'
          : (accontoMethod === 'previsionale'
            ? `Previsionale ${forecastImposta.source === 'manual' ? 'manuale' : 'auto'}`
            : (prevApplied ? `Storico ${year - 1}` : (firstYearManualUsed ? `Manuale primo utilizzo` : `Stima ${year}`))),
        '',
        { key: `imposta_acc1_${year}`, certainty: impostaAccCertainty, fiscalYear: year, dueYear: overrideSaldoImposta ? overrideSaldoImposta.year : undefined }
      );
    }
    if (impostaAcconti.second > 0) {
      pushDueRow(
        FORFETTARIO_RULES.secondoAccontoMonth,
        FORFETTARIO_RULES.secondoAccontoDay,
        'Imposta sostitutiva',
        `${impostaAcconti.first > 0 ? '2o' : 'Unico'} acconto ${year}`,
        impostaAcconti.second,
        'tasse',
        manualAccontoImposta !== null
          ? 'Importo manuale'
          : (accontoMethod === 'previsionale'
            ? `Previsionale ${forecastImposta.source === 'manual' ? 'manuale' : 'auto'}`
            : (prevApplied ? `Storico ${year - 1}` : (firstYearManualUsed ? `Manuale primo utilizzo` : `Stima ${year}`))),
        '',
        { key: `imposta_acc2_${year}`, certainty: impostaAccCertainty, fiscalYear: year }
      );
    }

    if (currentContribution && currentContribution.mode === 'artigiani_commercianti' && currentContribution.fixedAnnual > 0) {
      const fixedParts = splitAmountByWeights(currentContribution.fixedAnnual, [1, 1, 1, 1]);
      FORFETTARIO_RULES.fixedInpsDates.forEach(([month, day], idx) => {
        pushDueRow(
          month,
          day,
          currentContribution.fixedLabel,
          `Rata ${idx + 1}/4 ${year}`,
          fixedParts[idx],
          'contributi',
          currentApplied.useRiduzione ? 'Riduzione 35% inclusa' : 'Quota fissa sul minimale',
          '',
          { key: `inps_fissi_${idx + 1}_${year}`, certainty: 'fixed', fiscalYear: year }
        );
      });
    } else {
      notes.push(`Con ${getContribLabel(currentApplied.inpsMode)} non risultano rate fisse trimestrali sul minimale per il ${year}.`);
    }

    const autoContribSaldo = prevForfettarioContribution
      ? prevForfettarioContribution.saldoAccontoBase - prevContribAccontiPaid
      : (firstYearManualUsed && primoAnnoContribVariabiliPrec !== null
        ? primoAnnoContribVariabiliPrec - (primoAnnoAccontiContribPrec || 0)
        : 0);
    const contribSaldo = manualSaldoContributi !== null ? manualSaldoContributi : autoContribSaldo;
    // R9 — se non esistono né storico contrib N-1 né primoAnno* variabili, segnalo il buco informativo.
    const hasContribHistorical = !!prevForfettarioContribution || (firstYearManualUsed && primoAnnoContribVariabiliPrec !== null);
    if (!hasContribHistorical && manualSaldoContributi === null && contribSaldo <= 0) {
      notes.push(`Dati contributi variabili ${year - 1} non disponibili: imposta saldo e acconti manualmente in Impostazioni > Scadenziario (sezione "Opzioni avanzate").`);
    }
    const _saldoHelpersR9 = (typeof window !== 'undefined' && window.ScadenziarioSaldoHelpers) || null;
    const contribSaldoMethodText = (_saldoHelpersR9 && _saldoHelpersR9.buildSaldoContribN1MethodText)
      ? _saldoHelpersR9.buildSaldoContribN1MethodText(
          hasContribHistorical,
          firstYearManualUsed,
          manualSaldoContributi !== null,
          prevContribAccontiPaid,
          year
        )
      : (manualSaldoContributi !== null ? 'Importo manuale'
        : (firstYearManualUsed ? 'Manuale primo utilizzo'
          : (!hasContribHistorical ? 'Dati anno precedente non disponibili'
            : (prevContribAccontiPaid > 0 ? `${year - 1} netto acconti` : `Totale ${year - 1}`))));
    if (contribSaldo > 0) {
      pushDueRow(
        overrideSaldoImposta ? overrideSaldoImposta.month : FORFETTARIO_RULES.saldoMonth,
        overrideSaldoImposta ? overrideSaldoImposta.day : FORFETTARIO_RULES.saldoDay,
        prevForfettarioContribution ? prevForfettarioContribution.saldoLabel : getContribLabel(currentApplied.inpsMode),
        `Saldo ${year - 1}`,
        contribSaldo,
        'contributi',
        contribSaldoMethodText,
        '',
        { key: `contributi_saldo_${year - 1}`, certainty: manualSaldoContributi !== null ? 'fixed' : (firstYearManualUsed || prevHasEst ? 'estimated' : 'fixed'), fiscalYear: year - 1, dueYear: overrideSaldoImposta ? overrideSaldoImposta.year : undefined }
      );
    } else if (manualSaldoContributi === null && autoContribSaldo < 0) {
      credits.push({ title: prevContribution ? prevContribution.saldoLabel : 'Contributi', competence: `Credito da saldo ${year - 1}`, amount: Math.abs(autoContribSaldo), fiscalYear: year - 1 });
    }

    const contribBase = manualAccontoContributi !== null
      ? manualAccontoContributi
      : (accontoMethod === 'previsionale'
        ? forecastContributi.amount
        : (prevForfettarioContribution
          ? prevForfettarioContribution.saldoAccontoBase
          : (firstYearManualUsed && primoAnnoContribVariabiliPrec !== null
            ? primoAnnoContribVariabiliPrec
            : (currentContribution ? currentContribution.saldoAccontoBase : 0))));
    const contribAcconti = buildAccontoPlan(contribBase);
    const contribAccCertainty = manualAccontoContributi !== null ? 'fixed'
      : (accontoMethod === 'previsionale' ? 'estimated' : (prevHasEst ? 'estimated' : 'fixed'));
    if (contribAcconti.first > 0) {
      pushDueRow(
        overrideSaldoImposta ? overrideSaldoImposta.month : FORFETTARIO_RULES.saldoMonth,
        overrideSaldoImposta ? overrideSaldoImposta.day : FORFETTARIO_RULES.saldoDay,
        prevForfettarioContribution ? prevForfettarioContribution.saldoLabel : getContribLabel(currentApplied.inpsMode),
        `1o acconto ${year}`,
        contribAcconti.first,
        'contributi',
        manualAccontoContributi !== null
          ? 'Importo manuale'
          : (accontoMethod === 'previsionale'
            ? `Previsionale ${forecastContributi.source === 'manual' ? 'manuale' : 'auto'}`
            : (prevForfettarioContribution ? `Storico ${year - 1}` : (firstYearManualUsed ? `Manuale primo utilizzo` : `Stima ${year}`))),
        '',
        { key: `contributi_acc1_${year}`, certainty: contribAccCertainty, fiscalYear: year, dueYear: overrideSaldoImposta ? overrideSaldoImposta.year : undefined }
      );
    }
    if (contribAcconti.second > 0) {
      pushDueRow(
        FORFETTARIO_RULES.secondoAccontoMonth,
        FORFETTARIO_RULES.secondoAccontoDay,
        prevForfettarioContribution ? prevForfettarioContribution.saldoLabel : getContribLabel(currentApplied.inpsMode),
        `${contribAcconti.first > 0 ? '2o' : 'Unico'} acconto ${year}`,
        contribAcconti.second,
        'contributi',
        manualAccontoContributi !== null
          ? 'Importo manuale'
          : (accontoMethod === 'previsionale'
            ? `Previsionale ${forecastContributi.source === 'manual' ? 'manuale' : 'auto'}`
            : (prevForfettarioContribution ? `Storico ${year - 1}` : (firstYearManualUsed ? `Manuale primo utilizzo` : `Stima ${year}`))),
        '',
        { key: `contributi_acc2_${year}`, certainty: contribAccCertainty, fiscalYear: year }
      );
    }

    const defaultCamera = getInpsMode(scheduleSettings) === 'artigiani_commercianti' ? 53 : 0;
    const cameraAmount = manualCamera !== null ? manualCamera : defaultCamera;
    const cameraHint = (manualCamera === null && defaultCamera > 0)
      ? 'Valore di default: 53 EUR (artigiani/commercianti). Sovrascrivi da Impostazioni se diverso.'
      : '';
    if (cameraAmount > 0) {
      pushDueRow(
        FORFETTARIO_RULES.saldoMonth,
        FORFETTARIO_RULES.saldoDay,
        'Diritto annuale Camera di Commercio',
        `Anno ${year}`,
        cameraAmount,
        'altro',
        manualCamera !== null ? 'Importo configurato' : 'Default artigiani/commercianti',
        '',
        { key: `camera_${year}`, certainty: 'fixed', fiscalYear: year, hint: cameraHint }
      );
    }
    // Bollo fatture elettroniche: calcolo automatico per trimestre
    // Q4 anno precedente (scade feb anno corrente)
    const prevYearBolloQ4 = calcBolloPerQuarter(getYearDataFor(year - 1), year - 1)[3];
    const bolloPrevQ4Amount = manualBolloPrevQ4 !== null ? manualBolloPrevQ4 : prevYearBolloQ4.amount;
    if (bolloPrevQ4Amount > 0) {
      pushDueRow(2, 28, 'Imposta di bollo fatture elettroniche', `4o trimestre ${year - 1}`, bolloPrevQ4Amount, 'altro',
        manualBolloPrevQ4 !== null ? 'Importo configurato' : `${prevYearBolloQ4.count} fatt. > ${fmt(BOLLO_SOGLIA)} × ${fmt(BOLLO_IMPORTO)}`,
        '', { dueYear: year, key: `bollo_q4prev_${year - 1}`, certainty: 'fixed', fiscalYear: year - 1 });
    }
    // Q1-Q4 anno corrente
    const currentBolloQuarters = calcBolloPerQuarter(yearData, year);
    // Q1-Q3 always auto-calculated, Q4 can be overridden manually
    const bolloHasOverride = (qi) => qi === 3 ? manualBolloQ4 !== null : false;
    const currentBolloConsolidated = applyBolloDifferimento(currentBolloQuarters, bolloHasOverride);
    for (let qi = 0; qi < 4; qi++) {
      const q = currentBolloConsolidated[qi];
      const manualOverride = qi < 3 ? null : manualBolloQ4;
      const baseAmount = manualOverride !== null ? manualOverride : q.finalAmount;
      if (baseAmount > 0) {
        const dueYear = q.nextYear ? year + 1 : year;
        let methodText;
        if (manualOverride !== null) {
          methodText = 'Importo configurato';
        } else if (q.deferredFromLabels.length > 0) {
          methodText = `${q.count} fatt. > ${fmt(BOLLO_SOGLIA)} × ${fmt(BOLLO_IMPORTO)} + differito da ${q.deferredFromLabels.join(', ')}`;
        } else {
          methodText = `${q.count} fatt. > ${fmt(BOLLO_SOGLIA)} × ${fmt(BOLLO_IMPORTO)}`;
        }
        pushDueRow(q.dueMonth, q.dueDay, 'Imposta di bollo fatture elettroniche',
          `${q.label} ${year}`, baseAmount, 'altro',
          methodText,
          '', { dueYear, key: `bollo_q${qi + 1}_${year}`, certainty: 'fixed', fiscalYear: year });
      }
    }
    const bolloDeferredCount = currentBolloConsolidated.filter(q => q.deferred).length;
    if (bolloDeferredCount > 0) {
      notes.push(`Bollo FE: ${bolloDeferredCount} trimestre/i sotto soglia ${fmt(BOLLO_DIFFERIMENTO_SOGLIA)} (L. 73/2022) accorpato/i alla scadenza successiva.`);
    }
    const profileInailTasso = parseFloat(getProfileFiscalData().inailTasso) || 0;
    const autoInailCurrent = profileInailTasso > 0 ? calcInailPremio(year, profileInailTasso) : 0;
    const autoInailNext = profileInailTasso > 0 ? calcInailPremio(year + 1, profileInailTasso) : 0;
    const inailCurrentAmount = manualInailCurrent !== null ? manualInailCurrent : autoInailCurrent;
    const inailNextAmount = manualInailNext !== null ? manualInailNext : autoInailNext;
    const inailHintMissing = 'Imposta il tasso in Profilo P.IVA oppure override manuale in Impostazioni.';
    const inailCurrentHint = (profileInailTasso === 0 && manualInailCurrent === null) ? inailHintMissing : '';
    const inailNextHint = (profileInailTasso === 0 && manualInailNext === null) ? inailHintMissing : '';
    if (inailCurrentAmount > 0) {
      pushDueRow(2, 16, 'Autoliquidazione INAIL', `Rif. ${year}`, inailCurrentAmount, 'altro',
        manualInailCurrent !== null ? 'Importo configurato' : `Calcolato: ${profileInailTasso.toFixed(2)} ‰ su ${fmt(getInailMinimale(year))}`,
        '', { dueYear: year, key: `inail_${year}`, certainty: 'fixed', fiscalYear: year, hint: inailCurrentHint });
    } else if (inailCurrentHint) {
      const dueCurrent = buildRolledDueDate(year, 2, 16);
      rows.push({
        due: dueCurrent, title: 'Autoliquidazione INAIL', competence: `Rif. ${year}`,
        fiscalYear: year, amount: 0, low: 0, high: 0, kind: 'altro',
        method: 'Tasso non impostato', note: '',
        status: getScheduleStatus(dueCurrent.date), key: `inail_${year}`,
        certainty: 'fixed', hint: inailCurrentHint
      });
    }
    if (inailNextAmount > 0) {
      pushDueRow(2, 16, 'Autoliquidazione INAIL', `Rif. ${year + 1}`, inailNextAmount, 'altro',
        manualInailNext !== null ? 'Importo configurato' : `Calcolato: ${profileInailTasso.toFixed(2)} ‰ su ${fmt(getInailMinimale(year + 1))}`,
        '', { key: `inail_${year + 1}`, certainty: 'fixed', fiscalYear: year + 1, hint: inailNextHint });
    } else if (inailNextHint) {
      const dueNext = buildRolledDueDate(year + 1, 2, 16);
      rows.push({
        due: dueNext, title: 'Autoliquidazione INAIL', competence: `Rif. ${year + 1}`,
        fiscalYear: year + 1, amount: 0, low: 0, high: 0, kind: 'altro',
        method: 'Tasso non impostato', note: '',
        status: getScheduleStatus(dueNext.date), key: `inail_${year + 1}`,
        certainty: 'fixed', hint: inailNextHint
      });
    }

    // Fix C1 (tax audit 2026-04-24): per l'anno APERTO il saldo deve essere netto
    // degli acconti EFFETTIVAMENTE versati (pagamenti registrati con
    // scheduleKey = `imposta_acc[12]_{year}`), non degli acconti pianificati
    // (`impostaAcconti.total`). Anni chiusi restano invariati.
    const _saldoHelpers = (typeof window !== 'undefined' && window.ScadenziarioSaldoHelpers) || null;
    const _impostaSaldoRes = _saldoHelpers && currentApplied
      ? _saldoHelpers.computeAutoSaldoAnnoAperto(
          currentApplied.tasse, impostaAcconti, getPagamenti(), year, isClosedYear, 'imposta'
        )
      : null;
    const autoCurrentImpostaSaldo = _impostaSaldoRes
      ? _impostaSaldoRes.saldo
      : (currentApplied ? currentApplied.tasse - impostaAcconti.total : 0);
    const currentImpostaSaldo = manualSaldoImposta !== null ? manualSaldoImposta : autoCurrentImpostaSaldo;
    if (currentImpostaSaldo > 0) {
      pushDueRow(
        FORFETTARIO_RULES.saldoMonth,
        FORFETTARIO_RULES.saldoDay,
        'Imposta sostitutiva',
        `Saldo ${year}`,
        currentImpostaSaldo,
        'tasse',
        manualSaldoImposta !== null ? 'Importo manuale' : `${year} netto acconti`,
        '',
        { dueYear: year + 1, key: `imposta_saldo_${year}`, certainty: isClosedYear ? 'fixed' : 'estimated', fiscalYear: year }
      );
    } else if (manualSaldoImposta === null && autoCurrentImpostaSaldo < 0) {
      credits.push({ title: 'Imposta sostitutiva', competence: `Credito da saldo ${year}`, amount: Math.abs(autoCurrentImpostaSaldo), fiscalYear: year });
    }

    // Fix C1 (tax audit 2026-04-24): stesso ragionamento per i contributi — anno
    // aperto netta i versamenti reali (scheduleKey `contributi_acc[12]_{year}`).
    const _contribSaldoRes = _saldoHelpers && currentContribution
      ? _saldoHelpers.computeAutoSaldoAnnoAperto(
          currentContribution.saldoAccontoBase, contribAcconti, getPagamenti(), year, isClosedYear, 'contributi'
        )
      : null;
    const autoCurrentContribSaldo = _contribSaldoRes
      ? _contribSaldoRes.saldo
      : (currentContribution ? currentContribution.saldoAccontoBase - contribAcconti.total : 0);
    const currentContribSaldo = manualSaldoContributi !== null ? manualSaldoContributi : autoCurrentContribSaldo;
    if (currentContribSaldo > 0) {
      pushDueRow(
        FORFETTARIO_RULES.saldoMonth,
        FORFETTARIO_RULES.saldoDay,
        currentContribution ? currentContribution.saldoLabel : getContribLabel(currentApplied.inpsMode),
        `Saldo ${year}`,
        currentContribSaldo,
        'contributi',
        manualSaldoContributi !== null ? 'Importo manuale' : `${year} netto acconti`,
        '',
        { dueYear: year + 1, key: `contributi_saldo_${year}`, certainty: isClosedYear ? 'fixed' : 'estimated', fiscalYear: year }
      );
    } else if (manualSaldoContributi === null && autoCurrentContribSaldo < 0) {
      credits.push({ title: currentContribution ? currentContribution.saldoLabel : 'Contributi', competence: `Credito da saldo ${year}`, amount: Math.abs(autoCurrentContribSaldo), fiscalYear: year });
    }

    let visibleRows = rows;
    let visibleCredits = credits;
    if (isClosedYear) {
      visibleRows = rows.filter(row => row.fiscalYear === year);
      visibleCredits = credits.filter(credit => credit.fiscalYear === year);
      notes.push(`Nel consuntivo ${year} includo anche le scadenze nel ${year + 1} se chiudono il saldo fiscale o contributivo del ${year}.`);
    }

    visibleRows.sort((a, b) => a.due.date - b.due.date || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
    return {
      rows: visibleRows,
      notes,
      credits: visibleCredits,
      currentApplied,
      currentContribution,
      prevApplied,
      transitionFromNonForfettario,
      prevYearWasForfettario,
      firstYearManualUsed,
      accontoMethod,
      isClosedYear,
      uiMethodLabel: isClosedYear ? 'Consuntivo' : (accontoMethod === 'previsionale' ? 'Previsionale' : 'Storico'),
      uiTitle: isClosedYear ? `Scadenze di competenza ${year}` : `Scadenziario Forfettario ${year}`,
      forecastImposta,
      forecastContributi,
      projectionRange,
      overrides: {
        saldoImposta: manualSaldoImposta,
        accontoImposta: manualAccontoImposta,
        saldoContributi: manualSaldoContributi,
        accontoContributi: manualAccontoContributi
      }
    };
  }

  function buildHistoricalOrdinarySummaryForYear(year) {
    const external = getExternalFiscalData();
    const paidEntries = external && Array.isArray(external.paidEntries) ? external.paidEntries : [];
    const relevant = paidEntries.filter(entry => {
      if (!entry) return false;
      if ((entry.dueYear || 0) !== year + 1) return false;
      if (entry.isAggregateBundle) {
        return (entry.children || []).some(child => {
          const ref = child && (child.referenceYear || child.competenceYear);
          return ref === year || ref === year + 1;
        });
      }
      const ref = entry.referenceYear || entry.competenceYear;
      return ref === year || ref === year + 1 || entry.family === 'inps_fixed' || entry.family === 'inail';
    });
    const total = relevant.reduce((sum, item) => sum + ceil2(item.paidAmount || item.amount), 0);
    return {
      year,
      entries: relevant,
      total,
      note: `Anno ${year} in regime ordinario: scadenziario automatico non disponibile. I valori qui sotto arrivano dal prospetto storico del commercialista / Fiscozen e servono solo come contesto.`
    };
  }

  const SCADENZIARIO_OVERRIDE_KEYS = [
    'scadenziarioPrevisionaleImposta',
    'scadenziarioPrevisionaleContributi',
    'scadenziarioSaldoImposta',
    'scadenziarioAccontoImposta',
    'scadenziarioSaldoContributi',
    'scadenziarioAccontoContributi',
    'scadenziarioDirittoCamerale',
    'scadenziarioBolloPrecedenteQ4',
    'scadenziarioBolloCorrenteQ4',
    'scadenziarioInailCorrente',
    'scadenziarioInailSuccessivo',
    'primoAnnoFatturatoPrec',
    'primoAnnoImpostaPrec',
    'primoAnnoAccontiImpostaPrec',
    'primoAnnoContribVariabiliPrec',
    'primoAnnoAccontiContribPrec'
  ];

  function setScadenziarioView(view) {
    scadenziarioUiState.view = view === 'cash' ? 'cash' : 'competence';
    renderScadenziario();
  }

  function toggleScadenziarioHistoricalYears() {
    scadenziarioUiState.showHistoricalYears = !scadenziarioUiState.showHistoricalYears;
    renderScadenziario();
  }

  function getScadenziarioYearTypeFromSettings(settings) {
    const regime = settings && settings.regime ? settings.regime : '';
    const hasEmployeeIncome = !!Number(settings && settings.haRedditoDipendente);
    if (regime === 'forfettario' && !hasEmployeeIncome) return 'forfettario';
    if (regime === 'ordinario' && hasEmployeeIncome) return 'misto';
    if (regime === 'ordinario') return 'ordinario';
    if (hasEmployeeIncome) return 'misto';
    return regime || 'vuoto';
  }

  function getKnownExternalFiscalYears() {
    const years = new Set();
    const pushYear = (value) => {
      const year = parseInt(value, 10);
      if (Number.isFinite(year)) years.add(year);
    };
    const flatEntries = getExternalFiscalFlatEntries();
    for (const entry of flatEntries) {
      pushYear(entry && (entry.referenceYear || entry.competenceYear));
    }
    const external = getExternalFiscalData();
    const summaries = external && external.summaries ? external.summaries : {};
    for (const key of Object.keys(summaries)) {
      const match = key.match(/(20\d{2})/);
      if (match) pushYear(match[1]);
    }
    return Array.from(years).sort((a, b) => a - b);
  }

  function getScadenziarioOverrideCount(yearData) {
    if (!yearData || !yearData.settings) return 0;
    return SCADENZIARIO_OVERRIDE_KEYS.reduce((count, key) => {
      const value = yearData.settings[key];
      return value !== '' && value !== null && value !== undefined ? count + 1 : count;
    }, 0);
  }

  function getYearInvoiceCount(yearData) {
    if (!yearData || !yearData.fatture) return 0;
    let count = 0;
    for (const items of Object.values(yearData.fatture || {})) {
      for (const item of (Array.isArray(items) ? items : [])) {
        if ((parseFloat(item && item.importo) || 0) > 0) count += 1;
      }
    }
    return count;
  }

  function getExternalFiscalFlatEntries() {
    const external = getExternalFiscalData();
    return []
      .concat(external && Array.isArray(external.paidFlatEntries) ? external.paidFlatEntries : [])
      .concat(external && Array.isArray(external.futureFlatEntries) ? external.futureFlatEntries : []);
  }

  function getImportedCompetenceFiscalEntriesForYear(year) {
    return getExternalFiscalFlatEntries().filter(entry => {
      if (!entry) return false;
      const referenceYear = entry.referenceYear || entry.competenceYear;
      return referenceYear === year || entry.competenceYear === year;
    });
  }

  function getImportedFiscalEntriesForYear(year) {
    return getExternalFiscalFlatEntries().filter(entry => {
      if (!entry) return false;
      const referenceYear = entry.referenceYear || entry.competenceYear;
      return referenceYear === year || entry.competenceYear === year || entry.dueYear === year;
    });
  }

  function buildIsoDateFromDue(due) {
    if (!due) return '';
    if (due.date instanceof Date) {
      return `${due.year}-${pad2(due.date.getMonth() + 1)}-${pad2(due.date.getDate())}`;
    }
    return '';
  }

  function getScadenziarioFallbackStatus(row) {
    const dueAmount = ceil2(row && row.amountDue !== undefined ? row.amountDue : row && row.amount);
    const paid = ceil2((row && row.paymentEvents || []).reduce((sum, event) => sum + ceil2(event.amount), 0));
    if (paid >= dueAmount && dueAmount > 0) return { code: 'paid', label: 'Pagato', tone: 'ok', amountPaid: paid, residualAmount: ceil2(dueAmount - paid), isArchived: true, isCrossYear: false };
    if (paid > 0) return { code: 'partial', label: 'Parziale', tone: 'warn', amountPaid: paid, residualAmount: ceil2(dueAmount - paid), isArchived: false, isCrossYear: false };
    if (row && row.certainty === 'estimated') return { code: 'estimated', label: 'Stimato', tone: 'warn', amountPaid: 0, residualAmount: dueAmount, isArchived: false, isCrossYear: false };
    return { code: 'unpaid', label: 'Da pagare', tone: 'info', amountPaid: 0, residualAmount: dueAmount, isArchived: false, isCrossYear: false };
  }

  function mapScheduleRowToScadenziario(rowItem, year) {
    const scadEngine = getScadenziarioEngine();
    const paymentEvents = rowItem && rowItem.key ? getPaymentEventsForScheduleKey(rowItem.key) : [];
    if (scadEngine && typeof scadEngine.normalizeLegacyScheduleRow === 'function') {
      const normalized = scadEngine.normalizeLegacyScheduleRow(rowItem, {
        year,
        paymentEvents,
        now: new Date(),
        scheduleKey: rowItem && rowItem.key ? rowItem.key : '',
        competenceYear: rowItem && rowItem.fiscalYear ? rowItem.fiscalYear : year,
        cashYear: rowItem && rowItem.due ? rowItem.due.year : year,
        dueDate: buildIsoDateFromDue(rowItem && rowItem.due),
        dueYear: rowItem && rowItem.due ? rowItem.due.year : year,
        title: rowItem && rowItem.title ? rowItem.title : 'Scadenza',
        competenceLabel: rowItem && rowItem.competence ? rowItem.competence : `Anno ${year}`,
        competence: rowItem && rowItem.competence ? rowItem.competence : `Anno ${year}`,
        kind: rowItem && rowItem.kind ? rowItem.kind : 'altro',
        family: mapScheduleRowToFamily(rowItem),
        method: rowItem && rowItem.method ? rowItem.method : 'Calcolato',
        certainty: rowItem && rowItem.certainty ? rowItem.certainty : 'fixed',
        amountDue: ceil2(rowItem && rowItem.amount),
        low: ceil2(rowItem && rowItem.low !== undefined ? rowItem.low : rowItem && rowItem.amount),
        high: ceil2(rowItem && rowItem.high !== undefined ? rowItem.high : rowItem && rowItem.amount),
        source: 'calculated',
        regimeType: 'forfettario',
        isCrossYear: !!(rowItem && rowItem.fiscalYear && rowItem.due && rowItem.fiscalYear !== rowItem.due.year),
        supportsPartialPayment: true,
        paymentMode: 'partial_allowed',
        note: rowItem && rowItem.note ? rowItem.note : '',
        hint: rowItem && rowItem.hint ? rowItem.hint : '',
        warnings: [],
        due: rowItem && rowItem.due ? rowItem.due : null,
        legacyRow: rowItem
      });
      if (rowItem && rowItem.hint && normalized && !normalized.hint) normalized.hint = rowItem.hint;
      return normalized;
    }
    const mapped = {
      id: rowItem && rowItem.key ? rowItem.key : `sched_${year}_${Math.random().toString(36).slice(2, 8)}`,
      scheduleKey: rowItem && rowItem.key ? rowItem.key : '',
      competenceYear: rowItem && rowItem.fiscalYear ? rowItem.fiscalYear : year,
      cashYear: rowItem && rowItem.due ? rowItem.due.year : year,
      dueDate: buildIsoDateFromDue(rowItem && rowItem.due),
      dueYear: rowItem && rowItem.due ? rowItem.due.year : year,
      title: rowItem && rowItem.title ? rowItem.title : 'Scadenza',
      competenceLabel: rowItem && rowItem.competence ? rowItem.competence : `Anno ${year}`,
      competence: rowItem && rowItem.competence ? rowItem.competence : `Anno ${year}`,
      kind: rowItem && rowItem.kind ? rowItem.kind : 'altro',
      family: mapScheduleRowToFamily(rowItem),
      method: rowItem && rowItem.method ? rowItem.method : 'Calcolato',
      certainty: rowItem && rowItem.certainty ? rowItem.certainty : 'fixed',
      amountDue: ceil2(rowItem && rowItem.amount),
      amount: ceil2(rowItem && rowItem.amount),
      low: ceil2(rowItem && rowItem.low !== undefined ? rowItem.low : rowItem && rowItem.amount),
      high: ceil2(rowItem && rowItem.high !== undefined ? rowItem.high : rowItem && rowItem.amount),
      source: 'calculated',
      regimeType: 'forfettario',
      isCrossYear: !!(rowItem && rowItem.fiscalYear && rowItem.due && rowItem.fiscalYear !== rowItem.due.year),
      supportsPartialPayment: true,
      paymentMode: 'partial_allowed',
      paymentEvents,
      note: rowItem && rowItem.note ? rowItem.note : '',
      hint: rowItem && rowItem.hint ? rowItem.hint : '',
      warnings: [],
      due: rowItem && rowItem.due ? rowItem.due : null,
      legacyRow: rowItem
    };
    mapped.paymentStatus = scadEngine
      ? scadEngine.buildPaymentStatus(mapped, paymentEvents, { now: new Date() })
      : getScadenziarioFallbackStatus(mapped);
    return mapped;
  }

  function mapHistoricalEntryToScadenziarioRow(entry, year, regimeType) {
    const amount = ceil2(entry && (entry.paidAmount || entry.amount));
    const dueDate = entry && entry.dueDate ? entry.dueDate : '';
    const parsed = parseIsoDate(dueDate);
    const dueYear = entry && entry.dueYear ? entry.dueYear : (parsed ? parsed.year : year);
    const paymentEvents = amount > 0 ? [{
      id: `import_${entry && entry.id ? entry.id : year}`,
      paymentId: `import_${entry && entry.id ? entry.id : year}`,
      scheduleKey: entry && entry.scheduleKey ? entry.scheduleKey : '',
      paymentDate: dueDate,
      data: dueDate,
      cashYear: dueYear,
      amount,
      note: 'Importato da Fiscozen / prospetto storico',
      source: 'fiscozen_import'
    }] : [];
    const scadEngine = getScadenziarioEngine();
    if (scadEngine && typeof scadEngine.normalizeImportedFiscalEntry === 'function') {
      return scadEngine.normalizeImportedFiscalEntry(entry, {
        year,
        regimeType,
        now: new Date(),
        dueDate,
        dueYear,
        amount,
        paymentEvents
      });
    }
    const mapped = {
      id: entry && entry.id ? `imported_${entry.id}` : `imported_${year}_${Math.random().toString(36).slice(2, 8)}`,
      scheduleKey: entry && entry.scheduleKey ? entry.scheduleKey : '',
      competenceYear: entry && (entry.referenceYear || entry.competenceYear) ? (entry.referenceYear || entry.competenceYear) : year,
      cashYear: dueYear,
      dueDate: dueDate || `${dueYear}-01-01`,
      dueYear,
      title: entry && (entry.label || entry.description) ? (entry.label || entry.description) : 'Pagamento storico',
      competenceLabel: `Storico ${year}`,
      competence: `Storico ${year}`,
      kind: entry && entry.isContribution ? 'contributi' : (entry && entry.isTax ? 'tasse' : 'altro'),
      family: entry && entry.family ? entry.family : 'other',
      method: 'Importato',
      certainty: 'historical',
      amountDue: amount,
      amount,
      low: amount,
      high: amount,
      source: 'fiscozen_import',
      regimeType,
      isCrossYear: dueYear !== year,
      supportsPartialPayment: false,
      paymentMode: 'manual_only',
      paymentEvents,
      note: entry && entry.isAggregateBundle ? `F24 storico con ${entry.bundleCount || 0} sottovoci.` : '',
      warnings: [],
      due: { year: dueYear, label: dueDate ? formatPaymentDateDisplay(dueDate) : `Anno ${dueYear}`, date: parsed ? new Date(parsed.year, parsed.month - 1, parsed.day) : new Date(dueYear, 0, 1) },
      legacyRow: null
    };
    mapped.paymentStatus = scadEngine
      ? scadEngine.buildPaymentStatus(mapped, paymentEvents, { now: new Date() })
      : getScadenziarioFallbackStatus(mapped);
    return mapped;
  }

  function buildHistoricalRowsForScadenziario(year, regimeType) {
    const summary = buildHistoricalOrdinarySummaryForYear(year);
    return {
      ...summary,
      rows: (summary.entries || []).map(entry => mapHistoricalEntryToScadenziarioRow(entry, year, regimeType))
    };
  }

  function buildForfettarioRowsForScadenziario(year) {
    const schedule = buildForfettarioScheduleForYear(year);
    return {
      ...schedule,
      rows: (schedule.rows || []).map(rowItem => mapScheduleRowToScadenziario(rowItem, year))
    };
  }

  function buildTrailingSettlementRowsForScadenziario(settlementYear, sourceYear) {
    const sourceBundle = buildForfettarioRowsForScadenziario(sourceYear);
    const rows = (sourceBundle.rows || []).filter(row => {
      if (!row) return false;
      if (row.dueYear === settlementYear) return true;
      return (row.paymentEvents || []).some(event => event && event.cashYear === settlementYear);
    });
    return {
      ...sourceBundle,
      rows,
      credits: [],
      notes: [
        `Anno ${settlementYear}: qui mostro solo le scadenze della competenza ${sourceYear} che finiscono per essere pagate nel ${settlementYear}.`
      ],
      isTrailingSettlementOnly: true,
      sourceFiscalYear: sourceYear
    };
  }

  function buildScadenziarioYearMeta(year, options) {
    const opts = options || {};
    const yearData = getYearDataFor(year);
    const settings = yearData && yearData.settings ? yearData.settings : getDefaultSettings(year);
    const hasLocalYearData = !!yearData;
    const isTrailingSettlementYear = !!opts.isTrailingSettlementYear;
    const trailingSourceYear = Number.isFinite(opts.trailingSourceYear) ? opts.trailingSourceYear : null;
    const invoiceCount = getYearInvoiceCount(yearData);
    const realRevenue = ceil2(getTotalAnnuoForYear(year, { includeEstimates: false }));
    const estimatedRevenue = isClosedFiscalYear(year) ? 0 : ceil2(Math.max(0, getTotalAnnuoForYear(year, { includeEstimates: true }) - realRevenue));
    const importedEntries = getImportedFiscalEntriesForYear(year);
    const importedCompetenceEntries = getImportedCompetenceFiscalEntriesForYear(year);
    const importedFamilies = Array.from(new Set(importedEntries.map(entry => entry && entry.family).filter(Boolean)));
    const importedCompetenceFamilies = Array.from(new Set(importedCompetenceEntries.map(entry => entry && entry.family).filter(Boolean)));
    const overrideCount = getScadenziarioOverrideCount(yearData);
    const regimeGuess = getScadenziarioYearTypeFromSettings(settings);
    const regimeType = regimeGuess === 'vuoto' ? 'forfettario' : regimeGuess;
    const hasCompiledRevenueAnchor = invoiceCount > 0 || realRevenue > 0;
    const hasHistoricalAnchor = importedCompetenceEntries.length > 0;
    const shouldBuildAutoSchedule = regimeType === 'forfettario'
      && !isTrailingSettlementYear
      && hasCompiledRevenueAnchor;
    const bundle = isTrailingSettlementYear && trailingSourceYear !== null
      ? buildTrailingSettlementRowsForScadenziario(year, trailingSourceYear)
      : (regimeType === 'forfettario'
        ? (shouldBuildAutoSchedule
          ? buildForfettarioRowsForScadenziario(year)
          : { rows: [], notes: [], credits: [], isClosedYear: isClosedFiscalYear(year) })
        : buildHistoricalRowsForScadenziario(year, regimeType));
    const rows = bundle && Array.isArray(bundle.rows) ? bundle.rows : [];
    const scadEngine = getScadenziarioEngine();
    const totals = scadEngine
      ? scadEngine.computeScheduleTotals(rows)
      : rows.reduce((acc, row) => {
          const due = ceil2(row.amountDue || row.amount);
          const paid = row.paymentStatus ? ceil2(row.paymentStatus.amountPaid) : 0;
          const residual = row.paymentStatus ? ceil2(row.paymentStatus.residualAmount) : due;
          acc.amountDue = ceil2(acc.amountDue + due);
          acc.amountPaid = ceil2(acc.amountPaid + paid);
          acc.residualAmount = ceil2(acc.residualAmount + residual);
          return acc;
        }, { amountDue: 0, amountPaid: 0, residualAmount: 0, crossYearCount: 0 });
    const previousSettings = getYearDataFor(year - 1);
    const previousYearType = getScadenziarioYearTypeFromSettings(previousSettings && previousSettings.settings ? previousSettings.settings : null);
    const methodPolicy = scadEngine
      ? scadEngine.chooseMethodPolicy({
          isClosedYear: isClosedFiscalYear(year),
          previousYearType,
          previousYearComplete: previousYearType === 'forfettario' && !yearHasEstimates(year - 1)
        })
      : { recommendedMethod: 'previsionale', methodWarning: '', methodConfidence: 'normal' };
    const classification = scadEngine
      ? scadEngine.classifyFiscalYear({
          regime: settings && settings.regime ? settings.regime : '',
          hasEmployeeIncome: !!Number(settings && settings.haRedditoDipendente),
          importedFamilies: importedCompetenceFamilies,
          hasActivity: invoiceCount > 0 || realRevenue > 0,
          hasRows: rows.length > 0,
          hasPayments: rows.some(row => (row.paymentEvents || []).length > 0),
          hasOverrides: overrideCount > 0,
          hasImportedData: importedEntries.length > 0
        })
      : regimeType;
    const isRelevant = scadEngine
      ? scadEngine.isRelevantFiscalYear({
          hasRows: rows.length > 0,
          hasPayments: rows.some(row => (row.paymentEvents || []).length > 0),
          hasOverrides: overrideCount > 0,
          hasImportedData: importedEntries.length > 0,
          realRevenue,
          estimatedRevenue,
          amountDue: totals.amountDue,
          amountPaid: totals.amountPaid
        })
      : (rows.length > 0 || realRevenue > 0 || estimatedRevenue > 0 || overrideCount > 0);
    const hasFiscalAnchor = classification === 'forfettario'
      ? hasCompiledRevenueAnchor
      : (hasHistoricalAnchor || hasCompiledRevenueAnchor);

    return {
      year,
      yearData,
      settings,
      classification,
      regimeType: classification,
      bundle,
      rows,
      totals,
      realRevenue,
      estimatedRevenue,
      invoiceCount,
      importedEntries,
      importedCompetenceEntries,
      importedFamilies,
      overrideCount,
      isClosedYear: isClosedFiscalYear(year),
      isRelevant,
      hasFiscalAnchor,
      hasCompiledRevenueAnchor,
      hasHistoricalAnchor,
      isTrailingSettlementYear,
      trailingSourceYear,
      methodPolicy,
      currentMethod: settings && settings.scadenziarioMetodoAcconti === 'previsionale' ? 'previsionale' : 'storico',
      isSelectedYear: year === currentYear
    };
  }

  function collectRelevantFiscalYears(options) {
    const opts = options || {};
    const includeHistoricalYears = opts.includeHistoricalYears !== undefined ? !!opts.includeHistoricalYears : !!scadenziarioUiState.showHistoricalYears;
    const includeEmptyYears = opts.includeEmptyYears !== undefined ? !!opts.includeEmptyYears : !!scadenziarioUiState.showEmptyYears;
    const scadEngine = getScadenziarioEngine();
    const years = new Set([...getAllStoredYears(), ...getKnownExternalFiscalYears(), currentYear]);
    let metas = Array.from(years)
      .sort((a, b) => b - a)
      .map(year => buildScadenziarioYearMeta(year));
    const lastAnchorYear = scadEngine && typeof scadEngine.resolveTrailingSettlementSourceYear === 'function'
      ? scadEngine.resolveTrailingSettlementSourceYear(metas)
      : (metas
          .filter(meta => meta.classification === 'forfettario' && meta.hasCompiledRevenueAnchor)
          .map(meta => meta.year)
          .sort((a, b) => b - a)[0] || null);
    if (lastAnchorYear !== null) {
      const trailingSettlementYear = lastAnchorYear + 1;
      if (!years.has(trailingSettlementYear)) {
        metas.push(buildScadenziarioYearMeta(trailingSettlementYear, { isTrailingSettlementYear: true, trailingSourceYear: lastAnchorYear }));
      }
    }
    return metas
      .map(meta => {
        const trailingSettlementYear = lastAnchorYear !== null && meta.year === lastAnchorYear + 1;
        return trailingSettlementYear && !meta.isTrailingSettlementYear
          ? buildScadenziarioYearMeta(meta.year, { isTrailingSettlementYear: true, trailingSourceYear: lastAnchorYear })
          : meta;
      })
      .sort((a, b) => b.year - a.year)
      .filter(meta => {
        if (scadEngine && typeof scadEngine.shouldDisplayFiscalYear === 'function') {
          return scadEngine.shouldDisplayFiscalYear(meta, { includeHistoricalYears, includeEmptyYears });
        }
        if (includeEmptyYears) return true;
        if (meta.isTrailingSettlementYear) return (meta.rows || []).length > 0;
        if (meta.classification === 'forfettario') return meta.hasCompiledRevenueAnchor;
        if (includeHistoricalYears) return meta.hasHistoricalAnchor || meta.hasCompiledRevenueAnchor;
        return false;
      });
  }

  function getScadenziarioTimingChip(row) {
    if (row && row.legacyRow && row.legacyRow.status) {
      return row.legacyRow.status;
    }
    return { cls: 'info', label: row && row.source === 'fiscozen_import' ? 'Storico' : 'Competenza' };
  }

  function getScadenziarioExplanation(row) {
    const engine = getTaxEngine();
    if (engine && row && row.legacyRow) return engine.buildInstallmentExplanation(row.legacyRow);
    if (row && row.note) return row.note;
    if (row && row.source === 'fiscozen_import') return 'Voce importata da Fiscozen o dal prospetto storico.';
    return '';
  }

  function renderScadenziarioPaymentEvents(row, extraActions) {
    if (!row) return '';
    const dueIso = row.dueDate || '';
    if (row.source !== 'calculated' || !row.scheduleKey) {
      if (!row.paymentEvents || row.paymentEvents.length === 0) return `<div class="scad-sub">Nessun versamento registrato.</div>${extraActions ? `<div class="scad-row-actions">${extraActions}</div>` : ''}`;
      return `<div class="scad-payment-history">${row.paymentEvents.map(event => `
        <div class="scad-payment-tag">
          <span>${event.paymentDate ? formatPaymentDateDisplay(event.paymentDate) : 'Storico'}</span>
          <b>${fmt(event.amount)}</b>
        </div>`).join('')}</div>${extraActions ? `<div class="scad-row-actions">${extraActions}</div>` : ''}`;
    }

    const residual = row.paymentStatus ? Math.max(0, row.paymentStatus.residualAmount) : row.amountDue;
    let h = `<div class="scad-row-actions">
      <button class="scad-pay-btn" onclick="addPagamentoFromSchedule('${row.scheduleKey.replace(/'/g, "\\'")}','${dueIso}','${row.kind}','${row.title.replace(/'/g, "\\'")}','${row.competenceLabel.replace(/'/g, "\\'")}',${residual || row.amountDue})">
        ${(row.paymentEvents || []).length > 0 ? 'Aggiungi quota' : 'Segna pagato'}
      </button>
      ${row.paymentEvents && row.paymentEvents.length > 0 ? `<button class="scad-link-btn" onclick="reopenPaidScheduleItem('${row.scheduleKey.replace(/'/g, "\\'")}')">Annulla tutto</button>` : ''}
      ${extraActions || ''}
    </div>`;

    if (row.paymentEvents && row.paymentEvents.length > 0) {
      h += `<div class="scad-payment-events">`;
      for (const event of row.paymentEvents) {
        h += `<div class="scad-payment-event">
          <button type="button" class="payment-date-btn compact" onclick="openPaymentDatePicker(${event.anno}, ${event._idx}, event)">
            <span class="payment-date-main">${formatPaymentDateDisplay(event.paymentDate)}</span>
            <span class="payment-date-meta">Cassa ${event.cashYear}</span>
          </button>
          <input type="number" value="${event.amount || ''}" step="0.01" onchange="setPagamentoImporto(${event.anno}, ${event._idx}, this.value)">
          <button class="btn-del" title="Elimina pagamento" aria-label="Elimina pagamento" onclick="removePagamento(${event.anno}, ${event._idx})">&times;</button>
        </div>`;
      }
      h += `</div>`;
    }
    return h;
  }

  function renderScadenziarioRowsTable(rows, options) {
    const opts = options || {};
    if (!rows || rows.length === 0) {
      return `<div class="scad-empty">${opts.emptyLabel || 'Nessuna voce in questa sezione.'}</div>`;
    }
    const scadEngine = getScadenziarioEngine();
    const totals = scadEngine ? scadEngine.computeScheduleTotals(rows) : { amountDue: 0, amountPaid: 0, residualAmount: 0 };
    let h = `<table class="scad-table scad-year-table"><thead><tr>
      <th style="text-align:left">Data</th>
      <th style="text-align:left">Voce</th>
      <th>Importo</th>
      <th>Versamenti</th>
    </tr></thead><tbody>`;
    for (const row of rows) {
      const timing = getScadenziarioTimingChip(row);
      const explanation = getScadenziarioExplanation(row);
      const rangeHtml = row.low !== row.high ? `<div class="scad-range">(${fmt(row.low)} - ${fmt(row.high)})</div>` : '';
      const crossYearMeta = row.paymentStatus && row.paymentStatus.isCrossYear
        ? `<div class="scad-sub">Competenza ${row.competenceYear}, cassa ${row.paymentEvents.map(event => event.cashYear).filter(Boolean).join(', ')}</div>`
        : '';
      const f24Key = row && row.source === 'calculated' ? getF24GuideKey(row) : null;
      const f24SafeId = 'f24guide_' + String(row && (row.scheduleKey || row.id || '')).replace(/[^a-zA-Z0-9_]/g, '_');
      const f24GuideHtml = f24Key ? renderF24Guide(f24Key, row) : '';
      const f24Button = f24Key ? `<button class="f24-btn" onclick="toggleF24Guide('${String(row.scheduleKey || row.id || '').replace(/'/g, "\\'")}')">F24?</button>` : '';
      h += `<tr>
        <td data-label="Data">${row.due && row.due.label ? row.due.label : (row.dueDate ? formatPaymentDateDisplay(row.dueDate) : `Anno ${row.dueYear}`)}</td>
        <td data-label="Voce">
          <div class="scad-main">${row.title}</div>
          <div class="scad-voce-chips">
            <span class="scad-chip ${row.paymentStatus.tone}">${row.paymentStatus.label}</span>
            <span class="scad-chip ${timing.cls}">${timing.label}</span>
          </div>
          <div class="scad-sub">${row.competenceLabel || row.competence || `Competenza ${row.competenceYear}`}</div>
          ${explanation ? `<div class="scad-sub">${explanation}</div>` : ''}
          ${crossYearMeta}
          ${row.hint ? `<div style="font-size:.72rem;color:var(--color-warning);margin-top:4px">⚠ ${escapeHtml(row.hint)}</div>` : ''}
        </td>
        <td data-label="Importo">
          <div>${fmt(row.amountDue)}</div>
          ${rangeHtml}
        </td>
        <td data-label="Versamenti">${renderScadenziarioPaymentEvents(row, f24Button)}</td>
      </tr>`;
      if (f24GuideHtml) {
        h += `<tr class="f24-guide-row" id="${f24SafeId}" style="display:none"><td colspan="4">${f24GuideHtml}</td></tr>`;
      }
    }
    h += `</tbody><tfoot><tr>
      <td data-label="Data">Totale</td>
      <td data-label="Voce">${opts.totalLabel || 'Totale sezione'}${totals.residualAmount > 0 ? '' : ' <span class="scad-chip ok">In pari</span>'}</td>
      <td data-label="Importo">${fmt(totals.amountDue)}</td>
      <td data-label="Versamenti">${totals.amountPaid > 0 ? fmt(totals.amountPaid) : ''}${totals.residualAmount > 0 ? ` <span class="scad-sub">Residuo ${fmt(totals.residualAmount)}</span>` : ''}</td>
    </tr></tfoot></table>`;
    return h;
  }

  function renderScadenziarioMethodBox(meta) {
    if (!meta || meta.classification !== 'forfettario') return '';
    if (meta.isTrailingSettlementYear) {
      return `<div class="scad-method-box">
        <div class="scad-note">Anno ${meta.year}: qui mostro solo le code della competenza ${meta.trailingSourceYear}. Non genero un nuovo prospetto fiscale completo del ${meta.year}.</div>
      </div>`;
    }
    const schedule = meta.bundle || {};
    const showPriorYearManualInputs = !schedule.prevApplied || schedule.transitionFromNonForfettario || schedule.firstYearManualUsed;
    const prevYearLabel = meta.year - 1;
    const manualTitle = schedule.transitionFromNonForfettario
      ? `Dati manuali ${prevYearLabel} (anno ordinario o misto)`
      : `Dati anno precedente ${prevYearLabel}`;
    const manualIntro = schedule.transitionFromNonForfettario
      ? `Usa questi campi per riportare manualmente il carico fiscale/previdenziale del ${prevYearLabel} che vuoi far valere nel primo anno forfettario. Per il tuo caso 2024, inserisci qui imposte/acconti e contributi da trascinare nel 2025.`
      : `Compila questi campi solo se non hai lo storico dell'anno precedente salvato nell'app.`;
    const recommended = meta.methodPolicy && meta.methodPolicy.recommendedMethod ? meta.methodPolicy.recommendedMethod : 'previsionale';
    const warning = meta.methodPolicy && meta.methodPolicy.methodWarning ? meta.methodPolicy.methodWarning : '';
    const recommendedLabel = recommended === 'storico' ? 'Storico' : 'Previsionale';
    let h = `<div class="scad-method-box">
      <div class="scad-method-head">
        <div>
          <div class="scad-method-title">Metodo acconti</div>
          <div class="scad-method-sub">Storico = usa il dovuto dell anno precedente. Previsionale = usa una base stimata dell anno corrente.</div>
        </div>
        <span class="scad-chip ${recommended === meta.currentMethod ? 'ok' : 'warn'}">${meta.isClosedYear ? 'Consuntivo' : `Consigliato: ${recommendedLabel}`}</span>
      </div>`;
    if (meta.isClosedYear) {
      h += `<div class="scad-note">Anno chiuso: qui mostro un consuntivo di competenza. Storico e previsionale servono solo per stimare anni ancora aperti.</div>`;
    } else {
      h += `<div class="scad-method-controls">
        <select onchange="saveYearTextSetting(${meta.year}, 'scadenziarioMetodoAcconti', this.value); recalcAll()">
          <option value="storico" ${meta.currentMethod === 'storico' ? 'selected' : ''}>Storico</option>
          <option value="previsionale" ${meta.currentMethod === 'previsionale' ? 'selected' : ''}>Previsionale</option>
        </select>
        <div class="scad-method-inline">
          <span>Primo anno forfettario dopo ordinario o anno misto? Meglio leggere lo storico come prudenziale, non come base pulita.</span>
        </div>
      </div>`;
    }
    if (warning) h += `<div class="scad-note">${warning}</div>`;
    if (schedule.transitionFromNonForfettario) {
      h += `<div class="scad-note">Il ${meta.year - 1} non era forfettario puro: il metodo storico resta disponibile, ma puo sovrastimare gli acconti del ${meta.year}.</div>`;
    }
    if (!meta.isClosedYear && meta.currentMethod === 'previsionale') {
      h += `<div class="scad-method-inputs">
        <div class="settings-group">
          <label>Base previsionale imposta sostitutiva</label>
          <input type="number" step="0.01" value="${meta.settings.scadenziarioPrevisionaleImposta}" placeholder="${fmt(schedule.currentApplied ? schedule.currentApplied.tasse : 0)}" onchange="saveYearOptionalNumberSetting(${meta.year}, 'scadenziarioPrevisionaleImposta', this.value); recalcAll()">
        </div>
        <div class="settings-group">
          <label>Base previsionale contributi</label>
          <input type="number" step="0.01" value="${meta.settings.scadenziarioPrevisionaleContributi}" placeholder="${fmt(schedule.forecastContributi ? schedule.forecastContributi.amount : 0)}" onchange="saveYearOptionalNumberSetting(${meta.year}, 'scadenziarioPrevisionaleContributi', this.value); recalcAll()">
        </div>
      </div>`;
    }
    if (showPriorYearManualInputs) {
      h += `<details class="scad-collapsible scad-method-manual">
        <summary><span>${manualTitle}</span><span class="scad-collapsible-meta">${schedule.firstYearManualUsed ? 'Attivo' : 'Manuale'}</span></summary>
        <div class="scad-collapsible-body">
          <div class="scad-note">${manualIntro}</div>
          <div class="scad-method-inputs">
            <div class="settings-group">
              <label>${schedule.transitionFromNonForfettario ? `Totale imposte ${prevYearLabel} da usare come base` : `Imposta totale ${prevYearLabel}`}</label>
              <input type="number" step="0.01" value="${meta.settings.primoAnnoImpostaPrec}" placeholder="0,00"
                onchange="saveYearOptionalNumberSetting(${meta.year}, 'primoAnnoImpostaPrec', this.value); recalcAll()">
            </div>
            <div class="settings-group">
              <label>Acconti imposte gia versati per il ${prevYearLabel}</label>
              <input type="number" step="0.01" value="${meta.settings.primoAnnoAccontiImpostaPrec}" placeholder="0,00"
                onchange="saveYearOptionalNumberSetting(${meta.year}, 'primoAnnoAccontiImpostaPrec', this.value); recalcAll()">
            </div>
            <div class="settings-group">
              <label>${schedule.transitionFromNonForfettario ? `Contributi variabili ${prevYearLabel}` : `Contributi variabili ${prevYearLabel}`}</label>
              <input type="number" step="0.01" value="${meta.settings.primoAnnoContribVariabiliPrec}" placeholder="0,00"
                onchange="saveYearOptionalNumberSetting(${meta.year}, 'primoAnnoContribVariabiliPrec', this.value); recalcAll()">
            </div>
            <div class="settings-group">
              <label>Acconti contributi gia versati per il ${prevYearLabel}</label>
              <input type="number" step="0.01" value="${meta.settings.primoAnnoAccontiContribPrec}" placeholder="0,00"
                onchange="saveYearOptionalNumberSetting(${meta.year}, 'primoAnnoAccontiContribPrec', this.value); recalcAll()">
            </div>
          </div>
        </div>
      </details>`;
    }
    h += `</div>`;
    return h;
  }

  function renderScadenziarioNotes(meta) {
    const notes = [];
    if (meta.classification === 'ordinario') {
      notes.push('Anno ordinario: mostrato solo come storico di supporto e non usato per generare scadenze automatiche forfettarie.');
    }
    if (meta.classification === 'misto') {
      notes.push('Anno misto: utile per leggere la liquidita storica, ma non affidabile come base automatica per acconti forfettari.');
    }
    if (meta.isTrailingSettlementYear && !meta.hasFiscalAnchor) {
      notes.push(`Anno ${meta.year} mostrato come coda di pagamento della competenza ${meta.trailingSourceYear}: qui non genero il fiscale del ${meta.year}, ma solo le scadenze del ${meta.trailingSourceYear} che cadono nel ${meta.year}.`);
    }
    if (meta.overrideCount > 0) {
      notes.push(`Sono presenti ${meta.overrideCount} override manuali per questo anno.`);
    }
    if (meta.bundle && Array.isArray(meta.bundle.notes)) {
      notes.push(...meta.bundle.notes);
    }
    const unique = Array.from(new Set(notes.filter(Boolean)));
    if (unique.length === 0) return '';
    return `<div class="scad-note-list">${unique.map(note => `<div class="scad-note">${note}</div>`).join('')}</div>`;
  }

  function renderScadenziarioYearCard(meta) {
    const scadEngine = getScadenziarioEngine();
    const split = scadEngine ? scadEngine.splitRowsByPaymentState(meta.rows) : {
      open: meta.rows.filter(row => !(row.paymentStatus && row.paymentStatus.isArchived)),
      archived: meta.rows.filter(row => row.paymentStatus && row.paymentStatus.isArchived),
      credits: []
    };
    const badgeTone = meta.classification === 'forfettario' ? 'ok' : (meta.classification === 'misto' ? 'warn' : 'info');
    const isFullyPaid = split.open.length === 0 && split.archived.length > 0;
    const residuo = meta.totals.residualAmount || 0;
    const residuoChip = isFullyPaid
      ? '<span class="scad-chip ok">Tutto pagato</span>'
      : (residuo > 0
        ? `<span class="scad-chip warn">Residuo ${fmt(residuo)}</span>`
        : `<span class="scad-chip info">Dovuto ${fmt(meta.totals.amountDue || 0)}</span>`);
    const yearOpen = scadenziarioUiState.openYears && scadenziarioUiState.openYears.has(meta.year);
    const archivedOpen = scadenziarioUiState.openArchived && scadenziarioUiState.openArchived.has(meta.year);
    let h = `<section class="panel scad-year-card ${meta.isSelectedYear ? 'is-current' : ''}">
      <details class="scad-year-collapse" data-year="${meta.year}"${yearOpen ? ' open' : ''} ontoggle="onScadenziarioYearToggle(this)">
        <summary class="scad-year-header" style="cursor:pointer;list-style:none">
          <div class="scad-year-header-main">
            <div class="scad-year-title">Anno ${meta.year}</div>
            <span class="scad-chip ${badgeTone}">${meta.classification === 'forfettario' ? 'Forfettario' : (meta.classification === 'misto' ? 'Misto' : 'Ordinario')}</span>
            ${meta.isSelectedYear ? '<span class="scad-chip info">Selezionato</span>' : ''}
            ${meta.totals.crossYearCount > 0 ? `<span class="scad-chip warn">${meta.totals.crossYearCount} cross-year</span>` : ''}
          </div>
          <div class="scad-year-badges">
            ${residuoChip}
          </div>
        </summary>
        <div class="scad-year-stats">
          <div class="scad-stat"><span>Dovuto</span><b>${fmt(meta.totals.amountDue)}</b></div>
          <div class="scad-stat"><span>Pagato</span><b>${fmt(meta.totals.amountPaid)}</b></div>
          <div class="scad-stat"><span>Residuo</span><b>${fmt(meta.totals.residualAmount)}</b></div>
          <div class="scad-stat"><span>${meta.isTrailingSettlementYear ? 'Competenza origine' : 'Ricavi anno'}</span><b>${meta.isTrailingSettlementYear ? meta.trailingSourceYear : fmt(meta.realRevenue)}</b></div>
        </div>
        ${renderScadenziarioMethodBox(meta)}
        <div class="scad-section">
          <div class="scad-section-head"><h3>Da pagare</h3><span>${split.open.length} voci</span></div>
          ${renderScadenziarioRowsTable(split.open, { totalLabel: `Aperte ${meta.year}`, emptyLabel: 'Nessuna voce aperta per questo anno.' })}
        </div>
        <div class="scad-section">
          <details class="scad-collapsible" data-archived-year="${meta.year}"${archivedOpen ? ' open' : ''} ontoggle="onScadenziarioArchivedToggle(this)">
            <summary><span>Pagate / archiviate</span><span class="scad-collapsible-meta">${split.archived.length} voci</span></summary>
            <div class="scad-collapsible-body">
              ${renderScadenziarioRowsTable(split.archived, { totalLabel: `Pagate ${meta.year}`, emptyLabel: 'Nessuna voce completamente chiusa.' })}
            </div>
          </details>
        </div>`;
    if (meta.bundle && Array.isArray(meta.bundle.credits) && meta.bundle.credits.length > 0) {
      h += `<div class="scad-section">
        <details class="scad-collapsible" open>
          <summary><span>Crediti / eccedenze</span><span class="scad-collapsible-meta">${meta.bundle.credits.length} voci</span></summary>
          <div class="scad-collapsible-body">
            <div class="scad-credit-list">${meta.bundle.credits.map(credit => `<div class="scad-credit-item">
              <div><b>${credit.title}</b><div class="scad-sub">${credit.competence}</div></div>
              <div class="scad-credit-value">${fmt(credit.amount)}</div>
            </div>`).join('')}</div>
          </div>
        </details>
      </div>`;
    }
    const notesHtml = renderScadenziarioNotes(meta);
    if (notesHtml) {
      h += `<div class="scad-section">
        <details class="scad-collapsible" open>
          <summary><span>Note e warning</span><span class="scad-collapsible-meta">${meta.classification}</span></summary>
          <div class="scad-collapsible-body">${notesHtml}</div>
        </details>
      </div>`;
    }
    h += `</details></section>`;
    return h;
  }

  function renderScadenziarioToolbar(displayedMetas, allMetas) {
    const totalCount = allMetas.length;
    const historicalCount = allMetas.filter(meta => meta.classification !== 'forfettario').length;
    return `<div class="panel scad-toolbar-panel" style="grid-column:1/-1">
      <div class="scad-toolbar">
        <div class="scad-toolbar-main">
          <div class="scad-toolbar-title">Scadenziario multi-anno</div>
          <div class="scad-toolbar-sub">Vista principale per competenza fiscale, con vista cassa separata per leggere la liquidita reale.</div>
        </div>
        <div class="scad-toolbar-actions">
          <div class="scad-view-switch">
            <button class="${scadenziarioUiState.view === 'competence' ? 'active' : ''}" onclick="setScadenziarioView('competence')">Vista competenza</button>
            <button class="${scadenziarioUiState.view === 'cash' ? 'active' : ''}" onclick="setScadenziarioView('cash')">Vista cassa</button>
          </div>
          <button class="scad-filter-btn ${scadenziarioUiState.showHistoricalYears ? 'active' : ''}" onclick="toggleScadenziarioHistoricalYears()">
            ${scadenziarioUiState.showHistoricalYears ? 'Nascondi anni ordinari e misti' : 'Mostra anni ordinari e misti'}
          </button>
          <button class="scad-filter-btn" onclick="exportScadenzeIcs(${currentYear})" title="Scarica le scadenze dell'anno corrente come file .ics da importare in Google Calendar">
            📅 Esporta .ics
          </button>
        </div>
      </div>
      <div class="scad-inline-meta">
        <span>Anni visibili: <b>${displayedMetas.length}</b> / ${totalCount}</span>
        ${historicalCount > 0 ? `<span>Anni ordinari o misti disponibili: <b>${historicalCount}</b></span>` : ''}
        <span>Anno selezionato: <b>${currentYear}</b></span>
      </div>
    </div>`;
  }

  function collectCashViewGroups(metas) {
    const scadEngine = getScadenziarioEngine();
    const groups = {};
    for (const meta of metas) {
      const grouped = scadEngine && typeof scadEngine.groupRowsByCashYear === 'function'
        ? scadEngine.groupRowsByCashYear(meta.rows)
        : {};
      for (const [cashYear, entries] of Object.entries(grouped)) {
        if (!groups[cashYear]) groups[cashYear] = [];
        for (const entry of entries) {
          groups[cashYear].push({
            row: entry.row,
            paymentEvent: entry.paymentEvent,
            paymentIndex: entry.paymentIndex,
            paymentId: entry.paymentId,
            paymentDate: entry.paymentDate,
            cashYear: entry.cashYear,
            amount: entry.amount,
            note: entry.note,
            statusCode: entry.statusCode,
            regimeType: meta.classification
          });
        }
      }
    }
    return groups;
  }

  function renderScadenziarioCashView(metas) {
    const cashGroups = collectCashViewGroups(metas);
    const cashYears = Object.keys(cashGroups).map(year => parseInt(year, 10)).filter(Number.isFinite).sort((a, b) => b - a);
    if (cashYears.length === 0) {
      return `<div class="panel" style="grid-column:1/-1"><h3>Vista cassa</h3><div class="scad-empty">Nessun pagamento registrato da mostrare nella vista cassa.</div></div>`;
    }

    let h = '';
    for (const cashYear of cashYears) {
      const rows = cashGroups[cashYear].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '') || ((a.row && a.row.competenceYear) || 0) - ((b.row && b.row.competenceYear) || 0));
      const total = rows.reduce((sum, row) => sum + ceil2(row.amount), 0);
      h += `<section class="panel scad-year-card">
        <div class="scad-year-header">
          <div>
            <div class="scad-year-title">Cassa ${cashYear}</div>
            <div class="scad-year-sub">Pagamenti effettivamente usciti in questo anno, anche se di competenza fiscale diversa.</div>
          </div>
          <div class="scad-year-badges"><span class="scad-chip info">${fmt(total)}</span></div>
        </div>
        <table class="scad-table scad-year-table"><thead><tr>
          <th style="text-align:left">Data pagamento</th>
          <th style="text-align:left">Voce</th>
          <th>Competenza</th>
          <th>Importo</th>
        <th>Origine</th>
        </tr></thead><tbody>`;
      for (const row of rows) {
        const model = row.row || {};
        const paymentDate = row.paymentDate || (row.paymentEvent && (row.paymentEvent.paymentDate || row.paymentEvent.data)) || '';
        h += `<tr>
          <td data-label="Data pagamento">${paymentDate ? formatPaymentDateDisplay(paymentDate) : `Anno ${cashYear}`}</td>
          <td data-label="Voce">
            <div class="scad-main">${model.title}</div>
            <div class="scad-sub">Competenza ${model.competenceYear}${model.competenceYear !== cashYear ? `, pagata nel ${cashYear}` : ''}</div>
          </td>
          <td data-label="Competenza">${model.competenceYear}</td>
          <td data-label="Importo">${fmt(row.amount)}</td>
          <td data-label="Origine"><span class="scad-chip ${row.regimeType === 'forfettario' ? 'ok' : 'info'}">${row.regimeType}</span></td>
        </tr>`;
      }
      h += `</tbody></table></section>`;
    }
    return h;
  }

  function onScadenziarioYearToggle(el) {
    if (!el) return;
    const year = parseInt(el.getAttribute('data-year'), 10);
    if (!Number.isFinite(year)) return;
    if (!scadenziarioUiState.openYears) scadenziarioUiState.openYears = new Set();
    if (el.open) scadenziarioUiState.openYears.add(year);
    else scadenziarioUiState.openYears.delete(year);
  }
  function onScadenziarioArchivedToggle(el) {
    if (!el) return;
    const year = parseInt(el.getAttribute('data-archived-year'), 10);
    if (!Number.isFinite(year)) return;
    if (!scadenziarioUiState.openArchived) scadenziarioUiState.openArchived = new Set();
    if (el.open) scadenziarioUiState.openArchived.add(year);
    else scadenziarioUiState.openArchived.delete(year);
  }

  function exportScadenzeIcs(year) {
    var y = year || currentYear;
    if (!window.CalendarExport || typeof buildForfettarioScheduleForYear !== 'function') {
      alert('Export ICS non disponibile.');
      return;
    }
    var schedule = buildForfettarioScheduleForYear(y) || {};
    var rows = schedule.rows || [];
    var ics = window.CalendarExport.buildIcsForYear(y, currentProfile, rows);
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'scadenze-fiscali-' + currentProfile + '-' + y + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    try {
      localStorage.setItem(window.StorageKeys.icsExported(currentProfile, y), String(Date.now()));
    } catch (e) { /* ignore quota errors */ }
    if (typeof renderRiepilogo === 'function') renderRiepilogo();
  }

  function isIcsDownloaded(profile, year) {
    try {
      return !!localStorage.getItem(window.StorageKeys.icsExported(profile, year));
    } catch (e) { return false; }
  }

  function buildIcsBannerHtml() {
    var now = new Date();
    if (now.getMonth() !== 0) return '';
    if (currentYear !== now.getFullYear()) return '';
    if (!currentProfile) return '';
    if (isIcsDownloaded(currentProfile, currentYear)) return '';
    return '' +
      '<div class="ics-banner" role="alert" id="ics-banner-root">' +
        '<span class="icon">📅</span>' +
        '<span class="msg"><strong>Nuovo anno ' + currentYear + ':</strong> scarica le scadenze fiscali per Google Calendar.</span>' +
        '<span class="actions">' +
          '<button class="primary" type="button" onclick="exportScadenzeIcs(' + currentYear + ')">Scarica .ics</button>' +
        '</span>' +
      '</div>';
  }

  // F4: banner promemoria cross-year a dicembre.
  // Visibile solo in dicembre dell'anno corrente: ricorda che le fatture
  // emesse a dicembre ma incassate a gennaio entrano nei ricavi del nuovo
  // anno (criterio di cassa, art. 1 c. 64 L. 190/2014).
  // Conta le fatture 'inviata' emesse nel mese corrente per dare un numero
  // concreto, oppure fa un avviso generico se zero.
  function buildCrossYearReminderBannerHtml() {
    var now = new Date();
    if (now.getMonth() !== 11) return ''; // solo dicembre
    if (currentYear !== now.getFullYear()) return '';
    if (!currentProfile) return '';
    if (S().regime !== 'forfettario') return ''; // solo per forfettario (criterio cassa)
    // dismiss flag: una volta dismissed nel mese corrente, non riappare
    var flagKey = window.StorageKeys.crossYearReminderDismissed(currentProfile, currentYear);
    try { if (localStorage.getItem(flagKey) === '1') return ''; } catch (_e) { /* best-effort */ }
    // Conta fatture 'inviata' (emesse ma non ancora pagate)
    var nInviate = 0;
    try {
      if (window.FattureSelectors && typeof window.FattureSelectors.all === 'function') {
        var all = window.FattureSelectors.all(currentProfile) || [];
        nInviate = all.filter(function (f) {
          return (f.stato || 'bozza') === 'inviata'
            && Number(f.annoProgressivo) === currentYear;
        }).length;
      }
    } catch (_e) { /* best-effort */ }
    var msgCore = nInviate > 0
      ? 'Hai <strong>' + nInviate + ' fattur' + (nInviate === 1 ? 'a' : 'e') + ' ancora da incassare</strong>. Se vengono pagate da gennaio in poi, l\'incasso entra nei ricavi del ' + (currentYear + 1) + ' (criterio di cassa).'
      : 'Le fatture pagate da gennaio in poi entrano nei ricavi del ' + (currentYear + 1) + ', anche se emesse a dicembre (criterio di cassa).';
    return '' +
      '<div class="ics-banner cross-year-banner" role="status" id="cross-year-banner-root" style="background:rgba(245,166,35,.10);border-color:#f5a623;color:#b67400">' +
        '<span class="icon">⏳</span>' +
        '<span class="msg"><strong>Fine anno ' + currentYear + ':</strong> ' + msgCore + ' Promemoria art. 1 c. 64 L. 190/2014.</span>' +
        '<span class="actions">' +
          '<button class="primary" type="button" onclick="window.dismissCrossYearReminder && window.dismissCrossYearReminder()">Ho capito</button>' +
        '</span>' +
      '</div>';
  }

  function dismissCrossYearReminder() {
    if (!currentProfile || !currentYear) return;
    try {
      localStorage.setItem(window.StorageKeys.crossYearReminderDismissed(currentProfile, currentYear), '1');
    } catch (_e) { /* best-effort */ }
    var el = document.getElementById('cross-year-banner-root');
    if (el) el.remove();
  }
  if (typeof window !== 'undefined') {
    window.dismissCrossYearReminder = dismissCrossYearReminder;
    window.buildCrossYearReminderBannerHtml = buildCrossYearReminderBannerHtml;
  }

  function renderScadenziario() {
    const el = document.getElementById('scadenziarioGrid');
    if (!el) return;
    if (!scadenziarioUiState.openYears) scadenziarioUiState.openYears = new Set();
    if (!scadenziarioUiState.openArchived) scadenziarioUiState.openArchived = new Set();
    // First render: default-open the currently selected year so the user isn't greeted by fully-collapsed cards
    if (!scadenziarioUiState._initialized) {
      scadenziarioUiState.openYears.add(currentYear);
      scadenziarioUiState._initialized = true;
    }
    const allMetas = collectRelevantFiscalYears({
      includeHistoricalYears: true,
      includeEmptyYears: scadenziarioUiState.showEmptyYears
    });
    const displayedMetas = collectRelevantFiscalYears({
      includeHistoricalYears: scadenziarioUiState.showHistoricalYears,
      includeEmptyYears: scadenziarioUiState.showEmptyYears
    });

    let nextHtml = renderScadenziarioToolbar(displayedMetas, allMetas);
    if (displayedMetas.length === 0) {
      nextHtml += `<div class="panel" style="grid-column:1/-1"><h3>Scadenziario</h3><div class="scad-empty">Nessun anno fiscalmente rilevante da mostrare con i filtri attuali.</div></div>`;
      el.innerHTML = nextHtml;
      return;
    }

    if (scadenziarioUiState.view === 'cash') {
      nextHtml += renderScadenziarioCashView(displayedMetas);
    } else {
      nextHtml += displayedMetas.map(meta => renderScadenziarioYearCard(meta)).join('');
    }
    nextHtml += `<div class="scad-pagamenti-wrap" style="grid-column:1/-1">${buildPagamentiSection({ embedded: true, compact: true })}</div>`;
    el.innerHTML = nextHtml;
  }


  let pickerMonth = 0, pickerDay = 0;

  function openPicker(m, d, evt) {
    evt.stopPropagation();
    pickerMonth = m; pickerDay = d;
    const popup = document.getElementById('pickerPopup');
    const overlay = document.getElementById('pickerOverlay');
    const rect = evt.target.getBoundingClientRect();
    if (window.innerWidth <= 768) {
      popup.style.left = '50%'; popup.style.top = '50%';
      popup.style.transform = 'translate(-50%, -50%)';
    } else {
      popup.style.transform = '';
      let left = rect.right + 6, top = rect.top;
      if (left + 170 > window.innerWidth) left = rect.left - 170;
      if (top + 300 > window.innerHeight) top = window.innerHeight - 310;
      popup.style.left = left + 'px'; popup.style.top = top + 'px';
    }
    const current = getActivity(m, d);
    let html = '';
    for (const [code, info] of Object.entries(ACTIVITY_INFO)) {
      if (code === '') continue;
      const sel = code === current ? ' style="background:rgba(255,255,255,.15)"' : '';
      html += `<button${sel} onclick="pickActivity('${code}')">
        <span class="pk-dot" style="background:${info.color}"></span>${info.label}</button>`;
    }
    popup.innerHTML = html;
    popup.style.display = 'block'; overlay.style.display = 'block';
  }
  function closePicker() {
    document.getElementById('pickerPopup').style.display = 'none';
    document.getElementById('pickerOverlay').style.display = 'none';
  }
  function pickActivity(code) { setActivity(pickerMonth, pickerDay, code); closePicker(); }

  function renderCalendar() {
    const el = document.getElementById('calendarGrid');
    const today = new Date();
    let h = '';
    h += `<div class="cal-legend" style="grid-column:1/-1"><span style="font-weight:600;margin-right:6px">Legenda:</span>`;
    for (const [code, info] of Object.entries(ACTIVITY_INFO)) {
      if (code === '') continue;
      h += `<div class="cal-legend-item"><div class="cal-legend-dot" style="background:${info.color};color:${info.dark?'var(--text2)':'#000'}">&nbsp;</div><span>${info.label}</span></div>`;
    }
    h += `<span style="margin-left:auto;color:var(--text2);font-size:.78rem">Clicca un giorno per cambiare</span></div>`;

    h += `<div class="daily-rate-inline" style="grid-column:1/-1">
      <label>Paga giornaliera ${currentYear}:</label>
      <input type="number" value="${S().dailyRate}" step="1"
        onchange="saveSetting('dailyRate',this.value);saveData();recalcAll()">
      <span style="color:var(--text2);font-size:.8rem">EUR/giorno</span></div>`;

    for (let m = 1; m <= 12; m++) {
      const dim = daysInMonth(currentYear, m), stats = getMonthStats(m);
      const euro = getMonthEuroRaw(m), ff = isMonthFromFattura(m);
      const fattureM = getFatture(m);
      const offset = (new Date(currentYear, m-1, 1).getDay() + 6) % 7;
      const nFattAtt = fattureM.filter(f => f.importo > 0).length;
      const nDiff = fattureM.filter(f => f.importo > 0 && f.pagAnno && f.pagAnno !== currentYear).length;
      let fattTag = '';
      if (ff) {
        const color = nDiff === nFattAtt ? 'var(--yellow)' : 'var(--green)';
        fattTag = ` <span style="font-size:.65rem;color:${color}">(${nFattAtt > 1 ? nFattAtt + ' fatt.' : 'fatt.'}${nDiff > 0 ? ' ' + nDiff + ' diff.' : ''})</span>`;
      } else if (!isEstimatePayableInYear(m)) {
        fattTag = ` <span style="font-size:.6rem;color:var(--text2)">(oltre ${S().giorniIncasso}gg)</span>`;
      }
      h += `<div class="month-card"><div class="month-header">${MONTHS[m-1]}
        <span class="month-total">${fmt(euro)}${fattTag}</span></div>`;
      h += `<div class="cal-weekdays">${['L','M','M','G','V','S','D'].map(w=>`<span>${w}</span>`).join('')}</div>`;
      h += `<div class="cal-days">`;
      for (let i = 0; i < offset; i++) h += `<div class="cal-day empty"></div>`;
      for (let d = 1; d <= dim; d++) {
        const act = getActivity(m, d);
        const isT = new Date(currentYear, m-1, d).toDateString() === today.toDateString();
        h += `<div class="cal-day act-${act}${isT?' today':''}" onclick="openPicker(${m},${d},event)"
          title="${d} ${MONTHS[m-1]} - ${ACTIVITY_INFO[act]?.label||'—'}">${d}</div>`;
      }
      h += `</div><div class="month-summary">`;
      h += `<span><span class="badge badge-8">${stats.worked}</span> lav</span>`;
      if (stats.M) h += `<span><span class="badge badge-M">${stats.M}</span> 1/2</span>`;
      h += `<span><span class="badge badge-WE">${stats.WE}</span> WE</span>`;
      if (stats.F) h += `<span><span class="badge badge-F">${stats.F}</span> ferie</span>`;
      if (stats.FS) h += `<span><span class="badge badge-FS">${stats.FS}</span> fest</span>`;
      if (stats.Malattia) h += `<span><span class="badge badge-Malattia">${stats.Malattia}</span> mal</span>`;
      if (stats.Donazione) h += `<span><span class="badge badge-Donazione">${stats.Donazione}</span> don</span>`;
      h += `</div></div>`;
    }
    el.innerHTML = h;
  }


  if (typeof window !== "undefined") {
    window.getPagamentiSummaryData = getPagamentiSummaryData;
    window.buildPagamentiSummaryPanel = buildPagamentiSummaryPanel;
    window.buildPagamentiLedgerPanel = buildPagamentiLedgerPanel;
    window.buildPagamentiSection = buildPagamentiSection;
    window.buildAccontoPlan = buildAccontoPlan;
    window.buildRolledDueDate = buildRolledDueDate;
    window.getScheduleStatus = getScheduleStatus;
    window.getForfettarioContributionBase = getForfettarioContributionBase;
    window.getForfettarioAppliedForYear = getForfettarioAppliedForYear;
    window.legacyBuildForfettarioScheduleForYear = legacyBuildForfettarioScheduleForYear;
    window.getOptionalAmountSetting = getOptionalAmountSetting;
    window.yearHasEstimates = yearHasEstimates;
    window.roundToTen = roundToTen;
    window.getForfettarioProjectionRange = getForfettarioProjectionRange;
    window.buildForfettarioScheduleForYear = buildForfettarioScheduleForYear;
    window.buildHistoricalOrdinarySummaryForYear = buildHistoricalOrdinarySummaryForYear;
    window.setScadenziarioView = setScadenziarioView;
    window.toggleScadenziarioHistoricalYears = toggleScadenziarioHistoricalYears;
    window.getScadenziarioYearTypeFromSettings = getScadenziarioYearTypeFromSettings;
    window.getKnownExternalFiscalYears = getKnownExternalFiscalYears;
    window.getScadenziarioOverrideCount = getScadenziarioOverrideCount;
    window.getYearInvoiceCount = getYearInvoiceCount;
    window.getExternalFiscalFlatEntries = getExternalFiscalFlatEntries;
    window.getImportedCompetenceFiscalEntriesForYear = getImportedCompetenceFiscalEntriesForYear;
    window.getImportedFiscalEntriesForYear = getImportedFiscalEntriesForYear;
    window.buildIsoDateFromDue = buildIsoDateFromDue;
    window.getScadenziarioFallbackStatus = getScadenziarioFallbackStatus;
    window.mapScheduleRowToScadenziario = mapScheduleRowToScadenziario;
    window.mapHistoricalEntryToScadenziarioRow = mapHistoricalEntryToScadenziarioRow;
    window.buildHistoricalRowsForScadenziario = buildHistoricalRowsForScadenziario;
    window.buildForfettarioRowsForScadenziario = buildForfettarioRowsForScadenziario;
    window.buildTrailingSettlementRowsForScadenziario = buildTrailingSettlementRowsForScadenziario;
    window.buildScadenziarioYearMeta = buildScadenziarioYearMeta;
    window.collectRelevantFiscalYears = collectRelevantFiscalYears;
    window.getScadenziarioTimingChip = getScadenziarioTimingChip;
    window.getScadenziarioExplanation = getScadenziarioExplanation;
    window.renderScadenziarioPaymentEvents = renderScadenziarioPaymentEvents;
    window.renderScadenziarioRowsTable = renderScadenziarioRowsTable;
    window.renderScadenziarioMethodBox = renderScadenziarioMethodBox;
    window.renderScadenziarioNotes = renderScadenziarioNotes;
    window.renderScadenziarioYearCard = renderScadenziarioYearCard;
    window.renderScadenziarioToolbar = renderScadenziarioToolbar;
    window.collectCashViewGroups = collectCashViewGroups;
    window.renderScadenziarioCashView = renderScadenziarioCashView;
    window.onScadenziarioYearToggle = onScadenziarioYearToggle;
    window.onScadenziarioArchivedToggle = onScadenziarioArchivedToggle;
    window.exportScadenzeIcs = exportScadenzeIcs;
    window.isIcsDownloaded = isIcsDownloaded;
    window.buildIcsBannerHtml = buildIcsBannerHtml;
    window.buildCrossYearReminderBannerHtml = buildCrossYearReminderBannerHtml;
    window.dismissCrossYearReminder = dismissCrossYearReminder;
    window.renderScadenziario = renderScadenziario;
    window.openPicker = openPicker;
    window.closePicker = closePicker;
    window.pickActivity = pickActivity;
    window.renderCalendar = renderCalendar;
  }
}());
