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
  const nowZdt = Temporal.Now.zonedDateTimeISO(timeZone)
  const today = nowZdt.toPlainDate().toString()
  const nowHour = nowZdt.hour + nowZdt.minute / 60
  const dates = [...dateSet].sort().filter((d) => d >= today)

  return dates.map((date) => {
    const plainDate = Temporal.PlainDate.from(date)
    const dayName = plainDate.toLocaleString('en-US', { weekday: 'short' })
    const monthDay = `${plainDate.month}/${plainDate.day}`
    const { sunrise, sunset } = computeSunTimes(date, lat, lon, timeZone)
    const data = {} as Record<MetricKey, Point[]>
    for (const key of metricKeys) {
      const points = extracted[key].get(date) ?? []
      data[key] =
        date === today ? points.filter((pt) => pt[0] >= nowHour) : points
    }
    return { date, dayName, monthDay, sunrise, sunset, data }
  })
}
