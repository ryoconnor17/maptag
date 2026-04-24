import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { fetchPlayers, createPlayer, deletePlayer, upsertScore, deleteScore } from './db'

// ── Helpers ──────────────────────────────────────────────────────────────────
const avg  = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0
const hi   = a => a.length ? Math.max(...a) : 0
const lo   = a => a.length ? Math.min(...a) : 0
const today = () => new Date().toISOString().slice(0, 10)

function streak(scores) {
  if (!scores.length) return 0
  let s = 1
  for (let i = scores.length - 1; i > 0; i--) {
    const diff = (new Date(scores[i].date) - new Date(scores[i - 1].date)) / 86400000
    if (diff <= 1.5) s++; else break
  }
  return s
}

function scoreColor(v) {
  if (v >= 900) return '#4ade80'
  if (v >= 700) return '#86efac'
  if (v >= 500) return '#fbbf24'
  if (v >= 300) return '#fb923c'
  return '#f87171'
}

const PALETTE = ['#60a5fa', '#f472b6']

// ── Sub-components ────────────────────────────────────────────────────────────
function GlobeIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '3px solid #1e2d50', borderTopColor: '#60a5fa',
        animation: 'spin 0.7s linear infinite',
      }} />
    </div>
  )
}

function StatCard({ label, value, color, mono = true }) {
  return (
    <div className="stat-card" style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 12, padding: '13px 16px' }}>
      <div style={{ fontSize: 10, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: mono ? "'DM Mono',monospace" : 'inherit', fontSize: 22, fontWeight: 700, color: color ?? '#e2eaf8', lineHeight: 1 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}

function H2HRow({ label, a, b, higherWins = true }) {
  const aNum = typeof a === 'number' ? a : null
  const bNum = typeof b === 'number' ? b : null
  const aWins = aNum != null && bNum != null && (higherWins ? aNum > bNum : aNum < bNum)
  const bWins = aNum != null && bNum != null && (higherWins ? bNum > aNum : bNum < aNum)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #1a2540' }}>
      <div style={{ textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 700, color: aWins ? PALETTE[0] : '#e2eaf8' }}>
        {aNum != null ? aNum.toLocaleString() : '—'}
        {aWins && <span style={{ marginLeft: 6, fontSize: 11 }}>◀</span>}
      </div>
      <div style={{ fontSize: 10, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', minWidth: 80 }}>{label}</div>
      <div style={{ textAlign: 'left', fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 700, color: bWins ? PALETTE[1] : '#e2eaf8' }}>
        {bWins && <span style={{ marginRight: 6, fontSize: 11 }}>▶</span>}
        {bNum != null ? bNum.toLocaleString() : '—'}
      </div>
    </div>
  )
}

function CompareTooltip({ active, payload, label, players, compareIds }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#131e33', border: '1px solid #2d3f6b', borderRadius: 10, padding: '10px 16px', minWidth: 160 }}>
      <p style={{ color: '#7b93c9', fontSize: 11, margin: '0 0 8px' }}>{label}</p>
      {payload.map((p, i) => {
        const player = players.find(pl => pl.id === compareIds[i])
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: i < payload.length - 1 ? 4 : 0 }}>
            <span style={{ color: PALETTE[i], fontSize: 12 }}>{player?.name}</span>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: p.value != null ? scoreColor(p.value) : '#4b6097' }}>
              {p.value != null ? p.value.toLocaleString() : '—'}
            </span>
          </div>
        )
      })}
      {payload.length === 2 && payload[0].value != null && payload[1].value != null && (
        <div style={{ borderTop: '1px solid #1e2d50', marginTop: 8, paddingTop: 8 }}>
          <span style={{ color: '#7b93c9', fontSize: 11 }}>diff </span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 700, color: payload[0].value >= payload[1].value ? PALETTE[0] : PALETTE[1] }}>
            {payload[0].value >= payload[1].value ? '+' : '-'}{Math.abs(payload[0].value - payload[1].value)}
          </span>
        </div>
      )}
    </div>
  )
}

function SingleTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#131e33', border: '1px solid #2d3f6b', borderRadius: 8, padding: '8px 14px' }}>
      <p style={{ color: '#7b93c9', fontSize: 11, margin: '0 0 2px' }}>{label}</p>
      <p style={{ color: scoreColor(payload[0].value), fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 700, margin: 0 }}>
        {payload[0].value?.toLocaleString()}
      </p>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [players, setPlayers]       = useState([])
  const [selected, setSelected]     = useState(null)
  const [compareIds, setCompareIds] = useState([])
  const [tab, setTab]               = useState('individual')
  const [view, setView]             = useState('dashboard')
  const [newName, setNewName]       = useState('')
  const [newScore, setNewScore]     = useState('')
  const [newDate, setNewDate]       = useState(today())
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)
  const inputRef = useRef()

  // ── Load from Supabase on mount ────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchPlayers()
      setPlayers(data)
      if (data.length > 0 && !selected) {
        setSelected(data[0].id)
        setCompareIds(data.slice(0, 2).map(p => p.id))
      }
    } catch (e) {
      setError('Failed to load data. Check your Supabase environment variables.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if ((view === 'add-player' || view === 'add-score') && inputRef.current)
      setTimeout(() => inputRef.current?.focus(), 80)
  }, [view])

  // ── Mutations ──────────────────────────────────────────────────────────────
  async function handleAddPlayer() {
    const name = newName.trim()
    if (!name) return
    try {
      setSaving(true)
      const player = await createPlayer(name)
      setPlayers(prev => [...prev, player])
      setSelected(player.id)
      setCompareIds(prev => prev.length < 2 ? [...prev, player.id] : prev)
      setNewName('')
      setView('dashboard')
    } catch (e) {
      setError('Could not add player.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddScore() {
    const val = parseInt(newScore)
    if (isNaN(val) || val < 0 || !selected) return
    try {
      setSaving(true)
      const score = await upsertScore(selected, newDate, val)
      setPlayers(prev => prev.map(p => {
        if (p.id !== selected) return p
        const filtered = p.scores.filter(s => s.date !== newDate)
        return {
          ...p,
          scores: [...filtered, score].sort((a, b) => a.date.localeCompare(b.date)),
        }
      }))
      setNewScore('')
      setNewDate(today())
      setView('dashboard')
    } catch (e) {
      setError('Could not save score.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteScore(scoreId, playerId) {
    try {
      await deleteScore(scoreId)
      setPlayers(prev => prev.map(p =>
        p.id === playerId ? { ...p, scores: p.scores.filter(s => s.id !== scoreId) } : p
      ))
    } catch (e) {
      setError('Could not delete score.')
      console.error(e)
    }
  }

  async function handleDeletePlayer(id, name) {
    if (!confirm(`Remove ${name} and all their scores?`)) return
    try {
      await deletePlayer(id)
      setPlayers(prev => prev.filter(p => p.id !== id))
      if (selected === id) setSelected(players.find(p => p.id !== id)?.id ?? null)
      setCompareIds(prev => prev.filter(x => x !== id))
    } catch (e) {
      setError('Could not delete player.')
      console.error(e)
    }
  }

  function toggleCompare(id) {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length < 2) return [...prev, id]
      return [prev[1], id]
    })
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentPlayer = players.find(p => p.id === selected)
  const scores = currentPlayer?.scores ?? []
  const vals = scores.map(s => s.value)
  const avgVal = avg(vals), highVal = hi(vals), lowVal = lo(vals), streakVal = streak(scores)
  const chartData = scores.slice(-30).map(s => ({ date: s.date.slice(5), score: s.value }))

  const cPlayers = compareIds.map(id => players.find(p => p.id === id)).filter(Boolean)
  const allDates = [...new Set(cPlayers.flatMap(p => p.scores.map(s => s.date)))].sort()
  const compareChartData = allDates.slice(-30).map(date => {
    const row = { date: date.slice(5) }
    cPlayers.forEach((p, i) => { const s = p.scores.find(s => s.date === date); row[`p${i}`] = s ? s.value : null })
    return row
  })
  const sharedDates = allDates.filter(d => cPlayers.every(p => p.scores.some(s => s.date === d))).reverse()

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0d1424', color: '#e2eaf8', fontFamily: "'DM Sans','Segoe UI',sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#2d3f6b;border-radius:4px}
        input{outline:none} .ptab{cursor:pointer;transition:all .15s} .ptab:hover{background:#1e2d50!important}
        .score-row:hover .del-btn{opacity:1!important} .stat-card{transition:transform .15s} .stat-card:hover{transform:translateY(-2px)}
        .btn{cursor:pointer;transition:all .15s} .btn:hover{filter:brightness(1.12);transform:translateY(-1px)}
        .ntab{cursor:pointer;transition:all .15s;padding:7px 18px;border-radius:8px;font-size:13px;font-weight:600;border:none;font-family:inherit}
        .ntab:hover{background:#1e2d50!important}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* Header */}
      <header style={{ background: '#111928', borderBottom: '1px solid #1e2d50', padding: '0 22px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ color: '#60a5fa' }}><GlobeIcon /></div>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: '-0.5px' }}>
            Map<span style={{ color: '#60a5fa' }}>Tap</span> Tracker
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3, background: '#0d1424', borderRadius: 9, padding: 3 }}>
          {[['individual', 'Individual'], ['compare', '⚔ Compare']].map(([t, label]) => (
            <button key={t} className="ntab" onClick={() => { setTab(t); setView('dashboard') }}
              style={{ background: tab === t ? '#1e2d50' : 'transparent', color: tab === t ? '#e2eaf8' : '#4b6097', border: tab === t ? '1px solid #2d3f6b' : '1px solid transparent' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => { setView('add-score'); setNewDate(today()); setNewScore('') }} disabled={!selected || saving}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 15px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, opacity: selected ? 1 : 0.4 }}>
            + Score
          </button>
          <button className="btn" onClick={() => { setNewName(''); setView('add-player') }} disabled={saving}
            style={{ background: 'transparent', color: '#93b4e8', border: '1px solid #1e2d50', borderRadius: 8, padding: '6px 15px', fontFamily: 'inherit', fontSize: 13, fontWeight: 500 }}>
            + Player
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div style={{ background: '#3b1212', borderBottom: '1px solid #7f1d1d', padding: '10px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fca5a5', fontSize: 13 }}>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{ width: 170, background: '#111928', borderRight: '1px solid #1e2d50', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', flexShrink: 0 }}>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: '#4b6097', fontWeight: 600, margin: '0 0 6px 6px' }}>Players</p>
          {loading
            ? <Spinner />
            : players.length === 0
              ? <p style={{ color: '#4b6097', fontSize: 12, padding: '6px' }}>No players yet.</p>
              : players.map(p => {
                  const isSelected = p.id === selected
                  const cIdx = compareIds.indexOf(p.id)
                  const pVals = p.scores.map(s => s.value)
                  return (
                    <div key={p.id} className="ptab"
                      onClick={() => { setSelected(p.id); if (tab === 'compare') toggleCompare(p.id) }}
                      style={{ background: isSelected ? '#1e2d50' : 'transparent', borderRadius: 8, padding: '8px 10px', border: isSelected ? '1px solid #2d4070' : '1px solid transparent', position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {tab === 'compare' && cIdx !== -1 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: PALETTE[cIdx], flexShrink: 0, display: 'inline-block' }} />}
                        <span style={{ fontWeight: 600, fontSize: 13, color: isSelected ? '#e2eaf8' : '#7b93c9' }}>{p.name}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#4b6097', marginTop: 2 }}>{p.scores.length} game{p.scores.length !== 1 ? 's' : ''}</div>
                      {pVals.length > 0 && <div style={{ fontSize: 11, color: '#60a5fa', fontFamily: "'DM Mono',monospace" }}>avg {avg(pVals)}</div>}
                      <button onClick={e => { e.stopPropagation(); handleDeletePlayer(p.id, p.name) }}
                        style={{ position: 'absolute', top: 5, right: 6, background: 'transparent', border: 'none', color: '#4b6097', cursor: 'pointer', fontSize: 13, padding: 2 }}>×</button>
                    </div>
                  )
                })
          }
          {tab === 'compare' && players.length >= 2 && (
            <p style={{ fontSize: 10, color: '#4b6097', padding: '8px 6px 0', lineHeight: 1.5 }}>Tap players to compare (max 2).</p>
          )}
        </aside>

        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Add Player */}
          {view === 'add-player' && (
            <div style={{ maxWidth: 400, margin: '40px auto', background: '#111928', border: '1px solid #1e2d50', borderRadius: 16, padding: 28 }}>
              <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 20px' }}>New Player</h2>
              <label style={{ fontSize: 12, color: '#7b93c9', display: 'block', marginBottom: 6 }}>Name</label>
              <input ref={inputRef} value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddPlayer()} placeholder="e.g. Alex"
                style={{ width: '100%', background: '#0d1424', border: '1px solid #2d3f6b', borderRadius: 8, padding: '10px 14px', color: '#e2eaf8', fontSize: 15, fontFamily: 'inherit', marginBottom: 16 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" onClick={handleAddPlayer} disabled={saving}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, flex: 1, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : 'Add'}
                </button>
                <button className="btn" onClick={() => setView('dashboard')}
                  style={{ background: 'transparent', color: '#7b93c9', border: '1px solid #1e2d50', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontSize: 14 }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Add Score */}
          {view === 'add-score' && currentPlayer && (
            <div style={{ maxWidth: 400, margin: '40px auto', background: '#111928', border: '1px solid #1e2d50', borderRadius: 16, padding: 28 }}>
              <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>Log Score</h2>
              <p style={{ color: '#7b93c9', fontSize: 13, margin: '0 0 20px' }}>for <strong style={{ color: '#60a5fa' }}>{currentPlayer.name}</strong></p>
              <label style={{ fontSize: 12, color: '#7b93c9', display: 'block', marginBottom: 6 }}>Score</label>
              <input ref={inputRef} type="number" value={newScore} onChange={e => setNewScore(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddScore()} placeholder="e.g. 823"
                style={{ width: '100%', background: '#0d1424', border: '1px solid #2d3f6b', borderRadius: 8, padding: '10px 14px', color: '#e2eaf8', fontSize: 15, fontFamily: "'DM Mono',monospace", marginBottom: 14 }} />
              <label style={{ fontSize: 12, color: '#7b93c9', display: 'block', marginBottom: 6 }}>Date</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                style={{ width: '100%', background: '#0d1424', border: '1px solid #2d3f6b', borderRadius: 8, padding: '10px 14px', color: '#e2eaf8', fontSize: 14, fontFamily: 'inherit', marginBottom: 20, colorScheme: 'dark' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" onClick={handleAddScore} disabled={saving}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, flex: 1, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn" onClick={() => setView('dashboard')}
                  style={{ background: 'transparent', color: '#7b93c9', border: '1px solid #1e2d50', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontSize: 14 }}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── INDIVIDUAL ──────────────────────────────────────────────────── */}
          {view === 'dashboard' && tab === 'individual' && (
            <>
              {loading ? <Spinner /> : !currentPlayer ? (
                <div style={{ textAlign: 'center', marginTop: 80, color: '#4b6097' }}>
                  <GlobeIcon size={36} /><p style={{ marginTop: 14, fontSize: 15 }}>Add a player to get started!</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
                    <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, margin: 0, letterSpacing: '-0.5px' }}>{currentPlayer.name}</h1>
                    <span style={{ fontSize: 13, color: '#4b6097' }}>{scores.length} game{scores.length !== 1 ? 's' : ''} logged</span>
                  </div>
                  {scores.length > 0 ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(128px,1fr))', gap: 11, marginBottom: 22 }}>
                        <StatCard label="Average"     value={avgVal} />
                        <StatCard label="High Score"  value={highVal} color="#4ade80" />
                        <StatCard label="Low Score"   value={lowVal}  color="#f87171" />
                        <StatCard label="🔥 Streak"   value={`${streakVal}d`} mono={false} />
                        <StatCard label="Last Score"  value={scores[scores.length - 1]?.value} color={scoreColor(scores[scores.length - 1]?.value ?? 0)} />
                        <StatCard label="Total Games" value={scores.length} mono={false} />
                      </div>
                      <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 14, padding: '18px 18px 10px', marginBottom: 20 }}>
                        <div style={{ fontSize: 11, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 }}>Score Over Time</div>
                        <ResponsiveContainer width="100%" height={170}>
                          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: '#4b6097', fontSize: 10 }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fill: '#4b6097', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                            <ReferenceLine y={avgVal} stroke="#2d4070" strokeDasharray="4 4" />
                            <Tooltip content={<SingleTooltip />} />
                            <Line type="monotone" dataKey="score" stroke="#60a5fa" strokeWidth={2.5}
                              dot={{ fill: '#60a5fa', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#93c5fd', strokeWidth: 0 }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                        <div style={{ fontSize: 10, color: '#4b6097', marginTop: 2, textAlign: 'right' }}>— avg {avgVal}</div>
                      </div>
                      <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 14, padding: '18px' }}>
                        <div style={{ fontSize: 11, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>Score History</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead><tr>{['Date', 'Score', 'vs Avg', ''].map(h => (
                            <th key={h} style={{ textAlign: h === '' ? 'right' : 'left', fontSize: 10, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 8, fontWeight: 500 }}>{h}</th>
                          ))}</tr></thead>
                          <tbody>{[...scores].reverse().map(s => {
                            const diff = s.value - avgVal
                            return (
                              <tr key={s.id} className="score-row" style={{ borderTop: '1px solid #1a2540' }}>
                                <td style={{ padding: '9px 0', color: '#7b93c9', fontSize: 13 }}>{s.date}</td>
                                <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: scoreColor(s.value), padding: '9px 0' }}>{s.value.toLocaleString()}</td>
                                <td style={{ fontSize: 12, color: diff >= 0 ? '#4ade80' : '#f87171', fontFamily: "'DM Mono',monospace" }}>{diff >= 0 ? '+' : ''}{diff}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <button className="del-btn" onClick={() => handleDeleteScore(s.id, selected)}
                                    style={{ opacity: 0, background: 'transparent', border: 'none', color: '#4b6097', cursor: 'pointer', fontSize: 14, padding: '2px 6px', transition: 'opacity .15s' }}>×</button>
                                </td>
                              </tr>
                            )
                          })}</tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', marginTop: 60, color: '#4b6097' }}>
                      <p style={{ fontSize: 15 }}>No scores yet for <strong style={{ color: '#60a5fa' }}>{currentPlayer.name}</strong>.</p>
                      <button className="btn" onClick={() => setView('add-score')}
                        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, marginTop: 12 }}>
                        Log First Score
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── COMPARE ─────────────────────────────────────────────────────── */}
          {view === 'dashboard' && tab === 'compare' && (
            <>
              {loading ? <Spinner /> : cPlayers.length < 2 ? (
                <div style={{ textAlign: 'center', marginTop: 80, color: '#4b6097' }}>
                  <GlobeIcon size={36} />
                  <p style={{ marginTop: 14, fontSize: 15 }}>
                    {players.length < 2 ? 'Add at least 2 players to compare.' : 'Click 2 players in the sidebar to compare them.'}
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
                    {cPlayers.map((p, i) => {
                      const pVals = p.scores.map(s => s.value)
                      return (
                        <div key={p.id} style={{ background: '#111928', border: `1px solid ${PALETTE[i]}33`, borderRadius: 14, padding: '14px 18px', borderTop: `3px solid ${PALETTE[i]}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: PALETTE[i], display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 19 }}>{p.name}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                            {[{ label: 'Avg', v: avg(pVals) }, { label: 'High', v: hi(pVals), c: '#4ade80' }, { label: 'Low', v: lo(pVals), c: '#f87171' }, { label: 'Games', v: p.scores.length }].map(({ label, v, c }) => (
                              <div key={label} style={{ background: '#0d1424', borderRadius: 8, padding: '7px 10px' }}>
                                <div style={{ fontSize: 10, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: c ?? PALETTE[i] }}>{pVals.length ? v.toLocaleString() : '—'}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 14, padding: '18px 18px 10px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2 }}>Score Over Time</div>
                      <div style={{ display: 'flex', gap: 16 }}>
                        {cPlayers.map((p, i) => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 14, height: 3, background: PALETTE[i], display: 'inline-block', borderRadius: 2 }} />
                            <span style={{ fontSize: 11, color: PALETTE[i] }}>{p.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={compareChartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: '#4b6097', fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: '#4b6097', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                        <Tooltip content={<CompareTooltip players={players} compareIds={compareIds} />} />
                        {cPlayers.map((p, i) => (
                          <Line key={p.id} type="monotone" dataKey={`p${i}`} stroke={PALETTE[i]} strokeWidth={2.5}
                            dot={{ fill: PALETTE[i], r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>Head to Head</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #1e2d50' }}>
                      <div style={{ textAlign: 'right', fontWeight: 700, color: PALETTE[0], fontSize: 13 }}>{cPlayers[0]?.name}</div>
                      <div />
                      <div style={{ textAlign: 'left', fontWeight: 700, color: PALETTE[1], fontSize: 13 }}>{cPlayers[1]?.name}</div>
                    </div>
                    {(() => {
                      const [pa, pb] = cPlayers
                      const aVals = pa.scores.map(s => s.value), bVals = pb.scores.map(s => s.value)
                      return [
                        { label: 'Average',    a: avg(aVals),         b: avg(bVals),          higherWins: true  },
                        { label: 'High Score', a: hi(aVals),          b: hi(bVals),           higherWins: true  },
                        { label: 'Low Score',  a: lo(aVals),          b: lo(bVals),           higherWins: false },
                        { label: '🔥 Streak',  a: streak(pa.scores),  b: streak(pb.scores),   higherWins: true  },
                        { label: 'Games',      a: pa.scores.length,   b: pb.scores.length,    higherWins: true  },
                      ].map(row => <H2HRow key={row.label} {...row} />)
                    })()}
                  </div>

                  <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 14, padding: '18px' }}>
                    <div style={{ fontSize: 11, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>Day-by-Day Matchups</div>
                    {sharedDates.length === 0 ? (
                      <p style={{ color: '#4b6097', fontSize: 13 }}>Log scores on the same date for both players to see matchups.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                          {['Date', cPlayers[0]?.name, cPlayers[1]?.name, 'Diff', 'Winner'].map((h, i) => (
                            <th key={h} style={{ textAlign: i === 0 ? 'left' : 'center', fontSize: 10, color: i === 1 ? PALETTE[0] : i === 2 ? PALETTE[1] : '#4b6097', textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 8, fontWeight: i === 1 || i === 2 ? 600 : 500 }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>{sharedDates.map(date => {
                          const [pa, pb] = cPlayers
                          const sa = pa.scores.find(s => s.date === date)?.value
                          const sb = pb.scores.find(s => s.date === date)?.value
                          const diff = sa - sb
                          const wi = diff > 0 ? 0 : diff < 0 ? 1 : -1
                          return (
                            <tr key={date} style={{ borderTop: '1px solid #1a2540' }}>
                              <td style={{ padding: '9px 0', color: '#7b93c9', fontSize: 13 }}>{date}</td>
                              {[sa, sb].map((v, i) => (
                                <td key={i} style={{ textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: 15, fontWeight: 700, color: scoreColor(v ?? 0), padding: '9px 0' }}>{v?.toLocaleString() ?? '—'}</td>
                              ))}
                              <td style={{ textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: 13, color: wi === 0 ? PALETTE[0] : wi === 1 ? PALETTE[1] : '#4b6097' }}>
                                {diff === 0 ? 'tie' : diff > 0 ? `+${diff}` : diff}
                              </td>
                              <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: wi >= 0 ? PALETTE[wi] : '#4b6097' }}>
                                {diff === 0 ? '🤝' : cPlayers[wi]?.name}
                              </td>
                            </tr>
                          )
                        })}</tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
