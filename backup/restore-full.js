// Restore COMPLETO profilo Mattia (annulla un wipe).
// Incolla in DevTools → Console. Apre file picker → seleziona mattia-full-backup-*.json.
// ATTENZIONE: SOVRASCRIVE tutte le chiavi calcoliPIVA_Mattia_* attualmente in localStorage.
(function () {
  'use strict';
  const PROFILE = 'Mattia';
  const PREFIX = 'calcoliPIVA_' + PROFILE + '_';

  if (!confirm('Restore COMPLETO profilo ' + PROFILE + '. Sovrascriverà i dati attuali in localStorage. Continuare?')) {
    console.log('Annullato.');
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.onchange = function () {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      let payload;
      try { payload = JSON.parse(reader.result); }
      catch (e) { console.error('JSON invalido:', e); return; }

      const keys = payload.keys || {};
      const names = Object.keys(keys);
      if (!names.length) { console.warn('Nessuna chiave nel backup.'); return; }

      // Pulisci prima tutte le chiavi del profilo
      const existing = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) existing.push(k);
      }
      existing.forEach(k => localStorage.removeItem(k));
      console.log('Cleared', existing.length, 'chiavi esistenti.');

      let restored = 0;
      for (const k of names) {
        if (!k.startsWith(PREFIX)) {
          console.warn('Skip chiave fuori prefisso:', k);
          continue;
        }
        localStorage.setItem(k, keys[k]);
        restored++;
      }
      console.log('Restored', restored, 'chiavi. Reload in 2s...');
      input.remove();
      setTimeout(() => location.reload(), 2000);
    };
    reader.readAsText(file);
  };

  input.click();
  console.log('Seleziona mattia-full-backup-*.json dal file picker.');
})();
