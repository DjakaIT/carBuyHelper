import { useEffect, useRef } from 'react'
import { EMPTY_FILTERS, SORT_OPTIONS, isFiltered } from '../lib/filter.js'
import { autoscout24Url, njuskaloScope, njuskaloUrl } from '../lib/outbound.js'
import { sourceLabel } from '../lib/sources.js'

const COUNTRY_LABELS = {
  HR: 'Hrvatska',
  SI: 'Slovenija',
  BA: 'BiH',
  DE: 'Njemačka',
  AT: 'Austrija',
  IT: 'Italija',
  NL: 'Nizozemska',
  BE: 'Belgija',
  FR: 'Francuska',
  ES: 'Španjolska',
  LU: 'Luksemburg',
}

function Toggle({ pressed, onClick, children, source }) {
  return (
    <button
      type="button"
      className="chip"
      data-source={source}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default function Filters({
  facets,
  filters,
  onChange,
  shown,
  total,
  defaults,
  criteria,
  outbound: overrides,
  models,
}) {
  const searchRef = useRef(null)

  // Pretraga kod samog izvora, s istim kriterijima: za portale koje ne dohvaćamo (Njuškalo)
  // i za tržišta koja nisu uključena (Njemačka, Austrija). Ako je model odabran, link ga slijedi.
  const chosen = (models ?? []).filter(
    (model) => filters.models.length === 0 || filters.models.includes(model.model),
  )
  // Gumb kaže što će stvarno otvoriti: pretragu po modelima, po marki ili po svim markama.
  const njuskaloLabels = {
    models: 'Njuškalo',
    make: 'Njuškalo (cijela marka)',
    all: 'Njuškalo (sve marke)',
  }
  const outbound = [
    {
      id: 'njuskalo',
      label: njuskaloLabels[njuskaloScope(chosen)],
      href: njuskaloUrl(criteria, chosen, overrides),
    },
    {
      id: 'autoscout24',
      label: 'AutoScout24 (DE, AT)',
      href: autoscout24Url(criteria, chosen.length === 1 ? chosen[0] : null, ['DE', 'AT'], overrides),
    },
  ].filter((link) => link.href)

  // Tipka "/" vodi na pretragu — lista se skenira tipkovnicom, ne mišem.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return
      if (document.activeElement?.matches('input, select, textarea')) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const set = (patch) => onChange({ ...filters, ...patch })
  const toggle = (key, value) =>
    set({
      [key]: filters[key].includes(value)
        ? filters[key].filter((item) => item !== value)
        : [...filters[key], value],
    })

  return (
    <form className="filters" onSubmit={(event) => event.preventDefault()}>
      <div className="filters-row">
        <label className="field field--search">
          <span className="field-label">Pretraga</span>
          <input
            ref={searchRef}
            type="search"
            value={filters.query}
            placeholder="naslov, oprema, mjesto"
            onChange={(event) => set({ query: event.target.value })}
          />
          <kbd aria-hidden="true">/</kbd>
        </label>

        <div className="chips" role="group" aria-label="Izvor">
          {facets.sources.map((source) => (
            <Toggle
              key={source}
              pressed={filters.sources.includes(source)}
              source={source}
              onClick={() => toggle('sources', source)}
            >
              {sourceLabel(source)}
            </Toggle>
          ))}
        </div>

        {facets.countries.length > 1 && (
          <div className="chips" role="group" aria-label="Država">
            {facets.countries.map((country) => (
              <Toggle
                key={country}
                pressed={filters.countries.includes(country)}
                onClick={() => toggle('countries', country)}
              >
                {COUNTRY_LABELS[country] ?? country}
              </Toggle>
            ))}
          </div>
        )}

        <div className="chips" role="group" aria-label="Prodavač">
          {['salon', 'privatno'].map((type) => (
            <Toggle
              key={type}
              pressed={filters.sellerTypes.includes(type)}
              onClick={() => toggle('sellerTypes', type)}
            >
              {type}
            </Toggle>
          ))}
        </div>

        <Toggle pressed={filters.freshOnly} onClick={() => set({ freshOnly: !filters.freshOnly })}>
          samo novo
        </Toggle>

        <Toggle
          pressed={filters.droppedOnly}
          onClick={() => set({ droppedOnly: !filters.droppedOnly })}
        >
          pala cijena
        </Toggle>
      </div>

      <div className="chips chips--models" role="group" aria-label="Model">
        {facets.models.map((model) => (
          <Toggle
            key={model}
            pressed={filters.models.includes(model)}
            onClick={() => toggle('models', model)}
          >
            {model}
          </Toggle>
        ))}
      </div>

      <div className="filters-row filters-row--numbers">
        <label className="field field--number">
          <span className="field-label">Cijena do (€)</span>
          <input
            type="number"
            min="0"
            step="500"
            inputMode="numeric"
            value={filters.priceMax}
            onChange={(event) => set({ priceMax: event.target.value })}
          />
        </label>
        <label className="field field--number">
          <span className="field-label">Godište od</span>
          <input
            type="number"
            min="1990"
            max="2030"
            inputMode="numeric"
            value={filters.yearMin}
            onChange={(event) => set({ yearMin: event.target.value })}
          />
        </label>
        <label className="field field--number">
          <span className="field-label">Kilometraža do</span>
          <input
            type="number"
            min="0"
            step="5000"
            inputMode="numeric"
            value={filters.mileageMax}
            onChange={(event) => set({ mileageMax: event.target.value })}
          />
        </label>
        <label className="field field--sort">
          <span className="field-label">Sortiraj</span>
          <select value={filters.sort} onChange={(event) => set({ sort: event.target.value })}>
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <p className="filters-count" role="status">
          {shown === total ? `${total} oglasa` : `${shown} od ${total} oglasa`}
        </p>

        {isFiltered(filters, defaults) && (
          <button
            type="button"
            className="reset"
            onClick={() => onChange({ ...(defaults ?? EMPTY_FILTERS), sort: filters.sort })}
          >
            Očisti filtere
          </button>
        )}
      </div>
      {outbound.length > 0 && (
        <div className="outbound">
          <span className="outbound-label">Otvori pretragu kod izvora</span>
          {outbound.map((link) => (
            <a
              key={link.id}
              className="outbound-link"
              data-portal={link.id}
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </form>
  )
}
