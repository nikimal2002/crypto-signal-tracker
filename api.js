const API = (() => {
  const BASE = 'https://api.coingecko.com/api/v3';
  const cache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 min

  async function get(path, params = {}) {
    const url = new URL(BASE + path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const key = url.toString();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`CoinGecko ${r.status}: ${r.statusText}`);
    const data = await r.json();
    cache.set(key, { data, ts: Date.now() });
    return data;
  }

  async function getCoinDetail(id) {
    return get(`/coins/${id}`, {
      localization: false, tickers: false,
      market_data: true, community_data: true, developer_data: true, sparkline: false
    });
  }

  async function getMarketChart(id, days) {
    return get(`/coins/${id}/market_chart`, { vs_currency: 'eur', days, interval: 'daily' });
  }

  async function getOHLC(id, days) {
    return get(`/coins/${id}/ohlc`, { vs_currency: 'eur', days });
  }

  async function getGlobal() {
    const d = await get('/global');
    return d.data;
  }

  async function getMarketsPage(ids) {
    return get('/coins/markets', {
      vs_currency: 'eur', ids: ids.join(','),
      order: 'market_cap_desc', sparkline: false,
      price_change_percentage: '24h,7d'
    });
  }

  function clearCache() { cache.clear(); }

  return { getCoinDetail, getMarketChart, getOHLC, getGlobal, getMarketsPage, clearCache };
})();
