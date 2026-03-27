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
    ateco: '62.10.00',
    atecoDescrizione: 'Attivita di programmazione informatica',
    coefficiente: 67,
    impostaSostitutiva: 15,
    inpsMode: 'artigiani_commercianti',
    inpsCategoria: 'artigiano',
    usaInpsUfficiale: 1,
    riduzione35: 0,
    limiteForfettario: 85000,
    agevolazioneStartUp: 0,
    primoAnnoAgevolato: 0,
    note: 'Profilo reale con transizione ordinario -> forfettario dal 2025.'
  },
  Peru: {
    nome: 'Peru',
    codiceFiscale: '',
    partitaIva: '',
    ateco: '62.10.00',
    atecoDescrizione: 'Attivita di programmazione informatica',
    coefficiente: 67,
    impostaSostitutiva: 15,
    inpsMode: 'artigiani_commercianti',
    inpsCategoria: 'artigiano',
    usaInpsUfficiale: 1,
    riduzione35: 0,
    limiteForfettario: 85000,
    agevolazioneStartUp: 0,
    primoAnnoAgevolato: 0,
    note: ''
  },
  Demo: {
    nome: 'Demo',
    codiceFiscale: '',
    partitaIva: '',
    ateco: '62.10.00',
    atecoDescrizione: 'Attivita di programmazione informatica',
    coefficiente: 67,
    impostaSostitutiva: 15,
    inpsMode: 'artigiani_commercianti',
    inpsCategoria: 'artigiano',
    usaInpsUfficiale: 1,
    riduzione35: 0,
    limiteForfettario: 85000,
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
  'usaInpsUfficiale',
  'riduzione35',
  'limiteForfettario'
];
let currentProfile = sessionStorage.getItem('currentProfile') || null;
let profileFiscalState = { editing: false, draft: null, data: null };
let profileCopyToastTimer = null;
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
  showEmptyYears: false
};

function updateProfileBadge() {
  const trigger = document.getElementById('profileBadge');
  const nameEl = document.getElementById('profileBadgeName');
  if (!trigger || !nameEl) return;
  if (!currentProfile) {
    nameEl.textContent = '';
    trigger.disabled = true;
    trigger.classList.add('is-empty');
    trigger.setAttribute('title', 'Accedi per aprire il profilo fiscale');
    return;
  }
  const profile = profileFiscalState.data || getProfileFiscalDefaults(currentProfile);
  const displayName = profile && profile.nome ? profile.nome : currentProfile;
  nameEl.textContent = displayName;
  trigger.disabled = false;
  trigger.classList.remove('is-empty');
  trigger.setAttribute('title', `Apri il profilo fiscale di ${displayName}`);
}

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

  // Seed historical data (once per profile)
  if (profile === 'Mattia') seedMattiaData();
  if (profile === 'Peru') seedPeruData();
  loadProfileFiscalData();
  updateProfileBadge();

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
  loadProfileExternalFiscalData(profile).then(() => recalcAll());
}

function doLogout() {
  closeProfileFiscalModal();
  currentProfile = null;
  sessionStorage.removeItem('currentProfile');
  profileFiscalState = { editing: false, draft: null, data: null };
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
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
  updateProfileBadge();
}

function checkSession() {
  if (currentProfile) {
    document.getElementById('loginScreen').classList.add('hidden');
    loadProfileFiscalData();
    updateProfileBadge();
    // Init Firebase in background, then sync cloud → local → refresh UI
    initFirebase().then(ok => {
      if (ok) {
        syncAllFromCloud(currentProfile).then(count => {
          loadData();
          recalcAll();
          loadProfileExternalFiscalData(currentProfile).then(() => recalcAll());
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
const PAYMENT_TYPES = {
  tasse:      { label: 'Tasse', color: 'var(--red)' },
  contributi: { label: 'Contributi', color: 'var(--yellow)' },
  misto:      { label: 'Misto', color: 'var(--blue)' },
  altro:      { label: 'Altro', color: 'var(--text2)' }
};
const OFFICIAL_ARTCOM_INPS = {
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
  if (!scheduleRowKey) return null;
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
  for (const [prefix, key] of prefixes) {
    if (scheduleRowKey.startsWith(prefix)) return key;
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

function getProfileFiscalDefaults(profile = currentProfile) {
  return { ...(PROFILE_FISCAL_LIBRARY[profile] || PROFILE_FISCAL_LIBRARY.Demo) };
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
    ateco: String(merged.ateco || base.ateco || ''),
    atecoDescrizione: String(merged.atecoDescrizione || base.atecoDescrizione || ''),
    coefficiente: validatePercentValue(merged.coefficiente, base.coefficiente || 67),
    impostaSostitutiva: validatePercentValue(merged.impostaSostitutiva, base.impostaSostitutiva || 15),
    inpsMode: normalizeInpsMode(merged.inpsMode || base.inpsMode),
    inpsCategoria: normalizeInpsCategory(merged.inpsCategoria || base.inpsCategoria),
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
  profileFiscalState.data = getStoredProfileFiscal(currentProfile);
  if (!profileFiscalState.editing) profileFiscalState.draft = { ...profileFiscalState.data };
  updateProfileBadge();
  return profileFiscalState.data;
}

function saveProfileFiscalData(nextData) {
  const normalized = normalizeProfileFiscalData(nextData, currentProfile);
  localStorage.setItem(profileStorageKey(currentProfile), JSON.stringify(normalized));
  profileFiscalState.data = normalized;
  profileFiscalState.draft = { ...normalized };
  updateProfileBadge();
  return normalized;
}

function getProfileFiscalData() {
  if (!profileFiscalState.data) loadProfileFiscalData();
  return profileFiscalState.data || normalizeProfileFiscalData({}, currentProfile);
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
  const fallbackYear = knownYears.filter(y => y <= targetYear).pop() || knownYears[knownYears.length - 1];
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
  return getInpsMode(s) === 'artigiani_commercianti' && (parseInt(s.usaInpsUfficiale, 10) || 0) === 1;
}

function getResolvedInpsSettings(settings, year) {
  const s = settings || {};
  if (!usesOfficialInpsValues(s)) return { ...s };
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
    const cV = base * aliquota;
    return { mode, cF: 0, cV, cT: cV, imponibile: base };
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
  for (const [key, value] of Object.entries(defaultSettings)) {
    if (out.settings[key] === undefined) out.settings[key] = value;
  }
  out.settings.inpsMode = inferInpsMode(out.settings);
  out.settings.inpsCategoria = getInpsCategory(out.settings);
  syncOfficialInpsValues(out.settings, targetYear);
  migrateFattureFor(out);
  return out;
}

function loadYearData(y) {
  if (y === currentYear) {
    const shaped = ensureDataShape(data, y);
    syncProfileFieldsToSettings(shaped.settings, y);
    return shaped;
  }
  const raw = localStorage.getItem(storageKey(y));
  if (!raw) return null;
  const shaped = ensureDataShape(JSON.parse(raw), y);
  syncProfileFieldsToSettings(shaped.settings, y);
  return shaped;
}

function loadData() {
  const raw = localStorage.getItem(storageKey());
  data = ensureDataShape(raw ? JSON.parse(raw) : {}, currentYear);
  syncProfileFieldsToSettings(data.settings, currentYear);
  applySettings();
}

function migrateFatture() {
  migrateFattureFor(data);
}

function saveData() {
  if (data && data.settings) syncProfileFieldsToSettings(data.settings, currentYear);
  localStorage.setItem(storageKey(), JSON.stringify(data));
  if (typeof syncToCloud === 'function' && currentProfile) {
    syncToCloud(currentProfile, currentYear, data);
  }
}

function saveYearData(year, yearData) {
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
  return {
    dailyRate: 0, coefficiente: profile.coefficiente, impostaSostitutiva: profile.impostaSostitutiva,
    contribFissi: official.contribFissi, minimaleInps: official.minimaleInps, aliqContributi: official.aliqContributi,
    riduzione35: profile.riduzione35, limiteForfettario: profile.limiteForfettario, regime: 'forfettario',
    haRedditoDipendente: 0,
    inpsMode: profile.inpsMode,
    inpsCategoria: official.category,
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
    scadenziarioDirittoCamerale: '',
    scadenziarioBolloPrecedenteQ4: '',
    scadenziarioBolloCorrente123: '',
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
    settDipendenteIncome: 'haRedditoDipendente'
  };
  for (const [id, key] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.value = s[key];
  }
  const speseBtn = document.querySelector('[data-tab="spese"]');
  if (speseBtn) speseBtn.style.display = s.regime === 'ordinario' ? '' : 'none';
  if (typeof updateNavLabels === 'function') updateNavLabels();
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

function saveYearSetting(year, key, val) {
  const yearData = getYearDataFor(year) || ensureDataShape({}, year);
  yearData.settings[key] = parseFloat(val) || 0;
  saveYearData(year, yearData);
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
function getFattureFromYearData(yearData, month) {
  const arr = yearData && yearData.fatture ? yearData.fatture[month] : null;
  if (!arr || !Array.isArray(arr) || arr.length === 0) return [];
  return arr.map(f => ({
    importo: parseFloat(f.importo) || 0,
    pagMese: f.pagMese || null,
    pagAnno: f.pagAnno || null,
    desc: f.desc || ''
  }));
}

function getFatture(month) {
  return getFattureFromYearData(data, month);
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
  const results = [];
  for (const sourceYear of getStoredYears(year - 1)) {
    if (sourceYear >= year) continue;
    const sourceData = loadYearData(sourceYear);
    if (!sourceData || !sourceData.fatture) continue;
    for (let m = 1; m <= 12; m++) {
      for (const f of getFattureFromYearData(sourceData, m)) {
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
  const fatture = getFattureFromYearData(yearData, month);
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

function getTotalAnnuoForYear(year, options) {
  const yearData = getYearDataFor(year);
  if (!yearData) return 0;

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
  const size = 180, cx = 90, cy = 90, r = 70, sw = 28, C = 2*Math.PI*r;
  const pN = netto/total, pT = tasse/total, pC = contributi/total;
  const arc = (off, len, col) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}"
    stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += arc(0, pN*C, '#4ecca3') + arc(pN*C, pT*C, '#e94560') + arc((pN+pT)*C, pC*C, '#f5a623');
  svg += `<text x="${cx}" y="${cy-6}" text-anchor="middle" fill="#eee" font-size="14" font-weight="700">${fmtPct(pN)}</text>`;
  svg += `<text x="${cx}" y="${cy+10}" text-anchor="middle" fill="#aaa" font-size="9">netto</text></svg>`;
  const tasseLabel = S().regime === 'ordinario' ? 'IRPEF' : 'Imposta sost.';
  const contribLabel = getContribLabel(getInpsMode(S()));
  return `<div class="chart-container">${svg}<div class="chart-legend">
    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#4ecca3"></div><span>Netto</span><span class="chart-legend-val" style="color:#4ecca3">${fmt(netto)}</span></div>
    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#e94560"></div><span>${tasseLabel}</span><span class="chart-legend-val" style="color:#e94560">${fmt(tasse)}</span></div>
    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#f5a623"></div><span>${contribLabel}</span><span class="chart-legend-val" style="color:#f5a623">${fmt(contributi)}</span></div>
    <div class="chart-legend-item" style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1)">
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

function startProfileFiscalEdit() {
  profileFiscalState.editing = true;
  profileFiscalState.draft = { ...getProfileFiscalData() };
  renderProfiloFiscale();
}

function cancelProfileFiscalEdit() {
  profileFiscalState.editing = false;
  profileFiscalState.draft = { ...getProfileFiscalData() };
  renderProfiloFiscale();
}

function updateProfileFiscalDraftField(key, value) {
  if (!profileFiscalState.draft) profileFiscalState.draft = { ...getProfileFiscalData() };
  const draft = profileFiscalState.draft;
  if (['coefficiente', 'impostaSostitutiva', 'limiteForfettario'].includes(key)) {
    draft[key] = value;
  } else if (['usaInpsUfficiale', 'riduzione35', 'agevolazioneStartUp', 'primoAnnoAgevolato'].includes(key)) {
    draft[key] = parseInt(value, 10) === 1 ? 1 : 0;
  } else {
    draft[key] = value;
  }
}

function saveProfileFiscalDraft() {
  const current = getProfileFiscalData();
  const draft = { ...current, ...(profileFiscalState.draft || {}) };
  const normalized = normalizeProfileFiscalData(draft, currentProfile);
  saveProfileFiscalData(normalized);
  syncProfileFiscalToStoredYears();
  profileFiscalState.editing = false;
  applySettings();
  recalcAll();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getProfileFieldCopyText(value, options) {
  const opts = options || {};
  const candidate = opts.copyValue !== undefined ? opts.copyValue : value;
  if (candidate === undefined || candidate === null) return '';
  const text = String(candidate).trim();
  return text === '-' ? '' : text;
}

function showProfileCopyToast(message, tone = 'success') {
  const toast = document.getElementById('profileCopyToast');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add('show');
  if (profileCopyToastTimer) clearTimeout(profileCopyToastTimer);
  profileCopyToastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

async function copyTextToClipboard(text) {
  if (!text) throw new Error('Nothing to copy');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'absolute';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('Clipboard unavailable');
}

async function copyProfileFieldValue(label, value) {
  const text = String(value || '').trim();
  if (!text) return;
  try {
    await copyTextToClipboard(text);
    showProfileCopyToast(`${label} copiato negli appunti.`);
  } catch (err) {
    showProfileCopyToast(`Non sono riuscito a copiare ${label.toLowerCase()}.`, 'error');
  }
}

function buildProfileFiscalClipboardText() {
  const profile = getProfileFiscalData();
  const lines = [
    `Nome e cognome: ${profile.nome || currentProfile}`,
    `Codice fiscale: ${profile.codiceFiscale || '-'}`,
    `Partita IVA: ${profile.partitaIva || '-'}`
  ];
  return lines.join('\n');
}

async function copyProfileFiscalSummary() {
  try {
    await copyTextToClipboard(buildProfileFiscalClipboardText());
    showProfileCopyToast('Dati essenziali copiati negli appunti.');
  } catch (err) {
    showProfileCopyToast('Non sono riuscito a copiare il profilo fiscale.', 'error');
  }
}

function renderProfileField(label, value, options) {
  const opts = options || {};
  const mode = opts.mode || 'text';
  const key = opts.key || '';
  const info = opts.info ? ` ${helpPill(opts.info)}` : '';
  const draft = profileFiscalState.draft || getProfileFiscalData();
  if (!profileFiscalState.editing || !opts.editable) {
    return `<div class="profile-field">
      <label>${label}${info}</label>
      <div class="profile-value${opts.calcParam ? ' calc-param' : ''}">${value || '—'}</div>
    </div>`;
  }

  let input = '';
  if (mode === 'select') {
    input = `<select onchange="updateProfileFiscalDraftField('${key}', this.value)">
      ${(opts.options || []).map(option => `<option value="${option.value}" ${String(draft[key]) === String(option.value) ? 'selected' : ''}>${option.label}</option>`).join('')}
    </select>`;
  } else if (mode === 'textarea') {
    input = `<textarea onchange="updateProfileFiscalDraftField('${key}', this.value)">${draft[key] || ''}</textarea>`;
  } else {
    const step = opts.step ? ` step="${opts.step}"` : '';
    const min = opts.min !== undefined ? ` min="${opts.min}"` : '';
    const max = opts.max !== undefined ? ` max="${opts.max}"` : '';
    const type = opts.inputType || 'text';
    input = `<input type="${type}" value="${draft[key] ?? ''}"${step}${min}${max} onchange="updateProfileFiscalDraftField('${key}', this.value)">`;
  }
  return `<div class="profile-field editing">
    <label>${label}${info}</label>
    ${input}
  </div>`;
}

function renderProfiloFiscale() {
  const el = document.getElementById('profiloGrid');
  if (!el) return;
  const profile = getProfileFiscalData();
  const history = getProfileRegimeHistory();
  const currentSettings = S();
  const currentResolved = getResolvedInpsSettings(currentSettings, currentYear);
  const external = getExternalFiscalData();
  const official2025 = external && external.summaries ? external.summaries.summary2025 : null;
  let h = '';

  h += `<div class="panel profile-panel"><h3>Profilo fiscale</h3>`;
  h += `<div class="profile-toolbar">
    <div class="profile-toolbar-copy">Single source of truth dei parametri fiscali del profilo ${currentProfile}.</div>
    <div class="profile-toolbar-actions">
      ${profileFiscalState.editing
        ? `<button class="btn-add" onclick="saveProfileFiscalDraft()" style="margin-top:0">Salva</button>
           <button class="btn-add profile-secondary-btn" onclick="cancelProfileFiscalEdit()" style="margin-top:0">Annulla</button>`
        : `<button class="btn-add" onclick="startProfileFiscalEdit()" style="margin-top:0">Modifica</button>`}
    </div>
  </div>`;
  h += `<div class="profile-grid">`;
  h += renderProfileField('Nome / denominazione', profile.nome, { key: 'nome', editable: true });
  h += renderProfileField('Codice fiscale', profile.codiceFiscale, { key: 'codiceFiscale', editable: true });
  h += renderProfileField('Partita IVA', profile.partitaIva, { key: 'partitaIva', editable: true });
  h += renderProfileField('Codice ATECO', profile.ateco, { key: 'ateco', editable: true, calcParam: true, info: 'Determina il coefficiente di redditivita e aiuta a documentare il profilo.' });
  h += renderProfileField('Descrizione ATECO', profile.atecoDescrizione, { key: 'atecoDescrizione', editable: true });
  h += renderProfileField('Coefficiente redditivita (%)', `${fmtPct(profile.coefficiente / 100)}`, {
    key: 'coefficiente',
    editable: true,
    mode: 'number',
    inputType: 'number',
    min: 0,
    max: 100,
    step: '0.01',
    calcParam: true,
    info: 'Modifica la base imponibile forfettaria: reddito lordo = incassato x coefficiente.'
  });
  h += renderProfileField('Aliquota imposta sostitutiva (%)', `${fmtPct(profile.impostaSostitutiva / 100)}`, {
    key: 'impostaSostitutiva',
    editable: true,
    mode: 'number',
    inputType: 'number',
    min: 0,
    max: 100,
    step: '0.01',
    calcParam: true,
    info: 'Aliquota della sostitutiva applicata all imponibile fiscale forfettario.'
  });
  h += renderProfileField('Gestione previdenziale', getInpsModeLabel(profile.inpsMode), {
    key: 'inpsMode',
    editable: true,
    mode: 'select',
    calcParam: true,
    info: 'Cambia il modo in cui il motore calcola contributi fissi e variabili.',
    options: [
      { value: 'artigiani_commercianti', label: 'Artigiani / Commercianti' },
      { value: 'gestione_separata', label: 'Gestione Separata' }
    ]
  });
  h += renderProfileField('Categoria INPS', getInpsCategoryLabel(profile.inpsCategoria), {
    key: 'inpsCategoria',
    editable: true,
    mode: 'select',
    calcParam: true,
    info: 'Per artigiani/commercianti puo cambiare il fisso annuo e l aliquota ufficiale.',
    options: [
      { value: 'artigiano', label: 'Artigiano' },
      { value: 'commerciante', label: 'Commerciante' }
    ]
  });
  h += renderProfileField('Parametri INPS', profile.usaInpsUfficiale === 1 ? 'Ufficiali per anno' : 'Manuali', {
    key: 'usaInpsUfficiale',
    editable: true,
    mode: 'select',
    calcParam: true,
    info: 'Se attivo, minimale, fissi e aliquota vengono precompilati con i valori ufficiali dell anno selezionato.',
    options: [
      { value: '1', label: 'Usa parametri ufficiali' },
      { value: '0', label: 'Mantieni inserimento manuale' }
    ]
  });
  h += renderProfileField('Riduzione contributiva 35%', profile.riduzione35 === 1 ? 'Attiva' : 'Non attiva', {
    key: 'riduzione35',
    editable: true,
    mode: 'select',
    calcParam: true,
    info: 'Riduce la quota contributiva artigiani/commercianti e quindi impatta sia contributi sia imponibile fiscale.',
    options: [
      { value: '0', label: 'No' },
      { value: '1', label: 'Si' }
    ]
  });
  h += renderProfileField('Limite forfettario', fmt(profile.limiteForfettario), {
    key: 'limiteForfettario',
    editable: true,
    mode: 'number',
    inputType: 'number',
    min: 0,
    step: '0.01',
    calcParam: true,
    info: 'Parametro informativo usato per warning e controlli di superamento regime.'
  });
  h += renderProfileField('Agevolazione start-up', profile.agevolazioneStartUp === 1 ? 'Attiva' : 'Non attiva', {
    key: 'agevolazioneStartUp',
    editable: true,
    mode: 'select',
    info: 'Campo informativo per futuri scenari con aliquota agevolata.',
    options: [
      { value: '0', label: 'No' },
      { value: '1', label: 'Si' }
    ]
  });
  h += renderProfileField('Primo anno agevolato', profile.primoAnnoAgevolato === 1 ? 'Si' : 'No', {
    key: 'primoAnnoAgevolato',
    editable: true,
    mode: 'select',
    info: 'Serve a spiegare i warning del primo ciclo completo saldo + acconti.',
    options: [
      { value: '0', label: 'No' },
      { value: '1', label: 'Si' }
    ]
  });
  h += renderProfileField('Note profilo', profile.note || '—', {
    key: 'note',
    editable: true,
    mode: 'textarea'
  });
  h += `</div></div>`;

  h += `<div class="panel profile-panel"><h3>Storico sintetico</h3>`;
  h += row('Regime corrente', currentSettings.regime === 'forfettario' ? 'Forfettario' : 'Ordinario', 'highlight');
  h += row('Anno visualizzato', currentYear);
  h += row('Parametri INPS applicati', currentSettings.usaInpsUfficiale == 1 ? `Ufficiali ${currentResolved._officialInpsYear || currentYear}` : 'Manuali');
  h += row('Minimale INPS anno selezionato', fmt(currentResolved.minimaleInps || 0));
  h += row('Contributi fissi anno selezionato', fmt(currentResolved.contribFissi || 0));
  h += row('Aliquota contributiva anno selezionato', `${(parseFloat(currentResolved.aliqContributi) || 0).toFixed(2)}%`);
  if (official2025 && official2025.revenueTotal) {
    const local2025 = getTotalAnnuoForYear(2025, { includeEstimates: false });
    const delta2025 = ceil2(local2025 - official2025.revenueTotal);
    h += row('Ricavi 2025 da bilancino', fmt(official2025.revenueTotal), 'highlight');
    h += row('Ricavi 2025 presenti nell app', fmt(local2025), '', delta2025 === 0 ? 'positive' : 'negative');
    if (Math.abs(delta2025) >= 0.01) {
      h += `<div class="scad-note-list" style="margin-top:10px"><div class="scad-note">Il bilancino 2025 del commercialista riporta ${fmt(official2025.revenueTotal)} mentre i dati fatture presenti in app sommano ${fmt(local2025)}. Finche non li riallineiamo, i confronti 2025 vs Fiscozen restano indicativi.</div></div>`;
    }
  }
  h += `<div class="profile-history-list">`;
  for (const item of history) {
    h += `<div class="profile-history-item">
      <div><b>${item.year}</b> - ${item.regime === 'forfettario' ? 'Forfettario' : 'Ordinario'}</div>
      <div>${item.employeeIncome ? 'Anno misto con reddito dipendente.' : 'Nessun reddito dipendente segnalato.'}</div>
    </div>`;
  }
  h += `</div></div>`;

  el.innerHTML = h;
}

function renderProfileField(label, value, options) {
  const opts = options || {};
  const mode = opts.mode || 'text';
  const key = opts.key || '';
  const info = opts.info ? ` ${helpPill(opts.info)}` : '';
  const draft = profileFiscalState.draft || getProfileFiscalData();
  const displayValue = value !== undefined && value !== null && String(value) !== '' ? value : '-';
  const escapedLabel = escapeHtml(label);
  const escapedDisplayValue = escapeHtml(displayValue);
  const classes = ['profile-field'];
  if (opts.calcParam) classes.push('calc-param-card');
  if (opts.full) classes.push('profile-field-full');
  if (opts.compact) classes.push('profile-field-compact');
  if (profileFiscalState.editing && opts.editable) classes.push('editing');
  const meta = opts.meta ? opts.meta : (opts.calcParam ? 'Parametro di calcolo' : '');
  const copyText = getProfileFieldCopyText(displayValue, opts);
  const readonlyCopyMeta = copyText ? [meta, 'Clicca per copiare'].filter(Boolean).join(' | ') : meta;
  if (!profileFiscalState.editing || !opts.editable) {
    if (copyText) {
      return `<button type="button" class="${classes.join(' ')} profile-copy-field" data-copy-label="${escapedLabel}" data-copy-value="${encodeURIComponent(copyText)}" onclick="copyProfileFieldValue(this.dataset.copyLabel, decodeURIComponent(this.dataset.copyValue))" title="Copia ${escapedLabel}">
        <div class="profile-field-head">
          <label>${label}${info}</label>
          <span class="profile-copy-pill">Copia</span>
        </div>
        <div class="profile-value${opts.calcParam ? ' calc-param' : ''}">${escapedDisplayValue}</div>
        ${readonlyCopyMeta ? `<div class="profile-field-meta">${escapeHtml(readonlyCopyMeta)}</div>` : ''}
      </button>`;
    }
    return `<div class="${classes.join(' ')}">
      <label>${label}${info}</label>
      <div class="profile-value${opts.calcParam ? ' calc-param' : ''}">${escapedDisplayValue}</div>
      ${meta ? `<div class="profile-field-meta">${escapeHtml(meta)}</div>` : ''}
    </div>`;
  }

  let input = '';
  if (mode === 'select') {
    input = `<select onchange="updateProfileFiscalDraftField('${key}', this.value)">
      ${(opts.options || []).map(option => `<option value="${option.value}" ${String(draft[key]) === String(option.value) ? 'selected' : ''}>${option.label}</option>`).join('')}
    </select>`;
  } else if (mode === 'textarea') {
    input = `<textarea onchange="updateProfileFiscalDraftField('${key}', this.value)">${draft[key] || ''}</textarea>`;
  } else {
    const step = opts.step ? ` step="${opts.step}"` : '';
    const min = opts.min !== undefined ? ` min="${opts.min}"` : '';
    const max = opts.max !== undefined ? ` max="${opts.max}"` : '';
    const type = opts.inputType || 'text';
    input = `<input type="${type}" value="${draft[key] ?? ''}"${step}${min}${max} onchange="updateProfileFiscalDraftField('${key}', this.value)">`;
  }
  return `<div class="${classes.join(' ')}">
    <label>${label}${info}</label>
    ${input}
    ${meta ? `<div class="profile-field-meta">${meta}</div>` : ''}
  </div>`;
}

function renderProfileHeroStat(label, value, tone) {
  return `<div class="profile-hero-stat ${tone || ''}">
    <span>${label}</span>
    <strong>${value}</strong>
  </div>`;
}

function renderProfileMetaPill(label, value) {
  return `<div class="profile-meta-pill">
    <span>${label}</span>
    <strong>${value}</strong>
  </div>`;
}

function renderProfileSection(title, description, body, extraClass) {
  return `<section class="profile-section ${extraClass || ''}">
    <div class="profile-section-head">
      <h3>${title}</h3>
      ${description ? `<p>${description}</p>` : ''}
    </div>
    ${body}
  </section>`;
}

function openProfileFiscalModal() {
  if (!currentProfile) return;
  renderProfiloFiscale();
  const modal = document.getElementById('profileFiscalModal');
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('profile-modal-open');
}

function closeProfileFiscalModal() {
  const modal = document.getElementById('profileFiscalModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('profile-modal-open');
}

window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const modal = document.getElementById('profileFiscalModal');
  if (modal && modal.classList.contains('open')) closeProfileFiscalModal();
});

function renderProfiloFiscale() {
  const el = document.getElementById('profileFiscalContent');
  if (!el) return;
  updateProfileBadge();
  const profile = getProfileFiscalData();
  const history = getProfileRegimeHistory();
  const currentSettings = S();
  const currentResolved = getResolvedInpsSettings(currentSettings, currentYear);
  const external = getExternalFiscalData();
  const official2025 = external && external.summaries ? external.summaries.summary2025 : null;
  const currentRegimeLabel = currentSettings.regime === 'forfettario' ? 'Forfettario' : 'Ordinario';
  const local2025 = official2025 && official2025.revenueTotal ? getTotalAnnuoForYear(2025, { includeEstimates: false }) : 0;
  const delta2025 = official2025 && official2025.revenueTotal ? ceil2(local2025 - official2025.revenueTotal) : 0;
  let h = '';

  h += `<div class="profile-sheet">`;
  h += `<div class="profile-sheet-header">
    <div class="profile-sheet-copy">
      <div class="profile-sheet-kicker">Profilo fiscale</div>
      <h2 id="profileFiscalTitle">${profile.nome || currentProfile}</h2>
      <p>Qui tieni i parametri stabili del profilo. Quando salvi, i valori aggiornano calcolo, scadenziario, accantonamento e tutte le viste dell'app. In sola lettura puoi cliccare ogni campo per copiarlo al volo.</p>
    </div>
    <div class="profile-sheet-actions">
      ${profileFiscalState.editing
        ? `<button class="btn-add" onclick="saveProfileFiscalDraft()" style="margin-top:0">Salva</button>
           <button class="btn-add profile-secondary-btn" onclick="cancelProfileFiscalEdit()" style="margin-top:0">Annulla</button>`
        : `<button class="btn-add profile-copy-btn" onclick="copyProfileFiscalSummary()" style="margin-top:0">Copia dati</button>
           <button class="btn-add" onclick="startProfileFiscalEdit()" style="margin-top:0">Modifica</button>`}
      <button class="profile-close-btn" type="button" onclick="closeProfileFiscalModal()" aria-label="Chiudi profilo fiscale">&times;</button>
    </div>
  </div>`;

  if (profileFiscalState.editing) {
    h += `<div class="profile-edit-banner">Stai modificando la source of truth del profilo. I campi marcati come parametri di calcolo aggiornano formule e scadenze quando salvi.</div>`;
  }
  h += `<div id="profileCopyToast" class="profile-copy-toast" aria-live="polite"></div>`;

  h += `<div class="profile-meta-strip">`;
  h += renderProfileMetaPill('Account', currentProfile);
  h += renderProfileMetaPill('Regime in vista', currentRegimeLabel);
  h += renderProfileMetaPill('ATECO', profile.ateco || '-');
  h += renderProfileMetaPill('Previdenza', getInpsModeLabel(profile.inpsMode));
  h += `</div>`;

  h += `<div class="profile-hero-stats">`;
  h += renderProfileHeroStat('Coefficiente', fmtPct(profile.coefficiente / 100), 'accent');
  h += renderProfileHeroStat('Imposta sostitutiva', fmtPct(profile.impostaSostitutiva / 100), 'accent');
  h += renderProfileHeroStat('Categoria INPS', getInpsCategoryLabel(profile.inpsCategoria));
  h += renderProfileHeroStat('Limite forfettario', fmt(profile.limiteForfettario));
  h += `</div>`;

  h += `<div class="profile-layout">`;
  h += `<div class="profile-main-column">`;
  h += renderProfileSection(
    'Identita fiscale',
    'Dati anagrafici e di inquadramento che descrivono il profilo.',
    `<div class="profile-field-grid">
      ${renderProfileField('Nome / denominazione', profile.nome, { key: 'nome', editable: true })}
      ${renderProfileField('Codice fiscale', profile.codiceFiscale, { key: 'codiceFiscale', editable: true })}
      ${renderProfileField('Partita IVA', profile.partitaIva, { key: 'partitaIva', editable: true })}
      ${renderProfileField('Codice ATECO', profile.ateco, { key: 'ateco', editable: true, calcParam: true, info: 'Determina il coefficiente di redditivita e aiuta a documentare il profilo.' })}
      ${renderProfileField('Descrizione ATECO', profile.atecoDescrizione, { key: 'atecoDescrizione', editable: true, full: true })}
      ${renderProfileField('Note profilo', profile.note || '-', { key: 'note', editable: true, mode: 'textarea', full: true })}
    </div>`
  );
  h += renderProfileSection(
    'Parametri di calcolo',
    'Questi campi guidano il motore fiscale per tutti gli anni del profilo. Se salvi, l app si riallinea subito.',
    `<div class="profile-section-banner">I campi marcati come parametri di calcolo cambiano direttamente imponibile, contributi, scadenziario e percentuali mostrate nell app.</div>
    <div class="profile-field-grid">
      ${renderProfileField('Coefficiente redditivita (%)', `${fmtPct(profile.coefficiente / 100)}`, {
        key: 'coefficiente',
        editable: true,
        mode: 'number',
        inputType: 'number',
        min: 0,
        max: 100,
        step: '0.01',
        calcParam: true,
        info: 'Modifica la base imponibile forfettaria: reddito lordo = incassato x coefficiente.'
      })}
      ${renderProfileField('Aliquota imposta sostitutiva (%)', `${fmtPct(profile.impostaSostitutiva / 100)}`, {
        key: 'impostaSostitutiva',
        editable: true,
        mode: 'number',
        inputType: 'number',
        min: 0,
        max: 100,
        step: '0.01',
        calcParam: true,
        info: 'Aliquota della sostitutiva applicata all imponibile fiscale forfettario.'
      })}
      ${renderProfileField('Gestione previdenziale', getInpsModeLabel(profile.inpsMode), {
        key: 'inpsMode',
        editable: true,
        mode: 'select',
        calcParam: true,
        info: 'Cambia il modo in cui il motore calcola contributi fissi e variabili.',
        options: [
          { value: 'artigiani_commercianti', label: 'Artigiani / Commercianti' },
          { value: 'gestione_separata', label: 'Gestione Separata' }
        ]
      })}
      ${renderProfileField('Categoria INPS', getInpsCategoryLabel(profile.inpsCategoria), {
        key: 'inpsCategoria',
        editable: true,
        mode: 'select',
        calcParam: true,
        info: 'Per artigiani/commercianti puo cambiare il fisso annuo e l aliquota ufficiale.',
        options: [
          { value: 'artigiano', label: 'Artigiano' },
          { value: 'commerciante', label: 'Commerciante' }
        ]
      })}
      ${renderProfileField('Parametri INPS', profile.usaInpsUfficiale === 1 ? 'Ufficiali per anno' : 'Manuali', {
        key: 'usaInpsUfficiale',
        editable: true,
        mode: 'select',
        calcParam: true,
        info: 'Se attivo, minimale, fissi e aliquota vengono precompilati con i valori ufficiali dell anno selezionato.',
        options: [
          { value: '1', label: 'Usa parametri ufficiali' },
          { value: '0', label: 'Mantieni inserimento manuale' }
        ]
      })}
      ${renderProfileField('Riduzione contributiva 35%', profile.riduzione35 === 1 ? 'Attiva' : 'Non attiva', {
        key: 'riduzione35',
        editable: true,
        mode: 'select',
        calcParam: true,
        info: 'Riduce la quota contributiva artigiani/commercianti e quindi impatta sia contributi sia imponibile fiscale.',
        options: [
          { value: '0', label: 'No' },
          { value: '1', label: 'Si' }
        ]
      })}
      ${renderProfileField('Limite forfettario', fmt(profile.limiteForfettario), {
        key: 'limiteForfettario',
        editable: true,
        mode: 'number',
        inputType: 'number',
        min: 0,
        step: '0.01',
        calcParam: true,
        info: 'Parametro informativo usato per warning e controlli di superamento regime.'
      })}
      ${renderProfileField('Agevolazione start-up', profile.agevolazioneStartUp === 1 ? 'Attiva' : 'Non attiva', {
        key: 'agevolazioneStartUp',
        editable: true,
        mode: 'select',
        info: 'Campo informativo per futuri scenari con aliquota agevolata.',
        options: [
          { value: '0', label: 'No' },
          { value: '1', label: 'Si' }
        ]
      })}
      ${renderProfileField('Primo anno agevolato', profile.primoAnnoAgevolato === 1 ? 'Si' : 'No', {
        key: 'primoAnnoAgevolato',
        editable: true,
        mode: 'select',
        info: 'Serve a spiegare i warning del primo ciclo completo saldo + acconti.',
        options: [
          { value: '0', label: 'No' },
          { value: '1', label: 'Si' }
        ]
      })}
    </div>`
  );
  h += `</div>`;

  h += `<aside class="profile-side-column">`;
  h += renderProfileSection(
    `Anno ${currentYear} in vista`,
    'Questa colonna ti dice quali valori del profilo stanno guidando i calcoli dell anno selezionato.',
    `<div class="profile-readout">
      ${row('Regime corrente', currentRegimeLabel, 'highlight')}
      ${row('Anno visualizzato', currentYear)}
      ${row('Parametri INPS applicati', currentSettings.usaInpsUfficiale == 1 ? `Ufficiali ${currentResolved._officialInpsYear || currentYear}` : 'Manuali')}
      ${row('Minimale INPS anno selezionato', fmt(currentResolved.minimaleInps || 0))}
      ${row('Contributi fissi anno selezionato', fmt(currentResolved.contribFissi || 0))}
      ${row('Aliquota contributiva anno selezionato', `${(parseFloat(currentResolved.aliqContributi) || 0).toFixed(2)}%`)}
    </div>`,
    'profile-section-rail'
  );

  if (official2025 && official2025.revenueTotal) {
    h += renderProfileSection(
      'Dati ufficiali e confronto',
      'Confronto rapido tra i dati importati dal commercialista / Fiscozen e quanto e presente oggi nell app.',
      `<div class="profile-compare-grid">
        ${renderProfileHeroStat('Ricavi 2025 da bilancino', fmt(official2025.revenueTotal), 'neutral')}
        ${renderProfileHeroStat('Ricavi 2025 presenti in app', fmt(local2025), Math.abs(delta2025) < 0.01 ? 'positive' : 'warning')}
        ${renderProfileHeroStat('Delta attuale', fmt(delta2025), Math.abs(delta2025) < 0.01 ? 'positive' : 'warning')}
      </div>
      <div class="scad-note-list" style="margin-top:12px">
        <div class="scad-note">${Math.abs(delta2025) < 0.01
          ? 'I ricavi 2025 presenti nell app sono allineati al bilancino importato.'
          : `Il bilancino 2025 del commercialista riporta ${fmt(official2025.revenueTotal)} mentre i dati fatture presenti in app sommano ${fmt(local2025)}. Finche non li riallineiamo, i confronti 2025 vs Fiscozen restano indicativi.`}</div>
      </div>`,
      'profile-section-rail'
    );
  } else {
    h += renderProfileSection(
      'Dati ufficiali e confronto',
      'Quando sono disponibili bilancino o dati Fiscozen importati, li vedi qui come riferimento rapido.',
      `<div class="scad-note-list"><div class="scad-note">Nessun prospetto esterno importato per questo profilo. Il pannello si aggiorna automaticamente quando carichi dati Fiscozen o bilancini locali.</div></div>`,
      'profile-section-rail'
    );
  }

  h += `<section class="profile-section profile-section-rail">
    <div class="profile-section-head">
      <h3>Storico sintetico</h3>
      <p>Panoramica rapida dei regimi usati negli anni salvati per questo profilo.</p>
    </div>
    <div class="profile-history-list">`;
  for (const item of history) {
    h += `<div class="profile-history-item">
      <div><b>${item.year}</b> - ${item.regime === 'forfettario' ? 'Forfettario' : 'Ordinario'}</div>
      <div>${item.employeeIncome ? 'Anno misto con reddito dipendente.' : 'Nessun reddito dipendente segnalato.'}</div>
    </div>`;
  }
  h += `</div></section>`;
  h += `</aside>`;
  h += `</div>`;
  h += `</div>`;

  el.innerHTML = h;
}

function renderCalcoloForfettario(h, el) {
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

  h += `<div class="panel" style="grid-column:1/-1"><h3>Ripartizione del Lordo${c.useRiduzione ? ' (riduzione 35%)' : ''}</h3>`;
  h += drawDonut(netto, tasse, contrib);
  h += `</div>`;

  h += `<div class="panel"><h3>Riepilogo Annuale</h3>`;
  h += row('Giorni lavorati', getTotalWorkedDays());
  h += row('Paga giornaliera', fmt(s.dailyRate));
  h += row('Gestione INPS', getInpsModeLabel(c.inpsMode));
  h += row('Totale annuo lordo', fmt(c.totale), 'highlight');
  if (crossYear.length > 0) {
    const crossTot = crossYear.reduce((s, i) => s + i.importo, 0);
    h += `<div style="font-size:.78rem;color:var(--yellow);margin:6px 0">Include ${fmt(crossTot)} da fatture di anni precedenti incassate nel ${currentYear}</div>`;
  }
  h += '<br>';
  h += row(`Imposta sostitutiva (${s.impostaSostitutiva}% su imponibile fiscale)`, fmt(tasse), '', 'negative');
  h += row(contribLabel, fmt(contrib), '', 'negative');
  h += '<br>';
  h += row('Netto annuo', fmt(netto), 'highlight', 'positive');
  h += row('Netto mensile', fmt(netto / 12), '', 'positive');
  h += `<br><div style="font-size:.82rem;color:var(--text2)">% effettiva su base competenza: <b style="color:var(--accent)">${fmtPct(perc)}</b> &mdash; Netto/giorno: <b style="color:var(--green)">${fmt(s.dailyRate*(1-perc))}</b></div></div>`;

  h += `<div class="panel"><h3>Due Prospettive di Costo</h3>`;
  h += row('Tasse+contributi su base competenza', fmt(tasse + contrib), 'highlight', 'negative');
  h += row('Percentuale su base competenza', fmtPct(perc));
  if (cashPerspective) {
    h += row(`Tasse+contributi su base cassa ${currentYear}-${currentYear + 1}`, fmt(cashPerspective.totalDue), '', 'negative');
    h += row(`Percentuale su base cassa ${currentYear}-${currentYear + 1}`, fmtPct(cashPerspective.effectiveRate));
    h += `<div class="scad-note-list" style="margin-top:10px">
      <div class="scad-note">La vista di competenza guarda al dovuto fiscale del ${currentYear}. La vista di cassa somma le uscite reali del ciclo ${currentYear}-${currentYear + 1} (saldo + acconti + rate fisse collegate a quell anno).</div>
    </div>`;
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
    h += ` Metodo attivo: <b>${comparison.selectedMethod === 'previsionale' ? 'Previsionale' : 'Storico'}</b>.</div>`;
    if (Math.abs(c.deductibleContributionsPaid - contrib) >= 0.01) {
      h += `<div style="font-size:.78rem;color:var(--yellow);line-height:1.5;margin-top:8px">`;
      h += `Per spiegare storico e previsionale mostro anche i contributi INPS deducibili pagati o pianificati nell'anno (${fmt(c.deductibleContributionsPaid)}). La percentuale effettiva principale resta pero calcolata su base competenza, in modo coerente tra anni aperti e anni chiusi.`;
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
  h += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)">`;
  h += `<div style="font-size:.85rem;color:var(--accent);font-weight:600;margin-bottom:8px">${contribLabel} (sul ${s.coefficiente}%)</div>`;
  if (c.useRiduzione) h += `<div style="font-size:.78rem;color:var(--yellow);margin-bottom:6px">Riduzione 35% attiva</div>`;
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
  const labels = getIrpefBracketLabelsForYear(currentYear);
  const crossYear = getCrossYearInvoices();
  const contribLabel = getContribLabel(c.inpsMode);
  const speseStoriche = calcSpeseCarryoverTotalForYear(currentYear);

  h += `<div class="panel" style="grid-column:1/-1"><h3>${c.spese > 0 ? "Ripartizione dell'Imponibile (Ordinario)" : 'Ripartizione del Lordo (Ordinario)'}</h3>`;
  h += drawDonut(c.netto, c.con.tasse, c.cT, c.spese > 0 ? 'Imponibile' : 'Totale lordo');
  h += `</div>`;

  h += `<div class="panel"><h3>Riepilogo Annuale</h3>`;
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
  h += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)">`;
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
    for (const f of getFattureFromYearData(yearData, m)) {
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

function getPaymentForScheduleKey(scheduleKey) {
  if (!scheduleKey) return null;
  for (const p of getPagamentiAcrossYears()) {
    if (p.scheduleKey === scheduleKey) return p;
  }
  return null;
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

function promptSchedulePaymentAmount(title, competence, fallbackAmount) {
  const defaultValue = ceil2(fallbackAmount || 0).toFixed(2);
  const input = prompt(`Importo pagato per "${title} - ${competence}":`, defaultValue);
  if (input === null) return null;
  const parsed = parseFloat(String(input).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return ceil2(parsed);
}

function addPagamentoFromSchedule(scheduleKey, dueDate, kind, title, competence, amount) {
  const parsed = promptSchedulePaymentAmount(title, competence, amount);
  if (!parsed) return;
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

function registerPartialPayment(scheduleKey, dueDate, kind, title, competence, amount) {
  addPagamentoFromSchedule(scheduleKey, dueDate, kind, title, competence, amount);
}

function reopenPaidScheduleItem(scheduleKey) {
  removePagamentoByScheduleKey(scheduleKey);
}

function editPaidScheduleItem(year, idx, patch) {
  if (!patch || typeof patch !== 'object') return;
  if (patch.amount !== undefined) setPagamentoImporto(year, idx, patch.amount);
  if (patch.data !== undefined) setPagamentoField(year, idx, 'data', patch.data);
  if (patch.tipo !== undefined) setPagamentoField(year, idx, 'tipo', patch.tipo);
  if (patch.descrizione !== undefined) setPagamentoField(year, idx, 'descrizione', patch.descrizione);
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
    <button type="button" class="payment-date-nav" onclick="shiftPaymentDatePicker(-1)">&lsaquo;</button>
    <div class="payment-date-title">${MONTHS[state.viewMonth - 1]} ${state.viewYear}</div>
    <button type="button" class="payment-date-nav" onclick="shiftPaymentDatePicker(1)">&rsaquo;</button>
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
    <th>Fattura</th><th>Lordo</th><th>Aliq.</th><th>Da accant.</th><th>Accantonato</th>
    <th>Delta</th><th>Dovuto cum.</th><th>Accant. cum.</th><th>Delta cum.</th>
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
      <td data-label="Fattura" style="text-align:left;font-size:.82rem">${f.label}${f.isCrossYear ? ' <span style="color:var(--yellow);font-size:.7rem">(da ' + f.anno + ')</span>' : ''}</td>
      <td data-label="Lordo">${fmt(f.importo)}</td>
      <td data-label="Aliq." style="color:var(--accent);font-size:.78rem">${fmtPct(f.rate)}</td>
      <td data-label="Da accant." style="color:var(--yellow)">${fmt(dovuto)}</td>
      <td data-label="Accantonato"><input type="number" value="${messo||''}" placeholder="0" step="0.01"
        onchange="data.accantonamento['${accKey}']=ceil2(parseFloat(this.value)||0);saveData();recalcAll()"></td>
      <td data-label="Delta" class="${dm>=0?'delta-pos':'delta-neg'}">${(dm>=0?'+':'')+fmt(dm)}</td>
      <td data-label="Dovuto cum." style="color:var(--yellow)">${fmt(cD)}</td>
      <td data-label="Accant. cum.">${fmt(cM)}</td>
      <td data-label="Delta cum." class="${dc>=0?'delta-pos':'delta-neg'}" style="font-weight:600">${(dc>=0?'+':'')+fmt(dc)}</td></tr>`;
  }

  const totLordo = fatture.reduce((s, f) => s + f.importo, 0);
  const fd = ceil2(cM - cD);
  h += `</tbody><tfoot><tr><td data-label="Fattura" style="text-align:left">Totale</td><td data-label="Lordo">${fmt(totLordo)}</td><td data-label="Aliq."></td>
    <td data-label="Da accant." style="color:var(--yellow)">${fmt(cD)}</td><td data-label="Accantonato">${fmt(cM)}</td>
    <td data-label="Delta" class="${fd>=0?'delta-pos':'delta-neg'}">${(fd>=0?'+':'')+fmt(fd)}</td>
    <td data-label="Dovuto cum."></td><td data-label="Accant. cum."></td><td data-label="Delta cum."></td></tr></tfoot></table>`;

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
      h += `<text x="${W-pR+4}" y="${y+4}" fill="#aaa" font-size="8">${((mxC*(1-i/4))/1000).toFixed(0)}k</text>`;
    }
    for (let i = 0; i < n; i++) {
      const x = pL + (n > 1 ? (i/(n-1))*pW : pW/2);
      h += `<text x="${x}" y="${H-8}" fill="#aaa" font-size="8" text-anchor="middle">${MONTHS_SHORT[md[i].mese-1]}${md[i].isCrossYear?'*':''}</text>`;
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
        <button class="btn-del" title="Elimina pagamento${storicoLabel}" onclick="removePagamento(${anno}, ${idx})">&times;</button>
      </div>`;
    }
  }

  body += `<button class="btn-add" onclick="addPagamento()">+ Aggiungi pagamento</button>`;
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
    const hasFatture = getFattureFromYearData(yearData, month).some(f => f.importo > 0);
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
    const hasFatture = getFattureFromYearData(yearData, month).some(f => f.importo > 0);
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
  const manualBollo123 = getOptionalAmountSetting(scheduleSettings.scadenziarioBolloCorrente123);
  const manualBolloQ4 = getOptionalAmountSetting(scheduleSettings.scadenziarioBolloCorrenteQ4);
  const manualInailCurrent = getOptionalAmountSetting(scheduleSettings.scadenziarioInailCorrente);
  const manualInailNext = getOptionalAmountSetting(scheduleSettings.scadenziarioInailSuccessivo);
  const projectionRange = isClosedYear ? null : getForfettarioProjectionRange(year, scheduleSettings.scadenziarioRangePct);
  const prevHasEst = yearHasEstimates(year - 1);

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
    if (transitionFromNonForfettario) {
      notes.push(`Il ${year - 1} non risulta forfettario: tratto il ${year} come inizio di un nuovo ciclo forfettario e non genero acconti storici del forfettario sullo stesso anno.`);
    } else if (hasPrimoAnnoData) {
      firstYearManualUsed = true;
      notes.push(`I dati dell'anno precedente sono stati inseriti manualmente (primo utilizzo).`);
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

  const autoImpostaSaldo = prevApplied
    ? prevApplied.tasse - prevImpostaAccontiPaid
    : (firstYearManualUsed && primoAnnoImpostaPrec !== null
      ? primoAnnoImpostaPrec - (primoAnnoAccontiImpostaPrec || 0)
      : 0);
  const impostaSaldo = manualSaldoImposta !== null ? manualSaldoImposta : autoImpostaSaldo;
  if (impostaSaldo > 0) {
    pushDueRow(
      FORFETTARIO_RULES.saldoMonth,
      FORFETTARIO_RULES.saldoDay,
      'Imposta sostitutiva',
      `Saldo ${year - 1}`,
      impostaSaldo,
      'tasse',
      manualSaldoImposta !== null ? 'Importo manuale'
        : (firstYearManualUsed ? 'Manuale primo utilizzo'
          : (prevImpostaAccontiPaid > 0 ? `${year - 1} netto acconti` : `Totale ${year - 1}`)),
      '',
      { key: `imposta_saldo_${year - 1}`, certainty: manualSaldoImposta !== null ? 'fixed' : (firstYearManualUsed || prevHasEst ? 'estimated' : 'fixed'), fiscalYear: year - 1 }
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
          : (transitionFromNonForfettario ? 0 : currentApplied.tasse))));
  const impostaAcconti = buildAccontoPlan(impostaAccontiBase);
  const impostaAccCertainty = manualAccontoImposta !== null ? 'fixed'
    : (accontoMethod === 'previsionale' ? 'estimated' : (prevHasEst ? 'estimated' : 'fixed'));
  if (impostaAcconti.first > 0) {
    pushDueRow(
      FORFETTARIO_RULES.saldoMonth,
      FORFETTARIO_RULES.saldoDay,
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
      { key: `imposta_acc1_${year}`, certainty: impostaAccCertainty, fiscalYear: year }
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
      FORFETTARIO_RULES.saldoMonth,
      FORFETTARIO_RULES.saldoDay,
      prevForfettarioContribution ? prevForfettarioContribution.saldoLabel : getContribLabel(currentApplied.inpsMode),
      `Saldo ${year - 1}`,
      contribSaldo,
      'contributi',
      manualSaldoContributi !== null ? 'Importo manuale'
        : (firstYearManualUsed ? 'Manuale primo utilizzo'
          : (prevContribAccontiPaid > 0 ? `${year - 1} netto acconti` : `Totale ${year - 1}`)),
      '',
      { key: `contributi_saldo_${year - 1}`, certainty: manualSaldoContributi !== null ? 'fixed' : (firstYearManualUsed || prevHasEst ? 'estimated' : 'fixed'), fiscalYear: year - 1 }
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
          : (transitionFromNonForfettario ? 0 : (currentContribution ? currentContribution.saldoAccontoBase : 0)))));
  const contribAcconti = buildAccontoPlan(contribBase);
  const contribAccCertainty = manualAccontoContributi !== null ? 'fixed'
    : (accontoMethod === 'previsionale' ? 'estimated' : (prevHasEst ? 'estimated' : 'fixed'));
  if (contribAcconti.first > 0) {
    pushDueRow(
      FORFETTARIO_RULES.saldoMonth,
      FORFETTARIO_RULES.saldoDay,
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
      { key: `contributi_acc1_${year}`, certainty: contribAccCertainty, fiscalYear: year }
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
  if (manualBolloPrevQ4 !== null && manualBolloPrevQ4 > 0) {
    pushDueRow(2, 28, 'Imposta di bollo fatture elettroniche', `4o trimestre ${year - 1}`, manualBolloPrevQ4, 'altro', 'Importo configurato', '', { dueYear: year, key: `bollo_q4prev_${year - 1}`, certainty: 'fixed', fiscalYear: year - 1 });
  }
  if (manualBollo123 !== null && manualBollo123 > 0) {
    pushDueRow(11, 30, 'Imposta di bollo fatture elettroniche', `1o-3o trimestre ${year}`, manualBollo123, 'altro', 'Importo configurato', '', { key: `bollo_q123_${year}`, certainty: 'fixed', fiscalYear: year });
  }
  if (manualBolloQ4 !== null && manualBolloQ4 > 0) {
    pushDueRow(2, 28, 'Imposta di bollo fatture elettroniche', `4o trimestre ${year}`, manualBolloQ4, 'altro', 'Importo configurato', '', { key: `bollo_q4_${year}`, certainty: 'fixed', fiscalYear: year });
  }
  if (manualInailCurrent !== null && manualInailCurrent > 0) {
    pushDueRow(2, 16, 'Autoliquidazione INAIL', `Rif. ${year}`, manualInailCurrent, 'altro', 'Importo configurato', '', { dueYear: year, key: `inail_${year}`, certainty: 'fixed', fiscalYear: year });
  }
  if (manualInailNext !== null && manualInailNext > 0) {
    pushDueRow(2, 16, 'Autoliquidazione INAIL', `Rif. ${year + 1}`, manualInailNext, 'altro', 'Importo configurato', '', { key: `inail_${year + 1}`, certainty: 'fixed', fiscalYear: year + 1 });
  }

  if (isClosedYear) {
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
        { dueYear: year + 1, key: `imposta_saldo_${year}`, certainty: 'fixed', fiscalYear: year }
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
        { dueYear: year + 1, key: `contributi_saldo_${year}`, certainty: 'fixed', fiscalYear: year }
      );
    } else if (manualSaldoContributi === null && autoCurrentContribSaldo < 0) {
      credits.push({ title: currentContribution ? currentContribution.saldoLabel : 'Contributi', competence: `Credito da saldo ${year}`, amount: Math.abs(autoCurrentContribSaldo), fiscalYear: year });
    }
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

function buildMethodAccontiPanel(schedule, comparison) {
  const engine = getTaxEngine();
  const previousSettings = getYearDataFor(currentYear - 1);
  const transition = engine ? engine.buildTransitionDiagnostics({
    year: currentYear,
    currentSettings: S(),
    previousSettings: previousSettings ? previousSettings.settings : null
  }) : null;
  if (schedule.isClosedYear) {
    return `<div class="panel"><h3>Metodo vista ${helpPill('Negli anni gia chiusi mostro un consuntivo di competenza. Storico e previsionale si usano solo per stimare anni ancora aperti.')}</h3>
      <div class="scad-note-list">
        <div class="scad-note">Per il ${currentYear} mostro un consuntivo di competenza: saldo ${currentYear} e voci collegate che possono scadere nel ${currentYear + 1}.</div>
        ${transition && transition.isRegimeTransition ? `<div class="scad-note">Transizione ${transition.previousRegime} -> ${transition.currentRegime}: il confronto con l anno precedente va letto come storico prudenziale, non come base perfettamente rappresentativa del nuovo regime.</div>` : ''}
      </div>
    </div>`;
  }

  const transitionNotes = comparison && comparison.transition && comparison.transition.isRegimeTransition
    ? `<div class="scad-note">Primo anno forfettario dopo ${comparison.transition.previousRegime}: lo storico e prudenziale ma puo sovrastimare la liquidita da mettere da parte.</div>`
    : '';
  return `<div class="panel"><h3>Metodo acconti ${helpPill('Storico = usa il dovuto dell anno precedente. Previsionale = usa una base stimata dell anno corrente. Il previsionale e utile solo se ti aspetti un calo importante o vuoi evitare sovra-acconti.')}</h3>
    <div class="scad-note-list">
      <div class="scad-note"><b>Storico</b>: calcola gli acconti del ${currentYear} partendo dal dovuto del ${currentYear - 1}. E il metodo piu prudente.</div>
      <div class="scad-note"><b>Previsionale</b>: usa una base stimata del ${currentYear}. Ha senso solo se il reddito atteso cambia molto rispetto all anno prima.</div>
      <div class="scad-note">Nel primo ciclo completo forfettario puoi vedere saldo + acconti piu alti del previsto: non e un errore, ma l effetto del primo anno in cui si chiude l anno precedente e si anticipa il successivo.</div>
      ${transitionNotes}
    </div>
  </div>`;
}

function buildFiscozenComparisonPanel(schedule) {
  const external = getExternalFiscalData();
  const engine = getTaxEngine();
  if (!engine || !external || !external.loaded || !external.futureEntries || external.futureEntries.length === 0) return '';
  const matrix = engine.buildYearFamilyComparisonMatrix({
    paid: external.paidEntries || [],
    future: external.futureEntries || [],
    schedule: buildScheduleComparisonRows(schedule.rows),
    threshold: 50
  }).filter(item => item.year === currentYear);
  if (matrix.length === 0) return '';

  let h = `<div class="panel"><h3>Confronto Fiscozen ${helpPill('Confronto automatico tra scadenze Fiscozen, pagamenti storici importati e scadenziario dell app per l anno di pagamento selezionato.')}</h3>`;
  h += `<table class="mini-compare-table"><thead><tr><th>Voce</th><th>Pagato</th><th>Futuro</th><th>App</th><th>Delta</th></tr></thead><tbody>`;
  for (const item of matrix) {
    h += `<tr>
      <td>${item.family}</td>
      <td>${fmt(item.Fiscozen_paid)}</td>
      <td>${fmt(item.Fiscozen_future)}</td>
      <td>${fmt(item.App_schedule)}</td>
      <td class="${item.flagged ? 'delta-neg' : 'delta-pos'}">${fmt(item.Delta)}</td>
    </tr>`;
  }
  h += `</tbody></table>`;
  const flagged = matrix.filter(item => item.flagged);
  if (flagged.length > 0) {
    h += `<div class="scad-note-list" style="margin-top:10px">${flagged.map(item => `<div class="scad-note">${item.family}: ${item.comment || 'delta oltre soglia'}</div>`).join('')}</div>`;
  }
  h += `</div>`;
  return h;
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
  'scadenziarioBolloCorrente123',
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

function toggleScadenziarioEmptyYears() {
  scadenziarioUiState.showEmptyYears = !scadenziarioUiState.showEmptyYears;
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
  const scadEngine = getScadenziarioEngine();
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
  const overrideCount = getScadenziarioOverrideCount(yearData);
  const regimeGuess = getScadenziarioYearTypeFromSettings(settings);
  const regimeType = regimeGuess === 'vuoto' ? 'forfettario' : regimeGuess;
  const shouldBuildAutoSchedule = regimeType === 'forfettario'
    && (!isTrailingSettlementYear && (hasLocalYearData || realRevenue > 0 || estimatedRevenue > 0 || overrideCount > 0 || importedEntries.length > 0));
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
        importedFamilies,
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
  const hasFiscalAnchor = !!(
    invoiceCount > 0
    || realRevenue > 0
    || importedCompetenceEntries.length > 0
  );

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
  const years = new Set([...getAllStoredYears(), ...getKnownExternalFiscalYears(), currentYear]);
  let metas = Array.from(years)
    .sort((a, b) => b - a)
    .map(year => buildScadenziarioYearMeta(year));
  const anchorYears = metas
    .filter(meta => meta.hasFiscalAnchor)
    .map(meta => meta.year);
  const lastAnchorYear = anchorYears.length > 0 ? Math.max(...anchorYears) : null;
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
    .filter(meta => includeEmptyYears || meta.hasFiscalAnchor || meta.isTrailingSettlementYear)
    .filter(meta => includeHistoricalYears || meta.classification === 'forfettario' || meta.isTrailingSettlementYear);
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

function renderScadenziarioPaymentEvents(row) {
  if (!row) return '';
  const dueIso = row.dueDate || '';
  if (row.source !== 'calculated' || !row.scheduleKey) {
    if (!row.paymentEvents || row.paymentEvents.length === 0) return `<div class="scad-sub">Nessun versamento registrato.</div>`;
    return `<div class="scad-payment-history">${row.paymentEvents.map(event => `
      <div class="scad-payment-tag">
        <span>${event.paymentDate ? formatPaymentDateDisplay(event.paymentDate) : 'Storico'}</span>
        <b>${fmt(event.amount)}</b>
      </div>`).join('')}</div>`;
  }

  const residual = row.paymentStatus ? Math.max(0, row.paymentStatus.residualAmount) : row.amountDue;
  let h = `<div class="scad-row-actions">
    <button class="scad-pay-btn" onclick="addPagamentoFromSchedule('${row.scheduleKey.replace(/'/g, "\\'")}','${dueIso}','${row.kind}','${row.title.replace(/'/g, "\\'")}','${row.competenceLabel.replace(/'/g, "\\'")}',${residual || row.amountDue})">
      ${(row.paymentEvents || []).length > 0 ? 'Aggiungi quota' : 'Segna pagato'}
    </button>
    ${row.paymentEvents && row.paymentEvents.length > 0 ? `<button class="scad-link-btn" onclick="reopenPaidScheduleItem('${row.scheduleKey.replace(/'/g, "\\'")}')">Annulla tutto</button>` : ''}
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
        <button class="btn-del" title="Elimina pagamento" onclick="removePagamento(${event.anno}, ${event._idx})">&times;</button>
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
    <th>Stato</th>
    <th>Timing</th>
  </tr></thead><tbody>`;
  for (const row of rows) {
    const timing = getScadenziarioTimingChip(row);
    const explanation = getScadenziarioExplanation(row);
    const rangeHtml = row.low !== row.high ? `<div class="scad-range">(${fmt(row.low)} - ${fmt(row.high)})</div>` : '';
    const crossYearMeta = row.paymentStatus && row.paymentStatus.isCrossYear
      ? `<div class="scad-sub">Competenza ${row.competenceYear}, cassa ${row.paymentEvents.map(event => event.cashYear).filter(Boolean).join(', ')}</div>`
      : '';
    h += `<tr>
      <td data-label="Data">${row.due && row.due.label ? row.due.label : (row.dueDate ? formatPaymentDateDisplay(row.dueDate) : `Anno ${row.dueYear}`)}</td>
      <td data-label="Voce">
        <div class="scad-main">${row.title}</div>
        <div class="scad-sub">${row.competenceLabel || row.competence || `Competenza ${row.competenceYear}`}</div>
        ${explanation ? `<div class="scad-sub">${explanation}</div>` : ''}
        ${crossYearMeta}
      </td>
      <td data-label="Importo">
        <div>${fmt(row.amountDue)}</div>
        ${rangeHtml}
      </td>
      <td data-label="Versamenti">${renderScadenziarioPaymentEvents(row)}</td>
      <td data-label="Stato"><span class="scad-chip ${row.paymentStatus.tone}">${row.paymentStatus.label}</span></td>
      <td data-label="Timing"><span class="scad-chip ${timing.cls}">${timing.label}</span></td>
    </tr>`;
  }
  h += `</tbody><tfoot><tr>
    <td data-label="Data">Totale</td>
    <td data-label="Voce">${opts.totalLabel || 'Totale sezione'}</td>
    <td data-label="Importo">${fmt(totals.amountDue)}</td>
    <td data-label="Versamenti">${totals.amountPaid > 0 ? fmt(totals.amountPaid) : ''}</td>
    <td data-label="Stato">${totals.residualAmount > 0 ? fmt(totals.residualAmount) : '<span class="scad-chip ok">In pari</span>'}</td>
    <td data-label="Timing"></td>
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
  if (meta.isClosedYear) {
    return `<div class="scad-method-box">
      <div class="scad-note">Anno chiuso: qui mostro un consuntivo di competenza. Storico e previsionale servono solo per stimare anni ancora aperti.</div>
    </div>`;
  }
  const recommended = meta.methodPolicy && meta.methodPolicy.recommendedMethod ? meta.methodPolicy.recommendedMethod : 'previsionale';
  const warning = meta.methodPolicy && meta.methodPolicy.methodWarning ? meta.methodPolicy.methodWarning : '';
  const recommendedLabel = recommended === 'storico' ? 'Storico' : 'Previsionale';
  let h = `<div class="scad-method-box">
    <div class="scad-method-head">
      <div>
        <div class="scad-method-title">Metodo acconti</div>
        <div class="scad-method-sub">Storico = usa il dovuto dell anno precedente. Previsionale = usa una base stimata dell anno corrente.</div>
      </div>
      <span class="scad-chip ${recommended === meta.currentMethod ? 'ok' : 'warn'}">Consigliato: ${recommendedLabel}</span>
    </div>
    <div class="scad-method-controls">
      <select onchange="saveYearTextSetting(${meta.year}, 'scadenziarioMetodoAcconti', this.value); recalcAll()">
        <option value="storico" ${meta.currentMethod === 'storico' ? 'selected' : ''}>Storico</option>
        <option value="previsionale" ${meta.currentMethod === 'previsionale' ? 'selected' : ''}>Previsionale</option>
      </select>
      <div class="scad-method-inline">
        <span>Primo anno forfettario dopo ordinario o anno misto? Meglio leggere lo storico come prudenziale, non come base pulita.</span>
      </div>
    </div>`;
  if (warning) h += `<div class="scad-note">${warning}</div>`;
  if (schedule.transitionFromNonForfettario) {
    h += `<div class="scad-note">Il ${meta.year - 1} non era forfettario puro: il metodo storico resta disponibile, ma puo sovrastimare gli acconti del ${meta.year}.</div>`;
  }
  if (meta.currentMethod === 'previsionale') {
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
  let h = `<section class="panel scad-year-card ${meta.isSelectedYear ? 'is-current' : ''}">
    <div class="scad-year-header">
      <div>
        <div class="scad-year-title">Anno ${meta.year}</div>
        <div class="scad-year-sub">${meta.isTrailingSettlementYear
          ? `Pagamenti nel ${meta.year} riferiti alla competenza ${meta.trailingSourceYear}`
          : (meta.classification === 'forfettario' ? 'Vista principale per competenza fiscale' : 'Storico visibile su richiesta')}</div>
      </div>
      <div class="scad-year-badges">
        <span class="scad-chip ${badgeTone}">${meta.classification === 'forfettario' ? 'Forfettario' : (meta.classification === 'misto' ? 'Misto' : 'Ordinario')}</span>
        ${meta.isSelectedYear ? '<span class="scad-chip info">Anno selezionato</span>' : ''}
        ${meta.totals.crossYearCount > 0 ? `<span class="scad-chip warn">${meta.totals.crossYearCount} cross-year</span>` : ''}
      </div>
    </div>
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
      <details class="scad-collapsible">
        <summary><span>Pagate / archiviate</span><span class="scad-collapsible-meta">${split.archived.length} voci</span></summary>
        <div class="scad-collapsible-body">
          ${renderScadenziarioRowsTable(split.archived, { totalLabel: `Pagate ${meta.year}`, emptyLabel: 'Nessuna voce completamente chiusa.' })}
        </div>
      </details>
    </div>`;
  if (meta.bundle && Array.isArray(meta.bundle.credits) && meta.bundle.credits.length > 0) {
    h += `<div class="scad-section"><div class="scad-section-head"><h3>Crediti / eccedenze</h3><span>${meta.bundle.credits.length} voci</span></div>
      <div class="scad-credit-list">${meta.bundle.credits.map(credit => `<div class="scad-credit-item">
        <div><b>${credit.title}</b><div class="scad-sub">${credit.competence}</div></div>
        <div class="scad-credit-value">${fmt(credit.amount)}</div>
      </div>`).join('')}</div>
    </div>`;
  }
  h += `<div class="scad-section"><div class="scad-section-head"><h3>Note e warning</h3><span>${meta.classification}</span></div>${renderScadenziarioNotes(meta)}</div>`;
  h += `</section>`;
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
    const grouped = scadEngine ? scadEngine.groupPaymentEventsByCashYear(meta.rows) : {};
    for (const [cashYear, entries] of Object.entries(grouped)) {
      if (!groups[cashYear]) groups[cashYear] = [];
      groups[cashYear].push(...entries.map(entry => ({
        ...entry,
        regimeType: meta.classification
      })));
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
    const rows = cashGroups[cashYear].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '') || (a.competenceYear || 0) - (b.competenceYear || 0));
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
      h += `<tr>
        <td data-label="Data pagamento">${row.paymentDate ? formatPaymentDateDisplay(row.paymentDate) : `Anno ${cashYear}`}</td>
        <td data-label="Voce">
          <div class="scad-main">${row.title}</div>
          <div class="scad-sub">Competenza ${row.competenceYear}${row.competenceYear !== cashYear ? `, pagata nel ${cashYear}` : ''}</div>
        </td>
        <td data-label="Competenza">${row.competenceYear}</td>
        <td data-label="Importo">${fmt(row.amount)}</td>
        <td data-label="Origine"><span class="scad-chip ${row.regimeType === 'forfettario' ? 'ok' : 'info'}">${row.regimeType}</span></td>
      </tr>`;
    }
    h += `</tbody></table></section>`;
  }
  return h;
}

function renderScadenziario() {
  const el = document.getElementById('scadenziarioGrid');
  if (!el) return;
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
  el.innerHTML = nextHtml;
  return;

  if (S().regime !== 'forfettario') {
    const ordinaryHistory = buildHistoricalOrdinarySummaryForYear(currentYear);
    if (ordinaryHistory && ordinaryHistory.entries.length > 0) {
      let h = `<div class="panel" style="grid-column:1/-1"><h3>Storico ${currentYear}</h3>
        <div style="font-size:.88rem;color:var(--text2);line-height:1.5">${ordinaryHistory.note}</div>
        <div class="row highlight"><label>Totale pagamenti storici rilevati nel ${currentYear + 1}</label><div class="val">${fmt(ordinaryHistory.total)}</div></div>
        <table class="scad-table"><thead><tr><th style="text-align:left">Data</th><th style="text-align:left">Voce</th><th>Importo</th></tr></thead><tbody>`;
      for (const entry of ordinaryHistory.entries) {
        const description = entry.isAggregateBundle
          ? `F24 storico con ${entry.bundleCount} sottovoci: ${(entry.children || []).map(child => child.label).join(', ')}`
          : (entry.label || entry.description || entry.family);
        h += `<tr>
          <td data-label="Data">${entry.dueDate || '—'}</td>
          <td data-label="Voce"><div class="scad-main">${entry.label || 'Pagamento storico'}</div><div class="scad-sub">${description}</div></td>
          <td data-label="Importo">${fmt(entry.paidAmount || entry.amount)}</td>
        </tr>`;
      }
      h += `</tbody></table></div>`;
      el.innerHTML = h;
      return;
    }
    el.innerHTML = `<div class="panel" style="grid-column:1/-1"><h3>Scadenziario</h3>
      <div style="font-size:.88rem;color:var(--text2);line-height:1.5">
        Lo scadenziario automatico e disponibile solo per il regime forfettario. Per il ${currentYear} ordinario non ho ancora abbastanza storico importato per costruire il riepilogo del commercialista.</div>
    </div>`;
    return;
  }

  const schedule = buildForfettarioScheduleForYear(currentYear);
  const totalDue = schedule.rows.reduce((sum, row) => sum + row.amount, 0);
  const totalLow = schedule.rows.reduce((sum, row) => sum + row.low, 0);
  const totalHigh = schedule.rows.reduce((sum, row) => sum + row.high, 0);
  const hasRange = totalLow !== totalHigh;
  const dueThisYear = schedule.rows.filter(row => row.due.year === currentYear).reduce((sum, row) => sum + row.amount, 0);
  const remainingThisYear = schedule.rows.filter(row => row.due.year === currentYear && row.status.cls !== 'danger').reduce((sum, row) => sum + row.amount, 0);
  const dueNextYear = schedule.rows.filter(row => row.due.year > currentYear).reduce((sum, row) => sum + row.amount, 0);
  const overdueTotal = schedule.rows.filter(row => row.status.cls === 'danger').reduce((sum, row) => sum + row.amount, 0);
  const nearTotal = schedule.rows.filter(row => row.status.cls === 'warn').reduce((sum, row) => sum + row.amount, 0);
  const nextDue = schedule.rows.find(row => row.status.cls !== 'danger');
  const creditsTotal = schedule.credits.reduce((sum, credit) => sum + credit.amount, 0);
  const allPagamenti = getPagamenti();
  const engine = getTaxEngine();
  const comparison = buildForfettarioMethodComparisonForYear(currentYear, { includeEstimates: true });
  const totalPaid = schedule.rows.reduce((sum, row) => {
    if (!row.key) return sum;
    const p = allPagamenti.find(p => p.scheduleKey === row.key);
    return sum + (p ? p.importo : 0);
  }, 0);
  const residuoDaPagare = ceil2(totalDue - totalPaid);

  let h = '';

  // Banner primo utilizzo: mancano i dati anno precedente
  if (schedule.transitionFromNonForfettario && !schedule.isClosedYear) {
    h += `<div class="status-box ok" style="grid-column:1/-1;margin-bottom:8px"><div class="status-icon">&#9432;</div><div class="status-text">
      Il ${currentYear - 1} era ${getYearDataFor(currentYear - 1)?.settings?.regime || 'non forfettario'}: per questo anno non genero acconti storici del forfettario sul ${currentYear}. Lo scadenziario parte da saldo e contributi del nuovo ciclo.
    </div></div>`;
  } else if (!schedule.prevApplied && !schedule.firstYearManualUsed && !schedule.isClosedYear) {
    h += `<div class="status-box warn" style="grid-column:1/-1;margin-bottom:8px"><div class="status-icon">&#9888;</div><div class="status-text">
      Non risultano dati dell'anno precedente. Compila i dati nella sezione &laquo;Opzioni avanzate &gt; Dati anno precedente&raquo; per calcoli piu precisi di saldo e acconti.
    </div></div>`;
  }

  h += buildMethodAccontiPanel(schedule, comparison);

  h += `<div class="panel"><h3>${schedule.isClosedYear ? 'Consuntivo' : 'Simulazione'}</h3>`;
  if (schedule.isClosedYear) {
    h += `<div style="font-size:.82rem;color:var(--text2);line-height:1.5">
      Il ${currentYear} e un anno gia chiuso, quindi qui mostro il consuntivo. Le modalita storico e previsionale servono solo per anni ancora aperti, quando devi stimare gli acconti futuri.</div>`;
  } else {
    h += `<div class="settings-group">
      <label>Metodo acconti</label>
      <select onchange="saveTextSetting('scadenziarioMetodoAcconti', this.value); recalcAll()">
        <option value="storico" ${schedule.accontoMethod === 'storico' ? 'selected' : ''}>Storico</option>
        <option value="previsionale" ${schedule.accontoMethod === 'previsionale' ? 'selected' : ''}>Previsionale</option>
      </select>
    </div>`;
  }
  if (!schedule.isClosedYear && schedule.accontoMethod === 'previsionale') {
    h += `<div class="settings-group">
      <label>Base previsionale imposta sostitutiva (EUR)</label>
      <input type="number" step="0.01" value="${S().scadenziarioPrevisionaleImposta}" placeholder="${fmt(schedule.currentApplied.tasse)}"
        onchange="saveOptionalNumberSetting('scadenziarioPrevisionaleImposta', this.value); recalcAll()">
      <div style="margin-top:6px;color:var(--text2);font-size:.75rem">
        Lascia vuoto per usare la stima automatica del ${currentYear}: ${fmt(schedule.currentApplied.tasse)}.</div>
    </div>`;
    h += `<div class="settings-group">
      <label>Base previsionale contributi (EUR)</label>
      <input type="number" step="0.01" value="${S().scadenziarioPrevisionaleContributi}" placeholder="${fmt(schedule.forecastContributi.amount)}"
        onchange="saveOptionalNumberSetting('scadenziarioPrevisionaleContributi', this.value); recalcAll()">
      <div style="margin-top:6px;color:var(--text2);font-size:.75rem">
        Per Artigiani/Commercianti indica solo la parte saldo/acconti variabile. Le rate fisse restano separate.</div>
    </div>`;
  } else if (!schedule.isClosedYear) {
    h += `<div style="font-size:.82rem;color:var(--text2);line-height:1.5">
      In modalita storico gli acconti si basano sui dovuti dell'anno precedente. Passa a previsionale solo quando vuoi confrontare o correggere la liquidita futura.</div>`;
  }
  h += `</div>`;

  if (!schedule.isClosedYear && schedule.projectionRange && schedule.projectionRange.variancePct > 0 && schedule.projectionRange.estimatedGross > 0) {
    h += `<div class="panel"><h3>Scenario Annuale</h3>`;
    h += row('Lordo base stimato', fmt(schedule.projectionRange.baseGross), 'highlight');
    h += row('Lordo possibile', `${fmt(schedule.projectionRange.lowGross)} - ${fmt(schedule.projectionRange.highGross)}`);
    h += row('Tasse+contributi base', fmt(schedule.projectionRange.baseDue));
    h += row('Tasse+contributi possibili', `${fmt(schedule.projectionRange.lowDue)} - ${fmt(schedule.projectionRange.highDue)}`, '', 'negative');
    h += `<div style="font-size:.78rem;color:var(--text2);line-height:1.5;margin-top:8px">
      Il range si applica solo ai mesi ancora stimati (${fmt(schedule.projectionRange.estimatedGross)} di lordo), non alle fatture gia inserite o alle scadenze manuali.</div>`;
    h += `</div>`;
  }

  if (comparison && !schedule.isClosedYear) {
    h += `<div class="panel"><h3>Storico vs Previsionale</h3>`;
    h += row('Metodo attivo', comparison.selectedMethod === 'previsionale' ? 'Previsionale' : 'Storico', 'highlight');
    h += row('Metodo piu prudente', comparison.prudential.method === 'previsionale' ? 'Previsionale' : 'Storico');
    h += row('Metodo piu leggero sulla liquidita', comparison.liquidity.method === 'previsionale' ? 'Previsionale' : 'Storico');
    h += row('Acconti imposta storico', fmt(comparison.historical.taxAcconti.total), '', 'negative');
    h += row('Acconti imposta previsionale', fmt(comparison.previsionale.taxAcconti.total), '', 'negative');
    h += row('Contributi deducibili storico', fmt(comparison.historical.deductibleContributionsPaid));
    h += row('Contributi deducibili previsionale', fmt(comparison.previsionale.deductibleContributionsPaid));
    h += `</div>`;
  }

  h += buildFiscozenComparisonPanel(schedule);

  h += buildPagamentiSection({ embedded: true, compact: true });

  h += `<div class="panel"><h3>Riepilogo Scadenze</h3>`;
  h += row(`Residuo da oggi al 31/12/${currentYear}`, fmt(remainingThisYear), 'highlight');
  h += row(`Scadenze con data nel ${currentYear}`, fmt(dueThisYear));
  if (dueNextYear > 0) h += row(`Scadenze con data nel ${currentYear + 1}`, fmt(dueNextYear));
  h += row(`Totale competenza ${currentYear}`, fmt(totalDue) + (hasRange ? ` <span class="scad-range">(${fmt(totalLow)} – ${fmt(totalHigh)})</span>` : ''));
  h += row('Gia pagato', fmt(totalPaid), '', totalPaid > 0 ? 'positive' : '');
  h += row('Residuo da pagare', fmt(residuoDaPagare), 'highlight', residuoDaPagare > 0 ? 'negative' : 'positive');
  h += row('Scaduto', fmt(overdueTotal), '', overdueTotal > 0 ? 'negative' : 'positive');
  h += row('Entro 30 giorni', fmt(nearTotal), '', nearTotal > 0 ? 'negative' : '');
  h += row('Gestione previdenziale', getInpsModeLabel(schedule.currentApplied.inpsMode));
  h += row('Metodo vista', schedule.uiMethodLabel);
  h += `</div>`;

  h += `<div class="panel"><h3>Prossima Scadenza</h3>`;
  if (nextDue) {
    h += row('Data', nextDue.due.label, 'highlight');
    h += row('Voce', nextDue.title);
    h += row('Competenza', nextDue.competence);
    const nextRange = (nextDue.low !== nextDue.high) ? ` <span class="scad-range">(${fmt(nextDue.low)} – ${fmt(nextDue.high)})</span>` : '';
    h += row('Importo stimato', fmt(nextDue.amount) + nextRange, '', nextDue.status.cls === 'warn' ? 'negative' : '');
  } else {
    h += `<div style="font-size:.85rem;color:var(--text2)">Nessuna scadenza futura nell'orizzonte del ${currentYear}.</div>`;
  }
  h += `</div>`;

  h += `<div class="panel"><h3>Metodo</h3><div class="scad-note-list">`;
  h += schedule.notes.map(note => `<div class="scad-note">${note}</div>`).join('');
  if (comparison && !schedule.isClosedYear) h += comparison.warnings.map(note => `<div class="scad-note">${note}</div>`).join('');
  h += `<div class="scad-note">Usa "Segna pagato" per collegare un versamento effettuato a una scadenza. Il pagamento viene registrato anche nella sezione Versamenti registrati.</div>`;
  h += `</div></div>`;

  if (creditsTotal > 0) {
    h += `<div class="panel"><h3>Crediti Stimati</h3>`;
    h += row('Totale crediti stimati', fmt(creditsTotal), 'highlight', 'positive');
    for (const credit of schedule.credits) h += row(`${credit.title} - ${credit.competence}`, fmt(credit.amount), '', 'positive');
    h += `</div>`;
  }

  h += `<div class="panel" style="grid-column:1/-1"><h3>${schedule.uiTitle}</h3>`;
  if (schedule.rows.length === 0) {
    h += `<div style="font-size:.88rem;color:var(--text2);padding:18px 0;text-align:center">Nessuna scadenza stimata disponibile per il ${currentYear}.</div>`;
  } else {
    h += `<table class="scad-table"><thead><tr>
      <th style="text-align:left">Data</th>
      <th style="text-align:left">Voce</th>
      <th>Metodo</th>
      <th>Importo</th>
      <th>Pagato</th>
      <th>Stato</th>
      <th>Timing</th>
    </tr></thead><tbody>`;
    for (const rowItem of schedule.rows) {
      const rangeHtml = (rowItem.low !== rowItem.high)
        ? `<div class="scad-range">(${fmt(rowItem.low)} – ${fmt(rowItem.high)})</div>` : '';
      const linkedPay = rowItem.key ? allPagamenti.find(p => p.scheduleKey === rowItem.key) : null;
      const paymentState = engine ? engine.buildInstallmentStatus(rowItem, linkedPay) : { label: rowItem.certainty === 'estimated' ? 'Stimato' : 'Da confermare', tone: rowItem.certainty === 'estimated' ? 'warn' : 'info' };
      const explanation = engine ? engine.buildInstallmentExplanation(rowItem) : rowItem.note;
      let pagatoHtml;
      if (linkedPay) {
        const delta = ceil2(linkedPay.importo - rowItem.amount);
        const keyEsc = rowItem.key.replace(/'/g, "\\'");
        pagatoHtml = `<span style="color:var(--green)">${fmt(linkedPay.importo)}</span>`;
        if (delta !== 0) pagatoHtml += `<div class="scad-range">(${delta > 0 ? '+' : ''}${fmt(delta)})</div>`;
        pagatoHtml += `<button class="scad-undo-btn" onclick="removePagamentoByScheduleKey('${keyEsc}')" title="Annulla pagamento">&times;</button>`;
      } else if (rowItem.key) {
        const escaped = rowItem.key.replace(/'/g, "\\'");
        const dueIso = `${rowItem.due.year}-${pad2(rowItem.due.date.getMonth() + 1)}-${pad2(rowItem.due.date.getDate())}`;
        pagatoHtml = `<button class="scad-pay-btn" onclick="addPagamentoFromSchedule('${escaped}','${dueIso}','${rowItem.kind}','${rowItem.title.replace(/'/g, "\\'")}','${rowItem.competence.replace(/'/g, "\\'")}',${rowItem.amount})">Segna</button>`;
      } else {
        pagatoHtml = '';
      }
      // Bottone guida F24
      const f24Key = getF24GuideKey(rowItem.key);
      const f24Btn = f24Key ? `<button class="f24-btn" onclick="toggleF24Guide('${rowItem.key.replace(/'/g, "\\'")}')">F24?</button>` : '';
      const f24SafeId = 'f24guide_' + (rowItem.key || '').replace(/[^a-zA-Z0-9_]/g, '_');
      const f24GuideHtml = f24Key ? renderF24Guide(f24Key, rowItem) : '';

      h += `<tr>
        <td data-label="Data">${rowItem.due.label}</td>
        <td data-label="Voce">
          <div class="scad-main">${rowItem.title}</div>
          <div class="scad-sub">${rowItem.competence}${rowItem.note ? ' - ' + rowItem.note : ''}</div>
          ${explanation ? `<div class="scad-sub">${explanation}</div>` : ''}
        </td>
        <td data-label="Metodo"><span class="scad-chip info">${rowItem.method}</span></td>
        <td data-label="Importo" style="color:${rowItem.status.cls === 'danger' ? 'var(--red)' : 'var(--yellow)'}">${fmt(rowItem.amount)}${rangeHtml}</td>
        <td data-label="Pagato">${pagatoHtml}${f24Btn}</td>
        <td data-label="Stato"><span class="scad-chip ${paymentState.tone}">${paymentState.label}</span></td>
        <td data-label="Timing"><span class="scad-chip ${rowItem.status.cls}">${rowItem.status.label}</span></td>
      </tr>`;
      if (f24GuideHtml) {
        h += `<tr class="f24-guide-row" id="${f24SafeId}" style="display:none"><td colspan="7">${f24GuideHtml}</td></tr>`;
      }
    }
    const footerRange = hasRange ? `<div class="scad-range">(${fmt(totalLow)} – ${fmt(totalHigh)})</div>` : '';
    h += `</tbody><tfoot><tr>
      <td data-label="Data">Totale</td>
      <td data-label="Voce">${schedule.isClosedYear ? `Totale competenza ${currentYear}` : `Scadenze stimate ${currentYear}`}</td>
      <td data-label="Metodo"></td>
      <td data-label="Importo">${fmt(totalDue)}${footerRange}</td>
      <td data-label="Pagato">${totalPaid > 0 ? `<span style="color:var(--green)">${fmt(totalPaid)}</span>` : ''}</td>
      <td data-label="Stato"></td>
      <td data-label="Timing"></td>
    </tr></tfoot></table>`;
  }
  h += `</div>`;

  h += `<div class="panel" style="grid-column:1/-1"><details class="scad-collapsible">
    <summary><span>Opzioni avanzate</span><span class="scad-collapsible-meta">Override annuali e tributi extra</span></summary>
    <div class="scad-collapsible-body">
      <div class="scad-advanced-grid">
        ${schedule.isClosedYear ? '' : `<div class="scad-advanced-block">
          <h4>Simulazione</h4>
          <div class="settings-group">
            <label>Range sui mesi ancora stimati (%)</label>
            <input type="number" step="0.1" min="0" value="${S().scadenziarioRangePct}" onchange="saveSetting('scadenziarioRangePct', this.value); recalcAll()">
            <div style="margin-top:6px;color:var(--text2);font-size:.75rem">
              Aggiunge un intervallo ai mesi non ancora coperti da fatture reali.
            </div>
          </div>
        </div>`}
        <div class="scad-advanced-block">
          <h4>Allineamento manuale</h4>
          <div class="settings-group">
            <label>Saldo imposta sostitutiva anno precedente (EUR)</label>
            <input type="number" step="0.01" value="${S().scadenziarioSaldoImposta}" placeholder="auto"
              onchange="saveOptionalNumberSetting('scadenziarioSaldoImposta', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Totale acconti imposta anno corrente (EUR)</label>
            <input type="number" step="0.01" value="${S().scadenziarioAccontoImposta}" placeholder="auto"
              onchange="saveOptionalNumberSetting('scadenziarioAccontoImposta', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Saldo contributi anno precedente (EUR)</label>
            <input type="number" step="0.01" value="${S().scadenziarioSaldoContributi}" placeholder="auto"
              onchange="saveOptionalNumberSetting('scadenziarioSaldoContributi', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Totale acconti contributi anno corrente (EUR)</label>
            <input type="number" step="0.01" value="${S().scadenziarioAccontoContributi}" placeholder="auto"
              onchange="saveOptionalNumberSetting('scadenziarioAccontoContributi', this.value); recalcAll()">
          </div>
          <div style="font-size:.78rem;color:var(--text2);line-height:1.5">
            Usali solo quando vuoi allineare il prospetto a un dato gia confermato da Fiscozen o commercialista.
          </div>
        </div>
        <div class="scad-advanced-block">
          <h4>Tributi extra</h4>
          <div class="settings-group">
            <label>Diritto annuale Camera di Commercio (EUR)</label>
            <input type="number" step="0.01" value="${S().scadenziarioDirittoCamerale}" placeholder="${getInpsMode(S()) === 'artigiani_commercianti' ? '53,00' : '0,00'}"
              onchange="saveOptionalNumberSetting('scadenziarioDirittoCamerale', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Bollo FE 4o trimestre anno precedente (EUR)</label>
            <input type="number" step="0.01" value="${S().scadenziarioBolloPrecedenteQ4}" placeholder="0,00"
              onchange="saveOptionalNumberSetting('scadenziarioBolloPrecedenteQ4', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Bollo FE 1o-3o trimestre anno corrente (EUR)</label>
            <input type="number" step="0.01" value="${S().scadenziarioBolloCorrente123}" placeholder="0,00"
              onchange="saveOptionalNumberSetting('scadenziarioBolloCorrente123', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Bollo FE 4o trimestre anno corrente (EUR)</label>
            <input type="number" step="0.01" value="${S().scadenziarioBolloCorrenteQ4}" placeholder="0,00"
              onchange="saveOptionalNumberSetting('scadenziarioBolloCorrenteQ4', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Autoliquidazione INAIL febbraio ${currentYear} (EUR)</label>
            <input type="number" step="0.01" value="${S().scadenziarioInailCorrente}" placeholder="0,00"
              onchange="saveOptionalNumberSetting('scadenziarioInailCorrente', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Autoliquidazione INAIL febbraio ${currentYear + 1} (EUR)</label>
            <input type="number" step="0.01" value="${S().scadenziarioInailSuccessivo}" placeholder="0,00"
              onchange="saveOptionalNumberSetting('scadenziarioInailSuccessivo', this.value); recalcAll()">
          </div>
        </div>
        <div class="scad-advanced-block">
          <h4>Dati anno precedente (primo utilizzo)</h4>
          <div class="settings-group">
            <label>Fatturato lordo ${currentYear - 1} (EUR)</label>
            <input type="number" step="0.01" value="${S().primoAnnoFatturatoPrec}" placeholder="0,00"
              ${schedule.prevApplied ? 'disabled' : ''}
              onchange="saveOptionalNumberSetting('primoAnnoFatturatoPrec', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Imposta sostitutiva totale ${currentYear - 1} (EUR)</label>
            <input type="number" step="0.01" value="${S().primoAnnoImpostaPrec}" placeholder="0,00"
              ${schedule.prevApplied ? 'disabled' : ''}
              onchange="saveOptionalNumberSetting('primoAnnoImpostaPrec', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Acconti imposta gia versati per il ${currentYear - 1} (EUR)</label>
            <input type="number" step="0.01" value="${S().primoAnnoAccontiImpostaPrec}" placeholder="0,00"
              ${schedule.prevApplied ? 'disabled' : ''}
              onchange="saveOptionalNumberSetting('primoAnnoAccontiImpostaPrec', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Contributi variabili ${currentYear - 1} (EUR)</label>
            <input type="number" step="0.01" value="${S().primoAnnoContribVariabiliPrec}" placeholder="0,00"
              ${schedule.prevApplied ? 'disabled' : ''}
              onchange="saveOptionalNumberSetting('primoAnnoContribVariabiliPrec', this.value); recalcAll()">
          </div>
          <div class="settings-group">
            <label>Acconti contributi gia versati per il ${currentYear - 1} (EUR)</label>
            <input type="number" step="0.01" value="${S().primoAnnoAccontiContribPrec}" placeholder="0,00"
              ${schedule.prevApplied ? 'disabled' : ''}
              onchange="saveOptionalNumberSetting('primoAnnoAccontiContribPrec', this.value); recalcAll()">
          </div>
          <div style="font-size:.78rem;color:var(--text2);line-height:1.5">
            ${schedule.prevApplied
              ? 'I dati dell\'anno precedente sono gia presenti nel sistema: questi campi sono disabilitati.'
              : 'Compila questi campi solo se e il tuo primo anno di utilizzo del software e non hai lo storico dell\'anno precedente salvato.'}
          </div>
        </div>
      </div>
    </div>
  </details></div>`;

  el.innerHTML = h;
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

      h += `<tr><td data-label="Mese">${MONTHS[m-1]}</td>
        <td data-label="Importo"><input type="number" value="${f.importo||''}" placeholder="—"
          onchange="setFatturaImporto(${m},0,this.value);recalcAll()" class="fatt-input-importo"></td>
        <td data-label="Desc"><input type="text" value="${f.desc||''}" placeholder="—"
          onchange="setFatturaDesc(${m},0,this.value)" class="fatt-input-desc"></td>
        <td data-label="Stimato" style="color:var(--text2)">${fmt(stim)}</td>
        <td data-label="Tassato nel"><div class="pag-cell">
          <select class="pag-mese" onchange="setPagMese(${m},0,this.value)" ${f.importo<=0?'disabled':''}>
            <option value="">Mese...</option>
            ${MONTHS_SHORT.map((ms,i) => `<option value="${i+1}" ${f.pagMese===(i+1)?'selected':''}>${ms}</option>`).join('')}
          </select>
          <input type="number" class="pag-anno fatt-input-anno" value="${f.pagAnno||''}" placeholder="${currentYear}" min="2020" max="2040"
            onchange="setPagAnno(${m},0,this.value)" ${f.importo<=0?'disabled':''}>
          <button class="btn-oggi" onclick="setPagOggi(${m},0)" title="Oggi" ${f.importo<=0?'disabled':''}>Oggi</button>
          ${isDiffYear ? `<span class="pag-warn">&rarr; ${f.pagAnno}</span>` : ''}
        </div></td>
        <td data-label=""><button class="btn-add-fatt" onclick="addFattura(${m})" title="Aggiungi fattura">+</button></td></tr>`;
    } else {
      for (let fi = 0; fi < nFatt; fi++) {
        const f = fatture[fi];
        const hasPag = f.pagMese && f.pagAnno;
        const isDiffYear = hasPag && f.pagAnno !== currentYear;
        const isFirst = fi === 0;
        const isLast = fi === nFatt - 1;

        h += `<tr class="${!isFirst?'fatt-subrow':''}">
          <td data-label="Mese">${isFirst ? MONTHS[m-1] : ''}</td>
          <td data-label="Importo"><input type="number" value="${f.importo||''}" placeholder="—"
            onchange="setFatturaImporto(${m},${fi},this.value);recalcAll()" class="fatt-input-importo"></td>
          <td data-label="Desc"><input type="text" value="${f.desc||''}" placeholder="—"
            onchange="setFatturaDesc(${m},${fi},this.value)" class="fatt-input-desc"></td>
          <td data-label="Stimato" style="color:var(--text2)">${isFirst ? fmt(stim) : ''}</td>
          <td data-label="Tassato nel"><div class="pag-cell">
            <select class="pag-mese" onchange="setPagMese(${m},${fi},this.value)" ${f.importo<=0?'disabled':''}>
              <option value="">Mese...</option>
              ${MONTHS_SHORT.map((ms,i) => `<option value="${i+1}" ${f.pagMese===(i+1)?'selected':''}>${ms}</option>`).join('')}
            </select>
            <input type="number" class="pag-anno fatt-input-anno" value="${f.pagAnno||''}" placeholder="${currentYear}" min="2020" max="2040"
              onchange="setPagAnno(${m},${fi},this.value)" ${f.importo<=0?'disabled':''}>
            <button class="btn-oggi" onclick="setPagOggi(${m},${fi})" title="Oggi" ${f.importo<=0?'disabled':''}>Oggi</button>
            ${isDiffYear ? `<span class="pag-warn">&rarr; ${f.pagAnno}</span>` : ''}
          </div></td>
          <td data-label="" class="fatt-actions">
            ${isLast ? `<button class="btn-add-fatt" onclick="addFattura(${m})" title="Aggiungi">+</button>` : ''}
            <button class="btn-del-fatt" onclick="removeFattura(${m},${fi})" title="Rimuovi">&times;</button>
          </td></tr>`;
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
      <button class="btn-del" onclick="data.spese.splice(${i},1);saveData();recalcAll()">&times;</button>
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
  renderCalendar();
  renderFatture();
  renderAccantonamento();
  renderScadenziario();
  renderBudget();
  if (S().regime === 'ordinario') renderSpese();
  renderProfiloFiscale();
}

// ═══════════════════ Tab navigation ═══════════════════
function switchToTab(tab) {
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const navBtn = document.querySelector(`nav button[data-tab="${tab}"]`);
  if (navBtn) navBtn.classList.add('active');
  const tabEl = document.getElementById('tab-' + tab);
  if (tabEl) tabEl.classList.add('active');
  // highlight header settings btn when on settings tab
  const sBtn = document.getElementById('settingsBtn');
  if (sBtn) sBtn.classList.toggle('active', tab === 'settings');
  window.scrollTo(0, 0);
}
document.getElementById('nav').addEventListener('click', e => {
  if (e.target.tagName !== 'BUTTON') return;
  switchToTab(e.target.dataset.tab);
});

// ═══════════════════ Mobile nav labels ═══════════════════
const NAV_LABELS = {
  calcolo:        { full: null, short: 'Regime' }, // full set by applySettings
  accantonamento: { full: 'Tasse Accantonate', short: 'Tasse' },
  scadenziario:   { full: 'Scadenze', short: 'Scad.' },
  calendar:       { full: 'Calendario', short: 'Calend.' },
  fatture:        { full: 'Fatture', short: 'Fatture' },
  budget:         { full: 'Budget', short: 'Budget' },
  spese:          { full: 'Spese', short: 'Spese' },
  settings:       { full: 'Impostazioni', short: 'Impost.' }
};
function updateNavLabels() {
  const mobile = window.innerWidth <= 768;
  document.querySelectorAll('nav button[data-tab]').forEach(btn => {
    const tab = btn.dataset.tab;
    const lbl = NAV_LABELS[tab];
    if (!lbl) return;
    if (tab === 'calcolo') {
      const regime = S().regime === 'forfettario' ? 'Forfettario' : 'Ordinario';
      btn.textContent = mobile ? 'Regime' : 'Regime ' + regime;
    } else {
      btn.textContent = mobile ? lbl.short : lbl.full;
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
updateProfileBadge();
if (checkSession()) {
  loadProfileFiscalData();
  loadData();
  recalcAll();
  loadProfileExternalFiscalData(currentProfile).then(() => recalcAll());
}
