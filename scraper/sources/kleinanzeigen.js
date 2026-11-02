import { getHtml } from '../http.js'

export const id = 'kleinanzeigen'
export const label = 'Kleinanzeigen'
export const coverage = ['DE']

const BASE = 'https://www.kleinanzeigen.de'
const CATEGORY = 'c216'
const DEFAULT_MAX_PAGES = 3

// Filteri stoje u putanji (`autos.fuel_s:benzin`), više vrijednosti u zagradi — tako ih
// slaže i njihova stranica. Svaki je provjeren usporedbom broja rezultata prije i poslije.
const FUEL_SLUGS = { benzin: 'benzin', hibrid: 'hybrid', dizel: 'diesel', diesel: 'diesel', elektricni: 'elektro' }
const BODY_SLUGS = { limuzina: 'limousine', suv: 'suv', karavan: 'kombi', coupe: 'coupe', kabriolet: 'cabrio' }
// Njihov popis modela nema "Corolla Sedan", samo "Corolla"; karoseriju ionako drži typ_s.
const MODEL_SLUGS = { 'corolla sedan': 'corolla' }

// "PKW Ankauf" su otkupljivači koji oglas namjeste pod tuđe filtere.
const NOT_FOR_SALE = /ankauf|suche/i

const normalize = (value) =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const slug = (value) => normalize(value).replace(/[^a-z0-9]+/g, '_')
const loose = (value) => normalize(value).replace(/[-\s]+/g, ' ')
const group = (values) => (values.length === 1 ? values[0] : `(${[...values].sort().join('%2C')})`)

const digits = (text) => {
  const only = (text ?? '').replace(/[^0-9]/g, '')
  return only ? Number(only) : null
}

function mapAll(names, table, what) {
  return names.map((name) => {
    const value = table[normalize(name)]
    if (!value) throw new Error(`Kleinanzeigen ne podržava ${what} "${name}"`)
    return value
  })
}

function searchUrl(config, settings, make, models, page) {
  const { criteria } = config
  const attrs = [
    `autos.ez_i:${criteria.yearMin}%2C`,
    `autos.fuel_s:${group(mapAll(criteria.fuelAllow, FUEL_SLUGS, 'gorivo'))}`,
    criteria.mileageMax != null && `autos.km_i:%2C${criteria.mileageMax}`,
    `autos.marke_s:${slug(make)}`,
    `autos.model_s:${group(models.map((entry) => MODEL_SLUGS[normalize(entry.model)] ?? slug(entry.model)))}`,
    // Zapreminu ne filtriraju; snaga je zamjena (vidi DECISIONS.md).
    settings.minPowerPs != null && `autos.power_i:${settings.minPowerPs}%2C`,
    criteria.bodyTypes?.length && `autos.typ_s:${group(mapAll(criteria.bodyTypes, BODY_SLUGS, 'karoseriju'))}`,
  ]
  const path = [
    `/s-autos/${slug(make)}`,
    criteria.priceMax != null && `preis::${criteria.priceMax}`,
    page > 1 && `seite:${page}`,
    `${CATEGORY}+${attrs.filter(Boolean).join('+')}`,
  ]
  return BASE + path.filter(Boolean).join('/')
}

const decode = (text) =>
  (text ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()

function postedAt(text) {
  const day = new Date()
  if (/gestern/i.test(text)) day.setDate(day.getDate() - 1)
  else if (!/heute/i.test(text)) {
    const match = (text ?? '').match(/(\d{2})\.(\d{2})\.(\d{4})/)
    if (!match) return null
    return new Date(`${match[3]}-${match[2]}-${match[1]}`).toISOString()
  }
  return new Date(day.toDateString()).toISOString()
}

function parseCards(html) {
  const cards = new Map()
  // Ista kartica se na stranici iscrta dvaput, pa se skuplja po ID-u.
  for (const chunk of html.split('<article ').slice(1)) {
    const card = chunk.slice(0, chunk.indexOf('</article>'))
    const head = card.match(/data-adid="(\d+)" data-href="([^"]+)"/)
    if (!head || cards.has(head[1])) continue

    const spans = [...card.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((match) => match[1].trim())
    const tags = [...card.matchAll(/<span[^>]*data-dhl-promotion[^>]*>([^<]+)</g)].map((match) => match[1].trim())
    const shop = card.match(/href="\/pro\/[^"]*" title="Zum shop ([^"]+)"/)
    const image = card.match(/<img[^>]+src="([^"]+)"/)?.[1]

    cards.set(head[1], {
      externalId: head[1],
      url: BASE + head[2],
      title: decode(card.match(/<h3[^>]*>\s*<a[^>]*>([^<]+)<\/a>/)?.[1]),
      excerpt: decode(card.match(/<\/h3>\s*<p[^>]*>([^<]*)<\/p>/)?.[1]) || null,
      // Samo odlomak koji je cijela cijena — opis zna sadržavati iznose ("5.000 € u servis").
      price: digits(card.match(/<p[^>]*>\s*([\d.]+) €(?: VB)?\s*<\/p>/)?.[1]),
      mileage: digits(tags.find((tag) => tag.endsWith(' km'))),
      year: digits(tags.find((tag) => tag.startsWith('EZ'))?.slice(-4)),
      location: spans[0] ?? null,
      postedAt: postedAt(spans[1]),
      sellerName: shop ? decode(shop[1]) : null,
      // Kartica razlikuje samo trgovca s "PRO" trgovinom; ostali mogu biti i saloni.
      sellerType: shop ? 'salon' : null,
      image: image ? image.replace(/rule=\$_\d+\.AUTO/, 'rule=$_35.AUTO') : null,
    })
  }
  return [...cards.values()]
}

// Kartica ne kaže model, a upit pokriva sve tražene modele marke odjednom.
function modelFor(models, title) {
  if (models.length === 1) return models[0]
  const text = loose(title)
  return models.find((entry) => text.includes(loose(entry.model))) ?? { make: models[0].make, model: null }
}

export async function fetchListings(config, { isSeen = () => false, settings = {} } = {}) {
  const maxPages = settings.maxPagesPerMake ?? DEFAULT_MAX_PAGES
  const makes = Map.groupBy(config.models, (entry) => entry.make)
  const listings = []
  const prices = []
  let matched = 0
  let known = 0

  for (const [make, models] of makes) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = searchUrl(config, settings, make, models, page)
      const html = await getHtml(url, { referer: BASE, minDelayMs: 2500 })

      for (const card of parseCards(html)) {
        if (NOT_FOR_SALE.test(card.title)) continue
        matched += 1
        if (isSeen(card.externalId)) {
          known += 1
          prices.push({ externalId: card.externalId, price: card.price })
          continue
        }
        const model = modelFor(models, card.title)
        listings.push({
          sourceId: id,
          externalId: card.externalId,
          url: card.url,
          title: card.title,
          make: model.make,
          model: model.model,
          sellerType: card.sellerType,
          sellerName: card.sellerName,
          bodyType: null,
          country: 'DE',
          description: card.excerpt,
          price: card.price,
          year: card.year,
          mileage: card.mileage,
          // Upit traži benzin ili hibrid, a kartica ne kaže koji.
          fuel: /hybrid|hibrid/i.test(card.title) ? 'Hibridni' : null,
          location: card.location,
          imageUrl: card.image,
          gallery: card.image ? [card.image] : [],
          postedAt: card.postedAt,
        })
      }

      if (!html.includes(`seite:${page + 1}/`)) break
    }
  }

  return { listings, prices, matched, known }
}
