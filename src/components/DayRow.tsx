import { useRef } from 'react'
import type { DayForecast } from '../utils/nwsParser'
import {
  metrics,
  summarizedMetrics,
  chartMetrics,
  type Point,
} from '../utils/metrics'
import WeatherChart from './WeatherChart'

interface DayRowProps {
  forecast: DayForecast
  isExpanded: boolean
  onToggle: () => void
  highlightHour: number
  onHighlight: (hour: number) => void
}

function summarize(points: Point[], method: 'max' | 'ave'): number {
  if (points.length === 0) return 0
  const values = points.map((p) => p[1])
  if (method === 'max') return Math.max(...values)
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
  const chartDate = `${forecast.dayName} ${forecast.monthDay}`

  return (
    <div className="border-b border-gray-200">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100"
      >
        <span className="text-gray-500 text-sm w-4 flex-shrink-0">
          {isExpanded ? '⯆' : '⯈'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{forecast.dayName}</div>
          <div className="text-sm text-gray-500">{forecast.monthDay}</div>
        </div>
        <div className="flex gap-4 text-sm flex-shrink-0">
          {summarizedMetrics.map(({ metric: key, summarization }) => {
            const m = metrics[key]
            const raw = summarize(forecast.data[key], summarization)
            const val =
              m.chartHorizontalGridLineFrequency < 1
                ? raw.toFixed(2)
                : Math.round(raw)
            return (
              <span
                key={key}
                className="flex flex-col items-center gap-0.5"
              >
                <span>{m.emoji}</span>
                <span className="text-xs font-medium">
                  {val}
                  {m.unitLabel}
                </span>
                <span className="text-xs text-gray-400">{summarization}</span>
              </span>
            )
          })}
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
          {chartMetrics.map((key) => (
            <WeatherChart
              key={key}
              metric={metrics[key]}
              points={forecast.data[key]}
              date={chartDate}
              sunrise={forecast.sunrise}
              sunset={forecast.sunset}
              highlightHour={highlightHour}
              onHighlight={onHighlight}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
