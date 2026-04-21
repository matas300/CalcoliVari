# Cleanup inventory — 2026-04-18

> Generato da analisi statica su: `app.js`, `tax-engine.js`, `dichiarazione-engine.js`,
> `dichiarazione-ui.js`, `dichiarazione-exports.js`, `fatture-docs-feature.js`,
> `fatture-storico.js`, `clienti-feature.js`, `firebase-sync.js`, `scadenziario-engine.js`,
> `ocr-pagamenti-feature.js`, `ateco-coefficienti.js`, `index.html`, `style.css`.
>
> Tutte le righe grep fanno riferimento all'esecuzione nel working directory del progetto.

---

## JS — funzioni candidate

> **Nota metodologica**: le funzioni in questa sezione hanno un solo hit grep nell'intero
> codebase (la propria definizione). Sono state escluse esplicitamente le funzioni richiamate
> via `onclick="…"` / `onchange="…"` in index.html, le funzioni esposte su `window.*` e quelle
> elencate nel paragrafo "Esclusioni" in fondo.

| File | Simbolo | Riga | Verifica grep |
|------|---------|------|---------------|
| app.js | `getFattura` | 1477 | `grep -cE "\bgetFattura\b" *.js *.html` → 1 hit (la definizione) |
| app.js | `saveYearSetting` | 1381 | `grep -cE "\bsaveYearSetting\b" *.js *.html` → 1 hit (la definizione) |
| app.js | `getPaymentForScheduleKey` | 3386 | `grep -cE "\bgetPaymentForScheduleKey\b" *.js *.html` → 1 hit (la definizione) |
| app.js | `registerPartialPayment` | 3482 | `grep -cE "\bregisterPartialPayment\b" *.js *.html` → 1 hit (la definizione) |
| app.js | `editPaidScheduleItem` | 3490 | `grep -cE "\beditPaidScheduleItem\b" *.js *.html` → 1 hit (la definizione) |
| app.js | `toggleScadenziarioEmptyYears` | 4788 | `grep -cE "\btoggleScadenziarioEmptyYears\b" *.js *.html` → 1 hit (la definizione) |

### Blocco di codice duplicato / ombreggiato

In JavaScript le function declaration sono hoisted e l'ultima definizione sovrascrive le
precedenti. Le seguenti funzioni sono dichiarate **due volte** in `app.js`; la prima copia
(righe 2365–2567) è irraggiungibile perché ombreggiata dalla seconda.

| Simbolo | Prima copia (ombreggiata) | Seconda copia (attiva) | Verifica |
|---------|--------------------------|------------------------|----------|
| `renderProfileField` | riga 2365 | riga 2569 | `grep -n "^function renderProfileField" app.js` → 2 hit; `#profiloGrid` non esiste in index.html |
| `renderProfiloFiscale` | riga 2398 | riga 2681 | `grep -n "^function renderProfiloFiscale" app.js` → 2 hit; prima copia usa `getElementById('profiloGrid')` che non ha mai match in index.html |

Il blocco morto copre le righe **2365–2567** (203 righe) di `app.js`.

---

## CSS — classi orfane

> Nessun match in `*.html`/`*.js` né via `class="…"`, `classList.add/toggle`, `className`,
> né via template literal contenente il nome classe. I class selector dentro `style.css`
> stessa non sono contati come "utilizzo".

### Classi singole

| Classe | Righe in style.css | Verifica |
|--------|--------------------|----------|
| `.profile-badge` | 360, 3416 (media query) | `grep -cE "profile-badge" *.js *.html` → 0 hit. Il trigger usa class `profile-trigger`, non `profile-badge`. |
| `.budget-bar-track` | 137 (light theme), 1520 | `grep -cE "budget-bar" *.js *.html` → 0 hit |
| `.budget-bar-fill` | 1524 | `grep -cE "budget-bar" *.js *.html` → 0 hit |
| `.fattura-sheet-kicker` | 238 (light theme), 1748 | `grep -cE "fattura-sheet-kicker" *.js *.html` → 0 hit. `.fattura-sheet` è usata ma non il modificatore `-kicker`. |
| `.fattura-note` | 228 (light theme), 2012, 2037 (code) | `grep -cE "fattura-note" *.js *.html` → 0 hit |
| `.sdi-guide-body` | 2605 | `grep -cE "sdi-guide-body" *.js *.html` → 0 hit. Gli altri `.sdi-guide-*` sono usati ma non questo. |

### Blocco lm-* (legacy Quadro LM)

Tutte le classi con prefisso `.lm-` in `style.css` (50 selettori totali, righe 506–1207 e 3464–3476)
sono orfane: il modulo `openQuadroLMModal` è stato superato dal modulo Dichiarazione Redditi PF
e non genera più HTML con queste classi.

`grep -cE "lm-" *.js *.html` → **0 hit** in qualsiasi file sorgente (HTML o JS).

Le classi `.lm-field.is-manual` e `.lm-field.is-estimated` rientrano in questo blocco; le classi
`.is-manual` e `.is-estimated` come selettori autonomi non esistono in `style.css` (solo come
modificatori di `.lm-field`), quindi non ci sono false positives.

> **Esclusione applicata**: le classi `lm-*` erano parte di `openQuadroLMModal` (segnato
> "superseded" in CLAUDE.md). Lo stile può essere rimosso solo dopo aver verificato che nessun
> percorso di codice non-commentato le produce ancora.

---

## CSS — variabili orfane

> Una variabile è orfana se non compare mai in `var(--nome)` né in `getCSSVar('--nome')`
> all'interno di `*.css`, `*.js`, `*.html`.

| Variabile | Righe in style.css | Verifica |
|-----------|--------------------|----------|
| `--color-primary-active` | 14 (dark theme), 72 (light theme) | `grep -cE "(var\(--color-primary-active\|getCSSVar.*color-primary-active)" *.css *.js *.html` → 0 hit |

Nota: `--color-chart-contributi` ha 0 hit via `var()` ma è usata via
`getCSSVar('--color-chart-contributi')` in `app.js:2159` → **NON orfana**, correttamente esclusa.

---

## HTML — id orfani

> Un id è orfano se non compare mai in `getElementById('id')`, `querySelector('#id')`,
> `#id` nei CSS, né nella mappa `applySettings()` che li risolve dinamicamente.

| Id | Riga in index.html | Verifica |
|----|--------------------|----------|
| `logoutBtn` | 42 | `grep -cE "logoutBtn" *.js style.css` → 0 hit. Il bottone funziona tramite `onclick="doLogout()"` ma l'ID non è mai usato da JS. |
| `storico-fatture` | 86 | `grep -cE "(getElementById.*storico-fatture'|#storico-fatture)" *.js style.css` → 0 hit. Solo `storico-fatture-list` (figlio) è usato. |

**Falsi positivi esclusi**: tutti i `sett*` IDs (es. `settDailyRate`, `settNome`, ecc.) sono
risolti dinamicamente tramite le mappe `fields`, `anagraficaMap`, `attivitaMap` in
`applySettings()` (app.js:1273–1342). I `tab-*` IDs sono risolti tramite
`getElementById('tab-' + tab)` (app.js:6575). Nessuno di questi è orfano.

---

## Data model — chiavi mai lette/scritte

| Chiave | Tipo | Verifica lettura | Verifica scrittura |
|--------|------|------------------|--------------------|
| `settings.scadenziarioBolloCorrente123` | settings | `grep -cE "BolloCorrente123" *.js *.html` → 2 hit: solo definizione in `getDefaultSettings` (app.js:1261) e presenza nell'array `SCADENZIARIO_OVERRIDE_KEYS` (app.js:4767). Mai letta dalla logica di schedule builder né da nessun input UI. | Nessuna UI input né `saveOptionalNumberSetting('scadenziarioBolloCorrente123', ...)` trovati. |

Nota: la chiave era presumibilmente pensata per un override manuale delle rate bollo Q1-Q2-Q3,
rimasto non implementato. Le chiavi adiacenti `scadenziarioBolloPrecedenteQ4` e
`scadenziarioBolloCorrenteQ4` sono invece correttamente lette e scritte.

---

## Da valutare manualmente

### 1. `saveYearSetting` vs `saveYearTextSetting` / `saveYearOptionalNumberSetting`

`saveYearSetting` (app.js:1381) non è mai chiamata. Le varianti
`saveYearTextSetting` (2 chiamate) e `saveYearOptionalNumberSetting` (7 chiamate) sono usate.
Si raccomanda di verificare se `saveYearSetting` fosse pensata per salvare numeri per-anno
in futuro (es. override per-anno di `dailyRate`). Se non ci sono piani, è rimuovibile.

### 2. `registerPartialPayment` e `editPaidScheduleItem`

Questi tre wrapper (`getPaymentForScheduleKey`, `registerPartialPayment`, `editPaidScheduleItem`)
potrebbero essere stati progettati come API per il modulo `ScadenziarioEngine` (callback-based),
ma `scadenziario-engine.js` non li referenzia. Verificare se erano previsti per un futuro
sistema di pagamenti parziali o callback engine; in assenza di piani, sono rimuovibili.

### 3. Blocco 2365–2567 di `app.js`

Le due funzioni ombreggi (`renderProfileField` prima copia, `renderProfiloFiscale` prima copia)
sono tecnicamente irraggiungibili in runtime ma il blocco è comunque parsato e occupa ~200 righe.
La rimozione è sicura ma richiede attenzione al diff per non cancellare righe del blocco attivo
che inizia a riga 2569.

---

## Note finali

- **Totale candidati**: 21
  - JS funzioni con 0 chiamate: 6 (+ 1 blocco duplicato di 2 funzioni / 203 righe)
  - CSS classi orfane: 6 singole + blocco lm-* (50 selettori)
  - CSS variabili orfane: 1
  - HTML id orfani: 2
  - Data model chiavi morte: 1
- **Esclusioni applicate**: `legacyBuildForfettarioScheduleForYear`, `openQuadroLMModal`,
  `saveQuadroLMDraft`, `exportQuadroLMPrint`, migrazione `lmQuadro` in `ensureDataShape`,
  funzioni su `window.*` con `onclick`/`onchange` HTML (es. `confirmQuickPay`, `closeQuickPayModal`,
  `doLogout`, `toggleTheme`, tutti i `saveSetting`/`saveOptionalNumberSetting` in HTML).
- **Classi CSS `act-*`**: generate dinamicamente via `` `act-${act}` `` in `app.js:6034`.
  Non sono orfane anche se il grep letterale non le trova.
- **Variabile `--color-chart-contributi`**: usata via `getCSSVar()` in JS, non via `var()` CSS.
  Non è orfana.
