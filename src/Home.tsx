import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const [zip, setZip] = useState('')
  const navigate = useNavigate()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (zip.trim()) navigate(`/${zip.trim()}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label htmlFor="zip">Enter your zip code</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            id="zip"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
          />
          <button type="submit">→</button>
        </div>
      </form>
    </div>
  )
}
