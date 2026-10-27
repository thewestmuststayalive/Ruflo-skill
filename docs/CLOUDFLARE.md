# Gratis hosting på Cloudflare

Denne version bruger **Workers Free + D1 Free** og udgiver automatiske **tekstopslag**. Den kræver ikke en AI-konto, betalt server, domæne eller billedgenerering. Et gratis `workers.dev`-domæne er tilstrækkeligt.

Gratisplanerne har forbrugs- og CPU-grænser. Behold Workers på Free, og godkend ikke en betalt opgradering. Ved overskridelse kan tjenesten blive begrænset eller stoppe; gratis hosting er ikke et løfte om ubegrænset drift. Cloudflares [Workers-priser](https://developers.cloudflare.com/workers/platform/pricing/) og [D1-priser](https://developers.cloudflare.com/d1/platform/pricing/) er de gældende kilder. Opsætningen bruger ét cron-trigger og kører kun seks gange om ugen; kun de tre kørsler, som matcher dansk kl. 18, udgiver. Den er tiltænkt én lille virksomhed, ikke en offentlig tjeneste med mange brugere.

## Opret via Cloudflare-dashboardet

1. Opret/log ind på [Cloudflare](https://dash.cloudflare.com/) og vælg en konto. Et eksisterende domæne skal ikke tilføjes.
2. Åbn **Workers & Pages** og opret en **Worker** med import fra GitHub (ikke et Pages-projekt).
3. Forbind `thewestmuststayalive/Ruflo-skill`, branch `main`. Brug Worker-navnet **ruflo-skill**, så det matcher `wrangler.jsonc`.
4. Installationskommando, hvis der er et felt: `npm ci`. Build-kommando kan være tom. Deploy-kommando: `npm run deploy:cloud`. Rodmappen er repositoryets rod. Wrangler er låst i `package-lock.json`.
5. Deploy. Wrangler understøtter automatisk oprettelse/tilknytning af D1-databasen `bw-bilpleje-data` med bindingen `DB`. Godkend kun en gratis D1-oprettelse. Hvis Cloudflare ikke giver builden rettigheder til automatisk oprettelse, opret databasen under **Storage & Databases → D1**, tilføj dens ID i `wrangler.jsonc` som `database_id` og deploy igen; koden må ikke køre uden bindingen.
6. Tilføj `APP_PASSWORD` som en **Secret** under Worker → **Settings → Variables and Secrets**. Vælg mindst 20 tegn. Gem/deploy ændringen. Åbn Workerens HTTPS-adresse, og log ind med brugernavn `admin` og denne adgangskode. Der udleveres ingen brugerflade, før adgangskoden er sat.
7. Kontrollér under **Bindings**, at `DB` peger på databasen. Tabeller oprettes automatisk ved første autoriserede API-kald. Under **Triggers / Cron Triggers** skal `0 16,17 * * MON,WED,FRI` findes. Det dækker sommer- og vintertid, og koden vælger kun dansk kl. 18. Ændringer af cron kan tage tid at slå igennem.

Cloudflare kan ændre skærmbillederne. Hvis en import ikke viser de nævnte felter, stop på det skærmbillede og gennemgå det; opret ikke en betalt tjeneste eller et statisk Pages-projekt som erstatning.

## Facebook-forbindelse

Hosting kan testes uden Meta-oplysninger; automatik er som udgangspunkt slået fra.

1. Opret en Meta-app på [Meta for Developers](https://developers.facebook.com/) med Pages API/Facebook Login til din egen virksomhedsside.
2. Sæt `FACEBOOK_APP_ID` og en aktuelt understøttet `META_GRAPH_VERSION` (format `vXX.0`) som variabler i Workerens indstillinger. Sæt `FACEBOOK_APP_SECRET` som en **Secret**. `FACEBOOK_PAGE_ID` er allerede sat til `61595933881305`.
3. Tilføj Workerens HTTPS-domæne i Meta-appen og præcis `https://DIN-WORKER-ADRESSE/facebook/callback` som gyldig OAuth-redirectadresse. Brug den rigtige adresse, ikke eksemplet. Et eventuelt eget domæne angives også som `PUBLIC_URL`; ellers bruges Workerens adresse.
4. Gem/deploy indstillingerne. Klik **Forbind Facebook-side** i kontrolpanelet og godkend `pages_show_list`, `pages_read_engagement` og `pages_manage_posts` til din side. I Meta-appens udviklingstilstand skal brugeren normalt have en app-rolle. Andre brugere kan kræve App Review, Advanced Access og virksomhedsverifikation. En Facebook-profil uden sidetilladelser er ikke nok.
5. Kontrollér opslagene i planen og klik **Aktivér automatisk udgivelse**. Det starter tre offentlige tekstopslag om ugen, uden individuel godkendelse. Det køber ikke betalte annoncer.

Alternativt kan en erfaren administrator sætte `FACEBOOK_PAGE_ACCESS_TOKEN` som en Secret i stedet for loginflowet. Sidetokenet skal have de samme nødvendige tilladelser.

Del ikke passwords, app secrets eller tokens i chat eller Git. Loginflowet gemmer sidetokenet krypteret i D1, med en nøgle afledt af `APP_PASSWORD`. Hvis adgangskoden skiftes, skal Facebook-siden forbindes igen. Meta kan gøre et token ugyldigt, så adgang kan ikke garanteres permanent.

## Drift og indhold

- Der findes ingen billedgenerering i Cloudflare-versionen. Egne billeder kan bruges i den manuelle editor.
- Tekster er faktabaserede skabeloner fra `public/business.js`, ikke AI-fritekster. Kommende opslag vises i kontrolpanelet; prisskift kræver en kodeopdatering/deploy.
- Planlagte tidspunkter beregnes ud fra dansk tid. Cron gemmer kun udførte eller påbegyndte opslag i D1; preview af fremtidige opslag beregnes uden at skrive til databasen.
- Pause virker via kontrolpanelet. Den kan ikke tilbagekalde et opslag, Facebook allerede har modtaget.
- D1 bruger atomare jobkrav til at forhindre samtidige/dobbelte udgivelser. Ved ukendt resultat stoppes automatikken. Kontrollér siden og markér opslaget som kontrolleret før genaktivering.
- Hvis en kørsel afbrydes efter jobkravet, markeres den som ukendt efter ti minutter ved næste kontrolpanel-/cron-kald. Den genudgives ikke automatisk. Mistede cron-kørsler efterindhentes ikke som en bunke reklamer.
- Kun ét Worker-projekt må være aktivt for denne side. Hvis Render/Windows-versionen tidligere blev aktiveret, sæt den på pause før skift. Dens SQLite-data overføres ikke automatisk til D1.
- Se til kontrolpanelet og Cloudflare-fejl indimellem, selvom opslagene kører automatisk.

## Lokal test uden Cloudflare-konto

```sh
npm ci
npm test
npm run check:cloud
npm run dev:cloud
```

Tilføj lokalt `APP_PASSWORD="en-lang-lokal-adgangskode"` i `.dev.vars` (filen er ignoreret af Git). Wrangler starter en lokal Worker med lokal D1; der kræves ingen reel konto eller Meta-adgang. Byggetjekket er `--dry-run` og publicerer intet. En alternativ CLI-udrulning for tekniske brugere er `npx wrangler login` efterfulgt af `npm run deploy:cloud`; den kræver ejerens Cloudflare-godkendelse.

Validering i udviklingsmiljøet omfatter en reel lokal Workers-runtime med assets og D1 samt simulerede Meta-tests. Det er ikke dokumentation for en offentlig deployment eller rigtige Facebook-opslag. De dele kræver ejerens konti og efterfølgende kontrol.
