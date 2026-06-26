import { useMemo } from 'react'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { FeatureCollection } from 'geojson'
import worldTopo from 'world-atlas/countries-110m.json'
import type { Biobank } from '../data/types'

const W = 980
const H = 470

// Land geometry (computed once at module load).
const land = feature(
  worldTopo as never,
  (worldTopo as never as { objects: { countries: never } }).objects.countries,
) as unknown as FeatureCollection

const projection = geoNaturalEarth1().fitExtent(
  [
    [8, 8],
    [W - 8, H - 8],
  ],
  land,
)
const pathGen = geoPath(projection)
const countryPaths = land.features.map((f) => pathGen(f) ?? '')

/**
 * World map (Natural Earth projection) with a marker per biobank, sized by
 * sample size. Hovering/clicking a marker selects the matching biobank card.
 */
export default function WorldMap({
  biobanks,
  selected,
  onSelect,
}: {
  biobanks: Biobank[]
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const maxN = useMemo(
    () => Math.max(...biobanks.map((b) => b.sample_size), 1),
    [biobanks],
  )
  const radius = (n: number) => 4 + (Math.sqrt(n) / Math.sqrt(maxN)) * 9

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="World map of contributing biobanks"
    >
      <rect width={W} height={H} fill="#f1f5f9" rx={8} />
      {countryPaths.map((d, i) => (
        <path key={i} d={d} fill="#dbe3ec" stroke="#fff" strokeWidth={0.5} />
      ))}
      {biobanks.map((b) => {
        const xy = projection([b.lng, b.lat])
        if (!xy) return null
        const [cx, cy] = xy
        const isSel = selected === b.id
        return (
          <g
            key={b.id}
            transform={`translate(${cx} ${cy})`}
            className="cursor-pointer"
            onMouseEnter={() => onSelect(b.id)}
            onMouseLeave={() => onSelect(null)}
            onClick={() => onSelect(b.id)}
          >
            <circle
              r={radius(b.sample_size)}
              fill={isSel ? '#0d5c63' : '#0d9488'}
              fillOpacity={isSel ? 0.95 : 0.65}
              stroke="#fff"
              strokeWidth={1.25}
            />
            {isSel && (
              <text
                y={-radius(b.sample_size) - 5}
                textAnchor="middle"
                className="fill-ink text-[11px] font-semibold"
                style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}
              >
                {b.flag} {b.name}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
