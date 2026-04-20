/* Fatture migration — legacy monthly rows → fattureEmesse */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'calcoliPIVA_';
  var STORAGE_SUFFIX = '_fattureEmesse';

  function storageKey(profile) {
    return STORAGE_PREFIX + profile + STORAGE_SUFFIX;
  }

  function loadFattureEmesse(profile) {
    try {
      var raw = localStorage.getItem(storageKey(profile));
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function saveFattureEmesse(profile, arr) {
    localStorage.setItem(storageKey(profile), JSON.stringify(arr));
  }

  function makeLegacyId(year, month, idx, importoCents) {
    return 'legacy_' + year + '_' + month + '_' + idx + '_' + importoCents;
  }

  function migrateLegacyYear(profile, year, yearData) {
    if (!profile || !yearData || !yearData.fatture) return { migrated: 0 };
    var existing = loadFattureEmesse(profile);
    var existingIds = {};
    for (var i = 0; i < existing.length; i++) existingIds[existing[i].id] = true;

    var migrated = 0;
    for (var m = 1; m <= 12; m++) {
      var rows = yearData.fatture[String(m)] || yearData.fatture[m] || [];
      if (!Array.isArray(rows)) continue;
      for (var idx = 0; idx < rows.length; idx++) {
        var r = rows[idx];
        if (r && r.invoiceId) continue;
        var importo = Number(r && r.importo) || 0;
        if (importo === 0) continue;
        var importoCents = Math.round(importo * 100);
        var id = makeLegacyId(year, m, idx, importoCents);
        if (existingIds[id]) continue;

        existing.push({
          id: id,
          numero: '\u2014',
          data: year + '-' + String(m).padStart(2, '0') + '-01',
          anno: year,
          annoProgressivo: year,
          progressivo: 0,
          righe: [{ descrizione: (r.desc || 'Incasso'), quantita: 1, prezzoUnitario: importo }],
          clienteSnapshot: null,
          stato: 'pagata',
          tipoDocumento: 'TD01',
          pagMese: (r.pagMese ? Number(r.pagMese) : m),
          pagAnno: (r.pagAnno ? Number(r.pagAnno) : year),
          dataInvioSdi: null,
          dataPagamento: year + '-' + String(m).padStart(2, '0') + '-01',
          origine: 'legacy-migrated',
          ritenuta: 0,
          contributoIntegrativo: 0,
          marcaDaBollo: false,
          fatturaOriginaleId: null,
          ncIds: [],
          ncTotaleImporto: 0
        });
        existingIds[id] = true;
        migrated++;
      }
    }

    if (migrated > 0) saveFattureEmesse(profile, existing);
    return { migrated: migrated };
  }

  window.FattureMigration = {
    migrateLegacyYear: migrateLegacyYear
  };
})();
