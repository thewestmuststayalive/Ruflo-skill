# Facebook-opslag til bilpleje

Dansk webapp til at skrive opslag, se en forhåndsvisning og udgive tekst med et valgfrit JPG/PNG-billede til en Facebook-virksomhedsside.

## Start lokalt

Kræver Node.js 22 eller nyere. Ingen npm-afhængigheder.

```sh
cp .env.example .env
npm start
```

Åbn port 3000 lokalt. Tekstforslag og forhåndsvisning virker uden Facebook-adgang.

## Forbind din Facebook-side

Opret/brug en Meta-app med adgang til Pages API. Tilføj din side og brug et **Page access token**, der har de relevante tilladelser, herunder `pages_manage_posts` og `pages_read_engagement`. Afhængigt af loginflow kan `pages_show_list` også være nødvendigt. Meta kan kræve App Review/Advanced Access og virksomhedsverifikation for brugere uden app-roller. Et token til en personlig profil er ikke tilstrækkeligt.

Udfyld `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` og en aktuelt understøttet `META_GRAPH_VERSION` fra Metas appdashboard i den lokale `.env`. Genstart serveren. Tokenet sendes kun fra serveren til graph.facebook.com og udleveres ikke til browseren. Statusindikatoren viser kun, om konfigurationen er til stede; Facebook-adgangen bekræftes først ved en rigtig udgivelse.

Udgivelsesknappen beder om bekræftelse og offentliggør straks. Der er ingen planlægning, login med Facebook eller automatisk fornyelse af tokens endnu. Ved netværksfejl skal siden kontrolleres før gentagelse for at undgå dubletter.

Serveren binder kun til 127.0.0.1 og er beregnet til en enkelt bruger lokalt. Før offentlig hosting skal der tilføjes brugerlogin, HTTPS og sikker tokenadministration. Der kræves udgående HTTPS til graph.facebook.com for udgivelse.

## Kontrol

```sh
npm test
```

Testene bruger simulerede Facebook-svar og udgiver ikke rigtige opslag. Reel Facebook-udgivelse kræver brugerens sideadgang.
