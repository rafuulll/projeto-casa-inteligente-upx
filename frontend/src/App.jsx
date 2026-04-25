import { useState, useEffect } from 'react'

export default function App() {
  const [ligado, setLigado] = useState(false)

  useEffect(() => {
    fetch('http://localhost:3001/api/led')
      .then(r => r.json())
      .then(d => setLigado(d.state))
  }, [])

  const toggle = async () => {
    const res = await fetch('http://localhost:3001/api/led/toggle', {
      method: 'POST'
    })
    const data = await res.json()
    setLigado(data.state)
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Controle do LED</h1>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        background: ligado ? '#facc15' : '#374151',
        marginBottom: 24
      }} />
      <button onClick={toggle}>
        {ligado ? 'Desligar' : 'Ligar'}
      </button>
    </div>
  )
}