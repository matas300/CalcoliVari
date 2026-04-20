# Impostazioni — redesign design

**Data:** 2026-04-20
**Branch:** `codex/dev-newfeatures`
**Goal:** riorganizzare il tab Impostazioni, rimuovere campi duplicati/obsoleti, correggere bug di persistenza, spostare `openapiKey` a scope globale app-wide.

## Obiettivi

1. **Cleanup**: rimuovere duplicati e campi legal-non-editabili dall'UI
2. **Fix bug**: giorniIncasso reset apparente, INAIL/CdC auto-calc silente
3. **openapiKey globale**: unica per tutta l'app (hardcoded in `clienti-autofill.js`), non più per-profilo
4. **Riorganizzazione**: 3 sezioni semantiche chiare

## Out of scope

- Tab Dichiarazione (parcheggiato come megatask — richiede prima audit funzionale)
- Profilo personale / Profilo P.IVA (già redesign con C4)
- Anagrafica nascosta (già `display:none`, qui solo rimozione DOM)

## Architettura

### Cleanup (rimozioni)

| Campo | Motivo |
|---|---|
| `settTassoInail` (Impostazioni) | Duplicato: il tasso INAIL vive in Profilo P.IVA (`settings.attivita.inailTasso`) dopo C4. Rimuovere input + label + `onchange`. |
| `settLimiteForfettario` (input editabile) | Parametro legale (85.000€ dal 2023). Sostituire con info box read-only: `"Limite forfettario: 85.000 EUR (D.L. 34/2023)"`. Mantenere la chiave `limiteForfettario` in `settings` come read-only (backward compat). |
| Anagrafica dichiarante (pannello `display:none`) | Morto — sostituito da tab Profilo personale. Rimuovere interamente dal DOM. |
| `settings.openapiKey` | Spostato a scope globale (hardcoded). Rimuovere input UI, rimuovere `applySettings` write, rimuovere da `ensureDataShape` default. Non serve migrazione: i valori esistenti in localStorage vengono ignorati e restano come campo morto (nessun impatto). |

### Fix bug

**B1. giorniIncasso reset apparente tra anni**

*Causa*: `giorniIncasso` è per-anno (`yearData.settings`). Cambiando anno, se il nuovo anno non ha settings custom, viene inizializzato a `30` dal default di `ensureDataShape`. L'utente lo percepisce come "reset".

*Fix*: promuovere `giorniIncasso` a **setting di profilo** (non per-anno). Nuova chiave profilo-scoped: `calcoliPIVA_{profile}_giorniIncasso` in localStorage, syncata via `PROFILE_META_KEYS`. Migrazione one-shot: al primo load post-deploy, se esiste `yearData.settings.giorniIncasso !== 30` nell'anno corrente e la chiave globale non esiste, promuoverla.

**B2. INAIL/CdC auto-calc silente**

*Causa*: `inailTasso` letto da `getProfileFiscalData().inailTasso` → se utente non l'ha compilato in Profilo P.IVA, premio = 0 senza feedback. CdC default 53€ è hardcoded ma non segnalato.

*Fix*: nello scadenziario, quando `inailTasso === 0` e non c'è override manuale, mostrare un hint inline sulla riga INAIL: `"Imposta tasso in Profilo P.IVA o override manuale in Impostazioni"`. Stesso pattern per CdC se il default 53€ non riflette la realtà (lasciato a user — solo hint quando override vuoto).

### openapiKey globale

*Scelta*: **Opzione A — costante JS in `clienti-autofill.js`**

```js
// clienti-autofill.js
var GLOBAL_OPENAPI_KEY = '<chiave da inserire>';

function getApiKey() {
  return GLOBAL_OPENAPI_KEY.trim();
}
```

Rimossi: `getSettingsObject()`, lettura da `settings.openapiKey`, parametro `apiKeyOverride` in `lookupPartitaIva`. L'autofill wiring in `app.js` smette di passare la key (ridiventa 1-arg).

Rimosso da `ensureDataShape`: default `openapiKey: ''`.

Rimosso da UI: `#settOpenapiKey` label+input+hint+subsection title.

**Trade-off accettato**: la key finisce nel repository git. Rischio basso (repo privato, free tier 100 req/mese, revocabile da dashboard openapi.it).

### Riorganizzazione sezioni

Da 4 subsection miste → 3 subsection semantiche:

**1. Parametri fiscali (anno)**
- Gruppo ATECO (dropdown)
- Coefficiente redditivita (%)
- Aliquota imposta sostitutiva (%)
- Limite forfettario → info box read-only
- Usa parametri INPS ufficiali
- Riduzione 35%
- Anno con reddito da lavoro dipendente

**2. Operativita (anno)**
- Paga giornaliera (EUR)
- Giorni medi per incasso fattura → label aggiornata: *"Impostazione di profilo, applicata a tutti gli anni"*
- Override INAIL anno corrente (EUR)
- Override INAIL anno successivo (EUR)
- Diritto Camera di Commercio (EUR)

**3. Dati & backup**
- Export dati (JSON)
- Import dati
- Toggle hard-delete (dev only, warning)

Rimossa subsection "Clienti — Autofill anagrafica" (key globale).

## Data flow

**giorniIncasso (nuovo)**:
```
UI input → saveProfileSetting('giorniIncasso', val) → localStorage[profile_giorniIncasso]
       → syncProfileMetaToCloud(profile, 'giorniIncasso')
S() helper → leggere da profile storage, fallback a yearData.settings.giorniIncasso (legacy)
```

**openapiKey**:
```
UI rimossa. ClientiAutofill.getApiKey() → GLOBAL_OPENAPI_KEY
```

## Error handling

- Migrazione giorniIncasso: idempotente (controlla se chiave profilo esiste prima di scrivere)
- openapiKey: se utente ha vecchio valore in `settings.openapiKey`, viene ignorato silentemente (nessun messaggio)
- Info-box limite forfettario: nessuna interazione, solo display

## Testing

- Test manuale giorniIncasso: cambio anno → valore persiste; modifica → applicato a tutti gli anni; refresh → persiste
- Test manuale INAIL: imposto tasso in Profilo P.IVA → premio appare in scadenziario; tasso=0 → hint mostrato
- Test manuale openapiKey: autofill funziona senza compilare nulla in Impostazioni
- Test manuale import/export JSON: funziona invariato
- Regressione: nessun test automatizzato rotto (`node test/run-tests.js` verde)

## File impattati

- `index.html` — rimozione input, nuova struttura subsection, info-box
- `app.js` — `applySettings` (rimuovere openapiKey + inailTasso binding), `ensureDataShape` (rimuovere `openapiKey`), nuove funzioni `getGiorniIncassoProfile`/`setGiorniIncassoProfile`, `S().giorniIncasso` → lettura profile-scoped, migrazione one-shot
- `clienti-autofill.js` — costante globale, rimuovere `getSettingsObject`/`apiKeyOverride`
- `firebase-sync.js` — aggiungere `'giorniIncasso'` a `PROFILE_META_KEYS`
- `test/clienti-autofill.test.js` — rimuovere stub settings, aggiornare ai nuovi 1-arg
- `CLAUDE.md` — aggiornare sezione Clienti (key globale) + sezione Settings (giorniIncasso profile-scoped)

## Validazione sezioni

- Architettura 3-sezioni chiare? Sì
- Migrazione giorniIncasso sicura? Sì (idempotente, non distruttiva)
- Rischio key in repo accettato? Sì (repo privato, free tier)
- Backward compat legacy data? Sì (openapiKey ignorato, limiteForfettario read-only)
