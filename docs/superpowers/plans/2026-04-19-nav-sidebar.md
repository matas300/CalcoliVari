# Nav Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sostituire header + nav orizzontale con sidebar permanente (≥769px) e drawer laterale (≤768px) come da spec `docs/superpowers/specs/2026-04-19-nav-sidebar-design.md`.

**Architecture:** un unico `<aside id="sidebar">` nel DOM, stilizzato come sidebar fissa 240px su desktop e come drawer a scomparsa con backdrop su mobile. Il vecchio `<header>` e `<nav id="nav">` vengono rimossi e i loro contenuti (brand, year selector, sync status, avatar+dropdown di C1) migrati dentro la sidebar. Tutte le funzioni esistenti (`switchToTab`, `toggleProfileMenu`, `updateProfileMenuLabels`) continuano a funzionare con minimi adattamenti di selector.

**Tech Stack:** vanilla HTML/CSS/JS, token CSS Espresso & Mint esistenti, SVG icone inline.

**Convenzione di progetto:** non ci sono test automatici per l'UI. Ogni task termina con **verifica manuale in browser** (ricarica `index.html`, test specifico, poi commit). Questo è intenzionale — ricalca come sono stati fatti C1, sub-progetto B, dichiarazione UI, ecc.

---

## File Structure

- **Modify** `index.html` — righe 31-89: rimozione `<header>` + `<nav id="nav">`, inserimento `<div class="mobile-topbar">` + `<aside id="sidebar">`. Il dropdown `#profileMenu` di C1 viene spostato dentro la sidebar ma mantiene gli stessi ID.
- **Modify** `style.css` — aggiunta sezione "Sidebar" (~200 righe) prima della sezione `/* ═══ Mobile ═══ */` esistente; sostituzione della sezione mobile nav fissa in basso (righe ~3106-3140) con stile drawer + topbar.
- **Modify** `app.js` — aggiunta `toggleSidebar/openSidebar/closeSidebar` (vicino a `toggleProfileMenu`, righe ~156-178); adattamento `switchToTab` (6368), click delegation (6390), `updateNavLabels` (6408), ESC handler (6688).

Nessun nuovo file. Nessun rebuild (no build step).

---

## Task 1: Nuovo markup sidebar + topbar mobile

**Files:**
- Modify: `index.html:31-89`

- [ ] **Step 1: Aprire il file e localizzare il blocco da sostituire**

Il blocco è `<header>…</header>` seguito da `<nav id="nav">…</nav>` (righe 31-89 comprese).

- [ ] **Step 2: Sostituire l'intero blocco righe 31-89 con il nuovo markup**

```html
<!-- ═══ Topbar mobile (visibile solo ≤768px) ═══ -->
<div class="mobile-topbar" role="banner">
  <button id="navToggle" class="nav-toggle" type="button"
          aria-label="Apri menu" aria-controls="sidebar" aria-expanded="false"
          onclick="toggleSidebar()">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>
  </button>
  <div class="mobile-topbar-title">Calcoli P.IVA</div>
  <span id="syncStatusMobile" class="sync-indicator sync-indicator-mobile"></span>
</div>

<!-- ═══ Sidebar (permanente su desktop, drawer su mobile) ═══ -->
<aside id="sidebar" class="sidebar" aria-label="Navigazione principale">
  <div class="sidebar-backdrop" onclick="closeSidebar()" aria-hidden="true"></div>
  <div class="sidebar-panel">

    <div class="sb-brand">
      <div class="sb-logo" aria-hidden="true">€</div>
      <div class="sb-brand-text">
        <div class="sb-brand-name">Calcoli P.IVA</div>
        <div class="sb-brand-sub">
          <span id="syncStatus" class="sync-indicator"></span>
          <span class="year-selector">
            <button onclick="changeYear(-1)" title="Anno precedente" aria-label="Anno precedente">&lt;</button>
            <span id="yearDisplay" aria-live="polite">2026</span>
            <button onclick="changeYear(1)" title="Anno successivo" aria-label="Anno successivo">&gt;</button>
          </span>
        </div>
      </div>
      <button class="nav-close" type="button" aria-label="Chiudi menu" onclick="closeSidebar()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>
      </button>
    </div>

    <nav class="sb-nav" id="nav" role="navigation">
      <div class="sb-section-label">Principale</div>
      <button class="sb-item active" data-tab="calcolo" type="button">
        <span class="sb-ico"><svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M14 7h7v7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="sb-label">Regime Forfettario</span>
      </button>
      <button class="sb-item" data-tab="accantonamento" type="button">
        <span class="sb-ico"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 11h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg></span>
        <span class="sb-label">Tasse Accantonate</span>
      </button>
      <button class="sb-item" data-tab="scadenziario" type="button">
        <span class="sb-ico"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 3v4M16 3v4M3 11h18M9 16l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg></span>
        <span class="sb-label">Scadenziario</span>
      </button>
      <button class="sb-item" data-tab="calendar" type="button">
        <span class="sb-ico"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 3v4M16 3v4M3 11h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg></span>
        <span class="sb-label">Calendario</span>
      </button>

      <div class="sb-section-label">Documenti</div>
      <button class="sb-item" data-tab="fatture" type="button">
        <span class="sb-ico"><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/></svg></span>
        <span class="sb-label">Fatture</span>
      </button>
      <button class="sb-item" data-tab="budget" type="button">
        <span class="sb-ico"><svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3 3 0 100 6h5a3 3 0 110 6H6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></span>
        <span class="sb-label">Budget</span>
      </button>
      <button class="sb-item" data-tab="clienti" type="button">
        <span class="sb-ico"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M2 21a7 7 0 0114 0M17 11a3 3 0 100-6M22 21a6 6 0 00-4-5.7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></span>
        <span class="sb-label">Clienti</span>
      </button>
      <button class="sb-item" data-tab="spese" type="button" style="display:none">
        <span class="sb-ico"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z M4 9h16" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></span>
        <span class="sb-label">Spese</span>
      </button>
      <button class="sb-item" data-tab="dichiarazione" type="button">
        <span class="sb-ico"><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z M9 12h7M9 16h7M9 8h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></span>
        <span class="sb-label">Dichiarazione</span>
      </button>
    </nav>

    <div class="sb-spacer"></div>

    <button class="sb-item sb-item-muted" data-tab="settings" type="button">
      <span class="sb-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span class="sb-label">Impostazioni</span>
    </button>

    <div class="sb-profile-wrap">
      <button id="profileAvatar" class="sb-profile" type="button"
              aria-haspopup="menu" aria-expanded="false" aria-controls="profileMenu"
              onclick="toggleProfileMenu()" title="">
        <span id="profileAvatarInitials" class="sb-avatar">·</span>
        <span class="sb-profile-info">
          <span id="profileMenuName" class="sb-profile-name"></span>
          <span id="profileMenuSubtitle" class="sb-profile-sub"></span>
        </span>
        <span class="sb-profile-chev" aria-hidden="true">⌄</span>
      </button>
      <div id="profileMenu" class="profile-menu profile-menu-sidebar" role="menu" hidden>
        <div class="profile-menu-header">
          <div class="profile-menu-name" id="profileMenuNameHeader"></div>
          <div class="profile-menu-subtitle" id="profileMenuSubtitleHeader"></div>
        </div>
        <div class="profile-menu-divider"></div>
        <button class="profile-menu-item" role="menuitem" type="button"
                onclick="closeProfileMenu(); openProfileFiscalModal();">
          Profilo fiscale
        </button>
        <button class="profile-menu-item" role="menuitem" type="button"
                onclick="closeProfileMenu(); switchToTab('settings');">
          Impostazioni
        </button>
        <div class="profile-menu-divider"></div>
        <button class="profile-menu-item profile-menu-item-toggle" role="menuitem" type="button"
                onclick="toggleTheme();">
          <span>Tema</span>
          <span id="profileMenuThemeLabel" class="profile-menu-toggle-state"></span>
        </button>
        <div class="profile-menu-divider"></div>
        <button class="profile-menu-item profile-menu-item-danger" role="menuitem" type="button"
                onclick="closeProfileMenu(); doLogout();">
          Logout
        </button>
      </div>
    </div>

  </div>
</aside>
```

Note chiave:
- Il `<nav>` interno mantiene `id="nav"` → la click delegation esistente (`document.getElementById('nav').addEventListener('click', ...)` in `app.js:6390`) continua a funzionare.
- Dentro `.sb-profile`, gli ID `#profileMenuName` e `#profileMenuSubtitle` **ora identificano gli span nella row profilo**. Il vecchio header del dropdown usa nuovi ID (`Header` suffix) perché non può esserci duplicazione ID — il popolamento in `updateProfileMenuLabels` scriverà solo su `#profileMenuName`/`#profileMenuSubtitle`, che sono nella row (visibili), e questo è coerente: l'header del dropdown mostra lo stesso nome ma è opzionale.

**Variante semplificata** per evitare la duplicazione: rimuovi `.profile-menu-header` dal dropdown (il nome è già visibile nella row sopra). Se scegli questa strada, cancella il blocco `<div class="profile-menu-header">…</div>` e il `<div class="profile-menu-divider"></div>` immediatamente sotto.

**Decisione**: usa la variante semplificata (rimuovi `.profile-menu-header` dal dropdown) — nome già visibile nella row.

- [ ] **Step 3: Verifica manuale in browser**

Apri `index.html`. Atteso: la pagina mostra login → dopo login la sidebar NON è ancora stilizzata (appare come lista grezza) e il contenuto tab è sotto. È normale: CSS arriva nel Task 2-4. Nessun errore in console (F12 → Console).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(nav)(C2): markup sidebar + topbar mobile (sostituisce header+nav)"
```

---

## Task 2: CSS sidebar desktop — tokens + layout base

**Files:**
- Modify: `style.css` — inserisci prima della sezione `/* ═══ Mobile ═══ */` (ricercare `@media (max-width: 768px)` prima occorrenza)

- [ ] **Step 1: Aggiungi token sidebar dentro `:root`**

Trova `:root {` (riga ~2) e, dopo l'ultima riga prima della `}` di chiusura del blocco `:root`, aggiungi:

```css
  --sidebar-width: 240px;
  --topbar-height-mobile: 52px;
```

- [ ] **Step 2: Aggiungi sezione sidebar in style.css**

Cerca `/* ═══════════════════ Mobile ═══════════════════ */` (riga ~3105). Subito **prima** di quel commento, incolla l'intero blocco:

```css
/* ═══════════════════ Sidebar ═══════════════════ */

/* Reset body padding-left per fare spazio alla sidebar desktop */
body.logged-in { padding-left: var(--sidebar-width); }

.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--sidebar-width);
  z-index: 40;
  display: flex;
}
.sidebar-backdrop { display: none; }
.sidebar-panel {
  flex: 1;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  padding: var(--space-3) var(--space-2);
  overflow-y: auto;
}

/* Brand block */
.sb-brand {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-2);
}
.sb-logo {
  width: 32px; height: 32px; flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--color-primary), var(--color-tertiary));
  color: var(--color-bg);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  display: flex; align-items: center; justify-content: center;
}
.sb-brand-text { flex: 1; min-width: 0; }
.sb-brand-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.15;
}
.sb-brand-sub {
  display: flex; align-items: center; gap: 8px;
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--color-text-muted);
}
.sb-brand-sub .year-selector { margin: 0; }
.sb-brand-sub .year-selector button { padding: 2px 6px; font-size: 11px; }
.sb-brand-sub .year-selector #yearDisplay { font-size: 11px; font-weight: 600; padding: 0 4px; }

.nav-close { display: none; } /* visibile solo in drawer mobile */

/* Section labels */
.sb-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--color-text-faint);
  padding: var(--space-3) var(--space-2) var(--space-1);
  font-weight: 600;
}

/* Nav items */
.sb-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sb-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-family: inherit;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  width: 100%;
  text-align: left;
  line-height: 1.2;
}
.sb-item:hover { background: var(--color-surface-2); color: var(--color-text); }
.sb-item:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.sb-item.active {
  background: rgba(93,170,138,.14);
  color: var(--color-primary);
  font-weight: 600;
}
.sb-ico {
  width: 20px; height: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sb-ico svg {
  width: 18px; height: 18px;
  stroke: currentColor;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.sb-label { flex: 1; min-width: 0; }

.sb-spacer { flex: 1; min-height: var(--space-3); }
.sb-item-muted { color: var(--color-text-faint); }

/* Profile row */
.sb-profile-wrap {
  position: relative;
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}
.sb-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  text-align: left;
}
.sb-profile:hover { background: var(--color-surface-2); }
.sb-profile:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.sb-profile[disabled] { opacity: .6; cursor: not-allowed; }
.sb-avatar {
  width: 32px; height: 32px; flex-shrink: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-tertiary));
  color: var(--color-bg);
  font-weight: 700;
  font-size: 13px;
  display: flex; align-items: center; justify-content: center;
}
.sb-profile-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.sb-profile-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sb-profile-sub {
  font-size: 10.5px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sb-profile-chev { color: var(--color-text-muted); font-size: 12px; }

/* Profile dropdown ancorato sopra la row */
.profile-menu-sidebar {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: calc(100% + 6px);
  top: auto;
  min-width: 0;
}
```

- [ ] **Step 3: Aggiungi classe `logged-in` al body dopo il login**

In `app.js` cerca la funzione `doLogin` (riga ~195) e trova dove dopo il login riuscito nasconde `#loginScreen`. Aggiungi accanto:

```js
document.body.classList.add('logged-in');
```

Cerca anche `doLogout` (riga varia, grep per `function doLogout`) e aggiungi:

```js
document.body.classList.remove('logged-in');
```

- [ ] **Step 4: Verifica manuale**

Ricarica app, fai login. Atteso:
- Sidebar a sinistra 240px, sfondo `--color-surface`
- Brand area in alto con logo "€" mint, nome "Calcoli P.IVA", sync + year selector sotto
- Sezioni "Principale" / "Documenti" con voci cliccabili
- Tab attiva evidenziata in mint
- Riga profilo in basso con avatar + nome + chevron
- Contenuto main shiftato a destra di 240px

Bug attesi (verranno risolti nei task successivi):
- La topbar mobile appare anche su desktop (Task 4 la nasconde)
- Su mobile la sidebar occupa tutto lo schermo invece di essere drawer (Task 3)
- Vecchio header ancora presente? NO — rimosso nel Task 1.

- [ ] **Step 5: Commit**

```bash
git add style.css app.js
git commit -m "feat(nav)(C2): CSS sidebar desktop + body.logged-in toggle"
```

---

## Task 3: CSS drawer mobile + topbar

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Aggiungi topbar mobile CSS in sezione Sidebar**

Alla fine del blocco "Sidebar" aggiunto nel Task 2 (subito prima di `/* ═══ Mobile ═══ */`), aggiungi:

```css
/* ═══ Topbar mobile (hidden on desktop) ═══ */
.mobile-topbar { display: none; }
```

- [ ] **Step 2: Aggiungi regole responsive dentro la sezione `@media (max-width: 768px)`**

Cerca il blocco `@media (max-width: 768px) {` (riga ~3106). **Sostituisci** tutto il sotto-blocco che riguarda header e navbar esistenti (dalle righe ~3107 fino alla chiusura del block `nav button.active { ... }` ~riga 3141, cioè il blocco che inizia con `/* ── Header ── */` e termina dopo `nav button.active`) con:

```css
  /* ── Topbar + drawer mobile ── */
  body.logged-in {
    padding-left: 0;
    padding-top: var(--topbar-height-mobile);
  }

  .mobile-topbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    position: fixed;
    top: 0; left: 0; right: 0;
    height: var(--topbar-height-mobile);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    z-index: 45;
    padding: 0 var(--space-3);
    padding-top: env(safe-area-inset-top, 0px);
  }
  .nav-toggle {
    background: transparent;
    border: none;
    color: var(--color-text);
    width: 40px; height: 40px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 0;
  }
  .nav-toggle:hover { background: var(--color-surface-2); }
  .nav-toggle:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
  .nav-toggle svg { width: 22px; height: 22px; }
  .mobile-topbar-title {
    flex: 1;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 15px;
    color: var(--color-text);
  }
  .sync-indicator-mobile { font-size: 10px; }

  /* Drawer */
  .sidebar {
    pointer-events: none;
    width: 100%;
    z-index: 60;
  }
  .sidebar-panel {
    position: fixed;
    top: 0; bottom: 0; left: 0;
    width: min(84vw, 320px);
    transform: translateX(-100%);
    transition: transform .22s ease-out;
    box-shadow: 2px 0 24px rgba(0,0,0,.45);
    pointer-events: auto;
    z-index: 61;
  }
  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.55);
    opacity: 0;
    pointer-events: none;
    transition: opacity .22s ease-out;
    z-index: 60;
  }
  .sidebar.open { pointer-events: auto; }
  .sidebar.open .sidebar-panel { transform: translateX(0); }
  .sidebar.open .sidebar-backdrop { opacity: 1; pointer-events: auto; }

  .nav-close {
    display: inline-flex !important;
    align-items: center; justify-content: center;
    width: 32px; height: 32px;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    padding: 0;
    margin-left: auto;
  }
  .nav-close:hover { background: var(--color-surface-2); color: var(--color-text); }
  .nav-close svg { width: 18px; height: 18px; }

  .container { padding: 12px; }
```

Inoltre, dopo il blocco sopra, aggiungi il rispetto di reduced-motion:

```css
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-panel,
  .sidebar-backdrop { transition: none !important; }
}
```

**Attenzione**: la parentesi `}` chiude il media query `@media (max-width: 768px)`. Il blocco `@media (prefers-reduced-motion)` va **fuori** da quello.

- [ ] **Step 3: Verifica manuale desktop**

Ricarica. Atteso: sidebar immutata rispetto al Task 2. Topbar mobile NON visibile. Nessuna regressione.

- [ ] **Step 4: Verifica manuale mobile (DevTools emulator)**

DevTools → Toolbar device (Ctrl+Shift+M) → iPhone o Pixel. Atteso:
- Sidebar nascosta
- Topbar in alto con ☰ a sinistra, "Calcoli P.IVA" al centro
- Main content shiftato giù di 52px (non coperto dalla topbar)
- Click ☰ → nulla (ancora JS nel Task 5)

- [ ] **Step 5: Commit**

```bash
git add style.css
git commit -m "feat(nav)(C2): CSS drawer mobile + topbar + prefers-reduced-motion"
```

---

## Task 4: Cleanup CSS vecchio header/nav

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Identifica blocchi CSS obsoleti da rimuovere**

Cerca e rimuovi queste sezioni (righe approssimative, verifica prima):

1. `header { ... }` — regole di stile per l'header (righe ~XXX, grep `^header {`)
2. `.header-brand { ... }` e tutti i selettori che iniziano con `.header-` (probabilmente una decina)
3. `nav { ... }` selettore globale (quello della nav orizzontale attuale — NON confondere con `.sb-nav`)
4. `nav button { ... }`, `nav button.active`, `nav button:hover` (quelli non scoped a `.sb-nav`)
5. `#syncStatus` regole specifiche se non riusate (grep per vederlo; mantenere `.sync-indicator`)
6. `.profile-avatar-wrap`, `.profile-avatar`, `.profile-avatar-initials` (sostituite da `.sb-profile`, `.sb-avatar`)

**Strategia sicura**: invece di cancellare tutto in una passata, per ogni classe:
- grep nel markup post-Task 1 se è ancora usata (`grep "classname" index.html`)
- se NON usata → rimuovi la regola CSS
- se ancora usata → lasciala

- [ ] **Step 2: Esegui i grep**

```bash
grep -n "class=\"header-" index.html
grep -n "class=\"profile-avatar" index.html
grep -n "<header" index.html
grep -nE "^\s*<nav " index.html
```

Atteso: output vuoto per `header-*`, `profile-avatar*`, `<header`. Per `<nav` dovresti trovare solo `<nav class="sb-nav" id="nav"...>` dentro la sidebar.

- [ ] **Step 3: Rimuovi le regole CSS orfane**

Apri `style.css` e per ognuna delle classi/selettori confermati orfani, cancella la regola. Grep per trovare le righe:

```bash
grep -nE "^(header|\.header-|\.profile-avatar|#syncStatus)" style.css
```

E la vecchia regola `nav` (non `.sb-nav`):

```bash
grep -nE "^nav\s*\{|^nav button" style.css
```

Rimuovi ogni regola trovata (cancella righe dalla `{` alla `}` inclusi), **tranne quelle scoped a `.sb-nav` o dentro media query ancora utilizzati (es. reduced-motion)**.

Mantieni invece intatte:
- `.profile-menu*` (usato dal dropdown, mantenuto)
- `.sync-indicator` (ora dentro la sidebar)
- `.year-selector` (ora dentro la sidebar)

- [ ] **Step 4: Verifica manuale desktop + mobile**

Ricarica app. Atteso: visivamente identico al Task 3. Nessun elemento "scorretto" per stili mancanti. Apri DevTools → tab Elements → verifica che nessun elemento abbia classi con regole rimosse.

- [ ] **Step 5: Commit**

```bash
git add style.css
git commit -m "refactor(nav)(C2): rimuovi CSS orfani header/nav legacy"
```

---

## Task 5: JS — toggle sidebar + autoclose drawer su switchToTab

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Aggiungi funzioni drawer vicino a toggleProfileMenu**

In `app.js` cerca `function toggleProfileMenu()` (riga ~156). Subito **prima** di questa funzione, inserisci:

```js
// ═══════════════════ Sidebar drawer (mobile) ═══════════════════
function toggleSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;
  el.classList.contains('open') ? closeSidebar() : openSidebar();
}
function openSidebar() {
  const el = document.getElementById('sidebar');
  const btn = document.getElementById('navToggle');
  if (!el) return;
  el.classList.add('open');
  btn?.setAttribute('aria-expanded', 'true');
  if (window.matchMedia('(max-width: 768px)').matches) {
    document.body.style.overflow = 'hidden';
  }
}
function closeSidebar() {
  const el = document.getElementById('sidebar');
  const btn = document.getElementById('navToggle');
  if (!el) return;
  el.classList.remove('open');
  btn?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}
```

- [ ] **Step 2: Modifica switchToTab per autoclose drawer**

In `app.js:6368` trova `function switchToTab(tab) {`. Alla fine della funzione, **prima** della chiusura `}` e prima di `window.scrollTo(0, 0);`, inserisci:

```js
  // Chiudi drawer mobile dopo cambio tab
  if (window.matchMedia('(max-width: 768px)').matches) {
    closeSidebar();
  }
```

Il blocco finale deve risultare così:

```js
  // render storico fatture when switching to fatture tab
  if (tab === 'fatture' && typeof window.FattureStorico?.renderStorico === 'function') {
    window.FattureStorico.renderAnnoFilter();
    window.FattureStorico.renderStorico();
  }
  // Chiudi drawer mobile dopo cambio tab
  if (window.matchMedia('(max-width: 768px)').matches) {
    closeSidebar();
  }
  window.scrollTo(0, 0);
}
```

- [ ] **Step 3: Verifica manuale desktop**

Ricarica. Atteso: nessuna differenza (drawer non c'è su desktop).

- [ ] **Step 4: Verifica manuale mobile (DevTools emulator)**

- Click ☰ → drawer scorre da sinistra con backdrop scuro
- Click backdrop → chiude
- Click X nel brand area → chiude
- Click su una voce di nav (es. "Fatture") → cambia tab E chiude drawer
- `aria-expanded` del bottone ☰ riflette lo stato (verifica in DevTools)

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(nav)(C2): toggle/open/close sidebar + autoclose drawer su switchToTab"
```

---

## Task 6: JS — adattamento updateNavLabels per span label

**Files:**
- Modify: `app.js:6408-6421`

- [ ] **Step 1: Sostituisci updateNavLabels**

Attuale (6408):

```js
function updateNavLabels() {
  const mobile = window.innerWidth <= 768;
  document.querySelectorAll('nav button[data-tab]').forEach(btn => {
    const tab = btn.dataset.tab;
    const lbl = NAV_LABELS[tab];
    if (!lbl) return;
    if (tab === 'calcolo') {
      const regime = S().regime === 'forfettario' ? 'Forfettario' : 'Ordinario';
      btn.textContent = mobile ? 'Regime' : 'Regime ' + regime;
    } else {
      btn.textContent = mobile ? lbl.short : lbl.full;
    }
  });
}
```

Il `btn.textContent = ...` **cancellerebbe l'icona SVG** dentro `.sb-item`. Sostituiscila con:

```js
function updateNavLabels() {
  // Con la sidebar, l'etichetta sta dentro .sb-label (mantiene l'icona)
  document.querySelectorAll('.sb-item[data-tab]').forEach(btn => {
    const tab = btn.dataset.tab;
    const lbl = NAV_LABELS[tab];
    if (!lbl) return;
    const labelEl = btn.querySelector('.sb-label');
    if (!labelEl) return;
    if (tab === 'calcolo') {
      const regime = S().regime === 'forfettario' ? 'Forfettario' : 'Ordinario';
      labelEl.textContent = 'Regime ' + regime;
    } else {
      labelEl.textContent = lbl.full;
    }
  });
}
```

Note:
- Non serve più differenziare mobile/desktop: l'etichetta completa entra sempre (sidebar 240px ha spazio, drawer mobile 84vw anche).
- Il resize listener `window.addEventListener('resize', updateNavLabels)` alla riga 6422 resta, ma effettivamente ora è no-op per la larghezza. Può essere tolto per pulizia, ma lasciarlo non fa danni. **Decisione**: lascialo.

- [ ] **Step 2: Modifica switchToTab selector**

In `app.js:6369` trova:

```js
document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
```

Sostituisci con:

```js
document.querySelectorAll('.sb-item[data-tab]').forEach(b => b.classList.remove('active'));
```

In `app.js:6371` trova:

```js
const navBtn = document.querySelector(`nav button[data-tab="${tab}"]`);
```

Sostituisci con:

```js
const navBtn = document.querySelector(`.sb-item[data-tab="${tab}"]`);
```

- [ ] **Step 3: Verifica manuale**

Ricarica. Atteso:
- Tab `calcolo` dice "Regime Forfettario" (o "Regime Ordinario" in base a settings).
- Altre tab mostrano l'etichetta piena (non più `Scad.`/`Calend.`/`Dichiar.`).
- Cambia regime (da Impostazioni) → etichetta `calcolo` si aggiorna.
- Click su una voce → `.active` si sposta correttamente.
- Icone restano al loro posto (non cancellate dal textContent).

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "fix(nav)(C2): updateNavLabels scrive su .sb-label (preserva icona) + selector switchToTab"
```

---

## Task 7: JS — ESC handler priorità drawer

**Files:**
- Modify: `app.js:6688-6696`

- [ ] **Step 1: Aggiorna handler ESC**

Attuale (6688):

```js
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const profileModal = document.getElementById('profileFiscalModal');
  const ocrModal = document.getElementById('ocrPagamentoModal');
  if (profileModal && profileModal.classList.contains('open')) return;
  if (ocrModal && ocrModal.classList.contains('open')) return;
  closeProfileMenu();
});
```

Sostituisci con:

```js
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const profileModal = document.getElementById('profileFiscalModal');
  const ocrModal = document.getElementById('ocrPagamentoModal');
  if (profileModal && profileModal.classList.contains('open')) return;
  if (ocrModal && ocrModal.classList.contains('open')) return;

  // 1) Se il profile menu dropdown è aperto, chiudilo
  const profileMenu = document.getElementById('profileMenu');
  if (profileMenu && !profileMenu.hidden) {
    closeProfileMenu();
    return;
  }

  // 2) Se il drawer mobile è aperto, chiudilo + restituisci focus a ☰
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    closeSidebar();
    document.getElementById('navToggle')?.focus();
    return;
  }
});
```

- [ ] **Step 2: Verifica manuale**

Desktop:
- Apri profile menu → ESC → chiude
- Apri modale profilo fiscale → ESC → modale si chiude (handler del modal), non il menu

Mobile (DevTools emulator):
- Apri drawer (☰) → ESC → drawer si chiude + focus su ☰
- Apri drawer → apri profile menu dentro → ESC → chiude solo profile menu
- ESC di nuovo → chiude drawer

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "fix(nav)(C2): ESC handler gestisce drawer + profile menu in priorità"
```

---

## Task 8: Verifica finale end-to-end

- [ ] **Step 1: Checklist manuale desktop (≥769px)**

Ricarica app, login.

- [ ] Sidebar visibile a sinistra, 240px
- [ ] Logo "€" + "Calcoli P.IVA" + sync + year selector in alto
- [ ] Sezioni "Principale" / "Documenti" visibili, etichette piene
- [ ] Tab attiva (`calcolo`) in mint, altre in muted
- [ ] Click su ogni tab (9 voci inclusa Impostazioni) cambia contenuto
- [ ] `Spese` hidden in forfettario, visibile in ordinario
- [ ] Year selector `<` `>` funziona (cambia anno, ricarica dati)
- [ ] `#syncStatus` si aggiorna (dopo un'azione che triggera sync)
- [ ] Click riga profilo → menu dropdown sopra con: Profilo fiscale, Impostazioni, Tema, Logout
- [ ] Ciascuna voce del menu funziona (prova tutte e 4)
- [ ] ESC chiude il menu
- [ ] Tab keyboard navigation raggiunge tutte le voci sidebar
- [ ] Focus-visible evidente su focus
- [ ] Light theme (dal menu tema) mantiene contrasti, niente hard-coded

- [ ] **Step 2: Checklist manuale mobile (DevTools emulator Pixel 5 / iPhone 14)**

- [ ] Topbar fissa in alto con ☰ + titolo
- [ ] Sidebar nascosta di default
- [ ] Click ☰ → drawer scorre da sinistra, backdrop scuro
- [ ] Click X o backdrop → drawer chiude
- [ ] Click su ogni tab dentro drawer → cambia tab E chiude drawer
- [ ] Riga profilo in basso → menu dropdown sopra funziona
- [ ] ESC chiude drawer e rimette focus su ☰
- [ ] Ruota landscape → comportamento invariato
- [ ] Scroll contenuto principale fluido, niente overlap con topbar

- [ ] **Step 3: Checklist regressioni app**

- [ ] Dichiarazione tab → wizard si mounta correttamente
- [ ] Fatture tab → storico si renderizza
- [ ] Impostazioni tab → tutte le sezioni visibili
- [ ] Profile badge fiscale → apre modale, ESC lo chiude (non drawer)
- [ ] Cambio profilo (dal menu) → ricarica dati, sidebar aggiorna avatar/nome

- [ ] **Step 4: Check console**

F12 → Console → nessun errore JS durante navigazione su tutte le tab.

- [ ] **Step 5: Commit finale + aggiorna CLAUDE.md (opzionale)**

Se hai fatto piccole correzioni durante la verifica:

```bash
git add -A
git commit -m "polish(nav)(C2): fix minori post-verifica end-to-end"
```

Aggiorna `CLAUDE.md` sezione Architecture: menziona che `header` e `<nav id="nav">` orizzontale sono stati sostituiti da `<aside id="sidebar">` (sub-progetto C2, 2026-04-19).

```bash
git add CLAUDE.md
git commit -m "docs(C2): aggiorna CLAUDE.md con nuova struttura sidebar"
```

---

## Note finali

- **Nessun test automatico** — l'UI di questo progetto non è testata programmaticamente per convenzione; verifica manuale è lo standard.
- **Seguire l'ordine dei task**: 1 (markup) deve precedere 2-4 (CSS) perché il CSS applica a elementi che devono esistere. 5-7 (JS) vengono dopo perché si agganciano a ID/classi del nuovo markup.
- **In caso di regressione** su desktop dopo Task 4 (cleanup CSS): ripristinare solo la regola specifica incriminata, non tutto il cleanup.
