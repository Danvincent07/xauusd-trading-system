// ─── SMC / ICT Intraday Swing Engine ─────────────────────────────────────────
// Builds synthetic candles from tick data, then runs:
//   Market Structure (HH/HL/LH/LL, BOS, MSS)
//   Liquidity (equal H/L, sweeps, buy/sell side)
//   Order Blocks (last bearish/bullish before displacement)
//   Fair Value Gaps (3-candle imbalances)
//   Premium / Discount zones (Fibonacci-based)
//   Displacement (institutional candles)
//   Full trade setup generation

// ─── Candle builder ──────────────────────────────────────────────────────────
function buildCandles(priceHistory, ticksPerCandle = 10) {
  const candles = []
  for (let i = 0; i < priceHistory.length; i += ticksPerCandle) {
    const slice = priceHistory.slice(i, i + ticksPerCandle)
    if (slice.length === 0) continue
    const prices = slice.map((p) => p.price)
    const open = prices[0]
    const close = prices[prices.length - 1]
    const high = Math.max(...prices)
    const low = Math.min(...prices)
    const timestamp = slice[0].timestamp
    candles.push({ open, high, low, close, timestamp })
  }
  return candles
}

// ─── Swing high / low finder ─────────────────────────────────────────────────
function findSwings(candles, lookback = 2) {
  const swingHighs = []
  const swingLows = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i]
    let isHigh = true
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].high >= c.high) isHigh = false
      if (candles[j].low <= c.low) isLow = false
    }
    if (isHigh) swingHighs.push({ index: i, price: c.high, timestamp: c.timestamp })
    if (isLow) swingLows.push({ index: i, price: c.low, timestamp: c.timestamp })
  }
  return { swingHighs, swingLows }
}

// ─── Market Structure ─────────────────────────────────────────────────────────
function detectMarketStructure(candles) {
  if (candles.length < 8) return null
  const { swingHighs, swingLows } = findSwings(candles, 2)

  if (swingHighs.length < 2 || swingLows.length < 2) {
    return {
      structure: 'RANGING', bias: 'Neutral',
      bos: false, bosDirection: 'NONE',
      mss: false, mssDirection: 'NONE',
      lastSwingHigh: swingHighs[swingHighs.length - 1]?.price ?? null,
      lastSwingLow: swingLows[swingLows.length - 1]?.price ?? null,
      swingHighs: swingHighs.slice(-3),
      swingLows: swingLows.slice(-3),
    }
  }

  const lastHigh = swingHighs[swingHighs.length - 1]
  const prevHigh = swingHighs[swingHighs.length - 2]
  const lastLow = swingLows[swingLows.length - 1]
  const prevLow = swingLows[swingLows.length - 2]

  const hasHH = lastHigh.price > prevHigh.price
  const hasHL = lastLow.price > prevLow.price
  const hasLH = lastHigh.price < prevHigh.price
  const hasLL = lastLow.price < prevLow.price

  let structure = 'RANGING'
  let bias = 'Neutral'
  if (hasHH && hasHL) { structure = 'UPTREND'; bias = 'Bullish' }
  else if (hasLH && hasLL) { structure = 'DOWNTREND'; bias = 'Bearish' }

  const currentPrice = candles[candles.length - 1].close
  const bosAbove = currentPrice > lastHigh.price
  const bosBelow = currentPrice < lastLow.price
  const bos = bosAbove || bosBelow
  const bosDirection = bosAbove ? 'BUY' : bosBelow ? 'SELL' : 'NONE'

  // MSS: structure shifts after a sweep
  // Bullish MSS: LH broken to the upside (downtrend → bullish)
  // Bearish MSS: HL broken to the downside (uptrend → bearish)
  const mssAbove = hasLH && currentPrice > lastHigh.price
  const mssBelow = hasHL && currentPrice < lastLow.price
  const mss = mssAbove || mssBelow
  const mssDirection = mssAbove ? 'BUY' : mssBelow ? 'SELL' : 'NONE'

  return {
    structure, bias, bos, bosDirection, mss, mssDirection,
    hasHH, hasHL, hasLH, hasLL,
    lastSwingHigh: +lastHigh.price.toFixed(2),
    lastSwingLow: +lastLow.price.toFixed(2),
    swingHighs: swingHighs.slice(-4),
    swingLows: swingLows.slice(-4),
  }
}

// ─── Session helpers ──────────────────────────────────────────────────────────
function getSession() {
  const h = new Date().getUTCHours()
  if (h >= 0 && h < 7) return 'Asian'
  if (h >= 7 && h < 12) return 'London'
  if (h >= 12 && h < 17) return 'NY AM'
  if (h >= 17 && h < 21) return 'NY PM'
  return 'After Hours'
}
function isActiveSession() {
  const h = new Date().getUTCHours()
  return h >= 7 && h < 21
}

// ─── Liquidity Detection ──────────────────────────────────────────────────────
function detectLiquidity(candles, livePrice) {
  if (candles.length < 5) return null
  const recent = candles.slice(-20)
  const allHighs = recent.map((c) => c.high)
  const allLows = recent.map((c) => c.low)
  const recentHigh = Math.max(...allHighs)
  const recentLow = Math.min(...allLows)
  const tolerance = Math.max(livePrice * 0.0003, 0.5)

  const sortedHighs = [...allHighs].sort((a, b) => b - a)
  const sortedLows = [...allLows].sort((a, b) => a - b)
  const equalHighsDetected = sortedHighs.length >= 2 && Math.abs(sortedHighs[0] - sortedHighs[1]) <= tolerance
  const equalLowsDetected = sortedLows.length >= 2 && Math.abs(sortedLows[0] - sortedLows[1]) <= tolerance

  const lastC = candles[candles.length - 1]
  const prevWindow = candles.slice(-11, -1)
  const prevHigh = prevWindow.length ? Math.max(...prevWindow.map((c) => c.high)) : recentHigh
  const prevLow = prevWindow.length ? Math.min(...prevWindow.map((c) => c.low)) : recentLow

  // Sweep: wick beyond prior level, closed back inside
  const sweptHigh = lastC.high > prevHigh + tolerance && lastC.close < prevHigh
  const sweptLow = lastC.low < prevLow - tolerance && lastC.close > prevLow
  const sweepDetected = sweptHigh || sweptLow
  const sweepDirection = sweptHigh ? 'SELL' : sweptLow ? 'BUY' : 'NONE'
  const sweepLevel = sweptHigh ? +lastC.high.toFixed(2) : sweptLow ? +lastC.low.toFixed(2) : null

  return {
    equalHighsDetected, equalLowsDetected,
    recentHigh: +recentHigh.toFixed(2),
    recentLow: +recentLow.toFixed(2),
    buySideLiq: +recentHigh.toFixed(2),
    sellSideLiq: +recentLow.toFixed(2),
    sweepDetected, sweepDirection, sweepLevel,
    sweptHigh, sweptLow,
    activeSession: getSession(),
    isHighVolatilitySession: isActiveSession(),
  }
}

// ─── Order Block Detection ────────────────────────────────────────────────────
function detectOrderBlocks(candles) {
  if (candles.length < 4) return { bullishOB: null, bearishOB: null }
  const minBody = 0.3
  let bullishOB = null
  let bearishOB = null

  for (let i = candles.length - 2; i >= Math.max(0, candles.length - 30); i--) {
    const c = candles[i]
    const next = candles[Math.min(i + 1, candles.length - 1)]
    const cBody = Math.abs(c.close - c.open)
    const nextBody = Math.abs(next.close - next.open)
    const bullDisp = next.close > next.open && nextBody >= minBody && nextBody > cBody
    const bearDisp = next.close < next.open && nextBody >= minBody && nextBody > cBody

    if (!bullishOB && c.close < c.open && bullDisp) {
      bullishOB = {
        high: +c.high.toFixed(2), low: +c.low.toFixed(2),
        open: +c.open.toFixed(2), close: +c.close.toFixed(2),
        timestamp: c.timestamp, direction: 'BUY',
        midpoint: +((c.high + c.low) / 2).toFixed(2),
        size: +(c.high - c.low).toFixed(2),
      }
    }
    if (!bearishOB && c.close > c.open && bearDisp) {
      bearishOB = {
        high: +c.high.toFixed(2), low: +c.low.toFixed(2),
        open: +c.open.toFixed(2), close: +c.close.toFixed(2),
        timestamp: c.timestamp, direction: 'SELL',
        midpoint: +((c.high + c.low) / 2).toFixed(2),
        size: +(c.high - c.low).toFixed(2),
      }
    }
    if (bullishOB && bearishOB) break
  }
  return { bullishOB, bearishOB }
}

// ─── Fair Value Gap Detection ─────────────────────────────────────────────────
function detectFVGs(candles) {
  if (candles.length < 3) return { bullishFVGs: [], bearishFVGs: [] }
  const bullishFVGs = []
  const bearishFVGs = []
  const currentPrice = candles[candles.length - 1].close
  const minGap = 0.2

  for (let i = 1; i < candles.length - 1; i++) {
    const c1 = candles[i - 1]
    const c3 = candles[i + 1]
    if (c1.high < c3.low && c3.low - c1.high >= minGap) {
      bullishFVGs.push({
        high: +c3.low.toFixed(2), low: +c1.high.toFixed(2),
        midpoint: +((c3.low + c1.high) / 2).toFixed(2),
        timestamp: candles[i].timestamp, direction: 'BUY',
        mitigated: currentPrice >= c1.high && currentPrice <= c3.low,
        size: +(c3.low - c1.high).toFixed(2),
      })
    }
    if (c1.low > c3.high && c1.low - c3.high >= minGap) {
      bearishFVGs.push({
        high: +c1.low.toFixed(2), low: +c3.high.toFixed(2),
        midpoint: +((c1.low + c3.high) / 2).toFixed(2),
        timestamp: candles[i].timestamp, direction: 'SELL',
        mitigated: currentPrice >= c3.high && currentPrice <= c1.low,
        size: +(c1.low - c3.high).toFixed(2),
      })
    }
  }

  const sortFVGs = (arr) => [
    ...arr.filter((f) => !f.mitigated).slice(-3),
    ...arr.filter((f) => f.mitigated).slice(-2),
  ]
  return { bullishFVGs: sortFVGs(bullishFVGs), bearishFVGs: sortFVGs(bearishFVGs) }
}

// ─── Premium / Discount Zones ─────────────────────────────────────────────────
// For an intraday swing daily setup, the range is derived from the full session
// high/low across all available price history (≈ 2 days of 5-min data at 500 ticks).
// This gives a true institutional premium/discount framework, not a tight minute-level range.
function getPremiumDiscount(candles, priceHistory = null) {
  let swingHigh, swingLow

  if (priceHistory && priceHistory.length >= 20) {
    // Use the full session: all available raw tick prices for max/min
    const prices = priceHistory.map((p) => p.price).filter(Number.isFinite)
    swingHigh = Math.max(...prices)
    swingLow  = Math.min(...prices)
  } else {
    if (candles.length < 3) return null
    const recent = candles.slice(-Math.min(candles.length, 30))
    swingHigh = Math.max(...recent.map((c) => c.high))
    swingLow  = Math.min(...recent.map((c) => c.low))
  }

  const range = swingHigh - swingLow
  if (range < 0.5) return null   // guard against degenerate range
  const equilibrium  = swingLow + range * 0.5
  const premiumStart = swingLow + range * 0.618
  const discountEnd  = swingLow + range * 0.382
  return {
    swingHigh: +swingHigh.toFixed(2), swingLow: +swingLow.toFixed(2),
    equilibrium: +equilibrium.toFixed(2),
    premiumStart: +premiumStart.toFixed(2), discountEnd: +discountEnd.toFixed(2),
    range: +range.toFixed(2),
  }
}

// ─── Displacement Detection ───────────────────────────────────────────────────
function detectDisplacement(candles) {
  if (candles.length < 3) return { detected: false, direction: 'NONE', strength: 0, body: 0, fvgCreated: false, bodyRatio: 0 }
  const lastC = candles[candles.length - 1]
  const prevC = candles[candles.length - 2]
  const body = Math.abs(lastC.close - lastC.open)
  const wick = lastC.high - lastC.low
  const bodyRatio = wick > 0 ? body / wick : 0
  const pctMove = lastC.open > 0 ? body / lastC.open : 0
  const strongDisp = body >= 0.5 && bodyRatio >= 0.5
  const direction = lastC.close >= lastC.open ? 'BUY' : 'SELL'
  const fvgCreated = direction === 'BUY' ? prevC.high < lastC.low : prevC.low > lastC.high
  return {
    detected: strongDisp, direction: strongDisp ? direction : 'NONE',
    strength: +(pctMove * 100).toFixed(4), body: +body.toFixed(2),
    fvgCreated, bodyRatio: +bodyRatio.toFixed(2),
  }
}

// ─── Explanation builder ──────────────────────────────────────────────────────
function buildExplanation(direction, conditions, liquidity, structure, displacement) {
  const passed = Object.entries(conditions).filter(([, v]) => v).map(([k]) => k)
  const failed = Object.entries(conditions).filter(([, v]) => !v).map(([k]) => k)
  const parts = []
  if (direction === 'SELL') {
    parts.push('Bearish intraday swing setup identified.')
    if (liquidity?.sweptHigh) parts.push(`Buy-side liquidity swept at ${liquidity.sweepLevel} — stop hunt above equal highs confirmed.`)
    if (structure?.mss && structure.mssDirection === 'SELL') parts.push('Bearish MSS confirmed — price broke below previous higher low after buy-side sweep.')
    if (displacement?.detected && displacement.direction === 'SELL') parts.push(`Strong bearish displacement candle (${displacement.body} pts) signals institutional distribution.`)
  } else {
    parts.push('Bullish intraday swing setup identified.')
    if (liquidity?.sweptLow) parts.push(`Sell-side liquidity swept at ${liquidity.sweepLevel} — stop hunt below equal lows confirmed.`)
    if (structure?.mss && structure.mssDirection === 'BUY') parts.push('Bullish MSS confirmed — price broke above previous lower high after sell-side sweep.')
    if (displacement?.detected && displacement.direction === 'BUY') parts.push(`Strong bullish displacement candle (${displacement.body} pts) signals institutional accumulation.`)
  }
  if (passed.length) parts.push(`Conditions confirmed: ${passed.join('; ')}.`)
  if (failed.length) parts.push(`Awaiting: ${failed.join('; ')}.`)
  return parts.join(' ')
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export function buildSMCAnalysis(priceHistory, livePrice) {
  const EMPTY = {
    ready: false, candles: [], marketStructure: null, liquidity: null,
    orderBlocks: null, fvgs: null, premiumDiscount: null, displacement: null,
    setup: null, alerts: [],
  }

  if (!priceHistory || priceHistory.length < 120) return EMPTY
  // Two timeframes: structure candles (40 ticks ≈ 1 min) for swing analysis,
  // entry candles (10 ticks ≈ 15 s) for OB/FVG precision — models a valid intraday daily setup
  const structureCandles = buildCandles(priceHistory, 40)
  const candles = buildCandles(priceHistory, 10)
  if (structureCandles.length < 4 || candles.length < 12) return EMPTY

  const marketStructure = detectMarketStructure(structureCandles)
  const liquidity = detectLiquidity(candles, livePrice)
  const { bullishOB, bearishOB } = detectOrderBlocks(candles)
  const { bullishFVGs, bearishFVGs } = detectFVGs(candles)
  const premiumDiscount = getPremiumDiscount(structureCandles, priceHistory)
  const displacement = detectDisplacement(candles)
  const currentPrice = livePrice
  const alerts = []

  if (liquidity?.sweepDetected) {
    alerts.push({ type: 'SWEEP', message: `Liquidity sweep — ${liquidity.sweepDirection} side at ${liquidity.sweepLevel}`, level: 'high' })
  }
  if (marketStructure?.mss) {
    alerts.push({ type: 'MSS', message: `Market Structure Shift — ${marketStructure.mssDirection}`, level: 'high' })
  }
  if (marketStructure?.bos) {
    alerts.push({ type: 'BOS', message: `Break of Structure — ${marketStructure.bosDirection}`, level: 'medium' })
  }
  if (displacement?.fvgCreated) {
    alerts.push({ type: 'FVG', message: `Fair Value Gap created — ${displacement.direction} imbalance`, level: 'medium' })
  }

  // Price-in-zone checks
  const unfilledBearFVG = bearishFVGs.find((f) => !f.mitigated && currentPrice >= f.low && currentPrice <= f.high)
  const inBearishOB = bearishOB && currentPrice >= bearishOB.low && currentPrice <= bearishOB.high
  const unfilledBullFVG = bullishFVGs.find((f) => !f.mitigated && currentPrice >= f.low && currentPrice <= f.high)
  const inBullishOB = bullishOB && currentPrice >= bullishOB.low && currentPrice <= bullishOB.high

  const bearishConditions = {
    'Buy-side liquidity swept': liquidity?.sweptHigh ?? false,
    'Bearish MSS confirmed': !!(marketStructure?.mss && marketStructure.mssDirection === 'SELL'),
    'Bearish displacement candle': !!(displacement?.detected && displacement.direction === 'SELL'),
    'Bearish OB identified': !!bearishOB,
    'Bearish FVG present': bearishFVGs.filter((f) => !f.mitigated).length > 0,
    'Price retrace into OB/FVG': !!(inBearishOB || unfilledBearFVG),
    'Sell-side liquidity target': !!(liquidity?.sellSideLiq),
    'Active session': !!(liquidity?.isHighVolatilitySession),
  }

  const bullishConditions = {
    'Sell-side liquidity swept': liquidity?.sweptLow ?? false,
    'Bullish MSS confirmed': !!(marketStructure?.mss && marketStructure.mssDirection === 'BUY'),
    'Bullish displacement candle': !!(displacement?.detected && displacement.direction === 'BUY'),
    'Bullish OB identified': !!bullishOB,
    'Bullish FVG present': bullishFVGs.filter((f) => !f.mitigated).length > 0,
    'Price retrace into OB/FVG': !!(inBullishOB || unfilledBullFVG),
    'Buy-side liquidity target': !!(liquidity?.buySideLiq),
    'Active session': !!(liquidity?.isHighVolatilitySession),
  }

  const bearScore = Object.values(bearishConditions).filter(Boolean).length
  const bullScore = Object.values(bullishConditions).filter(Boolean).length
  const total = Object.keys(bearishConditions).length
  let setup = null

  if (bearScore > bullScore && bearScore >= 4) {
    const entryZone = unfilledBearFVG ?? (inBearishOB && bearishOB ? { high: bearishOB.high, low: bearishOB.low, midpoint: bearishOB.midpoint } : null)
    const entry = entryZone ? +entryZone.midpoint.toFixed(2) : +currentPrice.toFixed(2)
    const slBase = liquidity?.sweepLevel ?? liquidity?.recentHigh ?? currentPrice + 5
    const sl = +Math.max(slBase + 0.3, entry + 1.5).toFixed(2)
    const risk = sl - entry
    const tp1 = +(entry - risk * 1.5).toFixed(2)
    const tp2 = +(entry - risk * 3).toFixed(2)
    const tp3 = liquidity ? +Math.min(liquidity.sellSideLiq, entry - risk * 4).toFixed(2) : tp2
    const confidence = Math.round((bearScore / total) * 100)
    const rr = risk > 0 ? +((entry - tp2) / risk).toFixed(1) : 0

    setup = {
      direction: 'SELL', confidence, entry, stopLoss: sl,
      takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3, riskReward: rr,
      conditions: bearishConditions, conditionsMet: bearScore, totalConditions: total,
      marketBias: marketStructure?.bias ?? 'Neutral',
      liquidityTaken: liquidity?.sweptHigh ? `Buy-side @ ${liquidity.sweepLevel}` : 'Pending',
      mssConfirmed: !!(marketStructure?.mss && marketStructure.mssDirection === 'SELL'),
      obZone: bearishOB ? `${bearishOB.low}–${bearishOB.high}` : '—',
      fvgZone: unfilledBearFVG ? `${unfilledBearFVG.low}–${unfilledBearFVG.high}` : '—',
      session: liquidity?.activeSession ?? 'Unknown',
      explanation: buildExplanation('SELL', bearishConditions, liquidity, marketStructure, displacement),
      setupKey: `SELL-${Math.round(entry * 2)}`,
    }
    if (confidence >= 50) alerts.push({ type: 'SELL_SETUP', message: `SELL setup active — confidence ${confidence}%`, level: confidence >= 75 ? 'high' : 'medium' })
  } else if (bullScore >= 4) {
    const entryZone = unfilledBullFVG ?? (inBullishOB && bullishOB ? { high: bullishOB.high, low: bullishOB.low, midpoint: bullishOB.midpoint } : null)
    const entry = entryZone ? +entryZone.midpoint.toFixed(2) : +currentPrice.toFixed(2)
    const slBase = liquidity?.sweepLevel ?? liquidity?.recentLow ?? currentPrice - 5
    const sl = +Math.min(slBase - 0.3, entry - 1.5).toFixed(2)
    const risk = entry - sl
    const tp1 = +(entry + risk * 1.5).toFixed(2)
    const tp2 = +(entry + risk * 3).toFixed(2)
    const tp3 = liquidity ? +Math.max(liquidity.buySideLiq, entry + risk * 4).toFixed(2) : tp2
    const confidence = Math.round((bullScore / total) * 100)
    const rr = risk > 0 ? +((tp2 - entry) / risk).toFixed(1) : 0

    setup = {
      direction: 'BUY', confidence, entry, stopLoss: sl,
      takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3, riskReward: rr,
      conditions: bullishConditions, conditionsMet: bullScore, totalConditions: total,
      marketBias: marketStructure?.bias ?? 'Neutral',
      liquidityTaken: liquidity?.sweptLow ? `Sell-side @ ${liquidity.sweepLevel}` : 'Pending',
      mssConfirmed: !!(marketStructure?.mss && marketStructure.mssDirection === 'BUY'),
      obZone: bullishOB ? `${bullishOB.low}–${bullishOB.high}` : '—',
      fvgZone: unfilledBullFVG ? `${unfilledBullFVG.low}–${unfilledBullFVG.high}` : '—',
      session: liquidity?.activeSession ?? 'Unknown',
      explanation: buildExplanation('BUY', bullishConditions, liquidity, marketStructure, displacement),
      setupKey: `BUY-${Math.round(entry * 2)}`,
    }
    if (confidence >= 50) alerts.push({ type: 'BUY_SETUP', message: `BUY setup active — confidence ${confidence}%`, level: confidence >= 75 ? 'high' : 'medium' })
  }

  return {
    ready: true,
    candles: candles.slice(-50),
    marketStructure,
    liquidity,
    orderBlocks: { bullishOB, bearishOB },
    fvgs: { bullishFVGs: bullishFVGs.slice(-3), bearishFVGs: bearishFVGs.slice(-3) },
    premiumDiscount,
    displacement,
    setup,
    alerts: alerts.slice(-8),
  }
}
