// ═══════════════════ Aritmetica condivisa (math-utils.js) ═══════════════════
const _MathUtils = (typeof window !== 'undefined' && window.MathUtils)
  ? window.MathUtils
  : (typeof MathUtils !== 'undefined' ? MathUtils
    : (typeof require !== 'undefined' ? require('./math-utils.js') : null));
if (!_MathUtils) throw new Error('app.js requires MathUtils — load math-utils.js first');
const ceil2 = _MathUtils.ceil2;
const euroToCents = _MathUtils.euroToCents;
const centsToEuro = _MathUtils.centsToEuro;
const splitAmountByWeights = _MathUtils.splitAmountByWeights;

// ═══════════════════ Date helpers (date-utils.js) ═══════════════════
const _DateUtils = (typeof window !== 'undefined' && window.DateUtils)
  ? window.DateUtils
  : (typeof DateUtils !== 'undefined' ? DateUtils
    : (typeof require !== 'undefined' ? require('./date-utils.js') : null));
if (!_DateUtils) throw new Error('app.js requires DateUtils — load date-utils.js first');
const getEaster = _DateUtils.getEaster;
const isHoliday = _DateUtils.isHoliday;
const pad2 = _DateUtils.pad2;
const parseIsoDate = _DateUtils.parseIsoDate;

// ═══════════════════ Profili / Login ═══════════════════
const PROFILE_HASHES = {
  'd9b5e452afd6cdea8583147634c3f85a0ba60fc17ad5e6f069a99d3b4ec35194': 'Mattia',
  'cfaa4bd87a413b57e7e3b4a0d5b220aa500aa5d4f60faf938a8dad50e3def77d': 'Peru',
  '83ebba2cb71eb1417fd5ccaa12155a3be83cb97bc6fd7ef28500d100d84f8019': 'Demo',
  '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08': 'MattiaTest'
};
const PROFILE_FISCAL_LIBRARY = {
  Mattia: {
    nome: '',
    codiceFiscale: '',
    partitaIva: '',
    indirizzo: '',
    cap: '',
    citta: '',
    provincia: '',
    nazione: 'IT',
    ateco: '',
    atecoDescrizione: '',
    iban: '',
    modalitaPagamento: 'Bonifico bancario',
    coefficiente: 67,
    impostaSostitutiva: 15,
    inpsMode: 'artigiani_commercianti',
    inpsCategoria: 'artigiano',
    inpsTipoGestSep: 'esclusivo',
    usaInpsUfficiale: 1,
    riduzione35: 0,
    limiteForfettario: 85000,
    inailTasso: 0,
    agevolazioneStartUp: 0,
    primoAnnoAgevolato: 0,
    note: ''
  },
  Peru: {
    nome: 'Peru',
    codiceFiscale: '',
    partitaIva: '',
    indirizzo: '',
    cap: '',
    citta: '',
    provincia: '',
    nazione: 'IT',
    ateco: '62.10.00',
    atecoDescrizione: 'Attivita di programmazione informatica',
    iban: '',
    modalitaPagamento: 'Bonifico bancario',
    coefficiente: 67,
    impostaSostitutiva: 15,
    inpsMode: 'artigiani_commercianti',
    inpsCategoria: 'artigiano',
    inpsTipoGestSep: 'esclusivo',
    usaInpsUfficiale: 1,
    riduzione35: 0,
    limiteForfettario: 85000,
    inailTasso: 0,
    agevolazioneStartUp: 0,
    primoAnnoAgevolato: 0,
    note: ''
  },
  Demo: {
    nome: 'Demo',
    codiceFiscale: '',
    partitaIva: '',
    indirizzo: '',
    cap: '',
    citta: '',
    provincia: '',
    nazione: 'IT',
    ateco: '62.10.00',
    atecoDescrizione: 'Attivita di programmazione informatica',
    iban: '',
    modalitaPagamento: 'Bonifico bancario',
    coefficiente: 67,
    impostaSostitutiva: 15,
    inpsMode: 'artigiani_commercianti',
    inpsCategoria: 'artigiano',
    inpsTipoGestSep: 'esclusivo',
    usaInpsUfficiale: 1,
    riduzione35: 0,
    limiteForfettario: 85000,
    inailTasso: 0,
    agevolazioneStartUp: 0,
    primoAnnoAgevolato: 0,
    note: ''
  },
  MattiaTest: {
    nome: 'Mattia Test',
    codiceFiscale: '',
    partitaIva: '',
    indirizzo: '',
    cap: '',
    citta: '',
    provincia: '',
    nazione: 'IT',
    ateco: '62.10.00',
    atecoDescrizione: 'Attivita di programmazione informatica',
    iban: '',
    modalitaPagamento: 'Bonifico bancario',
    coefficiente: 67,
    impostaSostitutiva: 15,
    inpsMode: 'artigiani_commercianti',
    inpsCategoria: 'artigiano',
    inpsTipoGestSep: 'esclusivo',
    usaInpsUfficiale: 1,
    riduzione35: 0,
    limiteForfettario: 85000,
    inailTasso: 0,
    agevolazioneStartUp: 0,
    primoAnnoAgevolato: 0,
    note: 'Profilo di test — usato per smoke test XML import e feature in sviluppo.'
  }
};
const PROFILE_SYNC_FIELDS = [
  'coefficiente',
  'impostaSostitutiva',
  'inpsMode',
  'inpsCategoria',
  'inpsTipoGestSep',
  'usaInpsUfficiale',
  'limiteForfettario',
  'inailTasso'
];
let currentProfile = sessionStorage.getItem('currentProfile') || null;
window.getProfile = function() { return currentProfile; };
let clientiUiState = { search: '' };
let externalFiscalState = {
  profile: null,
  loaded: false,
  error: '',
  paidEntries: [],
  futureEntries: [],
  paidFlatEntries: [],
  futureFlatEntries: [],
  summaries: {},
  comparisonMatrix: []
};
let scadenziarioUiState = {
  view: 'competence',
  showHistoricalYears: false,
  showEmptyYears: false,
  openYears: new Set(),
  openArchived: new Set()
};

function updateProfileAvatar() {
  const avatarBtn = document.getElementById('profileAvatar');
  const initialsEl = document.getElementById('profileAvatarInitials');
  const nameEl = document.getElementById('profileMenuName');
  const subEl = document.getElementById('profileMenuSubtitle');
  if (!avatarBtn || !initialsEl) return;

  if (!currentProfile) {
    initialsEl.textContent = '·';
    if (nameEl) nameEl.textContent = '';
    if (subEl) subEl.textContent = '';
    avatarBtn.disabled = true;
    avatarBtn.setAttribute('title', 'Accedi per aprire il profilo');
    closeProfileMenu();
    return;
  }

  const ana = (data && data.settings && data.settings.anagrafica) || {};
  const nome = String(ana.nome || '').trim();
  const cognome = String(ana.cognome || '').trim();

  let initials, displayName;
  if (nome || cognome) {
    initials = ((nome.charAt(0) || '') + (cognome.charAt(0) || '')).toUpperCase();
    if (!initials) initials = currentProfile.charAt(0).toUpperCase();
    displayName = `${nome} ${cognome}`.trim();
  } else {
    initials = currentProfile.charAt(0).toUpperCase();
    displayName = currentProfile;
  }

  initialsEl.textContent = initials;
  if (nameEl) nameEl.textContent = displayName;
  if (subEl) subEl.textContent = `Profilo: ${currentProfile}`;
  avatarBtn.disabled = false;
  avatarBtn.setAttribute('title', displayName);
}

// Sidebar drawer + collapse estratti in app-shell.js
// (window.toggleSidebar / openSidebar / closeSidebar / toggleSidebarCollapsed / initSidebarCollapsed).

function toggleProfileMenu() {
  const menu = document.getElementById('profileMenu');
  if (!menu) return;
  if (menu.hidden) openProfileMenu();
  else closeProfileMenu();
}

function openProfileMenu() {
  const menu = document.getElementById('profileMenu');
  const btn = document.getElementById('profileAvatar');
  if (!menu || !btn || btn.disabled) return;
  menu.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  updateProfileMenuTheme();
}

function closeProfileMenu() {
  const menu = document.getElementById('profileMenu');
  const btn = document.getElementById('profileAvatar');
  if (!menu || !btn) return;
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function updateProfileMenuTheme() {
  const lbl = document.getElementById('profileMenuThemeLabel');
  if (!lbl) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  lbl.textContent = isLight ? 'chiaro' : 'scuro';
}

async function hashPassword(pwd) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function doLogin() {
  clearYearDataCache();
  const pwd = document.getElementById('loginPassword').value;
  const hash = await hashPassword(pwd);
  const profile = PROFILE_HASHES[hash];
  if (!profile) {
    document.getElementById('loginError').textContent = 'Password errata';
    return;
  }
  currentProfile = profile;
  clientiUiState.search = '';
  sessionStorage.setItem('currentProfile', profile);
  document.getElementById('loginScreen').classList.add('hidden');
  document.body.classList.add('logged-in');

  loadProfileFiscalData();
  updateProfileAvatar();

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
  restoreActiveTab();
  loadProfileExternalFiscalData(profile).then(() => recalcAll());
}

function restoreActiveTab() {
  let saved = null;
  try { saved = localStorage.getItem('calcoliPIVA_activeTab'); } catch (_) {}
  if (!saved) return;
  const navBtn = document.querySelector('.sb-item[data-tab="' + saved + '"]');
  const tabEl = document.getElementById('tab-' + saved);
  if (navBtn && tabEl) switchToTab(saved);
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  if (typeof updateProfileMenuTheme === 'function') updateProfileMenuTheme();
}

function doLogout() {
  clearYearDataCache();
  if (typeof closeOcrPagamentoModal === 'function') closeOcrPagamentoModal();
  currentProfile = null;
  clientiUiState.search = '';
  sessionStorage.removeItem('currentProfile');
  externalFiscalState = {
    profile: null,
    loaded: false,
    error: '',
    paidEntries: [],
    futureEntries: [],
    paidFlatEntries: [],
    futureFlatEntries: [],
    summaries: {},
    comparisonMatrix: []
  };
  document.body.classList.remove('logged-in');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
  updateProfileAvatar();
}

function checkSession() {
  if (currentProfile) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.body.classList.add('logged-in');
    loadProfileFiscalData();
    updateProfileAvatar();
    // Init Firebase in background, then sync cloud → local → refresh UI
    initFirebase().then(ok => {
      if (ok) {
        syncAllFromCloud(currentProfile).then(count => {
          loadData();
          recalcAll();
          restoreActiveTab();
          loadProfileExternalFiscalData(currentProfile).then(() => recalcAll());
          // Also push any local-only changes to cloud
          if (typeof syncAllToCloud === 'function') syncAllToCloud(currentProfile);
        });
      } else {
        restoreActiveTab();
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
  '8': { label: 'Lavoro',       color: 'var(--color-cal-lavoro)', dark: false },
  'WE':{ label: 'Weekend',      color: 'rgba(255,255,255,.12)', dark: true },
  'F': { label: 'Ferie',        color: 'var(--color-cal-ferie)', dark: false },
  'FS':{ label: 'Festivo',      color: 'var(--color-cal-festivo)', dark: false },
  'M': { label: '1/2 giornata', color: 'var(--color-cal-mezzagiornata)', dark: false },
  'Malattia':  { label: 'Malattia',  color: 'var(--color-cal-malattia)', dark: false },
  'Donazione': { label: 'Donazione', color: 'var(--color-cal-donazione)', dark: false },
};
const PAYMENT_TYPES = {
  tasse:      { label: 'Tasse', color: 'var(--red)' },
  contributi: { label: 'Contributi', color: 'var(--yellow)' },
  misto:      { label: 'Misto', color: 'var(--blue)' },
  altro:      { label: 'Altro', color: 'var(--text2)' }
};
// Fonte: circolari INPS annuali (Gestione Artigiani e Commercianti)
// contribFissi = minimaleInps × aliquota + 7.44 (contributo aggiuntivo fisso)
const OFFICIAL_ARTCOM_INPS = {
  2020: {
    minimaleInps: 15953,
    artigiano: { contribFissi: 3836.16, aliqContributi: 24.0 },
    commerciante: { contribFissi: 3912.73, aliqContributi: 24.48 }
  },
  2021: {
    minimaleInps: 15953,
    artigiano: { contribFissi: 3836.16, aliqContributi: 24.0 },
    commerciante: { contribFissi: 3912.73, aliqContributi: 24.48 }
  },
  2022: {
    minimaleInps: 16243,
    artigiano: { contribFissi: 3905.76, aliqContributi: 24.0 },
    commerciante: { contribFissi: 3983.73, aliqContributi: 24.48 }
  },
  2023: {
    minimaleInps: 17504,
    artigiano: { contribFissi: 4208.40, aliqContributi: 24.0 },
    commerciante: { contribFissi: 4292.42, aliqContributi: 24.48 }
  },
  2024: {
    minimaleInps: 18415,
    artigiano: { contribFissi: 4427.04, aliqContributi: 24.0 },
    commerciante: { contribFissi: 4515.43, aliqContributi: 24.48 }
  },
  2025: {
    minimaleInps: 18555,
    artigiano: { contribFissi: 4460.64, aliqContributi: 24.0 },
    commerciante: { contribFissi: 4549.70, aliqContributi: 24.48 }
  },
  2026: {
    minimaleInps: 18808,
    artigiano: { contribFissi: 4521.36, aliqContributi: 24.0 },
    commerciante: { contribFissi: 4611.63, aliqContributi: 24.48 }
  }
};
// Massimale contributivo annuo INPS Gestione Separata
// Fonte: circolari INPS annuali (art. 2 c. 18 L. 335/1995)
// Si applica a: base imponibile annua per il calcolo dei contributi gestione separata
const OFFICIAL_GESTIONE_SEPARATA_MASSIMALE = {
  2020: 103055,
  2021: 103055,
  2022: 105014,
  2023: 113520,
  2024: 119650,
  2025: 120607,
  2026: 122295
};
function getGestSepMassimale(year) {
  const y = parseInt(year, 10);
  if (OFFICIAL_GESTIONE_SEPARATA_MASSIMALE[y]) return OFFICIAL_GESTIONE_SEPARATA_MASSIMALE[y];
  const known = Object.keys(OFFICIAL_GESTIONE_SEPARATA_MASSIMALE).map(Number).sort((a, b) => a - b);
  if (y < known[0]) return OFFICIAL_GESTIONE_SEPARATA_MASSIMALE[known[0]];
  return OFFICIAL_GESTIONE_SEPARATA_MASSIMALE[known[known.length - 1]];
}
// Aliquote INPS Gestione Separata per Partita IVA (libero professionista)
// Fonte: circolari INPS annuali (12/2020, 12/2021, 25/2022, 12/2023, 24/2024, 26/2025, 8/2026)
// - esclusivo: iscritti alla sola gestione separata (P.IVA senza altra copertura previdenziale)
// - altra_cassa: iscritti che hanno già altra copertura (dipendenti, pensionati, altra cassa prof.)
const OFFICIAL_GESTIONE_SEPARATA_INPS = {
  2020: { esclusivo: 25.72, altra_cassa: 24.00 },
  2021: { esclusivo: 25.98, altra_cassa: 24.00 },
  2022: { esclusivo: 26.23, altra_cassa: 24.00 },
  2023: { esclusivo: 26.23, altra_cassa: 24.00 },
  2024: { esclusivo: 26.07, altra_cassa: 24.00 },
  2025: { esclusivo: 26.07, altra_cassa: 24.00 },
  2026: { esclusivo: 26.07, altra_cassa: 24.00 }
};
function normalizeGestSepTipo(tipo) {
  const t = String(tipo || '').toLowerCase().trim();
  return t === 'altra_cassa' ? 'altra_cassa' : 'esclusivo';
}
function getOfficialGestSepAliquota(year, tipo) {
  const y = parseInt(year, 10);
  const kind = normalizeGestSepTipo(tipo);
  const known = Object.keys(OFFICIAL_GESTIONE_SEPARATA_INPS).map(Number).sort((a, b) => a - b);
  let yearUsed;
  if (OFFICIAL_GESTIONE_SEPARATA_INPS[y]) {
    yearUsed = y;
  } else if (y < known[0]) {
    yearUsed = known[0];
  } else {
    yearUsed = known[known.length - 1];
  }
  return {
    aliqContributi: OFFICIAL_GESTIONE_SEPARATA_INPS[yearUsed][kind],
    tipo: kind,
    yearUsed,
    isFallback: yearUsed !== y
  };
}
// Retribuzione convenzionale annua INAIL per artigiani titolari (= retribuzione giornaliera × 300)
// Usata per stimare il premio INAIL ordinario: premio = base × tasso ‰ × 1.01 (addizionale ANMIL 1%).
// Fonte: circolare INAIL annuale (es. circ. 12/2024 per anno 2024; circ. 29/2025 per anno 2025).
// La circolare per il 2026 verrà pubblicata indicativamente a maggio 2026; fino ad allora fallback al 2025.
// Nota: questo NON è il "minimale di rendita" INAIL in senso stretto (= 20.426,70 € per il 2025,
// rivalutazione rendite ai sopravvissuti). Per l'utente conviene comunque usare l'override manuale
// "Autoliquidazione INAIL febbraio" nello scadenziario quando si conosce l'importo esatto.
const INAIL_MINIMALE_RENDITA = {
  2024: 17061.00, // 56,87 × 300 - Circolare INAIL 12/2024 del 23 maggio 2024
  2025: 17196.00  // 57,32 × 300 - Circolare INAIL 29/2025 del 20 maggio 2025
};
function getInailMinimale(year) {
  if (INAIL_MINIMALE_RENDITA[year]) return INAIL_MINIMALE_RENDITA[year];
  const knownYears = Object.keys(INAIL_MINIMALE_RENDITA).map(Number).sort((a, b) => a - b);
  const fallback = knownYears.filter(y => y <= year).pop() || knownYears[knownYears.length - 1];
  return INAIL_MINIMALE_RENDITA[fallback];
}
function calcInailPremio(year, tassoPerMille) {
  if (!tassoPerMille || tassoPerMille <= 0) return 0;
  const base = getInailMinimale(year);
  return Math.round(base * tassoPerMille / 1000 * 1.01 * 100) / 100;
}

// Imposta di bollo: 2€ per ogni fattura con importo > 77.47€
// Scadenze: Q1 → 31/5, Q2 → 30/9, Q3 → 30/11, Q4 → 28/2 anno successivo
// Se bollo trimestrale ≤ 5000€, si puo accorpare al trimestre successivo (L. 73/2022 art. 3)
const BOLLO_SOGLIA = window.ForfettarioRules.BOLLO_THRESHOLD;
const BOLLO_IMPORTO = 2.00;
const BOLLO_DIFFERIMENTO_SOGLIA = 5000; // EUR — L. 73/2022 art. 3
const BOLLO_QUARTERS = [
  { label: '1o trimestre', months: [1, 2, 3], dueMonth: 5, dueDay: 31, codice: '2521' },
  { label: '2o trimestre', months: [4, 5, 6], dueMonth: 9, dueDay: 30, codice: '2522' },
  { label: '3o trimestre', months: [7, 8, 9], dueMonth: 11, dueDay: 30, codice: '2523' },
  { label: '4o trimestre', months: [10, 11, 12], dueMonth: 2, dueDay: 28, codice: '2524', nextYear: true }
];
function calcBolloPerQuarter(yearData, year) {
  const hasSelectors = typeof window !== 'undefined'
    && window.FattureSelectors
    && typeof window.FattureSelectors.getByQuarter === 'function';
  const profile = (typeof currentProfile !== 'undefined') ? currentProfile : null;
  const derivedYear = Number(year) || Number(yearData && yearData.year) || null;

  return BOLLO_QUARTERS.map((q, qi) => {
    let count = 0;
    if (hasSelectors && profile && derivedYear) {
      const fatture = window.FattureSelectors.getByQuarter(profile, derivedYear, qi + 1);
      for (const f of fatture) {
        const gross = Math.abs(window.FattureSelectors.getImportoSigned(f));
        if (gross > BOLLO_SOGLIA) count++;
      }
    } else {
      // Fallback legacy: monthly store
      const fatture = yearData && yearData.fatture ? yearData.fatture : {};
      for (const m of q.months) {
        const arr = fatture[m];
        if (!Array.isArray(arr)) continue;
        for (const f of arr) {
          if ((parseFloat(f.importo) || 0) > BOLLO_SOGLIA) count++;
        }
      }
    }
    return { ...q, count, amount: count * BOLLO_IMPORTO };
  });
}

// Applica L. 73/2022 art. 3: se Q1 <= 5000, accorpa a Q2; se Q1+Q2 cumulato <= 5000, accorpa a Q3.
// Nessun differimento dopo Q3: Q4 ha la sua scadenza naturale (28/2 anno successivo).
// Gli override manuali bypassano il consolidamento sul trimestre interessato.
function applyBolloDifferimento(quarters, hasManualOverride) {
  const result = quarters.map(q => ({
    ...q,
    finalAmount: q.amount,
    deferredFromLabels: [],
    deferred: false
  }));
  // Q1 -> Q2
  if (!hasManualOverride(0) && !hasManualOverride(1)
      && result[0].finalAmount > 0
      && result[0].finalAmount <= BOLLO_DIFFERIMENTO_SOGLIA) {
    result[1].finalAmount += result[0].finalAmount;
    result[1].deferredFromLabels.push(result[0].label);
    result[0].deferred = true;
    result[0].finalAmount = 0;
  }
  // Q2 (eventualmente cumulato con Q1) -> Q3
  if (!hasManualOverride(1) && !hasManualOverride(2)
      && result[1].finalAmount > 0
      && result[1].finalAmount <= BOLLO_DIFFERIMENTO_SOGLIA) {
    result[2].finalAmount += result[1].finalAmount;
    result[2].deferredFromLabels.push(...result[1].deferredFromLabels, result[1].label);
    result[1].deferred = true;
    result[1].finalAmount = 0;
  }
  return result;
}

const F24_GUIDE = {
  imposta_saldo: {
    titolo: 'Saldo Imposta Sostitutiva',
    codiceTributo: '1792',
    sezione: 'Erario',
    annoRif: 'Anno di competenza (es. 2025 se saldo 2025)',
    istruzioni: [
      'Accedi al tuo <b>home banking</b> (sezione pagamenti/F24) oppure al sito dell\'Agenzia delle Entrate:',
      'Se usi l\'home banking: cerca "Pagamento F24" o "F24 semplificato" nel menu pagamenti',
      'Se usi il sito AdE: vai su <b>agenziaentrate.gov.it</b> > Area riservata > Servizi > F24 Web',
      'Nella sezione <b>Erario</b> del modello F24, inserisci il codice tributo <b>1792</b>',
      'Nel campo "Anno di riferimento" indica l\'anno a cui si riferisce il saldo (es. 2025)',
      'Nel campo "Importi a debito versati" inserisci l\'importo indicato nello scadenziario',
      'Rateazione/regione/prov: lascia vuoto per il forfettario',
      'Verifica il totale e conferma il pagamento entro la scadenza (30 giugno)'
    ],
    note: 'Se il saldo risulta a credito (hai pagato piu acconti del dovuto), puoi usare il codice 1792 nella colonna "importi a credito" per compensare altri tributi nello stesso F24.'
  },
  imposta_acc1: {
    titolo: '1° Acconto Imposta Sostitutiva',
    codiceTributo: '1790',
    sezione: 'Erario',
    annoRif: 'Anno corrente (es. 2026 se acconto 2026)',
    istruzioni: [
      'Accedi al tuo <b>home banking</b> (sezione pagamenti/F24) oppure al sito dell\'Agenzia delle Entrate',
      'Home banking: cerca "Pagamento F24" nel menu. Molte banche hanno un modello precompilabile',
      'Sito AdE: <b>agenziaentrate.gov.it</b> > Accedi con SPID/CIE > Servizi > F24 Web',
      'Nella sezione <b>Erario</b>, inserisci il codice tributo <b>1790</b>',
      'Anno di riferimento: l\'anno per cui stai versando l\'acconto (es. 2026)',
      'Importo a debito: il 40% della base calcolata (metodo storico o previsionale)',
      'Scadenza ordinaria: <b>30 giugno</b>, stesso giorno del saldo anno precedente'
    ],
    note: 'Il primo acconto e pari al 40% dell\'imposta dell\'anno precedente (storico) o dell\'imposta prevista (previsionale). Si paga insieme al saldo dell\'anno prima.'
  },
  imposta_acc2: {
    titolo: '2° Acconto Imposta Sostitutiva',
    codiceTributo: '1791',
    sezione: 'Erario',
    annoRif: 'Anno corrente',
    istruzioni: [
      'Accedi al tuo <b>home banking</b> oppure al sito dell\'Agenzia delle Entrate',
      'Home banking: "Pagamento F24" nel menu pagamenti',
      'Sito AdE: <b>agenziaentrate.gov.it</b> > Accedi con SPID/CIE > Servizi > F24 Web',
      'Nella sezione <b>Erario</b>, inserisci il codice tributo <b>1791</b>',
      'Anno di riferimento: l\'anno corrente',
      'Importo a debito: il 60% della base calcolata',
      'Scadenza ordinaria: <b>30 novembre</b>'
    ],
    note: 'Il secondo acconto e pari al 60%. Non e rateizzabile ne compensabile con il primo acconto. Se l\'importo totale e sotto 257,52 EUR si versa tutto come unico acconto a novembre.'
  },
  inps_fissi: {
    titolo: 'Rata Fissa INPS Artigiani/Commercianti',
    codiceTributo: 'Precompilato INPS',
    sezione: 'INPS',
    annoRif: 'Anno corrente',
    istruzioni: [
      'Le rate fisse INPS si pagano tramite <b>F24 precompilato dall\'INPS</b>. Non devi compilarlo tu.',
      'Vai su <b>inps.it</b> > Accedi con SPID/CIE',
      'Cerca "Cassetto Previdenziale Artigiani e Commercianti" nella barra di ricerca',
      'Nel menu laterale vai su <b>Versamenti</b> > <b>Mod. F24</b>',
      'Troverai gli F24 precompilati con tutti i dati gia inseriti (codici, importi, scadenze)',
      'Scarica il PDF dell\'F24 per la rata che devi pagare',
      'Puoi pagarlo tramite <b>home banking</b> (carica l\'F24 o ricompila i dati) oppure in <b>banca/posta</b> con il cartaceo',
      'Scadenze: 16 maggio, 20 agosto, 16 novembre, 16 febbraio (anno dopo)'
    ],
    note: 'Queste rate coprono i contributi minimi sul minimale. Se hai la riduzione 35% (nuove attivita), l\'importo e gia ridotto. L\'F24 precompilato INPS e il modo piu sicuro: eviti errori nei codici.'
  },
  contributi_saldo: {
    titolo: 'Saldo Contributi INPS (eccedenza sul minimale)',
    codiceTributo: 'Precompilato INPS',
    sezione: 'INPS',
    annoRif: 'Anno di competenza',
    istruzioni: [
      'Il saldo INPS sulla quota eccedente si paga con F24',
      'Vai su <b>inps.it</b> > Accedi con SPID/CIE > Cassetto Previdenziale Artigiani e Commercianti',
      'Sezione <b>Versamenti</b> > <b>Mod. F24</b>: cerca l\'F24 per il saldo eccedenza',
      'Se l\'INPS non ha ancora generato l\'F24, puoi compilarlo manualmente:',
      'Nella sezione <b>INPS</b> del modello F24 indica: codice sede, causale contributo, matricola INPS, periodo (mm/aaaa), importo',
      'Causali contributo: <b>AP</b> (artigiani — saldo) / <b>AF</b> (commercianti — saldo) / <b>P10/CF</b> (gestione separata)',
      'Il saldo = contributi effettivi anno precedente - acconti gia versati',
      'Scadenza: <b>30 giugno</b> (insieme al saldo imposta)'
    ],
    note: 'Causali ufficiali INPS: AP/AF (artigiani/commercianti — saldo eccedenza), APR/APF con riduzione 35%, P10 (GS professionisti senza altra gestione), CF (GS collaboratori). Verifica sempre sul Cassetto Previdenziale i dati esatti. Se il saldo e negativo, hai un credito utilizzabile in compensazione.'
  },
  contributi_acc1: {
    titolo: '1° Acconto Contributi INPS (eccedenza)',
    codiceTributo: 'Precompilato INPS',
    sezione: 'INPS',
    annoRif: 'Anno corrente',
    istruzioni: [
      'Il primo acconto INPS si paga con F24',
      'Vai su <b>inps.it</b> > Cassetto Previdenziale > <b>Versamenti</b> > <b>Mod. F24</b>',
      'Cerca l\'F24 precompilato per l\'acconto eccedenza. Se non disponibile:',
      'Compila manualmente la sezione <b>INPS</b> del modello F24 con i dati della tua posizione',
      'Causali contributo: <b>AP</b> (artigiani — 1° acconto) / <b>AF</b> (commercianti — 1° acconto) / <b>P10/CF</b> (gestione separata)',
      'Importo: 40% dei contributi variabili dell\'anno precedente (storico) o previsti (previsionale)',
      'Scadenza: <b>30 giugno</b>, insieme al saldo e al primo acconto imposta'
    ],
    note: 'Se i contributi variabili sono sotto la soglia di 51,65 EUR, non e dovuto alcun acconto. Causali ufficiali INPS: AP/AF (artigiani/commercianti), APR/APF con riduzione 35%, P10/CF per gestione separata.'
  },
  contributi_acc2: {
    titolo: '2° Acconto Contributi INPS (eccedenza)',
    codiceTributo: 'Precompilato INPS',
    sezione: 'INPS',
    annoRif: 'Anno corrente',
    istruzioni: [
      'Il secondo acconto INPS si paga con F24',
      'Vai su <b>inps.it</b> > Cassetto Previdenziale > <b>Versamenti</b> > <b>Mod. F24</b>',
      'Scarica l\'F24 precompilato o compilalo manualmente',
      'Causali contributo: <b>AP</b> (artigiani — 2° acconto) / <b>AF</b> (commercianti — 2° acconto) / <b>P10/CF</b> (gestione separata)',
      'Importo: 60% dei contributi variabili',
      'Scadenza: <b>30 novembre</b>'
    ],
    note: 'Il secondo acconto non e rateizzabile. Se sotto soglia (51,65 EUR totali) non e dovuto; se sotto 257,52 EUR (inclusivo) si versa tutto a novembre come unico acconto. Causali INPS: AP/AF (artigiani/commercianti), APR/APF con riduzione 35%, P10/CF per gestione separata.'
  },
  camera: {
    titolo: 'Diritto Annuale Camera di Commercio',
    codiceTributo: '3850',
    sezione: 'IMU e altri tributi locali',
    annoRif: 'Anno corrente',
    istruzioni: [
      'Il diritto camerale si paga con F24',
      'Accedi al tuo <b>home banking</b> > Pagamento F24, oppure:',
      'Sito AdE: <b>agenziaentrate.gov.it</b> > Servizi > F24 Web',
      'Nella sezione <b>"IMU e altri tributi locali"</b> (non Erario!):',
      'Codice ente: il codice della tua Camera di Commercio (es. "TO" per Torino)',
      'Codice tributo: <b>3850</b>',
      'Anno di riferimento: anno corrente',
      'Scadenza: <b>30 giugno</b>'
    ],
    note: 'L\'importo per i forfettari artigiani/commercianti e generalmente fisso (circa 53 EUR). Verifica l\'importo esatto sul sito della tua Camera di Commercio territoriale: registroimprese.it.'
  },
  bollo: {
    titolo: 'Imposta di Bollo Fatture Elettroniche',
    codiceTributo: '2521-2524',
    sezione: 'Erario',
    annoRif: 'Trimestre di competenza',
    istruzioni: [
      'L\'imposta di bollo si versa tramite il portale <b>"Fatture e Corrispettivi"</b> dell\'Agenzia delle Entrate',
      'Vai su <b>agenziaentrate.gov.it</b> > Accedi con SPID/CIE',
      'Cerca <b>"Fatture e Corrispettivi"</b> nei servizi disponibili',
      'Nel menu vai su <b>"Consultazione" > "Fatture elettroniche e altri dati IVA"</b>',
      'Poi <b>"Pagamento imposta di bollo"</b>',
      'Il sistema calcola automaticamente l\'importo dovuto per trimestre dalle tue fatture',
      'Puoi pagare <b>direttamente online</b> con addebito su conto corrente (IBAN)',
      'Non serve compilare un F24 manuale! Il pagamento avviene tutto dal portale',
      'Codici tributo (per riferimento): 2521 (1° trim), 2522 (2° trim), 2523 (3° trim), 2524 (4° trim)'
    ],
    note: 'Se l\'importo del 1° trimestre e sotto 5.000 EUR, si puo rimandare al 2° trimestre. Stessa regola per il 3° trimestre verso il 4°. Molti forfettari pagano tutto a novembre (Q1-Q3) e a febbraio (Q4).'
  },
  inail: {
    titolo: 'Autoliquidazione INAIL',
    codiceTributo: '—',
    sezione: 'Altri enti previdenziali',
    annoRif: 'Anno di competenza',
    istruzioni: [
      'L\'autoliquidazione INAIL si paga con F24 a febbraio',
      'Vai su <b>inail.it</b> > Accedi con SPID/CIE > Servizi online',
      'Cerca <b>"Autoliquidazione premi"</b> nei servizi disponibili',
      'Scarica il modello F24 precompilato dalla sezione autoliquidazione',
      'L\'importo e calcolato sulla base delle retribuzioni dichiarate',
      'Scadenza: <b>16 febbraio</b>',
      'Puoi pagare tramite home banking o in banca/posta'
    ],
    note: 'L\'INAIL e obbligatorio solo per chi ha una posizione assicurativa attiva (es. artigiani con rischio infortuni). Se non hai una posizione INAIL, ignora questa voce.'
  }
};

function getF24GuideKey(scheduleRowKey) {
  const row = scheduleRowKey && typeof scheduleRowKey === 'object' ? scheduleRowKey : null;
  const key = row ? (row.key || row.scheduleKey || row.id || '') : String(scheduleRowKey || '');
  if (row && row.family) {
    if (row.family === 'inps_fixed') return 'inps_fissi';
    if (row.family === 'tax_stamp') return 'bollo';
    if (row.family === 'inail') return 'inail';
    if (row.family === 'chamber_fee') return 'camera';
  }
  if (!key) return null;
  const prefixes = [
    ['imposta_saldo_', 'imposta_saldo'],
    ['imposta_acc1_', 'imposta_acc1'],
    ['imposta_acc2_', 'imposta_acc2'],
    ['inps_fissi_', 'inps_fissi'],
    ['contributi_saldo_', 'contributi_saldo'],
    ['contributi_acc1_', 'contributi_acc1'],
    ['contributi_acc2_', 'contributi_acc2'],
    ['camera_', 'camera'],
    ['bollo_', 'bollo'],
    ['inail_', 'inail']
  ];
  for (const [prefix, mappedKey] of prefixes) {
    if (key.startsWith(prefix)) return mappedKey;
  }
  if (row && row.family === 'inps_variable' && row.kind === 'contributi') {
    const title = String(row.title || row.competence || '').toLowerCase();
    if (title.includes('acconto')) return 'contributi_acc1';
    if (title.includes('saldo')) return 'contributi_saldo';
  }
  return null;
}

function renderF24Guide(guideKey, rowItem) {
  const guide = F24_GUIDE[guideKey];
  if (!guide) return '';
  const anno = rowItem && rowItem.fiscalYear ? rowItem.fiscalYear : currentYear;
  let h = `<div class="f24-guide">`;
  h += `<h4>${guide.titolo}</h4>`;
  h += `<div class="f24-guide-meta">`;
  h += `<span>Codice tributo: <b>${guide.codiceTributo}</b></span>`;
  h += `<span>Sezione F24: <b>${guide.sezione}</b></span>`;
  h += `<span>Anno rif.: <b>${guide.annoRif}</b></span>`;
  h += `</div>`;
  h += `<ol>`;
  for (const step of guide.istruzioni) h += `<li>${step}</li>`;
  h += `</ol>`;
  if (guide.note) {
    h += `<div class="f24-guide-note">${guide.note}</div>`;
  }
  h += `</div>`;
  return h;
}

function toggleF24Guide(key) {
  const safeId = 'f24guide_' + key.replace(/[^a-zA-Z0-9_]/g, '_');
  const el = document.getElementById(safeId);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

const FORFETTARIO_RULES = {
  accontoThreshold: 51.65,
  singleAccontoThreshold: 257.52,
  saldoMonth: 6,
  saldoDay: 30,
  secondoAccontoMonth: 11,
  secondoAccontoDay: 30,
  fixedInpsDates: [[5, 16], [8, 20], [11, 16], [2, 16]],
  fixedAccontoWeights: [40, 60]
};

let currentYear = new Date().getFullYear();
window.getCurrentYear = function () { return currentYear; };
let data = {};

function getActualCalendarYear() {
  return new Date().getFullYear();
}

function isClosedFiscalYear(year) {
  return (parseInt(year, 10) || currentYear) < getActualCalendarYear();
}

// ═══════════════════ Storage → app-storage.js ═══════════════════

// ═══════════════════ Date helpers ═══════════════════
// getEaster, isHoliday, pad2, parseIsoDate aliasati da date-utils.js (vedi top file)
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
// year param routes to FattureSelectors when available; legacy fallback for unmigrated data.
function getFattureFromYearData(yearData, month, year) {
  if (year && typeof window !== 'undefined' && window.FattureSelectors && currentProfile) {
    const fatture = window.FattureSelectors.getByMonth(currentProfile, year, month);
    // NC invoices (TD04) return negative importo via getImportoSigned
    return fatture.map(f => ({
      importo: window.FattureSelectors.getImportoSigned(f),
      pagMese: f.pagMese || null,
      pagAnno: f.pagAnno || null,
      desc: (f.righe && f.righe[0] && f.righe[0].descrizione) || f.numero || ''
    }));
  }
  // Legacy fallback (pre-migration or year not known)
  const arr = yearData && yearData.fatture ? yearData.fatture[month] : null;
  if (!arr || !Array.isArray(arr) || arr.length === 0) return [];
  return arr.map(f => ({
    importo: parseFloat(f.importo) || 0,
    pagMese: f.pagMese || null,
    pagAnno: f.pagAnno || null,
    desc: f.desc || ''
  }));
}

// Helper: get all fattureEmesse for the current profile (from FattureStorico or localStorage)
function _getFattureEmesse(profile) {
  if (window.FattureStorico) return window.FattureStorico.load(profile);
  const key = window.StorageKeys.fattureEmesse(profile);
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : []; } catch { return []; }
}

// Helper: save updated list back
function _saveFattureEmesse(profile, list) {
  if (window.FattureStorico) { window.FattureStorico.save(profile, list); return; }
  const key = window.StorageKeys.fattureEmesse(profile);
  localStorage.setItem(key, JSON.stringify(list));
}

// Helper: get id of fattura at position (month, idx) in the Fatture tab grid.
// Il tab raggruppa per mese di EMISSIONE (issuedMonth), quindi idx riferisce
// la posizione nella lista filtrata per issuedMonth — non pagMese.
function _getFatturaIdAt(month, idx) {
  if (!window.FattureSelectors) return null;
  const byIssued = typeof window.FattureSelectors.getByIssuedMonth === 'function'
    ? window.FattureSelectors.getByIssuedMonth(currentProfile, currentYear, month)
    : null;
  const rows = byIssued || window.FattureSelectors.getByMonth(currentProfile, currentYear, month);
  return rows[idx] ? rows[idx].id : null;
}

// getFatture: shim that reads from fattureEmesse via FattureSelectors.
// Returns legacy-shaped objects {importo, pagMese, pagAnno, desc, id, origine, stato, tipoDocumento}
// used by callers that haven't been refactored yet (e.g. getAllFattureForBudget uses yearData directly).
function getFatture(month) {
  if (window.FattureSelectors) {
    return window.FattureSelectors.getByMonth(currentProfile, currentYear, month).map(f => {
      const imp = window.FattureSelectors.getImportoSigned(f);
      const desc = (f.righe && f.righe[0] && f.righe[0].descrizione) || f.numero || '';
      const cliente = f.clienteSnapshot ? (f.clienteSnapshot.denominazione || (f.clienteSnapshot.nome || '')) : '';
      return {
        importo: imp,
        pagMese: f.pagMese || null,
        pagAnno: f.pagAnno || null,
        desc: cliente ? `${f.numero || ''} - ${cliente}`.trim().replace(/^-\s*/, '') : desc,
        id: f.id,
        origine: f.origine,
        stato: f.stato,
        tipoDocumento: f.tipoDocumento
      };
    });
  }
  // Fallback to legacy store (pre-migration)
  return getFattureFromYearData(data, month);
}

// getFattureIssued: come getFatture ma filtrata per mese di EMISSIONE (issuedMonth).
// Usata dal tab Fatture per raggruppare le fatture nel mese in cui sono state fatte.
function getFattureIssued(month) {
  if (window.FattureSelectors && typeof window.FattureSelectors.getByIssuedMonth === 'function') {
    return window.FattureSelectors.getByIssuedMonth(currentProfile, currentYear, month).map(f => {
      const imp = window.FattureSelectors.getImportoSigned(f);
      const desc = (f.righe && f.righe[0] && f.righe[0].descrizione) || f.numero || '';
      const cliente = f.clienteSnapshot ? (f.clienteSnapshot.denominazione || (f.clienteSnapshot.nome || '')) : '';
      return {
        importo: imp,
        pagMese: f.pagMese || null,
        pagAnno: f.pagAnno || null,
        desc: cliente ? `${f.numero || ''} - ${cliente}`.trim().replace(/^-\s*/, '') : desc,
        id: f.id,
        origine: f.origine,
        stato: f.stato,
        tipoDocumento: f.tipoDocumento
      };
    });
  }
  return getFattureFromYearData(data, month);
}

// Id lookup per posizione nel tab Fatture (raggruppato per issuedMonth).
function _getFatturaIdAtIssued(month, idx) {
  if (!window.FattureSelectors || typeof window.FattureSelectors.getByIssuedMonth !== 'function') return null;
  const rows = window.FattureSelectors.getByIssuedMonth(currentProfile, currentYear, month);
  return rows[idx] ? rows[idx].id : null;
}

function setFatturaImporto(month, idx, val) {
  const imp = parseFloat(val) || 0;
  let id = _getFatturaIdAt(month, idx);
  if (!id && window.FattureStorico) {
    // No existing row — create a new legacy-migrated entry on first write
    addFattura(month);
    id = _getFatturaIdAt(month, idx);
  }
  if (!id) {
    // Fallback: legacy store
    if (!data.fatture[month]) data.fatture[month] = [{ importo: 0, pagMese: null, pagAnno: null, desc: '' }];
    if (data.fatture[month][idx] === undefined) data.fatture[month][idx] = { importo: 0, pagMese: null, pagAnno: null, desc: '' };
    data.fatture[month][idx].importo = imp;
    saveData(); return;
  }
  const list = _getFattureEmesse(currentProfile);
  const i = list.findIndex(f => f.id === id);
  if (i < 0) return;
  if (list[i].righe && list[i].righe.length > 0) {
    list[i].righe[0].prezzoUnitario = imp;
    list[i].righe[0].quantita = 1;
  } else {
    list[i].righe = [{ descrizione: '', quantita: 1, prezzoUnitario: imp, iva: 0 }];
  }
  _saveFattureEmesse(currentProfile, list);
}

function setFatturaDesc(month, idx, val) {
  const id = _getFatturaIdAt(month, idx);
  if (!id) {
    // Fallback: legacy store
    if (!data.fatture[month] || !data.fatture[month][idx]) return;
    data.fatture[month][idx].desc = val;
    saveData(); return;
  }
  const list = _getFattureEmesse(currentProfile);
  const i = list.findIndex(f => f.id === id);
  if (i < 0) return;
  if (list[i].righe && list[i].righe.length > 0) {
    list[i].righe[0].descrizione = val;
  } else {
    list[i].righe = [{ descrizione: val, quantita: 1, prezzoUnitario: 0, iva: 0 }];
  }
  _saveFattureEmesse(currentProfile, list);
}

function setFatturaPagamento(month, idx, pagMese, pagAnno) {
  const id = _getFatturaIdAt(month, idx);
  if (!id) {
    // Fallback: legacy store
    if (!data.fatture[month]) data.fatture[month] = [{ importo: 0, pagMese: null, pagAnno: null, desc: '' }];
    if (!data.fatture[month][idx]) return;
    data.fatture[month][idx].pagMese = pagMese;
    data.fatture[month][idx].pagAnno = pagAnno;
    saveData(); return;
  }
  const list = _getFattureEmesse(currentProfile);
  const i = list.findIndex(f => f.id === id);
  if (i < 0) return;
  list[i].pagMese = pagMese;
  list[i].pagAnno = pagAnno;
  _saveFattureEmesse(currentProfile, list);
}

function addFattura(month) {
  if (window.FattureStorico) {
    const list = _getFattureEmesse(currentProfile);
    const prog = window.FattureStorico.nextProgressivo(currentYear, list);
    const pad = n => String(n).padStart(2, '0');
    const newFatt = {
      id: 'fat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      numero: window.FattureStorico.formatNumero(currentYear, prog),
      anno: currentYear,
      annoProgressivo: currentYear,
      progressivo: prog,
      data: `${currentYear}-${pad(month)}-01`,
      clienteId: '',
      clienteSnapshot: null,
      righe: [{ descrizione: '', quantita: 1, prezzoUnitario: 0, iva: 0 }],
      contributoIntegrativo: 0,
      marcaDaBollo: false,
      bolloAddebitato: false,
      note: '',
      modalitaPagamento: '',
      scadenzaPagamento: '',
      incassata: false,
      dataIncasso: '',
      issuedMonth: month,
      issuedYear: currentYear,
      stato: 'pagata',
      tipoDocumento: 'TD01',
      dataInvioSdi: null,
      dataPagamento: null,
      fatturaOriginaleId: null,
      ritenuta: 0,
      aliquotaRitenuta: 0,
      tipoRitenuta: '',
      causaleRitenuta: '',
      ncIds: [],
      ncTotaleImporto: 0,
      pagMese: month,
      pagAnno: currentYear,
      origine: 'legacy-migrated'
    };
    list.unshift(newFatt);
    _saveFattureEmesse(currentProfile, list);
  } else {
    if (!data.fatture[month]) data.fatture[month] = [];
    data.fatture[month].push({ importo: 0, pagMese: null, pagAnno: null, desc: '' });
    saveData();
  }
  recalcAll();
}

function removeFattura(month, idx) {
  const id = _getFatturaIdAt(month, idx);
  if (id) {
    const list = _getFattureEmesse(currentProfile);
    const updated = list.filter(f => f.id !== id);
    _saveFattureEmesse(currentProfile, updated);
    recalcAll();
    return;
  }
  // Fallback: legacy store
  if (!data.fatture[month] || !data.fatture[month][idx]) return;
  const row = data.fatture[month][idx];
  const linkedInvoiceId = String(row.invoiceId || row.fatturaId || '').trim();
  const canDeleteLast = !!linkedInvoiceId;
  if (data.fatture[month].length <= 1 && !canDeleteLast) return;
  data.fatture[month].splice(idx, 1);
  if (data.fatture[month].length === 0) delete data.fatture[month];
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
  const includeEstimates = shouldIncludeEstimatesForYear(currentYear);

  if (!hasFatture) {
    // No fattura: use calendar estimate, but only if it would be paid this year
    if (!includeEstimates) return 0;
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

// Get invoices from previous years that are paid in the target year
function getCrossYearInvoicesForYear(year) {
  // Prefer unified store via FattureSelectors.getCrossYearPaidIn
  if (typeof window !== 'undefined' && window.FattureSelectors && currentProfile) {
    const crossFatture = window.FattureSelectors.getCrossYearPaidIn(currentProfile, year);
    return crossFatture.map(f => {
      const dataAnno = parseInt(String(f.data || '').slice(0, 4), 10) || null;
      const imp = window.FattureSelectors.getImportoSigned(f);
      const desc = (f.righe && f.righe[0] && f.righe[0].descrizione) || f.numero || '';
      return {
        mese: Number(f.pagMese) || null,
        anno: dataAnno,
        importo: imp,
        pagMese: f.pagMese || null,
        desc
      };
    }).filter(f => f.importo > 0 && f.anno && f.anno < year);
  }
  // Legacy fallback
  const results = [];
  for (const sourceYear of getStoredYears(year - 1)) {
    if (sourceYear >= year) continue;
    const sourceData = loadYearData(sourceYear);
    if (!sourceData || !sourceData.fatture) continue;
    for (let m = 1; m <= 12; m++) {
      for (const f of getFattureFromYearData(sourceData, m, sourceYear)) {
        const importo = parseFloat(f.importo) || 0;
        if (importo > 0 && f.pagAnno === year) {
          results.push({ mese: m, anno: sourceYear, importo, pagMese: f.pagMese, desc: f.desc || '' });
        }
      }
    }
  }
  return results;
}

function getCrossYearInvoices() {
  return getCrossYearInvoicesForYear(currentYear);
}

function getTotalAnnuo() {
  const usingSelectors = typeof window !== 'undefined' && window.FattureSelectors && currentProfile;
  let t = 0;
  for (let m = 1; m <= 12; m++) t += getMonthEuro(m);
  // When FattureSelectors is unavailable, monthly buckets are issued-year scoped;
  // cross-year invoices (issued prior year, paid this year) must be added explicitly.
  if (!usingSelectors) {
    for (const inv of getCrossYearInvoices()) t += inv.importo;
  }
  return t;
}

function getTotalWorkedDays() {
  let t = 0; for (let m = 1; m <= 12; m++) t += getMonthStats(m).worked; return t;
}

function getActivityFromYearData(yearData, year, month, day) {
  const key = month + '-' + day;
  const calendar = yearData && yearData.calendar ? yearData.calendar : {};
  return calendar[key] !== undefined ? calendar[key] : getDefaultActivity(year, month, day);
}

function getMonthStatsFromYearData(yearData, year, month) {
  const dim = daysInMonth(year, month);
  const stats = { worked: 0, F: 0, FS: 0, WE: 0, M: 0, Malattia: 0, Donazione: 0, total: dim };
  for (let d = 1; d <= dim; d++) {
    const act = getActivityFromYearData(yearData, year, month, d);
    if (act === '8') stats.worked++;
    else if (stats[act] !== undefined) stats[act]++;
  }
  return stats;
}

function isEstimatePayableInYearForSettings(year, month, settings) {
  const giorni = parseFloat(settings && settings.giorniIncasso) || 30;
  const lastDay = new Date(year, month, 0);
  const payDate = new Date(lastDay);
  payDate.setDate(payDate.getDate() + giorni);
  return payDate.getFullYear() <= year;
}

function shouldIncludeEstimatesForYear(year, options) {
  const opts = options || {};
  if (opts.includeEstimates === true) return true;
  if (opts.includeEstimates === false) return false;
  return !isClosedFiscalYear(year);
}

function getMonthEuroFromYearData(yearData, year, month, options) {
  const opts = options || {};
  const includeEstimates = shouldIncludeEstimatesForYear(year, opts);
  const fatture = getFattureFromYearData(yearData, month, year);
  const hasFatture = fatture.some(f => f.importo > 0);
  if (!hasFatture) {
    if (!includeEstimates) return 0;
    if (!isEstimatePayableInYearForSettings(year, month, yearData.settings || {})) return 0;
    const stats = getMonthStatsFromYearData(yearData, year, month);
    const rate = parseFloat(yearData.settings && yearData.settings.dailyRate) || 0;
    return stats.worked * rate + stats.M * rate / 2;
  }

  let total = 0;
  for (const f of fatture) {
    if (f.importo > 0 && f.pagAnno && f.pagAnno !== year) continue;
    total += f.importo;
  }
  return total;
}

function getYearDataFor(year) {
  return year === currentYear ? ensureDataShape(data, year) : loadYearData(year);
}

// Build a month→ricavi map from FattureSelectors for the given profile/year (per-cassa, pagAnno-based).
// NC invoices (TD04) contribute negative amounts via getImportoSigned, netting stornate automatically.
// Stornate with a linked TD04 are skipped to avoid double-counting: the TD04 NC already reduces the total.
// Returns { 1: amount, 2: amount, ... } for months with non-zero ricavi.
function buildRicaviMeseFromSelectors(profile, year) {
  const m2r = {};
  if (!window.FattureSelectors) return m2r;
  const fatture = window.FattureSelectors.getByPagAnno(profile, year);
  for (const f of fatture) {
    if (f.stato === 'bozza') continue;
    if (f.stato === 'stornata') continue; // TD04 NC already accounts for the cancellation
    const mese = Number(f.pagMese);
    if (!mese) continue;
    const imp = window.FattureSelectors.getImportoSigned(f); // NC (TD04) → negative
    m2r[mese] = (m2r[mese] || 0) + imp;
  }
  return m2r;
}

function getTotalAnnuoForYear(year, options) {
  const yearData = getYearDataFor(year);
  if (!yearData) return 0;

  // When selectors available and no estimates needed: use per-cassa ricavi map for accuracy.
  // ricaviMap is built from getByPagAnno which already includes cross-year invoices
  // (issued prior year, paid in this year), so do NOT re-add getCrossYearInvoicesForYear.
  if (typeof window !== 'undefined' && window.FattureSelectors && currentProfile &&
      options && options.includeEstimates === false) {
    const ricaviMap = buildRicaviMeseFromSelectors(currentProfile, year);
    let total = 0;
    for (const m in ricaviMap) total += ricaviMap[m];
    return total;
  }

  // Monthly buckets already include cross-year paid-in when FattureSelectors is available
  // (getByMonth filters by pagAnno=year). Only add cross-year when falling back to legacy
  // yearData.fatture (issued-year scoped).
  const usingSelectors = typeof window !== 'undefined' && window.FattureSelectors && currentProfile;
  let total = 0;
  for (let m = 1; m <= 12; m++) total += getMonthEuroFromYearData(yearData, year, m, options);
  if (!usingSelectors) {
    for (const inv of getCrossYearInvoicesForYear(year)) total += inv.importo;
  }
  return total;
}

// ═══════════════════ Calculations ═══════════════════
function calcForfettarioValues(tot, settings, year) {
  const s = settings || {};
  const coeff = s.coefficiente / 100, imp = s.impostaSostitutiva / 100;
  const imponibile = tot * coeff;
  const inps = calcInpsContributions(imponibile, s, year);
  const cF = inps.cF, cV = inps.cV, cT = inps.cT;
  const rid = window.ForfettarioRules.getRiduzioneFactor({ riduzione35: s.riduzione35, inpsMode: inps.mode });
  const cFR = cF * rid, cVR = cV * rid, cTR = cFR + cVR;
  // Imposta sostitutiva: base = imponibile − contributi INPS effettivamente versati (deducibili)
  const tasse = Math.max((imponibile - cT) * imp, 0);
  const tasseR = Math.max((imponibile - cTR) * imp, 0);
  const n = tot - cT - tasse, nR = tot - cTR - tasseR;
  return {
    totale: tot, imponibile, tasse, tasseR, cF, cV, cT, cFR, cVR, cTR, n, nR, inpsMode: inps.mode,
    perc: tot > 0 ? (tot - n) / tot : 0,
    percR: tot > 0 ? (tot - nR) / tot : 0
  };
}

function calcForfettario() {
  return calcForfettarioValues(getTotalAnnuo(), S(), currentYear);
}

function calcForfettarioForYear(year, options) {
  const opts = options || {};
  const includeEstimates = shouldIncludeEstimatesForYear(year, opts);
  if (year === currentYear && includeEstimates) return calcForfettario();
  const yearData = getYearDataFor(year);
  if (!yearData || !yearData.settings) return null;
  if (opts.requireForfettarioRegime && yearData.settings.regime !== 'forfettario') return null;
  return calcForfettarioValues(
    getTotalAnnuoForYear(year, { includeEstimates }),
    yearData.settings,
    year
  );
}

function getAppliedForfettarioValues(calc, settings) {
  if (!calc) return null;
  const s = settings || {};
  const useRiduzione = s.riduzione35 == 1 && calc.inpsMode === 'artigiani_commercianti';
  return {
    ...calc,
    useRiduzione,
    tasse: useRiduzione ? calc.tasseR : calc.tasse,
    contribFissi: useRiduzione ? calc.cFR : calc.cF,
    contribVariabili: useRiduzione ? calc.cVR : calc.cV,
    contribTotali: useRiduzione ? calc.cTR : calc.cT,
    netto: useRiduzione ? calc.nR : calc.n,
    percEffettiva: useRiduzione ? calc.percR : calc.perc
  };
}

function getAppliedForfettarioForYear(year, options) {
  const calc = calcForfettarioForYear(year, options);
  if (!calc) return null;
  const yearData = getYearDataFor(year);
  return getAppliedForfettarioValues(calc, yearData && yearData.settings ? yearData.settings : S());
}

function getForfettarioSourceOfTruthForYear(year, options) {
  const opts = options || {};
  const yearData = getYearDataFor(year);
  if (!yearData || !yearData.settings || yearData.settings.regime !== 'forfettario') return null;

  const applied = getAppliedForfettarioForYear(year, options);
  if (!applied) return null;

  const comparison = buildForfettarioMethodComparisonForYear(year, {
    includeEstimates: opts.includeEstimates !== false
  });
  const selectedScenario = comparison ? comparison.selected : null;
  const totale = applied.totale;
  const contribTotali = applied.contribTotali;
  const tasseCompetenza = applied.tasse;
  const nettoCompetenza = applied.netto;
  const percCompetenza = applied.percEffettiva;
  const cashContributions = selectedScenario ? selectedScenario.deductibleContributionsPaid : contribTotali;

  return {
    ...applied,
    comparison,
    selectedScenario,
    tasse: tasseCompetenza,
    netto: nettoCompetenza,
    percEffettiva: percCompetenza,
    competenceTax: tasseCompetenza,
    competenceNetto: nettoCompetenza,
    competenceRate: percCompetenza,
    deductibleContributionsPaid: cashContributions
  };
}

function getForfettarioCashPerspectiveForYear(year) {
  const truth = getForfettarioSourceOfTruthForYear(year, { includeEstimates: true });
  if (!truth || truth.totale <= 0) return null;
  const schedule = buildForfettarioScheduleForYear(year);
  const rows = schedule && Array.isArray(schedule.rows) ? schedule.rows : [];
  const due = rows.reduce((sum, rowItem) => sum + ceil2(rowItem.amount), 0);
  const dueTax = rows.filter(rowItem => rowItem.kind === 'tasse').reduce((sum, rowItem) => sum + ceil2(rowItem.amount), 0);
  const dueContrib = rows.filter(rowItem => rowItem.kind === 'contributi').reduce((sum, rowItem) => sum + ceil2(rowItem.amount), 0);
  return {
    totalDue: ceil2(due),
    taxDue: ceil2(dueTax),
    contributionDue: ceil2(dueContrib),
    effectiveRate: truth.totale > 0 ? ceil2(due / truth.totale) : 0
  };
}

function getContributionBaseForYear(year, options) {
  const opts = options || {};
  const yearData = getYearDataFor(year);
  if (!yearData || !yearData.settings) return null;
  const settings = yearData.settings;
  const total = getTotalAnnuoForYear(year, { includeEstimates: opts.includeEstimates });
  let calc = null;
  if (settings.regime === 'ordinario') {
    calc = calcOrdinarioValues(total, calcSpeseTotalForYear(year), settings, year);
    return {
      mode: calc.inpsMode,
      fixedAnnual: calc.inpsMode === 'artigiani_commercianti' ? calc.cF : 0,
      saldoAccontoBase: calc.inpsMode === 'artigiani_commercianti' ? calc.cV : calc.cT,
      fixedLabel: 'Contributi INPS fissi',
      saldoLabel: calc.inpsMode === 'artigiani_commercianti' ? 'Contributi INPS eccedenza' : 'Contributi previdenziali'
    };
  }
  const applied = getAppliedForfettarioForYear(year, options);
  if (!applied) return null;
  return getForfettarioContributionBase(applied);
}

function getTaxEngine() {
  return typeof window !== 'undefined' ? window.TaxEngine || null : null;
}

function getScadenziarioEngine() {
  return typeof window !== 'undefined' ? window.ScadenziarioEngine || null : null;
}

function helpPill(text) {
  const safe = String(text || '').replace(/"/g, '&quot;');
  return `<span class="help-pill" title="${safe}" aria-label="${safe}">?</span>`;
}

function flattenFiscalEntries(entries) {
  const out = [];
  for (const entry of (entries || [])) {
    if (entry && entry.isAggregateBundle && Array.isArray(entry.children) && entry.children.length) {
      out.push(...entry.children.map(child => ({ ...child, parentBundleId: entry.id, parentAmount: entry.amount })));
    } else if (entry) {
      out.push(entry);
    }
  }
  return out;
}

function mapScheduleRowToFamily(rowItem) {
  const key = String(rowItem && rowItem.key || '');
  if (key.startsWith('imposta_')) return 'substitute_tax';
  if (key.startsWith('contributi_')) return 'inps_variable';
  if (key.startsWith('inps_fissi_')) return 'inps_fixed';
  if (key.startsWith('camera_')) return 'chamber_fee';
  if (key.startsWith('bollo_')) return 'tax_stamp';
  if (key.startsWith('inail_')) return 'inail';
  if (rowItem && rowItem.kind === 'tasse') return 'substitute_tax';
  if (rowItem && rowItem.kind === 'contributi') return 'inps_variable';
  return 'other';
}

function buildScheduleComparisonRows(scheduleRows) {
  return (scheduleRows || []).map(rowItem => ({
    family: mapScheduleRowToFamily(rowItem),
    dueYear: rowItem && rowItem.due ? rowItem.due.year : null,
    competenceYear: rowItem && rowItem.fiscalYear ? rowItem.fiscalYear : currentYear,
    amount: ceil2(rowItem && rowItem.amount),
    scheduleKey: rowItem && rowItem.key ? rowItem.key : '',
    kind: rowItem && rowItem.kind ? rowItem.kind : 'altro'
  }));
}

async function fetchJsonResource(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Impossibile caricare ${path}`);
  return response.json();
}

function getExternalFiscalData() {
  return externalFiscalState;
}

async function loadProfileExternalFiscalData(profile = currentProfile) {
  if (!profile) return externalFiscalState;
  if (externalFiscalState.profile === profile && externalFiscalState.loaded) return externalFiscalState;

  const empty = {
    profile,
    loaded: true,
    error: '',
    paidEntries: [],
    futureEntries: [],
    paidFlatEntries: [],
    futureFlatEntries: [],
    summaries: {},
    comparisonMatrix: []
  };

  if (profile !== 'Mattia' || typeof fetch !== 'function') {
    externalFiscalState = empty;
    return externalFiscalState;
  }

  const engine = getTaxEngine();
  if (!engine) {
    externalFiscalState = { ...empty, loaded: false, error: 'Motore fiscale non disponibile.' };
    return externalFiscalState;
  }

  try {
    const [futurePayload, paidPayload, summary2025, summary2024, breakdown2025] = await Promise.all([
      fetchJsonResource('./fiscozen/tasse_future.json'),
      fetchJsonResource('./fiscozen/tasse_pagate.json'),
      fetchJsonResource('./fiscozen/mattia_2025_summary.json'),
      fetchJsonResource('./fiscozen/mattia_2024_summary.json'),
      fetchJsonResource('./fiscozen/mattia_f24_breakdown_2025.json')
    ]);
    const futureEntries = engine.normalizeFiscozenFutureTaxes(futurePayload);
    const paidEntries = engine.normalizeFiscozenPaidTaxes(paidPayload);
    const paidFlatEntries = flattenFiscalEntries(paidEntries);
    externalFiscalState = {
      profile,
      loaded: true,
      error: '',
      paidEntries,
      futureEntries,
      paidFlatEntries,
      futureFlatEntries: flattenFiscalEntries(futureEntries),
      summaries: {
        summary2025,
        summary2024,
        breakdown2025
      },
      comparisonMatrix: []
    };
  } catch (err) {
    externalFiscalState = { ...empty, loaded: false, error: err && err.message ? err.message : 'Errore caricamento mock locali.' };
  }

  return externalFiscalState;
}

function getLinkedPagamentiTotal(keys) {
  const wanted = new Set((keys || []).filter(Boolean));
  if (wanted.size === 0) return 0;
  let total = 0;
  for (const pagamento of getPagamenti()) {
    if (wanted.has(pagamento.scheduleKey)) total += parseFloat(pagamento.importo) || 0;
  }
  return ceil2(total);
}

function buildForfettarioMethodComparisonForYear(year, options) {
  const engine = getTaxEngine();
  const opts = options || {};
  const yearData = getYearDataFor(year);
  if (!engine || !yearData || !yearData.settings || yearData.settings.regime !== 'forfettario') return null;
  if (isClosedFiscalYear(year)) return null;

  const prevYearData = getYearDataFor(year - 1);
  const prevCalc = calcForfettarioForYear(year - 1, { includeEstimates: true, requireForfettarioRegime: true });
  const prevApplied = prevCalc && prevYearData && prevYearData.settings
    ? getAppliedForfettarioValues(prevCalc, prevYearData.settings)
    : null;
  const currentApplied = getAppliedForfettarioForYear(year, { includeEstimates: opts.includeEstimates !== false });
  const currentContribution = getContributionBaseForYear(year, { includeEstimates: opts.includeEstimates !== false });
  const previousContribution = getContributionBaseForYear(year - 1, { includeEstimates: true });

  return engine.buildForfettarioMethodComparison({
    year,
    methodSetting: getScadenziarioMetodoAcconti(yearData.settings),
    currentSettings: yearData.settings,
    previousSettings: prevYearData ? prevYearData.settings : null,
    grossCollected: getTotalAnnuoForYear(year, { includeEstimates: opts.includeEstimates !== false }),
    currentContribution,
    previousContribution,
    previousTaxBase: prevApplied ? prevApplied.tasse : 0,
    previousContributionAccontiPaid: getLinkedPagamentiTotal([
      `contributi_acc1_${year - 1}`,
      `contributi_acc2_${year - 1}`
    ]),
    forecastContributionBase: resolveScadenziarioForecastBase(yearData.settings.scadenziarioPrevisionaleContributi, currentContribution ? currentContribution.saldoAccontoBase : 0).amount,
    forecastTaxBase: resolveScadenziarioForecastBase(yearData.settings.scadenziarioPrevisionaleImposta, currentApplied ? currentApplied.tasse : 0).amount
  });
}

function getScadenziarioMetodoAcconti(settings) {
  return settings && settings.scadenziarioMetodoAcconti === 'previsionale' ? 'previsionale' : 'storico';
}

function resolveScadenziarioForecastBase(rawValue, fallbackValue) {
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return { amount: centsToEuro(euroToCents(fallbackValue)), source: 'auto' };
  }
  return { amount: centsToEuro(euroToCents(rawValue)), source: 'manual' };
}

function calcSpeseTotalFor(speseList) {
  let tot = 0;
  for (const sp of (speseList || [])) {
    const c = parseFloat(sp.costo) || 0;
    const d = parseFloat(sp.deducibilita) || 0;
    const a = parseInt(sp.anni) || 1;
    tot += (c * d) / a;
  }
  return tot;
}

function getSpeseAttiveForYear(year) {
  const items = [];
  for (const sourceYear of getStoredYears(year)) {
    const yearData = sourceYear === currentYear ? data : loadYearData(sourceYear);
    if (!yearData || !Array.isArray(yearData.spese)) continue;
    for (let idx = 0; idx < yearData.spese.length; idx++) {
      const sp = yearData.spese[idx] || {};
      const anni = Math.max(parseInt(sp.anni, 10) || 1, 1);
      if (year < sourceYear || year > sourceYear + anni - 1) continue;
      items.push({
        ...sp,
        anni,
        annoOrigine: sourceYear,
        quotaAnno: year - sourceYear + 1,
        annua: calcSpeseTotalFor([sp]),
        _idx: idx
      });
    }
  }
  return items;
}

function calcSpeseTotalForYear(year) {
  let total = 0;
  for (const sp of getSpeseAttiveForYear(year)) total += sp.annua;
  return total;
}

function calcSpeseCarryoverTotalForYear(year) {
  let total = 0;
  for (const sp of getSpeseAttiveForYear(year)) {
    if (sp.annoOrigine !== year) total += sp.annua;
  }
  return total;
}

function calcSpeseTotal() {
  return calcSpeseTotalForYear(currentYear);
}

function calcOrdinarioValues(totLordo, spese, settings, year) {
  const s = settings || {};
  const baseLordo = Math.max(parseFloat(totLordo) || 0, 0);
  const speseTot = Math.max(parseFloat(spese) || 0, 0);
  const baseSp = Math.max(baseLordo - speseTot, 0);
  const scaglioni = getIrpefBracketsForYear(year);

  function irpef(b) {
    let t = 0, p = 0, det = [];
    for (const sc of scaglioni) {
      if (b <= p) { det.push({b:0,t:0,a:sc.a}); continue; }
      const im = Math.min(b, sc.l) - p;
      const tx = im * sc.a;
      det.push({b:im,t:tx,a:sc.a}); t += tx; p = sc.l;
    }
    return { tasse: t, netto: b - t, det };
  }

  const inpsLordo = calcInpsContributions(baseLordo, s, year);
  const inps = calcInpsContributions(baseSp, s, year);
  const cTLordo = inpsLordo.cT, cT = inps.cT;
  const baseIrpefLordo = Math.max(baseLordo - cTLordo, 0);
  const baseIrpefSp = Math.max(baseSp - cT, 0);
  const senza = irpef(baseIrpefLordo), con = irpef(baseIrpefSp);
  const dovutoTotaleLordo = senza.tasse + cTLordo;
  const dovutoTotale = con.tasse + cT;
  const nettoLordo = baseLordo - cTLordo - senza.tasse;
  const netto = baseSp - cT - con.tasse;

  return {
    tot: baseLordo,
    totSp: baseSp,
    spese: speseTot,
    senza,
    con,
    cF: inps.cF,
    cV: inps.cV,
    cVLordo: inpsLordo.cV,
    cT,
    cTLordo,
    dovutoTotale,
    dovutoTotaleLordo,
    netto,
    nettoLordo,
    nettoSp: netto,
    inpsMode: inps.mode,
    perc: baseLordo > 0 ? dovutoTotale / baseLordo : 0,
    percImponibile: baseSp > 0 ? dovutoTotale / baseSp : 0
  };
}

function calcOrdinario() {
  return calcOrdinarioValues(getTotalAnnuo(), calcSpeseTotal(), S(), currentYear);
}

function getEffectiveTaxRate() {
  if (S().regime === 'ordinario') {
    const c = calcOrdinario();
    return c.perc;
  }
  const truth = getForfettarioSourceOfTruthForYear(currentYear, { includeEstimates: true });
  if (!truth) {
    const c = calcForfettario();
    return S().riduzione35 == 1 ? c.percR : c.perc;
  }
  return truth.percEffettiva;
}

function getEffectiveNetto() {
  if (S().regime === 'ordinario') return calcOrdinario().netto;
  const truth = getForfettarioSourceOfTruthForYear(currentYear, { includeEstimates: true });
  if (!truth) {
    const c = calcForfettario();
    return S().riduzione35 == 1 ? c.nR : c.n;
  }
  return truth.netto;
}

// ═══════════════════ Formatting ═══════════════════
// ceil2 importato da math-utils.js (vedi top-of-file)

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const _FormatUtilsApp = window.FormatUtils || (typeof require !== 'undefined' ? require('./format-utils.js') : null);
const fmt = _FormatUtilsApp.formatEurOrDash;
const fmtPct = _FormatUtilsApp.formatPct;
function row(label, val, cls, valCls) {
  return `<div class="row ${cls||''}"><label>${label}</label><span class="val ${valCls||''}">${val}</span></div>`;
}

// drawDonut / drawMiniBars estratti in app-charts.js (window.drawDonut / window.drawMiniBars).

// ═══════════════════ Render: Calcolo + Riepilogo → app-calcolo.js ═══════════════════

// ═══════════════════ Tax rate for arbitrary year ═══════════════════
function getEffectiveTaxRateForYear(year) {
  if (year === currentYear) return getEffectiveTaxRate();
  const yd = loadYearData(year);
  if (!yd || !yd.settings) return getEffectiveTaxRate();
  const s = yd.settings;
  if (s.regime === 'ordinario') {
    const total = getTotalAnnuoForYear(year);
    if (total <= 0) return getEffectiveTaxRate();
    return calcOrdinarioValues(total, calcSpeseTotalForYear(year), s, year).perc;
  }
  const truth = getForfettarioSourceOfTruthForYear(year, { includeEstimates: true });
  if (!truth || truth.totale <= 0) return getEffectiveTaxRate();
  return truth.percEffettiva;
}

// ═══════════════════ Render: Accantonamento → app-accantonamento.js ═══════════════════


// ═══════════════════ Render: Calendar + Scadenziario → app-calendar.js ═══════════════════

// ═══════════════════ Render: Fatture → app-fatture.js ═══════════════════

// ═══════════════════ Budget helpers + Render: Budget → app-budget.js ═══════════════════

// ═══════════════════ Render: Spese + Clienti → app-spese.js ═══════════════════

// ═══════════════════ Recalc All ═══════════════════
function recalcAll() {
  renderCalcolo();
  renderRiepilogo();
  renderCalendar();
  renderFatture();
  renderAccantonamento();
  renderScadenziario();
  renderBudget();
  renderClienti();
  if (S().regime === 'ordinario') renderSpese();
}

// Tab navigation + mobile nav labels estratti in app-shell.js
// (window.switchToTab / openDichiarazione / updateNavLabels / NAV_LABELS).

// exportData / importData estratte in app-export.js (window.exportData / window.importData).

// ═══════════════════ Init ═══════════════════
document.getElementById('yearDisplay').textContent = currentYear;
updateProfileAvatar();
if (checkSession()) {
  loadProfileFiscalData();
  loadData();
  recalcAll();
  loadProfileExternalFiscalData(currentProfile).then(() => recalcAll());
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('profileMenu');
  const btn = document.getElementById('profileAvatar');
  if (!menu || menu.hidden) return;
  if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeProfileMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // Don't close the dropdown when ESC is meant for an open modal — let the modal's own handler win.
  const ocrModal = document.getElementById('ocrPagamentoModal');
  if (ocrModal && ocrModal.classList.contains('open')) return;

  // 1) Profile menu dropdown aperto → chiudilo
  const profileMenu = document.getElementById('profileMenu');
  if (profileMenu && !profileMenu.hidden) {
    closeProfileMenu();
    return;
  }

  // 2) Drawer mobile aperto → chiudilo + restituisci focus a ☰
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    closeSidebar();
    document.getElementById('navToggle')?.focus();
    return;
  }
});

// renderProfilo* / saveProfiloField / enterProfiloEdit estratti in app-profilo.js.
// showAppConfirm estratto in app-ui-utils.js (window.showAppConfirm).
window.getAppData = function() { return data; };
