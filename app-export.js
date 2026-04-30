// app-export.js — Export/Import dati profilo (backup JSON)
// Estratto da app.js per separare data IO dal core (SRP).
// Caricato DOPO app.js in index.html: usa currentProfile, profileStorageKey,
// clearYearDataCache, loadProfileFiscalData, loadData, recalcAll come globali.

(function () {
  'use strict';

  function exportData() {
    var allData = {};
    var prefix = window.StorageKeys.profilePrefix(currentProfile);
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.startsWith(prefix)) allData[key] = JSON.parse(localStorage.getItem(key));
    }
    var profileKey = profileStorageKey(currentProfile);
    if (localStorage.getItem(profileKey)) allData[profileKey] = JSON.parse(localStorage.getItem(profileKey));
    var blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'calcoli_piva_backup.json';
    a.click();
  }

  function importData(e) {
    if (typeof clearYearDataCache === 'function') clearYearDataCache();
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var allData = JSON.parse(ev.target.result);
      var prefix = window.StorageKeys.profilePrefix(currentProfile);
      var profileKey = profileStorageKey(currentProfile);
      for (var key in allData) {
        if (!Object.prototype.hasOwnProperty.call(allData, key)) continue;
        var val = allData[key];
        if (key.startsWith(prefix) || key === profileKey) {
          localStorage.setItem(key, JSON.stringify(val));
        }
      }
      if (typeof loadProfileFiscalData === 'function') loadProfileFiscalData();
      if (typeof loadData === 'function') loadData();
      if (typeof recalcAll === 'function') recalcAll();
      alert('Dati importati!');
    };
    reader.readAsText(file);
  }

  if (typeof window !== 'undefined') {
    window.exportData = exportData;
    window.importData = importData;
  }
})();
