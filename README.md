<p align="center">
  <img src="src/renderer/src/assets/logo.png" width="220" alt="Tornei e partite interne tennistavolo">
</p>

<h1 align="center">Tornei e partite interne tennistavolo</h1>

<p align="center">
  Classifica Elo interna del gruppo <strong>AMATORI</strong> di un circolo di tennistavolo (tennistavolo).<br>
  App desktop per Windows · Electron + React + TypeScript
</p>

<p align="center">
  <img src="docs/screenshots/classifica.png" width="820" alt="Schermata classifica">
</p>

---

## Cos'è

Durante la stagione i componenti del gruppo si sfidano a fine allenamento in partite ufficiali al meglio dei
5 set, senza un calendario fisso: chi c'è sfida chi c'è. L'app registra i risultati, calcola i punti con il
sistema **Elo** e applica automaticamente il regolamento della stagione, così che il responsabile debba solo
inserire le partite e pubblicare la classifica ogni due settimane nel gruppo WhatsApp.

## Funzionalità

- **Inserimento rapido delle partite**: due clic per i giocatori, uno per il risultato (3-0, 3-1, 3-2…).
  Prima di salvare mostra quanti punti guadagna e perde ciascuno e avvisa se la partita non conterà.
- **Classifica** con punti, variazione e ▲▼ di posizione rispetto all'ultima pubblicazione, vittorie,
  sconfitte, set, forma recente e stato di qualificazione.
- **Scontri diretti**: tabella di chi ha giocato con chi, con evidenziate le coppie che non hanno ancora
  raggiunto il minimo richiesto o che hanno già esaurito le partite valide.
- **Scheda giocatore** con grafico dell'andamento dei punti e bilancio contro ogni avversario.
- **Pubblicazione**: immagine o testo pronti da incollare su WhatsApp, oppure PNG, PDF, Excel e CSV.
- **Partite escluse, mai cancellate**: restano visibili barrate con il motivo e si possono includere o
  escludere a mano.
- **Tema scuro** (predefinito) e **tema chiaro**, oppure automatico come Windows. Grafica “da tabellone”: blu e rosso del
  logo, numeri in Barlow Condensed, testi in IBM Plex Sans e Plex Mono (font inclusi nell'app, funzionano anche offline).
- **Backup automatici**, ripristino con un clic, **Ctrl+Z / Ctrl+Y** (o i pulsanti in alto a destra) per annullare e ripetere.
- **Esporta e importa i dati** (file `.amat`) per spostarli su un altro PC o, in futuro, su Android.

| Nuova partita | Scontri diretti |
| --- | --- |
| ![Nuova partita](docs/screenshots/nuova-anteprima.png) | ![Scontri diretti](docs/screenshots/matrice.png) |

| Scheda giocatore | Pubblicazione |
| --- | --- |
| ![Scheda giocatore](docs/screenshots/giocatore.png) | ![Pubblicazione](docs/screenshots/pubblica.png) |

Tema chiaro:

<p align="center"><img src="docs/screenshots/classifica-chiaro.png" width="720" alt="Classifica con tema chiaro"></p>

Esempio di immagine esportata per il gruppo. Gli export (immagine, PDF, testo WhatsApp, Excel) usano il nome pubblico **Tornei e partite interne tennistavolo** e sono sempre chiari, qualunque sia il tema:

<p align="center"><img src="docs/screenshots/export-classifica.png" width="560" alt="Classifica esportata"></p>

## Regolamento applicato (stagione 2026-2027)

| Regola | Come la applica l'app |
| --- | --- |
| Tutti partono da **1200 punti**, anche chi entra a stagione in corso | Ogni giocatore parte da 1200 alla sua data di ingresso |
| Sistema **Elo con K = 32** | Probabilità attesa `E = 1 / (1 + 10^((Rb − Ra) / 400))`, variazione `32 × (risultato − E)`. Chi batte un avversario più forte guadagna di più |
| Al massimo **8 partite** con lo stesso avversario | Dalla 9ª in poi la partita viene registrata ma non conta (“oltre limite”) |
| Per la classifica ufficiale servono almeno **2 partite con ciascun avversario** | Chi non raggiunge la soglia resta visibile in rosso come “fuori classifica”, con l'elenco delle partite che mancano |
| **Abbandoni**: di chi sparisce contano solo le partite fino al minimo comune | Segnando un giocatore come ritirato, con ogni avversario affrontato restano valide solo le prime N partite (N = il numero minimo giocato con un avversario); le altre vengono escluse e i punti di tutti ricalcolati |
| Casi particolari | Ogni partita può essere forzata a mano come inclusa o esclusa, con un motivo |
| Pubblicazione **ogni 2 settimane** | Un promemoria segnala quando è ora; “Segna pubblicata” fissa il riferimento per le variazioni successive |

La classifica viene sempre **ricalcolata da zero** ripercorrendo le partite in ordine di data: correggere o
eliminare una partita vecchia, o riattivare un giocatore ritirato, aggiorna tutto in modo coerente.
Tutti i numeri (punti di partenza, K, limite e soglia, giorni tra le pubblicazioni) si cambiano da
**Impostazioni**.

## Installazione

**[⬇ Scarica l'ultima versione](https://github.com/michael-d-22/tennistavolo-amatori/releases/latest)** (pagina delle release).

Dalla release, oppure compilando il progetto (vedi sotto), si ottengono due file:

- `TennistavoloAmatori-Setup-x.y.z.exe`: installer classico con collegamento sul desktop.
- `TennistavoloAmatori-Portable-x.y.z.exe`: si avvia senza installare nulla.

L'eseguibile non è firmato digitalmente: al primo avvio Windows potrebbe mostrare l'avviso
“PC protetto da Windows”. Cliccare **Ulteriori informazioni → Esegui comunque**.

## Dove sono i dati

| Cosa | Percorso |
| --- | --- |
| Dati | `%APPDATA%\Amatori\data.json` |
| Backup automatici (ultime 30 copie) | `%APPDATA%\Amatori\backup\` |

Il file dati è un unico JSON leggibile. Per usare un'altra cartella (es. su chiavetta) impostare la variabile
d'ambiente `AMATORI_DATA_DIR`.

**Sincronizzazione**: “Esporta tutti i dati” crea un file `.amat`; “Importa” lo **unisce** ai dati presenti.
Per ogni giocatore, partita o pubblicazione vince la versione modificata più di recente, le eliminazioni si
propagano e niente viene duplicato.

## Sviluppo

Requisiti: Node.js 22 o superiore.

```bash
npm install
npm run dev          # avvia l'app in modalità sviluppo
npm test             # test del motore di calcolo (Vitest)
npm run typecheck    # controllo dei tipi TypeScript
npm run screenshots  # avvia l'app con dati di prova e salva screenshot ed export in ./snaps
npm run icon         # rigenera icona e logo da build/logo-source.webp
npm run build:win    # crea installer e versione portable in ./dist
```

### Struttura

```
src/
  core/        logica pura in TypeScript, senza dipendenze
    types.ts       modello dati
    elo.ts         formula Elo
    rules.ts       limite per coppia, regola abbandoni, esclusioni manuali
    standings.ts   ricalcolo cronologico, statistiche, qualificazione
    mutations.ts   operazioni sui dati
    format.ts      testo WhatsApp e CSV
    sync.ts        formato .amat e unione dei dati
  main/        processo Electron: file, backup, dialoghi, PDF, Excel
  preload/     API esposta all'interfaccia
  renderer/    interfaccia React (pagine, componenti, export PNG/PDF)
tests/         test del motore di calcolo
scripts/       screenshot automatici e generazione icona
```

## Verso Android

L'app è predisposta per una futura versione Android:

- tutta la logica di calcolo è in `src/core`, riusabile così com'è;
- l'interfaccia è una normale app web React, impacchettabile con **Capacitor** sostituendo `window.api`
  (oggi fornita da Electron) con un'implementazione basata sul filesystem del telefono;
- lo scambio dati fra desktop e telefono avviene con il file `.amat`, senza bisogno di server.
