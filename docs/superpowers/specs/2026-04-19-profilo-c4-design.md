# Profilo come tab — design (sub-progetto C4)

**Data**: 2026-04-19
**Branch**: `codex/dev-newfeatures`
**Contesto**: Sostituisce il sub-progetto C3 scartato (rollback a `4cdef51`). Il modale "Profilo fiscale" viene eliminato e sostituito da due tab regolari nella sidebar nav, layout denso stile Fiscozen, click-per-modificare.

## Obiettivo

Rimuovere il modale Profilo fiscale. Splittare i dati in due tab separate "Profilo personale" e "Profilo P.IVA" nella sidebar nav. Trasferire i parametri di calcolo (coefficiente, aliquota, limite forfettario, INAIL, riduzione 35%, usa parametri INPS ufficiali, Gruppo ATECO) alle card esistenti in Impostazioni. Dropdown avatar pulito: rimossa voce Impostazioni duplicata, voce Profilo splittata in due. Fix larghezza card in Impostazioni.

## Scope

**In scope**
- Nuove tab `#tab-profilo-personale` e `#tab-profilo-piva` in `index.html` + voci sidebar + pagine tab in `app.js`.
- Rimozione modale `#profileFiscalModal` da `index.html` e funzioni `renderProfiloFiscale`, `openProfileFiscalModal`, `closeProfileFiscalModal` da `app.js`.
- **Unificazione data layer**: le tab Profilo leggono/scrivono su `settings.anagrafica` / `settings.attivita` (gia usate da Dichiarazione). Il secondo storage `calcoliPIVA_{profile}_profileFiscal` viene eliminato.
- Migrazione one-shot: al load, se esiste `profileFiscal` in localStorage, copia i suoi campi in `settings.anagrafica`/`settings.attivita` dell'anno corrente, poi elimina la chiave.
- Rimozione da `#tab-settings` dei pannelli duplicati "Anagrafica dichiarante" e "Attivita" (contenuto migrato nelle tab Profilo).
- Aggiunta dei 5 parametri di calcolo (Gruppo ATECO, Coefficiente, Aliquota sostitutiva, Limite forfettario, Tasso INAIL) + 2 toggle (Usa INPS ufficiali, Riduzione 35%) alle card Impostazioni pertinenti, evitando duplicati con campi gia esistenti.
- Aggiornamento dropdown avatar: rimossa "Impostazioni" e "Profilo fiscale", aggiunte "Profilo personale" + "Profilo P.IVA".
- Sweep `max-width` nelle card Impostazioni per riempire larghezza disponibile.
- Layout denso stile Fiscozen con `.profilo-page` / `.profilo-group` / `.profilo-group-head` / `.profilo-row`.
- Helper `renderProfileField` viene adattato per scrivere su `settings.anagrafica`/`settings.attivita` invece che su `profileFiscal` (namespace selezionabile).

**Out of scope**
- Validazione avanzata campi (CF checksum, IBAN checksum).
- Mobile app shell changes (drawer hamburger, topbar) — gia C2.
- Modifiche a DichiarazioneEngine: continua a leggere `settings.anagrafica`/`settings.attivita` come oggi.

## Architettura

### Navigazione

La sidebar nav in `index.html` (dopo C2) ha un `<ul>` di `.sb-nav-item` con `data-tab`. Aggiungiamo due voci tra "dichiarazione" e "settings":

```
dashboard
tasse
scadenziario
calendario
fatture
budget
clienti
spese
dichiarazione
profilo-personale  ← nuovo
profilo-piva       ← nuovo
settings
```

Ogni nuova voce usa `data-tab="profilo-personale"` / `data-tab="profilo-piva"` con icona SVG (user / briefcase).

`switchToTab('profilo-personale')` e `switchToTab('profilo-piva')` funzionano come qualsiasi altra tab: nascondono `.tab-content.active`, mostrano `#tab-profilo-personale` / `#tab-profilo-piva`, chiamano il renderer (`renderProfiloPersonale` / `renderProfiloPiva`).

### Dropdown avatar

Da `index.html` (post-C1 avatar menu), nel `.profile-menu`:

**Prima**: Profilo · Impostazioni · Tema · Logout
**Dopo**: Profilo personale · Profilo P.IVA · Tema · Logout

Le voci "Profilo personale" e "Profilo P.IVA" chiamano `switchToTab('profilo-personale')` / `switchToTab('profilo-piva')` e poi chiudono il menu. "Impostazioni" rimossa dal menu (resta in sidebar).

### Struttura pagina

Ogni tab è una singola pagina scrollabile. Markup:

```html
<div class="tab-content" id="tab-profilo-personale">
  <div id="profilo-personale-content"></div>
</div>
```

Il renderer (`renderProfiloPersonale(profile)`) produce:

```html
<div class="profilo-page">
  <h2 class="profilo-title">Profilo personale</h2>
  <p class="profilo-subtitle">Dati anagrafici e di fatturazione.</p>

  <section class="profilo-group">
    <h3 class="profilo-group-head">Anagrafica</h3>
    <div class="profilo-rows">
      <div class="profilo-row"><span class="profilo-label">Nome</span><span class="profilo-value">Mattia</span></div>
      ...
    </div>
  </section>

  <section class="profilo-group">
    <h3 class="profilo-group-head">Residenza</h3>
    ...
  </section>

  <section class="profilo-group">
    <h3 class="profilo-group-head">Fatturazione</h3>
    ...
  </section>
</div>
```

Il pattern `renderProfileField` esistente gia produce la riga label+valore cliccabile con inline edit on blur. Lo riusiamo cambiando il contenitore di output da `profile-field-grid` (2 col grid fisso) a un semplice contenitore `.profilo-rows` che sfrutta le classi esistenti `.profile-field` / `.profile-field-label` / `.profile-field-value`.

### Mapping campi

Tutti i campi scrivono su `yearData.settings.anagrafica` o `yearData.settings.attivita` dell'anno corrente (`S()`/`saveAnagraficaField`/`saveAttivitaField`). Nuovi sotto-oggetti vengono estesi dove serve.

**① Profilo personale** (10 campi, 3 gruppi)

*Anagrafica* → `settings.anagrafica`: `nome`, `cognome`, `codiceFiscale`

*Residenza* → `settings.anagrafica`: `residenzaVia` (Indirizzo), `residenzaCap` (CAP), `residenzaComune` (Citta), `residenzaProv` (Provincia), `nazione` (nuovo campo, default `IT`)

*Fatturazione* → `settings.anagrafica`: `iban` (nuovo), `modalitaPagamento` (nuovo, default `Bonifico bancario`)

**② Profilo P.IVA** (8 campi + 2 condizionali, 3 gruppi)

*Attivita* → `settings.attivita`: `partitaIva` (nuovo), `codiceAteco`, `descrizioneAttivita`, `note` (nuovo)

*Previdenza* → `settings` (gia year-settings): `inpsMode` (Gestione previdenziale), `inpsCategoria` (se `inpsMode==='artcom'`), `inpsTipoGestSep` (se `inpsMode==='gestsep'`)

*Agevolazioni* → `settings.attivita`: `agevolazioneStartUp` (nuovo), `primoAnnoAgevolato` (nuovo)

**③ Trasferiti in Impostazioni**

Aggiunti alla card "Regime fiscale" (che gia ha regime, dailyRate, scadenziario metodo):
- Gruppo ATECO (dropdown con autofill coefficiente)
- Coefficiente redditivita (%)
- Aliquota imposta sostitutiva (%)
- Limite forfettario

Aggiunti alla card "INPS ufficiali" (che gia ha `usaInpsUfficiale`, `contribFissi`, `minimaleInps`, `aliqContributi`):
- Tasso INAIL (se visualizzato non duplicare)
- Riduzione 35% (checkbox gia presente in molti contesti — verificare e non duplicare)

Dove i campi esistono gia in Impostazioni, non duplicare: solo verificare che siano visibili e raggiungibili. Il task di implementazione verifica quali mancano e li aggiunge.

### Layout densita A (Fiscozen)

CSS nuovo in `style.css`:

```css
.profilo-page {
  max-width: 900px;
  margin: 0;
  padding: var(--space-4);
}
.profilo-title {
  font-family: var(--font-display);
  font-size: 1.4rem;
  margin: 0 0 var(--space-1);
}
.profilo-subtitle {
  color: var(--color-text-muted);
  font-size: .9rem;
  margin: 0 0 var(--space-5);
}
.profilo-group + .profilo-group { margin-top: var(--space-5); }
.profilo-group-head {
  color: var(--color-primary);
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  margin: 0 0 var(--space-3);
}
.profilo-rows {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--space-2) var(--space-4);
  align-items: start;
}
.profilo-rows .profile-field {
  display: contents;
}
.profilo-rows .profile-field-label {
  color: var(--color-text-muted);
  font-size: .82rem;
  padding: 6px 0;
}
.profilo-rows .profile-field-value {
  padding: 6px 0;
  font-size: .9rem;
}
@media (max-width: 768px) {
  .profilo-rows {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }
  .profilo-rows .profile-field-label {
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .04em;
    padding: 0;
  }
}
```

L'uso di `display: contents` sulla `.profile-field` permette di riusare l'helper esistente `renderProfileField` senza modificare il suo HTML output: il wrapper sparisce dal layout e label/value vanno direttamente nella grid.

### Editing inline (pattern B)

Nessuna modifica a `renderProfileField`. Il campo mostra testo; click → input; blur/Enter → `updateProfileFiscalField(key, value)` salva. Gia funzionante.

### Fix larghezza card Impostazioni

Audit di `index.html` `#tab-settings` per `style="max-width:..."` inline e `style.css` per regole `.panel-card { max-width: ...}`. Obiettivo: ogni card occupa `width: 100%` del contenitore `.tab-content`, nessun `max-width` restrittivo salvo case specifici documentati.

### Rimozioni

Da `app.js`:
- `openProfileFiscalModal()`, `closeProfileFiscalModal()`, `renderProfiloFiscale()`
- Handler ESC dedicato al profile modal
- `PROFILE_FISCAL_LIBRARY`, `getProfileFiscalDefaults`, `normalizeProfileFiscalData`, `getStoredProfileFiscal`, `loadProfileFiscalData`, `saveProfileFiscalData`, `getProfileFiscalData`, `updateProfileFiscalField`, `profileFiscalState`, `profileStorageKey`
- `syncProfileFieldsToSettings` (non piu necessario: unica sorgente di verita sono gia le settings)
- Ogni lettura `getProfileFiscalData()` sparsa nel codice (es. check `agevolazioneStartUp` in `calcForfettario`) viene sostituita da `S().attivita.agevolazioneStartUp`, ecc.

Da `index.html`:
- Intero `<div id="profileFiscalModal">` con header + content + close button
- Voce "Profilo fiscale" e "Impostazioni" dal `.profile-menu` (sostituite da due nuove voci Profilo personale/P.IVA)
- Pannelli `#tab-settings` "Anagrafica dichiarante" e "Attivita" (i campi sono duplicati nelle tab Profilo)

Da `style.css`:
- Classi `.profile-modal-panel`, `.profile-sheet-*`, `.profile-modal-*`, `.profile-layout`, `.profile-side-column`, `.profile-section-*` se non riusate altrove (grep prima di cancellare).

Le classi `.profile-field`, `.profile-field-label`, `.profile-field-value` sono riusate nelle nuove tab → restano.

Da localStorage: chiave `calcoliPIVA_{profile}_profileFiscal` eliminata dopo migrazione (vedi Data model).

## Data model

**Unica sorgente di verita: `yearData.settings.anagrafica` + `yearData.settings.attivita`** (gia usate dal feature Dichiarazione).

### Estensione schema

`ensureDataShape` aggiunge i seguenti nuovi campi ai default:

```js
// settings.anagrafica (estensione)
{
  // esistenti
  codiceFiscale, cognome, nome, sesso, dataNascita, comuneNascita, provNascita,
  residenzaVia, residenzaComune, residenzaProv, residenzaCap,
  domicilioFiscaleVia, domicilioFiscaleComune, domicilioFiscaleProv, domicilioFiscaleCap,
  telefono, email, statoCivile,
  // nuovi
  nazione: 'IT',
  iban: '',
  modalitaPagamento: 'Bonifico bancario'
}

// settings.attivita (estensione)
{
  // esistenti
  codiceAteco, descrizioneAttivita, dataInizioAttivita,
  sedeVia, sedeComune, sedeProv, sedeCap,
  // nuovi
  partitaIva: '',
  atecoGruppo: '',
  note: '',
  agevolazioneStartUp: 0,
  primoAnnoAgevolato: 0
}
```

Parametri di calcolo (`coefficiente`, `impostaSostitutiva`, `limiteForfettario`, `usaInpsUfficiale`, `riduzione35`) rimangono in `settings` root come gia oggi (sono year-settings) ed espongono UI in Impostazioni.

### Helper editing

`renderProfileField(label, value, opts)` oggi legge/scrive da `profileFiscalState.draft` e chiama `updateProfileFiscalField`. Viene generalizzato:
- Nuovo parametro `opts.namespace`: `'anagrafica'` | `'attivita'` | `'settings'`
- Lettura: `S()[namespace][key]` (o `S()[key]` per root settings)
- Scrittura on blur: `saveAnagraficaField(key,val)` / `saveAttivitaField(key,val)` / `saveSetting(key,val)` o `saveTextSetting` a seconda del tipo

Nessuno stato di editing globale: ogni campo entra in modalita input al click, salva on blur/Enter, esce. Niente "draft" collettivo ne bottone Salva.

### Migrazione one-shot

Al primo load dopo il deploy C4, `migrateProfileFiscalToSettings()` viene chiamata da `loadData()`:

1. Legge `localStorage[calcoliPIVA_{profile}_profileFiscal]`.
2. Se presente: copia i campi in `yearData.settings.anagrafica`/`attivita` dell'anno corrente, mappando:
   - `profileFiscal.nome` (stringa intera "Mattia Rossi") → split in `anagrafica.nome` + `anagrafica.cognome` se vuoti
   - `codiceFiscale, iban, modalitaPagamento, nazione` → `anagrafica`
   - `indirizzo → residenzaVia`, `cap → residenzaCap`, `citta → residenzaComune`, `provincia → residenzaProv`
   - `partitaIva, ateco → codiceAteco, atecoDescrizione → descrizioneAttivita, atecoGruppo, note, agevolazioneStartUp, primoAnnoAgevolato` → `attivita`
   - `inpsMode, inpsCategoria, inpsTipoGestSep, coefficiente, impostaSostitutiva, usaInpsUfficiale, riduzione35, limiteForfettario` → `settings` root (solo se il campo in settings e vuoto/default, per non sovrascrivere year-specific)
3. Salva (`saveData()`) e rimuove la chiave `profileFiscal` con `localStorage.removeItem`.
4. Setta un flag `localStorage[calcoliPIVA_{profile}_profileFiscalMigrated] = '1'` per evitare ri-esecuzione.

La migrazione e idempotente: se la chiave non esiste o il flag e gia settato, non fa nulla.

## Acceptance criteria

1. Sidebar nav mostra "Profilo personale" e "Profilo P.IVA" tra "Dichiarazione" e "Impostazioni".
2. Click su una delle due voci: la tab si attiva (no modale), URL/stato persistenti come altre tab.
3. Dropdown avatar ha: Profilo personale, Profilo P.IVA, Tema toggle, Logout. Nessun "Impostazioni".
4. Voci dropdown Profilo personale/P.IVA aprono la tab corrispondente e chiudono il menu.
5. Modale `#profileFiscalModal` non esiste piu nel DOM. Nessuna funzione `renderProfiloFiscale`/`openProfileFiscalModal` presente.
6. Tab Profilo personale mostra Nome/Cognome/CF (Anagrafica), Indirizzo/CAP/Citta/Provincia/Nazione (Residenza), IBAN/Modalita pagamento (Fatturazione).
7. Tab Profilo P.IVA mostra P.IVA/ATECO/Descrizione/Note (Attivita), Gestione previdenziale + condizionali (Previdenza), Start-up + Primo anno agevolato (Agevolazioni).
8. Layout: label sinistra 200px + valore destra; subheading mint maiuscolo per ogni gruppo; su mobile label sopra valore.
9. Click su un valore apre input inline; blur salva in `settings.anagrafica`/`settings.attivita`/`settings`; riaprendo la tab il valore persiste.
10. Impostazioni card "Regime fiscale" contiene: Gruppo ATECO, Coefficiente, Aliquota sostitutiva, Limite forfettario — tutti editabili e persistenti.
11. Impostazioni card "INPS" contiene: Tasso INAIL, Usa parametri INPS ufficiali, Riduzione 35%.
12. Tutte le card in `#tab-settings` usano la larghezza piena del contenitore.
13. I pannelli "Anagrafica dichiarante" e "Attivita" non esistono piu in Impostazioni.
14. Chiave localStorage `calcoliPIVA_{profile}_profileFiscal` eliminata dopo primo load; flag `profileFiscalMigrated=1` impedisce ri-migrazione.
15. DichiarazioneEngine continua a funzionare: legge `settings.anagrafica`/`settings.attivita` e trova tutti i campi che usava prima (piu i nuovi).

## Riferimenti

- CLAUDE.md sezione "Color System" (Espresso & Mint)
- C1 spec/plan `docs/superpowers/specs/2026-04-18-header-avatar-design.md`
- C2 spec/plan `docs/superpowers/specs/2026-04-19-nav-sidebar-design.md`
- Memory `project_header_mobilenav.md` (C3 scartato, C4 TODO)

## Rischi

- **Rimozione modale con codice legato**: verificare che nessuna altra funzione chiami `openProfileFiscalModal`. Grep prima di rimuovere.
- **Campi gia presenti in Impostazioni**: alcuni (es. coefficiente, limite forfettario) potrebbero essere gia visibili. Grep prima di aggiungere per evitare duplicati.
- **CSS orfano**: classi `.profile-*` potrebbero essere usate anche fuori dal modale. Grep prima di rimuovere.
- **Migrazione dati utente**: i profili reali (Mattia, Peru) hanno dati in `profileFiscal` da settembre 2024. La migrazione deve essere testata con fixture per ciascun profilo prima del deploy. Flag migrated previene perdite se lanciata due volte.
- **Callsite `getProfileFiscalData`**: grep approfondito di tutti i callsite (oltre al modal renderer) che leggono profileFiscal. Almeno `calcForfettario` (agevolazione start-up) e `updateProfileAvatar` (nome/cognome) — vanno redirezionati a `S().attivita.*` / `S().anagrafica.*`.
