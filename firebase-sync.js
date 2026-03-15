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

// ── Write to Firestore (debounced 800ms) ──
function syncToCloud(profile, year, yearData) {
  if (!firebaseReady || !db || !_fs) return;

  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    try {
      setSyncStatus('syncing');
      const docRef = _fs.doc(db, 'profiles', profile, 'years', String(year));
      await _fs.setDoc(docRef, cleanForFirestore(yearData));
      setSyncStatus('online');
      console.log('Sync OK:', profile, year);
    } catch (err) {
      console.error('syncToCloud error:', err);
      setSyncStatus('error');
    }
  }, 800);
}

// ── Force immediate sync (for login/year change) ──
async function syncToCloudNow(profile, year, yearData) {
  if (!firebaseReady || !db || !_fs) return;
  try {
    setSyncStatus('syncing');
    const docRef = _fs.doc(db, 'profiles', profile, 'years', String(year));
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
        if (lv[subKey] === undefined || lv[subKey] === null || lv[subKey] === '' || lv[subKey] === 0) {
          merged[key][subKey] = cv[subKey];
        }
      }
    } else if (Array.isArray(lv) && Array.isArray(cv)) {
      // Arrays (budget, spese): keep the longer one
      merged[key] = lv.length >= cv.length ? lv : cv;
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
      const cloudData = docSnap.data();
      const key = 'calcoliPIVA_' + profile + '_' + year;
      const localRaw = localStorage.getItem(key);
      const localData = localRaw ? JSON.parse(localRaw) : null;
      const merged = mergeYearData(localData, cloudData);
      localStorage.setItem(key, JSON.stringify(merged));
      count++;
    });

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
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const prefix = 'calcoliPIVA_' + profile + '_';
      if (key && key.startsWith(prefix)) {
        const year = key.substring(prefix.length);
        const yearData = JSON.parse(localStorage.getItem(key));
        const docRef = _fs.doc(db, 'profiles', profile, 'years', year);
        await _fs.setDoc(docRef, cleanForFirestore(yearData));
        count++;
      }
    }
    setSyncStatus('online');
    console.log('Upload cloud:', count, 'anni per', profile);
  } catch (err) {
    console.error('syncAllToCloud error:', err);
    setSyncStatus('error');
  }
}
