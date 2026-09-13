# CLAUDE.md

Ovaj file čitaš prije nego dirneš bilo koji kod u ovom repozitoriju. Sadrži dva dijela:

1. **Opća pravila rada** — kako se ponašaš kao agent u ovom repou (tokeni, dizajn).
2. **Projektna specifikacija** — što točno gradiš (AutoRadar, osobni agregator auto oglasa).

Dio 1 vrijedi za svaki zadatak u ovom repou. Dio 2 je specifičan za ovaj projekt — ako se repo ikad reupotrijebi za nešto drugo, dio 1 ostaje, dio 2 se mijenja.

---

## DIO 1 — Opća pravila rada

### 1.1 Trošenje tokena

Ovo je osobni projekt koji se gradi kroz agentske sesije, ne jednokratni prompt. Cilj je da svaka sesija ostavi trag koji sljedeća sesija ne mora ponovno otkrivati.

- **Ne re-čitaj nepotrebno.** Prije izmjene, pročitaj samo file/sekciju koja se mijenja — ne cijeli repo iznova na početku svake sesije. `git log` i ovaj file ti daju kontekst brže nego ponovno čitanje svega.
- **Patch, ne rewrite.** Za male izmjene koristi diff/patch pristup, ne prepisuj cijeli file. Cijeli file piši iznova samo kad se struktura stvarno mijenja.
- **Odluke se pišu jednom.** Kad se donese arhitekturna odluka (stack, shema baze, imenovanje, izvor podataka), zapiši je u `DECISIONS.md` (kratke natuknice, datum, jedna rečenica zašto). Ne raspravljaj iznova već zapisane odluke — samo ih čitaj.
- **Ne gradi unaprijed.** Ne dodaji apstrakcije, config slojeve, podršku za izvore ili modele koji nisu traženi. Ako nešto zvuči kao "možda će trebati kasnije" — ne piši ga sad.
- **Nema nagađanja podataka.** Nikad ne izmišljaj primjere oglasa, cijene, opise ili slike kao "placeholder koji izgleda stvarno". Ako trebaš mock podatke za razvoj UI-a, jasno ih označi kao mock (npr. `MOCK_` prefiks ili očit "TEST OGLAS" naslov).
- **Ne re-fetchaj nepromijenjeno.** Ovo vrijedi i za agenta koji piše kod i za sam scraper u produkciji (vidi 3.4) — provjeri stanje prije nego ponoviš posao.
- **Sažeti commit poruke i komentari.** Komentar u kodu objašnjava *zašto*, ne *što* (kod već govori što). Ne piši docstring za svaku trivijalnu funkciju.
- **Testovi kad zatrebaju, ne unaprijed.** Ovo je jednokorisnički alat, ne biblioteka. Piši test kad se pojavi stvaran bug ili kad faza to izričito traži (npr. dedup logika u Fazi 1) — ne generiraj exhaustive test suite za sve edge-caseve unaprijed.
- **Jedna sesija = jedna faza.** Ne miješaj nepovezane cjeline u istom prolazu (vidi fazni plan, 3.8). Ako naiđeš na nešto izvan trenutne faze, zapiši u `DECISIONS.md` ili `TODO.md`, ne skreni s teme.
- **Manja razumna pretpostavka > blokiranje.** Kod nejasnoće koja se da riješiti razumnom pretpostavkom, odaberi je, zapiši u `DECISIONS.md`, i nastavi. Pitaj samo kad je pretpostavka skupa za vratiti (npr. izbor baze, ne izbor imena varijable).

### 1.2 Dizajn — kako ne napraviti "AI slop"

Ovo NIJE marketinška stranica. Cilj sučelja je gustoća informacija i brzo skeniranje dnevne liste oglasa — ne "wow" hero efekt. Ali "generički AI dashboard" izgled se svejedno mora izbjeći; prepoznatljivost i namjera i dalje vrijede, samo su usmjerene na čitljivost, ne na dojam.

**Izbjegavaj ove default obrasce (najčešći znakovi generiranog dizajna):**
- Kremasta pozadina (~#F4F1EA) + serif naslov + terracotta accent (~#D97757) — ili obrnuto, gotovo crna pozadina + jedan neon-zeleni/vermilion accent.
- "SaaS card kit" — sve kartice identičnog border-radiusa, ista siva sjena (rgba(0,0,0,.1)) ispod svake, gradient wash kao dekoracija bez razloga.
- ALL-CAPS eyebrow labeli iznad naslova, meta-stringovi spojeni s "·", oznake tipa "RIJEČ — fragment" s razmaknutim crticama, strelica "→" nalijepljena na svaki link.
- Isticanje samo jedne riječi u naslovu boldom/italikom/bojom bez razloga.
- Numerirani markeri (01/02/03) kad sadržaj stvarno nije sekvenca.
- Fade-in + hover animacija na svakoj kartici — generički default koji odmah odaje AI.

**Umjesto toga:**
- Jedan vizualni identitet vezan uz temu — ovo je alat za auto oglase, ne generički startup dashboard. Iskoristi vokabular iz te domene (spec-sheet tipografija, jasna hijerarhija naslov/cijena/specifikacija, bedž koji nosi stvarnu informaciju — npr. "NOVO" bedž se prikazuje samo ako je oglas stvarno dodan u zadnja 24h, "BENZIN" bedž je stvarni filter tag, ne dekoracija).
- Jedan ili dva fonta, jasna tipografska skala, čitljivost prije efekta.
- Strukturni elementi (linije, oznake, brojevi) nose informaciju, ne dekoriraju prazninu.
- Minimalan, namjeran motion — npr. istaknut fade kad se pojavi novi oglas nakon dnevnog osvježavanja — ne animacija na svaki hover.
- Prije pisanja UI koda: kratko zapiši plan (paleta 4-6 hex vrijednosti, tipografija, layout u ASCII skici, princip), provjeri da to nije default rješenje koje bi nastalo za bilo koji sličan brief, tek onda piši kod.
- Kvaliteta prije objave: radi na mobitelu (ovo će se gledati na mobitelu dnevno), tipkovnica radi za filtere, kontrast je čitljiv, `prefers-reduced-motion` se poštuje.

---

## DIO 2 — Projekt: AutoRadar (osobni agregator auto oglasa)

*(Radni naziv — slobodno promijeni u `DECISIONS.md` ako želiš drugo ime.)*

### 2.1 Cilj

Osobna, jednokorisnička web aplikacija koja jednom dnevno prikuplja nove oglase automobila prema fiksnim kriterijima, sprema ih, i prikazuje u sučelju gdje ih vlasnik može dodatno filtrirati. Nije javni proizvod — nema potrebe za: registracijom više korisnika, plaćanjem, multi-tenant arhitekturom, rate-limitingom po korisniku.

### 2.2 Kriteriji pretrage

Svi kriteriji žive u jednom config fileu (npr. `config/models.json`), ne hardkodirani po cijelom kodu, da se lako mijenjaju bez diranja logike.

**Marke i modeli (allowlist):**
- Škoda: Octavia
- Audi: A5, A6, A7
- Volkswagen: T-Roc, Arteon, Passat
- Volvo: S60, S70, S80, S90

> Napomena: rečeno je i "takvih sličnih auta" — lista je namjerno u configu, ne u kodu, da se lako doda novi model (npr. BMW serija 5, Mercedes E-klasa) jednim retkom kad se odluči, umjesto da se agent sam domišlja koji su "slični" auti.

**Gorivo:** isključivo benzin (isključi dizel, hibrid, plug-in, električna vozila).

**Godište:** minimalno 2020.

**Cijena / kilometraža:** nije fiksno ograničeno — ostaje kao slobodan filter u sučelju, ne u pretrazi na izvoru.

### 2.3 Izvori — realno stanje i preporučen pristup po izvoru

Ovo je najvažniji dio specifikacije jer izvori nisu jednako pouzdani niti jednako rizični. Ne tretiraj ih kao da su isti.

**AutoScout24**
Ima ugrađenu opciju "spremi pretragu" s email/push obavijestima o novim oglasima, besplatno za registrirane korisnike. Preporučen pristup: iskoristi taj mehanizam kao detektor novoga (IMAP dohvat maila s novim linkovima), pa fetchaj samo pojedinačne stranice novih oglasa radi punog opisa/slika. Ovo je i tokenski i rizično najjeftinije — ne treba simulirati pretragu protiv njihove bot-zaštite, samo se otvara nekoliko konkretnih linkova dnevno. Direktan scraping stranice s rezultatima pretrage je izvediv, ali AutoScout24 ima anti-bot zaštitu i to je tehnički protiv Uvjeta korištenja; za osobnu, rijetku (1x dnevno) upotrebu rizik je nizak, ali nije nula.

**mobile.de**
Ista situacija kao AutoScout24 — postoji saved search + email alert. Ista preporučena strategija.

**Facebook oglasi (Marketplace)**
Najlomljiviji izvor i taj koji treba tretirati drugačije od ostala tri. Od 2026. anonimni pristup pretrazi je uglavnom blokiran (redirect na login). Realne opcije:
- Automatizacija preko prijavljenog osobnog FB naloga — nosi stvaran rizik privremenog ili trajnog ograničenja naloga. Ne preporučam na glavnom osobnom računu.
- Plaćeni treći servis (npr. Apify actor) koji rješava pristup umjesto tebe — reda veličine par dolara na 1000 oglasa, dakle mikro-trošak po korištenju, ne pretplata, ali je svejedno vanjska ovisnost i trošak.
- Preskoči Facebook u prvim fazama, dodaj tek ako se pokaže da su ostala tri izvora nedovoljna. Ovo je preporučena opcija za v1.

**Index oglasi** (`index.hr/oglasi/auto-moto/osobni-automobili`)
Najjednostavniji i najsigurniji izvor: besplatan portal, filtriranje po marki/modelu/godištu/gorivu radi direktno kroz URL parametre pretrage, nema poznatu jaku bot-zaštitu. **Ovo je preporučeni prvi izvor za implementaciju** — počni ovdje.

### 2.4 Ponašanje dnevnog osvježavanja

- Pokreće se jednom dnevno (scheduled job), ne kontinuirano i ne on-demand po zahtjevu.
- Za svaki izvor: dohvaća se samo ono što je novo od zadnjeg pokretanja — usporedi s spremljenom listom viđenih ID-jeva/linkova prije nego bilo što fetchaš ponovno.
- Filtriranje (marka/model/gorivo/godište) radi se kroz parametre pretrage na samom izvoru gdje god je moguće — ne preuzimaj sve pa filtriraj lokalno.
- Sprema se samo delta (novo/promijenjeno), ne prepisuje se cijela baza svaki dan.

### 2.5 Podaci koji se izvlače po oglasu

- Naslov oglasa
- Slika (glavna + galerija ako je dostupna)
- Opis
- Cijena
- Godište
- Kilometraža (ako dostupno)
- Gorivo
- Lokacija/grad
- Izvor (autoscout24 / mobile.de / index-oglasi / facebook)
- Link na originalni oglas
- Datum kad je oglas prvi put viđen u sustavu (za "NOVO" oznaku)

### 2.6 Sučelje

- Jedna stranica: popis/kartice oglasa, najnoviji prvi.
- Filteri u UI-u: izvor, model, cijena (raspon), godište (raspon), kilometraža.
- Vizualna oznaka za oglase dodane u zadnja 24h.
- Klik na karticu vodi na originalni oglas u novom tabu — ovo je alat za otkrivanje, ne za transakciju.

### 2.7 Prijedlog stacka

Usklađeno s postojećim navikama (React/HTML/CSS/JS na frontendu, sklonost besplatnim/one-time alatima bez trajnog mjesečnog troška):

- **Dnevni posao:** GitHub Actions scheduled workflow (besplatno u okviru standardnih limita) koji pokreće scraper skriptu (Python ili Node — odaberi jedno i zapiši zašto u `DECISIONS.md`).
- **Pohrana:** SQLite file u repou ili Cloudflare D1 (besplatni tier) — dovoljno za jednokorisnički alat, bez baze koju treba plaćati.
- **Frontend:** statični site (React ili čisti HTML/CSS/JS) hostan na Netlify ili Cloudflare Pages (besplatno), čita spremljene podatke.
- **Slike:** linkaj na originalne slike izvora, ne hostaj ih sam — izbjegava trošak pohrane i pitanja oko prava korištenja tuđih fotografija.

### 2.8 Fazni plan (sekvencijalno, svaka faza mora raditi prije sljedeće)

- **Faza 0** — Repo setup, `config/models.json`, prazan scraper skeleton za Index oglase.
- **Faza 1** — Index oglasi scraper radi end-to-end: dohvaća, parsira, sprema u SQLite/D1, dedup po ID-u radi ispravno.
- **Faza 2** — Frontend dashboard čita spremljene podatke, prikazuje kartice, osnovni filteri rade.
- **Faza 3** — Dodaj AutoScout24 + mobile.de kroz email-alert pristup (2.3).
- **Faza 4** — Facebook izvor — ne kreni bez izričite potvrde pristupa (naloga/plaćenog servisa) jer nosi trošak ili rizik naloga.
- **Faza 5** — Automatizacija (GitHub Actions cron) + deploy dashboarda.

### 2.9 Napomena o riziku (kratko i pošteno)

Scraping/monitoring tuđih stranica za osobnu, nekomercijalnu, rijetku (dnevnu) upotrebu je uobičajena praksa, ali je tehnički često protiv Uvjeta korištenja platformi — rizik je nizak za male, spore, osobne skripte, ali nije nula (moguć IP throttling ili, kod Facebooka s prijavljenim nalogom, ograničenje naloga). Ovo je informacija za odlučivanje, ne razlog za odustajanje od projekta.
