// forfettario-rules.js — Costanti e helper fiscali condivisi per regime forfettario
// Risolve DUP-3 (riduzione 35% INPS), DUP-7 (BOLLO_THRESHOLD 77.47), DUP-11 (soglie acconto).
// Fonti: art. 1 c. 67/77 L. 190/2014; D.M. 17/06/2014 art. 6; art. 17 c. 3 DPR 435/2001.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ForfettarioRules = factory();
    if (typeof window !== 'undefined') window.ForfettarioRules = root.ForfettarioRules;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Soglia bollo virtuale (D.M. 17/06/2014 art. 6): bollo 2€ dovuto se
  // imponibile > 77,47 € (operatore strict, "superiore a").
  var BOLLO_THRESHOLD = 77.47;

  // Soglie acconto (art. 17 c. 3 DPR 435/2001):
  // - imposta <= 51,65 € → nessun acconto dovuto
  // - 51,65 < imposta <= 257,52 € → unico acconto a novembre 100%
  // - imposta > 257,52 € → split 40% giugno + 60% novembre
  var ACCONTO_THRESHOLD_NONE = 51.65;
  var ACCONTO_THRESHOLD_SINGLE = 257.52;

  // Riduzione 35% INPS (art. 1 c. 77 L. 190/2014): vale SOLO per artigiani/commercianti.
  // Per gestione separata NON si applica (R-Bug1 audit refactor 2026-04-30).
  // Accetta sia 'artigiani_commercianti' (canonico) sia 'artcom' (legacy alias).
  function getRiduzioneFactor(settings) {
    if (!settings) return 1;
    var attiva = (settings.riduzione35 == 1 || settings.riduzione35 === true);
    var artComm = (settings.inpsMode === 'artigiani_commercianti'
      || settings.inpsMode === 'artcom');
    return (attiva && artComm) ? 0.65 : 1;
  }

  // Test se il bollo virtuale è dovuto su una fattura
  // (art. 1 c. 67 L. 190/2014 + D.M. 17/06/2014).
  function isBolloDovuto(imponibile, marcaDaBollo) {
    return !!marcaDaBollo && Number(imponibile) > BOLLO_THRESHOLD;
  }

  return {
    BOLLO_THRESHOLD: BOLLO_THRESHOLD,
    ACCONTO_THRESHOLD_NONE: ACCONTO_THRESHOLD_NONE,
    ACCONTO_THRESHOLD_SINGLE: ACCONTO_THRESHOLD_SINGLE,
    getRiduzioneFactor: getRiduzioneFactor,
    isBolloDovuto: isBolloDovuto
  };
}));
