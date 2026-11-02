import { isSourceEnabled, loadConfig } from './config.js'
import { insertListings, openDb, recordPrices, seenIds, updateSeller } from './db.js'
import * as autiHr from './sources/auti-hr.js'
import * as autokatalog from './sources/autokatalog.js'
import * as autoscout24 from './sources/autoscout24.js'
import * as facebook from './sources/facebook.js'
import * as indexOglasi from './sources/index-oglasi.js'
import * as kleinanzeigen from './sources/kleinanzeigen.js'
import * as njuskalo from './sources/njuskalo.js'
import * as oglasnik from './sources/oglasnik.js'

const SOURCES = [indexOglasi, autokatalog, autiHr, oglasnik, autoscout24, kleinanzeigen, njuskalo, facebook]

// Dio salona označi karavan kao limuzinu ili SUV, pa filter na izvoru propusti "Octavia Kombi".
// Ove riječi kod praćenih modela znače karavan i ništa drugo.
const WAGON_WORDS = /(^|[^a-z])(kombi|combi|variant|avant|karavan|touring|estate|break)([^a-z]|$)/i

const isWagon = (listing) => WAGON_WORDS.test(listing.title)

// Zapremina iz naslova ("1.0 TSI", "2,0 TFSI") hvata izvore koji je ne filtriraju na svojoj
// strani. Oglas bez ikakvog podatka o motoru ostaje — ne zna se da je premalen.
// Iza broja smije doći zarez ili točka ("1,3, 2020g"), ali ne još znamenki ("1.500", "2.2023").
const DISPLACEMENT = /(?<![\d.,])([1-6])[.,](\d)(?!\d|[.,]\d)/

function engineCcm(listing) {
  if (listing.engineCcm) return listing.engineCcm
  const match = listing.title.match(DISPLACEMENT)
  return match ? Number(match[1]) * 1000 + Number(match[2]) * 100 : null
}

const isTooSmall = (listing, minCcm) => minCcm != null && (engineCcm(listing) ?? minCcm) < minCcm

/** Izvor koji ne pokriva nijednu traženu državu nema smisla ni otvarati. */
const covers = (source, countries) =>
  !source.coverage || source.coverage.some((code) => countries.includes(code))

async function runSource(db, source, config) {
  const seen = seenIds(db, source.id)
  const { listings, prices = [], sellers = [], matched, known } = await source.fetchListings(config, {
    isSeen: (externalId) => seen.has(externalId),
    settings: config.sources[source.id],
  })
  const allowWagons = config.criteria.bodyTypes?.includes('karavan')
  const wagons = listings.filter((listing) => !allowWagons && isWagon(listing))
  const small = listings.filter((listing) => isTooSmall(listing, config.criteria.engineMinCcm))
  const wanted = listings.filter((listing) => !wagons.includes(listing) && !small.includes(listing))

  // Oglasi stranih prodavača s hrvatskih portala se spremaju; u sučelju ih filtar država
  // pokazuje ili skriva bez novog dohvata.
  const foreign = wanted.filter(
    (listing) => listing.country && !config.criteria.countries.includes(listing.country),
  ).length

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
  if (wagons.length > 0) notes.push(`${wagons.length} krivo označenih karavana odbačeno`)
  if (small.length > 0) notes.push(`${small.length} s motorom ispod ${config.criteria.engineMinCcm} cm³ odbačeno`)
  if (foreign > 0) notes.push(`${foreign} iz drugih država (vidljivo na filtar)`)
  console.log(`${source.label}: ${notes.join(', ')}`)
}

async function main() {
  const config = loadConfig()
  const enabled = SOURCES.filter(
    (source) => isSourceEnabled(config, source.id) && covers(source, config.criteria.countries),
  )

  if (enabled.length === 0) {
    console.log('Nijedan izvor nije uključen u config/models.json — nema posla.')
    return
  }

  console.log(
    `Kriteriji: ${config.models.length} modela, gorivo ${config.criteria.fuelAllow.join('/')}, godište ${config.criteria.yearMin}+, države ${config.criteria.countries.join('/')}`,
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
