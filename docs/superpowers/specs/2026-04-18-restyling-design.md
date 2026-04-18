# Restyling — Sub-progetto B

**Data**: 2026-04-18
**Branch**: `codex/dev-newfeatures` (commit per fase)
**Stato**: design approvato, in attesa di plan
**Predecessore**: sub-progetto A (cleanup) completato in commit 9d07d5d

## Obiettivo

Restyling visivo completo dell'app: nuova palette coerente (warm Espresso & Mint), componenti ridisegnati in stile "Crisp & Tight" (bordi sottili, padding compatto, raggi piccoli), bonifica di colori hard-coded fuori sistema. Solo CSS — nessun cambio di markup HTML né di logica JS.

## Vincoli

- **Solo `style.css`** modificato. Nessun cambio di markup, struttura tab, JS, copy.
- **Entrambi i temi** dark + light devono restare funzionanti e coerenti.
- **Tipografia attuale** mantenuta: Satoshi (display) + Inter (body).
- **Nessuna nuova animazione** — eventuali transizioni esistenti rimangono.
- **Verifica solo visiva manuale**: l'app non ha test CSS automatizzati.

## Palette — Espresso & Mint (C)

### Dark theme
| Token | Hex | Uso |
|-------|-----|-----|
| `--color-bg` | `#15110D` | Sfondo applicazione |
| `--color-surface` | `#221A12` | Card, panel, input bg |
| `--color-surface-2` | `#2C2218` | Surface elevato (modal head, tab attiva) |
| `--color-surface-3` | `#382C20` | Surface molto elevato (modal body) |
| `--color-border` | `#3A2D20` | Bordi 1px su card/input/btn-ghost |
| `--color-text` | `#EFEAE2` | Testo primario |
| `--color-text-muted` | `#A89A87` | Testo secondario, label |
| `--color-text-faint` | `#6F6453` | Testo terziario, placeholder |
| `--color-primary` | `#5DAA8A` | Brand, accenti, CTA |
| `--color-primary-hover` | `#6EBC9C` | Hover su primary |
| `--color-secondary` | `#E89B4A` | Tasse / warning soft |
| `--color-tertiary` | `#C2607A` | Contributi / accenti caldi |
| `--color-success` | `#6FAE6A` | Positivi, "coperto" |
| `--color-warning` | `#D8A657` | Avvisi |
| `--color-error` | `#C86B74` | Errori |
| `--color-info` | `#7BA4C9` | Info neutre |

### Light theme
| Token | Hex |
|-------|-----|
| `--color-bg` | `#F8F5F0` |
| `--color-surface` | `#FFFFFF` |
| `--color-surface-2` | `#F0EBE2` |
| `--color-surface-3` | `#E5DFD3` |
| `--color-border` | `#E5DFD3` |
| `--color-text` | `#2A1F12` |
| `--color-text-muted` | `#6B5A45` |
| `--color-text-faint` | `#9C8F7C` |
| `--color-primary` | `#3F8467` |
| `--color-primary-hover` | `#347059` |
| `--color-secondary` | `#C57A23` |
| `--color-tertiary` | `#A04658` |
| `--color-success` | `#2F8A2A` |
| `--color-warning` | `#B8860B` |
| `--color-error` | `#C0392B` |
| `--color-info` | `#2874A6` |

### Charts e Calendar (derivati)

I token semantici esistenti restano (`--color-chart-*`, `--color-cal-*`) ma le loro hex vengono allineate alla terna primary/secondary/tertiary + accenti.

| Token | Dark | Light |
|-------|------|-------|
| `--color-chart-netto` | `#5DAA8A` (primary) | `#3F8467` |
| `--color-chart-tasse` | `#E89B4A` (secondary) | `#C57A23` |
| `--color-chart-contributi` | `#C2607A` (tertiary) | `#A04658` |
| `--color-cal-lavoro` | `#5DAA8A` | `#3F8467` |
| `--color-cal-ferie` | `#E89B4A` | `#C57A23` |
| `--color-cal-festivo` | `#C2607A` | `#A04658` |
| `--color-cal-mezzagiornata` | `#7BA4C9` | `#2874A6` |
| `--color-cal-malattia` | `#D87C4A` | `#B8500B` |
| `--color-cal-donazione` | `#9B7BC4` | `#6B4DA0` |

## Stile componenti — Crisp & Tight (B)

### Tokens

```css
/* radii */
--radius-xs: 4px;   /* badge */
--radius-sm: 6px;   /* btn, input */
--radius-md: 8px;   /* card */
--radius-lg: 12px;  /* modal */
--radius-pill: 999px;

/* spacing scale */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;

/* shadows */
--shadow-none: none;
--shadow-modal: 0 16px 40px rgba(0,0,0,.45);
```

Le shadow `--shadow-sm`/`--shadow-md`/`--shadow-lg` esistenti diventano `none` (solo `--shadow-modal` resta usato).

### Componenti chiave

- **`.card`**: `bg: --color-surface`, `border: 1px solid --color-border`, `border-radius: --radius-md` (8px), `padding: --space-3 --space-4` (12-14px), no shadow.
- **`.btn` (primary)**: `bg: --color-primary`, `color: --color-bg`, `border: none`, `border-radius: --radius-sm`, `padding: 7px 14px`, `font-weight: 600`, `font-size: 12px`, `text-transform: none`, hover → `--color-primary-hover`.
- **`.btn-ghost` / `.btn-add`**: `bg: transparent`, `color: --color-text`, `border: 1px solid --color-border`, stesso padding/radius, hover → `bg: --color-surface-2`.
- **`.badge-stato`**: outline maiuscolo. `bg: transparent`, `color: <stato>`, `border: 1px solid currentColor`, `border-radius: --radius-xs`, `padding: 2px 8px`, `font-size: 10px`, `font-weight: 600`, `letter-spacing: .04em`, `text-transform: uppercase`. Mappatura colori per stato: bozza → muted, inviata → info, pagata → success, annullata → error.
- **`input`, `select`, `textarea`**: `bg: --color-bg`, `border: 1px solid --color-border`, `border-radius: --radius-sm`, `padding: 7px 10px`, `font-size: 12px`, focus → `border-color: --color-primary`.
- **`.modal`**: `bg: --color-surface-3`, `border-radius: --radius-lg` (12px), `box-shadow: --shadow-modal`. Header `bg: --color-surface-2`, body `bg: --color-surface-3`.
- **`.tab-content` attiva**: solo cambio colore, no nuovi raggi.
- **Label / kicker**: `font-size: 10px`, `letter-spacing: .08em`, `text-transform: uppercase`, `color: --color-text-faint`.
- **Valori monetari prominenti**: `font-family: Satoshi`, `font-weight: 700`, `letter-spacing: -.01em`, tabular-nums.

## Fasi

Sequenziali, ognuna è un commit isolato.

### Fase 1 — Foundation (CSS variables)

Riscrivere il blocco `:root` (dark) e `html[data-theme="light"]` di `style.css` con la palette C completa, più i nuovi token `--radius-*` e `--space-*`. Le shadow `--shadow-sm/md/lg` diventano `none`. Allineare `--color-chart-*` e `--color-cal-*` ai nuovi valori.

Smoke visivo: dopo la fase, l'app è completamente colorata in palette C ma layout e componenti restano com'erano. Nessun refactor di classi.

### Fase 2 — Componenti

Refactor delle classi `.card`, `.btn`, `.btn-add`, `.btn-ghost`, `.badge-stato`, `.input`/`select`/`textarea`, `.modal`, `.label`, `.tab-content` per applicare lo stile Crisp & Tight (raggi piccoli, padding compatto, bordi 1px, badge outline maiuscolo).

Riallineare classi `.fattura-*`, `.dichiarazione-*`, `.scadenziario-*` solo dove hanno valori hard-coded che divergono dai token semantici (eredità del cleanup).

### Fase 3 — Polish per-tab

Smoke manuale tab per tab. Per ciascuna (Forfettario, Accantonate, Scadenziario, Calendario, Fatture, Budget, Clienti, Spese, Dichiarazione, Impostazioni), cercare:
- Colori hard-coded sopravvissuti (`#xxxxxx` letterali nelle regole CSS specifiche del tab)
- Padding/raggi inconsistenti rispetto al sistema (es. `border-radius: 20px` orfano)
- Badge / pillole ancora in vecchio stile

Fix mirati con commit per tab se servono — altrimenti un commit unico.

Aggiornare CLAUDE.md sezione "Color System" con i nuovi token (palette, raggi, spacing).

## Verifica e rollback

- **Verifica**: solo visiva manuale (l'app non ha test CSS). Dopo ciascuna fase, aprire `index.html`, login Demo, ciclare tutti i tab in dark e in light.
- **Rollback**: ogni fase è un commit isolato → `git revert <hash>` chirurgico se una fase causa una regressione.
- **No breakage funzionale atteso**: nessun JS o markup viene toccato; bug funzionali sono in scope solo se causati da CSS che nasconde o sovrappone elementi (improbabile).

## Out of scope esplicito

- Cambio tipografia (Satoshi + Inter restano)
- Restructure di markup HTML / cambio tab order / cambio copy
- Animazioni nuove / transizioni nuove
- Test automatici su CSS
- Mobile-specific redesign (le media query esistenti restano coerenti)
- Refactor di JS o logica
- Cleanup ulteriore di code morto (sub-progetto A è chiuso)

## Deliverable

- 3 commit di restyling (uno per fase)
- CLAUDE.md aggiornato in fase 3
