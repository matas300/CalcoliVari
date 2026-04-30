// app-charts.js — Render SVG charts (donut + mini bar)
// Estratto da app.js per separare presentazione grafica dal core (SRP).
// Caricato DOPO app.js: usa S, fmt, fmtPct, getCSSVar, getContribLabel,
// getInpsMode, getMonthEuro, MONTHS_SHORT come globali.

(function () {
  'use strict';

  function drawDonut(netto, tasse, contributi, totalLabel) {
    if (typeof totalLabel !== 'string') totalLabel = 'Totale lordo';
    var total = netto + tasse + contributi;
    if (total <= 0) return '<div style="text-align:center;color:var(--text2);padding:30px">Nessun dato</div>';
    var cN = getCSSVar('--color-chart-netto');
    var cT = getCSSVar('--color-chart-tasse');
    var cC = getCSSVar('--color-chart-contributi');
    var size = 180, cx = 90, cy = 90, r = 70, sw = 28, C = 2 * Math.PI * r;
    var pN = netto / total, pT = tasse / total, pC = contributi / total;
    function arc(off, len, col) {
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '"' +
        ' stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
    }
    var svg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
    svg += arc(0, pN * C, cN) + arc(pN * C, pT * C, cT) + arc((pN + pT) * C, pC * C, cC);
    svg += '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" fill="var(--color-text)" font-size="14" font-weight="700">' + fmtPct(pN) + '</text>';
    svg += '<text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" fill="var(--color-text-muted)" font-size="9">netto</text></svg>';
    var tasseLabel = S().regime === 'ordinario' ? 'IRPEF' : 'Imposta sost.';
    var contribLabel = getContribLabel(getInpsMode(S()));
    return '<div class="chart-container">' + svg + '<div class="chart-legend">' +
      '<div class="chart-legend-item"><div class="chart-legend-dot" style="background:' + cN + '"></div><span>Netto</span><span class="chart-legend-val" style="color:' + cN + '">' + fmt(netto) + '</span></div>' +
      '<div class="chart-legend-item"><div class="chart-legend-dot" style="background:' + cT + '"></div><span>' + tasseLabel + '</span><span class="chart-legend-val" style="color:' + cT + '">' + fmt(tasse) + '</span></div>' +
      '<div class="chart-legend-item"><div class="chart-legend-dot" style="background:' + cC + '"></div><span>' + contribLabel + '</span><span class="chart-legend-val" style="color:' + cC + '">' + fmt(contributi) + '</span></div>' +
      '<div class="chart-legend-item" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--color-border)">' +
      '<div class="chart-legend-dot" style="background:transparent"></div><span style="font-weight:600">' + totalLabel + '</span><span class="chart-legend-val">' + fmt(total) + '</span></div>' +
      '</div></div>';
  }

  function drawMiniBars(perc) {
    var safePerc = Math.max(0, Math.min(perc, 1));
    var vals = [];
    for (var m = 1; m <= 12; m++) vals.push(getMonthEuro(m));
    var mx = Math.max.apply(null, vals.concat([1]));
    var h = '<div class="mini-bars">';
    for (var i = 0; i < 12; i++) {
      var hPx = Math.round((vals[i] / mx) * 110);
      var net = vals[i] * (1 - safePerc);
      var tax = vals[i] * safePerc;
      var hN = Math.round((net / mx) * 110);
      var hT = hPx - hN;
      h += '<div class="mini-bar-col">' +
        '<div style="display:flex;flex-direction:column;width:100%;height:' + hPx + 'px">' +
        '<div class="mini-bar" style="height:' + hT + 'px;background:var(--color-chart-tasse);border-radius:3px 3px 0 0;opacity:.6"></div>' +
        '<div class="mini-bar" style="height:' + hN + 'px;background:var(--color-chart-netto);border-radius:0"></div>' +
        '</div>' +
        '<div class="mini-bar-label">' + MONTHS_SHORT[i] + '</div>' +
        '</div>';
    }
    h += '</div>';
    h += '<div style="display:flex;gap:12px;margin-top:8px;font-size:.7rem;color:var(--text2);justify-content:center">' +
      '<span><span style="display:inline-block;width:10px;height:10px;background:var(--color-chart-netto);border-radius:2px;vertical-align:middle;margin-right:3px"></span>Netto</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;background:var(--color-chart-tasse);opacity:.6;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Tasse+C.</span>' +
      '</div>';
    return h;
  }

  if (typeof window !== 'undefined') {
    window.drawDonut = drawDonut;
    window.drawMiniBars = drawMiniBars;
  }
})();
