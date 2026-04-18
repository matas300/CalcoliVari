/* Fatture: gestione storico, stati, numerazione progressiva (sub-project 3) */
(function () {
  const STORAGE_PREFIX = 'calcoliPIVA_';
  const STORAGE_SUFFIX = '_fatture';

  function storageKey(profile) {
    if (!profile) throw new Error('FattureStorico: profile richiesto');
    return STORAGE_PREFIX + profile + STORAGE_SUFFIX;
  }

  function load(profile) {
    try {
      const raw = localStorage.getItem(storageKey(profile));
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      const norm = typeof window.normalizeInvoice === 'function' ? window.normalizeInvoice : (x => x);
      return arr.map(norm);
    } catch (err) {
      console.warn('FattureStorico.load: errore parse', err);
      return [];
    }
  }

  function save(profile, fatture) {
    if (!Array.isArray(fatture)) throw new Error('FattureStorico.save: fatture deve essere array');
    localStorage.setItem(storageKey(profile), JSON.stringify(fatture));
    if (typeof window.syncProfileMetaToCloud === 'function') {
      try { window.syncProfileMetaToCloud(profile, 'fatture'); } catch (_) { /* sync best-effort */ }
    }
  }

  function nextProgressivo(anno, fatture) {
    const list = Array.isArray(fatture) ? fatture : [];
    const max = list
      .filter(f => Number(f.annoProgressivo) === Number(anno))
      .reduce((acc, f) => Math.max(acc, Number(f.progressivo) || 0), 0);
    return max + 1;
  }

  function formatNumero(anno, progressivo) {
    const a = Number(anno) || new Date().getFullYear();
    const p = Number(progressivo) || 1;
    return a + '/' + String(p).padStart(3, '0');
  }

  window.FattureStorico = {
    load,
    save,
    nextProgressivo,
    formatNumero,
    storageKey
  };
})();
