# DECISIONS

Kratke natuknice: datum, odluka, jedna rečenica zašto. Zapisano jednom, ne raspravlja se iznova.

## 2026-09-12 — Faza 0

- **Naziv projekta: AutoRadar.** Radni naziv iz CLAUDE.md ostaje; nema razloga za promjenu.
- **Scraper u Node-u (ESM), ne Python.** Frontend je već Vite/React, pa je jedan toolchain, jedan lockfile i jedan `setup-node` korak u CI-u umjesto dva runtimea.
- **Pohrana: SQLite kroz ugrađeni `node:sqlite` (Node 24+), baza kao file u repou.** Nema native buildova (`better-sqlite3` zna pucati na Windowsu i u CI-u) i nema vanjskog servisa; D1 bi značio Cloudflare account i mrežni poziv za jednokorisnički alat. Cijena: `node:sqlite` je još označen kao experimental, pa je Node pinan na 24 (`engines` u `package.json`) i CI mora koristiti istu verziju.
- **Frontend ne čita SQLite izravno.** Statični site učitava JSON snapshot koji dnevni posao izveze; oblik snapshota se fiksira u Fazi 2.
- **Prvi i jedini izvor u v1: Index oglasi.** Najjednostavniji, bez poznate jake bot-zaštite (CLAUDE.md 2.3). AutoScout24/mobile.de dolaze u Fazi 3 kroz email alert, Facebook je izvan v1.
- **Kriteriji pretrage žive u `config/models.json`.** Kod čita config, nigdje ne duplicira listu modela; `sources` u istom fileu uključuje/isključuje izvor bez diranja koda.

## 2026-09-12 — Faza 1

- **Index oglasi se ne scrapea iz HTML-a nego iz njihovog JSON API-ja.** `index.hr/oglasi` je React SPA — HTML stranice su prazne ljuske bez oglasa. Isti podaci koje crta njihov frontend dostupni su kroz `/oglasi/api/...`, pa nema parsiranja HTML-a, nema `cheerio` ovisnosti i nema lomljenja na svaki redizajn stranice. Cijena: to je interni API bez dokumentacije i garancije stabilnosti — ako se promijeni, mijenja se `scraper/sources/index-oglasi.js`.
- **Jedan upit pokriva sve modele.** `includeModelIds` se ponavlja u query stringu (`?includeModelIds=a&includeModelIds=b`), pa svih 11 modela ide u jednu pretragu umjesto 11 zasebnih. Dnevni posao time troši ~3 zahtjeva za listu umjesto ~30.
- **Detalj oglasa se dohvaća samo za nove oglase.** Lista vrati naslov/cijenu/godište, ali ne i opis i gorivo — za njih treba poseban zahtjev po oglasu. Zato se prvo skupe ID-jevi s liste, odbiju već viđeni, pa se detalj vuče samo za ostatak (CLAUDE.md 2.4).
- **Dedup ključ je `code` (broj oglasa), ne URL.** URL sadrži `smartLink` koji se mijenja kad oglašivač promijeni naslov; `code` je stabilan. Primarni ključ je `(source_id, external_id)` pa baza sama odbija duplikate.
- **Lokacija ide od najužeg prema najširem: grad → naselje → županija → država.** Oglasi bez unesene lokacije nose nule umjesto ID-a; kod inozemnih salona (a to je trećina rezultata) ostaje samo država, što je i dalje korisna informacija ("NJEMAČKA" = uvoz).
- **Slike se ne preuzimaju, linka se na Indexov endpoint** (`/oglasi/api/image/direct/{putanja}`), u skladu s CLAUDE.md 2.7.

### Index oglasi API — bilješke (da se ne otkriva iznova)

Baza: `https://www.index.hr/oglasi/api`. Prije prvog zahtjeva treba otvoriti `https://www.index.hr/oglasi/auto-moto/osobni-automobili` i pokupiti kolačiće — bez njih API vraća `400 Bad request`.

| Što | Zahtjev |
| --- | --- |
| Lista oglasa | `GET /aditem?page=1&category=car&module=vehicles&sortOption=4&…filteri` |
| Detalj oglasa | `GET /aditem/single-ad?code={code}` (`/aditem/{id}` je za vlasnika oglasa i vraća 401) |
| Marke i modeli | `GET /configuration/datasource/make` (skup za automobile: `dataId 388b1099-36a4-427a-b4a4-9ed39e14da46`) |
| Lokacije | `GET /configuration/datasource/location` (stablo država → županija → grad → naselje) |
| Slika | `GET /image/direct/{putanja iz ad.images}` |

Parametri pretrage (iz njihovog `ui-config/hr/advancedSearch.json`): `includeMakeIds`, `includeModelIds`, `priceFrom/priceTo`, `makeYearFrom/makeYearTo` (**datum**, npr. `2020-01-01` — čisti `2020` se ignorira), `mileageFrom/mileageTo`, `fuelIds`, `gearboxIds`, `vehicleBodyTypes`. Nepoznat parametar se ne prijavljuje kao greška nego tiho ignorira — filter se provjerava usporedbom `count` prije i poslije.

Šifre goriva: 1 Diesel, 2 Benzin, 3 Hibridni, 4 Benzin + LPG, 5 Električni, 6 Plug-in hibrid. `sortOption`: 4 = najnovije prvo (promovirani oglasi svejedno idu na vrh).

Javni link na oglas: `https://www.index.hr/oglasi/auto-moto/osobni-automobili/oglas/{smartLink}/{code}`.

## 2026-09-12 — Izvori: što radi, a što ne (provjereno, ne pretpostavljeno)

Svaki kandidat je testiran stvarnim zahtjevom prije nego je odbačen ili prihvaćen.

| Izvor | Stanje | Nalaz |
| --- | --- | --- |
| **Index oglasi** | radi | Interni JSON API, stabilan, daje i opis. Implementirano u Fazi 1. |
| **AutoScout24** | radi | `autoscout24.com/lst/{marka}/{model}` vraća Next.js payload (`__NEXT_DATA__`) s punim strukturiranim podacima; 3/3 uzastopna zahtjeva prošla bez izazova. Implementirano. |
| **Njuškalo** | blokirano | ShieldSquare/Radware bot zid. Prvih ~10 zahtjeva s kolačićima i pauzama prođe, nakon toga IP dobiva CAPTCHA na svaki zahtjev — i liste i detalje. Nije stvar boljih zaglavlja; oni prate ponašanje. |
| **mobile.de** | blokirano | Akamai bot manager: `403` s JS izazovom već na prvi zahtjev. |
| **Facebook Marketplace** | nije dirano | CLAUDE.md 2.3/Faza 4 traži izričitu odluku o pristupu prije početka. |
| **auti.hr** | kandidat | Server-rendered HTML, bez vidljive bot-zaštite; filteri su neprozirni (`search[1][96]=389`), ali sve opcije s ID-jevima stoje u HTML-u pretrage, pa je mapiranje izvedivo iz jednog dohvata. |
| **polovniautomobili.com** | kandidat | Odgovara normalno (776 kB HTML); srpsko tržište — korisno tek ako se uvoz iz regije smatra relevantnim. |

- **Njuškalo i mobile.de idu kroz email alert, ne kroz scraping.** Oba imaju spremljene pretrage s obavijesti na mail — to je put koji CLAUDE.md 2.3 ionako preporučuje za AutoScout24/mobile.de, i jedini koji kod Njuškala uopće prolazi. Traži pristup mailu (IMAP), pa čeka odluku vlasnika.
- **AutoScout24 se ograničava na D i A i na prve 2 stranice po modelu.** Bez toga je to 19.000 oglasa po kriterijima — radar za "što je novo danas" ne treba arhivu. Sortirano je po starosti oglasa, pa su novi na prvim stranicama; prolazak staje čim stranica ne donese nijedan neviđen oglas.
- **AutoScout24 oglasi se spremaju bez opisa.** Lista ga ne nosi, a detalj bi značio jedan zahtjev po oglasu. Kartica ionako vodi na izvor.

## 2026-09-12 — Faza 2: plan sučelja (zapisan prije koda, CLAUDE.md 1.2)

**Princip:** ovo je dnevna lista za skeniranje, ne izlog. Sučelje je *spec-tablica*: slika je mala pločica, brojke stoje u tabularnom monospaceu i poravnate su u stupce, jedina "dekoracija" su tanke linije između redaka. Ako nešto ne nosi informaciju, ne stoji na ekranu.

**Paleta** (svijetla → tamna): tinta `#14181B` → `#E6E9E4`, papir `#EDEFEA` → `#101311`, ploha `#FFFFFF` → `#171A18`, linija `#D5D9D2` → `#2A2F2B`, prigušeno `#667079` → `#939C94`, signal `#1B3FC4` → `#7FA2FF`. Hladan papir i kobalt namjerno izbjegavaju krem+terakota i crno+neon predloške iz CLAUDE.md 1.2.

**Tipografija:** sistemski sans za tekst, monospace s `tabular-nums` za sve brojke (cijena, km, godište) — kontrast proporcionalnog i tabularnog pisma je tipografski potpis sučelja. Skala 12/13/15/18/28.

**Raspored** (desktop ≥ 900 px, redak visine ~92 px):

```
┌──────────────────────────────────────────────────────────────────────────┐
│ AutoRadar                         458 oglasa   14 novih   osvježeno 21:40 │
├──────────────────────────────────────────────────────────────────────────┤
│ [pretraga /]  [Index][AutoScout24]  [Octavia][A5][A6][T-Roc]…  [samo novo]│
│ cijena do [____]  godište od [____]  km do [____]         sortiraj [ ▾ ]  │
├───┬────────┬─────────────────────────┬───────┬─────────┬────────┬────────┤
│   │        │ VOZILO                  │GODIŠTE│      KM │ GORIVO │ CIJENA │
│ ▍ │ [slika]│ Škoda Octavia 1.5 TSI…  │  2024 │  17.000 │ Benzin │ 26.900 │
│   │        │ Index oglasi · Zagreb   │       │         │        │      € │
└───┴────────┴─────────────────────────┴───────┴─────────┴────────┴────────┘
```

Ispod 900 px redak postaje kartica: slika lijevo 96×72, naslov, specifikacije u 2×2 rešetki, cijena dolje desno.

**Motion:** tri stvari i ništa više — (1) pritisak na kontrolu odgovara odmah (`:active`, 100 ms), (2) oglasi koji su novi *od zadnjeg posjeta* jednom bljesnu pri učitavanju liste, (3) `prefers-reduced-motion` gasi oboje. Nema fade-ina po kartici ni hover animacija.

## 2026-09-13 — Faza 3/5

- **Ne piše se parser za email alerte dok ne postoji stvarni primjer maila.** Njuškalo i mobile.de idu tim putem, ali oblik tih mailova nisam vidio — parser napisan "po sjećanju" bio bi nagađanje podataka (CLAUDE.md 1.1). Treba jedan spremljeni primjer svakog maila, pa se piše po njemu.
- **AutoScout24 naslov se čisti od ponavljanja modela.** Njihov `modelVersionInput` često već počinje nazivom modela, pa bi spajanje dalo "Skoda Octavia Octavia Combi 2.0 TSI".
- **Sortiranje "najnovije" ima drugi ključ: datum objave na izvoru.** Svi oglasi iz istog pokretanja dijele `first_seen_at`, pa bi bez toga poredak unutar dana bio proizvoljan.
- **Snapshot za frontend nosi skraćen opis (300 znakova).** Puni opisi bi udvostručili veličinu fajla koji se povlači na mobitelu, a cijeli tekst je ionako jedan klik dalje na izvoru.
- **Dnevni posao commita bazu i snapshot natrag u repo.** Time je deploy obična statična stranica koja se rebuilda na push, bez servera i baze koju treba plaćati.

## 2026-09-13 — Povijest cijena, kilometraža, Njuškalo, prodavač

- **Kilometraža do 100.000 km ide u `criteria.mileageMax` i filtrira se na izvoru** (`mileageTo` na Indexu, `kmto` na AutoScout24, `mileage[max]` na Njuškalu). Postojećih 40 oglasa preko te granice obrisano je iz baze jednokratno.
- **Cijene se osvježavaju iz liste, bez ijednog dodatnog zahtjeva.** Lista svakog izvora ionako nosi cijenu, pa se za već viđene oglase samo usporedi s pohranjenom. Promjena ide u `price_history`, a oglas zadržava svoj `first_seen_at`.
- **AutoScout24 više ne prekida prolaz na prvoj stranici bez novih oglasa.** Prije je to štedjelo zahtjeve, ali bi značilo da se cijene već spremljenih oglasa nikad ne provjere. Sada se uvijek prođe zadani limit stranica (2 po modelu).
- **Povijest prati samo ono kroz što prolazimo.** Index se prolazi cijeli, pa su mu cijene potpune; AutoScout24 se prolazi do 2 stranice po modelu, pa oglas koji ispadne dublje ostaje na zadnjoj viđenoj cijeni.
- **Dva uzastopna jednaka iznosa nisu promjena cijene.** Izvoz ih spaja — inače bi kartica pokazala "bilo 30.890 €" pored "30.890 €".
- **Baza se migrira dopisivanjem stupaca u `openDb`.** `create table if not exists` ne dira postojeću tablicu, a baza živi u repou i preživljava izmjene sheme.
- **Njuškalo je implementirano do kraja, ali se ne može potvrditi na ovom IP-u.** Modul zna njihovu strukturu (obitelj modela iz `categories`, `fuelTypeId=600`, `yearManufactured[min]`, `mileage[max]`, `sort=new`, podaci iz `window.__INITIAL_STATE__`), ide s 6 sekundi razmaka i prepoznaje CAPTCHA stranicu pa uredno odustane umjesto da vrati prazno. Ovaj IP je označen od ranijeg testiranja i blokada nije popustila ni nakon sat vremena. Prvo pokretanje s drugog IP-a (npr. GitHub Actions) pokazat će prolazi li uopće.
- **Prodavač: tip se zna za sve izvore, ime samo gdje ga izvor daje.** Index vraća `legalEntity` (1 privatno / 2 tvrtka) ali ne i naziv, AutoScout24 daje `seller.type` i `companyName`, Njuškalo ime profila. Sučelje ima filtere "salon" i "privatno".
- **Popis salona s Reddita nije napravljen.** Reddit blokira pristup mojim alatima (i pretragu i dohvat stranice), pa bi svaki popis bio izmišljen. Čeka se da vlasnik pošalje linkove na teme ili imena salona.
