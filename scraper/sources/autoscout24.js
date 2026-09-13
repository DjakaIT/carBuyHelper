import { getHtml } from '../http.js'

export const id = 'autoscout24'
export const label = 'AutoScout24'

const BASE = 'https://www.autoscout24.com'

// AutoScout24 pokriva zapadnu Europu (D, A, B, E, F, I, L, NL) — za nas je to uvozno tržište.
const DEFAULT_COUNTRIES = ['D', 'A']

// Rezultata je previše da bi se prolazili do kraja (npr. 11.000 T-Rocova); posao je
// pokupiti nove oglase, a oni su pri sortiranju po starosti oglasa na prvim stranicama.
const DEFAULT_MAX_PAGES = 2

const BODY_CODES = { limuzina: 6, suv: 4, coupe: 3, hatchback: 1, karavan: 5, kabriolet: 2, monovolumen: 7 }

const FUEL_CODES = { benzin: 'B', dizel: 'D', diesel: 'D', elektricni: 'E', struja: 'E' }
const FUEL_LABELS = {
  Gasoline: 'Benzin',
  Diesel: 'Diesel',
  Electric: 'Električni',
  'Electric/Gasoline': 'Hibridni',
  'Electric/Diesel': 'Hibridni',
}

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

const slug = (value) => normalize(value).replace(/\s+/g, '-')

function parseNextData(html, url) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) throw new Error(`AutoScout24: stranica bez podataka (${url})`)
  return JSON.parse(match[1])
}

function buildUrl(config, settings, make, model, page) {
  const params = new URLSearchParams({
    atype: 'C',
    fregfrom: String(config.criteria.yearMin),
    sort: 'age',
    desc: '1',
    cy: (settings.countries ?? DEFAULT_COUNTRIES).join(','),
    page: String(page),
  })
  if (config.criteria.priceMax != null) {
    params.set('priceto', String(config.criteria.priceMax))
  }
  if (config.criteria.mileageMax != null) {
    params.set('kmto', String(config.criteria.mileageMax))
  }
  for (const name of config.criteria.bodyTypes ?? []) {
    const code = BODY_CODES[normalize(name)]
    if (code === undefined) throw new Error(`AutoScout24 ne podržava karoseriju "${name}"`)
    params.append('body', String(code))
  }
  for (const name of config.criteria.fuelAllow) {
    const code = FUEL_CODES[normalize(name)]
    if (!code) throw new Error(`AutoScout24 ne podržava gorivo "${name}"`)
    params.append('fuel', code)
  }
  return `${BASE}/lst/${slug(make)}/${slug(model)}?${params}`
}

// Verzija oglasa cesto vec pocinje nazivom modela ("Octavia Combi 2.0 TSI") — bez ovoga
// naslov ispadne "Skoda Octavia Octavia Combi 2.0 TSI".
function title({ make, modelGroup, modelVersionInput, variant }) {
  const version = modelVersionInput || variant || ''
  const model = modelGroup ?? ''
  const rest = version.toLowerCase().startsWith(model.toLowerCase()) ? version.slice(model.length) : version
  return [make, model, rest.trim()].filter(Boolean).join(' ')
}

function toListing(ad) {
  const { vehicle, tracking, location } = ad
  const registration = tracking?.firstRegistration ?? ''
  const mileage = Number(tracking?.mileage)
  const images = ad.images ?? []

  return {
    sourceId: id,
    externalId: ad.id,
    url: `${BASE}${ad.url}`,
    title: title(vehicle),
    sellerType: ad.seller?.type === 'Dealer' ? 'salon' : ad.seller?.type === 'Private' ? 'privatno' : null,
    sellerName: ad.seller?.companyName ?? null,
    make: vehicle.make ?? null,
    model: vehicle.modelGroup ?? null,
    // Lista ne nosi opis oglasa, a detalj bi značio jedan zahtjev po oglasu (vidi DECISIONS.md).
    description: null,
    price: ad.price?.priceRaw ?? null,
    year: registration ? Number(registration.slice(-4)) : null,
    mileage: Number.isFinite(mileage) ? mileage : null,
    fuel: FUEL_LABELS[vehicle.fuel] ?? vehicle.fuel ?? null,
    location: [location?.city, location?.countryCode].filter(Boolean).join(', ') || null,
    imageUrl: images[0] ? bigger(images[0]) : null,
    gallery: images.map(bigger),
    postedAt: null,
  }
}

// Lista nudi sličice 250x188; isti CDN poslužuje i veće varijante iste slike.
const bigger = (url) => url.replace(/\/\d+x\d+\.webp$/, '/640x480.webp')

export async function fetchListings(config, { isSeen = () => false, settings = {} } = {}) {
  const maxPages = settings.maxPagesPerModel ?? DEFAULT_MAX_PAGES
  const listings = []
  const prices = []
  const sellers = []
  let matched = 0
  let known = 0

  for (const { make, model } of config.models) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = buildUrl(config, settings, make, model, page)
      const data = parseNextData(await getHtml(url, { referer: BASE }), url)
      const { listings: ads = [], numberOfResults = 0, numberOfPages = 0 } = data.props.pageProps

      if (page === 1) matched += numberOfResults

      for (const ad of ads) {
        if (isSeen(ad.id)) {
          known += 1
          prices.push({ externalId: ad.id, price: ad.price?.priceRaw ?? null })
          if (ad.seller?.companyName || ad.seller?.type) {
            sellers.push({
              externalId: ad.id,
              sellerType: ad.seller.type === 'Dealer' ? 'salon' : 'privatno',
              sellerName: ad.seller.companyName ?? null,
            })
          }
        } else {
          listings.push(toListing(ad))
        }
      }

      if (page >= numberOfPages) break
    }
  }

  return { listings, prices, sellers, matched, known }
}
