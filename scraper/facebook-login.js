import { PROFILE_DIR, openBrowser } from './browser.js'

// Jednokratna ručna prijava. Lozinka se nigdje ne upisuje u kod ni u config — otvara se
// pravi prozor preglednika, prijava se obavi rukom, a sesija ostaje u lokalnom profilu.
const CHECK_EVERY_MS = 5000
const GIVE_UP_AFTER_MS = 10 * 60 * 1000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const LOGGED_IN = `
(() => {
  if (location.hostname.includes('facebook.com') === false) return false
  const loginForm = document.querySelector('input[name="pass"], input[id="pass"]')
  return !loginForm && document.cookie.includes('c_user')
})()
`

const browser = await openBrowser({ headless: false, port: 9224 })

try {
  await browser.goto('https://www.facebook.com/login')
  console.log('Otvoren je prozor preglednika. Prijavi se u njemu i ostavi prozor otvoren.')
  console.log('Čekam prijavu…')

  const until = Date.now() + GIVE_UP_AFTER_MS
  let done = false
  while (!done && Date.now() < until) {
    await sleep(CHECK_EVERY_MS)
    done = await browser.evaluate(LOGGED_IN)
  }

  if (!done) {
    console.error('Prijava nije dovršena u 10 minuta — pokreni ponovno.')
    process.exitCode = 1
  } else {
    console.log('Prijava je spremljena u', PROFILE_DIR)
    console.log('Uključi izvor u config/models.json ("facebook": { "enabled": true }).')
  }
} finally {
  browser.close()
}
