const Backtest = (() => {

  function run(prices, volumes, labels, opts, activeSet) {
    const { entryThresh, stopPct, tpPct, capitalInit, posSizePct } = opts;
    const stopMult = 1 - stopPct / 100;
    const tpMult = 1 + tpPct / 100;
    const posSize = posSizePct / 100;

    let cash = capitalInit;
    const equity = [capitalInit];
    const bh = [capitalInit];
    const scores = [];
    const trades = [];

    let inTrade = false;
    let entryPrice = 0, entryIdx = 0, entryScore = 0;

    for (let i = 0; i < prices.length; i++) {
      const score = Signals.scoreFromPrices(prices, volumes, i, activeSet);
      scores.push(score);
      bh.push(capitalInit * (prices[i] / prices[0]));

      if (!inTrade && score >= entryThresh && i < prices.length - 1) {
        inTrade = true;
        entryPrice = prices[i + 1];
        entryIdx = i + 1;
        entryScore = score;
      } else if (inTrade) {
        const pnlPct = (prices[i] - entryPrice) / entryPrice;
        let reason = null;
        if (prices[i] <= entryPrice * stopMult) reason = 'stop loss';
        else if (prices[i] >= entryPrice * tpMult) reason = 'take profit';
        else if (score < 35) reason = 'segnale uscita';
        else if (i === prices.length - 1) reason = 'fine periodo';
        if (reason) {
          const pnlEur = cash * posSize * pnlPct;
          cash += pnlEur;
          inTrade = false;
          trades.push({
            entryIdx, exitIdx: i,
            entryDate: labels[entryIdx] || '', exitDate: labels[i] || '',
            entryPrice, exitPrice: prices[i],
            pnlPct: pnlPct * 100,
            pnlEur,
            reason,
            score: entryScore
          });
        }
      }
      equity.push(cash);
    }

    return { equity, bh, scores, trades };
  }

  function stats(equity, trades, bh) {
    const init = equity[0];
    const final = equity[equity.length - 1];
    const totalReturn = (final - init) / init * 100;
    const bhReturn = (bh[bh.length - 1] - bh[0]) / bh[0] * 100;

    let maxDD = 0, peak = init;
    for (const c of equity) {
      if (c > peak) peak = c;
      const dd = (peak - c) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }

    const wins = trades.filter(t => t.pnlPct > 0);
    const losses = trades.filter(t => t.pnlPct <= 0);
    const winRate = trades.length ? wins.length / trades.length * 100 : 0;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
    const profitFactor = losses.length && avgLoss !== 0
      ? Math.abs((avgWin * wins.length) / (avgLoss * losses.length))
      : wins.length > 0 ? 999 : 0;

    const dailyRets = equity.slice(1).map((c, i) => (c - equity[i]) / equity[i]);
    const mu = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length;
    const sigma = Math.sqrt(dailyRets.reduce((s, r) => s + Math.pow(r - mu, 2), 0) / dailyRets.length);
    const sharpe = sigma > 0 ? (mu / sigma) * Math.sqrt(365) : 0;

    return {
      totalReturn, bhReturn, maxDD, winRate, avgWin, avgLoss,
      profitFactor, sharpe, nTrades: trades.length,
      nWins: wins.length, nLosses: losses.length,
      finalCapital: final, initCapital: init
    };
  }

  return { run, stats };
})();
