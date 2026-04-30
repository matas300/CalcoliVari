// Restore SOLO tasse accantonate per profilo Mattia.
// Incolla in DevTools → Console DOPO aver fatto wipe + login fresco come Mattia.
// Apre file picker → seleziona mattia-tasse-accantonate-*.json.
(function () {
  'use strict';
  const PROFILE = 'Mattia';

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

      if (payload.profile !== PROFILE) {
        if (!confirm('Il backup è del profilo "' + payload.profile + '" ma stai ripristinando per "' + PROFILE + '". Continuare?')) return;
      }
      const dict = payload.accantonamento || {};
      const years = Object.keys(dict);
      if (!years.length) { console.warn('Nessun anno nel backup.'); return; }

      let touched = 0, skipped = 0;
      for (const year of years) {
        const key = 'calcoliPIVA_' + PROFILE + '_' + year;
        const raw = localStorage.getItem(key);
        let yearData;
        if (raw) {
          try { yearData = JSON.parse(raw); }
          catch (e) { console.warn('Skip anno', year, '— JSON corrotto'); skipped++; continue; }
        } else {
          // Anno non esiste post-wipe → lo creiamo minimale
          yearData = { settings: {}, accantonamento: {} };
        }
        yearData.accantonamento = dict[year];
        localStorage.setItem(key, JSON.stringify(yearData));
        touched++;
        console.log('Restored accantonamento per', year, '→', Object.keys(dict[year]).length, 'voci');
      }
      console.log('OK — ' + touched + ' anni ripristinati (' + skipped + ' skip). Reload in 2s...');
      input.remove();
      setTimeout(() => location.reload(), 2000);
    };
    reader.readAsText(file);
  };

  input.click();
  console.log('Seleziona mattia-tasse-accantonate-*.json dal file picker.');
})();
