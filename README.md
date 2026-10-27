# BW Bilpleje · automatisk Facebook-markedsføring

En webapp til BW Bilpleje i Slotsbjergby, Slagelse og omegn. Lav manuelle opslag, eller aktivér tre automatiske tekstopslag om ugen. Billedgenerering er valgfri og slået fra som standard. Kundernes booking foregår på **42 30 01 68** eller [Messenger](https://m.me/61595933881305).

## Hvad den gør

- Gemmer en rullende fireugers plan: mandag, onsdag og fredag kl. 18 i Europe/Copenhagen, inklusive sommer-/vintertid.
- Skriver opslag fra faktuelle skabeloner med dine pakker, priser, tilvalg og forbehold. Teksterne roterer mellem BASIS, GRUNDIG og DYBDERENS; de er ikke AI-skrevne fritekster.
- Kan valgfrit lave et nyt illustrativt bilinteriør via OpenAI Images API, hvis billedgenerering aktiveres. Teksten mærker da billedet som AI-genereret. Ingen opdigtede anmeldelser eller før-/efterresultater.
- Udgiver tekst på den valgte Facebook-side, eller tekst og billede når billedgenerering er aktiveret.
- Gemmer plan og historik i SQLite på en vedvarende disk. Automatik starter sat på pause ved første installation.
- Pauser ved fejl. Usikre resultater efter netværksfejl/genstart genudgives ikke automatisk. Mere end seks timer forsinkede opslag springes over.
- Beskytter kontrolpanelet med HTTP Basic-login over hostingudbyderens HTTPS. Brugernavn: `admin`.

Dette laver almindelige organiske opslag. Det køber ikke betalte Facebook-annoncer, besvarer ikke Messenger og booker ikke aftaler.

## Hosting på Render

Konfigurationen i `render.yaml` opretter én betalt, konstant kørende Node-webservice og en 1 GB disk i Frankfurt. Se og godkend de aktuelle priser hos Render inden oprettelse. Gratis hosting uden vedvarende disk er ikke egnet til denne opsætning. Der er ikke oprettet nogen tjeneste af kodeændringen alene.

1. Opret en konto på [Render](https://render.com/) og forbind GitHub med adgang til dette repository.
2. Opret en **Blueprint** fra `thewestmuststayalive/Ruflo-skill`, branch `main`. Render læser `render.yaml`.
3. Blueprinten kan oprettes uden Facebook- og AI-nøgler. Billedgenerering er slået fra (`AUTO_IMAGES_ENABLED=false`). Tilføj Meta-oplysninger efter oprettelsen som beskrevet nedenfor; der udgives intet uden Facebook-forbindelse og aktivering.
4. Godkend hostingprisen og opret tjenesten. Render tildeler en HTTPS-adresse; `RENDER_EXTERNAL_URL` bruges automatisk. Ved eget domæne: sæt `PUBLIC_URL` til den præcise HTTPS-adresse.
5. Find den automatisk genererede `APP_PASSWORD` i Render → tjenesten → Environment. Åbn tjenestens adresse, og log ind som `admin` med den adgangskode.
6. Forbind Facebook-siden som nedenfor. Klik derefter **Aktivér automatisk udgivelse**, når du accepterer planen. Ingen opslag udgives inden aktivering.

Brug kun én instans af tjenesten. Disken indeholder både plan/historik og det krypterede Facebook-sidetoken; tag backup før diskændringer. Automatiske deploys er slået fra. Nye GitHub-versioner skal deployes manuelt i Render. Undgå at klone en aktiv disk til en anden kørende tjeneste: det kan medføre dobbelte opslag.

## Facebook-forbindelse (engangsopsætning)

Meta kræver en app med relevante Pages API- og Facebook Login-funktioner. Opret den i [Meta for Developers](https://developers.facebook.com/). Meta kan ændre sine skærmbilleder og adgangskrav.

1. Tilføj `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` og en aktuelt understøttet `META_GRAPH_VERSION` (format `vXX.0`) fra Meta-appdashboardet til Render → Environment. App secret skal forblive hemmelig. Gem og genstart/deploy tjenesten.
2. Konfigurér appens webadresse/domæne og tilføj præcis `https://DIN-RENDER-ADRESSE/facebook/callback` som gyldig OAuth-redirectadresse for Facebook Login. Brug den faktiske adresse, ikke eksemplet.
3. Loginflowet anmoder om `pages_show_list`, `pages_read_engagement` og `pages_manage_posts`. Din Facebook-bruger skal have tilstrækkelig adgang til siden og i udviklingstilstand normalt også en rolle i Meta-appen. Brug uden app-rolle kan kræve App Review, Advanced Access og virksomhedsverifikation.
4. Åbn værktøjet, klik **Forbind Facebook-side**, og godkend adgang til siden med ID `61595933881305`. Der vælges aldrig automatisk en anden side.
5. Sidetokenet gemmes krypteret på disken. Krypteringsnøglen afledes af `APP_PASSWORD`: ændring af denne adgangskode kræver ny Facebook-forbindelse. Tokens kan stadig blive ugyldige; løsningen kan ikke love permanent adgang. Forbind siden igen ved udløb eller ændrede tilladelser.

For avanceret manuel opsætning kan `FACEBOOK_PAGE_ACCESS_TOKEN` bruges i stedet for login. Det skal være et Page access token til den korrekte side. Status viser, at konfigurationen er til stede; den erstatter ikke en rigtig API-validering. Ingen reel Facebook-login eller udgivelse er valideret uden dine konti.

## AI-billeder og omkostninger

Dette er valgfrit. Der kræves ingen AI-konto eller AI-betaling for tekstopslag. Hvis billeder ønskes senere: sæt `AUTO_IMAGES_ENABLED=true` og `AI_IMAGE_API_KEY` til en OpenAI API-nøgle i Render → Environment. API-forbrug faktureres separat fra et ChatGPT-abonnement. Modellen er `gpt-image-1`, ét 1024×1024-billede i lav kvalitet pr. planlagt opslag. Kontoen skal have adgang til modellen og eventuel krævet verifikation. Se aktuelle priser og forbrugsgrænser hos udbyderen. Der er ikke en indbygget månedsgrænse i kroner; sæt forbrugsgrænser hos udbyderen og hold øje med faktureringen.

Når billedgenerering er aktiveret, indeholder automatiske opslag generiske AI-illustrationer, ikke dine kundebilleder. Dine egne billeder kan bruges i den manuelle editor. Et udløbet token, utilstrækkelig modelsaldo eller en tjenestefejl kan sætte automatik på pause; kontrolpanelet skal derfor stadig tilses indimellem.

## Lokal udvikling / Windows

Kræver **Node.js 24 eller nyere**. Ingen tredjeparts npm-afhængigheder.

På Windows: installér Node.js LTS (24+), hent og udpak repositoryet og dobbeltklik `Start-Windows.bat`. Hvis browseren åbner før serveren er klar, genindlæs siden. Behold kommandovinduet åbent.

På andre systemer:

```sh
cp .env.example .env
npm ci --ignore-scripts
npm start
```

Lokalt åbnes port 3000. Preview og opslagsplan virker uden konti; aktivering kræver Facebook-adgang. AI-adgang er kun nødvendig, hvis billedgenerering aktiveres. Standardbindingen er `127.0.0.1`. Hosting med `HOST=0.0.0.0` kræver `APP_PASSWORD` på mindst 20 tegn og en HTTPS-reverse proxy.

`DATA_DIR` indeholder databasen og skal være vedvarende på hosting. Ved lokal udvikling bruges `./data`, som er udeladt fra Git. `.env` er også udeladt fra Git.

## Priser og indhold

`public/business.js` indeholder pakker, priser og betingelser. Stop automatik før prisændringer. Genstart/deploy efter ændringen; planlagte opslag i køen opdateres fra de nye skabeloner ved næste opdatering af planen. Udgivne opslag og historik ændres ikke.

## Test og begrænsninger

```sh
npm test
```

Testene dækker hostinglogin, samme oprindelse bag HTTPS, Facebook-login med simulerede svar, krypteret tokenlagring, tekst-/billedudgivelse, gemte job, fejl/genstart, pausering under billedgenerering samt dansk sommer-/vintertid. De bruger ingen rigtige tokens, køber ingen billeder og udgiver ingen rigtige opslag. En rigtig Meta-app, API-konto og hostingudrulning skal stadig forbindes og afprøves.

Netværksadgang på hosting: `www.facebook.com`, `graph.facebook.com` og `api.openai.com` over HTTPS. Browseren sender ikke API-nøgler eller sidetokens til klientkode. Nøgler skal kun indtastes hos hostingudbyderen, aldrig i chat eller versionsstyring.
