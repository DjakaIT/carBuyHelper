// Parametri dolaze iz config/import.json (kroz snapshot); izvori brojki su u DECISIONS.md.

const percent = new Intl.NumberFormat('hr-HR', { style: 'percent', maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 })
const countryEn = new Intl.DisplayNames(['en'], { type: 'region' })

// Skupine u tablicama Uredbe poredane su po donjoj granici; vrijedi zadnja koju je iznos prešao.
const bracket = (rows, value) => rows.findLast(([from]) => value >= from)

/** Udio preostale vrijednosti iz Tablice 1 Pravilnika, po punim mjesecima od prve registracije. */
export const remainingShare = (rows, months) => (rows.find(([upTo]) => months < upTo) ?? rows.at(-1))[1] / 100

/** PPMV za rabljeno vozilo: porez kao za novo na dan prve registracije × preostala vrijednost. */
export function ppmvAmount(tables, { newPrice, co2, share, wltp }) {
  const set = wltp ? 'wltp' : 'nedc'
  const [from, base, rate] = bracket(tables.value[set], newPrice)
  const band = bracket(tables.co2[set], co2)
  const valuePart = base + ((newPrice - from) * rate) / 100
  const co2Part = band ? band[1] + (co2 - band[0]) * band[2] : 0
  return (valuePart + co2Part) * share
}

// Oglas zna samo godište; prva registracija se uzima sredinom te godine.
function monthsSince(year, now) {
  return Math.max(0, (now.getFullYear() - year) * 12 + now.getMonth() - 6)
}

function powerKw(title) {
  const kw = title.match(/(\d{2,3})\s?kw\b/i)
  if (kw) return Number(kw[1])
  const hp = title.match(/(\d{2,3})\s?(ps|ks|hp)\b/i)
  return hp ? Math.round(Number(hp[1]) * 0.7355) : null
}

/**
 * Procjena svega što košta auto dovesti u Zadar i registrirati. Pretpostavke (CO₂, snaga,
 * karta) idu uz stavku kao napomena, da se vidi što je izračunato, a što procijenjeno.
 */
export function landedCost(listing, costs, now = new Date()) {
  if (!costs || listing.price == null || listing.year == null) return null
  const abroad = Boolean(listing.country) && listing.country !== 'HR'
  const fuel = /hibrid|hybrid/i.test(listing.fuel ?? '') ? 'hibrid' : 'benzin'
  const items = []

  if (abroad) {
    const wltp = listing.year >= costs.ppmv.wltpFrom
    const share = remainingShare(costs.ppmv.remaining, monthsSince(listing.year, now))
    const co2 = costs.ppmv.co2Assumed[wltp ? 'wltp' : 'nedc'][fuel]
    // Osnovica je cijena novog vozila u HR; procjenjuje se unatrag iz cijene oglasa.
    const newPrice = listing.price / share
    items.push({
      label: 'PPMV',
      amount: ppmvAmount(costs.ppmv, { newPrice, co2, share, wltp }),
      note: `uz CO₂ ${co2} g/km ${wltp ? 'WLTP' : 'NEDC'} (provjeri u COC-u) i ${percent.format(share)} preostale vrijednosti`,
    })
    for (const [label, amount] of costs.registration) items.push({ label, amount })
    const plates = costs.trip.exportPlates[listing.country]
    if (plates) items.push({ label: 'izvozne tablice i osiguranje', amount: plates })
  }

  // Pravna osoba s PDV-om ili maržom ne naplaćuje pristojbu; privatni prodavač da.
  if (listing.sellerType !== 'salon') {
    const age = now.getFullYear() - listing.year
    const rate = costs.fee.eurPerKw.find(([maxAge]) => age <= maxAge)?.[1] ?? 0
    const kw = powerKw(listing.title)
    const notes = [kw ? `${kw} kW` : `uz ${costs.fee.assumedKw} kW (pretpostavka)`]
    if (!listing.sellerType) notes.push('ne plaća se ako je prodavač salon')
    items.push({ label: 'upravna pristojba', amount: rate * (kw ?? costs.fee.assumedKw), note: notes.join(', ') })
  }

  const km = listing.distanceKm
  if (km != null && km > costs.trip.localKm) {
    items.push({
      label: 'karta do auta',
      amount: costs.trip.ticket[abroad ? 'abroad' : 'HR'],
      note: 'pretpostavka, stvarnu cijenu pokazuju linkovi',
    })
    items.push({
      label: `gorivo natrag, ~${km} km`,
      amount: (km * costs.fuel.litresPer100km[fuel] * costs.fuel.eurPerLitre) / 100,
      note: `${decimal.format(costs.fuel.litresPer100km[fuel])} l/100 km po ${decimal.format(costs.fuel.eurPerLitre)} €/l`,
    })
    const tolls = abroad ? (costs.trip.tolls[listing.country] ?? []) : [['cestarine', km * costs.trip.hrTollPerKm]]
    for (const [label, amount] of tolls) items.push({ label, amount })
  }

  const rounded = items.map((item) => ({ ...item, amount: Math.round(item.amount) }))
  const extra = rounded.reduce((total, item) => total + item.amount, 0)
  return { items: rounded, extra, total: listing.price + extra, tripKnown: km != null }
}

const enc = encodeURIComponent

/** Kako doći po auto iz Zadra: linkovi na pretrage koje znaju stvarne vozne redove i cijene. */
export function travelLinks(listing, costs) {
  if (!listing.location || !costs) return []
  const country = listing.country ? countryEn.of(listing.country) : null
  // AutoScout24 piše "Eisenach, DE"; država se dodaje punim imenom, pa oznaka otpada.
  const town = listing.location.replace(/,\s*[A-Z]{2}$/, '')
  // Poštanski broj ("99087 Erfurt") smeta pretragama prijevoza, ali ne i karti.
  const place = [town.replace(/\d+/g, '').trim(), country].filter(Boolean).join(', ')
  const home = costs.home.name
  const links = [{ label: 'svi prijevozi', href: `https://www.rome2rio.com/s/${enc(home)}/${enc(place)}` }]
  if (listing.country && listing.country !== 'HR') {
    links.push({
      label: 'letovi iz Zadra',
      href: `https://www.google.com/travel/flights?q=${enc(`one way flights from ${home} to ${place}`)}`,
    })
  }
  links.push({
    label: 'ruta natrag',
    href: `https://www.google.com/maps/dir/?api=1&origin=${enc([town, country].filter(Boolean).join(', '))}&destination=${enc(home)}&travelmode=driving`,
  })
  return links
}
