// ═══════════════════ Firebase Sync Module ═══════════════════

const firebaseConfig = {
  apiKey: "AIzaSyDm2r1CayIMZpbUiaZSCia9peZQQeMGqFA",
  authDomain: "calcoli-piva.firebaseapp.com",
  projectId: "calcoli-piva",
  storageBucket: "calcoli-piva.firebasestorage.app",
  messagingSenderId: "501444849198",
  appId: "1:501444849198:web:6949b6e1b3eee9463b39bf",
  measurementId: "G-4ZT20G6JF2"
};

let db = null;
let firebaseReady = false;
let _fs = null; // cached firestore module
let _syncTimer = null;
const PROFILE_META_KEYS = ['clienti', 'fattureEmesse'];

// ── Sync Status Indicator ──
function setSyncStatus(status) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const states = {
    online:   { color: '#4ecca3', title: 'Sincronizzato', text: 'Sync OK' },
    syncing:  { color: '#f5a623', title: 'Sincronizzazione...', text: 'Sync...' },
    error:    { color: '#e94560', title: 'Errore sync', text: 'Errore' },
    offline:  { color: '#aaa',    title: 'Offline', text: 'Offline' },
    disabled: { color: '#555',    title: 'Firebase non configurato', text: 'No sync' }
  };
  const s = states[status] || states.offline;
  el.innerHTML = `<span class="sync-dot" style="background:${s.color}"></span><span class="sync-text">${s.text}</span>`;
  el.title = s.title;
}

// ── Init ──
async function initFirebase() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js');
    _fs = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');

    const app = initializeApp(firebaseConfig);
    db = _fs.getFirestore(app);

    firebaseReady = true;
    setSyncStatus('online');
    console.log('Firebase inizializzato con successo');
    return true;
  } catch (err) {
    console.error('Firebase init error:', err);
    setSyncStatus('error');
    return false;
  }
}

// Clean data for Firestore: strip undefined values (Firestore rejects them)
function cleanForFirestore(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isNumericYearSuffix(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  const year = parseInt(normalized, 10);
  return Number.isFinite(year) && String(year) === normalized;
}

function getProfileMetaSnapshot(profile) {
  const prefix = 'calcoliPIVA_' + profile + '_';
  const snapshot = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length);
    if (isNumericYearSuffix(suffix)) continue;
    if (!PROFILE_META_KEYS.includes(suffix)) continue;
    try {
      snapshot[suffix] = JSON.parse(localStorage.getItem(key));
    } catch {
      snapshot[suffix] = null;
    }
  }
  return snapshot;
}

function applyProfileMetaSnapshot(profile, meta) {
  if (!profile || !meta) return;
  const prefix = 'calcoliPIVA_' + profile + '_';
  for (const key of PROFILE_META_KEYS) {
    if (meta[key] === undefined) continue;
    localStorage.setItem(prefix + key, JSON.stringify(meta[key]));
  }
}

function mergeRecordsById(localList, cloudList) {
  const local = Array.isArray(localList) ? localList : [];
  const cloud = Array.isArray(cloudList) ? cloudList : [];
  if (local.length === 0) return cloud;
  if (cloud.length === 0) return local;
  const byId = new Map();
  const out = [];
  const push = (item, preferExisting = false) => {
    if (!item || !item.id) return;
    const current = byId.get(item.id);
    if (!current) {
      const clone = { ...item };
      byId.set(item.id, clone);
      out.push(clone);
      return;
    }
    if (preferExisting) return;
    byId.set(item.id, { ...current, ...item });
  };
  for (const item of cloud) push(item);
  for (const item of local) push(item, true);
  for (const item of local) {
    if (!item || !item.id) continue;
    const existing = byId.get(item.id);
    if (existing) byId.set(item.id, { ...existing, ...item });
  }
  // Preserve local order first, then append missing cloud rows
  const ordered = [];
  const seen = new Set();
  for (const item of local) {
    if (!item || !item.id) continue;
    const merged = byId.get(item.id);
    if (merged && !seen.has(item.id)) {
      ordered.push(merged);
      seen.add(item.id);
    }
  }
  for (const item of cloud) {
    if (!item || !item.id || seen.has(item.id)) continue;
    const merged = byId.get(item.id);
    if (merged) {
      ordered.push(merged);
      seen.add(item.id);
    }
  }
  return ordered;
}

function mergeClientLists(localList, cloudList) {
  return mergeRecordsById(localList, cloudList);
}

function mergeFattureEmesse(localList, cloudList) {
  return mergeRecordsById(localList, cloudList);
}

async function syncProfileMetaToCloud(profile) {
  if (!firebaseReady || !db || !_fs) return;
  try {
    const meta = getProfileMetaSnapshot(profile);
    const docRef = _fs.doc(db, 'profiles', profile, 'meta', 'main');
    await _fs.setDoc(docRef, cleanForFirestore(meta), { merge: true });
  } catch (err) {
    console.error('syncProfileMetaToCloud error:', err);
  }
}

async function syncProfileMetaFromCloud(profile) {
  if (!firebaseReady || !db || !_fs) return null;
  try {
    const docRef = _fs.doc(db, 'profiles', profile, 'meta', 'main');
    const snap = await _fs.getDoc(docRef);
    if (!snap.exists()) return null;
    const cloudMeta = snap.data() || {};
    const localMeta = getProfileMetaSnapshot(profile);
    const merged = { ...cloudMeta };
    if (PROFILE_META_KEYS.includes('clienti')) {
      merged.clienti = mergeClientLists(localMeta.clienti, cloudMeta.clienti);
    }
    if (PROFILE_META_KEYS.includes('fattureEmesse')) {
      merged.fattureEmesse = mergeFattureEmesse(localMeta.fattureEmesse, cloudMeta.fattureEmesse);
    }
    applyProfileMetaSnapshot(profile, merged);
    return merged;
  } catch (err) {
    console.error('syncProfileMetaFromCloud error:', err);
    return null;
  }
}

// ── Write to Firestore (debounced 800ms) ──
function syncToCloud(profile, year, yearData) {
  if (!firebaseReady || !db || !_fs) return;
  const yearNum = parseInt(year, 10);
  if (!Number.isFinite(yearNum)) return;

  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    try {
      setSyncStatus('syncing');
      const docRef = _fs.doc(db, 'profiles', profile, 'years', String(yearNum));
      await _fs.setDoc(docRef, cleanForFirestore(yearData));
      setSyncStatus('online');
      console.log('Sync OK:', profile, yearNum);
    } catch (err) {
      console.error('syncToCloud error:', err);
      setSyncStatus('error');
    }
  }, 800);
}

// ── Force immediate sync (for login/year change) ──
async function syncToCloudNow(profile, year, yearData) {
  if (!firebaseReady || !db || !_fs) return;
  const yearNum = parseInt(year, 10);
  if (!Number.isFinite(yearNum)) return;
  try {
    setSyncStatus('syncing');
    const docRef = _fs.doc(db, 'profiles', profile, 'years', String(yearNum));
    await _fs.setDoc(docRef, cleanForFirestore(yearData));
    setSyncStatus('online');
  } catch (err) {
    console.error('syncToCloudNow error:', err);
    setSyncStatus('error');
  }
}

// ── Read from Firestore ──
async function syncFromCloud(profile, year) {
  if (!firebaseReady || !db || !_fs) return null;
  try {
    const docRef = _fs.doc(db, 'profiles', profile, 'years', String(year));
    const snap = await _fs.getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error('syncFromCloud error:', err);
    return null;
  }
}

// Deep merge: for each top-level key, pick the richer value (more data wins)
function mergeYearData(local, cloud) {
  if (!local) return cloud;
  if (!cloud) return local;
  const merged = { ...local };
  for (const key of Object.keys(cloud)) {
    const lv = local[key], cv = cloud[key];
    if (lv === undefined || lv === null) {
      merged[key] = cv;
    } else if (typeof lv === 'object' && typeof cv === 'object' && !Array.isArray(lv) && !Array.isArray(cv)) {
      // Merge objects (calendar, fatture, accantonamento, settings): keep keys from both, cloud fills gaps
      merged[key] = { ...cv, ...lv };
      // For nested objects like calendar/fatture, also merge at second level
      for (const subKey of Object.keys(cv)) {
        if (lv[subKey] === undefined || lv[subKey] === null || lv[subKey] === '') {
          merged[key][subKey] = cv[subKey];
        }
      }
    } else if (Array.isArray(lv) && Array.isArray(cv)) {
      if (key === 'pagamenti') {
        // Pagamenti: merge by combining unique entries (deduplicate by data+importo+tipo+descrizione)
        const seen = new Set();
        const combined = [];
        for (const arr of [lv, cv]) {
          for (const p of arr) {
            const sig = [p.data, p.importo, p.tipo, p.descrizione].join('|');
            if (!seen.has(sig)) { seen.add(sig); combined.push(p); }
          }
        }
        merged[key] = combined;
      } else {
        // Arrays (budget, spese): keep the longer one
        merged[key] = lv.length >= cv.length ? lv : cv;
      }
    }
    // For primitives: local wins (already in merged)
  }
  return merged;
}

// ── Sync all years for a profile ──
async function syncAllFromCloud(profile) {
  if (!firebaseReady || !db || !_fs) return;
  try {
    setSyncStatus('syncing');
    const colRef = _fs.collection(db, 'profiles', profile, 'years');
    const snapshot = await _fs.getDocs(colRef);

    let count = 0;
    snapshot.forEach(docSnap => {
      const year = docSnap.id;
      if (!isNumericYearSuffix(year)) return;
      const cloudData = docSnap.data();
      const key = 'calcoliPIVA_' + profile + '_' + year;
      const localRaw = localStorage.getItem(key);
      const localData = localRaw ? JSON.parse(localRaw) : null;
      const merged = mergeYearData(localData, cloudData);
      localStorage.setItem(key, JSON.stringify(merged));
      count++;
    });

    const meta = await syncProfileMetaFromCloud(profile);
    if (!meta) {
      await syncProfileMetaToCloud(profile);
    }

    setSyncStatus('online');
    console.log('Download cloud:', count, 'anni per', profile);
    return count;
  } catch (err) {
    console.error('syncAllFromCloud error:', err);
    setSyncStatus('error');
    return 0;
  }
}

// ── Upload all local data for a profile to cloud ──
async function syncAllToCloud(profile) {
  if (!firebaseReady || !db || !_fs) return;
  try {
    setSyncStatus('syncing');
    const prefix = 'calcoliPIVA_' + profile + '_';
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    let count = 0;
    for (const key of keys) {
      const year = key.substring(prefix.length);
      if (!isNumericYearSuffix(year)) continue;
      const yearData = JSON.parse(localStorage.getItem(key));
      if (!yearData) continue;
      const docRef = _fs.doc(db, 'profiles', profile, 'years', String(parseInt(year, 10)));
      await _fs.setDoc(docRef, cleanForFirestore(yearData));
      count++;
    }
    await syncProfileMetaToCloud(profile);
    setSyncStatus('online');
    console.log('Upload cloud:', count, 'anni per', profile);
  } catch (err) {
    console.error('syncAllToCloud error:', err);
    setSyncStatus('error');
  }
}
