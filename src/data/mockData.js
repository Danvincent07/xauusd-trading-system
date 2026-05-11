export const CHART_TIMEFRAMES = [
  { value: '15m', label: '15m', intervalMs: 15 * 60 * 1000 },
  { value: '30m', label: '30m', intervalMs: 30 * 60 * 1000 },
  { value: '1h', label: '1h', intervalMs: 60 * 60 * 1000 },
  { value: '4h', label: '4h', intervalMs: 4 * 60 * 60 * 1000 },
  { value: '1d', label: '1d', intervalMs: 24 * 60 * 60 * 1000 },
  { value: '1w', label: '1w', intervalMs: 7 * 24 * 60 * 60 * 1000 },
]

export function getChartTimeframe(timeframe = '1h') {
  return CHART_TIMEFRAMES.find((item) => item.value === timeframe) ?? CHART_TIMEFRAMES[2]
}

// Generate realistic XAUUSD candlestick data
export function generateCandlestickData(bars = 60, basePrice = 3320, timeframe = '1h') {
  const data = [];
  let price = basePrice;
  const now = Date.now();
  const { intervalMs } = getChartTimeframe(timeframe);

  const volatilityMultiplier = {
    '15m': 0.55,
    '30m': 0.7,
    '1h': 1,
    '4h': 1.35,
    '1d': 1.85,
    '1w': 2.6,
  }[timeframe] ?? 1;

  for (let i = bars; i >= 0; i--) {
    const open = price + (Math.random() - 0.5) * 8 * volatilityMultiplier;
    const close = open + (Math.random() - 0.48) * 12 * volatilityMultiplier;
    const high = Math.max(open, close) + Math.random() * 6 * volatilityMultiplier;
    const low = Math.min(open, close) - Math.random() * 6 * volatilityMultiplier;
    const volume = Math.floor(Math.random() * 5000 + 2000);
    data.push({
      time: now - i * intervalMs,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    });
    price = close;
  }
  return data;
}

export const ASSETS = [
  { symbol: 'XAUUSD', name: 'Gold', basePrice: 3320.5, trend: 'BULLISH', change: 1.24, vwapDev: 0.42 },
  { symbol: 'DXY', name: 'US Dollar Index', basePrice: 104.32, trend: 'BEARISH', change: -0.38, vwapDev: -0.21 },
  { symbol: 'XAGUSD', name: 'Silver', basePrice: 32.85, trend: 'BULLISH', change: 0.87, vwapDev: 0.31 },
  { symbol: 'US10Y', name: 'US 10Y Yield', basePrice: 4.48, trend: 'NEUTRAL', change: 0.02, vwapDev: 0.05 },
  { symbol: 'WTIUSD', name: 'WTI Oil', basePrice: 78.42, trend: 'BEARISH', change: -0.65, vwapDev: -0.18 },
];

export const VWAP_DEVIATIONS = [
  { tf: '1H', deviation: 0.42, label: '1 Hour' },
  { tf: '4H', deviation: 0.87, label: '4 Hour' },
  { tf: 'D', deviation: 1.24, label: 'Daily' },
  { tf: 'W', deviation: 2.18, label: 'Weekly' },
];

export const SIGNAL = {
  direction: 'BUY',
  confidence: 82,
  regime: 'Risk-On',
  reasons: [
    { label: 'EMA 20 > EMA 50', weight: 30, passed: true, category: 'Trend' },
    { label: 'Price above VWAP (all TF)', weight: 30, passed: true, category: 'VWAP' },
    { label: 'RSI > 50 (momentum)', weight: 20, passed: true, category: 'Momentum' },
    { label: 'MACD bullish crossover', weight: 20, passed: false, category: 'MACD' },
  ],
};

export const PINE_SCRIPT = `// ============================================================
// XAUUSD SNIPER PRO v2.0 — TradingView Pine Script v5
// Professional Gold Trading Indicator
// ============================================================
//@version=5
indicator("XAUUSD Sniper PRO v2.0", overlay=true, max_bars_back=500)

// ─── INPUTS ──────────────────────────────────────────────
emaFastLen  = input.int(20,  "EMA Fast",  group="EMAs")
emaSlowLen  = input.int(50,  "EMA Slow",  group="EMAs")
rsiLen      = input.int(14,  "RSI Length", group="Momentum")
macdFast    = input.int(12,  "MACD Fast",  group="Momentum")
macdSlow    = input.int(26,  "MACD Slow",  group="Momentum")
macdSig     = input.int(9,   "MACD Signal", group="Momentum")
minScore    = input.int(70,  "Min Confluence Score (0-100)", minval=0, maxval=100, group="Filters")
showBG      = input.bool(true, "Show Background Zones", group="Display")

// ─── INDICATORS ───────────────────────────────────────────
emaFast = ta.ema(close, emaFastLen)
emaSlow = ta.ema(close, emaSlowLen)
rsi     = ta.rsi(close, rsiLen)
[macdLine, signalLine, histLine] = ta.macd(close, macdFast, macdSlow, macdSig)

// VWAP (session-based)
vwapVal = ta.vwap(hlc3)

// ─── CONFLUENCE SCORE ────────────────────────────────────
// Trend (EMA) = 30%
trendScore  = emaFast > emaSlow ? 30 : 0
// VWAP = 30%
vwapScore   = close > vwapVal ? 30 : 0
// RSI Momentum = 20%
rsiScore    = rsi > 50 ? 20 : 0
// MACD = 20%
macdScore   = macdLine > signalLine ? 20 : 0

bullScore   = trendScore + vwapScore + rsiScore + macdScore

// Bearish mirror
bearTrend   = emaFast < emaSlow ? 30 : 0
bearVwap    = close < vwapVal  ? 30 : 0
bearRsi     = rsi < 50         ? 20 : 0
bearMacd    = macdLine < signalLine ? 20 : 0
bearScore   = bearTrend + bearVwap + bearRsi + bearMacd

// ─── SIGNAL CONDITIONS ────────────────────────────────────
macdBullCross = ta.crossover(macdLine, signalLine)
macdBearCross = ta.crossunder(macdLine, signalLine)

buySignal  = bullScore >= minScore and macdBullCross
sellSignal = bearScore >= minScore and macdBearCross

// ─── PLOTS ────────────────────────────────────────────────
plot(emaFast, "EMA 20", color=color.new(color.orange, 0), linewidth=2)
plot(emaSlow, "EMA 50", color=color.new(color.blue,   0), linewidth=2)
plot(vwapVal, "VWAP",   color=color.new(color.fuchsia,0), linewidth=1, style=plot.style_circles)

// Background zones
bullBG = showBG and bullScore >= minScore
bearBG = showBG and bearScore >= minScore
bgcolor(bullBG ? color.new(color.green, 93) : na, title="Bull Zone")
bgcolor(bearBG ? color.new(color.red,   93) : na, title="Bear Zone")

// Buy / Sell labels
plotshape(buySignal,  title="BUY",  style=shape.labelup,   location=location.belowbar,
          color=color.new(color.green, 0), textcolor=color.white, text="BUY\\n" + str.tostring(bullScore), size=size.normal)
plotshape(sellSignal, title="SELL", style=shape.labeldown, location=location.abovebar,
          color=color.new(color.red,   0), textcolor=color.white, text="SELL\\n" + str.tostring(bearScore), size=size.normal)

// ─── CONFLUENCE SCORE TABLE ───────────────────────────────
var table scoreTable = table.new(position.top_right, 3, 6,
          border_width=1, border_color=color.new(color.gray,60),
          bgcolor=color.new(color.black,70))

if barstate.islast
    table.cell(scoreTable, 0, 0, "COMPONENT",  text_color=color.gray,  text_size=size.small)
    table.cell(scoreTable, 1, 0, "BULL",        text_color=color.green, text_size=size.small)
    table.cell(scoreTable, 2, 0, "BEAR",        text_color=color.red,   text_size=size.small)

    table.cell(scoreTable, 0, 1, "Trend (EMA)",  text_color=color.white, text_size=size.small)
    table.cell(scoreTable, 1, 1, str.tostring(trendScore) + "/30", text_color=color.green, text_size=size.small)
    table.cell(scoreTable, 2, 1, str.tostring(bearTrend)  + "/30", text_color=color.red,   text_size=size.small)

    table.cell(scoreTable, 0, 2, "VWAP",        text_color=color.white, text_size=size.small)
    table.cell(scoreTable, 1, 2, str.tostring(vwapScore)  + "/30", text_color=color.green, text_size=size.small)
    table.cell(scoreTable, 2, 2, str.tostring(bearVwap)   + "/30", text_color=color.red,   text_size=size.small)

    table.cell(scoreTable, 0, 3, "RSI",         text_color=color.white, text_size=size.small)
    table.cell(scoreTable, 1, 3, str.tostring(rsiScore)   + "/20", text_color=color.green, text_size=size.small)
    table.cell(scoreTable, 2, 3, str.tostring(bearRsi)    + "/20", text_color=color.red,   text_size=size.small)

    table.cell(scoreTable, 0, 4, "MACD",        text_color=color.white, text_size=size.small)
    table.cell(scoreTable, 1, 4, str.tostring(macdScore)  + "/20", text_color=color.green, text_size=size.small)
    table.cell(scoreTable, 2, 4, str.tostring(bearMacd)   + "/20", text_color=color.red,   text_size=size.small)

    table.cell(scoreTable, 0, 5, "TOTAL",       text_color=color.yellow,text_size=size.small)
    table.cell(scoreTable, 1, 5, str.tostring(bullScore),             text_color=color.green, text_size=size.small)
    table.cell(scoreTable, 2, 5, str.tostring(bearScore),             text_color=color.red,   text_size=size.small)

// ─── ALERTS ───────────────────────────────────────────────
alertcondition(buySignal,  "XAUUSD BUY Signal",  "XAUUSD Sniper BUY — Score: " + str.tostring(bullScore))
alertcondition(sellSignal, "XAUUSD SELL Signal", "XAUUSD Sniper SELL — Score: " + str.tostring(bearScore))
`;
