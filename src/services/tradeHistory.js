/**
 * Trade History — Supabase service
 *
 * Run this SQL once in your Supabase SQL Editor to create the table:
 *
 * CREATE TABLE IF NOT EXISTS trade_history (
 *   id           BIGSERIAL PRIMARY KEY,
 *   trade_id     TEXT UNIQUE NOT NULL,
 *   symbol       TEXT NOT NULL DEFAULT 'XAUUSD',
 *   trade_type   TEXT NOT NULL,
 *   entry_price  NUMERIC(10,2) NOT NULL,
 *   tp_price     NUMERIC(10,2) NOT NULL,
 *   sl_price     NUMERIC(10,2) NOT NULL,
 *   exit_price   NUMERIC(10,2),
 *   result       TEXT,
 *   pnl          NUMERIC(10,2),
 *   risk_reward  NUMERIC(6,2),
 *   timeframe    TEXT,
 *   trade_source TEXT,
 *   open_time    TIMESTAMPTZ NOT NULL,
 *   close_time   TIMESTAMPTZ,
 *   status       TEXT NOT NULL DEFAULT 'OPEN',
 *   reasons      TEXT[],
 *   created_at   TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * Enable Row Level Security (optional but recommended):
 * ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Allow all" ON trade_history FOR ALL USING (true);
 */

import { supabase } from './supabase'

const TABLE = 'trade_history'

function calcRR(entry, sl, tp) {
  const risk = Math.abs(entry - sl)
  const reward = Math.abs(tp - entry)
  if (!risk) return 0
  return +(reward / risk).toFixed(2)
}

function tradeToRow(trade) {
  const isBuy = trade.direction === 'BUY'
  const pnl =
    trade.closedPrice != null
      ? isBuy
        ? +(trade.closedPrice - trade.entry).toFixed(2)
        : +(trade.entry - trade.closedPrice).toFixed(2)
      : null

  return {
    trade_id:     String(trade.id),
    symbol:       'XAUUSD',
    trade_type:   trade.direction,
    entry_price:  trade.entry,
    tp_price:     trade.takeProfit,
    sl_price:     trade.stopLoss,
    exit_price:   trade.closedPrice ?? null,
    result:       trade.status === 'TP_HIT' ? 'WIN' : trade.status === 'SL_HIT' ? 'LOSS' : null,
    pnl,
    risk_reward:  calcRR(trade.entry, trade.stopLoss, trade.takeProfit),
    timeframe:    trade.timeframe ?? null,
    trade_source: trade.type ?? 'Manual',
    open_time:    trade.openedAt,
    close_time:   trade.closedAt ?? null,
    status:       trade.status,
    reasons:      trade.reasons ?? [],
    confidence:   trade.confidence ?? null,
  }
}

/** Insert or update a trade record */
export async function upsertTrade(trade) {
  const { error } = await supabase
    .from(TABLE)
    .upsert(tradeToRow(trade), { onConflict: 'trade_id' })
  if (error) console.warn('[tradeHistory] upsert error:', error.message)
  return { error }
}

/**
 * Fetch closed trade history with search, filter, and pagination.
 * @param {{ page?: number, pageSize?: number, search?: string, filter?: 'ALL'|'WIN'|'LOSS'|'BUY'|'SELL' }} opts
 */
export async function fetchHistory({ page = 1, pageSize = 20, search = '', filter = 'ALL' } = {}) {
  let query = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .in('status', ['TP_HIT', 'SL_HIT'])
    .gte('confidence', 55)
    .order('close_time', { ascending: false })

  if (filter === 'WIN')  query = query.eq('result', 'WIN')
  else if (filter === 'LOSS') query = query.eq('result', 'LOSS')
  else if (filter === 'BUY')  query = query.eq('trade_type', 'BUY')
  else if (filter === 'SELL') query = query.eq('trade_type', 'SELL')

  if (search.trim()) {
    query = query.or(
      `trade_type.ilike.%${search}%,trade_source.ilike.%${search}%,timeframe.ilike.%${search}%,result.ilike.%${search}%`,
    )
  }

  const from = (page - 1) * pageSize
  query = query.range(from, from + pageSize - 1)

  const { data, count, error } = await query
  return { data: data ?? [], count: count ?? 0, error }
}

/** Aggregate statistics for all closed trades */
export async function fetchStats() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('result, pnl')
    .in('status', ['TP_HIT', 'SL_HIT'])
    .gte('confidence', 55)
    .order('close_time', { ascending: true })

  if (error || !data) return null

  const total   = data.length
  const wins    = data.filter((t) => t.result === 'WIN').length
  const losses  = data.filter((t) => t.result === 'LOSS').length
  const winRate = total ? +((wins / total) * 100).toFixed(1) : 0
  const netPnl  = +data.reduce((s, t) => s + (t.pnl ?? 0), 0).toFixed(2)

  let winStreak = 0, lossStreak = 0, curW = 0, curL = 0
  for (const t of data) {
    if (t.result === 'WIN')  { curW++; curL = 0; winStreak  = Math.max(winStreak,  curW) }
    if (t.result === 'LOSS') { curL++; curW = 0; lossStreak = Math.max(lossStreak, curL) }
  }

  return { total, wins, losses, winRate, netPnl, winStreak, lossStreak }
}

/** Subscribe to real-time changes on the trade_history table */
export function subscribeToHistory(callback) {
  return supabase
    .channel('trade_history_rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, callback)
    .subscribe()
}
