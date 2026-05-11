import { useState } from 'react';
import { Copy, Check, Code2, Info, ChevronRight } from 'lucide-react';
import { PINE_SCRIPT } from '../data/mockData';

const indicators = [
  { name: 'EMA 20 / EMA 50', color: '#fb923c/#60a5fa', purpose: 'Trend direction filter', weight: '30%' },
  { name: 'RSI (14)', color: '#a78bfa', purpose: 'Momentum confirmation', weight: '20%' },
  { name: 'MACD (12,26,9)', color: '#34d399', purpose: 'Crossover signal trigger', weight: '20%' },
  { name: 'VWAP (Session)', color: '#c084fc', purpose: 'Institutional price level', weight: '30%' },
];

const conditions = [
  {
    type: 'BUY',
    color: '#22c55e',
    items: ['EMA 20 > EMA 50 (uptrend)', 'Price above VWAP', 'RSI > 50 (momentum up)', 'MACD bullish crossover'],
  },
  {
    type: 'SELL',
    color: '#ef4444',
    items: ['EMA 20 < EMA 50 (downtrend)', 'Price below VWAP', 'RSI < 50 (momentum down)', 'MACD bearish crossover'],
  },
];

const scoreBreakdown = [
  { component: 'Trend (EMA)', weight: 30, description: 'EMA 20/50 crossover alignment' },
  { component: 'VWAP', weight: 30, description: 'Price vs VWAP position' },
  { component: 'Momentum (RSI)', weight: 20, description: 'RSI above/below 50 midline' },
  { component: 'MACD', weight: 20, description: 'MACD line vs signal line' },
];

function LineNumbers({ code }) {
  const lines = code.split('\n');
  return (
    <div className="flex" style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: '20px' }}>
      <div className="pr-4 select-none text-slate-600 text-right" style={{ minWidth: 40 }}>
        {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <div className="flex-1 overflow-x-auto">
        <pre className="text-slate-300 whitespace-pre">{code}</pre>
      </div>
    </div>
  );
}

export default function PineScriptPage() {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('code');

  const handleCopy = () => {
    navigator.clipboard.writeText(PINE_SCRIPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: '#0f1629', border: '1px solid #1a2444' }}>
          {[
            { id: 'code', label: 'Pine Script Code' },
            { id: 'guide', label: 'How It Works' },
            { id: 'score', label: 'Confluence Score' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* CODE TAB */}
        {tab === 'code' && (
          <div className="card-dark">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Code2 size={16} className="text-amber-400" />
                <span className="text-sm font-bold text-slate-200">XAUUSD Sniper PRO v2.0 · Pine Script v5</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 hidden sm:block">TradingView compatible</span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.1)',
                    border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.25)'}`,
                    color: copied ? '#22c55e' : '#f59e0b',
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="mb-4 p-3 rounded-lg flex items-start gap-2 text-xs" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <Info size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <span className="text-blue-400/80">
                <strong>How to use:</strong> Copy this code → Open TradingView → Pine Script Editor → Paste → Save → Add to Chart.
                Set the chart to XAUUSD on any timeframe (1H or 4H recommended).
              </span>
            </div>

            {/* Code block */}
            <div
              className="rounded-lg overflow-auto max-h-[520px] p-4"
              style={{ background: '#060b18', border: '1px solid #1a2444' }}
            >
              <LineNumbers code={PINE_SCRIPT.trim()} />
            </div>
          </div>
        )}

        {/* GUIDE TAB */}
        {tab === 'guide' && (
          <div className="space-y-5">
            {/* Indicators */}
            <div className="card-dark">
              <h3 className="text-sm font-bold text-slate-200 mb-4">Indicator Components</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {indicators.map(ind => (
                  <div key={ind.name} className="p-3 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-200">{ind.name}</span>
                      <span className="text-xs font-bold text-amber-400">{ind.weight}</span>
                    </div>
                    <p className="text-xs text-slate-500">{ind.purpose}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Signal conditions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {conditions.map(cond => (
                <div key={cond.type} className="card-dark">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: `${cond.color}22`, color: cond.color, border: `1px solid ${cond.color}44` }}>
                      {cond.type} SIGNAL
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {cond.items.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-400">
                        <ChevronRight size={12} style={{ color: cond.color }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="card-dark">
              <h3 className="text-sm font-bold text-slate-200 mb-3">Advanced Features</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { title: 'Background Zones', desc: 'Green/red background when score ≥ threshold' },
                  { title: 'Signal Labels', desc: 'BUY/SELL labels with confluence score on chart' },
                  { title: 'Alert Conditions', desc: 'TradingView alerts fire when score > 70 and MACD crosses' },
                  { title: 'Score Table', desc: 'Live confluence breakdown table (top-right corner)' },
                  { title: 'VWAP Circles', desc: 'Dotted VWAP line for institutional reference' },
                  { title: 'Minimum Score Filter', desc: 'Configurable — default 70, raise to 80+ for fewer signals' },
                ].map(f => (
                  <div key={f.title} className="p-3 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                    <div className="text-xs font-semibold text-amber-400 mb-1">{f.title}</div>
                    <p className="text-xs text-slate-500">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SCORE TAB */}
        {tab === 'score' && (
          <div className="space-y-5">
            <div className="card-dark">
              <h3 className="text-sm font-bold text-slate-200 mb-1">Confluence Score System (0–100)</h3>
              <p className="text-xs text-slate-500 mb-5">Signals only fire when score &gt; 70 (configurable). Higher = more reliable.</p>

              <div className="space-y-3">
                {scoreBreakdown.map(s => (
                  <div key={s.component}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-300 font-medium">{s.component}</span>
                      <span className="text-amber-400 font-bold">{s.weight}/100</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: '#1a2444' }}>
                      <div className="h-full rounded-full" style={{ width: `${s.weight}%`, background: 'linear-gradient(90deg, #f59e0b, #d97706)' }} />
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{s.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Score thresholds */}
            <div className="card-dark">
              <h3 className="text-sm font-bold text-slate-200 mb-3">Score Thresholds</h3>
              <div className="space-y-2">
                {[
                  { range: '80–100', label: 'High Probability', color: '#22c55e', desc: 'Strong signal — all or nearly all conditions met' },
                  { range: '70–79', label: 'Valid Signal', color: '#84cc16', desc: 'Acceptable — indicator fires signal' },
                  { range: '50–69', label: 'Weak Setup', color: '#f59e0b', desc: 'Partial alignment — no signal generated' },
                  { range: '0–49', label: 'No Trade', color: '#ef4444', desc: 'Poor alignment — conditions not met' },
                ].map(t => (
                  <div key={t.range} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
                    <div className="text-sm font-bold font-mono w-16" style={{ color: t.color }}>{t.range}</div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: t.color }}>{t.label}</div>
                      <div className="text-xs text-slate-500">{t.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
