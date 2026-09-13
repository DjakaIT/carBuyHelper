import { openBrowser } from '../browser.js'

export const id = 'facebook'
export const label = 'Facebook Marketplace'

const BASE = 'https://www.facebook.com'

// Marketplace ne radi bez prijave. Sesija stoji lokalno u pregledničkom profilu (vidi
// `npm run facebook:login`) i nikad ne izlazi iz ovog računala — zato ovaj izvor ne smije
// raditi u CI-u ni na tuđem serveru.
const DEFAULT_CITY = 'zagreb'
const DEFAULT_RADIUS_KM = 100

// Marketplace lista se dograđuje skrolanjem; ovo je "koliko duboko idemo" po modelu.
const SCROLLS = 3

const normalize = (value) =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

function searchUrl(config, settings, make, model) {
  const params = new URLSearchParams({
    query: `${make} ${model}`,
    minYear: String(config.criteria.yearMin),
    exact: 'false',
  })
  if (config.criteria.priceMax != null) {
    params.set('maxPrice', String(config.criteria.priceMax))
  }
  if (config.criteria.mileageMax != null) {
    params.set('maxMileage', String(config.criteria.mileageMax))
  }
  const city = settings.city ?? DEFAULT_CITY
  const radius = settings.radiusKm ?? DEFAULT_RADIUS_KM
  params.set('radius_in_km', String(radius))
  return `${BASE}/marketplace/${city}/search?${params}`
}

/**
 * Kartice Marketplacea nemaju stabilne CSS klase (generirane su i mijenjaju se), ali svaka
 * je omotana linkom na /marketplace/item/{id}. Zato se hvata link, a tekst kartice se čita
 * redom kojim ga Facebook slaže: cijena, naslov, lokacija, pa detalji vozila.
 */
const EXTRACT = `
(() => {
  const seen = new Map()
  for (const link of document.querySelectorAll('a[href*="/marketplace/item/"]')) {
    const match = link.getAttribute('href').match(/\\/marketplace\\/item\\/(\\d+)/)
    if (!match) continue
    const id = match[1]
    if (seen.has(id)) continue

    const lines = link.innerText.split('\\n').map((line) => line.trim()).filter(Boolean)
    const image = link.querySelector('img')
    seen.set(id, {
      id,
      url: 'https://www.facebook.com/marketplace/item/' + id,
      lines,
      image: image ? image.getAttribute('src') : null,
    })
  }
  return [...seen.values()]
})()
`

const LOGGED_OUT = `
(() => {
  const text = document.body.innerText.toLowerCase()
  return text.includes('prijavi se na facebook') || text.includes('log in to facebook') ||
    Boolean(document.querySelector('input[name="email"][type="text"], input[id="email"]'))
})()
`

const number = (text) => {
  const digits = (text ?? '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

/** Cijena je redak s valutom, godište četveroznamenkasti broj, kilometraža redak s "km". */
function parseCard(card, make, model) {
  const price = card.lines.find((line) => /€|eur|kn/i.test(line))
  const mileage = card.lines.find((line) => /\bkm\b/i.test(line) && !/€/.test(line))
  const title =
    card.lines.find((line) => normalize(line).includes(normalize(model))) ??
    card.lines.find((line) => line.length > 8 && !/€|\bkm\b/i.test(line)) ??
    `${make} ${model}`
  const year = title.match(/\b(19|20)\d{2}\b/)?.[0]
  const location = card.lines.at(-1)

  return {
    sourceId: id,
    externalId: card.id,
    url: card.url,
    title,
    make,
    model,
    // Marketplace je prvenstveno oglasnik privatnih prodavača; salon se ne može pouzdano
    // razlikovati iz kartice, pa se ne izmišlja.
    sellerType: null,
    sellerName: null,
    bodyType: null,
    description: null,
    price: number(price),
    year: year ? Number(year) : null,
    mileage: number(mileage),
    fuel: null,
    location: location && !/€|\bkm\b/i.test(location) ? location : null,
    imageUrl: card.image,
    gallery: card.image ? [card.image] : [],
    postedAt: null,
  }
}

function matches(listing, config) {
  if (listing.year != null && listing.year < config.criteria.yearMin) return false
  if (config.criteria.priceMax != null && (listing.price ?? 0) > config.criteria.priceMax) {
    return false
  }
  if (config.criteria.mileageMax != null && (listing.mileage ?? 0) > config.criteria.mileageMax) {
    return false
  }
  return true
}

export async function fetchListings(config, { isSeen = () => false, settings = {} } = {}) {
  if (process.env.CI) {
    throw new Error('Facebook se ne dohvaća u CI-u — sesija je vezana uz ovo računalo')
  }

  const browser = await openBrowser({ headless: true, port: 9223 })
  const listings = []
  const prices = []
  let matched = 0
  let known = 0

  try {
    for (const { make, model } of config.models) {
      await browser.goto(searchUrl(config, settings, make, model))

      if (await browser.evaluate(LOGGED_OUT)) {
        throw new Error('Nema prijavljene sesije — pokreni "npm run facebook:login" i prijavi se')
      }

      await browser.scroll(SCROLLS)
      const cards = await browser.evaluate(EXTRACT)

      for (const card of cards) {
        const listing = parseCard(card, make, model)
        if (!matches(listing, config)) continue
        matched += 1

        if (isSeen(listing.externalId)) {
          known += 1
          prices.push({ externalId: listing.externalId, price: listing.price })
        } else {
          listings.push(listing)
        }
      }
    }
  } finally {
    browser.close()
  }

  return { listings, prices, matched, known }
}
