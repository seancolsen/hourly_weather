import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

type Centroid = [number, number]

export default function Zip() {
  const { zipCode } = useParams<{ zipCode: string }>()
  const [centroid, setCentroid] = useState<Centroid | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!zipCode) return

    const cacheKey = `zip_centroid_${zipCode}`
    const cached = localStorage.getItem(cacheKey)

    if (cached) {
      setCentroid(JSON.parse(cached))
      return
    }

    fetch('/zip_centroids.json')
      .then((res) => res.json())
      .then((data: Record<string, Centroid>) => {
        const value = data[zipCode]
        if (!value) {
          setError(`No entry found for zip code ${zipCode}`)
          return
        }
        localStorage.setItem(cacheKey, JSON.stringify(value))
        setCentroid(value)
      })
      .catch(() => setError('Failed to load zip code data'))
  }, [zipCode])

  if (error) return <p>{error}</p>
  if (!centroid) return <p>Loading...</p>

  return (
    <p>
      {zipCode}: [{centroid[0]}, {centroid[1]}]
    </p>
  )
}
