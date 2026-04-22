export const TIER_1_CURRENCIES = ['GBP','EUR','USD','AUD']
export const TIER_2_CURRENCIES = [
  'BRL','CAD','CNY','DKK','HKD','INR','ILS','JPY','CHF',
  'MYR','MXN','NOK','PKR','PHP','PLN','RON','SGD','ZAR',
  'KRW','SEK','THB','TRY','AED','VND','HNL','HUF','IDR','NZD'
]
export const TIER_3_CURRENCIES = [
  'ARS','CRC','GEL','KES','MAD','NPR','LKR','TZS','UGX',
  'UYU','NGN','BDT','EGP','COP','UAH','BGN','CLP'
]

export function parseCurrencyAnswer(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map(c => c.trim().toUpperCase())
    .filter(Boolean)
}

export function getBspMarketTier(currencies: string[]): 1 | 2 | 3 | null {
  if (currencies.length === 0) return null
  const upper = currencies.map(c => c.toUpperCase())
  if (upper.some(c => TIER_1_CURRENCIES.includes(c))) return 1
  if (upper.some(c => TIER_2_CURRENCIES.includes(c))) return 2
  if (upper.some(c => TIER_3_CURRENCIES.includes(c))) return 3
  return null
}
