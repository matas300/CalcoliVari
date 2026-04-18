# Restyling — Sub-progetto B — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Applicare la palette "Espresso & Mint" (C) e lo stile componenti "Crisp & Tight" (B) all'app, mantenendo entrambi i temi dark+light, senza toccare HTML né JS.

**Architecture:** Solo `style.css`. Tre fasi sequenziali, un commit per fase: (1) riscrittura dei token CSS root + light, (2) refactor delle classi componente esistenti, (3) polish manuale per-tab + aggiornamento CLAUDE.md. Verifica solo visiva — nessun test automatico CSS.

**Tech Stack:** CSS variables, dark/light theme via `html[data-theme="light"]`, vanilla CSS (no preprocessor, no build step). Tipografia esistente: Satoshi + Inter.

**Spec di riferimento:** `docs/superpowers/specs/2026-04-18-restyling-design.md`

**Branch:** `codex/dev-newfeatures` (commit per fase, no PR fino al merge finale)

---

## Note di scopo

- L'app **non ha** una classe generica `.card` o `.modal`: ci sono varianti specifiche (`.calc-param-card`, `.cliente-card`, `.fatture-docs-card`, `.fattura-summary-card`, `.month-card`, `.profile-modal`, `.profile-modal-panel`, `.ocr-modal-*`, `.fattura-modal-toast`, ecc.). Il refactor agisce sui token usati da queste classi (variabili `--color-*`, `--radius-*`, `--shadow-*`) — non si introducono classi nuove.
- Esistono `.btn-add`, `.btn-ghost`, `.btn-primary`, `.btn-del`, `.btn-add-fatt`, `.btn-del-fatt`, `.btn-oggi`, `.btn-remove`. La fase 2 le riallinea allo stile Crisp.
- `.badge-stato` (a riga 3938) è già una badge ma stile vecchio (pillola pieno colore): va portato a outline maiuscolo.
- Verifica solo visiva manuale: aprire `index.html` in browser dopo ogni fase, login Demo, ciclare tutti i tab in dark e in light.

---

## Task 1 — Foundation (CSS variables)

**Files:**
- Modify: `style.css:1-88` (blocco `:root` + `html[data-theme="light"]` opening)

Riscrivere palette + token a un colpo solo. Le shadow `--shadow-sm/md/lg` diventano `none` (il refactor componenti rimuoverà i loro usi in fase 2 — qui basta neutralizzarle). Aggiungere `--radius-xs`, `--radius-pill`, `--space-1..6`, `--shadow-modal`. Allineare `--color-chart-*` e `--color-cal-*` ai nuovi valori. Aggiungere `--color-secondary`, `--color-tertiary` (mancavano).

- [ ] **Step 1.1: Riscrivere il blocco `:root` (style.css:1-57)**

Sostituire l'intero blocco con:

```css
:root {
  /* ── Palette C — Espresso & Mint (dark) ── */
  --color-bg: #15110D;
  --color-surface: #221A12;
  --color-surface-2: #2C2218;
  --color-surface-3: #382C20;
  --color-border: #3A2D20;

  --color-text: #EFEAE2;
  --color-text-muted: #A89A87;
  --color-text-faint: #6F6453;

  --color-primary: #5DAA8A;
  --color-primary-hover: #6EBC9C;
  --color-secondary: #E89B4A;
  --color-tertiary: #C2607A;

  --color-success: #6FAE6A;
  --color-warning: #D8A657;
  --color-error: #C86B74;
  --color-info: #7BA4C9;

  /* ── Shadows (Crisp: nessuna ombra tranne modal) ── */
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
  --shadow-modal: 0 16px 40px rgba(0,0,0,.45);

  /* ── Radii ── */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 12px;
  --radius-pill: 999px;

  /* ── Spacing scale ── */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* ── Typography ── */
  --font-display: 'Satoshi', sans-serif;
  --font-body: 'Inter', sans-serif;

  /* ── Chart / calendar semantic colors ── */
  --color-chart-netto:       #5DAA8A;
  --color-chart-tasse:       #E89B4A;
  --color-chart-contributi:  #C2607A;
  --color-cal-lavoro:        #5DAA8A;
  --color-cal-ferie:         #E89B4A;
  --color-cal-festivo:       #C2607A;
  --color-cal-mezzagiornata: #7BA4C9;
  --color-cal-malattia:      #D87C4A;
  --color-cal-donazione:     #9B7BC4;

  /* ── Alias legacy (mantenuti per non rompere selettori esistenti) ── */
  --bg: var(--color-bg);
  --surface: var(--color-surface);
  --surface2: var(--color-surface-2);
  --surface3: var(--color-surface-3);
  --accent: var(--color-primary);
  --accent2: #34302A;
  --text: var(--color-text);
  --text2: var(--color-text-muted);
  --text3: var(--color-text-faint);
  --green: var(--color-success);
  --red: var(--color-error);
  --yellow: var(--color-warning);
  --blue: var(--color-info);
}
```

- [ ] **Step 1.2: Riscrivere il blocco `html[data-theme="light"]` opening (style.css:59-88)**

Sostituire **solo** il primo blocco light (le 30 righe iniziali, fino a `--accent2: #B0D4D8;`); lasciare intatti gli override successivi (`html[data-theme="light"] .login-box button` e seguenti) — verranno rivisti in fase 3 se serve.

```css
/* ── Light theme ── */
html[data-theme="light"] {
  color-scheme: light;
  --color-bg: #F8F5F0;
  --color-surface: #FFFFFF;
  --color-surface-2: #F0EBE2;
  --color-surface-3: #E5DFD3;
  --color-border: #E5DFD3;
  --color-text: #2A1F12;
  --color-text-muted: #6B5A45;
  --color-text-faint: #9C8F7C;
  --color-primary: #3F8467;
  --color-primary-hover: #347059;
  --color-secondary: #C57A23;
  --color-tertiary: #A04658;
  --color-success: #2F8A2A;
  --color-warning: #B8860B;
  --color-error: #C0392B;
  --color-info: #2874A6;
  --color-chart-netto:       #3F8467;
  --color-chart-tasse:       #C57A23;
  --color-chart-contributi:  #A04658;
  --color-cal-lavoro:        #3F8467;
  --color-cal-ferie:         #C57A23;
  --color-cal-festivo:       #A04658;
  --color-cal-mezzagiornata: #2874A6;
  --color-cal-malattia:      #B8500B;
  --color-cal-donazione:     #6B4DA0;
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
  --shadow-modal: 0 16px 40px rgba(0,0,0,.18);
  --accent2: #DCE8E2;
}
```

- [ ] **Step 1.3: Smoke visivo manuale — dark**

Aprire `index.html` in browser, login profilo Demo, lasciare tema dark. Ciclare i tab: Forfettario, Accantonate, Scadenziario, Calendario, Fatture, Budget, Clienti, Spese, Dichiarazione, Impostazioni.

Atteso: app interamente colorata in palette C (sfondo Espresso scuro, accenti mint, secondary arancio caldo), layout invariato, nessun testo illeggibile, nessuna ombra residua percepibile (le `--shadow-*` ora sono `none`).

- [ ] **Step 1.4: Smoke visivo manuale — light**

Toggle al tema light dalle Impostazioni. Ripetere il giro tab.

Atteso: sfondo cream warm, primary teal scuro, contrasto leggibile su testo. Nessun residuo di palette vecchia (cioè nessun blu `#2EAADC` né rosso `#E94560` visibile su grafici/calendario).

Se trovi colori legacy hard-coded che sopravvivono in regole specifiche (es. `background: #2EAADC` letterale dentro una regola tab-specifica), **non aggiustare ora** — annota il selettore per la fase 3.

- [ ] **Step 1.5: Commit**

```bash
git add style.css
git commit -m "feat(style): foundation palette Espresso & Mint + new tokens

- Palette C dark+light (warm Espresso bg, mint primary, secondary/tertiary)
- New tokens: --radius-xs/pill, --space-1..6, --shadow-modal
- Shadows --shadow-sm/md/lg azzerate (Crisp & Tight: no shadows tranne modal)
- Allineati --color-chart-* e --color-cal-* alla nuova terna

Spec: docs/superpowers/specs/2026-04-18-restyling-design.md (fase 1/3)"
```

---

## Task 2 — Componenti (Crisp & Tight)

**Files:**
- Modify: `style.css` — classi: `input`/`select`/`textarea` (righe 513-523, 794-812), `.btn-add` (525-531), `.btn-ghost` (532-551), `.btn-primary` (552-571), `.btn-del` (572-576), `.btn-add-fatt`/`.btn-del-fatt` (3112-3124), `.btn-remove`/`.btn-add` riga 3895-3896, `.badge-stato` (3938-3950), modali `.profile-modal-panel` (~850), `.ocr-modal-*` (~1984), `.fattura-modal-*` (~1775), card varianti (`.calc-param-card`, `.cliente-card`, `.fatture-docs-card`, `.fattura-summary-card`, `.month-card`).

Refactor delle classi esistenti per applicare lo stile Crisp & Tight: bordi 1px, padding compatto, raggi piccoli, badge outline maiuscolo, niente shadow (tranne modal). NON si introducono classi nuove. Nessuna modifica a HTML/JS.

- [ ] **Step 2.1: Refactor input/select/textarea**

Sostituire la regola a `style.css:513-523`:

```css
input[type="number"], input[type="text"] {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: var(--radius-sm);
  padding: 7px 10px;
  font-size: 12px;
  width: 120px;
  text-align: right;
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(93,170,138,.18);
}
input:disabled, select:disabled { opacity: .4; cursor: not-allowed; }
```

Sostituire la regola textarea a `style.css:794-812` (cercare `^textarea\s*\{`):

```css
textarea {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: var(--radius-sm);
  padding: 7px 10px;
  font-size: 12px;
  font-family: var(--font-body);
  width: 100%;
  resize: vertical;
}
textarea::placeholder,
input::placeholder {
  color: var(--color-text-faint);
}
```

(Mantenere il blocco `textarea:focus` se esiste, oppure rimuoverlo perché coperto dalla regola unificata `input:focus, select:focus, textarea:focus` sopra.)

- [ ] **Step 2.2: Refactor `.btn-add` e `.btn-primary` (CTA primarie)**

Sostituire `style.css:525-531`:

```css
.btn-add {
  background: var(--color-primary);
  color: var(--color-bg);
  border: none;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
  margin-top: 12px;
}
.btn-add:hover { background: var(--color-primary-hover); }
```

Sostituire `style.css:552-571`:

```css
.btn-primary {
  min-height: auto;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--color-primary);
  color: var(--color-bg);
  cursor: pointer;
  font: 600 12px/1.2 var(--font-body);
}
.btn-primary:hover {
  background: var(--color-primary-hover);
}
.btn-primary:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(93,170,138,.28);
}
```

- [ ] **Step 2.3: Refactor `.btn-ghost`**

Sostituire `style.css:532-551`:

```css
.btn-ghost {
  min-height: auto;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font: 600 12px/1.2 var(--font-body);
}
.btn-ghost:hover {
  background: var(--color-surface-2);
}
.btn-ghost:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(93,170,138,.18);
}
```

- [ ] **Step 2.4: Refactor `.btn-del`, `.btn-remove`, `.btn-add-fatt`, `.btn-del-fatt`**

Modificare `style.css:572-576` (`.btn-del`):

```css
.btn-del {
  background: transparent;
  color: var(--color-error);
  border: 1px solid var(--color-error);
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

A `style.css:3895-3896` ci sono due regole inline su una riga ciascuna (`.btn-remove` e una *seconda* `.btn-add` che fa override). Sostituire entrambe con:

```css
.btn-remove {
  background: transparent;
  border: 1px solid var(--color-error);
  color: var(--color-error);
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  font-size: 11px;
  margin-left: 8px;
}
```

(La seconda `.btn-add` a riga 3896 è un duplicato che fa override del `.btn-add` principale con uno stile "info-blue" hard-coded. **Rimuoverla**: non serve più, visto che `.btn-add` ora ha lo stile Crisp standard.)

A `style.css:3112-3124` (`.btn-add-fatt`, `.btn-del-fatt`): sostituire con:

```css
.btn-add-fatt, .btn-del-fatt {
  border: 1px solid var(--color-border);
  background: transparent;
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.btn-add-fatt {
  background: var(--color-primary);
  color: var(--color-bg);
  border-color: transparent;
}
.btn-del-fatt {
  color: var(--color-error);
  border-color: var(--color-error);
}
.btn-add-fatt:hover, .btn-del-fatt:hover { opacity: .88; }
```

- [ ] **Step 2.5: Refactor `.badge-stato` (outline uppercase)**

Sostituire `style.css:3938-3950`:

```css
.badge-stato {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: transparent;
  border: 1px solid currentColor;
}
.badge-stato.bozza     { color: var(--color-text-muted); }
.badge-stato.inviata   { color: var(--color-info); }
.badge-stato.pagata    { color: var(--color-success); }
.badge-stato.annullata { color: var(--color-error); }
```

- [ ] **Step 2.6: Refactor card varianti**

Le classi card esistenti (`.calc-param-card`, `.cliente-card`, `.fatture-docs-card`, `.fattura-summary-card`, `.month-card`) usano `var(--surface*)` + `var(--radius-*)` + `var(--shadow-*)`.

Per ognuna, aprire la regola e:
1. Verificare che `border-radius` sia `var(--radius-md)` (8px). Se è `var(--radius-lg)` o un valore hard-coded ≥ 12px, sostituire con `var(--radius-md)`.
2. Verificare che `box-shadow` sia `var(--shadow-sm)` o assente. Se hard-coded, sostituire con `var(--shadow-sm)` (che ora è `none`).
3. Verificare che `border` sia `1px solid var(--color-border)` o `none`. Lasciare invariato.
4. Verificare che `padding` sia compatto (~12-16px). Se ≥ 20px, ridurre a `var(--space-3) var(--space-4)`.

Le classi da scorrere (con riga di partenza approssimativa): `.month-card` (603), `.calc-param-card` (1104), `.cliente-card` (1337), `.cliente-card-summary` (1348), `.fatture-docs-card` / `.fattura-summary-card` (1526-1527).

Esempio (`.cliente-card` a riga 1337) — guarda il blocco corrente, e applica i 4 controlli sopra. Se il blocco è già coerente con il sistema (raggi token, shadow token, padding ≤ 16px), **non toccarlo**.

- [ ] **Step 2.7: Refactor modali**

Modali esistenti: `.profile-modal-panel` (~riga 850), `.ocr-modal-shell` (~1984), `.ocr-modal-header` (~1989), `.fattura-modal-toast` (~1775).

Per `.profile-modal-panel` e `.ocr-modal-shell`:
1. `border-radius`: `var(--radius-lg)` (12px)
2. `box-shadow`: `var(--shadow-modal)`
3. `background`: `var(--color-surface-3)` (body)

Per `.ocr-modal-header`: `background: var(--color-surface-2)` (head distinta dal body).

Se le regole correnti già usano token coerenti, applicare solo le modifiche minime.

- [ ] **Step 2.8: Smoke visivo manuale — dark + light**

Ricarica `index.html`. Per ogni tema:
- Tab Fatture → bottone "Nuova fattura" (CTA mint piatta), apri modal nuovo, verifica input compatti + bordi sottili. Crea bozza, vedi badge "BOZZA" outline maiuscolo nella tabella storico.
- Tab Clienti → card cliente bordi sottili, niente shadow.
- Tab Forfettario → bottoni sezione (`.btn-ghost`) outline.
- Toggle tema, ripeti spot-check.

Atteso: aspetto "tool da pro Linear-like", denso, no ombre, badge outline. Nessun bottone con stile vecchio (rosso pieno o blu rgba 0.18).

- [ ] **Step 2.9: Commit**

```bash
git add style.css
git commit -m "feat(style): componenti Crisp & Tight (btn, input, badge, card, modal)

- Bottoni piatti, niente shadow, padding compatto (.btn-add/.btn-primary/.btn-ghost)
- Input/select/textarea: bg --color-bg, bordo 1px, raggio 6px, font 12px
- .badge-stato: outline maiuscolo (transparent + currentColor)
- Card varianti: raggi 8px coerenti, shadow rimosse
- Modali: radius 12px + --shadow-modal
- Rimosso duplicato .btn-add a riga 3896 (override info-blue obsoleto)

Spec: docs/superpowers/specs/2026-04-18-restyling-design.md (fase 2/3)"
```

---

## Task 3 — Polish per-tab + CLAUDE.md

**Files:**
- Modify: `style.css` (fix mirati hard-coded)
- Modify: `CLAUDE.md` (sezione "Color System")

Ultima passata: cercare colori hard-coded sopravvissuti, padding/raggi inconsistenti rispetto al sistema, badge legacy. Aggiornare la documentazione.

- [ ] **Step 3.1: Audit colori hard-coded sopravvissuti**

Eseguire una grep su `style.css` per esadecimali letterali:

```bash
grep -nE "#[0-9A-Fa-f]{6}\b" style.css | grep -v "^[0-9]*:\s*--color\|^[0-9]*:\s*--shadow"
```

Per ogni match, valutare:
- Se è un colore della **vecchia palette** (`#2EAADC`, `#E94560`, `#F5A623`, `#4FA3A5`, `#4ECCA3`, `#4A9EFF`, `#E67E22`, `#7C5CBF`, `#0E141B`, `#131C24`, `#34515B`, ecc.): sostituire con il token semantico più appropriato (`var(--color-primary)`, `var(--color-secondary)`, `var(--color-tertiary)`, `var(--color-info)`, `var(--color-cal-*)`, ecc.).
- Se è un grigio neutro o un colore di stato che il sistema già copre: sostituire con il token.
- Se è un colore custom giustificato (es. logo, illustrazione): lasciare con un commento `/* intentional */`.

Casi noti da verificare a partire dall'output della grep: `.btn-oggi` (riga 3103-3108) usa `rgba(111,167,216,.22)` (vecchio info-blue) — sostituire con `rgba(93,170,138,.18)` o `var(--color-surface-2)`.

- [ ] **Step 3.2: Audit raggi orfani**

```bash
grep -nE "border-radius:\s*[0-9]+px" style.css
```

Per ogni `border-radius` letterale (non token):
- 4px → `var(--radius-xs)`
- 6px → `var(--radius-sm)`
- 8px → `var(--radius-md)`
- 12px → `var(--radius-lg)`
- 999px o 50% su pill → `var(--radius-pill)`
- Valori orfani (es. 10px, 20px, 14px, 16px, 22px) → arrotondare al token più vicino e sostituire.

Eccezione: cerchi (avatar, donut bg) usano `border-radius: 50%` — lasciare invariati.

- [ ] **Step 3.3: Smoke per-tab — dark**

In ordine: Forfettario, Accantonate, Scadenziario, Calendario, Fatture (incl. modale nuova fattura, anteprima XML, storico, NC), Budget, Clienti, Spese, Dichiarazione, Impostazioni.

Per ogni tab annotare: colori vecchi residui (raro, dovrebbero essere stati intercettati 3.1), badge non outline, padding eccessivo. Fix mirati se necessari.

- [ ] **Step 3.4: Smoke per-tab — light**

Toggle tema light, ripeti il giro. Light theme ha più override specifici (style.css righe 89-260+, 2315, 2318, 3917+) — segnalare se qualcuno è ora ridondante (token già coprono il caso) e rimuoverlo.

- [ ] **Step 3.5: Aggiornare `CLAUDE.md` — sezione "Color System"**

Sostituire l'intera sezione "Color System" (cercare `### Color System` in `CLAUDE.md`) con:

```markdown
### Color System

Tutti i colori sono token CSS in `:root` (dark) e `html[data-theme="light"]` (light). Mai hard-coded.

**Palette — Espresso & Mint (palette C, restyling sub-progetto B 2026-04-18):**
- **Surface scale**: `--color-bg` → `--color-surface` → `--color-surface-2` → `--color-surface-3` (dal più scuro/sfondo al più chiaro/elevato)
- **Text scale**: `--color-text` (primario) → `--color-text-muted` (secondario, label) → `--color-text-faint` (terziario, placeholder)
- **Accent**: `--color-primary` (mint, CTA), `--color-primary-hover`, `--color-secondary` (arancio caldo), `--color-tertiary` (rosa caldo)
- **Stato**: `--color-success`, `--color-warning`, `--color-error`, `--color-info`
- **Charts**: `--color-chart-netto` / `--color-chart-tasse` / `--color-chart-contributi` (allineati a primary/secondary/tertiary)
- **Calendar day types**: `--color-cal-lavoro`, `--color-cal-ferie`, `--color-cal-festivo`, `--color-cal-mezzagiornata`, `--color-cal-malattia`, `--color-cal-donazione`

**Token di sistema (Crisp & Tight):**
- **Radii**: `--radius-xs` 4px (badge), `--radius-sm` 6px (btn, input), `--radius-md` 8px (card), `--radius-lg` 12px (modal), `--radius-pill` 999px
- **Spacing scale**: `--space-1` 4px, `--space-2` 8px, `--space-3` 12px, `--space-4` 16px, `--space-5` 24px, `--space-6` 32px
- **Shadows**: `--shadow-sm/md/lg` sono `none` (stile Crisp); usare `--shadow-modal` solo per modali
- **Typography**: `--font-display` (Satoshi, valori prominenti), `--font-body` (Inter)

**Componenti:**
- Bottoni: piatti, no shadow, padding 7×14, raggio `--radius-sm`. CTA primaria = `--color-primary` su `--color-bg`. Ghost = transparent + bordo `--color-border`.
- Input: `--color-bg` bg, bordo 1px `--color-border`, font 12px, focus `--color-primary` + alone 2px.
- Badge stato: outline maiuscolo, `transparent` + `currentColor` border, font 10px letter-spacing .04em.
- Card: `--color-surface` bg, `--color-border` 1px, raggio `--radius-md`, padding `--space-3 --space-4`, no shadow.
- Modal: bg `--color-surface-3`, raggio `--radius-lg`, `--shadow-modal`. Header `--color-surface-2`.

**Helper JS**: `getCSSVar(name)` in `app.js` legge una CSS variable a runtime via `getComputedStyle` — usarla in JS dove serve un colore risolto (es. SVG fill, canvas). `DAY_TYPES` usa `var(--color-cal-*)`; `drawDonut()` e `drawMiniBars()` chiamano `getCSSVar()` al render time così i colori si aggiornano al cambio tema.
```

- [ ] **Step 3.6: Smoke finale dark + light**

Ultimo giro completo dei 10 tab, dark e light. Conferma soggettiva: l'app ha personalità Espresso & Mint, è coerente, niente vecchio blu/rosso vivido, badge outline ovunque, nessun bottone "soft" residuo.

- [ ] **Step 3.7: Commit**

```bash
git add style.css CLAUDE.md
git commit -m "polish(style): bonifica hard-coded + raggi + CLAUDE.md aggiornato

- Sostituiti esadecimali della vecchia palette con token semantici
- Raggi letterali rimpiazzati con --radius-* del sistema
- Override light theme ridondanti rimossi (dove i token già coprono)
- CLAUDE.md sezione 'Color System' riscritta per palette C + token Crisp & Tight

Spec: docs/superpowers/specs/2026-04-18-restyling-design.md (fase 3/3) — restyling completo"
```

---

## Verifica e rollback

- **Verifica**: solo visiva manuale (l'app non ha test CSS automatici). Ogni fase ha smoke step esplicito.
- **Rollback**: ogni fase è un commit isolato → `git revert <hash>` per rollback chirurgico.
- **No breakage funzionale atteso**: nessun JS o markup viene toccato. Bug funzionali in scope solo se CSS nasconde/sovrappone elementi (improbabile).

## Out of scope esplicito (dal design)

- Cambio tipografia, restructure markup, animazioni nuove, test automatici CSS, mobile-specific redesign, refactor JS, ulteriore cleanup codice morto.
