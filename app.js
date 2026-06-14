const App = (() => {
  // ── state ──────────────────────────────────────────────────────────────
  const DEFAULT_WATCHLIST = ['bitcoin', 'ethereum', 'solana', 'chainlink', 'avalanche-2', 'polkadot'];
  const STORAGE_KEY = 'csa_state';
  const PALETTE = ['#F0B429', '#2DD4A7', '#9D8DF1', '#5B9DFF', '#F4694C', '#ED93B1', '#97C459'];

  // signature element: composite score as SVG ring gauge
  function scoreRing(score, size = 58) {
    const r = (size / 2) - 5;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - score / 100);
    const color = score >= 72 ? 'var(--teal)' : score >= 50 ? 'var(--amber)' : 'var(--coral)';
    return `
    <div class="score-ring" style="width:${size}px;height:${size}px" role="img" aria-label="Composite score ${score} su 100">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle class="ring-bg" cx="${size/2}" cy="${size/2}" r="${r}"></circle>
        <circle class="ring-val" cx="${size/2}" cy="${size/2}" r="${r}"
          stroke="${color}" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"></circle>
      </svg>
      <div class="ring-num" style="color:${color}">${score}<span class="ring-cap">score</span></div>
    </div>`;
  }

  let state = {
    watchlist: [...DEFAULT_WATCHLIST],
    scannerData: [],
    globalData: null,
    weights: { dev: 20, whale: 20, tokenomics: 20, catalyst: 20, rotation: 20 },
    autoRefreshInterval: 0,
    autoRefreshTimer: null,
    charts: {},
    btActiveSigs: new Set(['momentum', 'volume', 'trend', 'reversal', 'volatility']),
    btResult: null,
    currentPage: 'scanner'
  };

  function loadPersistedState() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (s.watchlist?.length) state.watchlist = s.watchlist;
      if (s.weights) state.weights = { ...state.weights, ...s.weights };
    } catch {}
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ watchlist: state.watchlist, weights: state.weights }));
    } catch {}
  }

  // ── utils ──────────────────────────────────────────────────────────────
  function scoreColor(s) {
    if (s >= 72) return 'var(--teal)';
    if (s >= 50) return 'var(--amber)';
    return 'var(--coral)';
  }

  function scoreClass(s) {
    if (s >= 72) return 'score-high';
    if (s >= 50) return 'score-mid';
    return 'score-low';
  }

  function fmt(n, decimals = 1) { return Number(n.toFixed(decimals)).toLocaleString('it-IT'); }
  function fmtEur(n) { return '€' + Math.round(n).toLocaleString('it-IT'); }
  function fmtPct(n, sign = true) { return (sign && n > 0 ? '+' : '') + n.toFixed(1) + '%'; }

  function setStatus(id, msg, type = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'status-bar' + (type ? ' ' + type : '');
    el.innerHTML = type === 'loading'
      ? `<div class="spinner"></div> ${msg}`
      : msg;
  }

  function destroyChart(key) {
    if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
  }

  // ── navigation ─────────────────────────────────────────────────────────
  function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const page = document.getElementById('page-' + name);
    if (page) page.classList.add('active');
    const tab = document.querySelector(`.nav-tab[data-page="${name}"]`);
    if (tab) tab.classList.add('active');
    state.currentPage = name;
    if (name === 'portfolio') renderPortfolio();
    if (name === 'alerts') renderAlertLog();
    if (name === 'settings') renderSettings();
  }

  // ── data loading ───────────────────────────────────────────────────────
  async function refresh() {
    const btn = document.getElementById('btn-refresh');
    if (btn) { btn.disabled = true; btn.innerHTML = svg('refresh') + ' Aggiornamento...'; }
    setStatus('scanner-status', 'Connessione a CoinGecko...', 'loading');

    try {
      state.globalData = await API.getGlobal();
      const results = [];
      for (let i = 0; i < state.watchlist.length; i++) {
        const id = state.watchlist[i];
        setStatus('scanner-status', `Caricamento ${id} (${i + 1}/${state.watchlist.length})...`, 'loading');
        try {
          if (i > 0) await sleep(800);
          const data = await API.getCoinDetail(id);
          const md = data.market_data || {};
          results.push({
            id,
            name: data.name,
            symbol: (data.symbol || '').toUpperCase(),
            price: md.current_price?.eur || md.current_price?.usd || 0,
            change24h: md.price_change_percentage_24h || 0,
            change7d: md.price_change_percentage_7d || 0,
            mcap: md.market_cap?.eur || 0,
            rank: data.market_cap_rank || 999,
            signals: Signals.computeAll(data, state.globalData, state.weights)
          });
        } catch (e) {
          console.warn('Skip', id, e.message);
        }
      }
      state.scannerData = results;

      // check alerts
      const { triggered } = Alerts.check(state.scannerData);
      if (triggered.length) showAlertToast(triggered);

      setStatus('scanner-status',
        `Aggiornato: ${new Date().toLocaleTimeString('it-IT')} · ${results.length} asset · ${triggered.length} alert attivati`,
        'success');
      document.getElementById('last-update-label').textContent =
        'Aggiornato: ' + new Date().toLocaleTimeString('it-IT');

      renderScanner();
      if (state.currentPage === 'portfolio') renderPortfolio();

    } catch (e) {
      setStatus('scanner-status', 'Errore: ' + e.message + ' · Riprova tra qualche secondo.', 'error');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = svg('refresh') + ' Aggiorna'; }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── scanner rendering ──────────────────────────────────────────────────
  function renderScanner() {
    const filterScore = parseInt(document.getElementById('filter-score')?.value || '0');
    const filterSig = document.getElementById('filter-signal')?.value || 'all';
    const sortBy = document.getElementById('sort-by')?.value || 'composite';

    let coins = state.scannerData.filter(d => {
      if (!d.signals) return false;
      if (d.signals.composite < filterScore) return false;
      if (filterSig !== 'all') {
        const top = Object.entries({
          dev: d.signals.dev.score, whale: d.signals.whale.score,
          tokenomics: d.signals.tokenomics.score, catalyst: d.signals.catalyst.score,
          rotation: d.signals.rotation.score
        }).sort((a, b) => b[1] - a[1])[0][0];
        if (top !== filterSig) return false;
      }
      return true;
    });

    coins.sort((a, b) => {
      if (sortBy === 'composite') return b.signals.composite - a.signals.composite;
      if (sortBy === 'change24h') return b.change24h - a.change24h;
      if (sortBy === 'rank') return (a.rank || 999) - (b.rank || 999);
      return b.signals.composite - a.signals.composite;
    });

    const strong = coins.filter(c => c.signals.composite >= 72).length;
    const avg = coins.length ? Math.round(coins.reduce((s, c) => s + c.signals.composite, 0) / coins.length) : 0;

    document.getElementById('scanner-metrics').innerHTML = `
      <div class="metric"><div class="metric-label">Asset monitorati</div><div class="metric-value">${state.watchlist.length}</div><div class="metric-sub">nella watchlist</div></div>
      <div class="metric"><div class="metric-label">Segnali forti</div><div class="metric-value score-high">${strong}</div><div class="metric-sub">score ≥ 72</div></div>
      <div class="metric"><div class="metric-label">Score medio</div><div class="metric-value">${avg || '—'}</div><div class="metric-sub">su 100</div></div>
      <div class="metric"><div class="metric-label">BTC dominance</div><div class="metric-value">${state.globalData ? state.globalData.market_cap_percentage?.btc?.toFixed(1) + '%' : '—'}</div><div class="metric-sub">rotazione ref.</div></div>
    `;

    const list = document.getElementById('scanner-list');
    if (!coins.length) {
      list.innerHTML = `<div class="empty-state">${svgBig('radar')}<p>Nessun asset caricato.<br>Premi <strong>Aggiorna</strong> per caricare i dati.</p></div>`;
      return;
    }

    list.innerHTML = coins.map((d, i) => {
      const sig = d.signals;
      const changeBadge = d.change24h >= 0 ? 'badge-green' : 'badge-red';
      const color = PALETTE[i % PALETTE.length];
      const sigKeys = ['dev', 'whale', 'tokenomics', 'catalyst', 'rotation'];
      const sigLabels = { dev: 'Dev', whale: 'Whale', tokenomics: 'Supply', catalyst: 'Catalyst', rotation: 'Rotaz.' };
      const sigIcons = { dev: 'code', whale: 'fish', tokenomics: 'flame', catalyst: 'rocket', rotation: 'arrows-exchange' };

      return `
      <div class="coin-card" id="card-${d.id}">
        <div class="coin-card-header" onclick="App.toggleDetail('${d.id}')">
          <div class="coin-avatar" style="background:${color}1f;color:${color}">${d.symbol.slice(0,3)}</div>
          <div class="coin-info">
            <div class="coin-name-text">${d.name}</div>
            <div class="coin-meta">
              <span>${d.symbol}</span>
              <span class="price">${d.price ? fmtEur(d.price) : '—'}</span>
              <span class="badge ${changeBadge}">${fmtPct(d.change24h)}</span>
              ${d.rank < 200 ? `<span class="badge badge-blue">#${d.rank}</span>` : ''}
            </div>
          </div>
          ${scoreRing(sig.composite)}
        </div>
        <div class="signal-mini-grid">
          ${sigKeys.map(k => `
            <div class="signal-mini">
              <div class="signal-mini-icon">${svg(sigIcons[k])}</div>
              <div class="signal-mini-label">${sigLabels[k]}</div>
              <div class="signal-mini-val ${scoreClass(sig[k].score)}">${sig[k].score}</div>
            </div>
          `).join('')}
        </div>
        <div class="coin-detail" id="detail-${d.id}">
          <div style="margin-bottom:8px;font-size:12px;color:var(--text-secondary);font-weight:500;text-transform:uppercase;letter-spacing:0.05em">Breakdown</div>
          ${sigKeys.map(k => {
            const s = sig[k];
            return `
            <div class="signal-detail-row">
              <span class="signal-detail-label">${svg(sigIcons[k])} ${k === 'tokenomics' ? 'Tokenomics' : sigLabels[k]}</span>
              <div class="signal-bar-wrap">
                ${s.reasons?.length ? `<span style="font-size:11px;color:var(--text-muted);margin-right:6px;max-width:140px;text-align:right;line-height:1.3">${s.reasons.slice(0,2).join(' · ')}</span>` : ''}
                <div class="signal-bar"><div class="signal-bar-fill" style="width:${s.score}%;background:${scoreColor(s.score)}"></div></div>
                <span class="signal-val ${scoreClass(s.score)}">${s.score}</span>
              </div>
            </div>`;
          }).join('')}
          <div class="detail-actions">
            <button onclick="App.addToWatchlist('${d.id}','portfolio')">${svg('plus')} Aggiungi al portfolio</button>
            <button onclick="App.openBacktestFor('${d.id}')">${svg('chart-line')} Backtesta</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function toggleDetail(id) {
    const el = document.getElementById('detail-' + id);
    if (el) el.classList.toggle('open');
  }

  // ── portfolio rendering ────────────────────────────────────────────────
  function renderPortfolio() {
    const budget = parseFloat(document.getElementById('budget')?.value || 10000);
    const riskPct = parseFloat(document.getElementById('risk-pct')?.value || 2);
    const maxPos = parseInt(document.getElementById('max-pos')?.value || 5);

    const positions = Portfolio.build(state.scannerData, { budget, riskPct, maxPositions: maxPos });

    if (!positions.length) {
      document.getElementById('portfolio-output').innerHTML =
        `<div class="empty-state">${svgBig('wallet')}<p>Carica i dati dallo scanner prima di costruire il portfolio.</p></div>`;
      return;
    }

    const maxAlloc = Math.max(...positions.map(p => p.allocation));
    const totalRisk = budget * riskPct / 100 * positions.length;

    document.getElementById('portfolio-metrics').innerHTML = `
      <div class="metric"><div class="metric-label">Budget totale</div><div class="metric-value">${fmtEur(budget)}</div></div>
      <div class="metric"><div class="metric-label">Posizioni</div><div class="metric-value">${positions.length}</div></div>
      <div class="metric"><div class="metric-label">Rischio per trade</div><div class="metric-value">${fmt(riskPct)}%</div></div>
      <div class="metric"><div class="metric-label">Rischio max totale</div><div class="metric-value score-low">${fmtEur(totalRisk)}</div><div class="metric-sub">${fmt(riskPct * positions.length)}% del capital</div></div>
    `;

    document.getElementById('portfolio-output').innerHTML = positions.map(pos => `
      <div class="portfolio-row">
        <div class="coin-avatar" style="background:${pos.color}22;color:${pos.color};width:36px;height:36px;font-size:11px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;flex-shrink:0">${pos.symbol.slice(0,3)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500">${pos.name}</div>
          <div class="alloc-bar-wrap" style="margin-top:5px">
            <div class="alloc-bar"><div class="alloc-fill" style="width:${(pos.allocation/maxAlloc*100).toFixed(0)}%;background:${pos.color}"></div></div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Stop loss: ${fmtEur(pos.stopPrice)} (−${pos.stopPct}%)</div>
        </div>
        <div class="position-size">
          <div style="font-size:14px;font-weight:500">${fmtEur(pos.allocation)}</div>
          <div style="font-size:12px;color:var(--text-secondary)">${(pos.weight*100).toFixed(1)}%</div>
        </div>
        <div style="text-align:center;min-width:36px">
          <div class="${scoreClass(pos.score)}" style="font-size:14px;font-weight:600">${pos.score}</div>
          <div style="font-size:10px;color:var(--text-muted)">score</div>
        </div>
      </div>
    `).join('');
  }

  // ── alerts rendering ───────────────────────────────────────────────────
  function renderAlerts() {
    const list = Alerts.load();
    const coinSel = document.getElementById('alert-coin');
    if (coinSel) {
      coinSel.innerHTML = state.scannerData.map(d => `<option value="${d.id}">${d.name}</option>`).join('') ||
        state.watchlist.map(id => `<option value="${id}">${id}</option>`).join('');
    }

    const el = document.getElementById('alert-list');
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<div style="font-size:13px;color:var(--text-secondary);padding:8px 0">Nessun alert configurato.</div>';
      return;
    }
    el.innerHTML = list.map(a => `
      <div class="alert-row">
        <div class="alert-dot" style="background:${a.active ? 'var(--teal)' : 'var(--text-muted)'}"></div>
        <div class="alert-content">
          <div class="alert-title">${state.scannerData.find(d=>d.id===a.coinId)?.name || a.coinId}</div>
          <div class="alert-sub">${Alerts.TYPE_LABELS[a.type]} · soglia ${a.threshold || '—'}</div>
        </div>
        <button class="btn-danger" onclick="App.removeAlert(${a.id})" aria-label="Rimuovi alert">${svg('trash')}</button>
      </div>
    `).join('');
  }

  function renderAlertLog() {
    renderAlerts();
    const log = Alerts.loadLog();
    const el = document.getElementById('alert-log');
    if (!el) return;
    if (!log.length) {
      el.innerHTML = '<div style="font-size:13px;color:var(--text-secondary);padding:8px 0">Nessun segnale registrato.</div>';
      return;
    }
    el.innerHTML = log.slice(0, 20).map(l => {
      const score = l.score || 0;
      const badgeClass = score >= 72 ? 'badge-green' : score >= 50 ? 'badge-amber' : 'badge-red';
      return `
      <div class="alert-row">
        <div class="alert-dot" style="background:${scoreColor(score)}"></div>
        <div class="alert-content">
          <div class="alert-title">${l.message}</div>
          <div class="alert-sub">${new Date(l.ts).toLocaleString('it-IT')}</div>
        </div>
        <span class="badge ${badgeClass}">${score}</span>
      </div>`;
    }).join('');
  }

  function addAlert() {
    const coinId = document.getElementById('alert-coin')?.value;
    const type = document.getElementById('alert-type')?.value;
    const threshold = parseInt(document.getElementById('alert-threshold')?.value || 70);
    if (!coinId) return;
    Alerts.add({ coinId, type, threshold });
    renderAlerts();
  }

  function removeAlert(id) {
    Alerts.remove(id);
    renderAlerts();
  }

  function showAlertToast(triggered) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = triggered[0].message + (triggered.length > 1 ? ` (+${triggered.length - 1} altri)` : '');
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 5000);
  }

  // ── backtest ───────────────────────────────────────────────────────────
  async function runBacktest() {
    const coinId = document.getElementById('bt-coin')?.value;
    const days = parseInt(document.getElementById('bt-days')?.value || 180);
    const entryThresh = parseInt(document.getElementById('entry-thresh')?.value || 60);
    const stopPct = parseInt(document.getElementById('bt-stop')?.value || 8);
    const tpPct = parseInt(document.getElementById('bt-tp')?.value || 20);
    const capital = parseFloat(document.getElementById('bt-capital')?.value || 10000);
    const posSizePct = parseInt(document.getElementById('bt-possize')?.value || 20);

    const btn = document.getElementById('bt-run-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = svg('player-play') + ' Caricamento...'; }
    setStatus('bt-status', 'Connessione a CoinGecko...', 'loading');

    try {
      const mc = await API.getMarketChart(coinId, days);
      setStatus('bt-status', 'Simulazione in corso...', 'loading');

      const prices = mc.prices.map(p => p[1]);
      const volumes = mc.total_volumes.map(v => v[1]);
      const labels = mc.prices.map(p => new Date(p[0]).toLocaleDateString('it-IT', { month: 'short', day: 'numeric' }));

      const result = Backtest.run(prices, volumes, labels,
        { entryThresh, stopPct, tpPct, capitalInit: capital, posSizePct },
        state.btActiveSigs);
      const s = Backtest.stats(result.equity, result.trades, result.bh);
      state.btResult = { result, s, labels };

      renderBtResults(result, s, labels);
      showPage('backtest');
      document.querySelector('.nav-tab[data-page="backtest"]')?.classList.add('active');

      setStatus('bt-status',
        `Backtest completato: ${result.trades.length} trade su ${prices.length} giorni di dati reali.`, 'success');
    } catch (e) {
      setStatus('bt-status', 'Errore: ' + e.message, 'error');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = svg('player-play') + ' Esegui backtest'; }
  }

  function renderBtResults(result, s, labels) {
    const mc = v => v >= 0 ? 'var(--teal)' : 'var(--red)';

    document.getElementById('bt-metrics').innerHTML = `
      <div class="metric"><div class="metric-label">Rendimento strategia</div><div class="metric-value" style="color:${mc(s.totalReturn)}">${fmtPct(s.totalReturn)}</div><div class="metric-sub">B&H: ${fmtPct(s.bhReturn)}</div></div>
      <div class="metric"><div class="metric-label">Sharpe ratio</div><div class="metric-value" style="color:${s.sharpe>=1?'var(--teal)':s.sharpe>=0?'var(--amber)':'var(--red)'}">${s.sharpe.toFixed(2)}</div><div class="metric-sub">>1 = buono</div></div>
      <div class="metric"><div class="metric-label">Max drawdown</div><div class="metric-value" style="color:${s.maxDD>20?'var(--red)':'var(--text)'}">−${s.maxDD.toFixed(1)}%</div><div class="metric-sub">picco → valle</div></div>
      <div class="metric"><div class="metric-label">Win rate</div><div class="metric-value" style="color:${mc(s.winRate-50)}">${s.winRate.toFixed(0)}%</div><div class="metric-sub">${s.nWins}W / ${s.nLosses}L</div></div>
      <div class="metric"><div class="metric-label">Profit factor</div><div class="metric-value" style="color:${s.profitFactor>=1.5?'var(--teal)':s.profitFactor>=1?'var(--amber)':'var(--red)'}">${s.profitFactor > 99 ? '∞' : s.profitFactor.toFixed(2)}</div><div class="metric-sub">>1.5 = buono</div></div>
      <div class="metric"><div class="metric-label">Capitale finale</div><div class="metric-value" style="font-size:16px;color:${mc(s.finalCapital-s.initCapital)}">${fmtEur(s.finalCapital)}</div><div class="metric-sub">da ${fmtEur(s.initCapital)}</div></div>
    `;

    // equity chart
    destroyChart('equity');
    const equityLabels = labels.slice(0, result.equity.length);
    state.charts['equity'] = new Chart(document.getElementById('equity-chart'), {
      type: 'line',
      data: {
        labels: equityLabels,
        datasets: [
          { label: 'Strategia', data: result.equity.map(v => +v.toFixed(2)), borderColor: '#F0B429', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false },
          { label: 'Buy & hold', data: result.bh.slice(0, result.equity.length).map(v => +v.toFixed(2)), borderColor: '#5E6C8E', borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, tension: 0.3, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { label: c => c.dataset.label + ': ' + fmtEur(c.parsed.y) } } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { callback: v => fmtEur(v), font: { size: 11 } }, grid: { color: 'rgba(128,128,128,0.1)' } }
        }
      }
    });

    // returns distribution
    destroyChart('returns');
    const pnls = result.trades.map(t => t.pnlPct);
    const bins = [-25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25];
    const counts = bins.map((b, i) => pnls.filter(p => p >= b && p < (bins[i + 1] ?? 999)).length);
    const barColors = bins.map(b => b >= 0 ? '#2DD4A7' : '#F4694C');
    state.charts['returns'] = new Chart(document.getElementById('returns-chart'), {
      type: 'bar',
      data: { labels: bins.map(b => `${b > 0 ? '+' : ''}${b}%`), datasets: [{ data: counts, backgroundColor: barColors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 10 } }, grid: { display: false } }, y: { ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: 'rgba(128,128,128,0.1)' } } } }
    });

    // score chart with entry/exit markers
    destroyChart('score');
    const entryPts = new Array(result.scores.length).fill(null);
    const exitPts = new Array(result.scores.length).fill(null);
    result.trades.forEach(t => { if (t.entryIdx < entryPts.length) entryPts[t.entryIdx] = result.scores[t.entryIdx]; if (t.exitIdx < exitPts.length) exitPts[t.exitIdx] = result.scores[t.exitIdx]; });
    state.charts['score'] = new Chart(document.getElementById('score-chart'), {
      type: 'line',
      data: {
        labels: labels.slice(0, result.scores.length),
        datasets: [
          { label: 'Score', data: result.scores, borderColor: '#5B9DFF', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false },
          { label: 'Entry', data: entryPts, pointStyle: 'triangle', pointRadius: 7, borderColor: '#2DD4A7', backgroundColor: '#2DD4A7', showLine: false },
          { label: 'Exit', data: exitPts, pointStyle: 'rectRot', pointRadius: 6, borderColor: '#F4694C', backgroundColor: '#F4694C', showLine: false }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } }, y: { min: 0, max: 100, ticks: { font: { size: 10 } }, grid: { color: 'rgba(128,128,128,0.1)' } } } }
    });

    // trade table
    document.getElementById('bt-trade-body').innerHTML = result.trades.map((t, i) => `
      <tr>
        <td>#${i + 1}</td>
        <td>${t.entryDate}</td>
        <td>${t.exitDate}</td>
        <td class="${t.pnlPct >= 0 ? 'pnl-pos' : 'pnl-neg'}">${fmtPct(t.pnlPct)}</td>
        <td class="${t.pnlPct >= 0 ? 'pnl-pos' : 'pnl-neg'}">${t.pnlEur >= 0 ? '+' : ''}${fmtEur(t.pnlEur)}</td>
        <td>${t.score}</td>
        <td><span class="badge ${t.reason === 'take profit' ? 'badge-green' : t.reason === 'stop loss' ? 'badge-red' : 'badge-amber'}">${t.reason}</span></td>
      </tr>
    `).join('');
  }

  async function runMultiBacktest() {
    const btn = document.getElementById('multi-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Caricamento...'; }
    const days = parseInt(document.getElementById('bt-days')?.value || 180);
    const entryThresh = parseInt(document.getElementById('entry-thresh')?.value || 60);
    const stopPct = parseInt(document.getElementById('bt-stop')?.value || 8);
    const tpPct = parseInt(document.getElementById('bt-tp')?.value || 20);
    const capital = parseFloat(document.getElementById('bt-capital')?.value || 10000);
    const posSizePct = parseInt(document.getElementById('bt-possize')?.value || 20);
    const COINS = [
      { id: 'bitcoin', label: 'BTC' }, { id: 'ethereum', label: 'ETH' },
      { id: 'solana', label: 'SOL' }, { id: 'chainlink', label: 'LINK' },
      { id: 'avalanche-2', label: 'AVAX' }, { id: 'polkadot', label: 'DOT' }
    ];
    const results = [];
    for (let i = 0; i < COINS.length; i++) {
      const c = COINS[i];
      setStatus('multi-status', `Caricamento ${c.label} (${i + 1}/${COINS.length})...`, 'loading');
      try {
        if (i > 0) await sleep(1200);
        const mc = await API.getMarketChart(c.id, days);
        const prices = mc.prices.map(p => p[1]);
        const volumes = mc.total_volumes.map(v => v[1]);
        const labels = mc.prices.map(p => new Date(p[0]).toLocaleDateString('it-IT', { month: 'short', day: 'numeric' }));
        const result = Backtest.run(prices, volumes, labels, { entryThresh, stopPct, tpPct, capitalInit: capital, posSizePct }, state.btActiveSigs);
        const s = Backtest.stats(result.equity, result.trades, result.bh);
        results.push({ ticker: c.label, ...s });
      } catch { results.push({ ticker: c.label, totalReturn: null, error: true }); }
    }

    results.sort((a, b) => (b.totalReturn || -999) - (a.totalReturn || -999));
    const maxRet = Math.max(0, ...results.filter(r => !r.error).map(r => r.totalReturn || 0));

    setStatus('multi-status', 'Confronto completato.', 'success');
    document.getElementById('compare-output').innerHTML = results.map(r => r.error ? `
      <div class="compare-row"><span class="compare-ticker">${r.ticker}</span><span style="color:var(--text-muted);font-size:12px">Errore caricamento dati</span></div>
    ` : `
      <div class="compare-row">
        <span class="compare-ticker">${r.ticker}</span>
        <div class="compare-bar-wrap">
          <div class="compare-bar"><div class="compare-fill" style="width:${maxRet > 0 ? (Math.max(0, r.totalReturn) / maxRet * 100).toFixed(0) : 0}%;background:${r.totalReturn >= 0 ? '#F0B429' : '#F4694C'}"></div></div>
        </div>
        <div class="compare-stats">
          <div class="compare-stat"><strong style="color:${r.totalReturn >= 0 ? 'var(--teal)' : 'var(--red)'}">${fmtPct(r.totalReturn)}</strong>rendimento</div>
          <div class="compare-stat"><strong>${r.sharpe.toFixed(2)}</strong>Sharpe</div>
          <div class="compare-stat"><strong style="color:var(--red)">−${r.maxDD.toFixed(1)}%</strong>drawdown</div>
          <div class="compare-stat"><strong>${r.winRate.toFixed(0)}%</strong>win rate</div>
          <div class="compare-stat"><strong>${r.nTrades}</strong>trade</div>
        </div>
      </div>
    `).join('');

    if (btn) { btn.disabled = false; btn.innerHTML = svg('player-play') + ' Esegui confronto multi-asset'; }
  }

  // ── settings ───────────────────────────────────────────────────────────
  function renderSettings() {
    const wd = document.getElementById('watchlist-pills');
    if (wd) wd.innerHTML = state.watchlist.map(id => {
      const d = state.scannerData.find(c => c.id === id);
      return `<span class="watchlist-pill">${d?.symbol || id.slice(0,6).toUpperCase()}<button onclick="App.removeCoin('${id}')" aria-label="Rimuovi ${id}">×</button></span>`;
    }).join('');

    const wc = document.getElementById('weights-config');
    if (wc) {
      const labels = { dev: 'Dev activity', whale: 'Whale flow', tokenomics: 'Tokenomics', catalyst: 'Catalyst', rotation: 'Rotazione settore' };
      wc.innerHTML = Object.entries(state.weights).map(([k, v]) => `
        <div class="ctrl-row">
          <label>${labels[k]}</label>
          <input type="range" min="5" max="50" value="${v}" step="5" oninput="App.updateWeight('${k}',parseInt(this.value));document.getElementById('w-${k}').textContent=this.value" style="flex:1">
          <span id="w-${k}" class="val-display">${v}</span>
        </div>
      `).join('');
    }

    const intervalSel = document.getElementById('auto-refresh');
    if (intervalSel) intervalSel.value = state.autoRefreshInterval;
  }

  function updateWeight(key, val) {
    state.weights[key] = val;
    persistState();
  }

  function addCoin() {
    const input = document.getElementById('new-coin');
    const val = input?.value?.trim().toLowerCase().replace(/\s+/g, '-');
    if (!val || state.watchlist.includes(val)) return;
    state.watchlist.push(val);
    input.value = '';
    persistState();
    renderSettings();
  }

  function removeCoin(id) {
    state.watchlist = state.watchlist.filter(c => c !== id);
    state.scannerData = state.scannerData.filter(d => d.id !== id);
    persistState();
    renderSettings();
    renderScanner();
  }

  function setAutoRefresh(seconds) {
    state.autoRefreshInterval = parseInt(seconds);
    if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
    if (state.autoRefreshInterval > 0) state.autoRefreshTimer = setInterval(refresh, state.autoRefreshInterval * 1000);
  }

  function openBacktestFor(coinId) {
    const sel = document.getElementById('bt-coin');
    if (sel) {
      for (const opt of sel.options) { if (opt.value === coinId) { opt.selected = true; break; } }
    }
    showPage('backtest-config');
  }

  function addToWatchlist(coinId, goTo) {
    if (goTo === 'portfolio') showPage('portfolio');
  }

  function toggleBtSig(btn) {
    const s = btn.dataset.sig;
    if (state.btActiveSigs.has(s)) { state.btActiveSigs.delete(s); btn.classList.remove('on'); }
    else { state.btActiveSigs.add(s); btn.classList.add('on'); }
  }

  // ── SVG icon helpers ───────────────────────────────────────────────────
  const ICONS = {
    refresh: '<polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"></path>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
    trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6m4-6v6"></path><path d="M9 6V4h6v2"></path>',
    'chart-line': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>',
    'player-play': '<polygon points="5 3 19 12 5 21 5 3"></polygon>',
    code: '<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>',
    fish: '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6s-7.56-2.54-8.5-6z"></path><path d="M18 12v.5"></path>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 3z"></path>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"></path><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"></path>',
    'arrows-exchange': '<polyline points="7 16 3 12 7 8"></polyline><line x1="3" y1="12" x2="21" y2="12"></line><polyline points="17 8 21 12 17 16"></polyline>',
    radar: '<circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"></path>',
    wallet: '<path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"></path><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"></path>'
  };

  function svg(name, size = 14) {
    const d = ICONS[name] || '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }

  function svgBig(name) { return svg(name, 36); }

  // ── init ───────────────────────────────────────────────────────────────
  function init() {
    loadPersistedState();

    if (window.Chart) {
      Chart.defaults.color = '#92A0C0';
      Chart.defaults.borderColor = 'rgba(141,159,200,0.12)';
      Chart.defaults.font.family = "'JetBrains Mono', monospace";
      Chart.defaults.font.size = 10;
    }

    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => showPage(tab.dataset.page));
    });

    document.getElementById('btn-refresh')?.addEventListener('click', refresh);
    document.getElementById('filter-score')?.addEventListener('change', renderScanner);
    document.getElementById('filter-signal')?.addEventListener('change', renderScanner);
    document.getElementById('sort-by')?.addEventListener('change', renderScanner);
    document.getElementById('budget')?.addEventListener('input', renderPortfolio);
    document.getElementById('risk-pct')?.addEventListener('input', () => {
      document.getElementById('risk-val').textContent = document.getElementById('risk-pct').value + '%';
      renderPortfolio();
    });
    document.getElementById('max-pos')?.addEventListener('input', () => {
      document.getElementById('pos-val').textContent = document.getElementById('max-pos').value;
      renderPortfolio();
    });
    document.getElementById('bt-run-btn')?.addEventListener('click', runBacktest);
    document.getElementById('multi-btn')?.addEventListener('click', runMultiBacktest);
    document.getElementById('btn-add-coin')?.addEventListener('click', addCoin);
    document.getElementById('new-coin')?.addEventListener('keydown', e => { if (e.key === 'Enter') addCoin(); });
    document.getElementById('btn-add-alert')?.addEventListener('click', addAlert);
    document.getElementById('auto-refresh')?.addEventListener('change', e => setAutoRefresh(e.target.value));

    document.querySelectorAll('.bt-sig-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleBtSig(btn));
    });

    document.getElementById('bt-stop')?.addEventListener('input', () => {
      document.getElementById('bt-stop-val').textContent = document.getElementById('bt-stop').value + '%';
    });
    document.getElementById('bt-tp')?.addEventListener('input', () => {
      document.getElementById('bt-tp-val').textContent = document.getElementById('bt-tp').value + '%';
    });
    document.getElementById('bt-possize')?.addEventListener('input', () => {
      document.getElementById('bt-possize-val').textContent = document.getElementById('bt-possize').value + '%';
    });
    document.getElementById('entry-thresh')?.addEventListener('input', () => {
      document.getElementById('et-val').textContent = document.getElementById('entry-thresh').value;
    });

    renderScanner();
    renderSettings();
  }

  return {
    init, refresh, showPage,
    toggleDetail, renderPortfolio,
    addAlert, removeAlert, renderAlertLog,
    runBacktest, runMultiBacktest,
    addCoin, removeCoin, updateWeight,
    openBacktestFor, addToWatchlist, toggleBtSig
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
