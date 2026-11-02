import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ppmvAmount, remainingShare } from './importCost.js'

const costs = JSON.parse(readFileSync(new URL('../../config/import.json', import.meta.url), 'utf8'))

// Primjeri iz "Kako izračunati posebni porez na motorna vozila" (Carinska uprava) i Indexova
// članka o uvozu iz 2026. — tablice su prepisane ručno, pa ih ovo drži poštenima.
test('preostala vrijednost prati Tablicu 1 Pravilnika', () => {
  assert.equal(remainingShare(costs.ppmv.remaining, 4), 0.86)
  assert.equal(remainingShare(costs.ppmv.remaining, 20), 0.6836)
  assert.equal(remainingShare(costs.ppmv.remaining, 92), 0.2986)
})

test('PPMV za benzinac prvi put registriran 2021. odgovara službenom primjeru', () => {
  // Primjer 10: 145 g/km WLTP, 215.000 kn (28.535,40 €), 4 mjeseca → 6.557,50 kn (870,33 €).
  const amount = ppmvAmount(costs.ppmv, { newPrice: 28535.4, co2: 145, share: 0.86, wltp: true })
  assert.ok(Math.abs(amount - 870.33) < 1, `dobiveno ${amount}`)
})
