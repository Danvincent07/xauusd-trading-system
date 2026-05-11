// ── EMA ──────────────────────────────────────────────────────────────────────
export function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const result = [];
  let ema = data[0];
  for (let i = 0; i < data.length; i++) {
    ema = i === 0 ? data[i] : data[i] * k + ema * (1 - k);
    result.push(parseFloat(ema.toFixed(2)));
  }
  return result;
}

// ── RSI ──────────────────────────────────────────────────────────────────────
export function calcRSI(closes, period = 14) {
  const result = new Array(period).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result.push(parseFloat((100 - 100 / (1 + avgGain / (avgLoss || 0.001))).toFixed(2)));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    result.push(parseFloat((100 - 100 / (1 + avgGain / (avgLoss || 0.001))).toFixed(2)));
  }
  return result;
}

// ── VWAP Deviation ────────────────────────────────────────────────────────────
export function calcVWAPDeviation(price, vwap) {
  return parseFloat(((price - vwap) / vwap * 100).toFixed(3));
}

// ── Position Sizing ───────────────────────────────────────────────────────────
export function calcPositionSize(accountBalance, riskPercent, stopLossDistance) {
  if (!stopLossDistance || stopLossDistance <= 0) return 0;
  const riskAmount = accountBalance * (riskPercent / 100);
  return parseFloat((riskAmount / stopLossDistance).toFixed(4));
}

// ── Risk/Reward ──────────────────────────────────────────────────────────────
export function calcRiskReward(entry, stop, target) {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (!risk) return 0;
  return parseFloat((reward / risk).toFixed(2));
}

// ── Confluence Score ──────────────────────────────────────────────────────────
export function calcConfluenceScore(inputs) {
  let score = 0;
  if (inputs.emaAligned) score += 30;
  if (inputs.vwapAligned) score += 30;
  if (inputs.rsiAligned) score += 20;
  if (inputs.macdAligned) score += 20;
  return score;
}
