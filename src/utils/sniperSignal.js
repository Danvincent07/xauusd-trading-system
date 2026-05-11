export const requiredCheckIds = [
  'no_chop',
  'no_news',
  'bias',
  'tf_1h',
  'tf_4h',
  'tf_daily',
  'vwap_1h',
  'vwap_4h',
  'vwap_daily',
  'liq_sweep',
  'bos',
  'retest',
  'rsi_conf',
  'macd_conf',
  'sl_defined',
  'rr_check',
  'inval_struct',
  'inval_vwap',
]

function findRangeStats(prices) {
  if (!prices.length) {
    return {
      high: null,
      low: null,
      secondHigh: null,
      secondLow: null,
    }
  }

  const sortedDescending = [...prices].sort((left, right) => right - left)
  const sortedAscending = [...prices].sort((left, right) => left - right)

  return {
    high: sortedDescending[0] ?? null,
    low: sortedAscending[0] ?? null,
    secondHigh: sortedDescending[1] ?? sortedDescending[0] ?? null,
    secondLow: sortedAscending[1] ?? sortedAscending[0] ?? null,
  }
}

function isNearLevel(first, second, tolerancePercent = 0.05) {
  if (!Number.isFinite(first) || !Number.isFinite(second) || first === 0) {
    return false
  }

  return Math.abs(((first - second) / first) * 100) <= tolerancePercent
}

export function buildAutoChecks(livePrice, priceChange, priceHistory = []) {
  const momentum = Number.isFinite(priceChange) ? priceChange : 0
  const prices = priceHistory
    .map((point) => point.price)
    .filter((value) => Number.isFinite(value))
  const latestPrice = prices.at(-1) ?? livePrice
  const recentWindow = prices.slice(-8)
  const trendWindow = prices.slice(-20)
  const structureWindow = prices.slice(-80)
  const anchorPrice = trendWindow[0] ?? latestPrice
  const intrabarMove = recentWindow.length > 1 ? recentWindow.at(-1) - recentWindow[0] : 0
  const trendMove = Number.isFinite(anchorPrice) && anchorPrice !== 0
    ? ((latestPrice - anchorPrice) / anchorPrice) * 100
    : momentum
  const averagePrice = trendWindow.length
    ? trendWindow.reduce((sum, value) => sum + value, 0) / trendWindow.length
    : latestPrice
  const variance = trendWindow.length
    ? trendWindow.reduce((sum, value) => sum + (value - averagePrice) ** 2, 0) / trendWindow.length
    : 0
  const volatilityScore = averagePrice ? Math.sqrt(variance) / averagePrice * 100 : 0

  const hasVolatility = Math.abs(momentum) >= 0.08 || volatilityScore >= 0.05
  const bullishBias = trendMove >= 0.06
  const bearishBias = trendMove <= -0.06
  const hasBias = bullishBias || bearishBias

  const trendStrength = Math.min(Math.max(Math.abs(trendMove), Math.abs(momentum)), 1.2)
  const strongTrend = trendStrength >= 0.2
  const trendAligned = hasBias && hasVolatility
  const vwapDistance = averagePrice ? ((latestPrice - averagePrice) / averagePrice) * 100 : 0
  const directionMatchesVwap = bullishBias ? vwapDistance >= -0.03 : bearishBias ? vwapDistance <= 0.03 : false

  const structureStats = findRangeStats(structureWindow)
  const priorStructureStats = findRangeStats(structureWindow.slice(0, -1))
  const previousPrice = prices.at(-2) ?? latestPrice
  const structureThreshold = latestPrice ? Math.max(latestPrice * 0.0002, 0.5) : 0.5
  const equalHighsDetected = isNearLevel(structureStats.high, structureStats.secondHigh)
  const equalLowsDetected = isNearLevel(structureStats.low, structureStats.secondLow)
  const brokeAboveRange = Number.isFinite(priorStructureStats.high) && latestPrice > priorStructureStats.high + structureThreshold
  const brokeBelowRange = Number.isFinite(priorStructureStats.low) && latestPrice < priorStructureStats.low - structureThreshold
  const sweptHigh = Number.isFinite(priorStructureStats.high)
    && recentWindow.length >= 3
    && recentWindow.some((price) => price > priorStructureStats.high + structureThreshold)
    && latestPrice < priorStructureStats.high
  const sweptLow = Number.isFinite(priorStructureStats.low)
    && recentWindow.length >= 3
    && recentWindow.some((price) => price < priorStructureStats.low - structureThreshold)
    && latestPrice > priorStructureStats.low
  const liquiditySweepDirection = sweptHigh ? 'SELL' : sweptLow ? 'BUY' : 'NONE'
  const liquiditySweepDetected = sweptHigh || sweptLow

  // BOS is direction-independent: detect which side broke
  const structureBreak = brokeAboveRange || brokeBelowRange
  const bosDirection = brokeAboveRange ? 'BUY' : brokeBelowRange ? 'SELL' : 'NONE'

  // CHoCH: price crosses the rolling average with a clear bias
  const chochDetected =
    (bullishBias && previousPrice < averagePrice && latestPrice > averagePrice) ||
    (bearishBias && previousPrice > averagePrice && latestPrice < averagePrice)
  const chochDirection = chochDetected
    ? (latestPrice > averagePrice ? 'BUY' : 'SELL')
    : 'NONE'

  // Pullback/retest after BOS: price returns toward the broken level
  const pullbackTol = structureThreshold * 6
  const pullbackAfterBullBOS = brokeAboveRange &&
    Number.isFinite(priorStructureStats.high) &&
    latestPrice <= priorStructureStats.high + pullbackTol &&
    latestPrice >= priorStructureStats.high - pullbackTol
  const pullbackAfterBearBOS = brokeBelowRange &&
    Number.isFinite(priorStructureStats.low) &&
    latestPrice >= priorStructureStats.low - pullbackTol &&
    latestPrice <= priorStructureStats.low + pullbackTol
  const pullbackDetected = pullbackAfterBullBOS || pullbackAfterBearBOS
  const pullbackDirection = pullbackAfterBullBOS ? 'BUY' : pullbackAfterBearBOS ? 'SELL' : 'NONE'

  // ── Signal direction priority: CHoCH > BOS > Sweep > Pullback > Trend ──────
  let direction
  let signalSource
  if (chochDetected && chochDirection !== 'NONE') {
    direction = chochDirection
    signalSource = 'CHoCH'
  } else if (structureBreak && bosDirection !== 'NONE') {
    direction = bosDirection
    signalSource = 'BOS'
  } else if (liquiditySweepDetected && liquiditySweepDirection !== 'NONE') {
    direction = liquiditySweepDirection
    signalSource = 'Liquidity Sweep'
  } else if (pullbackDetected && pullbackDirection !== 'NONE') {
    direction = pullbackDirection
    signalSource = 'Pullback'
  } else if (hasBias) {
    direction = bullishBias ? 'BUY' : 'SELL'
    signalSource = 'Trend Bias'
  } else {
    direction = 'WAIT'
    signalSource = 'None'
  }

  const vwapTrendAligned = trendAligned && directionMatchesVwap
  const sweepDetected = liquiditySweepDetected || trendStrength >= 0.16 || Math.abs(intrabarMove) >= 2

  // Retest: price near the broken structure level after BOS, or near VWAP in trend
  const retestDetected =
    pullbackDetected ||
    (trendStrength >= 0.12 && trendStrength <= 0.95 && Math.abs(vwapDistance) <= 0.2)

  const rsiMomentumAligned = trendStrength >= 0.16 && hasBias
  const macdMomentumAligned = trendStrength >= 0.16 && hasBias

  const stopDistance = Number.isFinite(livePrice)
    ? Math.max(4, livePrice * 0.0012 + Math.max(Math.abs(momentum), Math.abs(trendMove)) * 1.5)
    : 0

  const entry = Number.isFinite(livePrice) ? parseFloat(livePrice.toFixed(2)) : null
  const stopLoss = Number.isFinite(livePrice)
    ? parseFloat((direction === 'BUY' ? livePrice - stopDistance : livePrice + stopDistance).toFixed(2))
    : null

  const checks = {
    no_chop: hasVolatility,
    no_news: true,
    bias: hasBias,
    tf_1h: trendAligned,
    tf_4h: trendAligned && trendStrength >= 0.14,
    tf_daily: trendAligned && trendStrength >= 0.18,
    vwap_1h: vwapTrendAligned,
    vwap_4h: vwapTrendAligned,
    vwap_daily: vwapTrendAligned && Math.abs(vwapDistance) <= 0.35,
    vwap_weekly: vwapTrendAligned,
    equal_highs: equalHighsDetected || equalLowsDetected,
    liq_sweep: sweepDetected,
    bos: structureBreak,
    choch: chochDetected,
    retest: retestDetected,
    rsi_conf: rsiMomentumAligned,
    macd_conf: macdMomentumAligned,
    candle_conf: trendStrength >= 0.18,
    sl_defined: stopDistance > 0,
    rr_check: stopDistance > 0,
    inval_struct: true,
    inval_vwap: true,
    inval_dxy: true,
  }

  const passedRequired = requiredCheckIds.filter((id) => checks[id]).length
  const confidence = Math.round((passedRequired / requiredCheckIds.length) * 100)
  const qualified = direction !== 'WAIT' && confidence > 50

  return {
    checks,
    confidence,
    direction,
    signalSource,
    entry,
    qualified,
    structureScan: {
      equalHighsDetected,
      equalLowsDetected,
      liquiditySweepDetected,
      liquiditySweepDirection,
      structureBreak,
      bosDirection,
      chochDetected,
      chochDirection,
      pullbackDetected,
      pullbackDirection,
      rangeHigh: priorStructureStats.high,
      rangeLow: priorStructureStats.low,
    },
    stopLoss,
    stopDistance: parseFloat(stopDistance.toFixed(2)),
  }
}

// ─── Indicator-based Scalp & Swing Analysis ──────────────────────────────────

function computeSMA(prices, period) {
  if (prices.length < period) return null
  let sum = 0
  for (let i = prices.length - period; i < prices.length; i++) sum += prices[i]
  return sum / period
}

function computeEMASeries(prices, period) {
  const result = new Array(prices.length).fill(NaN)
  if (prices.length < period) return result
  const k = 2.0 / (period + 1)
  let seed = 0
  for (let i = 0; i < period; i++) seed += prices[i]
  let ema = seed / period
  result[period - 1] = ema
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * k + ema
    result[i] = ema
  }
  return result
}

function computeRSI14(prices) {
  const period = 14
  if (prices.length < period + 1) return null
  let gain = 0
  let loss = 0
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1]
    if (change >= 0) gain += change
    else loss -= change
  }
  const avgGain = gain / period
  const avgLoss = loss / period
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

export function buildScalpSwingAnalysis(priceHistory, livePrice) {
  const prices = priceHistory
    .map((p) => p.price)
    .filter((v) => Number.isFinite(v))

  const EMPTY = {
    ready: false,
    indicators: null,
    scalping: { active: false, direction: 'NONE', entry: null, stopLoss: null, takeProfit: null, reasons: [], missing: [], watchingFor: null, confidence: 0, highProbability: false, passedCount: 0, totalCount: 0, ictStatus: 'WAITING FOR SETUP' },
    swing:    { active: false, direction: 'NONE', entry: null, stopLoss: null, takeProfit: null, reasons: [], missing: [], watchingFor: null, confidence: 0, highProbability: false, passedCount: 0, totalCount: 0, ictStatus: 'WAITING FOR SETUP' },
  }

  if (prices.length < 35) return EMPTY

  const n = prices.length
  const current = prices[n - 1]

  const sma20 = computeSMA(prices, 20)
  const sma50 = computeSMA(prices, 50)
  const rsi14 = computeRSI14(prices)

  // VWAP: rolling session price average (no volume in tick data)
  const sessionWindow = prices.slice(-78)
  const vwap = sessionWindow.reduce((a, b) => a + b, 0) / sessionWindow.length

  // MACD
  const ema12 = computeEMASeries(prices, 12)
  const ema26 = computeEMASeries(prices, 26)
  const macdLine = prices.map((_, i) =>
    !Number.isNaN(ema12[i]) && !Number.isNaN(ema26[i]) ? ema12[i] - ema26[i] : NaN,
  )
  const macdValid = macdLine.filter((v) => !Number.isNaN(v))
  const sigValid = computeEMASeries(macdValid, 9)
  let si = 0
  const signalLine = macdLine.map((v) => (Number.isNaN(v) ? NaN : sigValid[si++] ?? NaN))

  const macdCurrent = macdLine[n - 1]
  const macdPrev = macdLine[n - 2] ?? NaN
  const sigCurrent = signalLine[n - 1]
  const sigPrev = signalLine[n - 2] ?? NaN
  const macdHist =
    Number.isNaN(macdCurrent) || Number.isNaN(sigCurrent) ? 0 : macdCurrent - sigCurrent
  const macdBullCross =
    !Number.isNaN(macdPrev) && !Number.isNaN(sigPrev) && macdPrev <= sigPrev && macdCurrent > sigCurrent
  const macdBearCross =
    !Number.isNaN(macdPrev) && !Number.isNaN(sigPrev) && macdPrev >= sigPrev && macdCurrent < sigCurrent
  const macdBullish =
    !Number.isNaN(macdCurrent) && !Number.isNaN(sigCurrent) && macdCurrent > sigCurrent
  const macdBearish =
    !Number.isNaN(macdCurrent) && !Number.isNaN(sigCurrent) && macdCurrent < sigCurrent

  // Price structure levels
  const recent8  = prices.slice(-8)
  const recent24 = prices.slice(-24)
  const structureWindow = prices.slice(-80)
  const recentLow  = Math.min(...recent8)
  const recentHigh = Math.max(...recent8)
  const swingLow   = Math.min(...recent24)
  const swingHigh  = Math.max(...recent24)

  // ── ICT Condition Detection ──────────────────────────────────────────────

  // Displacement: strong candle >= 3× minimum move
  const tick3Ago  = prices[Math.max(0, n - 4)]
  const minMove   = current * 0.00008
  const strongMove = current * 0.00025 // ~3× minMove for displacement
  const bullishDisplacement = current > tick3Ago && current - tick3Ago >= strongMove
  const bearishDisplacement = current < tick3Ago && tick3Ago - current >= strongMove

  // Weaker candle confirmation (still directional but not displacement-strength)
  const bullishCandle = current > tick3Ago && current - tick3Ago >= minMove
  const bearishCandle = current < tick3Ago && tick3Ago - current >= minMove

  // Liquidity sweep: price wicked above prior high or below prior low and returned
  const structureStats      = { high: Math.max(...structureWindow.slice(0, -1)), low: Math.min(...structureWindow.slice(0, -1)) }
  const structureThreshold  = Math.max(current * 0.0002, 0.5)
  const sweptHigh = recent8.some((p) => p > structureStats.high + structureThreshold) && current < structureStats.high
  const sweptLow  = recent8.some((p) => p < structureStats.low  - structureThreshold) && current > structureStats.low
  const liquiditySweepBullish = sweptLow   // swept lows → bullish reversal
  const liquiditySweepBearish = sweptHigh  // swept highs → bearish reversal
  const liquiditySweepDetected = sweptHigh || sweptLow

  // MSS (Market Structure Shift) — BOS in opposite direction after sweep
  // Bullish MSS: after sweeping lows, price breaks above a prior swing high
  // Bearish MSS: after sweeping highs, price breaks below a prior swing low
  const priorHigh = Math.max(...prices.slice(-20, -8))
  const priorLow  = Math.min(...prices.slice(-20, -8))
  const bullishMSS = liquiditySweepBullish && current > priorHigh + structureThreshold
  const bearishMSS = liquiditySweepBearish && current < priorLow  - structureThreshold

  // OB/FVG Retracement: after displacement, price pulls back into the zone
  const pullbackTol = Math.max(3, current * 0.0006)
  const displacementHigh = Math.max(...recent8)
  const displacementLow  = Math.min(...recent8)
  const retracedIntoOB_Buy  = bullishMSS && current <= displacementHigh - pullbackTol * 0.3 && current >= displacementLow - pullbackTol
  const retracedIntoOB_Sell = bearishMSS && current >= displacementLow  + pullbackTol * 0.3 && current <= displacementHigh + pullbackTol

  // Session active: London (07:00–12:00 UTC) or NY AM (12:00–17:00 UTC)
  const utcHour = new Date().getUTCHours()
  const sessionActive = (utcHour >= 7 && utcHour < 17)

  // Near-level tolerance
  const tol      = Math.max(2.0, current * 0.00055)
  const nearVWAP  = Math.abs(current - vwap) <= tol
  const nearSMA20 = sma20 !== null && Math.abs(current - sma20) <= tol
  const aboveVWAP = current > vwap
  const belowVWAP = current < vwap
  const bias  = aboveVWAP ? 'Bullish' : belowVWAP ? 'Bearish' : 'Neutral'
  const trend = sma20 !== null && sma50 !== null
    ? sma20 > sma50 ? 'Uptrend' : sma20 < sma50 ? 'Downtrend' : 'Flat'
    : 'Flat'

  // ── ICT BUY conditions ───────────────────────────────────────────────────
  // Priority: Liquidity Sweep → MSS → Displacement → OB/FVG retracement → Session
  const ictBuyMap = {
    'Sell-side liquidity swept':           liquiditySweepBullish,
    'Bullish MSS confirmed (BOS above prior high)': bullishMSS,
    'Strong bullish displacement candle':  bullishDisplacement,
    'Price retrace into OB / FVG zone':    retracedIntoOB_Buy,
    'London or NY session active':         sessionActive,
    'MACD bullish confirmation':           macdBullish || macdBullCross,
    'RSI oversold / bullish range (30–55)': rsi14 !== null && rsi14 >= 30 && rsi14 <= 55,
    'Price above VWAP':                    aboveVWAP,
  }
  const ictBuyRequired = [
    'Sell-side liquidity swept',
    'Bullish MSS confirmed (BOS above prior high)',
    'Strong bullish displacement candle',
    'Price retrace into OB / FVG zone',
    'London or NY session active',
  ]

  // ── ICT SELL conditions ──────────────────────────────────────────────────
  const ictSellMap = {
    'Buy-side liquidity swept':              liquiditySweepBearish,
    'Bearish MSS confirmed (BOS below prior low)': bearishMSS,
    'Strong bearish displacement candle':    bearishDisplacement,
    'Price retrace into OB / FVG zone':      retracedIntoOB_Sell,
    'London or NY session active':           sessionActive,
    'MACD bearish confirmation':             macdBearish || macdBearCross,
    'RSI overbought / bearish range (45–70)': rsi14 !== null && rsi14 >= 45 && rsi14 <= 70,
    'Price below VWAP':                      belowVWAP,
  }
  const ictSellRequired = [
    'Buy-side liquidity swept',
    'Bearish MSS confirmed (BOS below prior low)',
    'Strong bearish displacement candle',
    'Price retrace into OB / FVG zone',
    'London or NY session active',
  ]

  // ── Scalp conditions (still indicator-based but include ICT core checks) ─
  const scalpBuyMap = {
    'Sell-side liquidity swept':           liquiditySweepBullish,
    'Bullish MSS / structure shift':       bullishMSS || (sweptLow && bullishCandle),
    'Price above VWAP':                    aboveVWAP,
    'Pullback to VWAP / SMA 20':           nearVWAP || nearSMA20,
    'RSI between 30–55':                   rsi14 !== null && rsi14 >= 30 && rsi14 <= 55,
    'Bullish candle confirmation':         bullishCandle,
    'MACD bullish crossover':              macdBullCross,
  }
  const scalpBuyRequired = [
    'Sell-side liquidity swept',
    'Bullish MSS / structure shift',
    'Price above VWAP',
    'Pullback to VWAP / SMA 20',
    'RSI between 30–55',
    'Bullish candle confirmation',
  ]

  const scalpSellMap = {
    'Buy-side liquidity swept':            liquiditySweepBearish,
    'Bearish MSS / structure shift':       bearishMSS || (sweptHigh && bearishCandle),
    'Price below VWAP':                    belowVWAP,
    'Pullback to VWAP / SMA 20':           nearVWAP || nearSMA20,
    'RSI between 45–70':                   rsi14 !== null && rsi14 >= 45 && rsi14 <= 70,
    'Bearish candle confirmation':         bearishCandle,
    'MACD bearish crossover':              macdBearCross,
  }
  const scalpSellRequired = [
    'Buy-side liquidity swept',
    'Bearish MSS / structure shift',
    'Price below VWAP',
    'Pullback to VWAP / SMA 20',
    'RSI between 45–70',
    'Bearish candle confirmation',
  ]

  // Active only when ALL required ICT conditions are met
  const ictBuyActive   = ictBuyRequired.every((k) => ictBuyMap[k])
  const ictSellActive  = ictSellRequired.every((k) => ictSellMap[k])
  const scalpBuyActive = scalpBuyRequired.every((k) => scalpBuyMap[k])
  const scalpSellActive = scalpSellRequired.every((k) => scalpSellMap[k])

  // ICT status label derived from which conditions are present
  function getICTStatus(condMap, required, isActive) {
    if (isActive) return 'READY TO ENTER (CONFIRMED)'
    const passedRequired = required.filter((k) => condMap[k]).length
    const pct = required.length ? passedRequired / required.length : 0
    // Structure only: first 2 conditions (sweep + MSS) met
    const hasStructure = condMap[required[0]] && condMap[required[1]]
    if (hasStructure) return 'SETUP FORMING (STRUCTURE ONLY)'
    return 'WAITING FOR SETUP'
  }

  function buildSetup(active, direction, entry, sl, tp, condMap, required, ictStatus) {
    const passedCount    = required.filter((k) => condMap[k]).length
    const confidence     = required.length ? Math.round((passedCount / required.length) * 100) : 0
    // HIGH PROBABILITY requires ALL 5 core ICT conditions (confidence = 100% on required)
    const highProbability = active && confidence >= 85
    return {
      active,
      direction:      active ? direction : 'NONE',
      entry:          active ? entry : null,
      stopLoss:       active ? sl : null,
      takeProfit:     active ? tp : null,
      reasons:        Object.entries(condMap).filter(([, v]) => v).map(([k]) => k),
      missing:        required.filter((k) => !condMap[k]),
      watchingFor:    direction,
      confidence,
      highProbability,
      passedCount,
      totalCount:     required.length,
      ictStatus:      highProbability ? 'READY TO ENTER (CONFIRMED)' : ictStatus,
    }
  }

  // ── Scalp setup ────────────────────────────────────────────────────────────
  let scalpSetup
  if (scalpBuyActive) {
    const sl   = +(recentLow - 0.5).toFixed(2)
    const risk = current - sl
    scalpSetup = buildSetup(true, 'BUY', +current.toFixed(2), sl, +(current + risk * 0.8).toFixed(2), scalpBuyMap, scalpBuyRequired, getICTStatus(scalpBuyMap, scalpBuyRequired, true))
  } else if (scalpSellActive) {
    const sl   = +(recentHigh + 0.5).toFixed(2)
    const risk = sl - current
    scalpSetup = buildSetup(true, 'SELL', +current.toFixed(2), sl, +(current - risk * 0.8).toFixed(2), scalpSellMap, scalpSellRequired, getICTStatus(scalpSellMap, scalpSellRequired, true))
  } else {
    const buyMiss  = scalpBuyRequired.filter((k) => !scalpBuyMap[k]).length
    const sellMiss = scalpSellRequired.filter((k) => !scalpSellMap[k]).length
    const [dm, dm2, ds] = buyMiss <= sellMiss ? ['BUY', scalpBuyMap, scalpBuyRequired] : ['SELL', scalpSellMap, scalpSellRequired]
    scalpSetup = buildSetup(false, dm, null, null, null, dm2, ds, getICTStatus(dm2, ds, false))
  }

  // ── Swing setup (full ICT model) ───────────────────────────────────────────
  let swingSetup
  if (ictBuyActive) {
    const sl   = +(swingLow - 0.5).toFixed(2)
    const risk = current - sl
    swingSetup = buildSetup(true, 'BUY', +current.toFixed(2), sl, +(current + risk * 2).toFixed(2), ictBuyMap, ictBuyRequired, 'READY TO ENTER (CONFIRMED)')
  } else if (ictSellActive) {
    const sl   = +(swingHigh + 0.5).toFixed(2)
    const risk = sl - current
    swingSetup = buildSetup(true, 'SELL', +current.toFixed(2), sl, +(current - risk * 2).toFixed(2), ictSellMap, ictSellRequired, 'READY TO ENTER (CONFIRMED)')
  } else {
    const buyMiss  = ictBuyRequired.filter((k) => !ictBuyMap[k]).length
    const sellMiss = ictSellRequired.filter((k) => !ictSellMap[k]).length
    const [dm, dm2, ds] = buyMiss <= sellMiss ? ['BUY', ictBuyMap, ictBuyRequired] : ['SELL', ictSellMap, ictSellRequired]
    swingSetup = buildSetup(false, dm, null, null, null, dm2, ds, getICTStatus(dm2, ds, false))
  }

  return {
    ready: true,
    indicators: {
      price: +current.toFixed(2),
      sma20: sma20 !== null ? +sma20.toFixed(2) : null,
      sma50: sma50 !== null ? +sma50.toFixed(2) : null,
      rsi14: rsi14 !== null ? +rsi14.toFixed(2) : null,
      vwap: +vwap.toFixed(2),
      macd: Number.isNaN(macdCurrent) ? null : +macdCurrent.toFixed(4),
      macdSignal: Number.isNaN(sigCurrent) ? null : +sigCurrent.toFixed(4),
      macdHist: +macdHist.toFixed(4),
      bias,
      trend,
      aboveVWAP,
      recentLow: +recentLow.toFixed(2),
      recentHigh: +recentHigh.toFixed(2),
      swingLow: +swingLow.toFixed(2),
      swingHigh: +swingHigh.toFixed(2),
    },
    scalping: scalpSetup,
    swing: swingSetup,
  }
}
