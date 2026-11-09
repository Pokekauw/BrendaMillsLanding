# Brenda Mills — landingpage med besøgsindsigt

React/Vite-landingpage med et **serverbeskyttet adminpanel**, besøgslog og de
eksisterende globale kliktællere.

> **Vigtigt om hosting:** Dette er ikke længere en udelukkende statisk side.
> `dist/index.html` skal serveres af den medfølgende Node-server (eller en senere
> tilpasset backend). GitHub Pages, almindelig statisk hosting eller en tidligere
> Vercel/Netlify-deployment uden API-backend kan ikke beskytte eller gemme
> besøgsloggen. Upload aldrig kun `dist/` og forvent, at logningen virker.

## Hvad registreres?

For besøgende, hvor JavaScript kører og logning ikke er fravalgt:

- Første og seneste IP-adresse, udledt fra netværksforbindelsen på serveren.
- Omtrentlig by/region/land, netværk og ASN via et server-side IP-opslag.
- Første besøg, seneste aktivitet og omtrentlig **aktiv** tid (kun synlig side).
- Enhedstype, eventuel model/producent, browser, OS og versioner fra user-agent.
- Sprog, tidszone og viewport-størrelse.
- Landingsside, henvisningsdomæne og udvalgte UTM-parametre.
- Sidevisninger, sektioner set, referral-klik, billedvisninger og download-klik.

Der bruges **ingen GPS-, kamera-, mikrofon- eller kontakttilladelse**, ingen
fingerprinting/canvas-ID, ingen reklame-ID og ingen optagelse af tastetryk,
formulardata eller adgangskoder. Fulde eksterne referrer-stier og vilkårlige
querystrings gemmes ikke, fordi de kan indeholde tokens/persondata.

IP-lokation er et **netværksestimat**, ofte by/område. Det er ikke en præcis
adresse eller personens live-position. VPN, mobilnetværk, delte IP-adresser og
browserens reducerede user-agent kan gøre oplysningerne upræcise.

## Adminpanelet

Knappen **Admin** åbner login. Den gamle, hårdkodede klientkode `stats` er fjernet.

- Adgangskoden kontrolleres på serveren med en saltet scrypt-hash.
- Kun en HttpOnly, SameSite=Strict sessionscookie sendes til browseren.
  Produktionscookies kræver HTTPS (`Secure` + `__Host-` prefix).
- Sessioner udløber efter 2 timers inaktivitet og højst 8 timer samlet.
- Login har rate-limiting; API'et har same-origin/CSRF-beskyttelse.
- Besøgsdata, detaljer, søgning og CSV-eksport hentes først efter server-login.
- Loggen kan søges/filtreres, opdateres automatisk, eksporteres og slettes.
- Følsomme besøgsdata gemmes **ikke** i browserens localStorage og sendes ikke
  til den offentlige CountAPI/Abacus-tællertjeneste.

I panelet er **Besøg & enheder** den nye private log. **Globale kliktællere** er
den bevarede, separate oversigt over de gamle anonyme tal.

## Lokal udvikling

Kræver Node.js **22.13+** (Node 24 LTS anbefales til produktion). Projektet bruger
Nodes indbyggede SQLite; på ældre Node 22-versioner kan den vise en
eksperimentel-feature-advarsel.

```bash
npm ci
cp .env.example .env
npm run admin:hash       # skriv en stærk kode; indsæt den viste hash i .env
npm run dev              # http://localhost:3000
```

`admin:hash` skjuler indtastningen og viser kun en hash. Gem selve adgangskoden i
en password manager. Til lokal udvikling kan `ADMIN_PASSWORD` (mindst 12 tegn)
bruges i stedet; den afvises i produktion. Alle secrets skal ligge i `.env` eller
hostingens environment — **aldrig** i `VITE_*`, klientkode eller Git.

En midlertidig demo kan køres sådan:

```bash
DEMO_MODE=true ADMIN_PASSWORD='en-midlertidig-lokal-kode' npm run dev
```

Demo-rækker er udtrykkeligt fiktive, mærket **DEMO**, og bruger dokumentations-IP'er.
Databasen ligger kun i hukommelsen. `DEMO_MODE` nægtes i produktion.

## Produktion

1. Vælg hosting med en kørende Node-proces og en **persistent disk**. Den aktuelle
   SQLite-løsning er beregnet til én serverinstans, ikke flere replikaer eller
   ephemeral serverless-filesystems.
2. Sæt en stærk `ADMIN_PASSWORD_HASH`, lavet med `npm run admin:hash`.
3. Sæt `PUBLIC_ORIGIN=https://dit-domæne.dk`, `PRIVACY_CONTROLLER` til den virkelige
   ejers/virksomheds navn og `PRIVACY_CONTACT` til en overvåget kontakt.
4. Gennemgå privatlivsgrundlaget og oplysningerne i afsnittet nedenfor.
5. Byg og start:

```bash
npm run build
npm start                # NODE_ENV=production node build/server/index.js
```

Serveren lytter på `0.0.0.0:3000` som standard. `PORT` og `DATA_DIR` kan ændres.
Databasen ligger som `visitors.sqlite` i `DATA_DIR` (standard `.data/`), med
stramme filrettigheder. Tag sikre backups; krypter disken/backups efter behov.

### Docker

```bash
cp .env.example .env
# Udfyld ADMIN_PASSWORD_HASH, PUBLIC_ORIGIN, PRIVACY_CONTROLLER,
# PRIVACY_CONTACT og eventuelle proxy/IP-oplysningsindstillinger.
docker compose up --build -d
```

Compose gemmer databasen i et persistent volume og binder kun porten til
`127.0.0.1:3000`. Sæt en HTTPS-reverseproxy foran. Containere bør kun kunne nås
via den tiltænkte proxy.

### Reverseproxy og rigtige IP-adresser

Som standard er `TRUST_PROXY_HOPS=0`: `X-Forwarded-For` og `X-Real-IP` fra klienter
ignoreres. Det er sikkert direkte-forbindelses-defaulten, men bag en proxy vil
alle besøgende ellers se ud til at komme fra proxyen.

Sæt `TRUST_PROXY_HOPS` til det **præcise antal betroede proxy-hop** foran appen,
og konfigurér din egen proxy, så den **erstatter/renser** ubetroede
forwarding-headers. Stol ikke ukritisk på en vilkårlig kæde af `X-Forwarded-For`.
En forkert værdi kan gøre det muligt at forfalske IP-adresser eller omgå
rate limits. Hostens egen dokumentation er afgørende her.

### IP-lokation

`GEOIP_ENABLED=true` bruger `https://ipinfo.io/<ip>/json` fra serveren.
En valgfri `IPINFO_TOKEN` anbefales for en passende/kendt kvote. Tokenet sendes
kun som server-side Bearer-header og indgår ikke i frontend-buildet.

- Private/lokale IP-adresser slås ikke op og vises som “Lokal/private IP”.
- Succesfulde opslag caches i højst 7 dage; fejl caches kort for at undgå storms.
- Fejl/slået fra/ukendt vises ærligt; der opfindes ikke en lokation.
- Hvis tjenesten er nede, bevares IP, enhed og øvrige besøgsoplysninger.
- Sandboxed forhåndsvisning kan have begrænset netadgang og en lokal proxy-IP;
  demo-byerne er ikke resultater af rigtige opslag.

## Privatliv, opbevaring og sletning

IP-adresser og besøgslogge er personoplysninger. Koden er ikke i sig selv en
garanti for GDPR-compliance. Inden offentlig drift skal ejeren mindst:

- Fastlægge og dokumentere et lovligt grundlag (og indhente samtykke, hvis det
  kræves for den konkrete behandling/opsætning).
- Informere besøgende om dataansvarlig, formål, grundlag, modtagere, opbevaring,
  rettigheder og klagemulighed.
- Indgå nødvendige databehandleraftaler og kontrollere hosting/IP-udbyderens
  overførsler og vilkår.
- Holde privatlivsteksten og kontaktoplysningerne opdaterede.
- Vurdere behovet for en konsekvensanalyse og begrænse adgang til log/eksport.

Standardopbevaring er **30 dage**, konfigurerbar fra 1–90 dage. Ældre besøg og
hændelser slettes automatisk ved opstart og hver time. IP-cache udløber særskilt.
Der er en synlig privatlivsoplysning/footer, fravalg i browseren samt respekt for
Global Privacy Control og Do Not Track. Fravalg sletter den aktuelle browsers
besøgssession; ældre/andre sessioner kan håndteres via ejerens privacy-kontakt.

Besøgende kan ikke identificeres med navn, e-mail eller præcis adresse ud fra
disse tekniske oplysninger alene. Den løsning laver ikke person-berigelse eller
forsøg på at omgå browserens privatlivsindstillinger.

## Konfiguration

| Variabel | Standard | Betydning |
| --- | --- | --- |
| `NODE_ENV` | development | `production` aktiverer strenge krav og sikre cookies |
| `PORT` | `3000` | HTTP-port |
| `DATA_DIR` | `.data` | Persistent SQLite-mappe |
| `ADMIN_PASSWORD_HASH` | ingen | Påkrævet i produktion; laves med `npm run admin:hash` |
| `ADMIN_PASSWORD` | ingen | Kun lokal udvikling, mindst 12 tegn |
| `VISITOR_LOG_ENABLED` | `true` | Slår detaljeret logning til/fra |
| `VISITOR_LOG_RETENTION_DAYS` | `30` | 1–90 dage |
| `VISITOR_LOG_MAX_ROWS` | `50000` | 100–500000; nye besøg pauses ved pladsgrænsen |
| `GEOIP_ENABLED` | `true` | Server-side IP-estimater |
| `IPINFO_TOKEN` | ingen | Server-only token til ipinfo |
| `PUBLIC_ORIGIN` | ingen | Påkrævet HTTPS-origin i produktion med logning |
| `PRIVACY_CONTROLLER` | ingen | Virkelig dataansvarlig; påkrævet i produktion med logning |
| `PRIVACY_CONTACT` | ingen | Overvåget privacy-kontakt; påkrævet i produktion med logning |
| `TRUST_PROXY_HOPS` | `0` | Antal betroede proxy-hop; se advarslen ovenfor |
| `DEMO_MODE` | `false` | Fiktive rækker + in-memory DB; forbudt i produktion |

## Bevarede globale kliktællere

De eksisterende tællere i `src/lib/cloudStore.ts` og `src/lib/analytics.ts` er
bevaret. De indeholder fortsat kun antal, ikke besøgsloggens personoplysninger:

| Nøgle | Tæller |
| --- | --- |
| `brendamills-site-v1-page-visits` | Sideindlæsninger |
| `brendamills-site-v1-referral-health` | Health-link klik |
| `brendamills-site-v1-referral-coinbase` | Coinbase-link klik |
| `brendamills-site-v1-<image>-views` | Gallerivisninger |
| `brendamills-site-v1-<image>-saves` | Download-klik |

CountAPI er default; Abacus kan vælges i `CLOUD_CONFIG`. Nøglerne er offentligt
læsbare, og CountAPI-nøgler kan også skrives af andre. De er derfor ikke et sikkert
lager til besøgsdetaljer. Nulstilling af disse tællere sletter ikke besøgsloggen.

## Test og afgrænsninger

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=low
```

Automatiske tests dækker blandt andet login/logout, hashing, CSRF, IP-spoofing,
enhedsparser, validering, IP-cache, privatlivssignaler, filtre/eksport, sletning,
opbevaring og ressourcegrænser.

- Kun JavaScript-besøg registreres; blokering/adblockers og netværksfejl kan give tab.
- Aktiv tid og “aktive nu” er heartbeat-baserede estimater, ikke præcis overvågning.
- Højst 500 hændelser pr. besøg; CSV-eksporten tager højst 10.000 rækker pr. udvalg.
- Rate limits og login-sessioner ligger i proceshukommelsen; kør én instans.
- Den gamle download-tæller registrerer klik på download-linket, ikke om en fil
  faktisk blev gemt (især ved cross-origin-billeder på mobil).

## Filer

- `server/` — Express API, rigtig auth, SQLite, IP-opslag, sikkerhed og tests.
- `shared/visitors.ts` — fælles typer for besøgsloggen.
- `src/lib/visitorTracker.ts` — begrænset first-party browserindsamling.
- `src/components/AdminPanel.tsx` — serverbeskyttet adminskal.
- `src/components/VisitorDashboard.tsx` — log, filtre, detaljer, eksport og sletning.
- `src/components/CloudStats.tsx` — bevarede globale kliktællere.
- `src/components/PrivacyNotice.tsx` — oplysning og fravalg.
- `scripts/hash-password.ts` — sikker lokal generering af admin-hash.
