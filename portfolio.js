const Portfolio = (() => {

  function build(scannerData, opts) {
    const { budget, riskPct, maxPositions } = opts;
    const eligible = scannerData
      .filter(d => d.signals)
      .sort((a, b) => b.signals.composite - a.signals.composite)
      .slice(0, maxPositions);

    if (!eligible.length) return [];

    const totalScore = eligible.reduce((s, d) => s + d.signals.composite, 0);
    const PALETTE = ['#7F77DD', '#1D9E75', '#D85A30', '#378ADD', '#BA7517', '#D4537E', '#639922'];

    return eligible.map((d, i) => {
      const weight = d.signals.composite / totalScore;
      const allocation = budget * weight;
      const riskAmount = budget * riskPct / 100;
      const stopDistance = 0.10;
      const impliedStopPrice = (d.price || 0) * (1 - stopDistance);
      return {
        id: d.id,
        name: d.name,
        symbol: d.symbol,
        price: d.price || 0,
        score: d.signals.composite,
        weight,
        allocation,
        riskAmount,
        stopPrice: impliedStopPrice,
        stopPct: stopDistance * 100,
        color: PALETTE[i % PALETTE.length],
        units: d.price ? allocation / d.price : 0
      };
    });
  }

  function riskFromStop(capitalTotal, riskPctPerTrade, entryPrice, stopPrice) {
    const riskAmount = capitalTotal * riskPctPerTrade / 100;
    const riskPerUnit = entryPrice - stopPrice;
    if (riskPerUnit <= 0) return { units: 0, allocation: 0, riskAmount };
    const units = riskAmount / riskPerUnit;
    return { units, allocation: units * entryPrice, riskAmount };
  }

  return { build, riskFromStop };
})();
