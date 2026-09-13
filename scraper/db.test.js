import assert from 'node:assert/strict'
import { test } from 'node:test'
import { insertListings, openDb, priceHistory, recordPrices, seenIds } from './db.js'

const listing = (externalId, overrides = {}) => ({
  sourceId: 'index-oglasi',
  externalId,
  url: `https://example.test/${externalId}`,
  title: `TEST OGLAS ${externalId}`,
  gallery: [],
  ...overrides,
})

test('isti oglas se ne sprema dvaput', () => {
  const db = openDb(':memory:')

  assert.equal(insertListings(db, [listing('1'), listing('2')]), 2)
  assert.equal(insertListings(db, [listing('2'), listing('3')]), 1)
  assert.equal(db.prepare('select count(*) as n from listings').get().n, 3)
})

test('ponovni unos ne mijenja first_seen_at ni sadržaj', () => {
  const db = openDb(':memory:')

  insertListings(db, [listing('1', { price: 10000 })], '2026-01-01T00:00:00.000Z')
  insertListings(db, [listing('1', { price: 9000 })], '2026-02-02T00:00:00.000Z')

  const row = db.prepare('select price, first_seen_at from listings').get()
  assert.equal(row.price, 10000)
  assert.equal(row.first_seen_at, '2026-01-01T00:00:00.000Z')
})

test('isti externalId s različitih izvora su različiti oglasi', () => {
  const db = openDb(':memory:')

  insertListings(db, [listing('1'), listing('1', { sourceId: 'mobile-de' })])
  assert.equal(db.prepare('select count(*) as n from listings').get().n, 2)
})

test('seenIds vraća samo ID-jeve traženog izvora', () => {
  const db = openDb(':memory:')

  insertListings(db, [listing('1'), listing('2'), listing('9', { sourceId: 'mobile-de' })])

  assert.deepEqual(seenIds(db, 'index-oglasi'), new Set(['1', '2']))
  assert.deepEqual(seenIds(db, 'mobile-de'), new Set(['9']))
})

test('prva cijena ulazi u povijest pri spremanju oglasa', () => {
  const db = openDb(':memory:')

  insertListings(db, [listing('1', { price: 20000 })], '2026-01-01T00:00:00.000Z')

  const history = priceHistory(db)
  assert.equal(history.length, 1)
  assert.equal(history[0].external_id, '1')
  assert.equal(history[0].price, 20000)
  assert.equal(history[0].seen_at, '2026-01-01T00:00:00.000Z')
})

test('promjena cijene se bilježi i mijenja trenutnu cijenu', () => {
  const db = openDb(':memory:')
  insertListings(db, [listing('1', { price: 20000 })], '2026-01-01T00:00:00.000Z')

  const changed = recordPrices(
    db,
    'index-oglasi',
    [{ externalId: '1', price: 18500 }],
    '2026-01-05T00:00:00.000Z',
  )

  assert.equal(changed, 1)
  assert.equal(db.prepare('select price from listings').get().price, 20000 - 1500)
  assert.deepEqual(
    priceHistory(db).map((row) => row.price),
    [20000, 18500],
  )
})

test('ista cijena ne stvara novi zapis u povijesti', () => {
  const db = openDb(':memory:')
  insertListings(db, [listing('1', { price: 20000 })])

  assert.equal(recordPrices(db, 'index-oglasi', [{ externalId: '1', price: 20000 }]), 0)
  assert.equal(priceHistory(db).length, 1)
})

test('cijena bez vrijednosti i nepoznat oglas se preskaču', () => {
  const db = openDb(':memory:')
  insertListings(db, [listing('1', { price: 20000 })])

  const changed = recordPrices(db, 'index-oglasi', [
    { externalId: '1', price: null },
    { externalId: 'nepoznat', price: 5000 },
  ])

  assert.equal(changed, 0)
  assert.equal(db.prepare('select price from listings').get().price, 20000)
})

test('povijest je odvojena po izvoru', () => {
  const db = openDb(':memory:')
  insertListings(db, [listing('1', { price: 20000 }), listing('1', { sourceId: 'autoscout24', price: 30000 })])

  recordPrices(db, 'autoscout24', [{ externalId: '1', price: 28000 }])

  assert.equal(db.prepare("select price from listings where source_id='index-oglasi'").get().price, 20000)
  assert.equal(db.prepare("select price from listings where source_id='autoscout24'").get().price, 28000)
})
