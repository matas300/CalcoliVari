// ═══════════════════ Profili / Login ═══════════════════
const PROFILE_HASHES = {
  'd9b5e452afd6cdea8583147634c3f85a0ba60fc17ad5e6f069a99d3b4ec35194': 'Mattia',
  'cfaa4bd87a413b57e7e3b4a0d5b220aa500aa5d4f60faf938a8dad50e3def77d': 'Peru',
  '83ebba2cb71eb1417fd5ccaa12155a3be83cb97bc6fd7ef28500d100d84f8019': 'Demo'
};
let currentProfile = sessionStorage.getItem('currentProfile') || null;

async function hashPassword(pwd) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function doLogin() {
  const pwd = document.getElementById('loginPassword').value;
  const hash = await hashPassword(pwd);
  const profile = PROFILE_HASHES[hash];
  if (!profile) {
    document.getElementById('loginError').textContent = 'Password errata';
    return;
  }
  currentProfile = profile;
  sessionStorage.setItem('currentProfile', profile);
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('profileBadge').textContent = profile;

  // Seed historical data (once per profile)
  if (profile === 'Mattia') seedMattiaData();
  if (profile === 'Peru') seedPeruData();

  // Init Firebase and sync
  const fbOk = await initFirebase();
  if (fbOk) {
    const cloudCount = await syncAllFromCloud(profile);
    // If cloud had no data, upload local seed data
    if (cloudCount === 0) {
      await syncAllToCloud(profile);
    }
  }

  loadData();
  recalcAll();
}

function doLogout() {
  currentProfile = null;
  sessionStorage.removeItem('currentProfile');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
}

function checkSession() {
  if (currentProfile) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('profileBadge').textContent = currentProfile;
    // Init Firebase in background, then sync cloud → local → refresh UI
    initFirebase().then(ok => {
      if (ok) {
        syncAllFromCloud(currentProfile).then(count => {
          loadData();
          recalcAll();
          // Also push any local-only changes to cloud
          if (typeof syncAllToCloud === 'function') syncAllToCloud(currentProfile);
        });
      }
    });
    return true;
  }
  return false;
}

// ── Constants ──
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MONTHS_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const ACTIVITY_INFO = {
  '':  { label: '—',            color: 'rgba(255,255,255,.04)', dark: true },
  '8': { label: 'Lavoro',       color: '#4ecca3', dark: false },
  'WE':{ label: 'Weekend',      color: 'rgba(255,255,255,.12)', dark: true },
  'F': { label: 'Ferie',        color: '#f5a623', dark: false },
  'FS':{ label: 'Festivo',      color: '#e94560', dark: false },
  'M': { label: '1/2 giornata', color: '#4a9eff', dark: false },
  'Malattia':  { label: 'Malattia',  color: '#e67e22', dark: false },
  'Donazione': { label: 'Donazione', color: '#533483', dark: false },
};
const HOLIDAYS = [[1,1],[1,6],[4,25],[5,1],[6,2],[8,15],[11,1],[12,8],[12,25],[12,26]];

let currentYear = new Date().getFullYear();
let data = {};

// ═══════════════════ Storage ═══════════════════
function storageKey(y) { return 'calcoliPIVA_' + currentProfile + '_' + (y || currentYear); }

function loadYearData(y) {
  const raw = localStorage.getItem(storageKey(y));
  return raw ? JSON.parse(raw) : null;
}

function loadData() {
  const raw = localStorage.getItem(storageKey());
  data = raw ? JSON.parse(raw) : {};
  if (!data.settings) data.settings = getDefaultSettings();
  if (!data.fatture) data.fatture = {};
  if (!data.calendar) data.calendar = {};
  if (!data.accantonamento) data.accantonamento = {};
  if (!data.budget) data.budget = [];
  if (!data.spese) data.spese = [];
  if (data.settings.dailyRate === undefined) data.settings.dailyRate = 315;
  if (data.settings.regime === undefined) data.settings.regime = 'forfettario';
  if (data.settings.giorniIncasso === undefined) data.settings.giorniIncasso = 30;
  migrateFatture();
  applySettings();
}

function migrateFatture() {
  for (const m of Object.keys(data.fatture)) {
    const v = data.fatture[m];
    if (typeof v === 'number') {
      data.fatture[m] = [{ importo: v, pagMese: null, pagAnno: null, desc: '' }];
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (v.pagMese === undefined) v.pagMese = null;
      if (v.pagAnno === undefined) v.pagAnno = null;
      if (v.desc === undefined) v.desc = '';
      data.fatture[m] = [v];
    }
    // Already array: leave as-is
  }
}

function saveData() {
  localStorage.setItem(storageKey(), JSON.stringify(data));
  if (typeof syncToCloud === 'function' && currentProfile) {
    syncToCloud(currentProfile, currentYear, data);
  }
}

function getDefaultSettings() {
  return {
    dailyRate: 315, coefficiente: 67, impostaSostitutiva: 15,
    contribFissi: 4515.43, minimaleInps: 18415, aliqContributi: 24.8,
    riduzione35: 0, limiteForfettario: 85000, regime: 'forfettario',
    giorniIncasso: 30
  };
}

function applySettings() {
  const s = data.settings;
  const fields = {
    settDailyRate: 'dailyRate', settCoeff: 'coefficiente',
    settImposta: 'impostaSostitutiva', settContribFissi: 'contribFissi',
    settMinimale: 'minimaleInps', settAliqContr: 'aliqContributi',
    settLimite: 'limiteForfettario', settGiorniIncasso: 'giorniIncasso'
  };
  for (const [id, key] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.value = s[key];
  }
  const rid = document.getElementById('settRiduzione');
  if (rid) rid.value = s.riduzione35;
  const navBtn = document.querySelector('[data-tab="calcolo"]');
  if (navBtn) navBtn.textContent = s.regime === 'forfettario' ? 'Regime Forfettario' : 'Regime Ordinario';
  const speseBtn = document.querySelector('[data-tab="spese"]');
  if (speseBtn) speseBtn.style.display = s.regime === 'ordinario' ? '' : 'none';
}

function saveSetting(key, val) {
  data.settings[key] = parseFloat(val) || 0;
  saveData();
}
function S() { return data.settings; }

function setRegime(r) {
  data.settings.regime = r;
  saveData();
  applySettings();
  recalcAll();
}

function changeYear(d) {
  saveData();
  currentYear += d;
  document.getElementById('yearDisplay').textContent = currentYear;
  loadData();
  recalcAll();
}

// ═══════════════════ Date helpers ═══════════════════
function getEaster(year) {
  const a = year % 19, b = Math.floor(year/100), c = year % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
  const i = Math.floor(c/4), k = c % 4;
  const l = (32+2*e+2*i-h-k) % 7;
  const m = Math.floor((a+11*h+22*l)/451);
  return [Math.floor((h+l-7*m+114)/31), ((h+l-7*m+114) % 31) + 1];
}

function isHoliday(year, month, day) {
  for (const [hm, hd] of HOLIDAYS) if (month === hm && day === hd) return true;
  const [em, ed] = getEaster(year);
  const easter = new Date(year, em - 1, ed);
  const mon = new Date(easter); mon.setDate(mon.getDate() + 1);
  if (month === em && day === ed) return true;
  if (month === (mon.getMonth() + 1) && day === mon.getDate()) return true;
  return false;
}

function getDefaultActivity(year, month, day) {
  const d = new Date(year, month - 1, day);
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return 'WE';
  if (isHoliday(year, month, day)) return 'FS';
  return '8';
}

function getActivity(month, day) {
  const key = month + '-' + day;
  return data.calendar[key] !== undefined ? data.calendar[key] : getDefaultActivity(currentYear, month, day);
}

function setActivity(month, day, val) {
  const key = month + '-' + day;
  if (val === getDefaultActivity(currentYear, month, day)) delete data.calendar[key];
  else data.calendar[key] = val;
  saveData(); recalcAll();
}

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

// ═══════════════════ Fatture helpers ═══════════════════
function getFatture(month) {
  const arr = data.fatture[month];
  if (!arr || !Array.isArray(arr) || arr.length === 0) return [];
  return arr.map(f => ({
    importo: parseFloat(f.importo) || 0,
    pagMese: f.pagMese || null,
    pagAnno: f.pagAnno || null,
    desc: f.desc || ''
  }));
}

function getFattura(month) {
  const arr = getFatture(month);
  if (arr.length === 0) return { importo: 0, pagMese: null, pagAnno: null };
  const total = arr.reduce((s, f) => s + f.importo, 0);
  if (arr.length === 1) return { importo: total, pagMese: arr[0].pagMese, pagAnno: arr[0].pagAnno };
  return { importo: total, pagMese: null, pagAnno: null };
}

function setFatturaImporto(month, idx, val) {
  if (!data.fatture[month]) data.fatture[month] = [{ importo: 0, pagMese: null, pagAnno: null, desc: '' }];
  if (!data.fatture[month][idx]) return;
  data.fatture[month][idx].importo = parseFloat(val) || 0;
  saveData();
}

function setFatturaDesc(month, idx, val) {
  if (!data.fatture[month] || !data.fatture[month][idx]) return;
  data.fatture[month][idx].desc = val;
  saveData();
}

function setFatturaPagamento(month, idx, pagMese, pagAnno) {
  if (!data.fatture[month]) data.fatture[month] = [{ importo: 0, pagMese: null, pagAnno: null, desc: '' }];
  if (!data.fatture[month][idx]) return;
  data.fatture[month][idx].pagMese = pagMese;
  data.fatture[month][idx].pagAnno = pagAnno;
  saveData();
}

function addFattura(month) {
  if (!data.fatture[month]) data.fatture[month] = [];
  data.fatture[month].push({ importo: 0, pagMese: null, pagAnno: null, desc: '' });
  saveData();
  recalcAll();
}

function removeFattura(month, idx) {
  if (!data.fatture[month] || data.fatture[month].length <= 1) return;
  data.fatture[month].splice(idx, 1);
  saveData();
  recalcAll();
}

// ═══════════════════ Stats ═══════════════════
function getMonthStats(month) {
  const dim = daysInMonth(currentYear, month);
  const stats = { worked: 0, F: 0, FS: 0, WE: 0, M: 0, Malattia: 0, Donazione: 0, total: dim };
  for (let d = 1; d <= dim; d++) {
    const act = getActivity(month, d);
    if (act === '8') stats.worked++;
    else if (stats[act] !== undefined) stats[act]++;
  }
  return stats;
}

function getMonthEuroRaw(month) {
  const fatture = getFatture(month);
  const totalFatt = fatture.reduce((s, f) => s + f.importo, 0);
  if (totalFatt > 0) return totalFatt;
  const s = getMonthStats(month);
  return s.worked * S().dailyRate + s.M * S().dailyRate / 2;
}

function isMonthFromFattura(month) { return getFatture(month).some(f => f.importo > 0); }

function getMonthStimato(month) {
  const s = getMonthStats(month);
  return s.worked * S().dailyRate + s.M * S().dailyRate / 2;
}

// Check if an estimated invoice for a given month would be paid within the year
// based on giorniIncasso setting (days from end of month to payment)
function isEstimatePayableInYear(month) {
  const giorni = S().giorniIncasso || 30;
  // Assume invoice is issued at end of the month, paid giorniIncasso days later
  const lastDay = new Date(currentYear, month, 0); // last day of the month
  const payDate = new Date(lastDay);
  payDate.setDate(payDate.getDate() + giorni);
  return payDate.getFullYear() <= currentYear;
}

// Get the effective amount for a month considering payment year
// Sums only fatture paid in current year (or no payment date set)
// Excludes fatture deferred to another year
// For estimates (no fattura): excludes if giorniIncasso pushes payment to next year
function getMonthEuro(month) {
  const fatture = getFatture(month);
  const hasFatture = fatture.some(f => f.importo > 0);

  if (!hasFatture) {
    // No fattura: use calendar estimate, but only if it would be paid this year
    if (!isEstimatePayableInYear(month)) return 0;
    const s = getMonthStats(month);
    return s.worked * S().dailyRate + s.M * S().dailyRate / 2;
  }

  let total = 0;
  for (const f of fatture) {
    if (f.importo > 0 && f.pagAnno && f.pagAnno !== currentYear) continue;
    total += f.importo;
  }
  return total;
}

// Get invoices from the previous year that are paid in the current year
function getCrossYearInvoices() {
  const prevYear = currentYear - 1;
  const prevData = loadYearData(prevYear);
  if (!prevData || !prevData.fatture) return [];

  const results = [];
  for (let m = 1; m <= 12; m++) {
    let raw = prevData.fatture[m];
    if (!raw) continue;
    const arr = Array.isArray(raw) ? raw : (typeof raw === 'number' ? [{ importo: raw }] : [raw]);
    for (const f of arr) {
      if (typeof f === 'number') continue;
      const importo = parseFloat(f.importo) || 0;
      if (importo > 0 && f.pagAnno === currentYear) {
        results.push({ mese: m, anno: prevYear, importo, pagMese: f.pagMese, desc: f.desc || '' });
      }
    }
  }
  return results;
}

function getTotalAnnuo() {
  let t = 0;
  for (let m = 1; m <= 12; m++) t += getMonthEuro(m);
  // Add cross-year invoices (from previous year, paid this year)
  for (const inv of getCrossYearInvoices()) t += inv.importo;
  return t;
}

function getTotalWorkedDays() {
  let t = 0; for (let m = 1; m <= 12; m++) t += getMonthStats(m).worked; return t;
}

// ═══════════════════ Calculations ═══════════════════
function calcForfettario() {
  const tot = getTotalAnnuo(), s = S();
  const coeff = s.coefficiente / 100, imp = s.impostaSostitutiva / 100;
  const tasse = tot * coeff * imp;
  const cF = s.contribFissi;
  const bV = tot * coeff - s.minimaleInps;
  const cV = bV > 0 ? bV * (s.aliqContributi / 100) : 0;
  const cT = cF + cV;
  const rid = s.riduzione35 == 1 ? 0.65 : 1;
  const cFR = cF * rid, cVR = cV * rid, cTR = cFR + cVR;
  const n = tot - cT - tasse, nR = tot - cTR - tasse;
  return {
    totale: tot, tasse, cF, cV, cT, cFR, cVR, cTR, n, nR,
    perc: tot > 0 ? (tot - n) / tot : 0,
    percR: tot > 0 ? (tot - nR) / tot : 0
  };
}

function calcSpeseTotal() {
  let tot = 0;
  for (const sp of (data.spese || [])) {
    const c = parseFloat(sp.costo) || 0;
    const d = parseFloat(sp.deducibilita) || 0;
    const a = parseInt(sp.anni) || 1;
    tot += (c * d) / a;
  }
  return tot;
}

function calcOrdinario() {
  const tot = getTotalAnnuo(), s = S();
  const spese = calcSpeseTotal();
  const base = tot, baseSp = tot - spese;
  function irpef(b) {
    const sc = [{l:15000,a:.23},{l:28000,a:.25},{l:50000,a:.35},{l:Infinity,a:.43}];
    let t = 0, p = 0, det = [];
    for (const s of sc) {
      if (b <= p) { det.push({b:0,t:0,a:s.a}); continue; }
      const im = Math.min(b, s.l) - p;
      const tx = im * s.a;
      det.push({b:im,t:tx,a:s.a}); t += tx; p = s.l;
    }
    return { tasse: t, netto: b - t, det };
  }
  const senza = irpef(base), con = irpef(baseSp);
  const cF = 4427.04;
  const cV = (base - s.minimaleInps) > 0 ? (base - s.minimaleInps) * 0.24 : 0;
  const cVS = (baseSp - s.minimaleInps) > 0 ? (baseSp - s.minimaleInps) * 0.24 : 0;
  const cT = cF + cV, cTS = cF + cVS;
  return {
    tot: base, totSp: baseSp, spese, senza, con, cF, cV, cVS, cT, cTS,
    netto: base - cT - senza.tasse, nettoSp: baseSp - cTS - con.tasse,
    perc: base > 0 ? (cT + senza.tasse) / base : 0
  };
}

function getEffectiveTaxRate() {
  if (S().regime === 'ordinario') {
    const c = calcOrdinario();
    return c.perc;
  }
  const c = calcForfettario();
  return S().riduzione35 == 1 ? c.percR : c.perc;
}

function getEffectiveNetto() {
  if (S().regime === 'ordinario') return calcOrdinario().netto;
  const c = calcForfettario();
  return S().riduzione35 == 1 ? c.nR : c.n;
}

// ═══════════════════ Formatting ═══════════════════
function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '\u2014';
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC';
}
function fmtPct(n) { return (n * 100).toFixed(1) + '%'; }
function row(label, val, cls, valCls) {
  return `<div class="row ${cls||''}"><label>${label}</label><span class="val ${valCls||''}">${val}</span></div>`;
}

// ═══════════════════ Donut ═══════════════════
function drawDonut(netto, tasse, contributi) {
  const total = netto + tasse + contributi;
  if (total <= 0) return '<div style="text-align:center;color:var(--text2);padding:30px">Nessun dato</div>';
  const size = 180, cx = 90, cy = 90, r = 70, sw = 28, C = 2*Math.PI*r;
  const pN = netto/total, pT = tasse/total, pC = contributi/total;
  const arc = (off, len, col) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}"
    stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += arc(0, pN*C, '#4ecca3') + arc(pN*C, pT*C, '#e94560') + arc((pN+pT)*C, pC*C, '#f5a623');
  svg += `<text x="${cx}" y="${cy-6}" text-anchor="middle" fill="#eee" font-size="14" font-weight="700">${fmtPct(pN)}</text>`;
  svg += `<text x="${cx}" y="${cy+10}" text-anchor="middle" fill="#aaa" font-size="9">netto</text></svg>`;
  const tasseLabel = S().regime === 'ordinario' ? 'IRPEF' : 'Imposta sost.';
  return `<div class="chart-container">${svg}<div class="chart-legend">
    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#4ecca3"></div><span>Netto</span><span class="chart-legend-val" style="color:#4ecca3">${fmt(netto)}</span></div>
    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#e94560"></div><span>${tasseLabel}</span><span class="chart-legend-val" style="color:#e94560">${fmt(tasse)}</span></div>
    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#f5a623"></div><span>Contributi INPS</span><span class="chart-legend-val" style="color:#f5a623">${fmt(contributi)}</span></div>
    <div class="chart-legend-item" style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1)">
      <div class="chart-legend-dot" style="background:transparent"></div><span style="font-weight:600">Totale lordo</span><span class="chart-legend-val">${fmt(total)}</span></div>
  </div></div>`;
}

// ═══════════════════ Mini bar chart ═══════════════════
function drawMiniBars(perc) {
  const vals = [];
  for (let m = 1; m <= 12; m++) vals.push(getMonthEuro(m));
  const mx = Math.max(...vals, 1);
  let h = '<div class="mini-bars">';
  for (let m = 0; m < 12; m++) {
    const hPx = Math.round((vals[m] / mx) * 110);
    const net = vals[m] * (1 - perc);
    const tax = vals[m] * perc;
    const hN = Math.round((net / mx) * 110);
    const hT = hPx - hN;
    h += `<div class="mini-bar-col">
      <div style="display:flex;flex-direction:column;width:100%;height:${hPx}px">
        <div class="mini-bar" style="height:${hT}px;background:var(--red);border-radius:3px 3px 0 0;opacity:.6"></div>
        <div class="mini-bar" style="height:${hN}px;background:var(--green);border-radius:0"></div>
      </div>
      <div class="mini-bar-label">${MONTHS_SHORT[m]}</div>
    </div>`;
  }
  h += '</div>';
  h += `<div style="display:flex;gap:12px;margin-top:8px;font-size:.7rem;color:var(--text2);justify-content:center">
    <span><span style="display:inline-block;width:10px;height:10px;background:var(--green);border-radius:2px;vertical-align:middle;margin-right:3px"></span>Netto</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:var(--red);opacity:.6;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Tasse+C.</span>
  </div>`;
  return h;
}

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

function renderCalcoloForfettario(h, el) {
  const c = calcForfettario(), s = S();
  const useR = s.riduzione35 == 1;
  const contrib = useR ? c.cTR : c.cT;
  const netto = useR ? c.nR : c.n;
  const perc = useR ? c.percR : c.perc;
  const crossYear = getCrossYearInvoices();

  h += `<div class="panel" style="grid-column:1/-1"><h3>Ripartizione del Lordo${useR ? ' (riduzione 35%)' : ''}</h3>`;
  h += drawDonut(netto, c.tasse, contrib);
  h += `</div>`;

  h += `<div class="panel"><h3>Riepilogo Annuale</h3>`;
  h += row('Giorni lavorati', getTotalWorkedDays());
  h += row('Paga giornaliera', fmt(s.dailyRate));
  h += row('Totale annuo lordo', fmt(c.totale), 'highlight');
  if (crossYear.length > 0) {
    const crossTot = crossYear.reduce((s, i) => s + i.importo, 0);
    h += `<div style="font-size:.78rem;color:var(--yellow);margin:6px 0">Include ${fmt(crossTot)} da fatture ${currentYear-1} incassate nel ${currentYear}</div>`;
  }
  h += '<br>';
  h += row(`Imposta sostitutiva (${s.impostaSostitutiva}% su ${s.coefficiente}%)`, fmt(c.tasse), '', 'negative');
  h += row('Contributi INPS', fmt(contrib), '', 'negative');
  h += '<br>';
  h += row('Netto annuo', fmt(netto), 'highlight', 'positive');
  h += row('Netto mensile', fmt(netto / 12), '', 'positive');
  h += `<br><div style="font-size:.82rem;color:var(--text2)">% effettiva: <b style="color:var(--accent)">${fmtPct(perc)}</b> &mdash; Netto/giorno: <b style="color:var(--green)">${fmt(s.dailyRate*(1-perc))}</b></div></div>`;

  h += `<div class="panel"><h3>Andamento Mensile &amp; Contributi</h3>`;
  h += drawMiniBars(perc);
  h += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)">`;
  h += `<div style="font-size:.85rem;color:var(--accent);font-weight:600;margin-bottom:8px">Contributi INPS (sul ${s.coefficiente}%)</div>`;
  if (useR) h += `<div style="font-size:.78rem;color:var(--yellow);margin-bottom:6px">Riduzione 35% attiva</div>`;
  h += row('Fissi', fmt(useR ? c.cFR : c.cF));
  h += row('Variabili', fmt(useR ? c.cVR : c.cV));
  h += row('Totale annuo', fmt(contrib), 'highlight');
  h += row('Totale mensile', fmt(contrib / 12));
  h += `<div style="font-size:.78rem;color:var(--text2);margin-top:4px">${useR?'Senza':'Con'} riduzione: <b>${fmt(useR?c.cT:c.cTR)}</b>/anno</div>`;
  h += `</div></div>`;

  // Quick budget summary
  h += `<div class="panel"><h3>Riepilogo Budget</h3>`;
  h += buildBudgetSummary();
  h += `</div>`;

  h += buildMonthlyTable(perc);

  el.innerHTML = h;
}

function renderCalcoloOrdinario(h, el) {
  const c = calcOrdinario(), s = S();
  const perc = c.perc;
  const labels = ['0-15.000 (23%)','15.001-28.000 (25%)','28.001-50.000 (35%)','Oltre 50.000 (43%)'];
  const crossYear = getCrossYearInvoices();

  h += `<div class="panel" style="grid-column:1/-1"><h3>Ripartizione del Lordo (Ordinario)</h3>`;
  h += drawDonut(c.netto, c.senza.tasse, c.cT);
  h += `</div>`;

  h += `<div class="panel"><h3>Riepilogo Annuale</h3>`;
  h += row('Giorni lavorati', getTotalWorkedDays());
  h += row('Paga giornaliera', fmt(s.dailyRate));
  h += row('Totale annuo lordo', fmt(c.tot), 'highlight');
  if (crossYear.length > 0) {
    const crossTot = crossYear.reduce((s, i) => s + i.importo, 0);
    h += `<div style="font-size:.78rem;color:var(--yellow);margin:6px 0">Include ${fmt(crossTot)} da fatture ${currentYear-1} incassate nel ${currentYear}</div>`;
  }
  if (c.spese > 0) {
    h += row('Spese deducibili', fmt(c.spese), '', 'negative');
    h += row('Imponibile', fmt(c.totSp), 'highlight');
  }
  h += '<br><div style="font-size:.82rem;color:var(--text2);margin-bottom:6px">Scaglioni IRPEF:</div>';
  for (let i = 0; i < 4; i++) {
    const d = c.senza.det[i];
    if (d.b > 0) h += row(labels[i], `${fmt(d.b)} &rarr; ${fmt(d.t)}`);
  }
  h += '<br>';
  h += row('IRPEF', fmt(c.senza.tasse), '', 'negative');
  h += row('Contributi INPS', fmt(c.cT), '', 'negative');
  h += '<br>';
  h += row('Netto annuo', fmt(c.netto), 'highlight', 'positive');
  h += row('Netto mensile', fmt(c.netto / 12), '', 'positive');
  h += `<br><div style="font-size:.82rem;color:var(--text2)">% effettiva: <b style="color:var(--accent)">${fmtPct(perc)}</b></div></div>`;

  h += `<div class="panel"><h3>Andamento Mensile &amp; Contributi</h3>`;
  h += drawMiniBars(perc);
  h += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)">`;
  h += `<div style="font-size:.85rem;color:var(--accent);font-weight:600;margin-bottom:8px">Contributi INPS</div>`;
  h += row('Fissi', fmt(c.cF));
  h += row('Variabili', fmt(c.cV));
  h += row('Totale annuo', fmt(c.cT), 'highlight');
  h += row('Totale mensile', fmt(c.cT / 12));
  h += `</div></div>`;

  // Quick budget summary
  h += `<div class="panel"><h3>Riepilogo Budget</h3>`;
  h += buildBudgetSummary();
  h += `</div>`;

  h += buildMonthlyTable(perc);

  el.innerHTML = h;
}

function buildBudgetSummary() {
  const base = getBudgetNettoMensile();
  const netM = base.netto;
  let h = '';
  h += row('Netto mensile' + (base.month ? ` (${MONTHS_SHORT[base.month-1]} ${base.year})` : ''), fmt(netM));
  if (data.budget && data.budget.length > 0) {
    // Compute auto amounts same as renderBudget
    let totManual = 0, autoCount = 0;
    for (const b of data.budget) {
      if (b.auto && !(parseFloat(b.importo) > 0)) autoCount++;
      else totManual += parseFloat(b.importo) || 0;
    }
    const autoAmount = autoCount > 0 && netM > totManual ? (netM - totManual) / autoCount : 0;
    let totB = 0;
    for (const b of data.budget) {
      const isAuto = b.auto && !(parseFloat(b.importo) > 0);
      const v = isAuto ? autoAmount : (parseFloat(b.importo) || 0);
      totB += v;
      if (v > 0) h += row((b.nome || 'Voce') + (isAuto ? ' (auto)' : ''), fmt(v));
    }
    const rimB = netM - totB;
    h += row('Rimanente', fmt(rimB), 'highlight', rimB >= 0 ? 'positive' : 'negative');
  } else {
    h += `<div style="font-size:.82rem;color:var(--text2);margin-top:8px">Nessuna voce budget. Vai alla tab Budget per configurare.</div>`;
  }
  return h;
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
    h += `<tr><td>${MONTHS[m-1]}</td><td>${fmt(inc)}</td><td style="text-align:center">${src}</td><td style="color:var(--green)">${fmt(net)}</td><td style="color:var(--red)">${fmt(tax)}</td></tr>`;
  }
  // Add cross-year invoices
  const crossYear = getCrossYearInvoices();
  for (const inv of crossYear) {
    const tax = inv.importo * perc, net = inv.importo - tax;
    tI += inv.importo; tN += net; tT += tax;
    h += `<tr style="background:rgba(245,166,35,.06)"><td>${MONTHS[inv.mese-1]} ${inv.anno}</td><td>${fmt(inv.importo)}</td>
      <td style="text-align:center"><span style="color:var(--yellow);font-size:.7rem">Da ${inv.anno}${inv.desc?' ('+inv.desc+')':''}</span></td>
      <td style="color:var(--green)">${fmt(net)}</td><td style="color:var(--red)">${fmt(tax)}</td></tr>`;
  }
  h += `</tbody><tfoot><tr><td>Totale</td><td>${fmt(tI)}</td><td></td><td style="color:var(--green)">${fmt(tN)}</td><td style="color:var(--red)">${fmt(tT)}</td></tr></tfoot></table></div>`;
  return h;
}

// ═══════════════════ Tax rate for arbitrary year ═══════════════════
function getEffectiveTaxRateForYear(year) {
  if (year === currentYear) return getEffectiveTaxRate();
  const yd = loadYearData(year);
  if (!yd || !yd.settings) return getEffectiveTaxRate();
  const s = yd.settings;
  if (s.regime === 'ordinario') return getEffectiveTaxRate(); // fallback

  // Calculate forfettario rate using that year's settings and data
  const fatture = yd.fatture || {};
  let total = 0;
  for (const m of Object.keys(fatture)) {
    const arr = Array.isArray(fatture[m]) ? fatture[m] : [fatture[m]];
    for (const f of arr) {
      const imp = parseFloat(typeof f === 'number' ? f : (f.importo || 0)) || 0;
      if (imp > 0 && (!f.pagAnno || f.pagAnno == year)) total += imp;
    }
  }
  if (total <= 0) return getEffectiveTaxRate(); // no data, fallback

  const coeff = (s.coefficiente || 67) / 100;
  const imp = (s.impostaSostitutiva || 15) / 100;
  const tasse = total * coeff * imp;
  const cF = s.contribFissi || 4515.43;
  const bV = total * coeff - (s.minimaleInps || 18415);
  const cV = bV > 0 ? bV * ((s.aliqContributi || 24.8) / 100) : 0;
  const rid = s.riduzione35 == 1 ? 0.65 : 1;
  const cT = (cF + cV) * rid;
  return (tasse + cT) / total;
}

// ═══════════════════ Render: Accantonamento ═══════════════════
// Collect all fatture paid in the current year (only real invoices, no estimates)
function getFattureForAccantonamento() {
  const items = [];
  const perc = getEffectiveTaxRate();

  // 1. Fatture emesse quest'anno e pagate quest'anno (o senza data pagamento = assunto quest'anno)
  for (let m = 1; m <= 12; m++) {
    for (const f of getFatture(m)) {
      if (f.importo <= 0) continue;
      if (f.pagAnno && f.pagAnno !== currentYear) continue; // deferred to another year
      items.push({
        label: MONTHS[m-1] + (f.desc ? ' - ' + f.desc : ''),
        mese: m, anno: currentYear, importo: f.importo, rate: perc,
        key: 'cur_' + m + '_' + items.length // unique key for accantonamento input
      });
    }
  }

  // 2. Fatture dall'anno precedente pagate quest'anno (cross-year)
  const crossYear = getCrossYearInvoices();
  for (const inv of crossYear) {
    items.push({
      label: MONTHS[inv.mese-1] + ' ' + inv.anno + (inv.desc ? ' - ' + inv.desc : ''),
      mese: inv.mese, anno: inv.anno, importo: inv.importo, rate: perc,
      isCrossYear: true,
      key: 'cross_' + inv.anno + '_' + inv.mese + '_' + items.length
    });
  }

  return items;
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
    <th>Fattura</th><th>Lordo</th><th>Aliq.</th><th>Da accant.</th><th>Accantonato</th>
    <th>Delta</th><th>Dovuto cum.</th><th>Accant. cum.</th><th>Delta cum.</th>
  </tr></thead><tbody>`;

  let cD = 0, cM = 0;
  const md = [];
  for (const f of fatture) {
    const dovuto = f.importo * f.rate;
    const accKey = f.key;
    const messo = parseFloat(data.accantonamento[accKey]) || 0;
    cD += dovuto; cM += messo;
    const dm = messo - dovuto, dc = cM - cD;
    md.push({ label: f.label, mese: f.mese, dovuto, messo, dm, cD, cM, dc, importo: f.importo, isCrossYear: f.isCrossYear });

    const bgStyle = f.isCrossYear ? ' style="background:rgba(245,166,35,.06)"' : '';
    h += `<tr${bgStyle}>
      <td style="text-align:left;font-size:.82rem">${f.label}${f.isCrossYear ? ' <span style="color:var(--yellow);font-size:.7rem">(da ' + f.anno + ')</span>' : ''}</td>
      <td>${fmt(f.importo)}</td>
      <td style="color:var(--accent);font-size:.78rem">${fmtPct(f.rate)}</td>
      <td style="color:var(--yellow)">${fmt(dovuto)}</td>
      <td><input type="number" value="${messo||''}" placeholder="0" step="0.01"
        onchange="data.accantonamento['${accKey}']=parseFloat(this.value)||0;saveData();recalcAll()"></td>
      <td class="${dm>=0?'delta-pos':'delta-neg'}">${(dm>=0?'+':'')+fmt(dm)}</td>
      <td style="color:var(--yellow)">${fmt(cD)}</td><td>${fmt(cM)}</td>
      <td class="${dc>=0?'delta-pos':'delta-neg'}" style="font-weight:600">${(dc>=0?'+':'')+fmt(dc)}</td></tr>`;
  }

  const totLordo = fatture.reduce((s, f) => s + f.importo, 0);
  const fd = cM - cD;
  h += `</tbody><tfoot><tr><td style="text-align:left">Totale</td><td>${fmt(totLordo)}</td><td></td>
    <td style="color:var(--yellow)">${fmt(cD)}</td><td>${fmt(cM)}</td>
    <td class="${fd>=0?'delta-pos':'delta-neg'}">${(fd>=0?'+':'')+fmt(fd)}</td>
    <td></td><td></td><td></td></tr></tfoot></table>`;

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

  // Bar chart - only fatture with data
  const mdWithData = md.filter(d => d.dovuto > 0 || d.messo > 0);
  if (mdWithData.length > 0) {
    h += `<div class="panel" style="grid-column:1/-1"><h3>Confronto per Fattura</h3>`;
    const mx = Math.max(...mdWithData.map(d => Math.max(d.dovuto, d.messo)), 1);
    h += '<div class="bar-chart">';
    for (const d of mdWithData) {
      const wD = (d.dovuto/mx*100).toFixed(1), wM = (d.messo/mx*100).toFixed(1);
      const shortLabel = MONTHS_SHORT[d.mese-1] + (d.isCrossYear ? '*' : '');
      h += `<div class="bar-row"><div class="bar-label">${shortLabel}</div>
        <div class="bar-track"><div class="bar-fill-dovuto" style="width:${wD}%"></div>
        <div class="bar-fill-messo ${d.messo>=d.dovuto?'over':'under'}" style="width:${wM}%"></div></div>
        <div style="width:80px;font-size:.75rem;color:${d.dm>=0?'var(--green)':'var(--red)'};text-align:right">
          ${d.messo>0||d.dovuto>0?(d.dm>=0?'+':'')+fmt(d.dm):''}</div></div>`;
    }
    h += `<div style="display:flex;gap:16px;margin-top:10px;font-size:.75rem;color:var(--text2)">
      <span><span style="display:inline-block;width:12px;height:12px;background:rgba(233,69,96,.4);border-radius:2px;vertical-align:middle;margin-right:4px"></span>Dovuto</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:var(--green);border-radius:2px;vertical-align:middle;margin-right:4px"></span>OK</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:var(--yellow);border-radius:2px;vertical-align:middle;margin-right:4px"></span>Sotto</span>
    </div></div></div>`;
  }

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
      h += `<text x="${W-pR+4}" y="${y+4}" fill="#666" font-size="8">${((mxC*(1-i/4))/1000).toFixed(0)}k</text>`;
    }
    for (let i = 0; i < n; i++) {
      const x = pL + (n > 1 ? (i/(n-1))*pW : pW/2);
      h += `<text x="${x}" y="${H-8}" fill="#666" font-size="8" text-anchor="middle">${MONTHS_SHORT[md[i].mese-1]}${md[i].isCrossYear?'*':''}</text>`;
    }
    h += `<path d="${dP}" fill="none" stroke="#e94560" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    h += `<path d="${mP}" fill="none" stroke="#4ecca3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (let i = 0; i < n; i++) {
      const x = pL + (n > 1 ? (i/(n-1))*pW : pW/2);
      h += `<circle cx="${x}" cy="${pT+(1-md[i].cD/mxC)*pH}" r="3" fill="#e94560"/>`;
      if (md[i].cM > 0) h += `<circle cx="${x}" cy="${pT+(1-md[i].cM/mxC)*pH}" r="3" fill="#4ecca3"/>`;
    }
    h += `</svg><div style="display:flex;gap:16px;margin-top:8px;font-size:.75rem;color:var(--text2)">
      <span><span style="display:inline-block;width:16px;height:3px;background:#e94560;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Dovuto</span>
      <span><span style="display:inline-block;width:16px;height:3px;background:#4ecca3;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Accantonato</span>
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
      const accant = d.importo * rate;
      totDef += accant;
      h += `<tr><td style="text-align:left">${MONTHS[d.mese-1]}${d.desc ? ' - ' + d.desc : ''}</td>
        <td>${fmt(d.importo)}</td>
        <td>${d.pagAnno}</td>
        <td style="color:var(--accent)">${fmtPct(rate)}</td>
        <td style="color:var(--yellow);font-weight:600">${fmt(accant)}</td></tr>`;
    }
    h += `</tbody><tfoot><tr><td style="text-align:left">Totale</td><td></td><td></td><td></td>
      <td style="color:var(--yellow);font-weight:600">${fmt(totDef)}</td></tr></tfoot></table></div>`;
  }

  el.innerHTML = h;
}

// ═══════════════════ Render: Calendar ═══════════════════
let pickerMonth = 0, pickerDay = 0;

function openPicker(m, d, evt) {
  evt.stopPropagation();
  pickerMonth = m; pickerDay = d;
  const popup = document.getElementById('pickerPopup');
  const overlay = document.getElementById('pickerOverlay');
  const rect = evt.target.getBoundingClientRect();
  let left = rect.right + 6, top = rect.top;
  if (left + 170 > window.innerWidth) left = rect.left - 170;
  if (top + 300 > window.innerHeight) top = window.innerHeight - 310;
  popup.style.left = left + 'px'; popup.style.top = top + 'px';
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

// ═══════════════════ Render: Fatture ═══════════════════
function renderFatture() {
  const table = document.getElementById('fattureTable');
  let h = `<thead><tr><th>Mese</th><th>Importo</th><th>Desc</th><th>Stimato</th><th>Tassato nel</th><th></th></tr></thead><tbody>`;
  let tF = 0, tS = 0;

  for (let m = 1; m <= 12; m++) {
    const stim = getMonthStimato(m);
    const fatture = getFatture(m);
    const nFatt = fatture.length;
    const totalFatt = fatture.reduce((s, f) => s + f.importo, 0);
    tF += totalFatt; tS += stim;

    if (nFatt <= 1) {
      const f = fatture[0] || { importo: 0, pagMese: null, pagAnno: null, desc: '' };
      const hasPag = f.pagMese && f.pagAnno;
      const isDiffYear = hasPag && f.pagAnno !== currentYear;

      h += `<tr><td>${MONTHS[m-1]}</td>
        <td><input type="number" value="${f.importo||''}" placeholder="—"
          onchange="setFatturaImporto(${m},0,this.value);recalcAll()" style="width:110px"></td>
        <td><input type="text" value="${f.desc||''}" placeholder="—"
          onchange="setFatturaDesc(${m},0,this.value)" style="width:90px;text-align:left;font-size:.78rem"></td>
        <td style="color:var(--text2)">${fmt(stim)}</td>
        <td><div class="pag-cell">
          <select class="pag-mese" onchange="setPagMese(${m},0,this.value)" ${f.importo<=0?'disabled':''}>
            <option value="">Mese...</option>
            ${MONTHS_SHORT.map((ms,i) => `<option value="${i+1}" ${f.pagMese===(i+1)?'selected':''}>${ms}</option>`).join('')}
          </select>
          <input type="number" class="pag-anno" value="${f.pagAnno||''}" placeholder="${currentYear}" min="2020" max="2040"
            onchange="setPagAnno(${m},0,this.value)" style="width:74px" ${f.importo<=0?'disabled':''}>
          <button class="btn-oggi" onclick="setPagOggi(${m},0)" title="Oggi" ${f.importo<=0?'disabled':''}>Oggi</button>
          ${isDiffYear ? `<span class="pag-warn">&rarr; ${f.pagAnno}</span>` : ''}
        </div></td>
        <td><button class="btn-add-fatt" onclick="addFattura(${m})" title="Aggiungi fattura">+</button></td></tr>`;
    } else {
      for (let fi = 0; fi < nFatt; fi++) {
        const f = fatture[fi];
        const hasPag = f.pagMese && f.pagAnno;
        const isDiffYear = hasPag && f.pagAnno !== currentYear;
        const isFirst = fi === 0;
        const isLast = fi === nFatt - 1;

        h += `<tr class="${!isFirst?'fatt-subrow':''}">
          <td>${isFirst ? MONTHS[m-1] : ''}</td>
          <td><input type="number" value="${f.importo||''}" placeholder="—"
            onchange="setFatturaImporto(${m},${fi},this.value);recalcAll()" style="width:110px"></td>
          <td><input type="text" value="${f.desc||''}" placeholder="—"
            onchange="setFatturaDesc(${m},${fi},this.value)" style="width:90px;text-align:left;font-size:.78rem"></td>
          <td style="color:var(--text2)">${isFirst ? fmt(stim) : ''}</td>
          <td><div class="pag-cell">
            <select class="pag-mese" onchange="setPagMese(${m},${fi},this.value)" ${f.importo<=0?'disabled':''}>
              <option value="">Mese...</option>
              ${MONTHS_SHORT.map((ms,i) => `<option value="${i+1}" ${f.pagMese===(i+1)?'selected':''}>${ms}</option>`).join('')}
            </select>
            <input type="number" class="pag-anno" value="${f.pagAnno||''}" placeholder="${currentYear}" min="2020" max="2040"
              onchange="setPagAnno(${m},${fi},this.value)" style="width:74px" ${f.importo<=0?'disabled':''}>
            <button class="btn-oggi" onclick="setPagOggi(${m},${fi})" title="Oggi" ${f.importo<=0?'disabled':''}>Oggi</button>
            ${isDiffYear ? `<span class="pag-warn">&rarr; ${f.pagAnno}</span>` : ''}
          </div></td>
          <td class="fatt-actions">
            ${isLast ? `<button class="btn-add-fatt" onclick="addFattura(${m})" title="Aggiungi">+</button>` : ''}
            <button class="btn-del-fatt" onclick="removeFattura(${m},${fi})" title="Rimuovi">&times;</button>
          </td></tr>`;
      }
      h += `<tr class="fatt-total-row"><td></td>
        <td colspan="2" style="font-weight:600;font-size:.78rem;color:var(--accent)">Totale mese: ${fmt(totalFatt)}</td>
        <td></td><td></td><td></td></tr>`;
    }
  }

  h += `</tbody><tfoot><tr><td>Totale</td><td colspan="2">${fmt(tF)}</td><td>${fmt(tS)}</td><td></td><td></td></tr></tfoot>`;
  table.innerHTML = h;

  // Cross-year invoices info
  const crossYear = getCrossYearInvoices();
  let crossHtml = '';
  if (crossYear.length > 0) {
    const crossTot = crossYear.reduce((s, i) => s + i.importo, 0);
    crossHtml += `<div class="status-box ok" style="margin-bottom:16px">
      <div class="status-icon" style="font-size:1.2rem">&#8592;</div>
      <div class="status-text">
        <h4 style="color:var(--yellow);font-size:.88rem">Fatture ${currentYear-1} incassate nel ${currentYear}</h4>
        <p>${crossYear.map(i => `${MONTHS[i.mese-1]} ${i.anno}: ${fmt(i.importo)}${i.desc?' ('+i.desc+')':''}`).join(' &bull; ')}
        &mdash; Totale: <b>${fmt(crossTot)}</b></p></div></div>`;
  }

  // Deferred invoices info
  const deferred = [];
  for (let m = 1; m <= 12; m++) {
    for (const f of getFatture(m)) {
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

  const lim = S().limiteForfettario, pct = lim > 0 ? Math.min(tF/lim*100, 100) : 0;
  document.getElementById('incassoSection').innerHTML = crossHtml + `
    <div class="row" style="margin-top:16px"><label>Fatturato ${currentYear}</label><span class="val">${fmt(tF)}</span></div>
    <div class="row"><label>Mancante al limite (${fmt(lim)})</label><span class="val">${fmt(lim-tF)}</span></div>
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
  const today = new Date();
  setFatturaPagamento(month, idx, today.getMonth() + 1, today.getFullYear());
  recalcAll();
}

// ═══════════════════ Budget helpers ═══════════════════

// Find all fatture across years for the current profile, sorted newest first
function getAllFattureForBudget() {
  const results = [];
  const yearsToCheck = [];
  for (let y = currentYear + 1; y >= currentYear - 5; y--) yearsToCheck.push(y);

  for (const y of yearsToCheck) {
    const yd = y === currentYear ? data : loadYearData(y);
    if (!yd || !yd.fatture) continue;
    const s = yd.settings || getDefaultSettings();
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

  // Sort: newest first (year desc, month desc)
  results.sort((a, b) => b.year - a.year || b.month - a.month);
  return results;
}

function getBudgetNettoMensile() {
  const baseY = data.budgetBaseYear;
  const baseM = data.budgetBaseMonth;

  if (baseY && baseM) {
    // User selected a specific month
    const yd = baseY === currentYear ? data : loadYearData(baseY);
    if (yd && yd.fatture) {
      const raw = yd.fatture[baseM];
      const arr = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
      const total = arr.reduce((s, f) => s + (parseFloat(typeof f === 'number' ? f : f.importo) || 0), 0);
      if (total > 0) {
        const rate = baseY === currentYear ? getEffectiveTaxRate() : getEffectiveTaxRateForYear(baseY);
        return { netto: total * (1 - rate), lordo: total, rate, year: baseY, month: baseM, source: 'manual' };
      }
    }
  }

  // Auto: find latest fattura
  const all = getAllFattureForBudget();
  if (all.length > 0) {
    const latest = all[0];
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
  data.budget[idx].importo = Math.round(nettoMensile * pct / 100 * 100) / 100;
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

  h += `<div class="budget-header"><span>Voce</span><span>Importo mensile</span><span>%</span><span style="text-align:center;font-size:.65rem">Auto</span><span></span></div>`;

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
      <input type="number" value="${isAuto?'':val||''}" placeholder="${isAuto?fmt(autoAmount):'0'}" step="0.01"
        onchange="budgetSetImporto(${i},this.value)">
      <input type="number" value="${pct?pct.toFixed(1):''}" placeholder="%" step="0.1" min="0" max="100"
        onchange="budgetSetPercent(${i},this.value)" style="text-align:center">
      <label class="budget-auto-check"><input type="checkbox" ${b.auto?'checked':''}
        onchange="data.budget[${i}].auto=this.checked;if(this.checked)data.budget[${i}].importo=0;saveData();renderBudget()"></label>
      <button class="btn-del" onclick="data.budget.splice(${i},1);saveData();renderBudget()">&times;</button>
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
    const colors = ['#4ecca3','#4a9eff','#f5a623','#e94560','#533483','#e67e22','#2ecc71','#9b59b6','#1abc9c','#e74c3c'];
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
      h += `<div style="display:flex;align-items:center;gap:8px;font-size:.8rem;margin-bottom:4px">
        <span style="width:12px;height:12px;border-radius:3px;background:${colors[i%colors.length]}${isAuto?';opacity:.6':''};flex-shrink:0"></span>
        <span style="color:var(--text2)">${nome || 'Voce '+(i+1)}${isAuto?' (auto)':''}</span>
        <span style="margin-left:auto;font-weight:600">${fmt(val)}</span>
        <span style="color:var(--text2);font-size:.75rem">(${pct}%)</span></div>`;
    }
    if (rimanente > 0) {
      h += `<div style="display:flex;align-items:center;gap:8px;font-size:.8rem;margin-bottom:4px">
        <span style="width:12px;height:12px;border-radius:3px;background:rgba(255,255,255,.15);flex-shrink:0"></span>
        <span style="color:var(--text2)">Rimanente</span>
        <span style="margin-left:auto;font-weight:600;color:var(--green)">${fmt(rimanente)}</span>
        <span style="color:var(--text2);font-size:.75rem">(${(rimanente/nettoMensile*100).toFixed(1)}%)</span></div>`;
    }
    h += `</div>`;
  }

  el.innerHTML = h;
}

// ═══════════════════ Render: Spese ═══════════════════
function renderSpese() {
  const el = document.getElementById('speseContent');
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
      <button class="btn-del" onclick="data.spese.splice(${i},1);saveData();recalcAll()">&times;</button>
    </div>`;
  }
  h += `<button class="btn-add" onclick="data.spese.push({titolo:'',costo:0,deducibilita:1,anni:1});saveData();renderSpese()">+ Aggiungi spesa</button>`;
  h += `<div style="margin-top:16px">${row('Totale deducibilita annua', fmt(calcSpeseTotal()), 'highlight', 'positive')}</div>`;
  el.innerHTML = h;
}

// ═══════════════════ Recalc All ═══════════════════
function recalcAll() {
  renderCalcolo();
  renderCalendar();
  renderFatture();
  renderAccantonamento();
  renderBudget();
  if (S().regime === 'ordinario') renderSpese();
}

// ═══════════════════ Tab navigation ═══════════════════
document.getElementById('nav').addEventListener('click', e => {
  if (e.target.tagName !== 'BUTTON') return;
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  document.getElementById('tab-' + e.target.dataset.tab).classList.add('active');
});

// ═══════════════════ Export / Import ═══════════════════
function exportData() {
  const allData = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('calcoliPIVA_' + currentProfile + '_')) allData[key] = JSON.parse(localStorage.getItem(key));
  }
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'calcoli_piva_backup.json'; a.click();
}

function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const allData = JSON.parse(ev.target.result);
    for (const [key, val] of Object.entries(allData)) localStorage.setItem(key, JSON.stringify(val));
    loadData(); recalcAll(); alert('Dati importati!');
  };
  reader.readAsText(file);
}

// ═══════════════════ Seed Mattia Data ═══════════════════
function seedMattiaData() {
  // Only seed once: check if 2025 data already exists
  if (localStorage.getItem('calcoliPIVA_Mattia_2025')) return;

  // ── 2024 ──
  const data2024 = {
    settings: {
      dailyRate: 400, coefficiente: 67, impostaSostitutiva: 15,
      contribFissi: 4515.43, minimaleInps: 18415, aliqContributi: 24.8,
      riduzione35: 0, limiteForfettario: 85000, regime: 'forfettario'
    },
    fatture: {
      10: { importo: 3341.38, pagMese: null, pagAnno: null },
      11: { importo: 7953.04, pagMese: null, pagAnno: null },
      12: { importo: 6478.66, pagMese: null, pagAnno: null }
    },
    calendar: {},
    accantonamento: {},
    budget: [],
    spese: [
      { titolo: 'Secretlab', costo: 524, deducibilita: 1, anni: 5 },
      { titolo: 'ChatGPT Dic', costo: 22.04, deducibilita: 1, anni: 1 },
      { titolo: 'ChatGPT Nov', costo: 22.04, deducibilita: 1, anni: 1 },
      { titolo: 'Fiscozen Ott', costo: 39.90, deducibilita: 1, anni: 1 },
      { titolo: 'Fiscozen Nov', costo: 39.90, deducibilita: 1, anni: 1 },
      { titolo: 'Fiscozen Dic', costo: 39.90, deducibilita: 1, anni: 1 },
      { titolo: 'Fiscozen Set', costo: 39.90, deducibilita: 1, anni: 1 },
      { titolo: 'Fiscozen Ago', costo: 39.90, deducibilita: 1, anni: 1 },
      { titolo: 'Corso Udemy', costo: 14.99, deducibilita: 1, anni: 1 },
      { titolo: 'Scarlet 2i2', costo: 139.99, deducibilita: 1, anni: 5 },
      { titolo: 'Cuffie Sony', costo: 279, deducibilita: 1, anni: 5 },
      { titolo: 'Cuffie Bose', costo: 199, deducibilita: 1, anni: 5 }
    ]
  };

  // ── 2025 ──
  const data2025 = {
    settings: {
      dailyRate: 315, coefficiente: 67, impostaSostitutiva: 15,
      contribFissi: 4515.43, minimaleInps: 18415, aliqContributi: 24.8,
      riduzione35: 0, limiteForfettario: 85000, regime: 'forfettario'
    },
    fatture: {
      1:  { importo: 5003.37, pagMese: null, pagAnno: null },
      2:  { importo: 6882.11, pagMese: null, pagAnno: null },
      3:  { importo: 7025.13, pagMese: null, pagAnno: null },
      4:  { importo: 6515.81, pagMese: null, pagAnno: null },
      5:  { importo: 7055.29, pagMese: null, pagAnno: null },
      6:  { importo: 6720.08, pagMese: null, pagAnno: null },
      7:  { importo: 8785.40, pagMese: null, pagAnno: null },
      8:  { importo: 4967.45, pagMese: null, pagAnno: null },
      9:  { importo: 7784.74, pagMese: null, pagAnno: null },
      10: { importo: 1575.00, pagMese: null, pagAnno: null },
      11: { importo: 5827.50, pagMese: null, pagAnno: null },
      12: { importo: 4882.50, pagMese: null, pagAnno: null }
    },
    calendar: {},
    accantonamento: {},
    budget: [],
    spese: []
  };

  // ── 2026 ──
  const data2026 = {
    settings: {
      dailyRate: 315, coefficiente: 67, impostaSostitutiva: 15,
      contribFissi: 4515.43, minimaleInps: 18415, aliqContributi: 24.8,
      riduzione35: 0, limiteForfettario: 85000, regime: 'forfettario'
    },
    fatture: {
      1: { importo: 5670, pagMese: null, pagAnno: null },
      2: { importo: 6300, pagMese: null, pagAnno: null }
    },
    calendar: {
      // Ferie Gennaio (esempio: dal 2 al 6 gen)
      '1-2': 'F', '1-3': 'F',
      // Festivi Agosto custom
      '8-14': 'F', '8-16': 'F',
      // Festivi Dicembre custom
      '12-23': 'F', '12-24': 'F', '12-27': 'F', '12-29': 'F', '12-30': 'F', '12-31': 'F'
    },
    accantonamento: {},
    budget: [],
    spese: []
  };

  localStorage.setItem('calcoliPIVA_Mattia_2024', JSON.stringify(data2024));
  localStorage.setItem('calcoliPIVA_Mattia_2025', JSON.stringify(data2025));
  localStorage.setItem('calcoliPIVA_Mattia_2026', JSON.stringify(data2026));

  console.log('Dati storici Mattia caricati (2024-2026)');
}

function seedPeruData() {
  if (localStorage.getItem('calcoliPIVA_Peru_2025')) return;

  // Helper: mark all weekdays in a date range as 'F' (not working P.IVA)
  function markFerie(year, startM, startD, endM, endD) {
    const cal = {};
    const d = new Date(year, startM - 1, startD);
    const end = new Date(year, endM - 1, endD);
    while (d <= end) {
      const dow = d.getDay();
      const m = d.getMonth() + 1, day = d.getDate();
      if (dow !== 0 && dow !== 6 && !isHoliday(year, m, day)) {
        cal[m + '-' + day] = 'F';
      }
      d.setDate(d.getDate() + 1);
    }
    return cal;
  }

  // ── 2024: Peru started P.IVA Oct 21, regime ordinario ──
  const cal2024 = markFerie(2024, 1, 1, 10, 20); // Jan 1 - Oct 20: not working
  cal2024['12-24'] = 'F';
  cal2024['12-27'] = 'F';
  cal2024['12-31'] = 'F';

  const data2024 = {
    settings: {
      dailyRate: 400, coefficiente: 67, impostaSostitutiva: 15,
      contribFissi: 4515.43, minimaleInps: 18415, aliqContributi: 24.8,
      riduzione35: 0, limiteForfettario: 85000, regime: 'ordinario'
    },
    fatture: {
      10: { importo: 3341.38, pagMese: null, pagAnno: null },
      11: { importo: 7953.04, pagMese: null, pagAnno: null },
      12: { importo: 2400, pagMese: null, pagAnno: null }
    },
    calendar: cal2024,
    accantonamento: {},
    budget: [],
    spese: [
      { titolo: 'Secretlab', costo: 1210.57, deducibilita: 1, anni: 1 },
      { titolo: 'ChatGPT', costo: 18.44, deducibilita: 1, anni: 1 },
      { titolo: 'ChatGPT', costo: 18.44, deducibilita: 1, anni: 1 },
      { titolo: 'Fiscozen 1', costo: 1082.54, deducibilita: 1, anni: 1 },
      { titolo: 'Fiscozen 2', costo: 116.46, deducibilita: 1, anni: 1 },
      { titolo: 'Fiscozen 3', costo: 40, deducibilita: 1, anni: 1 },
      { titolo: 'Fiscozen 4', costo: 15, deducibilita: 1, anni: 1 },
      { titolo: 'Fiscozen 5', costo: 200, deducibilita: 1, anni: 1 },
      { titolo: 'Corso', costo: 120.49, deducibilita: 1, anni: 1 },
      { titolo: 'Scarlet 2i2', costo: 149.80, deducibilita: 1, anni: 1 },
      { titolo: 'Cuffie 1', costo: 102.57, deducibilita: 1, anni: 1 },
      { titolo: 'Cuffie 2', costo: 102.57, deducibilita: 1, anni: 1 },
      { titolo: 'TP Link', costo: 245.89, deducibilita: 1, anni: 1 },
      { titolo: 'Cavo DP-TypeC', costo: 13.76, deducibilita: 1, anni: 1 },
      { titolo: 'Cavi', costo: 7.37, deducibilita: 1, anni: 1 },
      { titolo: 'Telefono aziendale', costo: 130.94, deducibilita: 1, anni: 1 },
      { titolo: 'Tasse universitarie', costo: 4000, deducibilita: 1, anni: 1 }
    ]
  };

  // ── 2025: forfettario, dailyRate=150 ──
  const data2025 = {
    settings: {
      dailyRate: 150, coefficiente: 67, impostaSostitutiva: 15,
      contribFissi: 4515.43, minimaleInps: 18415, aliqContributi: 24.8,
      riduzione35: 0, limiteForfettario: 85000, regime: 'forfettario'
    },
    fatture: {
      1:  { importo: 3000, pagMese: null, pagAnno: null },
      2:  { importo: 4127, pagMese: null, pagAnno: null },
      3:  { importo: 3150, pagMese: null, pagAnno: null },
      4:  { importo: 3150, pagMese: null, pagAnno: null },
      5:  { importo: 3150, pagMese: null, pagAnno: null },
      6:  { importo: 3000, pagMese: null, pagAnno: null },
      12: { importo: 2550, pagMese: null, pagAnno: null }
    },
    calendar: {
      '1-2': 'F',
      '6-24': 'M',
      '8-11': 'F', '8-12': 'F', '8-13': 'F', '8-14': 'F',
      '9-8': 'FS',
      '9-9': 'F', '9-10': 'F', '9-11': 'F', '9-12': 'F',
      '12-22': 'F', '12-23': 'F', '12-24': 'F',
      '12-29': 'F', '12-30': 'F', '12-31': 'F'
    },
    accantonamento: {},
    budget: [],
    spese: []
  };

  // ── 2026: forfettario, dailyRate=175 ──
  const data2026 = {
    settings: {
      dailyRate: 175, coefficiente: 67, impostaSostitutiva: 15,
      contribFissi: 4515.43, minimaleInps: 18415, aliqContributi: 24.8,
      riduzione35: 0, limiteForfettario: 85000, regime: 'forfettario'
    },
    fatture: {
      1: { importo: 3150, pagMese: null, pagAnno: null }
    },
    calendar: {},
    accantonamento: {},
    budget: [],
    spese: []
  };

  localStorage.setItem('calcoliPIVA_Peru_2024', JSON.stringify(data2024));
  localStorage.setItem('calcoliPIVA_Peru_2025', JSON.stringify(data2025));
  localStorage.setItem('calcoliPIVA_Peru_2026', JSON.stringify(data2026));

  console.log('Dati storici Peru caricati (2024-2026)');
}

// ═══════════════════ Init ═══════════════════
document.getElementById('yearDisplay').textContent = currentYear;
if (checkSession()) {
  loadData();
  recalcAll();
}
