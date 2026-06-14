const Alerts = (() => {
  const KEY = 'csa_alerts';
  const LOG_KEY = 'csa_alert_log';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  }

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
  }

  function saveLog(log) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-100))); } catch {}
  }

  function add(alert) {
    const list = load();
    list.push({ ...alert, id: Date.now(), active: true, createdAt: new Date().toISOString() });
    save(list);
    return list;
  }

  function remove(id) {
    const list = load().filter(a => a.id !== id);
    save(list);
    return list;
  }

  function toggle(id) {
    const list = load().map(a => a.id === id ? { ...a, active: !a.active } : a);
    save(list);
    return list;
  }

  function check(scannerData) {
    const alerts = load().filter(a => a.active);
    const log = loadLog();
    const triggered = [];

    for (const alert of alerts) {
      const coin = scannerData.find(d => d.id === alert.coinId);
      if (!coin?.signals) continue;
      const sig = coin.signals;
      let fire = false;
      let message = '';

      switch (alert.type) {
        case 'score_above':
          if (sig.composite >= alert.threshold) {
            fire = true;
            message = `${coin.name}: score ${sig.composite} ≥ soglia ${alert.threshold}`;
          }
          break;
        case 'score_below':
          if (sig.composite < alert.threshold) {
            fire = true;
            message = `${coin.name}: score ${sig.composite} < soglia ${alert.threshold}`;
          }
          break;
        case 'whale_buy':
          if (sig.whale.score >= 70) {
            fire = true;
            message = `${coin.name}: whale flow forte (${sig.whale.score}/100)`;
          }
          break;
        case 'dev_spike':
          if (sig.dev.score >= 75) {
            fire = true;
            message = `${coin.name}: dev activity spike (${sig.dev.score}/100)`;
          }
          break;
        case 'catalyst':
          if (sig.catalyst.score >= 75) {
            fire = true;
            message = `${coin.name}: catalyst segnale forte (${sig.catalyst.score}/100)`;
          }
          break;
      }

      if (fire) {
        const entry = {
          alertId: alert.id,
          coinId: coin.id,
          coinName: coin.name,
          message,
          type: alert.type,
          score: sig.composite,
          ts: new Date().toISOString()
        };
        log.unshift(entry);
        triggered.push(entry);
      }
    }

    saveLog(log);
    return { triggered, log: loadLog() };
  }

  const TYPE_LABELS = {
    score_above: 'Score ↑ sopra soglia',
    score_below: 'Score ↓ sotto soglia',
    whale_buy: 'Whale flow forte',
    dev_spike: 'Dev activity spike',
    catalyst: 'Catalyst segnale forte'
  };

  return { load, add, remove, toggle, check, loadLog, TYPE_LABELS };
})();
