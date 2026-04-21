# Header Avatar — Sub-progetto C1

**Data**: 2026-04-18
**Branch**: `codex/dev-newfeatures` (commit isolato per task)
**Stato**: design approvato, in attesa di plan
**Predecessore**: sub-progetto B (restyling) completato in commits `76b060a` → `0886578`
**Successore**: sub-progetto C2 (mobile bottom nav redesign)

## Obiettivo

Sostituire il pillone "Profilo fiscale" a sinistra del titolo con un avatar compatto in header destro che apre un dropdown menu. Il dropdown raccoglie tutte le azioni di "account" (profilo fiscale, impostazioni, tema, logout) liberando lo spazio destro dell'header dei tre bottoni separati attualmente lì (`#themeToggle`, `.logout-btn`, `#settingsBtn`).

## Vincoli

- Solo **desktop** in scope. Mobile (≤768px) usa lo stesso dropdown right-aligned, senza redesign mobile-specifico (rimandato a C2).
- Modale profilo fiscale (`openProfileFiscalModal`) e logica `doLogout`/`toggleTheme`/`switchToTab('settings')` non vengono toccate — il menu invoca le funzioni esistenti.
- Stile coerente con sub-progetto B: palette Espresso & Mint, raggi piccoli (`--radius-md` per il menu), no shadow tranne `--shadow-modal`.
- Nessun cambio a `firebase-sync.js`, `tax-engine.js`, dichiarazione, fatture.
- Verifica solo visiva manuale (no test CSS automatici); funzionale via click manuale su ogni voce.

## Markup (`index.html`)

### Rimozioni

- In `.header-brand`: rimuovere il `<button id="profileBadge" class="profile-trigger">…</button>` (righe ~34-37). Resta solo `<h1>Calcoli Partita IVA</h1>`.
- In `.header-right`: rimuovere `#themeToggle`, `.logout-btn`, `#settingsBtn` (righe ~41-43). Rimangono `#syncStatus` e `.year-selector`.

### Aggiunte

In coda a `.header-right`, dopo `.year-selector`:

```html
<div class="profile-avatar-wrap">
  <button id="profileAvatar" class="profile-avatar" type="button"
          aria-haspopup="menu" aria-expanded="false" aria-controls="profileMenu"
          onclick="toggleProfileMenu()" title="">
    <span id="profileAvatarInitials" class="profile-avatar-initials">·</span>
  </button>
  <div id="profileMenu" class="profile-menu" role="menu" hidden>
    <div class="profile-menu-header">
      <div id="profileMenuName" class="profile-menu-name"></div>
      <div id="profileMenuSubtitle" class="profile-menu-subtitle"></div>
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
            onclick="toggleTheme(); updateProfileMenuTheme();">
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
```

## Stile (`style.css`)

Tutti i token sono già in `:root` da sub-progetto B.

```css
.profile-avatar-wrap {
  position: relative;
  display: inline-flex;
}

.profile-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  border: 1px solid var(--color-primary);
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .02em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: background-color .12s ease, border-color .12s ease;
}
.profile-avatar:hover,
.profile-avatar[aria-expanded="true"] {
  background: var(--color-surface-3);
  border-color: var(--color-primary-hover);
}

.profile-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 240px;
  background: var(--color-surface-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-modal);
  padding: 6px 0;
  z-index: 50;
}
.profile-menu[hidden] { display: none; }

.profile-menu-header {
  padding: 10px 14px 8px;
}
.profile-menu-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.profile-menu-subtitle {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.profile-menu-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

.profile-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 14px;
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.profile-menu-item:hover { background: var(--color-surface-2); }

.profile-menu-item-toggle { justify-content: space-between; gap: 12px; }
.profile-menu-toggle-state {
  font-size: 11px;
  color: var(--color-text-muted);
  text-transform: lowercase;
}

.profile-menu-item-danger { color: var(--color-error); }
.profile-menu-item-danger:hover { background: var(--color-surface-2); }
```

Nessuna media query mobile-specifica in C1: il dropdown resta right-aligned anche ≤768px (verrà ripensato in C2).

## JS (`app.js`)

Nuove funzioni esposte a `window` (per `onclick` inline):

```js
function toggleProfileMenu() {
  const menu = document.getElementById('profileMenu');
  const btn = document.getElementById('profileAvatar');
  if (!menu || !btn) return;
  const isOpen = !menu.hidden;
  if (isOpen) closeProfileMenu();
  else openProfileMenu();
}

function openProfileMenu() {
  const menu = document.getElementById('profileMenu');
  const btn = document.getElementById('profileAvatar');
  if (!menu || !btn) return;
  menu.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  updateProfileMenuTheme();
}

function closeProfileMenu() {
  const menu = document.getElementById('profileMenu');
  const btn = document.getElementById('profileAvatar');
  if (!menu || !btn) return;
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function updateProfileAvatar() {
  const initialsEl = document.getElementById('profileAvatarInitials');
  const nameEl = document.getElementById('profileMenuName');
  const subEl = document.getElementById('profileMenuSubtitle');
  const btn = document.getElementById('profileAvatar');
  if (!initialsEl || !nameEl || !subEl || !btn) return;

  const profile = currentProfile || '';
  const settings = (data && data.settings) || {};
  const ana = settings.anagrafica || {};
  const nome = (ana.nome || '').trim();
  const cognome = (ana.cognome || '').trim();

  let initials, displayName;
  if (nome || cognome) {
    initials = ((nome[0] || '') + (cognome[0] || '')).toUpperCase() || profile.charAt(0).toUpperCase();
    displayName = `${nome} ${cognome}`.trim();
  } else {
    initials = (profile.charAt(0) || '·').toUpperCase();
    displayName = profile || '—';
  }

  initialsEl.textContent = initials;
  nameEl.textContent = displayName;
  subEl.textContent = profile ? `Profilo: ${profile}` : '';
  btn.title = displayName;
}

function updateProfileMenuTheme() {
  const lbl = document.getElementById('profileMenuThemeLabel');
  if (!lbl) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  lbl.textContent = isLight ? 'chiaro' : 'scuro';
}
```

### Wiring globale

In coda a `app.js` (o nello stesso punto in cui altri listener vengono installati):

```js
document.addEventListener('click', (e) => {
  const menu = document.getElementById('profileMenu');
  const btn = document.getElementById('profileAvatar');
  if (!menu || menu.hidden) return;
  if (menu.contains(e.target) || btn.contains(e.target)) return;
  closeProfileMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProfileMenu();
});
```

### Hook agli aggiornamenti

- Chiamare `updateProfileAvatar()` da `init()` (dopo che `data` è caricato).
- Chiamare `updateProfileAvatar()` da `closeProfileFiscalModal()` (l'utente potrebbe aver modificato anagrafica).
- Chiamare `updateProfileMenuTheme()` dentro `toggleTheme()` (così la label si aggiorna anche se il tema viene cambiato fuori dal menu).

### Rimozioni JS

- Rimuovere ogni riferimento residuo a `#profileBadge` / `#profileBadgeName` (cercare in `app.js`). Ad es. funzioni che aggiornavano il testo del pillone vanno sostituite con `updateProfileAvatar()`.

## Accessibility

- `aria-haspopup="menu"`, `aria-expanded` sincronizzato con stato.
- `role="menu"` sul dropdown, `role="menuitem"` sulle voci.
- ESC chiude il menu.
- Focus visibile sull'avatar (default browser ok, già coerente con `:focus-visible` esistente).
- Tab navigation funzionante (le voci sono `<button>`, partecipano al tab order naturalmente quando il menu è aperto).

## Out of scope

- Account switcher (Mattia ↔ Peru ↔ Demo).
- Upload foto come avatar.
- Redesign mobile-specifico (è C2).
- Animazioni di apertura/chiusura.
- Refactor di `openProfileFiscalModal` o della modale profilo (è già stata restilizzata in B).
- Sostituzione del sync indicator o del year-selector.

## Verifica

- Smoke visivo dark + light: avatar visibile a destra, dropdown si apre/chiude correttamente, hover/focus coerenti.
- Funzionale: ogni voce esegue la corrispondente funzione. Tema toggla e label si aggiorna senza chiudere il menu. Click fuori chiude. ESC chiude.
- Anagrafica vuota: avatar mostra iniziale del profilo (M/P/D), header del dropdown mostra "Profilo: <nome>" senza sotto-titolo separato.
- Anagrafica compilata: avatar mostra iniziali nome+cognome, header mostra nome+cognome con sotto-titolo "Profilo: <nome>".

## Rollback

Commit isolato → `git revert <hash>` se necessario.

## Deliverable

- 1 commit (markup + CSS + JS) o, a discrezione del piano, fino a 3 commit (markup, CSS, JS) se utile per la review.
- CLAUDE.md non richiede aggiornamenti (l'header non è documentato lì).
