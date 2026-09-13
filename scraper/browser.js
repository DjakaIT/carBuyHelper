import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Izvori koji traže prijavu ne mogu se dohvatiti običnim fetchom — treba pravi preglednik
// sa spremljenom sesijom. Koristi se Edge koji je na Windowsu ionako instaliran, kroz njegov
// debug protokol, da projekt ne vuče Playwright i 150 MB preglednika sa sobom.
const EDGE_PATHS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]

export const PROFILE_DIR = fileURLToPath(new URL('../data/browser-profile', import.meta.url))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function edgeBinary() {
  const found = EDGE_PATHS.find((path) => existsSync(path))
  if (!found) throw new Error('Ne nalazim Microsoft Edge — prijavljeni izvori trebaju preglednik')
  return found
}

/**
 * Otvara preglednik s trajnim profilom. `headless: false` je za jednokratnu ručnu prijavu,
 * a dnevni dohvat ide bez prozora, na istoj spremljenoj sesiji.
 */
export async function openBrowser({ headless = true, port = 9222, profileDir = PROFILE_DIR } = {}) {
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ]
  if (headless) args.unshift('--headless=new')

  const process_ = spawn(edgeBinary(), args, { stdio: 'ignore' })

  let version
  for (let attempt = 0; attempt < 60 && !version; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) version = await res.json()
    } catch {
      // preglednik se još diže
    }
    if (!version) await sleep(250)
  }
  if (!version) {
    process_.kill()
    throw new Error('Preglednik se nije javio na debug portu')
  }

  const socket = new WebSocket(version.webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 0

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  })
  await new Promise((resolve) => socket.addEventListener('open', resolve))

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve) => {
      const id = (nextId += 1)
      pending.set(id, resolve)
      socket.send(JSON.stringify({ id, method, params, sessionId }))
    })

  const { result: created } = await send('Target.createTarget', { url: 'about:blank' })
  const { result: attached } = await send('Target.attachToTarget', {
    targetId: created.targetId,
    flatten: true,
  })
  const sessionId = attached.sessionId
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)

  return {
    async goto(url, { settleMs = 3500 } = {}) {
      await send('Page.navigate', { url }, sessionId)
      await sleep(settleMs)
    },

    async evaluate(expression) {
      const { result } = await send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      )
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? 'Greška u pregledniku')
      }
      return result.result?.value
    },

    async scroll(times = 4, pauseMs = 1200) {
      for (let i = 0; i < times; i += 1) {
        await this.evaluate('window.scrollBy(0, window.innerHeight * 0.9)')
        await sleep(pauseMs)
      }
    },

    close() {
      socket.close()
      process_.kill()
    },
  }
}
