// ═══════════════════ Firebase Sync Module ═══════════════════

// ── Firebase Configuration ──
// Incolla qui la tua configurazione Firebase dal Console:
// https://console.firebase.google.com → Impostazioni progetto → Web app
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
let syncStatusEl = null;

// ── Init ──
async function initFirebase() {
  try {
    // Check if config is still placeholder
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
      console.warn('Firebase: config non configurata, sync disabilitato');
      setSyncStatus('disabled');
      return false;
    }

    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js');
    const { getFirestore, enableIndexedDbPersistence } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');

    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);

    // Enable offline persistence
    try {
      await enableIndexedDbPersistence(db);
    } catch (err) {
      if (err.code === 'failed-precondition') {
        console.warn('Firebase: persistence failed (multiple tabs open)');
      } else if (err.code === 'unimplemented') {
        console.warn('Firebase: persistence not supported in this browser');
      }
    }

    firebaseReady = true;
    setSyncStatus('online');
    console.log('Firebase inizializzato');
    return true;
  } catch (err) {
    console.error('Firebase init error:', err);
    setSyncStatus('error');
    return false;
  }
}

// ── Sync Status Indicator ──
function setSyncStatus(status) {
  syncStatusEl = syncStatusEl || document.getElementById('syncStatus');
  if (!syncStatusEl) return;

  const states = {
    online:   { color: '#4ecca3', title: 'Sincronizzato', text: 'Sync' },
    syncing:  { color: '#f5a623', title: 'Sincronizzazione...', text: 'Sync...' },
    error:    { color: '#e94560', title: 'Errore sync', text: 'Errore' },
    offline:  { color: '#aaa',    title: 'Offline', text: 'Offline' },
    disabled: { color: '#555',    title: 'Firebase non configurato', text: 'No sync' }
  };

  const s = states[status] || states.offline;
  syncStatusEl.innerHTML = `<span class="sync-dot" style="background:${s.color}"></span><span class="sync-text">${s.text}</span>`;
  syncStatusEl.title = s.title;
}

// ── Write to Firestore ──
async function syncToCloud(profile, year, yearData) {
  if (!firebaseReady || !db) return;

  try {
    setSyncStatus('syncing');
    const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
    const docRef = doc(db, 'profiles', profile, 'years', String(year));
    await setDoc(docRef, yearData);
    setSyncStatus('online');
  } catch (err) {
    console.error('syncToCloud error:', err);
    setSyncStatus('error');
  }
}

// ── Read from Firestore ──
async function syncFromCloud(profile, year) {
  if (!firebaseReady || !db) return null;

  try {
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
    const docRef = doc(db, 'profiles', profile, 'years', String(year));
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error('syncFromCloud error:', err);
    return null;
  }
}

// ── Sync all years for a profile ──
async function syncAllFromCloud(profile) {
  if (!firebaseReady || !db) return;

  try {
    setSyncStatus('syncing');
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
    const colRef = collection(db, 'profiles', profile, 'years');
    const snapshot = await getDocs(colRef);

    snapshot.forEach(docSnap => {
      const year = docSnap.id;
      const cloudData = docSnap.data();
      const key = 'calcoliPIVA_' + profile + '_' + year;
      const localRaw = localStorage.getItem(key);
      const localData = localRaw ? JSON.parse(localRaw) : null;

      // Cloud wins if local doesn't exist; otherwise merge (cloud overwrites)
      if (!localData || JSON.stringify(cloudData) !== JSON.stringify(localData)) {
        localStorage.setItem(key, JSON.stringify(cloudData));
      }
    });

    setSyncStatus('online');
  } catch (err) {
    console.error('syncAllFromCloud error:', err);
    setSyncStatus('error');
  }
}
