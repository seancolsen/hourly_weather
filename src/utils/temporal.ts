import { Temporal } from 'temporal-polyfill'

export function durationToHours(durationStr: string): number {
  const d = Temporal.Duration.from(durationStr)
  return d.days * 24 + d.hours + d.minutes / 60
}

export function parseValidTime(validTime: string): { start: Temporal.Instant; hours: number } {
  const slashIdx = validTime.indexOf('/')
  const startStr = validTime.slice(0, slashIdx)
  const durationStr = validTime.slice(slashIdx + 1)
  return {
    start: Temporal.Instant.from(startStr),
    hours: durationToHours(durationStr),
  }
}

export function instantToLocal(
  instant: Temporal.Instant,
  timeZone: string,
): { date: string; hour: number; minute: number } {
  const zdt = instant.toZonedDateTimeISO(timeZone)
  return {
    date: zdt.toPlainDate().toString(),
    hour: zdt.hour,
    minute: zdt.minute,
  }
}

export function isoToHourFraction(isoStr: string, timeZone: string): number {
  const instant = Temporal.Instant.from(isoStr)
  const zdt = instant.toZonedDateTimeISO(timeZone)
  return zdt.hour + zdt.minute / 60 + zdt.second / 3600
}
