import {
  DEFAULTS,
  MARKETS,
  MODELS,
  COMMODITIES,
  PORTFOLIO_MODELS,
  PORTFOLIO_UNIVERSES,
  getTickerName,
  getCurrency,
} from './config.js';
import { fetchMarketUniverse, fetchBulkStockData, computeLogReturns } from './api.js';
import {
  runAllSimulations,
  runHistoricalBacktest,
  computeRiskMetrics,
  generateSignal,
  rankBacktestModels,
} from './simulation.js';
import { renderUniverseRankingChart, renderPortfolioAllocationChart } from './charts.js';

const $ = (selector) => document.querySelector(selector);
const PREVIEW_LIMIT = 42;

const state = {
  initialized: false,
  running: false,
  callbacks: null,
  universes: {},
  selectedSymbols: new Map(),
  lastReport: null,
};

export function setupPortfolioTool(callbacks) {
  state.callbacks = callbacks;
  renderUniverseButtons();
  renderSelection();
  renderPortfolioPlaceholder();

  if (state.initialized) return;
  state.initialized = true;

  $('#portfolioUniverseButtons')?.addEventListener('click', async (event) => {
    const button = event.target.closest('.universe-chip');
    if (!button) return;
    await addUniverseToSelection(button.dataset.universe, button);
  });

  $('#addManualSymbolsBtn')?.addEventListener('click', addManualSymbolsFromInput);
  $('#clearPortfolioSymbolsBtn')?.addEventListener('click', clearSelection);
  $('#runMarketRankingBtn')?.addEventListener('click', () => runMarketRadar('ranking'));
  $('#runIdealPortfolioBtn')?.addEventListener('click', () => runMarketRadar('portfolio'));

  $('#selectedSymbolsList')?.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.selected-symbol-remove');
    if (!removeButton) return;
    state.selectedSymbols.delete(removeButton.dataset.symbol);
    renderSelection();
  });

  $('#marketReportContent')?.addEventListener('click', (event) => {
    const openButton = event.target.closest('.portfolio-open-stock');
    if (!openButton || !state.callbacks?.openStock) return;
    state.callbacks.openStock(openButton.dataset.symbol);
  });
}

function renderUniverseButtons() {
  const container = $('#portfolioUniverseButtons');
  if (!container) return;

  container.innerHTML = Object.values(PORTFOLIO_UNIVERSES).map((universe) => `
    <button class="universe-chip glass-card" data-universe="${universe.id}">
      <span class="universe-flag">${universe.flag}</span>
      <span class="universe-copy">
        <strong>${universe.label}</strong>
        <span>Añadir universo completo</span>
      </span>
    </button>
  `).join('');
}

function renderPortfolioPlaceholder() {
  const container = $('#marketReportContent');
  if (!container || state.lastReport) return;

  container.innerHTML = `
    <div class="glass-card empty-state-card">
      <h3>Sin informe generado</h3>
      <p>
        Selecciona uno o varios universos, añade tickers manuales si quieres mezclar ideas propias, y ejecuta el radar para obtener el ranking global y el portfolio ideal de hoy.
      </p>
    </div>
  `;
}

function addManualSymbolsFromInput() {
  const input = $('#manualSymbolsInput');
  const rawValue = input?.value || '';
  const symbols = rawValue
    .split(/[\s,;\n\r]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    state.callbacks?.showError?.('Introduce al menos un ticker manual.');
    return;
  }

  addSymbols(symbols.map((symbol) => ({
    symbol,
    name: getTickerName(symbol),
    universeLabel: 'Selección Manual',
  })));

  if (input) input.value = '';
}

function clearSelection() {
  state.selectedSymbols.clear();
  renderSelection();
  state.lastReport = null;
  renderPortfolioPlaceholder();
}

async function addUniverseToSelection(universeId, button) {
  const previousText = button?.innerHTML || '';
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner mini-spinner"></span><span class="universe-copy"><strong>Cargando...</strong><span>Descargando universo</span></span>';
  }

  try {
    const universe = await loadUniverse(universeId);
    const entries = Object.entries(universe.tickers).map(([symbol, name]) => ({
      symbol,
      name,
      universeLabel: universe.label,
    }));
    addSymbols(entries);
  } catch (error) {
    state.callbacks?.showError?.(`No se pudo cargar ${universeId}: ${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = previousText;
    }
  }
}

async function loadUniverse(universeId) {
  if (state.universes[universeId]) return state.universes[universeId];

  try {
    const universe = await fetchMarketUniverse(universeId);
    state.universes[universeId] = universe;
    return universe;
  } catch (_) {
    const fallback = getUniverseFallback(universeId);
    state.universes[universeId] = fallback;
    return fallback;
  }
}

function getUniverseFallback(universeId) {
  if (universeId === 'commodities') {
    return { label: 'Materias Primas', currency: '$', tickers: COMMODITIES };
  }
  if (universeId === 'ibex35') {
    return { label: 'IBEX 35', currency: '€', tickers: MARKETS['IBEX 35'].tickers };
  }
  if (universeId === 'sp500') {
    return { label: 'S&P 500', currency: '$', tickers: MARKETS['S&P 500'].tickers };
  }
  return { label: universeId, currency: '$', tickers: {} };
}

function addSymbols(entries) {
  for (const entry of entries) {
    const existing = state.selectedSymbols.get(entry.symbol) || {};
    state.selectedSymbols.set(entry.symbol, {
      symbol: entry.symbol,
      name: entry.name || existing.name || getTickerName(entry.symbol),
      universeLabel: entry.universeLabel || existing.universeLabel || inferUniverseLabel(entry.symbol),
    });
  }
  renderSelection();
}

function renderSelection() {
  const symbols = [...state.selectedSymbols.values()];
  const summary = $('#selectedSymbolsSummary');
  const container = $('#selectedSymbolsList');
  if (summary) {
    summary.textContent = `${symbols.length} activos seleccionados`;
  }
  if (!container) return;

  const visibleSymbols = symbols.slice(0, PREVIEW_LIMIT);
  const hiddenCount = Math.max(0, symbols.length - PREVIEW_LIMIT);

  container.innerHTML = `
    ${visibleSymbols.map((item) => `
      <span class="selected-symbol-pill">
        <button class="selected-symbol-main" type="button" title="${item.name}">
          <strong>${item.symbol}</strong>
          <span>${item.universeLabel}</span>
        </button>
        <button class="selected-symbol-remove" type="button" data-symbol="${item.symbol}" aria-label="Eliminar ${item.symbol}">×</button>
      </span>
    `).join('')}
    ${hiddenCount > 0 ? `<span class="selected-symbol-more">+${hiddenCount} más</span>` : ''}
  `;
}

async function runMarketRadar(mode) {
  if (state.running) return;

  const symbols = [...state.selectedSymbols.keys()];
  if (symbols.length === 0) {
    state.callbacks?.showError?.('Añade al menos un universo o varios tickers antes de lanzar el radar.');
    return;
  }

  state.running = true;
  const showLoading = state.callbacks?.showLoading;
  const updateLoadingProgress = state.callbacks?.updateLoadingProgress;
  const hideLoading = state.callbacks?.hideLoading;
  const showError = state.callbacks?.showError;

  try {
    showLoading?.('Descargando históricos del universo seleccionado...');

    const failedSymbols = [];
    const bulkData = await fetchBulkStockData(
      symbols,
      DEFAULTS.scannerRange,
      DEFAULTS.scannerBatchChunkSize,
      (done, total, symbol, error) => {
        const pct = Math.round((done / total) * 40);
        updateLoadingProgress?.(pct, `Descargando ${symbol} (${done}/${total})${error ? ' · omitida' : ''}`);
        if (error) failedSymbols.push(symbol);
      }
    );

    const quickUniverse = Object.entries(bulkData)
      .map(([symbol, data]) => buildQuickCandidate(symbol, data))
      .filter(Boolean)
      .sort((left, right) => right.quickScore - left.quickScore);

    if (quickUniverse.length === 0) {
      throw new Error('No se pudieron descargar históricos válidos para el universo seleccionado.');
    }

    const deepCandidates = quickUniverse.slice(0, Math.min(DEFAULTS.scannerDeepCandidates, quickUniverse.length));
    const deepMap = new Map();

    for (let index = 0; index < deepCandidates.length; index++) {
      const candidate = deepCandidates[index];
      const baseProgress = 40 + Math.round((index / deepCandidates.length) * 55);
      updateLoadingProgress?.(baseProgress, `Analizando ${candidate.symbol} (${index + 1}/${deepCandidates.length})...`);
      const deepAsset = await runDeepAssetAnalysis(candidate, index, deepCandidates.length, updateLoadingProgress);
      deepMap.set(candidate.symbol, deepAsset);
    }

    const ranking = quickUniverse
      .map((asset) => deepMap.get(asset.symbol) || asset)
      .sort((left, right) => right.analysisScore - left.analysisScore)
      .map((asset, index) => ({ ...asset, rank: index + 1 }));

    const portfolioSize = clamp(parseInt($('#portfolioSizeInput')?.value, 10) || DEFAULTS.scannerPortfolioSize, 3, 20);
    const maxWeight = clamp((parseInt($('#portfolioMaxWeightInput')?.value, 10) || Math.round(DEFAULTS.scannerMaxWeight * 100)) / 100, 0.05, 0.5);
    const portfolio = buildIdealPortfolio(ranking, portfolioSize, maxWeight);
    const marketState = computeMarketState(ranking);

    state.lastReport = {
      mode,
      generatedAt: new Date(),
      ranking,
      portfolio,
      marketState,
      failedSymbols,
      analyzedCount: quickUniverse.length,
      selectedCount: symbols.length,
      deepCount: deepCandidates.length,
    };

    updateLoadingProgress?.(100, 'Montando informe final...');
    renderMarketReport(state.lastReport);
    hideLoading?.();

    if (mode === 'portfolio') {
      $('#marketReportContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    hideLoading?.();
    showError?.(`No se pudo generar el informe final: ${error.message}`);
  } finally {
    state.running = false;
  }
}

function buildQuickCandidate(symbol, data) {
  const meta = state.selectedSymbols.get(symbol) || {};
  const prices = data?.adjClose || [];
  if (prices.length < 120) return null;

  const logReturns = computeLogReturns(prices);
  if (logReturns.length < 60) return null;

  const quick = computeQuickSnapshot(prices, logReturns);
  const scoreColor = quick.quickScore >= 70 ? '#E8C547' : quick.quickScore >= 55 ? '#9A7B2C' : '#EF4444';

  return {
    symbol,
    name: meta.name || data.symbol || getTickerName(symbol),
    universeLabel: meta.universeLabel || inferUniverseLabel(symbol),
    currency: getCurrency(symbol),
    price: data.currentPrice,
    data,
    stage: 'quick',
    recommendation: quick.quickScore >= 70 ? 'WATCH+' : quick.quickScore >= 55 ? 'WATCH' : 'DESCARTAR',
    signalColor: scoreColor,
    analysisScore: quick.quickScore,
    quickScore: quick.quickScore,
    expectedReturnPct: quick.annualReturnPct,
    historicalScore: 0,
    volatility: quick.volatility,
    sharpe: quick.sharpe,
    maxDrawdown: quick.maxDrawdown,
    annualReturnPct: quick.annualReturnPct,
    halfYearReturnPct: quick.halfYearReturnPct,
    trendPct: quick.trendPct,
    rationale: ['Filtro rápido de mercado'],
  };
}

function computeQuickSnapshot(prices, logReturns) {
  const lastYearIndex = Math.max(0, prices.length - 253);
  const lastHalfYearIndex = Math.max(0, prices.length - 127);
  const oneYearPrice = prices[lastYearIndex];
  const halfYearPrice = prices[lastHalfYearIndex];
  const currentPrice = prices[prices.length - 1];
  const lookbackReturns = logReturns.slice(-Math.min(logReturns.length, DEFAULTS.scannerQuickLookback));

  const annualReturnPct = oneYearPrice > 0 ? ((currentPrice / oneYearPrice) - 1) * 100 : 0;
  const halfYearReturnPct = halfYearPrice > 0 ? ((currentPrice / halfYearPrice) - 1) * 100 : 0;
  const volatility = std(lookbackReturns) * Math.sqrt(252);
  const annualDrift = mean(lookbackReturns) * 252;
  const sharpe = volatility > 0 ? (annualDrift - DEFAULTS.riskFreeRate) / volatility : 0;
  const sma50 = movingAverage(prices, 50);
  const sma200 = movingAverage(prices, 200);
  const trendPct = sma200 > 0 ? ((currentPrice / sma200) - 1) * 100 : 0;
  const maxDrawdown = computePriceMaxDrawdown(prices);

  const momentumScore = clamp(50 + annualReturnPct * 0.8 + halfYearReturnPct * 0.3, 0, 100);
  const sharpeScore = clamp(50 + sharpe * 18, 0, 100);
  const drawdownScore = clamp(100 + maxDrawdown * 170, 0, 100);
  const volatilityScore = clamp(100 - volatility * 110, 0, 100);
  const trendScore = clamp(50 + trendPct * 1.8 + (sma50 > sma200 ? 8 : -8), 0, 100);

  const quickScore = Math.round(
    momentumScore * 0.35 +
    sharpeScore * 0.25 +
    drawdownScore * 0.20 +
    volatilityScore * 0.10 +
    trendScore * 0.10
  );

  return {
    quickScore,
    annualReturnPct,
    halfYearReturnPct,
    volatility,
    sharpe,
    maxDrawdown,
    trendPct,
  };
}

async function runDeepAssetAnalysis(candidate, candidateIndex, candidateCount, updateLoadingProgress) {
  const logReturns = computeLogReturns(candidate.data.adjClose);
  const currentResults = await runAllSimulations(
    logReturns,
    candidate.data.currentPrice,
    DEFAULTS.horizon,
    DEFAULTS.scannerCurrentSimulations,
    PORTFOLIO_MODELS,
    9000 + candidateIndex,
    (modelId, done, total) => {
      const localPct = total > 0 ? done / total : 0;
      const pct = 40 + Math.round((((candidateIndex + localPct * 0.55) / candidateCount)) * 55);
      updateLoadingProgress?.(pct, `Simulando ${candidate.symbol} · ${MODELS[modelId]?.name || modelId}`);
    }
  );

  const currentMetrics = {};
  for (const [modelId, result] of Object.entries(currentResults)) {
    currentMetrics[modelId] = computeRiskMetrics(result, logReturns);
  }

  const backtest = await runHistoricalBacktest(
    candidate.data.adjClose,
    candidate.data.dates,
    PORTFOLIO_MODELS,
    {
      horizon: DEFAULTS.backtestHorizon,
      nSim: DEFAULTS.scannerHistoricalSimulations,
      minTrainingDays: DEFAULTS.backtestMinTrainingDays,
      checkpointStep: DEFAULTS.backtestCheckpointStep,
      maxCheckpoints: 1,
      neutralBandPct: DEFAULTS.backtestNeutralBandPct,
      seed: 12000 + candidateIndex,
    },
    ({ modelId, done, total }) => {
      const localPct = total > 0 ? done / total : 0;
      const pct = 40 + Math.round((((candidateIndex + 0.55 + localPct * 0.45) / candidateCount)) * 55);
      updateLoadingProgress?.(pct, `Validando ${candidate.symbol} · ${MODELS[modelId]?.name || modelId}`);
    }
  );

  const historicalRanking = rankBacktestModels(backtest.results);
  const bestHistorical = historicalRanking[0];
  const winningModelId = bestHistorical?.id || PORTFOLIO_MODELS[0];
  const winningMetrics = currentMetrics[winningModelId] || Object.values(currentMetrics)[0];
  const currentSignal = generateSignal(winningMetrics);
  const historicalScore = bestHistorical?.score || candidate.quickScore;
  const expectedReturnScore = clamp(50 + winningMetrics.expectedReturnPct * 2.2, 0, 100);
  const riskScore = clamp(100 - ((winningMetrics.VaR_95 || 0) * 100 * 2.4) - (Math.abs(winningMetrics.mddMean || 0) * 100 * 1.2), 0, 100);

  const analysisScore = Math.round(
    candidate.quickScore * 0.25 +
    historicalScore * 0.30 +
    currentSignal.score * 0.25 +
    expectedReturnScore * 0.10 +
    riskScore * 0.10
  );

  const recommendation = derivePortfolioRecommendation(currentSignal.signal, historicalScore, candidate.quickScore, winningMetrics.expectedReturnPct);
  const historicalWindow = bestHistorical?.latestWindow || null;

  return {
    ...candidate,
    stage: 'deep',
    recommendation,
    signalColor: currentSignal.color,
    analysisScore,
    currentSignalScore: currentSignal.score,
    currentSignal: currentSignal.signal,
    historicalModelId: winningModelId,
    historicalModel: MODELS[winningModelId]?.name || winningModelId,
    historicalScore,
    historicalDirectionAccuracy: bestHistorical?.directionAccuracy || 0,
    historicalErrorPct: bestHistorical?.meanAbsErrorPct || 0,
    historicalLatestErrorPct: historicalWindow?.absErrorPct || 0,
    expectedReturnPct: winningMetrics.expectedReturnPct,
    probUp: winningMetrics.probUp,
    volatility: candidate.volatility,
    sharpe: candidate.sharpe,
    maxDrawdown: candidate.maxDrawdown,
    rationale: buildAssetRationale(bestHistorical, winningMetrics, currentSignal),
  };
}

function derivePortfolioRecommendation(currentSignal, historicalScore, quickScore, expectedReturnPct) {
  if (currentSignal === 'SELL' || historicalScore < 45 || expectedReturnPct < -2) return 'SELL';
  if (currentSignal === 'BUY' && historicalScore >= 60 && quickScore >= 60) return 'BUY';
  return 'HOLD';
}

function buildAssetRationale(bestHistorical, winningMetrics, currentSignal) {
  const points = [];
  if (bestHistorical) {
    points.push(`${MODELS[bestHistorical.id]?.name || bestHistorical.id} fue el mejor modelo histórico`);
    points.push(`Acierto direccional ${(bestHistorical.directionAccuracy * 100).toFixed(1)}%`);
  }
  points.push(`P(subida) ${(winningMetrics.probUp * 100).toFixed(1)}%`);
  points.push(`Señal actual ${currentSignal.signal}`);
  return points;
}

function buildIdealPortfolio(ranking, portfolioSize, maxWeight) {
  const candidates = ranking
    .filter((asset) => asset.stage === 'deep' && asset.recommendation !== 'SELL')
    .sort((left, right) => right.analysisScore - left.analysisScore);

  const fallbackCandidates = ranking
    .filter((asset) => asset.stage === 'deep')
    .sort((left, right) => right.analysisScore - left.analysisScore);

  const picks = (candidates.length >= portfolioSize ? candidates : fallbackCandidates).slice(0, portfolioSize);
  if (picks.length === 0) return [];

  return allocatePortfolioWeights(picks, maxWeight);
}

function allocatePortfolioWeights(picks, maxWeight) {
  const effectiveMaxWeight = Math.max(maxWeight, 1 / picks.length);
  const weights = new Array(picks.length).fill(0);
  let remainingWeight = 1;
  let remaining = picks.map((pick, index) => ({
    index,
    raw: Math.max(0.001, Math.pow(pick.analysisScore / 100, 1.6) / Math.max(pick.volatility || 0.18, 0.12)),
  }));

  while (remaining.length > 0) {
    const totalRaw = remaining.reduce((sum, item) => sum + item.raw, 0);
    let capped = false;

    for (const item of [...remaining]) {
      const proposedWeight = remainingWeight * (item.raw / totalRaw);
      if (proposedWeight > effectiveMaxWeight) {
        weights[item.index] = effectiveMaxWeight;
        remainingWeight -= effectiveMaxWeight;
        remaining = remaining.filter((entry) => entry.index !== item.index);
        capped = true;
      }
    }

    if (!capped) {
      for (const item of remaining) {
        weights[item.index] = remainingWeight * (item.raw / totalRaw);
      }
      break;
    }

    if (remainingWeight <= 0) break;
  }

  return picks.map((pick, index) => ({
    ...pick,
    weightPct: Number((weights[index] * 100).toFixed(2)),
  }));
}

function computeMarketState(ranking) {
  const deepAssets = ranking.filter((asset) => asset.stage === 'deep');
  const source = deepAssets.length > 0 ? deepAssets : ranking;
  const avgScore = mean(source.map((asset) => asset.analysisScore));
  const buyRatio = ratio(source, (asset) => asset.recommendation === 'BUY');
  const sellRatio = ratio(source, (asset) => asset.recommendation === 'SELL');

  if (buyRatio >= 0.45 && avgScore >= 65) {
    return {
      label: 'Constructivo',
      color: '#10B981',
      message: 'El mercado presenta un tono favorable: hay varias acciones con señal y validación histórica suficientemente sólidas para construir un portfolio ofensivo pero controlado.',
      avgScore,
      buyRatio,
      sellRatio,
    };
  }

  if (sellRatio >= 0.35 || avgScore < 50) {
    return {
      label: 'Defensivo',
      color: '#EF4444',
      message: 'El mercado llega débil al corte actual. Conviene priorizar pocas posiciones, pesos más contenidos y activos que hayan resistido mejor el backtest reciente.',
      avgScore,
      buyRatio,
      sellRatio,
    };
  }

  return {
    label: 'Mixto',
    color: '#E8C547',
    message: 'El tono general es mixto: hay oportunidades, pero conviene filtrar por calidad histórica y evitar concentraciones excesivas.',
    avgScore,
    buyRatio,
    sellRatio,
  };
}

function renderMarketReport(report) {
  const container = $('#marketReportContent');
  if (!container) return;

  const portfolio = report.portfolio;
  const topAssets = report.ranking.slice(0, DEFAULTS.scannerTopRankingCount);
  const avgHistorical = mean(report.ranking.filter((asset) => asset.stage === 'deep').map((asset) => asset.historicalScore));
  const avgPortfolioReturn = mean(portfolio.map((position) => position.expectedReturnPct));
  const avgPortfolioVolatility = mean(portfolio.map((position) => (position.volatility || 0) * 100));

  container.innerHTML = `
    <div class="glass-card backtest-hero" style="--accent:${report.marketState.color}">
      <div>
        <span class="backtest-eyebrow">Informe final hoy</span>
        <h3>Estado del mercado: ${report.marketState.label}</h3>
        <p>${report.marketState.message}</p>
      </div>
      <div class="backtest-badges">
        <span class="backtest-pill">${report.analyzedCount}/${report.selectedCount} activos válidos</span>
        <span class="backtest-pill">${portfolio.length} posiciones propuestas</span>
        <span class="backtest-pill">Score medio ${report.marketState.avgScore.toFixed(1)}</span>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card glass-card">
        <span class="metric-label">Activos analizados</span>
        <span class="metric-value">${report.analyzedCount}</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Finalistas profundos</span>
        <span class="metric-value">${report.deepCount}</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">BUY en finalistas</span>
        <span class="metric-value">${(report.marketState.buyRatio * 100).toFixed(1)}%</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Score histórico medio</span>
        <span class="metric-value">${avgHistorical.toFixed(1)}</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Retorno esperado portfolio</span>
        <span class="metric-value ${avgPortfolioReturn >= 0 ? 'text-green' : 'text-red'}">${avgPortfolioReturn >= 0 ? '+' : ''}${avgPortfolioReturn.toFixed(2)}%</span>
      </div>
      <div class="metric-card glass-card">
        <span class="metric-label">Volatilidad media portfolio</span>
        <span class="metric-value">${avgPortfolioVolatility.toFixed(2)}%</span>
      </div>
    </div>

    <div class="compare-grid portfolio-chart-grid">
      <div class="glass-card chart-card">
        <h3>Mejores oportunidades ahora</h3>
        <div class="chart-container chart-lg"><canvas id="marketRankingChart"></canvas></div>
      </div>
      <div class="glass-card chart-card">
        <h3>Distribución del portfolio ideal</h3>
        <div class="chart-container chart-lg"><canvas id="idealPortfolioChart"></canvas></div>
      </div>
    </div>

    <div class="glass-card">
      <h3>Portfolio ideal a fecha actual</h3>
      <p class="section-note">La propuesta combina el filtro rápido del universo con la simulación actual y la validación histórica del modelo que mejor ha funcionado en cada acción.</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Activo</th>
              <th>Peso</th>
              <th>Score</th>
              <th>Modelo ganador</th>
              <th>Señal actual</th>
              <th>Retorno esperado</th>
              <th>P(Subida)</th>
              <th>Volatilidad</th>
              <th>Racional</th>
            </tr>
          </thead>
          <tbody>
            ${portfolio.map((position) => `
              <tr>
                <td>
                  <button class="portfolio-open-stock link-button" type="button" data-symbol="${position.symbol}">${position.symbol}</button>
                  <div class="table-subcopy">${position.name}</div>
                </td>
                <td>${position.weightPct.toFixed(2)}%</td>
                <td>${position.analysisScore}</td>
                <td>${position.historicalModel}</td>
                <td><span class="signal-mini" style="background:${position.signalColor}">${position.recommendation}</span></td>
                <td class="${position.expectedReturnPct >= 0 ? 'text-green' : 'text-red'}">${position.expectedReturnPct >= 0 ? '+' : ''}${position.expectedReturnPct.toFixed(2)}%</td>
                <td>${((position.probUp || 0) * 100).toFixed(1)}%</td>
                <td>${((position.volatility || 0) * 100).toFixed(2)}%</td>
                <td>${position.rationale.join(' · ')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="glass-card">
      <h3>Ranking global del universo</h3>
      <p class="section-note">Fase rápida para todo el universo y fase profunda para los finalistas. Los activos profundizados llevan score final; el resto conserva score de filtro.</p>
      ${report.failedSymbols.length > 0 ? `<p class="section-note">Omitidas por datos insuficientes o error de descarga: ${report.failedSymbols.slice(0, 20).join(', ')}${report.failedSymbols.length > 20 ? ` +${report.failedSymbols.length - 20} más` : ''}</p>` : ''}
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Activo</th>
              <th>Universo</th>
              <th>Fase</th>
              <th>Score</th>
              <th>Histórico</th>
              <th>Señal</th>
              <th>Retorno</th>
              <th>Volatilidad</th>
              <th>Drawdown</th>
            </tr>
          </thead>
          <tbody>
            ${report.ranking.map((asset) => `
              <tr>
                <td>${asset.rank}</td>
                <td>
                  <button class="portfolio-open-stock link-button" type="button" data-symbol="${asset.symbol}">${asset.symbol}</button>
                  <div class="table-subcopy">${asset.name}</div>
                </td>
                <td>${asset.universeLabel}</td>
                <td>${asset.stage === 'deep' ? 'Profunda' : 'Rápida'}</td>
                <td>${asset.analysisScore}</td>
                <td>${asset.stage === 'deep' ? `${asset.historicalModel} · ${asset.historicalScore.toFixed(0)}` : '—'}</td>
                <td><span class="signal-mini" style="background:${asset.signalColor}">${asset.recommendation}</span></td>
                <td class="${asset.expectedReturnPct >= 0 ? 'text-green' : 'text-red'}">${asset.expectedReturnPct >= 0 ? '+' : ''}${asset.expectedReturnPct.toFixed(2)}%</td>
                <td>${((asset.volatility || 0) * 100).toFixed(2)}%</td>
                <td>${((asset.maxDrawdown || 0) * 100).toFixed(2)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    renderUniverseRankingChart('marketRankingChart', topAssets, DEFAULTS.scannerTopRankingCount);
    renderPortfolioAllocationChart('idealPortfolioChart', portfolio);
  });
}

function inferUniverseLabel(symbol) {
  if (symbol in MARKETS['IBEX 35'].tickers) return 'IBEX 35';
  if (symbol in MARKETS['S&P 500'].tickers) return 'S&P 500';
  if (symbol in COMMODITIES) return 'Materias Primas';
  return 'Selección Manual';
}

function mean(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values) {
  if (!values || values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function ratio(values, predicate) {
  if (!values || values.length === 0) return 0;
  return values.filter(predicate).length / values.length;
}

function movingAverage(prices, windowSize) {
  if (prices.length < windowSize) return mean(prices);
  return mean(prices.slice(-windowSize));
}

function computePriceMaxDrawdown(prices) {
  let peak = prices[0];
  let maxDrawdown = 0;
  for (const price of prices) {
    if (price > peak) peak = price;
    const drawdown = peak > 0 ? (price - peak) / peak : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
}

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}