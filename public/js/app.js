/* ═══════════════════════════════════════════════════════════════════
   app.js — Main application controller
   Monte Carlo Stock Simulator v3.0 — Black & Gold Edition
   ═══════════════════════════════════════════════════════════════════ */

import { MARKETS, MODELS, DEFAULTS, getTickerName, getCurrency, registerMarketTickers } from './config.js';
import { fetchStockData, searchStocks, computeLogReturns, fetchMarketUniverse } from './api.js';
import { runAllSimulations, runHistoricalBacktest, computeRiskMetrics, generateSignal, rankBacktestModels } from './simulation.js';
import {
  renderHistoricalChart, renderFanChart, renderDistribution,
  renderComparisonChart, renderVarComparison, renderProbComparison,
  renderTimingChart, renderBacktestRankingChart, renderBacktestErrorTrendChart, destroyAllCharts,
} from './charts.js';
import { setupPortfolioTool } from './portfolio.js';
import { fetchMacroData, renderMacroPanel, renderMacroContextCard } from './macro.js';
import { fetchFundamentals, renderFundamentalsCard } from './fundamentals.js';
import { fetchStockNews as fetchNews, renderNewsCard } from './news.js';
import { exportSimulationCSV, exportMarketRankingCSV, exportSimulationPDF } from './exporter.js';
import { computeTechnicals, renderTechnicalsCard } from './technicals.js';
import { fetchOptionsData, renderOptionsCard } from './options.js';
import { fetchRedditSentiment, renderRedditCard } from './reddit.js';
import { fetchInsiderTrading, renderInsidersCard } from './insiders.js';
import { computeCorrelationMatrix, renderCorrelationCard } from './correlation.js';

// ── Web Worker ───────────────────────────────────────────────────
let _simWorker = null;

function getSimWorker() {
  if (!_simWorker) {
    _simWorker = new Worker(new URL('./simulation-worker.js', import.meta.url), { type: 'module' });
  }
  return _simWorker;
}

function runSimulationsViaWorker(logReturns, s0, horizon, nSim, modelIds, seed, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = getSimWorker();
    function handler(e) {
      const { type, payload } = e.data;
      if (type === 'PROGRESS') {
        onProgress?.(payload);
      } else if (type === 'SIM_DONE') {
        worker.removeEventListener('message', handler);
        resolve(payload); // { results, metrics }
      } else if (type === 'ERROR') {
        worker.removeEventListener('message', handler);
        reject(new Error(payload.message));
      }
    }
    worker.addEventListener('message', handler);
    worker.postMessage({ type: 'RUN_SIMULATIONS', payload: { logReturns, s0, horizon, nSim, modelIds, seed } });
  });
}

function runBacktestViaWorker(prices, dates, modelIds, options, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = getSimWorker();
    function handler(e) {
      const { type, payload } = e.data;
      if (type === 'PROGRESS') {
        onProgress?.(payload);
      } else if (type === 'BACKTEST_DONE') {
        worker.removeEventListener('message', handler);
        resolve(payload.backtest);
      } else if (type === 'ERROR') {
        worker.removeEventListener('message', handler);
        reject(new Error(payload.message));
      }
    }
    worker.addEventListener('message', handler);
    worker.postMessage({ type: 'RUN_BACKTEST', payload: { prices, dates, modelIds, options } });
  });
}

// ── State ────────────────────────────────────────────────────────
let currentSymbol = null;
let currentData = null;
let currentResults = null;
let currentMetrics = null;
let currentBacktest = null;
let currentFundamentals = null;
let currentNews = null;
let macroData = null;
let currentTechnicals = null;
let currentOptions = null;
let currentReddit = null;
let currentInsiders = null;
// Flags que indican si ya terminó la carga asíncrona de cada módulo
let _optionsLoaded = false;
let _redditLoaded  = false;
let _insidersLoaded = false;
// Map symbol → stockData para correlación entre activos analizados
const analyzedStocks = {};

// ── DOM References ───────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ── Initialize ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await hydrateFeaturedUniverses();
  renderMarketGrids();
  setupSearch();
  setupNavigation();
  setupControls();
  setupTabs();
  setupPortfolioTool({ showLoading, updateLoadingProgress, hideLoading, showError, openStock: loadStock });

  // Load macro data for home panel (non-blocking)
  loadMacroPanel();

  // Check URL hash for deep linking
  const hash = window.location.hash.slice(1);
  if (hash === 'portfolio') showPortfolioView(false);
  else if (hash) loadStock(hash);
});

async function hydrateFeaturedUniverses() {
  const targets = [
    ['ibex35', 'IBEX 35'],
    ['sp500', 'S&P 500'],
  ];

  await Promise.all(targets.map(async ([universeId, marketName]) => {
    try {
      const universe = await fetchMarketUniverse(universeId);
      if (universe?.tickers && Object.keys(universe.tickers).length > 0) {
        registerMarketTickers(marketName, universe.tickers);
      }
    } catch (_) {
      // Keep bundled fallback lists when the backend universe source is unavailable.
    }
  }));
}

// ── Macro Panel (Home) ───────────────────────────────────────────
async function loadMacroPanel() {
  const panel = $('#macroPanelHome');
  if (!panel) return;
  try {
    macroData = await fetchMacroData();
    renderMacroPanel(panel, macroData);
  } catch (_) {
    panel.innerHTML = '<p class="macro-unavailable">Datos macro no disponibles</p>';
  }
}

// ═══════════════════════════════════════════════════════════════════
// Market Grids — Render stock cards for each market
// ═══════════════════════════════════════════════════════════════════
function renderMarketGrids() {
  const container = $('#marketsContainer');
  if (!container) return;
  container.innerHTML = '';

  for (const [marketName, market] of Object.entries(MARKETS)) {
    const section = document.createElement('div');
    section.className = 'market-section';
    section.innerHTML = `
      <div class="market-header" data-market="${marketName}">
        <h2>${market.flag} ${marketName}</h2>
        <span class="market-count">${Object.keys(market.tickers).length} acciones</span>
        <svg class="chevron" viewBox="0 0 24 24" width="20" height="20">
          <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none"/>
        </svg>
      </div>
      <div class="stock-grid collapsed" id="grid-${marketName.replace(/[^a-zA-Z0-9]/g, '')}">
        ${Object.entries(market.tickers).map(([ticker, name]) => `
          <button class="stock-card glass-card" data-ticker="${ticker}" title="${name} (${ticker})">
            <span class="stock-name">${name}</span>
            <span class="stock-ticker">${ticker}</span>
          </button>
        `).join('')}
      </div>
    `;
    container.appendChild(section);

    // Toggle market grid
    section.querySelector('.market-header').addEventListener('click', () => {
      const grid = section.querySelector('.stock-grid');
      grid.classList.toggle('collapsed');
      section.querySelector('.chevron').classList.toggle('rotated');
    });
  }

  // Stock card clicks
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.stock-card');
    if (card) loadStock(card.dataset.ticker);
  });

  // Expand first market by default
  const firstGrid = container.querySelector('.stock-grid');
  if (firstGrid) {
    firstGrid.classList.remove('collapsed');
    container.querySelector('.chevron')?.classList.add('rotated');
  }
}

// ═══════════════════════════════════════════════════════════════════
// Search — Real-time stock search
// ═══════════════════════════════════════════════════════════════════
function setupSearch() {
  const input = $('#searchInput');
  const dropdown = $('#searchDropdown');
  if (!input || !dropdown) return;

  let debounce = null;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 1) { dropdown.classList.remove('active'); return; }

    debounce = setTimeout(async () => {
      // First check local tickers
      const local = [];
      for (const market of Object.values(MARKETS)) {
        for (const [ticker, name] of Object.entries(market.tickers)) {
          if (ticker.toLowerCase().includes(q.toLowerCase()) || name.toLowerCase().includes(q.toLowerCase())) {
            local.push({ symbol: ticker, name, exchange: '', type: 'EQUITY' });
          }
        }
      }

      // Then search Yahoo
      let remote = [];
      if (q.length >= 2) {
        try { remote = await searchStocks(q); } catch (e) { /* ignore */ }
      }

      // Merge, local first, deduplicate
      const seen = new Set();
      const results = [];
      for (const item of [...local, ...remote]) {
        if (!seen.has(item.symbol)) {
          seen.add(item.symbol);
          results.push(item);
        }
      }

      renderSearchResults(results.slice(0, 10), dropdown);
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim().toUpperCase();
      if (q) { loadStock(q); dropdown.classList.remove('active'); input.blur(); }
    }
    if (e.key === 'Escape') { dropdown.classList.remove('active'); input.blur(); }
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) dropdown.classList.remove('active');
  });
}

function renderSearchResults(results, dropdown) {
  if (results.length === 0) {
    dropdown.classList.remove('active');
    return;
  }

  dropdown.innerHTML = results.map(r => `
    <button class="search-result" data-symbol="${r.symbol}">
      <span class="sr-name">${r.name}</span>
      <span class="sr-meta">
        <span class="sr-symbol">${r.symbol}</span>
        ${r.exchange ? `<span class="sr-exchange">${r.exchange}</span>` : ''}
      </span>
    </button>
  `).join('');

  dropdown.classList.add('active');

  dropdown.querySelectorAll('.search-result').forEach(btn => {
    btn.addEventListener('click', () => {
      loadStock(btn.dataset.symbol);
      dropdown.classList.remove('active');
      $('#searchInput').value = '';
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// Navigation — Home ↔ Analysis views
// ═══════════════════════════════════════════════════════════════════
function setupNavigation() {
  $('#backBtn')?.addEventListener('click', showHome);
  $('#logoBtn')?.addEventListener('click', showHome);
  $('#portfolioBackBtn')?.addEventListener('click', showHome);
  $('#portfolioToolBtn')?.addEventListener('click', () => showPortfolioView(true));
  $('#portfolioNavBtn')?.addEventListener('click', () => showPortfolioView(true));
  window.addEventListener('popstate', () => {
    const hash = window.location.hash.slice(1);
    if (!hash) showHome(false);
    else if (hash === 'portfolio') showPortfolioView(false);
    else loadStock(hash);
  });

  // Methodology modal from home page
  $('#methodologyBtn')?.addEventListener('click', () => {
    const modal = $('#methodologyModal');
    const content = $('#modalMethodologyContent');
    if (modal && content) {
      renderMethodologyTab({}, {});
      content.innerHTML = $('#methodologyContent')?.innerHTML || '';
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  });

  $('#closeModalBtn')?.addEventListener('click', closeMethodologyModal);
  $('#methodologyModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'methodologyModal') closeMethodologyModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMethodologyModal();
  });

  // Export buttons
  $('#exportCsvBtn')?.addEventListener('click', () => {
    if (currentResults && currentMetrics) {
      exportSimulationCSV(currentSymbol, currentResults, currentMetrics);
    }
  });
  $('#exportPdfBtn')?.addEventListener('click', () => {
    exportSimulationPDF(currentSymbol, currentResults, currentMetrics, currentBacktest, currentFundamentals, currentNews, macroData, currentTechnicals, currentOptions, currentInsiders, currentReddit);
  });
}

function closeMethodologyModal() {
  const modal = $('#methodologyModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function showHome(updateHistory = true) {
  $('#homeView').classList.remove('hidden');
  $('#portfolioView').classList.add('hidden');
  $('#analysisView').classList.add('hidden');
  if (updateHistory) window.history.pushState(null, '', window.location.pathname);
  currentSymbol = null;
  currentData = null;
  currentResults = null;
  currentMetrics = null;
  currentBacktest = null;
  currentFundamentals = null;
  currentNews = null;
  destroyAllCharts();
}

function showAnalysis() {
  $('#homeView').classList.add('hidden');
  $('#portfolioView').classList.add('hidden');
  $('#analysisView').classList.remove('hidden');
}

function showPortfolioView(updateHash = true) {
  $('#homeView').classList.add('hidden');
  $('#analysisView').classList.add('hidden');
  $('#portfolioView').classList.remove('hidden');
  if (updateHash) window.location.hash = 'portfolio';
}

// ═══════════════════════════════════════════════════════════════════
// Load Stock — Fetch data and show analysis view
// ═══════════════════════════════════════════════════════════════════
async function loadStock(symbol) {
  currentSymbol = symbol;
  currentResults = null;
  currentMetrics = null;
  currentBacktest = null;
  currentFundamentals = null;
  currentNews = null;
  window.location.hash = symbol;
  showAnalysis();

  // Reset UI
  $('#resultsSection').classList.add('hidden');
  $('#pdfHeaderBtn')?.classList.add('hidden');
  destroyAllCharts();
  setActiveTab('overview');

  const name = getTickerName(symbol);
  const currency = getCurrency(symbol);

  $('#stockName').textContent = name;
  $('#stockTicker').textContent = symbol;
  $('#currentPrice').textContent = 'Cargando...';
  $('#priceChange').textContent = '';
  $('#priceChange').className = 'price-change';

  showLoading('Descargando datos históricos...');

  try {
    const data = await fetchStockData(symbol);
    currentData = data;

    const price = data.currentPrice;
    const prevClose = data.previousClose || data.close[data.close.length - 2] || price;
    const change = price - prevClose;
    const changePct = prevClose ? (change / prevClose * 100) : 0;
    const isUp = change >= 0;

    $('#currentPrice').textContent = `${currency}${price.toFixed(2)}`;
    $('#priceChange').textContent = `${isUp ? '+' : ''}${change.toFixed(2)} (${isUp ? '+' : ''}${changePct.toFixed(2)}%)`;
    $('#priceChange').className = `price-change ${isUp ? 'up' : 'down'}`;

    // Render historical chart
    renderHistoricalChart('historicalChart', data.dates, data.adjClose, currency);

    const runBtn = $('#runBtn');
    if (runBtn) { runBtn.disabled = false; }

    hideLoading();

    // Load fundamentals + news in background (non-blocking)
    loadContextData(symbol);
  } catch (error) {
    hideLoading();
    $('#currentPrice').textContent = 'Error';
    $('#priceChange').textContent = '';
    const runBtn = $('#runBtn');
    if (runBtn) { runBtn.disabled = true; }
    showError(`No se pudieron obtener datos para ${symbol}: ${error.message}`);
  }
}

// Load fundamentals + news + technicals + options + reddit + insiders in background
async function loadContextData(symbol) {
  // Reset state for new symbol
  currentTechnicals  = null;
  currentOptions     = null;
  currentReddit      = null;
  currentInsiders    = null;
  currentFundamentals = null;
  currentNews        = null;
  _optionsLoaded  = false;
  _redditLoaded   = false;
  _insidersLoaded = false;

  try {
    // Análisis técnico es sincrónico (usa currentData ya disponible)
    if (currentData) {
      currentTechnicals = computeTechnicals(currentData);
      // Guardar datos para correlación
      analyzedStocks[symbol] = currentData;
    }

    const [fund, news, options, reddit, insiders] = await Promise.allSettled([
      fetchFundamentals(symbol),
      fetchNews(symbol),
      fetchOptionsData(symbol),
      fetchRedditSentiment(symbol),
      fetchInsiderTrading(symbol),
    ]);

    currentFundamentals = fund.status     === 'fulfilled' ? fund.value     : null;
    currentNews         = news.status     === 'fulfilled' ? news.value     : null;
    currentOptions      = options.status  === 'fulfilled' ? options.value  : null;
    currentReddit       = reddit.status   === 'fulfilled' ? reddit.value   : null;
    currentInsiders     = insiders.status === 'fulfilled' ? insiders.value : null;

    _optionsLoaded  = true;
    _redditLoaded   = true;
    _insidersLoaded = true;

    // If context tab is already visible, re-render with complete data
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab?.dataset.tab === 'context') {
      renderContextTab();
    }
  } catch (_) {
    _optionsLoaded  = true;
    _redditLoaded   = true;
    _insidersLoaded = true;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Simulation Controls
// ═══════════════════════════════════════════════════════════════════
function setupControls() {
  $('#runBtn')?.addEventListener('click', runSimulation);
}

async function runSimulation() {
  if (!currentData || !currentSymbol) return;

  const horizon = parseInt($('#horizonInput').value) || DEFAULTS.horizon;
  const nSim = parseInt($('#simInput').value) || DEFAULTS.simulations;
  const currency = getCurrency(currentSymbol);
  const backtestSimulations = Math.min(DEFAULTS.backtestSimulations, Math.max(400, Math.round(nSim / 4)));

  // Get selected models
  const selectedModels = [];
  $$('.model-checkbox').forEach(cb => {
    if (cb.checked) selectedModels.push(cb.value);
  });
  if (selectedModels.length === 0) {
    showError('Selecciona al menos un modelo de simulación');
    return;
  }

  const logReturns = computeLogReturns(currentData.adjClose);
  if (logReturns.length < 30) {
    showError('Datos históricos insuficientes (mínimo 30 días)');
    return;
  }

  const s0 = currentData.currentPrice;
  const runBtn = $('#runBtn');
  runBtn.disabled = true;
  runBtn.innerHTML = '<span class="spinner"></span> Simulando...';

  showLoading('Ejecutando simulaciones Monte Carlo...');

  try {
    const { results, metrics } = await runSimulationsViaWorker(
      logReturns, s0, horizon, nSim, selectedModels, 42,
      ({ pct, message }) => updateLoadingProgress(pct, message)
    );

    currentResults = results;
    currentMetrics = metrics;

    currentBacktest = null;
    try {
      updateLoadingProgress(55, 'Validando cómo habría funcionado hace 1 año...');
      currentBacktest = await runBacktestViaWorker(
        currentData.adjClose,
        currentData.dates,
        selectedModels,
        {
          horizon: DEFAULTS.backtestHorizon,
          nSim: backtestSimulations,
          minTrainingDays: DEFAULTS.backtestMinTrainingDays,
          checkpointStep: DEFAULTS.backtestCheckpointStep,
          maxCheckpoints: DEFAULTS.backtestMaxCheckpoints,
          neutralBandPct: DEFAULTS.backtestNeutralBandPct,
          seed: 4200,
        },
        ({ pct, message, modelId, checkpointIndex, checkpointCount }) => {
          const modelName = MODELS[modelId]?.name || modelId || '';
          updateLoadingProgress(pct, message || `Backtest ${modelName} · corte ${checkpointIndex}/${checkpointCount}`);
        }
      );
    } catch (backtestError) {
      console.warn('Backtest histórico no disponible:', backtestError);
    }

    renderResults(results, currentMetrics, currency, s0, currentBacktest);

    $('#resultsSection').classList.remove('hidden');
    hideLoading();

    // Show PDF header button and wire click handler
    const pdfHeaderBtn = $('#pdfHeaderBtn');
    if (pdfHeaderBtn) {
      pdfHeaderBtn.classList.remove('hidden');
      // Replace any old listener by cloning the node
      const fresh = pdfHeaderBtn.cloneNode(true);
      pdfHeaderBtn.parentNode.replaceChild(fresh, pdfHeaderBtn);
      fresh.addEventListener('click', () => {
        exportSimulationPDF(currentSymbol, currentResults, currentMetrics, currentBacktest, currentFundamentals, currentNews, macroData, currentTechnicals, currentOptions, currentInsiders, currentReddit);
      });
    }

    // Scroll to results
    $('#resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    hideLoading();
    showError(`Error en simulación: ${error.message}`);
    console.error(error);
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = '▶ Ejecutar Simulaciones';
  }
}

// ═══════════════════════════════════════════════════════════════════
// Render Results
// ═══════════════════════════════════════════════════════════════════
function renderResults(results, metrics, currency, s0, backtest) {
  renderOverviewTab(results, metrics, currency, s0, backtest);
  renderSimulationsTab(results, currency);
  renderRiskTab(metrics, currency, s0);
  renderCompareTab(results, metrics, currency);
  renderBacktestTab(backtest, currency);
  renderMethodologyTab(results, metrics);
  renderContextTab(); // render with whatever context data is available
}

// ── Overview Tab ─────────────────────────────────────────────────
function renderOverviewTab(results, metrics, currency, s0, backtest) {
  const container = $('#overviewContent');
  if (!container) return;

  // Use first model for primary signal, or an average
  const modelIds = Object.keys(metrics);
  const primaryId = modelIds[0];
  const primary = metrics[primaryId];
  const signal = generateSignal(primary);

  // Consensus: average across all models
  const avgProbUp = modelIds.reduce((s, id) => s + metrics[id].probUp, 0) / modelIds.length;
  const avgExpReturn = modelIds.reduce((s, id) => s + metrics[id].expectedReturnPct, 0) / modelIds.length;
  const avgExpPrice = modelIds.reduce((s, id) => s + metrics[id].expectedPrice, 0) / modelIds.length;
  const backtestRanking = rankBacktestModels(backtest?.results);
  const bestHistorical = backtestRanking[0] || null;
  const bestHistoricalModel = bestHistorical ? (MODELS[bestHistorical.id] || { name: bestHistorical.id }) : null;

  // Consensus signal
  const consensusMetrics = { ...primary, probUp: avgProbUp, expectedReturnPct: avgExpReturn };
  const consensus = generateSignal(consensusMetrics);

  container.innerHTML = `
    <!-- Signal Banner -->
    <div class="signal-banner glass-card" style="--accent: ${consensus.color}">
      <div class="signal-badge" style="background: ${consensus.color}">
        <span class="signal-icon">${consensus.signal === 'BUY' ? '📈' : consensus.signal === 'SELL' ? '📉' : '⏸️'}</span>
        <span class="signal-text">${consensus.signal}</span>
      </div>
      <div class="signal-details">
        <div class="signal-score">
          <div class="score-ring" style="--score: ${consensus.score}; --color: ${consensus.color}">
            <span>${consensus.score}</span>
          </div>
          <span class="score-label">Score</span>
        </div>
        <div class="signal-meta">
          <div class="meta-row"><span>Confianza</span><strong>${consensus.confidence}</strong></div>
          <div class="meta-row"><span>Consenso ${modelIds.length} modelos</span></div>
        </div>
      </div>
    </div>

    <!-- Key Metrics Grid -->
    <div class="metrics-grid">
      <div class="metric-card glass-card">
        <span class="metric-label">Precio Actual</span>
        <span class="metric-value">${currency}${s0.toFixed(2)}</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Precio Esperado (media)</span>
        <span class="metric-value ${avgExpPrice >= s0 ? 'text-green' : 'text-red'}">${currency}${avgExpPrice.toFixed(2)}</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Retorno Esperado</span>
        <span class="metric-value ${avgExpReturn >= 0 ? 'text-green' : 'text-red'}">${avgExpReturn >= 0 ? '+' : ''}${avgExpReturn.toFixed(2)}%</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">P(Subida)</span>
        <span class="metric-value">${(avgProbUp * 100).toFixed(1)}%</span>
        <div class="prob-bar"><div class="prob-fill" style="width:${avgProbUp * 100}%; background:${avgProbUp > 0.5 ? '#E8C547' : '#EF4444'}"></div></div>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">VaR 95% (media)</span>
        <span class="metric-value text-red">${(modelIds.reduce((s, id) => s + (metrics[id].VaR_95 || 0), 0) / modelIds.length * 100).toFixed(2)}%</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Sharpe Ratio</span>
        <span class="metric-value">${(primary.sharpe || 0).toFixed(3)}</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Sortino Ratio</span>
        <span class="metric-value">${(primary.sortino || 0).toFixed(3)}</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Max Drawdown (media)</span>
        <span class="metric-value text-red">${(modelIds.reduce((s, id) => s + (metrics[id].mddMean || 0), 0) / modelIds.length * 100).toFixed(2)}%</span>
      </div>
      ${bestHistorical ? `
      <div class="metric-card glass-card">
        <span class="metric-label">Mejor histórico</span>
        <span class="metric-value">${bestHistoricalModel.name}</span>
        <span class="metric-note">Score ${bestHistorical.score} · ${(bestHistorical.directionAccuracy * 100).toFixed(1)}% acierto</span>
      </div>` : ''}
    </div>

    <!-- Export Actions -->
    <div class="export-actions">
      <button class="btn-export" id="exportCsvBtn">⬇ Exportar CSV</button>
      <button class="btn-export" id="exportPdfBtn">🖨 Exportar PDF</button>
    </div>

    <!-- Model Summary Table -->
    <div class="table-wrapper glass-card">
      <h3>Resumen por Modelo</h3>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Precio Esperado</th>
              <th>Retorno %</th>
              <th>P(Subida)</th>
              <th>VaR 95%</th>
              <th>CVaR 95%</th>
              <th>MDD medio</th>
              <th>Señal</th>
              <th>Tiempo</th>
            </tr>
          </thead>
          <tbody>
            ${modelIds.map(id => {
              const m = metrics[id];
              const sig = generateSignal(m);
              const mdl = MODELS[id] || { name: id, color: '#888' };
              return `<tr>
                <td><span class="model-dot" style="background:${mdl.color}"></span>${mdl.name}</td>
                <td>${currency}${m.expectedPrice.toFixed(2)}</td>
                <td class="${m.expectedReturnPct >= 0 ? 'text-green' : 'text-red'}">${m.expectedReturnPct >= 0 ? '+' : ''}${m.expectedReturnPct.toFixed(2)}%</td>
                <td>${(m.probUp * 100).toFixed(1)}%</td>
                <td>${((m.VaR_95 || 0) * 100).toFixed(2)}%</td>
                <td>${((m.CVaR_95 || 0) * 100).toFixed(2)}%</td>
                <td>${((m.mddMean || 0) * 100).toFixed(2)}%</td>
                <td><span class="signal-mini" style="background:${sig.color}">${sig.signal}</span></td>
                <td>${results[id].timeMs || 0}ms</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Wire export buttons rendered inside overview
  document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    exportSimulationCSV(currentSymbol, currentResults, currentMetrics);
  });
  document.getElementById('exportPdfBtn')?.addEventListener('click', () => {
    exportSimulationPDF(currentSymbol, currentResults, currentMetrics, currentBacktest, currentFundamentals, currentNews, macroData, currentTechnicals, currentOptions, currentInsiders, currentReddit);
  });
}

// ── Simulations Tab ──────────────────────────────────────────────
function renderSimulationsTab(results, currency) {
  const container = $('#simulationsContent');
  if (!container) return;

  const modelIds = Object.keys(results);
  container.innerHTML = modelIds.map(id => {
    const mdl = MODELS[id] || { name: id, fullName: id };
    return `
      <div class="sim-card glass-card">
        <h3 style="color:${mdl.color}">${mdl.fullName || mdl.name}</h3>
        <p class="sim-params">${formatParams(results[id].params)}</p>
        <div class="chart-row">
          <div class="chart-box">
            <h4>Abanico de Trayectorias</h4>
            <div class="chart-container"><canvas id="fan-${id}"></canvas></div>
          </div>
          <div class="chart-box">
            <h4>Distribución Precio Final</h4>
            <div class="chart-container"><canvas id="dist-${id}"></canvas></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Render charts after DOM update
  requestAnimationFrame(() => {
    for (const id of modelIds) {
      renderFanChart(`fan-${id}`, results[id], currency);
      renderDistribution(`dist-${id}`, results[id].finalPrices, results[id].s0, id, currency);
    }
  });
}

function formatParams(params) {
  if (!params) return '';
  return Object.entries(params)
    .filter(([k]) => !['nReturns'].includes(k))
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? (Math.abs(v) < 0.01 ? v.toExponential(2) : v.toFixed(4)) : v}`)
    .join(' · ');
}

// ── Risk Tab ─────────────────────────────────────────────────────
function renderRiskTab(metrics, currency, s0) {
  const container = $('#riskContent');
  if (!container) return;

  const modelIds = Object.keys(metrics);
  const primary = metrics[modelIds[0]];

  container.innerHTML = `
    <!-- Confidence Intervals -->
    <div class="glass-card">
      <h3>Intervalos de Confianza (media todos los modelos)</h3>
      <div class="ci-grid">
        ${[95, 99].map(cl => {
          const lower = modelIds.reduce((s, id) => s + (metrics[id][`ci${cl}Lower`] ?? 0), 0) / modelIds.length;
          const upper = modelIds.reduce((s, id) => s + (metrics[id][`ci${cl}Upper`] ?? 0), 0) / modelIds.length;
          return `
            <div class="ci-card glass-card">
              <span class="ci-label">IC ${cl}%</span>
              <div class="ci-range">
                <span class="ci-lo text-red">${currency}${lower.toFixed(2)}</span>
                <span class="ci-arrow">→</span>
                <span class="ci-hi text-green">${currency}${upper.toFixed(2)}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Probability of Loss -->
    <div class="glass-card">
      <h3>Probabilidad de Pérdida (media todos los modelos)</h3>
      <div class="loss-grid">
        ${[10, 20, 30].map(pct => {
          const avg = modelIds.reduce((s, id) => s + (metrics[id][`probLoss${pct}`] || 0), 0) / modelIds.length;
          return `
            <div class="loss-card">
              <span class="loss-pct">Pérdida ≥ ${pct}%</span>
              <span class="loss-val text-red">${(avg * 100).toFixed(2)}%</span>
              <div class="prob-bar"><div class="prob-fill prob-red" style="width:${avg * 100}%"></div></div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- VaR & CVaR details per model -->
    <div class="glass-card">
      <h3>VaR & CVaR Detallado</h3>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Modelo</th>
              <th>VaR 90%</th><th>CVaR 90%</th>
              <th>VaR 95%</th><th>CVaR 95%</th>
              <th>VaR 99%</th><th>CVaR 99%</th>
            </tr>
          </thead>
          <tbody>
            ${modelIds.map(id => {
              const m = metrics[id];
              const mdl = MODELS[id] || { name: id, color: '#888' };
              return `<tr>
                <td><span class="model-dot" style="background:${mdl.color}"></span>${mdl.name}</td>
                <td>${((m.VaR_90 || 0) * 100).toFixed(2)}%</td><td>${((m.CVaR_90 || 0) * 100).toFixed(2)}%</td>
                <td>${((m.VaR_95 || 0) * 100).toFixed(2)}%</td><td>${((m.CVaR_95 || 0) * 100).toFixed(2)}%</td>
                <td>${((m.VaR_99 || 0) * 100).toFixed(2)}%</td><td>${((m.CVaR_99 || 0) * 100).toFixed(2)}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Historical Volatility -->
    ${primary.vol_30d != null ? `
    <div class="glass-card">
      <h3>Volatilidad Histórica Anualizada</h3>
      <div class="metrics-grid metrics-small">
        <div class="metric-card glass-card"><span class="metric-label">30 días</span><span class="metric-value">${((primary.vol_30d || 0) * 100).toFixed(2)}%</span></div>
        <div class="metric-card glass-card"><span class="metric-label">60 días</span><span class="metric-value">${((primary.vol_60d || 0) * 100).toFixed(2)}%</span></div>
        <div class="metric-card glass-card"><span class="metric-label">252 días</span><span class="metric-value">${((primary.vol_252d || 0) * 100).toFixed(2)}%</span></div>
      </div>
    </div>` : ''}
  `;
}

// ── Compare Tab ──────────────────────────────────────────────────
function renderCompareTab(results, metrics, currency) {
  const container = $('#compareContent');
  if (!container) return;

  container.innerHTML = `
    <div class="compare-grid">
      <div class="glass-card chart-card">
        <h3>Comparación Trayectorias Medianas</h3>
        <div class="chart-container chart-lg"><canvas id="compareMedians"></canvas></div>
      </div>
      <div class="glass-card chart-card">
        <h3>VaR & CVaR por Modelo</h3>
        <div class="chart-container chart-md"><canvas id="compareVar"></canvas></div>
      </div>
      <div class="glass-card chart-card">
        <h3>Probabilidad de Subida & Retorno Esperado</h3>
        <div class="chart-container chart-md"><canvas id="compareProb"></canvas></div>
      </div>
      <div class="glass-card chart-card">
        <h3>Tiempo de Ejecución</h3>
        <div class="chart-container chart-sm"><canvas id="compareTiming"></canvas></div>
      </div>
    </div>

    <!-- Detailed comparison table -->
    <div class="glass-card">
      <h3>Comparación Completa</h3>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Métrica</th>
              ${Object.keys(results).map(id => `<th style="color:${(MODELS[id] || {}).color || '#fff'}">${(MODELS[id] || { name: id }).name}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${generateComparisonRows(results, metrics, currency)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    renderComparisonChart('compareMedians', results, currency);
    renderVarComparison('compareVar', metrics);
    renderProbComparison('compareProb', metrics);
    renderTimingChart('compareTiming', results);
  });
}

function generateComparisonRows(results, metrics, currency) {
  const ids = Object.keys(metrics);
  const rows = [
    ['Precio Esperado', id => `${currency}${metrics[id].expectedPrice.toFixed(2)}`],
    ['Mediana', id => `${currency}${metrics[id].medianPrice.toFixed(2)}`],
    ['Retorno Esperado', id => `${metrics[id].expectedReturnPct >= 0 ? '+' : ''}${metrics[id].expectedReturnPct.toFixed(2)}%`],
    ['P(Subida)', id => `${(metrics[id].probUp * 100).toFixed(1)}%`],
    ['IC 95% Inferior', id => `${currency}${metrics[id].ci95Lower.toFixed(2)}`],
    ['IC 95% Superior', id => `${currency}${metrics[id].ci95Upper.toFixed(2)}`],
    ['VaR 95%', id => `${((metrics[id].VaR_95 || 0) * 100).toFixed(2)}%`],
    ['CVaR 95%', id => `${((metrics[id].CVaR_95 || 0) * 100).toFixed(2)}%`],
    ['MDD Medio', id => `${((metrics[id].mddMean || 0) * 100).toFixed(2)}%`],
    ['MDD Peor', id => `${((metrics[id].mddWorst || 0) * 100).toFixed(2)}%`],
    ['P(Pérdida ≥10%)', id => `${((metrics[id].probLoss10 || 0) * 100).toFixed(2)}%`],
    ['P(Pérdida ≥20%)', id => `${((metrics[id].probLoss20 || 0) * 100).toFixed(2)}%`],
    ['Tiempo', id => `${results[id].timeMs || 0}ms`],
    ['Señal', id => { const s = generateSignal(metrics[id]); return `<span class="signal-mini" style="background:${s.color}">${s.signal}</span>`; }],
  ];

  return rows.map(([label, fn]) =>
    `<tr><td class="row-label">${label}</td>${ids.map(id => `<td>${fn(id)}</td>`).join('')}</tr>`
  ).join('');
}

function formatShortDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderBacktestTab(backtest, currency) {
  const container = $('#backtestContent');
  if (!container) return;

  if (!backtest?.results || Object.keys(backtest.results).length === 0) {
    container.innerHTML = `
      <div class="glass-card empty-state-card">
        <h3>Validación histórica no disponible</h3>
        <p>No hay suficiente histórico para comprobar cómo habría funcionado cada algoritmo con un horizonte fijo de 1 año.</p>
      </div>
    `;
    return;
  }

  const ranking = rankBacktestModels(backtest.results);
  const best = ranking[0];
  const bestModel = MODELS[best.id] || { name: best.id, color: '#D4A843' };
  const bestLatestWindow = backtest.results[best.id].summary.latestWindow;
  const latestRows = ranking.map(item => {
    const model = MODELS[item.id] || { name: item.id, color: '#888' };
    const latestWindow = backtest.results[item.id].summary.latestWindow;
    return { item, model, latestWindow };
  });
  const winsMap = Object.fromEntries(ranking.map(item => [item.id, item.wins]));

  container.innerHTML = `
    <div class="glass-card backtest-hero" style="--accent:${bestModel.color}">
      <div>
        <span class="backtest-eyebrow">Chequeo global a 1 año</span>
        <h3>${bestModel.name} es el algoritmo con mejor histórico en ${currentSymbol}</h3>
        <p>
          Se evaluaron ${best.nCheckpoints} checkpoints, entrenando cada modelo solo con los datos disponibles en cada fecha y comparando la predicción con el precio real 252 sesiones después.
        </p>
      </div>
      <div class="backtest-badges">
        <span class="backtest-pill">Score ${best.score}</span>
        <span class="backtest-pill">${best.wins}/${best.nCheckpoints} mejores cortes</span>
        <span class="backtest-pill">${(best.directionAccuracy * 100).toFixed(1)}% dirección</span>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card glass-card">
        <span class="metric-label">Ventanas testeadas</span>
        <span class="metric-value">${best.nCheckpoints}</span>
        <span class="metric-note">Paso ${Math.round(backtest.settings.checkpointStep / 21)} meses aprox.</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Periodo validado</span>
        <span class="metric-value metric-value-sm">${formatShortDate(best.periodStart)}</span>
        <span class="metric-note">hasta ${formatShortDate(best.periodEnd)}</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Error medio mejor modelo</span>
        <span class="metric-value">${best.meanAbsErrorPct.toFixed(2)}%</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Cobertura IC 95%</span>
        <span class="metric-value">${(best.within95Rate * 100).toFixed(1)}%</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Último corte validado</span>
        <span class="metric-value metric-value-sm">${formatShortDate(bestLatestWindow?.trainEndDate)}</span>
        <span class="metric-note">real visto en ${formatShortDate(bestLatestWindow?.actualEndDate)}</span>
      </div>
    </div>

    <div class="compare-grid">
      <div class="glass-card chart-card">
        <h3>Ranking histórico</h3>
        <div class="chart-container chart-md"><canvas id="backtestRanking"></canvas></div>
      </div>
      <div class="glass-card chart-card">
        <h3>Error por checkpoint</h3>
        <div class="chart-container chart-md"><canvas id="backtestErrors"></canvas></div>
      </div>
    </div>

    <div class="glass-card">
      <h3>Ranking por algoritmo</h3>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Score</th>
              <th>Veces mejor</th>
              <th>Acierto dirección</th>
              <th>Error medio</th>
              <th>Error mediano</th>
              <th>Cobertura 95%</th>
              <th>Sesgo medio</th>
              <th>Último error</th>
              <th>Tiempo medio</th>
            </tr>
          </thead>
          <tbody>
            ${ranking.map(item => {
              const model = MODELS[item.id] || { name: item.id, color: '#888' };
              return `<tr>
                <td><span class="model-dot" style="background:${model.color}"></span>${model.name}</td>
                <td>${item.score}</td>
                <td>${item.wins}/${item.nCheckpoints}</td>
                <td>${(item.directionAccuracy * 100).toFixed(1)}%</td>
                <td>${item.meanAbsErrorPct.toFixed(2)}%</td>
                <td>${item.medianAbsErrorPct.toFixed(2)}%</td>
                <td>${(item.within95Rate * 100).toFixed(1)}%</td>
                <td class="${item.avgBiasPct <= 0 ? 'text-green' : 'text-red'}">${item.avgBiasPct >= 0 ? '+' : ''}${item.avgBiasPct.toFixed(2)}%</td>
                <td>${item.latestAbsErrorPct.toFixed(2)}%</td>
                <td>${item.avgTimeMs}ms</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="glass-card">
      <h3>Última validación disponible</h3>
      <p class="section-note">Esto replica exactamente la pregunta "¿qué habría pasado si lanzaba la simulación hace un año?" con los últimos datos cerrados del histórico.</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Fecha corte</th>
              <th>Precio inicial</th>
              <th>Predicción media</th>
              <th>Precio real</th>
              <th>Error</th>
              <th>P(Subida)</th>
              <th>Señal</th>
              <th>IC 95%</th>
            </tr>
          </thead>
          <tbody>
            ${latestRows.map(({ item, model, latestWindow }) => {
              if (!latestWindow) return '';
              return `<tr>
                <td><span class="model-dot" style="background:${model.color}"></span>${model.name}</td>
                <td>${formatShortDate(latestWindow.trainEndDate)}</td>
                <td>${currency}${latestWindow.s0.toFixed(2)}</td>
                <td>${currency}${latestWindow.predictedPrice.toFixed(2)}</td>
                <td>${currency}${latestWindow.actualPrice.toFixed(2)}</td>
                <td>${latestWindow.absErrorPct.toFixed(2)}%</td>
                <td>${(latestWindow.probUp * 100).toFixed(1)}%</td>
                <td><span class="signal-mini" style="background:${latestWindow.signalColor}">${latestWindow.signal}</span></td>
                <td>${currency}${latestWindow.ci95Lower.toFixed(2)} → ${currency}${latestWindow.ci95Upper.toFixed(2)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    renderBacktestRankingChart('backtestRanking', backtest.results, winsMap);
    renderBacktestErrorTrendChart('backtestErrors', backtest.results);
  });
}

// ═══════════════════════════════════════════════════════════════════
// Context Tab — Macro + Technicals + Options + Fundamentals + News + Reddit + Insiders + Correlation
// ═══════════════════════════════════════════════════════════════════
function renderContextTab() {
  const container = $('#contextContent');
  if (!container) return;

  const sym = currentSymbol || '—';

  let html = '';

  // ── 1. Análisis técnico ─────────────────────────────────────────
  html += `<div class="context-section glass-card">
    <h3>📈 Análisis Técnico</h3>`;
  if (currentTechnicals) {
    // Interpretación del score técnico para el activo concreto
    const t = currentTechnicals;
    const interp = t.score >= 70
      ? `Los indicadores técnicos de <strong>${sym}</strong> apuntan a un <strong>sesgo alcista</strong> claro (score ${t.score}/100). La tendencia principal es <em>${t.trend}</em> con ${t.bullPoints} puntos alcistas frente a ${t.bearPoints} bajistas.`
      : t.score <= 35
        ? `El cuadro técnico de <strong>${sym}</strong> refleja <strong>debilidad</strong> (score ${t.score}/100). Tendencia <em>${t.trend}</em> — predominan ${t.bearPoints} señales bajistas frente a ${t.bullPoints} alcistas.`
        : `Los indicadores técnicos de <strong>${sym}</strong> muestran una situación <strong>mixta o neutral</strong> (score ${t.score}/100). Tendencia <em>${t.trend}</em> con ${t.bullPoints} puntos alcistas y ${t.bearPoints} bajistas.`;
    html += `<p class="context-interp">${interp}</p>`;
    html += renderTechnicalsCard(t);
  } else {
    html += `<p class="context-loading">Calculando análisis técnico de ${sym}...</p>`;
  }
  html += `</div>`;

  // ── 2. Opciones — Put/Call ratio ────────────────────────────────
  html += `<div class="context-section glass-card">
    <h3>⚖️ Opciones & Sentimiento Institucional</h3>`;
  if (!_optionsLoaded) {
    html += `<p class="context-loading">Cargando datos de opciones de ${sym}...</p>`;
  } else if (currentOptions && !currentOptions.unavailable) {
    const o = currentOptions;
    const interp = o.pcRatioVol != null
      ? (o.pcRatioVol < 0.7
          ? `El mercado de opciones de <strong>${sym}</strong> muestra un sesgo <strong>alcista</strong>: más calls que puts (P/C Vol ${o.pcRatioVol.toFixed(2)}). Los participantes institucionales apuestan mayoritariamente al alza.`
          : o.pcRatioVol > 1.2
            ? `El mercado de opciones refleja <strong>cautela o cobertura bajista</strong> en <strong>${sym}</strong> (P/C Vol ${o.pcRatioVol.toFixed(2)}). El predominio de puts puede indicar expectativas de caída o cobertura de carteras largas.`
            : `El mercado de opciones de <strong>${sym}</strong> está <strong>equilibrado</strong> (P/C Vol ${o.pcRatioVol.toFixed(2)}), sin sesgo direccional claro entre alcistas y bajistas.`)
      : `Datos de opciones obtenidos para <strong>${sym}</strong>.`;
    html += `<p class="context-interp">${interp}</p>`;
    html += renderOptionsCard(o);
  } else {
    html += renderOptionsCard(null);
  }
  html += `</div>`;

  // ── 3. Macro ────────────────────────────────────────────────────
  html += `<div class="context-section glass-card">
    <h3>🌍 Contexto Macroeconómico</h3>`;
  if (macroData) {
    const m = macroData;
    const interp = m.score >= 60
      ? `El entorno macro es <strong>favorable</strong> para activos de riesgo como <strong>${sym}</strong> (score ${m.score}/100). Los indicadores apuntan a condiciones de crédito y liquidez positivas.`
      : m.score <= 35
        ? `El entorno macro plantea <strong>vientos de cara</strong> para <strong>${sym}</strong> (score ${m.score}/100). Tipos altos, inflación persistente o curva invertida pueden presionar las valoraciones.`
        : `El contexto macro para <strong>${sym}</strong> es <strong>neutro a mixto</strong> (score ${m.score}/100). Conviene vigilar la evolución de tipos e inflación como factores clave.`;
    html += `<p class="context-interp">${interp}</p>`;
    html += `<div id="contextMacroPanel">${renderMacroContextCard(m)}</div>`;
  } else {
    html += `<div id="contextMacroPanel"><p class="context-loading">Cargando datos macro...</p></div>`;
    fetchMacroData().then(data => {
      macroData = data;
      const el = document.getElementById('contextMacroPanel');
      if (el) el.innerHTML = renderMacroContextCard(data);
    }).catch(() => {
      const el = document.getElementById('contextMacroPanel');
      if (el) el.innerHTML = '<p class="context-unavailable">Datos macro no disponibles</p>';
    });
  }
  html += `</div>`;

  // ── 4. Fundamentales ────────────────────────────────────────────
  html += `<div class="context-section glass-card">
    <h3>📋 Fundamentales</h3>`;
  if (currentFundamentals && !currentFundamentals.unavailable) {
    const f = currentFundamentals;
    const pe = f.valuation?.trailingPE;
    const roe = f.profitability?.returnOnEquity;
    const rec = f.analystConsensus?.recommendationKey?.toUpperCase();
    const targetMean = f.analystConsensus?.targetMeanPrice;
    const currentPrice = currentData?.currentPrice;
    const upsideStr = (targetMean && currentPrice && currentPrice > 0)
      ? ` El precio objetivo medio de analistas implica un <strong>${((targetMean / currentPrice - 1) * 100).toFixed(1)}%</strong> de ${targetMean > currentPrice ? 'potencial alcista' : 'recorte'}.`
      : '';
    const peStr = pe != null
      ? (pe < 15 ? `P/E de ${pe.toFixed(1)}x, por debajo de la media histórica del mercado — potencialmente infravalorado o sector defensivo.`
         : pe > 35 ? `P/E de ${pe.toFixed(1)}x — valoración exigente que requiere crecimiento robusto para justificarse.`
         : `P/E de ${pe.toFixed(1)}x en rango normal.`)
      : '';
    const roeStr = roe != null ? ` ROE del ${roe.toFixed(1)}% — ${roe > 15 ? 'alta rentabilidad sobre el capital' : roe > 8 ? 'rentabilidad moderada' : 'rentabilidad reducida'}.` : '';
    html += `<p class="context-interp"><strong>${sym}</strong>: ${peStr}${roeStr}${upsideStr} ${rec ? `Consenso analistas: <strong>${rec}</strong>.` : ''}</p>`;
    html += renderFundamentalsCard(f);
  } else if (currentFundamentals === null && !_optionsLoaded) {
    // Aún cargando (aprovechamos _optionsLoaded como proxy de "carga terminada")
    html += `<p class="context-loading">Cargando fundamentales de ${sym}...</p>`;
  } else {
    html += `<p class="context-unavailable">Fundamentales no disponibles para ${sym}</p>`;
  }
  html += `</div>`;

  // ── 5. Earnings Calendar ────────────────────────────────────────
  const cal = currentFundamentals?.calendar;
  html += `<div class="context-section glass-card">
    <h3>📅 Calendario: Earnings & Dividendos</h3>
    <div id="contextEarnings">
      ${renderEarningsCalendar(cal, currentFundamentals)}
    </div></div>`;

  // ── 6. Noticias ──────────────────────────────────────────────────
  html += `<div class="context-section glass-card">
    <h3>📰 Noticias & Sentimiento</h3>`;
  if (currentNews) {
    const si = currentNews.sentimentIndex;
    if (si) {
      const interp = si.score > 0.2
        ? `El sentimiento de las noticias recientes sobre <strong>${sym}</strong> es <strong>positivo</strong> (score ${si.score?.toFixed(2)}). El flujo de noticias puede actuar como catalizador alcista a corto plazo.`
        : si.score < -0.2
          ? `El flujo informativo reciente sobre <strong>${sym}</strong> tiene un tono <strong>negativo</strong> (score ${si.score?.toFixed(2)}). Evalúa si los titulares reflejan un riesgo fundamental o una sobrereacción puntual.`
          : `El sentimiento informativo de <strong>${sym}</strong> es <strong>neutral</strong> (score ${si.score?.toFixed(2)}). Sin catalizadores de noticias destacados en este momento.`;
      html += `<p class="context-interp">${interp}</p>`;
    }
    html += renderNewsCard(currentNews);
  } else if (!_optionsLoaded) {
    html += `<p class="context-loading">Cargando noticias de ${sym}...</p>`;
  } else {
    html += `<p class="context-unavailable">Noticias no disponibles para ${sym}</p>`;
  }
  html += `</div>`;

  // ── 7. Reddit / WallStreetBets ───────────────────────────────────
  html += `<div class="context-section glass-card">
    <h3>🗣️ Sentimiento Reddit</h3>`;
  if (!_redditLoaded) {
    html += `<p class="context-loading">Cargando menciones en Reddit de ${sym}...</p>`;
  } else if (currentReddit && currentReddit.mentions > 0) {
    const r = currentReddit;
    const s = r.overallSentiment;
    const interp = s?.label === 'Muy Positivo' || s?.label === 'Positivo'
      ? `<strong>${sym}</strong> tiene <strong>alta presencia y sentimiento favorable</strong> en Reddit (${r.mentions} menciones). La comunidad retail muestra entusiasmo — puede amplificar movimientos al alza, pero también introduce volatilidad especulativa.`
      : s?.label === 'Negativo' || s?.label === 'Muy Negativo'
        ? `El sentimiento de la comunidad retail en Reddit hacia <strong>${sym}</strong> es <strong>negativo</strong> (${r.mentions} menciones). Esto puede anticipar presión vendedora o simplemente reflejar el contexto de mercado reciente.`
        : `<strong>${sym}</strong> tiene presencia en Reddit con ${r.mentions} menciones. El sentimiento general es <strong>${s?.label ?? 'neutro'}</strong> — sin momentum especulativo destacado.`;
    html += `<p class="context-interp">${interp}</p>`;
    html += renderRedditCard(r);
  } else {
    html += renderRedditCard(currentReddit);
  }
  html += `</div>`;

  // ── 8. Insider Trading ───────────────────────────────────────────
  html += `<div class="context-section glass-card">
    <h3>🏛️ Insider Trading (SEC Form 4)</h3>`;
  if (!_insidersLoaded) {
    html += `<p class="context-loading">Cargando datos de insiders de ${sym}...</p>`;
  } else if (currentInsiders && currentInsiders.count > 0) {
    const interp = `Se han detectado <strong>${currentInsiders.count} filing(s) Form 4</strong> recientes en SEC EDGAR para <strong>${sym}</strong>. Las compras de insiders suelen interpretarse como señal de confianza interna; las ventas masivas pueden indicar toma de beneficios o necesidades de liquidez.`;
    html += `<p class="context-interp">${interp}</p>`;
    html += renderInsidersCard(currentInsiders, currentFundamentals);
  } else {
    html += renderInsidersCard(currentInsiders, currentFundamentals);
  }
  html += `</div>`;

  // ── 9. Correlación entre activos analizados ──────────────────────
  const corrData = Object.keys(analyzedStocks).length >= 2
    ? computeCorrelationMatrix(analyzedStocks)
    : null;
  html += `<div class="context-section glass-card">
    <h3>🔗 Correlación entre Activos</h3>`;
  if (Object.keys(analyzedStocks).length < 2) {
    html += `<p class="context-unavailable">Analiza al menos 2 activos para ver la matriz de correlación. La correlación mide si los activos se mueven en la misma dirección — útil para diversificar una cartera.</p>`;
  } else {
    const nStocks = Object.keys(analyzedStocks).length;
    html += `<p class="context-interp">Correlación de retornos diarios entre los <strong>${nStocks} activos</strong> analizados en esta sesión. Valores cercanos a +1 indican movimiento conjunto (baja diversificación); cercanos a −1, movimiento opuesto (buena cobertura); cercanos a 0, independencia.</p>`;
    html += renderCorrelationCard(corrData);
  }
  html += `</div>`;

  container.innerHTML = html;
}

/** Renderiza el calendario de earnings y dividendos */
function renderEarningsCalendar(cal, fundamentals) {
  if (!cal && !fundamentals) return '<p class="context-loading">Cargando calendario...</p>';
  if (!cal || (cal.earningsDates.length === 0 && !cal.exDividendDate && !cal.dividendDate)) {
    return '<p class="context-unavailable">Sin eventos de calendario próximos</p>';
  }

  const today = new Date();
  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return Math.round((d - today) / 86400000);
  };

  let html = '<div class="earnings-calendar">';

  // Earnings dates
  if (cal.earningsDates.length > 0) {
    cal.earningsDates.forEach(dateStr => {
      const days = daysUntil(dateStr);
      const urgency = days !== null && days >= 0 && days <= 14 ? 'earnings-urgent' : '';
      const daysLabel = days !== null
        ? (days < 0 ? `(hace ${Math.abs(days)}d)` : days === 0 ? '(HOY)' : `(en ${days}d)`)
        : '';
      html += `<div class="earnings-event ${urgency}">
        <span class="earnings-icon">📊</span>
        <div class="earnings-info">
          <span class="earnings-label">Resultados Trimestrales</span>
          <span class="earnings-date">${dateStr} <strong>${daysLabel}</strong></span>
          ${cal.earningsAvg ? `<span class="earnings-est">EPS estimado: ${cal.earningsAvg} (rango ${cal.earningsLow}–${cal.earningsHigh})</span>` : ''}
          ${cal.revenueAvg ? `<span class="earnings-est">Revenue estimado: ${cal.revenueAvg}</span>` : ''}
        </div>
      </div>`;
    });
  }

  // Ex-dividendo
  if (cal.exDividendDate) {
    const days = daysUntil(cal.exDividendDate);
    const daysLabel = days !== null ? (days < 0 ? `(hace ${Math.abs(days)}d)` : `(en ${days}d)`) : '';
    html += `<div class="earnings-event">
      <span class="earnings-icon">💰</span>
      <div class="earnings-info">
        <span class="earnings-label">Fecha Ex-Dividendo</span>
        <span class="earnings-date">${cal.exDividendDate} <strong>${daysLabel}</strong></span>
        ${fundamentals?.dividends?.dividendRate ? `<span class="earnings-est">Dividendo: ${fundamentals.dividends.dividendRate} (yield ${fundamentals.dividends.dividendYield}%)</span>` : ''}
      </div>
    </div>`;
  }

  // Fecha de pago
  if (cal.dividendDate) {
    const days = daysUntil(cal.dividendDate);
    const daysLabel = days !== null ? (days < 0 ? `(hace ${Math.abs(days)}d)` : `(en ${days}d)`) : '';
    html += `<div class="earnings-event">
      <span class="earnings-icon">🏦</span>
      <div class="earnings-info">
        <span class="earnings-label">Fecha de Pago Dividendo</span>
        <span class="earnings-date">${cal.dividendDate} <strong>${daysLabel}</strong></span>
      </div>
    </div>`;
  }

  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════════════
// Methodology Tab — Algorithm documentation
// ═══════════════════════════════════════════════════════════════════
function renderMethodologyTab(results, metrics) {
  const container = $('#methodologyContent');
  if (!container) return;

  const usedModelIds = Object.keys(results || {});

  container.innerHTML = `
    <!-- Data Source Section -->
    <div class="glass-card methodology-section">
      <h3>📡 Fuente de Datos</h3>
      <div class="method-content">
        <p>Los datos de mercado se obtienen en <strong>tiempo real</strong> de <strong>Yahoo Finance</strong> (gratuito) a través de proxies CORS públicos. Los datos macro proceden de la API pública de <strong>FRED</strong> (Federal Reserve) sin necesidad de clave.</p>
        <div class="method-pipeline">
          <div class="pipeline-step">
            <span class="pipeline-icon">🌐</span>
            <span class="pipeline-label">Yahoo Finance API</span>
            <span class="pipeline-desc">Precios históricos OHLCV (Open, High, Low, Close, Volume) de los últimos 5 años</span>
          </div>
          <div class="pipeline-arrow">→</div>
          <div class="pipeline-step">
            <span class="pipeline-icon">📊</span>
            <span class="pipeline-label">Log-Returns</span>
            <span class="pipeline-desc">Se calculan rendimientos logarítmicos diarios: ln(P_t / P_{t-1})</span>
          </div>
          <div class="pipeline-arrow">→</div>
          <div class="pipeline-step">
            <span class="pipeline-icon">🔮</span>
            <span class="pipeline-label">Simulación MC</span>
            <span class="pipeline-desc">Los log-returns alimentan los 5 motores estocásticos para generar trayectorias futuras</span>
          </div>
          <div class="pipeline-arrow">→</div>
          <div class="pipeline-step">
            <span class="pipeline-icon">⚠️</span>
            <span class="pipeline-label">Análisis de Riesgo</span>
            <span class="pipeline-desc">VaR, CVaR, Sharpe, Sortino, MDD, probabilidades y señales de inversión</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Algorithm Details -->
    <div class="glass-card methodology-section">
      <h3>🧮 Modelos de Simulación Monte Carlo</h3>
      <p class="method-intro">El programa implementa <strong>5 modelos estocásticos</strong> diferentes. Cada uno hace distintos supuestos sobre el comportamiento del mercado, lo que permite una visión más robusta al compararlos.</p>

      <!-- GBM -->
      <div class="algo-card ${usedModelIds.includes('gbm') ? 'algo-active' : ''}" style="--algo-color: #F0D060">
        <div class="algo-header">
          <span class="algo-dot" style="background:#F0D060"></span>
          <h4>1. Movimiento Browniano Geométrico (GBM)</h4>
          ${usedModelIds.includes('gbm') ? '<span class="algo-badge">EN USO</span>' : ''}
        </div>
        <div class="algo-body">
          <div class="algo-equation">
            <strong>Ecuación diferencial estocástica (SDE):</strong>
            <code>dS = μ·S·dt + σ·S·dW</code>
          </div>
          <div class="algo-equation">
            <strong>Solución exacta (discretizada):</strong>
            <code>S(t+1) = S(t) · exp[(μ − σ²/2)·Δt + σ·√Δt·Z]</code>, donde Z ~ N(0,1)
          </div>
          <div class="algo-details">
            <div class="algo-detail-grid">
              <div><strong>μ (drift):</strong> Tasa media de rendimiento diario, estimada de los log-returns históricos</div>
              <div><strong>σ (volatilidad):</strong> Desviación estándar de los log-returns históricos</div>
            </div>
            <div class="algo-pros-cons">
              <div class="algo-pros">
                <strong>✅ Ventajas:</strong>
                <ul><li>Rápido y bien establecido teóricamente</li><li>Base de la valoración Black-Scholes</li><li>Ideal para análisis rápido general</li></ul>
              </div>
              <div class="algo-cons">
                <strong>⚠️ Limitaciones:</strong>
                <ul><li>Asume volatilidad constante</li><li>No captura eventos extremos (cisnes negros)</li><li>Rendimientos log-normales (colas finas)</li></ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Heston -->
      <div class="algo-card ${usedModelIds.includes('heston') ? 'algo-active' : ''}" style="--algo-color: #D4A843">
        <div class="algo-header">
          <span class="algo-dot" style="background:#D4A843"></span>
          <h4>2. Volatilidad Estocástica de Heston</h4>
          ${usedModelIds.includes('heston') ? '<span class="algo-badge">EN USO</span>' : ''}
        </div>
        <div class="algo-body">
          <div class="algo-equation">
            <strong>SDE del precio:</strong>
            <code>dS = μ·S·dt + √v·S·dW₁</code>
          </div>
          <div class="algo-equation">
            <strong>SDE de la varianza:</strong>
            <code>dv = κ(θ − v)·dt + ξ·√v·dW₂</code>, con corr(dW₁, dW₂) = ρ
          </div>
          <div class="algo-details">
            <div class="algo-detail-grid">
              <div><strong>κ (kappa):</strong> Velocidad de reversión a la media — calibrada por grid search</div>
              <div><strong>θ (theta):</strong> Varianza de largo plazo — media de la varianza rodante a 21 días</div>
              <div><strong>ξ (xi):</strong> Volatilidad de la volatilidad (vol-of-vol)</div>
              <div><strong>ρ (rho):</strong> Correlación entre el precio y la volatilidad (típicamente negativa: "leverage effect")</div>
              <div><strong>v₀:</strong> Varianza inicial — varianza de los últimos 21 días</div>
            </div>
            <div class="algo-pros-cons">
              <div class="algo-pros">
                <strong>✅ Ventajas:</strong>
                <ul><li>Modela la volatilidad como proceso estocástico</li><li>Captura el "smile" de volatilidad</li><li>Más realista para mercados reales</li></ul>
              </div>
              <div class="algo-cons">
                <strong>⚠️ Limitaciones:</strong>
                <ul><li>Calibración más compleja y lenta</li><li>Más parámetros que estimar</li><li>Puede generar varianzas negativas (se corrige con reflexión)</li></ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Jump Diffusion -->
      <div class="algo-card ${usedModelIds.includes('jump') ? 'algo-active' : ''}" style="--algo-color: #E8C547">
        <div class="algo-header">
          <span class="algo-dot" style="background:#E8C547"></span>
          <h4>3. Difusión con Saltos de Merton</h4>
          ${usedModelIds.includes('jump') ? '<span class="algo-badge">EN USO</span>' : ''}
        </div>
        <div class="algo-body">
          <div class="algo-equation">
            <strong>SDE:</strong>
            <code>dS = μ·S·dt + σ·S·dW + J·S·dN</code>
          </div>
          <div class="algo-equation">
            <code>N ~ Poisson(λ)</code>, <code>J ~ LogNormal(m, δ)</code>
          </div>
          <div class="algo-details">
            <div class="algo-detail-grid">
              <div><strong>λ (lambda):</strong> Frecuencia de saltos — proporción de retornos que exceden 2.5σ</div>
              <div><strong>m (jumpMean):</strong> Tamaño medio del salto (en log-returns)</div>
              <div><strong>δ (jumpStd):</strong> Desviación del tamaño del salto</div>
              <div><strong>σ (sigmaC):</strong> Volatilidad de la componente continua (sin saltos)</div>
            </div>
            <div class="algo-calibration">
              <strong>🔧 Calibración:</strong> Los saltos se identifican como retornos que exceden 2.5 desviaciones estándar de la media. La componente difusiva se estima con los retornos restantes (sin saltos).
            </div>
            <div class="algo-pros-cons">
              <div class="algo-pros">
                <strong>✅ Ventajas:</strong>
                <ul><li>Captura eventos extremos (crashes, rallies)</li><li>Genera colas gruesas más realistas</li><li>Ideal para acciones volátiles (biotech, bancos)</li></ul>
              </div>
              <div class="algo-cons">
                <strong>⚠️ Limitaciones:</strong>
                <ul><li>Los saltos pasados no garantizan saltos futuros</li><li>Difícil predecir cuándo ocurrirá un salto</li></ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- GARCH -->
      <div class="algo-card ${usedModelIds.includes('garch') ? 'algo-active' : ''}" style="--algo-color: #C49B38">
        <div class="algo-header">
          <span class="algo-dot" style="background:#C49B38"></span>
          <h4>4. GARCH(1,1) Monte Carlo</h4>
          ${usedModelIds.includes('garch') ? '<span class="algo-badge">EN USO</span>' : ''}
        </div>
        <div class="algo-body">
          <div class="algo-equation">
            <strong>Ecuación de volatilidad condicional:</strong>
            <code>σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}</code>
          </div>
          <div class="algo-equation">
            <strong>Retorno:</strong>
            <code>r_t = μ + σ_t · Z_t</code>, donde Z ~ N(0,1)
          </div>
          <div class="algo-details">
            <div class="algo-detail-grid">
              <div><strong>ω (omega):</strong> Varianza incondicional × (1 − α − β). Componente constante</div>
              <div><strong>α (alpha):</strong> Peso del shock previo (ε²). Sensibilidad a noticias recientes</div>
              <div><strong>β (beta):</strong> Persistencia de la varianza. Memoria de la volatilidad</div>
              <div><strong>Restricción:</strong> α + β < 1 para estacionariedad</div>
            </div>
            <div class="algo-calibration">
              <strong>🔧 Calibración:</strong> Grid search optimizando la log-verosimilitud. Se prueban combinaciones de α ∈ [0.02, 0.20] y β ∈ [0.70, 0.96] con α + β < 0.999.
            </div>
            <div class="algo-pros-cons">
              <div class="algo-pros">
                <strong>✅ Ventajas:</strong>
                <ul><li>Captura "clusters de volatilidad" (periodos tranquilos/turbulentos)</li><li>La volatilidad de mañana depende de la de hoy</li><li>Modelo más realista de la dinámica del riesgo</li></ul>
              </div>
              <div class="algo-cons">
                <strong>⚠️ Limitaciones:</strong>
                <ul><li>Más lento en calibración</li><li>No captura saltos abruptos</li><li>Grid search puede no encontrar el óptimo global</li></ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bootstrap -->
      <div class="algo-card ${usedModelIds.includes('bootstrap') ? 'algo-active' : ''}" style="--algo-color: #9A7B2C">
        <div class="algo-header">
          <span class="algo-dot" style="background:#9A7B2C"></span>
          <h4>5. Bootstrap Histórico (Remuestreo)</h4>
          ${usedModelIds.includes('bootstrap') ? '<span class="algo-badge">EN USO</span>' : ''}
        </div>
        <div class="algo-body">
          <div class="algo-equation">
            <strong>Método:</strong>
            <code>S(t+1) = S(t) · exp[r*]</code>, donde r* es un log-return seleccionado aleatoriamente del historial
          </div>
          <div class="algo-details">
            <div class="algo-detail-grid">
              <div><strong>Sin parámetros:</strong> No hace supuestos sobre la distribución de rendimientos</div>
              <div><strong>Remuestreo con reemplazo:</strong> Los retornos históricos se eligen al azar con reemplazo</div>
            </div>
            <div class="algo-pros-cons">
              <div class="algo-pros">
                <strong>✅ Ventajas:</strong>
                <ul><li>Preserva colas gruesas, asimetría y curtosis real</li><li>No-paramétrico: sin supuestos distribucionales</li><li>Rápido y sencillo de implementar</li></ul>
              </div>
              <div class="algo-cons">
                <strong>⚠️ Limitaciones:</strong>
                <ul><li>Asume que el futuro es similar al pasado</li><li>No genera retornos fuera del rango histórico</li><li>No captura cambios estructurales</li></ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Comparison Table -->
    <div class="glass-card methodology-section">
      <h3>📊 Comparativa de Modelos</h3>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Velocidad</th>
              <th>Realismo</th>
              <th>Complejidad</th>
              <th>Mejor uso</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="model-dot" style="background:#F0D060"></span>GBM</td>
              <td>⚡⚡⚡</td><td>⭐⭐</td><td>Baja</td>
              <td>Análisis rápido general</td>
            </tr>
            <tr>
              <td><span class="model-dot" style="background:#D4A843"></span>Heston</td>
              <td>⚡⚡</td><td>⭐⭐⭐⭐</td><td>Alta</td>
              <td>Mercados con volatilidad variable</td>
            </tr>
            <tr>
              <td><span class="model-dot" style="background:#E8C547"></span>Jump Diffusion</td>
              <td>⚡⚡</td><td>⭐⭐⭐⭐</td><td>Media</td>
              <td>Acciones con riesgo de crashes</td>
            </tr>
            <tr>
              <td><span class="model-dot" style="background:#C49B38"></span>GARCH(1,1)</td>
              <td>⚡</td><td>⭐⭐⭐⭐⭐</td><td>Alta</td>
              <td>Clusters de volatilidad reales</td>
            </tr>
            <tr>
              <td><span class="model-dot" style="background:#9A7B2C"></span>Bootstrap</td>
              <td>⚡⚡⚡</td><td>⭐⭐⭐</td><td>Baja</td>
              <td>Sin supuestos distribucionales</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Risk Metrics Documentation -->
    <div class="glass-card methodology-section">
      <h3>⚠️ Métricas de Riesgo Calculadas</h3>
      <div class="metrics-docs">
        <div class="metric-doc">
          <h4>Value at Risk (VaR)</h4>
          <p>Con un nivel de confianza del X%, la pérdida no superará este valor en el horizonte simulado.</p>
          <code>VaR_{α} = −Percentil(returns, 1−α)</code>
          <p class="metric-example">Ejemplo: VaR 95% = 18% → hay un 95% de probabilidad de no perder más del 18%.</p>
        </div>
        <div class="metric-doc">
          <h4>Conditional VaR (CVaR / Expected Shortfall)</h4>
          <p>Si estás en el peor X% de escenarios, ¿cuánto pierdes de media?</p>
          <code>CVaR_{α} = −E[returns | returns ≤ VaR_{α}]</code>
          <p class="metric-example">Ejemplo: CVaR 95% = 24% → en el peor 5% de casos, pierdes de media un 24%.</p>
        </div>
        <div class="metric-doc">
          <h4>Sharpe Ratio</h4>
          <p>Rendimiento por unidad de riesgo total (usando datos históricos).</p>
          <code>Sharpe = (μ_anual − r_f) / σ_anual</code>
          <p class="metric-example">> 1 = bueno · > 2 = excelente · r_f = 3.5% (referencia)</p>
        </div>
        <div class="metric-doc">
          <h4>Sortino Ratio</h4>
          <p>Como el Sharpe, pero solo penaliza la volatilidad bajista (downside risk).</p>
          <code>Sortino = (μ_anual − r_f) / σ_downside</code>
          <p class="metric-example">Más relevante para inversores que solo les preocupan las pérdidas.</p>
        </div>
        <div class="metric-doc">
          <h4>Max Drawdown (MDD)</h4>
          <p>Caída máxima desde un pico hasta un valle dentro de las trayectorias simuladas.</p>
          <code>MDD = max_t[(Peak_t − S_t) / Peak_t]</code>
          <p class="metric-example">Mide el peor escenario de pérdida no realizada durante la simulación.</p>
        </div>
      </div>
    </div>

    <!-- Signal System -->
    <div class="glass-card methodology-section">
      <h3>🚦 Sistema de Señales de Inversión</h3>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr><th>Señal</th><th>Condiciones</th><th>Interpretación</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="signal-mini" style="background:#E8C547; color:#0a0906">BUY</span></td>
              <td>P(Subida) > 65% <strong>Y</strong> Retorno esperado > 5% <strong>Y</strong> Sharpe > 0.5</td>
              <td>Las tres condiciones deben cumplirse simultáneamente</td>
            </tr>
            <tr>
              <td><span class="signal-mini" style="background:#EF4444">SELL</span></td>
              <td>P(Subida) < 35% <strong>O</strong> (VaR 95% > 15% <strong>Y</strong> precio esperado < actual)</td>
              <td>Basta con que se cumpla una de las condiciones</td>
            </tr>
            <tr>
              <td><span class="signal-mini" style="background:#9A7B2C">HOLD</span></td>
              <td>Cualquier otro caso</td>
              <td>No se cumplen las condiciones de BUY ni SELL</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="confidence-info">
        <h4>Niveles de Confianza del Score</h4>
        <div class="confidence-grid">
          <div class="confidence-item"><strong>HIGH</strong> — ≥ 5.000 simulaciones</div>
          <div class="confidence-item"><strong>MEDIUM</strong> — ≥ 2.000 simulaciones</div>
          <div class="confidence-item"><strong>LOW</strong> — Menos de 2.000 simulaciones</div>
        </div>
        <p style="margin-top:12px; color: var(--text-secondary)">
          <strong>Score (0–100):</strong> Combina probabilidad de subida (40%), Sharpe Ratio (20%) y retorno esperado (40%) para ordenar las acciones de más a menos atractivas.
        </p>
      </div>
    </div>

    <!-- PRNG & Reproducibility -->
    <div class="glass-card methodology-section">
      <h3>🎲 Reproducibilidad y Números Aleatorios</h3>
      <div class="method-content">
        <p>Todas las simulaciones usan un <strong>generador pseudoaleatorio con semilla</strong> (Mulberry32 + Box-Muller) para garantizar reproducibilidad:</p>
        <ul class="method-list">
          <li><strong>Mulberry32:</strong> PRNG de 32 bits con semilla determinista (seed=42)</li>
          <li><strong>Box-Muller:</strong> Transforma uniformes en normales estándar N(0,1)</li>
          <li><strong>Poisson (Knuth):</strong> Para los saltos del modelo Jump-Diffusion</li>
          <li><strong>Misma semilla = mismos resultados:</strong> Cada ejecución con los mismos parámetros produce resultados idénticos</li>
        </ul>
      </div>
    </div>

    <!-- Disclaimer -->
    <div class="glass-card methodology-section disclaimer-section">
      <h3>⚠️ Disclaimer</h3>
      <p>Esta herramienta es para <strong>fines educativos y de investigación</strong>. No constituye asesoramiento financiero. Las simulaciones Monte Carlo son modelos probabilísticos que no garantizan resultados futuros. Invierte siempre bajo tu propia responsabilidad.</p>
      <p style="margin-top:8px">Los datos se obtienen de Yahoo Finance en tiempo real. La precisión y disponibilidad de los datos depende del proveedor.</p>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════
// Tabs
// ═══════════════════════════════════════════════════════════════════
function setupTabs() {
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab-btn');
    if (!tab) return;
    const tabId = tab.dataset.tab;
    setActiveTab(tabId);
    // Lazy-render context tab when clicked
    if (tabId === 'context') {
      renderContextTab();
    }
  });
}

function setActiveTab(tabId) {
  $$('.tab-btn').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabId}`));
}

// ═══════════════════════════════════════════════════════════════════
// Loading & Error UI
// ═══════════════════════════════════════════════════════════════════
function showLoading(msg) {
  let overlay = $('#loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-card glass-card">
        <div class="loading-spinner"></div>
        <p class="loading-msg">${msg}</p>
        <div class="loading-progress"><div class="loading-bar"></div></div>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    overlay.querySelector('.loading-msg').textContent = msg;
    overlay.querySelector('.loading-bar').style.width = '0%';
  }
  overlay.classList.add('active');
}

function updateLoadingProgress(pct, msg) {
  const overlay = $('#loadingOverlay');
  if (!overlay) return;
  overlay.querySelector('.loading-bar').style.width = pct + '%';
  if (msg) overlay.querySelector('.loading-msg').textContent = msg;
}

function hideLoading() {
  const overlay = $('#loadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

function showError(msg) {
  let toast = $('#errorToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'errorToast';
    toast.className = 'error-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 5000);
}
