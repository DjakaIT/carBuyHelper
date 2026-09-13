/**
 * Cijena sama po sebi ne govori je li oglas dobar — govori tek u odnosu na isti model.
 * Zato se za svaki model računa medijan i najniža cijena u trenutnoj listi.
 */
export function marketByModel(listings) {
  const prices = new Map()
  for (const listing of listings) {
    if (listing.price == null || !listing.model) continue
    if (!prices.has(listing.model)) prices.set(listing.model, [])
    prices.get(listing.model).push(listing.price)
  }

  const market = new Map()
  for (const [model, values] of prices) {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    market.set(model, {
      median:
        sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle],
      min: sorted[0],
      count: sorted.length,
    })
  }
  return market
}

export const GOOD_DEAL = -0.1
const ABOVE_MARKET = 0.1

/** Vraća poziciju oglasa prema modelu: postotak razlike i razred za bojanje. */
export function standing(listing, market) {
  const stats = market.get(listing.model)
  if (!stats || listing.price == null || stats.count < 3) return null

  const delta = (listing.price - stats.median) / stats.median
  const best = listing.price === stats.min

  return {
    delta,
    best,
    tone: best ? 'best' : delta <= GOOD_DEAL ? 'good' : delta >= ABOVE_MARKET ? 'high' : 'even',
  }
}
