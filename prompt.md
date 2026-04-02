# Prompt per nuove feature — Calcoli P.IVA

Copia e incolla questo prompt in una nuova conversazione Claude Code per implementare le feature. Ogni feature viene gestita da un sub-agent dedicato. Il prompt è progettato per essere eseguito in un'unica sessione.

---

## Prompt da copiare

Sto lavorando sull'app "Calcoli P.IVA" (vanilla JS, no framework, no build tools) nella directory corrente. Leggi prima CLAUDE.md per capire l'architettura. I file principali sono: `index.html`, `app.js`, `style.css`, `firebase-sync.js`, `tax-engine.js`.

Ho bisogno di implementare 5 nuove feature. Usa sub-agent in parallelo dove possibile. Per ogni feature:
1. Leggi i file rilevanti PRIMA di scrivere codice
2. Integra nel codebase esistente (stessi pattern, stesse convenzioni CSS, stessa struttura dati)
3. Supporta sia tema dark che light (`html[data-theme="light"]` override)
4. Mobile responsive (card layout sotto 768px, touch targets 38px+, font-size 16px per input)
5. Dati salvati in localStorage con la stessa struttura `calcoliPIVA_{profile}_{year}`
6. Lingua italiana per tutta l'interfaccia

### Feature 1: Gestione Clienti (sub-agent 1)

**Obiettivo:** Aggiungere una sezione per gestire un'anagrafica clienti riutilizzabile nelle fatture.

**Dati da salvare** (chiave localStorage: `calcoliPIVA_{profile}_clienti`):
```json
[
  {
    "id": "uuid",
    "nome": "Ragione sociale o nome",
    "partitaIva": "IT01234567890",
    "codiceFiscale": "RSSMTT96P21A944T",
    "codiceSDI": "0000000",
    "pec": "azienda@pec.it",
    "indirizzo": "Via Roma 1",
    "cap": "40100",
    "citta": "Bologna",
    "provincia": "BO",
    "nazione": "IT",
    "note": ""
  }
]
```

**Implementazione:**
- Nuova tab "Clienti" nel nav (aggiungere in index.html, tra Budget e Spese)
- CRUD completo: aggiungi, modifica, elimina cliente
- UI card-based (come le voci budget): ogni cliente è una card espandibile
- Ricerca/filtro rapido per nome o P.IVA
- I dati clienti vengono poi usati dalla Feature 2 (fattura) come dropdown di selezione
- Includere nel Firebase sync (aggiungere key pattern in firebase-sync.js)
- Funzioni: `getClienti()`, `saveClienti(list)`, `renderClienti()`
- Generare UUID con `crypto.randomUUID()` o fallback `Date.now().toString(36)`

**File da modificare:** `index.html` (tab + container), `app.js` (logica + render), `style.css` (stili card), `firebase-sync.js` (sync)

---

### Feature 2: Creazione Fattura PDF (sub-agent 2)

**Dipende da:** Feature 1 (clienti)

**Obiettivo:** Generare fatture in PDF dal browser, usando i dati del profilo fiscale e dell'anagrafica clienti.

**Dati fattura:**
```json
{
  "numero": "1/2026",
  "data": "2026-03-31",
  "clienteId": "uuid-del-cliente",
  "righe": [
    {
      "descrizione": "Sviluppo software - Marzo 2026",
      "quantita": 1,
      "prezzoUnitario": 5000.00,
      "iva": 0
    }
  ],
  "contributoIntegrativo": 0,
  "marcaDaBollo": 2.00,
  "note": "Operazione senza applicazione dell'IVA ai sensi dell'art.1 commi 54-89 L.190/2014",
  "modalitaPagamento": "Bonifico bancario - IBAN IT...",
  "scadenzaPagamento": "2026-04-30"
}
```

**Implementazione:**
- Nuova sezione dentro la tab "Fatture" (o un modale dedicato accessibile con bottone "Crea fattura")
- Form per compilare la fattura con:
  - Numero fattura (auto-incrementante per anno)
  - Data emissione (default: oggi)
  - Dropdown cliente (dalla Feature 1)
  - Righe fattura (aggiungi/rimuovi dinamicamente)
  - Nota fissa regime forfettario (precompilata)
  - IBAN / modalità pagamento (dalle impostazioni profilo o editabile)
  - Marca da bollo (checkbox, default: si se importo > 77.47€)
- Generare PDF con libreria client-side: usare **jsPDF** (CDN: `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js`)
- Il PDF deve contenere:
  - Intestazione: dati emittente (dal profilo fiscale: nome, P.IVA, CF, indirizzo, ATECO)
  - Dati cliente (dal dropdown)
  - Tabella righe con importi
  - Totale + marca da bollo
  - Dicitura regime forfettario
  - Modalità e scadenza pagamento
- Layout PDF professionale, pulito, font sans-serif
- Bottone "Scarica PDF" e bottone "Anteprima" (apre in nuova tab)
- Salvare storico fatture emesse in localStorage: `calcoliPIVA_{profile}_fattureEmesse`
- **IMPORTANTE:** La fattura emessa deve anche alimentare automaticamente la tab "Fatture" esistente (aggiungere la riga nel mese corretto con importo e descrizione)

**File da modificare:** `index.html` (CDN jsPDF, container modale), `app.js` (form + generazione PDF + render), `style.css` (stili form/modale)

---

### Feature 3: Generazione Fattura Elettronica XML (sub-agent 3)

**Dipende da:** Feature 1 (clienti), Feature 2 (fattura)

**Obiettivo:** Generare il file XML FatturaPA conforme allo standard SDI, scaricabile dall'utente.

**Specifiche FatturaPA:**
- Namespace: `http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2`
- Versione: FPR12 (fattura tra privati)
- Il file XML deve passare la validazione SDI

**Struttura XML obbligatoria:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" versione="FPR12">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>{P.IVA emittente}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>{numero progressivo}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>{SDI cliente o 0000000}</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <!-- Dati emittente dal profilo fiscale -->
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>{P.IVA}</IdCodice></IdFiscaleIVA>
        <CodiceFiscale>{CF}</CodiceFiscale>
        <Anagrafica><Denominazione>{Nome}</Denominazione></Anagrafica>
        <RegimeFiscale>RF19</RegimeFiscale> <!-- RF19 = forfettario -->
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>{indirizzo}</Indirizzo>
        <CAP>{cap}</CAP>
        <Comune>{citta}</Comune>
        <Provincia>{provincia}</Provincia>
        <Nazione>IT</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <!-- Dati cliente -->
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>{data}</Data>
        <Numero>{numero}</Numero>
        <Causale>{descrizione}</Causale>
        <!-- Bollo virtuale se applicabile -->
        <DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>{descrizione riga}</Descrizione>
        <Quantita>{quantita}</Quantita>
        <PrezzoUnitario>{prezzo}</PrezzoUnitario>
        <PrezzoTotale>{totale riga}</PrezzoTotale>
        <AliquotaIVA>0.00</AliquotaIVA>
        <Natura>N2.2</Natura> <!-- N2.2 = non soggetto forfettario -->
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <Natura>N2.2</Natura>
        <ImponibileImporto>{totale}</ImponibileImporto>
        <Imposta>0.00</Imposta>
        <RiferimentoNormativo>Operazione senza applicazione dell'IVA - art.1 co.54-89 L.190/2014 e succ. modifiche</RiferimentoNormativo>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento> <!-- MP05 = bonifico -->
        <DataScadenzaPagamento>{scadenza}</DataScadenzaPagamento>
        <ImportoPagamento>{totale}</ImportoPagamento>
        <IBAN>{iban}</IBAN>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>
```

**Implementazione:**
- Bottone "Scarica XML" accanto a "Scarica PDF" nella fattura
- Il nome file deve seguire la convenzione SDI: `IT{P.IVA}_{progressivo}.xml`
- Il file viene scaricato come download (non serve invio automatico al SDI — quello richiede un intermediario accreditato come Aruba, Fiscozen, etc.)
- Validazione base dei campi obbligatori prima di generare
- Aggiungere nel profilo fiscale i campi mancanti per FatturaPA: indirizzo, CAP, citta, provincia (se non gia presenti)

**Note sull'invio elettronico:**
- L'invio diretto al SDI richiede certificati digitali e accreditamento — NON implementabile lato client
- Opzioni realistiche: (1) generare XML + caricare manualmente su portale Fatture e Corrispettivi, (2) integrare con un intermediario via API
- Per ora: solo generazione XML. Aggiungere una nota nella UI che spiega come caricare il file sul portale AdE

**File da modificare:** `app.js` (generazione XML), `style.css` (bottone), eventualmente `index.html`

---

### Feature 4: OCR Pagamenti (sub-agent 4)

**Obiettivo:** Caricare un'immagine o PDF di un pagamento/ricevuta e estrarre automaticamente i dati.

**Implementazione:**
- Usare **Tesseract.js** per OCR lato client (CDN: `https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js`)
- Bottone "Importa da foto/PDF" nella sezione Pagamenti dello scadenziario
- Flusso:
  1. L'utente carica un file (immagine JPG/PNG o PDF prima pagina)
  2. Tesseract.js estrae il testo
  3. Parsing del testo per identificare: data, importo, tipo (F24, bollettino, etc.)
  4. Pattern matching per riconoscere:
     - Ricevute F24: cercare "CODICE TRIBUTO", importi, "SEZIONE ERARIO/INPS"
     - Bonifici: cercare "IMPORTO", "DATA OPERAZIONE", "BENEFICIARIO"
     - Bollettini postali: cercare "IMPORTO", "CAUSALE"
  5. Pre-compilare il form di aggiunta pagamento con i dati estratti
  6. L'utente conferma/modifica prima di salvare
- Mostrare un'anteprima del testo estratto per debug
- Gestire i casi di testo non leggibile con messaggio di errore chiaro
- Loading spinner durante l'elaborazione (Tesseract puo essere lento, 5-15 secondi)

**Regex patterns suggeriti per F24:**
```javascript
// Importo totale
/(?:TOTALE|SALDO|IMPORTO)\s*(?:EUR|€)?\s*([\d.,]+)/i
// Data
/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/
// Codice tributo
/(?:CODICE\s*TRIBUTO|COD\.?\s*TRIB\.?)\s*(\d{4})/i
// Sezione
/(ERARIO|INPS|REGIONI|IMU)/i
```

**File da modificare:** `index.html` (CDN Tesseract.js), `app.js` (UI + parsing), `style.css` (upload area, spinner)

---

### Feature 5: Dichiarazione dei Redditi — Quadro LM (sub-agent 5, opzionale)

**Obiettivo:** Pre-compilare il Quadro LM della dichiarazione dei redditi per regime forfettario.

**Campi del Quadro LM da compilare:**
```
LM1  - Codice attivita (ATECO)
LM2  - Reddito lordo (fatturato)
LM3  - Rimanenze finali (0 per servizi)
LM4  - Rimanenze iniziali (0 per servizi)
LM5  - Differenza (LM2 + LM3 - LM4)
LM6  - Componenti positivi (= LM5 per noi)
LM22 - Reddito lordo forfettario
LM23 - Coefficiente di redditivita (es. 67%)
LM24 - Reddito (LM22 * LM23 / 100)
LM25 - Perdite pregresse (0 normalmente)
LM26 - Reddito netto (LM24 - LM25)
LM27 - Contributi previdenziali versati (INPS dell'anno)
LM28 - Reddito al netto contributi (LM26 - LM27)  
LM29 - Imposta sostitutiva dovuta (LM28 * aliquota %)
LM30 - Aliquota (5% o 15%)
LM34 - Imposta sostitutiva a debito
LM35 - Acconti versati
LM38 - Imposta a debito (LM34 - LM35)
LM39 - Imposta a credito
LM40 - Primo acconto per anno successivo
LM41 - Secondo acconto per anno successivo
```

**Implementazione:**
- Nuova sezione accessibile dalla tab "Regime Forfettario" (bottone "Genera Quadro LM")
- Pannello che mostra tutti i campi compilati automaticamente dai dati dell'app
- Possibilita di modificare manualmente ogni campo
- Bottone "Esporta" che genera un riepilogo stampabile (PDF o HTML print-friendly)
- Evidenziare in giallo i campi da verificare (stimati vs certi)
- NON genera il file telematico (quello lo fa il software dell'AdE) — genera solo il riepilogo per la compilazione

**Note:**
- Questa feature e utile come guida alla compilazione, non come sostituto del software ministeriale
- Mostrare un disclaimer: "Questo riepilogo e a scopo orientativo. Verifica sempre con il tuo commercialista."
- I dati vengono tutti dal calcolo forfettario gia presente nell'app

**File da modificare:** `app.js` (calcolo campi LM + render), `style.css` (stili riepilogo)

---

## Istruzioni di esecuzione

1. **Lancia Feature 1 (Clienti) per prima** — le feature 2 e 3 ne dipendono
2. **Dopo Feature 1, lancia Feature 2 (PDF) e Feature 4 (OCR) in parallelo** — sono indipendenti
3. **Dopo Feature 2, lancia Feature 3 (XML)** — dipende dalla struttura fattura
4. **Feature 5 (Quadro LM) puo partire in parallelo con tutto** — e indipendente

Ordine consigliato di esecuzione degli agent:
```
Fase 1: [Agent 1: Clienti]
Fase 2: [Agent 2: PDF fattura] + [Agent 4: OCR] + [Agent 5: Quadro LM]  (in parallelo)
Fase 3: [Agent 3: XML FatturaPA]
```

Dopo ogni agent, rivedi il codice generato e verifica che:
- Non ci siano conflitti tra le modifiche dei diversi agent
- Il CSS supporti entrambi i temi (dark/light)
- La versione mobile funzioni
- I dati siano persistiti e sincronizzati correttamente
- Le funzioni non duplichino codice gia esistente (es. `fmt()`, `S()`, `saveSetting()`)

Aggiorna CLAUDE.md con la documentazione delle nuove feature una volta completate.
