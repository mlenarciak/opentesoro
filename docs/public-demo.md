# Prova OpenTesoro

La demo pubblica permette di provare la tesoreria senza creare un account. Ogni visitatore riceve una copia separata degli stessi dati inventati. Le schede aperte nello stesso browser condividono quella copia.

## Una prima prova, in cinque minuti

1. Apri **Panoramica**. Controlla liquidità disponibile, incassi e pagamenti previsti.
2. In **Movimenti**, scegli **Nuovo movimento** e registra un importo di esempio, come `123,45`. Usa un nome inventato.
3. In **Piano di tesoreria**, osserva come cambia il saldo previsto. Gli importi sono espressi in euro.
4. In **Importa e integra**, puoi scaricare un'esportazione JSON o CSV dei dati della tua prova.
5. Scegli **Ripristina demo** nel messaggio sopra la pagina per eliminare le modifiche e ricominciare dagli esempi.

Usa **solo dati inventati**: nessun nome di cliente, IBAN reale, password o credenziale bancaria. La demo non collega conti bancari e non esegue pagamenti.

## Quanto durano le modifiche?

La sessione termina dopo **30 minuti di inattività**, oppure dopo **2 ore dall'apertura**. Un riavvio o aggiornamento del servizio può terminarla prima. Chiudere il browser non crea un account e non garantisce il recupero dei dati.

Quando la sessione termina, scegli **Avvia nuova demo** per ripartire. Le modifiche precedenti non sono recuperabili. Se un'altra scheda ripristina la demo, la pagina chiede di ricaricare; non ripete automaticamente le operazioni.

Se il servizio è momentaneamente occupato, attendi e scegli **Riprova connessione**. Un errore di connessione non sostituisce automaticamente i dati con una nuova copia.

## Accessibilità e aspetto

Usa il pulsante del tema per passare da chiaro a scuro. La preferenza resta nel browser. La navigazione funziona da tastiera; il menu su telefono si chiude con **Esc** e restituisce il focus al pulsante di apertura. Il collegamento **Vai al contenuto** permette di saltare la navigazione ripetuta. I segnali di incasso, pagamento e attenzione mantengono i loro colori e le loro etichette.

Le verifiche automatiche includono i criteri WCAG A e AA coperti da axe su viste desktop, mobile e moduli. Non sostituiscono una valutazione completa con tecnologie assistive.

## Limiti della demo

| Limite                               | Valore predefinito                  |
| ------------------------------------ | ----------------------------------- |
| Sessioni attive contemporaneamente   | 32                                  |
| Nuove sessioni, inclusi i ripristini | 12 al minuto, per l'intero servizio |
| Modifiche per sessione               | 200 richieste di modifica           |
| Richieste per sessione               | 120 al minuto                       |
| Importazione CSV                     | 250 righe per richiesta             |
| Intervallo di previsione             | 366 giorni                          |
| Dimensione della richiesta           | 128 KiB                             |
| Spazio SQLite per visitatore         | Circa 2 MiB                         |

Questi limiti mantengono il servizio dimostrativo piccolo e disponibile. Gli errori indicano quando riprovare o ripristinare la demo. Il servizio non promette disponibilità continua.

## Per usarlo nella tua azienda

Installa un workspace privato seguendo la [guida operativa](operations.md#empty-installation). Il launcher privato conserva SQLite su disco e richiede un token quando esposto fuori dal computer locale. Configura HTTPS, accesso e backup prima di inserire dati aziendali.

La demo pubblica non offre account, recupero password, accesso condiviso tra colleghi o ruoli personali. Le società selezionabili nell'app sono perimetri di reportistica; non sono un sistema di autorizzazione tra aziende. La gestione utenti e l'isolamento tra clienti aziendali restano funzionalità da implementare.

## Eseguire una demo pubblica propria

Dopo `bun install --frozen-lockfile` e `bun run build`, per una prova locale:

```sh
PUBLIC_DEMO_ORIGIN=http://127.0.0.1:3000 bun run start:public-demo
```

Il browser deve usare esattamente quell'origine. Per un sito pubblico usa un'origine **HTTPS** completa, senza percorso né slash finale. Il cookie di sessione è Secure e HttpOnly; HTTP è ammesso solo su loopback per lo sviluppo.

Non fornire un database persistente, token API privati o variabili `AGICAP_*` a questo launcher: l'avvio viene rifiutato. L'immagine `Dockerfile.public-demo` include solo l'applicazione e i file statici. Ogni sessione usa SQLite in memoria e i dati spariscono alla chiusura del processo.

Per AWS, la [guida dell'infrastruttura](../infra/README.md) descrive la pubblicazione, il dominio opzionale, i costi e le verifiche. Mantieni **una sola istanza** con il modello di sessione attuale. Per eseguire le prove del browser contro un container o il sito pubblicato:

```sh
OPENTESORO_E2E_PUBLIC_URL=https://IL-TUO-SITO bun run test:e2e
```

Il comando apre nuove sessioni sintetiche, crea un movimento di prova, verifica l'isolamento, scarica un'esportazione e ripristina la demo. Non usarlo contro il launcher privato.
