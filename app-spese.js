// app-spese.js — Estratto da app.js (Sprint 5.2)
// renderSpese + renderClienti (tab Spese e Clienti).
// Caricato DOPO app.js: usa data, currentYear, MONTHS, fmt, fmtPct, ceil2, saveData,
// recalcAll, getYearDataFor, ensureDataShape ecc. come globali (script-binding cross-script).

(function () {
  'use strict';

  // ═══════════════════ Render: Spese ═══════════════════
  // ────────────────────────────────────────────────────────────────────────────────
  // Render: Clienti
  // ────────────────────────────────────────────────────────────────────────────────
  function renderClienteTableRow(cliente) {
    const id = escapeHtml(cliente.id);
    const nome = escapeHtml(cliente.nome || 'Senza nome');
    const piva = escapeHtml(cliente.partitaIva || '—');
    const citta = escapeHtml(cliente.citta || '—');
    return `<div class="clienti-table-row" data-client-id="${id}" onclick="openClienteModal('${id}')">
      <div class="nome">${nome}</div>
      <div class="piva">${piva}</div>
      <div class="citta">${citta}</div>
      <div class="chevron" aria-hidden="true">&rsaquo;</div>
    </div>`;
  }

  function renderClienti() {
    const el = document.getElementById('clientiContent');
    if (!el) return;
    if (!currentProfile) {
      el.innerHTML = `<div class="clienti-empty">Accedi per gestire l'anagrafica clienti.</div>`;
      return;
    }
    const activeEl = document.activeElement;
    const preserveSearchFocus = activeEl && activeEl.id === 'clientiSearch';
    const searchSelectionStart = preserveSearchFocus && typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : null;
    const searchSelectionEnd = preserveSearchFocus && typeof activeEl.selectionEnd === 'number' ? activeEl.selectionEnd : null;
    const list = getClienti();
    const query = (clientiUiState.search || '').trim().toLowerCase();
    const filtered = list.filter(cliente => matchesClienteSearch(cliente, query));
    let h = `<div class="clienti-toolbar">
      <div class="clienti-search">
        <label for="clientiSearch">Cerca cliente</label>
        <input id="clientiSearch" type="search" value="${escapeHtml(clientiUiState.search || '')}" placeholder="Nome, P.IVA, PEC, citta..." oninput="setClientiSearch(this.value)">
      </div>
      <div class="clienti-toolbar-actions">
        <div class="clienti-count">${filtered.length} / ${list.length} clienti</div>
        <button class="btn-add" type="button" onclick="addCliente()">+ Nuovo cliente</button>
      </div>
    </div>`;
    if (filtered.length === 0) {
      h += `<div class="clienti-empty">${list.length === 0 ? 'Nessun cliente salvato. Crea il primo per usarlo nelle fatture.' : 'Nessun cliente corrisponde al filtro corrente.'}</div>`;
    } else {
      h += `<div class="clienti-table">`;
      h += `<div class="clienti-table-header">
        <div>Nome</div>
        <div>P.IVA</div>
        <div>Citta</div>
        <div></div>
      </div>`;
      for (const cliente of filtered) {
        h += renderClienteTableRow(cliente);
      }
      h += `</div>`;
    }
    el.innerHTML = h;
    if (preserveSearchFocus) {
      const searchEl = document.getElementById('clientiSearch');
      if (searchEl) {
        searchEl.focus();
        if (searchSelectionStart !== null && searchSelectionEnd !== null && typeof searchEl.setSelectionRange === 'function') {
          try {
            searchEl.setSelectionRange(searchSelectionStart, searchSelectionEnd);
          } catch {
            // ignore selection restore issues on some browsers
          }
        }
      }
    }
  }

  function renderSpese() {
    const el = document.getElementById('speseContent');
    const speseAttive = getSpeseAttiveForYear(currentYear);
    const speseStoriche = speseAttive.filter(sp => sp.annoOrigine !== currentYear);
    const totaleCorrente = calcSpeseTotalFor(data.spese);
    const totaleStorico = calcSpeseCarryoverTotalForYear(currentYear);
    let h = '';
    h += `<div class="spese-header"><span>Titolo</span><span>Costo</span><span>Deducib.</span><span>Anni</span><span>Annua</span><span></span></div>`;

    for (let i = 0; i < data.spese.length; i++) {
      const sp = data.spese[i];
      const annua = ((parseFloat(sp.costo)||0) * (parseFloat(sp.deducibilita)||0)) / (parseInt(sp.anni)||1);
      h += `<div class="spese-row">
        <input type="text" value="${sp.titolo||''}" onchange="data.spese[${i}].titolo=this.value;saveData()">
        <input type="number" value="${sp.costo||''}" step="0.01" onchange="data.spese[${i}].costo=this.value;saveData();recalcAll()">
        <input type="number" value="${sp.deducibilita||''}" step="0.01" min="0" max="1" placeholder="0-1" onchange="data.spese[${i}].deducibilita=this.value;saveData();recalcAll()">
        <input type="number" value="${sp.anni||1}" min="1" onchange="data.spese[${i}].anni=this.value;saveData();recalcAll()">
        <span style="font-size:.85rem;color:var(--green)">${fmt(annua)}</span>
        <button class="btn-del" onclick="data.spese.splice(${i},1);saveData();recalcAll()" title="Rimuovi spesa" aria-label="Rimuovi spesa">&times;</button>
      </div>`;
    }
    h += `<button class="btn-add" onclick="data.spese.push({titolo:'',costo:0,deducibilita:1,anni:1});saveData();renderSpese()">+ Aggiungi spesa</button>`;
    if (speseStoriche.length > 0) {
      h += `<div style="margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)">`;
      h += `<div style="font-size:.85rem;color:var(--accent);font-weight:600;margin-bottom:8px">Quote attive da anni precedenti</div>`;
      for (const sp of speseStoriche) {
        const quota = `${sp.quotaAnno}/${sp.anni}`;
        h += row(`${sp.titolo || 'Spesa'} (${sp.annoOrigine}, quota ${quota})`, fmt(sp.annua));
      }
      h += `</div>`;
    }
    h += `<div style="margin-top:16px">`;
    h += row('Quote anno corrente', fmt(totaleCorrente));
    if (totaleStorico > 0) h += row('Quote anni precedenti', fmt(totaleStorico));
    h += row('Totale deducibilita annua', fmt(calcSpeseTotal()), 'highlight', 'positive');
    h += `</div>`;
    el.innerHTML = h;
  }


  if (typeof window !== "undefined") {
    window.renderClienteTableRow = renderClienteTableRow;
    window.renderClienti = renderClienti;
    window.renderSpese = renderSpese;
  }
}());
