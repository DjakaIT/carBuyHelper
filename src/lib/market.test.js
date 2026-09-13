import assert from 'node:assert/strict'
import { test } from 'node:test'
import { marketByModel, standing } from './market.js'

const ad = (model, price) => ({ model, price })

test('medijan se računa po modelu, ne preko cijele liste', () => {
  const market = marketByModel([
    ad('Octavia', 20000),
    ad('Octavia', 22000),
    ad('Octavia', 24000),
    ad('A6', 50000),
  ])

  assert.equal(market.get('Octavia').median, 22000)
  assert.equal(market.get('Octavia').min, 20000)
  assert.equal(market.get('A6').median, 50000)
})

test('paran broj oglasa daje prosjek dvaju srednjih', () => {
  const market = marketByModel([ad('A5', 10000), ad('A5', 20000)])
  assert.equal(market.get('A5').median, 15000)
})

test('oglasi bez cijene ili modela ne ulaze u računicu', () => {
  const market = marketByModel([ad('A5', null), ad(null, 10000), ad('A5', 30000)])
  assert.equal(market.get('A5').count, 1)
  assert.equal(market.has(null), false)
})

test('najjeftiniji primjerak modela nosi oznaku najboljeg', () => {
  const listings = [ad('Octavia', 18000), ad('Octavia', 22000), ad('Octavia', 26000)]
  const market = marketByModel(listings)

  assert.equal(standing(listings[0], market).best, true)
  assert.equal(standing(listings[0], market).tone, 'best')
  assert.equal(standing(listings[2], market).tone, 'high')
})

test('bez dovoljno usporedivih oglasa nema ocjene', () => {
  const listings = [ad('S90', 40000), ad('S90', 42000)]
  assert.equal(standing(listings[0], marketByModel(listings)), null)
})

test('oglas oko medijana je neutralan', () => {
  const listings = [ad('A6', 30000), ad('A6', 31000), ad('A6', 32000)]
  const market = marketByModel(listings)
  assert.equal(standing(listings[1], market).tone, 'even')
})
