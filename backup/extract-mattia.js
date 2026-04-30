// Backup profilo Mattia — incolla in DevTools → Console.
// Estrae tutte le chiavi calcoliPIVA_Mattia_* da localStorage e scarica 2 file JSON:
//  - full backup (tutto)
//  - tasse accantonate (solo dict yearData.accantonamento per anno)
(function () {
  'use strict';
  const PROFILE = 'Mattia';
  const PREFIX = 'calcoliPIVA_' + PROFILE + '_';
  const fullDump = {};
  const tasseAccantonate = {};
  let yearCount = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    const raw = localStorage.getItem(key);
    fullDump[key] = raw;

    // Se la chiave è un anno (es. calcoliPIVA_Mattia_2024) estrai accantonamento
    const yearMatch = key.match(/^calcoliPIVA_Mattia_(\d{4})$/);
    if (yearMatch) {
      yearCount++;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.accantonamento && typeof parsed.accantonamento === 'object') {
          tasseAccantonate[yearMatch[1]] = parsed.accantonamento;
        }
      } catch (e) { console.warn('Skip anno', yearMatch[1], e); }
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  function download(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  console.log('Backup Mattia: chiavi totali =', Object.keys(fullDump).length, 'di cui', yearCount, 'anni');
  console.log('Anni con accantonamento:', Object.keys(tasseAccantonate));

  download('mattia-full-backup-' + ts + '.json', {
    profile: PROFILE,
    timestamp: new Date().toISOString(),
    keys: fullDump
  });
  download('mattia-tasse-accantonate-' + ts + '.json', {
    profile: PROFILE,
    timestamp: new Date().toISOString(),
    accantonamento: tasseAccantonate
  });

  console.log('OK — 2 file scaricati. Spostali nella cartella backup/.');
})();
