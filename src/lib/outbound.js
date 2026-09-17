/**
 * Linkovi na pretragu kod samog izvora, složeni iz kriterija koje koristi dohvat, uz moguće
 * pooštrenje iz `outbound` u configu (npr. novije godište nego što radar skuplja).
 * Koriste se za portale koje ne možemo dohvatiti (Njuškalo blokira) ili koji nisu uključeni
 * (strana tržišta) — tamo pretragu otvoriš u pregledniku i po potrebi je spremiš kod njih.
 */

const NJUSKALO_FUEL = { benzin: 600, diesel: 602, dizel: 602, hibrid: 604, elektricni: 606 }
const NJUSKALO_BODY = { limuzina: 21, karavan: 22, monovolumen: 23, coupe: 24, suv: 380, hatchback: 631 }

const AS24_FUEL = { benzin: 'B', dizel: 'D', diesel: 'D', elektricni: 'E' }
const AS24_BODY = { limuzina: 6, suv: 4, coupe: 3, hatchback: 1, karavan: 5 }
const AS24_MARKETS = { DE: 'D', AT: 'A', BE: 'B', ES: 'E', FR: 'F', IT: 'I', LU: 'L', NL: 'NL' }

const normalize = (value) =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const slug = (value) => normalize(value).replace(/\s+/g, '-')

/**
 * Njuškalo prima sve modele u jednom upitu (`vehicleIds`), pa jedan link pokriva cijelu listu.
 * Modeli bez poznatog ID-a ispadaju iz linka — ID se ne pogađa.
 */
export function njuskaloUrl(baseCriteria, models, overrides = {}) {
  if (!baseCriteria) return null
  const criteria = { ...baseCriteria, ...overrides }

  const ids = models.flatMap((model) => model.njuskaloIds ?? [])
  const params = new URLSearchParams()
  if (ids.length > 0) params.set('vehicleIds', ids.join(','))
  params.set('onlyFullPrice', '1')
  params.set('yearManufactured[min]', String(criteria.yearMin))
  if (criteria.priceMax != null) params.set('price[max]', String(criteria.priceMax))
  if (criteria.mileageMax != null) params.set('mileage[max]', String(criteria.mileageMax))

  for (const fuel of criteria.fuelAllow ?? []) {
    const id = NJUSKALO_FUEL[normalize(fuel)]
    if (id) params.append('fuelTypeId', String(id))
  }
  for (const body of criteria.bodyTypes ?? []) {
    const id = NJUSKALO_BODY[normalize(body)]
    if (id) params.append('bodyTypeId', String(id))
  }

  // Za modele bez poznatog ID-a pretraga se sužava koliko se može: na marku ako je jedna,
  // inače na sve marke uz ostale kriterije. Bolje nego da gumb nestane.
  const makes = [...new Set(models.map((model) => model.make))]
  const path = ids.length === 0 && makes.length === 1 ? `/auti/${slug(makes[0])}` : '/auti'

  return `https://www.njuskalo.hr${path}?${params}`
}

/**
 * AutoScout24 ide po jednom modelu; bez odabranog modela otvara se pretraga po svim markama.
 * Države su njihova zapadna tržišta — ono što se kod nas ne dohvaća dok nije u kriterijima.
 */
export function autoscout24Url(baseCriteria, model, countries = ['DE', 'AT'], overrides = {}) {
  if (!baseCriteria) return null
  const criteria = { ...baseCriteria, ...overrides }

  const params = new URLSearchParams({ atype: 'C', sort: 'age', desc: '1' })
  params.set('fregfrom', String(criteria.yearMin))
  if (criteria.priceMax != null) params.set('priceto', String(criteria.priceMax))
  if (criteria.mileageMax != null) params.set('kmto', String(criteria.mileageMax))

  for (const fuel of criteria.fuelAllow ?? []) {
    const code = AS24_FUEL[normalize(fuel)]
    if (code) params.append('fuel', code)
  }
  for (const body of criteria.bodyTypes ?? []) {
    const code = AS24_BODY[normalize(body)]
    if (code) params.append('body', String(code))
  }

  const markets = countries.map((code) => AS24_MARKETS[code]).filter(Boolean)
  if (markets.length > 0) params.set('cy', markets.join(','))

  const path = model ? `/lst/${slug(model.make)}/${slug(model.model)}` : '/lst'
  return `https://www.autoscout24.com${path}?${params}`
}
