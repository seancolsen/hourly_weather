import SunCalc from 'suncalc'
import { isoToHourFraction } from './temporal'

export function computeSunTimes(
  date: string,
  lat: number,
  lon: number,
  timeZone: string,
): { sunrise: number; sunset: number } {
  const jsDate = new Date(date)
  const times = SunCalc.getTimes(jsDate, lat, lon)
  return {
    sunrise: isoToHourFraction(times.sunrise.toISOString(), timeZone),
    sunset: isoToHourFraction(times.sunset.toISOString(), timeZone),
  }
}
