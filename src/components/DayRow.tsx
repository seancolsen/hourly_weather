import { useRef } from 'react'
import type { DayForecast } from '../utils/nwsParser'
import WeatherChart from './WeatherChart'

interface DayRowProps {
  forecast: DayForecast
  isExpanded: boolean
  onToggle: () => void
  highlightHour: number
  onHighlight: (hour: number) => void
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

export default function DayRow({
  forecast,
  isExpanded,
  onToggle,
  highlightHour,
  onHighlight,
}: DayRowProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  const maxTemp = Math.round(Math.max(...forecast.temperature.map((p) => p[1])))
  const avgCloud = Math.round(avg(forecast.cloudCover.map((p) => p[1])))
  const maxPrecip = Math.round(Math.max(...forecast.precipProbability.map((p) => p[1])))
  const avgWind = Math.round(avg(forecast.windSpeed.map((p) => p[1])))

  const chartDate = `${forecast.dayName} ${forecast.monthDay}`
  const sharedChartProps = {
    date: chartDate,
    sunrise: forecast.sunrise,
    sunset: forecast.sunset,
    highlightHour,
    onHighlight,
  }

  return (
    <div className="border-b border-gray-200">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100"
      >
        <span className="text-gray-500 text-sm w-4 flex-shrink-0">
          {isExpanded ? '▼' : '▶'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{forecast.dayName}</div>
          <div className="text-sm text-gray-500">{forecast.monthDay}</div>
        </div>
        <div className="flex gap-4 text-sm flex-shrink-0">
          <span className="flex flex-col items-center gap-0.5">
            <span>🌡️</span>
            <span className="text-xs font-medium">{maxTemp}°F</span>
            <span className="text-xs text-gray-400">max</span>
          </span>
          <span className="flex flex-col items-center gap-0.5">
            <span>☁️</span>
            <span className="text-xs font-medium">{avgCloud}%</span>
            <span className="text-xs text-gray-400">ave</span>
          </span>
          <span className="flex flex-col items-center gap-0.5">
            <span>💧</span>
            <span className="text-xs font-medium">{maxPrecip}%</span>
            <span className="text-xs text-gray-400">max</span>
          </span>
          <span className="flex flex-col items-center gap-0.5">
            <span>💨</span>
            <span className="text-xs font-medium">{avgWind}mph</span>
            <span className="text-xs text-gray-400">ave</span>
          </span>
        </div>
      </button>

      {/* Expandable chart section */}
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: isExpanded
            ? contentRef.current
              ? `${contentRef.current.scrollHeight}px`
              : '9999px'
            : '0px',
        }}
      >
        <div className="pb-4">
          <WeatherChart
            {...sharedChartProps}
            title="Temperature"
            icon="🌡️"
            points={forecast.temperature}
            unit="°F"
            color="#e05c3a"
          />
          <WeatherChart
            {...sharedChartProps}
            title="Clouds"
            icon="☁️"
            points={forecast.cloudCover}
            unit="%"
            color="#888888"
          />
          <WeatherChart
            {...sharedChartProps}
            title="Chance of Rain"
            icon="💧"
            points={forecast.precipProbability}
            unit="%"
            color="#4a7fc1"
          />
        </div>
      </div>
    </div>
  )
}
