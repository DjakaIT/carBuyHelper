# TODO

Stvari uočene izvan trenutne faze — da se ne skreće s teme, ali ni ne zaborave.

## Čeka vlasnika

- **Popis salona:** Reddit blokira moje alate, pa imena salona trebaju stići od tebe (linkovi na teme ili sama imena). Podaci o prodavaču već postoje u bazi (tip + naziv), pa je dodavanje popisa praćenih salona mala izmjena.

## Izvori koji čekaju odluku vlasnika

- **Njuškalo:** modul je napisan i uključen, ali ovaj IP je blokiran. Provjeriti prvo automatsko pokretanje; ako i ondje pada, ide na email alert.
- **mobile.de:** Akamai blokira već prvi zahtjev. Ide na spremljenu pretragu + email alert. Za to treba: (1) spremljene pretrage, (2) IMAP pristup mailu, (3) **jedan primjer takvog maila** da se parser piše po stvarnom sadržaju.
- **Facebook Marketplace:** CLAUDE.md 2.3 — ne kreće bez odluke o pristupu (osobni nalog vs. plaćeni servis).
- **auti.hr:** sljedeći kandidat za scraping. Nema bot-zaštite, ali filteri su neprozirni (`search[1][96]=389`); sve opcije s ID-jevima stoje u HTML-u stranice pretrage, pa mapiranje treba jedan dohvat.
- **polovniautomobili.com:** srpsko tržište, dohvat radi. Vrijedi tek ako se uvoz iz regije smatra relevantnim.

## Provjeriti nakon prvog automatskog pokretanja

- GitHub Actions runneri idu s IP-a podatkovnog centra. Index i AutoScout24 na to mogu reagirati drugačije nego kućni IP — prvi `workflow_dispatch` pokazat će prolazi li dohvat.

## Sitno

- Index oglasi slike dolaze u punoj veličini (0,1–1,5 MB). Njihov `?m=` parametar **nije** veličina (sve varijante vraćaju 404) — lista se oslanja na `loading="lazy"`. Ako postane problem, rješenje je proxy/resize, ne izvor.
- `SKILL.md` (apple-design) stoji u rootu repoa; ako se koristi kao Claude skill, mjesto mu je `.claude/skills/apple-design/SKILL.md`.
- Prazan `package-lock.json` leži u roditeljskom folderu (`CarBuyTracker/`), izvan git repoa — ostatak `npm` komande pokrenute u krivom folderu, može se obrisati.
