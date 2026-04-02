const { performance } = require('perf_hooks');

// Mock localStorage
const store = {};
for (let i = 2000; i < 2050; i++) {
  store[`calcoliPIVA_TestProfile_${i}`] = JSON.stringify({
    settings: { someParam: "value", year: i },
    calendar: { "1-1": "8", "2-2": "F" },
    fatture: { 1: [{ importo: 1000 }] },
    accantonamento: {},
    pagamenti: [],
    budget: [],
    spese: []
  });
}
for (let i = 0; i < 1000; i++) {
  store[`other_key_${i}`] = JSON.stringify({ dummy: true });
}

const localStorage = {
  getItem: (k) => store[k] || null,
  key: (i) => Object.keys(store)[i],
  get length() { return Object.keys(store).length; }
};

// Mock firebase _fs
const db = {};
const _fs = {
  doc: (db, coll1, p, coll2, y) => `${coll1}/${p}/${coll2}/${y}`,
  setDoc: async (docRef, data) => {
    // simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

let firebaseReady = true;

function cleanForFirestore(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function setSyncStatus() {}

async function originalSyncAllToCloud(profile) {
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
      const yearData = JSON.parse(localStorage.getItem(key));
      if (!yearData) continue;
      const docRef = _fs.doc(db, 'profiles', profile, 'years', year);
      await _fs.setDoc(docRef, cleanForFirestore(yearData));
      count++;
    }
    setSyncStatus('online');
  } catch (err) {
    console.error('syncAllToCloud error:', err);
    setSyncStatus('error');
  }
}

async function optimizedSyncAllToCloud(profile) {
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

    // PREPARE PHASE
    const payloads = [];
    for (const key of keys) {
      const year = key.substring(prefix.length);
      const yearData = JSON.parse(localStorage.getItem(key));
      if (!yearData) continue;
      payloads.push({ year, data: cleanForFirestore(yearData) });
    }

    // EXECUTE PHASE
    const promises = payloads.map(p => {
      const docRef = _fs.doc(db, 'profiles', profile, 'years', p.year);
      return _fs.setDoc(docRef, p.data).then(() => { count++; });
    });

    await Promise.all(promises);

    setSyncStatus('online');
  } catch (err) {
    console.error('syncAllToCloud error:', err);
    setSyncStatus('error');
  }
}

async function run() {
  const start1 = performance.now();
  await originalSyncAllToCloud('TestProfile');
  const end1 = performance.now();
  console.log(`Original: ${end1 - start1} ms`);

  const start2 = performance.now();
  await optimizedSyncAllToCloud('TestProfile');
  const end2 = performance.now();
  console.log(`Optimized: ${end2 - start2} ms`);
}

run();
