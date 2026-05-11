import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2, XCircle, Search, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, BarChart2, Trophy, AlertTriangle, DollarSign,
} from 'lucide-react'
import { fetchHistory, fetchStats, subscribeToHistory } from '../services/tradeHistory'

const FILTERS = ['ALL', 'WIN', 'BUY', 'SELL']
const PAGE_SIZE = 5

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="p-3 rounded-xl flex items-start gap-3" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #1a2444' }}>
      <div className="p-2 rounded-lg" style={{ background: `${color}18` }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 mb-0.5">{label}</div>
        <div className="font-mono font-bold text-sm" style={{ color }}>{value}</div>
        {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ── Open-trade mini-row ───────────────────────────────────────────────────────
function OpenTradeRow({ trade }) {
  const isBuy = trade.direction === 'BUY'
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.22)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded-full text-xs font-bold"
            style={{
              background: isBuy ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
              color: isBuy ? '#22c55e' : '#ef4444',
            }}
          >
            {trade.direction} {isBuy ? '▲' : '▼'}
          </span>
          <span className="text-xs font-semibold text-slate-300">{trade.type}</span>
          <span className="text-xs text-slate-500 font-mono">{trade.timeframe}</span>
        </div>
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-amber-400"
          style={{ background: 'rgba(15,23,42,0.7)' }}>
          <Clock size={9} /> OPEN
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Entry', val: trade.entry,      color: '#f1f5f9' },
          { label: 'SL',    val: trade.stopLoss,   color: '#f87171' },
          { label: 'TP',    val: trade.takeProfit, color: '#4ade80' },
        ].map(({ label, val, color }) => (
          <div key={label} className="p-1.5 rounded-lg" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1a2444' }}>
            <div className="text-xs text-slate-500 mb-0.5">{label}</div>
            <div className="font-mono text-xs font-bold" style={{ color }}>{val}</div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-xs text-slate-600">
        Opened: {new Date(trade.openedAt).toLocaleString()}
      </div>
    </div>
  )
}

// ── Closed-trade table row ────────────────────────────────────────────────────
function HistoryRow({ trade }) {
  const isWin  = trade.result === 'WIN'
  const isBuy  = trade.trade_type === 'BUY'
  const pnlPos = (trade.pnl ?? 0) >= 0

  const resultColor  = isWin ? '#22c55e' : '#ef4444'
  const resultBg     = isWin ? 'rgba(34,197,94,0.12)'  : 'rgba(239,68,68,0.12)'
  const resultBorder = isWin ? 'rgba(34,197,94,0.25)'  : 'rgba(239,68,68,0.25)'

  return (
    <div
      className="rounded-xl p-3"
      style={{ background: resultBg, border: `1px solid ${resultBorder}` }}
    >
      {/* Row header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="px-2 py-0.5 rounded-full text-xs font-bold"
            style={{
              background: isBuy ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
              color: isBuy ? '#22c55e' : '#ef4444',
            }}
          >
            {trade.trade_type} {isBuy ? '▲' : '▼'}
          </span>
          <span className="text-xs font-semibold text-slate-400">{trade.symbol}</span>
          <span className="text-xs text-slate-500 font-mono">{trade.trade_source}</span>
          {trade.timeframe && (
            <span className="text-xs text-slate-600 font-mono">{trade.timeframe}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold" style={{ color: pnlPos ? '#22c55e' : '#ef4444' }}>
            {pnlPos ? '+' : ''}{trade.pnl ?? 0} pts
          </span>
          <span
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
            style={{ background: 'rgba(15,23,42,0.7)', color: resultColor }}
          >
            {isWin ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
            {isWin ? 'WIN' : 'LOSS'}
          </span>
        </div>
      </div>

      {/* Price levels */}
      <div className="grid grid-cols-4 gap-2 mb-2 text-center">
        {[
          { label: 'Entry',  val: trade.entry_price, color: '#f1f5f9' },
          { label: 'SL',     val: trade.sl_price,    color: '#f87171' },
          { label: 'TP',     val: trade.tp_price,    color: '#4ade80' },
          { label: 'Exit',   val: trade.exit_price ?? '—', color: resultColor },
        ].map(({ label, val, color }) => (
          <div key={label} className="p-1.5 rounded-lg" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1a2444' }}>
            <div className="text-xs text-slate-500 mb-0.5">{label}</div>
            <div className="font-mono text-xs font-bold" style={{ color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* R:R + timestamps */}
      <div className="flex items-center justify-between text-xs text-slate-600 flex-wrap gap-1">
        <span>
          R:R{' '}
          <span
            className="font-mono font-bold"
            style={{ color: (trade.risk_reward ?? 0) >= 3 ? '#22c55e' : (trade.risk_reward ?? 0) >= 1.5 ? '#f59e0b' : '#ef4444' }}
          >
            1:{trade.risk_reward ?? '—'}
          </span>
        </span>
        <span>Opened: {new Date(trade.open_time).toLocaleString()}</span>
        {trade.close_time && (
          <span style={{ color: resultColor }}>
            Closed: {new Date(trade.close_time).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function TradeHistory() {
  const [history, setHistory]   = useState([])
  const [total, setTotal]       = useState(0)
  const [stats, setStats]       = useState(null)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState('ALL')
  const [loading, setLoading]   = useState(false)
  const [dbError, setDbError]   = useState(null)
  const searchTimer             = useRef(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Load history from Supabase ─────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoading(true)
    const { data, count, error } = await fetchHistory({ page, pageSize: PAGE_SIZE, search, filter })
    if (error) { setDbError(error.message); setLoading(false); return }
    setHistory(data)
    setTotal(count)
    setDbError(null)
    setLoading(false)
  }, [page, search, filter])

  const loadStats = useCallback(async () => {
    const s = await fetchStats()
    if (s) setStats(s)
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => { loadStats()   }, []) // load once, refresh on realtime

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const sub = subscribeToHistory(() => {
      loadHistory()
      loadStats()
    })
    return () => { supabaseUnsub(sub) }
  }, [loadHistory, loadStats])

  // ── Debounce search input ──────────────────────────────────────────────────
  function handleSearchChange(val) {
    setSearch(val)
    setPage(1)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadHistory(), 400)
  }

  function handleFilterChange(f) {
    setFilter(f)
    setPage(1)
  }

  const netColor = !stats ? '#94a3b8' : stats.netPnl >= 0 ? '#22c55e' : '#ef4444'

  return (
    <div className="card-dark mt-5 space-y-5">

      {/* ── Stats Dashboard ──────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
          <BarChart2 size={14} className="text-amber-400" />
          Strategy Performance
        </h3>

        {stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            <StatCard icon={BarChart2}     label="Total Trades"  value={stats.total}                         color="#94a3b8" />
            <StatCard icon={CheckCircle2}  label="Wins"          value={stats.wins}                          color="#22c55e" />
            <StatCard icon={XCircle}       label="Losses"        value={stats.losses}                        color="#ef4444" />
            <StatCard icon={TrendingUp}    label="Win Rate"      value={`${stats.winRate}%`}                 color={stats.winRate >= 50 ? '#22c55e' : '#ef4444'}
              sub={`${stats.wins} / ${stats.total} × 100`} />
            <StatCard icon={DollarSign}    label="Net P&L (pts)" value={`${stats.netPnl >= 0 ? '+' : ''}${stats.netPnl}`} color={netColor} />
            <StatCard icon={Trophy}        label="Win Streak"    value={stats.winStreak}                     color="#22c55e" sub="best" />
            <StatCard icon={AlertTriangle} label="Loss Streak"   value={stats.lossStreak}                    color="#ef4444" sub="worst" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }} />
            ))}
          </div>
        )}
      </div>

      {/* ── Trade History Table ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <TrendingDown size={14} className="text-amber-400" />
            Trade History
            <span className="text-xs text-slate-500 font-normal">({total} closed)</span>
          </h3>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by type, source, timeframe…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs text-slate-300 focus:outline-none"
              style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => handleFilterChange(f)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: filter === f
                    ? f === 'WIN' ? 'rgba(34,197,94,0.18)' : f === 'LOSS' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)'
                    : 'rgba(15,23,42,0.8)',
                  border: `1px solid ${filter === f ? (f === 'WIN' ? 'rgba(34,197,94,0.35)' : f === 'LOSS' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)') : '#1a2444'}`,
                  color: filter === f ? (f === 'WIN' ? '#22c55e' : f === 'LOSS' ? '#ef4444' : '#f59e0b') : '#64748b',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Error state */}
        {dbError && (
          <div className="p-3 rounded-lg mb-3 text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            Database error: {dbError}. Make sure the <code>trade_history</code> table is created in Supabase.
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && history.length === 0 && !dbError && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <BarChart2 size={28} className="text-slate-700 mb-3" />
            <p className="text-sm text-slate-600">No closed trades yet.</p>
            <p className="text-xs text-slate-700 mt-1">
              Trades are saved automatically when TP or SL is hit.
            </p>
          </div>
        )}

        {/* Trade rows */}
        {!loading && history.length > 0 && (
          <div className="space-y-2">
            {history.map((t) => <HistoryRow key={t.id} trade={t} />)}
          </div>
        )}

        {/* Pagination — always shown */}
        <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
          <span>
            {total === 0 ? 'No trades' : `Showing ${Math.min((page - 1) * PAGE_SIZE + 1, total)}–${Math.min(page * PAGE_SIZE, total)} of ${total} trades`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg disabled:opacity-30 transition-colors hover:text-slate-300"
              style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}
            >
              <ChevronLeft size={12} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4))
              const p = start + i
              return p <= totalPages ? (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className="w-6 h-6 rounded-md text-xs font-mono transition-colors"
                  style={{
                    background: p === page ? 'rgba(245,158,11,0.18)' : '#0a0e1a',
                    border: `1px solid ${p === page ? 'rgba(245,158,11,0.35)' : '#1a2444'}`,
                    color: p === page ? '#f59e0b' : '#64748b',
                  }}
                >
                  {p}
                </button>
              ) : null
            })}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg disabled:opacity-30 transition-colors hover:text-slate-300"
              style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper: unsubscribe from Supabase channel
function supabaseUnsub(sub) {
  try { sub?.unsubscribe?.() } catch { /* ignore */ }
}
