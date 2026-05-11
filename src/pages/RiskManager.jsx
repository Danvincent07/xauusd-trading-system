import { useEffect, useMemo, useRef, useState } from 'react';
import { Shield, AlertTriangle, TrendingUp, Calculator, ChevronRight, Info, Clock, Trash2 } from 'lucide-react';
import { calcPositionSize, calcRiskReward } from '../utils/calculations';
import { buildAutoChecks, buildScalpSwingAnalysis } from '../utils/sniperSignal';
import { RadialBarChart, RadialBar, PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { upsertTrade } from '../services/tradeHistory';
import TradeHistory from '../components/TradeHistory';

const RULES = [
  { icon: Shield,      color: '#22c55e', title: 'Max Risk Per Trade',   value: '1–2%',   desc: 'Default 1%. Never exceed 2% of account on a single trade.' },
  { icon: TrendingUp,  color: '#3b82f6', title: 'Min Risk:Reward',      value: '1:3',    desc: 'Minimum 3:1 reward-to-risk. Target 4:1 or better.' },
  { icon: Calculator,  color: '#f59e0b', title: 'Stop Loss Placement',  value: 'Pre-defined', desc: 'Always define stop loss before entry. Place beyond structure.' },
  { icon: AlertTriangle, color: '#a855f7', title: 'Partial Profit Rule', value: 'At 1R',  desc: 'Close 50% of position at 1R. Move stop to breakeven.' },
];

const SCALPING_ENTRY_TIMEFRAMES = ['5m', '15m', '30m', '1h'];
const CONFIRMATION_TIMEFRAMES = ['1h', '4h', '1D', '1W'];
const ENTRY_TIMEFRAME_PROFILES = {
  '5m': { stopMultiplier: 0.45, rewardMultiplier: 1.8, entryBuffer: 0.12 },
  '15m': { stopMultiplier: 0.6, rewardMultiplier: 2.25, entryBuffer: 0.08 },
  '30m': { stopMultiplier: 0.8, rewardMultiplier: 2.7, entryBuffer: 0.05 },
  '1h': { stopMultiplier: 1, rewardMultiplier: 3, entryBuffer: 0.02 },
};

const CONFIRMATION_TIMEFRAME_PROFILES = {
  '1h': { stopFactor: 1.0, targetFactor: 1.0, label: 'fast confirmation' },
  '4h': { stopFactor: 1.15, targetFactor: 1.15, label: 'session confirmation' },
  '1D': { stopFactor: 1.3, targetFactor: 1.35, label: 'daily confirmation' },
  '1W': { stopFactor: 1.45, targetFactor: 1.6, label: 'swing confirmation' },
};

const ENTRY_TRIGGER_CHECKS = {
  '5m': ['retest', 'rsi_conf', 'macd_conf', 'candle_conf'],
  '15m': ['retest', 'rsi_conf', 'macd_conf'],
  '30m': ['retest', 'rsi_conf', 'macd_conf', 'liq_sweep'],
  '1h': ['retest', 'rsi_conf', 'macd_conf', 'bos'],
};

const CONFIRMATION_CHECKS = {
  '1h': ['tf_1h', 'vwap_1h'],
  '4h': ['tf_4h', 'vwap_4h'],
  '1D': ['tf_daily', 'vwap_daily'],
  '1W': ['vwap_weekly', 'bias', 'bos'],
};

const ENTRY_MIN_PROBABILITY = 85;
const FULL_LEVELS_PROBABILITY = 85;

function RiskMeter({ riskPercent }) {
  const color = riskPercent <= 1 ? '#22c55e' : riskPercent <= 2 ? '#f59e0b' : '#ef4444';
  const data = [{ value: riskPercent, fill: color }, { value: Math.max(0, 3 - riskPercent), fill: '#1a2444' }];
  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie data={data} cx={60} cy={60} startAngle={90} endAngle={-270} innerRadius={38} outerRadius={55} dataKey="value" strokeWidth={0}>
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="relative" style={{ marginTop: -70 }}>
        <div className="text-center">
          <div className="text-xl font-bold font-mono" style={{ color }}>{riskPercent.toFixed(1)}%</div>
          <div className="text-xs text-slate-500">Risk</div>
        </div>
      </div>
      <div style={{ marginTop: 35 }} />
    </div>
  );
}

const ICT_STATUS_META = {
  'WAITING FOR SETUP':           { color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)',  icon: '⏳' },
  'SETUP FORMING (STRUCTURE ONLY)': { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)', icon: '🔍' },
  'READY TO ENTER (CONFIRMED)':  { color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)',  icon: '✅' },
  'IN TRADE (ACTIVE MANAGEMENT)':{ color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)', icon: '📊' },
};

function SetupCard({ title, setup, timeframe }) {
  const isActive   = setup.active;
  const isHighProb = setup.highProbability;
  const isBuy = setup.direction === 'BUY' || setup.watchingFor === 'BUY';
  const activeColor  = isBuy ? '#22c55e' : '#ef4444';
  const activeBg     = isBuy ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)';
  const activeBorder = isBuy ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
  const conf = setup.confidence ?? 0;
  const confColor = conf >= 85 ? '#22c55e' : conf >= 60 ? '#f59e0b' : conf >= 40 ? '#fb923c' : '#64748b';
  const ictStatus = setup.ictStatus ?? 'WAITING FOR SETUP';
  const statusMeta = ICT_STATUS_META[ictStatus] ?? ICT_STATUS_META['WAITING FOR SETUP'];

  // Show levels whenever a BUY/SELL setup is active
  const showLevels = isActive;

  return (
    <div
      className="p-3 rounded-xl"
      style={{
        background: showLevels ? activeBg : 'rgba(15,23,42,0.6)',
        border: `1px solid ${showLevels ? activeBorder : '#1e293b'}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-300">{title}</span>
        <div className="flex items-center gap-1.5">
          {timeframe && <span className="text-xs text-slate-500 font-mono">{timeframe}</span>}
          {showLevels ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: isBuy ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)', color: activeColor }}>
              {setup.direction} {isBuy ? '▲' : '▼'}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(100,116,139,0.12)', color: '#64748b' }}>
              Scanning
            </span>
          )}
        </div>
      </div>

      {/* ICT Status badge */}
      <div className="flex items-center gap-1.5 mb-2.5 px-2 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}>
        <span>{statusMeta.icon}</span>
        <span style={{ color: statusMeta.color }}>{ictStatus}</span>
      </div>

      {/* Confidence bar — always visible */}
      <div className="mb-2.5">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-500">Confirmation</span>
          <span className="font-bold font-mono" style={{ color: confColor }}>{conf}%
            {isHighProb && <span className="ml-1 text-xs" style={{ color: '#22c55e' }}>✓ VALID TRADE</span>}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a2444' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${conf}%`, background: confColor }} />
        </div>
        {/* 85% gate line marker */}
        <div className="relative h-3">
          <div className="absolute top-0 w-px h-2 bg-amber-500 opacity-70" style={{ left: '85%' }} />
          <span className="absolute text-amber-500 opacity-70" style={{ left: '85%', fontSize: 8, transform: 'translateX(-50%)' }}>85% gate</span>
        </div>
      </div>

      {showLevels ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2.5 text-center">
            {[
              { label: 'Entry', val: setup.entry, color: '#f1f5f9' },
              { label: 'Stop', val: setup.stopLoss, color: '#f87171' },
              { label: 'Target', val: setup.takeProfit, color: '#4ade80' },
            ].map(({ label, val, color }) => (
              <div key={label} className="p-1.5 rounded-lg" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #1a2444' }}>
                <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                <div className="font-mono text-xs font-bold" style={{ color }}>{val}</div>
              </div>
            ))}
          </div>
          <div className="space-y-0.5">
            {setup.reasons.map((r) => (
              <div key={r} className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="text-green-400">✓</span>{r}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>
          {isActive && !isHighProb ? (
            <div className="px-2 py-1.5 rounded-lg mb-2 text-xs"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <span className="text-amber-400 font-semibold">NO TRADE — WAIT FOR CONFIRMATION</span><br />
              <span className="text-slate-400">Needs ≥85% confirmation ({conf}% now · {setup.missing?.length ?? 0} ICT condition{setup.missing?.length !== 1 ? 's' : ''} unmet)</span>
            </div>
          ) : (
            <div className="px-2 py-1.5 rounded-lg mb-2 text-xs"
              style={{ background: 'rgba(100,116,139,0.06)', border: '1px solid rgba(100,116,139,0.15)' }}>
              <span className="text-slate-500 font-semibold">NO TRADE — WAIT FOR CONFIRMATION</span><br />
              <span className="text-slate-600">{setup.missing?.length ?? 0} ICT condition{setup.missing?.length !== 1 ? 's' : ''} not yet met</span>
            </div>
          )}
          <div className="space-y-0.5">
            {setup.missing?.map((m) => (
              <div key={m} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="text-red-500">✗</span>{m}
              </div>
            ))}
            {setup.reasons?.map((r) => (
              <div key={r} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="text-green-700">✓</span>{r}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RiskManager({ livePrice = 0, priceChange = 0, lastUpdated = null, priceHistory = [] }) {
  const [account, setAccount] = useState('10000');
  const [riskPct, setRiskPct] = useState('1');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [partialAt, setPartialAt] = useState('50');
  const [autoEntryMode, setAutoEntryMode] = useState(true);
  const [entryTimeframe, setEntryTimeframe] = useState('15m');
  const [confirmationTimeframe, setConfirmationTimeframe] = useState('4h');

  // ── Trade Hit Log ────────────────────────────────────────────────────────
  const [tradeLog, setTradeLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('xau_trade_log') ?? '[]'); } catch { return []; }
  });
  const prevScalpKey = useRef(null);
  const prevSwingKey = useRef(null);

  const signal = useMemo(() => buildAutoChecks(livePrice, priceChange, priceHistory), [livePrice, priceChange, priceHistory]);
  const tradeAnalysis = useMemo(() => buildScalpSwingAnalysis(priceHistory, livePrice), [priceHistory, livePrice]);

  // Persist log to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem('xau_trade_log', JSON.stringify(tradeLog)); } catch { /* quota */ }
  }, [tradeLog]);

  // Detect new active setups and add them to the log
  useEffect(() => {
    if (!tradeAnalysis.ready) return;

    function addIfNew(setup, type) {
      if (!setup.active || setup.entry === null) return;
      if (!setup.highProbability && (setup.confidence ?? 0) < 55) return; // only log setups with confidence ≥ 55%
      const key = `${type}-${setup.direction}-${setup.entry}-${setup.stopLoss}-${setup.takeProfit}`;
      const prev = type === 'Scalp' ? prevScalpKey : prevSwingKey;
      if (prev.current === key) return;
      prev.current = key;
      setTradeLog((log) => [
        {
          id: Date.now() + Math.random(),
          type,
          direction: setup.direction,
          entry: setup.entry,
          stopLoss: setup.stopLoss,
          takeProfit: setup.takeProfit,
          reasons: setup.reasons,
          timeframe: type === 'Scalp' ? entryTimeframe : confirmationTimeframe,
          confidence: setup.confidence ?? 0,
          openedAt: new Date().toISOString(),
          status: 'OPEN',          // OPEN | TP_HIT | SL_HIT
          closedAt: null,
          closedPrice: null,
        },
        ...log,
      ].slice(0, 50)); // keep last 50
    }

    addIfNew(tradeAnalysis.scalping, 'Scalp');
    addIfNew(tradeAnalysis.swing, 'Swing');
  }, [tradeAnalysis, entryTimeframe, confirmationTimeframe]);

  // Monitor livePrice to detect TP / SL hits on OPEN trades
  useEffect(() => {
    if (!livePrice || tradeLog.every((t) => t.status !== 'OPEN')) return;
    setTradeLog((log) =>
      log.map((trade) => {
        if (trade.status !== 'OPEN') return trade;
        const isBuy = trade.direction === 'BUY';
        const tpHit = isBuy ? livePrice >= trade.takeProfit : livePrice <= trade.takeProfit;
        const slHit = isBuy ? livePrice <= trade.stopLoss : livePrice >= trade.stopLoss;
        if (tpHit || slHit) {
          return {
            ...trade,
            status: tpHit ? 'TP_HIT' : 'SL_HIT',
            closedAt: new Date().toISOString(),
            closedPrice: livePrice,
          };
        }
        return trade;
      }),
    );
  }, [livePrice]);

  // Sync tradeLog changes to Supabase (upsert on new trade or status change)
  const syncedStatusRef = useRef({});
  useEffect(() => {
    for (const trade of tradeLog) {
      if (syncedStatusRef.current[trade.id] !== trade.status) {
        syncedStatusRef.current[trade.id] = trade.status;
        upsertTrade(trade);
      }
    }
  }, [tradeLog]);

  // Direction: structure events (CHoCH/BOS/Sweep/Pullback) → VWAP → priceChange
  const effectiveDirection = signal.direction !== 'WAIT'
    ? signal.direction
    : tradeAnalysis.ready
      ? (tradeAnalysis.indicators.aboveVWAP ? 'BUY' : 'SELL')
      : priceChange >= 0 ? 'BUY' : 'SELL';
  const timeframeProfile = ENTRY_TIMEFRAME_PROFILES[entryTimeframe];
  const confirmationProfile = CONFIRMATION_TIMEFRAME_PROFILES[confirmationTimeframe];
  const setupQualification = useMemo(() => {
    const requiredKeys = Object.entries(signal.checks)
      .filter(([key]) => !['vwap_weekly', 'equal_highs', 'choch', 'candle_conf', 'inval_dxy'].includes(key))
      .map(([key]) => key);
    const passedRequired = requiredKeys.filter((key) => signal.checks[key]).length;
    const baseConfidence = requiredKeys.length ? Math.round((passedRequired / requiredKeys.length) * 100) : 0;

    const entryChecks = ENTRY_TRIGGER_CHECKS[entryTimeframe] ?? [];
    const confirmationChecks = CONFIRMATION_CHECKS[confirmationTimeframe] ?? [];
    const entryAligned = entryChecks.every((key) => signal.checks[key]);
    const confirmationAligned = confirmationChecks.every((key) => signal.checks[key]);
    const confidenceBoost = (entryAligned ? 10 : 0) + (confirmationAligned ? 10 : 0);
    const confidence = Math.min(100, baseConfidence + confidenceBoost);
    const entryEligible = Number.isFinite(signal.entry) && confidence >= ENTRY_MIN_PROBABILITY;
    const fullLevelsEligible = Number.isFinite(signal.entry) && confidence >= FULL_LEVELS_PROBABILITY;

    const probabilityBand = confidence >= 85
      ? { label: '85-100% — VALID TRADE', color: '#22c55e', background: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' }
      : confidence >= 60
        ? { label: '60-84% — FORMING', color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' }
        : confidence >= 40
          ? { label: '40-59% — STRUCTURE ONLY', color: '#fb923c', background: 'rgba(251,146,60,0.08)', border: 'rgba(251,146,60,0.25)' }
          : { label: 'BELOW 40% — NO SIGNAL', color: '#64748b', background: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.25)' };

    return {
      entryEligible,
      fullLevelsEligible,
      confidence,
      entryAligned,
      confirmationAligned,
      probabilityBand,
    };
  }, [signal, entryTimeframe, confirmationTimeframe]);

  const directionalLevels = useMemo(() => {
    if (!Number.isFinite(signal.entry) || !Number.isFinite(signal.stopDistance)) {
      return { buy: null, sell: null };
    }

    const adjustedStopDistance = Math.max(
      1.5,
      signal.stopDistance * timeframeProfile.stopMultiplier * confirmationProfile.stopFactor,
    );
    const entryOffset = adjustedStopDistance * timeframeProfile.entryBuffer;

    const buyEntry = signal.entry - entryOffset;
    const buyStop = buyEntry - adjustedStopDistance;
    const buyTakeProfit = buyEntry + adjustedStopDistance * timeframeProfile.rewardMultiplier * confirmationProfile.targetFactor;

    const sellEntry = signal.entry + entryOffset;
    const sellStop = sellEntry + adjustedStopDistance;
    const sellTakeProfit = sellEntry - adjustedStopDistance * timeframeProfile.rewardMultiplier * confirmationProfile.targetFactor;

    return {
      buy: {
        entry: buyEntry.toFixed(2),
        stop: buyStop.toFixed(2),
        takeProfit: buyTakeProfit.toFixed(2),
      },
      sell: {
        entry: sellEntry.toFixed(2),
        stop: sellStop.toFixed(2),
        takeProfit: sellTakeProfit.toFixed(2),
      },
    };
  }, [signal.entry, signal.stopDistance, timeframeProfile, confirmationProfile]);

  const fallbackSetup = useMemo(() => {
    const levels = effectiveDirection === 'BUY' ? directionalLevels.buy : directionalLevels.sell;
    if (!levels) return null;
    return {
      active: true,
      direction: effectiveDirection,
      watchingFor: effectiveDirection,
      entry: Number(levels.entry),
      stopLoss: Number(levels.stop),
      takeProfit: Number(levels.takeProfit),
      reasons: ['Signal-derived setup levels'],
      missing: [],
      confidence: setupQualification.confidence,
      highProbability: setupQualification.confidence >= ENTRY_MIN_PROBABILITY,
      ictStatus: setupQualification.confidence >= ENTRY_MIN_PROBABILITY ? 'READY TO ENTER (CONFIRMED)' : 'SETUP FORMING (STRUCTURE ONLY)',
    };
  }, [effectiveDirection, directionalLevels, setupQualification.confidence]);

  const scalpCardSetup = (tradeAnalysis.ready && tradeAnalysis.scalping?.active)
    ? tradeAnalysis.scalping
    : fallbackSetup ?? tradeAnalysis.scalping;

  const swingCardSetup = (tradeAnalysis.ready && tradeAnalysis.swing?.active)
    ? tradeAnalysis.swing
    : fallbackSetup ?? tradeAnalysis.swing;

  useEffect(() => {
    if (!autoEntryMode) {
      return;
    }

    // Prefer indicator-based scalp/swing levels whenever setup is active
    if (tradeAnalysis.ready) {
      const scalpActive  = tradeAnalysis.scalping.active;
      const swingActive  = tradeAnalysis.swing.active;
      const preferScalp  = ['5m', '15m', '30m'].includes(entryTimeframe);
      let levels = null;
      if (preferScalp && scalpActive)  levels = tradeAnalysis.scalping;
      else if (swingActive)            levels = tradeAnalysis.swing;
      else if (scalpActive)            levels = tradeAnalysis.scalping;
      if (levels) {
        setEntryPrice(String(levels.entry));
        setStopLoss(String(levels.stopLoss));
        setTakeProfit(String(levels.takeProfit));
        return;
      }
    }

    // Fallback: signal-based levels
    if (!Number.isFinite(signal.entry)) {
      setEntryPrice('');
      setStopLoss('');
      setTakeProfit('');
      return;
    }

    const activeLevels = effectiveDirection === 'BUY' ? directionalLevels.buy : directionalLevels.sell;

    if (!activeLevels) {
      setEntryPrice('');
      setStopLoss('');
      setTakeProfit('');
      return;
    }

    setEntryPrice(activeLevels.entry);
    setStopLoss(activeLevels.stop);
    setTakeProfit(activeLevels.takeProfit);
  }, [autoEntryMode, tradeAnalysis, entryTimeframe, setupQualification.entryEligible, effectiveDirection, directionalLevels]);

  const calc = useMemo(() => {
    const acc = parseFloat(account) || 0;
    const risk = parseFloat(riskPct) || 1;
    const entry = parseFloat(entryPrice) || 0;
    const sl = parseFloat(stopLoss) || 0;
    const tp = parseFloat(takeProfit) || 0;
    const hasTradeLevels = Number.isFinite(parseFloat(entryPrice))
      && Number.isFinite(parseFloat(stopLoss))
      && Number.isFinite(parseFloat(takeProfit));

    const riskAmount = acc * (risk / 100);
    const slDist = hasTradeLevels ? Math.abs(entry - sl) : 0;
    const tpDist = hasTradeLevels ? Math.abs(tp - entry) : 0;
    const posSize = hasTradeLevels ? calcPositionSize(acc, risk, slDist) : 0;
    const rr = hasTradeLevels ? calcRiskReward(entry, sl, tp) : 0;
    const reward = riskAmount * rr;
    const partial = parseFloat(partialAt) / 100;
    const partialProfit = riskAmount * partial;
    const remainderProfit = reward * (1 - partial);
    const bullish = hasTradeLevels ? entry < tp : effectiveDirection === 'BUY';

    return { riskAmount, slDist, tpDist, posSize, rr, reward, partialProfit, remainderProfit, bullish, hasTradeLevels };
  }, [account, riskPct, entryPrice, stopLoss, takeProfit, partialAt, effectiveDirection]);

  const rrColor = calc.rr >= 3 ? '#22c55e' : calc.rr >= 1.5 ? '#f59e0b' : '#ef4444';

  const Input = ({ label, value, onChange, prefix, step = '1', note, disabled = false }) => (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      {note && <p className="text-xs text-slate-600 mb-1">{note}</p>}
      <div className="flex items-center gap-2">
        {prefix && <span className="text-xs text-amber-400 font-semibold w-5">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          step={step}
          disabled={disabled}
          className="w-full px-3 py-2 rounded-lg text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors"
          style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}
        />
      </div>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="max-w-5xl mx-auto">

        {/* Rules */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {RULES.map(r => {
            const Icon = r.icon;
            return (
              <div key={r.title} className="card-dark">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} style={{ color: r.color }} />
                  <span className="text-xs font-semibold text-slate-400">{r.title}</span>
                </div>
                <div className="text-lg font-bold" style={{ color: r.color }}>{r.value}</div>
                <p className="text-xs text-slate-600 mt-1">{r.desc}</p>
              </div>
            );
          })}
        </div>

        {/* ── Live Trade Setup Analysis ───────────────────────────────────────── */}
        {tradeAnalysis.ready && (
          <div className="card-dark mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <TrendingUp size={14} className="text-amber-400" />
                Live Trade Setup Analysis
              </h3>
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    background: tradeAnalysis.indicators.aboveVWAP ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                    color: tradeAnalysis.indicators.aboveVWAP ? '#22c55e' : '#ef4444',
                  }}
                >
                  {tradeAnalysis.indicators.bias}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    background:
                      tradeAnalysis.indicators.trend === 'Uptrend'
                        ? 'rgba(34,197,94,0.18)'
                        : tradeAnalysis.indicators.trend === 'Downtrend'
                          ? 'rgba(239,68,68,0.18)'
                          : 'rgba(100,116,139,0.18)',
                    color:
                      tradeAnalysis.indicators.trend === 'Uptrend'
                        ? '#22c55e'
                        : tradeAnalysis.indicators.trend === 'Downtrend'
                          ? '#ef4444'
                          : '#94a3b8',
                  }}
                >
                  {tradeAnalysis.indicators.trend}
                </span>
              </div>
            </div>

            {/* Live signal summary bar */}
            <div className="flex items-center gap-3 p-2 rounded-lg mb-3 text-xs"
              style={{
                background: effectiveDirection === 'BUY' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                border: `1px solid ${effectiveDirection === 'BUY' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Direction</span>
                <span className={`font-bold text-sm ${effectiveDirection === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{effectiveDirection}</span>
              </div>
              <div className="w-px h-4 bg-slate-700" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Source</span>
                <span className={`font-semibold ${
                  signal.signalSource === 'CHoCH' ? 'text-purple-400' :
                  signal.signalSource === 'BOS' ? 'text-green-400' :
                  signal.signalSource === 'Liquidity Sweep' ? 'text-amber-400' :
                  signal.signalSource === 'Pullback' ? 'text-orange-400' :
                  'text-slate-400'
                }`}>{signal.signalSource ?? 'VWAP'}</span>
              </div>
              <div className="w-px h-4 bg-slate-700" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500">VWAP</span>
                <span className="font-mono text-cyan-400">{tradeAnalysis.indicators.vwap}</span>
              </div>
              <div className="w-px h-4 bg-slate-700" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500">RSI</span>
                <span className={`font-mono font-semibold ${
                  tradeAnalysis.indicators.rsi14 >= 70 ? 'text-red-400' :
                  tradeAnalysis.indicators.rsi14 <= 30 ? 'text-green-400' : 'text-amber-400'
                }`}>{tradeAnalysis.indicators.rsi14}</span>
              </div>
              <div className="ml-auto text-slate-600">{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : ''}</div>
            </div>

            {/* Indicator strip */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {[
                { label: 'Price', value: tradeAnalysis.indicators.price, color: '#f1f5f9' },
                { label: 'SMA 20', value: tradeAnalysis.indicators.sma20, color: '#3b82f6' },
                { label: 'SMA 50', value: tradeAnalysis.indicators.sma50, color: '#8b5cf6' },
                {
                  label: 'RSI 14',
                  value: tradeAnalysis.indicators.rsi14,
                  color:
                    tradeAnalysis.indicators.rsi14 >= 70
                      ? '#ef4444'
                      : tradeAnalysis.indicators.rsi14 <= 30
                        ? '#22c55e'
                        : '#f59e0b',
                },
                { label: 'VWAP', value: tradeAnalysis.indicators.vwap, color: '#06b6d4' },
                {
                  label: 'MACD Hist',
                  value: tradeAnalysis.indicators.macdHist,
                  color: tradeAnalysis.indicators.macdHist >= 0 ? '#22c55e' : '#ef4444',
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="p-2 rounded-lg text-center"
                  style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}
                >
                  <div className="text-xs text-slate-500 mb-1">{label}</div>
                  <div className="font-mono font-bold text-xs" style={{ color }}>{value ?? '—'}</div>
                </div>
              ))}
            </div>

            {/* Scalp + Swing setup cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SetupCard
                title="Scalp Entry"
                setup={scalpCardSetup}
                timeframe={entryTimeframe}
              />
              <SetupCard
                title="Intraday Swing"
                setup={swingCardSetup}
                timeframe={confirmationTimeframe}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Calculator inputs */}
          <div className="card-dark space-y-4">
            <h3 className="text-sm font-bold text-slate-200">Position Size Calculator</h3>
            <p className="text-xs text-slate-500">Formula: Position Size = Account Risk ÷ Stop Loss Distance</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                <label className="block text-xs text-slate-500 mb-2">Scalping Entry Timeframe</label>
                <select
                  value={entryTimeframe}
                  onChange={(event) => setEntryTimeframe(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm text-slate-200"
                  style={{ background: '#020617', border: '1px solid #1e293b' }}
                >
                  {SCALPING_ENTRY_TIMEFRAMES.map((timeframe) => (
                    <option key={timeframe} value={timeframe}>{timeframe}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-600 mt-2">Use 5m, 15m, 30m, or 1h for the actual sniper entry trigger.</p>
              </div>

              <div className="p-3 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                <label className="block text-xs text-slate-500 mb-2">Intraday / Swing Confirmation</label>
                <select
                  value={confirmationTimeframe}
                  onChange={(event) => setConfirmationTimeframe(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm text-slate-200"
                  style={{ background: '#020617', border: '1px solid #1e293b' }}
                >
                  {CONFIRMATION_TIMEFRAMES.map((timeframe) => (
                    <option key={timeframe} value={timeframe}>{timeframe}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-600 mt-2">Confirm direction with 1h, 4h, 1D, or 1W before using the lower timeframe entry.</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg text-xs"
              style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
              <span className="text-slate-400">Execution plan</span>
              <span className="font-semibold text-amber-400">Enter on {entryTimeframe} • Confirm on {confirmationTimeframe}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                <div className="text-slate-500 mb-1">Scalping Entry Model ({entryTimeframe})</div>
                <div className="text-slate-300">Controls trigger timing and entry offset.</div>
              </div>
              <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                <div className="text-slate-500 mb-1">Intraday Confirmation Model ({confirmationTimeframe})</div>
                <div className="text-slate-300">Controls stop/target expansion using {confirmationProfile.label}.</div>
              </div>
            </div>

            <div
              className="flex items-center justify-between p-2 rounded-lg text-xs"
              style={{
                background: setupQualification.probabilityBand.background,
                border: `1px solid ${setupQualification.probabilityBand.border}`,
              }}
            >
              <div className="text-slate-300">
                Probability zone: <span className="font-semibold" style={{ color: setupQualification.probabilityBand.color }}>{setupQualification.probabilityBand.label}</span>
              </div>
              <div className="font-semibold" style={{ color: setupQualification.probabilityBand.color }}>
                {setupQualification.confidence}%
              </div>
            </div>

            {autoEntryMode && (
              <div className="p-2 rounded-lg text-xs"
                style={{
                  color: setupQualification.entryEligible ? '#f1f5f9' : '#fda4af',
                  background: 'rgba(15,23,42,0.8)',
                  border: '1px solid rgba(51,65,85,0.7)',
                }}>
                {setupQualification.confidence < ENTRY_MIN_PROBABILITY && `Confidence below 25%: waiting for setup.`}
                {setupQualification.confidence >= 25 && setupQualification.confidence < 50 && `25-45% band: entry, SL, and TP are active with red risk caution.`}
                {setupQualification.confidence >= 50 && setupQualification.confidence < 75 && `50-75% band: full setup active (entry, SL, TP) with yellow caution.`}
                {setupQualification.confidence >= 75 && `75-100% band: strongest setup quality.`}
              </div>
            )}

            <div className="flex items-center justify-between p-2 rounded-lg text-xs"
              style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-400">Sniper signal:</span>
                <span className={`font-bold ${effectiveDirection === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{effectiveDirection}</span>
                {signal.signalSource && signal.signalSource !== 'None' && (
                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                    signal.signalSource === 'CHoCH' ? 'bg-purple-900/40 text-purple-300' :
                    signal.signalSource === 'BOS' ? 'bg-green-900/40 text-green-300' :
                    signal.signalSource === 'Liquidity Sweep' ? 'bg-amber-900/40 text-amber-300' :
                    signal.signalSource === 'Pullback' ? 'bg-orange-900/40 text-orange-300' :
                    'bg-slate-800 text-slate-400'
                  }`}>{signal.signalSource}</span>
                )}
                {lastUpdated && <span className="text-slate-600">• {new Date(lastUpdated).toLocaleTimeString()}</span>}
              </div>
              <button
                type="button"
                onClick={() => setAutoEntryMode((value) => !value)}
                className="px-3 py-1 rounded-md border"
                style={{
                  borderColor: autoEntryMode ? 'rgba(34,197,94,0.4)' : 'rgba(71,85,105,0.7)',
                  color: autoEntryMode ? '#22c55e' : '#94a3b8',
                  background: autoEntryMode ? 'rgba(34,197,94,0.08)' : 'rgba(71,85,105,0.08)',
                }}
              >
                {autoEntryMode ? 'Auto Entry: ON' : 'Auto Entry: OFF'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Account Balance ($)" value={account} onChange={setAccount} prefix="$" step="1000" />
              <Input label="Risk Per Trade (%)" value={riskPct} onChange={setRiskPct} prefix="%" step="0.1"
                note="Recommended: 1% default, max 2%" />
              <Input label="Entry Price" value={entryPrice} onChange={setEntryPrice} step="0.01"
                note={autoEntryMode ? (setupQualification.entryEligible ? `Auto-adjusted for ${entryTimeframe} execution timing.` : `Waiting for at least 25% probability.`) : undefined}
                disabled={autoEntryMode} />
              <Input label="Stop Loss" value={stopLoss} onChange={setStopLoss} step="0.01"
                note={autoEntryMode && !setupQualification.entryEligible ? 'SL appears once probability reaches 25%+.' : undefined} />
              <Input label="Take Profit" value={takeProfit} onChange={setTakeProfit} step="0.01"
                note={autoEntryMode ? (setupQualification.entryEligible ? `Auto-updated using ${entryTimeframe} target profile.` : `TP appears once probability reaches 25%+.`) : undefined}
                disabled={autoEntryMode} />
              <Input label="Partial Close (%)" value={partialAt} onChange={setPartialAt} prefix="%" step="5"
                note="% of position closed at 1R" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <div className="text-xs font-semibold text-green-300 mb-2">BUY Setup</div>
                <div className="text-xs text-slate-300">Entry: <span className="font-mono">{directionalLevels.buy?.entry ?? '--'}</span></div>
                <div className="text-xs text-slate-300">SL: <span className="font-mono">{directionalLevels.buy?.stop ?? '--'}</span></div>
                <div className="text-xs text-slate-300">TP: <span className="font-mono">{directionalLevels.buy?.takeProfit ?? '--'}</span></div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <div className="text-xs font-semibold text-red-300 mb-2">SELL Setup</div>
                <div className="text-xs text-slate-300">Entry: <span className="font-mono">{directionalLevels.sell?.entry ?? '--'}</span></div>
                <div className="text-xs text-slate-300">SL: <span className="font-mono">{directionalLevels.sell?.stop ?? '--'}</span></div>
                <div className="text-xs text-slate-300">TP: <span className="font-mono">{directionalLevels.sell?.takeProfit ?? '--'}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                <div className="text-slate-500 mb-1">Entry Buffer</div>
                <div className="font-semibold text-amber-400">{(timeframeProfile.entryBuffer * 100).toFixed(0)}%</div>
              </div>
              <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                <div className="text-slate-500 mb-1">Stop Profile</div>
                <div className="font-semibold text-amber-400">{timeframeProfile.stopMultiplier.toFixed(2)}x</div>
              </div>
              <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                <div className="text-slate-500 mb-1">TP Profile</div>
                <div className="font-semibold text-amber-400">{timeframeProfile.rewardMultiplier.toFixed(1)}R</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                <div className="text-slate-500 mb-1">Confirmation Stop Factor</div>
                <div className="font-semibold text-amber-400">x{confirmationProfile.stopFactor.toFixed(2)}</div>
              </div>
              <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                <div className="text-slate-500 mb-1">Confirmation Target Factor</div>
                <div className="font-semibold text-amber-400">x{confirmationProfile.targetFactor.toFixed(2)}</div>
              </div>
            </div>

            {/* Trade direction indicator */}
            <div className="flex items-center gap-2 p-2 rounded-lg text-xs" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
              <span className="text-slate-500">Trade Direction:</span>
              <span className={`font-bold ${calc.bullish ? 'text-green-400' : 'text-red-400'}`}>
                {calc.bullish ? '▲ LONG (BUY)' : '▼ SHORT (SELL)'}
              </span>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4">

            {/* Main results card */}
            <div className="card-dark">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-200">Calculation Results</h3>
                <RiskMeter riskPercent={parseFloat(riskPct) || 0} />
              </div>

              <div className="space-y-3">
                {[
                  { label: 'Risk Amount', value: `$${calc.riskAmount.toFixed(2)}`, color: '#ef4444' },
                  { label: 'Position Size (oz/lots)', value: `${calc.posSize.toFixed(4)}`, color: '#f59e0b', highlight: true },
                  { label: 'SL Distance (pips)', value: `${calc.slDist.toFixed(2)}`, color: '#94a3b8' },
                  { label: 'TP Distance (pips)', value: `${calc.tpDist.toFixed(2)}`, color: '#94a3b8' },
                  { label: 'Risk:Reward Ratio', value: `1 : ${calc.rr}`, color: rrColor, highlight: true },
                  { label: 'Potential Reward ($)', value: `$${calc.reward.toFixed(2)}`, color: '#22c55e' },
                ].map(r => (
                  <div
                    key={r.label}
                    className={`flex items-center justify-between py-2 px-3 rounded-lg ${r.highlight ? 'glow-gold' : ''}`}
                    style={{
                      background: r.highlight ? 'rgba(245,158,11,0.08)' : '#0a0e1a',
                      border: `1px solid ${r.highlight ? 'rgba(245,158,11,0.2)' : '#1a2444'}`,
                    }}
                  >
                    <span className="text-xs text-slate-400">{r.label}</span>
                    <span className="font-mono font-bold text-sm" style={{ color: r.color }}>{r.value}</span>
                  </div>
                ))}
              </div>

              {/* R:R warning */}
              {calc.rr < 3 && (
                <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg text-xs text-red-400"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle size={12} />
                  Risk:Reward below 1:3 minimum. Adjust TP or move on.
                </div>
              )}

              {!calc.hasTradeLevels && (
                <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg text-xs text-slate-300"
                  style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(51,65,85,0.7)' }}>
                  <AlertTriangle size={12} />
                  Entry, stop loss, and take profit remain blank until live conditions produce a qualified setup.
                </div>
              )}
            </div>

            {/* Partial profit breakdown */}
            <div className="card-dark">
              <h3 className="text-sm font-bold text-slate-200 mb-3">Partial Profit Plan</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-slate-400">Close {partialAt}% at 1R (partial)</span>
                  </div>
                  <span className="font-mono text-amber-400 font-semibold">+${calc.partialProfit.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-slate-400">Remaining {100 - parseFloat(partialAt)}% runs to TP</span>
                  </div>
                  <span className="font-mono text-green-400 font-semibold">+${calc.remainderProfit.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm pt-2" style={{ borderTop: '1px solid #1a2444' }}>
                  <span className="text-slate-300 font-medium">Total Potential Profit</span>
                  <span className="font-mono text-green-400 font-bold">+${(calc.partialProfit + calc.remainderProfit).toFixed(2)}</span>
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-3">
                After {partialAt}% partial close → Move stop loss to breakeven. Risk-free trade.
              </p>
            </div>

            {/* Log Trade button */}
            {calc.hasTradeLevels && (
              <>
              <button
                type="button"
                onClick={() => {
                  // Block logging if confidence is below 55%
                  if (setupQualification.confidence < 55) return;
                  const direction = calc.bullish ? 'BUY' : 'SELL';
                  const entry = parseFloat(entryPrice);
                  const sl    = parseFloat(stopLoss);
                  const tp    = parseFloat(takeProfit);
                  setTradeLog((log) => {
                    const key = `Manual-${direction}-${entry}-${sl}-${tp}`;
                    if (log.length > 0) {
                      const last = log[0];
                      if (`Manual-${last.direction}-${last.entry}-${last.stopLoss}-${last.takeProfit}` === key) return log;
                    }
                    return [
                      {
                        id: Date.now() + Math.random(),
                        type: 'Manual',
                        direction,
                        entry,
                        stopLoss: sl,
                        takeProfit: tp,
                        reasons: [`R:R 1:${calc.rr}`, `Risk $${calc.riskAmount.toFixed(2)}`, `${calc.posSize.toFixed(4)} lots`],
                        timeframe: entryTimeframe,
                        confidence: setupQualification.confidence,
                        openedAt: new Date().toISOString(),
                        status: 'OPEN',
                        closedAt: null,
                        closedPrice: null,
                      },
                      ...log,
                    ].slice(0, 50);
                  });
                }}
                className="w-full py-2 rounded-lg text-sm font-bold transition-colors"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}
              >
                + Log Trade to History
              </button>
              <p className="text-xs text-center mt-1" style={{ color: setupQualification.confidence >= 55 ? '#64748b' : '#ef4444' }}>
                {setupQualification.confidence >= 55
                  ? `✓ ${setupQualification.confidence}% confidence — entry will be logged`
                  : `✗ ${setupQualification.confidence}% confidence — entry will not be logged (min 55% required)`}
              </p>
              </>
            )}

            {/* Open Trades inline */}
            {tradeLog.filter((t) => t.status === 'OPEN').length > 0 && (
              <div className="card-dark">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
                  <Clock size={13} className="text-amber-400" />
                  Open Trades
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-bold text-amber-400"
                    style={{ background: 'rgba(245,158,11,0.18)' }}>
                    {tradeLog.filter((t) => t.status === 'OPEN').length}
                  </span>
                </h3>
                <div className="space-y-2">
                  {tradeLog.filter((t) => t.status === 'OPEN').map((trade) => {
                    const isBuy = trade.direction === 'BUY';
                    return (
                      <div key={trade.id} className="rounded-xl p-3"
                        style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.22)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                              style={{ background: isBuy ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)', color: isBuy ? '#22c55e' : '#ef4444' }}>
                              {trade.direction} {isBuy ? '▲' : '▼'}
                            </span>
                            <span className="text-xs font-semibold text-slate-300">{trade.type}</span>
                            <span className="text-xs text-slate-500 font-mono">{trade.timeframe}</span>
                          </div>
                          <span className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                            <Clock size={9} /> OPEN
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[{ label: 'Entry', val: trade.entry, color: '#f1f5f9' }, { label: 'SL', val: trade.stopLoss, color: '#f87171' }, { label: 'TP', val: trade.takeProfit, color: '#4ade80' }].map(({ label, val, color }) => (
                            <div key={label} className="p-1.5 rounded-lg" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #1a2444' }}>
                              <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                              <div className="font-mono text-xs font-bold" style={{ color }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-1.5 text-xs text-slate-600">Opened: {new Date(trade.openedAt).toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Risk formula explanation */}
        <div className="card-dark mt-5">
          <div className="flex items-start gap-3">
            <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-blue-400 mb-2">Position Sizing Formula</h3>
              <div className="font-mono text-sm text-slate-300 p-3 rounded-lg mb-2" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                Position Size = (Account Balance × Risk%) ÷ Stop Loss Distance
              </div>
              <p className="text-xs text-slate-500">
                Example: $10,000 account × 1% risk = $100 risk. SL distance = 15 pips → Position = 100 ÷ 15 = 6.67 lots.
                Always calculate BEFORE placing the trade, never estimate.
              </p>
            </div>
          </div>
        </div>

        {/* ── Trade History ──────────────────────────────────────────────────── */}
        <TradeHistory />


      </div>
    </div>
  );
}
