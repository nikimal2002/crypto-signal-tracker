const Signals = (() => {

  // --- helpers ---
  function ma(arr, period) {
    return arr.map((_, i) => {
      if (i < period - 1) return null;
      return arr.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
    });
  }

  function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, v)); }

  // --- signal 1: developer activity (on-chain fundamentals proxy) ---
  function devActivity(coinData) {
    const dev = coinData.developer_data || {};
    let score = 0;
    const commits = dev.commit_count_4_weeks || 0;
    const stars = dev.stars || 0;
    const issues = dev.closed_issues || 0;
    const forks = dev.forks || 0;
    const subscribers = dev.subscribers || 0;
    score += clamp(commits * 2.5, 0, 35);
    score += clamp(stars / 1500, 0, 20);
    score += clamp(issues / 12, 0, 20);
    score += clamp(forks / 800, 0, 15);
    score += clamp(subscribers / 400, 0, 10);
    const reasons = [];
    if (commits > 10) reasons.push(`${commits} commit/4w`);
    if (stars > 1000) reasons.push(`${stars.toLocaleString()} stars`);
    if (issues > 5) reasons.push(`${issues} issue chiuse`);
    return { score: clamp(Math.round(score)), reasons };
  }

  // --- signal 2: whale accumulation (volume + price behavior) ---
  function whaleFlow(coinData) {
    const md = coinData.market_data || {};
    const vol = md.total_volume?.eur || md.total_volume?.usd || 0;
    const mcap = md.market_cap?.eur || md.market_cap?.usd || 1;
    const p24h = md.price_change_percentage_24h || 0;
    const p7d = md.price_change_percentage_7d || 0;
    const volRatio = vol / mcap;
    let score = 40;
    score += clamp(volRatio * 800, 0, 30);
    if (p24h > 3 && volRatio > 0.04) score += 20;
    else if (p24h > 1) score += 10;
    else if (p24h < -5) score -= 15;
    if (p7d > 10) score += 15;
    else if (p7d > 5) score += 8;
    else if (p7d < -10) score -= 10;
    const reasons = [];
    if (volRatio > 0.08) reasons.push(`Volume/MCap: ${(volRatio * 100).toFixed(1)}%`);
    if (p24h > 2) reasons.push(`+${p24h.toFixed(1)}% 24h`);
    if (p7d > 5) reasons.push(`+${p7d.toFixed(1)}% 7d`);
    return { score: clamp(Math.round(score)), reasons };
  }

  // --- signal 3: token economics (supply/inflation/FDV) ---
  function tokenomics(coinData) {
    const md = coinData.market_data || {};
    const circ = md.circulating_supply || 0;
    const total = md.total_supply || circ;
    const maxS = md.max_supply;
    const mcap = md.market_cap?.eur || md.market_cap?.usd || 1;
    const fdv = md.fully_diluted_valuation?.eur || md.fully_diluted_valuation?.usd || 0;
    let score = 30;
    const supplyRatio = total > 0 ? circ / total : 0.5;
    score += Math.round(supplyRatio * 30);
    if (maxS && maxS > 0) score += 15;
    const fdvRatio = fdv > 0 ? fdv / mcap : 1;
    if (fdvRatio < 1.5) score += 25;
    else if (fdvRatio < 3) score += 15;
    else if (fdvRatio < 6) score += 8;
    const reasons = [];
    if (supplyRatio > 0.85) reasons.push(`${(supplyRatio * 100).toFixed(0)}% supply circolante`);
    if (maxS) reasons.push('Supply massima definita');
    if (fdvRatio < 2) reasons.push(`FDV/MCap: ${fdvRatio.toFixed(1)}x`);
    return { score: clamp(Math.round(score)), reasons };
  }

  // --- signal 4: catalyst (momentum vs ATH, sentiment, rank) ---
  function catalyst(coinData) {
    const md = coinData.market_data || {};
    const athDiff = md.ath_change_percentage?.eur || md.ath_change_percentage?.usd || -50;
    const rank = coinData.market_cap_rank || 999;
    const sentiment = coinData.sentiment_votes_up_percentage || 50;
    let score = 20;
    if (athDiff > -15) score += 30;
    else if (athDiff > -35) score += 20;
    else if (athDiff > -60) score += 10;
    if (rank <= 10) score += 25;
    else if (rank <= 30) score += 18;
    else if (rank <= 100) score += 10;
    score += Math.round((sentiment / 100) * 25);
    const reasons = [];
    if (athDiff > -20) reasons.push(`${athDiff.toFixed(0)}% da ATH`);
    if (rank <= 20) reasons.push(`Rank #${rank}`);
    if (sentiment > 65) reasons.push(`Sentiment ${sentiment.toFixed(0)}%`);
    return { score: clamp(Math.round(score)), reasons };
  }

  // --- signal 5: sector rotation (BTC dominance + relative strength) ---
  function sectorRotation(coinData, globalData) {
    const md = coinData.market_data || {};
    const id = coinData.id;
    const btcDom = globalData?.market_cap_percentage?.btc || 50;
    const p7dVsBtc = md.price_change_percentage_7d_in_currency?.btc || 0;
    const p30d = md.price_change_percentage_30d || 0;
    const LAYER1 = ['ethereum', 'solana', 'avalanche-2', 'polkadot', 'cardano', 'near', 'cosmos'];
    const DEFI = ['uniswap', 'aave', 'maker', 'compound-governance-token', 'curve-dao-token'];
    const isBTC = id === 'bitcoin';
    const isL1 = LAYER1.includes(id);
    const isDeFi = DEFI.includes(id);
    let score = 45;
    if (isBTC) { score = btcDom > 52 ? 75 : btcDom > 45 ? 60 : 50; }
    else if (isL1) { score = btcDom < 48 ? 72 : btcDom > 55 ? 45 : 60; }
    else if (isDeFi) { score = btcDom < 43 ? 80 : btcDom < 50 ? 65 : 40; }
    else { score = 50; }
    score += clamp(p7dVsBtc * 1.5, -20, 20);
    if (p30d > 15) score += 10;
    else if (p30d < -15) score -= 10;
    const reasons = [];
    reasons.push(`BTC dom: ${btcDom.toFixed(1)}%`);
    if (Math.abs(p7dVsBtc) > 3) reasons.push(`vs BTC 7d: ${p7dVsBtc > 0 ? '+' : ''}${p7dVsBtc.toFixed(1)}%`);
    return { score: clamp(Math.round(score)), reasons };
  }

  // --- composite ---
  function computeAll(coinData, globalData, weights = { dev: 20, whale: 20, tokenomics: 20, catalyst: 20, rotation: 20 }) {
    const dev = devActivity(coinData);
    const whale = whaleFlow(coinData);
    const tok = tokenomics(coinData);
    const cat = catalyst(coinData);
    const rot = sectorRotation(coinData, globalData);
    const tw = weights.dev + weights.whale + weights.tokenomics + weights.catalyst + weights.rotation;
    const composite = Math.round(
      (dev.score * weights.dev + whale.score * weights.whale +
       tok.score * weights.tokenomics + cat.score * weights.catalyst +
       rot.score * weights.rotation) / tw
    );
    return { dev, whale, tokenomics: tok, catalyst: cat, rotation: rot, composite };
  }

  // --- backtesting signal (price-series based) ---
  function scoreFromPrices(prices, volumes, idx, activeSet) {
    if (idx < 20) return 50;
    let total = 0, count = 0;
    const p = prices;
    const i = idx;

    if (activeSet.has('momentum')) {
      const r5 = (p[i] - p[i - 5]) / p[i - 5];
      const r10 = (p[i] - p[i - 10]) / p[i - 10];
      let s = 50;
      if (r5 > 0.06) s += 28; else if (r5 > 0.02) s += 14; else if (r5 < -0.06) s -= 22;
      if (r10 > 0.12) s += 14; else if (r10 < -0.12) s -= 14;
      total += clamp(s); count++;
    }

    if (activeSet.has('volume') && volumes?.[i]) {
      const window = volumes.slice(Math.max(0, i - 14), i);
      const avgVol = window.length ? window.reduce((a, b) => a + b, 0) / window.length : 1;
      const vr = avgVol > 0 ? volumes[i] / avgVol : 1;
      const up = p[i] >= p[i - 1];
      let s = 50;
      if (vr > 2.2 && up) s = 88; else if (vr > 1.5 && up) s = 72;
      else if (vr > 2 && !up) s = 28; else if (vr < 0.6) s = 42;
      total += s; count++;
    }

    if (activeSet.has('trend')) {
      const slice = p.slice(0, i + 1);
      const m10 = ma(slice, 10); const m20 = ma(slice, 20);
      const c10 = m10[m10.length - 1]; const c20 = m20[m20.length - 1];
      const pr10 = m10[m10.length - 2]; const pr20 = m20[m20.length - 2];
      let s = 50;
      if (c10 && c20 && pr10 && pr20) {
        if (c10 > c20 && pr10 <= pr20) s = 92;
        else if (c10 > c20) s = 65;
        else if (c10 < c20 && pr10 >= pr20) s = 12;
        else s = 35;
      }
      total += s; count++;
    }

    if (activeSet.has('reversal')) {
      const window = p.slice(Math.max(0, i - 20), i + 1);
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      const dev2 = (p[i] / avg) - 1;
      let s = 50;
      if (dev2 < -0.12) s = 82; else if (dev2 < -0.05) s = 66;
      else if (dev2 > 0.18) s = 28; else if (dev2 > 0.08) s = 40;
      total += s; count++;
    }

    if (activeSet.has('volatility')) {
      const window = p.slice(Math.max(0, i - 14), i + 1);
      const rets = window.slice(1).map((v, j) => Math.abs((v - window[j]) / window[j]));
      const avgV = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
      const recentV = rets.slice(-3).reduce((a, b) => a + b, 0) / 3;
      let s = 50;
      if (recentV < avgV * 0.45) s = 78; else if (recentV < avgV * 0.7) s = 63;
      else if (recentV > avgV * 2.2) s = 28;
      total += s; count++;
    }

    return count > 0 ? Math.round(total / count) : 50;
  }

  return { computeAll, scoreFromPrices, ma };
})();
