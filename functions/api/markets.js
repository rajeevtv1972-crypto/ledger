export async function onRequestGet(context) {
  const upstream = new URL('https://api.coingecko.com/api/v3/coins/markets')
  upstream.search = new URLSearchParams({
    vs_currency: 'usd',
    order: 'market_cap_desc',
    per_page: '100',
    page: '1',
    sparkline: 'false',
    price_change_percentage: '24h'
  }).toString()
  const headers = {}
  if (context.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = context.env.COINGECKO_API_KEY
  const response = await fetch(upstream.toString(), { headers })
  const body = await response.text()
  return new Response(body, {
    status: response.status,
    headers: {'content-type': response.headers.get('content-type') || 'application/json','cache-control':'public, max-age=30'}
  })
}