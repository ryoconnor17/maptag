import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { fetchPlayers, createPlayer, deletePlayer, upsertScore, deleteScore } from './db'

// ── Helpers ───────────────────────────────────────────────────────────────────
const avg   = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0
const hi    = a => a.length ? Math.max(...a) : 0
const lo    = a => a.length ? Math.min(...a) : 0
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

// ── useIsMobile ───────────────────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function GlobeIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}
function SwordsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l2-2M3 21l6-6M19 3l2 2-6.5 6.5M21 21l-6-6" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1e2d50', borderTopColor: '#60a5fa', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, mono = true }) {
  return (
    <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: mono ? "'DM Mono',monospace" : 'inherit', fontSize: 20, fontWeight: 700, color: color ?? '#e2eaf8', lineHeight: 1 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}

// ── H2HRow ────────────────────────────────────────────────────────────────────
function H2HRow({ label, a, b, higherWins = true }) {
  const aNum = typeof a === 'number' ? a : null
  const bNum = typeof b === 'number' ? b : null
  const aWins = aNum != null && bNum != null && (higherWins ? aNum > bNum : aNum < bNum)
  const bWins = aNum != null && bNum != null && (higherWins ? bNum > aNum : bNum < aNum)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid #1a2540' }}>
      <div style={{ textAlign: 'right', fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: aWins ? PALETTE[0] : '#e2eaf8' }}>
        {aNum != null ? aNum.toLocaleString() : '—'}{aWins && <span style={{ marginLeft: 5, fontSize: 10 }}>◀</span>}
      </div>
      <div style={{ fontSize: 9, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', minWidth: 68 }}>{label}</div>
      <div style={{ textAlign: 'left', fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: bWins ? PALETTE[1] : '#e2eaf8' }}>
        {bWins && <span style={{ marginRight: 5, fontSize: 10 }}>▶</span>}{bNum != null ? bNum.toLocaleString() : '—'}
      </div>
    </div>
  )
}

// ── Tooltips ──────────────────────────────────────────────────────────────────
function SingleTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#131e33', border: '1px solid #2d3f6b', borderRadius: 8, padding: '8px 12px' }}>
      <p style={{ color: '#7b93c9', fontSize: 10, margin: '0 0 2px' }}>{label}</p>
      <p style={{ color: scoreColor(payload[0].value), fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, margin: 0 }}>{payload[0].value?.toLocaleString()}</p>
    </div>
  )
}
function CompareTooltip({ active, payload, label, players, compareIds }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#131e33', border: '1px solid #2d3f6b', borderRadius: 10, padding: '8px 12px', minWidth: 140 }}>
      <p style={{ color: '#7b93c9', fontSize: 10, margin: '0 0 6px' }}>{label}</p>
      {payload.map((p, i) => {
        const player = players.find(pl => pl.id === compareIds[i])
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: i < payload.length - 1 ? 3 : 0 }}>
            <span style={{ color: PALETTE[i], fontSize: 11 }}>{player?.name}</span>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 700, color: p.value != null ? scoreColor(p.value) : '#4b6097' }}>
              {p.value != null ? p.value.toLocaleString() : '—'}
            </span>
          </div>
        )
      })}
      {payload.length === 2 && payload[0].value != null && payload[1].value != null && (
        <div style={{ borderTop: '1px solid #1e2d50', marginTop: 6, paddingTop: 6 }}>
          <span style={{ color: '#7b93c9', fontSize: 10 }}>diff </span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 700, color: payload[0].value >= payload[1].value ? PALETTE[0] : PALETTE[1] }}>
            {payload[0].value >= payload[1].value ? '+' : '-'}{Math.abs(payload[0].value - payload[1].value)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── BottomSheet ───────────────────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40,
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.25s',
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#111928', borderRadius: '20px 20px 0 0', border: '1px solid #1e2d50', borderBottom: 'none',
        zIndex: 50, padding: '0 20px 40px',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 16px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#2d3f6b' }} />
        </div>
        {title && <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, margin: '0 0 20px' }}>{title}</h2>}
        {children}
      </div>
    </>
  )
}

// ── PlayerPickerSheet ─────────────────────────────────────────────────────────
function PlayerPickerSheet({ open, onClose, players, selected, onSelect, tab, compareIds, onToggleCompare, onDeletePlayer, onAddPlayer }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Players">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {players.map(p => {
          const isSelected = p.id === selected
          const cIdx = compareIds.indexOf(p.id)
          const pVals = p.scores.map(s => s.value)
          return (
            <div key={p.id}
              onClick={() => { onSelect(p.id); if (tab === 'compare') onToggleCompare(p.id); onClose() }}
              style={{ background: isSelected ? '#1e2d50' : '#0d1424', border: `1px solid ${isSelected ? '#2d4070' : '#1e2d50'}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {tab === 'compare' && cIdx !== -1 && <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE[cIdx], flexShrink: 0 }} />}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: isSelected ? '#e2eaf8' : '#7b93c9' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#4b6097', marginTop: 2 }}>
                    {p.scores.length} game{p.scores.length !== 1 ? 's' : ''}{pVals.length > 0 ? ` · avg ${avg(pVals)}` : ''}
                  </div>
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); onDeletePlayer(p.id, p.name) }}
                style={{ background: 'transparent', border: 'none', color: '#4b6097', cursor: 'pointer', fontSize: 22, padding: '4px 8px', lineHeight: 1 }}>×</button>
            </div>
          )
        })}
      </div>
      <button onClick={onAddPlayer}
        style={{ width: '100%', background: '#1e2d50', color: '#93b4e8', border: '1px dashed #2d4070', borderRadius: 12, padding: 14, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <PlusIcon /> Add Player
      </button>
    </BottomSheet>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile()

  const [players, setPlayers]             = useState([])
  const [selected, setSelected]           = useState(null)
  const [compareIds, setCompareIds]       = useState([])
  const [tab, setTab]                     = useState('individual')
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState(null)
  const [newName, setNewName]             = useState('')
  const [newScore, setNewScore]           = useState('')
  const [newDate, setNewDate]             = useState(today())
  const [showPlayers, setShowPlayers]     = useState(false)
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [showAddScore, setShowAddScore]   = useState(false)
  const inputRef = useRef()

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const data = await fetchPlayers()
      setPlayers(data)
      if (data.length > 0) {
        setSelected(data[0].id)
        setCompareIds(data.slice(0, 2).map(p => p.id))
      }
    } catch (e) { setError('Failed to load. Check your Supabase config.'); console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (showAddPlayer && inputRef.current) setTimeout(() => inputRef.current?.focus(), 120) }, [showAddPlayer])

  async function handleAddPlayer() {
    const name = newName.trim(); if (!name) return
    try {
      setSaving(true)
      const player = await createPlayer(name)
      setPlayers(prev => [...prev, player])
      setSelected(player.id)
      setCompareIds(prev => prev.length < 2 ? [...prev, player.id] : prev)
      setNewName(''); setShowAddPlayer(false)
    } catch (e) { setError('Could not add player.') } finally { setSaving(false) }
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
        return { ...p, scores: [...filtered, score].sort((a, b) => a.date.localeCompare(b.date)) }
      }))
      setNewScore(''); setNewDate(today()); setShowAddScore(false)
    } catch (e) { setError('Could not save score.') } finally { setSaving(false) }
  }

  async function handleDeleteScore(scoreId, playerId) {
    try {
      await deleteScore(scoreId)
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, scores: p.scores.filter(s => s.id !== scoreId) } : p))
    } catch (e) { setError('Could not delete score.') }
  }

  async function handleDeletePlayer(id, name) {
    if (!confirm(`Remove ${name} and all their scores?`)) return
    try {
      await deletePlayer(id)
      setPlayers(prev => prev.filter(p => p.id !== id))
      if (selected === id) setSelected(players.find(p => p.id !== id)?.id ?? null)
      setCompareIds(prev => prev.filter(x => x !== id))
      setShowPlayers(false)
    } catch (e) { setError('Could not delete player.') }
  }

  function toggleCompare(id) {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length < 2) return [...prev, id]
      return [prev[1], id]
    })
  }

  // Derived
  const currentPlayer = players.find(p => p.id === selected)
  const scores = currentPlayer?.scores ?? []
  const vals = scores.map(s => s.value)
  const avgVal = avg(vals), highVal = hi(vals), lowVal = lo(vals), streakVal = streak(scores)
  const chartData = scores.slice(-20).map(s => ({ date: s.date.slice(5), score: s.value }))
  const cPlayers = compareIds.map(id => players.find(p => p.id === id)).filter(Boolean)
  const allDates = [...new Set(cPlayers.flatMap(p => p.scores.map(s => s.date)))].sort()
  const compareChartData = allDates.slice(-20).map(date => {
    const row = { date: date.slice(5) }
    cPlayers.forEach((p, i) => { const s = p.scores.find(s => s.date === date); row[`p${i}`] = s ? s.value : null })
    return row
  })
  const sharedDates = allDates.filter(d => cPlayers.every(p => p.scores.some(s => s.date === d))).reverse()

  // Shared styles
  const inputStyle = { width: '100%', background: '#0d1424', border: '1px solid #2d3f6b', borderRadius: 10, padding: '13px 14px', color: '#e2eaf8', fontSize: 16, fontFamily: 'inherit', WebkitAppearance: 'none', outline: 'none' }
  const labelStyle = { fontSize: 12, color: '#7b93c9', display: 'block', marginBottom: 6 }
  const primaryBtn = (ex = {}) => ({ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1, ...ex })
  const ghostBtn   = (ex = {}) => ({ background: 'transparent', color: '#7b93c9', border: '1px solid #1e2d50', borderRadius: 12, padding: 14, fontFamily: 'inherit', fontSize: 15, cursor: 'pointer', ...ex })

  return (
    <div style={{ minHeight: '100vh', background: '#0d1424', color: '#e2eaf8', fontFamily: "'DM Sans','Segoe UI',sans-serif", display: 'flex', flexDirection: 'column', paddingBottom: isMobile ? 72 : 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #2d3f6b; border-radius: 4px; }
        input, button { font-family: inherit; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .ptab { cursor: pointer; transition: background 0.15s; }
        .ptab:hover { background: #1e2d50 !important; }
        .score-row:hover .del-btn { opacity: 0.6 !important; }
        .btn { cursor: pointer; transition: all 0.15s; } .btn:hover { filter: brightness(1.1); }
        .ntab { cursor: pointer; transition: all 0.15s; border: none; } .ntab:hover { background: #1e2d50 !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .fade-in { animation: fadeIn 0.2s ease; }
      `}</style>

      {/* Header */}
      <header style={{ background: '#111928', borderBottom: '1px solid #1e2d50', padding: isMobile ? '0 16px' : '0 22px', height: isMobile ? 52 : 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: '#60a5fa' }}><GlobeIcon size={22} /></div>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: isMobile ? 16 : 18, letterSpacing: '-0.5px' }}>
            Map<span style={{ color: '#60a5fa' }}>Tap</span> Tracker
          </span>
        </div>

        {!isMobile && (
          <div style={{ display: 'flex', gap: 3, background: '#0d1424', borderRadius: 9, padding: 3 }}>
            {[['individual', 'Individual'], ['compare', '⚔ Compare']].map(([t, label]) => (
              <button key={t} className="ntab" onClick={() => setTab(t)}
                style={{ padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: tab === t ? '#1e2d50' : 'transparent', color: tab === t ? '#e2eaf8' : '#4b6097', border: tab === t ? '1px solid #2d3f6b' : '1px solid transparent' }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {!isMobile ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => { setShowAddScore(true); setNewDate(today()); setNewScore('') }} disabled={!selected}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 15px', fontSize: 13, fontWeight: 600, opacity: selected ? 1 : 0.4 }}>+ Score</button>
            <button className="btn" onClick={() => { setNewName(''); setShowAddPlayer(true) }}
              style={{ background: 'transparent', color: '#93b4e8', border: '1px solid #1e2d50', borderRadius: 8, padding: '6px 15px', fontSize: 13, fontWeight: 500 }}>+ Player</button>
          </div>
        ) : (
          <button onClick={() => setShowPlayers(true)}
            style={{ background: '#1e2d50', border: '1px solid #2d4070', borderRadius: 20, padding: '6px 14px', color: '#93b4e8', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <PersonIcon />
            <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentPlayer?.name ?? 'Players'}
            </span>
          </button>
        )}
      </header>

      {error && (
        <div style={{ background: '#3b1212', borderBottom: '1px solid #7f1d1d', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fca5a5', fontSize: 13 }}>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Desktop sidebar */}
        {!isMobile && (
          <aside style={{ width: 176, background: '#111928', borderRight: '1px solid #1e2d50', padding: '14px 8px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flexShrink: 0 }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: '#4b6097', fontWeight: 600, margin: '0 0 6px 6px' }}>Players</p>
            {loading ? <Spinner /> : players.length === 0
              ? <p style={{ color: '#4b6097', fontSize: 12, padding: 6 }}>No players yet.</p>
              : players.map(p => {
                const isSelected = p.id === selected
                const cIdx = compareIds.indexOf(p.id)
                const pVals = p.scores.map(s => s.value)
                return (
                  <div key={p.id} className="ptab"
                    onClick={() => { setSelected(p.id); if (tab === 'compare') toggleCompare(p.id) }}
                    style={{ background: isSelected ? '#1e2d50' : 'transparent', borderRadius: 8, padding: '8px 10px', border: isSelected ? '1px solid #2d4070' : '1px solid transparent', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {tab === 'compare' && cIdx !== -1 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: PALETTE[cIdx], flexShrink: 0 }} />}
                      <span style={{ fontWeight: 600, fontSize: 13, color: isSelected ? '#e2eaf8' : '#7b93c9' }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#4b6097', marginTop: 2 }}>{p.scores.length} game{p.scores.length !== 1 ? 's' : ''}</div>
                    {pVals.length > 0 && <div style={{ fontSize: 11, color: '#60a5fa', fontFamily: "'DM Mono',monospace" }}>avg {avg(pVals)}</div>}
                    <button onClick={e => { e.stopPropagation(); handleDeletePlayer(p.id, p.name) }}
                      style={{ position: 'absolute', top: 5, right: 6, background: 'transparent', border: 'none', color: '#4b6097', cursor: 'pointer', fontSize: 13, padding: 2 }}>×</button>
                  </div>
                )
              })}
            {tab === 'compare' && players.length >= 2 && (
              <p style={{ fontSize: 10, color: '#4b6097', padding: '8px 6px 0', lineHeight: 1.5 }}>Tap to toggle compare (max 2).</p>
            )}
          </aside>
        )}

        <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 14px' : '20px 24px' }}>

          {/* ── INDIVIDUAL ─────────────────────────────────────────────────── */}
          {tab === 'individual' && (
            <>
              {loading ? <Spinner /> : !currentPlayer ? (
                <div style={{ textAlign: 'center', marginTop: 80, color: '#4b6097' }}>
                  <GlobeIcon size={40} />
                  <p style={{ marginTop: 14, fontSize: 15 }}>Add a player to get started!</p>
                  <button onClick={() => isMobile ? setShowPlayers(true) : setShowAddPlayer(true)}
                    style={{ ...primaryBtn(), marginTop: 16, width: 'auto', padding: '12px 28px' }}>Add Player</button>
                </div>
              ) : (
                <div className="fade-in">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: isMobile ? 22 : 26, margin: 0, letterSpacing: '-0.5px' }}>{currentPlayer.name}</h1>
                      <span style={{ fontSize: 12, color: '#4b6097' }}>{scores.length} game{scores.length !== 1 ? 's' : ''} logged</span>
                    </div>
                    {isMobile && (
                      <button onClick={() => { setShowAddScore(true); setNewDate(today()); setNewScore('') }}
                        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <PlusIcon /> Score
                      </button>
                    )}
                  </div>

                  {scores.length > 0 ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(128px, 1fr))', gap: 10, marginBottom: 16 }}>
                        <StatCard label="Average"   value={avgVal} />
                        <StatCard label="High"      value={highVal} color="#4ade80" />
                        <StatCard label="Low"       value={lowVal}  color="#f87171" />
                        <StatCard label="🔥 Streak" value={`${streakVal}d`} mono={false} />
                        <StatCard label="Last"      value={scores[scores.length - 1]?.value} color={scoreColor(scores[scores.length - 1]?.value ?? 0)} />
                        <StatCard label="Games"     value={scores.length} mono={false} />
                      </div>

                      <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 14, padding: '16px 12px 10px', marginBottom: 14 }}>
                        <div style={{ fontSize: 11, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>Score Over Time</div>
                        <ResponsiveContainer width="100%" height={isMobile ? 148 : 168}>
                          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: '#4b6097', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fill: '#4b6097', fontSize: 9 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                            <ReferenceLine y={avgVal} stroke="#2d4070" strokeDasharray="4 4" />
                            <Tooltip content={<SingleTooltip />} />
                            <Line type="monotone" dataKey="score" stroke="#60a5fa" strokeWidth={2.5}
                              dot={{ fill: '#60a5fa', r: isMobile ? 2 : 3, strokeWidth: 0 }}
                              activeDot={{ r: 5, fill: '#93c5fd', strokeWidth: 0 }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                        <div style={{ fontSize: 10, color: '#4b6097', marginTop: 2, textAlign: 'right' }}>— avg {avgVal}</div>
                      </div>

                      <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 14, padding: 16 }}>
                        <div style={{ fontSize: 11, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>Score History</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead><tr>
                            {['Date', 'Score', 'vs Avg', ''].map((h, i) => (
                              <th key={h} style={{ textAlign: i === 0 ? 'left' : i === 3 ? 'right' : 'left', fontSize: 10, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 8, fontWeight: 500 }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>{[...scores].reverse().map(s => {
                            const diff = s.value - avgVal
                            return (
                              <tr key={s.id} className="score-row" style={{ borderTop: '1px solid #1a2540' }}>
                                <td style={{ padding: '11px 0', color: '#7b93c9', fontSize: isMobile ? 12 : 13 }}>{isMobile ? s.date.slice(5) : s.date}</td>
                                <td style={{ fontFamily: "'DM Mono',monospace", fontSize: isMobile ? 15 : 16, fontWeight: 700, color: scoreColor(s.value), padding: '11px 0' }}>{s.value.toLocaleString()}</td>
                                <td style={{ fontSize: 12, color: diff >= 0 ? '#4ade80' : '#f87171', fontFamily: "'DM Mono',monospace" }}>{diff >= 0 ? '+' : ''}{diff}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <button className="del-btn btn" onClick={() => handleDeleteScore(s.id, selected)}
                                    style={{ opacity: isMobile ? 0.4 : 0, background: 'transparent', border: 'none', color: '#4b6097', cursor: 'pointer', fontSize: 20, padding: '2px 6px', transition: 'opacity .15s' }}>×</button>
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
                      <button onClick={() => { setShowAddScore(true); setNewDate(today()); setNewScore('') }}
                        style={{ ...primaryBtn(), marginTop: 12, width: 'auto', padding: '12px 28px' }}>Log First Score</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── COMPARE ────────────────────────────────────────────────────── */}
          {tab === 'compare' && (
            <>
              {loading ? <Spinner /> : cPlayers.length < 2 ? (
                <div style={{ textAlign: 'center', marginTop: 80, color: '#4b6097' }}>
                  <GlobeIcon size={40} />
                  <p style={{ marginTop: 14, fontSize: 15 }}>
                    {players.length < 2 ? 'Add at least 2 players to compare.' : isMobile ? 'Tap "Players" above to pick 2.' : 'Click 2 players in the sidebar.'}
                  </p>
                </div>
              ) : (
                <div className="fade-in">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {cPlayers.map((p, i) => {
                      const pVals = p.scores.map(s => s.value)
                      return (
                        <div key={p.id} style={{ background: '#111928', border: `1px solid ${PALETTE[i]}33`, borderRadius: 14, padding: isMobile ? '12px' : '14px 18px', borderTop: `3px solid ${PALETTE[i]}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE[i], flexShrink: 0 }} />
                            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: isMobile ? 14 : 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {[{ label: 'Avg', v: avg(pVals) }, { label: 'High', v: hi(pVals), c: '#4ade80' }, { label: 'Low', v: lo(pVals), c: '#f87171' }, { label: 'Wins', v: sharedDates.filter(d => { const sv = p.scores.find(s => s.date === d)?.value; const ov = cPlayers.find(op => op.id !== p.id)?.scores.find(s => s.date === d)?.value; return sv != null && ov != null && sv > ov }).length }].map(({ label, v, c }) => (
                              <div key={label} style={{ background: '#0d1424', borderRadius: 8, padding: '6px 8px' }}>
                                <div style={{ fontSize: 9, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: isMobile ? 14 : 16, fontWeight: 700, color: c ?? PALETTE[i] }}>{pVals.length ? v.toLocaleString() : '—'}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 14, padding: '16px 12px 10px', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2 }}>Score Over Time</div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        {cPlayers.map((p, i) => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 12, height: 3, background: PALETTE[i], display: 'inline-block', borderRadius: 2 }} />
                            <span style={{ fontSize: 10, color: PALETTE[i] }}>{p.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={isMobile ? 155 : 195}>
                      <LineChart data={compareChartData} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: '#4b6097', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: '#4b6097', fontSize: 9 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                        <Tooltip content={<CompareTooltip players={players} compareIds={compareIds} />} />
                        {cPlayers.map((p, i) => (
                          <Line key={p.id} type="monotone" dataKey={`p${i}`} stroke={PALETTE[i]} strokeWidth={2.5}
                            dot={{ fill: PALETTE[i], r: isMobile ? 2 : 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>Head to Head</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #1e2d50' }}>
                      <div style={{ textAlign: 'right', fontWeight: 700, color: PALETTE[0], fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cPlayers[0]?.name}</div>
                      <div style={{ width: 68 }} />
                      <div style={{ textAlign: 'left', fontWeight: 700, color: PALETTE[1], fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cPlayers[1]?.name}</div>
                    </div>
                    {(() => {
                      const [pa, pb] = cPlayers
                      const aVals = pa.scores.map(s => s.value), bVals = pb.scores.map(s => s.value)
                      const aWins = sharedDates.filter(d => {
                        const sa = pa.scores.find(s => s.date === d)?.value
                        const sb = pb.scores.find(s => s.date === d)?.value
                        return sa != null && sb != null && sa > sb
                      }).length
                      const bWins = sharedDates.filter(d => {
                        const sa = pa.scores.find(s => s.date === d)?.value
                        const sb = pb.scores.find(s => s.date === d)?.value
                        return sa != null && sb != null && sb > sa
                      }).length
                      return [
                        { label: 'Wins',       a: aWins,             b: bWins,             higherWins: true  },
                        { label: 'Average',    a: avg(aVals),        b: avg(bVals),        higherWins: true  },
                        { label: 'High Score', a: hi(aVals),         b: hi(bVals),         higherWins: true  },
                        { label: 'Low Score',  a: lo(aVals),         b: lo(bVals),         higherWins: true  },
                        { label: 'Streak',     a: streak(pa.scores), b: streak(pb.scores), higherWins: true  },
                        { label: 'Games',      a: pa.scores.length,  b: pb.scores.length,  higherWins: true  },
                      ].map(row => <H2HRow key={row.label} {...row} />)
                    })()}
                  </div>

                  <div style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 14, padding: 16 }}>
                    <div style={{ fontSize: 11, color: '#4b6097', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>Day-by-Day Matchups</div>
                    {sharedDates.length === 0 ? (
                      <p style={{ color: '#4b6097', fontSize: 13 }}>Log scores on the same date for both players to see matchups.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                          {['Date', cPlayers[0]?.name, cPlayers[1]?.name, 'Diff', 'Win'].map((h, i) => (
                            <th key={h} style={{ textAlign: i === 0 ? 'left' : 'center', fontSize: 9, color: i === 1 ? PALETTE[0] : i === 2 ? PALETTE[1] : '#4b6097', textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 8, fontWeight: i === 1 || i === 2 ? 600 : 500, overflow: 'hidden', maxWidth: isMobile ? 48 : 'none', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</th>
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
                              <td style={{ padding: '10px 0', color: '#7b93c9', fontSize: isMobile ? 11 : 13 }}>{isMobile ? date.slice(5) : date}</td>
                              {[sa, sb].map((v, i) => (
                                <td key={i} style={{ textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: isMobile ? 13 : 15, fontWeight: 700, color: scoreColor(v ?? 0), padding: '10px 0' }}>{v?.toLocaleString() ?? '—'}</td>
                              ))}
                              <td style={{ textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: isMobile ? 11 : 13, color: wi === 0 ? PALETTE[0] : wi === 1 ? PALETTE[1] : '#4b6097' }}>
                                {diff === 0 ? '—' : diff > 0 ? `+${diff}` : diff}
                              </td>
                              <td style={{ textAlign: 'center', fontSize: isMobile ? 11 : 12, fontWeight: 600, color: wi >= 0 ? PALETTE[wi] : '#4b6097' }}>
                                {diff === 0 ? '🤝' : isMobile ? (cPlayers[wi]?.name?.split(' ')[0]) : cPlayers[wi]?.name}
                              </td>
                            </tr>
                          )
                        })}</tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── Mobile Bottom Nav ───────────────────────────────────────────────── */}
      {isMobile && (
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 66, background: '#111928', borderTop: '1px solid #1e2d50', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', alignItems: 'center', zIndex: 30, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {/* Individual tab */}
          <button onClick={() => setTab('individual')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: tab === 'individual' ? '#60a5fa' : '#4b6097', height: '100%', position: 'relative' }}>
            <PersonIcon />
            <span style={{ fontSize: 10, fontWeight: 600 }}>Me</span>
            {tab === 'individual' && <span style={{ position: 'absolute', bottom: 0, width: 28, height: 2, background: '#60a5fa', borderRadius: '2px 2px 0 0' }} />}
          </button>

          <div /> {/* spacer */}

          {/* Center FAB */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <button onClick={() => { if (selected) { setShowAddScore(true); setNewDate(today()); setNewScore('') } }} disabled={!selected}
              style={{ width: 52, height: 52, borderRadius: '50%', background: selected ? '#2563eb' : '#1e2d50', border: 'none', cursor: selected ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: selected ? '0 4px 20px rgba(37,99,235,0.45)' : 'none', transition: 'all 0.15s', marginBottom: 10 }}>
              <PlusIcon />
            </button>
          </div>

          <div /> {/* spacer */}

          {/* Compare tab */}
          <button onClick={() => setTab('compare')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: tab === 'compare' ? '#60a5fa' : '#4b6097', height: '100%', position: 'relative' }}>
            <SwordsIcon />
            <span style={{ fontSize: 10, fontWeight: 600 }}>Compare</span>
            {tab === 'compare' && <span style={{ position: 'absolute', bottom: 0, width: 28, height: 2, background: '#60a5fa', borderRadius: '2px 2px 0 0' }} />}
          </button>
        </nav>
      )}

      {/* ── Mobile Player Picker ────────────────────────────────────────────── */}
      {isMobile && (
        <PlayerPickerSheet open={showPlayers} onClose={() => setShowPlayers(false)}
          players={players} selected={selected} onSelect={setSelected}
          tab={tab} compareIds={compareIds} onToggleCompare={toggleCompare}
          onDeletePlayer={handleDeletePlayer}
          onAddPlayer={() => { setShowPlayers(false); setTimeout(() => setShowAddPlayer(true), 220) }} />
      )}

      {/* ── Add Player ─────────────────────────────────────────────────────── */}
      {isMobile ? (
        <BottomSheet open={showAddPlayer} onClose={() => setShowAddPlayer(false)} title="New Player">
          <label style={labelStyle}>Name</label>
          <input ref={inputRef} value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddPlayer()} placeholder="e.g. Alex"
            style={{ ...inputStyle, marginBottom: 20 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleAddPlayer} disabled={saving} style={primaryBtn({ flex: 1 })}>{saving ? 'Saving…' : 'Add Player'}</button>
            <button onClick={() => setShowAddPlayer(false)} style={ghostBtn({ flex: 0.6 })}>Cancel</button>
          </div>
        </BottomSheet>
      ) : showAddPlayer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAddPlayer(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 20px' }}>New Player</h2>
            <label style={labelStyle}>Name</label>
            <input ref={inputRef} value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddPlayer()} placeholder="e.g. Alex"
              style={{ ...inputStyle, marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleAddPlayer} disabled={saving} style={primaryBtn({ flex: 1, padding: '10px', borderRadius: 8 })}>{saving ? 'Saving…' : 'Add'}</button>
              <button onClick={() => setShowAddPlayer(false)} style={ghostBtn({ padding: '10px 18px', borderRadius: 8 })}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Score ──────────────────────────────────────────────────────── */}
      {isMobile ? (
        <BottomSheet open={showAddScore} onClose={() => setShowAddScore(false)} title="Log Score">
          <p style={{ color: '#7b93c9', fontSize: 13, margin: '-12px 0 20px' }}>for <strong style={{ color: '#60a5fa' }}>{currentPlayer?.name}</strong></p>
          <label style={labelStyle}>Score</label>
          <input type="number" inputMode="numeric" value={newScore} onChange={e => setNewScore(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddScore()} placeholder="e.g. 823"
            style={{ ...inputStyle, fontFamily: "'DM Mono',monospace", fontSize: 24, letterSpacing: 1, marginBottom: 14 }} />
          <label style={labelStyle}>Date</label>
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
            style={{ ...inputStyle, marginBottom: 24, colorScheme: 'dark' }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleAddScore} disabled={saving} style={primaryBtn({ flex: 1 })}>{saving ? 'Saving…' : 'Save Score'}</button>
            <button onClick={() => setShowAddScore(false)} style={ghostBtn({ flex: 0.6 })}>Cancel</button>
          </div>
        </BottomSheet>
      ) : showAddScore && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAddScore(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111928', border: '1px solid #1e2d50', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>Log Score</h2>
            <p style={{ color: '#7b93c9', fontSize: 13, margin: '0 0 20px' }}>for <strong style={{ color: '#60a5fa' }}>{currentPlayer?.name}</strong></p>
            <label style={labelStyle}>Score</label>
            <input type="number" value={newScore} onChange={e => setNewScore(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddScore()} placeholder="e.g. 823"
              style={{ ...inputStyle, fontFamily: "'DM Mono',monospace", marginBottom: 14 }} />
            <label style={labelStyle}>Date</label>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
              style={{ ...inputStyle, marginBottom: 20, colorScheme: 'dark' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleAddScore} disabled={saving} style={primaryBtn({ flex: 1, padding: '10px', borderRadius: 8 })}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setShowAddScore(false)} style={ghostBtn({ padding: '10px 18px', borderRadius: 8 })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
