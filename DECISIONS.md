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

## 2026-09-13 — Faza 2b: F1 sučelje (plan prije koda)

**Princip:** F1 timing tower, ne F1 poster. Uzima se ono što tu ploču čini upotrebljivom — gusti tamni redci, monospace brojke, i **boja koja znači razliku** — a ne dekoracija (zastavice, karbon teksture, logotipi).

**Ključni prijenos:** u F1 boja vremena govori koliko si brži ili sporiji od referentnog. Ovdje boja govori **koliko je cijena ispod ili iznad medijana za taj isti model** u trenutnoj listi:

- ljubičasta = najjeftiniji primjerak tog modela (oznaka `P1`, kao najbrži krug)
- zelena = osjetno ispod medijana (10 % ili više)
- siva = oko medijana
- jantarna = 10 % ili više iznad medijana

Time stupac "delta" nosi stvarnu informaciju (je li ovo dobra cijena za taj model), a ne boju radi boje. Redni broj retka je pozicija u trenutnom sortiranju — lista jest poredak, pa broj nešto znači.

**Paleta** (tamna je primarna, svijetla prati): asfalt `#0E0F12`, ploha `#16181D`, linija `#23262E`, tinta `#E8EAED`, prigušeno `#8A9099`, F1 crvena `#E10600` (samo akcenti i marka), brza zelena `#00D26A`, jantarna `#F0A202`, ljubičasta `#B14AED`.

**Izvor = boja tima:** tanka traka uz lijevi rub retka razlikuje izvor (Index plava, AutoKatalog crvena, AutoScout24 jantarna, Njuškalo zelena). Legenda je u chipovima filtera, koji nose iste boje.

**Tipografija:** naslovi i zaglavlja stupaca velikim slovima s razmakom (F1 grafika je tracked i condensed), sadržaj i dalje sistemski sans, sve brojke monospace s `tabular-nums`.

**Motion ostaje suzdržan:** odgovor na pritisak, bljesak retka koji je nov od zadnjeg posjeta, i ništa više. Bez animiranih traka, bez hover efekata po kartici.

## 2026-09-13 — AutoKatalog, Facebook, karoserija, raspored

- **Karoserija se filtrira na izvoru u sva tri portala** (`vehicleBodyTypes` na Indexu, `body` na AutoScout24, `bodyTypeId` na Njuškalu). Dopušteno: limuzina, SUV, coupe i hatchback; isključeni karavan, monovolumen, kombibus i kabriolet. **Hatchback ostaje** jer Octavia (liftback) i A5 Sportback kod dijela izvora padaju pod tu oznaku — bez toga bi ispala većina Octavia.
- **Uz to postoji zaštitna mreža po naslovu.** Dio salona označi karavan kao limuzinu ili SUV, pa filter na izvoru propusti "Octavia Kombi". Riječi kombi/combi/variant/avant/karavan/touring/estate/break kod praćenih modela znače karavan i ništa drugo, pa takav oglas ne ulazi u bazu.
- **AutoKatalog je dodan kao izvor.** Agregator ponude registriranih hrvatskih autokuća, bez privatnih oglašivača — točno ono što se tražilo kao "provjerene autokuće". Podaci stoje u Next.js RSC payloadu stranice (`initialVehicles`), s markom, modelom, godištem, cijenom, kilometražom, gorivom i **linkom na stranicu same autokuće**, pa oglas vodi izravno prodavaču. Njihovi filteri rade tek u pregledniku (URL parametri se ignoriraju), pa se prosijava lokalno; po modelu stiže 9 najnovijih, što je za dnevni radar dovoljno.
- **Facebook Marketplace: sesija da, lozinka ne.** Marketplace ne radi bez prijave, ali lozinka ne ide ni u kod ni u config ni meni — `npm run facebook:login` otvori pravi prozor preglednika, prijava se obavi rukom, a sesija ostaje u `data/browser-profile` koji je izvan gita. Dnevni dohvat onda koristi tu sesiju bez prozora.
- **Za to se ne uvodi Playwright.** Koristi se Edge koji na Windowsu ionako postoji, kroz njegov debug protokol (`scraper/browser.js`) — bez 150 MB preglednika u repou i bez native ovisnosti.
- **Facebook nikad ne ide u CI.** Modul odbija raditi kad je postavljen `CI`, jer je sesija vezana uz osobno računalo i osobni račun. U configu je `enabled: false` dok se vlasnik ne prijavi.
- **Rizik Facebooka je stvaran i nije isti kao ručno gledanje.** Ručno otvaranje Marketplacea je uobičajeno korištenje; automatizirani dohvat je protiv njihovih Uvjeta bez obzira na to što gleda iste oglase, a prepoznaje se po ponašanju (ritam, broj zahtjeva, odsutnost mišjih pokreta). Posljedica nije tužba nego zaključavanje računa ili traženje dodatne provjere. Zato: mali broj upita, jednom dnevno, s osobnog računala i uz nasumično vrijeme. Odluka je vlasnikova i zapisana je ovdje.
- **Dohvat se svaki dan pokreće u drugo vrijeme.** Pet termina u workflowu, a koji je današnji bira se iz dana u godini (ciklus od pet dana). Odgoda kroz `sleep` bi trošila minute runnera; ovako preskočeni termin traje sekundu.

## 2026-09-13 — Njuškalo preko Apifyja

- **Njuškalo se dohvaća preko Apify actora `rastriq/njuskalo-scraper`, u "live" načinu.** Njihova bot-zaštita blokira izravan dohvat s ovog IP-a; actor taj pristup rješava umjesto nas. Izravni modul ostaje u kodu i bira se s `"via": "direct"` — nije obrisan jer je besplatan kad prolazi.
- **Actor prima naš URL pretrage.** Ima polje `startUrls` koje prihvaća search stranice Njuškala, pa kriteriji ostaju u našem configu (gorivo, godište, cijena, kilometraža, karoserija) umjesto da se prepisuju u njihove kategorije.
- **Pretražuje se po marki, a model se prosijava lokalno.** Filtriranje po modelu na Njuškalu traži njihove `vehicleIds`, a za njih treba otvoriti stranicu marke — što je upravo ono što je blokirano. Actor zato dobiva četiri URL-a (po jedan po marki), a model se odabire iz polja `make` i `model` koja actor vraća strukturirano, ne iz naslova.
- **Token ide u okolinu, ne u repo.** `APIFY_TOKEN` se čita iz okoline; u CI-u je GitHub secret. Bez tokena izvor javi grešku, a ostali izvori se dohvate normalno (run.js ionako preživi pad pojedinog izvora).
- **Trošak je stvaran, pa je ograničen.** Naplata je po dohvaćenom oglasu (red veličine 1,90 USD na 1000) plus sitnica po pokretanju; `maxItems` u configu je zato 100, a `scrapeDetail` je isključen jer opis nije vrijedan dodatnog troška i vremena.
- **Kilometraža dolazi iz `ext_specs`, koji nema zajamčen oblik** (mapa ili niz parova), pa se čita tolerantno i pada na `null` umjesto da ruši dohvat.
