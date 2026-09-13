import { formatAge, formatKm, formatPrice } from '../lib/format.js'
import { priceDrop } from '../lib/filter.js'
import { sourceLabel } from '../lib/sources.js'

export default function Listing({ listing, fresh, newSinceVisit, now }) {
  const className = ['row', fresh && 'is-fresh', newSinceVisit && 'is-new'].filter(Boolean).join(' ')
  const drop = priceDrop(listing)
  const firstPrice = listing.prices?.[0]?.price

  return (
    <li className={className}>
      <span className="row-marker" aria-hidden="true" />

      {listing.image ? (
        <img
          className="row-image"
          src={listing.image}
          alt=""
          width="112"
          height="84"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="row-image row-image--empty" aria-hidden="true" />
      )}

      <div className="row-main">
        <h2 className="row-title">
          <a href={listing.url} target="_blank" rel="noreferrer">
            {listing.title}
          </a>
        </h2>
        <p className="row-meta">
          {fresh && <span className="badge">novo</span>}
          <span className="row-source">{sourceLabel(listing.source)}</span>
          {listing.sellerName && <span className="row-seller">{listing.sellerName}</span>}
          {listing.location && <span className="row-place">{listing.location}</span>}
          <time dateTime={listing.firstSeenAt}>{formatAge(listing.firstSeenAt, now)}</time>
        </p>
      </div>

      <dl className="row-specs">
        <div className="spec spec--year">
          <dt>Godište</dt>
          <dd>{listing.year ?? '—'}</dd>
        </div>
        <div className="spec spec--km">
          <dt>Kilometraža</dt>
          <dd>{listing.mileage == null ? '—' : formatKm(listing.mileage)}</dd>
        </div>
        <div className="spec spec--fuel">
          <dt>Gorivo</dt>
          <dd>{listing.fuel ?? '—'}</dd>
        </div>
      </dl>

      <p className="row-price">
        {listing.price == null ? 'na upit' : formatPrice(listing.price)}
        {drop > 0 && (
          <span className="row-price-was">
            bilo <s>{formatPrice(firstPrice)}</s>
          </span>
        )}
      </p>
    </li>
  )
}
