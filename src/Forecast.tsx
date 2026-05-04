import { useEffect, useRef, useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import { useNavigate, useParams } from 'react-router-dom'
import { parseGridData, type DayForecast } from './utils/nwsParser'
import { summarizedMetrics } from './utils/metrics'
import DayRow from './components/DayRow'
import Button from './components/Button'

type Centroid = [number, number]

type PointsCache = {
  forecastGridData: string
  timeZone: string
  fetchedAt: number
}

const NWS_HEADERS = { 'User-Agent': 'wthr-app' }
const POINTS_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000

function pointsCacheKey(lat: number, lon: number) {
  return `points_${lat}_${lon}`
}

function readPointsCache(key: string): PointsCache | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PointsCache
  } catch {
    return null
  }
}

async function fetchPoints(lat: number, lon: number) {
  const res = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: NWS_HEADERS,
  })
  if (!res.ok) throw new Error('NWS points request failed')
  const data = await res.json()
  return {
    forecastGridData: data.properties.forecastGridData as string,
    timeZone: data.properties.timeZone as string,
  }
}

function getInitialHighlight(): number | null {
  const stored = localStorage.getItem('chart_time_highlight_value')
  if (stored !== null) return parseInt(stored, 10)
  return null
}

export default function Forecast() {
  const { zipCode } = useParams<{ zipCode: string }>()
  const navigate = useNavigate()
  const [centroid, setCentroid] = useState<Centroid | null>(null)
  const [days, setDays] = useState<DayForecast[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedDay, setExpandedDay] = useState(0)
  const [timeZone, setTimeZone] = useState<string | null>(null)
  const initialExpandSet = useRef(false)
  const [highlightHour, setHighlightHour] = useState<number | null>(getInitialHighlight)
  const [fromCache, setFromCache] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [zipInput, setZipInput] = useState(zipCode ?? '')
  const editFormRef = useRef<HTMLFormElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)

  // Load centroid
  useEffect(() => {
    if (!zipCode) return
    const cacheKey = `zip_centroid_${zipCode}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      localStorage.setItem('last_zip', zipCode)
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
        localStorage.setItem('last_zip', zipCode)
        setCentroid(value)
      })
      .catch(() => setError('Failed to load zip code data'))
  }, [zipCode])

  // Fetch NWS data once centroid is available
  useEffect(() => {
    if (!centroid) return
    const [lon, lat] = centroid
    const cacheKey = pointsCacheKey(lat, lon)
    let cancelled = false

    async function loadGrid(points: PointsCache) {
      const gridRes = await fetch(points.forecastGridData, { headers: NWS_HEADERS })
      if (!gridRes.ok) throw new Error('NWS grid request failed')
      const gridData = await gridRes.json()
      if (cancelled) return
      setFromCache(gridRes.headers.get('X-Data-Source') === 'cache')
      setTimeZone(points.timeZone)
      setDays(parseGridData(gridData, lat, lon, points.timeZone))
    }

    async function revalidate(current: PointsCache) {
      try {
        const fresh = await fetchPoints(lat, lon)
        if (cancelled) return
        const unchanged =
          fresh.forecastGridData === current.forecastGridData &&
          fresh.timeZone === current.timeZone
        const updated: PointsCache = { ...fresh, fetchedAt: Date.now() }
        localStorage.setItem(cacheKey, JSON.stringify(updated))
        if (unchanged) return
        setDays(null)
        await loadGrid(updated)
      } catch {
        // Background revalidation failure is non-fatal
      }
    }

    async function run() {
      try {
        const cached = readPointsCache(cacheKey)
        if (cached) {
          await loadGrid(cached)
          if (Date.now() - cached.fetchedAt > POINTS_CACHE_TTL_MS) {
            revalidate(cached)
          }
          return
        }
        const fresh = await fetchPoints(lat, lon)
        if (cancelled) return
        const entry: PointsCache = { ...fresh, fetchedAt: Date.now() }
        localStorage.setItem(cacheKey, JSON.stringify(entry))
        await loadGrid(entry)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load weather data')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [centroid])

  // Set initial highlight to hour of max temp on first day
  useEffect(() => {
    if (!days || days.length === 0) return
    if (highlightHour !== null) return
    const temps = days[0].data.temperature
    if (temps.length === 0) return
    const maxPt = temps.reduce((best, pt) => (pt[1] > best[1] ? pt : best), temps[0])
    const hour = Math.round(maxPt[0])
    setHighlightHour(hour)
    localStorage.setItem('chart_time_highlight_value', String(hour))
  }, [days, highlightHour])

  // Open tomorrow by default when loaded after today's sunset
  useEffect(() => {
    if (!days || days.length < 2 || !timeZone) return
    if (initialExpandSet.current) return
    initialExpandSet.current = true
    const now = Temporal.Now.zonedDateTimeISO(timeZone)
    const nowHour = now.hour + now.minute / 60
    if (nowHour > days[0].sunset) setExpandedDay(1)
  }, [days, timeZone])

  async function handleRefresh() {
    if (!centroid || isRefreshing) return
    const [lon, lat] = centroid
    setIsRefreshing(true)
    setError(null)
    try {
      const fresh = await fetchPoints(lat, lon)
      const entry: PointsCache = { ...fresh, fetchedAt: Date.now() }
      localStorage.setItem(pointsCacheKey(lat, lon), JSON.stringify(entry))
      const gridRes = await fetch(fresh.forecastGridData, { headers: NWS_HEADERS })
      if (!gridRes.ok) throw new Error('NWS grid request failed')
      const gridData = await gridRes.json()
      setFromCache(gridRes.headers.get('X-Data-Source') === 'cache')
      setTimeZone(fresh.timeZone)
      setDays(parseGridData(gridData, lat, lon, fresh.timeZone))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load weather data')
    } finally {
      setIsRefreshing(false)
    }
  }

  function handleHighlight(hour: number) {
    setHighlightHour(hour)
    localStorage.setItem('chart_time_highlight_value', String(hour))
  }

  function handleToggle(i: number) {
    setExpandedDay((prev) => (prev === i ? -1 : i))
  }

  function handleZipSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = zipInput.trim()
    if (!trimmed) return
    if (trimmed !== zipCode) navigate(`/${trimmed}`)
    zipInputRef.current?.blur()
  }

  function resetZipInput() {
    setZipInput(zipCode ?? '')
  }

  function handleZipBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (editFormRef.current?.contains(e.relatedTarget as Node | null)) return
    resetZipInput()
  }

  function handleZipKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      resetZipInput()
      e.currentTarget.blur()
    }
  }

  // Keep input in sync when the URL zip changes (e.g. after submit-driven navigation).
  useEffect(() => {
    setZipInput(zipCode ?? '')
  }, [zipCode])

  // Click outside the form blurs whatever inside it has focus (browsers don't blur on clicks to non-focusable elements).
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      const form = editFormRef.current
      if (!form || form.contains(e.target as Node)) return
      const active = document.activeElement
      if (active instanceof HTMLElement && form.contains(active)) active.blur()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const loading = !days && !error
  const spinning = loading || isRefreshing

  return (
    <div>
      <header className="bg-gray-900 text-white flex items-center justify-between px-4 py-2">
        <span className="text-sm font-medium tracking-wide flex items-center gap-2">
          Weather at:
          <form
            ref={editFormRef}
            onSubmit={handleZipSubmit}
            className="group inline-flex items-center gap-2"
          >
            <input
              ref={zipInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={zipInput}
              onChange={(e) => setZipInput(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={handleZipBlur}
              onKeyDown={handleZipKeyDown}
              className="bg-transparent text-white text-sm w-14 px-1 py-0.5 border border-transparent border-b-white rounded-none focus:outline-none focus:border-white focus:rounded-sm"
            />
            <Button type="submit" className="px-2! py-0.5! invisible group-focus-within:visible">
              Go
            </Button>
          </form>
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={spinning || !centroid}
            className="leading-none disabled:opacity-50 cursor-pointer"
            aria-label="Refresh"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-5 h-5 ${spinning ? 'animate-spin' : ''}`}
            >
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          <button className="text-xl leading-none" aria-label="Menu">
            ☰
          </button>
        </div>
      </header>

      {fromCache && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
          Showing cached forecast — connect to the internet for the latest data.
        </div>
      )}

      {error && <p className="p-4 text-red-600">{error}</p>}
      {loading && <p className="p-4 text-gray-500">Loading…</p>}

      {days && highlightHour !== null && (
        <div
          className="grid"
          style={{
            gridTemplateColumns: `1fr repeat(${summarizedMetrics.length}, auto)`,
          }}
        >
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
