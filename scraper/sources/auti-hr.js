import { getHtml } from '../http.js'

export const id = 'auti-hr'
export const label = 'Auti.hr'
export const coverage = ['HR']

const BASE = 'https://www.auti.hr'
const SEARCH = `${BASE}/trazi/kategorija/automobili`

// Njihova tražilica prima POST, ali odgovara preusmjeravanjem na čitljiv URL sastavljen od
// slugova — pa se taj URL može složiti odmah i dohvatiti običnim GET-om.
const MAKE_SLUGS = { volkswagen: 'vw' }
const FUEL_SLUGS = { benzin: 'benzin', dizel: 'diesel', diesel: 'diesel', hibrid: 'hibrid' }

const CARD_MARK = 'class="listing-list-loop'

const normalize = (value) =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

// U naslovima stoji "VW T Cross", u configu "Volkswagen T-Roc" — crtice i razmaci se
// izjednačuju, a marka se uspoređuje i po skraćenom nazivu.
const loose = (value) => normalize(value).replace(/[-\s]+/g, ' ')

const MAKE_ALIASES = { volkswagen: ['vw'], 'mercedes-benz': ['mercedes'] }

function makeNames(make) {
  const key = normalize(make)
  return [key, ...(MAKE_ALIASES[key] ?? [])]
}

const digits = (text) => {
  const only = (text ?? '').replace(/[^0-9]/g, '')
  return only ? Number(only) : null
}

function searchUrl(config, make) {
  const fuel = FUEL_SLUGS[normalize(config.criteria.fuelAllow[0])]
  if (!fuel) throw new Error(`Auti.hr ne podržava gorivo "${config.criteria.fuelAllow[0]}"`)

  const parts = [`marka/${MAKE_SLUGS[normalize(make)] ?? normalize(make)}`, `vrsta-goriva/${fuel}`]
  parts.push(`godina-proizvodnje/${config.criteria.yearMin}-${new Date().getFullYear() + 1}`)
  if (config.criteria.priceMax != null) parts.push(`cijena/0-${config.criteria.priceMax}-EUR`)
  if (config.criteria.mileageMax != null) parts.push(`kilometraza/0-${config.criteria.mileageMax}`)
  return `${SEARCH}/${parts.join('/')}/`
}

const between = (text, after, before) => {
  const start = text.indexOf(after)
  if (start < 0) return null
  const from = start + after.length
  const end = text.indexOf(before, from)
  return end < 0 ? null : text.slice(from, end).trim()
}

/** Kartica nosi parove naziv/vrijednost (godište, gorivo, km, datum objave). */
function metaPairs(card) {
  const pairs = new Map()
  const matches = card.matchAll(
    /<div class="name">([^<]{2,30})<\/div>(?:<\/div>)*<div class="value">([^<]{0,40})</g,
  )
  for (const match of matches) pairs.set(normalize(match[1]), match[2].trim())
  return pairs
}

function parseCards(html) {
  const cards = html.split(CARD_MARK).slice(1)
  const seen = new Map()

  for (const card of cards) {
    const link = card.match(/href="(https:\/\/www\.auti\.hr\/[a-z0-9-]+\/(\d{4,9}))"/i)
    if (!link) continue

    const meta = metaPairs(card)
    const posted = meta.get('objavljen')
    const [day, month, year] = (posted ?? '').split('.')

    seen.set(link[2], {
      externalId: link[2],
      url: link[1],
      // Naslov u kartici je skraćen s tri točke; alt slike nosi cijeli.
      title: between(card, 'alt="', '"') ?? '',
      image: between(card, '<img src="', '"'),
      price: digits(between(card, 'class="regular-price">', '<')),
      year: digits(meta.get('godiste vozila')),
      fuel: meta.get('vrsta goriva') ?? null,
      mileage: digits(meta.get('km')),
      postedAt: year ? new Date(`${year}-${month}-${day}`).toISOString() : null,
    })
  }
  return [...seen.values()]
}

/** Popis ne nosi lokaciju; na stranici oglasa stoji županija. */
async function loadCounty(url) {
  try {
    const county = between(await getHtml(url, { referer: SEARCH }), 'Županija:', '<')
    return county || null
  } catch {
    return null
  }
}

// Naslov ne počinje uvijek markom ("Prodajem Nissan Qashqai…"), pa se traži bilo gdje u tekstu.
const wantedModel = (config, title) => {
  const text = loose(title)
  return config.models.find((entry) =>
    makeNames(entry.make).some((name) => text.includes(loose(`${name} ${entry.model}`))),
  )
}

export async function fetchListings(config, { isSeen = () => false } = {}) {
  const makes = [...new Set(config.models.map((entry) => entry.make))]
  const listings = []
  const prices = []
  let matched = 0
  let known = 0

  for (const make of makes) {
    const url = searchUrl(config, make)
    // Nepoznat slug marke njihova tražilica tiho ignorira i vrati sve marke, pa se svaki
    // oglas mora potvrditi po marki i modelu — ne vjeruje se da je odgovor već filtriran.
    for (const card of parseCards(await getHtml(url, { referer: BASE }))) {
      const model = wantedModel(config, card.title)
      if (!model) continue
      matched += 1

      if (isSeen(card.externalId)) {
        known += 1
        prices.push({ externalId: card.externalId, price: card.price })
        continue
      }

      listings.push({
        sourceId: id,
        externalId: card.externalId,
        url: card.url,
        title: card.title,
        make: model.make,
        model: model.model,
        sellerType: null,
        sellerName: null,
        bodyType: null,
        country: 'HR',
        description: null,
        price: card.price,
        year: card.year,
        mileage: card.mileage,
        fuel: card.fuel,
        location: await loadCounty(card.url),
        imageUrl: card.image,
        gallery: card.image ? [card.image] : [],
        postedAt: card.postedAt,
      })
    }
  }

  return { listings, prices, matched, known }
}
