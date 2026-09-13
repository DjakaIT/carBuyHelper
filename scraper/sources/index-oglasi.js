import { getJson } from '../http.js'

export const id = 'index-oglasi'
export const label = 'Index oglasi'

const BASE = 'https://www.index.hr/oglasi'
const API = `${BASE}/api`
const CATEGORY_PATH = '/auto-moto/osobni-automobili'
const SEARCH_PAGE = BASE + CATEGORY_PATH

// Datoteka s markama/modelima automobila; Index ih poslužuje zajedno s motociklima i ostalim.
const CAR_MAKE_DATA_ID = '388b1099-36a4-427a-b4a4-9ed39e14da46'

// Šifre goriva iz search configa Indexa (advancedSearch.json, kontrola "fuelIds").
const FUEL_BY_ID = {
  1: 'Diesel',
  2: 'Benzin',
  3: 'Hibridni',
  4: 'Benzin + LPG',
  5: 'Električni',
  6: 'Plug-in hibrid',
}
const FUEL_ID_BY_NAME = {
  diesel: 1,
  dizel: 1,
  benzin: 2,
  hibridni: 3,
  hibrid: 3,
  'benzin + lpg': 4,
  lpg: 4,
  elektricni: 5,
  struja: 5,
  'plug-in hibrid': 6,
  'plug-in': 6,
}

const DATE_DESC = 4

// Karoserije iz njihovog search configa (kontrola "vehicleBodyTypes").
const BODY_IDS = { limuzina: 1, karavan: 2, coupe: 3, monovolumen: 4, suv: 5, kombibus: 6, hatchback: 7, kabriolet: 0 }
const BODY_LABELS = Object.fromEntries(Object.entries(BODY_IDS).map(([name, id]) => [id, name]))

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

const api = (path) => getJson(`${API}${path}`, { sessionUrl: SEARCH_PAGE, referer: SEARCH_PAGE })

async function loadModels(models) {
  const datasets = await api('/configuration/datasource/make')
  const makes = datasets.find((d) => d.dataId === CAR_MAKE_DATA_ID)?.source
  if (!makes) throw new Error('Index: datasource marki ne sadrži skup za automobile')

  // Oglas nosi samo ID-jeve marke i modela, pa se uz njih pamte i imena za prikaz.
  const names = new Map()
  for (const makeEntry of makes) {
    names.set(makeEntry.id, makeEntry.name)
    for (const modelEntry of makeEntry.children ?? []) names.set(modelEntry.id, modelEntry.name)
  }

  const ids = models.map(({ make, model }) => {
    const makeEntry = makes.find((m) => normalize(m.name) === normalize(make))
    if (!makeEntry) throw new Error(`Index ne poznaje marku "${make}"`)
    const modelEntry = (makeEntry.children ?? []).find(
      (m) => normalize(m.name) === normalize(model),
    )
    if (!modelEntry) throw new Error(`Index ne poznaje model "${make} ${model}"`)
    return modelEntry.id
  })

  return { ids, names }
}

async function loadPlaceNames() {
  const datasets = await api('/configuration/datasource/location')
  const names = new Map()
  const walk = (nodes) => {
    for (const node of nodes ?? []) {
      names.set(node.id, node.name)
      walk(node.children)
    }
  }
  for (const dataset of datasets) walk(dataset.source)
  return names
}

function buildSearchParams(config, modelIds) {
  const params = new URLSearchParams({
    category: 'car',
    module: 'vehicles',
    sortOption: String(DATE_DESC),
    makeYearFrom: `${config.criteria.yearMin}-01-01`,
  })
  if (config.criteria.mileageMax != null) {
    params.set('mileageTo', String(config.criteria.mileageMax))
  }
  for (const name of config.criteria.bodyTypes ?? []) {
    const bodyId = BODY_IDS[normalize(name)]
    if (bodyId === undefined) throw new Error(`Nepoznata karoserija u configu: "${name}"`)
    params.append('vehicleBodyTypes', String(bodyId))
  }
  for (const name of config.criteria.fuelAllow) {
    const fuelId = FUEL_ID_BY_NAME[normalize(name)]
    if (!fuelId) throw new Error(`Nepoznato gorivo u configu: "${name}"`)
    params.append('fuelIds', String(fuelId))
  }
  for (const modelId of modelIds) params.append('includeModelIds', modelId)
  return params
}

// Oglas bez odabrane lokacije nosi nule umjesto ID-a; dio oglašivača (često inozemni saloni)
// navede samo županiju ili državu, pa se ide redom od najužeg prema najširem.
const EMPTY_ID = '00000000-0000-0000-0000-000000000000'

function placeName(placeNames, ...ids) {
  for (const id of ids) {
    if (!id || id === EMPTY_ID) continue
    const name = placeNames.get(id)
    if (name) return name
  }
  return null
}

function toListing(ad, placeNames, names) {
  const images = ad.images ?? []
  const gallery = images.map((image) => `${API}/image/direct/${image}`)
  const place = placeName(placeNames, ad.cityId, ad.settlementId, ad.countyId, ad.countryId)

  return {
    sourceId: id,
    externalId: String(ad.code),
    url: `${BASE}${CATEGORY_PATH}/oglas/${ad.smartLink}/${ad.code}`,
    title: ad.title,
    sellerType: ad.legalEntity === 2 ? 'salon' : ad.legalEntity === 1 ? 'privatno' : null,
    sellerName: null,
    bodyType: BODY_LABELS[ad.vehicleBodyType] ?? null,
    make: names.get(ad.makeId) ?? null,
    model: names.get(ad.modelId) ?? null,
    description: ad.description ?? null,
    price: ad.price ?? null,
    year: ad.makeYear ? Number(ad.makeYear.slice(0, 4)) : null,
    mileage: ad.mileage ?? null,
    fuel: FUEL_BY_ID[ad.fuel] ?? null,
    location: place,
    imageUrl: gallery[0] ?? null,
    gallery,
    postedAt: ad.postedTime ?? null,
  }
}

/**
 * Dohvaća oglase koji zadovoljavaju kriterije iz configa. Liste se prolaze u
 * cijelosti (par zahtjeva), ali detalj oglasa — koji je skup dio — dohvaća se
 * samo za oglase koje `isSeen` ne prepozna.
 */
export async function fetchListings(config, { isSeen = () => false } = {}) {
  const { ids: modelIds, names } = await loadModels(config.models)
  const params = buildSearchParams(config, modelIds)

  const newAdCodes = []
  const prices = []
  let known = 0
  let matched = 0

  for (let page = 1; page > 0; ) {
    params.set('page', String(page))
    const result = await api(`/aditem?${params}`)
    matched = result.count

    for (const ad of result.data ?? []) {
      const externalId = String(ad.code)
      if (isSeen(externalId)) {
        known += 1
        prices.push({ externalId, price: ad.price ?? null })
      } else {
        newAdCodes.push(ad.code)
      }
    }
    page = result.nextPage
  }

  if (newAdCodes.length === 0) return { listings: [], prices, matched, known }

  const placeNames = await loadPlaceNames()
  const listings = []
  for (const code of newAdCodes) {
    const result = await api(`/aditem/single-ad?code=${code}`)
    const ad = result.data?.[0]
    if (ad) listings.push(toListing(ad, placeNames, names))
  }

  return { listings, prices, matched, known }
}
