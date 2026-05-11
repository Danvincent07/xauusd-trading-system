import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, ReferenceArea,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { generateCandlestickData, ASSETS, VWAP_DEVIATIONS, CHART_TIMEFRAMES, getChartTimeframe } from '../data/mockData';
import { calcEMA, calcRSI } from '../utils/calculations';
import { buildScalpSwingAnalysis } from '../utils/sniperSignal';

// ─── CUSTOM CANDLESTICK BAR ────────────────────────────────────────────────────
function CandleBar({ x, y, width, height, open, high, low, close, chartHeight, minVal, range }) {
  if (!open || !close || !high || !low) return null;
  const toY = (val) => chartHeight * (1 - (val - minVal) / range);
  const bullish = close >= open;
  const color = bullish ? '#22c55e' : '#ef4444';
  const bodyTop = toY(Math.max(open, close));
  const bodyBot = toY(Math.min(open, close));
  const bodyH = Math.max(1, bodyBot - bodyTop);
  const wickTop = toY(high);
  const wickBot = toY(low);
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} y1={wickTop} x2={cx} y2={wickBot} stroke={color} strokeWidth={1} />
      <rect x={x + 1} y={bodyTop} width={Math.max(1, width - 2)} height={bodyH}
        fill={color} stroke={color} strokeWidth={0.5} opacity={0.9} />
    </g>
  );
}

// ─── SIGNAL BADGE ─────────────────────────────────────────────────────────────
function SignalBadge({ direction }) {
  const cfg = {
    BUY:      { cls: 'badge-buy',     icon: TrendingUp,   text: 'BUY' },
    SELL:     { cls: 'badge-sell',    icon: TrendingDown, text: 'SELL' },
    'NO TRADE': { cls: 'badge-neutral', icon: Minus,        text: 'NO TRADE' },
  }[direction] || { cls: 'badge-neutral', icon: Minus, text: 'NO TRADE' };
  const Icon = cfg.icon;
  return (
    <span className={`${cfg.cls} flex items-center gap-1`}>
      <Icon size={12} />
      {cfg.text}
    </span>
  );
}

// ─── CONFLUENCE GAUGE ─────────────────────────────────────────────────────────
function ConfluenceGauge({ score }) {
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const deg = (score / 100) * 180;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-16 overflow-hidden">
        <svg viewBox="0 0 120 60" className="w-full h-full">
          {/* Track */}
          <path d="M 10,60 A 50,50 0 0,1 110,60" fill="none" stroke="#1f2937" strokeWidth="10" strokeLinecap="round" />
          {/* Fill */}
          <path
            d="M 10,60 A 50,50 0 0,1 110,60"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(deg / 180) * 157} 157`}
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
          <text x="60" y="56" textAnchor="middle" fontSize="18" fontWeight="bold" fill={color}>{score}</text>
        </svg>
      </div>
      <div className="text-xs text-slate-400">Confluence Score</div>
    </div>
  );
}

// ─── MARKET REGIME BADGE ──────────────────────────────────────────────────────
function RegimeBadge({ regime }) {
  const cfg = {
    'Risk-On':  { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)' },
    'Risk-Off': { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)' },
    'Neutral':  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  }[regime] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' };
  return (
    <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {regime}
    </span>
  );
}

// ─── ASSET ROW ────────────────────────────────────────────────────────────────
function AssetRow({ asset, livePrice, liveChange }) {
  const [price, setPrice] = useState(livePrice ?? asset.basePrice);
  const [dir, setDir] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(livePrice)) {
      return;
    }

    setPrice((previousPrice) => {
      if (Number.isFinite(previousPrice) && previousPrice !== livePrice) {
        setDir(livePrice > previousPrice ? 1 : -1);
      }

      return livePrice;
    });
  }, [livePrice]);

  useEffect(() => {
    if (Number.isFinite(livePrice)) {
      return undefined;
    }

    const id = setInterval(() => {
      const delta = (Math.random() - 0.5) * asset.basePrice * 0.001;
      setPrice(p => {
        setDir(delta > 0 ? 1 : -1);
        return parseFloat((p + delta).toFixed(asset.symbol === 'US10Y' ? 3 : 2));
      });
    }, 2000 + Math.random() * 2000);
    return () => clearInterval(id);
  }, [asset, livePrice]);

  const TrendIcon = asset.trend === 'BULLISH' ? TrendingUp : asset.trend === 'BEARISH' ? TrendingDown : Minus;
  const trendColor = asset.trend === 'BULLISH' ? 'text-green-400' : asset.trend === 'BEARISH' ? 'text-red-400' : 'text-amber-400';

  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid #1a2444' }}>
      <div className="flex items-center gap-2">
        <TrendIcon size={14} className={trendColor} />
        <div>
          <div className="text-sm font-semibold text-slate-200">{asset.symbol}</div>
          <div className="text-xs text-slate-500">{asset.name}</div>
        </div>
      </div>
      <div className="text-right">
        <div className={`font-mono text-sm font-bold transition-colors duration-300 ${dir > 0 ? 'text-green-400' : dir < 0 ? 'text-red-400' : 'text-slate-200'}`}>
          {price.toFixed(asset.symbol === 'US10Y' ? 3 : 2)}
        </div>
        <div className={`text-xs ${(liveChange ?? asset.change) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {(liveChange ?? asset.change) >= 0 ? '+' : ''}{(liveChange ?? asset.change).toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

// ─── VWAP DEVIATION BAR ───────────────────────────────────────────────────────
function VWAPBar({ tf, deviation, label }) {
  const abs = Math.abs(deviation);
  const positive = deviation >= 0;
  const color = positive ? '#22c55e' : '#ef4444';
  const width = Math.min(abs * 30, 100);
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-8 text-xs font-bold text-amber-400">{tf}</div>
      <div className="flex-1 relative h-5 rounded overflow-hidden" style={{ background: '#1a2444' }}>
        <div
          className="absolute top-0 h-full rounded transition-all duration-700"
          style={{
            width: `${width}%`,
            background: color,
            opacity: 0.7,
            left: positive ? '50%' : `${50 - width}%`,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-xs font-mono font-semibold" style={{ color }}>
          {deviation > 0 ? '+' : ''}{deviation.toFixed(2)}%
        </div>
        <div className="absolute left-1/2 top-0 h-full w-px" style={{ background: '#374151' }} />
      </div>
      <div className="w-16 text-xs text-slate-500 text-right">{label}</div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function Dashboard({ livePrice, priceChange, lastUpdated, priceHistory = [] }) {
  const [chartData, setChartData] = useState([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: 29 });
  const [dragSelection, setDragSelection] = useState({ start: null, end: null, isDragging: false });
  const chartRef = useRef(null);
  const hasUserAdjustedRange = useRef(false);

  const buildLatestRange = (dataLength) => {
    const windowSize = Math.min(30, dataLength)
    return {
      startIndex: Math.max(0, dataLength - windowSize),
      endIndex: Math.max(0, dataLength - 1),
    }
  }

  useEffect(() => {
    const raw = generateCandlestickData(60, livePrice || 3320, selectedTimeframe);
    const closes = raw.map(d => d.close);
    const ema20 = calcEMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const rsiVals = calcRSI(closes);
    const vwap = closes.reduce((a, b) => a + b, 0) / closes.length;
    const timeframe = getChartTimeframe(selectedTimeframe);

    const timeLabelFormatters = {
      '15m': { hour: '2-digit', minute: '2-digit' },
      '30m': { hour: '2-digit', minute: '2-digit' },
      '1h': { hour: '2-digit', minute: '2-digit' },
      '4h': { month: 'short', day: 'numeric', hour: '2-digit' },
      '1d': { month: 'short', day: 'numeric' },
      '1w': { month: 'short', day: 'numeric' },
    };

    setChartData(raw.map((d, i) => ({
      ...d,
      ema20: ema20[i],
      ema50: ema50[i],
      rsi: rsiVals[i],
      vwap: parseFloat(vwap.toFixed(2)),
      timeLabel: new Date(d.time).toLocaleString('en', timeLabelFormatters[timeframe.value]),
    })));
  }, [livePrice, selectedTimeframe]);

  useEffect(() => {
    if (!chartData.length) {
      return
    }

    hasUserAdjustedRange.current = false
    setVisibleRange(buildLatestRange(chartData.length))
  }, [selectedTimeframe]);

  useEffect(() => {
    if (!chartData.length) {
      return
    }

    const rangeOutOfBounds = visibleRange.endIndex >= chartData.length
      || visibleRange.startIndex < 0
      || visibleRange.startIndex > visibleRange.endIndex

    if (rangeOutOfBounds || (!hasUserAdjustedRange.current && visibleRange.endIndex < chartData.length - 1)) {
      setVisibleRange(buildLatestRange(chartData.length))
    }
  }, [chartData])

  const minVal = chartData.length ? Math.min(...chartData.map(d => d.low)) - 5 : 3280;
  const maxVal = chartData.length ? Math.max(...chartData.map(d => d.high)) + 5 : 3360;
  const range = maxVal - minVal;
  const visibleChartData = chartData.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  const visibleWindowLabel = visibleChartData.length
    ? `${visibleChartData[0].timeLabel} -> ${visibleChartData.at(-1).timeLabel}`
    : 'Waiting for chart data'
  const isViewingLive = chartData.length > 0 && visibleRange.endIndex >= chartData.length - 1
  const dragStartIndex = Number.isFinite(dragSelection.start) ? dragSelection.start : null
  const dragEndIndex = Number.isFinite(dragSelection.end) ? dragSelection.end : null
  const hasDragArea = dragStartIndex !== null && dragEndIndex !== null && visibleChartData.length > 0
  const dragAreaStartLabel = hasDragArea ? visibleChartData[Math.min(dragStartIndex, dragEndIndex)]?.timeLabel : null
  const dragAreaEndLabel = hasDragArea ? visibleChartData[Math.max(dragStartIndex, dragEndIndex)]?.timeLabel : null

  const marketInsight = useMemo(() => {
    if (visibleChartData.length < 3) {
      return {
        headline: 'Collecting live XAUUSD movement',
        bias: 'Neutral',
        detail: 'Waiting for enough live candles to map structure and momentum.',
      };
    }

    const latest = visibleChartData.at(-1);
    const previous = visibleChartData.at(-2);
    const windowStart = visibleChartData[0];
    const priceDelta = latest.close - windowStart.close;
    const momentumDelta = latest.close - previous.close;
    const aboveVwap = latest.close >= latest.vwap;
    const emaStackBullish = latest.ema20 >= latest.ema50;
    const rsiState = latest.rsi >= 60 ? 'strong' : latest.rsi <= 40 ? 'weak' : 'balanced';

    if (priceDelta > 0 && emaStackBullish && aboveVwap) {
      return {
        headline: 'Bullish continuation pressure',
        bias: 'Bullish',
        detail: `Price is ${priceDelta.toFixed(2)} above the visible-window open, holding above VWAP with ${rsiState} momentum. Pullbacks may attract buyers if structure holds.`,
      };
    }

    if (priceDelta < 0 && !emaStackBullish && !aboveVwap) {
      return {
        headline: 'Bearish continuation pressure',
        bias: 'Bearish',
        detail: `Price is ${Math.abs(priceDelta).toFixed(2)} below the visible-window open, trading under VWAP with ${rsiState} momentum. Failed bounces may expose fresh sell entries.`,
      };
    }

    return {
      headline: 'Range or transition behavior',
      bias: 'Neutral',
      detail: `Recent move is ${momentumDelta >= 0 ? 'up' : 'down'} ${Math.abs(momentumDelta).toFixed(2)} on the latest candle, but trend signals are mixed. Watch for a VWAP reclaim or rejection for clearer direction.`,
    };
  }, [visibleChartData]);

  const intradaySignal = useMemo(
    () => buildScalpSwingAnalysis(priceHistory, livePrice),
    [priceHistory, livePrice],
  );

  // Intraday confidence: SMA20/50, RSI14, VWAP, MACD + structure events
  const SIGNAL = useMemo(() => {
    if (!intradaySignal.ready) {
      // Warm-up: compute quick VWAP from available history so direction is never stale
      const rawPrices = priceHistory.map((p) => p.price).filter(Number.isFinite);
      const quickVWAP = rawPrices.length
        ? rawPrices.reduce((a, b) => a + b, 0) / rawPrices.length
        : livePrice;
      const dir = livePrice > quickVWAP ? 'BUY' : 'SELL';
      const warmConf = Math.min(35, Math.round((rawPrices.length / 35) * 35));
      return {
        direction: dir,
        confidence: warmConf,
        regime: 'Neutral',
        reasons: [],
      };
    }

    const ind = intradaySignal.indicators;
    const scalp = intradaySignal.scalping;
    const swing = intradaySignal.swing;

    // Direction: VWAP is the primary signal — below VWAP = SELL, above = BUY
    const dir = ind.aboveVWAP ? 'BUY' : 'SELL';

    const reasons = [
      { label: 'Price above VWAP',              weight: 20, passed: ind.aboveVWAP,                                                    category: 'Bias' },
      { label: 'SMA 20 above SMA 50 (uptrend)', weight: 20, passed: ind.sma20 !== null && ind.sma50 !== null && ind.sma20 > ind.sma50, category: 'Trend' },
      { label: 'RSI in trade zone (30–70)',      weight: 15, passed: ind.rsi14 !== null && ind.rsi14 >= 30 && ind.rsi14 <= 70,        category: 'Momentum' },
      { label: 'RSI not overbought/oversold',   weight: 10, passed: ind.rsi14 !== null && ind.rsi14 > 35 && ind.rsi14 < 65,           category: 'Momentum' },
      { label: 'MACD aligned with bias',        weight: 25, passed: dir === 'BUY' ? ind.macdHist > 0 : ind.macdHist < 0,             category: 'MACD' },
      { label: 'Scalp entry conditions met',    weight:  5, passed: scalp.active && scalp.direction === dir,                          category: 'Entry' },
      { label: 'Swing entry conditions met',    weight:  5, passed: swing.active && swing.direction === dir,                          category: 'Swing' },
    ];

    const totalWeight = reasons.reduce((s, r) => s + r.weight, 0);
    const passedWeight = reasons.filter((r) => r.passed).reduce((s, r) => s + r.weight, 0);
    const confidence = Math.round((passedWeight / totalWeight) * 100);
    const regime = confidence >= 65 ? (dir === 'BUY' ? 'Risk-On' : 'Risk-Off') : 'Neutral';

    return { direction: dir, confidence, regime, reasons };
  }, [intradaySignal, priceChange]);

  const reasonIcons = { true: CheckCircle2, false: XCircle };
  const reasonColors = { true: 'text-green-400', false: 'text-red-400' };

  return (
    <div className="p-4 lg:p-6 space-y-5">

      {/* ── TOP STAT ROW ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Signal', value: <SignalBadge direction={SIGNAL.direction} />, sub: 'Current bias' },
          { label: 'Confidence', value: <span className="text-2xl font-bold text-green-400">{SIGNAL.confidence}%</span>, sub: 'Score > 75 = alert' },
          { label: 'Market Regime', value: <RegimeBadge regime={SIGNAL.regime} />, sub: 'Macro environment' },
          {
            label: 'XAU/USD Price',
            value: <span className="text-2xl font-bold text-amber-400 font-mono">{livePrice?.toFixed(2)}</span>,
            sub: lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Waiting for live quote',
          },
        ].map(({ label, value, sub }) => (
          <div key={label} className="card-dark">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <div className="my-1">{value}</div>
            <div className="text-xs text-slate-600">{sub}</div>
          </div>
        ))}
      </div>

      {/* ── MAIN CHART + SIDE PANELS ─────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* CANDLESTICK CHART */}
        <div className="xl:col-span-2 card-dark">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-200">XAU/USD · {getChartTimeframe(selectedTimeframe).label} Chart</h2>
              <p className="text-xs text-slate-500">EMA 20 · EMA 50 · VWAP · updates with live XAUUSD feed</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <select
                value={selectedTimeframe}
                onChange={(event) => setSelectedTimeframe(event.target.value)}
                className="px-3 py-2 rounded-lg text-slate-200"
                style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}
              >
                {CHART_TIMEFRAMES.map((timeframe) => (
                  <option key={timeframe.value} value={timeframe.value}>
                    {timeframe.label}
                  </option>
                ))}
              </select>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block" />EMA 20</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block" />EMA 50</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-fuchsia-400 inline-block" />VWAP</span>
            </div>
          </div>

          <div className="mb-4 p-3 rounded-xl" style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="text-sm font-semibold text-slate-200">Possible Market Movement</div>
              <div className={`text-xs font-semibold ${marketInsight.bias === 'Bullish' ? 'text-green-400' : marketInsight.bias === 'Bearish' ? 'text-red-400' : 'text-amber-400'}`}>
                {marketInsight.bias}
              </div>
            </div>
            <div className="text-xs text-slate-300 mb-1">{marketInsight.headline}</div>
            <div className="text-xs text-slate-500">{marketInsight.detail}</div>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart
              data={visibleChartData}
              margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
              onMouseDown={(state) => {
                if (typeof state?.activeTooltipIndex !== 'number') {
                  return
                }

                setDragSelection({
                  start: state.activeTooltipIndex,
                  end: state.activeTooltipIndex,
                  isDragging: true,
                })
              }}
              onMouseMove={(state) => {
                if (!dragSelection.isDragging || typeof state?.activeTooltipIndex !== 'number') {
                  return
                }

                setDragSelection((previous) => ({
                  ...previous,
                  end: state.activeTooltipIndex,
                }))
              }}
              onMouseUp={() => {
                if (!dragSelection.isDragging || dragStartIndex === null || dragEndIndex === null) {
                  return
                }

                const minVisibleIndex = Math.min(dragStartIndex, dragEndIndex)
                const maxVisibleIndex = Math.max(dragStartIndex, dragEndIndex)

                if (maxVisibleIndex - minVisibleIndex >= 2) {
                  hasUserAdjustedRange.current = true
                  setVisibleRange({
                    startIndex: visibleRange.startIndex + minVisibleIndex,
                    endIndex: visibleRange.startIndex + maxVisibleIndex,
                  })
                }

                setDragSelection({ start: null, end: null, isDragging: false })
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2444" />
              <XAxis dataKey="timeLabel" tick={{ fontSize: 10, fill: '#4b5563' }} tickLine={false} interval={7} />
              <YAxis domain={[minVal, maxVal]} tick={{ fontSize: 10, fill: '#4b5563' }} tickLine={false} width={55} tickFormatter={v => v.toFixed(0)} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
                formatter={(val, name) => [typeof val === 'number' ? val.toFixed(2) : val, name]}
              />
              {/* VWAP */}
              <Line type="monotone" dataKey="vwap" stroke="#c084fc" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              {/* EMA lines */}
              <Line type="monotone" dataKey="ema20" stroke="#fb923c" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ema50" stroke="#60a5fa" strokeWidth={2} dot={false} />
              {/* Price as area */}
              <Area type="monotone" dataKey="close" stroke="#f59e0b" strokeWidth={2} fill="rgba(245,158,11,0.05)" dot={false} />
              {hasDragArea && dragAreaStartLabel && dragAreaEndLabel && (
                <ReferenceArea
                  x1={dragAreaStartLabel}
                  x2={dragAreaEndLabel}
                  fill="rgba(245,158,11,0.15)"
                  strokeOpacity={0}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>Drag directly on the market chart to zoom into a specific movement range.</span>
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-1 rounded-md text-[11px] font-semibold"
                  style={{
                    color: isViewingLive ? '#22c55e' : '#f59e0b',
                    background: isViewingLive ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
                    border: isViewingLive ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(245,158,11,0.25)',
                  }}
                >
                  Viewing: {isViewingLive ? 'Live' : 'Historical'}
                </span>
                <span>{visibleChartData.length} candles visible • {visibleWindowLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    hasUserAdjustedRange.current = false
                    setVisibleRange(buildLatestRange(chartData.length))
                  }}
                  className="px-2 py-1 rounded-md text-[11px] text-slate-300"
                  style={{ background: '#0a0e1a', border: '1px solid #1a2444' }}
                >
                  Jump to current
                </button>
              </div>
            </div>
            <div className="text-[11px] text-slate-600">
              Tip: click-drag across the main chart candles to focus the selected range and refresh movement insights.
            </div>
          </div>

          {/* RSI sub-chart */}
          <div className="mt-3" style={{ borderTop: '1px solid #1a2444', paddingTop: 12 }}>
            <div className="text-xs text-slate-500 mb-1">RSI (14)</div>
            <ResponsiveContainer width="100%" height={60}>
              <ComposedChart data={visibleChartData} margin={{ top: 2, right: 5, bottom: 2, left: 5 }}>
                <XAxis hide />
                <YAxis domain={[0, 100]} hide />
                <CartesianGrid stroke="#1a2444" strokeDasharray="3 3" />
                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine y={50} stroke="#374151" strokeDasharray="2 2" strokeWidth={1} />
                <Line type="monotone" dataKey="rsi" stroke="#a78bfa" strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RIGHT SIDE PANELS */}
        <div className="space-y-4">

          {/* Signal Engine */}
          <div className="card-dark">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Signal Engine</h3>
            <div className="flex items-center justify-between mb-3">
              <SignalBadge direction={SIGNAL.direction} />
              <ConfluenceGauge score={SIGNAL.confidence} />
            </div>
            <div className="space-y-1.5">
              {SIGNAL.reasons.map((r) => {
                const Icon = reasonIcons[r.passed];
                return (
                  <div key={r.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Icon size={12} className={reasonColors[r.passed]} />
                      <span className="text-slate-400">{r.label}</span>
                    </div>
                    <span className="text-slate-500">{r.weight}pts</span>
                  </div>
                );
              })}
            </div>
            {SIGNAL.confidence > 75 && (
              <div className="mt-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-400" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={12} />
                Alert: Confidence &gt; 75 — Check entry
              </div>
            )}
          </div>

          {/* Market Regime */}
          <div className="card-dark">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Market Regime</h3>
            <RegimeBadge regime={SIGNAL.regime} />
            <p className="text-xs text-slate-500 mt-2">
              {SIGNAL.regime === 'Risk-On' && 'Safe-haven demand moderate. Gold supported by USD weakness.'}
              {SIGNAL.regime === 'Risk-Off' && 'Flight-to-safety in progress. Gold in high demand.'}
              {SIGNAL.regime === 'Neutral' && 'Mixed signals. Wait for clearer regime.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Multi-Asset Panel */}
        <div className="card-dark">
          <h3 className="text-sm font-bold text-slate-200 mb-3">Multi-Asset Panel</h3>
          {ASSETS.map(a => (
            <AssetRow
              key={a.symbol}
              asset={a}
              livePrice={a.symbol === 'XAUUSD' ? livePrice : undefined}
              liveChange={a.symbol === 'XAUUSD' ? priceChange : undefined}
            />
          ))}
        </div>

        {/* VWAP Deviation */}
        <div className="card-dark">
          <h3 className="text-sm font-bold text-slate-200 mb-1">VWAP Deviation · XAUUSD</h3>
          <p className="text-xs text-slate-500 mb-4">
            Formula: (Price − VWAP) / VWAP × 100
          </p>
          {VWAP_DEVIATIONS.map(v => <VWAPBar key={v.tf} {...v} />)}
          <div className="mt-3 pt-3 text-xs text-slate-500" style={{ borderTop: '1px solid #1a2444' }}>
            <span className="text-green-400">Positive</span> = price above VWAP (bullish) ·&nbsp;
            <span className="text-red-400">Negative</span> = price below VWAP (bearish)
          </div>
        </div>
      </div>
    </div>
  );
}
