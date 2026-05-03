import { Temporal } from 'temporal-polyfill'
import { parseValidTime, instantToLocal } from './temporal'

export type Point = [number, number]

export interface Metric {
  /** e.g. "Temperature" */
  name: string

  /** e.g. "🌡️" */
  emoji: string

  /** e.g. "%" or "°F" */
  unitLabel: string

  /** null for auto range, object with min/max for fixed range */
  chartRange: { min: number; max: number } | null

  /** spacing between horizontal grid lines, in metric units */
  chartHorizontalGridLineFrequency: number

  /** a CSS color value */
  plotColor: string

  /**
   * Takes the NWS gridpoints API response and produces one entry per day
   * shown on the forecast page. Keys are ISO-formatted dates (no time);
   * values are arrays of [hourOfDay, value] tuples.
   */
  extractor: (
    gridData: Record<string, unknown>,
    timeZone: string,
  ) => Map<string, Point[]>
}

interface NWSValue {
  validTime: string
  value: number | null
}

function makeExtractor(
  propertyKey: string,
  convert: (v: number) => number = (v) => v,
): Metric['extractor'] {
  return (gridData, timeZone) => {
    const props = gridData.properties as Record<
      string,
      { values: NWSValue[] } | undefined
    >
    const entry = props[propertyKey]
    const result = new Map<string, Point[]>()
    if (!entry) return result

    const push = (date: string, point: Point) => {
      const arr = result.get(date)
      if (arr) arr.push(point)
      else result.set(date, [point])
    }

    for (const { validTime, value } of entry.values) {
      if (value === null) continue
      const { start, hours } = parseValidTime(validTime)
      const startLocal = instantToLocal(start, timeZone)
      const converted = convert(value)

      push(startLocal.date, [
        startLocal.hour + startLocal.minute / 60,
        converted,
      ])

      // If the interval extends past its start date, add a hour-0 point on
      // each subsequent date it spans into.
      const endInstant = start.add({ hours: Math.ceil(hours) })
      const endDate = instantToLocal(endInstant, timeZone).date
      let cur = Temporal.PlainDate.from(startLocal.date)
      const endPlain = Temporal.PlainDate.from(endDate)
      while (Temporal.PlainDate.compare(cur, endPlain) < 0) {
        cur = cur.add({ days: 1 })
        if (Temporal.PlainDate.compare(cur, endPlain) <= 0) {
          push(cur.toString(), [0, converted])
        }
      }
    }

    for (const points of result.values()) {
      points.sort((a, b) => a[0] - b[0])
    }
    return result
  }
}

function makeAccumulationExtractor(
  propertyKey: string,
  convert: (v: number) => number = (v) => v,
): Metric['extractor'] {
  return (gridData, timeZone) => {
    const props = gridData.properties as Record<
      string,
      { values: NWSValue[] } | undefined
    >
    const entry = props[propertyKey]
    const result = new Map<string, Point[]>()
    if (!entry) return result

    const sorted = [...entry.values].sort((a, b) =>
      a.validTime.localeCompare(b.validTime),
    )

    const dailyTotals = new Map<string, number>()
    const ensureDay = (date: string) => {
      if (!result.has(date)) result.set(date, [[0, 0]])
    }

    for (const { validTime, value } of sorted) {
      if (value === null) continue
      const { start, hours } = parseValidTime(validTime)
      const endInstant = start.add({ seconds: Math.round(hours * 3600) })
      const endLocal = instantToLocal(endInstant, timeZone)
      const startLocal = instantToLocal(start, timeZone)
      const converted = convert(value)

      // Attribute the period to the day in which it ends. If it ends exactly
      // at midnight, attribute to the previous day at hour 24.
      let date = endLocal.date
      let endHour = endLocal.hour + endLocal.minute / 60
      if (endHour === 0) {
        date = Temporal.PlainDate.from(date).subtract({ days: 1 }).toString()
        endHour = 24
      }

      ensureDay(date)
      const prev = dailyTotals.get(date) ?? 0

      // Emit a point at the start of the period (within this day) so that gaps
      // between periods render as flat segments rather than ramps.
      const startHour =
        startLocal.date === date
          ? startLocal.hour + startLocal.minute / 60
          : 0
      result.get(date)!.push([startHour, prev])

      const newTotal = prev + converted
      dailyTotals.set(date, newTotal)
      result.get(date)!.push([endHour, newTotal])
    }

    for (const points of result.values()) {
      points.sort((a, b) => a[0] - b[0])
    }
    return result
  }
}

export const metrics = {
  temperature: {
    name: 'Temperature',
    emoji: '🌡️',
    unitLabel: '°F',
    chartRange: null,
    chartHorizontalGridLineFrequency: 10,
    plotColor: '#e05c3a',
    extractor: makeExtractor('temperature', (v) => (v * 9) / 5 + 32),
  },
  skyCover: {
    name: 'Clouds',
    emoji: '☁️',
    unitLabel: '%',
    chartRange: { min: 0, max: 100 },
    chartHorizontalGridLineFrequency: 10,
    plotColor: '#888888',
    extractor: makeExtractor('skyCover'),
  },
  probabilityOfPrecipitation: {
    name: 'Chance of Rain',
    emoji: '☔',
    unitLabel: '%',
    chartRange: { min: 0, max: 100 },
    chartHorizontalGridLineFrequency: 10,
    plotColor: '#4a7fc1',
    extractor: makeExtractor('probabilityOfPrecipitation'),
  },
  windSpeed: {
    name: 'Wind Speed',
    emoji: '🍃',
    unitLabel: 'mph',
    chartRange: { min: 0, max: 40 },
    chartHorizontalGridLineFrequency: 10,
    plotColor: '#6b9bd1',
    extractor: makeExtractor('windSpeed', (v) => v * 0.621371),
  },
  quantitativePrecipitation: {
    name: 'Rain Accumulation',
    emoji: '🪣',
    unitLabel: 'in',
    chartRange: { min: 0, max: 2 },
    chartHorizontalGridLineFrequency: 0.25,
    plotColor: '#3a6ea5',
    extractor: makeAccumulationExtractor(
      'quantitativePrecipitation',
      (mm) => mm / 25.4,
    ),
  },
} satisfies Record<string, Metric>

export type MetricKey = keyof typeof metrics

export interface SummarizedMetric {
  metric: MetricKey
  summarization: 'max' | 'ave'
}

export const summarizedMetrics: SummarizedMetric[] = [
  { metric: 'temperature', summarization: 'max' },
  { metric: 'skyCover', summarization: 'ave' },
  { metric: 'probabilityOfPrecipitation', summarization: 'ave' },
  { metric: 'quantitativePrecipitation', summarization: 'max' },
  { metric: 'windSpeed', summarization: 'ave' },
]

export const chartMetrics: MetricKey[] = [
  'temperature',
  'skyCover',
  'probabilityOfPrecipitation',
  'quantitativePrecipitation',
  'windSpeed',
]
