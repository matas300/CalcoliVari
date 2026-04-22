# MattiaTest Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clean "MattiaTest" profile alongside existing Mattia/Peru/Demo so XML-import smoke testing runs against empty, isolated data without touching the real Mattia profile.

**Architecture:** Two minimal edits to `app.js` — one entry in `PROFILE_HASHES` (password auth) and one entry in `PROFILE_FISCAL_LIBRARY` (fiscal defaults). No Firebase schema change: sync automatically creates `profiles/MattiaTest/*` on first save. Seed data (`seedMattiaData`) and Fiscozen remote-call are already gated on `profile === 'Mattia'`, so the new profile starts empty by design.

**Tech Stack:** Vanilla ES5 in `app.js`, SHA-256 via browser WebCrypto for login, localStorage + Firebase sync.

---

### Task 1: Add PROFILE_HASHES entry

**Files:**
- Modify: `app.js:2-6`

- [ ] **Step 1: Add the hash → name mapping**

Password is `test`. SHA-256 hex: `9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08`.

Replace:
```js
const PROFILE_HASHES = {
  'd9b5e452afd6cdea8583147634c3f85a0ba60fc17ad5e6f069a99d3b4ec35194': 'Mattia',
  'cfaa4bd87a413b57e7e3b4a0d5b220aa500aa5d4f60faf938a8dad50e3def77d': 'Peru',
  '83ebba2cb71eb1417fd5ccaa12155a3be83cb97bc6fd7ef28500d100d84f8019': 'Demo'
};
```

With:
```js
const PROFILE_HASHES = {
  'd9b5e452afd6cdea8583147634c3f85a0ba60fc17ad5e6f069a99d3b4ec35194': 'Mattia',
  'cfaa4bd87a413b57e7e3b4a0d5b220aa500aa5d4f60faf938a8dad50e3def77d': 'Peru',
  '83ebba2cb71eb1417fd5ccaa12155a3be83cb97bc6fd7ef28500d100d84f8019': 'Demo',
  '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08': 'MattiaTest'
};
```

---

### Task 2: Add PROFILE_FISCAL_LIBRARY entry

**Files:**
- Modify: `app.js:7-90` (append inside the `PROFILE_FISCAL_LIBRARY` object, after the `Demo` block, before the closing `};`)

- [ ] **Step 1: Append MattiaTest fiscal defaults**

Copy Mattia's fiscal shape but clear personal data so the profile starts truly empty:

```js
  MattiaTest: {
    nome: 'Mattia Test',
    codiceFiscale: '',
    partitaIva: '',
    indirizzo: '',
    cap: '',
    citta: '',
    provincia: '',
    nazione: 'IT',
    ateco: '62.10.00',
    atecoDescrizione: 'Attivita di programmazione informatica',
    iban: '',
    modalitaPagamento: 'Bonifico bancario',
    coefficiente: 67,
    impostaSostitutiva: 15,
    inpsMode: 'artigiani_commercianti',
    inpsCategoria: 'artigiano',
    inpsTipoGestSep: 'esclusivo',
    usaInpsUfficiale: 1,
    riduzione35: 0,
    limiteForfettario: 85000,
    inailTasso: 0,
    agevolazioneStartUp: 0,
    primoAnnoAgevolato: 0,
    note: 'Profilo di test — usato per smoke test XML import e feature in sviluppo.'
  }
```

Place it as the last entry in `PROFILE_FISCAL_LIBRARY` (add a trailing comma to the previous entry).

---

### Task 3: Verify seeding and Fiscozen gates are respected

**Files:**
- Read-only: `app.js:265`, `app.js:2684`

- [ ] **Step 1: Confirm seed gate**

Check `app.js` around line 265 for `if (profile === 'Mattia') seedMattiaData();`. The literal string match guarantees MattiaTest will NOT trigger Mattia's historical seed. No code change needed — document the confirmation.

- [ ] **Step 2: Confirm Fiscozen gate**

Check `app.js` around line 2684 for `if (profile !== 'Mattia' || typeof fetch !== 'function')`. MattiaTest skips the Fiscozen remote call by design. No code change needed.

---

### Task 4: Smoke test

- [ ] **Step 1: Serve the app**

Verify the dev server is running at `http://localhost:3333/`. If not, start it from the project root.

- [ ] **Step 2: Login with the new profile**

Open `http://localhost:3333/`, enter password `test`. Expected: shell loads, profile displayed as "MattiaTest", all tabs empty (no invoices, no calendar entries, no payments).

Run in DevTools console:
```js
Object.keys(localStorage).filter(k => k.startsWith('calcoliPIVA_MattiaTest_'))
```
Expected: initially empty array (or a few meta keys after first autosave).

- [ ] **Step 3: Import an XML file**

Tab Fatture → `📄 Importa da XML` → select a test XML. Verify:
- Fattura appears in storico with correct `stato='inviata'`, `origine='xml-import'`
- Importo ≠ 0 and ≠ `-0,00 €`
- `FattureSelectors.all('MattiaTest').length === 1`

- [ ] **Step 4: Confirm isolation**

Logout, login as Mattia (original password). Verify Mattia's data is untouched (fatture count unchanged from pre-test).

---

### Task 5: Commit

- [ ] **Step 1: Stage only the profile additions**

The XML-import fixes from earlier (in `fatture-docs-feature.js`, `fatture-selectors.js`, `fatture-import-xml.js`, `fatture-import-legacy.js`, `app.js` fmt/getCurrentYear) should be committed separately. For this task, stage only the two hunks touching `PROFILE_HASHES` and `PROFILE_FISCAL_LIBRARY`.

```bash
git add -p app.js
```

Accept only the hunks at lines 2-6 and the new MattiaTest fiscal library block.

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(profile): add MattiaTest for clean smoke-test isolation

New profile with empty fiscal library and password "test". Seed data and
Fiscozen calls are already gated on profile === 'Mattia', so MattiaTest
starts empty and stays isolated from the real Mattia profile.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify**

```bash
git status
git log -1 --stat
```

Expected: clean working tree for `app.js` staged portion, one new commit touching `app.js` only.
