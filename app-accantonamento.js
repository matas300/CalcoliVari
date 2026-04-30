// app-accantonamento.js — Render Accantonamento + CRUD pagamenti + quick-pay + date picker
// Estratto da app.js (Sprint 5.1) per separare il dominio Accantonamento dal core (SRP).
// Caricato DOPO app.js: usa data, currentYear, loadYearData, saveYearData, saveData,
// getYearDataFor, ensureDataShape, recalcAll, MONTHS, MONTHS_SHORT, fmt, fmtPct, ceil2,
// parseIsoDate, pad2, daysInMonth, getCrossYearInvoicesForYear, getFattureFromYearData,
// getStoredYears, getAllStoredYears, getEffectiveTaxRate, getEffectiveTaxRateForYear,
// getFatture come globali (script-binding cross-script).

(function () {
  'use strict';

  // ═══════════════════ Render: Accantonamento ═══════════════════
  // Collect all fatture paid in the selected year (only real invoices, no estimates)
  function getFattureForAccantonamentoForYear(year) {
    const items = [];
    const perc = getEffectiveTaxRateForYear(year);
    const yearData = year === currentYear ? data : loadYearData(year);
    if (!yearData) return items;

    // 1. Fatture di anni precedenti pagate in questo anno (cross-year) — in testa
    const crossYear = getCrossYearInvoicesForYear(year);
    const crossCounts = {}; // per-month index for stable keys
    for (const inv of crossYear) {
      const idx = crossCounts[inv.mese] = (crossCounts[inv.mese] || 0) + 1;
      items.push({
        label: MONTHS[inv.mese-1] + ' ' + inv.anno + (inv.desc ? ' - ' + inv.desc : ''),
        mese: inv.mese, anno: inv.anno, importo: inv.importo, rate: perc,
        isCrossYear: true,
        key: 'cross_' + inv.anno + '_' + inv.mese + '_' + idx
      });
    }

    // 2. Fatture emesse in questo anno e pagate in questo anno (o senza data pagamento = assunto nello stesso anno)
    for (let m = 1; m <= 12; m++) {
      let idx = 0;
      for (const f of getFattureFromYearData(yearData, m, year)) {
        idx++;
        if (f.importo <= 0) continue;
        if (f.pagAnno && f.pagAnno !== year) continue; // deferred to another year
        items.push({
          label: MONTHS[m-1] + (f.desc ? ' - ' + f.desc : ''),
          mese: m, anno: year, importo: f.importo, rate: perc,
          key: 'cur_' + m + '_' + idx // stable key: month + index within month
        });
      }
    }

    return items;
  }

  function getFattureForAccantonamento() {
    return getFattureForAccantonamentoForYear(currentYear);
  }

  function getAllFattureForAccantonamento() {
    let items = [];
    for (const year of getStoredYears(currentYear)) {
      items = items.concat(getFattureForAccantonamentoForYear(year).map(item => ({ ...item, paidYear: year })));
    }
    return items;
  }

  function getPagamentiForYear(year) {
    const yearData = year === currentYear ? data : loadYearData(year);
    return yearData && Array.isArray(yearData.pagamenti) ? yearData.pagamenti : [];
  }

  function getPagamenti() {
    return getPagamentiAcrossYears(currentYear);
  }

  function getPagamentiAcrossYears(maxYear) {
    const items = [];
    const years = maxYear === undefined || maxYear === null ? getAllStoredYears() : getStoredYears(maxYear);
    for (const year of years) {
      const pagamenti = getPagamentiForYear(year);
      for (let idx = 0; idx < pagamenti.length; idx++) {
        const p = pagamenti[idx] || {};
        const parsed = parseIsoDate(p.data || '');
        items.push({
          anno: year,
          _idx: idx,
          data: p.data || '',
          cashYear: parsed ? parsed.year : year,
          tipo: p.tipo || 'tasse',
          descrizione: p.descrizione || '',
          importo: ceil2(parseFloat(p.importo) || 0),
          scheduleKey: p.scheduleKey || ''
        });
      }
    }
    return items.sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.cashYear - a.cashYear || b.anno - a.anno || a._idx - b._idx);
  }

  function getTotalAccantonato() {
    let total = 0;
    for (const year of getStoredYears(currentYear)) {
      const yearData = year === currentYear ? data : loadYearData(year);
      for (const raw of Object.values((yearData && yearData.accantonamento) || {})) {
        total = ceil2(total + ceil2(parseFloat(raw) || 0));
      }
    }
    return total;
  }

  function getTotalDovutoAccantonamento() {
    let total = 0;
    for (const f of getAllFattureForAccantonamento()) {
      total = ceil2(total + ceil2(f.importo * f.rate));
    }
    return total;
  }

  function getTotalPagamenti() {
    let total = 0;
    for (const p of getPagamenti()) {
      total = ceil2(total + ceil2(parseFloat(p.importo) || 0));
    }
    return total;
  }

  function addPagamento() {
    if (!Array.isArray(data.pagamenti)) data.pagamenti = [];
    data.pagamenti.unshift({
      data: `${currentYear}-01-01`,
      tipo: 'tasse',
      descrizione: '',
      importo: 0
    });
    saveData();
    recalcAll();
  }

  function setPagamentoField(year, idx, key, val) {
    const yearData = year === currentYear ? data : loadYearData(year);
    if (!yearData || !yearData.pagamenti || !yearData.pagamenti[idx]) return;
    if (key === 'data') {
      const targetYear = (parseIsoDate(val) || {}).year || year;
      const currentItem = { ...yearData.pagamenti[idx], data: val };
      if (targetYear !== year) {
        yearData.pagamenti.splice(idx, 1);
        saveYearData(year, yearData);
        const targetData = getYearDataFor(targetYear) || ensureDataShape({}, targetYear);
        if (!Array.isArray(targetData.pagamenti)) targetData.pagamenti = [];
        targetData.pagamenti.unshift(currentItem);
        saveYearData(targetYear, targetData);
        recalcAll();
        return;
      }
    }
    yearData.pagamenti[idx][key] = val;
    saveYearData(year, yearData);
    recalcAll();
  }

  function setPagamentoImporto(year, idx, val) {
    const yearData = year === currentYear ? data : loadYearData(year);
    if (!yearData || !yearData.pagamenti || !yearData.pagamenti[idx]) return;
    yearData.pagamenti[idx].importo = ceil2(parseFloat(val) || 0);
    saveYearData(year, yearData);
    recalcAll();
  }

  function removePagamento(year, idx) {
    const yearData = year === currentYear ? data : loadYearData(year);
    if (!yearData || !yearData.pagamenti || !yearData.pagamenti[idx]) return;
    yearData.pagamenti.splice(idx, 1);
    saveYearData(year, yearData);
    recalcAll();
  }

  function getPaymentEventsForScheduleKey(scheduleKey) {
    if (!scheduleKey) return [];
    return getPagamentiAcrossYears()
      .filter(p => p.scheduleKey === scheduleKey)
      .map(p => ({
        id: `pay_${p.anno}_${p._idx}`,
        paymentId: `pay_${p.anno}_${p._idx}`,
        scheduleKey,
        anno: p.anno,
        _idx: p._idx,
        data: p.data || '',
        paymentDate: p.data || '',
        cashYear: p.cashYear || p.anno,
        amount: ceil2(p.importo),
        tipo: p.tipo || 'tasse',
        descrizione: p.descrizione || '',
        note: p.descrizione || '',
        source: 'manual'
      }));
  }

  let _qpayPending = null;

  function openQuickPayModal(scheduleKey, dueDate, kind, title, competence, amount) {
    _qpayPending = { scheduleKey, dueDate, kind, title, competence };
    const modal = document.getElementById('quickPayModal');
    const titleEl = document.getElementById('qpayTitle');
    const subEl = document.getElementById('qpaySub');
    const input = document.getElementById('qpayAmount');
    if (!modal || !input) return;
    titleEl.textContent = title;
    subEl.textContent = competence;
    input.value = ceil2(amount || 0).toFixed(2);
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('open');
    requestAnimationFrame(() => input.select());
  }

  function closeQuickPayModal() {
    const modal = document.getElementById('quickPayModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    _qpayPending = null;
  }

  function confirmQuickPay() {
    if (!_qpayPending) return;
    const input = document.getElementById('qpayAmount');
    const parsed = parseFloat(String(input ? input.value : '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      if (input) input.focus();
      return;
    }
    const { scheduleKey, dueDate, kind, title, competence } = _qpayPending;
    closeQuickPayModal();
    const targetYear = (parseIsoDate(dueDate) || {}).year || currentYear;
    const yearData = getYearDataFor(targetYear) || ensureDataShape({}, targetYear);
    if (!Array.isArray(yearData.pagamenti)) yearData.pagamenti = [];
    yearData.pagamenti.unshift({
      data: dueDate,
      tipo: kind === 'tasse' ? 'tasse' : (kind === 'contributi' ? 'contributi' : 'altro'),
      descrizione: `${title} - ${competence}`,
      importo: ceil2(parsed),
      scheduleKey: scheduleKey
    });
    saveYearData(targetYear, yearData);
    recalcAll();
  }

  function addPagamentoFromSchedule(scheduleKey, dueDate, kind, title, competence, amount) {
    openQuickPayModal(scheduleKey, dueDate, kind, title, competence, amount);
  }

  function removePagamentoByScheduleKey(scheduleKey) {
    if (!scheduleKey) return;
    for (const year of getAllStoredYears()) {
      const yearData = year === currentYear ? data : loadYearData(year);
      if (!yearData || !Array.isArray(yearData.pagamenti)) continue;
      const next = yearData.pagamenti.filter(p => p.scheduleKey !== scheduleKey);
      if (next.length !== yearData.pagamenti.length) {
        yearData.pagamenti = next;
        saveYearData(year, yearData);
      }
    }
    recalcAll();
  }

  function reopenPaidScheduleItem(scheduleKey) {
    removePagamentoByScheduleKey(scheduleKey);
  }

  // pad2 e parseIsoDate aliasati da date-utils.js (vedi top file)

  function formatPaymentDateDisplay(value) {
    const parsed = parseIsoDate(value);
    if (!parsed) return 'Seleziona data';
    return `${pad2(parsed.day)} ${MONTHS_SHORT[parsed.month - 1]} ${parsed.year}`;
  }

  function formatPaymentDateMeta(rowYear, value) {
    const parsed = parseIsoDate(value);
    if (!parsed) return `Anno contabile ${rowYear}`;
    if (parsed.year !== rowYear) return `Pagato nel ${parsed.year} - contabile ${rowYear}`;
    return `Anno contabile ${rowYear}`;
  }

  let paymentDatePickerState = null;

  function positionFloatingPopup(popup, rect, preferredWidth, preferredHeight) {
    if (window.innerWidth <= 768) {
      popup.style.left = '50%';
      popup.style.top = '50%';
      popup.style.transform = 'translate(-50%, -50%)';
      return;
    }

    popup.style.transform = '';
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + preferredWidth > window.innerWidth - 12) left = window.innerWidth - preferredWidth - 12;
    if (left < 12) left = 12;
    if (top + preferredHeight > window.innerHeight - 12) top = Math.max(12, rect.top - preferredHeight - 8);
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }

  function openPaymentDatePicker(year, idx, evt) {
    if (evt) evt.stopPropagation();
    const pagamento = getPagamentiForYear(year)[idx];
    if (!pagamento) return;

    const parsed = parseIsoDate(pagamento.data) || { year, month: 1, day: 1 };
    paymentDatePickerState = {
      rowYear: year,
      idx,
      selected: pagamento.data || '',
      viewYear: parsed.year,
      viewMonth: parsed.month
    };

    const popup = document.getElementById('paymentDatePopup');
    const overlay = document.getElementById('paymentDateOverlay');
    if (!popup || !overlay) return;
    const rect = evt && evt.currentTarget ? evt.currentTarget.getBoundingClientRect() : { left: 24, top: 24, bottom: 24 };
    positionFloatingPopup(popup, rect, 300, 360);
    renderPaymentDatePicker();
    overlay.style.display = 'block';
    popup.style.display = 'block';
  }

  function closePaymentDatePicker() {
    const popup = document.getElementById('paymentDatePopup');
    const overlay = document.getElementById('paymentDateOverlay');
    if (popup) popup.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    paymentDatePickerState = null;
  }

  function shiftPaymentDatePicker(deltaMonths) {
    if (!paymentDatePickerState) return;
    const base = new Date(paymentDatePickerState.viewYear, paymentDatePickerState.viewMonth - 1 + deltaMonths, 1);
    paymentDatePickerState.viewYear = base.getFullYear();
    paymentDatePickerState.viewMonth = base.getMonth() + 1;
    renderPaymentDatePicker();
  }

  function pickPagamentoDate(year, month, day) {
    if (!paymentDatePickerState) return;
    const iso = `${year}-${pad2(month)}-${pad2(day)}`;
    const rowYear = paymentDatePickerState.rowYear;
    const idx = paymentDatePickerState.idx;
    closePaymentDatePicker();
    setPagamentoField(rowYear, idx, 'data', iso);
  }

  function setPagamentoDateToday() {
    const today = new Date();
    pickPagamentoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  }

  function clearPagamentoDate() {
    if (!paymentDatePickerState) return;
    const rowYear = paymentDatePickerState.rowYear;
    const idx = paymentDatePickerState.idx;
    closePaymentDatePicker();
    setPagamentoField(rowYear, idx, 'data', '');
  }

  function renderPaymentDatePicker() {
    const popup = document.getElementById('paymentDatePopup');
    if (!popup || !paymentDatePickerState) return;

    const state = paymentDatePickerState;
    const selected = parseIsoDate(state.selected);
    const firstDow = (new Date(state.viewYear, state.viewMonth - 1, 1).getDay() + 6) % 7;
    const dim = daysInMonth(state.viewYear, state.viewMonth);
    const today = new Date();
    let html = `<div class="payment-date-head">
      <button type="button" class="payment-date-nav" onclick="shiftPaymentDatePicker(-1)" aria-label="Mese precedente">&lsaquo;</button>
      <div class="payment-date-title">${MONTHS[state.viewMonth - 1]} ${state.viewYear}</div>
      <button type="button" class="payment-date-nav" onclick="shiftPaymentDatePicker(1)" aria-label="Mese successivo">&rsaquo;</button>
    </div>`;
    html += `<div class="payment-date-weekdays">${['L','M','M','G','V','S','D'].map(d => `<span>${d}</span>`).join('')}</div>`;
    html += `<div class="payment-date-grid">`;
    for (let i = 0; i < firstDow; i++) html += `<span class="payment-date-empty"></span>`;
    for (let day = 1; day <= dim; day++) {
      const isSelected = selected && selected.year === state.viewYear && selected.month === state.viewMonth && selected.day === day;
      const isToday = today.getFullYear() === state.viewYear && today.getMonth() + 1 === state.viewMonth && today.getDate() === day;
      html += `<button type="button" class="payment-date-day${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}" onclick="pickPagamentoDate(${state.viewYear}, ${state.viewMonth}, ${day})">${day}</button>`;
    }
    const cellsUsed = firstDow + dim;
    const trailing = (7 - (cellsUsed % 7)) % 7;
    for (let i = 0; i < trailing; i++) html += `<span class="payment-date-empty"></span>`;
    html += `</div>`;
    html += `<div class="payment-date-actions">
      <button type="button" onclick="setPagamentoDateToday()">Oggi</button>
      <button type="button" onclick="clearPagamentoDate()">Svuota</button>
    </div>`;
    popup.innerHTML = html;
  }

  function renderAccantonamento() {
    const el = document.getElementById('accantonamentoGrid');
    const perc = getEffectiveTaxRate();
    const fatture = getFattureForAccantonamento();
    let h = '';

    h += `<div class="panel" style="grid-column:1/-1"><h3>Tasse Accantonate vs Dovute</h3>`;
    h += `<div style="font-size:.82rem;color:var(--text2);margin-bottom:12px">
      Basato solo su fatture reali pagate nel ${currentYear}. % effettiva: <b style="color:var(--accent)">${fmtPct(perc)}</b></div>`;

    if (fatture.length === 0) {
      h += `<div style="font-size:.88rem;color:var(--text2);padding:20px;text-align:center">Nessuna fattura pagata nel ${currentYear}.</div>`;
      h += `</div>`;
      el.innerHTML = h;
      return;
    }

    h += `<table class="accant-table"><thead><tr>
      <th>Fattura</th><th>Lordo</th><th>Da accant.</th><th>Accantonato</th><th>Delta cum.</th>
    </tr></thead><tbody>`;

    let cD = 0, cM = 0;
    const md = [];
    for (const f of fatture) {
      const dovuto = ceil2(f.importo * f.rate);
      const accKey = f.key;
      const messo = ceil2(parseFloat(data.accantonamento[accKey]) || 0);
      cD = ceil2(cD + dovuto);
      cM = ceil2(cM + messo);
      const dm = ceil2(messo - dovuto), dc = ceil2(cM - cD);
      md.push({ label: f.label, mese: f.mese, dovuto, messo, dm, cD, cM, dc, importo: f.importo, isCrossYear: f.isCrossYear });

      const bgStyle = f.isCrossYear ? ' style="background:rgba(245,166,35,.06)"' : '';
      h += `<tr${bgStyle}>
        <td data-label="Fattura" style="text-align:left;font-size:.82rem">${f.label}${f.isCrossYear ? '<br><span style="color:var(--yellow);font-size:.7rem">(da ' + f.anno + ')</span>' : ''}</td>
        <td data-label="Lordo">${fmt(f.importo)}</td>
        <td data-label="Da accant." style="color:var(--yellow)">${fmt(dovuto)}</td>
        <td data-label="Accantonato"><input type="number" value="${messo||''}" placeholder="0" step="0.01"
          onchange="data.accantonamento['${accKey}']=ceil2(parseFloat(this.value)||0);saveData();recalcAll()"></td>
        <td data-label="Delta cum." class="${dc>=0?'delta-pos':'delta-neg'}" style="font-weight:600">${(dc>=0?'+':'')+fmt(dc)}</td></tr>`;
    }

    const totLordo = fatture.reduce((s, f) => s + f.importo, 0);
    const fd = ceil2(cM - cD);
    h += `</tbody><tfoot><tr>
      <td data-label="Fattura" style="text-align:left">Totale</td>
      <td data-label="Lordo">${fmt(totLordo)}</td>
      <td data-label="Da accant." style="color:var(--yellow)">${fmt(cD)}</td>
      <td data-label="Accantonato">${fmt(cM)}</td>
      <td data-label="Delta cum." class="${fd>=0?'delta-pos':'delta-neg'}" style="font-weight:700">${(fd>=0?'+':'')+fmt(fd)}</td>
    </tr></tfoot></table>`;

    if (cM > 0 || cD > 0) {
      if (fd >= 0) {
        h += `<div class="status-box ok"><div class="status-icon">&#10004;</div><div class="status-text">
          <h4 style="color:var(--green)">Sei in pari o in surplus</h4>
          <p>Hai <b>${fmt(fd)}</b> in piu del necessario.</p></div></div>`;
      } else {
        h += `<div class="status-box warn"><div class="status-icon">&#9888;</div><div class="status-text">
          <h4 style="color:var(--red)">Mancano fondi</h4>
          <p>Ti mancano <b>${fmt(Math.abs(fd))}</b>. Recupera nei prossimi mesi.</p></div></div>`;
      }
    }
    h += `</div>`;

    // Cumulative chart
    if (md.length > 1) {
      h += `<div class="panel" style="grid-column:1/-1"><h3>Andamento Cumulato</h3>`;
      const mxC = Math.max(cD, cM, 1);
      const W = 700, H = 200, pL = 10, pR = 10, pT = 10, pB = 30, pW = W-pL-pR, pH = H-pT-pB;
      let dP = '', mP = '';
      const n = md.length;
      for (let i = 0; i < n; i++) {
        const x = pL + (n > 1 ? (i/(n-1))*pW : pW/2);
        dP += (i?'L':'M')+x.toFixed(1)+','+(pT+(1-md[i].cD/mxC)*pH).toFixed(1);
        mP += (i?'L':'M')+x.toFixed(1)+','+(pT+(1-md[i].cM/mxC)*pH).toFixed(1);
      }
      h += `<svg width="100%" viewBox="0 0 ${W} ${H}" style="max-width:${W}px">`;
      for (let i = 0; i <= 4; i++) {
        const y = pT+(i/4)*pH;
        h += `<line x1="${pL}" y1="${y}" x2="${W-pR}" y2="${y}" stroke="rgba(255,255,255,.08)"/>`;
        h += `<text x="${W-pR+4}" y="${y+4}" fill="#aaa" font-size="8">${((mxC*(1-i/4))/1000).toFixed(0)}k</text>`;
      }
      for (let i = 0; i < n; i++) {
        const x = pL + (n > 1 ? (i/(n-1))*pW : pW/2);
        h += `<text x="${x}" y="${H-8}" fill="#aaa" font-size="8" text-anchor="middle">${MONTHS_SHORT[md[i].mese-1]}${md[i].isCrossYear?'*':''}</text>`;
      }
      h += `<path d="${dP}" fill="none" stroke="var(--color-chart-tasse)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      h += `<path d="${mP}" fill="none" stroke="var(--color-cal-lavoro)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      for (let i = 0; i < n; i++) {
        const x = pL + (n > 1 ? (i/(n-1))*pW : pW/2);
        h += `<circle cx="${x}" cy="${pT+(1-md[i].cD/mxC)*pH}" r="3" fill="var(--color-chart-tasse)"/>`;
        if (md[i].cM > 0) h += `<circle cx="${x}" cy="${pT+(1-md[i].cM/mxC)*pH}" r="3" fill="var(--color-cal-lavoro)"/>`;
      }
      h += `</svg><div style="display:flex;gap:16px;margin-top:8px;font-size:.75rem;color:var(--text2)">
        <span><span style="display:inline-block;width:16px;height:3px;background:var(--color-chart-tasse);border-radius:2px;vertical-align:middle;margin-right:4px"></span>Dovuto</span>
        <span><span style="display:inline-block;width:16px;height:3px;background:var(--color-cal-lavoro);border-radius:2px;vertical-align:middle;margin-right:4px"></span>Accantonato</span>
      </div></div>`;
    }

    // Deferred invoices: show accantonamento with target year's tax rate
    const deferredFatture = [];
    for (let m = 1; m <= 12; m++) {
      for (const f of getFatture(m)) {
        if (f.importo > 0 && f.pagAnno && f.pagAnno !== currentYear) {
          deferredFatture.push({ mese: m, importo: f.importo, pagAnno: f.pagAnno, desc: f.desc });
        }
      }
    }
    if (deferredFatture.length > 0) {
      h += `<div class="panel" style="grid-column:1/-1"><h3>Fatture Differite (tassate in altro anno)</h3>`;
      h += `<div style="font-size:.82rem;color:var(--text2);margin-bottom:12px">
        Fatture emesse nel ${currentYear} ma incassate in anni futuri. L'aliquota e quella stimata dell'anno di incasso.</div>`;
      h += `<table class="accant-table"><thead><tr>
        <th style="text-align:left">Fattura</th><th>Importo</th><th>Anno incasso</th><th>Aliquota stimata</th><th>Da accantonare</th>
      </tr></thead><tbody>`;
      let totDef = 0;
      for (const d of deferredFatture) {
        const rate = getEffectiveTaxRateForYear(d.pagAnno);
        const accant = ceil2(d.importo * rate);
        totDef = ceil2(totDef + accant);
        h += `<tr><td data-label="Fattura" style="text-align:left">${MONTHS[d.mese-1]}${d.desc ? ' - ' + d.desc : ''}</td>
          <td data-label="Importo">${fmt(d.importo)}</td>
          <td data-label="Anno incasso">${d.pagAnno}</td>
          <td data-label="Aliquota" style="color:var(--accent)">${fmtPct(rate)}</td>
          <td data-label="Da accantonare" style="color:var(--yellow);font-weight:600">${fmt(accant)}</td></tr>`;
      }
      h += `</tbody><tfoot><tr><td data-label="Fattura" style="text-align:left">Totale</td><td data-label="Importo"></td><td data-label="Anno incasso"></td><td data-label="Aliquota"></td>
        <td data-label="Da accantonare" style="color:var(--yellow);font-weight:600">${fmt(totDef)}</td></tr></tfoot></table></div>`;
    }

    el.innerHTML = h;
  }

  // Esposizione globale per backward compat (chiamate inline da HTML/onclick)
  if (typeof window !== "undefined") {
    window.getFattureForAccantonamentoForYear = getFattureForAccantonamentoForYear;
    window.getFattureForAccantonamento = getFattureForAccantonamento;
    window.getAllFattureForAccantonamento = getAllFattureForAccantonamento;
    window.getPagamentiForYear = getPagamentiForYear;
    window.getPagamenti = getPagamenti;
    window.getPagamentiAcrossYears = getPagamentiAcrossYears;
    window.getTotalAccantonato = getTotalAccantonato;
    window.getTotalDovutoAccantonamento = getTotalDovutoAccantonamento;
    window.getTotalPagamenti = getTotalPagamenti;
    window.addPagamento = addPagamento;
    window.setPagamentoField = setPagamentoField;
    window.setPagamentoImporto = setPagamentoImporto;
    window.removePagamento = removePagamento;
    window.getPaymentEventsForScheduleKey = getPaymentEventsForScheduleKey;
    window.openQuickPayModal = openQuickPayModal;
    window.closeQuickPayModal = closeQuickPayModal;
    window.confirmQuickPay = confirmQuickPay;
    window.addPagamentoFromSchedule = addPagamentoFromSchedule;
    window.removePagamentoByScheduleKey = removePagamentoByScheduleKey;
    window.reopenPaidScheduleItem = reopenPaidScheduleItem;
    window.formatPaymentDateDisplay = formatPaymentDateDisplay;
    window.formatPaymentDateMeta = formatPaymentDateMeta;
    window.positionFloatingPopup = positionFloatingPopup;
    window.openPaymentDatePicker = openPaymentDatePicker;
    window.closePaymentDatePicker = closePaymentDatePicker;
    window.shiftPaymentDatePicker = shiftPaymentDatePicker;
    window.pickPagamentoDate = pickPagamentoDate;
    window.setPagamentoDateToday = setPagamentoDateToday;
    window.clearPagamentoDate = clearPagamentoDate;
    window.renderPaymentDatePicker = renderPaymentDatePicker;
    window.renderAccantonamento = renderAccantonamento;
  }
}());
