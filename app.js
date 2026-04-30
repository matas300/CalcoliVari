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

// === Fatture helpers -> app-fatture-helpers.js ===

// === Stats -> app-stats.js ===

// === Calculations -> app-calc.js ===

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
