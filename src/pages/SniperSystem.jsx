import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, Minus, Shield, Crosshair, XCircle } from 'lucide-react';
import { buildAutoChecks, requiredCheckIds } from '../utils/sniperSignal';

const steps = [
  {
    id: 1,
    title: 'Market Context Filter',
    icon: Shield,
    color: '#f59e0b',
    description: 'Avoid trading in poor conditions',
    checks: [
      { id: 'no_chop', label: 'Market is NOT sideways/choppy', required: true },
      { id: 'no_news', label: 'No high-impact news within 30 min', required: true },
      { id: 'bias', label: 'Clear directional USD bias exists', required: true },
    ],
    warning: 'If any box is unchecked, do NOT proceed to next step.',
  },
  {
    id: 2,
    title: 'Multi-Timeframe Alignment',
    icon: TrendingUp,
    color: '#3b82f6',
    description: 'All timeframes must agree on direction',
    checks: [
      { id: 'tf_1h', label: '1H trend aligned with bias', required: true },
      { id: 'tf_4h', label: '4H trend aligned with bias', required: true },
      { id: 'tf_daily', label: 'Daily trend aligned with bias', required: true },
    ],
    warning: 'Mixed timeframe = no trade. All three must align.',
  },
  {
    id: 3,
    title: 'VWAP Confirmation',
    icon: Minus,
    color: '#a855f7',
    description: 'Price vs VWAP across all timeframes',
    checks: [
      { id: 'vwap_1h', label: 'Price above/below 1H VWAP (per bias)', required: true },
      { id: 'vwap_4h', label: 'Price above/below 4H VWAP (per bias)', required: true },
      { id: 'vwap_daily', label: 'Price above/below Daily VWAP (per bias)', required: true },
      { id: 'vwap_weekly', label: 'Price above/below Weekly VWAP (per bias)', required: false },
    ],
    warning: 'Mixed VWAP alignment = no trade.',
  },
  {
    id: 4,
    title: 'Liquidity & Structure',
    icon: Crosshair,
    color: '#ef4444',
    description: 'Market structure confirmation required',
    checks: [
      { id: 'equal_highs', label: 'Equal highs or lows identified', required: false },
      { id: 'liq_sweep', label: 'Liquidity sweep confirmed (stop hunt)', required: true },
      { id: 'bos', label: 'Break of Structure (BOS) confirmed', required: true },
      { id: 'choch', label: 'Change of Character (CHoCH) visible', required: false },
    ],
    warning: 'Must have sweep + BOS. CHoCH is bonus confirmation.',
  },
  {
    id: 5,
    title: 'Entry Trigger',
    icon: Crosshair,
    color: '#22c55e',
    description: 'Final entry confirmation',
    checks: [
      { id: 'retest', label: 'Price retesting broken structure', required: true },
      { id: 'rsi_conf', label: 'RSI confirms momentum direction', required: true },
      { id: 'macd_conf', label: 'MACD shows bullish/bearish crossover', required: true },
      { id: 'candle_conf', label: 'Confirmation candle formed (engulf/pin bar)', required: false },
    ],
    warning: 'Enter only on retest + RSI + MACD aligned.',
  },
  {
    id: 6,
    title: 'Invalidation Rules',
    icon: XCircle,
    color: '#64748b',
    description: 'Define your exit before you enter',
    checks: [
      { id: 'sl_defined', label: 'Stop loss level clearly defined', required: true },
      { id: 'rr_check', label: 'Risk:Reward ≥ 1:2 confirmed', required: true },
      { id: 'inval_struct', label: 'Opposite structure break = exit rule set', required: true },
      { id: 'inval_vwap', label: 'VWAP failure exit rule set', required: true },
      { id: 'inval_dxy', label: 'DXY strong reversal exit rule set', required: false },
    ],
    warning: 'Never enter without a defined stop loss.',
  },
];

function StepCard({ step, checked, onChange, locked, readOnly }) {
  const [expanded, setExpanded] = useState(step.id === 1);
  const Icon = step.icon;
  const passedRequired = step.checks.filter(c => c.required).every(c => checked[c.id]);
  const passedAll = step.checks.every(c => checked[c.id]);
  const passedCount = step.checks.filter(c => checked[c.id]).length;

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-300 ${locked ? 'opacity-50' : ''}`}
      style={{ border: `1px solid ${passedRequired ? step.color + '44' : '#1a2444'}`, background: '#0f1629' }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => !locked && setExpanded(e => !e)}
        disabled={locked}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: `${step.color}22`, border: `1px solid ${step.color}44`, color: step.color }}>
            {step.id}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">{step.title}</span>
              {passedRequired && (
                <CheckCircle2 size={14} className="text-green-400" />
              )}
            </div>
            <p className="text-xs text-slate-500">{step.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono" style={{ color: passedRequired ? '#22c55e' : '#64748b' }}>
            {passedCount}/{step.checks.length}
          </span>
          {expanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {/* Progress bar */}
          <div className="h-1 rounded-full overflow-hidden mb-3" style={{ background: '#1a2444' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(passedCount / step.checks.length) * 100}%`, background: step.color }}
            />
          </div>

          {step.checks.map(check => (
            <label
              key={check.id}
              className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-slate-800/50"
            >
              <button
                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: checked[check.id] ? step.color : 'transparent',
                  border: `2px solid ${checked[check.id] ? step.color : '#374151'}`,
                }}
                onClick={(event) => {
                  event.preventDefault();

                  if (!readOnly) {
                    onChange(check.id, !checked[check.id]);
                  }
                }}
                type="button"
                disabled={readOnly}
              >
                {checked[check.id] && <CheckCircle2 size={12} className="text-white" strokeWidth={3} />}
              </button>
              <span className={`text-sm ${checked[check.id] ? 'text-slate-200' : 'text-slate-500'}`}>
                {check.label}
                {!check.required && (
                  <span className="ml-2 text-xs text-slate-600">(optional)</span>
                )}
                {check.required && (
                  <span className="ml-2 text-xs text-red-500/70">*required</span>
                )}
              </span>
            </label>
          ))}

          {/* Warning */}
          <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg text-xs text-amber-400/80"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            {step.warning}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SniperSystem({ livePrice = 0, priceChange = 0, lastUpdated = null, priceHistory = [] }) {
  const [checked, setChecked] = useState({});
  const [autoMode, setAutoMode] = useState(true);

  const handleChange = (id, val) => setChecked(prev => ({ ...prev, [id]: val }));

  const autoSignal = useMemo(() => buildAutoChecks(livePrice, priceChange, priceHistory), [livePrice, priceChange, priceHistory]);

  useEffect(() => {
    if (autoMode) {
      setChecked(autoSignal.checks);
    }
  }, [autoMode, autoSignal]);

  // Calculate overall readiness
  const passedRequired = requiredCheckIds.filter((id) => checked[id]).length;
  const totalRequired = requiredCheckIds.length;
  const readiness = Math.round((passedRequired / totalRequired) * 100);

  const allRequiredPassed = passedRequired === totalRequired;

  // Determine which steps are unlocked (sequential)
  const getStepLocked = (stepIdx) => {
    if (stepIdx === 0) return false;
    const prevStep = steps[stepIdx - 1];
    return !prevStep.checks.filter(c => c.required).every(c => checked[c.id]);
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header card */}
        <div className="card-dark mb-6">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-amber-400 mb-1">🎯 Sniper Entry System</h2>
              <p className="text-sm text-slate-400">
                Complete all 6 steps sequentially. Each step must be qualified before proceeding.
                This system filters out low-probability setups and keeps you in only high-confluence trades.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAutoMode((value) => !value)}
                  className="px-3 py-1.5 rounded-md border transition-all"
                  style={{
                    borderColor: autoMode ? 'rgba(34,197,94,0.4)' : 'rgba(71,85,105,0.7)',
                    color: autoMode ? '#22c55e' : '#94a3b8',
                    background: autoMode ? 'rgba(34,197,94,0.08)' : 'rgba(71,85,105,0.08)',
                  }}
                >
                  {autoMode ? 'Auto-check: ON' : 'Auto-check: OFF'}
                </button>
                <span className="px-2 py-1 rounded-md" style={{ background: autoSignal.qualified ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', color: autoSignal.qualified ? '#22c55e' : '#f59e0b', border: autoSignal.qualified ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(245,158,11,0.25)' }}>
                  Live monitor: {autoSignal.qualified ? 'Setup found' : 'Scanning market'}
                </span>
                <span className="text-slate-500">Live price: {livePrice.toFixed(2)} ({priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%)</span>
                <span className="text-slate-500">Confidence: {autoSignal.confidence}%</span>
                {lastUpdated && <span className="text-slate-600">Updated: {String(lastUpdated)}</span>}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 min-w-[100px]">
              <div className="text-3xl font-bold font-mono" style={{ color: readiness >= 80 ? '#22c55e' : readiness >= 50 ? '#f59e0b' : '#ef4444' }}>
                {readiness}%
              </div>
              <div className="text-xs text-slate-500">Trade Readiness</div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#1a2444' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${readiness}%`,
                    background: readiness >= 80 ? '#22c55e' : readiness >= 50 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Trade decision banner */}
        {allRequiredPassed ? (
          <div className="mb-5 p-4 rounded-xl glow-green"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="text-green-400 flex-shrink-0" size={22} />
              <div>
                <div className="text-green-400 font-bold">✅ ALL CONDITIONS MET — TRADE QUALIFIED</div>
                <div className="text-green-400/70 text-sm">All required checks passed. Entry and stop loss are ready.</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm mt-2">
              <div className="p-2 rounded-lg" style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div className="text-slate-400 text-xs mb-1">Direction</div>
                <div className="font-bold text-green-300">{autoSignal.direction}</div>
              </div>
              <div className="p-2 rounded-lg" style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div className="text-slate-400 text-xs mb-1">Signal Source</div>
                <div className="font-bold text-amber-300">{autoSignal.signalSource ?? '—'}</div>
              </div>
              <div className="p-2 rounded-lg" style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div className="text-slate-400 text-xs mb-1">Entry</div>
                <div className="font-bold text-green-300">{autoSignal.entry ?? '--'}</div>
              </div>
              <div className="p-2 rounded-lg" style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div className="text-slate-400 text-xs mb-1">Stop Loss</div>
                <div className="font-bold text-red-300">{autoSignal.stopLoss ?? '--'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-5 p-3.5 rounded-xl flex items-center gap-3"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <XCircle className="text-red-400 flex-shrink-0" size={20} />
            <div className="text-red-400/80 text-sm">
              <span className="font-bold">Trade not yet qualified.</span> {totalRequired - passedRequired} required condition(s) remaining.
            </div>
          </div>
        )}

        <div className="mb-5 p-4 rounded-xl"
          style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(148,163,184,0.15)' }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold text-slate-200">Real-Time Liquidity & Structure Scan</div>
              <div className="text-xs text-slate-500">Scanning rolling live XAUUSD prices for equal highs/lows, sweep, BOS, and CHoCH.</div>
            </div>
            <div className={`text-xs font-semibold px-2 py-1 rounded-full ${
              autoSignal.structureScan?.chochDetected ? 'text-purple-300 bg-purple-900/30' :
              autoSignal.structureScan?.structureBreak ? 'text-green-400 bg-green-900/20' :
              autoSignal.structureScan?.liquiditySweepDetected ? 'text-amber-400 bg-amber-900/20' :
              'text-slate-500 bg-slate-800/40'
            }`}>
              {autoSignal.signalSource && autoSignal.signalSource !== 'None' && autoSignal.signalSource !== 'Trend Bias'
                ? `▶ ${autoSignal.signalSource}` : 'Monitoring'}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-2">
            <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
              <div className="text-slate-500 mb-1">Equal Highs/Lows</div>
              <div className={`font-semibold ${
                autoSignal.structureScan?.equalHighsDetected || autoSignal.structureScan?.equalLowsDetected
                  ? 'text-amber-400' : 'text-slate-500'
              }`}>
                {autoSignal.structureScan?.equalHighsDetected
                  ? 'EQH Detected' : autoSignal.structureScan?.equalLowsDetected
                  ? 'EQL Detected' : 'None'}
              </div>
            </div>
            <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
              <div className="text-slate-500 mb-1">Liquidity Sweep</div>
              <div className={`font-semibold ${
                autoSignal.structureScan?.liquiditySweepDetected ? 'text-green-400' : 'text-slate-500'
              }`}>
                {autoSignal.structureScan?.liquiditySweepDetected
                  ? `${autoSignal.structureScan.liquiditySweepDirection} setup` : 'Scanning'}
              </div>
            </div>
            <div className="p-2 rounded-lg" style={{
              background: autoSignal.structureScan?.structureBreak ? 'rgba(34,197,94,0.06)' : '#0a0e1a',
              border: autoSignal.structureScan?.structureBreak ? '1px solid rgba(34,197,94,0.25)' : '1px solid #1a2444',
            }}>
              <div className="text-slate-500 mb-1">BOS</div>
              <div className={`font-semibold ${
                autoSignal.structureScan?.structureBreak ? 'text-green-400' : 'text-slate-500'
              }`}>
                {autoSignal.structureScan?.structureBreak
                  ? `Confirmed — ${autoSignal.structureScan.bosDirection}` : 'Not yet'}
              </div>
            </div>
            <div className="p-2 rounded-lg" style={{
              background: autoSignal.structureScan?.chochDetected ? 'rgba(168,85,247,0.06)' : '#0a0e1a',
              border: autoSignal.structureScan?.chochDetected ? '1px solid rgba(168,85,247,0.25)' : '1px solid #1a2444',
            }}>
              <div className="text-slate-500 mb-1">CHoCH</div>
              <div className={`font-semibold ${
                autoSignal.structureScan?.chochDetected ? 'text-purple-400' : 'text-slate-500'
              }`}>
                {autoSignal.structureScan?.chochDetected
                  ? `${autoSignal.structureScan.chochDirection} flip` : 'Not yet'}
              </div>
            </div>
            <div className="p-2 rounded-lg" style={{
              background: autoSignal.structureScan?.pullbackDetected ? 'rgba(245,158,11,0.06)' : '#0a0e1a',
              border: autoSignal.structureScan?.pullbackDetected ? '1px solid rgba(245,158,11,0.25)' : '1px solid #1a2444',
            }}>
              <div className="text-slate-500 mb-1">Pullback / Retest</div>
              <div className={`font-semibold ${
                autoSignal.structureScan?.pullbackDetected ? 'text-amber-400' : 'text-slate-500'
              }`}>
                {autoSignal.structureScan?.pullbackDetected
                  ? `${autoSignal.structureScan.pullbackDirection} entry zone` : 'Not yet'}
              </div>
            </div>
            <div className="p-2 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
              <div className="text-slate-500 mb-1">Signal Basis</div>
              <div className={`font-semibold ${
                autoSignal.signalSource === 'CHoCH' ? 'text-purple-400' :
                autoSignal.signalSource === 'BOS' ? 'text-green-400' :
                autoSignal.signalSource === 'Liquidity Sweep' ? 'text-amber-400' :
                autoSignal.signalSource === 'Pullback' ? 'text-orange-400' :
                'text-slate-500'
              }`}>
                {autoSignal.signalSource ?? '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Step cards */}
        <div className="space-y-3">
          {steps.map((step, idx) => (
            <StepCard
              key={step.id}
              step={step}
              checked={checked}
              onChange={handleChange}
              locked={getStepLocked(idx)}
              readOnly={autoMode}
            />
          ))}
        </div>

        {/* Reset */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => setChecked({})}
            disabled={autoMode}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 transition-all"
          >
            Reset Checklist
          </button>
        </div>
      </div>
    </div>
  );
}
