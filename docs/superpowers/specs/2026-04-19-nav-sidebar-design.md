# Nav Sidebar — Sub-progetto C2

**Data**: 2026-04-19
**Branch**: `codex/dev-newfeatures`
**Stato**: design approvato, in attesa di plan
**Predecessore**: sub-progetto C1 (header avatar) completato in commits `f6447e0` → `b8679f5`
**Successore**: sub-progetto C3 (profilo modal cleanup)

## Obiettivo

Sostituire la navigazione attuale (tab-bar orizzontale in alto su desktop, stessa bar fissata in basso con scroll orizzontale su mobile) con una **sidebar verticale sempre aperta** su desktop/tablet, che su mobile si nasconde dietro un'icona hamburger e si apre come drawer a scorrimento laterale.

La sidebar accoglie **tutta la chrome di navigazione e account**: brand, menu principale, menu documenti, Impostazioni, profilo con avatar. L'header superiore viene rimosso del tutto.

## Motivazione

- Mobile oggi mostra 9 tab in bottom-bar a scroll orizzontale: voci tagliate, UX scadente.
- Desktop oggi ha header + tab-bar orizzontale: due righe di chrome sopra il contenuto, che rubano verticale.
- Pattern sidebar (stile Claude, Linear, Notion) massimizza lo spazio verticale, scala bene a 9+ voci, e unifica la chrome in un unico componente responsive.

## Scope

- Desktop e tablet (≥769px): sidebar permanente a sinistra, header rimosso.
- Mobile (≤768px): hamburger in topbar minimale, drawer a scomparsa con stessa sidebar.
- Lo stesso componente DOM è riusato: cambia solo il comportamento via CSS/JS (pattern "drawer collapsed vs permanent").
- Fuori scope: restyling di schermate interne, redesign di `openProfileFiscalModal`, cambio di logica applicativa.

## Vincoli

- Mantenere invariata `switchToTab()` e la struttura `[data-tab="X"]` → `#tab-X` — cambia solo dove il markup della nav vive e come è stilizzato.
- Palette Espresso & Mint del sub-progetto B, token CSS esistenti (`--color-surface`, `--color-primary`, `--space-*`, `--radius-*`).
- Riusare avatar e dropdown di C1 (`#profileMenu`, `toggleProfileMenu()`, `updateProfileMenuTheme()`) — **spostati dentro la sidebar**, non duplicati.
- Niente librerie nuove, niente build step. SVG icone inline.
- Nessuna regressione su: Firebase sync, year selector, sync status indicator.
- Verifica visiva manuale su desktop, tablet (~900px) e mobile (≤480px simulato in DevTools).

## Struttura DOM

### Rimozioni in `index.html`

- L'intero `<header>...</header>` attuale (righe ~6 → ~76), compresi:
  - `.header-brand` con `<h1>Calcoli Partita IVA</h1>`
  - `.header-right` con `#syncStatus`, `.year-selector`, `.profile-avatar-wrap`
- L'intero `<nav id="nav">...</nav>` con i 9 `<button data-tab="…">` (righe ~78-89).

### Nuovo markup

Subito dopo `<body>`, prima di `.container`:

```html
<!-- Topbar mobile (solo ≤768px via CSS) -->
<div class="mobile-topbar">
  <button id="navToggle" class="nav-toggle" type="button"
          aria-label="Apri menu" aria-controls="sidebar" aria-expanded="false"
          onclick="toggleSidebar()">
    <svg viewBox="0 0 24 24" class="ic" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16"/>
    </svg>
  </button>
  <div class="mobile-topbar-title">Calcoli P.IVA</div>
  <div id="syncStatusMobile" class="sync-status-mobile"><!-- popolato da JS --></div>
</div>

<!-- Sidebar (sempre nel DOM; visibilità controllata via CSS) -->
<aside id="sidebar" class="sidebar" aria-label="Navigazione principale">
  <div class="sidebar-backdrop" onclick="closeSidebar()" aria-hidden="true"></div>
  <div class="sidebar-panel">

    <div class="sb-brand">
      <div class="sb-logo" aria-hidden="true">€</div>
      <div class="sb-brand-text">
        <div class="sb-brand-name">Calcoli P.IVA</div>
        <div class="sb-brand-sub">
          <span id="syncStatus" class="sync-status"></span>
          <span class="year-selector-wrap"><!-- year selector esistente spostato qui --></span>
        </div>
      </div>
      <button class="nav-close" type="button" aria-label="Chiudi menu" onclick="closeSidebar()">
        <svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>

    <nav class="sb-nav" role="navigation">
      <div class="sb-section-label">Principale</div>
      <button class="sb-item active" data-tab="calcolo" type="button">
        <span class="sb-ico"><!-- SVG icon --></span>
        <span class="sb-label">Regime Forfettario</span>
      </button>
      <button class="sb-item" data-tab="accantonamento" type="button">…Tasse Accantonate</button>
      <button class="sb-item" data-tab="scadenziario" type="button">…Scadenziario</button>
      <button class="sb-item" data-tab="calendar"       type="button">…Calendario</button>

      <div class="sb-section-label">Documenti</div>
      <button class="sb-item" data-tab="fatture"        type="button">…Fatture</button>
      <button class="sb-item" data-tab="budget"         type="button">…Budget</button>
      <button class="sb-item" data-tab="clienti"        type="button">…Clienti</button>
      <button class="sb-item" data-tab="dichiarazione"  type="button">…Dichiarazione</button>

      <!-- spese rimane hidden/condizionato come oggi -->
      <button class="sb-item" data-tab="spese" type="button" style="display:none">…Spese</button>
    </nav>

    <div class="sb-spacer"></div>

    <button class="sb-item sb-item-muted" data-tab="settings" type="button">
      <span class="sb-ico"><!-- gear SVG --></span>
      <span class="sb-label">Impostazioni</span>
    </button>

    <!-- Profilo: riusa #profileMenu (C1) come popup ancorato sopra questa riga -->
    <div class="sb-profile-wrap">
      <button id="profileAvatar" class="sb-profile" type="button"
              aria-haspopup="menu" aria-expanded="false" aria-controls="profileMenu"
              onclick="toggleProfileMenu()">
        <span id="profileAvatarInitials" class="sb-avatar">·</span>
        <span class="sb-profile-info">
          <span id="profileMenuName" class="sb-profile-name"></span>
          <span id="profileMenuSubtitle" class="sb-profile-sub"></span>
        </span>
        <span class="sb-profile-chev" aria-hidden="true">⌄</span>
      </button>
      <div id="profileMenu" class="profile-menu profile-menu-sidebar" role="menu" hidden>
        <!-- contenuto invariato da C1 -->
      </div>
    </div>

  </div>
</aside>
```

Note:
- Le voci di nav diventano `<button class="sb-item" data-tab="…">` invece di `<button data-tab="…">` sotto `<nav id="nav">`. Il selector JS in `app.js` (`document.querySelectorAll('[data-tab]')`) continua a funzionare purché aggiorniamo la query/selector a tutti i `button[data-tab]`.
- `#profileMenu`, `#profileAvatar`, `#profileAvatarInitials`, `#profileMenuName`, `#profileMenuSubtitle` mantengono gli ID di C1 → le funzioni `toggleProfileMenu`, `closeProfileMenu`, `updateProfileMenuLabels`, `updateProfileMenuTheme` non cambiano.
- `#syncStatus` e `.year-selector` sono spostati dentro la brand area della sidebar; gli ID/classi restano invariati.

## Icone

9 SVG inline (stroke 1.6px, stile Lucide/Feather):

| Tab              | Glyph descrittivo                                           |
|------------------|-------------------------------------------------------------|
| Regime Forfettario | trend-up in cornice (grafico crescente)                   |
| Tasse Accantonate | piggy-bank / box con linea orizzontale                     |
| Scadenziario     | calendar con check                                          |
| Calendario       | calendar semplice                                           |
| Fatture          | documento con corner-fold                                   |
| Budget           | dollar/euro simbolo in cerchio                              |
| Clienti          | users (due figure)                                          |
| Dichiarazione    | documento con righe di testo                                |
| Impostazioni     | gear                                                        |

Gli SVG sono inline nel markup (non sprite, non font), stroke `currentColor` così ereditano il colore dal testo dell'item.

## Stile (`style.css`)

### Token aggiuntivi (opzionali, nessun override dei globali)

```css
:root {
  --sidebar-width: 240px;
  --sidebar-width-collapsed: 64px; /* riservato per futuro, non usato in C2 */
  --topbar-height-mobile: 52px;
}
```

### Layout root

```css
body {
  /* desktop: padding-left = sidebar width */
  padding-left: var(--sidebar-width);
  padding-bottom: 0; /* rimuove safe-area attuale della bottom-bar */
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 28px;
}
```

### Sidebar permanente (desktop)

```css
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--sidebar-width);
  z-index: 40;
  display: flex;
}
.sidebar-panel {
  flex: 1;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  padding: var(--space-3) var(--space-2);
  overflow-y: auto;
}
.sidebar-backdrop { display: none; } /* solo mobile */

.sb-brand { display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-2); border-bottom: 1px solid var(--color-border); margin-bottom: var(--space-2); }
.sb-logo { width: 30px; height: 30px; border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--color-primary), var(--color-tertiary));
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-weight: 700; color: var(--color-bg); }
.sb-brand-name { font-family: var(--font-display); font-weight: 700; font-size: 14px; }
.sb-brand-sub  { display: flex; gap: 6px; align-items: center; font-size: 10.5px; color: var(--color-text-muted); margin-top: 2px; }

.sb-section-label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--color-text-faint); padding: var(--space-3) var(--space-2) var(--space-1); font-weight: 600; }

.sb-item { display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: var(--radius-sm);
  font-size: 13px; color: var(--color-text-muted);
  background: transparent; border: none; cursor: pointer; width: 100%; text-align: left; }
.sb-item:hover { background: var(--color-surface-2); color: var(--color-text); }
.sb-item:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.sb-item.active { background: rgba(93,170,138,.14); color: var(--color-primary); font-weight: 600; }
.sb-ico { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; }
.sb-ico svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 1.6; fill: none; stroke-linecap: round; stroke-linejoin: round; }

.sb-spacer { flex: 1; }
.sb-item-muted { color: var(--color-text-faint); }

.sb-profile-wrap { position: relative; margin-top: var(--space-2); padding-top: var(--space-2); border-top: 1px solid var(--color-border); }
.sb-profile { display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px; background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; }
.sb-profile:hover { background: var(--color-surface-2); }
.sb-avatar { width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-tertiary));
  color: var(--color-bg); font-weight: 700; font-size: 13px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sb-profile-info { flex: 1; min-width: 0; text-align: left; }
.sb-profile-name { display: block; font-size: 12.5px; font-weight: 600; color: var(--color-text); }
.sb-profile-sub  { display: block; font-size: 10.5px; color: var(--color-text-muted); }
.sb-profile-chev { color: var(--color-text-muted); font-size: 12px; }

/* Dropdown ancorato al row profilo: apre verso l'alto */
.profile-menu-sidebar { position: absolute; left: 8px; right: 8px; bottom: calc(100% + 6px); top: auto; }
```

### Topbar mobile + hamburger + drawer

```css
.mobile-topbar { display: none; } /* default: desktop la nasconde */

@media (max-width: 768px) {
  body { padding-left: 0; padding-top: var(--topbar-height-mobile); }

  .mobile-topbar {
    display: flex; align-items: center; gap: var(--space-2);
    position: fixed; top: 0; left: 0; right: 0; height: var(--topbar-height-mobile);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    z-index: 45;
    padding: 0 var(--space-3);
  }
  .nav-toggle { background: transparent; border: none; color: var(--color-text);
    width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm); cursor: pointer; }
  .nav-toggle:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
  .nav-toggle svg { width: 22px; height: 22px; stroke: currentColor; stroke-width: 1.8; fill: none; }
  .mobile-topbar-title { font-family: var(--font-display); font-weight: 700; font-size: 15px; }

  /* Sidebar diventa drawer */
  .sidebar { pointer-events: none; }
  .sidebar-panel {
    position: fixed; top: 0; bottom: 0; left: 0; width: min(84vw, 320px);
    transform: translateX(-100%); transition: transform .22s ease-out;
    box-shadow: 2px 0 24px rgba(0,0,0,.4); pointer-events: auto;
  }
  .sidebar-backdrop {
    display: block; position: fixed; inset: 0;
    background: rgba(0,0,0,.55); opacity: 0; pointer-events: none;
    transition: opacity .22s ease-out;
  }
  .sidebar.open { pointer-events: auto; }
  .sidebar.open .sidebar-panel { transform: translateX(0); }
  .sidebar.open .sidebar-backdrop { opacity: 1; pointer-events: auto; }

  .nav-close { display: inline-flex; } /* pulsante X visibile in drawer */
}

@media (min-width: 769px) {
  .nav-close { display: none; }
}
```

## Comportamento (`app.js`)

### Nuove funzioni

```js
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('navToggle')?.setAttribute('aria-expanded', 'true');
  // blocca scroll body su mobile
  if (window.matchMedia('(max-width: 768px)').matches) {
    document.body.style.overflow = 'hidden';
  }
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('navToggle')?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function toggleSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;
  el.classList.contains('open') ? closeSidebar() : openSidebar();
}
```

### Modifiche a `switchToTab`

Dopo il cambio tab su mobile, chiudere automaticamente il drawer:

```js
function switchToTab(tabName) {
  // … logica esistente invariata …
  if (window.matchMedia('(max-width: 768px)').matches) {
    closeSidebar();
  }
}
```

### ESC modal-aware

Estendere l'handler ESC esistente (introdotto in C1 per `#profileMenu`) per chiudere anche il drawer mobile se aperto. Il drawer ha priorità più bassa del modale ma più alta del menu profilo.

### Initials avatar

La logica `updateProfileMenuLabels()` in C1 (popolamento `#profileAvatarInitials`, `#profileMenuName`, `#profileMenuSubtitle`) continua a funzionare: gli ID non cambiano.

## Accessibilità

- `aria-expanded` sul bottone hamburger sincronizzato con lo stato drawer.
- `aria-current="page"` sul `.sb-item.active`.
- `aria-controls="sidebar"` sull'hamburger.
- Focus trap nel drawer mobile quando aperto (prima apertura: focus sul primo `.sb-item`; Tab cicla dentro pannello + `.nav-close`; Shift+Tab all'indietro).
- ESC chiude il drawer e restituisce il focus all'hamburger.
- `prefers-reduced-motion: reduce` → azzera `transition` su `.sidebar-panel` e `.sidebar-backdrop`.

## Testing manuale (verifica pre-commit)

1. **Desktop ≥769px**: sidebar visibile, tab attiva evidenziata, click su ogni voce cambia tab e aggiorna active state. Nessuna barra in alto.
2. **Desktop — profilo**: click su riga profilo in basso apre `#profileMenu` sopra. Tutte e 4 le azioni (profilo fiscale / impostazioni / tema / logout) funzionano. ESC chiude.
3. **Anno + sync**: year selector dentro la brand area funziona (cambio anno ricarica dati). `#syncStatus` visibile e si aggiorna.
4. **Mobile ≤768px**: topbar con ☰ e titolo; sidebar nascosta. Tap su ☰ apre drawer con animazione, backdrop scuro. Tap su backdrop chiude. Tap su X chiude. Tap su una voce cambia tab E chiude drawer.
5. **Mobile — rotazione**: ruotando in landscape la sidebar resta drawer (breakpoint è solo orizzontale).
6. **Light theme**: tutti i contrasti rispettati, nessun hard-coded.
7. **Keyboard-only**: Tab raggiunge tutte le voci della sidebar; hamburger + Enter apre drawer su mobile; Escape chiude; focus-visible evidente.
8. **Tab "Spese"**: quando forfettario → voce hidden (display:none preservato); quando ordinario → voce visibile.
9. **Prima apertura app**: tab `calcolo` attiva di default, `.active` presente sul relativo `.sb-item`.

## Rischi / follow-up

- **Sub-progetto C3**: il "Profilo fiscale" ora è raggiungibile solo dal menu profilo (dropdown). Eventuale decluttering del modal (C3) resta indipendente da C2.
- **Regressione year selector**: se il selettore anno ha listener su nodi esterni all'header rimosso, assicurarsi che siano stati migrati. Verificare `app.js` per riferimenti a `.header-right`.
- **Fatture tab**: contiene grandi `.fatture-docs-toolbar` già mobile-friendly; la rimozione della vecchia bottom-bar libera spazio verticale, nessuna regressione attesa.
- **Dichiarazione wizard**: apertura tab → verificare che `openDichiarazione()` continui a funzionare da `.sb-item[data-tab="dichiarazione"]`.
- **Test regressione**: nessun test automatico per nav — verifica manuale post-implementazione su desktop (Chrome), mobile (DevTools emulator Pixel/iPhone), e tablet (~900px).

## Fuori scope (proposte per sub-progetti futuri)

- Sidebar collassabile (icon-only mode) su desktop, con toggle dedicato.
- Ricerca globale nella sidebar.
- Breadcrumb / page title in topbar desktop al posto della sidebar fixed brand.
- Keyboard shortcut (`Cmd/Ctrl+K`) per aprire un command palette.
