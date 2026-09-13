import { useEffect, useMemo, useState } from 'react'
import Filters from './components/Filters.jsx'
import Listing from './components/Listing.jsx'
import { DAY_MS, isFresh } from './lib/format.js'
import { EMPTY_FILTERS, applyFilters } from './lib/filter.js'
import { marketByModel, standing } from './lib/market.js'
import './App.css'

const DATA_URL = `${import.meta.env.BASE_URL}data/listings.json`
// Trenutak učitavanja: "novo u 24 h" i relativna vremena ne smiju se pomicati pri svakom renderu.
const OPENED_AT = Date.now()
const VISIT_KEY = 'autoradar:lastVisit'

const numbers = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 0 })

function describeCriteria(criteria) {
  if (!criteria) return ''
  return [
    criteria.fuelAllow?.join(' ili '),
    criteria.yearMin && `godište ${criteria.yearMin}+`,
    criteria.priceMax && `do ${numbers.format(criteria.priceMax)} €`,
    criteria.mileageMax && `do ${numbers.format(criteria.mileageMax)} km`,
    criteria.bodyTypes?.join(' i '),
  ]
    .filter(Boolean)
    .join(', ')
}

// Oglasi pristigli od zadnjeg posjeta jednom bljesnu pri učitavanju — jedina animacija u listi.
function readLastVisit() {
  try {
    return Number(localStorage.getItem(VISIT_KEY)) || 0
  } catch {
    return 0
  }
}

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [lastVisit] = useState(readLastVisit)
  const now = OPENED_AT

  useEffect(() => {
    let cancelled = false
    fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json) => !cancelled && setData(json))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(VISIT_KEY, String(Date.now()))
    } catch {
      // privatni prozor ili blokirana pohrana — highlight otpada, ostalo radi
    }
  }, [])

  const listings = useMemo(() => data?.listings ?? [], [data])

  const facets = useMemo(
    () => ({
      sources: [...new Set(listings.map((listing) => listing.source))].sort(),
      models: [...new Set(listings.map((listing) => listing.model).filter(Boolean))].sort(),
    }),
    [listings],
  )

  const shown = useMemo(() => applyFilters(listings, filters, now - DAY_MS), [listings, filters, now])

  // Referenca za "vs medijan" je cijela baza, ne trenutni filtar — inače se mjerilo mijenja
  // svaki put kad se suzi izbor.
  const market = useMemo(() => marketByModel(listings), [listings])

  const freshCount = listings.filter((listing) => isFresh(listing.firstSeenAt, now)).length

  return (
    <>
      <header className="masthead">
        <div className="masthead-brand">
          <h1>
            Auto<span>Radar</span>
          </h1>
          <p>{describeCriteria(data?.criteria)}</p>
        </div>
        <dl className="masthead-stats">
          <div>
            <dt>Oglasa</dt>
            <dd>{listings.length}</dd>
          </div>
          <div>
            <dt>Novih u 24 h</dt>
            <dd>{freshCount}</dd>
          </div>
          <div>
            <dt>Osvježeno</dt>
            <dd>
              {data?.generatedAt
                ? new Intl.DateTimeFormat('hr-HR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(data.generatedAt))
                : '—'}
            </dd>
          </div>
        </dl>
      </header>

      <main>
        {error && (
          <p className="notice notice--error">
            Podaci se ne mogu učitati ({error}). Pokreni <code>npm run refresh</code>.
          </p>
        )}

        {!error && !data && <p className="notice">Učitavam oglase…</p>}

        {data && (
          <>
            <Filters
              facets={facets}
              filters={filters}
              onChange={setFilters}
              shown={shown.length}
              total={listings.length}
            />

            {shown.length === 0 ? (
              <p className="notice">Nijedan oglas ne odgovara filterima.</p>
            ) : (
              <>
                <div className="list-head" aria-hidden="true">
                  <span>#</span>
                  <span />
                  <span>Vozilo</span>
                  <span>Godište</span>
                  <span>Kilometraža</span>
                  <span>Karoserija</span>
                  <span>Cijena</span>
                  <span>Delta</span>
                </div>
                <ol className="list">
                  {shown.map((listing, index) => (
                    <Listing
                      key={listing.id}
                      listing={listing}
                      position={index + 1}
                      standing={standing(listing, market)}
                      now={now}
                      fresh={isFresh(listing.firstSeenAt, now)}
                      newSinceVisit={
                        lastVisit > 0 && new Date(listing.firstSeenAt).getTime() > lastVisit
                      }
                    />
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </main>
    </>
  )
}
