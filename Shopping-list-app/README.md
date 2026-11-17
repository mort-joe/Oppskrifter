# Innkjøpsplanlegger (Shopping-list-app)

Webapp for å holde orden på matretter, lage ukesmeny og få en sortert
handleliste. Hver bruker har sine egne matretter og sin egen handleliste, og
kan importere matretter fra andre brukere. Et eget admin-panel på `/admin`
administrerer brukere, sorteringskategorier og ingredienskatalogen.

## Arkitektur

| Del | Hvor | Teknologi |
| --- | --- | --- |
| Hovedapp (SPA) | `src/` | React 19 + Vite. Snakker direkte med Supabase med anon-nøkkelen; tilgang styres av RLS-policyer. |
| Admin-panel | `src/admin/` | Samme bunt, vises på `/admin`. Snakker bare med `api/`. |
| Admin-API | `api/admin/` | Vercel serverless functions. Bruker Supabase **service role** (går utenom RLS) og krever et signert admin-token. |
| Database | `supabase/` | Postgres i Supabase. `auth_setup.sql` setter opp kolonner, tabeller og RLS-policyer. |

Rene hjelpefunksjoner ligger i `src/lib/`, Supabase-kall for katalogene i
`src/data/`, og felles API-hjelpere i `api/_lib/`.

## Miljøvariabler

Kopier `.env.example` til `.env` og fyll inn. Variablene med `VITE_`-prefiks
legges inn i nettleserbunten og er offentlige; resten må bare finnes på
serveren (Vercel → Settings → Environment Variables).

| Variabel | Hvor | Beskrivelse |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | nettleser + server | Prosjekt-URL i Supabase |
| `VITE_SUPABASE_ANON_KEY` | nettleser + server | Anon/publishable key |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | server (valgfritt) | Brukes hvis `VITE_`-variantene ikke er satt på serveren |
| `SUPABASE_SERVICE_ROLE_KEY` | server, **hemmelig** | Service role key. Går utenom RLS. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | server, **hemmelig** | Innlogging for konfigurasjons-administratoren i `/admin` |
| `ADMIN_SESSION_SECRET` | server, **hemmelig** | Nøkkel som signerer admin-token (lang, tilfeldig streng) |

Alle tre `ADMIN_*`-variablene må være satt. Det finnes ingen standardverdier:
mangler én av dem, er admin-innloggingen med konfigurasjonsbrukeren slått av,
og admin-token kan ikke lages eller verifiseres. Supabase-brukere med
`app_metadata.role = "admin"` kan også logge inn i `/admin`.

## Kjøre lokalt

```bash
npm ci
npm run dev        # bare hovedappen (http://localhost:5173)
```

Admin-API-et er Vercel-funksjoner og kjører ikke under `vite`. For å teste
`/admin` lokalt:

```bash
npx vercel dev     # hovedapp + api/ på http://localhost:3000
```

## Database

1. Opprett et Supabase-prosjekt og lag grunntabellene `recipes`, `ingredients`,
   `categories`, `tags`, `recipe_ingredients`, `recipe_categories` og
   `recipe_tags` (disse opprettes ikke av skriptet).
2. Kjør `supabase/auth_setup.sql` i SQL Editor. Skriptet er trygt å kjøre på
   nytt: det legger til manglende kolonner, tabeller (`user_settings`,
   `shopping_categories`, `shopping_state`) og (re)oppretter RLS-policyene.
   Appen ber om at dette kjøres når den oppdager at noe mangler.
3. `supabase/one_time_data_fixes/` inneholder dataopprydninger som skal kjøres
   **én gang** (se README der). Ikke kjør dem på nytt på en database i bruk.
4. Slå av «Enable email signups» under Authentication → Providers → Email.
   Appen har ingen registrering, og alle innloggede brukere får rollen
   `authenticated`.

## Første administrator

Sett `ADMIN_USERNAME`, `ADMIN_PASSWORD` og `ADMIN_SESSION_SECRET` i Vercel og
logg inn på `/admin` med dem. Opprett deretter vanlige brukere (og eventuelt
flere administratorer) i panelet.

## Kvalitetssjekker

```bash
npm run lint
npm test
npm run build
```

`.github/workflows/ci.yml` i repo-roten kjører de samme stegene på hver push
og pull request. Dependabot følger med på npm-avhengighetene.

## Deploy

Prosjektet deployes til Vercel. `vercel.json` sender `/admin` til SPA-en og
setter noen sikkerhetsheadere. Node-versjonen for lokal utvikling står i
`.nvmrc`.
