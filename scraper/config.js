import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CONFIG_URL = new URL('../config/models.json', import.meta.url)

// Config je jedini izvor kriterija pretrage — kod ga čita, ne duplicira.
export function loadConfig() {
  const path = fileURLToPath(CONFIG_URL)
  let raw
  try {
    raw = readFileSync(CONFIG_URL, 'utf8')
  } catch (err) {
    throw new Error(`Ne mogu pročitati ${path}: ${err.message}`, { cause: err })
  }

  let config
  try {
    config = JSON.parse(raw)
  } catch (err) {
    throw new Error(`${path} nije valjan JSON: ${err.message}`, { cause: err })
  }

  validate(config, path)
  return config
}

function validate(config, path) {
  const fail = (msg) => {
    throw new Error(`${path}: ${msg}`)
  }

  if (!Array.isArray(config.models) || config.models.length === 0) {
    fail('"models" mora biti neprazan niz')
  }
  for (const [i, entry] of config.models.entries()) {
    if (!entry?.make || !entry?.model) {
      fail(`models[${i}] treba "make" i "model"`)
    }
  }

  const { criteria } = config
  if (!criteria) fail('nedostaje "criteria"')
  if (!Array.isArray(criteria.fuelAllow) || criteria.fuelAllow.length === 0) {
    fail('"criteria.fuelAllow" mora biti neprazan niz')
  }
  if (!Number.isInteger(criteria.yearMin)) {
    fail('"criteria.yearMin" mora biti cijeli broj')
  }
  if (criteria.priceMax != null && !Number.isInteger(criteria.priceMax)) {
    fail('"criteria.priceMax" mora biti cijeli broj ili izostavljen')
  }
  if (criteria.mileageMax != null && !Number.isInteger(criteria.mileageMax)) {
    fail('"criteria.mileageMax" mora biti cijeli broj ili izostavljen')
  }
  if (criteria.bodyTypes != null && !Array.isArray(criteria.bodyTypes)) {
    fail('"criteria.bodyTypes" mora biti niz ili izostavljen')
  }

  if (!config.sources || typeof config.sources !== 'object') {
    fail('nedostaje "sources"')
  }
}

export function isSourceEnabled(config, sourceId) {
  return config.sources[sourceId]?.enabled === true
}
