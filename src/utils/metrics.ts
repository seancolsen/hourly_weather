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
   * values are arrays of [hourOfDay, value] tuples — one per hour from 0 to
   * 24, except for hours that fall outside the forecast bounds.
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

interface Interval {
  start: Temporal.Instant
  hours: number
  value: number
}

function readIntervals(
  gridData: Record<string, unknown>,
  propertyKey: string,
  convert: (v: number) => number,
): Interval[] {
  const props = gridData.properties as Record<
    string,
    { values: NWSValue[] } | undefined
  >
  const entry = props[propertyKey]
  if (!entry) return []
  const intervals: Interval[] = []
  for (const { validTime, value } of entry.values) {
    if (value === null) continue
    const { start, hours } = parseValidTime(validTime)
    intervals.push({ start, hours, value: convert(value) })
  }
  intervals.sort((a, b) => Temporal.Instant.compare(a.start, b.start))
  return intervals
}

function localHourToInstant(
  date: Temporal.PlainDate,
  hour: number,
  timeZone: string,
): Temporal.Instant {
  const baseDate = hour === 24 ? date.add({ days: 1 }) : date
  const baseHour = hour === 24 ? 0 : hour
  return Temporal.ZonedDateTime.from({
    timeZone,
    year: baseDate.year,
    month: baseDate.month,
    day: baseDate.day,
    hour: baseHour,
  }).toInstant()
}

// Linearly interpolates between adjacent interval starts. Each interval
// contributes a keyframe (start, value); within its duration, the value
// fades toward the next interval's value. After the last interval's start,
// the value is held flat (through its duration).
function valueAtInstant(intervals: Interval[], instant: Temporal.Instant): number {
  const ms = instant.epochMilliseconds
  const lastIdx = intervals.length - 1
  if (ms <= intervals[0].start.epochMilliseconds) return intervals[0].value
  if (ms >= intervals[lastIdx].start.epochMilliseconds) return intervals[lastIdx].value
  for (let i = 0; i < lastIdx; i++) {
    const iv = intervals[i]
    const next = intervals[i + 1]
    const startMs = iv.start.epochMilliseconds
    const nextMs = next.start.epochMilliseconds
    if (ms <= nextMs) {
      if (nextMs === startMs) return iv.value
      const t = (ms - startMs) / (nextMs - startMs)
      return iv.value + (next.value - iv.value) * t
    }
  }
  return intervals[lastIdx].value
}

function makeExtractor(
  propertyKey: string,
  convert: (v: number) => number = (v) => v,
): Metric['extractor'] {
  return (gridData, timeZone) => {
    const intervals = readIntervals(gridData, propertyKey, convert)
    const result = new Map<string, Point[]>()
    if (intervals.length === 0) return result

    const last = intervals[intervals.length - 1]
    const firstInstant = intervals[0].start
    const lastInstant = last.start.add({ seconds: Math.round(last.hours * 3600) })

    const firstLocal = instantToLocal(firstInstant, timeZone)
    const lastLocal = instantToLocal(lastInstant, timeZone)

    let curDate = Temporal.PlainDate.from(firstLocal.date)
    const endDate = Temporal.PlainDate.from(lastLocal.date)

    while (Temporal.PlainDate.compare(curDate, endDate) <= 0) {
      const points: Point[] = []
      for (let h = 0; h <= 24; h++) {
        const instant = localHourToInstant(curDate, h, timeZone)
        if (Temporal.Instant.compare(instant, firstInstant) < 0) continue
        if (Temporal.Instant.compare(instant, lastInstant) > 0) continue
        points.push([h, valueAtInstant(intervals, instant)])
      }
      if (points.length >= 2) result.set(curDate.toString(), points)
      curDate = curDate.add({ days: 1 })
    }

    return result
  }
}

function interpolateInDay(keyframes: Point[], h: number): number {
  if (h <= keyframes[0][0]) return keyframes[0][1]
  const last = keyframes[keyframes.length - 1]
  if (h >= last[0]) return last[1]
  for (let i = 0; i < keyframes.length - 1; i++) {
    const [x0, y0] = keyframes[i]
    const [x1, y1] = keyframes[i + 1]
    if (h <= x1) {
      if (x1 === x0) return y1
      const t = (h - x0) / (x1 - x0)
      return y0 + t * (y1 - y0)
    }
  }
  return last[1]
}

function makeAccumulationExtractor(
  propertyKey: string,
  convert: (v: number) => number = (v) => v,
): Metric['extractor'] {
  return (gridData, timeZone) => {
    const intervals = readIntervals(gridData, propertyKey, convert)
    const result = new Map<string, Point[]>()
    if (intervals.length === 0) return result

    interface DayInterval {
      startHour: number
      endHour: number
      value: number
    }

    // Attribute each NWS interval to the day in which it ends. If it ends
    // exactly at midnight, attribute it to the previous day at hour 24.
    const byDay = new Map<string, DayInterval[]>()
    for (const iv of intervals) {
      const startLocal = instantToLocal(iv.start, timeZone)
      const endInstant = iv.start.add({ seconds: Math.round(iv.hours * 3600) })
      const endLocal = instantToLocal(endInstant, timeZone)
      let date = endLocal.date
      let endHour = endLocal.hour + endLocal.minute / 60
      if (endHour === 0) {
        date = Temporal.PlainDate.from(date).subtract({ days: 1 }).toString()
        endHour = 24
      }
      const startHour =
        startLocal.date === date
          ? startLocal.hour + startLocal.minute / 60
          : 0
      const arr = byDay.get(date) ?? []
      arr.push({ startHour, endHour, value: iv.value })
      byDay.set(date, arr)
    }

    for (const [date, dayIntervals] of byDay) {
      dayIntervals.sort((a, b) => a.startHour - b.startHour)
      const keyframes: Point[] = [[0, 0]]
      let cum = 0
      for (const di of dayIntervals) {
        keyframes.push([di.startHour, cum])
        cum += di.value
        keyframes.push([di.endHour, cum])
      }
      keyframes.push([24, cum])
      const points: Point[] = []
      for (let h = 0; h <= 24; h++) {
        points.push([h, interpolateInDay(keyframes, h)])
      }
      result.set(date, points)
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
