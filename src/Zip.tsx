import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { parseGridData, type DayForecast } from './utils/nwsParser'
import DayRow from './components/DayRow'

type Centroid = [number, number]

const NWS_HEADERS = { 'User-Agent': 'wthr-app' }

function getInitialHighlight(): number | null {
  const stored = localStorage.getItem('chart_time_highlight_value')
  if (stored !== null) return parseInt(stored, 10)
  return null
}

export default function Zip() {
  const { zipCode } = useParams<{ zipCode: string }>()
  const [centroid, setCentroid] = useState<Centroid | null>(null)
  const [days, setDays] = useState<DayForecast[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedDay, setExpandedDay] = useState(0)
  const [highlightHour, setHighlightHour] = useState<number | null>(getInitialHighlight)
  const [fromCache, setFromCache] = useState(false)

  // Load centroid
  useEffect(() => {
    if (!zipCode) return
    const cacheKey = `zip_centroid_${zipCode}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      setCentroid(JSON.parse(cached))
      return
    }
    fetch('/zip_centroids.json')
      .then((res) => res.json())
      .then((data: Record<string, Centroid>) => {
        const value = data[zipCode]
        if (!value) {
          setError(`No entry found for zip code ${zipCode}`)
          return
        }
        localStorage.setItem(cacheKey, JSON.stringify(value))
        setCentroid(value)
      })
      .catch(() => setError('Failed to load zip code data'))
  }, [zipCode])

  // Fetch NWS data once centroid is available
  useEffect(() => {
    if (!centroid) return
    const [lon, lat] = centroid

    async function load() {
      try {
        const pointsRes = await fetch(
          `https://api.weather.gov/points/${lat},${lon}`,
          { headers: NWS_HEADERS },
        )
        if (!pointsRes.ok) throw new Error('NWS points request failed')
        const pointsData = await pointsRes.json()
        const { forecastGridData, astronomicalData, timeZone } =
          pointsData.properties

        const gridRes = await fetch(forecastGridData, { headers: NWS_HEADERS })
        if (!gridRes.ok) throw new Error('NWS grid request failed')
        const gridData = await gridRes.json()

        const servedFromCache =
          pointsRes.headers.get('X-Data-Source') === 'cache' ||
          gridRes.headers.get('X-Data-Source') === 'cache'
        setFromCache(servedFromCache)

        const parsed = parseGridData(gridData, astronomicalData, timeZone)
        setDays(parsed)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load weather data')
      }
    }

    load()
  }, [centroid])

  // Set initial highlight to hour of max temp on first day
  useEffect(() => {
    if (!days || days.length === 0) return
    if (highlightHour !== null) return
    const temps = days[0].temperature
    if (temps.length === 0) return
    const maxPt = temps.reduce((best, pt) => (pt[1] > best[1] ? pt : best), temps[0])
    const hour = Math.round(maxPt[0])
    setHighlightHour(hour)
    localStorage.setItem('chart_time_highlight_value', String(hour))
  }, [days, highlightHour])

  function handleHighlight(hour: number) {
    setHighlightHour(hour)
    localStorage.setItem('chart_time_highlight_value', String(hour))
  }

  function handleToggle(i: number) {
    setExpandedDay((prev) => (prev === i ? -1 : i))
  }

  const loading = !days && !error

  return (
    <div>
      <header className="bg-gray-900 text-white flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium tracking-wide">
          Weather at:{' '}
          <Link to="/" className="underline">
            {zipCode}
          </Link>
        </span>
        <button className="text-xl leading-none" aria-label="Menu">
          ☰
        </button>
      </header>

      {fromCache && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
          Showing cached forecast — connect to the internet for the latest data.
        </div>
      )}

      {error && <p className="p-4 text-red-600">{error}</p>}
      {loading && <p className="p-4 text-gray-500">Loading…</p>}

      {days && highlightHour !== null && (
        <div>
          {days.map((day, i) => (
            <DayRow
              key={day.date}
              forecast={day}
              isExpanded={expandedDay === i}
              onToggle={() => handleToggle(i)}
              highlightHour={highlightHour}
              onHighlight={handleHighlight}
            />
          ))}
        </div>
      )}
    </div>
  )
}
