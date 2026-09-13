# AutoRadar

Osobni agregator oglasa rabljenih automobila. Jednom dnevno pokupi nove oglase prema fiksnim kriterijima (benzin, godište 2020+, allowlist modela), spremi ih i prikaže u dashboardu s filterima.

Specifikacija i pravila rada: [CLAUDE.md](CLAUDE.md). Donesene odluke: [DECISIONS.md](DECISIONS.md).

## Izvori

| Izvor | Stanje |
| --- | --- |
| Index oglasi | radi — puni podaci s opisom |
| AutoKatalog | radi — samo registrirane hrvatske autokuće, link vodi na salon |
| AutoScout24 | radi — Njemačka i Austrija, bez opisa |
| Njuškalo | modul napisan, ali njihova bot-zaštita blokira ovaj IP (vidi DECISIONS.md) |
| Facebook Marketplace | radi uz jednokratnu prijavu: `npm run facebook:login`, pa `enabled: true` u configu |
| mobile.de | blokira već prvi zahtjev; ide preko email alerta (vidi TODO.md) |

## Stack

- **Scraper:** Node 24 (ESM), pohrana u SQLite kroz ugrađeni `node:sqlite`
- **Frontend:** React + Vite, statični build
- **Kriteriji pretrage:** `config/models.json`

Traži se Node >= 24 (zbog `node:sqlite`).

## Skripte

```bash
npm install
npm run refresh          # dohvat + izvoz snapshota za dashboard
npm run facebook:login   # jednokratna ručna prijava za Marketplace
npm run scrape   # samo dohvat
npm run export   # samo izvoz public/data/listings.json
npm test         # testovi scrapera
npm run dev      # dashboard, dev server
npm run build    # produkcijski build
npm run lint
```

## Struktura

```
config/models.json      kriteriji pretrage (marke/modeli, gorivo, godište, izvori)
scraper/run.js          ulazna točka dnevnog posla
scraper/config.js       učitavanje i validacija configa
scraper/http.js         HTTP klijent (sesija, throttle, retry)
scraper/db.js           SQLite shema i spremanje
scraper/sources/        jedan modul po izvoru oglasa
scraper/export.js       SQLite -> public/data/listings.json
data/autoradar.sqlite   baza spremljenih oglasa (u repou)
src/                    React dashboard
```

## Status po fazama

| Faza | Opis | Status |
| --- | --- | --- |
| 0 | Repo setup, config, skeleton scrapera | gotovo |
| 1 | Index oglasi end-to-end (dohvat, parse, SQLite, dedup) | gotovo |
| 2 | Dashboard: lista + filteri | gotovo |
| 3 | Dodatni izvori | AutoScout24 gotov, ostali čekaju email alert |
| 4 | Facebook Marketplace (uvjetno) | čeka odluku |
| 5 | GitHub Actions cron + deploy | gotovo |

## Deploy

Dnevni posao je GitHub Actions workflow (`.github/workflows/dnevni-dohvat.yml`): dohvati nove
oglase, izveze snapshot i commita promjenu natrag u repo. Vrijeme dohvata se mijenja iz dana u
dan — pet je termina, a današnji se bira iz datuma. Facebook se tu ne dohvaća: njegova je sesija
vezana uz osobno računalo, pa se taj izvor pokreće lokalno. Frontend je statičan build — Netlify
čita `netlify.toml`, a za Cloudflare Pages vrijede iste postavke (build `npm run build`, izlaz `dist`).
