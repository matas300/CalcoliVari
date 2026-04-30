// app-budget.js — Estratto da app.js (Sprint 5.2)
// Budget helpers + renderBudget (Render: Budget tab).
// Caricato DOPO app.js: usa data, currentYear, MONTHS, fmt, fmtPct, ceil2, saveData,
// recalcAll, getYearDataFor, ensureDataShape ecc. come globali (script-binding cross-script).

(function () {
  'use strict';

  // ═══════════════════ Budget helpers ═══════════════════

  // Find all fatture across years for the current profile, sorted newest first
  function getAllFattureForBudget() {
    const results = [];

    if (typeof window !== 'undefined' && window.FattureSelectors && currentProfile) {
      const all = window.FattureSelectors.all(currentProfile);
      // Group by (pagAnno, pagMese) — only non-bozza with a pagamento date
      const byKey = {};
      for (const f of all) {
        if (f.stato === 'bozza') continue;
        const pa = Number(f.pagAnno);
        const pm = Number(f.pagMese);
        if (!pa || !pm) continue;
        const key = pa + '_' + pm;
        if (!byKey[key]) byKey[key] = { year: pa, month: pm, lordo: 0 };
        byKey[key].lordo += window.FattureSelectors.getImportoSigned(f);
      }
      for (const key in byKey) {
        const { year: y, month: mo, lordo } = byKey[key];
        if (lordo <= 0) continue;
        const rate = y === currentYear ? getEffectiveTaxRate() : getEffectiveTaxRateForYear(y);
        results.push({ year: y, month: mo, lordo, netto: lordo * (1 - rate), rate });
      }
      results.sort((a, b) => b.year - a.year || b.month - a.month);
      return results;
    }

    // Legacy fallback: iterate yearData.fatture across stored years
    const yearsToCheck = [];
    for (let y = currentYear + 1; y >= currentYear - 5; y--) yearsToCheck.push(y);
    for (const y of yearsToCheck) {
      const yd = y === currentYear ? data : loadYearData(y);
      if (!yd || !yd.fatture) continue;
      const rate = y === currentYear ? getEffectiveTaxRate() : getEffectiveTaxRateForYear(y);
      for (let m = 12; m >= 1; m--) {
        const raw = yd.fatture[m];
        if (!raw) continue;
        const arr = Array.isArray(raw) ? raw : [raw];
        const total = arr.reduce((s, f) => s + (parseFloat(typeof f === 'number' ? f : f.importo) || 0), 0);
        if (total > 0) {
          results.push({ year: y, month: m, lordo: total, netto: total * (1 - rate), rate });
        }
      }
    }
    results.sort((a, b) => b.year - a.year || b.month - a.month);
    return results;
  }

  function getBudgetNettoMensile() {
    const baseY = data.budgetBaseYear;
    const baseM = data.budgetBaseMonth;

    if (baseY && baseM) {
      // User selected a specific month — prefer selectors, then legacy
      let total = 0;
      if (typeof window !== 'undefined' && window.FattureSelectors && currentProfile) {
        const fatture = window.FattureSelectors.getByMonth(currentProfile, baseY, baseM);
        total = fatture.reduce((s, f) => s + window.FattureSelectors.getImportoSigned(f), 0);
      } else {
        const yd = baseY === currentYear ? data : loadYearData(baseY);
        if (yd && yd.fatture) {
          const raw = yd.fatture[baseM];
          const arr = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
          total = arr.reduce((s, f) => s + (parseFloat(typeof f === 'number' ? f : f.importo) || 0), 0);
        }
      }
      if (total > 0) {
        const rate = baseY === currentYear ? getEffectiveTaxRate() : getEffectiveTaxRateForYear(baseY);
        return { netto: total * (1 - rate), lordo: total, rate, year: baseY, month: baseM, source: 'manual' };
      }
    }

    // Auto: find latest fattura
    const allFatture = getAllFattureForBudget();
    if (allFatture.length > 0) {
      const latest = allFatture[0];
      return { netto: latest.netto, lordo: latest.lordo, rate: latest.rate, year: latest.year, month: latest.month, source: 'auto' };
    }

    // Fallback: annual average
    const nettoAnnuo = getEffectiveNetto();
    return { netto: nettoAnnuo / 12, lordo: 0, rate: getEffectiveTaxRate(), year: null, month: null, source: 'media' };
  }

  function setBudgetBase(year, month) {
    data.budgetBaseYear = year ? parseInt(year) : null;
    data.budgetBaseMonth = month ? parseInt(month) : null;
    saveData();
    renderBudget();
  }

  function budgetSetImporto(idx, val) {
    data.budget[idx].importo = parseFloat(val) || 0;
    saveData(); renderBudget();
  }

  function budgetSetPercent(idx, val) {
    const { netto: nettoMensile } = getBudgetNettoMensile();
    const pct = parseFloat(val) || 0;
    data.budget[idx].importo = ceil2(nettoMensile * pct / 100);
    saveData(); renderBudget();
  }

  // ═══════════════════ Render: Budget ═══════════════════
  function renderBudget() {
    const el = document.getElementById('budgetContent');
    const base = getBudgetNettoMensile();
    const nettoMensile = base.netto;
    const allFatture = getAllFattureForBudget();

    // Budget base selector
    let h = `<div class="budget-base-selector">
      <div style="font-size:.85rem;color:var(--text2);margin-bottom:8px">Fattura di riferimento per il budget:</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <select id="budgetBaseYear" onchange="setBudgetBase(this.value, document.getElementById('budgetBaseMonth').value)">
          <option value="">Auto (ultima)</option>`;

    // Collect available years
    const availYears = [...new Set(allFatture.map(f => f.year))].sort((a, b) => b - a);
    for (const y of availYears) {
      h += `<option value="${y}" ${data.budgetBaseYear === y ? 'selected' : ''}>${y}</option>`;
    }
    h += `</select>
        <select id="budgetBaseMonth" onchange="setBudgetBase(document.getElementById('budgetBaseYear').value, this.value)"
          ${!data.budgetBaseYear ? 'disabled' : ''}>
          <option value="">Mese...</option>`;
    // Show months that have fatture for the selected year (or all if auto)
    const filterYear = data.budgetBaseYear || (allFatture.length > 0 ? allFatture[0].year : currentYear);
    const availMonths = allFatture.filter(f => f.year === filterYear).map(f => f.month);
    for (let m = 1; m <= 12; m++) {
      const hasFatt = availMonths.includes(m);
      if (hasFatt) {
        const fatt = allFatture.find(f => f.year === filterYear && f.month === m);
        h += `<option value="${m}" ${data.budgetBaseMonth === m ? 'selected' : ''}>${MONTHS_SHORT[m-1]} — ${fmt(fatt.lordo)}</option>`;
      }
    }
    h += `</select>`;

    // Show current base info
    if (base.month) {
      h += `<span style="font-size:.82rem;color:var(--text2)">
        ${MONTHS_SHORT[base.month-1]} ${base.year}: ${fmt(base.lordo)} lordo
        &rarr; <b style="color:var(--green)">${fmt(nettoMensile)}</b> netto
        <span style="font-size:.72rem">(aliq. ${fmtPct(base.rate)})</span>
      </span>`;
    } else {
      h += `<span style="font-size:.82rem;color:var(--text2)">Media annuale: <b style="color:var(--green)">${fmt(nettoMensile)}</b></span>`;
    }

    h += `</div></div>`;

    h += `<div style="margin:16px 0 12px;font-size:.88rem;color:var(--text2)">
      Netto mensile: <b style="color:var(--green)">${fmt(nettoMensile)}</b></div>`;

    h += `<div class="budget-header"><span>Voce</span><span>Importo mensile (€)</span><span>%</span><span style="text-align:center;font-size:.65rem">Auto</span><span></span></div>`;

    // Calculate auto-fill: items with auto=true and no manual importo get the remaining split equally
    let totManual = 0, autoCount = 0;
    for (const b of data.budget) {
      if (b.auto && !(parseFloat(b.importo) > 0)) autoCount++;
      else totManual += parseFloat(b.importo) || 0;
    }
    const autoAmount = autoCount > 0 && nettoMensile > totManual ? (nettoMensile - totManual) / autoCount : 0;

    let totBudget = 0;
    for (let i = 0; i < data.budget.length; i++) {
      const b = data.budget[i];
      const isAuto = b.auto && !(parseFloat(b.importo) > 0);
      const val = isAuto ? autoAmount : (parseFloat(b.importo) || 0);
      totBudget += val;
      const pct = nettoMensile > 0 ? (val / nettoMensile * 100) : 0;
      h += `<div class="budget-row budget-row-5">
        <input type="text" value="${b.nome||''}" placeholder="es. Affitto, Cibo..."
          onchange="data.budget[${i}].nome=this.value;saveData();renderBudget()">
        <input type="number" value="${isAuto?'':val||''}" placeholder="${isAuto?(autoAmount?autoAmount.toFixed(2):'0'):'0'}" step="0.01"
          onchange="budgetSetImporto(${i},this.value)">
        <input type="number" value="${pct?pct.toFixed(1):''}" placeholder="%" step="0.1" min="0" max="100"
          onchange="budgetSetPercent(${i},this.value)" style="text-align:center">
        <label class="budget-auto-check"><input type="checkbox" ${b.auto?'checked':''}
          onchange="data.budget[${i}].auto=this.checked;if(this.checked)data.budget[${i}].importo=0;saveData();renderBudget()"></label>
        <button class="btn-del" onclick="data.budget.splice(${i},1);saveData();renderBudget()" title="Rimuovi voce budget" aria-label="Rimuovi voce budget">&times;</button>
      </div>`;
    }

    h += `<button class="btn-add" onclick="data.budget.push({nome:'',importo:0});saveData();renderBudget()">+ Aggiungi voce</button>`;

    const rimanente = nettoMensile - totBudget;
    h += `<div style="margin-top:20px">`;
    h += row('Totale voci', fmt(totBudget), '', 'negative');
    h += row('Rimanente', fmt(rimanente), 'highlight', rimanente >= 0 ? 'positive' : 'negative');
    h += `</div>`;

    if (data.budget.length > 0 && nettoMensile > 0) {
      // Build computed values array (including auto items)
      const budgetVals = data.budget.map(b => {
        const isAuto = b.auto && !(parseFloat(b.importo) > 0);
        return { nome: b.nome, val: isAuto ? autoAmount : (parseFloat(b.importo) || 0), isAuto };
      });
      const colors = [
        getCSSVar('--color-cal-lavoro'), getCSSVar('--color-cal-mezzagiornata'),
        getCSSVar('--color-cal-ferie'), getCSSVar('--color-chart-tasse'),
        getCSSVar('--color-cal-donazione'), getCSSVar('--color-cal-malattia'),
        getCSSVar('--color-success'), getCSSVar('--color-info'),
        getCSSVar('--color-primary'), getCSSVar('--color-error')
      ];
      h += `<div style="margin-top:20px"><div style="font-size:.85rem;color:var(--text2);margin-bottom:8px">Distribuzione sul netto mensile</div>`;
      h += `<div style="display:flex;height:28px;border-radius:6px;overflow:hidden;margin-bottom:12px">`;
      for (let i = 0; i < budgetVals.length; i++) {
        const { val, isAuto } = budgetVals[i];
        if (val <= 0) continue;
        const w = (val / nettoMensile * 100);
        h += `<div style="width:${w}%;background:${colors[i%colors.length]}${isAuto?';opacity:.6':''};display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;color:#000;min-width:2px"
          title="${budgetVals[i].nome}: ${fmt(val)}${isAuto?' (auto)':''}">${w > 8 ? Math.round(w)+'%' : ''}</div>`;
      }
      if (rimanente > 0) {
        h += `<div style="width:${(rimanente/nettoMensile*100)}%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:.65rem;color:var(--text2)">
          ${rimanente/nettoMensile > 0.08 ? Math.round(rimanente/nettoMensile*100)+'%' : ''}</div>`;
      }
      h += `</div>`;
      for (let i = 0; i < budgetVals.length; i++) {
        const { val, nome, isAuto } = budgetVals[i];
        if (val <= 0) continue;
        const pct = (val / nettoMensile * 100).toFixed(1);
        h += `<div style="display:flex;align-items:center;gap:8px;font-size:.8rem;margin-bottom:4px;font-variant-numeric:tabular-nums">
          <span style="width:12px;height:12px;border-radius:3px;background:${colors[i%colors.length]}${isAuto?';opacity:.6':''};flex-shrink:0"></span>
          <span style="color:var(--text2)">${nome || 'Voce '+(i+1)}${isAuto?' (auto)':''}</span>
          <span style="margin-left:auto;font-weight:600;min-width:100px;text-align:right">${fmt(val)}</span>
          <span style="color:var(--text2);font-size:.75rem;min-width:60px;text-align:right">(${pct}%)</span></div>`;
      }
      if (rimanente > 0) {
        h += `<div style="display:flex;align-items:center;gap:8px;font-size:.8rem;margin-bottom:4px;font-variant-numeric:tabular-nums">
          <span style="width:12px;height:12px;border-radius:3px;background:rgba(255,255,255,.15);flex-shrink:0"></span>
          <span style="color:var(--text2)">Rimanente</span>
          <span style="margin-left:auto;font-weight:600;color:var(--green);min-width:100px;text-align:right">${fmt(rimanente)}</span>
          <span style="color:var(--text2);font-size:.75rem;min-width:60px;text-align:right">(${(rimanente/nettoMensile*100).toFixed(1)}%)</span></div>`;
      }
      h += `</div>`;
    }

    el.innerHTML = h;
  }


  if (typeof window !== "undefined") {
    window.getAllFattureForBudget = getAllFattureForBudget;
    window.getBudgetNettoMensile = getBudgetNettoMensile;
    window.setBudgetBase = setBudgetBase;
    window.budgetSetImporto = budgetSetImporto;
    window.budgetSetPercent = budgetSetPercent;
    window.renderBudget = renderBudget;
  }
}());
