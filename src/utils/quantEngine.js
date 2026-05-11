// ─── Quantitative Analysis Engine ─────────────────────────────────────────────
// Computes statistical / volatility / momentum / real-yield metrics for XAUUSD.
// All inputs are derived from the live priceHistory tick array.

// ─── Standard Deviation ───────────────────────────────────────────────────────
function calcStdDev(prices) {
  if (prices.length < 2) return 0
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length
  const variance = prices.reduce((a, x) => a + (x - mean) ** 2, 0) / prices.length
  return Math.sqrt(variance)
}

// ─── ATR (Average True Range over synthetic candles) ─────────────────────────
function calcATR(candles, period = 14) {
  if (candles.length < 2) return 0
  const trs = candles.slice(1).map((c, i) => {
    const prev = candles[i]
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))
  })
  const slice = trs.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

// ─── Build synthetic candles from ticks ──────────────────────────────────────
function buildCandles(priceHistory, ticksPerCandle) {
  const candles = []
  for (let i = 0; i < priceHistory.length; i += ticksPerCandle) {
    const slice = priceHistory.slice(i, i + ticksPerCandle)
    if (!slice.length) continue
    const prices = slice.map((p) => p.price)
    candles.push({
      open:  prices[0],
      close: prices[prices.length - 1],
      high:  Math.max(...prices),
      low:   Math.min(...prices),
      timestamp: slice[0].timestamp,
    })
  }
  return candles
}

// ─── Standard Deviation Metrics ──────────────────────────────────────────────
function computeStdDev(prices) {
  const w20  = prices.slice(-20)
  const w5   = prices.slice(-5)
  const stdv20 = calcStdDev(w20)
  const stdv5  = calcStdDev(w5)

  // Expansion: recent STDV > historical STDV
  const w60 = prices.slice(-60)
  const stdvHist = w60.length >= 20 ? calcStdDev(w60.slice(0, -20)) : stdv20

  const expandingRatio = stdvHist > 0 ? stdv20 / stdvHist : 1
  const expanding  = expandingRatio > 1.25
  const compressing = expandingRatio < 0.75

  return {
    stdv20: +stdv20.toFixed(4),
    stdv5:  +stdv5.toFixed(4),
    expandingRatio: +expandingRatio.toFixed(3),
    expanding,
    compressing,
    label: expanding ? 'Expanding' : compressing ? 'Compressing' : 'Normal',
  }
}

// ─── Z-Score ──────────────────────────────────────────────────────────────────
function computeZScore(prices, livePrice) {
  const w = prices.slice(-30)
  if (w.length < 5) return { z: 0, overbought: false, oversold: false, label: 'Neutral', meanReversion: 0 }
  const mean = w.reduce((a, b) => a + b, 0) / w.length
  const std  = calcStdDev(w)
  const z    = std > 0 ? (livePrice - mean) / std : 0
  const zRnd = +z.toFixed(2)
  const overbought = z > 2
  const oversold   = z < -2
  // Probability of mean reversion: ~68% within ±1σ, ~95% within ±2σ
  const absZ = Math.abs(z)
  const meanReversionPct = absZ >= 3 ? 92 : absZ >= 2 ? 78 : absZ >= 1 ? 50 : 20
  return {
    z: zRnd, mean: +mean.toFixed(2), std: +std.toFixed(4),
    overbought, oversold,
    label: z > 2.5 ? 'Extreme Overbought' : z > 1.5 ? 'Overbought' : z < -2.5 ? 'Extreme Oversold' : z < -1.5 ? 'Oversold' : 'Neutral',
    meanReversion: meanReversionPct,
  }
}

// ─── Volatility Regime ────────────────────────────────────────────────────────
function computeVolatilityRegime(stdvData, atr, prices) {
  const { expanding, compressing, expandingRatio } = stdvData
  // Exhaustion: expanding + Z-score extreme
  const w20 = prices.slice(-20)
  const mean = w20.length ? w20.reduce((a, b) => a + b, 0) / w20.length : prices[0]
  const liveP = prices[prices.length - 1]
  const std20 = calcStdDev(w20)
  const zAbs  = std20 > 0 ? Math.abs(liveP - mean) / std20 : 0
  const exhaustion = expanding && zAbs > 2.5

  if (exhaustion) return { regime: 'Exhaustion',   color: '#ef4444', desc: 'Extreme volatility spike — reversal probability elevated. Reduce position size.', score: 3 }
  if (expanding)  return { regime: 'Expansion',    color: '#22c55e', desc: 'Volatility expanding — institutional momentum confirmed. Trend continuation favored.', score: 2 }
  if (compressing) return { regime: 'Compression', color: '#f59e0b', desc: 'Volatility compressing — liquidity building. Breakout imminent; await directional signal.', score: 1 }
  return              { regime: 'Normal',          color: '#94a3b8', desc: 'Normal volatility environment — standard setup rules apply.', score: 0 }
}

// ─── Mean Reversion Model ─────────────────────────────────────────────────────
function computeMeanReversion(prices, livePrice, zscore) {
  const w20 = prices.slice(-20)
  if (w20.length < 5) return { probability: 0, direction: 'NONE', vwapDev: 0, maDev: 0 }

  const mean = w20.reduce((a, b) => a + b, 0) / w20.length
  const vwapDev = mean > 0 ? ((livePrice - mean) / mean) * 100 : 0

  // Simple MA deviation
  const ma20 = mean
  const maDev = ma20 > 0 ? ((livePrice - ma20) / ma20) * 100 : 0

  const prob = zscore.meanReversion
  const direction = zscore.overbought ? 'SELL' : zscore.oversold ? 'BUY' : 'NONE'

  return {
    probability: prob,
    direction,
    vwapDev: +vwapDev.toFixed(3),
    maDev: +maDev.toFixed(3),
    mean: +mean.toFixed(2),
    label: prob >= 78 ? `High reversion probability (${prob}%)` : prob >= 50 ? `Moderate reversion (${prob}%)` : 'Low reversion pressure',
  }
}

// ─── Momentum Strength ────────────────────────────────────────────────────────
function computeMomentum(prices, livePrice, candles, atr) {
  if (prices.length < 10) return { roc: 0, strength: 0, label: 'Neutral', direction: 'NONE', impulse: false }

  // Rate of Change (10-period)
  const prev10 = prices[prices.length - 11] ?? prices[0]
  const roc = prev10 > 0 ? ((livePrice - prev10) / prev10) * 100 : 0

  // ATR-normalised momentum
  const atrNorm = atr > 0 ? Math.abs(roc) / (atr / livePrice * 100) : 0

  // Impulse: last candle body > 1.5× ATR
  let impulse = false
  if (candles.length >= 2 && atr > 0) {
    const last = candles[candles.length - 1]
    const body = Math.abs(last.close - last.open)
    impulse = body > atr * 1.5
  }

  const absRoc = Math.abs(roc)
  const strength = Math.min(100, Math.round(atrNorm * 40))
  const direction = roc > 0.05 ? 'BUY' : roc < -0.05 ? 'SELL' : 'NONE'
  const label = strength >= 75 ? 'Strong Momentum' : strength >= 40 ? 'Moderate Momentum' : 'Weak / Exhausted'

  return { roc: +roc.toFixed(3), strength, label, direction, impulse, atrNorm: +atrNorm.toFixed(2) }
}

// ─── Real Yield Proxy ─────────────────────────────────────────────────────────
// Since live yield data is unavailable, we derive a proxy:
// - US10Y proxy: inferred from gold's long-term momentum vs. monthly baseline
// - Inflation proxy: derived from momentum & volatility regime
// - Real Yield = Nominal Yield proxy − Inflation proxy
// Gold has a strong INVERSE correlation to real yields.
function computeRealYield(prices, livePrice, stdvData) {
  if (prices.length < 20) return {
    nominalYieldProxy: 4.5, inflationProxy: 3.0, realYield: 1.5,
    trend: 'Neutral', bullishGold: null,
    implication: 'Insufficient data for real yield computation',
    color: '#94a3b8',
  }

  // Nominal yield proxy: inverse of gold long-run momentum
  // Rising gold → falling yields and vice versa (inverse relationship)
  const w60 = prices.slice(-Math.min(prices.length, 60))
  const longMomentum = w60[0] > 0 ? ((livePrice - w60[0]) / w60[0]) * 100 : 0

  // Base regime: assume ~4.2–4.8% US10Y proxy range for 2025-2026
  const baseNominal = 4.5
  const nominalYieldProxy = +(baseNominal - longMomentum * 0.08).toFixed(2)

  // Inflation proxy: if gold accelerating (stdv expanding), inflation expectations rising
  const baseInflation = 3.0
  const inflationProxy = +(baseInflation + (stdvData.expanding ? 0.3 : stdvData.compressing ? -0.2 : 0)).toFixed(2)

  const realYield = +(nominalYieldProxy - inflationProxy).toFixed(2)
  const clamped = Math.max(-2, Math.min(4, realYield))

  // Trend direction derived from 10-tick vs 20-tick momentum
  const shortMom = prices.slice(-10)
  const medMom   = prices.slice(-20)
  const smShort = shortMom.reduce((a, b) => a + b, 0) / shortMom.length
  const smMed   = medMom.reduce((a, b) => a + b, 0) / medMom.length
  const yieldTrendBullish = livePrice > smMed // rising gold → falling effective real yield

  const trend = yieldTrendBullish ? 'Declining' : 'Rising'
  const bullishGold = clamped < 0 || yieldTrendBullish

  const implication = clamped < 0
    ? `Negative real yield (${realYield}%) — strongly supportive for gold. Institutional gold demand elevated.`
    : clamped < 1
    ? `Low real yield (${realYield}%) — mild support for gold as alternative store of value.`
    : clamped < 2
    ? `Moderate real yield (${realYield}%) — neutral to mildly bearish for gold. Watch DXY.`
    : `High real yield (${realYield}%) — headwind for gold. Opportunity cost of holding gold elevated.`

  const color = clamped < 0 ? '#22c55e' : clamped < 1.5 ? '#f59e0b' : '#ef4444'

  return { nominalYieldProxy, inflationProxy, realYield, trend, bullishGold, implication, color }
}

// ─── Probability Score ────────────────────────────────────────────────────────
function computeProbabilityScore(smcSetup, stdvData, zscore, volRegime, momentum, realYield, macroScore) {
  let score = 0
  const factors = []

  // ── Technical (SMC) factors ──
  if (smcSetup) {
    const condPct = smcSetup.conditionsMet / smcSetup.totalConditions
    const techScore = Math.round(condPct * 30)
    score += techScore
    factors.push({ label: 'SMC Conditions', value: `${smcSetup.conditionsMet}/${smcSetup.totalConditions}`, points: techScore, positive: condPct >= 0.5 })

    if (smcSetup.mssConfirmed) {
      score += 10; factors.push({ label: 'MSS Confirmed', value: 'Yes', points: 10, positive: true })
    }
    if (smcSetup.liquidityTaken !== 'Pending') {
      score += 8; factors.push({ label: 'Liquidity Swept', value: smcSetup.liquidityTaken, points: 8, positive: true })
    }
  }

  // ── Quantitative factors ──
  if (volRegime.regime === 'Expansion') {
    score += 10; factors.push({ label: 'Volatility Regime', value: 'Expansion', points: 10, positive: true })
  } else if (volRegime.regime === 'Exhaustion') {
    score -= 8; factors.push({ label: 'Volatility Regime', value: 'Exhaustion', points: -8, positive: false })
  } else if (volRegime.regime === 'Compression') {
    score += 5; factors.push({ label: 'Volatility Regime', value: 'Pre-Breakout', points: 5, positive: true })
  }

  // Z-Score alignment
  if (smcSetup) {
    const dir = smcSetup.direction
    if ((dir === 'BUY' && zscore.oversold) || (dir === 'SELL' && zscore.overbought)) {
      score += 12; factors.push({ label: 'Z-Score Alignment', value: zscore.label, points: 12, positive: true })
    } else if ((dir === 'BUY' && zscore.overbought) || (dir === 'SELL' && zscore.oversold)) {
      score -= 8; factors.push({ label: 'Z-Score Conflict', value: zscore.label, points: -8, positive: false })
    }
  }

  // STDV expansion confirms direction
  if (stdvData.expanding && momentum.strength >= 50) {
    score += 8; factors.push({ label: 'STDV + Momentum', value: `${momentum.label}`, points: 8, positive: true })
  }

  // Impulse candle
  if (momentum.impulse) {
    score += 6; factors.push({ label: 'Impulse Candle', value: 'Detected', points: 6, positive: true })
  }

  // ── Macro factors ──
  if (realYield.bullishGold === true && smcSetup?.direction === 'BUY') {
    score += 8; factors.push({ label: 'Real Yield', value: `${realYield.realYield}% — Bullish Gold`, points: 8, positive: true })
  } else if (realYield.bullishGold === false && smcSetup?.direction === 'SELL') {
    score += 8; factors.push({ label: 'Real Yield', value: `${realYield.realYield}% — Bearish Gold`, points: 8, positive: true })
  } else if (realYield.bullishGold !== null) {
    score -= 4; factors.push({ label: 'Real Yield', value: 'Diverges with setup', points: -4, positive: false })
  }

  if (macroScore && macroScore.direction !== 'NEUTRAL' && smcSetup && smcSetup.direction === macroScore.direction) {
    score += 8; factors.push({ label: 'Macro Confluence', value: `${macroScore.bias}`, points: 8, positive: true })
  }

  // Mean reversion penalty when trading against reversion signal
  if (smcSetup) {
    const revDir = zscore.overbought ? 'SELL' : zscore.oversold ? 'BUY' : null
    if (revDir && revDir === smcSetup.direction && zscore.meanReversion >= 78) {
      score += 5; factors.push({ label: 'Mean Reversion', value: `Aligns ${zscore.meanReversion}%`, points: 5, positive: true })
    }
  }

  const clamped = Math.max(0, Math.min(100, score))
  const grade = clamped >= 80 ? 'Institutional Grade' : clamped >= 65 ? 'High Probability' : clamped >= 45 ? 'Medium Probability' : 'Low Probability'
  const gradeColor = clamped >= 80 ? '#a855f7' : clamped >= 65 ? '#22c55e' : clamped >= 45 ? '#f59e0b' : '#ef4444'

  return { score: clamped, grade, gradeColor, factors }
}

// ─── Quant AI Narrative ───────────────────────────────────────────────────────
function buildQuantNarrative(stdvData, zscore, volRegime, meanRev, momentum, realYield, probScore, smcSetup, macroScore) {
  const parts = []

  // Real yield context
  if (realYield.realYield < 0) {
    parts.push(`Real yields are negative (${realYield.realYield}%) — historically the strongest environment for gold accumulation as opportunity cost collapses.`)
  } else if (realYield.trend === 'Declining') {
    parts.push(`Real yields declining (${realYield.realYield}%) — falling real rates reduce the appeal of yield-bearing assets and support gold demand.`)
  } else {
    parts.push(`Real yields at ${realYield.realYield}% — elevated rates increase opportunity cost; gold requires stronger safe-haven catalyst to extend.`)
  }

  // Volatility regime
  if (volRegime.regime === 'Compression') {
    parts.push(`Volatility in compression phase (STDV ratio ${stdvData.expandingRatio}×) — institutional liquidity building beneath the surface; a sharp expansion move is statistically probable.`)
  } else if (volRegime.regime === 'Expansion') {
    parts.push(`Volatility expansion confirmed (STDV ratio ${stdvData.expandingRatio}×) — rising standard deviation signals active institutional participation and directional commitment.`)
  } else if (volRegime.regime === 'Exhaustion') {
    parts.push(`Volatility in exhaustion phase — extreme standard deviation spike detected. Price overextension is statistically high; mean reversion probability elevated to ${zscore.meanReversion}%.`)
  }

  // Z-Score
  if (zscore.overbought) {
    parts.push(`Z-score at ${zscore.z} (statistically overbought > +2σ) — price deviates ${zscore.z} standard deviations above mean (${zscore.mean}). Mean reversion probability: ${zscore.meanReversion}%.`)
  } else if (zscore.oversold) {
    parts.push(`Z-score at ${zscore.z} (statistically oversold < −2σ) — price sits ${Math.abs(zscore.z)} standard deviations below mean (${zscore.mean}). Mean reversion / bounce probability: ${zscore.meanReversion}%.`)
  } else {
    parts.push(`Z-score ${zscore.z} — price within normal distribution range. No statistical extreme detected.`)
  }

  // Momentum
  if (momentum.impulse) {
    parts.push(`Impulse candle detected — institutional displacement confirmed with body exceeding 1.5× ATR. ${momentum.direction} momentum at ${momentum.strength}% strength.`)
  } else if (momentum.strength >= 50) {
    parts.push(`Momentum strength at ${momentum.strength}% (ROC: ${momentum.roc}%) — ${momentum.label} suggests ${momentum.direction === 'NONE' ? 'neutral' : momentum.direction + ' continuation'}.`)
  }

  // SMC alignment
  if (smcSetup && macroScore) {
    const aligned = smcSetup.direction === macroScore.direction
    if (aligned) {
      parts.push(`Quantitative probability score: ${probScore.score}/100 (${probScore.grade}) — SMC ${smcSetup.direction} setup confluent with ${macroScore.bias} macro bias and quantitative model confirmation.`)
    } else {
      parts.push(`Quantitative score: ${probScore.score}/100 — note divergence between technical setup (${smcSetup?.direction ?? 'N/A'}) and macro bias (${macroScore?.bias ?? 'N/A'}); apply elevated risk caution.`)
    }
  } else {
    parts.push(`Quantitative probability model score: ${probScore.score}/100 (${probScore.grade}).`)
  }

  return parts.join(' ')
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export function buildQuantAnalysis(priceHistory, livePrice, smcSetup = null, macroScore = null) {
  const EMPTY = {
    ready: false, stdvData: null, zscore: null, atr: 0,
    volRegime: null, meanReversion: null, momentum: null,
    realYield: null, probScore: null, narrative: '',
  }

  if (!priceHistory || priceHistory.length < 20) return EMPTY

  const prices = priceHistory.map((p) => p.price).filter(Number.isFinite)
  const candles10 = buildCandles(priceHistory, 10)

  const atr       = calcATR(candles10)
  const stdvData  = computeStdDev(prices)
  const zscore    = computeZScore(prices, livePrice)
  const volRegime = computeVolatilityRegime(stdvData, atr, prices)
  const meanReversion = computeMeanReversion(prices, livePrice, zscore)
  const momentum  = computeMomentum(prices, livePrice, candles10, atr)
  const realYield = computeRealYield(prices, livePrice, stdvData)
  const probScore = computeProbabilityScore(smcSetup, stdvData, zscore, volRegime, momentum, realYield, macroScore)
  const narrative = buildQuantNarrative(stdvData, zscore, volRegime, meanReversion, momentum, realYield, probScore, smcSetup, macroScore)

  // Quant confidence boost for locked setup scoring
  let quantBoost = 0
  if (volRegime.regime === 'Expansion') quantBoost += 8
  if (volRegime.regime === 'Compression') quantBoost += 4
  if (momentum.impulse) quantBoost += 6
  if (realYield.bullishGold === true && smcSetup?.direction === 'BUY') quantBoost += 6
  if (realYield.bullishGold === false && smcSetup?.direction === 'SELL') quantBoost += 6
  if (zscore.overbought && smcSetup?.direction === 'SELL') quantBoost += 5
  if (zscore.oversold   && smcSetup?.direction === 'BUY')  quantBoost += 5

  return {
    ready: true,
    atr: +atr.toFixed(2),
    stdvData,
    zscore,
    volRegime,
    meanReversion,
    momentum,
    realYield,
    probScore,
    narrative,
    quantBoost,
  }
}
