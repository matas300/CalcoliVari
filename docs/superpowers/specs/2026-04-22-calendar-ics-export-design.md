# Calendar ICS Export — Design

**Data:** 2026-04-22
**Branch target:** `fatture-import-redesign` (o branch dedicato `feature/calendar-ics`)
**Goal:** Esportare tutte le scadenze fiscali dell'anno selezionato come file `.ics` importabile in Google Calendar, con reminder automatici. Import una volta l'anno, zero OAuth.

---

## 1. Scope

**Feature inclusa:**
- Modulo puro `calendar-export.js` che produce stringa `.ics` v2.0 (RFC 5545) a partire dallo schedule forfettario + entry derivate (bollo trimestrale, INAIL, CdC).
- UI entry point 1: pulsante "📅 Esporta calendario" nel tab **Scadenziario** (header card).
- UI entry point 2: sezione "Calendario scadenze" nel tab **Impostazioni** con pulsante + testo guida.
- Banner dashboard condizionale: appare solo a **gennaio** se l'export per l'anno corrente non è ancora stato fatto. Sparisce solo dopo click "Scarica .ics" (flag localStorage per-profilo+anno).
- Reminder: 1 mese, 2 settimane, 1 settimana, 1 giorno prima di ogni scadenza (4 VALARM per evento).
- UID deterministici per re-import safe: nessun duplicato se l'utente reimporta lo stesso anno.

**Fuori scope (backlog post-launch):**
- Sync bidirezionale Google Calendar via OAuth2 (opzione B esplorata in brainstorming, rimandata).
- Auto-remove evento quando "segna pagato" nell'app (richiede OAuth).
- Export scadenze di regime **ordinario** (solo forfettario in v1).
- Export reminder fatture (incassi previsti).
- Export multi-anno in singolo file.

---

## 2. Architettura

```
┌──────────────────────────────────────────────────────────┐
│ scadenziario engine (existing, in app.js)                │
│   buildForfettarioScheduleForYear(year) → rows           │
│   + bollo trimestrale, INAIL, CdC (condizionati)         │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ calendar-export.js (NEW)                                  │
│   buildIcsForYear(year, profile) → string                │
│   _eventToVevent(event) → string                         │
│   _escape(s), _formatDate(d), _deterministicUid(...)     │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ app.js — UI wiring (NEW)                                  │
│   exportScadenzeIcs(year)  → blob download + set flag    │
│   renderIcsBanner()        → banner gennaio su dashboard │
│   isIcsDownloaded(profile, year) → bool                  │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ UI: Scadenziario btn + Impostazioni section + Banner      │
└──────────────────────────────────────────────────────────┘
```

**Responsabilità:**
- `calendar-export.js` è puro, testabile in Node: prende array di "scadenza event" normalizzati e produce stringa ICS. **Non legge localStorage, non tocca DOM, non importa da app.js.**
- `app.js` è il glue: raccoglie gli event dallo schedule engine, li normalizza, chiama `CalendarExport.buildIcsForYear`, crea blob, triggera download, setta flag.

---

## 3. Normalizzazione event input

Ogni riga dello schedule forfettario viene mappata a un "calendar event" piatto:

```js
{
  uid: 'scadenza-2026-imposta-acc2@calcoli-piva',  // deterministico
  dateIso: '2026-11-30',                             // YYYY-MM-DD
  title: 'Imposta sostitutiva — 2° acconto 2026',    // umano
  description: 'Codice tributo 1791 — F24 sezione Erario\nGenerato da Calcoli P.IVA.',
  type: 'imposta_acc2'                               // per UID + debug
}
```

**Mappatura tipo → UID → titolo (per year N):**

| schedule key               | UID suffix              | title                                              | codice tributo | data        |
|----------------------------|-------------------------|----------------------------------------------------|----------------|-------------|
| `imposta_saldo`            | `imposta-saldo`         | Imposta sostitutiva — saldo N−1                   | 1792           | 30/06/N     |
| `imposta_acc1`             | `imposta-acc1`          | Imposta sostitutiva — 1° acconto N                | 1790           | 30/06/N     |
| `imposta_acc2`             | `imposta-acc2`          | Imposta sostitutiva — 2° acconto N                | 1791           | 30/11/N     |
| `inps_fissi_q1`            | `inps-fissi-q1`         | INPS fissi — 1ª rata N                            | —              | 16/05/N     |
| `inps_fissi_q2`            | `inps-fissi-q2`         | INPS fissi — 2ª rata N                            | —              | 20/08/N     |
| `inps_fissi_q3`            | `inps-fissi-q3`         | INPS fissi — 3ª rata N                            | —              | 16/11/N     |
| `inps_fissi_q4`            | `inps-fissi-q4`         | INPS fissi — 4ª rata N (scade feb N+1)            | —              | 16/02/N+1   |
| `contributi_saldo`         | `contributi-saldo`      | Contributi INPS eccedenza — saldo N−1             | —              | 30/06/N     |
| `contributi_acc1`          | `contributi-acc1`       | Contributi INPS eccedenza — 1° acconto N          | —              | 30/06/N     |
| `contributi_acc2`          | `contributi-acc2`       | Contributi INPS eccedenza — 2° acconto N          | —              | 30/11/N     |
| `bollo_q1` ... `bollo_q4`  | `bollo-q1` ... `-q4`    | Imposta di bollo fatture — {1,2,3,4}° trimestre   | 2521-2524      | vedi sotto  |
| `inail`                    | `inail`                 | INAIL — premio annuale                            | —              | 16/02/N     |
| `camera_commercio`         | `camera-commercio`      | Diritto camera di commercio                        | 3850           | 30/06/N     |

**Date bollo trimestrali:** 31/05, 20/08, 30/11, 28/02 (N+1 per Q4).

**Filtri**:
- `inps_fissi_*` inclusi solo se `settings.inpsMode === 'artigiani_commercianti'`.
- `bollo_qX` inclusi solo se `settings.scadenziarioBollo === true` **e** la soglia 77,47 € è superata in quel trimestre (calcolo già fatto dall'engine esistente).
- `inail` incluso solo se `settings.scadenziarioInail === true`.
- `camera_commercio` incluso solo se `settings.scadenziarioCameraDiCommercio === true`.
- Tutti gli import condizionati al regime `forfettario`. Se anno in `ordinario`, export vuoto → messaggio "regime ordinario non supportato in v1".

---

## 4. Output `.ics` (RFC 5545)

### 4.1 Struttura

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Calcoli P.IVA//Scadenze Fiscali//IT
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:Europe/Rome
BEGIN:STANDARD
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
TZNAME:CET
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
TZNAME:CEST
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:scadenza-2026-imposta-acc2@calcoli-piva
DTSTAMP:20260101T000000Z
DTSTART;TZID=Europe/Rome:20261130T090000
DTEND;TZID=Europe/Rome:20261130T093000
SUMMARY:Imposta sostitutiva — 2° acconto 2026
DESCRIPTION:Codice tributo 1791 — F24 sezione Erario\nGenerato da Calcoli P.IVA.
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Scadenza fra 1 mese
TRIGGER:-P1M
END:VALARM
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Scadenza fra 2 settimane
TRIGGER:-P14D
END:VALARM
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Scadenza fra 1 settimana
TRIGGER:-P7D
END:VALARM
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Scadenza domani
TRIGGER:-P1D
END:VALARM
END:VEVENT
... altri VEVENT ...
END:VCALENDAR
```

### 4.2 Regole formato

- **Line ending**: CRLF (`\r\n`) come richiesto da RFC 5545.
- **Line folding**: riga > 75 ottetti viene splittata con `\r\n ` (spazio di continuazione). Applicato a `SUMMARY` e `DESCRIPTION`.
- **Escape caratteri in TEXT**: `\\` → `\\\\`, `;` → `\\;`, `,` → `\\,`, `\n` → `\\n`.
- **DTSTAMP** fisso: `{year}0101T000000Z` (1° gennaio anno evento, UTC). Output deterministico byte-per-byte al re-export.
- **UID**: `scadenza-{year}-{type}@calcoli-piva`. Stabile tra re-export → Google Calendar fa update invece di duplicare.
- **Filename download**: `scadenze-fiscali-{year}.ics`.

---

## 5. UI

### 5.1 Pulsante Scadenziario

Posizione: header della card Scadenziario, a destra del selettore "metodo acconti" già esistente.

Markup:
```html
<button class="btn btn-ghost" onclick="exportScadenzeIcs(currentYear)">
  📅 Esporta calendario
</button>
```

Behavior:
- Click → genera `.ics` via `CalendarExport.buildIcsForYear(year, profile)` → crea blob → triggera download → setta flag `calcoliPIVA_{profile}_icsExported_{year}` → toast "Calendario scaricato".
- Se regime = ordinario → toast warning "Export disponibile solo per forfettario in v1" e non scarica.

### 5.2 Sezione Impostazioni

Nuova card dopo la sezione "Scadenziario" esistente:

```
┌─────────────────────────────────────────────────────┐
│ 📅 Calendario scadenze                              │
│                                                      │
│ Scarica tutte le scadenze fiscali dell'anno come    │
│ file .ics e importalo in Google Calendar per        │
│ ricevere reminder automatici (1 mese / 2 settimane  │
│ / 1 settimana / 1 giorno prima).                    │
│                                                      │
│ Come importare su Google Calendar:                  │
│  1. Apri calendar.google.com                        │
│  2. Impostazioni (⚙️) → Importa ed esporta          │
│  3. Seleziona il file scaricato                     │
│  4. Scegli il calendario di destinazione            │
│                                                      │
│ Suggerito: 1 import all'anno, a gennaio.            │
│                                                      │
│       [ 📅 Scarica scadenze 2026 ]                  │
└─────────────────────────────────────────────────────┘
```

### 5.3 Banner dashboard

Posizione: **prima** di tutto il contenuto del tab Riepilogo/dashboard (sopra l'header dashboard e il donut).

Variante selezionata: **compatta (Variante 2 della preview)**.

```html
<div class="ics-banner" id="icsBanner" role="alert">
  <span class="icon">📅</span>
  <span class="msg"><strong>Nuovo anno 2026:</strong> scarica le scadenze fiscali per Google Calendar.</span>
  <span class="actions">
    <button class="primary" onclick="exportScadenzeIcs(currentYear)">Scarica .ics</button>
  </span>
</div>
```

Stile: già definito in `preview-banner-ics.html`, da portare in `style.css` come classe `.ics-banner`.

**Condizioni di visibilità** (controllate in `renderIcsBanner()`):
- Mese civile corrente `new Date().getMonth() === 0` (gennaio — indipendente dal picker anno)
- AND l'anno selezionato nel picker UI è uguale all'anno solare corrente (`currentYear === new Date().getFullYear()`) — così un utente che sta guardando il 2024 in gennaio 2026 non vede banner fuori contesto
- AND `!isIcsDownloaded(currentProfile, currentYear)` (flag localStorage non settato)

**Nessun pulsante "Nascondi"**: il banner scompare solo dopo click "Scarica .ics" (che setta il flag → `renderIcsBanner` ritorna null al prossimo render).

### 5.4 Flag localStorage

Chiave: `calcoliPIVA_{profile}_icsExported_{year}`
Valore: `'1'` (stringa) quando scaricato; assente altrimenti.

Helper:
```js
function isIcsDownloaded(profile, year) {
  return localStorage.getItem(`calcoliPIVA_${profile}_icsExported_${year}`) === '1';
}
function markIcsDownloaded(profile, year) {
  localStorage.setItem(`calcoliPIVA_${profile}_icsExported_${year}`, '1');
}
```

**Non sincronizzato su Firebase** (dev-only come il toggle hard-delete): il flag è locale, se uno logga da un altro device il banner ricompare finché non scarica di nuovo.

---

## 6. Testing

### 6.1 Unit test — `test/calendar-export.test.js`

Test cases:
1. `buildIcsForYear` produce stringa con `BEGIN:VCALENDAR` ... `END:VCALENDAR` con CRLF line endings.
2. Header statico: `VERSION:2.0`, `PRODID`, `CALSCALE:GREGORIAN`, blocco VTIMEZONE Europe/Rome.
3. Forfettario minimal (solo imposta, no INPS): 3 VEVENT (saldo, acc1, acc2).
4. Forfettario artigiano: 3 imposta + 4 INPS fissi + (se imponibile > minimale) 3 contributi = 10 VEVENT.
5. Escape chars: title con `,` `;` `\n` → correttamente escaped.
6. Line folding: description lunga → split a 75 ottetti con `\r\n ` prefix.
7. UID deterministici: due chiamate con stesso input producono stesso UID.
8. DTSTAMP fisso: `{year}0101T000000Z` invariato tra due chiamate consecutive.
9. VALARM count: esattamente 4 per VEVENT, triggers `-P1M`, `-P14D`, `-P7D`, `-P1D`.
10. Regime ordinario: `buildIcsForYear` ritorna `null` (caller lato app.js mostra toast warning e non scarica).
11. Condizionali: `inpsMode=gestione_separata` → niente VEVENT `inps_fissi_*`.
12. Condizionali: `scadenziarioBollo=false` → niente VEVENT bollo.
13. Condizionali: bollo abilitato ma soglia non superata in Q2 → niente VEVENT `bollo_q2`.
14. Dates corrette: 4ª rata INPS anno N è datata 16/02/N+1.

### 6.2 Smoke test manuale

1. Profilo MattiaTest, anno 2026, forfettario artigiano.
2. Scadenziario tab → click "📅 Esporta calendario" → file `scadenze-fiscali-2026.ics` scaricato.
3. Apri `calendar.google.com` → Impostazioni → Importa ed esporta → seleziona file → importa nel "Calendario personale".
4. Verifica:
   - 10 eventi visibili (3 imposta + 4 INPS fissi + 3 contributi — posto che imponibile 2025 supera il minimale).
   - Ogni evento alle 09:00 Europe/Rome, durata 30 min.
   - Click su un evento → 4 reminder configurati (1 mese, 2 settimane, 1 settimana, 1 giorno).
   - Titoli umani ("Imposta sostitutiva — 2° acconto 2026").
   - Descrizione con codice tributo.
5. Re-scarica e re-importa stesso file → Google chiede "aggiorna evento esistente?" → no duplicati.
6. Profilo MattiaTest, torna su dashboard in gennaio simulato (mock `Date`) → banner appare.
7. Click "Scarica .ics" dal banner → flag settato, banner sparisce al prossimo render.
8. Reload pagina → banner ancora nascosto (flag persistito).

---

## 7. File nuovi / modificati

**Nuovi:**
- `calendar-export.js` (~300 righe stimate, modulo IIFE puro)
- `test/calendar-export.test.js` (~300 righe)

**Modificati:**
- `app.js`: aggiunta `exportScadenzeIcs`, `renderIcsBanner`, `isIcsDownloaded`, `markIcsDownloaded`; hook in `renderDashboard` (o equivalente) + hook in `renderScadenziario` per pulsante + hook in `renderImpostazioni` per sezione.
- `style.css`: classe `.ics-banner` (portata dalla preview).
- `index.html`: aggiunta `<script src="calendar-export.js"></script>` prima di `app.js`.
- `CLAUDE.md`: nuova sezione "Calendar ICS export" sotto "Scadenziario Engine".

---

## 8. Rischi e mitigazioni

| Rischio | Mitigazione |
|---------|-------------|
| Google Calendar rifiuta file per line-ending errati (LF invece di CRLF) | Test unit verifica CRLF; output usa `\r\n` costante |
| Re-import crea duplicati | UID deterministici stabili tra export |
| Utente scarica a gennaio ma cambia scadenziario dopo (es. attiva bollo) → eventi mancanti in Calendar | Accettato: feature è "set-and-forget", può ri-scaricare e re-importare quando serve (UID stabili → update) |
| Fuso orario errato (es. sviluppo in UTC, produzione in Europe/Rome) | VTIMEZONE incluso esplicitamente nel file, DTSTART usa `TZID=Europe/Rome` |
| Flag non sincronizzato → banner ricompare su device diverso | Accettato per v1 (dev-only, come hard-delete toggle). Utente può ri-scaricare senza duplicati |
| Caratteri speciali nel titolo (es. `&`, apostrofi) | Test specifici per escape ICS |

---

## 9. Alternative considerate e scartate

**B — Google Calendar API via OAuth2**: sync vero (auto-insert + auto-remove), ma:
- Richiede Google Cloud project + client ID registrato + consent flow + token refresh.
- Effort ~1 giorno vs ~2-3 ore di A.
- Beneficio marginale: l'utente può segnare "fatto" a mano su Google Calendar senza sync.
→ Rimandato a backlog post-launch.

**B-lite — OAuth solo per insert (no auto-remove)**: stesso overhead OAuth di B senza il grosso del valore.
→ Rimandato.

**C — Multi-year export in singolo file**: taglia il banner "nuovo anno", ma complica la semantica (quale anno usare per DTSTAMP? overhead cognitivo).
→ Scartato in brainstorming.

---

## 10. Metriche successo

- Smoke test manuale (sezione 6.2) passa in Google Calendar reale.
- 237+ test passano (no regressioni su test esistenti).
- Banner dashboard compare correttamente a gennaio per profilo nuovo + scompare dopo download.
- Re-import stesso file non crea duplicati in Google Calendar.
