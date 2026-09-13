const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

// Razmak između zahtjeva prema istom hostu — dnevni posao nema razloga ići brže.
const MIN_DELAY_MS = 800
const MAX_RETRIES = 3

const cookieJar = new Map()
const lastRequestAt = new Map()
const sessions = new Map()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hostOf = (url) => new URL(url).host

async function throttle(host, minDelayMs) {
  const wait = minDelayMs - (Date.now() - (lastRequestAt.get(host) ?? 0))
  if (wait > 0) await sleep(wait)
  lastRequestAt.set(host, Date.now())
}

function rememberCookies(host, res) {
  const cookies = res.headers.getSetCookie()
  if (cookies.length === 0) return
  const jar = new Map(
    (cookieJar.get(host) ?? '')
      .split('; ')
      .filter(Boolean)
      .map((pair) => [pair.split('=')[0], pair]),
  )
  for (const cookie of cookies) {
    const pair = cookie.split(';')[0]
    jar.set(pair.split('=')[0], pair)
  }
  cookieJar.set(host, [...jar.values()].join('; '))
}

/** Neki izvori odbijaju zahtjeve bez kolačića koje postavi njihova stranica. */
async function ensureSession(sessionUrl, minDelayMs) {
  const host = hostOf(sessionUrl)
  if (sessions.has(host)) return
  sessions.set(host, true)

  await throttle(host, minDelayMs)
  const res = await fetch(sessionUrl, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Ne mogu otvoriti sesiju (${sessionUrl}): HTTP ${res.status}`)
  rememberCookies(host, res)
}

async function request(url, { sessionUrl, referer, accept, minDelayMs = MIN_DELAY_MS }) {
  if (sessionUrl) await ensureSession(sessionUrl, minDelayMs)
  const host = hostOf(url)

  for (let attempt = 1; ; attempt += 1) {
    await throttle(host, minDelayMs)
    let res
    try {
      res = await fetch(url, {
        headers: {
          Accept: accept,
          'Accept-Language': 'hr-HR,hr;q=0.9,en;q=0.8',
          'User-Agent': USER_AGENT,
          ...(referer ? { Referer: referer } : {}),
          ...(cookieJar.has(host) ? { Cookie: cookieJar.get(host) } : {}),
        },
      })
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        throw new Error(`Mrežna greška (${url}): ${err.message}`, { cause: err })
      }
      await sleep(attempt * 2000)
      continue
    }

    rememberCookies(host, res)
    if (res.ok) return res

    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= MAX_RETRIES) throw new Error(`HTTP ${res.status} za ${url}`)
    await sleep(attempt * 2000)
  }
}

export async function getJson(url, options = {}) {
  const res = await request(url, { ...options, accept: 'application/json' })
  return res.json()
}

export async function getHtml(url, options = {}) {
  const res = await request(url, {
    ...options,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  })
  return res.text()
}
