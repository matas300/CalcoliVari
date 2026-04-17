# Dichiarazione Redditi PF — Design Spec (Sub-project 2)

**Data:** 2026-04-17
**Branch:** `codex/dichiarazione-redditi` (da `codex/dev-newfeatures`)
**Stato:** Design approvato, pronto per writing-plans

## 1. Scope & obiettivo

Modulo completo per preparare la **Dichiarazione dei Redditi Persone Fisiche** di un contribuente forfettario, sostituendo integralmente l'attuale Quadro LM (`openQuadroLMModal`, `saveQuadroLMDraft`, `exportQuadroLMPrint`).

Obiettivi:
- **Wizard step-by-step** di compilazione assistita
- **Calcoli automatici** derivati dallo stato anno già in app (`yearData`, `tax-engine.js`), con possibilità di override manuale per singolo rigo
- **Due output**:
  - **C2** — export dati strutturati (JSON + CSV) con mapping esplicito ai righi AdE, per copia-incolla in RedditiOnLine PF o Fisconline
  - **C3** — PDF con layout che rispecchia il modulo ministeriale AdE Redditi PF
- **Validazione a 2 livelli**: errors bloccanti + warnings con conferma

**Fuori scope:** generazione del file telematico ADE (tracciato record Entratel) — rimandato a eventuale sub-project futuro.

## 2. Quadri inclusi

### Core (sempre presenti nel wizard)

| Quadro | Descrizione |
|--------|-------------|
| Frontespizio | Tipo dichiarazione, anagrafica, residenza, domicilio fiscale, firma |
| LM | Sez. I forfettario (ricavi per ATECO, coefficiente), Sez. II determinazione reddito + contributi deducibili + imposta sostitutiva, Sez. III perdite pregresse |
| RR | Sez. I artigiani/commercianti, Sez. II gestione separata |
| RS | Righi RS371-RS381 dati rilevanti forfettari (costi per categoria, dipendenti, beni strumentali) |
| RX | Crediti, compensazioni, rimborsi, eccedenze da precedente dichiarazione |
| RW | Monitoraggio attività estere (conti esteri) |

### Condizionali (attivati da flag nel wizard)

| Quadro | Flag di attivazione |
|--------|---------------------|
| RN / RP / RV | `flags.annoMisto` — redditi da lavoro dipendente/altri |
| CE | `flags.imposteEstere` — imposte pagate all'estero |
| CR | `flags.altriCrediti` — altri crediti d'imposta (canone RAI, affitto, ecc.) |

**Fuori scope default:** RU, RH, RL, RM, RT, altri quadri speciali.

## 3. Architettura file

### Nuovi file

- **`dichiarazione-engine.js`** (~1500-2000 righe) — puro, testabile, nessun DOM
  - `buildFrontespizio(profile, year, inputUtente)` → dati quadro
  - `buildQuadroLM(yearData, settings, overrides)` → righi LM1-LM47
  - `buildQuadroRR(yearData, settings, overrides)` → righi RR sez. I + II
  - `buildQuadroRS(yearData, settings, overrides)` → righi RS371-RS381
  - `buildQuadroRX(yearData, settings, precedente, overrides)` → compensazioni/crediti
  - `buildQuadroRW(inputUtente)` → conti esteri
  - `buildCondizionali(inputUtente, yearData)` → RN/RP/RV/CE/CR se attivi
  - `buildDichiarazione(year, profile, inputUtente)` → aggregatore top-level
  - `validateDichiarazione(dichiarazione)` → `{errors: [], warnings: []}`
  - Esposto come `window.DichiarazioneEngine`
- **`dichiarazione-ui.js`** (~1000-1500 righe) — wizard, render sub-step, binding override, navigazione
- **`dichiarazione-exports.js`** (~500-800 righe) — C2 (JSON+CSV zip) + C3 (PDF jsPDF layout ministeriale)
- **`test/dichiarazione-engine.test.js`** — unit test engine (pattern audit sub-project 1)

### File modificati

- **`index.html`** — nuovo tab "Dichiarazione" nella nav + container wizard
- **`app.js`** — estendi blocco "Profilo fiscale" in Impostazioni con anagrafica + attività; rimuovi modal Quadro LM vecchio; aggiungi boot wizard; estendi `ensureDataShape` con campi nuovi
- **`style.css`** — stili wizard, sub-step nav, layout righi quadri, responsive mobile
- **`CLAUDE.md`** — documentazione nuovo modulo
- **`firebase-sync.js`** — nessuna modifica necessaria (merge generico copre i nuovi campi)

### Deprecazioni

- `openQuadroLMModal`, `saveQuadroLMDraft`, `exportQuadroLMPrint` → rimossi completamente
- `yearData.lmQuadro` → migrato a `yearData.dichiarazione` (migrazione silenziosa al primo load)

## 4. Data model

### Profilo fiscale esteso (`settings`, per-profilo, stabile)

```js
anagrafica: {
  codiceFiscale: string,
  cognome: string, nome: string, sesso: 'M' | 'F',
  dataNascita: string, comuneNascita: string, provNascita: string,
  residenzaVia: string, residenzaComune: string, residenzaProv: string, residenzaCap: string,
  domicilioFiscaleVia: string, domicilioFiscaleComune: string, domicilioFiscaleProv: string, domicilioFiscaleCap: string,
  telefono: string, email: string, statoCivile: string
},
attivita: {
  codiceAteco: string, descrizioneAttivita: string, dataInizioAttivita: string,
  sedeVia: string, sedeComune: string, sedeProv: string, sedeCap: string
}
```

### Blocco dichiarazione (`yearData.dichiarazione`, per-anno, variabile)

```js
dichiarazione: {
  tipoDichiarazione: 'ordinaria' | 'correttiva' | 'integrativa',
  dataPresentazione: string | null,
  flags: {
    annoMisto: boolean,
    imposteEstere: boolean,
    altriCrediti: boolean
  },
  contiEsteri: [{
    paese: string, tipoConto: string, iban: string,
    valoreIniziale: number, valoreFinale: number,
    giorniDetenzione: number, valutaCodice: string
  }],
  coniuge: { cf, nome, cognome, aCarico } | null,
  familiariCarico: [{ cf, nome, tipo, mesiCarico, percentuale }],
  overrides: {
    // per rigo: chiave = "QUADRO_RIGO_COL", valore = number|string
    // es: "LM2_col2": 85000, "RR8_col10": 4200
  },
  computed: {
    // snapshot dell'ultimo buildDichiarazione per confronto/debug
    timestamp: string,
    payload: {...}
  },
  statoCompilazione: 'bozza' | 'completa' | 'presentata'
}
```

### Migrazione `lmQuadro` → `dichiarazione`

Al primo caricamento di un `yearData` con `lmQuadro` presente:
1. Crea `yearData.dichiarazione` con shape default
2. Copia `lmQuadro.overrides` → `dichiarazione.overrides` (chiavi compatibili)
3. Rimuovi `yearData.lmQuadro`
4. `saveData()` per persistere

## 5. Wizard flow

Sidebar verticale con step list + progress indicator, contenuto principale a destra. Navigazione: utente può saltare a qualsiasi step già visitato.

**Step:**

1. **Anno & tipo dichiarazione** — seleziona anno d'imposta, tipo dichiarazione, attiva flag condizionali
2. **Frontespizio** — verifica/edita dati anagrafici precompilati, firma, variazioni residenza
3. **Quadro LM** (3 sub-step: ricavi per ATECO, determinazione reddito + contributi, perdite pregresse)
4. **Quadro RR** (sub-step per categoria INPS attiva)
5. **Quadro RS** (dati rilevanti forfettari)
6. **Quadro RW** (lista conti esteri, add/edit/remove)
7. **Quadro RX** (compensazioni e crediti)
8. **[condizionale]** Quadro RN/RP/RV — redditi aggiuntivi, oneri
9. **[condizionale]** Quadro CE
10. **[condizionale]** Quadro CR
11. **Validazione** — errors/warnings con link cliccabile al rigo
12. **Riepilogo & Export** — totali, F24 generato, pulsanti Export C2/C3, salva bozza

**Persistenza:** ogni edit salva immediatamente in `yearData.dichiarazione.overrides` e triggera `buildDichiarazione` per ricalcolo live.

## 6. Export

### C2 — Dati strutturati (JSON + CSV)

- **JSON**: dump gerarchico `{frontespizio, quadroLM: {LM1: {...}, ...}, quadroRR, ...}`, ogni rigo mappato al codice ufficiale
- **CSV**: tabella piatta `quadro,rigo,colonna,descrizione,valore` — es: `LM,LM2,2,"Reddito lordo",85000.00`
- Entrambi in zip `Dichiarazione_{anno}_{CF}.zip`
- Uso: copia-incolla in RedditiOnLine PF / Fisconline compilazione assistita

### C3 — PDF modulo ministeriale

- jsPDF con layout tabellare che rispecchia il modulo ufficiale AdE Redditi PF (ricostruzione vettoriale, no bitmap di sfondo)
- Un quadro per pagina (multi-pagina se necessario)
- Header: codice fiscale, anno d'imposta, tipo dichiarazione
- Campi numerati come sul modulo originale
- Footer: numero pagina, data generazione
- File: `Dichiarazione_{anno}_{CF}.pdf`

Entrambi accessibili dallo step 12.

## 7. Validazione

### Errors (bloccano l'export)

- Codice fiscale mancante o formalmente invalido (regex + check cifra controllo)
- Campi obbligatori Frontespizio vuoti (CF, cognome, nome, data/comune nascita, residenza)
- `LM2 ≠ LM1 × coefficiente ATECO` (tolleranza 0.01 €)
- `LM36 ≠ LM34 × aliquota` (5% start-up o 15% standard)
- RR8 (contributi eccedenti) < 0
- RW: per ogni conto estero, paese + valore finale + giorni obbligatori se `contiEsteri` non vuoto
- Totale ricavi LM ≠ somma fatture incassate nell'anno (competenza forfettario = cassa)

### Warnings (non bloccanti, richiedono conferma esplicita)

- Reddito > 85.000 € (superamento soglia forfettario → decadenza anno successivo)
- Reddito > 100.000 € (decadenza immediata anno corrente)
- Nessun contributo INPS dedotto ma profilo ha INPS attiva
- Acconti calcolati > acconti già versati (risultano da pagare)
- Anno dichiarazione ≠ anno d'imposta + 1 (presentazione tardiva?)
- Conti esteri presenti ma CE non attivato (possibile credito imposte estere non richiesto)

### UI validazione

Step 11 mostra lista errors/warnings con link cliccabile al quadro+rigo responsabile. Bottone "Procedi comunque" disponibile solo se 0 errors. Warnings richiedono conferma esplicita checkbox "Ho verificato".

## 8. Testing

### Unit test (`test/dichiarazione-engine.test.js`)

Pattern: identico a quello usato per `tax-engine` in sub-project 1. Minimum 15-20 scenari:

1. Forfettario puro standard (artigiano, 60k, coeff. 67%, INPS ufficiale 2025)
2. Forfettario start-up (aliquota 5%)
3. Commerciante con riduzione 35%
4. Gestione separata (nessuna fissa)
5. Anno misto (flag `annoMisto`, attivazione RN/RP/RV)
6. Superamento soglia 85k (warning)
7. Superamento 100k (warning critico)
8. RW con 2 conti esteri (validazione)
9. RW vuoto (nessun errore)
10. Override manuale LM2 (prevale sul calcolato)
11. Perdite pregresse (LM Sez. III, scomputo fino a LM34)
12. RX compensazione da anno precedente
13. CF invalido (error)
14. CF valido incoerente con anagrafica (warning)
15. Migrazione `lmQuadro` → `dichiarazione.overrides` (backward compat)
16. Export JSON+CSV (snapshot test su dati noti)
17. Aliquote INPS multi-anno (2024/2025/2026)

Target: **tutti test verdi prima di considerare il modulo completo**. Test runner manuale CLI (no CI GitHub Actions).

### Smoke test manuale UI

Checklist nel plan con scenari end-to-end (nuovo utente, anno in corso, anno chiuso con migrazione, anno misto, ecc.).

## 9. Piano di rilascio (fasi per il plan)

1. **Scaffolding & migrazione** — scheletro file, `ensureDataShape`, migrazione `lmQuadro`→`dichiarazione`, rimozione codice vecchio Quadro LM
2. **Profilo fiscale esteso** — UI Impostazioni, blocchi anagrafica + attività, validazione CF
3. **`dichiarazione-engine.js` core** — Frontespizio, LM, RR, RS, RX + unit test
4. **`dichiarazione-engine.js` estensioni** — RW, condizionali (RN/RP/RV/CE/CR), `validateDichiarazione` + unit test
5. **Wizard UI base** — tab, nav, step 1-2-12, container, salvataggio live
6. **Wizard UI quadri core** — step 3-7 (LM, RR, RS, RW, RX) con render righi + override
7. **Wizard UI condizionali** — step 8-10 (RN/RP/RV, CE, CR) + flag-driven visibility
8. **Step validazione** — step 11 con render errors/warnings e link a rigo
9. **Export C2** — JSON + CSV zip
10. **Export C3** — PDF ministeriale jsPDF
11. **Polish & doc** — CLAUDE.md, stili responsive mobile, test manuali, cleanup
12. **Review finale** — code review via subagent, fix issue emerse

## 10. Strategia branch

- Nuova branch **`codex/dichiarazione-redditi`** da `codex/dev-newfeatures`
- Merge back in `codex/dev-newfeatures` a completamento
- `codex/dev-newfeatures` sarà eventualmente mergiato in `main` solo dopo completamento di tutti e 4 i sub-project (audit forfettario — DONE; dichiarazione redditi — QUESTA; fatturazione elettronica; UX/UI)

## 11. Conventioni progetto da rispettare

- Vanilla HTML/CSS/JS, no build tools, no frameworks
- Italiano in tutta l'UI
- `fmt()` per EUR, `ceil2()` per arrotondamento
- Dark theme + light theme (CSS variables)
- Mobile-friendly con safe-area-inset-bottom
- `saveSetting` / `saveTextSetting` / `saveOptionalNumberSetting` per persistence settings
- Firebase sync debounced 800ms (già funzionante, no modifiche richieste)
