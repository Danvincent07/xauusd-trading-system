const GOLD_API_URL = import.meta.env.VITE_GOLD_API_URL ?? 'https://api.gold-api.com/price/XAU'

export async function fetchLiveGoldQuote(signal) {
  const response = await fetch(GOLD_API_URL, { signal })

  if (!response.ok) {
    throw new Error(`Gold API request failed: ${response.status}`)
  }

  const payload = await response.json()
  const price = Number(payload.price)

  if (!Number.isFinite(price)) {
    throw new Error('Gold API returned an invalid price')
  }

  return {
    price,
    updatedAt: payload.updatedAt ?? null,
    updatedAtReadable: payload.updatedAtReadable ?? null,
  }
}