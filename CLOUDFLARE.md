# Cloudflare Deploy

Questa app viene pubblicata come sito statico su Cloudflare Workers Static Assets.

## File pubblicati

Lo script di build copia in `.cloudflare-dist/` solo i file runtime del sito:

- `index.html`
- `style.css`
- `app.js`
- `firebase-sync.js`
- `tax-engine.js`

Eventuali cartelle statiche comuni (`assets`, `img`, `images`, `fonts`) vengono copiate solo se esistono.

## Comandi

Installa le dipendenze:

```bash
npm install
```

Prepara i file per Cloudflare:

```bash
npm run cf:build
```

Avvia l'anteprima Cloudflare in locale:

```bash
npm run cf:dev
```

Effettua il deploy:

```bash
npm run cf:deploy
```

## Prima pubblicazione

1. Esegui `npx wrangler login`
2. Se vuoi cambiare il nome pubblico del servizio, modifica `name` in `wrangler.toml`
3. Lancia `npm run cf:deploy`
4. Cloudflare ti pubblichera il sito su un URL `*.workers.dev`

## Dominio personalizzato

Il dominio personalizzato si collega dal dashboard Cloudflare dopo il primo deploy:

1. Apri Workers & Pages
2. Seleziona il servizio deployato
3. Vai in `Domains & Routes`
4. Aggiungi il dominio o sottodominio desiderato

## Nota sul progetto

L'app resta completamente client-side. `firebase-sync.js` continua a parlare direttamente con Firebase dal browser, quindi non serve un backend Cloudflare dedicato.
