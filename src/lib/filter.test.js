import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY_FILTERS, applyFilters, isFiltered } from './filter.js'

const ad = (overrides) => ({
  id: 'x',
  source: 'index-oglasi',
  model: 'Octavia',
  title: 'Škoda Octavia 1.5 TSI',
  location: 'Zagreb',
  excerpt: null,
  price: 20000,
  year: 2022,
  mileage: 50000,
  postedAt: '2026-09-10T10:00:00.000Z',
  firstSeenAt: '2026-09-12T10:00:00.000Z',
  ...overrides,
})

const withFilters = (patch) => ({ ...EMPTY_FILTERS, ...patch })

test('prazni filteri propuštaju sve', () => {
  const listings = [ad({ id: '1' }), ad({ id: '2' })]
  assert.equal(applyFilters(listings, EMPTY_FILTERS, 0).length, 2)
  assert.equal(isFiltered(EMPTY_FILTERS), false)
})

test('gornje granice su uključive', () => {
  const listings = [ad({ id: '1', price: 20000 }), ad({ id: '2', price: 20001 })]
  const shown = applyFilters(listings, withFilters({ priceMax: '20000' }), 0)
  assert.deepEqual(shown.map((l) => l.id), ['1'])
})

test('oglas bez cijene ili kilometraže ne ispada iz raspona', () => {
  const listings = [ad({ id: 'bez', price: null, mileage: null })]
  const shown = applyFilters(listings, withFilters({ priceMax: '15000', mileageMax: '10000' }), 0)
  assert.equal(shown.length, 1)
})

test('izvor i model se kombiniraju', () => {
  const listings = [
    ad({ id: 'a', source: 'autoscout24', model: 'Octavia' }),
    ad({ id: 'b', source: 'index-oglasi', model: 'Octavia' }),
    ad({ id: 'c', source: 'index-oglasi', model: 'A5' }),
  ]
  const shown = applyFilters(
    listings,
    withFilters({ sources: ['index-oglasi'], models: ['Octavia'] }),
    0,
  )
  assert.deepEqual(shown.map((l) => l.id), ['b'])
})

test('pretraga gleda naslov i lokaciju, neovisno o veličini slova', () => {
  const listings = [ad({ id: 'a', title: 'VW T-Roc', location: 'Split' }), ad({ id: 'b' })]
  assert.deepEqual(applyFilters(listings, withFilters({ query: 't-roc' }), 0).map((l) => l.id), ['a'])
  assert.deepEqual(applyFilters(listings, withFilters({ query: 'SPLIT' }), 0).map((l) => l.id), ['a'])
})

test('"samo novo" gleda trenutak prvog viđenja', () => {
  const freshSince = new Date('2026-09-12T00:00:00.000Z').getTime()
  const listings = [
    ad({ id: 'staro', firstSeenAt: '2026-09-01T10:00:00.000Z' }),
    ad({ id: 'novo', firstSeenAt: '2026-09-12T10:00:00.000Z' }),
  ]
  const shown = applyFilters(listings, withFilters({ freshOnly: true }), freshSince)
  assert.deepEqual(shown.map((l) => l.id), ['novo'])
})

test('unutar istog dohvata odlučuje datum objave na izvoru', () => {
  const listings = [
    ad({ id: 'starije', postedAt: '2026-09-01T00:00:00.000Z' }),
    ad({ id: 'novije', postedAt: '2026-09-11T00:00:00.000Z' }),
  ]
  assert.deepEqual(applyFilters(listings, EMPTY_FILTERS, 0).map((l) => l.id), ['novije', 'starije'])
})

test('sortiranje po cijeni stavlja oglase bez cijene na kraj', () => {
  const listings = [ad({ id: 'skup', price: 30000 }), ad({ id: 'bez', price: null }), ad({ id: 'jeftin', price: 10000 })]
  const shown = applyFilters(listings, withFilters({ sort: 'jeftinije' }), 0)
  assert.deepEqual(shown.map((l) => l.id), ['jeftin', 'skup', 'bez'])
})
