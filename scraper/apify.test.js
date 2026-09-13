import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runActor, specValue } from './apify.js'

test('specValue čita mapu specifikacija', () => {
  const specs = { Kilometraža: '123.456 km', Gorivo: 'Benzin' }
  assert.equal(specValue(specs, /kilometra/i), '123.456 km')
  assert.equal(specValue(specs, /gorivo/i), 'Benzin')
})

test('specValue čita i niz parova', () => {
  const specs = [
    { name: 'Karoserija', value: 'limuzina' },
    { label: 'Kilometraža', value: 80000 },
  ]
  assert.equal(specValue(specs, /karoserij/i), 'limuzina')
  assert.equal(specValue(specs, /kilometra/i), '80000')
})

test('specValue vraća null kad specifikacija nema ili ne odgovara', () => {
  assert.equal(specValue(null, /bilo/i), null)
  assert.equal(specValue({ Gorivo: 'Benzin' }, /kilometra/i), null)
})

test('runActor bez tokena ne poziva Apify nego jasno prijavi problem', async () => {
  const token = process.env.APIFY_TOKEN
  delete process.env.APIFY_TOKEN
  try {
    await assert.rejects(() => runActor('neki~actor', {}), /APIFY_TOKEN/)
  } finally {
    if (token !== undefined) process.env.APIFY_TOKEN = token
  }
})
