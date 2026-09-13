import { isSourceEnabled, loadConfig } from './config.js'
import { insertListings, openDb, recordPrices, seenIds, updateSeller } from './db.js'
import * as autoscout24 from './sources/autoscout24.js'
import * as indexOglasi from './sources/index-oglasi.js'
import * as njuskalo from './sources/njuskalo.js'

const SOURCES = [indexOglasi, autoscout24, njuskalo]

// Dio salona označi karavan kao limuzinu ili SUV, pa filter na izvoru propusti "Octavia Kombi".
// Ove riječi kod praćenih modela znače karavan i ništa drugo.
const WAGON_WORDS = /(^|[^a-z])(kombi|combi|variant|avant|karavan|touring|estate|break)([^a-z]|$)/i

const isWagon = (listing) => WAGON_WORDS.test(listing.title)

async function runSource(db, source, config) {
  const seen = seenIds(db, source.id)
  const { listings, prices = [], sellers = [], matched, known } = await source.fetchListings(config, {
    isSeen: (externalId) => seen.has(externalId),
    settings: config.sources[source.id],
  })
  const wanted = config.criteria.bodyTypes?.includes('karavan')
    ? listings
    : listings.filter((listing) => !isWagon(listing))
  const mislabelled = listings.length - wanted.length

  const inserted = insertListings(db, wanted)
  const repriced = recordPrices(db, source.id, prices)
  for (const seller of sellers) {
    updateSeller(db, source.id, seller.externalId, seller.sellerType, seller.sellerName)
  }
  const notes = [
    `${matched} oglasa po kriterijima`,
    `${known} već viđenih`,
    `${inserted} novih spremljeno`,
    `${repriced} promjena cijene`,
  ]
  if (mislabelled > 0) notes.push(`${mislabelled} krivo označenih karavana odbačeno`)
  console.log(`${source.label}: ${notes.join(', ')}`)
}

async function main() {
  const config = loadConfig()
  const enabled = SOURCES.filter((source) => isSourceEnabled(config, source.id))

  if (enabled.length === 0) {
    console.log('Nijedan izvor nije uključen u config/models.json — nema posla.')
    return
  }

  console.log(
    `Kriteriji: ${config.models.length} modela, gorivo ${config.criteria.fuelAllow.join('/')}, godište ${config.criteria.yearMin}+`,
  )

  const db = openDb()
  let failed = 0
  try {
    for (const source of enabled) {
      // Pad jednog izvora (blokada, promjena stranice) ne smije srušiti cijeli dnevni posao.
      try {
        await runSource(db, source, config)
      } catch (err) {
        failed += 1
        console.error(`${source.label}: ${err.message}`)
      }
    }
  } finally {
    db.close()
  }

  if (failed === enabled.length) process.exitCode = 1
}

main().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})
