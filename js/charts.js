/* ═══════════════════════════════════════════════════════════════════
   charts.js — Chart rendering with Chart.js (LiquidGlass theme)
   ═══════════════════════════════════════════════════════════════════ */

import { MODELS } from './config.js';
import { computePathPercentiles } from './simulation.js';

const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

// Global Chart.js defaults for LiquidGlass look
function applyTheme() {
  if (!window.Chart) return;
  Chart.defaults.color = 'rgba(212,183,115,0.7)';
  Chart.defaults.borderColor = 'rgba(212,168,67,0.08)';
  Chart.defaults.font.family = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(10,9,6,0.92)';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(212,168,67,0.20)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.cornerRadius = 12;
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 13 };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hoverRadius = 5;
  Chart.defaults.elements.line.tension = 0.1;
}
applyTheme();

// ── Utility: downsample for performance ──────────────────────────
function downsample(arr, maxPoints = 300) {
  if (arr.length <= maxPoints) return arr;
  const step = Math.ceil(arr.length / maxPoints);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

function downsamplePair(dates, values, maxPoints = 300) {
  if (dates.length <= maxPoints) return { dates, values };
  const step = Math.ceil(dates.length / maxPoints);
  const d = [], v = [];
  for (let i = 0; i < dates.length; i++) {
    if (i % step === 0 || i === dates.length - 1) {
      d.push(dates[i]); v.push(values[i]);
    }
  }
  return { dates: d, values: v };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Historical Price Chart
// ═══════════════════════════════════════════════════════════════════
export function renderHistoricalChart(canvasId, dates, prices, currency) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const { dates: d, values: v } = downsamplePair(dates, prices);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  const isUp = prices[prices.length - 1] >= prices[0];
  const mainColor = isUp ? 'rgba(16,185,129,' : 'rgba(239,68,68,';
  gradient.addColorStop(0, mainColor + '0.3)');
  gradient.addColorStop(1, mainColor + '0.0)');

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: d.map(dt => dt.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })),
      datasets: [{
        label: 'Precio',
        data: v,
        borderColor: mainColor + '1)',
        backgroundColor: gradient,
        fill: true,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => `${currency}${item.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          display: true,
          ticks: { maxTicksLimit: 8, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          display: true,
          ticks: {
            callback: (v) => `${currency}${v.toFixed(v >= 100 ? 0 : 2)}`,
          },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// 2. Monte Carlo Fan Chart (percentile bands)
// ═══════════════════════════════════════════════════════════════════
export function renderFanChart(canvasId, simResult, currency) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const pct = computePathPercentiles(simResult.paths, simResult.horizon);
  const model = MODELS[simResult.modelId] || { color: '#D4A843', colorRgb: '212,168,67' };

  // Downsample time axis
  const step = Math.max(1, Math.floor(simResult.horizon / 200));
  const labels = [];
  const p5 = [], p25 = [], p50 = [], p75 = [], p95 = [];
  for (let t = 0; t <= simResult.horizon; t += step) {
    labels.push(`D${t}`);
    p5.push(pct[5][t]); p25.push(pct[25][t]);
    p50.push(pct[50][t]); p75.push(pct[75][t]);
    p95.push(pct[95][t]);
  }

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'P95',
          data: p95,
          borderColor: `rgba(${model.colorRgb},0.2)`,
          backgroundColor: `rgba(${model.colorRgb},0.05)`,
          fill: '+1',
          borderWidth: 1,
          pointRadius: 0,
        },
        {
          label: 'P75',
          data: p75,
          borderColor: `rgba(${model.colorRgb},0.3)`,
          backgroundColor: `rgba(${model.colorRgb},0.1)`,
          fill: '+1',
          borderWidth: 1,
          pointRadius: 0,
        },
        {
          label: 'Mediana (P50)',
          data: p50,
          borderColor: model.color,
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 0,
        },
        {
          label: 'P25',
          data: p25,
          borderColor: `rgba(${model.colorRgb},0.3)`,
          backgroundColor: `rgba(${model.colorRgb},0.1)`,
          fill: '-1',
          borderWidth: 1,
          pointRadius: 0,
        },
        {
          label: 'P5',
          data: p5,
          borderColor: `rgba(${model.colorRgb},0.2)`,
          backgroundColor: `rgba(${model.colorRgb},0.05)`,
          fill: '-1',
          borderWidth: 1,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: { filter: (item) => item.text.includes('Mediana') || item.text.includes('P95') || item.text.includes('P5') },
        },
        tooltip: {
          callbacks: { label: (item) => `${item.dataset.label}: ${currency}${item.parsed.y.toFixed(2)}` },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 8, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          ticks: { callback: (v) => `${currency}${v >= 1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(v >= 100 ? 0 : 2)}` },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// 3. Final Price Distribution Histogram
// ═══════════════════════════════════════════════════════════════════
export function renderDistribution(canvasId, finalPrices, s0, modelId, currency) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const model = MODELS[modelId] || { color: '#D4A843', colorRgb: '212,168,67' };
  const sorted = Array.from(finalPrices).sort((a, b) => a - b);
  const nBins = 50;
  const min = sorted[Math.floor(sorted.length * 0.01)];
  const max = sorted[Math.floor(sorted.length * 0.99)];
  const binWidth = (max - min) / nBins;

  const bins = new Array(nBins).fill(0);
  const labels = [];
  for (let i = 0; i < nBins; i++) {
    const lo = min + i * binWidth;
    labels.push(`${currency}${lo.toFixed(lo >= 100 ? 0 : 2)}`);
  }

  for (const p of sorted) {
    if (p < min || p > max) continue;
    const idx = Math.min(nBins - 1, Math.floor((p - min) / binWidth));
    bins[idx]++;
  }

  const colors = bins.map((_, i) => {
    const lo = min + i * binWidth;
    return lo >= s0 ? `rgba(16,185,129,0.7)` : `rgba(239,68,68,0.6)`;
  });

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Frecuencia',
        data: bins,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace(/[\d.]+\)$/, '1)')),
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (items) => items[0].label } },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 6, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          ticks: { display: false },
          grid: { display: false },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// 4. Algorithm Comparison — Median Paths Overlay
// ═══════════════════════════════════════════════════════════════════
export function renderComparisonChart(canvasId, allResults, currency) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const datasets = [];
  let maxHorizon = 0;

  for (const [id, result] of Object.entries(allResults)) {
    const model = MODELS[id] || { color: '#888', name: id };
    const pct = computePathPercentiles(result.paths, result.horizon, [50]);
    maxHorizon = Math.max(maxHorizon, result.horizon);

    const step = Math.max(1, Math.floor(result.horizon / 200));
    const data = [];
    for (let t = 0; t <= result.horizon; t += step) {
      data.push(pct[50][t]);
    }

    datasets.push({
      label: model.name,
      data,
      borderColor: model.color,
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      pointRadius: 0,
    });
  }

  const step = Math.max(1, Math.floor(maxHorizon / 200));
  const labels = [];
  for (let t = 0; t <= maxHorizon; t += step) labels.push(`D${t}`);

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: { label: (item) => `${item.dataset.label}: ${currency}${item.parsed.y.toFixed(2)}` },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
        y: { ticks: { callback: (v) => `${currency}${v >= 1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(v >= 100 ? 0 : 2)}` } },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// 5. VaR Comparison Bar Chart
// ═══════════════════════════════════════════════════════════════════
export function renderVarComparison(canvasId, allMetrics) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const modelIds = Object.keys(allMetrics);
  const labels = modelIds.map(id => (MODELS[id] || { name: id }).name);
  const colors = modelIds.map(id => (MODELS[id] || { color: '#888' }).color);

  const var95 = modelIds.map(id => (allMetrics[id].VaR_95 || 0) * 100);
  const cvar95 = modelIds.map(id => (allMetrics[id].CVaR_95 || 0) * 100);

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'VaR 95%',
          data: var95,
          backgroundColor: colors.map(c => c + 'CC'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 6,
        },
        {
          label: 'CVaR 95%',
          data: cvar95,
          backgroundColor: colors.map(c => c + '77'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(2)}%` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => v.toFixed(1) + '%' } },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// 6. Probability Comparison (grouped bar)
// ═══════════════════════════════════════════════════════════════════
export function renderProbComparison(canvasId, allMetrics) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const modelIds = Object.keys(allMetrics);
  const labels = modelIds.map(id => (MODELS[id] || { name: id }).name);
  const colors = modelIds.map(id => (MODELS[id] || { color: '#888' }).color);

  const probUp = modelIds.map(id => (allMetrics[id].probUp || 0) * 100);
  const expRet = modelIds.map(id => allMetrics[id].expectedReturnPct || 0);

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'P(Subida) %',
          data: probUp,
          backgroundColor: '#E8C547AA',
          borderColor: '#E8C547',
          borderWidth: 1,
          borderRadius: 6,
        },
        {
          label: 'Retorno esperado %',
          data: expRet,
          backgroundColor: '#D4A843AA',
          borderColor: '#D4A843',
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => v.toFixed(1) + '%' } },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// 7. Simulation Time Comparison (small)
// ═══════════════════════════════════════════════════════════════════
export function renderTimingChart(canvasId, allResults) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const modelIds = Object.keys(allResults);
  const labels = modelIds.map(id => (MODELS[id] || { name: id }).name);
  const colors = modelIds.map(id => (MODELS[id] || { color: '#888' }).color);
  const times = modelIds.map(id => allResults[id].timeMs || 0);

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tiempo (ms)',
        data: times,
        backgroundColor: colors.map(c => c + 'AA'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: v => v + 'ms' } },
        y: { grid: { display: false } },
      },
    },
  });
}

function formatBacktestLabel(value, fallback) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
}

export function renderBacktestRankingChart(canvasId, backtestResults, wins = {}) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const ranking = Object.entries(backtestResults)
    .sort(([, left], [, right]) => (right.summary.score || 0) - (left.summary.score || 0));

  const labels = ranking.map(([id]) => (MODELS[id] || { name: id }).name);
  const scores = ranking.map(([, result]) => result.summary.score || 0);
  const colors = ranking.map(([id]) => (MODELS[id] || { color: '#888' }).color);

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Score histórico',
        data: scores,
        backgroundColor: colors.map(color => color + 'BB'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (item) => {
              const [modelId, result] = ranking[item.dataIndex];
              const winCount = wins[modelId] || 0;
              return [
                `Error medio: ${result.summary.meanAbsErrorPct.toFixed(2)}%`,
                `Acierto dirección: ${(result.summary.directionAccuracy * 100).toFixed(1)}%`,
                `Mejor checkpoints: ${winCount}/${result.summary.nCheckpoints}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          ticks: { callback: value => `${value}` },
        },
        y: { grid: { display: false } },
      },
    },
  });
}

export function renderBacktestErrorTrendChart(canvasId, backtestResults) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const modelIds = Object.keys(backtestResults);
  if (modelIds.length === 0) return;

  const referenceCheckpoints = backtestResults[modelIds[0]].checkpoints || [];
  const labels = referenceCheckpoints.map((checkpoint, index) =>
    formatBacktestLabel(checkpoint.actualEndDate, `C${index + 1}`)
  );

  const datasets = modelIds.map(id => {
    const model = MODELS[id] || { name: id, color: '#888', colorRgb: '136,136,136' };
    const checkpoints = backtestResults[id].checkpoints || [];

    return {
      label: model.name,
      data: checkpoints.map(checkpoint => Number(checkpoint.absErrorPct.toFixed(2))),
      borderColor: model.color,
      backgroundColor: `rgba(${model.colorRgb},0.12)`,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      fill: false,
    };
  });

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(2)}% error`,
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
        y: { ticks: { callback: value => `${value.toFixed(1)}%` } },
      },
    },
  });
}

export function renderUniverseRankingChart(canvasId, rankedAssets, limit = 15) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || !Array.isArray(rankedAssets) || rankedAssets.length === 0) return;
  const ctx = canvas.getContext('2d');

  const topAssets = rankedAssets.slice(0, limit);
  const labels = topAssets.map(asset => asset.symbol);
  const scores = topAssets.map(asset => asset.analysisScore || asset.quickScore || 0);
  const colors = topAssets.map(asset => asset.signalColor || (asset.recommendation === 'SELL' ? '#EF4444' : asset.recommendation === 'BUY' ? '#E8C547' : '#9A7B2C'));

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Score final',
        data: scores,
        backgroundColor: colors.map(color => color + 'BB'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `${items[0].label} · ${topAssets[items[0].dataIndex].name}`,
            afterLabel: (item) => {
              const asset = topAssets[item.dataIndex];
              return [
                `Recomendación: ${asset.recommendation || 'RANK'}`,
                `Retorno esperado: ${(asset.expectedReturnPct || 0).toFixed(2)}%`,
                `Backtest histórico: ${(asset.historicalScore || 0).toFixed(0)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: { min: 0, max: 100 },
        y: { grid: { display: false } },
      },
    },
  });
}

export function renderPortfolioAllocationChart(canvasId, portfolio) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || !Array.isArray(portfolio) || portfolio.length === 0) return;
  const ctx = canvas.getContext('2d');

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: portfolio.map(position => `${position.symbol} · ${position.weightPct.toFixed(1)}%`),
      datasets: [{
        data: portfolio.map(position => Number(position.weightPct.toFixed(2))),
        backgroundColor: portfolio.map(position => position.signalColor || '#D4A843'),
        borderColor: '#0A0906',
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 14 },
        },
        tooltip: {
          callbacks: {
            title: (items) => portfolio[items[0].dataIndex].name,
            label: (item) => `${portfolio[item.dataIndex].symbol}: ${item.parsed.toFixed(2)}%`,
            afterLabel: (item) => {
              const position = portfolio[item.dataIndex];
              return [
                `Score: ${position.analysisScore}`,
                `Retorno esperado: ${position.expectedReturnPct.toFixed(2)}%`,
              ];
            },
          },
        },
      },
    },
  });
}

export function destroyAllCharts() {
  for (const id of Object.keys(chartInstances)) {
    destroyChart(id);
  }
}
