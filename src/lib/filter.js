const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/** Pad u odnosu na prvu zabiljezenu cijenu; 0 kad oglas nije mijenjao cijenu. */
export function priceDrop(listing) {
  const first = listing.prices?.[0]?.price
  if (first == null || listing.price == null || listing.price >= first) return 0
  return first - listing.price
}

const SORTS = {
  najnovije: (a, b) =>
    compare(b.firstSeenAt, a.firstSeenAt) || compare(b.postedAt ?? '', a.postedAt ?? ''),
  jeftinije: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  skuplje: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity),
  'manje-km': (a, b) => (a.mileage ?? Infinity) - (b.mileage ?? Infinity),
  novije: (a, b) => (b.year ?? 0) - (a.year ?? 0),
  pad: (a, b) => priceDrop(b) - priceDrop(a),
}

export const SORT_OPTIONS = [
  ['najnovije', 'najnovije prvo'],
  ['jeftinije', 'niža cijena'],
  ['skuplje', 'viša cijena'],
  ['manje-km', 'manje kilometara'],
  ['novije', 'novije godište'],
  ['pad', 'najveći pad cijene'],
]

export const EMPTY_FILTERS = {
  query: '',
  sources: [],
  sellerTypes: [],
  countries: [],
  models: [],
  priceMax: '',
  yearMin: '',
  mileageMax: '',
  freshOnly: false,
  droppedOnly: false,
  sort: 'najnovije',
}

export const isFiltered = (filters, defaults = EMPTY_FILTERS) =>
  Object.keys(EMPTY_FILTERS).some(
    (key) => key !== 'sort' && String(filters[key]) !== String(defaults[key] ?? EMPTY_FILTERS[key]),
  )

export function applyFilters(listings, filters, freshSince) {
  const query = filters.query.trim().toLowerCase()
  const priceMax = Number(filters.priceMax) || Infinity
  const yearMin = Number(filters.yearMin) || 0
  const mileageMax = Number(filters.mileageMax) || Infinity

  const result = listings.filter((listing) => {
    if (filters.sources.length && !filters.sources.includes(listing.source)) return false
    if (filters.sellerTypes.length && !filters.sellerTypes.includes(listing.sellerType)) return false
    if (filters.countries.length && !filters.countries.includes(listing.country)) return false
    if (filters.models.length && !filters.models.includes(listing.model)) return false
    if ((listing.price ?? 0) > priceMax) return false
    if (yearMin && (listing.year ?? 0) < yearMin) return false
    if ((listing.mileage ?? 0) > mileageMax) return false
    if (filters.freshOnly && new Date(listing.firstSeenAt).getTime() < freshSince) return false
    if (filters.droppedOnly && priceDrop(listing) === 0) return false
    if (query) {
      const haystack = `${listing.title} ${listing.location ?? ''} ${listing.excerpt ?? ''}`
      if (!haystack.toLowerCase().includes(query)) return false
    }
    return true
  })

  return result.sort(SORTS[filters.sort] ?? SORTS.najnovije)
}
