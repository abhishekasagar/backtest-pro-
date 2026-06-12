let config = { accountType: 'live', region: 'uk', symbol: 'EURUSD' };
let equityChart = null;

function selectOption(key, value) {
  config[key] = value;
  document.querySelectorAll('.btn-option').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
}

function generateRealistic5YearData(symbol) {
  const data = [];
  let price = { EURUSD: 1.10, BTCUSD: 35000, SPY: 350, GBPUSD: 1.35, GOLD: 1850 }[symbol] || 1.10;
  const volatility = { EURUSD: 0.008, BTCUSD: 0.04, SPY: 0.012, GBPUSD: 0.010, GOLD: 0.009 }[symbol] || 0.008;
  
  for (let i = 1260; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const drift = 0.0001;
    const randomWalk = (Math.random() - 0.5) * volatility;
    price = price * (1 + drift + randomWalk);
    
    data.push({
      date: date.toISOString().split('T')[0],
      close: parseFloat(price.toFixed(5)),
      high: price * (1 + Math.abs(Math.random()) * 0.005),
      low: price * (1 - Math.abs(Math.random()) * 0.005),
      volume: Math.floor(Math.random() * 1000000)
    });
  }
  return data;
}

function calculateIndicators(data) {
  const sma20 = [], sma50 = [], sma200 = [], rsi14 = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i >= 19) sma20.push(data.slice(i-19, i+1).reduce((a,d) => a+d.close, 0) / 20);
    else sma20.push(null);
    
    if (i >= 49) sma50.push(data.slice(i-49, i+1).reduce((a,d) => a+d.close, 0) / 50);
    else sma50.push(null);
    
    if (i >= 199) sma200.push(data.slice(i-199, i+1).reduce((a,d) => a+d.close, 0) / 200);
    else sma200.push(null);
    
    if (i >= 13) {
      const changes = [];
      for (let j = i-13; j <= i; j++) changes.push(data[j].close - data[j-1].close);
      const gains = changes.filter(c => c > 0).reduce((a,c) => a+c, 0) / 14;
      const losses = -changes.filter(c => c < 0).reduce((a,c) => a+c, 0) / 14;
      rsi14.push(100 - (100 / (1 + (gains/losses || 0))));
    } else rsi14.push(null);
  }
  
  return { sma20, sma50, sma200, rsi14 };
}

function runBacktest() {
  const strategy = document.getElementById('strategy').value.trim();
  if (!strategy) {
    showError('Please describe your trading strategy');
    return;
  }
  
  document.getElementById('errorContainer').classList.remove('active');
  document.getElementById('loadingContainer').classList.add('active');
  document.getElementById('setupSection').style.opacity = '0.5';
  document.getElementById('setupSection').style.pointerEvents = 'none';
  
  try {
    const data = generateRealistic5YearData(config.symbol);
    const indicators = calculateIndicators(data);
    
    const trades = [];
    let position = null;
    
    for (let i = 1; i < data.length; i++) {
      const close = data[i].close;
      const prevClose = data[i-1].close;
      const rsi = indicators.rsi14[i];
      const sma20 = indicators.sma20[i];
      const sma50 = indicators.sma50[i];
      const sma200 = indicators.sma200[i];
      
      if (rsi !== null && sma20 !== null && sma50 !== null && sma200 !== null) {
        if (rsi < 30 && !position) {
          position = { entry: close, date: data[i].date };
        } else if (rsi > 70 && position) {
          trades.push({ ...position, exit: close, exitDate: data[i].date });
          position = null;
        }
      }
    }
    
    const metrics = calculateMetrics(data, trades);
    displayResults(metrics, trades);
    
  } catch (err) {
    showError('Error: ' + err.message);
  } finally {
    document.getElementById('loadingContainer').classList.remove('active');
    document.getElementById('setupSection').style.opacity = '1';
    document.getElementById('setupSection').style.pointerEvents = 'auto';
  }
}

function calculateMetrics(data, trades) {
  const wins = trades.filter(t => t.exit > t.entry);
  const losses = trades.filter(t => t.exit <= t.entry);
  const winRate = trades.length > 0 ? (wins.length / trades.length * 100).toFixed(1) : 0;
  const profitFactor = losses.length > 0 ? (wins.reduce((a,t) => a + (t.exit - t.entry), 0) / losses.reduce((a,t) => a + (t.entry - t.exit), 0)).toFixed(2) : 99.99;
  const totalPnL = trades.reduce((a,t) => a + (t.exit - t.entry), 0);
  const totalReturn = ((totalPnL / data[0].close) * 100).toFixed(2);
  
  const equity = [100];
  let peak = 100;
  let maxDD = 0;
  trades.forEach(t => {
    equity.push(equity[equity.length-1] + (t.exit - t.entry));
    if (equity[equity.length-1] > peak) peak = equity[equity.length-1];
    maxDD = Math.max(maxDD, ((peak - equity[equity.length-1]) / peak * 100));
  });
  
  return { winRate, profitFactor, totalReturn, trades: trades.slice(-20), maxDD: maxDD.toFixed(1), totalTrades: trades.length, equity };
}

function displayResults(metrics, trades) {
  const html = `
    <div class="metric-card">
      <div class="metric-label">Win Rate</div>
      <div class="metric-value metric-positive">${metrics.winRate}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Profit Factor</div>
      <div class="metric-value ${metrics.profitFactor >= 1.5 ? 'metric-positive' : 'metric-neutral'}">${metrics.profitFactor}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Return</div>
      <div class="metric-value ${metrics.totalReturn >= 0 ? 'metric-positive' : 'metric-negative'}">${metrics.totalReturn}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Max Drawdown</div>
      <div class="metric-value metric-negative">-${metrics.maxDD}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Trades</div>
      <div class="metric-value metric-neutral">${metrics.totalTrades}</div>
    </div>
  `;
  document.getElementById('metricsGrid').innerHTML = html;
  
  const ctx = document.getElementById('equityChart').getContext('2d');
  if (equityChart) equityChart.destroy();
  equityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: metrics.equity.map((_, i) => i),
      datasets: [{
        label: 'Account Value',
        data: metrics.equity,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(100, 116, 139, 0.1)' } },
        x: { grid: { display: false } }
      }
    }
  });
  
  let tradeHtml = '<thead><tr><th>Entry</th><th>Entry Price</th><th>Exit</th><th>Exit Price</th><th>P&L</th></tr></thead><tbody>';
  metrics.trades.forEach(t => {
    const pnl = t.exit - t.entry;
    tradeHtml += `<tr><td>${t.date}</td><td>${t.entry.toFixed(5)}</td><td>${t.exitDate}</td><td>${t.exit.toFixed(5)}</td><td class="${pnl >= 0 ? 'trade-win' : 'trade-loss'}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(5)}</td></tr>`;
  });
  document.getElementById('tradesTable').innerHTML = tradeHtml + '</tbody>';
  
  document.getElementById('resultsSection').classList.add('active');
}

function showError(msg) {
  const err = document.getElementById('errorContainer');
  err.textContent = msg;
  err.classList.add('active');
}

function resetBacktest() {
  document.getElementById('resultsSection').classList.remove('active');
  document.getElementById('strategy').value = '';
  document.getElementById('strategy').focus();
}
