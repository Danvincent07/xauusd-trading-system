// ─── Macro / ICT Quarterly Theory / Institutional Flow Engine ────────────────
// Derives macroeconomic context, quarterly theory phases, institutional flow,
// session models, and market narrative purely from price action + current time.

// ─── ICT Quarterly Theory ─────────────────────────────────────────────────────
const PHASE_META = {
  Q1: { color: '#3b82f6', name: 'Accumulation',  desc: 'Institutions quietly build positions. Expect range compression, low volatility, and engineered equal highs/lows.' },
  Q2: { color: '#f59e0b', name: 'Manipulation',  desc: 'Liquidity grabs and false breakouts. Judas swing engineered to trap retail. Key reversal zone — wait for MSS before entry.' },
  Q3: { color: '#22c55e', name: 'Expansion',     desc: 'True institutional directional move. Price drives toward premium/discount extremes. Highest probability setups.' },
  Q4: { color: '#ef4444', name: 'Distribution',  desc: 'Smart money offloads into retail. Exhaustion and reversal setups. Reduce position bias and tighten risk.' },
}

function getYearlyQuarter() {
  const m = new Date().getMonth() // 0–11
  const q = ['Q1','Q2','Q3','Q4'][Math.floor(m / 3)]
  return { phase: q, ...PHASE_META[q], timeframe: 'Yearly' }
}

function getMonthlyQuarter() {
  const { getDate, getFullYear, getMonth } = Date.prototype
  const now = new Date()
  const day = now.getDate()
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const pct = day / days
  const q = pct <= 0.25 ? 'Q1' : pct <= 0.5 ? 'Q2' : pct <= 0.75 ? 'Q3' : 'Q4'
  return { phase: q, ...PHASE_META[q], timeframe: 'Monthly', dayOfMonth: day, daysInMonth: days }
}

function getWeeklyQuarter() {
  const day = new Date().getDay() // 0=Sun … 6=Sat
  // Mon=Q1, Tue=Q2, Wed-Thu=Q3, Fri=Q4, weekend=Q4
  const q = day === 1 ? 'Q1' : day === 2 ? 'Q2' : (day === 3 || day === 4) ? 'Q3' : 'Q4'
  const names = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 0: 'Sunday', 6: 'Saturday' }
  return { phase: q, ...PHASE_META[q], timeframe: 'Weekly', dayName: names[day] }
}

// ─── Session Model (ICT) ──────────────────────────────────────────────────────
export function getSessionModel() {
  const now = new Date()
  const h = now.getUTCHours()
  const m = now.getUTCMinutes()
  const t = h + m / 60

  if (t < 7)  return { session: 'Asian',       phase: 'Q1 Accumulation', model: 'Range Building',          color: '#06b6d4', expectation: 'Mark equal highs/lows as liquidity targets for London manipulation.',           active: false }
  if (t < 9)  return { session: 'London Open', phase: 'Q2 Manipulation', model: 'London Judas Swing',      color: '#f59e0b', expectation: 'Classic Judas swing — false move first. Wait for stop hunt + MSS before entry.', active: true  }
  if (t < 12) return { session: 'London',      phase: 'Q3 Expansion',    model: 'London Expansion',        color: '#f59e0b', expectation: 'Post-Judas expansion phase. OB/FVG entries with trend after MSS confirmed.',     active: true  }
  if (t < 14) return { session: 'NY Open',     phase: 'Q2/Q3 Mixed',     model: 'NY Reversal / Cont.',     color: '#22c55e', expectation: 'NY open may reverse or amplify London. DXY and news data impact highest here.',   active: true  }
  if (t < 17) return { session: 'NY AM',       phase: 'Q3 Expansion',    model: 'NY AM Distribution',     color: '#22c55e', expectation: 'Post-news expansion. Enter OB/FVG after initial NY volatility settles.',          active: true  }
  if (t < 21) return { session: 'NY PM',       phase: 'Q4 Distribution', model: 'End of Day Close',        color: '#3b82f6', expectation: 'Institutions close intraday positions. Avoid new entries. Monitor EOD sweeps.',   active: false }
  return       { session: 'After Hours',        phase: 'Dead Zone',        model: 'Off Session',             color: '#64748b', expectation: 'No institutional activity. High slippage. Avoid trading.',                        active: false }
}

// ─── DXY Correlation Proxy ────────────────────────────────────────────────────
// Gold has strong inverse correlation with DXY.
// Rising gold momentum → DXY weakening → bullish tailwind.
function deriveDXY(prices) {
  if (prices.length < 10) return { bias: 'Unknown', strength: 0, implication: 'Insufficient data', bullish: null }
  const w = prices.slice(-20)
  const move = w[0] > 0 ? ((w[w.length - 1] - w[0]) / w[0]) * 100 : 0
  if (move > 0.15) return { bias: 'Weak DXY',    strength: Math.min(100, Math.round(move * 25)), implication: 'Dollar weakness supports gold upside', bullish: true  }
  if (move < -0.15) return { bias: 'Strong DXY', strength: Math.min(100, Math.round(Math.abs(move) * 25)), implication: 'Dollar strength caps gold rally', bullish: false }
  return               { bias: 'Neutral DXY',    strength: 0, implication: 'DXY range-bound, no clear directional pressure', bullish: null }
}

// ─── Bond Yield Proxy ─────────────────────────────────────────────────────────
// Falling real yields → supportive for gold. Rising yields → headwind.
function deriveBonds(prices) {
  if (prices.length < 15) return { bias: 'Unknown', status: 'Neutral', implication: 'Insufficient data', bullish: null }
  const w = prices.slice(-30)
  const move = w[0] > 0 ? ((w[w.length - 1] - w[0]) / w[0]) * 100 : 0
  if (move > 0.25) return { bias: 'Declining Yields', status: 'Supportive', implication: 'Real yields declining — favorable for gold accumulation', bullish: true  }
  if (move < -0.25) return { bias: 'Rising Yields',   status: 'Headwind',   implication: 'Rising yields reduce gold attractiveness vs bonds', bullish: false }
  return               { bias: 'Stable Yields',        status: 'Neutral',    implication: 'Yield environment neutral — no directional pressure', bullish: null  }
}

// ─── Risk Sentiment ───────────────────────────────────────────────────────────
function deriveRiskSentiment(prices, livePrice) {
  if (prices.length < 8) return { sentiment: 'Neutral', regime: 'Unknown', safeHavenDemand: false, bullish: null }
  const recent = prices.slice(-8)
  const avgMove = recent.reduce((a, p, i) => i === 0 ? a : a + Math.abs(p - recent[i - 1]), 0) / recent.length
  const w20 = prices.slice(-20)
  const momentum = w20[0] > 0 ? ((livePrice - w20[0]) / w20[0]) * 100 : 0
  const highVolatility = avgMove > 0.5
  const strongUp = momentum > 0.4
  const strongDown = momentum < -0.4

  if (strongUp && highVolatility) return { sentiment: 'Risk-Off / Safe Haven', regime: 'Crisis',      safeHavenDemand: true,  bullish: true  }
  if (strongUp)                    return { sentiment: 'Risk-Off',              regime: 'Cautious',    safeHavenDemand: false, bullish: true  }
  if (strongDown)                  return { sentiment: 'Risk-On',               regime: 'Optimistic',  safeHavenDemand: false, bullish: false }
  return                           { sentiment: 'Neutral',                      regime: 'Balanced',    safeHavenDemand: false, bullish: null  }
}

// ─── Institutional Flow Analysis ──────────────────────────────────────────────
function deriveInstitutionalFlow(prices, livePrice) {
  if (prices.length < 15) return { flow: 'Unknown', phase: 'Scanning', accumulationDetected: false, distributionDetected: false, expansionDetected: false, engineeredHighs: false, engineeredLows: false, inducementDetected: false }

  const w = prices.slice(-20)
  const highs = [], lows = []
  for (let i = 1; i < w.length - 1; i++) {
    if (w[i] > w[i - 1] && w[i] > w[i + 1]) highs.push(w[i])
    if (w[i] < w[i - 1] && w[i] < w[i + 1]) lows.push(w[i])
  }

  const risingLows  = lows.length >= 2  && lows[lows.length - 1]   > lows[lows.length - 2]
  const fallingHighs = highs.length >= 2 && highs[highs.length - 1] < highs[highs.length - 2]
  const risingHighs  = highs.length >= 2 && highs[highs.length - 1] > highs[highs.length - 2]
  const avg = w.reduce((a, b) => a + b, 0) / w.length
  const range = Math.max(...w) - Math.min(...w)
  const compression = avg > 0 && range / avg < 0.003

  const accumulationDetected = risingLows && compression
  const distributionDetected = fallingHighs && livePrice > avg
  const expansionDetected    = risingHighs && risingLows

  // Engineered liquidity: multiple ticks within tolerance of recent extremes
  const tol = Math.max(0.3, livePrice * 0.00015)
  const last5 = w.slice(-5)
  const maxP = Math.max(...last5)
  const minP = Math.min(...last5)
  const engineeredHighs = last5.filter(p => Math.abs(p - maxP) <= tol).length >= 2
  const engineeredLows  = last5.filter(p => Math.abs(p - minP) <= tol).length >= 2
  const inducementDetected = engineeredHighs || engineeredLows

  let flow, phase
  if (accumulationDetected)      { flow = 'Accumulating'; phase = 'Institutional Accumulation — compression before expansion' }
  else if (distributionDetected) { flow = 'Distributing'; phase = 'Institutional Distribution — offloading into retail' }
  else if (expansionDetected)    { flow = 'Expanding';    phase = 'Expansion Phase — directional institutional move' }
  else                           { flow = 'Neutral';      phase = 'Range / Consolidation' }

  return { flow, phase, accumulationDetected, distributionDetected, expansionDetected, engineeredHighs, engineeredLows, inducementDetected }
}

// ─── Macro Score ──────────────────────────────────────────────────────────────
function computeMacroScore(dxy, bonds, risk, instFlow, yearlyQ, monthlyQ, weeklyQ) {
  let bull = 0, bear = 0
  if (dxy.bullish === true)   bull += 20; else if (dxy.bullish === false) bear += 20
  if (bonds.bullish === true) bull += 15; else if (bonds.bullish === false) bear += 15
  if (risk.bullish === true)  bull += 20; else if (risk.bullish === false) bear += 10

  if (instFlow.flow === 'Accumulating') bull += 15
  if (instFlow.flow === 'Distributing') bear += 15
  if (instFlow.flow === 'Expanding')    { bull += 5; bear += 5 }

  // Quarterly phase adjustments
  const expPhase = yearlyQ.phase === 'Q3' || monthlyQ.phase === 'Q3' || weeklyQ.phase === 'Q3'
  if (expPhase) { bull += 5; bear += 5 }
  if (yearlyQ.phase === 'Q1' || monthlyQ.phase === 'Q1') bull += 5 // Accumulation = slight bull lean

  const total = bull + bear
  const pct   = total > 0 ? Math.round((bull / total) * 100) : 50
  const net   = bull - bear
  const bias  = net > 30 ? 'Strong Bullish' : net > 15 ? 'Bullish' : net < -30 ? 'Strong Bearish' : net < -15 ? 'Bearish' : 'Neutral'
  const direction = net > 5 ? 'BUY' : net < -5 ? 'SELL' : 'NEUTRAL'
  const color = direction === 'BUY' ? '#22c55e' : direction === 'SELL' ? '#ef4444' : '#94a3b8'
  return { bias, direction, color, pct, bullScore: bull, bearScore: bear }
}

// ─── AI Market Narrative ──────────────────────────────────────────────────────
function buildNarrative(macroScore, dxy, bonds, risk, instFlow, sessionModel, yearlyQ, monthlyQ, weeklyQ, smcSetup) {
  const parts = []

  // DXY / macro backdrop
  if (dxy.bias === 'Weak DXY')    parts.push(`Dollar showing weakness — ${dxy.implication}.`)
  else if (dxy.bias === 'Strong DXY') parts.push(`Dollar strength in play — ${dxy.implication}.`)
  else                             parts.push('Dollar index range-bound, providing no decisive directional pressure on gold.')

  // Bond yields
  if (bonds.bias === 'Declining Yields') parts.push('Declining real yields support gold as an alternative store of value.')
  else if (bonds.bias === 'Rising Yields') parts.push('Rising Treasury yields create headwinds — opportunity cost of holding gold increases.')

  // Risk sentiment
  if (risk.safeHavenDemand) parts.push('Elevated risk aversion is driving safe haven demand into gold.')
  else if (risk.sentiment === 'Risk-On') parts.push('Risk-on environment reducing safe haven flows away from gold.')

  // Quarterly context
  parts.push(`${yearlyQ.phase} ${yearlyQ.name} (yearly) — ${yearlyQ.desc.split('.')[0]}.`)
  parts.push(`This week is ${weeklyQ.dayName} — ${weeklyQ.name}: ${weeklyQ.desc.split('.')[0]}.`)

  // Institutional flow
  if (instFlow.accumulationDetected) parts.push('Price compression detected — institutional accumulation underway; expansion imminent.')
  else if (instFlow.distributionDetected) parts.push('Distribution activity visible in price structure — smart money offloading.')
  if (instFlow.inducementDetected) parts.push('Engineered liquidity (inducement) detected — stop hunt likely precedes the true directional move.')

  // Session
  parts.push(`${sessionModel.session} session (${sessionModel.model}): ${sessionModel.expectation}`)

  // Confluence with technical setup
  if (smcSetup) {
    const aligned = macroScore.direction !== 'NEUTRAL' && smcSetup.direction === macroScore.direction
    if (aligned) parts.push(`MACRO CONFLUENCE: ${smcSetup.direction} technical setup aligns with ${macroScore.bias} macro bias — elevated probability.`)
    else if (macroScore.direction !== 'NEUTRAL') parts.push(`Caution: ${smcSetup.direction} technical setup diverges from ${macroScore.bias} macro bias — reduce position size.`)
  } else {
    parts.push(`Macro bias is ${macroScore.bias} — monitor for ${macroScore.direction === 'BUY' ? 'sell-side liquidity sweep + bullish MSS' : macroScore.direction === 'SELL' ? 'buy-side liquidity sweep + bearish MSS' : 'a decisive structural break'} to trigger entry model.`)
  }

  return parts.join(' ')
}

// ─── Alert Generator ──────────────────────────────────────────────────────────
function buildMacroAlerts(macroScore, instFlow, yearlyQ, monthlyQ, weeklyQ, sessionModel, smcSetup) {
  const alerts = []
  if (instFlow.accumulationDetected)  alerts.push({ type: 'ACCUM',     message: 'Institutional accumulation detected — price compression, expansion imminent', level: 'high' })
  if (instFlow.distributionDetected)  alerts.push({ type: 'DISTRIB',   message: 'Institutional distribution — reversal risk elevated, tighten stops', level: 'high' })
  if (instFlow.inducementDetected)    alerts.push({ type: 'INDUCEMENT',message: 'Engineered liquidity (inducement) — trap setup before true move', level: 'medium' })
  if (weeklyQ.phase === 'Q2')         alerts.push({ type: 'MANIP',     message: `Weekly Q2 (${weeklyQ.dayName}) manipulation phase — Judas swing expected, wait for MSS`, level: 'medium' })
  if (monthlyQ.phase === 'Q2')        alerts.push({ type: 'MONTHLY_Q2',message: 'Monthly manipulation zone — mid-month stop hunts common', level: 'low' })
  if (!sessionModel.active)           alerts.push({ type: 'SESSION',   message: `${sessionModel.session}: ${sessionModel.expectation.split('.')[0]}`, level: 'low' })
  if (smcSetup) {
    const aligned = macroScore.direction !== 'NEUTRAL' && smcSetup.direction === macroScore.direction
    if (aligned && smcSetup.confidence >= 50)
      alerts.push({ type: 'CONFLUENCE', message: `HIGH CONFLUENCE: ${smcSetup.direction} — macro ${macroScore.bias} + technical setup aligned`, level: 'high' })
  }
  return alerts
}

// ─── Confidence Boost ─────────────────────────────────────────────────────────
function computeConfidenceBoost(macroScore, instFlow, yearlyQ, monthlyQ, weeklyQ, sessionModel, smcSetup) {
  if (!smcSetup) return 0
  let boost = 0
  if (macroScore.direction !== 'NEUTRAL' && smcSetup.direction === macroScore.direction) boost += 12
  if (yearlyQ.phase === 'Q3' || monthlyQ.phase === 'Q3' || weeklyQ.phase === 'Q3') boost += 5
  if (sessionModel.phase.includes('Expansion')) boost += 8
  if (instFlow.flow === 'Accumulating' && smcSetup.direction === 'BUY')  boost += 5
  if (instFlow.flow === 'Distributing' && smcSetup.direction === 'SELL') boost += 5
  if (macroScore.bias === 'Strong Bullish' && smcSetup.direction === 'BUY')  boost += 5
  if (macroScore.bias === 'Strong Bearish' && smcSetup.direction === 'SELL') boost += 5
  return boost
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export function buildMacroAnalysis(priceHistory, livePrice, smcSetup = null) {
  const prices = priceHistory.map(p => p.price).filter(Number.isFinite)

  const yearlyQ  = getYearlyQuarter()
  const monthlyQ = getMonthlyQuarter()
  const weeklyQ  = getWeeklyQuarter()
  const sessionModel = getSessionModel()
  const dxy      = deriveDXY(prices)
  const bonds    = deriveBonds(prices)
  const risk     = deriveRiskSentiment(prices, livePrice)
  const instFlow = deriveInstitutionalFlow(prices, livePrice)
  const macroScore = computeMacroScore(dxy, bonds, risk, instFlow, yearlyQ, monthlyQ, weeklyQ)
  const narrative  = buildNarrative(macroScore, dxy, bonds, risk, instFlow, sessionModel, yearlyQ, monthlyQ, weeklyQ, smcSetup)
  const macroAlerts = buildMacroAlerts(macroScore, instFlow, yearlyQ, monthlyQ, weeklyQ, sessionModel, smcSetup)
  const confidenceBoost = computeConfidenceBoost(macroScore, instFlow, yearlyQ, monthlyQ, weeklyQ, sessionModel, smcSetup)

  return {
    quarterly: { year: yearlyQ, monthly: monthlyQ, weekly: weeklyQ },
    dxy,
    bonds,
    risk,
    instFlow,
    sessionModel,
    macroScore,
    narrative,
    macroAlerts,
    confidenceBoost,
  }
}
