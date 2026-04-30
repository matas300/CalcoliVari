// app-calcolo.js — Render: Calcolo (home dashboard) + Riepilogo + tabella mensile
// Estratto da app.js (Sprint 5.3) per separare il dominio Calcolo dal core (SRP).
// Caricato DOPO app.js: usa data, currentYear, currentProfile, MONTHS, MONTHS_SHORT, fmt, fmtPct,
// ceil2, S, getInpsMode, getContribLabel, calcForfettarioValues, calcOrdinarioValues, getEffectiveTaxRate,
// drawDonut, drawMiniBars, getMonthEuro, getTotalLordo ecc. come globali (script-binding cross-script).

(function () {
  'use strict';

  // ═══════════════════ Render: Calcolo (home) ═══════════════════
  function renderCalcolo() {
    const el = document.getElementById('calcoloGrid');
    const regime = S().regime;
    let h = '';

    h += `<div class="regime-selector" style="grid-column:1/-1">
      <label>Regime ${currentYear}:</label>
      <button class="regime-btn ${regime==='forfettario'?'active':''}" onclick="setRegime('forfettario')">Forfettario</button>
      <button class="regime-btn ${regime==='ordinario'?'active':''}" onclick="setRegime('ordinario')">Ordinario</button>
    </div>`;

    if (regime === 'forfettario') {
      renderCalcoloForfettario(h, el);
    } else {
      renderCalcoloOrdinario(h, el);
    }
  }

  function getProfileRegimeHistory() {
    return getStoredYears(currentYear)
      .map(year => {
        const yearData = getYearDataFor(year);
        if (!yearData || !yearData.settings) return null;
        return {
          year,
          regime: yearData.settings.regime || 'forfettario',
          employeeIncome: parseInt(yearData.settings.haRedditoDipendente, 10) === 1
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.year - b.year);
  }

  const _HtmlUtils = (typeof window !== 'undefined' && window.HtmlUtils)
    ? window.HtmlUtils
    : (typeof HtmlUtils !== 'undefined' ? HtmlUtils
      : (typeof require !== 'undefined' ? require('./html-utils.js') : null));
  if (!_HtmlUtils) throw new Error('app.js requires HtmlUtils — load html-utils.js first');
  const escapeHtml = _HtmlUtils.escapeHtml;

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const calPicker = document.getElementById('calFatturaPicker');
    if (calPicker && calPicker.classList.contains('open')) {
      calPicker.classList.remove('open');
      return;
    }
    const archivio = document.getElementById('archivioFattureModal');
    if (archivio && archivio.classList.contains('open')) {
      if (window.FattureStorico && typeof window.FattureStorico.closeArchivioModal === 'function') {
        window.FattureStorico.closeArchivioModal();
      }
      return;
    }
    const ocrModal = document.getElementById('ocrPagamentoModal');
    if (ocrModal && ocrModal.classList.contains('open')) {
      if (typeof window.closeOcrPagamentoModal === 'function') window.closeOcrPagamentoModal();
      return;
    }
  });

  // Backdrop click per chiudere modale archivio
  document.addEventListener('click', e => {
    const target = e.target;
    if (target && target.id === 'archivioFattureModal') {
      if (window.FattureStorico && typeof window.FattureStorico.closeArchivioModal === 'function') {
        window.FattureStorico.closeArchivioModal();
      }
    }
  });


  function buildForfettarioLimitBar(totale, limite, year) {
    const safeLimit = limite > 0 ? limite : 85000;
    const pctRaw = (totale / safeLimit) * 100;
    const pct = Math.min(100, pctRaw);
    const remaining = Math.max(0, safeLimit - totale);
    const over = totale > safeLimit;
    // v3-LIMITE-ALERT: alert proattivo a soglie 80%, 95%, 100%, 117,6% (~100k decadenza immediata)
    // Norma: art. 1 c. 71 L. 190/2014 come modificato da L. 197/2022 art. 1 c. 54 lett. a:
    //   - decadenza anno successivo se ricavi > limite (oggi 85.000 €)
    //   - decadenza immediata se ricavi > 100.000 € (= limite + 15.000 €) — IVA retroattiva
    const decadenzaImmediata = safeLimit + 15000;
    let alertHtml = '';
    if (totale > decadenzaImmediata) {
      alertHtml = `<div class="limit-alert critical" role="alert" style="margin-top:10px;padding:10px 12px;border-radius:6px;background:rgba(220,53,69,.12);border:1px solid #dc3545;color:#dc3545;font-size:13px">
        <strong>⚠ Decadenza forfettario IMMEDIATA</strong><br>
        Hai superato il limite di ${fmt(decadenzaImmediata)} (limite + 15.000 €). Il regime forfettario decade <b>nell'anno corrente</b> con applicazione retroattiva dell'IVA su tutte le operazioni dal superamento (art. 1 c. 71 L. 190/2014 come modificato da L. 197/2022; Circ. AdE 9/E 2019). Contatta il commercialista subito.
      </div>`;
    } else if (over) {
      alertHtml = `<div class="limit-alert high" role="alert" style="margin-top:10px;padding:10px 12px;border-radius:6px;background:rgba(245,166,35,.12);border:1px solid #f5a623;color:#b67400;font-size:13px">
        <strong>⚠ Limite forfettario superato — uscita dal regime nel ${year + 1}</strong><br>
        Hai superato ${fmt(safeLimit)}. Resterai forfettario fino al ${year}, ma dal 1° gennaio ${year + 1} sarai automaticamente in regime ordinario (art. 1 c. 71 L. 190/2014). Pianifica IVA, fatturazione e contabilità ordinaria.
      </div>`;
    } else if (pctRaw >= 95) {
      alertHtml = `<div class="limit-alert warn" role="alert" style="margin-top:10px;padding:10px 12px;border-radius:6px;background:rgba(245,166,35,.12);border:1px solid #f5a623;color:#b67400;font-size:13px">
        <strong>Attenzione — molto vicino al limite (${pctRaw.toFixed(1)}%)</strong><br>
        Mancano <b>${fmt(remaining)}</b> al limite di ${fmt(safeLimit)}. Valuta se rinviare incassi al ${year + 1} per restare in forfettario.
      </div>`;
    } else if (pctRaw >= 80) {
      alertHtml = `<div class="limit-alert info" role="status" style="margin-top:10px;padding:8px 12px;border-radius:6px;background:rgba(46,170,220,.10);border:1px solid #2eaadc;color:#2eaadc;font-size:12px">
        <strong>Hai superato l'80% del limite forfettario (${pctRaw.toFixed(1)}%)</strong> — restano ${fmt(remaining)} di ${fmt(safeLimit)}. Monitora il fatturato per evitare lo sforamento involontario.
      </div>`;
    }
    return `<div class="panel forfettario-limit-panel" style="grid-column:1/-1">
      <div class="limit-row"><span class="limit-label">Fatturato ${year}</span><span class="limit-value">${fmt(totale)}</span></div>
      <div class="limit-row"><span class="limit-label">${over ? 'Oltre il limite' : 'Mancante al limite'} (${fmt(safeLimit)})</span><span class="limit-value ${over ? 'over' : ''}">${fmt(over ? totale - safeLimit : remaining)}</span></div>
      <div class="limit-bar-track${over ? ' over' : ''}">
        <div class="limit-bar-fill" style="width:${pct.toFixed(1)}%"></div>
        <span class="limit-bar-pct">${pct.toFixed(1)}%</span>
      </div>${alertHtml}
    </div>`;
  }

  function renderCalcoloForfettario(h, el) {
    const c = getForfettarioSourceOfTruthForYear(currentYear, { includeEstimates: true }) || getAppliedForfettarioForYear(currentYear, { includeEstimates: true });
    const s = S();
    const contrib = c.contribTotali;
    const tasse = c.competenceTax || c.tasse;
    const netto = c.competenceNetto || c.netto;
    const perc = c.competenceRate || c.percEffettiva;

    const profileFiscal = getProfileFiscalData();
    const aliquotaEff = Number(s.impostaSostitutiva);
    if (profileFiscal.agevolazioneStartUp === 1 && aliquotaEff > 5) {
      h += `<div class="startup-warning-banner" role="alert" style="grid-column:1/-1">
        <strong>Agevolazione start-up attiva ma aliquota al ${aliquotaEff}%</strong>
        <p>Il flag "Agevolazione start-up" e attivo nel profilo, ma l imposta sostitutiva per il ${currentYear} e impostata al ${aliquotaEff}%. La normativa (L. 190/2014 art. 1 c. 65-bis) prevede il 5% per i primi 5 anni di attivita, al ricorrere dei requisiti. Verifica i requisiti e, se applicabile, imposta l aliquota al 5% nelle Impostazioni annuali.</p>
      </div>`;
    }

    h += `<div class="panel" style="grid-column:1/-1"><h3>Ripartizione del Lordo${c.useRiduzione ? ' (riduzione 35%)' : ''}</h3>`;
    h += drawDonut(netto, tasse, contrib);
    h += `</div>`;

    h += buildForfettarioLimitBar(c.totale, s.limiteForfettario, currentYear);

    h += `<div class="panel" style="grid-column:1/-1"><h3>In sintesi</h3>`;
    h += row('Totale annuo lordo', fmt(c.totale), 'highlight');
    h += row('Imposta sostitutiva', fmt(tasse), '', 'negative');
    h += row(getContribLabel(c.inpsMode), fmt(contrib), '', 'negative');
    h += row('Netto annuo', fmt(netto), 'highlight', 'positive');
    h += row('Netto mensile', fmt(netto / 12), '', 'positive');
    h += `<div class="scad-note" style="margin-top:10px">Vuoi capire come arriviamo a questi numeri? Apri <a href="#" onclick="switchToTab('riepilogo');return false;">Riepilogo</a> dal menu profilo.</div>`;
    h += `</div>`;

    h += buildMonthlyTable(perc);

    el.innerHTML = h;
  }

  function renderRiepilogoForfettario(h, el) {
    const c = getForfettarioSourceOfTruthForYear(currentYear, { includeEstimates: true }) || getAppliedForfettarioForYear(currentYear, { includeEstimates: true });
    const s = S();
    const contrib = c.contribTotali;
    const comparison = c.comparison || null;
    const selectedScenario = c.selectedScenario || null;
    const tasse = c.competenceTax || c.tasse;
    const netto = c.competenceNetto || c.netto;
    const perc = c.competenceRate || c.percEffettiva;
    const cashPerspective = getForfettarioCashPerspectiveForYear(currentYear);
    const crossYear = getCrossYearInvoices();
    const contribLabel = getContribLabel(c.inpsMode);

    h += `<div class="panel"><div class="panel-head"><h3>Riepilogo Annuale</h3><button class="btn-add" id="btn-open-dichiarazione" type="button" onclick="openDichiarazione()">Apri Dichiarazione</button></div>`;
    h += row('Giorni lavorati', getTotalWorkedDays());
    h += row('Paga giornaliera', fmt(s.dailyRate));
    h += row('Gestione INPS', getInpsModeLabel(c.inpsMode));
    h += row('Totale annuo lordo', fmt(c.totale), 'highlight');
    if (crossYear.length > 0) {
      const crossTot = crossYear.reduce((s, i) => s + i.importo, 0);
      h += `<div class="scad-note" style="margin:6px 0">Include ${fmt(crossTot)} da fatture di anni precedenti incassate nel ${currentYear}</div>`;
    }
    h += '<br>';
    h += row(`Imposta sostitutiva (${s.impostaSostitutiva}% su imponibile fiscale)`, fmt(tasse), '', 'negative');
    h += row(contribLabel, fmt(contrib), '', 'negative');
    h += '<br>';
    h += row('Netto annuo', fmt(netto), 'highlight', 'positive');
    h += row('Netto mensile', fmt(netto / 12), '', 'positive');
    h += `<br><div style="font-size:.82rem;color:var(--text2)">% effettiva (competenza): <b style="color:var(--accent)">${fmtPct(perc)}</b> &mdash; Netto/giorno: <b style="color:var(--green)">${fmt(s.dailyRate*(1-perc))}</b></div>`;
    if (cashPerspective) {
      h += `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--color-border)">`;
      h += row(`Tasse+contributi cassa ${currentYear}-${currentYear + 1}`, fmt(cashPerspective.totalDue), '', 'negative');
      h += row(`% effettiva (cassa)`, fmtPct(cashPerspective.effectiveRate));
      h += `<div class="scad-note" style="margin-top:8px">La competenza guarda al dovuto fiscale del ${currentYear}; la cassa somma le uscite reali del ciclo ${currentYear}-${currentYear + 1}.</div>`;
      h += `</div>`;
    }
    h += `</div>`;

    if (selectedScenario) {
      h += `<div class="panel"><h3>Base Fiscale Forfettaria</h3>`;
      for (const step of selectedScenario.formula) {
        const tone = /imponibile|imposta/i.test(step.label) ? 'negative' : '';
        const hl = /ricavi|imponibile fiscale/i.test(step.label) ? 'highlight' : '';
        h += row(step.label, fmt(step.amount), hl, tone);
      }
      h += `<div style="font-size:.78rem;color:var(--text2);line-height:1.5;margin-top:10px">`;
      h += selectedScenario.explanation.join(' ');
      h += `</div>`;
      if (Math.abs(c.deductibleContributionsPaid - contrib) >= 0.01) {
        h += `<div class="scad-note" style="margin-top:8px">`;
        h += `Per spiegare storico e previsionale mostro anche i contributi INPS deducibili pagati o pianificati nell'anno (${fmt(c.deductibleContributionsPaid)}). La percentuale effettiva principale resta pero calcolata su base competenza.`;
        h += `</div>`;
      }
      h += `</div>`;
    }

    if (comparison) {
      const prudentialLabel = comparison.prudential.method === 'previsionale' ? 'Previsionale' : 'Storico';
      const liquidityLabel = comparison.liquidity.method === 'previsionale' ? 'Previsionale' : 'Storico';
      h += `<div class="panel"><h3>Storico vs Previsionale</h3>`;
      h += row('Metodo attivo', comparison.selectedMethod === 'previsionale' ? 'Previsionale' : 'Storico', 'highlight');
      h += row('Metodo piu prudente', prudentialLabel);
      h += row('Metodo piu leggero sulla liquidita', liquidityLabel);
      h += row('Acconti imposta storico', fmt(comparison.historical.taxAcconti.total), '', 'negative');
      h += row('Acconti imposta previsionale', fmt(comparison.previsionale.taxAcconti.total), '', 'negative');
      h += row('Contributi deducibili storico', fmt(comparison.historical.deductibleContributionsPaid));
      h += row('Contributi deducibili previsionale', fmt(comparison.previsionale.deductibleContributionsPaid));
      h += `</div>`;
    }

    if (comparison && comparison.warnings.length) {
      h += `<div class="panel"><h3>Warning Fiscali</h3><div class="scad-note-list">`;
      h += comparison.warnings.map(note => `<div class="scad-note">${note}</div>`).join('');
      h += `</div></div>`;
    }

    h += `<div class="panel"><h3>Andamento Mensile &amp; Contributi</h3>`;
    h += drawMiniBars(perc);
    h += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--color-border)">`;
    h += `<div style="font-size:.85rem;color:var(--accent);font-weight:600;margin-bottom:8px">${contribLabel} (sul ${s.coefficiente}%)</div>`;
    if (c.useRiduzione) h += `<div class="scad-note" style="margin-bottom:6px">Riduzione 35% attiva</div>`;
    if (c.inpsMode === 'gestione_separata') {
      h += row('Su imponibile', fmt(contrib), 'highlight');
    } else {
      h += row('Fissi', fmt(c.contribFissi));
      h += row('Variabili', fmt(c.contribVariabili));
    }
    h += row('Totale annuo', fmt(contrib), 'highlight');
    h += row('Totale mensile', fmt(contrib / 12));
    if (c.inpsMode === 'artigiani_commercianti') {
      h += `<div style="font-size:.78rem;color:var(--text2);margin-top:4px">${c.useRiduzione ? 'Senza' : 'Con'} riduzione: <b>${fmt(c.useRiduzione ? c.cT : c.cTR)}</b>/anno</div>`;
    }
    h += `</div></div>`;

    el.innerHTML = h;
  }

  function renderCalcoloOrdinario(h, el) {
    const c = calcOrdinario(), s = S();
    const perc = c.perc;
    const contribLabel = getContribLabel(c.inpsMode);

    h += `<div class="panel" style="grid-column:1/-1"><h3>${c.spese > 0 ? "Ripartizione dell'Imponibile (Ordinario)" : 'Ripartizione del Lordo (Ordinario)'}</h3>`;
    h += drawDonut(c.netto, c.con.tasse, c.cT, c.spese > 0 ? 'Imponibile' : 'Totale lordo');
    h += `</div>`;

    h += `<div class="panel" style="grid-column:1/-1"><h3>In sintesi</h3>`;
    h += row('Totale annuo lordo', fmt(c.tot), 'highlight');
    if (c.spese > 0) h += row('Imponibile', fmt(c.totSp), 'highlight');
    h += row('IRPEF', fmt(c.con.tasse), '', 'negative');
    h += row(contribLabel, fmt(c.cT), '', 'negative');
    h += row('Netto annuo', fmt(c.netto), 'highlight', 'positive');
    h += row('Netto mensile', fmt(c.netto / 12), '', 'positive');
    h += `<div class="scad-note" style="margin-top:10px">Vuoi capire come arriviamo a questi numeri? Apri <a href="#" onclick="switchToTab('riepilogo');return false;">Riepilogo</a> dal menu profilo.</div>`;
    h += `</div>`;

    h += buildMonthlyTable(perc);

    el.innerHTML = h;
  }

  function renderRiepilogoOrdinario(h, el) {
    const c = calcOrdinario(), s = S();
    const perc = c.perc;
    const labels = getIrpefBracketLabelsForYear(currentYear);
    const crossYear = getCrossYearInvoices();
    const contribLabel = getContribLabel(c.inpsMode);
    const speseStoriche = calcSpeseCarryoverTotalForYear(currentYear);

    h += `<div class="panel"><div class="panel-head"><h3>Riepilogo Annuale</h3><button class="btn-add" id="btn-open-dichiarazione" type="button" onclick="openDichiarazione()">Apri Dichiarazione</button></div>`;
    h += row('Giorni lavorati', getTotalWorkedDays());
    h += row('Paga giornaliera', fmt(s.dailyRate));
    h += row('Gestione INPS', getInpsModeLabel(c.inpsMode));
    h += row('Totale annuo lordo', fmt(c.tot), 'highlight');
    if (crossYear.length > 0) {
      const crossTot = crossYear.reduce((s, i) => s + i.importo, 0);
      h += `<div style="font-size:.78rem;color:var(--yellow);margin:6px 0">Include ${fmt(crossTot)} da fatture di anni precedenti incassate nel ${currentYear}</div>`;
    }
    if (c.spese > 0) {
      h += row('Spese deducibili', fmt(c.spese), '', 'negative');
      if (speseStoriche > 0) {
        h += `<div style="font-size:.78rem;color:var(--yellow);margin:6px 0">Di cui ${fmt(speseStoriche)} da quote di anni precedenti ancora attive nel ${currentYear}</div>`;
      }
      h += row('Imponibile', fmt(c.totSp), 'highlight');
    }
    h += '<br><div style="font-size:.82rem;color:var(--text2);margin-bottom:6px">Scaglioni IRPEF:</div>';
    for (let i = 0; i < labels.length; i++) {
      const d = c.con.det[i];
      if (d.b > 0) h += row(labels[i], `${fmt(d.b)} &rarr; ${fmt(d.t)}`);
    }
    h += '<br>';
    h += row('IRPEF', fmt(c.con.tasse), '', 'negative');
    h += row(contribLabel, fmt(c.cT), '', 'negative');
    h += '<br>';
    h += row('Netto annuo', fmt(c.netto), 'highlight', 'positive');
    h += row('Netto mensile', fmt(c.netto / 12), '', 'positive');
    h += `<br><div style="font-size:.82rem;color:var(--text2)">% effettiva: <b style="color:var(--accent)">${fmtPct(perc)}</b></div></div>`;

    h += `<div class="panel"><h3>Andamento Mensile &amp; Contributi</h3>`;
    h += drawMiniBars(perc);
    h += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--color-border)">`;
    h += `<div style="font-size:.85rem;color:var(--accent);font-weight:600;margin-bottom:8px">${contribLabel}</div>`;
    if (c.inpsMode === 'gestione_separata') {
      h += row('Su imponibile', fmt(c.cT), 'highlight');
    } else {
      h += row('Fissi', fmt(c.cF));
      h += row('Variabili', fmt(c.cV));
    }
    h += row('Totale annuo', fmt(c.cT), 'highlight');
    h += row('Totale mensile', fmt(c.cT / 12));
    h += `</div></div>`;

    el.innerHTML = h;
  }

  function renderRiepilogo() {
    const el = document.getElementById('riepilogoGrid');
    if (!el) return;
    const regime = S().regime;
    let h = '';
    if (regime === 'forfettario') renderRiepilogoForfettario(h, el);
    else renderRiepilogoOrdinario(h, el);
    const banner = buildIcsBannerHtml();
    if (banner) {
      const existing = document.getElementById('ics-banner-root');
      if (existing) existing.remove();
      el.insertAdjacentHTML('afterbegin', banner);
    }
    // F4: banner cross-year a dicembre (solo forfettario)
    const crossYearBanner = buildCrossYearReminderBannerHtml();
    if (crossYearBanner) {
      const existingCY = document.getElementById('cross-year-banner-root');
      if (existingCY) existingCY.remove();
      el.insertAdjacentHTML('afterbegin', crossYearBanner);
    }
  }

  function buildMonthlyTable(perc) {
    let h = `<div class="panel" style="grid-column:1/-1"><h3>Dettaglio Mensile</h3>`;
    h += `<table class="monthly-breakdown"><thead><tr><th>Mese</th><th>Lordo</th><th>Fonte</th><th>Netto</th><th>Tasse+C.</th></tr></thead><tbody>`;
    let tI = 0, tN = 0, tT = 0;
    for (let m = 1; m <= 12; m++) {
      const inc = getMonthEuro(m), ff = isMonthFromFattura(m);
      const fatture = getFatture(m);
      const nFatt = fatture.filter(f => f.importo > 0).length;
      const nDiff = fatture.filter(f => f.importo > 0 && f.pagAnno && f.pagAnno !== currentYear).length;
      const tax = inc * perc, net = inc - tax;
      tI += inc; tN += net; tT += tax;
      let src = ff ? '<span style="color:var(--green);font-size:.75rem">Fattura</span>' : '<span style="color:var(--text2);font-size:.75rem">Stimato</span>';
      if (!ff && !isEstimatePayableInYear(m)) {
        src = `<span style="color:var(--text2);font-size:.7rem">Oltre ${S().giorniIncasso}gg</span>`;
      } else if (ff && nDiff > 0) {
        if (nDiff === nFatt) {
          src = `<span style="color:var(--yellow);font-size:.7rem">Fatt. differite</span>`;
        } else {
          src = `<span style="color:var(--green);font-size:.7rem">${nFatt} fatt. (${nDiff} diff.)</span>`;
        }
      } else if (ff && nFatt > 1) {
        src = `<span style="color:var(--green);font-size:.75rem">${nFatt} fatture</span>`;
      }
      h += `<tr><td data-label="Mese">${MONTHS[m-1]}</td><td data-label="Lordo">${fmt(inc)}</td><td data-label="Fonte" style="text-align:center">${src}</td><td data-label="Netto" style="color:var(--green)">${fmt(net)}</td><td data-label="Tasse+C." style="color:var(--red)">${fmt(tax)}</td></tr>`;
    }
    // Add cross-year invoices
    const crossYear = getCrossYearInvoices();
    for (const inv of crossYear) {
      const tax = inv.importo * perc, net = inv.importo - tax;
      tI += inv.importo; tN += net; tT += tax;
      h += `<tr style="background:rgba(245,166,35,.06)"><td data-label="Mese">${MONTHS[inv.mese-1]} ${inv.anno}</td><td data-label="Lordo">${fmt(inv.importo)}</td>
        <td data-label="Fonte" style="text-align:center"><span style="color:var(--yellow);font-size:.7rem">Da ${inv.anno}${inv.desc?' ('+inv.desc+')':''}</span></td>
        <td data-label="Netto" style="color:var(--green)">${fmt(net)}</td><td data-label="Tasse+C." style="color:var(--red)">${fmt(tax)}</td></tr>`;
    }
    h += `</tbody><tfoot><tr><td data-label="Mese">Totale</td><td data-label="Lordo">${fmt(tI)}</td><td data-label=""></td><td data-label="Netto" style="color:var(--green)">${fmt(tN)}</td><td data-label="Tasse+C." style="color:var(--red)">${fmt(tT)}</td></tr></tfoot></table></div>`;
    return h;
  }


  if (typeof window !== "undefined") {
    window.renderCalcolo = renderCalcolo;
    window.getProfileRegimeHistory = getProfileRegimeHistory;
    window.buildForfettarioLimitBar = buildForfettarioLimitBar;
    window.renderCalcoloForfettario = renderCalcoloForfettario;
    window.renderRiepilogoForfettario = renderRiepilogoForfettario;
    window.renderCalcoloOrdinario = renderCalcoloOrdinario;
    window.renderRiepilogoOrdinario = renderRiepilogoOrdinario;
    window.renderRiepilogo = renderRiepilogo;
    window.buildMonthlyTable = buildMonthlyTable;
  }
}());
