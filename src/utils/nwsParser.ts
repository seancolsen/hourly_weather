import { Temporal } from 'temporal-polyfill'
import { parseValidTime, instantToLocal, isoToHourFraction } from './temporal'

export type Point = [number, number]

export interface DayForecast {
  date: string
  dayName: string
  monthDay: string
  sunrise: number
  sunset: number
  temperature: Point[]
  cloudCover: Point[]
  precipProbability: Point[]
  windSpeed: Point[]
}

interface NWSValue {
  validTime: string
  value: number | null
}

function extractPointsForDate(
  values: NWSValue[],
  timeZone: string,
  targetDate: string,
  convert: (v: number) => number = (v) => v,
): Point[] {
  const points: Point[] = []

  for (const { validTime, value } of values) {
    if (value === null) continue
    const { start, hours } = parseValidTime(validTime)
    const local = instantToLocal(start, timeZone)

    if (local.date === targetDate) {
      points.push([local.hour + local.minute / 60, convert(value)])
    } else if (local.date < targetDate) {
      // Interval starts before targetDate — check if it spans into it
      const endInstant = start.add({ hours: Math.ceil(hours) })
      const endLocal = instantToLocal(endInstant, timeZone)
      if (endLocal.date >= targetDate) {
        points.push([0, convert(value)])
      }
    }
  }

  return points.sort((a, b) => a[0] - b[0])
}

export function parseGridData(
  gridData: Record<string, unknown>,
  astronomicalData: { sunrise: string; sunset: string },
  timeZone: string,
): DayForecast[] {
  const props = gridData.properties as Record<string, { values: NWSValue[] }>

  const sunrise = isoToHourFraction(astronomicalData.sunrise, timeZone)
  const sunset = isoToHourFraction(astronomicalData.sunset, timeZone)

  // Collect all dates from temperature data
  const dateSet = new Set<string>()
  for (const { validTime } of props.temperature.values) {
    const { start } = parseValidTime(validTime)
    const local = instantToLocal(start, timeZone)
    dateSet.add(local.date)
  }
  const dates = [...dateSet].sort()

  return dates.map((date) => {
    const plainDate = Temporal.PlainDate.from(date)
    const dayName = plainDate.toLocaleString('en-US', { weekday: 'long' })
    const monthDay = `${plainDate.month}/${plainDate.day}`

    return {
      date,
      dayName,
      monthDay,
      sunrise,
      sunset,
      temperature: extractPointsForDate(
        props.temperature.values,
        timeZone,
        date,
        (v) => (v * 9) / 5 + 32,
      ),
      cloudCover: extractPointsForDate(props.skyCover.values, timeZone, date),
      precipProbability: extractPointsForDate(
        props.probabilityOfPrecipitation.values,
        timeZone,
        date,
      ),
      windSpeed: extractPointsForDate(
        props.windSpeed.values,
        timeZone,
        date,
        (v) => v * 0.621371,
      ),
    }
  })
}
