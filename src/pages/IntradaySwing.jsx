import { useMemo, useState, useEffect, useRef } from 'react';
import {
  Activity, AlertTriangle, TrendingUp, TrendingDown,
  Target, Zap, Shield, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid, ReferenceArea,
} from 'recharts';
import { buildSMCAnalysis } from '../utils/smcEngine';
import { buildMacroAnalysis } from '../utils/macroEngine';
import { buildQuantAnalysis } from '../utils/quantEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sessionColor(session) {
  const map = {
    Asian: '#06b6d4', London: '#f59e0b',
    'NY AM': '#22c55e', 'NY PM': '#3b82f6', 'After Hours': '#64748b',
  };
  return map[session] ?? '#64748b';
}

function ZoneTag({ label, color }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs font-semibold"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}

function ConfBar({ value, color = '#f59e0b' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full overflow-hidden h-1.5" style={{ background: '#1a2444' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, value)}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono font-bold w-10 text-right" style={{ color }}>{value}%</span>
    </div>
  );
}

function InfoCell({ label, value, color = '#f1f5f9' }) {
  return (
    <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className="font-mono font-semibold text-xs truncate" style={{ color }}>{value ?? '—'}</div>
    </div>
  );
}

// ─── Swing Prediction Chart ───────────────────────────────────────────────────
function SwingChart({ priceHistory, livePrice, displaySetup, isBuy, setupColor }) {
  // Build chart data — x is a plain numeric index so ReferenceLine x works correctly
  const { data, nowIdx, tickLabels } = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) return { data: [], nowIdx: -1, tickLabels: {} }

    // History: last 40 ticks → up to 30 points
    const src  = priceHistory.slice(-40)
    const step = Math.max(1, Math.floor(src.length / 30))
    const hist = []
    for (let i = 0; i < src.length; i += step) {
      const ts = new Date(src[i].timestamp)
      hist.push({
        x:     hist.length,
        price: +src[i].price.toFixed(2),
        _label: ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
    }

    if (!displaySetup) return { data: hist, nowIdx: hist.length - 1, tickLabels: buildTickLabels(hist, []) }

    // Projection: 24 × 5-min = 2 hours
    const entry = displaySetup.entry
    const sl    = displaySetup.stopLoss
    const tp1   = displaySetup.takeProfit1
    const tp2   = displaySetup.takeProfit2
    const dir   = displaySetup.direction === 'BUY' ? 1 : -1
    const risk  = Math.abs(entry - sl)
    const STEPS = 24
    const base  = hist[hist.length - 1]?.price ?? livePrice
    const nIdx  = hist.length - 1

    const proj = []
    for (let i = 1; i <= STEPS; i++) {
      const frac    = i / STEPS
      const minMark = i * 5
      let target
      if (frac <= 0.25) {
        const pull = Math.sin((frac / 0.25) * Math.PI) * risk * 0.25 * -dir
        target = base + pull
      } else if (frac <= 0.65) {
        const t = (frac - 0.25) / 0.4
        target  = base + (tp1 - base) * (t * t)
      } else {
        const t       = (frac - 0.65) / 0.35
        const ease    = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        const pullbk  = Math.sin(t * Math.PI) * risk * 0.15 * -dir
        target = tp1 + (tp2 - tp1) * ease + pullbk
      }
      proj.push({ x: nIdx + i, proj: +target.toFixed(2), _minMark: minMark })
    }

    const all = [...hist, ...proj]
    return { data: all, nowIdx: nIdx, tickLabels: buildTickLabels(hist, proj) }
  }, [priceHistory, displaySetup, livePrice])

  // Build a lookup: x → display label (show time labels every ~8 history ticks, projection every 30m)
  function buildTickLabels(hist, proj) {
    const out = {}
    hist.forEach((d, i) => { if (i === 0 || i === hist.length - 1 || i % 8 === 0) out[d.x] = d._label })
    proj.forEach(d => { if (d._minMark % 30 === 0) out[d.x] = `+${d._minMark}m` })
    return out
  }

  if (data.length === 0) return null

  // Y-domain with generous padding so labels don't collide with lines
  const vals = data.flatMap(d => [d.price, d.proj].filter(Number.isFinite))
  if (displaySetup) vals.push(displaySetup.stopLoss, displaySetup.entry, displaySetup.takeProfit1, displaySetup.takeProfit2)
  const range = Math.max(...vals) - Math.min(...vals)
  const pad   = Math.max(2, range * 0.15)
  const yMin  = +(Math.min(...vals) - pad).toFixed(2)
  const yMax  = +(Math.max(...vals) + pad).toFixed(2)

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="px-2.5 py-2 rounded-lg text-xs" style={{ background: '#0f172a', border: '1px solid #334155', minWidth: 110 }}>
        <div className="text-slate-500 mb-1 font-mono">{tickLabels[d.x] ?? ''}</div>
        {d.price != null && <div className="text-amber-400 font-mono font-bold">Price: {d.price.toFixed(2)}</div>}
        {d.proj  != null && <div className="font-mono font-bold" style={{ color: setupColor }}>Proj: {d.proj.toFixed(2)}</div>}
      </div>
    )
  }

  // Level rows shown as a clean table below the chart (avoids label clutter on the chart itself)
  const levels = displaySetup ? [
    { label: 'TP2',   val: displaySetup.takeProfit2, color: setupColor },
    { label: 'TP1',   val: displaySetup.takeProfit1, color: '#86efac' },
    { label: 'Entry', val: displaySetup.entry,        color: '#94a3b8' },
    { label: 'SL',    val: displaySetup.stopLoss,     color: '#f87171' },
  ] : []

  return (
    <div className="card-dark mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-cyan-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">2-Hour ICT Prediction</span>
        </div>
        {displaySetup ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${setupColor}18`, color: setupColor, border: `1px solid ${setupColor}40` }}>
              {displaySetup.direction}
            </span>
            <span className="text-xs text-slate-500">Target <span className="font-mono font-bold" style={{ color: setupColor }}>{displaySetup.takeProfit2}</span></span>
          </div>
        ) : (
          <span className="text-xs text-slate-600">Live price — no active setup</span>
        )}
      </div>

      {/* Level badges row — clean labels ABOVE the chart, not overlapping it */}
      {displaySetup && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {levels.map(({ label, val, color }) => (
            <div key={label} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
              style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
              <span className="font-semibold" style={{ color }}>{label}</span>
              <span className="font-mono text-slate-300">{val}</span>
            </div>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="sg_hist" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#f59e0b" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="sg_proj" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={setupColor} stopOpacity={0.2} />
              <stop offset="100%" stopColor={setupColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Subtle grid */}
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fill: '#475569', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => tickLabels[v] ?? ''}
            ticks={Object.keys(tickLabels).map(Number)}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: '#475569', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={58}
            tickFormatter={v => v.toFixed(1)}
          />
          <Tooltip content={<Tip />} />

          {/* Subtle zone fills between levels */}
          {displaySetup && (() => {
            const sl  = displaySetup.stopLoss
            const ent = displaySetup.entry
            const tp1 = displaySetup.takeProfit1
            const tp2 = displaySetup.takeProfit2
            const [riskLo, riskHi] = isBuy ? [sl, ent] : [ent, sl]
            const [rewLo,  rewHi]  = isBuy ? [ent, tp2] : [tp2, ent]
            return (
              <>
                <ReferenceArea y1={riskLo} y2={riskHi} fill="rgba(239,68,68,0.05)" stroke="none" />
                <ReferenceArea y1={rewLo}  y2={rewHi}  fill={`${setupColor}08`}    stroke="none" />
              </>
            )
          })()}

          {/* Key price level lines — no labels on the line, labels are the badges above */}
          {displaySetup && <>
            <ReferenceLine y={displaySetup.stopLoss}
              stroke="#f87171" strokeWidth={1.5} strokeDasharray="5 4" />
            <ReferenceLine y={displaySetup.entry}
              stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />
            <ReferenceLine y={displaySetup.takeProfit1}
              stroke="#86efac" strokeWidth={1.5} strokeDasharray="5 4" />
            <ReferenceLine y={displaySetup.takeProfit2}
              stroke={setupColor} strokeWidth={2} />
          </>}

          {/* NOW divider */}
          {nowIdx >= 0 && (
            <ReferenceLine x={nowIdx} stroke="#475569" strokeWidth={1.5} strokeDasharray="4 3"
              label={{ value: 'NOW', fill: '#64748b', fontSize: 9, position: 'insideTopRight' }} />
          )}

          {/* History line */}
          <Area type="monotone" dataKey="price"
            stroke="#f59e0b" strokeWidth={2.5} fill="url(#sg_hist)"
            dot={false} connectNulls isAnimationActive={false} />

          {/* Prediction line */}
          {displaySetup && (
            <Area type="monotone" dataKey="proj"
              stroke={setupColor} strokeWidth={2.5} strokeDasharray="8 4"
              fill="url(#sg_proj)" dot={false} connectNulls isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Phase strip */}
      {displaySetup && (
        <div className="grid grid-cols-3 gap-1 mt-3">
          {[
            { time: '0–20m',   label: 'Manipulation', color: '#f59e0b' },
            { time: '20–60m',  label: 'Expansion → TP1', color: setupColor },
            { time: '60–120m', label: 'Continuation → TP2', color: setupColor },
          ].map(({ time, label, color }) => (
            <div key={time} className="text-center py-1.5 rounded-lg text-xs"
              style={{ background: '#0a0e1a', border: '1px solid #1e293b' }}>
              <div className="text-slate-600 text-xs">{time}</div>
              <div className="font-semibold mt-0.5" style={{ color }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function IntradaySwing({ livePrice, priceChange, lastUpdated, priceHistory = [] }) {
  const smc   = useMemo(() => buildSMCAnalysis(priceHistory, livePrice), [priceHistory, livePrice]);
  const macro  = useMemo(() => buildMacroAnalysis(priceHistory, livePrice, smc.setup), [priceHistory, livePrice, smc.setup]);
  const quant  = useMemo(() => buildQuantAnalysis(priceHistory, livePrice, smc.setup, macro.macroScore), [priceHistory, livePrice, smc.setup, macro.macroScore]);

  // ── Locked setup: commit to entry when valid, hold firm until TP2 or SL hit ──
  const [lockedSetup, setLockedSetup] = useState(() => {
    try { return JSON.parse(localStorage.getItem('xau_smc_locked') ?? 'null') } catch { return null }
  });
  const lockedKeyRef = useRef(lockedSetup?.setupKey ?? null);

  useEffect(() => {
    if (!smc.ready) return;
    const newSetup = smc.setup;
    const conf = newSetup ? Math.min(100, newSetup.confidence + macro.confidenceBoost + (quant.quantBoost ?? 0)) : 0;

    // Monitor ACTIVE locked setup for TP1 / TP2 / SL each tick
    if (lockedSetup?.status === 'ACTIVE') {
      const isLockBuy = lockedSetup.direction === 'BUY';
      const tp1Hit = isLockBuy ? livePrice >= lockedSetup.takeProfit1 : livePrice <= lockedSetup.takeProfit1;
      const tp2Hit = isLockBuy ? livePrice >= lockedSetup.takeProfit2 : livePrice <= lockedSetup.takeProfit2;
      const slHit  = isLockBuy ? livePrice <= lockedSetup.stopLoss    : livePrice >= lockedSetup.stopLoss;
      if (tp2Hit || slHit) {
        const resolved = { ...lockedSetup, status: tp2Hit ? 'TP2_HIT' : 'SL_HIT', closedAt: new Date().toISOString(), closedPrice: livePrice };
        setLockedSetup(resolved);
        try { localStorage.setItem('xau_smc_locked', JSON.stringify(resolved)); } catch {}
        return;
      }
      if (tp1Hit && !lockedSetup.tp1Hit) {
        const updated = { ...lockedSetup, tp1Hit: true };
        setLockedSetup(updated);
        try { localStorage.setItem('xau_smc_locked', JSON.stringify(updated)); } catch {}
      }
      return; // holding — do not override
    }

    // No active lock — commit to new valid setup
    if (newSetup && conf >= 50 && newSetup.setupKey !== lockedKeyRef.current) {
      lockedKeyRef.current = newSetup.setupKey;
      const locked = { ...newSetup, totalConfidence: conf, lockedAt: new Date().toISOString(), lockedPrice: livePrice, status: 'ACTIVE', tp1Hit: false, closedAt: null, closedPrice: null };
      setLockedSetup(locked);
      try { localStorage.setItem('xau_smc_locked', JSON.stringify(locked)); } catch {}
    }
  }, [livePrice, smc.ready, smc.setup, macro.confidenceBoost, quant.quantBoost]); // eslint-disable-line

  const clearLock = () => {
    lockedKeyRef.current = null;
    setLockedSetup(null);
    try { localStorage.removeItem('xau_smc_locked'); } catch {}
  };

  if (!smc.ready) {
    const pct = Math.min(100, Math.round((priceHistory.length / 30) * 100));
    return (
      <div className="p-4 lg:p-6">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <Activity size={32} className="text-amber-400 animate-pulse" />
          <div className="text-slate-300 font-semibold">Analyzing Market Structure…</div>
          <div className="text-slate-500 text-sm">Collecting price history — {priceHistory.length} / 30 ticks</div>
          <div className="w-56 h-2 rounded-full overflow-hidden" style={{ background: '#1a2444' }}>
            <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-slate-600">SMC engine requires 30 ticks to build synthetic candles</div>
        </div>
      </div>
    );
  }

  const { marketStructure: ms, liquidity: liq, orderBlocks: ob, fvgs, premiumDiscount: pd, displacement: disp, setup, alerts } = smc;
  const allAlerts = [...alerts, ...macro.macroAlerts];

  // displaySetup: locked entry stays firm — falls back to latest smc.setup as preview
  const displaySetup = lockedSetup ?? setup;
  const totalConfidence = lockedSetup?.totalConfidence ?? (setup ? Math.min(100, setup.confidence + macro.confidenceBoost + (quant.quantBoost ?? 0)) : 0);
  const isBuy = displaySetup?.direction === 'BUY';
  const setupColor = displaySetup ? (isBuy ? '#22c55e' : '#ef4444') : '#64748b';
  const setupBg = displaySetup ? (isBuy ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)') : 'rgba(15,23,42,0.6)';
  const setupBorder = displaySetup ? (isBuy ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)') : 'rgba(30,36,68,0.8)';

  // Current price zone label
  const priceZone = pd
    ? livePrice >= pd.premiumStart ? 'Premium (Prefer SELL)'
      : livePrice <= pd.discountEnd ? 'Discount (Prefer BUY)'
        : 'Equilibrium'
    : '—';
  const priceZoneColor = pd
    ? livePrice >= pd.premiumStart ? '#ef4444'
      : livePrice <= pd.discountEnd ? '#22c55e'
        : '#94a3b8'
    : '#94a3b8';

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="max-w-6xl mx-auto">

        {/* ── PAGE HEADER ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Zap size={16} className="text-amber-400" />
              SMC Intraday Swing Analyzer
            </h1>
            <p className="text-xs text-slate-500">SMC · ICT · OB/FVG · Quant · Statistical Volatility · Real Yield · Institutional Risk</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {liq && (
              <span
                className="px-2 py-1 rounded-full font-semibold"
                style={{ background: `${sessionColor(liq.activeSession)}18`, color: sessionColor(liq.activeSession), border: `1px solid ${sessionColor(liq.activeSession)}35` }}
              >
                {liq.activeSession}
              </span>
            )}
            <span className="text-slate-600 font-mono">
              {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}
            </span>
          </div>
        </div>

        {/* ── SETUP BANNER ──────────────────────────────────────────────────── */}
        <div className="rounded-xl p-4 mb-4" style={{ background: setupBg, border: `1px solid ${setupBorder}` }}>
          {displaySetup ? (
            <>
              <div className="flex items-start justify-between mb-3 gap-3">
                <div className="flex items-center gap-3">
                  {isBuy
                    ? <TrendingUp size={22} className="text-green-400 flex-shrink-0" />
                    : <TrendingDown size={22} className="text-red-400 flex-shrink-0" />}
                  <div>
                    <div className="font-bold text-base flex items-center gap-2" style={{ color: setupColor }}>
                      {displaySetup.direction} SETUP
                      {lockedSetup?.status === 'ACTIVE' && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>🔒 LOCKED</span>
                      )}
                      {lockedSetup?.status === 'TP2_HIT' && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>✅ TP2 HIT</span>
                      )}
                      {lockedSetup?.status === 'SL_HIT' && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>❌ SL HIT</span>
                      )}
                      {lockedSetup?.tp1Hit && lockedSetup?.status === 'ACTIVE' && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(134,239,172,0.15)', color: '#86efac', border: '1px solid rgba(134,239,172,0.3)' }}>TP1 ✓</span>
                      )}
                      {!lockedSetup && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(100,116,139,0.15)', color: '#94a3b8' }}>Preview</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      Intraday Swing · {displaySetup.session} · {displaySetup.conditionsMet}/{displaySetup.totalConditions} conditions
                      {lockedSetup?.lockedAt && (
                        <span className="text-slate-600"> · Locked {new Date(lockedSetup.lockedAt).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-slate-500 mb-0.5">Confidence</div>
                    <div className="font-bold text-2xl" style={{ color: totalConfidence >= 75 ? '#22c55e' : totalConfidence >= 50 ? '#f59e0b' : '#ef4444' }}>
                      {totalConfidence}%
                    </div>
                    {(macro.confidenceBoost > 0 || (quant.quantBoost ?? 0) > 0) && (
                      <div className="text-xs text-purple-400">+{macro.confidenceBoost}% macro{(quant.quantBoost ?? 0) > 0 ? ` +${quant.quantBoost}% quant` : ''}</div>
                    )}
                  </div>
                  {lockedSetup && (
                    <button onClick={clearLock} className="mt-1 px-2 py-1 rounded text-xs font-semibold" style={{ background: 'rgba(100,116,139,0.12)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.25)' }}>Reset</button>
                  )}
                </div>
              </div>

              {/* Entry / SL / TP row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs mb-3">
                {[
                  { label: 'Entry', value: displaySetup.entry, color: '#f1f5f9' },
                  { label: 'Stop Loss', value: displaySetup.stopLoss, color: lockedSetup?.status === 'SL_HIT' ? '#ef4444' : '#fca5a5' },
                  { label: 'TP 1  (1.5R)', value: displaySetup.takeProfit1, color: lockedSetup?.tp1Hit ? '#22c55e' : '#86efac' },
                  { label: 'TP 2  (3R min)', value: displaySetup.takeProfit2, color: lockedSetup?.status === 'TP2_HIT' ? '#22c55e' : '#86efac' },
                  { label: 'R : R', value: `1 : ${displaySetup.riskReward}`, color: '#f59e0b' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-2 rounded-lg text-center" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #1a2444' }}>
                    <div className="text-slate-500 mb-1">{label}</div>
                    <div className="font-mono font-bold" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>

              <ConfBar value={totalConfidence} color={setupColor} />
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{displaySetup.explanation}</p>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Target size={18} className="text-slate-500 flex-shrink-0" />
              <div>
                <div className="text-slate-300 font-semibold">No Active Setup — Scanning</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Waiting for: liquidity sweep → MSS confirmation → displacement → OB/FVG retracement
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── STAT ROW ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">

          {/* Market Structure */}
          <div className="card-dark">
            <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Market Structure</div>
            <div className={`text-sm font-bold mb-2 ${ms?.bias === 'Bullish' ? 'text-green-400' : ms?.bias === 'Bearish' ? 'text-red-400' : 'text-slate-400'}`}>
              {ms?.structure ?? 'RANGING'}
            </div>
            <div className="flex flex-wrap gap-1 mb-1">
              {ms?.bos && <ZoneTag label={`BOS ${ms.bosDirection}`} color="#f59e0b" />}
              {ms?.mss && <ZoneTag label={`MSS ${ms.mssDirection}`} color={ms.mssDirection === 'BUY' ? '#22c55e' : '#ef4444'} />}
            </div>
            <div className="text-xs text-slate-600">
              Bias: <span className={ms?.bias === 'Bullish' ? 'text-green-400' : ms?.bias === 'Bearish' ? 'text-red-400' : 'text-slate-400'}>{ms?.bias ?? 'Neutral'}</span>
            </div>
            {ms && (
              <div className="text-xs text-slate-600 mt-1">
                {ms.hasHH ? 'HH ' : ms.hasLH ? 'LH ' : ''}{ms.hasHL ? 'HL' : ms.hasLL ? 'LL' : ''}
              </div>
            )}
          </div>

          {/* Liquidity */}
          <div className="card-dark">
            <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Liquidity</div>
            <div className={`text-sm font-bold mb-2 ${liq?.sweepDetected ? (liq.sweepDirection === 'BUY' ? 'text-green-400' : 'text-red-400') : 'text-slate-400'}`}>
              {liq?.sweepDetected ? `${liq.sweepDirection} Swept` : 'Watching'}
            </div>
            <div className="flex flex-wrap gap-1 mb-1">
              {liq?.equalHighsDetected && <ZoneTag label="EQH" color="#f59e0b" />}
              {liq?.equalLowsDetected && <ZoneTag label="EQL" color="#f59e0b" />}
            </div>
            <div className="text-xs text-slate-600">
              {liq ? `BSL ${liq.buySideLiq} · SSL ${liq.sellSideLiq}` : '—'}
            </div>
          </div>

          {/* Displacement */}
          <div className="card-dark">
            <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Displacement</div>
            <div className={`text-sm font-bold mb-2 ${disp?.detected ? (disp.direction === 'BUY' ? 'text-green-400' : 'text-red-400') : 'text-slate-400'}`}>
              {disp?.detected ? `${disp.direction}  ${disp.body}pt` : 'None'}
            </div>
            <div className="flex flex-wrap gap-1 mb-1">
              {disp?.fvgCreated && <ZoneTag label="FVG Created" color="#06b6d4" />}
            </div>
            <div className="text-xs text-slate-600">Body ratio: {disp ? `${(disp.bodyRatio * 100).toFixed(0)}%` : '—'}</div>
          </div>

          {/* Session */}
          <div className="card-dark">
            <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Session</div>
            <div className="text-sm font-bold mb-2" style={{ color: liq ? sessionColor(liq.activeSession) : '#64748b' }}>
              {liq?.activeSession ?? '—'}
            </div>
            <div className={`text-xs font-semibold mb-1 ${liq?.isHighVolatilitySession ? 'text-green-400' : 'text-slate-500'}`}>
              {liq?.isHighVolatilitySession ? '● High Volatility' : '○ Low Volatility'}
            </div>
            <div className="text-xs text-slate-600">London + NY AM: best setups</div>
          </div>
        </div>

        {/* ── SWING PREDICTION CHART ────────────────────────────────────────── */}
        <SwingChart
          priceHistory={priceHistory}
          livePrice={livePrice}
          displaySetup={displaySetup}
          isBuy={isBuy}
          setupColor={setupColor}
        />

        {/* ── MACRO & INSTITUTIONAL BIAS ────────────────────────────────────── */}
        <div className="card-dark mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={13} className="text-purple-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Macro &amp; Institutional Bias</span>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${macro.macroScore.color}18`, color: macro.macroScore.color, border: `1px solid ${macro.macroScore.color}30` }}>
              {macro.macroScore.bias}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
            {[
              { label: 'Macro Bias',     value: macro.macroScore.bias,              sub: `${macro.macroScore.pct}% Bull`,                color: macro.macroScore.color },
              { label: 'DXY Status',     value: macro.dxy.bias,                     sub: macro.dxy.implication.split(' ').slice(0,4).join(' '), color: macro.dxy.bullish === true ? '#22c55e' : macro.dxy.bullish === false ? '#ef4444' : '#94a3b8' },
              { label: 'Bond Yields',    value: macro.bonds.status,                 sub: macro.bonds.bias,                               color: macro.bonds.bullish === true ? '#22c55e' : macro.bonds.bullish === false ? '#ef4444' : '#94a3b8' },
              { label: 'Risk Sentiment', value: macro.risk.sentiment.split('/')[0].trim(), sub: macro.risk.regime,                       color: macro.risk.safeHavenDemand ? '#22c55e' : macro.risk.bullish === false ? '#ef4444' : '#94a3b8' },
              { label: 'Inst. Flow',     value: macro.instFlow.flow,                sub: macro.instFlow.flow === 'Accumulating' ? 'Expansion imminent' : macro.instFlow.flow === 'Distributing' ? 'Reversal risk' : 'Neutral', color: macro.instFlow.flow === 'Accumulating' ? '#22c55e' : macro.instFlow.flow === 'Distributing' ? '#ef4444' : '#94a3b8' },
              { label: 'Session Model',  value: macro.sessionModel.session,         sub: macro.sessionModel.model,                       color: macro.sessionModel.color },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                <div className="text-slate-500 text-xs mb-1">{label}</div>
                <div className="font-semibold text-xs truncate" style={{ color }}>{value}</div>
                <div className="text-slate-600 text-xs truncate mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
          <ConfBar value={macro.macroScore.pct} color={macro.macroScore.color} />
        </div>

        {/* ── ICT QUARTERLY THEORY + INSTITUTIONAL FLOW ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Quarterly Theory */}
          <div className="card-dark">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={13} className="text-purple-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">ICT Quarterly Theory</span>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Yearly',   data: macro.quarterly.year },
                { label: 'Monthly',  data: macro.quarterly.monthly },
                { label: 'Weekly',   data: macro.quarterly.weekly },
              ].map(({ label, data }) => {
                const phaseColors = { Q1: '#3b82f6', Q2: '#f59e0b', Q3: '#22c55e', Q4: '#ef4444' };
                const c = phaseColors[data.phase] ?? '#64748b';
                return (
                  <div key={label} className="p-2 rounded-lg" style={{ background: `${c}08`, border: `1px solid ${c}22` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500">{label}</span>
                      <ZoneTag label={`${data.phase}: ${data.name}`} color={c} />
                    </div>
                    <div className="text-xs text-slate-500 leading-relaxed">{data.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Institutional Flow */}
          <div className="card-dark">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={13} className="text-cyan-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Institutional Flow Analysis</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">Current Flow</span>
              <ZoneTag label={macro.instFlow.flow} color={macro.instFlow.flow === 'Accumulating' ? '#22c55e' : macro.instFlow.flow === 'Distributing' ? '#ef4444' : macro.instFlow.flow === 'Expanding' ? '#f59e0b' : '#64748b'} />
            </div>
            <div className="text-xs text-slate-400 mb-3 leading-relaxed">{macro.instFlow.phase}</div>
            <div className="space-y-1.5">
              {[
                { label: 'Accumulation Detected',          passed: macro.instFlow.accumulationDetected, positive: true  },
                { label: 'Distribution Detected',          passed: macro.instFlow.distributionDetected,  positive: false },
                { label: 'Expansion Phase Active',         passed: macro.instFlow.expansionDetected,     positive: true  },
                { label: 'Engineered Liquidity (Inducement)', passed: macro.instFlow.inducementDetected, positive: null  },
                { label: 'Engineered Highs (Trap)',        passed: macro.instFlow.engineeredHighs,       positive: null  },
                { label: 'Engineered Lows (Trap)',         passed: macro.instFlow.engineeredLows,        positive: null  },
              ].map(({ label, passed, positive }) => (
                <div key={label} className="flex items-center gap-2 text-xs px-2 py-1 rounded" style={{ background: passed ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  {passed
                    ? <CheckCircle2 size={11} className={positive === true ? 'text-green-400' : positive === false ? 'text-red-400' : 'text-amber-400'} />
                    : <XCircle size={11} className="text-slate-700" />}
                  <span className={passed ? 'text-slate-300' : 'text-slate-600'}>{label}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
              <div className="text-xs text-slate-500 mb-1">{macro.sessionModel.session} — {macro.sessionModel.model}</div>
              <div className="text-xs text-slate-500 leading-relaxed">{macro.sessionModel.expectation}</div>
            </div>
          </div>
        </div>

        {/* ── AI MARKET NARRATIVE ─────────────────────────────────────────────── */}
        <div className="card-dark mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={13} className="text-amber-400" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">AI Market Narrative</span>
            {totalConfidence > 0 && (
              <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded" style={{
                background: totalConfidence >= 75 ? 'rgba(34,197,94,0.12)' : totalConfidence >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                color: totalConfidence >= 75 ? '#22c55e' : totalConfidence >= 50 ? '#f59e0b' : '#ef4444',
              }}>
                    Combined Confidence: {totalConfidence}%{macro.confidenceBoost > 0 ? ` (+${macro.confidenceBoost}% macro)` : ''}{(quant.quantBoost ?? 0) > 0 ? ` (+${quant.quantBoost}% quant)` : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{macro.narrative}</p>
        </div>

        {/* ── MAIN PANELS ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* LEFT: Order Blocks + Premium/Discount */}
          <div className="space-y-4">

            {/* Order Blocks */}
            <div className="card-dark">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={13} className="text-amber-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Order Blocks</span>
              </div>

              {/* Bullish OB */}
              <div
                className="p-3 rounded-lg mb-2"
                style={{
                  background: ob?.bullishOB ? 'rgba(34,197,94,0.06)' : '#0a0e1a',
                  border: `1px solid ${ob?.bullishOB ? 'rgba(34,197,94,0.22)' : '#1a2444'}`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-green-400">Bullish OB (Demand Zone)</span>
                  {ob?.bullishOB
                    ? <ZoneTag label="Active" color="#22c55e" />
                    : <span className="text-xs text-slate-600">Not detected</span>}
                </div>
                {ob?.bullishOB ? (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><div className="text-slate-500 mb-0.5">High</div><div className="font-mono text-green-300">{ob.bullishOB.high}</div></div>
                    <div><div className="text-slate-500 mb-0.5">Low</div><div className="font-mono text-green-300">{ob.bullishOB.low}</div></div>
                    <div><div className="text-slate-500 mb-0.5">Midpoint</div><div className="font-mono text-green-300">{ob.bullishOB.midpoint}</div></div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-600">Waiting for bearish candle before bullish displacement</div>
                )}
              </div>

              {/* Bearish OB */}
              <div
                className="p-3 rounded-lg"
                style={{
                  background: ob?.bearishOB ? 'rgba(239,68,68,0.06)' : '#0a0e1a',
                  border: `1px solid ${ob?.bearishOB ? 'rgba(239,68,68,0.22)' : '#1a2444'}`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-red-400">Bearish OB (Supply Zone)</span>
                  {ob?.bearishOB
                    ? <ZoneTag label="Active" color="#ef4444" />
                    : <span className="text-xs text-slate-600">Not detected</span>}
                </div>
                {ob?.bearishOB ? (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><div className="text-slate-500 mb-0.5">High</div><div className="font-mono text-red-300">{ob.bearishOB.high}</div></div>
                    <div><div className="text-slate-500 mb-0.5">Low</div><div className="font-mono text-red-300">{ob.bearishOB.low}</div></div>
                    <div><div className="text-slate-500 mb-0.5">Midpoint</div><div className="font-mono text-red-300">{ob.bearishOB.midpoint}</div></div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-600">Waiting for bullish candle before bearish displacement</div>
                )}
              </div>
            </div>

            {/* Premium / Discount */}
            <div className="card-dark">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                  Session Premium · EQ · Discount
                </div>
                {pd && (
                  <span className="text-xs text-slate-500 font-mono">Range: {pd.range} pts</span>
                )}
              </div>

              {pd ? (
                <>
                  {/* Visual zone bar */}
                  <div
                    className="relative rounded-lg overflow-hidden mb-3"
                    style={{ height: 96, background: '#0a0e1a', border: '1px solid #1a2444' }}
                  >
                    {/* Premium (top 38.2%) */}
                    <div
                      className="absolute inset-x-0 top-0 flex items-center justify-center"
                      style={{ height: '38%', background: 'rgba(239,68,68,0.09)', borderBottom: '1px dashed rgba(239,68,68,0.3)' }}
                    >
                      <span className="text-xs font-semibold text-red-400 opacity-80">PREMIUM ≥ {pd.premiumStart} — SELL</span>
                    </div>
                    {/* Equilibrium (middle 23.6%) */}
                    <div
                      className="absolute inset-x-0 flex items-center justify-center"
                      style={{ top: '38%', height: '24%', background: 'rgba(100,116,139,0.07)', borderBottom: '1px dashed rgba(100,116,139,0.25)' }}
                    >
                      <span className="text-xs text-slate-500">EQ  {pd.equilibrium}</span>
                    </div>
                    {/* Discount (bottom 38.2%) */}
                    <div
                      className="absolute inset-x-0 bottom-0 flex items-center justify-center"
                      style={{ height: '38%', background: 'rgba(34,197,94,0.09)' }}
                    >
                      <span className="text-xs font-semibold text-green-400 opacity-80">DISCOUNT ≤ {pd.discountEnd} — BUY</span>
                    </div>
                    {/* Current price line */}
                    {(() => {
                      const pct = pd.range > 0 ? ((livePrice - pd.swingLow) / pd.range) * 100 : 50;
                      const topPct = Math.max(2, Math.min(96, 100 - pct));
                      return (
                        <div
                          className="absolute inset-x-0 flex items-center gap-1 px-2"
                          style={{ top: `${topPct}%`, transform: 'translateY(-50%)' }}
                        >
                          <div className="flex-1 h-px bg-amber-400" style={{ opacity: 0.85 }} />
                          <span className="text-xs font-mono text-amber-400 whitespace-nowrap px-1" style={{ background: '#0a0e1a' }}>
                            {livePrice?.toFixed(2)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs text-center mb-2">
                    <div><div className="text-slate-500">Session High</div><div className="font-mono text-red-300 font-bold">{pd.swingHigh}</div></div>
                    <div><div className="text-slate-500">Equilibrium</div><div className="font-mono text-slate-300 font-bold">{pd.equilibrium}</div></div>
                    <div><div className="text-slate-500">Session Low</div><div className="font-mono text-green-300 font-bold">{pd.swingLow}</div></div>
                  </div>

                  <div className="text-xs text-center">
                    <span className="text-slate-500">Current zone: </span>
                    <span className="font-semibold" style={{ color: priceZoneColor }}>{priceZone}</span>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-600">Insufficient data to compute zones</div>
              )}
            </div>
          </div>

          {/* RIGHT: FVG + Conditions */}
          <div className="space-y-4">

            {/* Fair Value Gaps */}
            <div className="card-dark">
              <div className="flex items-center gap-2 mb-3">
                <Activity size={13} className="text-cyan-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Fair Value Gaps (FVG / Imbalances)</span>
              </div>

              <div className="mb-3">
                <div className="text-xs font-semibold text-green-400 mb-2">Bullish FVGs (Demand Imbalances)</div>
                {fvgs?.bullishFVGs.length ? (
                  fvgs.bullishFVGs.map((fvg, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded mb-1.5 text-xs"
                      style={{
                        background: fvg.mitigated ? '#0a0e1a' : 'rgba(34,197,94,0.05)',
                        border: `1px solid ${fvg.mitigated ? '#1a2444' : 'rgba(34,197,94,0.2)'}`,
                      }}
                    >
                      <span className="font-mono text-green-300">{fvg.low} – {fvg.high}</span>
                      <span className="text-slate-500">+{fvg.size}pt</span>
                      <span className={fvg.mitigated ? 'text-slate-600' : 'text-green-400 font-semibold'}>
                        {fvg.mitigated ? 'Filled' : 'Open'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-600">No bullish FVGs detected</div>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-red-400 mb-2">Bearish FVGs (Supply Imbalances)</div>
                {fvgs?.bearishFVGs.length ? (
                  fvgs.bearishFVGs.map((fvg, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded mb-1.5 text-xs"
                      style={{
                        background: fvg.mitigated ? '#0a0e1a' : 'rgba(239,68,68,0.05)',
                        border: `1px solid ${fvg.mitigated ? '#1a2444' : 'rgba(239,68,68,0.2)'}`,
                      }}
                    >
                      <span className="font-mono text-red-300">{fvg.low} – {fvg.high}</span>
                      <span className="text-slate-500">{fvg.size}pt</span>
                      <span className={fvg.mitigated ? 'text-slate-600' : 'text-red-400 font-semibold'}>
                        {fvg.mitigated ? 'Filled' : 'Open'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-600">No bearish FVGs detected</div>
                )}
              </div>
            </div>

            {/* Conditions Checklist */}
            <div className="card-dark">
              <div className="flex items-center gap-2 mb-3">
                {setup
                  ? <CheckCircle2 size={13} className={isBuy ? 'text-green-400' : 'text-red-400'} />
                  : <Clock size={13} className="text-slate-500" />}
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                  {displaySetup ? `${displaySetup.direction} Conditions (${displaySetup.conditionsMet}/${displaySetup.totalConditions})` : 'Setup Conditions'}
                </span>
              </div>

              {displaySetup ? (
                <>
                  <ConfBar value={totalConfidence} color={setupColor} />
                  <div className="space-y-1 mt-3">
                    {Object.entries(displaySetup.conditions).map(([label, passed]) => (
                      <div
                        key={label}
                        className="flex items-center gap-2 text-xs px-2 py-1.5 rounded"
                        style={{ background: passed ? (isBuy ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)') : 'transparent' }}
                      >
                        {passed
                          ? <CheckCircle2 size={11} className={isBuy ? 'text-green-400' : 'text-red-400'} />
                          : <XCircle size={11} className="text-slate-600" />}
                        <span className={passed ? 'text-slate-200' : 'text-slate-600'}>{label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  {[
                    'Liquidity sweep (buy or sell side)',
                    'Market Structure Shift (MSS)',
                    'Strong displacement candle',
                    'Order Block or FVG formation',
                    'Price retracement into OB/FVG',
                    'Active trading session (London/NY)',
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600 px-2 py-1">
                      <XCircle size={11} className="text-slate-700" />
                      {step}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── QUANTITATIVE DASHBOARD ─────────────────────────────────────── */}
        {quant.ready && (
          <div className="card-dark mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={13} className="text-cyan-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Quantitative Dashboard</span>
              {quant.probScore && (
                <span
                  className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: `${quant.probScore.gradeColor}18`, color: quant.probScore.gradeColor, border: `1px solid ${quant.probScore.gradeColor}40` }}
                >
                  {quant.probScore.grade} · {quant.probScore.score}/100
                </span>
              )}
            </div>

            {/* Top stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
              {[
                { label: 'STDV (20)', value: String(quant.stdvData.stdv20), color: quant.stdvData.expanding ? '#22c55e' : quant.stdvData.compressing ? '#f59e0b' : '#94a3b8' },
                { label: 'STDV Ratio', value: `${quant.stdvData.expandingRatio}×`, color: quant.stdvData.expanding ? '#22c55e' : quant.stdvData.compressing ? '#f59e0b' : '#94a3b8' },
                { label: 'ATR', value: String(quant.atr), color: '#06b6d4' },
                { label: 'Z-Score', value: String(quant.zscore.z), color: quant.zscore.overbought ? '#ef4444' : quant.zscore.oversold ? '#22c55e' : '#94a3b8' },
                { label: 'Vol. Regime', value: quant.volRegime.regime, color: quant.volRegime.color },
                { label: 'Momentum', value: `${quant.momentum.strength}%`, color: quant.momentum.strength >= 60 ? '#22c55e' : quant.momentum.strength >= 30 ? '#f59e0b' : '#64748b' },
                { label: 'ROC (10)', value: `${quant.momentum.roc}%`, color: quant.momentum.roc > 0 ? '#22c55e' : quant.momentum.roc < 0 ? '#ef4444' : '#94a3b8' },
              ].map(({ label, value, color }) => <InfoCell key={label} label={label} value={value} color={color} />)}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
              {[
                { label: 'Real Yield', value: `${quant.realYield.realYield}%`, color: quant.realYield.color },
                { label: 'Nominal Yield', value: `${quant.realYield.nominalYieldProxy}%`, color: '#94a3b8' },
                { label: 'Inflation Proxy', value: `${quant.realYield.inflationProxy}%`, color: '#f59e0b' },
                { label: 'Yield Trend', value: quant.realYield.trend, color: quant.realYield.bullishGold ? '#22c55e' : '#ef4444' },
                { label: 'Z-Score State', value: quant.zscore.label, color: quant.zscore.overbought ? '#ef4444' : quant.zscore.oversold ? '#22c55e' : '#94a3b8' },
                { label: 'Mean Rev. Prob', value: `${quant.zscore.meanReversion}%`, color: quant.zscore.meanReversion >= 78 ? '#ef4444' : quant.zscore.meanReversion >= 50 ? '#f59e0b' : '#94a3b8' },
                { label: 'Impulse Candle', value: quant.momentum.impulse ? 'Detected ✓' : 'None', color: quant.momentum.impulse ? '#22c55e' : '#64748b' },
              ].map(({ label, value, color }) => <InfoCell key={label} label={label} value={value} color={color} />)}
            </div>

            {/* Volatility regime bar */}
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-lg mb-3 text-xs"
              style={{ background: `${quant.volRegime.color}10`, border: `1px solid ${quant.volRegime.color}30` }}
            >
              <span className="font-bold" style={{ color: quant.volRegime.color }}>{quant.volRegime.regime}</span>
              <span className="text-slate-400">{quant.volRegime.desc}</span>
            </div>

            {/* Real yield implication */}
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-lg mb-3 text-xs"
              style={{ background: `${quant.realYield.color}10`, border: `1px solid ${quant.realYield.color}30` }}
            >
              <span className="font-bold whitespace-nowrap" style={{ color: quant.realYield.color }}>Real Yield</span>
              <span className="text-slate-400">{quant.realYield.implication}</span>
            </div>

            {/* Probability score factors */}
            {quant.probScore.factors.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-slate-500 mb-2">Probability Factors</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {quant.probScore.factors.map(({ label, value, points, positive }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between px-2 py-1.5 rounded text-xs"
                      style={{ background: positive ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)', border: `1px solid ${positive ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}
                    >
                      <div>
                        <div className="text-slate-400 font-medium">{label}</div>
                        <div className="text-slate-600 text-xs">{value}</div>
                      </div>
                      <span
                        className="font-mono font-bold ml-2 flex-shrink-0"
                        style={{ color: positive ? '#22c55e' : '#ef4444' }}
                      >{points > 0 ? '+' : ''}{points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quant narrative */}
            <div
              className="p-3 rounded-lg text-xs text-slate-300 leading-relaxed"
              style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #1a2444' }}
            >
              <span className="text-cyan-400 font-semibold">Quant Narrative: </span>
              {quant.narrative}
            </div>
          </div>
        )}

        {/* ── AI TRADE ANALYSIS OUTPUT ──────────────────────────────────────── */}
        {displaySetup && (
          <div className="card-dark mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Target size={13} className="text-amber-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">AI Trade Analysis Output</span>
              <span
                className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: `${setupColor}15`, color: setupColor, border: `1px solid ${setupColor}30` }}
              >
                {displaySetup.direction}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {[
                { label: 'Trade Direction', value: displaySetup.direction, color: setupColor },
                { label: 'Market Bias', value: displaySetup.marketBias, color: displaySetup.marketBias === 'Bullish' ? '#22c55e' : displaySetup.marketBias === 'Bearish' ? '#ef4444' : '#94a3b8' },
                { label: 'Liquidity Taken', value: displaySetup.liquidityTaken, color: '#f59e0b' },
                { label: 'MSS Confirmed', value: displaySetup.mssConfirmed ? 'Yes ✓' : 'Pending', color: displaySetup.mssConfirmed ? '#22c55e' : '#ef4444' },
                { label: 'OB Zone', value: displaySetup.obZone, color: '#3b82f6' },
                { label: 'FVG Zone', value: displaySetup.fvgZone, color: '#06b6d4' },
                { label: 'Entry Price', value: String(displaySetup.entry), color: '#f1f5f9' },
                { label: 'Stop Loss', value: String(displaySetup.stopLoss), color: '#ef4444' },
                { label: 'Take Profit 1', value: String(displaySetup.takeProfit1), color: '#86efac' },
                { label: 'Take Profit 2', value: String(displaySetup.takeProfit2), color: '#22c55e' },
                { label: 'Take Profit 3', value: String(displaySetup.takeProfit3), color: '#4ade80' },
                { label: 'Risk : Reward', value: `1 : ${displaySetup.riskReward}`, color: '#f59e0b' },
                { label: 'Session', value: displaySetup.session, color: sessionColor(displaySetup.session) },
                { label: 'Confidence',      value: `${totalConfidence}%`,          color: totalConfidence >= 75 ? '#22c55e' : totalConfidence >= 50 ? '#f59e0b' : '#ef4444' },
                { label: 'Trade Status',    value: lockedSetup?.status ?? 'Preview', color: lockedSetup?.status === 'TP2_HIT' ? '#22c55e' : lockedSetup?.status === 'SL_HIT' ? '#ef4444' : lockedSetup?.status === 'ACTIVE' ? '#f59e0b' : '#64748b' },
                { label: 'Price Zone',       value: priceZone,                      color: priceZoneColor },
                { label: 'Macro Bias',       value: macro.macroScore.bias,          color: macro.macroScore.color },
                { label: 'Quarterly Phase',  value: `${macro.quarterly.year.phase}: ${macro.quarterly.year.name}`, color: '#a855f7' },
                { label: 'Weekly Phase',     value: `${macro.quarterly.weekly.phase}: ${macro.quarterly.weekly.name}`, color: '#8b5cf6' },
                { label: 'DXY',              value: macro.dxy.bias,                 color: macro.dxy.bullish === true ? '#22c55e' : macro.dxy.bullish === false ? '#ef4444' : '#94a3b8' },
                { label: 'Inst. Flow',       value: macro.instFlow.flow,            color: macro.instFlow.flow === 'Accumulating' ? '#22c55e' : macro.instFlow.flow === 'Distributing' ? '#ef4444' : '#94a3b8' },
                ...(quant.ready ? [
                  { label: 'STDV (20)',    value: String(quant.stdvData.stdv20),  color: quant.stdvData.expanding ? '#22c55e' : quant.stdvData.compressing ? '#f59e0b' : '#94a3b8' },
                  { label: 'Z-Score',     value: String(quant.zscore.z),         color: quant.zscore.overbought ? '#ef4444' : quant.zscore.oversold ? '#22c55e' : '#94a3b8' },
                  { label: 'Vol. Regime', value: quant.volRegime.regime,          color: quant.volRegime.color },
                  { label: 'Real Yield',  value: `${quant.realYield.realYield}%`, color: quant.realYield.color },
                  { label: 'Quant Score', value: `${quant.probScore.score}/100`,  color: quant.probScore.gradeColor },
                  { label: 'Quant Grade', value: quant.probScore.grade,           color: quant.probScore.gradeColor },
                  { label: 'Momentum',    value: `${quant.momentum.strength}%`,   color: quant.momentum.strength >= 60 ? '#22c55e' : '#f59e0b' },
                  { label: 'ATR',         value: String(quant.atr),               color: '#06b6d4' },
                ] : []),
              ].map(({ label, value, color }) => (
                <InfoCell key={label} label={label} value={value} color={color} />
              ))}
            </div>

            {/* Explanation */}
            <div
              className="mt-3 p-3 rounded-lg text-xs text-slate-300 leading-relaxed"
              style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #1a2444' }}
            >
              <span className="text-amber-400 font-semibold">Analysis: </span>
              {displaySetup.explanation}
            </div>

            {/* Quant narrative inline */}
            {quant.ready && (
              <div
                className="mt-2 p-3 rounded-lg text-xs text-slate-300 leading-relaxed"
                style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)' }}
              >
                <span className="text-cyan-400 font-semibold">Quant: </span>
                {quant.narrative}
              </div>
            )}
          </div>
        )}

        {/* ── ALERTS ────────────────────────────────────────────────────────── */}
        <div className="card-dark">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={13} className="text-amber-400" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Live Alerts</span>
            <span className="ml-auto text-xs text-slate-600">{allAlerts.length} event{allAlerts.length !== 1 ? 's' : ''}</span>
          </div>

          {allAlerts.length === 0 ? (
            <div className="text-xs text-slate-600 py-2">No alerts — monitoring for liquidity sweeps, MSS, OB/FVG formations, and macro shifts.</div>
          ) : (
            <div className="space-y-1.5">
              {[...allAlerts].reverse().map((alert, i) => {
                const colors = {
                  SWEEP: '#f59e0b', MSS: '#a855f7', BOS: '#22c55e',
                  FVG: '#06b6d4', BUY_SETUP: '#22c55e', SELL_SETUP: '#ef4444',
                  ACCUM: '#22c55e', DISTRIB: '#ef4444', INDUCEMENT: '#f59e0b',
                  MANIP: '#f59e0b', MONTHLY_Q2: '#f59e0b', SESSION: '#64748b',
                  CONFLUENCE: '#a855f7',
                };
                const c = colors[alert.type] ?? '#64748b';
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
                    style={{ background: `${c}10`, border: `1px solid ${c}25` }}
                  >
                    <span
                      className="font-bold px-1.5 py-0.5 rounded text-xs flex-shrink-0"
                      style={{ background: `${c}20`, color: c }}
                    >
                      {alert.type}
                    </span>
                    <span className="text-slate-300">{alert.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
