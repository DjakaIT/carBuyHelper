import { getHtml } from '../http.js'

export const id = 'njuskalo'
export const label = 'Njuškalo'

const BASE = 'https://www.njuskalo.hr'

export const coverage = ['HR']
const CARS_PATH = '/auti'

// Njuškalo stoji iza bot-zaštite koja prati ponašanje, ne samo zaglavlja. Zato: velik razmak
// između zahtjeva, jedan upit za sve modele odjednom i prekid čim se pojavi CAPTCHA stranica
// (vidi DECISIONS.md). Bolje prazan dan nego uporno lupanje na vrata.
const MIN_DELAY_MS = 6000
const MAX_PAGES = 8

const FUEL_IDS = { benzin: 600, diesel: 602, dizel: 602, hibrid: 604, elektricni: 606, struja: 606 }
const FUEL_LABELS = { 600: 'Benzin', 602: 'Diesel', 604: 'Hibridni', 606: 'Električni' }

const BODY_IDS = { limuzina: 21, karavan: 22, monovolumen: 23, coupe: 24, kabriolet: 25, suv: 380, kombibus: 630, hatchback: 631 }

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

const slug = (value) => normalize(value).replace(/\s+/g, '-')

export class BlockedError extends Error {
  constructor() {
    super('Njuškalo je vratilo CAPTCHA stranicu — dohvat se preskače do sljedećeg pokretanja')
    this.name = 'BlockedError'
  }
}

/** Stranica nosi cijelo stanje u window.__INITIAL_STATE__; CAPTCHA stranica ga nema. */
async function loadState(url, referer) {
  const html = await getHtml(url, { referer, minDelayMs: MIN_DELAY_MS })
  const key = 'window.__INITIAL_STATE__='
  const start = html.indexOf(key)
  if (start < 0) throw new BlockedError()

  const end = html.indexOf('</script>', start)
  return JSON.parse(html.slice(start + key.length, end).trim().replace(/;$/, ''))
}

const pageData = (state) => state.browseListingsStore?.pageData ?? {}

/**
 * Stranica marke nosi popis svih njezinih modela s ID-jevima ("13688:12400"). Izvedenice su
 * zasebni modeli ("A5 Sportback", "A5 Avant"), pa se uzima cijela obitelj traženog modela.
 */
async function loadVehicleIds(models) {
  const byMake = new Map()
  for (const { make, model } of models) {
    if (!byMake.has(make)) byMake.set(make, [])
    byMake.get(make).push(model)
  }

  const ids = []
  for (const [make, wanted] of byMake) {
    const url = `${BASE}${CARS_PATH}/${slug(make)}`
    const categories = (pageData(await loadState(url, BASE + CARS_PATH)).categories ?? []).flat(9)
    if (categories.length === 0) throw new Error(`Njuškalo: nema popisa modela za "${make}"`)

    for (const model of wanted) {
      const prefix = normalize(`${make} ${model}`)
      const family = categories.filter((category) => {
        const title = normalize(category.title)
        return title === prefix || title.startsWith(`${prefix} `)
      })
      if (family.length === 0) throw new Error(`Njuškalo ne poznaje model "${make} ${model}"`)
      ids.push(...family.map((category) => category.id.split(':').pop()))
    }
  }
  return ids
}

function buildSearchUrl(config, vehicleIds, page) {
  const params = new URLSearchParams({ sort: 'new', page: String(page) })
  params.set('yearManufactured[min]', String(config.criteria.yearMin))
  if (config.criteria.priceMax != null) {
    params.set('price[max]', String(config.criteria.priceMax))
  }
  if (config.criteria.mileageMax != null) {
    params.set('mileage[max]', String(config.criteria.mileageMax))
  }
  for (const name of config.criteria.fuelAllow) {
    const fuelId = FUEL_IDS[normalize(name)]
    if (!fuelId) throw new Error(`Njuškalo ne podržava gorivo "${name}"`)
    params.append('fuelTypeId', String(fuelId))
  }
  for (const name of config.criteria.bodyTypes ?? []) {
    const bodyId = BODY_IDS[normalize(name)]
    if (bodyId === undefined) throw new Error(`Njuškalo ne podržava karoseriju "${name}"`)
    params.append('bodyTypeId', String(bodyId))
  }
  for (const vehicleId of vehicleIds) params.append('vehicleIds', vehicleId)
  return `${BASE}${CARS_PATH}?${params}`
}

const numberFrom = (text) => {
  const digits = (text ?? '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

function toListing(ad, fuel) {
  const highlights = ad.highlights ?? {}
  const place = ad.abstracts?.find((item) => item.caption === 'Lokacija vozila')?.value

  return {
    sourceId: id,
    externalId: String(ad.id),
    url: `${BASE}${CARS_PATH}/${ad.titleSlug}-oglas-${ad.id}`,
    title: ad.title,
    sellerType: ad.isOwnerResidentialSeller ? 'privatno' : 'salon',
    sellerName: ad.owner?.profileName ?? ad.owner?.userName ?? null,
    bodyType: highlights.bodyType ?? null,
    country: 'HR',
    make: highlights.manufacturer ?? null,
    model: highlights.model ?? null,
    // Opis stoji samo na stranici oglasa, a to je jedan zahtjev po oglasu — previše za izvor
    // koji blokira; kartica ionako vodi na oglas.
    description: null,
    price: numberFrom(ad.priceFormatted),
    year: numberFrom(highlights.yearManufactured),
    mileage: numberFrom(highlights.mileage),
    fuel,
    location: place ?? ad.location ?? null,
    imageUrl: ad.image ?? null,
    gallery: ad.image ? [ad.image] : [],
    postedAt: ad.createdAt ?? null,
  }
}

export async function fetchListings(config, { isSeen = () => false } = {}) {
  const vehicleIds = await loadVehicleIds(config.models)
  const fuel = FUEL_LABELS[FUEL_IDS[normalize(config.criteria.fuelAllow[0])]] ?? null

  const listings = []
  const prices = []
  let matched = 0
  let known = 0

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = buildSearchUrl(config, vehicleIds, page)
    const data = pageData(await loadState(url, `${BASE}${CARS_PATH}`))
    const ads = [...(data.promotedListings ?? []), ...(data.regularListings ?? [])]
    if (ads.length === 0) break

    if (page === 1) matched = data.listingsCount ?? 0

    for (const ad of ads) {
      const externalId = String(ad.id)
      if (isSeen(externalId)) {
        known += 1
        prices.push({ externalId, price: numberFrom(ad.priceFormatted) })
      } else {
        listings.push(toListing(ad, fuel))
      }
    }

    if (page >= (data.totalPageCount ?? 1)) break
  }

  return { listings, prices, matched, known }
}
