# Amatori – classifica Elo interna

App desktop per Windows che gestisce la classifica interna del gruppo AMATORI (tennistavolo):
partite al meglio dei 5 set, sistema Elo K 32 con partenza a 1200 punti.

## Regolamento applicato

| Regola | Come la applica l'app |
| --- | --- |
| Partenza 1200, anche per chi entra a stagione in corso | Ogni giocatore parte da `startRating` alla data di ingresso |
| Elo K 32 | `E = 1 / (1 + 10^((Rb − Ra)/400))`, variazione `32 · (risultato − E)` |
| Massimo 8 partite con lo stesso avversario | Dalla 9ª in poi la partita è registrata ma **non conta** (segnata “oltre limite”) |
| Soglia: almeno 2 partite con ciascun avversario | Chi non la raggiunge resta visibile in rosso come “fuori classifica” |
| Regola abbandoni | Quando un giocatore viene segnato “ritirato”, con ogni avversario affrontato contano solo le prime N partite (N = minimo comune); le altre vengono escluse, **non cancellate** |
| Decisioni manuali | Ogni partita si può forzare “includi” o “escludi” con un motivo |
| Pubblicazione ogni 2 settimane | La pagina Pubblica esporta la classifica e la “congela” per calcolare frecce e variazioni |

La classifica viene sempre ricalcolata da zero ripercorrendo le partite in ordine di data, quindi
correggere o eliminare una partita vecchia aggiorna tutto in modo coerente.
Tutti i parametri si possono cambiare da **Impostazioni**.

## Uso

- **Nuova partita**: clic sui due giocatori, clic sul risultato (3-0, 3-1, 3-2…), Salva. Prima di salvare mostra
  quanti punti si guadagnano/perdono e avvisa se la partita non conterà.
- **Scontri diretti**: tabella di chi ha giocato con chi; le caselle rosse sono le coppie che non hanno ancora
  raggiunto la soglia minima.
- **Pubblica**: copia l'immagine o il testo per WhatsApp, oppure salva PNG, PDF, Excel, CSV. Poi “Segna pubblicata”.
- **Ctrl+Z** annulla l'ultima modifica, **Ctrl+1…7** cambia pagina.

## Dati e backup

- I dati stanno in `%APPDATA%\Amatori\data.json` (un unico file JSON).
- Backup automatici in `%APPDATA%\Amatori\backup` (ultime 30 copie), ripristinabili da Impostazioni.
- **Esporta tutti i dati** produce un file `.amat`; **Importa** lo unisce ai dati presenti (per ogni elemento vince
  la modifica più recente, le eliminazioni si propagano). È il meccanismo pensato per sincronizzare con una futura
  app Android.
- La variabile d'ambiente `AMATORI_DATA_DIR` permette di usare un'altra cartella dati.

## Sviluppo

```bash
npm install
npm run dev          # avvia l'app in sviluppo
npm test             # test del motore di calcolo
npm run typecheck
npm run screenshots  # avvia l'app con dati finti e salva screenshot + export in ./snaps
npm run build:win    # crea dist/Amatori-Setup-x.y.z.exe e dist/Amatori-Portable-x.y.z.exe
```

Struttura:

- `src/core/` – modello dati, Elo, regole, classifica, export testuali, sync. TypeScript puro senza
  dipendenze: è la parte da riusare per la versione Android (es. con Capacitor).
- `src/main/` – processo Electron: salvataggio file, backup, dialoghi, PDF, Excel.
- `src/preload/` – API esposta all'interfaccia.
- `src/renderer/` – interfaccia React.
- `tests/` – test Vitest.

## Verso Android

L'interfaccia è una normale app web React e la logica è in `src/core`, quindi la strada più breve è
impacchettare lo stesso renderer con Capacitor, sostituendo `window.api` (oggi implementata da Electron)
con un'implementazione basata sul filesystem di Capacitor. Lo scambio dati avviene con il file `.amat`.
