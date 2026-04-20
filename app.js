// ═══════════════════ Profili / Login ═══════════════════
const PROFILE_HASHES = {
  'd9b5e452afd6cdea8583147634c3f85a0ba60fc17ad5e6f069a99d3b4ec35194': 'Mattia',
  'cfaa4bd87a413b57e7e3b4a0d5b220aa500aa5d4f60faf938a8dad50e3def77d': 'Peru',
  '83ebba2cb71eb1417fd5ccaa12155a3be83cb97bc6fd7ef28500d100d84f8019': 'Demo'
};
const PROFILE_FISCAL_LIBRARY = {
  Mattia: {
    nome: 'Mattia Rossi',
    codiceFiscale: 'RSSMTT96P21A944T',
    partitaIva: '04239481205',
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
    inailTasso: 5.19,
    agevolazioneStartUp: 0,
    primoAnnoAgevolato: 0,
    note: 'Profilo reale con transizione ordinario -> forfettario dal 2025.'
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

// ═══════════════════ Sidebar drawer (mobile) ═══════════════════
function toggleSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;
  el.classList.contains('open') ? closeSidebar() : openSidebar();
}
function openSidebar() {
  const el = document.getElementById('sidebar');
  const btn = document.getElementById('navToggle');
  if (!el) return;
  el.classList.add('open');
  btn?.setAttribute('aria-expanded', 'true');
  if (window.matchMedia('(max-width: 768px)').matches) {
    document.body.style.overflow = 'hidden';
  }
}
function closeSidebar() {
  const el = document.getElementById('sidebar');
  const btn = document.getElementById('navToggle');
  if (!el) return;
  el.classList.remove('open');
  btn?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

const SIDEBAR_COLLAPSED_KEY = 'calcoliPIVA_sidebarCollapsed';
function applySidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', !!collapsed);
  const btn = document.querySelector('.sb-collapse-btn');
  if (btn) {
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.title = collapsed ? 'Espandi barra laterale' : 'Comprimi barra laterale';
  }
}
function toggleSidebarCollapsed() {
  const next = !document.body.classList.contains('sidebar-collapsed');
  applySidebarCollapsed(next);
  try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch (e) {}
}
function initSidebarCollapsed() {
  let stored = '0';
  try { stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) || '0'; } catch (e) {}
  applySidebarCollapsed(stored === '1');
  // Mirror each sb-item label into data-tab-label so the collapsed-rail tooltip can show it
  document.querySelectorAll('.sb-item').forEach(btn => {
    const label = btn.querySelector('.sb-label');
    if (label && !btn.getAttribute('data-tab-label')) {
      btn.setAttribute('data-tab-label', label.textContent.trim());
    }
  });
}
document.addEventListener('DOMContentLoaded', initSidebarCollapsed);

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

  // Seed historical data (once per profile)
  if (profile === 'Mattia') seedMattiaData();
  if (profile === 'Peru') seedPeruData();
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
const HOLIDAYS = [[1,1],[1,6],[4,25],[5,1],[6,2],[8,15],[11,1],[12,8],[12,25],[12,26]];
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
const BOLLO_SOGLIA = 77.47;
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
      'Il saldo = contributi effettivi anno precedente - acconti gia versati',
      'Scadenza: <b>30 giugno</b> (insieme al saldo imposta)'
    ],
    note: 'Se il saldo e negativo, hai un credito. Puoi usarlo in compensazione nei prossimi F24. Verifica sempre sul Cassetto Previdenziale i dati esatti.'
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
      'Importo: 40% dei contributi variabili dell\'anno precedente (storico) o previsti (previsionale)',
      'Scadenza: <b>30 giugno</b>, insieme al saldo e al primo acconto imposta'
    ],
    note: 'Se i contributi variabili sono sotto la soglia di 51,65 EUR, non e dovuto alcun acconto.'
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
      'Importo: 60% dei contributi variabili',
      'Scadenza: <b>30 novembre</b>'
    ],
    note: 'Il secondo acconto non e rateizzabile. Se sotto soglia (51,65 EUR totali) non e dovuto; se sotto 257,52 EUR si versa tutto a novembre come unico acconto.'
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
let data = {};

function getActualCalendarYear() {
  return new Date().getFullYear();
}

function isClosedFiscalYear(year) {
  return (parseInt(year, 10) || currentYear) < getActualCalendarYear();
}

// ═══════════════════ Storage ═══════════════════
function storageKey(y) { return 'calcoliPIVA_' + currentProfile + '_' + (y || currentYear); }
function profileStorageKey(profile = currentProfile) {
  return 'calcoliPIVA_profile_' + (profile || 'default');
}

function clientiStorageKey(profile = currentProfile) {
  return 'calcoliPIVA_' + (profile || 'default') + '_clienti';
}

function getProfileFiscalDefaults(profile = currentProfile) {
  return { ...(PROFILE_FISCAL_LIBRARY[profile] || PROFILE_FISCAL_LIBRARY.Demo) };
}

function generateClientId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'cli_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function normalizeClienteField(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeCliente(input, fallbackId) {
  const item = input || {};
  const id = normalizeClienteField(item.id, fallbackId || generateClientId()) || (fallbackId || generateClientId());
  return {
    id,
    nome: normalizeClienteField(item.nome),
    partitaIva: normalizeClienteField(item.partitaIva),
    codiceFiscale: normalizeClienteField(item.codiceFiscale),
    codiceSDI: normalizeClienteField(item.codiceSDI, '0000000') || '0000000',
    pec: normalizeClienteField(item.pec),
    indirizzo: normalizeClienteField(item.indirizzo),
    cap: normalizeClienteField(item.cap),
    citta: normalizeClienteField(item.citta),
    provincia: normalizeClienteField(item.provincia).toUpperCase(),
    nazione: normalizeClienteField(item.nazione, 'IT').toUpperCase() || 'IT',
    note: normalizeClienteField(item.note)
  };
}

function getClienti(profile = currentProfile) {
  const key = clientiStorageKey(profile);
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, idx) => normalizeCliente(item, item && item.id ? item.id : `client_${idx}`));
  } catch {
    return [];
  }
}

function saveClienti(list, profile = currentProfile) {
  const normalized = (Array.isArray(list) ? list : []).map(item => normalizeCliente(item, item && item.id));
  localStorage.setItem(clientiStorageKey(profile), JSON.stringify(normalized));
  if (profile === currentProfile && typeof syncProfileMetaToCloud === 'function') {
    syncProfileMetaToCloud(profile);
  }
  return normalized;
}

function setClientiSearch(value) {
  clientiUiState.search = String(value || '');
  renderClienti();
}

function addCliente() {
  const list = getClienti();
  const next = normalizeCliente({
    id: generateClientId(),
    nazione: 'IT',
    codiceSDI: '0000000'
  });
  saveClienti([next, ...list]);
  renderClienti();
  openClienteModal(next.id);
}

// ── Modal dettaglio cliente (Task 5) ──
// XSS: tutti i valori passano via escapeHtml (pattern consolidato nel progetto).
const clienteModalState = { id: null, escHandler: null };

function openClienteModal(id) {
  const cliente = getClienti().find(c => c.id === id);
  if (!cliente) return;
  clienteModalState.id = id;
  renderClienteModal(id);
  const m = document.getElementById('clienteModal');
  if (m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
  document.body.classList.add('profile-modal-open');
  if (!clienteModalState.escHandler) {
    clienteModalState.escHandler = (ev) => {
      if (ev.key === 'Escape') closeClienteModal();
    };
    document.addEventListener('keydown', clienteModalState.escHandler);
  }
}

function closeClienteModal() {
  const m = document.getElementById('clienteModal');
  if (m) { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); m.innerHTML = ''; }
  document.body.classList.remove('profile-modal-open');
  clienteModalState.id = null;
  if (clienteModalState.escHandler) {
    document.removeEventListener('keydown', clienteModalState.escHandler);
    clienteModalState.escHandler = null;
  }
}

function renderClienteModal(id) {
  const m = document.getElementById('clienteModal');
  if (!m) return;
  const cliente = getClienti().find(c => c.id === id);
  if (!cliente) { closeClienteModal(); return; }
  const esc = (v) => escapeHtml(v ?? '');
  const titleText = cliente.nome ? esc(cliente.nome) : 'Nuovo cliente';
  const idEsc = esc(id);
  const on = (field) => `onchange="updateClienteField('${idEsc}', '${field}', this.value)"`;
  m.innerHTML = `
    <div class="cliente-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="clienteModalTitle">
      <div class="cliente-modal-header">
        <div class="cliente-modal-title" id="clienteModalTitle">${titleText}</div>
        <button type="button" class="cliente-modal-close" aria-label="Chiudi" onclick="closeClienteModal()">×</button>
      </div>

      <div class="cliente-section">
        <div class="cliente-section-label">Partita IVA</div>
        <div class="cliente-autofill-row">
          <input type="text" id="clienteModalPiva" value="${esc(cliente.partitaIva)}" placeholder="11 cifre" ${on('partitaIva')}>
          <button type="button" id="clienteAutofillBtn" class="btn-ghost" onclick="autofillClienteFromPiva('${idEsc}')">🔍 Autofill</button>
        </div>
        <div id="clienteModalToast" class="fattura-modal-toast"></div>
      </div>
      <hr>

      <div class="cliente-section">
        <div class="cliente-section-label">Anagrafica</div>
        <div class="cliente-field">
          <label>Nome / Ragione sociale</label>
          <input type="text" value="${esc(cliente.nome)}" ${on('nome')}>
        </div>
        <div class="cliente-field">
          <label>Codice fiscale</label>
          <input type="text" value="${esc(cliente.codiceFiscale)}" ${on('codiceFiscale')}>
        </div>
      </div>
      <hr>

      <div class="cliente-section">
        <div class="cliente-section-label">Sede</div>
        <div class="cliente-field">
          <label>Indirizzo</label>
          <input type="text" value="${esc(cliente.indirizzo)}" ${on('indirizzo')}>
        </div>
        <div class="cliente-sede-row">
          <div class="cliente-field">
            <label>CAP</label>
            <input type="text" autocomplete="off" value="${esc(cliente.cap)}" maxlength="5" ${on('cap')}>
          </div>
          <div class="cliente-field">
            <label>Città</label>
            <input type="text" autocomplete="off" value="${esc(cliente.citta)}" ${on('citta')}>
          </div>
          <div class="cliente-field">
            <label>Provincia</label>
            <input type="text" autocomplete="off" value="${esc(cliente.provincia)}" maxlength="2" ${on('provincia')}>
          </div>
          <div class="cliente-field">
            <label>Nazione</label>
            <input type="text" autocomplete="off" value="${esc(cliente.nazione)}" maxlength="2" ${on('nazione')}>
          </div>
        </div>
      </div>
      <hr>

      <div class="cliente-section">
        <div class="cliente-section-label">Fatturazione elettronica</div>
        <div class="cliente-field">
          <label>Codice SDI</label>
          <input type="text" value="${esc(cliente.codiceSDI)}" maxlength="7" ${on('codiceSDI')}>
        </div>
        <div class="cliente-field">
          <label>PEC</label>
          <input type="email" value="${esc(cliente.pec)}" ${on('pec')}>
        </div>
      </div>
      <hr>

      <div class="cliente-section">
        <div class="cliente-section-label">Note</div>
        <div class="cliente-field">
          <textarea rows="3" ${on('note')}>${esc(cliente.note)}</textarea>
        </div>
      </div>

      <div class="cliente-modal-actions">
        <button type="button" class="btn-danger" onclick="deleteClienteFromModal('${idEsc}')">Elimina</button>
        <button type="button" class="btn-primary" onclick="closeClienteModal()">Chiudi</button>
      </div>
    </div>`;
}

function deleteClienteFromModal(id) {
  const cliente = getClienti().find(c => c.id === id);
  if (!cliente) return;
  const msg = `Eliminare ${cliente.nome || 'questo cliente'}? L'operazione è irreversibile.`;
  const onConfirm = () => {
    saveClienti(getClienti().filter(c => c.id !== id));
    closeClienteModal();
    renderClienti();
  };
  if (typeof window.showAppConfirm === 'function') {
    window.showAppConfirm({ title: 'Eliminare cliente?', message: msg, okLabel: 'Elimina', danger: true }, onConfirm);
  } else if (confirm(msg)) {
    onConfirm();
  }
}

function updateClienteField(id, key, value) {
  const list = getClienti().map(cliente => {
    if (cliente.id !== id) return cliente;
    return normalizeCliente({ ...cliente, [key]: value }, cliente.id);
  });
  saveClienti(list);
  renderClienti();
  // Non re-renderizzare l'intero modal (perderebbe il focus sull'input attivo).
  // Aggiorna solo il titolo se cambia il nome.
  if (clienteModalState.id === id && key === 'nome') {
    const titleEl = document.getElementById('clienteModalTitle');
    if (titleEl) titleEl.textContent = value || 'Nuovo cliente';
  }
}

function showClienteModalToast(message, tone = 'success') {
  const toast = document.getElementById('clienteModalToast');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add('show');
  if (showClienteModalToast._timer) clearTimeout(showClienteModalToast._timer);
  showClienteModalToast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

async function autofillClienteFromPiva(id) {
  const api = window.ClientiAutofill;
  if (!api || typeof api.lookupPartitaIva !== 'function') {
    showClienteModalToast('Modulo autofill non disponibile', 'error');
    return;
  }
  const input = document.getElementById('clienteModalPiva');
  const piva = (input ? input.value : '').trim();
  const btn = document.getElementById('clienteAutofillBtn');
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Caricamento...'; }
  try {
    const res = await api.lookupPartitaIva(piva);
    if (!res || !res.ok) {
      const code = res && res.code;
      if (code === 'INVALID_PIVA') {
        showClienteModalToast('P.IVA non valida (deve essere 11 cifre)', 'error');
      } else if (code === 'NO_KEY') {
        showClienteModalToast('Configura API key openapi.it in Impostazioni', 'warn');
      } else if (code === 'NOT_FOUND') {
        showClienteModalToast('P.IVA non trovata in openapi.it', 'warn');
      } else if (code === 'NETWORK') {
        showClienteModalToast('Errore di rete, riprova', 'error');
      } else {
        showClienteModalToast((res && res.error) || 'Errore autofill', 'error');
      }
      return;
    }
    // ok: true — merge only into empty fields of the cliente record.
    const cliente = getClienti().find(c => c.id === id);
    if (!cliente) {
      showClienteModalToast('Cliente non trovato', 'error');
      return;
    }
    const payload = res.data || {};
    const mapping = [
      ['nome', 'nome'],
      ['cf', 'codiceFiscale'],
      ['indirizzo', 'indirizzo'],
      ['cap', 'cap'],
      ['citta', 'citta'],
      ['provincia', 'provincia'],
      ['pec', 'pec']
    ];
    let applied = 0, skipped = 0, available = 0;
    for (const [srcKey, targetField] of mapping) {
      const incoming = (payload[srcKey] || '').toString().trim();
      if (!incoming) continue;
      available++;
      const current = (cliente[targetField] || '').toString().trim();
      if (current) { skipped++; continue; }
      updateClienteField(id, targetField, incoming);
      applied++;
    }
    // Re-render modal so new values display (updateClienteField intentionally
    // skips re-render to preserve input focus).
    if (clienteModalState.id === id) renderClienteModal(id);
    if (applied === 0 && available === 0) {
      showClienteModalToast('Nessun dato disponibile da openapi.it', 'warn');
    } else if (skipped > 0) {
      showClienteModalToast('Autofill completato (alcuni campi già compilati non sono stati modificati)');
    } else {
      showClienteModalToast('Dati cliente compilati');
    }
  } catch (err) {
    showClienteModalToast('Errore autofill: ' + ((err && err.message) || err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText || '🔍 Autofill'; }
  }
}

if (typeof window !== 'undefined') {
  window.openClienteModal = openClienteModal;
  window.closeClienteModal = closeClienteModal;
  window.renderClienteModal = renderClienteModal;
  window.deleteClienteFromModal = deleteClienteFromModal;
  window.updateClienteField = updateClienteField;
  window.autofillClienteFromPiva = autofillClienteFromPiva;
}

function matchesClienteSearch(cliente, query) {
  if (!query) return true;
  const haystack = [
    cliente.nome,
    cliente.partitaIva,
    cliente.codiceFiscale,
    cliente.codiceSDI,
    cliente.pec,
    cliente.indirizzo,
    cliente.citta,
    cliente.provincia,
    cliente.note
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function validatePercentValue(value, fallback) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, 0), 100);
}

function validateMoneyValue(value, fallback) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(num, 0);
}

function normalizeProfileFiscalData(input, profile = currentProfile) {
  const base = getProfileFiscalDefaults(profile);
  const merged = { ...base, ...(input || {}) };
  return {
    nome: String(merged.nome || base.nome || profile || ''),
    codiceFiscale: String(merged.codiceFiscale || ''),
    partitaIva: String(merged.partitaIva || ''),
    indirizzo: String(merged.indirizzo || ''),
    cap: String(merged.cap || ''),
    citta: String(merged.citta || ''),
    provincia: String(merged.provincia || '').toUpperCase(),
    nazione: String(merged.nazione || base.nazione || 'IT').toUpperCase(),
    ateco: String(merged.ateco || base.ateco || ''),
    atecoDescrizione: String(merged.atecoDescrizione || base.atecoDescrizione || ''),
    atecoGruppo: String(merged.atecoGruppo || base.atecoGruppo || ''),
    iban: String(merged.iban || ''),
    modalitaPagamento: String(merged.modalitaPagamento || base.modalitaPagamento || 'Bonifico bancario'),
    coefficiente: validatePercentValue(merged.coefficiente, base.coefficiente || 67),
    impostaSostitutiva: validatePercentValue(merged.impostaSostitutiva, base.impostaSostitutiva || 15),
    inpsMode: normalizeInpsMode(merged.inpsMode || base.inpsMode),
    inpsCategoria: normalizeInpsCategory(merged.inpsCategoria || base.inpsCategoria),
    inpsTipoGestSep: normalizeGestSepTipo(merged.inpsTipoGestSep || base.inpsTipoGestSep),
    usaInpsUfficiale: parseInt(merged.usaInpsUfficiale, 10) === 0 ? 0 : 1,
    riduzione35: parseInt(merged.riduzione35, 10) === 1 ? 1 : 0,
    limiteForfettario: validateMoneyValue(merged.limiteForfettario, base.limiteForfettario || 85000),
    agevolazioneStartUp: parseInt(merged.agevolazioneStartUp, 10) === 1 ? 1 : 0,
    primoAnnoAgevolato: parseInt(merged.primoAnnoAgevolato, 10) === 1 ? 1 : 0,
    note: String(merged.note || '')
  };
}

function getStoredProfileFiscal(profile = currentProfile) {
  const raw = localStorage.getItem(profileStorageKey(profile));
  return normalizeProfileFiscalData(raw ? JSON.parse(raw) : {}, profile);
}

function loadProfileFiscalData() {
  const data = getStoredProfileFiscal(currentProfile);
  updateProfileAvatar();
  return data;
}

function saveProfileFiscalData(nextData) {
  const normalized = normalizeProfileFiscalData(nextData, currentProfile);
  localStorage.setItem(profileStorageKey(currentProfile), JSON.stringify(normalized));
  updateProfileAvatar();
  return normalized;
}

function getProfileFiscalData() {
  // C4: compat shim — legacy shape synthesized from settings.anagrafica/attivita/settings
  const ana = (data && data.settings && data.settings.anagrafica) || {};
  const att = (data && data.settings && data.settings.attivita) || {};
  const s = (data && data.settings) || {};
  const nome = String(ana.nome || '').trim();
  const cognome = String(ana.cognome || '').trim();
  const displayName = [nome, cognome].filter(Boolean).join(' ') || (currentProfile || '');
  return {
    nome: displayName,
    cognome: cognome,
    codiceFiscale: String(ana.codiceFiscale || ''),
    partitaIva: String(att.partitaIva || ''),
    indirizzo: String(ana.residenzaVia || ''),
    cap: String(ana.residenzaCap || ''),
    citta: String(ana.residenzaComune || ''),
    provincia: String(ana.residenzaProv || '').toUpperCase(),
    nazione: String(ana.nazione || 'IT').toUpperCase(),
    ateco: String(att.codiceAteco || ''),
    atecoDescrizione: String(att.descrizioneAttivita || ''),
    atecoGruppo: String(att.atecoGruppo || ''),
    iban: String(ana.iban || ''),
    modalitaPagamento: String(ana.modalitaPagamento || 'Bonifico bancario'),
    coefficiente: parseFloat(s.coefficiente) || 67,
    impostaSostitutiva: parseFloat(s.impostaSostitutiva) || 15,
    inpsMode: s.inpsMode || 'artigiani_commercianti',
    inpsCategoria: s.inpsCategoria || 'artigiano',
    inpsTipoGestSep: s.inpsTipoGestSep || '',
    usaInpsUfficiale: parseInt(s.usaInpsUfficiale, 10) === 0 ? 0 : 1,
    riduzione35: parseInt(s.riduzione35, 10) === 1 ? 1 : 0,
    limiteForfettario: parseFloat(s.limiteForfettario) || 85000,
    agevolazioneStartUp: parseInt(att.agevolazioneStartUp, 10) === 1 ? 1 : 0,
    primoAnnoAgevolato: parseInt(att.primoAnnoAgevolato, 10) === 1 ? 1 : 0,
    note: String(att.note || ''),
    inailTasso: parseFloat(s.inailTasso) || 0
  };
}

function syncProfileFieldsToSettings(settings, year) {
  const target = settings || {};
  const profile = getProfileFiscalData();
  for (const field of PROFILE_SYNC_FIELDS) target[field] = profile[field];
  if (profile.usaInpsUfficiale === 1) syncOfficialInpsValues(target, year);
  return target;
}

function syncProfileFiscalToStoredYears() {
  const profile = getProfileFiscalData();
  if (data && data.settings) syncProfileFieldsToSettings(data.settings, currentYear);
  const prefix = 'calcoliPIVA_' + currentProfile + '_';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const year = parseInt(key.slice(prefix.length), 10);
    const parsed = ensureDataShape(JSON.parse(localStorage.getItem(key)), year);
    syncProfileFieldsToSettings(parsed.settings, year);
    localStorage.setItem(key, JSON.stringify(parsed));
  }
  if (data && data.settings) saveData();
}

function normalizeInpsMode(mode) {
  return mode === 'gestione_separata' ? 'gestione_separata' : 'artigiani_commercianti';
}

function normalizeInpsCategory(category) {
  return category === 'commerciante' ? 'commerciante' : 'artigiano';
}

function inferInpsMode(settings) {
  const s = settings || {};
  if (s.inpsMode !== undefined) return normalizeInpsMode(s.inpsMode);
  const contribFissi = parseFloat(s.contribFissi) || 0;
  const minimale = parseFloat(s.minimaleInps) || 0;
  return contribFissi <= 0 && minimale <= 0 ? 'gestione_separata' : 'artigiani_commercianti';
}

function getInpsMode(settings) {
  return inferInpsMode(settings);
}

function getInpsCategory(settings) {
  const s = settings || {};
  return normalizeInpsCategory(s.inpsCategoria);
}

function getInpsCategoryLabel(category) {
  return normalizeInpsCategory(category) === 'commerciante' ? 'Commerciante' : 'Artigiano';
}

function getOfficialArtComInpsParams(year, category) {
  const targetYear = parseInt(year, 10) || currentYear;
  const categoryKey = normalizeInpsCategory(category);
  const knownYears = Object.keys(OFFICIAL_ARTCOM_INPS).map(Number).sort((a, b) => a - b);
  const below = knownYears.filter(y => y <= targetYear);
  const fallbackYear = below.length > 0 ? below[below.length - 1] : knownYears[0];
  const yearUsed = OFFICIAL_ARTCOM_INPS[targetYear] ? targetYear : fallbackYear;
  const base = OFFICIAL_ARTCOM_INPS[yearUsed];
  if (!base) return null;
  return {
    minimaleInps: base.minimaleInps,
    contribFissi: base[categoryKey].contribFissi,
    aliqContributi: base[categoryKey].aliqContributi,
    category: categoryKey,
    yearUsed,
    isFallback: yearUsed !== targetYear
  };
}

function usesOfficialInpsValues(settings) {
  const s = settings || {};
  if ((parseInt(s.usaInpsUfficiale, 10) || 0) !== 1) return false;
  const mode = getInpsMode(s);
  return mode === 'artigiani_commercianti' || mode === 'gestione_separata';
}

function getResolvedInpsSettings(settings, year) {
  const s = settings || {};
  if (!usesOfficialInpsValues(s)) return { ...s };
  const mode = getInpsMode(s);
  if (mode === 'gestione_separata') {
    const official = getOfficialGestSepAliquota(year, s.inpsTipoGestSep);
    return {
      ...s,
      aliqContributi: official.aliqContributi,
      inpsTipoGestSep: official.tipo,
      _officialInpsYear: official.yearUsed,
      _officialInpsFallback: official.isFallback
    };
  }
  const official = getOfficialArtComInpsParams(year, getInpsCategory(s));
  if (!official) return { ...s };
  return {
    ...s,
    minimaleInps: official.minimaleInps,
    contribFissi: official.contribFissi,
    aliqContributi: official.aliqContributi,
    inpsCategoria: official.category,
    _officialInpsYear: official.yearUsed,
    _officialInpsFallback: official.isFallback
  };
}

function syncOfficialInpsValues(settings, year) {
  const s = settings || {};
  if (!usesOfficialInpsValues(s)) return s;
  const mode = getInpsMode(s);
  if (mode === 'gestione_separata') {
    const official = getOfficialGestSepAliquota(year, s.inpsTipoGestSep);
    s.aliqContributi = official.aliqContributi;
    s.inpsTipoGestSep = official.tipo;
    return s;
  }
  const official = getOfficialArtComInpsParams(year, getInpsCategory(s));
  if (!official) return s;
  s.minimaleInps = official.minimaleInps;
  s.contribFissi = official.contribFissi;
  s.aliqContributi = official.aliqContributi;
  s.inpsCategoria = official.category;
  return s;
}

function getInpsModeLabel(mode) {
  return mode === 'gestione_separata' ? 'Gestione Separata' : 'Artigiani/Commercianti';
}

function getGestSepTipoLabel(tipo) {
  return normalizeGestSepTipo(tipo) === 'altra_cassa'
    ? 'Altra cassa / pensionato'
    : 'Esclusivo (libero prof.)';
}

function getAtecoGruppoLabel(profile) {
  const groups = (window.ATECO_COEFFICIENTI && window.ATECO_COEFFICIENTI.GRUPPI) || [];
  const id = profile && profile.atecoGruppo;
  if (id) {
    const g = groups.find(x => x.id === id);
    if (g) return `${g.label} (${g.coefficiente}%)`;
  }
  if (profile && profile.coefficiente !== undefined && profile.coefficiente !== '') {
    const g = window.ATECO_COEFFICIENTI && window.ATECO_COEFFICIENTI.findGruppoByCoefficiente(profile.coefficiente);
    if (g) return `${g.label} (${g.coefficiente}%) [auto]`;
  }
  return 'Personalizzato';
}

function getContribLabel(mode) {
  return mode === 'gestione_separata' ? 'Contributi previdenziali' : 'Contributi INPS';
}

function getPaymentTypeLabel(type) {
  return PAYMENT_TYPES[type]?.label || PAYMENT_TYPES.altro.label;
}

function getIrpefBracketsForYear(year) {
  const y = parseInt(year, 10) || currentYear;
  if (y >= 2024) {
    return [
      { l: 28000, a: 0.23 },
      { l: 50000, a: 0.35 },
      { l: Infinity, a: 0.43 }
    ];
  }
  return [
    { l: 15000, a: 0.23 },
    { l: 28000, a: 0.25 },
    { l: 50000, a: 0.35 },
    { l: Infinity, a: 0.43 }
  ];
}

function getIrpefBracketLabelsForYear(year) {
  const y = parseInt(year, 10) || currentYear;
  if (y >= 2024) {
    return ['0-28.000 (23%)', '28.001-50.000 (35%)', 'Oltre 50.000 (43%)'];
  }
  return ['0-15.000 (23%)', '15.001-28.000 (25%)', '28.001-50.000 (35%)', 'Oltre 50.000 (43%)'];
}

function calcInpsContributions(imponibile, settings, year) {
  const s = getResolvedInpsSettings(settings, year || currentYear);
  const mode = getInpsMode(s);
  const base = Math.max(parseFloat(imponibile) || 0, 0);
  const aliquota = (parseFloat(s.aliqContributi) || 0) / 100;

  if (mode === 'gestione_separata') {
    const massimale = getGestSepMassimale(year || currentYear);
    const cappedBase = Math.min(base, massimale);
    const cV = cappedBase * aliquota;
    return { mode, cF: 0, cV, cT: cV, imponibile: base, massimale, cappedBase };
  }

  const cF = Math.max(parseFloat(s.contribFissi) || 0, 0);
  const minimale = Math.max(parseFloat(s.minimaleInps) || 0, 0);
  const eccedenza = Math.max(base - minimale, 0);
  const cV = eccedenza * aliquota;
  return { mode, cF, cV, cT: cF + cV, imponibile: base, minimale, eccedenza };
}

function migrateFattureFor(target) {
  const fatture = target.fatture || {};
  for (const m of Object.keys(fatture)) {
    const v = fatture[m];
    if (typeof v === 'number') {
      fatture[m] = [{ importo: v, pagMese: null, pagAnno: null, desc: '' }];
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (v.pagMese === undefined) v.pagMese = null;
      if (v.pagAnno === undefined) v.pagAnno = null;
      if (v.desc === undefined) v.desc = '';
      fatture[m] = [v];
    }
    // Already array: leave as-is
  }
}

function ensureDataShape(target, year = currentYear) {
  const targetYear = parseInt(year, 10) || currentYear;
  const out = target || {};
  const defaultSettings = getDefaultSettings(targetYear);
  if (!out.settings) out.settings = { ...defaultSettings };
  if (!out.fatture) out.fatture = {};
  if (!out.calendar) out.calendar = {};
  if (!out.accantonamento) out.accantonamento = {};
  if (!out.pagamenti) out.pagamenti = [];
  if (!out.budget) out.budget = [];
  if (!out.spese) out.spese = [];
  if (!out.lmQuadro || typeof out.lmQuadro !== 'object') out.lmQuadro = { overrides: {} };
  if (!out.lmQuadro.overrides || typeof out.lmQuadro.overrides !== 'object') out.lmQuadro.overrides = {};
  for (const [key, value] of Object.entries(defaultSettings)) {
    if (out.settings[key] === undefined) out.settings[key] = value;
  }
  out.settings.inpsMode = inferInpsMode(out.settings);
  out.settings.inpsCategoria = getInpsCategory(out.settings);
  syncOfficialInpsValues(out.settings, targetYear);
  migrateFattureFor(out);
  if (!out.settings.anagrafica) out.settings.anagrafica = {
    codiceFiscale: '', cognome: '', nome: '', sesso: '', dataNascita: '',
    comuneNascita: '', provNascita: '',
    residenzaVia: '', residenzaComune: '', residenzaProv: '', residenzaCap: '',
    domicilioFiscaleVia: '', domicilioFiscaleComune: '', domicilioFiscaleProv: '', domicilioFiscaleCap: '',
    telefono: '', email: '', statoCivile: '',
    nazione: 'IT', iban: '', modalitaPagamento: 'Bonifico bancario'
  };
  const anaDefaults = { nazione: 'IT', iban: '', modalitaPagamento: 'Bonifico bancario' };
  for (const [k, v] of Object.entries(anaDefaults)) {
    if (out.settings.anagrafica[k] === undefined) out.settings.anagrafica[k] = v;
  }
  if (!out.settings.attivita) out.settings.attivita = {
    codiceAteco: '', descrizioneAttivita: '', dataInizioAttivita: '',
    sedeVia: '', sedeComune: '', sedeProv: '', sedeCap: '',
    partitaIva: '', atecoGruppo: '', note: '',
    agevolazioneStartUp: 0, primoAnnoAgevolato: 0
  };
  const attDefaults = { partitaIva: '', atecoGruppo: '', note: '', agevolazioneStartUp: 0, primoAnnoAgevolato: 0 };
  for (const [k, v] of Object.entries(attDefaults)) {
    if (out.settings.attivita[k] === undefined) out.settings.attivita[k] = v;
  }
  // Dichiarazione Redditi PF
  if (!out.dichiarazione || typeof out.dichiarazione !== 'object') {
    out.dichiarazione = {
      tipoDichiarazione: 'ordinaria',
      dataPresentazione: null,
      flags: { annoMisto: false, imposteEstere: false, altriCrediti: false },
      contiEsteri: [],
      coniuge: null,
      familiariCarico: [],
      overrides: {},
      computed: null,
      statoCompilazione: 'bozza'
    };
  }
  if (out.lmQuadro && out.lmQuadro.overrides) {
    if (!out.dichiarazione.overrides) out.dichiarazione.overrides = {};
    Object.assign(out.dichiarazione.overrides, out.lmQuadro.overrides);
    delete out.lmQuadro; // safe: in-memory only; saveData() caller persists
  }
  return out;
}

let _yearDataCache = new Map();

function clearYearDataCache() {
  if (typeof _yearDataCache !== 'undefined') {
    _yearDataCache.clear();
  }
}

function loadYearData(y) {
  if (y === currentYear) {
    const shaped = ensureDataShape(data, y);
    syncProfileFieldsToSettings(shaped.settings, y);
    return shaped;
  }
  if (_yearDataCache.has(y)) {
    return _yearDataCache.get(y);
  }
  const raw = localStorage.getItem(storageKey(y));
  if (!raw) return null;
  const shaped = ensureDataShape(JSON.parse(raw), y);
  syncProfileFieldsToSettings(shaped.settings, y);
  _yearDataCache.set(y, shaped);
  return shaped;
}

function migrateProfileFiscalToSettings() {
  if (!currentProfile) return;
  const flagKey = `calcoliPIVA_${currentProfile}_profileFiscalMigrated`;
  if (localStorage.getItem(flagKey) === '1') return;
  const srcKey = `calcoliPIVA_${currentProfile}_profileFiscal`;
  const raw = localStorage.getItem(srcKey);
  if (!raw) { localStorage.setItem(flagKey, '1'); return; }
  let src; try { src = JSON.parse(raw); } catch { src = null; }
  if (!src || typeof src !== 'object') { localStorage.removeItem(srcKey); localStorage.setItem(flagKey, '1'); return; }
  const ana = data.settings.anagrafica;
  const att = data.settings.attivita;
  const s = data.settings;
  if (!ana.nome && !ana.cognome && src.nome) {
    const parts = String(src.nome).trim().split(/\s+/);
    ana.nome = parts[0] || '';
    ana.cognome = parts.slice(1).join(' ') || '';
  }
  const copyIfEmpty = (obj, key, val) => { if ((obj[key] === '' || obj[key] == null) && val) obj[key] = val; };
  copyIfEmpty(ana, 'codiceFiscale', src.codiceFiscale);
  copyIfEmpty(ana, 'residenzaVia', src.indirizzo);
  copyIfEmpty(ana, 'residenzaCap', src.cap);
  copyIfEmpty(ana, 'residenzaComune', src.citta);
  copyIfEmpty(ana, 'residenzaProv', src.provincia);
  copyIfEmpty(ana, 'nazione', src.nazione);
  copyIfEmpty(ana, 'iban', src.iban);
  copyIfEmpty(ana, 'modalitaPagamento', src.modalitaPagamento);
  copyIfEmpty(att, 'partitaIva', src.partitaIva);
  copyIfEmpty(att, 'codiceAteco', src.ateco);
  copyIfEmpty(att, 'descrizioneAttivita', src.atecoDescrizione);
  copyIfEmpty(att, 'atecoGruppo', src.atecoGruppo);
  copyIfEmpty(att, 'note', src.note);
  if (src.agevolazioneStartUp === 1) att.agevolazioneStartUp = 1;
  if (src.primoAnnoAgevolato === 1) att.primoAnnoAgevolato = 1;
  if ((s.coefficiente == null || s.coefficiente === '') && src.coefficiente) s.coefficiente = src.coefficiente;
  if ((s.impostaSostitutiva == null || s.impostaSostitutiva === '') && src.impostaSostitutiva) s.impostaSostitutiva = src.impostaSostitutiva;
  if ((s.limiteForfettario == null || s.limiteForfettario === '') && src.limiteForfettario) s.limiteForfettario = src.limiteForfettario;
  if (src.usaInpsUfficiale !== undefined) s.usaInpsUfficiale = src.usaInpsUfficiale;
  if (src.riduzione35 === 1 && (s.riduzione35 == null || s.riduzione35 === 0)) s.riduzione35 = 1;
  if (src.inpsMode) s.inpsMode = src.inpsMode;
  if (src.inpsCategoria) s.inpsCategoria = src.inpsCategoria;
  if (src.inpsTipoGestSep) s.inpsTipoGestSep = src.inpsTipoGestSep;
  saveData();
  localStorage.removeItem(srcKey);
  localStorage.setItem(flagKey, '1');
}

function loadData() {
  const raw = localStorage.getItem(storageKey());
  data = ensureDataShape(raw ? JSON.parse(raw) : {}, currentYear);
  syncProfileFieldsToSettings(data.settings, currentYear);
  applySettings();
  migrateProfileFiscalToSettings();
  backfillAnagraficaAttivitaFromAllYears();
  applySettings();
}

function migrateFatture() {
  migrateFattureFor(data);
}

function saveData() {
  clearYearDataCache();
  if (data && data.settings) syncProfileFieldsToSettings(data.settings, currentYear);
  localStorage.setItem(storageKey(), JSON.stringify(data));
  if (typeof syncToCloud === 'function' && currentProfile) {
    syncToCloud(currentProfile, currentYear, data);
  }
}

function saveYearData(year, yearData) {
  clearYearDataCache();
  const normalized = ensureDataShape(yearData, year);
  syncProfileFieldsToSettings(normalized.settings, year);
  if (year === currentYear) {
    data = normalized;
    saveData();
    return;
  }
  localStorage.setItem(storageKey(year), JSON.stringify(normalized));
  if (typeof syncToCloud === 'function' && currentProfile) {
    syncToCloud(currentProfile, year, normalized);
  }
}

function getStoredYears(maxYear = currentYear) {
  const years = new Set([maxYear]);
  const prefix = 'calcoliPIVA_' + currentProfile + '_';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || '';
    if (!key.startsWith(prefix)) continue;
    const year = parseInt(key.slice(prefix.length), 10);
    if (!Number.isFinite(year) || year > maxYear) continue;
    years.add(year);
  }
  return Array.from(years).sort((a, b) => a - b);
}

function getAllStoredYears() {
  const years = new Set([currentYear]);
  const prefix = 'calcoliPIVA_' + currentProfile + '_';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || '';
    if (!key.startsWith(prefix)) continue;
    const year = parseInt(key.slice(prefix.length), 10);
    if (!Number.isFinite(year)) continue;
    years.add(year);
  }
  return Array.from(years).sort((a, b) => a - b);
}

function getDefaultSettings(year = currentYear) {
  const profile = getProfileFiscalData();
  const category = getInpsCategory(profile);
  const official = getOfficialArtComInpsParams(year, category) || {
    minimaleInps: 18415,
    contribFissi: 4427.04,
    aliqContributi: 24.0,
    category
  };
  let defaultAliq = official.aliqContributi;
  if (profile.inpsMode === 'gestione_separata' && (parseInt(profile.usaInpsUfficiale, 10) || 0) === 1) {
    defaultAliq = getOfficialGestSepAliquota(year, 'esclusivo').aliqContributi;
  }
  return {
    dailyRate: 0, coefficiente: profile.coefficiente, impostaSostitutiva: profile.impostaSostitutiva,
    contribFissi: official.contribFissi, minimaleInps: official.minimaleInps, aliqContributi: defaultAliq,
    riduzione35: 0, limiteForfettario: profile.limiteForfettario, regime: 'forfettario',
    haRedditoDipendente: 0,
    inpsMode: profile.inpsMode,
    inpsCategoria: official.category,
    inpsTipoGestSep: 'esclusivo',
    usaInpsUfficiale: profile.usaInpsUfficiale,
    giorniIncasso: 30,
    scadenziarioRangePct: 5,
    scadenziarioMetodoAcconti: 'storico',
    scadenziarioPrevisionaleImposta: '',
    scadenziarioPrevisionaleContributi: '',
    scadenziarioSaldoImposta: '',
    scadenziarioAccontoImposta: '',
    scadenziarioSaldoContributi: '',
    scadenziarioAccontoContributi: '',
    scadenziarioOverrideDataSaldoImposta: '',
    scadenziarioDirittoCamerale: '',
    scadenziarioBolloPrecedenteQ4: '',
    scadenziarioBolloCorrenteQ4: '',
    scadenziarioInailCorrente: '',
    scadenziarioInailSuccessivo: '',
    primoAnnoFatturatoPrec: '',
    primoAnnoImpostaPrec: '',
    primoAnnoAccontiImpostaPrec: '',
    primoAnnoContribVariabiliPrec: '',
    primoAnnoAccontiContribPrec: ''
  };
}

function applySettings() {
  const s = data.settings;
  const fields = {
    settDailyRate: 'dailyRate',
    settGiorniIncasso: 'giorniIncasso',
    settDipendenteIncome: 'haRedditoDipendente',
    settRiduzione35: 'riduzione35'
  };
  for (const [id, key] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.value = s[key];
  }
  // Optional number fields (empty string = not set)
  const optFields = {
    settInailCorrente: 'scadenziarioInailCorrente',
    settInailSuccessivo: 'scadenziarioInailSuccessivo',
    settDirittoCamerale: 'scadenziarioDirittoCamerale'
  };
  for (const [id, key] of Object.entries(optFields)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.value = s[key] !== '' && s[key] !== null && s[key] !== undefined ? s[key] : '';
  }
  const speseBtn = document.querySelector('[data-tab="spese"]');
  if (speseBtn) speseBtn.style.display = s.regime === 'ordinario' ? '' : 'none';
  if (typeof updateNavLabels === 'function') updateNavLabels();
  // Anagrafica fields
  const ana = s.anagrafica || {};
  const anagraficaMap = {
    settCf:           'codiceFiscale',
    settCognome:      'cognome',
    settNome:         'nome',
    settSesso:        'sesso',
    settDataNascita:  'dataNascita',
    settComuneNascita:'comuneNascita',
    settProvNascita:  'provNascita',
    settResVia:       'residenzaVia',
    settResComune:    'residenzaComune',
    settResProv:      'residenzaProv',
    settResCap:       'residenzaCap',
    settDomVia:       'domicilioFiscaleVia',
    settDomComune:    'domicilioFiscaleComune',
    settDomProv:      'domicilioFiscaleProv',
    settDomCap:       'domicilioFiscaleCap',
    settTelefono:     'telefono',
    settEmail:        'email',
    settStatoCivile:  'statoCivile'
  };
  for (const [id, key] of Object.entries(anagraficaMap)) {
    const el = document.getElementById(id);
    if (el) el.value = ana[key] || '';
  }
  if (ana.codiceFiscale !== undefined) updateCfStatus(ana.codiceFiscale);
  // Attivita fields
  const att = s.attivita || {};
  const attivitaMap = {
    settAttCodiceAteco:  'codiceAteco',
    settAttDescrizione:  'descrizioneAttivita',
    settAttDataInizio:   'dataInizioAttivita',
    settSedeVia:         'sedeVia',
    settSedeComune:      'sedeComune',
    settSedeProv:        'sedeProv',
    settSedeCap:         'sedeCap'
  };
  for (const [id, key] of Object.entries(attivitaMap)) {
    const el = document.getElementById(id);
    if (el) el.value = att[key] || '';
  }
  // C4: parametri fiscali
  const coefI = document.getElementById('settCoefficiente'); if (coefI) coefI.value = s.coefficiente ?? '';
  const aliqI = document.getElementById('settAliquotaSost'); if (aliqI) aliqI.value = s.impostaSostitutiva ?? '';
  const limI = document.getElementById('settLimiteForfettario'); if (limI) limI.value = s.limiteForfettario ?? '';
  const uffI = document.getElementById('settUsaInpsUfficiale'); if (uffI) uffI.value = String(s.usaInpsUfficiale ?? 1);
  const devHD = document.getElementById('settDevHardDelete'); if (devHD) devHD.checked = (parseInt(s.devHardDelete, 10) || 0) === 1;
  populateAtecoGruppoSelect();
}

function populateAtecoGruppoSelect() {
  const sel = document.getElementById('settAtecoGruppo');
  if (!sel || !window.ATECO_COEFFICIENTI) return;
  const current = (S().attivita && S().attivita.atecoGruppo) || '';
  const options = ['<option value="">— scegli —</option>'];
  for (const [k, v] of Object.entries(window.ATECO_COEFFICIENTI)) {
    const label = `${k} — ${v.descrizione} (${v.coefficiente}%)`;
    options.push(`<option value="${escapeHtml(k)}" ${k===current?'selected':''}>${escapeHtml(label)}</option>`);
  }
  sel.replaceChildren();
  sel.insertAdjacentHTML('afterbegin', options.join(''));
}

function applyAtecoGruppo(value) {
  saveAttivitaField('atecoGruppo', value);
  if (value && window.ATECO_COEFFICIENTI && window.ATECO_COEFFICIENTI[value]) {
    const coeff = window.ATECO_COEFFICIENTI[value].coefficiente;
    saveSetting('coefficiente', coeff);
    const coefInput = document.getElementById('settCoefficiente');
    if (coefInput) coefInput.value = coeff;
  }
  if (typeof recalcAll === 'function') recalcAll();
}

function saveSetting(key, val) {
  data.settings[key] = parseFloat(val) || 0;
  saveData();
}

function saveTextSetting(key, val) {
  data.settings[key] = val;
  saveData();
  applySettings();
}

function saveOptionalNumberSetting(key, val) {
  data.settings[key] = String(val).trim() === '' ? '' : (parseFloat(val) || 0);
  saveData();
}

function saveBoolSetting(key, val) {
  data.settings[key] = val ? 1 : 0;
  saveData();
}

function saveAnagraficaField(key, val) {
  if (!data.settings.anagrafica) data.settings.anagrafica = {};
  data.settings.anagrafica[key] = val;
  saveData();
  propagateAnagraficaAttivitaAcrossYears();
}

function saveAttivitaField(key, val) {
  if (!data.settings.attivita) data.settings.attivita = {};
  data.settings.attivita[key] = val;
  saveData();
  propagateAnagraficaAttivitaAcrossYears();
}

// C4: anagrafica e attivita sono stabili fra anni — propaga da currentYear a tutti gli altri anni salvati del profilo
function propagateAnagraficaAttivitaAcrossYears() {
  if (!currentProfile || !data || !data.settings) return;
  const ana = data.settings.anagrafica || {};
  const att = data.settings.attivita || {};
  const prefix = `calcoliPIVA_${currentProfile}_`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const yearStr = key.slice(prefix.length);
    const year = parseInt(yearStr, 10);
    if (!Number.isFinite(year) || year === currentYear) continue;
    let doc; try { doc = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (!doc || typeof doc !== 'object' || !doc.settings) continue;
    doc.settings.anagrafica = { ...(doc.settings.anagrafica || {}), ...ana };
    doc.settings.attivita = { ...(doc.settings.attivita || {}), ...att };
    localStorage.setItem(key, JSON.stringify(doc));
  }
}

// C4: al login, raccogli anagrafica/attivita da ogni anno (first-non-empty-wins) e propaga
function backfillAnagraficaAttivitaFromAllYears() {
  if (!currentProfile) return;
  const prefix = `calcoliPIVA_${currentProfile}_`;
  const mergedAna = { ...(data.settings.anagrafica || {}) };
  const mergedAtt = { ...(data.settings.attivita || {}) };
  const fillFrom = (src, target) => {
    if (!src || typeof src !== 'object') return;
    for (const [k, v] of Object.entries(src)) {
      const existing = target[k];
      const empty = existing === undefined || existing === null || existing === '' || existing === 0;
      if (empty && v !== undefined && v !== null && v !== '' && v !== 0) target[k] = v;
    }
  };
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const yearStr = key.slice(prefix.length);
    if (!/^\d{4}$/.test(yearStr)) continue;
    let doc; try { doc = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (!doc || !doc.settings) continue;
    fillFrom(doc.settings.anagrafica, mergedAna);
    fillFrom(doc.settings.attivita, mergedAtt);
  }
  // Fallback: PROFILE_FISCAL_LIBRARY legacy defaults (Mattia/Peru/Demo) — mappa legacy->nuovo
  const lib = PROFILE_FISCAL_LIBRARY[currentProfile];
  if (lib) {
    const nameParts = String(lib.nome || '').trim().split(/\s+/);
    const libAna = {
      nome: nameParts[0] || '',
      cognome: nameParts.slice(1).join(' ') || '',
      codiceFiscale: lib.codiceFiscale || '',
      residenzaVia: lib.indirizzo || '',
      residenzaCap: lib.cap || '',
      residenzaComune: lib.citta || '',
      residenzaProv: lib.provincia || '',
      nazione: lib.nazione || 'IT',
      iban: lib.iban || '',
      modalitaPagamento: lib.modalitaPagamento || ''
    };
    const libAtt = {
      partitaIva: lib.partitaIva || '',
      codiceAteco: lib.ateco || '',
      descrizioneAttivita: lib.atecoDescrizione || '',
      atecoGruppo: lib.atecoGruppo || '',
      note: lib.note || '',
      agevolazioneStartUp: lib.agevolazioneStartUp || 0,
      primoAnnoAgevolato: lib.primoAnnoAgevolato || 0
    };
    fillFrom(libAna, mergedAna);
    fillFrom(libAtt, mergedAtt);
    // parametri fiscali settings: se vuoti, prendi dal library
    const libSettings = { coefficiente: lib.coefficiente, impostaSostitutiva: lib.impostaSostitutiva,
      limiteForfettario: lib.limiteForfettario, inailTasso: lib.inailTasso,
      inpsMode: lib.inpsMode, inpsCategoria: lib.inpsCategoria, inpsTipoGestSep: lib.inpsTipoGestSep,
      usaInpsUfficiale: lib.usaInpsUfficiale };
    for (const [k, v] of Object.entries(libSettings)) {
      const ex = data.settings[k];
      const empty = ex === undefined || ex === null || ex === '' || ex === 0;
      if (empty && v !== undefined && v !== null && v !== '' && v !== 0) data.settings[k] = v;
    }
  }
  data.settings.anagrafica = mergedAna;
  data.settings.attivita = mergedAtt;
  saveData();
  propagateAnagraficaAttivitaAcrossYears();
}

function updateCfStatus(val) {
  const el = document.getElementById('cfStatus');
  if (!el) return;
  if (!val || val.trim() === '') { el.textContent = ''; el.className = 'cf-status'; return; }
  const ok = typeof DichiarazioneEngine !== 'undefined' && DichiarazioneEngine.validateCodiceFiscale(val);
  el.textContent = ok ? '\u2713' : '\u2717';
  el.className = 'cf-status ' + (ok ? 'ok' : 'err');
}

function saveYearTextSetting(year, key, val) {
  const yearData = getYearDataFor(year) || ensureDataShape({}, year);
  yearData.settings[key] = val;
  saveYearData(year, yearData);
}

function saveYearOptionalNumberSetting(year, key, val) {
  const yearData = getYearDataFor(year) || ensureDataShape({}, year);
  yearData.settings[key] = String(val).trim() === '' ? '' : (parseFloat(val) || 0);
  saveYearData(year, yearData);
}

function S() { return data.settings; }

function setRegime(r) {
  data.settings.regime = r;
  saveData();
  applySettings();
  recalcAll();
}

function changeYear(d) {
  closePicker();
  closePaymentDatePicker();
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
  const key = `calcoliPIVA_${profile}_fattureEmesse`;
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : []; } catch { return []; }
}

// Helper: save updated list back
function _saveFattureEmesse(profile, list) {
  if (window.FattureStorico) { window.FattureStorico.save(profile, list); return; }
  const key = `calcoliPIVA_${profile}_fattureEmesse`;
  localStorage.setItem(key, JSON.stringify(list));
}

// Helper: get id of fattura at position (month, idx) in the unified store
function _getFatturaIdAt(month, idx) {
  if (!window.FattureSelectors) return null;
  const rows = window.FattureSelectors.getByMonth(currentProfile, currentYear, month);
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
  let t = 0;
  for (let m = 1; m <= 12; m++) t += getMonthEuro(m);
  // Add cross-year invoices (from previous year, paid this year)
  for (const inv of getCrossYearInvoices()) t += inv.importo;
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

  // When selectors available and no estimates needed: use per-cassa ricavi map for accuracy
  if (typeof window !== 'undefined' && window.FattureSelectors && currentProfile &&
      options && options.includeEstimates === false) {
    const ricaviMap = buildRicaviMeseFromSelectors(currentProfile, year);
    const crossYear = getCrossYearInvoicesForYear(year);
    let total = 0;
    for (const m in ricaviMap) total += ricaviMap[m];
    for (const inv of crossYear) total += inv.importo;
    return total;
  }

  let total = 0;
  for (let m = 1; m <= 12; m++) total += getMonthEuroFromYearData(yearData, year, m, options);
  for (const inv of getCrossYearInvoicesForYear(year)) total += inv.importo;
  return total;
}

// ═══════════════════ Calculations ═══════════════════
function calcForfettarioValues(tot, settings, year) {
  const s = settings || {};
  const coeff = s.coefficiente / 100, imp = s.impostaSostitutiva / 100;
  const imponibile = tot * coeff;
  const inps = calcInpsContributions(imponibile, s, year);
  const cF = inps.cF, cV = inps.cV, cT = inps.cT;
  const rid = s.riduzione35 == 1 && inps.mode === 'artigiani_commercianti' ? 0.65 : 1;
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
function ceil2(n) {
  if (n === undefined || n === null || isNaN(n)) return n;
  const scaled = Math.abs(Number(n)) * 100;
  const rounded = Math.ceil(scaled - 1e-9) / 100;
  return Number(n) < 0 ? -rounded : rounded;
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '\u2014';
  return ceil2(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC';
}
function fmtPct(n) { return (n * 100).toFixed(1) + '%'; }
function row(label, val, cls, valCls) {
  return `<div class="row ${cls||''}"><label>${label}</label><span class="val ${valCls||''}">${val}</span></div>`;
}

// ═══════════════════ Donut ═══════════════════
function drawDonut(netto, tasse, contributi, totalLabel = 'Totale lordo') {
  const total = netto + tasse + contributi;
  if (total <= 0) return '<div style="text-align:center;color:var(--text2);padding:30px">Nessun dato</div>';
  const cN = getCSSVar('--color-chart-netto');
  const cT = getCSSVar('--color-chart-tasse');
  const cC = getCSSVar('--color-chart-contributi');
  const size = 180, cx = 90, cy = 90, r = 70, sw = 28, C = 2*Math.PI*r;
  const pN = netto/total, pT = tasse/total, pC = contributi/total;
  const arc = (off, len, col) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}"
    stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += arc(0, pN*C, cN) + arc(pN*C, pT*C, cT) + arc((pN+pT)*C, pC*C, cC);
  svg += `<text x="${cx}" y="${cy-6}" text-anchor="middle" fill="var(--color-text)" font-size="14" font-weight="700">${fmtPct(pN)}</text>`;
  svg += `<text x="${cx}" y="${cy+10}" text-anchor="middle" fill="var(--color-text-muted)" font-size="9">netto</text></svg>`;
  const tasseLabel = S().regime === 'ordinario' ? 'IRPEF' : 'Imposta sost.';
  const contribLabel = getContribLabel(getInpsMode(S()));
  return `<div class="chart-container">${svg}<div class="chart-legend">
    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:${cN}"></div><span>Netto</span><span class="chart-legend-val" style="color:${cN}">${fmt(netto)}</span></div>
    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:${cT}"></div><span>${tasseLabel}</span><span class="chart-legend-val" style="color:${cT}">${fmt(tasse)}</span></div>
    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:${cC}"></div><span>${contribLabel}</span><span class="chart-legend-val" style="color:${cC}">${fmt(contributi)}</span></div>
    <div class="chart-legend-item" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--color-border)">
      <div class="chart-legend-dot" style="background:transparent"></div><span style="font-weight:600">${totalLabel}</span><span class="chart-legend-val">${fmt(total)}</span></div>
  </div></div>`;
}

// ═══════════════════ Mini bar chart ═══════════════════
function drawMiniBars(perc) {
  const safePerc = Math.max(0, Math.min(perc, 1));
  const vals = [];
  for (let m = 1; m <= 12; m++) vals.push(getMonthEuro(m));
  const mx = Math.max(...vals, 1);
  let h = '<div class="mini-bars">';
  for (let m = 0; m < 12; m++) {
    const hPx = Math.round((vals[m] / mx) * 110);
    const net = vals[m] * (1 - safePerc);
    const tax = vals[m] * safePerc;
    const hN = Math.round((net / mx) * 110);
    const hT = hPx - hN;
    h += `<div class="mini-bar-col">
      <div style="display:flex;flex-direction:column;width:100%;height:${hPx}px">
        <div class="mini-bar" style="height:${hT}px;background:var(--color-chart-tasse);border-radius:3px 3px 0 0;opacity:.6"></div>
        <div class="mini-bar" style="height:${hN}px;background:var(--color-chart-netto);border-radius:0"></div>
      </div>
      <div class="mini-bar-label">${MONTHS_SHORT[m]}</div>
    </div>`;
  }
  h += '</div>';
  h += `<div style="display:flex;gap:12px;margin-top:8px;font-size:.7rem;color:var(--text2);justify-content:center">
    <span><span style="display:inline-block;width:10px;height:10px;background:var(--color-chart-netto);border-radius:2px;vertical-align:middle;margin-right:3px"></span>Netto</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:var(--color-chart-tasse);opacity:.6;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Tasse+C.</span>
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    closeOcrPagamentoModal();
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
  const pct = Math.min(100, (totale / safeLimit) * 100);
  const remaining = Math.max(0, safeLimit - totale);
  const over = totale > safeLimit;
  return `<div class="panel forfettario-limit-panel" style="grid-column:1/-1">
    <div class="limit-row"><span class="limit-label">Fatturato ${year}</span><span class="limit-value">${fmt(totale)}</span></div>
    <div class="limit-row"><span class="limit-label">${over ? 'Oltre il limite' : 'Mancante al limite'} (${fmt(safeLimit)})</span><span class="limit-value ${over ? 'over' : ''}">${fmt(over ? totale - safeLimit : remaining)}</span></div>
    <div class="limit-bar-track${over ? ' over' : ''}">
      <div class="limit-bar-fill" style="width:${pct.toFixed(1)}%"></div>
      <span class="limit-bar-pct">${pct.toFixed(1)}%</span>
    </div>
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

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseIsoDate(value) {
  if (!value) return null;
  const parts = String(value).split('-').map(v => parseInt(v, 10));
  if (parts.length !== 3 || parts.some(v => !Number.isFinite(v))) return null;
  const [year, month, day] = parts;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

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

function euroToCents(amount) {
  return Math.max(Math.round((parseFloat(amount) || 0) * 100), 0);
}

function centsToEuro(cents) {
  return cents / 100;
}

function splitAmountByWeights(amount, weights) {
  const totalCents = euroToCents(amount);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let assigned = 0;
  return weights.map((weight, idx) => {
    if (idx === weights.length - 1) return centsToEuro(totalCents - assigned);
    const share = Math.floor(totalCents * weight / totalWeight);
    assigned += share;
    return centsToEuro(share);
  });
}

function buildAccontoPlan(baseAmount) {
  const base = centsToEuro(euroToCents(baseAmount));
  if (base <= FORFETTARIO_RULES.accontoThreshold) {
    return { base, total: 0, first: 0, second: 0, mode: 'none' };
  }
  if (base < FORFETTARIO_RULES.singleAccontoThreshold) {
    return { base, total: base, first: 0, second: base, mode: 'single' };
  }
  const [first, second] = splitAmountByWeights(base, FORFETTARIO_RULES.fixedAccontoWeights);
  return { base, total: base, first, second, mode: 'double' };
}

function buildRolledDueDate(year, month, day) {
  const d = new Date(year, month - 1, day);
  while (d.getDay() === 0 || d.getDay() === 6 || isHoliday(d.getFullYear(), d.getMonth() + 1, d.getDate())) {
    d.setDate(d.getDate() + 1);
  }
  const rolledYear = d.getFullYear();
  const rolledMonth = d.getMonth() + 1;
  const rolledDay = d.getDate();
  return {
    year: rolledYear,
    month: rolledMonth,
    day: rolledDay,
    date: d,
    iso: `${rolledYear}-${pad2(rolledMonth)}-${pad2(rolledDay)}`,
    label: `${pad2(rolledDay)} ${MONTHS_SHORT[rolledMonth - 1]} ${rolledYear}`
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
      certainty
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
  if (contribSaldo > 0) {
    pushDueRow(
      overrideSaldoImposta ? overrideSaldoImposta.month : FORFETTARIO_RULES.saldoMonth,
      overrideSaldoImposta ? overrideSaldoImposta.day : FORFETTARIO_RULES.saldoDay,
      prevForfettarioContribution ? prevForfettarioContribution.saldoLabel : getContribLabel(currentApplied.inpsMode),
      `Saldo ${year - 1}`,
      contribSaldo,
      'contributi',
      manualSaldoContributi !== null ? 'Importo manuale'
        : (firstYearManualUsed ? 'Manuale primo utilizzo'
          : (prevContribAccontiPaid > 0 ? `${year - 1} netto acconti` : `Totale ${year - 1}`)),
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
      { key: `camera_${year}`, certainty: 'fixed', fiscalYear: year }
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
  if (inailCurrentAmount > 0) {
    pushDueRow(2, 16, 'Autoliquidazione INAIL', `Rif. ${year}`, inailCurrentAmount, 'altro',
      manualInailCurrent !== null ? 'Importo configurato' : `Calcolato: ${profileInailTasso.toFixed(2)} ‰ su ${fmt(getInailMinimale(year))}`,
      '', { dueYear: year, key: `inail_${year}`, certainty: 'fixed', fiscalYear: year });
  }
  if (inailNextAmount > 0) {
    pushDueRow(2, 16, 'Autoliquidazione INAIL', `Rif. ${year + 1}`, inailNextAmount, 'altro',
      manualInailNext !== null ? 'Importo configurato' : `Calcolato: ${profileInailTasso.toFixed(2)} ‰ su ${fmt(getInailMinimale(year + 1))}`,
      '', { key: `inail_${year + 1}`, certainty: 'fixed', fiscalYear: year + 1 });
  }

  const autoCurrentImpostaSaldo = currentApplied ? currentApplied.tasse - impostaAcconti.total : 0;
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

  const autoCurrentContribSaldo = currentContribution ? currentContribution.saldoAccontoBase - contribAcconti.total : 0;
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
    return scadEngine.normalizeLegacyScheduleRow(rowItem, {
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
      warnings: [],
      due: rowItem && rowItem.due ? rowItem.due : null,
      legacyRow: rowItem
    });
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
    // Read-only display for wizard / manuale / ocr-import rows
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
      ${MONTHS_SHORT.map((ms, i) => `<option value="${i+1}" ${f.pagMese === (i+1) ? 'selected' : ''}>${ms}</option>`).join('')}
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
    const fatture = getFatture(m);
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
              ${MONTHS_SHORT.map((ms, i) => `<option value="${i+1}">${ms}</option>`).join('')}
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

  const crossTotAll = getCrossYearInvoices().reduce((s, i) => s + i.importo, 0);
  const tFTotal = tF + crossTotAll; // include cross-year invoices in yearly total
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

// ═══════════════════ Tab navigation ═══════════════════
function switchToTab(tab) {
  document.querySelectorAll('.sb-item[data-tab]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const navBtn = document.querySelector(`.sb-item[data-tab="${tab}"]`);
  if (navBtn) navBtn.classList.add('active');
  const tabEl = document.getElementById('tab-' + tab);
  if (tabEl) tabEl.classList.add('active');
  try { localStorage.setItem('calcoliPIVA_activeTab', tab); } catch (_) {}
  // mount Dichiarazione wizard when switching to that tab
  if (tab === 'dichiarazione' && window.DichiarazioneUI) {
    window.DichiarazioneUI.mount('tab-dichiarazione', currentYear);
  }
  // render card A (fatture emesse) when switching to fatture tab
  // (lo storico ora vive nel modale, aperto on-demand)
  if (tab === 'fatture') {
    // Migrazione legacy one-shot per-anno (unificazione store)
    if (window.FattureMigration && typeof window.FattureMigration.migrateLegacyYear === 'function') {
      try {
        for (let y = 2020; y <= new Date().getFullYear() + 1; y++) {
          const yd = loadYearData(y);
          if (yd && yd.fatture && !yd._fattureMigratedAt) {
            const res = window.FattureMigration.migrateLegacyYear(currentProfile, y, yd);
            if (res.migrated > 0) console.log('[fatture-migration] anno', y, '→', res.migrated, 'righe migrate');
            yd._fattureMigratedAt = new Date().toISOString();
            saveYearData(y, yd);
          }
        }
      } catch (err) { console.warn('[fatture-migration] errore', err); }
    }
    if (typeof window.renderFattureDocsSection === 'function') {
      window.renderFattureDocsSection();
    }
  }
  if (tab === 'profilo-personale') renderProfiloPersonale();
  else if (tab === 'profilo-piva') renderProfiloPiva();
  else if (tab === 'riepilogo') renderRiepilogo();
  // Chiudi drawer mobile dopo cambio tab
  if (window.matchMedia('(max-width: 768px)').matches) {
    closeSidebar();
  }
  window.scrollTo(0, 0);
}

function openDichiarazione() {
  switchToTab('dichiarazione');
}
document.querySelector('.sidebar')?.addEventListener('click', e => {
  const btn = e.target.closest('.sb-item[data-tab]');
  if (!btn) return;
  switchToTab(btn.dataset.tab);
});

// ═══════════════════ Mobile nav labels ═══════════════════
const NAV_LABELS = {
  calcolo:        { full: null, short: 'Regime' }, // full set by applySettings
  accantonamento: { full: 'Tasse Accantonate', short: 'Tasse' },
  scadenziario:   { full: 'Scadenze', short: 'Scad.' },
  calendar:       { full: 'Calendario', short: 'Calend.' },
  fatture:        { full: 'Fatture', short: 'Fatture' },
  budget:         { full: 'Budget', short: 'Budget' },
  clienti:        { full: 'Clienti', short: 'Clienti' },
  spese:          { full: 'Spese', short: 'Spese' },
  dichiarazione:  { full: 'Dichiarazione', short: 'Dichiar.' },
  settings:       { full: 'Impostazioni', short: 'Impost.' }
};
function updateNavLabels() {
  // Con la sidebar, l'etichetta sta dentro .sb-label (mantiene l'icona accanto)
  document.querySelectorAll('.sb-item[data-tab]').forEach(btn => {
    const tab = btn.dataset.tab;
    const lbl = NAV_LABELS[tab];
    if (!lbl) return;
    const labelEl = btn.querySelector('.sb-label');
    if (!labelEl) return;
    if (tab === 'calcolo') {
      const regime = S().regime === 'forfettario' ? 'Forfettario' : 'Ordinario';
      labelEl.textContent = 'Regime ' + regime;
    } else {
      labelEl.textContent = lbl.full;
    }
  });
}
window.addEventListener('resize', updateNavLabels);

// ═══════════════════ Export / Import ═══════════════════
function exportData() {
  const allData = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('calcoliPIVA_' + currentProfile + '_')) allData[key] = JSON.parse(localStorage.getItem(key));
  }
  const profileKey = profileStorageKey(currentProfile);
  if (localStorage.getItem(profileKey)) allData[profileKey] = JSON.parse(localStorage.getItem(profileKey));
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'calcoli_piva_backup.json'; a.click();
}

function importData(e) {
  clearYearDataCache();
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const allData = JSON.parse(ev.target.result);
    const prefix = 'calcoliPIVA_' + currentProfile + '_';
    const profileKey = profileStorageKey(currentProfile);
    for (const [key, val] of Object.entries(allData)) {
      if (key.startsWith(prefix) || key === profileKey) localStorage.setItem(key, JSON.stringify(val));
    }
    loadProfileFiscalData();
    loadData(); recalcAll(); alert('Dati importati!');
  };
  reader.readAsText(file);
}

function buildSeedSettings(year, overrides = {}) {
  return {
    ...getDefaultSettings(year),
    ...overrides
  };
}

// ═══════════════════ Seed Mattia Data ═══════════════════
function seedMattiaData() {
  // Only seed once: check if 2025 data already exists
  if (localStorage.getItem('calcoliPIVA_Mattia_2025')) return;
  if (!localStorage.getItem(profileStorageKey('Mattia'))) {
    localStorage.setItem(profileStorageKey('Mattia'), JSON.stringify(normalizeProfileFiscalData({}, 'Mattia')));
  }

  // ── 2024 ──
  const data2024 = {
    settings: buildSeedSettings(2024, {
      dailyRate: 400, coefficiente: 67, impostaSostitutiva: 15,
      riduzione35: 0, limiteForfettario: 85000, regime: 'ordinario',
      haRedditoDipendente: 1
    }),
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
    settings: buildSeedSettings(2025, {
      dailyRate: 315, coefficiente: 67, impostaSostitutiva: 15,
      riduzione35: 0, limiteForfettario: 85000, regime: 'forfettario'
    }),
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
    settings: buildSeedSettings(2026, {
      dailyRate: 315, coefficiente: 67, impostaSostitutiva: 15,
      riduzione35: 0, limiteForfettario: 85000, regime: 'forfettario'
    }),
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
  if (!localStorage.getItem(profileStorageKey('Peru'))) {
    localStorage.setItem(profileStorageKey('Peru'), JSON.stringify(normalizeProfileFiscalData({}, 'Peru')));
  }

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
    settings: buildSeedSettings(2024, {
      dailyRate: 400, coefficiente: 67, impostaSostitutiva: 15,
      riduzione35: 0, limiteForfettario: 85000, regime: 'ordinario'
    }),
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
    settings: buildSeedSettings(2025, {
      dailyRate: 150, coefficiente: 67, impostaSostitutiva: 15,
      riduzione35: 0, limiteForfettario: 85000, regime: 'forfettario'
    }),
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
    settings: buildSeedSettings(2026, {
      dailyRate: 175, coefficiente: 67, impostaSostitutiva: 15,
      riduzione35: 0, limiteForfettario: 85000, regime: 'forfettario'
    }),
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

// ═══════════════════ Profilo (C4) ═══════════════════

function renderProfiloField(label, opts) {
  const o = opts || {};
  const ns = o.namespace || 'anagrafica';
  const key = o.key || '';
  const mode = o.mode || 'text';
  const settings = S();
  const source = ns === 'settings' ? settings : (settings[ns] || {});
  const rawVal = source[key];
  const isSelect = mode === 'select';
  const displayValue = isSelect && Array.isArray(o.options)
    ? ((o.options.find(op => String(op.value) === String(rawVal ?? ''))?.label) || (rawVal ?? '-'))
    : (rawVal !== undefined && rawVal !== null && String(rawVal) !== '' ? rawVal : '-');
  const fieldId = `pf-${ns}-${key}`;
  const onclick = `enterProfiloEdit('${ns}','${key}','${mode}', this)`;
  const optsAttr = o.options ? ` data-options='${escapeHtml(JSON.stringify(o.options))}'` : '';
  return `<div class="profilo-row">
    <span class="profilo-label">${escapeHtml(label)}</span>
    <span class="profilo-value" id="${fieldId}" tabindex="0" role="button"
          data-ns="${ns}" data-key="${key}" data-mode="${mode}"${optsAttr}
          onclick="${onclick}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();${onclick}}">${escapeHtml(String(displayValue))}</span>
  </div>`;
}

function saveProfiloField(ns, key, value) {
  if (ns === 'anagrafica') saveAnagraficaField(key, value);
  else if (ns === 'attivita') saveAttivitaField(key, value);
  else {
    const trimmed = String(value ?? '').trim();
    const isNumeric = trimmed !== '' && /^-?[\d.,]+$/.test(trimmed);
    if (isNumeric) saveSetting(key, value);
    else saveTextSetting(key, value);
  }
}

function enterProfiloEdit(ns, key, mode, el) {
  if (!el || el.classList.contains('editing')) return;
  const settings = S();
  const source = ns === 'settings' ? settings : (settings[ns] || {});
  const current = source[key] ?? '';
  el.classList.add('editing');
  const finish = (newVal) => {
    saveProfiloField(ns, key, newVal);
    if (typeof recalcAll === 'function') recalcAll();
    rerenderProfiloTabs();
  };
  let editorHtml;
  if (mode === 'select') {
    const opts = el.dataset.options ? JSON.parse(el.dataset.options) : [];
    editorHtml = `<select>${opts.map(o =>
      `<option value="${escapeHtml(String(o.value))}" ${String(o.value)===String(current)?'selected':''}>${escapeHtml(o.label)}</option>`
    ).join('')}</select>`;
  } else {
    const inputType = mode === 'number' ? 'number' : 'text';
    editorHtml = `<input type="${inputType}" value="${escapeHtml(String(current))}">`;
  }
  el.replaceChildren();
  el.insertAdjacentHTML('afterbegin', editorHtml);
  const field = el.firstElementChild;
  field.focus();
  if (field.tagName === 'INPUT') field.select();
  if (mode === 'select') {
    field.addEventListener('change', () => finish(field.value));
    field.addEventListener('blur', () => finish(field.value));
  } else {
    field.addEventListener('blur', () => finish(field.value));
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); field.blur(); }
      else if (e.key === 'Escape') { rerenderProfiloTabs(); }
    });
  }
}

function rerenderProfiloTabs() {
  if (document.getElementById('tab-profilo-personale')?.classList.contains('active')) renderProfiloPersonale();
  if (document.getElementById('tab-profilo-piva')?.classList.contains('active')) renderProfiloPiva();
}

function renderProfiloPersonale() {
  const host = document.getElementById('profilo-personale-content');
  if (!host) return;
  const html = `
    <div class="profilo-page">
      <h2 class="profilo-title">Profilo personale</h2>
      <p class="profilo-subtitle">Dati anagrafici e di fatturazione. Clicca un valore per modificarlo.</p>

      <section class="profilo-group">
        <h3 class="profilo-group-head">Anagrafica</h3>
        <div class="profilo-rows">
          ${renderProfiloField('Nome', { namespace: 'anagrafica', key: 'nome' })}
          ${renderProfiloField('Cognome', { namespace: 'anagrafica', key: 'cognome' })}
          ${renderProfiloField('Codice fiscale', { namespace: 'anagrafica', key: 'codiceFiscale' })}
        </div>
      </section>

      <section class="profilo-group">
        <h3 class="profilo-group-head">Residenza</h3>
        <div class="profilo-rows">
          ${renderProfiloField('Indirizzo', { namespace: 'anagrafica', key: 'residenzaVia' })}
          ${renderProfiloField('CAP', { namespace: 'anagrafica', key: 'residenzaCap' })}
          ${renderProfiloField('Citta', { namespace: 'anagrafica', key: 'residenzaComune' })}
          ${renderProfiloField('Provincia', { namespace: 'anagrafica', key: 'residenzaProv' })}
          ${renderProfiloField('Nazione', { namespace: 'anagrafica', key: 'nazione' })}
        </div>
      </section>

      <section class="profilo-group">
        <h3 class="profilo-group-head">Fatturazione</h3>
        <div class="profilo-rows">
          ${renderProfiloField('IBAN', { namespace: 'anagrafica', key: 'iban' })}
          ${renderProfiloField('Modalita pagamento', { namespace: 'anagrafica', key: 'modalitaPagamento' })}
        </div>
      </section>
    </div>
  `;
  host.replaceChildren();
  host.insertAdjacentHTML('afterbegin', html);
}

function renderProfiloPiva() {
  const host = document.getElementById('profilo-piva-content');
  if (!host) return;
  const s = S();
  const inpsMode = s.inpsMode || 'artigiani_commercianti';
  const inpsModeOptions = [
    { value: 'artigiani_commercianti', label: 'Artigiani / Commercianti' },
    { value: 'gestione_separata', label: 'Gestione Separata' }
  ];
  const inpsCategoriaOptions = [
    { value: 'artigiano', label: 'Artigiano' },
    { value: 'commerciante', label: 'Commerciante' }
  ];
  const tipoGestSepOptions = [
    { value: 'senza_altra_copertura', label: 'Senza altra copertura previdenziale' },
    { value: 'con_altra_copertura', label: 'Con altra copertura previdenziale' }
  ];
  const agevolazioneOptions = [
    { value: 0, label: 'No' }, { value: 1, label: 'Si' }
  ];

  let previdenzaRows = renderProfiloField('Gestione previdenziale', {
    namespace: 'settings', key: 'inpsMode', mode: 'select', options: inpsModeOptions
  });
  if (inpsMode === 'artigiani_commercianti') {
    previdenzaRows += renderProfiloField('Categoria INPS', {
      namespace: 'settings', key: 'inpsCategoria', mode: 'select', options: inpsCategoriaOptions
    });
  } else if (inpsMode === 'gestione_separata') {
    previdenzaRows += renderProfiloField('Tipologia Gestione Separata', {
      namespace: 'settings', key: 'inpsTipoGestSep', mode: 'select', options: tipoGestSepOptions
    });
  }

  const html = `
    <div class="profilo-page">
      <h2 class="profilo-title">Profilo P.IVA</h2>
      <p class="profilo-subtitle">Dati fiscali dell'attivita. Clicca un valore per modificarlo.</p>

      <section class="profilo-group">
        <h3 class="profilo-group-head">Attivita</h3>
        <div class="profilo-rows">
          ${renderProfiloField('Partita IVA', { namespace: 'attivita', key: 'partitaIva' })}
          ${renderProfiloField('Codice ATECO', { namespace: 'attivita', key: 'codiceAteco' })}
          ${renderProfiloField('Descrizione attivita', { namespace: 'attivita', key: 'descrizioneAttivita' })}
          ${renderProfiloField('Note', { namespace: 'attivita', key: 'note' })}
        </div>
      </section>

      <section class="profilo-group">
        <h3 class="profilo-group-head">Previdenza</h3>
        <div class="profilo-rows">
          ${previdenzaRows}
        </div>
      </section>

      <section class="profilo-group">
        <h3 class="profilo-group-head">Agevolazioni</h3>
        <div class="profilo-rows">
          ${renderProfiloField('Agevolazione start-up', { namespace: 'attivita', key: 'agevolazioneStartUp', mode: 'select', options: agevolazioneOptions })}
          ${renderProfiloField('Primo anno agevolato', { namespace: 'attivita', key: 'primoAnnoAgevolato', mode: 'select', options: agevolazioneOptions })}
        </div>
      </section>
    </div>
  `;
  host.replaceChildren();
  host.insertAdjacentHTML('afterbegin', html);
}

// ═══ App confirm modal ═══
// Drop-in replacement for window.confirm(), DOM-based, themed.
// Call styles:
//   showAppConfirm(message, cb)                           → legacy: cb() only on confirm
//   showAppConfirm({ title, message, okLabel, danger })   → returns Promise<boolean>
function showAppConfirm(optsOrMsg, cbMaybe) {
  let opts;
  if (typeof optsOrMsg === 'string') { opts = { message: optsOrMsg }; }
  else { opts = optsOrMsg || {}; }
  const title = opts.title || 'Conferma';
  const message = opts.message || '';
  const okLabel = opts.okLabel || 'Conferma';
  const cancelLabel = opts.cancelLabel || 'Annulla';
  const danger = opts.danger !== false;

  let root = document.getElementById('appConfirmBackdrop');
  if (!root) {
    root = document.createElement('div');
    root.id = 'appConfirmBackdrop';
    root.className = 'app-confirm-backdrop';
    root.innerHTML = '<div class="app-confirm-panel" role="dialog" aria-modal="true" aria-labelledby="appConfirmTitle">' +
      '<h3 id="appConfirmTitle" class="app-confirm-title"></h3>' +
      '<p class="app-confirm-msg"></p>' +
      '<div class="app-confirm-actions">' +
        '<button type="button" class="btn-add profile-secondary-btn" data-role="cancel"></button>' +
        '<button type="button" class="btn-add" data-role="ok"></button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(root);
  }
  const titleEl = root.querySelector('#appConfirmTitle');
  const msgEl = root.querySelector('.app-confirm-msg');
  const okBtn = root.querySelector('[data-role="ok"]');
  const cancelBtn = root.querySelector('[data-role="cancel"]');
  titleEl.textContent = title;
  msgEl.textContent = message;
  okBtn.textContent = okLabel;
  cancelBtn.textContent = cancelLabel;
  okBtn.classList.toggle('btn-add-danger', !!danger);

  return new Promise(resolve => {
    function cleanup(value) {
      root.classList.remove('open');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      root.onclick = null;
      document.removeEventListener('keydown', onKey);
      if (typeof cbMaybe === 'function' && value) cbMaybe();
      resolve(value);
    }
    function onKey(e) {
      if (e.key === 'Escape') cleanup(false);
      else if (e.key === 'Enter') cleanup(true);
    }
    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    root.onclick = (e) => { if (e.target === root) cleanup(false); };
    document.addEventListener('keydown', onKey);
    root.classList.add('open');
    setTimeout(() => okBtn.focus(), 0);
  });
}
window.showAppConfirm = showAppConfirm;
window.getAppData = function() { return data; };
