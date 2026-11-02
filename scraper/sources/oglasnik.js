import { getHtml } from '../http.js'

export const id = 'oglasnik'
export const label = 'Plavi oglasnik'
export const coverage = ['HR']

const BASE = 'https://oglasnik.hr'
const LIST = `${BASE}/prodaja-automobila`
const DEFAULT_MAX_PAGES = 4

// Filteri njihove tražilice se ne vide u URL-u (forma ih šalje iz preglednika), pa se
// prolaze najnovije stranice i prosijava ovdje. Lista je sortirana po objavi, 100 po stranici.
const FUEL_VALUES = { benzin: ['benzin'], hibrid: ['hybrid', 'hibrid'], dizel: ['dizel'], diesel: ['dizel'] }
const MAKE_ALIASES = { volkswagen: ['vw'], 'mercedes-benz': ['mercedes'] }

const normalize = (value) =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const loose = (value) => normalize(value).replace(/[-\s]+/g, ' ')

/** Stranica je Next.js; podaci o oglasima stoje u RSC payloadu, razlomljeni u komade. */
function payload(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)]
    .map((match) => JSON.parse(`"${match[1]}"`))
    .join('')
}

function objectAt(text, start) {
  let depth = 0
  for (let end = start; end < text.length; end += 1) {
    if (text[end] === '{') depth += 1
    else if (text[end] === '}' && --depth === 0) return JSON.parse(text.slice(start, end + 1))
  }
  return null
}

function parseAds(html) {
  const text = payload(html)
  // Link (slug iz naslova) stoji u iscrtanom HTML-u, ne u payloadu.
  const links = new Map(
    [...html.matchAll(/href="(\/prodaja-automobila\/[a-z0-9-]+-oglas-(\d+))"/g)].map((match) => [match[2], match[1]]),
  )
  const ads = new Map()
  for (const match of text.matchAll(/\{"id":(\d+),"title":/g)) {
    if (ads.has(match[1]) || !links.has(match[1])) continue
    const ad = objectAt(text, match.index)
    if (ad?.details) ads.set(match[1], { ...ad, path: links.get(match[1]) })
  }
  return [...ads.values()]
}

function params(ad) {
  const values = {}
  for (const param of ad.details.flatMap((group) => group.params ?? [])) {
    // Marka i model dijele isti slug; razlikuje ih naziv polja.
    const key = param.slug === 'vehicle_make_model' ? param.name : param.slug
    values[key] = param.value
  }
  return values
}

function modelFor(config, make, model) {
  const wantedMake = normalize(make)
  const wantedModel = loose(model)
  return config.models.find((entry) => {
    const names = [normalize(entry.make), ...(MAKE_ALIASES[normalize(entry.make)] ?? [])]
    if (!names.includes(wantedMake)) return false
    // "Corolla" kod njih je "Corolla Sedan" u configu; karoserija se provjerava zasebno.
    const name = loose(entry.model)
    return name === wantedModel || name.startsWith(`${wantedModel} `) || wantedModel.startsWith(`${name} `)
  })
}

function matches(config, values, price) {
  const { criteria } = config
  const fuels = criteria.fuelAllow.flatMap((name) => FUEL_VALUES[normalize(name)] ?? [normalize(name)])
  if (!fuels.includes(normalize(values.vehicle_fuel_type))) return false
  if (Number(values.vehicle_production_year) < criteria.yearMin) return false
  if (criteria.mileageMax != null && Number(values.vehicle_mileage) > criteria.mileageMax) return false
  if (criteria.priceMax != null && price > criteria.priceMax) return false
  // Kod njih piše "terenac/suv"; oglas bez karoserije ostaje.
  const body = normalize(values.vehicle_body_type)
  return !body || !criteria.bodyTypes?.length || criteria.bodyTypes.some((name) => body.includes(normalize(name)))
}

const stripTags = (html) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

function postedAt(text) {
  const match = (text ?? '').match(/(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2})/)
  return match ? new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}`).toISOString() : null
}

function toListing(ad, model, values) {
  const images = (ad.media ?? []).map((image) => image.gallery ?? image.listing).filter(Boolean)
  const description = typeof ad.description === 'string' && !ad.description.startsWith('$') ? stripTags(ad.description) : ''
  const private_ = ad.user?.type === 'privatni korisnik'

  return {
    sourceId: id,
    externalId: String(ad.id),
    url: BASE + ad.path,
    title: ad.title,
    make: model.make,
    model: model.model,
    sellerType: private_ ? 'privatno' : 'salon',
    sellerName: private_ ? null : (ad.user?.shop_title ?? ad.user?.name ?? null),
    bodyType: values.vehicle_body_type ?? null,
    country: 'HR',
    description: description || null,
    price: ad.price?.value ?? null,
    year: Number(values.vehicle_production_year) || null,
    mileage: Number(values.vehicle_mileage) || null,
    fuel: values.vehicle_fuel_type ?? null,
    // Prvi element je država, zadnji najuže mjesto.
    location: ad.location?.length > 1 ? ad.location.at(-1).name : null,
    imageUrl: ad.media?.[0]?.listing ?? images[0] ?? null,
    gallery: images,
    postedAt: postedAt(ad.publish),
    engineCcm: Number(values.vehicle_engine_capacity) || null,
  }
}

export async function fetchListings(config, { isSeen = () => false, settings = {} } = {}) {
  const maxPages = settings.maxPages ?? DEFAULT_MAX_PAGES
  const listings = []
  const prices = []
  let matched = 0
  let known = 0

  for (let page = 1; page <= maxPages; page += 1) {
    const ads = parseAds(await getHtml(page > 1 ? `${LIST}?page=${page}` : LIST, { referer: BASE }))
    if (ads.length === 0) break

    for (const ad of ads) {
      const values = params(ad)
      const model = modelFor(config, values['Proizvođač'], values.Model)
      if (!model || !matches(config, values, ad.price?.value)) continue
      matched += 1

      const externalId = String(ad.id)
      if (isSeen(externalId)) {
        known += 1
        prices.push({ externalId, price: ad.price?.value ?? null })
        continue
      }
      listings.push(toListing(ad, model, values))
    }
  }

  return { listings, prices, matched, known }
}
