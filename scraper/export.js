import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'
import { openDb, priceHistory } from './db.js'

const OUT_PATH = fileURLToPath(
  new URL('../public/data/listings.json', import.meta.url),
)

// Dashboard je statična stranica i ne može otvoriti SQLite, pa dnevni posao izveze snapshot.
// Opis se skraćuje jer kartica prikazuje samo uvod — cijeli tekst je na izvoru, jedan klik dalje.
const EXCERPT_LIMIT = 300

function excerpt(description) {
  if (!description) return null
  const text = description.replace(/\s+/g, ' ').trim()
  if (text.length <= EXCERPT_LIMIT) return text
  const cut = text.slice(0, EXCERPT_LIMIT)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

const config = loadConfig()

const normalize = (value) =>
  (value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Izvori imenuju izvedenice zasebno ('Passat Variant', 'A5 Sportback'). Filter u sucelju nudi
// modele iz configa, pa se izvedenica svrstava pod svoju obitelj; puni naziv ostaje u naslovu.
function family(make, model) {
  const wanted = normalize(model)
  const match = config.models.find((entry) => {
    if (normalize(entry.make) !== normalize(make)) return false
    const name = normalize(entry.model)
    return wanted === name || wanted.startsWith(name + ' ')
  })
  // Izvori pisu marku razlicito ('Skoda' vs 'Škoda'); filter treba jedan naziv po modelu.
  return match ?? { make, model }
}

const db = openDb()

// Povijest ide uz oglas samo ako ima što reći — jedna zabiljezena cijena je pocetna, ne promjena.
const history = new Map()
for (const row of priceHistory(db)) {
  const key = `${row.source_id}:${row.external_id}`
  if (!history.has(key)) history.set(key, [])
  history.get(key).push({ price: row.price, at: row.seen_at })
}

const rows = db
  .prepare(
    `
  select source_id, external_id, url, title, make, model, seller_type, seller_name, body_type,
         country,
         description, price, year, mileage,
         fuel, location, image_url, posted_at, first_seen_at
  from listings
  order by first_seen_at desc, coalesce(posted_at, '') desc
`,
  )
  .all()
db.close()

const listings = rows.map((row) => {
  const id = `${row.source_id}:${row.external_id}`
  const prices = history.get(id) ?? []
  return {
    source: row.source_id,
    id,
    url: row.url,
    title: row.title,
    ...family(row.make, row.model),
  sellerType: row.seller_type,
  sellerName: row.seller_name,
  bodyType: row.body_type,
  country: row.country,
    excerpt: excerpt(row.description),
    price: row.price,
    year: row.year,
    mileage: row.mileage,
    fuel: row.fuel,
    location: row.location,
    image: row.image_url,
    postedAt: row.posted_at,
    firstSeenAt: row.first_seen_at,
    ...(prices.length > 1 ? { prices } : {}),
  }
})

mkdirSync(dirname(OUT_PATH), { recursive: true })
writeFileSync(
  OUT_PATH,
  JSON.stringify({ generatedAt: new Date().toISOString(), criteria: config.criteria, models: config.models, listings }),
)

const kb = Math.round(JSON.stringify(listings).length / 1024)
console.log(
  `Izvezeno ${listings.length} oglasa u public/data/listings.json (${kb} kB)`,
)
