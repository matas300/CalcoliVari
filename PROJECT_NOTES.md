# Calcoli P.IVA - Note operative

## Caso di riferimento

- Profilo principale: Mattia Rossi
- CF: RSSMTT96P21A944T
- P.IVA: 04239481205
- ATECO: 62.10.00
- 2024: regime ordinario + reddito da lavoro dipendente
- 2025+: regime forfettario
- Gestione previdenziale: INPS Artigiani

## Regole chiave

- Nel forfettario:
  - reddito lordo = incassato x coefficiente di redditivita
  - imponibile fiscale = reddito lordo - contributi previdenziali obbligatori deducibili
  - imposta sostitutiva = imponibile fiscale x aliquota sostitutiva
- Gli acconti vanno sempre confrontati in due modalita:
  - storico
  - previsionale
- Gli anni chiusi vanno letti in consuntivo.

## Distinzione prodotto

- `Profilo fiscale`: source of truth dei parametri strutturali del profilo
- `Impostazioni annuali`: variabili operative dell anno selezionato
- `Scadenziario`: calendario + confronto storico/previsionale + pagamenti collegati

## Scadenziario multi-anno

- La vista principale dello `Scadenziario` va letta per anno di competenza fiscale, non per semplice anno di pagamento.
- Di default vanno mostrati solo gli anni fiscalmente rilevanti in forfettario.
- Un anno e rilevante se ha almeno una di queste ancore reali:
  - fatture / ricavi reali sopra zero
  - import storico Fiscozen o prospetti legati a quell anno di competenza
- Gli anni solo creati in storage o con impostazioni vuote non devono comparire.
- Eccezione voluta: va mantenuto visibile anche l anno immediatamente successivo all ultimo anno con ricavi, perche puo contenere saldi e uscite cross-year.
- Gli anni `ordinario` e `misto` restano disponibili solo tramite toggle e vanno trattati come storico di supporto, non come base automatica del forfettario.

## UI / tema

- Il tema visuale dell app e stato centralizzato nei token globali CSS in `style.css`.
- Font:
  - `Satoshi` per titoli e heading
  - `Inter` per testo UI, tabelle, input e numeri
- Palette corrente:
  - fondo carbone / petrolio
  - superfici scure a contrasto
  - accento teal desaturato
  - stati pagato / warning / errore separati in modo leggibile
- Il tab `Scadenziario` ha regole dedicate per evitare overflow di testi, badge e controlli sia desktop sia mobile.

## Fonti mock locali

- `fiscozen/tasse_pagate.json`
- `fiscozen/tasse_future.json`
- `fiscozen/mattia_2024_summary.json`
- `fiscozen/mattia_2025_summary.json`
- `fiscozen/mattia_f24_breakdown_2025.json`

## Limiti aperti

- Gli F24 aggregati Fiscozen non hanno sempre il breakdown monetario per singola riga.
- Il bilancino 2025 di Mattia va ancora riallineato ai dati fatture salvati in app se si vuole chiudere anche il confronto mensile, non solo quello annuale.
