import type { Point } from '../utils/nwsParser'

interface WeatherChartProps {
  title: string
  date: string
  icon: string
  points: Point[]
  unit: string
  color: string
  sunrise: number
  sunset: number
  highlightHour: number
  onHighlight: (hour: number) => void
}

// SVG coordinate system
const VB_W = 800
const VB_H = 160
const ML = 42 // left margin (y-axis labels)
const MR = 10
const MT = 8
const MB = 28 // bottom margin (x-axis labels)
const CW = VB_W - ML - MR // chart width: 748
const CH = VB_H - MT - MB // chart height: 124

function hourToSvgX(hour: number): number {
  return ML + (hour / 24) * CW
}

function valToSvgY(val: number, yMin: number, yMax: number): number {
  return MT + ((yMax - val) / (yMax - yMin)) * CH
}

function autoRange(points: Point[]): { yMin: number; yMax: number } {
  if (points.length === 0) return { yMin: 0, yMax: 100 }
  const vals = points.map((p) => p[1])
  const dataMin = Math.min(...vals)
  const dataMax = Math.max(...vals)
  const span = dataMax - dataMin
  const pad = Math.max(span * 0.15, 5)
  const yMin = Math.floor((dataMin - pad) / 10) * 10
  const yMax = Math.ceil((dataMax + pad) / 10) * 10
  return { yMin, yMax }
}

function catmullRomPath(svgPoints: [number, number][]): string {
  if (svgPoints.length < 2) return ''
  const parts: string[] = [`M ${svgPoints[0][0]} ${svgPoints[0][1]}`]
  for (let i = 0; i < svgPoints.length - 1; i++) {
    const p0 = svgPoints[Math.max(0, i - 1)]
    const p1 = svgPoints[i]
    const p2 = svgPoints[i + 1]
    const p3 = svgPoints[Math.min(svgPoints.length - 1, i + 2)]
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2[0]} ${p2[1]}`)
  }
  return parts.join(' ')
}

// Linear interpolation of y at a given x from sorted point array
function interpolateY(points: Point[], x: number): number | null {
  if (points.length === 0) return null
  if (x <= points[0][0]) return points[0][1]
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1]
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0)
      return y0 + t * (y1 - y0)
    }
  }
  return null
}

function formatHour12(h: number): string {
  if (h === 0) return '12'
  if (h === 12) return '12'
  return String(h > 12 ? h - 12 : h)
}

export default function WeatherChart({
  title,
  date,
  icon,
  points,
  unit,
  color,
  sunrise,
  sunset,
  highlightHour,
  onHighlight,
}: WeatherChartProps) {
  const { yMin, yMax } = autoRange(points)

  const svgPoints: [number, number][] = points.map(([x, y]) => [
    hourToSvgX(x),
    valToSvgY(y, yMin, yMax),
  ])

  const pathD = catmullRomPath(svgPoints)

  // Y-axis ticks
  const yTicks: number[] = []
  for (let v = yMin; v <= yMax; v += 10) yTicks.push(v)

  // X-axis labels at even hours 2,4,...,22
  const xLabels = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]

  // Highlight
  const highlightX = hourToSvgX(highlightHour)
  const highlightVal = interpolateY(points, highlightHour)
  const highlightSvgY =
    highlightVal !== null ? valToSvgY(highlightVal, yMin, yMax) : null

  const labelText =
    highlightVal !== null ? `${Math.round(highlightVal)}${unit}` : null

  // Position value label above or below plot to avoid clipping
  const labelAbove = highlightSvgY !== null && highlightSvgY > MT + CH / 2
  const labelY =
    highlightSvgY !== null
      ? labelAbove
        ? highlightSvgY - 14
        : highlightSvgY + 22
      : 0

  const sunriseX = hourToSvgX(sunrise)
  const sunsetX = hourToSvgX(sunset)

  return (
    <div>
      <div className="flex gap-2 items-baseline px-2 pt-2">
        <span className="text-sm font-medium">
          {icon} {title}
        </span>
        <span className="text-xs text-gray-400">{date}</span>
      </div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="auto"
        style={{ display: 'block' }}
      >
        {/* Chart background */}
        <rect x={ML} y={MT} width={CW} height={CH} fill="#f0f0f0" />

        {/* Night overlays */}
        <rect
          x={ML}
          y={MT}
          width={Math.max(0, sunriseX - ML)}
          height={CH}
          fill="rgba(0,0,0,0.12)"
        />
        <rect
          x={sunsetX}
          y={MT}
          width={Math.max(0, ML + CW - sunsetX)}
          height={CH}
          fill="rgba(0,0,0,0.12)"
        />

        {/* Vertical grid lines — every hour */}
        {Array.from({ length: 25 }, (_, h) => (
          <line
            key={h}
            x1={hourToSvgX(h)}
            y1={MT}
            x2={hourToSvgX(h)}
            y2={MT + CH}
            stroke="white"
            strokeWidth={h % 2 === 0 ? 0.8 : 0.4}
          />
        ))}

        {/* Horizontal grid lines */}
        {yTicks.map((v) => (
          <line
            key={v}
            x1={ML}
            y1={valToSvgY(v, yMin, yMax)}
            x2={ML + CW}
            y2={valToSvgY(v, yMin, yMax)}
            stroke="white"
            strokeWidth={0.8}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((v) => (
          <text
            key={v}
            x={ML - 4}
            y={valToSvgY(v, yMin, yMax) + 4}
            textAnchor="end"
            fontSize={10}
            fill="#666"
          >
            {v}
          </text>
        ))}

        {/* Plot line */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Highlight bar */}
        <rect
          x={highlightX - 1.5}
          y={MT}
          width={3}
          height={CH}
          fill="#22c55e"
          opacity={0.9}
        />

        {/* Highlight value label */}
        {labelText !== null && highlightSvgY !== null && (
          <>
            <rect
              x={highlightX - 18}
              y={labelY - 13}
              width={36}
              height={15}
              rx={2}
              fill="#22c55e"
            />
            <text
              x={highlightX}
              y={labelY - 2}
              textAnchor="middle"
              fontSize={10}
              fontWeight="bold"
              fill="white"
            >
              {labelText}
            </text>
          </>
        )}

        {/* X-axis labels */}
        {xLabels.map((h) => (
          <text
            key={h}
            x={hourToSvgX(h)}
            y={MT + CH + 16}
            textAnchor="middle"
            fontSize={10}
            fill="#555"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => onHighlight(h)}
            textDecoration="underline"
          >
            {formatHour12(h)}
          </text>
        ))}
      </svg>
    </div>
  )
}
