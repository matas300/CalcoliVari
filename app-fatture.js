// app-fatture.js — Render: Fatture (tab Fatture, vista mensile legacy)
// Estratto da app.js (Sprint 5.4) per separare il dominio Fatture dal core (SRP).
// Caricato DOPO app.js: usa data, currentYear, MONTHS, fmt, fmtPct, ceil2, saveData, recalcAll,
// getFatture, getFattureFromYearData ecc. come globali (script-binding cross-script).

(function () {
  'use strict';

  // ═══════════════════ Render: Fatture ═══════════════════

  // Build one fattura table row (shared between single-row and multi-row month)
  function _renderFatturaRow(f, m, fi, nFatt, stim) {
    const isFirst = fi === 0;
    const isLast = fi === nFatt - 1;
    const imp = f.importo || 0;
    const hasPag = f.pagMese && f.pagAnno;
    const isDiffYear = hasPag && f.pagAnno !== currentYear;
    const isNC = f.tipoDocumento === 'TD04';
    const isStornata = f.stato === 'stornata';
    const isLegacy = f.origine === 'legacy-migrated' || !f.origine; // no origin = legacy store fallback
    const hasId = !!f.id;

    let rowClass = '';
    if (isNC) rowClass += ' fatt-row-nc';
    if (isStornata) rowClass += ' fatt-row-stornata';
    if (!isLegacy && hasId) rowClass += ' fatt-row-readonly';

    // Description: for legacy rows use f.desc; for others use first riga desc + cliente
    const desc = f.desc || '';

    // Import cell
    let importoCell;
    if (!isLegacy && hasId) {
      // Read-only display for wizard / manuale rows
      const impFormatted = fmt(Math.abs(imp));
      importoCell = `<span class="fatt-input-importo" style="${isNC ? 'color:var(--color-error)' : ''}">${isNC ? '−' : ''}${impFormatted}</span>`;
      if (isStornata && window.FattureSelectors) {
        const fullFatt = window.FattureSelectors.all(currentProfile).find(x => x.id === f.id);
        if (fullFatt) {
          const netto = window.FattureSelectors.getNettoEffettivo(fullFatt);
          importoCell += `<div class="fatt-row-stornata-netto">Netto eff.: ${fmt(netto)}</div>`;
        }
      }
    } else {
      const dispImp = isNC ? -Math.abs(imp) : imp;
      importoCell = `<input type="number" value="${dispImp || ''}" placeholder="—"
        onchange="setFatturaImporto(${m},${fi},this.value);recalcAll()" class="fatt-input-importo"
        style="${isNC ? 'color:var(--color-error)' : ''}">`;
    }

    // Desc cell
    let descCell;
    if (!isLegacy && hasId) {
      const ncPrefix = isNC ? 'NC — ' : '';
      descCell = `<span class="fatt-input-desc" title="${escapeHtml ? escapeHtml(desc) : desc}">${ncPrefix}${desc || '—'}</span>`;
    } else {
      descCell = `<input type="text" value="${desc}" placeholder="—"
        onchange="setFatturaDesc(${m},${fi},this.value)" class="fatt-input-desc">`;
    }

    // Payment cell
    const pagCellDisabled = imp <= 0;
    const pagCell = `<div class="pag-cell">
      <select class="pag-mese" onchange="setPagMese(${m},${fi},this.value)" ${pagCellDisabled ? 'disabled' : ''}>
        <option value="">Mese...</option>
        ${MONTHS.map((ms, i) => `<option value="${i+1}" ${f.pagMese === (i+1) ? 'selected' : ''}>${ms}</option>`).join('')}
      </select>
      <input type="number" class="pag-anno fatt-input-anno" value="${f.pagAnno || ''}" placeholder="${currentYear}" min="2020" max="2040"
        onchange="setPagAnno(${m},${fi},this.value)" ${pagCellDisabled ? 'disabled' : ''}>
      <button class="btn-oggi" onclick="setPagOggi(${m},${fi})" title="Oggi" ${pagCellDisabled ? 'disabled' : ''}>Oggi</button>
      ${isDiffYear ? `<span class="pag-warn">&rarr; ${f.pagAnno}</span>` : ''}
    </div>`;

    // Actions cell
    let actionsHtml = '';
    if (isLast) actionsHtml += `<button class="btn-add-fatt" onclick="addFattura(${m})" title="Aggiungi" aria-label="Aggiungi fattura">+</button>`;
    if (!isLegacy && hasId) {
      actionsHtml += `<button class="btn-open-fatt" onclick="window.openFatturaModal && window.openFatturaModal('${f.id}')" title="Apri fattura">Apri</button>`;
    } else if (nFatt > 1) {
      actionsHtml += `<button class="btn-del-fatt" onclick="removeFattura(${m},${fi})" title="Rimuovi" aria-label="Rimuovi fattura">&times;</button>`;
    }

    return `<tr class="${!isFirst ? 'fatt-subrow' : ''}${rowClass}">
      <td data-label="Mese">${isFirst ? MONTHS[m-1] : ''}</td>
      <td data-label="Importo">${importoCell}</td>
      <td data-label="Desc">${descCell}</td>
      <td data-label="Stimato" style="color:var(--text2)">${isFirst ? fmt(stim) : ''}</td>
      <td data-label="Tassato nel">${pagCell}</td>
      <td data-label="" class="fatt-actions">${actionsHtml}</td></tr>`;
  }

  function renderFatture() {
    const table = document.getElementById('fattureTable');
    if (typeof renderFattureDocsSection === 'function') renderFattureDocsSection();
    // Banner warning hard-delete (modalità test)
    const fattureTab = document.getElementById('tab-fatture');
    if (fattureTab) {
      const existing = fattureTab.querySelector('.fatture-banner-warning');
      const active = (parseInt((data.settings || {}).devHardDelete, 10) || 0) === 1;
      if (active && !existing) {
        const banner = document.createElement('div');
        banner.className = 'fatture-banner-warning';
        banner.textContent = '\u26A0 Hard-delete attivo — modalità test';
        const panel = fattureTab.querySelector('.panel');
        if (panel) panel.insertBefore(banner, panel.firstChild);
        else fattureTab.insertBefore(banner, fattureTab.firstChild);
      } else if (!active && existing) {
        existing.remove();
      }
    }
    let h = `<thead><tr><th>Mese</th><th>Importo</th><th>Desc</th><th>Stimato</th><th>Tassato nel</th><th></th></tr></thead><tbody>`;
    let tF = 0, tS = 0;

    for (let m = 1; m <= 12; m++) {
      const stim = getMonthStimato(m);
      const fatture = getFattureIssued(m);
      const nFatt = fatture.length;
      const totalFatt = fatture.reduce((s, f) => s + (f.importo || 0), 0);
      tF += totalFatt; tS += stim;

      if (nFatt <= 1) {
        const f = fatture[0] || { importo: 0, pagMese: null, pagAnno: null, desc: '', origine: 'legacy-migrated' };
        if (nFatt === 0) {
          // No fattura: show empty editable row (legacy-compatible)
          h += `<tr><td data-label="Mese">${MONTHS[m-1]}</td>
            <td data-label="Importo"><input type="number" value="" placeholder="—"
              onchange="setFatturaImporto(${m},0,this.value);recalcAll()" class="fatt-input-importo"></td>
            <td data-label="Desc"><input type="text" value="" placeholder="—"
              onchange="setFatturaDesc(${m},0,this.value)" class="fatt-input-desc"></td>
            <td data-label="Stimato" style="color:var(--text2)">${fmt(stim)}</td>
            <td data-label="Tassato nel"><div class="pag-cell">
              <select class="pag-mese" onchange="setPagMese(${m},0,this.value)" disabled>
                <option value="">Mese...</option>
                ${MONTHS.map((ms, i) => `<option value="${i+1}">${ms}</option>`).join('')}
              </select>
              <input type="number" class="pag-anno fatt-input-anno" value="" placeholder="${currentYear}" min="2020" max="2040"
                onchange="setPagAnno(${m},0,this.value)" disabled>
              <button class="btn-oggi" onclick="setPagOggi(${m},0)" title="Oggi" disabled>Oggi</button>
            </div></td>
            <td data-label=""><button class="btn-add-fatt" onclick="addFattura(${m})" title="Aggiungi fattura" aria-label="Aggiungi fattura">+</button></td></tr>`;
        } else {
          h += _renderFatturaRow(f, m, 0, 1, stim);
        }
      } else {
        for (let fi = 0; fi < nFatt; fi++) {
          h += _renderFatturaRow(fatture[fi], m, fi, nFatt, stim);
        }
        h += `<tr class="fatt-total-row"><td data-label=""></td>
          <td data-label="" colspan="2" style="font-weight:600;font-size:.78rem;color:var(--accent)">Totale mese: ${fmt(totalFatt)}</td>
          <td data-label=""></td><td data-label=""></td><td data-label=""></td></tr>`;
      }
    }

    h += `</tbody><tfoot><tr><td data-label="Mese">Totale</td><td data-label="Importo" colspan="2">${fmt(tF)}</td><td data-label="Stimato">${fmt(tS)}</td><td data-label=""></td><td data-label=""></td></tr></tfoot>`;
    table.innerHTML = h;

    // Cross-year invoices info
    const crossYear = getCrossYearInvoices();
    let crossHtml = '';
    if (crossYear.length > 0) {
      const crossTot = crossYear.reduce((s, i) => s + i.importo, 0);
      crossHtml += `<div class="status-box ok" style="margin-bottom:16px">
        <div class="status-icon" style="font-size:1.2rem">&#8592;</div>
        <div class="status-text">
          <h4 style="color:var(--yellow);font-size:.88rem">Fatture di anni precedenti incassate nel ${currentYear}</h4>
          <p>${crossYear.map(i => `${MONTHS[i.mese-1]} ${i.anno}: ${fmt(i.importo)}${i.desc?' ('+i.desc+')':''}`).join(' &bull; ')}
          &mdash; Totale: <b>${fmt(crossTot)}</b></p></div></div>`;
    }

    // Deferred invoices info (emesse nell'anno ma incassate in altro anno)
    const deferred = [];
    for (let m = 1; m <= 12; m++) {
      for (const f of getFattureIssued(m)) {
        if (f.importo > 0 && f.pagAnno && f.pagAnno !== currentYear) {
          deferred.push({ mese: m, importo: f.importo, pagAnno: f.pagAnno, desc: f.desc });
        }
      }
    }
    if (deferred.length > 0) {
      const defTot = deferred.reduce((s, i) => s + i.importo, 0);
      crossHtml += `<div class="status-box warn" style="margin-bottom:16px">
        <div class="status-icon" style="font-size:1.2rem">&#8594;</div>
        <div class="status-text">
          <h4 style="color:var(--yellow);font-size:.88rem">Fatture ${currentYear} tassate in altro anno</h4>
          <p>${deferred.map(i => `${MONTHS[i.mese-1]}${i.desc?' ('+i.desc+')':''}: ${fmt(i.importo)} &rarr; ${i.pagAnno}`).join(' &bull; ')}
          &mdash; Totale: <b>${fmt(defTot)}</b></p></div></div>`;
    }

    // tF ora è la somma per mese di EMISSIONE (issuedMonth), quindi già rappresenta
    // le fatture emesse nell'anno. Niente più somma con cross-year paid-in.
    const tFTotal = tF;
    const lim = S().limiteForfettario, pct = lim > 0 ? Math.min(tFTotal/lim*100, 100) : 0;
    document.getElementById('incassoSection').innerHTML = crossHtml + `
      <div class="row" style="margin-top:16px"><label>Fatturato ${currentYear}</label><span class="val">${fmt(tFTotal)}</span></div>
      <div class="row"><label>Mancante al limite (${fmt(lim)})</label><span class="val">${fmt(lim-tFTotal)}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--green),${pct>90?'var(--red)':'var(--blue)'})"></div>
      <div class="progress-text">${pct.toFixed(1)}%</div></div>`;
  }

  function setPagMese(month, idx, val) {
    const fatture = getFatture(month);
    const f = fatture[idx] || { pagMese: null, pagAnno: null };
    const m = parseInt(val) || null;
    const a = f.pagAnno || currentYear;
    setFatturaPagamento(month, idx, m, m ? a : null);
    recalcAll();
  }

  function setPagAnno(month, idx, val) {
    const fatture = getFatture(month);
    const f = fatture[idx] || { pagMese: null, pagAnno: null };
    const a = parseInt(val) || null;
    setFatturaPagamento(month, idx, f.pagMese || new Date().getMonth() + 1, a);
    recalcAll();
  }

  function setPagOggi(month, idx) {
    // "Oggi" = data emissione oggi; l'incasso stimato = oggi + giorniIncasso.
    // Imposta pagMese/pagAnno sul mese/anno dell'incasso stimato.
    const giorni = parseFloat(S().giorniIncasso) || 30;
    const expected = new Date();
    expected.setDate(expected.getDate() + giorni);
    setFatturaPagamento(month, idx, expected.getMonth() + 1, expected.getFullYear());
    recalcAll();
  }


  if (typeof window !== "undefined") {
    window._renderFatturaRow = _renderFatturaRow;
    window.renderFatture = renderFatture;
    window.setPagMese = setPagMese;
    window.setPagAnno = setPagAnno;
    window.setPagOggi = setPagOggi;
  }
}());
