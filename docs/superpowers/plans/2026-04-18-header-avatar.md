# Header Avatar Implementation Plan (C1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the left-side "Profilo fiscale" pillone with a compact circular avatar in the header right that opens a dropdown menu containing Profilo fiscale / Impostazioni / Tema toggle / Logout.

**Architecture:** Two-task split — Task 1 adds CSS (additive, safe to land alone). Task 2 atomically swaps markup + JS (old `#profileBadge` removed, new `#profileAvatar`+`#profileMenu` added, all 8 callsites of `updateProfileBadge()` retargeted to `updateProfileAvatar()`, new menu functions wired with click-outside and ESC handlers).

**Tech Stack:** Vanilla HTML + CSS + JS (no build, no framework). Uses existing palette/token system from sub-progetto B.

**Spec:** `docs/superpowers/specs/2026-04-18-header-avatar-design.md`

**Branch:** `codex/dev-newfeatures` (commits added on top of restyling B).

---

## File Structure

| File | Responsibility |
|---|---|
| `style.css` | New `.profile-avatar*` and `.profile-menu*` rules |
| `index.html` | Remove `#profileBadge`, `#themeToggle`, `.logout-btn`, `#settingsBtn`; add avatar + dropdown markup |
| `app.js` | Replace `updateProfileBadge()` with `updateProfileAvatar()`; add `toggleProfileMenu`/`openProfileMenu`/`closeProfileMenu`/`updateProfileMenuTheme`; rename all 8 callsites; install `document.click` and `keydown Escape` listeners; call `updateProfileMenuTheme()` from `toggleTheme` and `updateProfileAvatar()` from `closeProfileFiscalModal` |

No new files. No test infrastructure (the project verifies UI changes by manual smoke; engine tests in `test/` are not affected).

---

### Task 1: CSS — avatar + dropdown styles

**Files:**
- Modify: `style.css` (append at end of file, in the same place where component rules live)

- [ ] **Step 1: Append the new CSS rules**

Open `style.css` and append the following block at the end of the file (after the last existing rule):

```css
/* === C1 — Header avatar + dropdown menu === */
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
.profile-avatar:disabled {
  opacity: .5;
  cursor: not-allowed;
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

- [ ] **Step 2: Verify the file parses (no syntax errors)**

Run: `node -e "require('fs').readFileSync('style.css','utf8').length" `
Expected: prints a number (file readable). The CSS will be visually validated when Task 2 lands the markup; before that the rules have nothing to attach to and are harmless.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "$(cat <<'EOF'
feat(header)(C1): CSS for avatar + dropdown menu

Aggiunge regole .profile-avatar* e .profile-menu* (additive, nessun selettore
esistente toccato). Markup e JS arrivano in Task 2.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Markup + JS swap (atomic)

**Files:**
- Modify: `index.html` (replace pillone in `.header-brand`; remove 3 buttons in `.header-right`; append avatar+menu markup at end of `.header-right`)
- Modify: `app.js` (replace `updateProfileBadge` body with `updateProfileAvatar`; add 4 new functions; rename 8 callsites; install 2 document listeners; hook `updateProfileMenuTheme` into `toggleTheme`; hook `updateProfileAvatar` into `closeProfileFiscalModal`)

- [ ] **Step 1: Update `index.html` — remove the pillone**

Read `index.html` lines 31-50 to confirm the current header. Then replace the `<button id="profileBadge" …>…</button>` block (the entire 4-line button currently inside `.header-brand`) with nothing — `.header-brand` should contain only the `<h1>`:

Old:
```html
<div class="header-brand">
    <h1>Calcoli Partita IVA</h1>
    <button id="profileBadge" class="profile-trigger" type="button" onclick="openProfileFiscalModal()" aria-haspopup="dialog" aria-controls="profileFiscalModal" title="Apri il profilo fiscale">
      <span class="profile-trigger-kicker">Profilo fiscale</span>
      <span id="profileBadgeName" class="profile-trigger-name"></span>
    </button>
  </div>
```

New:
```html
<div class="header-brand">
    <h1>Calcoli Partita IVA</h1>
  </div>
```

- [ ] **Step 2: Update `index.html` — remove the 3 right-side buttons**

In `.header-right`, remove these three lines (currently around 41-43):
```html
<button id="themeToggle" class="theme-toggle" onclick="toggleTheme()" title="Cambia tema" aria-label="Cambia tema">&#9790;</button>
<button class="logout-btn" onclick="doLogout()">Logout</button>
<button id="settingsBtn" class="settings-header-btn" onclick="switchToTab('settings')" title="Impostazioni" aria-label="Impostazioni">&#9881;</button>
```

After this step `.header-right` contains: `#syncStatus`, then `.year-selector`.

- [ ] **Step 3: Update `index.html` — append avatar + dropdown after the year-selector**

Inside `.header-right`, AFTER the closing `</div>` of `.year-selector`, add:

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

- [ ] **Step 4: Replace `updateProfileBadge` body in `app.js`**

Locate `function updateProfileBadge()` (currently around line 118). Replace the entire function (lines 118–135) with:

```js
function updateProfileAvatar() {
  const avatarBtn = document.getElementById('profileAvatar');
  const initialsEl = document.getElementById('profileAvatarInitials');
  const nameEl = document.getElementById('profileMenuName');
  const subEl = document.getElementById('profileMenuSubtitle');
  if (!avatarBtn || !initialsEl) return;

  if (!currentProfile) {
    initialsEl.textContent = '·';
    if (nameEl) nameEl.textContent = '';
    if (subEl) subEl.textContent = '';
    avatarBtn.disabled = true;
    avatarBtn.setAttribute('title', 'Accedi per aprire il profilo');
    closeProfileMenu();
    return;
  }

  const profile = profileFiscalState.data || getProfileFiscalDefaults(currentProfile);
  const nome = (profile && profile.nome ? String(profile.nome) : '').trim();
  const cognome = (profile && profile.cognome ? String(profile.cognome) : '').trim();

  let initials, displayName;
  if (nome || cognome) {
    initials = ((nome.charAt(0) || '') + (cognome.charAt(0) || '')).toUpperCase();
    if (!initials) initials = currentProfile.charAt(0).toUpperCase();
    displayName = `${nome} ${cognome}`.trim();
  } else {
    initials = currentProfile.charAt(0).toUpperCase();
    displayName = currentProfile;
  }

  initialsEl.textContent = initials;
  if (nameEl) nameEl.textContent = displayName;
  if (subEl) subEl.textContent = `Profilo: ${currentProfile}`;
  avatarBtn.disabled = false;
  avatarBtn.setAttribute('title', displayName);
}
```

- [ ] **Step 5: Add the four new functions immediately after `updateProfileAvatar`**

Add these four functions right after `updateProfileAvatar` (still inside `app.js`, before `hashPassword`):

```js
function toggleProfileMenu() {
  const menu = document.getElementById('profileMenu');
  if (!menu) return;
  if (menu.hidden) openProfileMenu();
  else closeProfileMenu();
}

function openProfileMenu() {
  const menu = document.getElementById('profileMenu');
  const btn = document.getElementById('profileAvatar');
  if (!menu || !btn || btn.disabled) return;
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

function updateProfileMenuTheme() {
  const lbl = document.getElementById('profileMenuThemeLabel');
  if (!lbl) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  lbl.textContent = isLight ? 'chiaro' : 'scuro';
}
```

- [ ] **Step 6: Rename all 8 `updateProfileBadge()` callsites to `updateProfileAvatar()`**

The Step 4 replacement removed the OLD function name. Now retarget every caller. Use a search-and-replace; the callsites are at lines 163, 219, 226, 853, 862, 2465, 6632 (per current grep — line numbers may shift after Steps 1–5).

Run a sanity grep first to enumerate exactly:
```bash
grep -n "updateProfileBadge" app.js
```
Expected before fix: 7 matches (all are calls; the function definition is already gone).

Replace each `updateProfileBadge()` call with `updateProfileAvatar()`. Then re-run the grep:
```bash
grep -n "updateProfileBadge" app.js
```
Expected after fix: 0 matches.

- [ ] **Step 7: Hook `updateProfileMenuTheme` into `toggleTheme`**

Locate `function toggleTheme()` (currently around line 180). Add a call to `updateProfileMenuTheme()` at the end of the function body (just before the closing `}`), so the menu's "Tema" label stays in sync if the theme is changed via any other path. The added line:

```js
  if (typeof updateProfileMenuTheme === 'function') updateProfileMenuTheme();
```

- [ ] **Step 8: Hook `updateProfileAvatar` into `closeProfileFiscalModal`**

Locate `function closeProfileFiscalModal()` (currently around line 2443). At the end of its body (just before the closing `}`), ensure it calls `updateProfileAvatar()`. If the existing body already calls `updateProfileBadge()` and Step 6 renamed it, this is already done — verify with:

```bash
grep -n "updateProfileAvatar" app.js
```
Expected: ≥ 8 matches (one definition + ≥ 7 callsites).

- [ ] **Step 9: Install global click-outside and ESC listeners**

Append to the end of `app.js` (after the existing top-level `updateProfileBadge();` call which Step 6 already renamed to `updateProfileAvatar();`):

```js
document.addEventListener('click', (e) => {
  const menu = document.getElementById('profileMenu');
  const btn = document.getElementById('profileAvatar');
  if (!menu || menu.hidden) return;
  if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeProfileMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProfileMenu();
});
```

- [ ] **Step 10: Sanity grep for orphan references**

Run:
```bash
grep -n "profileBadge\|profileBadgeName\|profile-trigger\|profile-trigger-kicker\|profile-trigger-name" app.js index.html
```
Expected: 0 matches (the old IDs/classes must be fully gone from JS and HTML; CSS rules may still exist but are dead and harmless — leave them, will be cleaned in Step 11).

```bash
grep -n "themeToggle\|logout-btn\|settingsBtn" index.html
```
Expected: 0 matches (the three removed buttons should not appear in `index.html`).

- [ ] **Step 11: Remove dead CSS for the old pillone**

In `style.css`, search for and remove the rules targeting the now-orphan classes/IDs:

```bash
grep -n "\.profile-trigger\|#profileBadge\|\.theme-toggle\|\.logout-btn\|\.settings-header-btn" style.css
```

For each matched rule block, delete the entire selector + body. This is dead code (markup is gone). If a rule is shared with something still in use, leave it; else remove. Re-run the grep afterwards — expected: 0 matches.

- [ ] **Step 12: Manual smoke (local browser)**

Open `index.html` in a browser. Login with `Demo` profile.

Verify:
1. Avatar visible at the right end of the header. Shows `D` (single letter, no anagrafica).
2. Click avatar → dropdown opens, header shows "Demo" + "Profilo: Demo".
3. Click "Profilo fiscale" → dropdown closes, profile modal opens.
4. Close modal, fill in nome="Mario", cognome="Rossi", save → avatar now shows `MR`, dropdown header shows "Mario Rossi" + "Profilo: Demo".
5. Click avatar → click "Impostazioni" → switches to Impostazioni tab, dropdown closes.
6. Click avatar → click "Tema" → theme flips, label updates ("chiaro" ↔ "scuro"), dropdown stays open.
7. Click avatar → press ESC → dropdown closes.
8. Click avatar → click outside (e.g., on the body) → dropdown closes.
9. Click avatar → click "Logout" → returns to login screen.
10. Repeat in the OTHER theme (re-login, toggle theme): visual coherence — bordi mint, hover surface-3, font Satoshi 12px iniziali.

If any step fails, fix and re-test.

- [ ] **Step 13: Run the existing test suite (engine smoke)**

Run:
```bash
node test/run-tests.js
```
Expected: PASS — same count as before (this task does not touch tax-engine, dichiarazione-engine, or fatture-storico). Confirms no JS syntax error broke loading.

- [ ] **Step 14: Commit**

```bash
git add index.html app.js style.css
git commit -m "$(cat <<'EOF'
feat(header)(C1): avatar + dropdown menu replaces pillone profilo

Sostituisce il pillone "Profilo fiscale" a sinistra del titolo con un avatar
compatto (32px, iniziali nome+cognome con fallback al profilo) in header
destro. Click apre dropdown con: Profilo fiscale, Impostazioni, Tema (toggle
inline con label stato), Logout. Rimossi da .header-right i bottoni separati
#themeToggle, .logout-btn, #settingsBtn (ora dentro il dropdown).

JS: updateProfileBadge → updateProfileAvatar (rinominati 7 callsites);
nuove funzioni toggleProfileMenu/openProfileMenu/closeProfileMenu/
updateProfileMenuTheme; document click-outside + ESC closer.

Pulito CSS dead code per .profile-trigger*, .theme-toggle, .logout-btn,
.settings-header-btn.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage** — every section of `2026-04-18-header-avatar-design.md` mapped to a step:
- Markup rimozioni → Task 2 Steps 1+2
- Markup aggiunte → Task 2 Step 3
- Stile (CSS) → Task 1 Step 1
- JS nuove funzioni → Task 2 Steps 4+5
- Wiring globale (click-outside + ESC) → Task 2 Step 9
- Hook agli aggiornamenti (toggleTheme, closeProfileFiscalModal, init) → Task 2 Steps 6+7+8
- Rimozioni JS (orphan references) → Task 2 Step 10
- Accessibility (aria-haspopup, aria-expanded, role=menu/menuitem, ESC) → coperto da Task 2 Step 3 markup + Step 9 listener
- Verifica → Task 2 Step 12 (manual smoke 10 punti)
- Out of scope → rispettato (no account switcher, no foto upload, no media query mobile-specifica)

**Placeholder scan** — none. All grep commands have explicit expected outputs; all code blocks complete; the only "if" branches reference functions defined in the same task.

**Type consistency** — `updateProfileAvatar` is the single name used throughout (definition Step 4, retargeting Step 6, init call from Step 6 retargeting line 6632). Menu functions consistently named: `toggleProfileMenu` / `openProfileMenu` / `closeProfileMenu` / `updateProfileMenuTheme`. IDs consistent: `profileAvatar`, `profileAvatarInitials`, `profileMenu`, `profileMenuName`, `profileMenuSubtitle`, `profileMenuThemeLabel`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-header-avatar.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review (spec compliance + code quality) per task.

**2. Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
