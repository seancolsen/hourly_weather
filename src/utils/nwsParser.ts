import { Temporal } from 'temporal-polyfill'
import { computeSunTimes } from './sunTimes'
import { metrics, type MetricKey, type Point } from './metrics'

export type { Point }

export interface DayForecast {
  date: string
  dayName: string
  monthDay: string
  sunrise: number
  sunset: number
  data: Record<MetricKey, Point[]>
}

export function parseGridData(
  gridData: Record<string, unknown>,
  lat: number,
  lon: number,
  timeZone: string,
): DayForecast[] {
  const metricKeys = Object.keys(metrics) as MetricKey[]
  const extracted = {} as Record<MetricKey, Map<string, Point[]>>
  for (const key of metricKeys) {
    extracted[key] = metrics[key].extractor(gridData, timeZone)
  }

  const dateSet = new Set<string>()
  for (const map of Object.values(extracted)) {
    for (const date of map.keys()) dateSet.add(date)
  }
  const dates = [...dateSet].sort()

  return dates.map((date) => {
    const plainDate = Temporal.PlainDate.from(date)
    const dayName = plainDate.toLocaleString('en-US', { weekday: 'long' })
    const monthDay = `${plainDate.month}/${plainDate.day}`
    const { sunrise, sunset } = computeSunTimes(date, lat, lon, timeZone)
    const data = {} as Record<MetricKey, Point[]>
    for (const key of metricKeys) {
      data[key] = extracted[key].get(date) ?? []
    }
    return { date, dayName, monthDay, sunrise, sunset, data }
  })
}
