'use strict';

// Official INPS 2025 values for artigiani:
// contribFissi: 4460.64/yr, minimaleInps: 18415, aliqContributi: 0.2372 (24% + adjustment)
// For commercianti: slightly different rates

var artigianoStandard2025 = {
  year: 2025,
  settings: {
    regime: 'forfettario',
    coefficiente: 67,
    impostaSostitutiva: 15,
    dailyRate: 300,
    inpsMode: 'artigiani_commercianti',
    inpsCategoria: 'artigiano',
    usaInpsUfficiale: 1,
    contribFissi: 4460.64,
    minimaleInps: 18415,
    aliqContributi: 23.72,
    riduzione35: 0,
    haRedditoDipendente: 0,
    limiteForfettario: 85000,
    anagrafica: {
      codiceFiscale: 'RSSMRA80A01H501U',
      cognome: 'Rossi', nome: 'Mario', sesso: 'M',
      dataNascita: '1980-01-01', comuneNascita: 'Roma', provNascita: 'RM',
      residenzaVia: 'Via Test 1', residenzaComune: 'Roma', residenzaProv: 'RM', residenzaCap: '00100',
      domicilioFiscaleVia: '', domicilioFiscaleComune: '', domicilioFiscaleProv: '', domicilioFiscaleCap: '',
      telefono: '333123456', email: 'mario@test.it', statoCivile: 'celibe'
    },
    attivita: {
      codiceAteco: '62.01.00', descrizioneAttivita: 'Produzione di software', dataInizioAttivita: '2020-01-01',
      sedeVia: 'Via Test 1', sedeComune: 'Roma', sedeProv: 'RM', sedeCap: '00100'
    }
  },
  fatture: {
    '1': [{ importo: 5000, desc: 'Progetto A', pagMese: 1, pagAnno: 2025 }],
    '2': [{ importo: 5000, desc: 'Progetto B', pagMese: 2, pagAnno: 2025 }],
    '3': [{ importo: 5000, desc: 'Progetto C', pagMese: 3, pagAnno: 2025 }],
    '4': [{ importo: 5000, desc: 'Progetto D', pagMese: 4, pagAnno: 2025 }],
    '5': [{ importo: 5000, desc: 'Progetto E', pagMese: 5, pagAnno: 2025 }],
    '6': [{ importo: 5000, desc: 'Progetto F', pagMese: 6, pagAnno: 2025 }],
    '7': [{ importo: 5000, desc: 'Progetto G', pagMese: 7, pagAnno: 2025 }],
    '8': [{ importo: 5000, desc: 'Progetto H', pagMese: 8, pagAnno: 2025 }],
    '9': [{ importo: 5000, desc: 'Progetto I', pagMese: 9, pagAnno: 2025 }],
    '10': [{ importo: 5000, desc: 'Progetto L', pagMese: 10, pagAnno: 2025 }],
    '11': [{ importo: 5000, desc: 'Progetto M', pagMese: 11, pagAnno: 2025 }],
    '12': [{ importo: 5000, desc: 'Progetto N', pagMese: 12, pagAnno: 2025 }]
  },
  pagamenti: [],
  accantonamento: {},
  dichiarazione: {
    tipoDichiarazione: 'ordinaria',
    dataPresentazione: null,
    flags: { annoMisto: false, imposteEstere: false, altriCrediti: false },
    contiEsteri: [],
    coniuge: null,
    familiariCarico: [],
    overrides: {},
    computed: null,
    statoCompilazione: 'bozza'
  }
};
// ricavi totali: 60000, reddito lordo: 60000 * 0.67 = 40200

var commercianteRiduzione2025 = JSON.parse(JSON.stringify(artigianoStandard2025));
commercianteRiduzione2025.settings.inpsCategoria = 'commerciante';
commercianteRiduzione2025.settings.riduzione35 = 1;
commercianteRiduzione2025.settings.anagrafica.codiceFiscale = 'VRDLGI75B15F205S';
commercianteRiduzione2025.settings.anagrafica.cognome = 'Verdi';
commercianteRiduzione2025.settings.anagrafica.nome = 'Luigi';
commercianteRiduzione2025.settings.attivita.codiceAteco = '47.11.10';
commercianteRiduzione2025.settings.attivita.descrizioneAttivita = 'Commercio al dettaglio';

var gestSepStartup2025 = JSON.parse(JSON.stringify(artigianoStandard2025));
gestSepStartup2025.settings.inpsMode = 'gestione_separata';
gestSepStartup2025.settings.inpsCategoria = null;
gestSepStartup2025.settings.impostaSostitutiva = 5; // start-up rate
gestSepStartup2025.settings.contribFissi = 0;
gestSepStartup2025.settings.minimaleInps = 0;
gestSepStartup2025.settings.aliqContributi = 26.23; // gest.sep. rate 2025
gestSepStartup2025.settings.anagrafica.codiceFiscale = 'BNCLSN90C17H501X';
gestSepStartup2025.settings.anagrafica.cognome = 'Bianchi';
gestSepStartup2025.settings.anagrafica.nome = 'Alessandra';

if (typeof module !== 'undefined') {
  module.exports = { artigianoStandard2025, commercianteRiduzione2025, gestSepStartup2025 };
}
