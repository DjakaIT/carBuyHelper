import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

export const DB_PATH = fileURLToPath(new URL('../data/autoradar.sqlite', import.meta.url))

// Dedup se oslanja na primarni ključ: isti oglas s istog izvora ne može ući dvaput.
const SCHEMA = `
create table if not exists listings (
  source_id     text not null,
  external_id   text not null,
  url           text not null,
  title         text not null,
  make          text,
  model         text,
  seller_type   text,
  seller_name   text,
  body_type     text,
  country       text,
  description   text,
  price         integer,
  year          integer,
  mileage       integer,
  fuel          text,
  location      text,
  image_url     text,
  gallery       text not null default '[]',
  posted_at     text,
  first_seen_at text not null,
  primary key (source_id, external_id)
);
create index if not exists listings_first_seen on listings (first_seen_at desc);

create table if not exists price_history (
  source_id   text not null,
  external_id text not null,
  price       integer not null,
  seen_at     text not null,
  primary key (source_id, external_id, seen_at)
);
`

// Baza živi u repou i preživljava izmjene sheme, pa se stupci dodani kasnije dopisuju ovdje.
// "create table if not exists" ne dira postojeću tablicu.
const ADDED_COLUMNS = [
  ['make', 'text'],
  ['model', 'text'],
  ['seller_type', 'text'],
  ['seller_name', 'text'],
  ['body_type', 'text'],
  ['country', 'text'],
]

export function openDb(path = DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(SCHEMA)

  const existing = new Set(db.prepare('pragma table_info(listings)').all().map((c) => c.name))
  for (const [name, type] of ADDED_COLUMNS) {
    if (!existing.has(name)) db.exec(`alter table listings add column ${name} ${type}`)
  }

  return db
}

export function seenIds(db, sourceId) {
  const rows = db.prepare('select external_id from listings where source_id = ?').all(sourceId)
  return new Set(rows.map((row) => row.external_id))
}

/** Vraća broj stvarno spremljenih oglasa — već viđeni se tiho preskaču. */
export function insertListings(db, listings, firstSeenAt = new Date().toISOString()) {
  const insert = db.prepare(`
    insert or ignore into listings
      (source_id, external_id, url, title, make, model, seller_type, seller_name, body_type,
       country, description, price, year, mileage, fuel, location, image_url, gallery,
       posted_at, first_seen_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const remember = db.prepare(
    'insert or ignore into price_history (source_id, external_id, price, seen_at) values (?, ?, ?, ?)',
  )

  let inserted = 0
  db.exec('begin')
  try {
    for (const listing of listings) {
      const result = insert.run(
        listing.sourceId,
        listing.externalId,
        listing.url,
        listing.title,
        listing.make ?? null,
        listing.model ?? null,
        listing.sellerType ?? null,
        listing.sellerName ?? null,
        listing.bodyType ?? null,
        listing.country ?? null,
        listing.description ?? null,
        listing.price ?? null,
        listing.year ?? null,
        listing.mileage ?? null,
        listing.fuel ?? null,
        listing.location ?? null,
        listing.imageUrl ?? null,
        JSON.stringify(listing.gallery ?? []),
        listing.postedAt ?? null,
        firstSeenAt,
      )
      if (Number(result.changes) > 0) {
        inserted += 1
        if (listing.price != null) {
          remember.run(listing.sourceId, listing.externalId, listing.price, firstSeenAt)
        }
      }
    }
    db.exec('commit')
  } catch (err) {
    db.exec('rollback')
    throw err
  }
  return inserted
}

/**
 * Cijene se osvjezavaju iz liste, bez ijednog dodatnog zahtjeva — lista ionako nosi cijenu.
 * Promjena se upisuje u povijest, a oglas zadrzava svoj prvotni first_seen_at.
 */
export function recordPrices(db, sourceId, observations, seenAt = new Date().toISOString()) {
  const stored = new Map(
    db
      .prepare('select external_id, price from listings where source_id = ?')
      .all(sourceId)
      .map((row) => [row.external_id, row.price]),
  )

  const updatePrice = db.prepare(
    'update listings set price = ? where source_id = ? and external_id = ?',
  )
  const remember = db.prepare(
    'insert or ignore into price_history (source_id, external_id, price, seen_at) values (?, ?, ?, ?)',
  )

  let changed = 0
  db.exec('begin')
  try {
    for (const { externalId, price } of observations) {
      if (price == null || !stored.has(externalId)) continue
      if (stored.get(externalId) === price) continue
      updatePrice.run(price, sourceId, externalId)
      remember.run(sourceId, externalId, price, seenAt)
      changed += 1
    }
    db.exec('commit')
  } catch (err) {
    db.exec('rollback')
    throw err
  }
  return changed
}

/** Prodavač se doznaje tek s detaljem oglasa, pa se postojećim oglasima može dopuniti naknadno. */
export function updateSeller(db, sourceId, externalId, sellerType, sellerName) {
  db.prepare(
    'update listings set seller_type = ?, seller_name = ? where source_id = ? and external_id = ?',
  ).run(sellerType ?? null, sellerName ?? null, sourceId, externalId)
}

export function priceHistory(db) {
  return db
    .prepare('select source_id, external_id, price, seen_at from price_history order by seen_at')
    .all()
}
