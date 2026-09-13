import { formatAge, formatKm, formatPrice } from '../lib/format.js'
import { priceDrop } from '../lib/filter.js'
import { sourceLabel } from '../lib/sources.js'

const percent = new Intl.NumberFormat('hr-HR', { style: 'percent', maximumFractionDigits: 0 })

export default function Listing({ listing, position, standing, fresh, newSinceVisit, now }) {
  const className = ['row', fresh && 'is-fresh', newSinceVisit && 'is-new'].filter(Boolean).join(' ')
  const drop = priceDrop(listing)

  return (
    <li className={className} data-source={listing.source} data-tone={standing?.tone}>
      <span className="row-pos" aria-hidden="true">
        {position}
      </span>

      {listing.image ? (
        <img
          className="row-image"
          src={listing.image}
          alt=""
          width="128"
          height="96"
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
          {fresh && <span className="badge badge--new">novo</span>}
          {standing?.best && <span className="badge badge--best">P1</span>}
          <span className="row-source">{sourceLabel(listing.source)}</span>
          {listing.sellerName && <span>{listing.sellerName}</span>}
          {listing.location && <span>{listing.location}</span>}
          <time dateTime={listing.firstSeenAt}>{formatAge(listing.firstSeenAt, now)}</time>
        </p>
      </div>

      <dl className="row-specs">
        <div className="spec">
          <dt>Godište</dt>
          <dd>{listing.year ?? '—'}</dd>
        </div>
        <div className="spec">
          <dt>Kilometraža</dt>
          <dd>{listing.mileage == null ? '—' : formatKm(listing.mileage)}</dd>
        </div>
        <div className="spec spec--text">
          <dt>Karoserija</dt>
          <dd>{listing.bodyType ?? '—'}</dd>
        </div>
      </dl>

      <p className="row-price">
        {listing.price == null ? 'na upit' : formatPrice(listing.price)}
        {drop > 0 && (
          <span className="row-price-was">
            bilo <s>{formatPrice(listing.prices[0].price)}</s>
          </span>
        )}
      </p>

      <p className="row-delta" title="Razlika prema medijanu cijene za isti model">
        {standing ? (
          <>
            <span className="row-delta-value">
              {standing.delta > 0 ? '+' : ''}
              {percent.format(standing.delta)}
            </span>
            <span className="row-delta-label">vs medijan</span>
          </>
        ) : (
          <span className="row-delta-value row-delta-value--none">—</span>
        )}
      </p>
    </li>
  )
}
