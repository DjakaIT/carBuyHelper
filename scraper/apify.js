const API = 'https://api.apify.com/v2/acts'

// Apify naplaćuje po pokretanju i po dohvaćenom oglasu, pa svaki poziv mora biti namjeran:
// jedan poziv po pokretanju dnevnog posla, s ograničenjem broja oglasa iz configa.
const RUN_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Pokreće Apify actor i čeka rezultat. Token se čita iz okoline (`APIFY_TOKEN`) — ne ide
 * ni u config ni u repo. Lokalno se postavi u okolini, u CI-u kao GitHub secret.
 */
export async function runActor(actorId, input, { timeoutMs = RUN_TIMEOUT_MS } = {}) {
  const token = process.env.APIFY_TOKEN
  if (!token) {
    throw new Error('Nema APIFY_TOKEN u okolini — bez njega Apify izvor ne može raditi')
  }

  const url = `${API}/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const body = await response.text()
    const detail = body.slice(0, 200).replace(/\s+/g, ' ')
    throw new Error(`Apify ${actorId}: HTTP ${response.status} — ${detail}`)
  }

  const items = await response.json()
  if (!Array.isArray(items)) throw new Error(`Apify ${actorId}: neočekivan odgovor`)
  return items
}

/**
 * `ext_specs` nema zajamčen oblik — kod nekih oglasa je mapa, kod nekih niz parova.
 * Vraća prvu vrijednost čiji naziv odgovara traženom pojmu.
 */
export function specValue(specs, pattern) {
  if (!specs) return null

  const entries = Array.isArray(specs)
    ? specs.map((entry) => [entry?.name ?? entry?.label ?? '', entry?.value ?? ''])
    : Object.entries(specs)

  for (const [name, value] of entries) {
    if (pattern.test(String(name))) return value == null ? null : String(value)
  }
  return null
}
