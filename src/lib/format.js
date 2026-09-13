const numbers = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 0 })
const shortDate = new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: '2-digit' })

export const DAY_MS = 24 * 60 * 60 * 1000

export const formatNumber = (value) => (value == null ? '—' : numbers.format(value))
export const formatPrice = (value) => (value == null ? 'na upit' : `${numbers.format(value)} €`)
export const formatKm = (value) => (value == null ? '—' : `${numbers.format(value)} km`)

export function formatAge(iso, now = Date.now()) {
  if (!iso) return '—'
  const elapsed = now - new Date(iso).getTime()
  if (elapsed < 0) return 'upravo'
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 60) return `prije ${Math.max(minutes, 1)} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `prije ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `prije ${days} d`
  return shortDate.format(new Date(iso))
}

export const isFresh = (iso, now = Date.now()) => Boolean(iso) && now - new Date(iso).getTime() < DAY_MS
