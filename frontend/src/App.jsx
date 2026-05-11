import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

const socket = io('http://localhost:3001')

const API = 'http://localhost:3001'

// ── Ícones por tipo ────────────────────────────────────────────────────────────
const ICONS = {
  light: (on) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 0 1 5 11.95V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-3.05A7 7 0 0 1 12 2z"
        stroke={on ? '#fbbf24' : '#6b7280'} fill={on ? 'rgba(251,191,36,0.15)' : 'none'} />
      <line x1="9" y1="21" x2="15" y2="21" stroke={on ? '#fbbf24' : '#6b7280'} />
    </svg>
  ),
  fan: (on) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" stroke={on ? '#60a5fa' : '#6b7280'} />
      <path d="M12 9C12 6 15 3 18 5s1 6-1 7" stroke={on ? '#60a5fa' : '#6b7280'} />
      <path d="M15 12C18 12 21 9 19 6s-6-1-7 1" stroke={on ? '#60a5fa' : '#6b7280'} />
      <path d="M12 15C12 18 9 21 6 19s-1-6 1-7" stroke={on ? '#60a5fa' : '#6b7280'} />
      <path d="M9 12C6 12 3 15 5 18s6 1 7-1" stroke={on ? '#60a5fa' : '#6b7280'} />
    </svg>
  ),
  door: (on) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2" width="18" height="20" rx="1" stroke={on ? '#a78bfa' : '#6b7280'} fill={on ? 'rgba(167,139,250,0.12)' : 'none'} />
      <circle cx="15" cy="12" r="1" fill={on ? '#a78bfa' : '#6b7280'} />
    </svg>
  ),
  security: (on) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7L12 2z"
        stroke={on ? '#f87171' : '#6b7280'} fill={on ? 'rgba(248,113,113,0.12)' : 'none'} />
    </svg>
  ),
  temperature: () => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" stroke="#f97316" />
    </svg>
  ),
  humidity: () => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" stroke="#38bdf8" />
    </svg>
  ),
  motion: (on) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="3" stroke={on ? '#4ade80' : '#6b7280'} />
      <path d="M5.5 20.5a7 7 0 0 1 13 0" stroke={on ? '#4ade80' : '#6b7280'} />
    </svg>
  ),
  ai: (on) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" stroke={on ? '#c084fc' : '#6b7280'} fill={on ? 'rgba(192,132,252,0.1)' : 'none'} />
      <path d="M8 21h8M12 17v4" stroke={on ? '#c084fc' : '#6b7280'} />
      <circle cx="9" cy="10" r="1" fill={on ? '#c084fc' : '#6b7280'} />
      <circle cx="15" cy="10" r="1" fill={on ? '#c084fc' : '#6b7280'} />
    </svg>
  ),
}

const ACCENT = {
  light:    { on: '#fbbf24', glow: 'rgba(251,191,36,0.2)'  },
  fan:      { on: '#60a5fa', glow: 'rgba(96,165,250,0.2)'  },
  door:     { on: '#a78bfa', glow: 'rgba(167,139,250,0.2)' },
  security: { on: '#f87171', glow: 'rgba(248,113,113,0.2)' },
}

// ── Gráfico sparkline SVG (sem dependências externas) ─────────────────────────
function Sparkline({ data, color = '#6366f1', height = 70, label = '' }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64638a', fontSize: 12 }}>
        Aguardando dados do ESP32...
      </div>
    )
  }
  const vals = data.map(d => d.value)
  const min  = Math.min(...vals) - 0.5
  const max  = Math.max(...vals) + 0.5
  const W = 600, H = height
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((d.value - min) / (max - min)) * (H - 8) - 4
    return `${x},${y}`
  }).join(' ')
  const last = vals[vals.length - 1]
  return (
    <div style={{ position: 'relative' }}>
      {label && <div style={{ fontSize: 11, color: '#64638a', marginBottom: 4 }}>{label}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,${H} ${pts} ${W},${H}`}
          fill={`url(#grad-${color.replace('#','')})`}
        />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
        {(() => {
          const lastPt = pts.split(' ').pop().split(',')
          return <circle cx={lastPt[0]} cy={lastPt[1]} r="4" fill={color} />
        })()}
      </svg>
      <div style={{ position: 'absolute', right: 0, top: 0, fontSize: 13, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>
        {last.toFixed(1)}
      </div>
    </div>
  )
}

// ── Estilos ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:     #07070f;
    --s1:     rgba(255,255,255,0.04);
    --s2:     rgba(255,255,255,0.07);
    --border: rgba(255,255,255,0.08);
    --text:   #f0f0fa;
    --muted:  #64638a;
    --accent: #6366f1;
    --green:  #22c55e;
    --red:    #ef4444;
  }

  body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; min-height: 100vh; }

  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px 60px; }

  .orb { position: fixed; border-radius: 50%; filter: blur(100px); pointer-events: none; z-index: 0; }
  .orb1 { width: 500px; height: 500px; background: rgba(99,102,241,.18); top: -180px; right: -100px; }
  .orb2 { width: 350px; height: 350px; background: rgba(34,197,94,.1); bottom: -80px; left: -80px; }

  header { position: relative; z-index: 1; padding: 36px 0 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
  .logo { display: flex; align-items: center; gap: 14px; }
  .logo-icon { font-size: 30px; width: 54px; height: 54px; background: var(--s1); border: 1px solid var(--border); border-radius: 16px; display: flex; align-items: center; justify-content: center; }
  .logo h1 { font-size: 22px; font-weight: 700; }
  .logo p  { font-size: 11px; color: var(--muted); margin-top: 2px; font-family: 'JetBrains Mono', monospace; }
  .header-right { display: flex; align-items: center; gap: 10px; }
  .chip  { background: var(--s1); border: 1px solid var(--border); border-radius: 99px; padding: 7px 14px; font-size: 12px; }
  .chip strong { color: var(--accent); }
  .badge { display: flex; align-items: center; gap: 7px; background: var(--s1); border: 1px solid var(--border); border-radius: 99px; padding: 7px 12px; font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--muted); }
  .dot { width: 7px; height: 7px; border-radius: 50%; }
  .dot.on  { background: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse 2s infinite; }
  .dot.off { background: var(--red); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  /* Tabs */
  .tabs { position: relative; z-index: 1; display: flex; gap: 4px; padding: 20px 0 0; }
  .tab { background: none; border: 1px solid transparent; border-radius: 10px; padding: 8px 18px; font-size: 13px; font-family: 'Inter', sans-serif; color: var(--muted); cursor: pointer; transition: all .2s; }
  .tab:hover { background: var(--s1); color: var(--text); }
  .tab.active { background: var(--s1); border-color: var(--border); color: var(--text); font-weight: 600; }

  main { position: relative; z-index: 1; padding-top: 28px; display: flex; flex-direction: column; gap: 28px; }

  /* Cards de sensores */
  .sensor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .sensor-card { background: var(--s1); border: 1px solid var(--border); border-radius: 18px; padding: 18px 20px; display: flex; align-items: center; gap: 14px; }
  .sensor-icon { width: 38px; height: 38px; flex-shrink: 0; }
  .sensor-icon svg { width: 100%; height: 100%; }
  .sensor-label { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
  .sensor-value { font-size: 22px; font-weight: 700; margin-top: 2px; }

  /* Cards de dispositivos */
  .devices { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .card { background: var(--s1); border: 1px solid var(--border); border-radius: 20px; padding: 18px 22px; display: flex; align-items: center; gap: 14px; transition: all .25s ease; }
  .card:hover { background: var(--s2); }
  .card.active { border-color: var(--card-color, var(--accent)); box-shadow: 0 0 24px var(--card-glow, transparent); }
  .card-icon { width: 42px; height: 42px; flex-shrink: 0; }
  .card-icon svg { width: 100%; height: 100%; }
  .card-info { flex: 1; min-width: 0; }
  .card-name { font-size: 14px; font-weight: 500; }
  .card-status { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--muted); margin-top: 2px; transition: color .3s; }
  .card.active .card-status { color: var(--card-color, var(--accent)); }
  .switch { position: relative; width: 48px; height: 26px; flex-shrink: 0; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; inset: 0; background: rgba(255,255,255,.1); border-radius: 99px; cursor: pointer; transition: background .3s; }
  .slider::before { content:''; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: transform .3s; }
  input:checked + .slider { background: var(--card-color, var(--accent)); }
  input:checked + .slider::before { transform: translateX(22px); }
  input:disabled + .slider { opacity: .5; cursor: not-allowed; }

  /* Seções */
  .section { background: var(--s1); border: 1px solid var(--border); border-radius: 20px; padding: 24px; }
  .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .section-head h2 { font-size: 15px; font-weight: 600; }
  .section-badge { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--muted); background: var(--s2); border: 1px solid var(--border); padding: 4px 10px; border-radius: 99px; }

  /* Logs */
  .log-list { max-height: 320px; overflow-y: auto; padding-right: 4px; }
  .log-list::-webkit-scrollbar { width: 4px; }
  .log-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .log-item { display: grid; grid-template-columns: 90px 1fr auto auto; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; animation: fadein .3s ease; }
  .log-item:last-child { border-bottom: none; }
  @keyframes fadein { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
  .log-time   { font-family: 'JetBrains Mono', monospace; color: var(--muted); font-size: 11px; }
  .log-device { font-weight: 500; }
  .log-src    { font-size: 11px; color: var(--muted); }
  .log-action { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; }
  .log-action.on  { color: var(--green); background: rgba(34,197,94,.12); }
  .log-action.off { color: var(--red);   background: rgba(239,68,68,.12); }
  .log-empty  { color: var(--muted); font-size: 13px; text-align: center; padding: 24px; }

  /* IA Local */
  .ia-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .ia-stat { background: var(--s2); border-radius: 14px; padding: 18px; }
  .ia-stat-label { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
  .ia-stat-val { font-size: 26px; font-weight: 700; margin-top: 4px; }
  .progress-bar { height: 6px; background: rgba(255,255,255,.07); border-radius: 99px; margin-top: 8px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 99px; background: var(--accent); transition: width .6s ease; }
  .ia-badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 99px; padding: 6px 14px; font-size: 12px; font-weight: 600; margin-top: 14px; }
  .ia-badge.ativa   { background: rgba(192,132,252,.15); color: #c084fc; border: 1px solid rgba(192,132,252,.3); }
  .ia-badge.inativa { background: rgba(255,255,255,.05); color: var(--muted); border: 1px solid var(--border); }
  .auto-rule { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--s2); border-radius: 12px; font-size: 13px; }
  .auto-rule-icon { font-size: 18px; }
  .auto-rules { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
  .btn-reset { background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.3); color: #f87171; border-radius: 10px; padding: 8px 18px; font-size: 13px; font-family: 'Inter', sans-serif; cursor: pointer; transition: all .2s; }
  .btn-reset:hover { background: rgba(239,68,68,.25); }

  /* Chat */
  .chat-btn { position: fixed; bottom: 28px; right: 28px; z-index: 100; width: 56px; height: 56px; border-radius: 50%; background: var(--accent); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 8px 24px rgba(99,102,241,.5); transition: transform .2s, box-shadow .2s; }
  .chat-btn:hover { transform: scale(1.08); box-shadow: 0 12px 32px rgba(99,102,241,.6); }
  .chat-panel { position: fixed; bottom: 96px; right: 28px; z-index: 100; width: 380px; max-height: 520px; background: #0f0f1a; border: 1px solid rgba(99,102,241,.3); border-radius: 24px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.6); animation: popUp .25s ease; }
  @keyframes popUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  .chat-head { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .chat-head-icon { font-size: 18px; }
  .chat-head-info strong { font-size: 14px; font-weight: 600; display: block; }
  .chat-head-info span { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
  .chat-msgs { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .chat-msgs::-webkit-scrollbar { width: 4px; }
  .chat-msgs::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .bubble { max-width: 85%; padding: 10px 14px; border-radius: 16px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .bubble.user   { background: var(--accent); color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
  .bubble.ai     { background: var(--s2); color: var(--text); align-self: flex-start; border-bottom-left-radius: 4px; }
  .bubble.loading { color: var(--muted); font-style: italic; }
  .chat-input { padding: 10px 14px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
  .chat-input input { flex: 1; background: var(--s1); border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px; color: var(--text); font-size: 13px; font-family: 'Inter', sans-serif; outline: none; transition: border-color .2s; }
  .chat-input input:focus { border-color: var(--accent); }
  .chat-input input::placeholder { color: var(--muted); }
  .chat-send { width: 38px; height: 38px; border-radius: 10px; background: var(--accent); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: opacity .2s; }
  .chat-send:disabled { opacity: .4; cursor: not-allowed; }
  .chat-send svg { width: 16px; height: 16px; stroke: white; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  .section-title { font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 14px; text-transform: uppercase; letter-spacing: .06em; }

  footer { position: relative; z-index: 1; margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; font-family: 'JetBrains Mono', monospace; }
`

// ── Componente Principal ───────────────────────────────────────────────────────
export default function App() {
  const [devices, setDevices] = useState([])
  const [logs, setLogs]       = useState([])
  const [conn, setConn]       = useState(false)
  const [loading, setLoading] = useState({})
  const [tab, setTab]         = useState('dashboard')

  // Telemetria em tempo real
  const [telemetry, setTelemetry] = useState({
    temperature: null, humidity: null, movement: false, iaStatus: 'inativa'
  })
  // Histórico de temperatura para o gráfico (últimas 50 leituras)
  const [tempHistory, setTempHistory] = useState([])

  // Chat IA
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMsgs, setChatMsgs] = useState([{
    role: 'ai',
    text: 'Olá! Sou o assistente da Casa Inteligente v3.0. Posso controlar dispositivos, verificar sensores e agendar ações. Como posso ajudar?'
  }])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy]   = useState(false)
  const chatEndRef = useRef(null)

  const activeCount = devices.filter(d => d.state).length

  useEffect(() => {
    fetch(`${API}/api/devices`).then(r => r.json()).then(setDevices).catch(() => {})
    fetch(`${API}/api/logs`).then(r => r.json()).then(setLogs).catch(() => {})
    fetch(`${API}/api/sensores/historico`).then(r => r.json()).then(rows => {
      setTempHistory(rows.filter(r => r.temperature !== null).map(r => ({
        value: r.temperature,
        time:  new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      })))
    }).catch(() => {})

    socket.on('connect',    () => setConn(true))
    socket.on('disconnect', () => setConn(false))

    socket.on('device_update', (updated) => {
      setDevices(prev => prev.map(d => d.id === updated.id ? updated : d))
    })
    socket.on('new_log', (log) => {
      setLogs(prev => [log, ...prev].slice(0, 50))
    })
    socket.on('telemetry', (data) => {
      setTelemetry(data)
      if (data.temperature !== null) {
        setTempHistory(prev => [
          ...prev.slice(-49),
          { value: data.temperature, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
        ])
      }
    })
    socket.on('ia_update', (data) => {
      setTelemetry(prev => ({ ...prev, iaStatus: data.status }))
    })
    socket.on('alarme', (data) => {
      console.warn('ALARME:', data.event)
    })

    return () => {
      socket.off('connect'); socket.off('disconnect')
      socket.off('device_update'); socket.off('new_log')
      socket.off('telemetry'); socket.off('ia_update'); socket.off('alarme')
    }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMsgs])

  const toggle = async (id) => {
    if (loading[id]) return
    setLoading(p => ({ ...p, [id]: true }))
    await fetch(`${API}/api/devices/${id}/toggle`, { method: 'POST' }).catch(() => {})
    setLoading(p => ({ ...p, [id]: false }))
  }

  const resetIA = async () => {
    await fetch(`${API}/api/ia/reset`, { method: 'POST' }).catch(() => {})
  }

  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text || chatBusy) return
    setChatInput('')
    setChatMsgs(p => [...p, { role: 'user', text }])
    setChatBusy(true)
    setChatMsgs(p => [...p, { role: 'ai', text: '...', loading: true }])
    try {
      const res  = await fetch(`${API}/api/ai/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      const data = await res.json()
      setChatMsgs(p => [...p.slice(0, -1), { role: 'ai', text: data.reply || data.error }])
    } catch {
      setChatMsgs(p => [...p.slice(0, -1), { role: 'ai', text: 'Erro ao conectar com a IA.' }])
    }
    setChatBusy(false)
  }

  // ── Renderiza card de dispositivo ──────────────────────────────────────────
  const DeviceCard = ({ d }) => {
    const color = ACCENT[d.type] || { on: '#6366f1', glow: 'rgba(99,102,241,.2)' }
    const iconFn = ICONS[d.type] || ICONS.security
    return (
      <div
        className={`card ${d.state ? 'active' : ''}`}
        style={{ '--card-color': color.on, '--card-glow': d.state ? color.glow : 'transparent' }}
      >
        <div className="card-icon">{iconFn(d.state)}</div>
        <div className="card-info">
          <div className="card-name">{d.name}</div>
          <div className="card-status">{d.state ? '● ligado' : '○ desligado'}</div>
        </div>
        <label className="switch" style={{ '--card-color': color.on }}>
          <input
            type="checkbox"
            checked={d.state}
            disabled={!!loading[d.id]}
            onChange={() => toggle(d.id)}
          />
          <span className="slider" />
        </label>
      </div>
    )
  }

  // ── Tab: Dashboard ─────────────────────────────────────────────────────────
  const TabDashboard = () => (
    <>
      {/* Cards de sensores */}
      <div className="sensor-grid">
        <div className="sensor-card">
          <div className="sensor-icon">{ICONS.temperature()}</div>
          <div>
            <div className="sensor-label">TEMPERATURA</div>
            <div className="sensor-value" style={{ color: '#f97316' }}>
              {telemetry.temperature !== null ? `${telemetry.temperature.toFixed(1)}°C` : '--'}
            </div>
          </div>
        </div>
        <div className="sensor-card">
          <div className="sensor-icon">{ICONS.humidity()}</div>
          <div>
            <div className="sensor-label">UMIDADE</div>
            <div className="sensor-value" style={{ color: '#38bdf8' }}>
              {telemetry.humidity !== null ? `${telemetry.humidity.toFixed(0)}%` : '--'}
            </div>
          </div>
        </div>
        <div className="sensor-card">
          <div className="sensor-icon">{ICONS.motion(telemetry.movement)}</div>
          <div>
            <div className="sensor-label">MOVIMENTO</div>
            <div className="sensor-value" style={{ color: telemetry.movement ? '#4ade80' : '#64638a' }}>
              {telemetry.movement ? 'Detectado' : 'Nenhum'}
            </div>
          </div>
        </div>
        <div className="sensor-card">
          <div className="sensor-icon">{ICONS.ai(telemetry.iaStatus === 'ativa')}</div>
          <div>
            <div className="sensor-label">IA LOCAL</div>
            <div className="sensor-value" style={{ color: telemetry.iaStatus === 'ativa' ? '#c084fc' : '#64638a', fontSize: 16 }}>
              {telemetry.iaStatus === 'ativa' ? 'Ativa' : 'Aprendendo'}
            </div>
          </div>
        </div>
      </div>

      {/* Controles dos dispositivos */}
      <div>
        <div className="section-title">Dispositivos</div>
        <div className="devices">
          {devices.map(d => <DeviceCard key={d.id} d={d} />)}
        </div>
      </div>

      {/* Gráfico de temperatura */}
      <div className="section">
        <div className="section-head">
          <h2>Temperatura em Tempo Real</h2>
          <span className="section-badge">{tempHistory.length} leituras</span>
        </div>
        <Sparkline data={tempHistory} color="#f97316" height={80} />
      </div>
    </>
  )

  // ── Tab: Histórico ─────────────────────────────────────────────────────────
  const TabHistorico = () => {
    const [humHistory, setHumHistory] = useState([])
    useEffect(() => {
      fetch(`${API}/api/sensores/historico`).then(r => r.json()).then(rows => {
        setHumHistory(rows.filter(r => r.humidity !== null).map(r => ({
          value: r.humidity,
          time:  new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        })))
      }).catch(() => {})
    }, [])

    return (
      <>
        <div className="section">
          <div className="section-head">
            <h2>Histórico de Temperatura</h2>
            <span className="section-badge">últimas 100 leituras</span>
          </div>
          <Sparkline data={tempHistory} color="#f97316" height={90} label="°C" />
        </div>
        <div className="section">
          <div className="section-head">
            <h2>Histórico de Umidade</h2>
            <span className="section-badge">%</span>
          </div>
          <Sparkline data={humHistory} color="#38bdf8" height={90} label="%" />
        </div>
        <div className="section">
          <div className="section-head">
            <h2>Histórico de Ações</h2>
            <span className="section-badge">{logs.length} registros</span>
          </div>
          <div className="log-list">
            {logs.length === 0
              ? <div className="log-empty">Nenhuma ação registrada.</div>
              : logs.map(l => (
                <div key={l.id} className="log-item">
                  <span className="log-time">{new Date(l.createdAt).toLocaleTimeString('pt-BR')}</span>
                  <span className="log-device">{l.device?.name ?? l.deviceId}</span>
                  <span className="log-src">{l.source === 'ia_chat' ? '🤖 IA' : '👤 manual'}</span>
                  <span className={`log-action ${l.action === 'ON' ? 'on' : 'off'}`}>
                    {l.action === 'ON' ? 'Ligado' : 'Desligado'}
                  </span>
                </div>
              ))
            }
          </div>
        </div>
      </>
    )
  }

  // ── Tab: Automações ────────────────────────────────────────────────────────
  const TabAutomacoes = () => (
    <>
      <div className="section">
        <div className="section-head">
          <h2>IA Local — Aprendizado de Padrões</h2>
          <span className={`ia-badge ${telemetry.iaStatus === 'ativa' ? 'ativa' : 'inativa'}`}>
            {telemetry.iaStatus === 'ativa' ? '● ATIVA' : '○ Aprendendo'}
          </span>
        </div>
        <div className="ia-grid">
          <div className="ia-stat">
            <div className="ia-stat-label">STATUS</div>
            <div className="ia-stat-val" style={{ color: telemetry.iaStatus === 'ativa' ? '#c084fc' : '#64638a', fontSize: 18 }}>
              {telemetry.iaStatus === 'ativa' ? 'Automatizando' : 'Coletando dados'}
            </div>
            <div style={{ fontSize: 12, color: '#64638a', marginTop: 6 }}>
              {telemetry.iaStatus === 'ativa'
                ? 'Padrão detectado: luz ligada em ≥80% dos ciclos'
                : 'Aguarda 5 ciclos de 20s para analisar padrões'}
            </div>
          </div>
          <div className="ia-stat">
            <div className="ia-stat-label">TEMPERATURA ATUAL</div>
            <div className="ia-stat-val" style={{ color: '#f97316' }}>
              {telemetry.temperature !== null ? `${telemetry.temperature.toFixed(1)}°C` : '--'}
            </div>
            <div style={{ fontSize: 12, color: '#64638a', marginTop: 6 }}>
              {telemetry.temperature !== null && telemetry.temperature > 28
                ? '⚠️ Ventilador ligado automaticamente'
                : 'Normal'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <button className="btn-reset" onClick={resetIA}>Reiniciar IA Local</button>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Automações Ativas</h2>
          <span className="section-badge">sempre ativas</span>
        </div>
        <div className="auto-rules">
          <div className="auto-rule">
            <span className="auto-rule-icon">🌡️</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>Controle de temperatura</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Temp &gt; 28°C → Liga ventilador · Temp &lt; 26°C → Desliga ventilador
              </div>
            </div>
          </div>
          <div className="auto-rule">
            <span className="auto-rule-icon">🚶</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>Luz por movimento</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Movimento detectado → Liga luz da sala automaticamente
              </div>
            </div>
          </div>
          <div className="auto-rule">
            <span className="auto-rule-icon">🔒</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>Modo segurança</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Alarme ativado + Movimento → Dispara alarme sonoro + notificação MQTT
              </div>
            </div>
          </div>
          <div className="auto-rule">
            <span className="auto-rule-icon">🚪</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>Porta automática</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Objeto detectado a &lt;10cm pelo HC-SR04 → Abre e fecha em 3s
              </div>
            </div>
          </div>
          <div className="auto-rule">
            <span className="auto-rule-icon">🤖</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>IA Local (aprendizado)</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Frequência de uso ≥80% em 5 ciclos → IA age proativamente
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>
      <div className="orb orb1" />
      <div className="orb orb2" />

      <div className="wrap">
        <header>
          <div className="logo">
            <div className="logo-icon">🏠</div>
            <div>
              <h1>Casa Inteligente</h1>
              <p>ESP32 · DHT22 · PIR · HC-SR04 · MQTT · IA Local + Cloud — v3.0</p>
            </div>
          </div>
          <div className="header-right">
            <div className="chip">
              <strong>{activeCount}</strong>/{devices.length} ativos
            </div>
            {telemetry.temperature !== null && (
              <div className="chip">
                <strong style={{ color: '#f97316' }}>{telemetry.temperature.toFixed(1)}°C</strong>
              </div>
            )}
            <div className="badge">
              <span className={`dot ${conn ? 'on' : 'off'}`} />
              {conn ? 'online' : 'offline'}
            </div>
          </div>
        </header>

        <div className="tabs">
          {[
            { id: 'dashboard',  label: '📊 Dashboard'  },
            { id: 'historico',  label: '📈 Histórico'  },
            { id: 'automacoes', label: '🤖 Automações' },
          ].map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <main>
          {tab === 'dashboard'  && <TabDashboard />}
          {tab === 'historico'  && <TabHistorico />}
          {tab === 'automacoes' && <TabAutomacoes />}
        </main>

        <footer>
          <span>Smart Home Híbrido UPX · 2025</span>
          <span>React · Node.js · PostgreSQL · MQTT · Socket.io · Groq AI</span>
        </footer>
      </div>

      {/* ── Chat IA Flutuante ─────────────────────────────── */}
      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-head">
            <span className="chat-head-icon">🤖</span>
            <div className="chat-head-info">
              <strong>Assistente IA</strong>
              <span>Groq · llama-3.3-70b — controle por voz</span>
            </div>
          </div>
          <div className="chat-msgs">
            {chatMsgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role} ${m.loading ? 'loading' : ''}`}>
                {m.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input">
            <input
              placeholder='Ex: "apaga tudo às 23h" ou "qual a temperatura?"'
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              disabled={chatBusy}
            />
            <button className="chat-send" onClick={sendMessage} disabled={chatBusy}>
              <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      )}
      <button className="chat-btn" onClick={() => setChatOpen(o => !o)} title="Assistente IA">
        {chatOpen ? '✕' : '🤖'}
      </button>
    </>
  )
}
