# Crypto Signal Tracker

Dashboard per monitorare i 5 segnali crypto, costruire un portfolio e fare backtesting su dati storici reali.

## Funzionalità

- **Scanner** — 5 segnali quantificati per ogni asset (dev activity, whale flow, tokenomics, catalyst, rotazione settoriale) + composite score
- **Portfolio builder** — allocazione basata sul composite score con sizing corretto (regola del 2% sul rischio)
- **Alert** — configurazione soglie con log storico dei segnali attivati
- **Backtest** — simulazione su 90/180/365 giorni di prezzi reali (CoinGecko), con equity curve, drawdown, Sharpe ratio, trade log
- **Confronto multi-asset** — ranking delle performance sugli stessi parametri

## Setup locale

```bash
# Nessuna dipendenza da installare. Apri semplicemente:
open index.html
# oppure usa un server locale per evitare CORS:
npx serve .
# oppure:
python3 -m http.server 8080
```

## Deploy su GitHub Pages

1. Crea un repository GitHub (es. `crypto-signal-tracker`)
2. Carica tutti i file:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TUO_USERNAME/crypto-signal-tracker.git
   git push -u origin main
   ```
3. Su GitHub: **Settings → Pages → Source: main branch → / (root)**
4. La webapp sarà disponibile su `https://TUO_USERNAME.github.io/crypto-signal-tracker`

## Dati e limitazioni

- **API**: CoinGecko free tier, no API key richiesta
- **Rate limit**: ~30 req/min. Con 6+ asset il refresh impiega ~8 secondi per rispettare i limiti
- **Backtest**: prezzi storici reali; i segnali backtest sono proxy price/volume (whale e dev activity non disponibili storicamente senza abbonamento Nansen/Glassnode)
- **Alert**: log salvato in `localStorage` del browser (non push notifications)
- **Dati**: non costituiscono consulenza finanziaria

## Struttura file

```
crypto-signal-tracker/
├── index.html          App principale
├── css/
│   └── style.css       Design system completo (light/dark mode)
├── js/
│   ├── api.js          CoinGecko API con cache e rate limiting
│   ├── signals.js      Motore dei 5 segnali + versione backtesting
│   ├── backtest.js     Engine di simulazione
│   ├── portfolio.js    Builder allocazione + sizing
│   ├── alerts.js       Gestione alert con localStorage
│   └── app.js          Controller principale, rendering, eventi
└── README.md
```

## Aggiungere un asset alla watchlist

Usa l'ID CoinGecko (quello nella URL di coingecko.com). Esempi:
- `bitcoin`, `ethereum`, `solana`, `chainlink`
- `uniswap`, `aave`, `maker`
- `near`, `cosmos`, `cardano`

## Personalizzazione segnali

In **Impostazioni → Pesi segnali** puoi modificare il peso di ciascun segnale nel composite score (default: 20% ognuno).

Per modificare le soglie dei segnali nel codice, vedi `js/signals.js`.
