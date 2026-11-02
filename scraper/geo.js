import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CACHE_PATH = fileURLToPath(new URL('../data/geocode.json', import.meta.url))

// Nominatim (OpenStreetMap) traži identifikaciju i najviše jedan zahtjev u sekundi. Svako
// mjesto se traži jednom i pamti u repou, pa dnevni posao pita samo za mjesta koja nije vidio.
const USER_AGENT = 'AutoRadar/1.0 (osobni agregator auto oglasa)'
const DELAY_MS = 1100

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function readCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

export function geocoder() {
  const cache = readCache()
  let changed = false

  async function locate(place, country) {
    if (!place) return null
    const key = `${country ?? ''}|${place}`
    if (key in cache) return cache[key]

    const params = new URLSearchParams({ q: place, format: 'json', limit: '1' })
    if (country) params.set('countrycodes', country.toLowerCase())
    await sleep(DELAY_MS)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
      })
      if (!res.ok) return null
      const [hit] = await res.json()
      cache[key] = hit ? [Number(hit.lat), Number(hit.lon)] : null
      changed = true
      return cache[key]
    } catch {
      // Mreža ili limit: bez udaljenosti danas, pokušava se opet sutra.
      return null
    }
  }

  function save() {
    if (changed) writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 1)}\n`)
  }

  return { locate, save }
}

/** Zračna udaljenost × faktor ceste; točna ruta je link u sučelju. */
export function roadKm([lat1, lon1], [lat2, lon2], factor) {
  const rad = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2
  const km = 2 * 6371 * Math.asin(Math.sqrt(a)) * factor
  return Math.round(km / 10) * 10
}
