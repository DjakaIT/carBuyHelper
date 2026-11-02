# TODO

Stvari uočene izvan trenutne faze — da se ne skreće s teme, ali ni ne zaborave.

## Čeka vlasnika

- **Popis salona s Reddita:** Reddit blokira moje alate. AutoKatalog je u međuvremenu dodan i pokriva registrirane hrvatske autokuće, pa je popis s Reddita sada dodatak, ne nužnost — ako pošalješ imena, dodaje se filter "samo moji saloni".
- **Facebook: provjeriti čitanje kartica.** Modul se prijavljuje i prepoznaje odsutnost sesije, ali raspored teksta u karticama Marketplacea nisam vidio (nema sesije). Prvi dohvat nakon prijave treba usporediti s onim što piše na ekranu — moguće je da cijena, kilometraža ili lokacija trebaju drugačije čitanje.

## Izvori koji čekaju odluku vlasnika

- **Njuškalo:** modul je napisan i uključen, ali ovaj IP je blokiran. Provjeriti prvo automatsko pokretanje; ako i ondje pada, ide na email alert.
- **mobile.de:** Akamai blokira već prvi zahtjev. Ide na spremljenu pretragu + email alert. Za to treba: (1) spremljene pretrage, (2) IMAP pristup mailu, (3) **jedan primjer takvog maila** da se parser piše po stvarnom sadržaju.
- **Facebook Marketplace:** CLAUDE.md 2.3 — ne kreće bez odluke o pristupu (osobni nalog vs. plaćeni servis).
- **auti.hr:** kandidat za scraping. Nema bot-zaštite, ali filteri su neprozirni (`search[1][96]=389`); sve opcije s ID-jevima stoje u HTML-u stranice pretrage, pa mapiranje treba jedan dohvat.
- **polovniautomobili.com:** srpsko tržište, dohvat radi. Vrijedi tek ako se uvoz iz regije smatra relevantnim.

## Provjeriti nakon prvog automatskog pokretanja

- GitHub Actions runneri idu s IP-a podatkovnog centra. Index i AutoScout24 na to mogu reagirati drugačije nego kućni IP — prvi `workflow_dispatch` pokazat će prolazi li dohvat.

## Trošak uvoza — provjeriti

- **CVH iznos (83 €) je iz kalkulatora, ne iz službenog cjenika.** Kad se nađe važeći CVH cjenik za utvrđivanje sukladnosti vozila iz EU, upisati u `config/import.json`.
- **CO₂ i snaga nisu u oglasima**, pa PPMV i pristojba stoje na pretpostavci (150 g/km, 110 kW). Index u detalju oglasa ima polje `co2EmissionsComb` (zasad prazno), Plavi oglasnik ima kW — ako se pokaže da se pune, vrijedi ih spremati u bazu.
- **Cijena goriva (1,69 €/l) se ne osvježava sama**; HAK je mijenja svaka dva tjedna.

## Sitno

- Plavi oglasnik: URL filteri njihove tražilice nisu otkriveni, pa se prolaze 4 najnovije stranice svih marki. Ako se nađe format (npr. iz preglednika nakon klika na filtar), dovoljno je dodati parametre u `scraper/sources/oglasnik.js`.

- Index oglasi slike dolaze u punoj veličini (0,1–1,5 MB). Njihov `?m=` parametar **nije** veličina (sve varijante vraćaju 404) — lista se oslanja na `loading="lazy"`. Ako postane problem, rješenje je proxy/resize, ne izvor.
- `SKILL.md` (apple-design) stoji u rootu repoa; ako se koristi kao Claude skill, mjesto mu je `.claude/skills/apple-design/SKILL.md`.
- Prazan `package-lock.json` leži u roditeljskom folderu (`CarBuyTracker/`), izvan git repoa — ostatak `npm` komande pokrenute u krivom folderu, može se obrisati.
