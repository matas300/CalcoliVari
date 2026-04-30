# Backup profilo Mattia

I file `.json` qui dentro sono `gitignore`-d (non finiscono in repo). Solo i `.js`/`.md` di questa cartella sono committati.

## Backup completo (PRIMA del wipe)

1. Apri l'app loggato come **Mattia**.
2. Apri DevTools (F12) → tab Console.
3. Incolla il contenuto di `extract-mattia.js` e premi Invio.
4. Si scaricheranno automaticamente:
   - `mattia-full-backup-YYYYMMDD-HHMMSS.json` — TUTTO (anni, fatture, clienti, profilo fiscale, accantonamento, ecc.)
   - `mattia-tasse-accantonate-YYYYMMDD-HHMMSS.json` — SOLO il dizionario `accantonamento` per ogni anno (quello che vuoi tenere per ripopolare)
5. Sposta entrambi i file in questa cartella `backup/`.

## Wipe (dopo il backup)

Dalla schermata di login c'è il pulsante "Wipe profilo". Oppure manualmente da console:

```js
Object.keys(localStorage).filter(k => k.startsWith('calcoliPIVA_Mattia_')).forEach(k => localStorage.removeItem(k));
location.reload();
```

## Restore SOLO tasse accantonate (dopo il wipe + ricreata config base)

1. Apri l'app loggato come Mattia con configurazione fresca.
2. Apri DevTools → Console.
3. Incolla il contenuto di `restore-tasse-accantonate.js` e premi Invio.
4. Lo script ti chiederà di selezionare il file `mattia-tasse-accantonate-*.json` salvato prima.
5. Per ogni anno presente nel backup, ripopola il campo `accantonamento` SENZA toccare il resto.
6. Reload pagina alla fine.

## Restore COMPLETO (in caso vuoi annullare il wipe e tornare allo stato precedente)

Stesso meccanismo, ma usa `restore-full.js` con `mattia-full-backup-*.json`.

## Sicurezza

Niente di tutto questo coinvolge Firebase. Il restore SOVRASCRIVE solo le chiavi `calcoliPIVA_Mattia_*` in localStorage. Per syncare su cloud, dopo il restore fai login (la sync push avverrà automaticamente).
