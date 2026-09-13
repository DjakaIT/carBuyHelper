import { getHtml } from '../http.js'

export const id = 'autokatalog'
export const label = 'AutoKatalog'

const BASE = 'https://www.autokatalog.hr'

export const coverage = ['HR']

// Agregator ponude registriranih hrvatskih autokuća — nema privatnih oglašivača, pa je
// sve odavde "salon". Oglas vodi na stranicu same autokuće.
const RSC_MARK = 'self.__next_f.push([1,'
const VEHICLES_KEY = '"initialVehicles":'

const normalize = (value) =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

const slug = (value) => normalize(value).replace(/\s+/g, '-')

/** Stranica je Next.js RSC stream: podaci stižu kao niz string-komada koje treba spojiti. */
function rscPayload(html) {
  let out = ''
  let at = html.indexOf(RSC_MARK)
  while (at >= 0) {
    const start = html.indexOf('"', at)
    const end = html.indexOf('])', start)
    if (start < 0 || end < 0) break
    try {
      out += JSON.parse(html.slice(start, html.lastIndexOf('"', end) + 1))
    } catch {
      // komad koji nije valjan string literal preskačemo — ostatak je i dalje upotrebljiv
    }
    at = html.indexOf(RSC_MARK, end)
  }
  return out
}

function vehiclesFrom(html, url) {
  const payload = rscPayload(html)
  const start = payload.indexOf(VEHICLES_KEY)
  if (start < 0) throw new Error(`AutoKatalog: stranica bez podataka (${url})`)

  let depth = 0
  for (let i = start + VEHICLES_KEY.length; i < payload.length; i += 1) {
    if (payload[i] === '[') depth += 1
    else if (payload[i] === ']') {
      depth -= 1
      if (depth === 0) return JSON.parse(payload.slice(start + VEHICLES_KEY.length, i + 1))
    }
  }
  throw new Error(`AutoKatalog: nepotpun popis vozila (${url})`)
}

const dealerFrom = (externalUrl) => {
  if (!externalUrl) return null
  try {
    return new URL(externalUrl).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function toListing(vehicle) {
  const price = Number(vehicle.price)

  return {
    sourceId: id,
    externalId: String(vehicle.id),
    url: vehicle.externalUrl ?? `${BASE}/automobil/${vehicle.id}`,
    title: vehicle.title || [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' '),
    make: vehicle.brand ?? null,
    model: vehicle.model ?? null,
    sellerType: 'salon',
    sellerName: dealerFrom(vehicle.externalUrl),
    bodyType: null,
    country: 'HR',
    description: null,
    price: Number.isFinite(price) ? Math.round(price) : null,
    year: vehicle.year ?? null,
    mileage: vehicle.mileage ?? null,
    fuel: vehicle.fuel ?? null,
    location: vehicle.location ?? null,
    imageUrl: vehicle.imageUrl ?? null,
    gallery: vehicle.imageUrl ? [vehicle.imageUrl] : [],
    postedAt: null,
  }
}

/** Njihovi filteri rade tek u pregledniku (URL parametri se ignoriraju), pa se prosijava ovdje. */
function matches(vehicle, config) {
  const fuels = config.criteria.fuelAllow.map(normalize)
  if (!fuels.includes(normalize(vehicle.fuel))) return false
  if (vehicle.year != null && vehicle.year < config.criteria.yearMin) return false
  if (config.criteria.priceMax != null && Number(vehicle.price) > config.criteria.priceMax) {
    return false
  }
  if (config.criteria.mileageMax != null && (vehicle.mileage ?? 0) > config.criteria.mileageMax) {
    return false
  }
  return true
}

export async function fetchListings(config, { isSeen = () => false } = {}) {
  const listings = []
  const prices = []
  let matched = 0
  let known = 0

  for (const { make, model } of config.models) {
    const url = `${BASE}/${slug(make)}/${slug(model)}`
    const vehicles = vehiclesFrom(await getHtml(url, { referer: BASE }), url).filter((vehicle) =>
      matches(vehicle, config),
    )
    matched += vehicles.length

    for (const vehicle of vehicles) {
      const externalId = String(vehicle.id)
      if (isSeen(externalId)) {
        known += 1
        prices.push({ externalId, price: Math.round(Number(vehicle.price)) || null })
      } else {
        listings.push(toListing(vehicle))
      }
    }
  }

  return { listings, prices, matched, known }
}
