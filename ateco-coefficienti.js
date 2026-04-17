// Tabella coefficienti redditività regime forfettario - DM 23/1/2015
// Esposto come window.ATECO_COEFFICIENTI per uso in app.js
(function () {
  const GRUPPI = [
    { id: 'g1', label: 'Industrie alimentari e delle bevande', coefficiente: 40, atecoHint: '(10 - 11)' },
    { id: 'g2', label: 'Commercio all\'ingrosso e al dettaglio', coefficiente: 40, atecoHint: '45 - (46.2-46.9) - (47.1-47.7) - 47.9' },
    { id: 'g3', label: 'Commercio ambulante di prodotti alimentari e bevande', coefficiente: 40, atecoHint: '47.81' },
    { id: 'g4', label: 'Commercio ambulante di altri prodotti', coefficiente: 54, atecoHint: '47.82 - 47.89' },
    { id: 'g5', label: 'Costruzioni e attività immobiliari', coefficiente: 86, atecoHint: '(41 - 42 - 43) - 68' },
    { id: 'g6', label: 'Intermediari del commercio', coefficiente: 62, atecoHint: '46.1' },
    { id: 'g7', label: 'Attività di servizi di alloggio e ristorazione', coefficiente: 40, atecoHint: '(55 - 56)' },
    { id: 'g8', label: 'Attività professionali, scientifiche, tecniche, sanitarie, di istruzione, servizi finanziari ed assicurativi', coefficiente: 78, atecoHint: '(64-66) - (69-75) - 85 - (86-88)' },
    { id: 'g9', label: 'Altre attività economiche', coefficiente: 67, atecoHint: '(01-03) - (05-09) - (12-33) - 35 - (36-39) - (49-53) - (58-63) - (77-82) - 84 - (90-99)' }
  ];

  function findGruppoByCoefficiente(coeff) {
    const target = Math.round(parseFloat(coeff) * 100) / 100;
    return GRUPPI.find(g => g.coefficiente === target) || null;
  }

  window.ATECO_COEFFICIENTI = {
    GRUPPI,
    findGruppoByCoefficiente,
    fonte: 'DM 23 gennaio 2015 - Allegato 4 (legge 190/2014)'
  };
})();
