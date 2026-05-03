import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Input from './components/Input'
import Button from './components/Button'

export default function Home() {
  const [zip, setZip] = useState('')
  const navigate = useNavigate()
  const lastZip = localStorage.getItem('last_zip')
  if (lastZip) return <Navigate to={`/${lastZip}`} replace />


  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (zip.trim()) navigate(`/${zip.trim()}`)
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="zip">Enter your zip code</label>
        <div className="flex gap-2">
          <Input
            id="zip"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
          />
          <Button type="submit">Go</Button>
        </div>
      </form>
    </div>
  )
}
