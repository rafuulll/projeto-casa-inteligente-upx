import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

const socket = io('http://localhost:3001')

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
  ac: (on) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="10" rx="2" stroke={on ? '#67e8f9' : '#6b7280'} fill={on ? 'rgba(103,232,249,0.1)' : 'none'} />
      <line x1="7" y1="16" x2="7" y2="20" stroke={on ? '#67e8f9' : '#6b7280'} />
      <line x1="12" y1="16" x2="12" y2="20" stroke={on ? '#67e8f9' : '#6b7280'} />
      <line x1="17" y1="16" x2="17" y2="20" stroke={on ? '#67e8f9' : '#6b7280'} />
      <line x1="6" y1="11" x2="18" y2="11" stroke={on ? '#67e8f9' : '#6b7280'} />
    </svg>
  ),
  plug: (on) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M8 6h8l1 5H7l1-5z" stroke={on ? '#86efac' : '#6b7280'} fill={on ? 'rgba(134,239,172,0.15)' : 'none'} />
      <path d="M9 11v2a3 3 0 0 0 6 0v-2" stroke={on ? '#86efac' : '#6b7280'} />
      <line x1="12" y1="16" x2="12" y2="20" stroke={on ? '#86efac' : '#6b7280'} />
    </svg>
  ),
}

const ROOM_ICONS = { Sala: '🛋️', Quarto: '🛏️', Cozinha: '🍳' }

const ACCENT = {
  light: { on: '#fbbf24', glow: 'rgba(251,191,36,0.2)' },
  fan: { on: '#60a5fa', glow: 'rgba(96,165,250,0.2)' },
  ac: { on: '#67e8f9', glow: 'rgba(103,232,249,0.2)' },
  plug: { on: '#86efac', glow: 'rgba(134,239,172,0.2)' },
}

// ── Estilos ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:      #07070f;
    --s1:      rgba(255,255,255,0.04);
    --s2:      rgba(255,255,255,0.07);
    --border:  rgba(255,255,255,0.08);
    --text:    #f0f0fa;
    --muted:   #64638a;
    --accent:  #6366f1;
    --green:   #22c55e;
    --red:     #ef4444;
  }

  body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; min-height: 100vh; }

  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px 60px; }

  /* orbs */
  .orb { position: fixed; border-radius: 50%; filter: blur(100px); pointer-events: none; z-index: 0; }
  .orb1 { width: 500px; height: 500px; background: rgba(99,102,241,.18); top: -180px; right: -100px; }
  .orb2 { width: 350px; height: 350px; background: rgba(34,197,94,.1); bottom: -80px; left: -80px; }

  /* header */
  header { position: relative; z-index: 1; padding: 36px 0 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
  .logo { display: flex; align-items: center; gap: 14px; }
  .logo-icon { font-size: 30px; width: 54px; height: 54px; background: var(--s1); border: 1px solid var(--border); border-radius: 16px; display: flex; align-items: center; justify-content: center; }
  .logo h1 { font-size: 22px; font-weight: 700; }
  .logo p  { font-size: 12px; color: var(--muted); margin-top: 2px; font-family: 'JetBrains Mono', monospace; }

  /* chat floating */
  .chat-btn { position: fixed; bottom: 28px; right: 28px; z-index: 100; width: 56px; height: 56px; border-radius: 50%; background: var(--accent); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 8px 24px rgba(99,102,241,.5); transition: transform .2s, box-shadow .2s; }
  .chat-btn:hover { transform: scale(1.08); box-shadow: 0 12px 32px rgba(99,102,241,.6); }
  .chat-panel { position: fixed; bottom: 96px; right: 28px; z-index: 100; width: 380px; max-height: 520px; background: #0f0f1a; border: 1px solid rgba(99,102,241,.3); border-radius: 24px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.6); animation: popUp .25s ease; }
  @keyframes popUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  .chat-head { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .chat-head-icon { font-size: 18px; }
  .chat-head-info strong { font-size: 14px; font-weight: 600; display: block; }
  .chat-head-info span { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
  .chat-msgs { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .chat-msgs::-webkit-scrollbar { width: 4px; } .chat-msgs::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .bubble { max-width: 85%; padding: 10px 14px; border-radius: 16px; font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .bubble.user { background: var(--accent); color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
  .bubble.ai { background: var(--s2); color: var(--text); align-self: flex-start; border-bottom-left-radius: 4px; }
  .bubble.loading { color: var(--muted); font-style: italic; }
  .chat-input { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
  .chat-input input { flex: 1; background: var(--s1); border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px; color: var(--text); font-size: 13px; font-family: 'Inter', sans-serif; outline: none; transition: border-color .2s; }
  .chat-input input:focus { border-color: var(--accent); }
  .chat-input input::placeholder { color: var(--muted); }
  .chat-send { width: 38px; height: 38px; border-radius: 10px; background: var(--accent); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: opacity .2s; }
  .chat-send:disabled { opacity: .4; cursor: not-allowed; }
  .chat-send svg { width: 16px; height: 16px; stroke: white; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .header-right { display: flex; align-items: center; gap: 12px; }
  .chip { background: var(--s1); border: 1px solid var(--border); border-radius: 99px; padding: 8px 16px; font-size: 13px; }
  .chip strong { color: var(--accent); }
  .badge { display: flex; align-items: center; gap: 7px; background: var(--s1); border: 1px solid var(--border); border-radius: 99px; padding: 8px 14px; font-size: 12px; font-family: 'JetBrains Mono', monospace; color: var(--muted); }
  .dot { width: 7px; height: 7px; border-radius: 50%; }
  .dot.on  { background: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse 2s infinite; }
  .dot.off { background: var(--red); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  /* main */
  main { position: relative; z-index: 1; padding-top: 40px; display: flex; flex-direction: column; gap: 36px; }

  /* room */
  .room { display: flex; flex-direction: column; gap: 16px; }
  .room-header { display: flex; align-items: center; gap: 10px; }
  .room-emoji { font-size: 18px; }
  .room-name { font-size: 16px; font-weight: 600; }
  .room-count { margin-left: auto; font-size: 12px; font-family: 'JetBrains Mono', monospace; color: var(--muted); }
  .devices { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }

  /* device card */
  .card {
    background: var(--s1); border: 1px solid var(--border); border-radius: 20px;
    padding: 20px 24px; display: flex; align-items: center; gap: 16px;
    transition: all .25s ease; cursor: default;
  }
  .card:hover { background: var(--s2); }
  .card.active { border-color: var(--card-color, var(--accent)); box-shadow: 0 0 24px var(--card-glow, transparent); }

  .card-icon { width: 44px; height: 44px; flex-shrink: 0; }
  .card-icon svg { width: 100%; height: 100%; }

  .card-info { flex: 1; min-width: 0; }
  .card-name { font-size: 15px; font-weight: 500; }
  .card-status { font-size: 12px; font-family: 'JetBrains Mono', monospace; color: var(--muted); margin-top: 2px; transition: color .3s; }
  .card.active .card-status { color: var(--card-color, var(--accent)); }

  /* toggle switch */
  .switch { position: relative; width: 48px; height: 26px; flex-shrink: 0; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; inset: 0; background: rgba(255,255,255,.1); border-radius: 99px; cursor: pointer; transition: background .3s; }
  .slider::before { content:''; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: transform .3s; }
  input:checked + .slider { background: var(--card-color, var(--accent)); }
  input:checked + .slider::before { transform: translateX(22px); }
  input:disabled + .slider { opacity: .5; cursor: not-allowed; }

  /* logs */
  .logs { background: var(--s1); border: 1px solid var(--border); border-radius: 24px; padding: 28px; }
  .log-list { max-height: 320px; overflow-y: auto; padding-right: 8px; }
  .log-list::-webkit-scrollbar { width: 4px; }
  .log-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .logs-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .logs-head h2 { font-size: 16px; font-weight: 600; }
  .logs-badge { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--muted); background: var(--s2); border: 1px solid var(--border); padding: 4px 10px; border-radius: 99px; }
  .log-item { display: grid; grid-template-columns: 100px 1fr auto auto; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; animation: fadein .3s ease; }
  .log-item:last-child { border-bottom: none; }
  @keyframes fadein { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
  .log-time { font-family: 'JetBrains Mono', monospace; color: var(--muted); font-size: 12px; }
  .log-device { font-weight: 500; }
  .log-room { font-size: 12px; color: var(--muted); }
  .log-action { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 99px; }
  .log-action.on  { color: var(--green); background: rgba(34,197,94,.12); }
  .log-action.off { color: var(--red);   background: rgba(239,68,68,.12); }
  .log-empty { color: var(--muted); font-size: 13px; text-align: center; padding: 24px; }

  /* footer */
  footer { position: relative; z-index: 1; margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; font-family: 'JetBrains Mono', monospace; }
`

// ── Componente ─────────────────────────────────────────────────────────────────
export default function App() {
  const [devices, setDevices] = useState([])   // lista flat do banco
  const [logs, setLogs] = useState([])
  const [conn, setConn] = useState(false)
  const [loading, setLoading] = useState({})
  // Chat IA
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMsgs, setChatMsgs] = useState([{ role: 'ai', text: 'Olá! Sou o assistente da Casa Inteligente. Posso ligar/desligar dispositivos, controlar cômodos inteiros e agendar ações. Como posso ajudar?' }])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const chatEndRef = useRef(null)

  // Agrupa devices por cômodo
  const rooms = devices.reduce((acc, d) => {
    if (!acc[d.room]) acc[d.room] = []
    acc[d.room].push(d)
    return acc
  }, {})

  const activeCount = devices.filter(d => d.state).length

  useEffect(() => {
    // Busca dados iniciais
    fetch('http://localhost:3001/api/devices')
      .then(r => r.json())
      .then(setDevices)
      .catch(() => { })

    fetch('http://localhost:3001/api/logs')
      .then(r => r.json())
      .then(setLogs)
      .catch(() => { })

    // Socket.io — eventos em tempo real
    socket.on('connect', () => setConn(true))
    socket.on('disconnect', () => setConn(false))

    socket.on('device_update', (updated) => {
      setDevices(prev => prev.map(d => d.id === updated.id ? updated : d))
    })

    socket.on('new_log', (log) => {
      setLogs(prev => [log, ...prev].slice(0, 30))
    })

    return () => {
      socket.off('connect'); socket.off('disconnect')
      socket.off('device_update'); socket.off('new_log')
    }
  }, [])

  const toggle = async (id) => {
    if (loading[id]) return
    setLoading(p => ({ ...p, [id]: true }))
    await fetch(`http://localhost:3001/api/devices/${id}/toggle`, { method: 'POST' })
      .catch(() => { })
    setLoading(p => ({ ...p, [id]: false }))
  }

  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text || chatBusy) return
    setChatInput('')
    setChatMsgs(p => [...p, { role: 'user', text }])
    setChatBusy(true)
    setChatMsgs(p => [...p, { role: 'ai', text: '...', loading: true }])
    try {
      const res = await fetch('http://localhost:3001/api/ai/chat', {
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

  // Auto-scroll no chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMsgs])

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
              <p>ESP32 · MQTT · PostgreSQL · Socket.io · Claude AI — nível 03</p>
            </div>
          </div>
          <div className="header-right">
            <div className="chip">
              <strong>{activeCount}</strong> / {devices.length} dispositivos ativos
            </div>
            <div className="badge">
              <span className={`dot ${conn ? 'on' : 'off'}`} />
              {conn ? 'online' : 'offline'}
            </div>
          </div>
        </header>

        <main>
          {/* Dispositivos por cômodo */}
          {Object.entries(rooms).map(([room, devs]) => (
            <section key={room} className="room">
              <div className="room-header">
                <span className="room-emoji">{ROOM_ICONS[room] || '🏠'}</span>
                <span className="room-name">{room}</span>
                <span className="room-count">
                  {devs.filter(d => d.state).length}/{devs.length} ativos
                </span>
              </div>

              <div className="devices">
                {devs.map(d => {
                  const color = ACCENT[d.type] || { on: '#6366f1', glow: 'rgba(99,102,241,.2)' }
                  return (
                    <div
                      key={d.id}
                      className={`card ${d.state ? 'active' : ''}`}
                      style={{ '--card-color': color.on, '--card-glow': d.state ? color.glow : 'transparent' }}
                    >
                      <div className="card-icon">
                        {(ICONS[d.type] || ICONS.plug)(d.state)}
                      </div>
                      <div className="card-info">
                        <div className="card-name">{d.name}</div>
                        <div className="card-status">
                          {d.state ? '● ligado' : '○ desligado'}
                        </div>
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
                })}
              </div>
            </section>
          ))}

          {/* Logs */}
          <div className="logs">
            <div className="logs-head">
              <h2>Histórico de Ações</h2>
              <span className="logs-badge">{logs.length} registros</span>
            </div>

          <div className="log-list">
            {logs.length === 0
              ? <div className="log-empty">Nenhuma ação registrada ainda.</div>
              : logs.map((l) => (
                <div key={l.id} className="log-item">
                  <span className="log-time">
                    {new Date(l.createdAt).toLocaleTimeString('pt-BR')}
                  </span>
                  <span className="log-device">{l.device?.name ?? l.deviceId}</span>
                  <span className="log-room">{l.device?.room}</span>
                  <span className={`log-action ${l.action === 'ON' ? 'on' : 'off'}`}>
                    {l.action === 'ON' ? 'Ligado' : 'Desligado'}
                  </span>
                </div>              
              ))
            }
          </div>
          </div>
        </main>

        <footer>
          <span>Casa Inteligente UPX · 2025</span>
          <span>React + Node.js + PostgreSQL + MQTT + Socket.io + Claude AI</span>
        </footer>
      </div>

      {/* ── Chat IA ────────────────────────────────── */}
      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-head">
            <span className="chat-head-icon">🤖</span>
            <div className="chat-head-info">
              <strong>Assistente IA</strong>
              <span>Claude · Anthropic — controle por voz</span>
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
              placeholder="Ex: desligue tudo às 23:30..."
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