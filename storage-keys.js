// storage-keys.js — Builder centralizzato per chiavi localStorage profile-scoped
// Risolve DUP-5: 12+ pattern inline `'calcoliPIVA_' + profile + '_...'` sparsi in app.js
// + fatture-docs-feature.js, con divergenze sui fallback ('default' vs '_global').
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StorageKeys = factory();
    if (typeof window !== 'undefined') window.StorageKeys = root.StorageKeys;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PREFIX = 'calcoliPIVA_';
  function _p(profile) { return profile || '_global'; }
  return {
    PREFIX: PREFIX,
    yearData: function (profile, year) { return PREFIX + _p(profile) + '_' + year; },
    profileFiscal: function (profile) { return PREFIX + 'profile_' + _p(profile); },
    profileFiscalLegacy: function (profile) { return PREFIX + _p(profile) + '_profileFiscal'; },
    profileFiscalMigrated: function (profile) { return PREFIX + _p(profile) + '_profileFiscalMigrated'; },
    fattureEmesse: function (profile) { return PREFIX + _p(profile) + '_fattureEmesse'; },
    clienti: function (profile) { return PREFIX + _p(profile) + '_clienti'; },
    giorniIncasso: function (profile) { return PREFIX + _p(profile) + '_giorniIncasso'; },
    icsExported: function (profile, year) { return PREFIX + _p(profile) + '_icsExported_' + year; },
    crossYearReminderDismissed: function (profile, year) { return PREFIX + _p(profile) + '_crossYearReminderDismissed_' + year; },
    adeConservationAcknowledged: function (profile) { return PREFIX + _p(profile) + '_adeConservationAcknowledged'; },
    profilePrefix: function (profile) { return PREFIX + _p(profile) + '_'; }
  };
}));
