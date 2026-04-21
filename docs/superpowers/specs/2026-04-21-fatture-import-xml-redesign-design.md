# Fatture Import XML — Redesign

**Branch:** `fatture-import-redesign`
**Data:** 2026-04-21
**Contesto:** il primo giro di import XML FatturaPA (committato su `codex/dev-newfeatures2` / merged in main) settava solo `stato='inviata'` senza `pagMese/pagAnno`. Risultato: le fatture finivano in archivio ma non comparivano in dashboard, tasse accantonate, budget, scadenziario, perché i selettori mensili filtrano su `pagAnno`/`pagMese`. Questo redesign separa due flussi distinti e introduce auto-match/auto-create dei clienti.

## Goal

Due entry point per l'import XML FatturaPA, semanticamente distinti:

1. **Legacy (archivio)** — onboarding retroattivo di fatture già emesse e pagate. Preview bulk editabile, stato finale `pagata`, `pagMese/pagAnno` obbligatori.
2. **Nuove (tab Fatture)** — workflow quotidiano per fatture appena emesse da sistema esterno (Fiscozen). Import rapido, stato `inviata`, nessun `pagMese`.

Entrambi condividono parser, dedup e auto-create clienti.

## Requisiti utente

1. Legacy: inseribili direttamente nel mese giusto. L'utente inserisce `pagMese` a mano quando manca dall'XML.
2. Legacy imported **visivamente identiche** alle fatture wizard-create. Nessun badge differenziante nelle righe archivio.
3. Bottone "Importa da XML" nella pagina principale tab Fatture per fatture nuove da incorporare nel ciclo.
4. Auto-create clienti assenti dall'anagrafica.

## Architettura

```
fatture-import-xml.js           Parser puro + match cliente + dedup
  exports:
    parseXml(xmlText)           → draft fattura (throw su XML invalido)
    matchCliente(snapshot)      → { mode:'existing'|'new', cliente|draft }
    dedupKey(draft)             → string univoco

fatture-import-legacy.js        (NUOVO) UI archivio: tabella preview editabile
  exports:
    openLegacyImportModal(files)
    importLegacy(rows)          → { imported, skipped, errors, clientiCreati }

fatture-import-nuove.js         (NUOVO) UI pagina principale: import rapido
  exports:
    importNuove(files)          → { imported, skipped, errors, clientiCreati }
```

**Invarianti:**
- `fattureEmesse` resta single source of truth (profile-scoped).
- `FattureSelectors.getByMonth/getByQuarter` invariati — i record importati devono avere i campi corretti per essere visti.
- `normalizeFatturaEmessa` invariato: preserva già `pagMese`, `pagAnno`, `dataPagamento`, `stato`, `origine`.
- Nuove origini whitelist: `'xml-import'` (nuove), `'xml-import-legacy'` (legacy). Questo permette in futuro di filtrare/rimuovere bulk gli import legacy senza impattare i wizard.

## Flusso legacy (archivio)

Entry point: bottone "Importa XML" già presente nel modale archivio fatture.

**Step 1 — File picker multi-select:**
- `<input type="file" accept=".xml" multiple>`
- Legge tutti i file in parallelo con `file.text()`.

**Step 2 — Parse bulk:**
- Per ogni file: `parseXml(text)` → draft.
- Per ogni draft: `matchCliente(clienteSnapshot)` → annotato con `_clienteMatch`.
- Raccolta risultati in array `rows`.

**Step 3 — Modale preview:**

Tabella con colonne:

| # | Numero | Data doc | Cliente | Importo | Tipo | Pagata il | Status |
|---|--------|----------|---------|---------|------|-----------|--------|

- **Cliente**: nome + badge. Verde `✓ esistente` (match hit) o arancio `+ nuovo` (verrà creato).
- **Pagata il**: `<input type="date">` prefilled da `DataScadenzaPagamento` XML. Se assente, vuoto con sfondo giallo.
- **Status**: `ok` | `manca data` | `già presente` | `parse error`.
- Righe `già presente` (dedupKey match) e `parse error` partono con checkbox off e disabilitato.
- Bottone "Conferma import N fatture" disabilitato finché almeno una riga ha `manca data`.

**Step 4 — Conferma:**

Al click:
1. Raccoglie clienti nuovi (deduplicati tra loro per P.IVA/CF/IdCodice).
2. `ClientiStore.save(profile, [...existing, ...nuovi])`.
3. Per ogni riga attiva crea fattura:
   - `stato: 'pagata'`
   - `pagMese`, `pagAnno` derivati dal date input
   - `dataPagamento`: stessa data
   - `origine: 'xml-import-legacy'`
   - `clienteId`: dall'anagrafica (match o appena creato)
   - `clienteSnapshot`: dall'XML (freeze storico della denominazione)
4. `FattureStorico.save(profile, [...existing, ...nuove])`.
5. Sync Firebase (debounced).
6. `recalcAll()`.
7. Re-render archivio con filtro anno = min(anni importati).
8. Toast: "Importate N fatture (clienti creati: M)".

## Flusso nuove (tab Fatture)

Entry point: nuovo bottone `📄 Importa da XML` nel tab Fatture principale, accanto a `Importa da PDF`.

**Step 1 — File picker multi-select** (identico).

**Step 2 — Parse + match + import atomico:**

Senza preview. Per ogni file:
- `parseXml(text)` → draft.
- `matchCliente(snapshot)` → esistente o nuovo draft cliente.
- dedupKey → se match, skip silenzioso.
- Altrimenti aggiungi a batch.

**Step 3 — Save:**
1. Clienti nuovi creati (come legacy).
2. Fatture salvate con:
   - `stato: 'inviata'`
   - `dataInvioSdi`: data documento
   - `pagMese`, `pagAnno`: `null`
   - `origine: 'xml-import'`
3. Sync + recalcAll + re-render archivio.
4. Toast: "Importate N fatture (clienti creati: M, skip duplicate: K)".

Le fatture importate come nuove compaiono in archivio immediatamente, ma **non** nelle tabelle mensili finché l'utente non clicca "Segna pagata" dall'archivio (comportamento identico alle wizard-create).

## Match clienti

`matchCliente(snapshot)` implementa questo albero decisionale:

```
normalize(p) = String(p || '').trim().toUpperCase()

existing = ClientiStore.load(profile)

1. p = normalize(snapshot.partitaIva)
   if p && p.length > 0:
     hit = existing.find(c => normalize(c.partitaIva) === p)
     if hit: return { mode:'existing', cliente: hit }

2. cf = normalize(snapshot.codiceFiscale)
   if cf && cf.length > 0:
     hit = existing.find(c => normalize(c.codiceFiscale) === cf)
     if hit: return { mode:'existing', cliente: hit }

3. // esteri: idPaese+idCodice (dall'XML IdFiscaleIVA)
   if snapshot.idPaese && snapshot.idCodice:
     key = snapshot.idPaese + snapshot.idCodice
     hit = existing.find(c => (c.idPaese + c.idCodice) === key)
     if hit: return { mode:'existing', cliente: hit }

4. // miss: costruisci draft cliente da snapshot
   return {
     mode: 'new',
     draft: {
       id: 'cli_' + Date.now() + '_' + random,
       nome: snapshot.denominazione || (snapshot.nome + ' ' + snapshot.cognome).trim(),
       partitaIva: snapshot.partitaIva || '',
       codiceFiscale: snapshot.codiceFiscale || '',
       idPaese: snapshot.idPaese || '',
       idCodice: snapshot.idCodice || '',
       indirizzo: snapshot.indirizzo || '',
       cap: snapshot.cap || '',
       citta: snapshot.citta || '',
       provincia: snapshot.provincia || '',
       nazione: snapshot.nazione || 'IT',
       pec: '',
       codiceSDI: ''
     }
   }
```

**Note:**
- Match su P.IVA vince anche se denominazione diverge (P.IVA è autorità).
- Clienti esistenti **non vengono mai mutati** dall'import. Nuovi campi vuoti non sovrascrivono dati rubrica.
- `clienteSnapshot` sulla fattura usa SEMPRE i dati XML (freeze storico).
- Dedup interno al batch: se N fatture riferiscono lo stesso cliente nuovo, viene creato una sola volta.

## Dedup fatture

`dedupKey(f) = tipoDoc + '|' + annoProgressivo + '|' + progressivo + '|' + numero`

**Legacy:**
- Preview mostra righe duplicate con status `già presente`, checkbox off + disabilitata.
- Utente può forzare re-import selezionando manualmente → sovrascrive **solo se** record esistente ha `origine === 'xml-import-legacy'`. Altrimenti tooltip "fattura creata da wizard, non sovrascrivibile" e skip.

**Nuove:**
- Silent skip. Mai sovrascrive nulla.
- Count nel toast.

Asimmetria giustificata: legacy è onboarding in cui il re-import serve a correggere `pagMese`; nuove è quotidiano, la sovrascrittura accidentale è più costosa.

## Error handling

| Condizione | Comportamento |
|------------|---------------|
| XML non parseable (syntax error) | Legacy: riga preview rossa, checkbox off. Nuove: errore in toast, resto procede. |
| Manca `DatiGeneraliDocumento` | Stesso trattamento di syntax error. |
| Manca `Numero` o `Data` | Preview: riga warning, checkbox off di default, utente può abilitarla con tooltip "dati minimi assenti". Nuove: skip con errore. |
| Cliente P.IVA hit + denominazione diversa | Match sì. Snapshot fattura = XML. Rubrica non modificata. |
| Mix XML validi + invalidi | Validi procedono, invalidi riportati in toast/dettaglio. |
| File non XML caricato per errore | parser `parseXml` throw → riga `parse error`. |
| Upload 0 file (dialog chiuso) | Nessuna azione. |

## Testing

### Unit

File: `test/fatture-import-xml.test.js` (estendo esistenti).

Nuovi casi:
- `matchCliente` — hit by P.IVA
- `matchCliente` — hit by CF
- `matchCliente` — hit by idPaese+idCodice
- `matchCliente` — miss → draft
- `matchCliente` — P.IVA vince su denominazione
- `matchCliente` — dedup intra-batch (2 fatture stesso cliente nuovo → 1 create)
- `parseXml` — nuovo: estrae `idPaese`/`idCodice` quando non-IT
- `importLegacy` (nuovo file `test/fatture-import-legacy.test.js`):
  - pagMese/pagAnno applicati
  - stato='pagata'
  - origine='xml-import-legacy'
  - override dedupKey su origine matching
- `importNuove` (nuovo file `test/fatture-import-nuove.test.js`):
  - stato='inviata'
  - pagMese/pagAnno null
  - origine='xml-import'
  - silent skip duplicati

### Smoke manuale

- Cartella utente `C:\Users\rossima\Downloads\xml` (27 file mix 2024/2025/2026).
- App su `http://localhost:3333`.
- Test scenarios:
  1. Legacy: import 27 file → preview mostra tutti + match clienti + edit pagMese → conferma → appaiono in archivio (tutti anni) + tabelle mensili popolate.
  2. Nuove: prendi un XML a campione → import → appare in archivio come `inviata` → "Segna pagata" popola mensile.
  3. Re-import stessi file → preview legacy marca tutti come `già presente`.
  4. Cliente nuovo → appare in rubrica clienti.
  5. XML corrotto + XML validi insieme → errore localizzato, validi procedono.

## Migrazione dati esistenti

Le 27 fatture già importate su `codex/dev-newfeatures2` (stato `inviata`, no pagMese) **non vengono migrate automaticamente dal deploy**.

Opzioni utente al primo uso post-deploy:
1. **Via UI:** hard-delete dev toggle → cancella le 27 → ri-import legacy con pagMese corretto.
2. **Via snippet console:** script one-shot preparato nel commit finale, promuove `origine='xml-import'` senza `pagMese` a `stato='pagata'` usando `scadenzaPagamento||data` come pagMese fallback. Non in produzione come migrazione automatica perché euristico.

## Fuori scope

- Validazione asincrona dell'XML tramite openapi (già esistente, non toccata).
- OCR PDF (stub esistente, non toccato).
- UI per gestire conflitti di denominazione rubrica (P.IVA match, nome diverso) — intenzionale: rubrica autoritativa, snapshot fattura storico.
- Modifica bulk post-import dall'archivio (si usa il wizard per fattura singola).

## Checklist completamento

- [ ] `fatture-import-xml.js` estratto a parser puro + `matchCliente` + `dedupKey`
- [ ] `fatture-import-legacy.js` creato (UI preview + flow)
- [ ] `fatture-import-nuove.js` creato (UI import rapido)
- [ ] Bottone "Importa XML" nel tab Fatture (pagina principale)
- [ ] Bottone "Importa XML" archivio collegato al flow legacy
- [ ] Whitelist `origine` estesa a `xml-import-legacy`
- [ ] 10+ unit test nuovi verdi
- [ ] Smoke manuale con 27 file utente OK
- [ ] Snippet console migrazione allegato al commit finale
- [ ] CLAUDE.md aggiornato (sezione "Fatture: single source of truth" + entry point import)
