/* ═══════════════════════════════════════════════════════════════════
   simulation.js — All 5 Monte Carlo engines in JavaScript
   Ported from Python: GBM, Heston, Jump-Diffusion, GARCH(1,1), Bootstrap
   ═══════════════════════════════════════════════════════════════════ */

import { DEFAULTS } from './config.js';
import { mulberry32, createRNG, mean, std, variance, percentile, rollingVariance, correlation, clamp, averageOrZero, computeLogReturnsFromPrices } from './math-utils.js';

function buildCheckpointIndices(priceCount, horizon, minTrainingDays, checkpointStep, maxCheckpoints) {
  const lastCheckpoint = priceCount - horizon - 1;
  if (lastCheckpoint < minTrainingDays) return [];

  const indices = [];
  for (let idx = minTrainingDays; idx <= lastCheckpoint; idx += checkpointStep) {
    indices.push(idx);
  }
  if (indices[indices.length - 1] !== lastCheckpoint) {
    indices.push(lastCheckpoint);
  }

  if (!maxCheckpoints || indices.length <= maxCheckpoints) return indices;
  if (maxCheckpoints === 1) return [lastCheckpoint];

  const sampled = [];
  for (let i = 0; i < maxCheckpoints; i++) {
    const position = Math.round((i * (indices.length - 1)) / (maxCheckpoints - 1));
    sampled.push(indices[position]);
  }

  return [...new Set(sampled)].sort((a, b) => a - b);
}

function classifyDirection(returnPct, neutralBandPct) {
  if (returnPct > neutralBandPct) return 1;
  if (returnPct < -neutralBandPct) return -1;
  return 0;
}

function computeHistoricalScore(summary) {
  const errorScore = clamp(100 - summary.meanAbsErrorPct * 2.5, 0, 100);
  const rmseScore = clamp(100 - summary.rmseReturnPct * 1.8, 0, 100);
  const directionScore = clamp(summary.directionAccuracy * 100, 0, 100);
  const coverageScore = clamp((summary.within95Rate / 0.95) * 100, 0, 100);
  return Math.round(errorScore * 0.4 + rmseScore * 0.15 + directionScore * 0.3 + coverageScore * 0.15);
}

function summarizeBacktest(modelId, modelName, checkpoints, totalTimeMs) {
  const absErrors = checkpoints.map(checkpoint => checkpoint.absErrorPct);
  const returnErrors = checkpoints.map(checkpoint => checkpoint.returnErrorPct);
  const directionHits = checkpoints.map(checkpoint => checkpoint.directionHit ? 1 : 0);
  const within95 = checkpoints.map(checkpoint => checkpoint.within95 ? 1 : 0);
  const within99 = checkpoints.map(checkpoint => checkpoint.within99 ? 1 : 0);
  const biases = checkpoints.map(checkpoint => checkpoint.biasPct);
  const signalScores = checkpoints.map(checkpoint => checkpoint.signalScore);
  const predictedReturns = checkpoints.map(checkpoint => checkpoint.predictedReturnPct);
  const actualReturns = checkpoints.map(checkpoint => checkpoint.actualReturnPct);
  const bullishSignals = checkpoints.filter(checkpoint => checkpoint.signal === 'BUY').length;
  const bearishSignals = checkpoints.filter(checkpoint => checkpoint.signal === 'SELL').length;
  const holdSignals = checkpoints.filter(checkpoint => checkpoint.signal === 'HOLD').length;
  const latestWindow = checkpoints[checkpoints.length - 1] || null;
  const bestWindow = checkpoints.reduce((best, checkpoint) => {
    if (!best || checkpoint.absErrorPct < best.absErrorPct) return checkpoint;
    return best;
  }, null);
  const worstWindow = checkpoints.reduce((worst, checkpoint) => {
    if (!worst || checkpoint.absErrorPct > worst.absErrorPct) return checkpoint;
    return worst;
  }, null);

  const summary = {
    modelId,
    model: modelName,
    nCheckpoints: checkpoints.length,
    meanAbsErrorPct: averageOrZero(absErrors),
    medianAbsErrorPct: absErrors.length > 0 ? percentile(absErrors, 50) : 0,
    rmseReturnPct: returnErrors.length > 0 ? Math.sqrt(averageOrZero(returnErrors.map(error => error * error))) : 0,
    directionAccuracy: averageOrZero(directionHits),
    within95Rate: averageOrZero(within95),
    within99Rate: averageOrZero(within99),
    avgBiasPct: averageOrZero(biases),
    avgSignalScore: averageOrZero(signalScores),
    avgPredictedReturnPct: averageOrZero(predictedReturns),
    avgActualReturnPct: averageOrZero(actualReturns),
    bullishSignals,
    bearishSignals,
    holdSignals,
    totalTimeMs: Math.round(totalTimeMs),
    avgTimeMs: checkpoints.length > 0 ? Math.round(totalTimeMs / checkpoints.length) : 0,
    latestAbsErrorPct: latestWindow?.absErrorPct ?? 0,
    latestDirectionHit: latestWindow?.directionHit ?? false,
    bestWindow,
    worstWindow,
    latestWindow,
    periodStart: checkpoints[0]?.trainEndDate ?? null,
    periodEnd: latestWindow?.actualEndDate ?? null,
  };

  summary.score = computeHistoricalScore(summary);

  return {
    modelId,
    model: modelName,
    checkpoints,
    summary,
  };
}

export function rankBacktestModels(results) {
  if (!results) return [];

  const modelIds = Object.keys(results);
  if (modelIds.length === 0) return [];

  const maxCheckpoints = Math.max(...modelIds.map(id => results[id].checkpoints.length));
  const wins = Object.fromEntries(modelIds.map(id => [id, 0]));

  for (let checkpointIndex = 0; checkpointIndex < maxCheckpoints; checkpointIndex++) {
    let bestId = null;
    let bestError = Infinity;

    for (const id of modelIds) {
      const checkpoint = results[id].checkpoints[checkpointIndex];
      if (!checkpoint) continue;
      if (checkpoint.absErrorPct < bestError) {
        bestError = checkpoint.absErrorPct;
        bestId = id;
      }
    }

    if (bestId) wins[bestId]++;
  }

  return modelIds
    .map(id => {
      const summary = results[id].summary;
      return {
        id,
        ...summary,
        wins: wins[id] || 0,
        winRate: summary.nCheckpoints > 0 ? (wins[id] || 0) / summary.nCheckpoints : 0,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.meanAbsErrorPct !== right.meanAbsErrorPct) return left.meanAbsErrorPct - right.meanAbsErrorPct;
      return right.directionAccuracy - left.directionAccuracy;
    });
}

// ═══════════════════════════════════════════════════════════════════
// 1. GEOMETRIC BROWNIAN MOTION (GBM)
// dS = μ·S·dt + σ·S·dW
// S(t+1) = S(t) · exp[(μ - σ²/2)·Δt + σ·√Δt·Z]
// ═══════════════════════════════════════════════════════════════════
export function simulateGBM(logReturns, s0, horizon, nSim, seed) {
  horizon = horizon || DEFAULTS.horizon;
  nSim = nSim || DEFAULTS.simulations;
  const rng = createRNG(seed);

  const mu = mean(logReturns);
  const sigma = std(logReturns, 1);
  const drift = mu - 0.5 * sigma * sigma;
  const diffCoeff = sigma;

  const paths = new Array(nSim);
  for (let i = 0; i < nSim; i++) {
    paths[i] = new Float64Array(horizon + 1);
    paths[i][0] = s0;
    let logS = Math.log(s0);
    for (let t = 1; t <= horizon; t++) {
      logS += drift + diffCoeff * rng.normal();
      paths[i][t] = Math.exp(logS);
    }
  }

  const finalPrices = new Float64Array(nSim);
  for (let i = 0; i < nSim; i++) finalPrices[i] = paths[i][horizon];

  return {
    model: 'GBM', modelId: 'gbm', paths, finalPrices, s0, horizon, nSim,
    params: { mu: mu * 252, sigma: sigma * Math.sqrt(252) },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 2. HESTON STOCHASTIC VOLATILITY
// dS = μ·S·dt + √v·S·dW₁
// dv = κ(θ - v)·dt + ξ·√v·dW₂     corr(dW₁,dW₂) = ρ
// ═══════════════════════════════════════════════════════════════════
function calibrateHeston(logReturns) {
  const realizedVar = rollingVariance(logReturns, 21);
  const v0 = variance(logReturns.slice(-21), 1);
  const theta = mean(realizedVar);
  const xi = realizedVar.length > 1 ? std(realizedVar.map((v, i, a) => i > 0 ? v - a[i-1] : 0).slice(1), 1) : 0.1;
  let kappa = 2.0;

  // Estimate rho
  let rho = -0.5;
  if (logReturns.length > 42) {
    const retSlice = logReturns.slice(21);
    const volSlice = realizedVar.slice(0, retSlice.length).map(v => Math.sqrt(Math.max(v, 1e-10)));
    rho = correlation(retSlice, volSlice);
    rho = Math.max(-0.99, Math.min(0.99, rho));
  }

  // Simple optimization: grid search for kappa
  let bestErr = Infinity;
  for (let k = 0.5; k <= 15; k += 0.5) {
    let err = 0;
    let vs = v0;
    for (let i = 0; i < realizedVar.length; i++) {
      vs = Math.max(vs + k * (theta - vs), 1e-10);
      err += (vs - realizedVar[i]) ** 2;
    }
    if (err < bestErr) { bestErr = err; kappa = k; }
  }

  return { kappa, theta: Math.max(theta, 1e-8), xi: Math.max(xi, 0.01), rho, v0: Math.max(v0, 1e-8) };
}

export function simulateHeston(logReturns, s0, horizon, nSim, seed) {
  horizon = horizon || DEFAULTS.horizon;
  nSim = nSim || DEFAULTS.simulations;
  const rng = createRNG(seed);

  const mu = mean(logReturns);
  const { kappa, theta, xi, rho, v0 } = calibrateHeston(logReturns);
  const sqrtOneMinusRho2 = Math.sqrt(1 - rho * rho);

  const paths = new Array(nSim);
  for (let i = 0; i < nSim; i++) {
    paths[i] = new Float64Array(horizon + 1);
    paths[i][0] = s0;
    let S = s0, V = v0;

    for (let t = 1; t <= horizon; t++) {
      const z1 = rng.normal();
      const z2 = rho * z1 + sqrtOneMinusRho2 * rng.normal();
      const vPos = Math.max(V, 0);
      const sqrtV = Math.sqrt(vPos);

      S = S * Math.exp((mu - 0.5 * vPos) + sqrtV * z1);
      V = V + kappa * (theta - vPos) + xi * sqrtV * z2;
      paths[i][t] = S;
    }
  }

  const finalPrices = new Float64Array(nSim);
  for (let i = 0; i < nSim; i++) finalPrices[i] = paths[i][horizon];

  return {
    model: 'Heston', modelId: 'heston', paths, finalPrices, s0, horizon, nSim,
    params: { mu: mu * 252, kappa, theta, xi, rho, v0 },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 3. MERTON JUMP-DIFFUSION
// dS = μ·S·dt + σ·S·dW + J·S·dN
// N ~ Poisson(λ), J ~ LogNormal(m, δ)
// ═══════════════════════════════════════════════════════════════════
function estimateJumpParams(logReturns, threshold = 2.5) {
  const mu = mean(logReturns);
  const sigma = std(logReturns, 1);

  const jumpMask = logReturns.map(r => Math.abs((r - mu) / sigma) > threshold);
  const nJumps = jumpMask.filter(Boolean).length;
  const lam = nJumps / logReturns.length;

  let jumpMean = 0, jumpStd = sigma * 0.5;
  if (nJumps > 0) {
    const jumpSizes = logReturns.filter((_, i) => jumpMask[i]).map(r => r - mu);
    jumpMean = mean(jumpSizes);
    jumpStd = nJumps > 1 ? std(jumpSizes, 1) : sigma;
  }

  const continuous = logReturns.filter((_, i) => !jumpMask[i]);
  const muC = continuous.length > 0 ? mean(continuous) : mu;
  const sigmaC = continuous.length > 1 ? std(continuous, 1) : sigma;

  return { muC, sigmaC, lam: Math.max(lam, 0.001), jumpMean, jumpStd };
}

export function simulateJumpDiffusion(logReturns, s0, horizon, nSim, seed) {
  horizon = horizon || DEFAULTS.horizon;
  nSim = nSim || DEFAULTS.simulations;
  const rng = createRNG(seed);

  const { muC, sigmaC, lam, jumpMean, jumpStd } = estimateJumpParams(logReturns);
  const k = Math.exp(jumpMean + 0.5 * jumpStd * jumpStd) - 1;

  const paths = new Array(nSim);
  for (let i = 0; i < nSim; i++) {
    paths[i] = new Float64Array(horizon + 1);
    paths[i][0] = s0;
    let S = s0;

    for (let t = 1; t <= horizon; t++) {
      const z = rng.normal();
      const nj = rng.poisson(lam);
      let J = 0;
      for (let j = 0; j < nj; j++) {
        J += jumpMean + jumpStd * rng.normal();
      }
      const driftComp = (muC - lam * k - 0.5 * sigmaC * sigmaC);
      S = S * Math.exp(driftComp + sigmaC * z + J);
      paths[i][t] = S;
    }
  }

  const finalPrices = new Float64Array(nSim);
  for (let i = 0; i < nSim; i++) finalPrices[i] = paths[i][horizon];

  return {
    model: 'Jump Diffusion', modelId: 'jump', paths, finalPrices, s0, horizon, nSim,
    params: { mu: muC * 252, sigma: sigmaC * Math.sqrt(252), lambda: lam, jumpMean, jumpStd },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 4. GARCH(1,1) MONTE CARLO
// σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}
// ═══════════════════════════════════════════════════════════════════
function fitGarch(logReturns) {
  const retPct = logReturns.map(r => r * 100);
  const muPct = mean(retPct);
  const demeaned = retPct.map(r => r - muPct);
  const uncondVar = variance(demeaned, 1);

  // Grid search for optimal alpha, beta
  let bestAlpha = 0.08, bestBeta = 0.88, bestLL = -Infinity;

  for (let a = 0.02; a <= 0.20; a += 0.02) {
    for (let b = 0.70; b <= 0.96; b += 0.02) {
      if (a + b >= 0.999) continue;
      const omega = uncondVar * (1 - a - b);
      if (omega <= 0) continue;

      let ll = 0, sigma2 = uncondVar;
      for (let i = 1; i < demeaned.length; i++) {
        sigma2 = omega + a * demeaned[i - 1] ** 2 + b * sigma2;
        sigma2 = Math.max(sigma2, 1e-8);
        ll -= 0.5 * (Math.log(sigma2) + demeaned[i] ** 2 / sigma2);
      }
      if (ll > bestLL) {
        bestLL = ll; bestAlpha = a; bestBeta = b;
      }
    }
  }

  const omega = uncondVar * (1 - bestAlpha - bestBeta);

  // Compute last conditional variance and residual
  let sigma2 = uncondVar;
  for (let i = 1; i < demeaned.length; i++) {
    sigma2 = omega + bestAlpha * demeaned[i - 1] ** 2 + bestBeta * sigma2;
    sigma2 = Math.max(sigma2, 1e-8);
  }

  return {
    omega: Math.max(omega, 1e-8),
    alpha: bestAlpha,
    beta: bestBeta,
    muPct,
    lastVariancePct2: sigma2,
    lastResidPct: demeaned[demeaned.length - 1],
  };
}

export function simulateGarch(logReturns, s0, horizon, nSim, seed) {
  horizon = horizon || DEFAULTS.horizon;
  nSim = nSim || DEFAULTS.simulations;
  const rng = createRNG(seed);

  const { omega, alpha, beta, muPct, lastVariancePct2, lastResidPct } = fitGarch(logReturns);

  const paths = new Array(nSim);
  for (let i = 0; i < nSim; i++) {
    paths[i] = new Float64Array(horizon + 1);
    paths[i][0] = s0;
    let S = s0;
    let sig2 = lastVariancePct2;
    let epsPrev = lastResidPct;

    for (let t = 1; t <= horizon; t++) {
      sig2 = omega + alpha * epsPrev ** 2 + beta * sig2;
      sig2 = Math.max(sig2, 1e-8);
      const z = rng.normal();
      const eps = Math.sqrt(sig2) * z;
      const ret = (muPct + eps) / 100.0;
      S = S * Math.exp(ret);
      paths[i][t] = S;
      epsPrev = eps;
    }
  }

  const finalPrices = new Float64Array(nSim);
  for (let i = 0; i < nSim; i++) finalPrices[i] = paths[i][horizon];

  return {
    model: 'GARCH(1,1)', modelId: 'garch', paths, finalPrices, s0, horizon, nSim,
    params: { omega, alpha, beta, muPct },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 5. HISTORICAL BOOTSTRAP
// Resamples observed log-returns with replacement
// ═══════════════════════════════════════════════════════════════════
export function simulateBootstrap(logReturns, s0, horizon, nSim, seed) {
  horizon = horizon || DEFAULTS.horizon;
  nSim = nSim || DEFAULTS.simulations;
  const rng = createRNG(seed);

  const paths = new Array(nSim);
  for (let i = 0; i < nSim; i++) {
    paths[i] = new Float64Array(horizon + 1);
    paths[i][0] = s0;
    let logS = Math.log(s0);

    for (let t = 1; t <= horizon; t++) {
      logS += logReturns[rng.randInt(logReturns.length)];
      paths[i][t] = Math.exp(logS);
    }
  }

  const finalPrices = new Float64Array(nSim);
  for (let i = 0; i < nSim; i++) finalPrices[i] = paths[i][horizon];

  return {
    model: 'Bootstrap', modelId: 'bootstrap', paths, finalPrices, s0, horizon, nSim,
    params: { nReturns: logReturns.length },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Run all selected models
// ═══════════════════════════════════════════════════════════════════
const SIMULATORS = {
  gbm: simulateGBM,
  heston: simulateHeston,
  jump: simulateJumpDiffusion,
  garch: simulateGarch,
  bootstrap: simulateBootstrap,
};

export async function runAllSimulations(logReturns, s0, horizon, nSim, modelIds, seed, onProgress) {
  const results = {};
  let done = 0;
  const total = modelIds.length;

  for (const id of modelIds) {
    const sim = SIMULATORS[id];
    if (!sim) continue;
    if (onProgress) onProgress(id, done, total);

    // Yield to UI thread
    await new Promise(r => setTimeout(r, 10));

    const t0 = performance.now();
    results[id] = sim(logReturns, s0, horizon, nSim, seed);
    results[id].timeMs = Math.round(performance.now() - t0);
    done++;
    if (onProgress) onProgress(id, done, total);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// Risk Metrics
// ═══════════════════════════════════════════════════════════════════
export function computeRiskMetrics(result, logReturns) {
  const { finalPrices, s0, paths } = result;
  const fp = Array.from(finalPrices);

  // Price distribution
  const returns = fp.map(p => p / s0 - 1);
  const metrics = {
    model: result.model,
    s0,
    nSim: result.nSim,
    expectedPrice: mean(fp),
    medianPrice: percentile(fp, 50),
    stdPrice: std(fp, 0),
    ci95Lower: percentile(fp, 2.5),
    ci95Upper: percentile(fp, 97.5),
    ci99Lower: percentile(fp, 0.5),
    ci99Upper: percentile(fp, 99.5),
    probUp: fp.filter(p => p > s0).length / fp.length,
    probLoss10: fp.filter(p => p < s0 * 0.9).length / fp.length,
    probLoss20: fp.filter(p => p < s0 * 0.8).length / fp.length,
    probLoss30: fp.filter(p => p < s0 * 0.7).length / fp.length,
    expectedReturnPct: (mean(fp) / s0 - 1) * 100,
  };

  // VaR and CVaR
  for (const cl of DEFAULTS.confidenceLevels) {
    const alpha = (1 - cl) * 100;
    const varVal = -percentile(returns, alpha);
    const cutoff = percentile(returns, alpha);
    const tail = returns.filter(r => r <= cutoff);
    const cvarVal = tail.length > 0 ? -mean(tail) : 0;
    const label = Math.round(cl * 100);
    metrics[`VaR_${label}`] = varVal;
    metrics[`CVaR_${label}`] = cvarVal;
  }

  // Max Drawdown (sampled paths)
  const sampleSize = Math.min(paths.length, 500);
  const mdds = [];
  for (let i = 0; i < sampleSize; i++) {
    let peak = paths[i][0];
    let maxDD = 0;
    for (let t = 1; t <= result.horizon; t++) {
      if (paths[i][t] > peak) peak = paths[i][t];
      const dd = (paths[i][t] - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }
    mdds.push(maxDD);
  }
  metrics.mddMean = mean(mdds);
  metrics.mddWorst = Math.min(...mdds);
  metrics.mddBest = Math.max(...mdds);

  // Sharpe & Sortino from historical data
  if (logReturns && logReturns.length > 0) {
    const muA = mean(logReturns) * 252;
    const sigmaA = std(logReturns, 1) * Math.sqrt(252);
    const rf = DEFAULTS.riskFreeRate;
    metrics.sharpe = sigmaA > 0 ? (muA - rf) / sigmaA : 0;

    const rfDaily = rf / 252;
    const excess = logReturns.map(r => r - rfDaily);
    const downside = excess.filter(r => r < 0);
    const downsideStd = downside.length > 1 ? std(downside, 1) * Math.sqrt(252) : 1;
    metrics.sortino = (muA - rf) / downsideStd;

    // Historical volatility
    const windows = [30, 60, 252];
    for (const w of windows) {
      if (logReturns.length >= w) {
        const slice = logReturns.slice(-w);
        metrics[`vol_${w}d`] = std(slice, 1) * Math.sqrt(252);
      }
    }
  }

  return metrics;
}

// ═══════════════════════════════════════════════════════════════════
// Investment Signal
// ═══════════════════════════════════════════════════════════════════
export function generateSignal(metrics) {
  const probUp = metrics.probUp;
  const expectedReturn = metrics.expectedReturnPct / 100;
  const sharpe = metrics.sharpe || 0;
  const var95 = metrics.VaR_95 || 0;

  let signal, color;
  if (probUp > DEFAULTS.buyThresholdProb && expectedReturn > DEFAULTS.minExpectedReturn && sharpe > DEFAULTS.minSharpeBuy) {
    signal = 'BUY'; color = '#E8C547';
  } else if (probUp < DEFAULTS.sellThresholdProb || (var95 > 0.15 && expectedReturn < 0)) {
    signal = 'SELL'; color = '#EF4444';
  } else {
    signal = 'HOLD'; color = '#9A7B2C';
  }

  const nSim = metrics.nSim || 0;
  const confidence = nSim >= 5000 ? 'HIGH' : nSim >= 2000 ? 'MEDIUM' : 'LOW';
  const score = Math.min(100, Math.max(0, Math.round(probUp * 40 + sharpe * 20 + expectedReturn * 200)));

  return { signal, color, confidence, score, probUp, expectedReturn, var95, sharpe };
}

// ═══════════════════════════════════════════════════════════════════
// Path percentiles (for fan charts)
// ═══════════════════════════════════════════════════════════════════
export function computePathPercentiles(paths, horizon, percentiles = [5, 25, 50, 75, 95]) {
  const result = {};
  for (const p of percentiles) result[p] = new Float64Array(horizon + 1);

  for (let t = 0; t <= horizon; t++) {
    const col = new Float64Array(paths.length);
    for (let i = 0; i < paths.length; i++) col[i] = paths[i][t];
    col.sort();
    for (const p of percentiles) {
      const idx = (p / 100) * (col.length - 1);
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      result[p][t] = lo === hi ? col[lo] : col[lo] + (col[hi] - col[lo]) * (idx - lo);
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Historical Backtesting — rolling one-year validation
// ═══════════════════════════════════════════════════════════════════
export async function runHistoricalBacktest(prices, dates, modelIds, options = {}, onProgress) {
  const horizon = options.horizon || DEFAULTS.backtestHorizon;
  const nSim = options.nSim || DEFAULTS.backtestSimulations;
  const minTrainingDays = options.minTrainingDays || DEFAULTS.backtestMinTrainingDays;
  const checkpointStep = options.checkpointStep || DEFAULTS.backtestCheckpointStep;
  const maxCheckpoints = options.maxCheckpoints || DEFAULTS.backtestMaxCheckpoints;
  const neutralBandPct = options.neutralBandPct ?? DEFAULTS.backtestNeutralBandPct;
  const seed = options.seed ?? 42;

  if (!Array.isArray(prices) || prices.length === 0) {
    throw new Error('No hay precios suficientes para validar el histórico.');
  }

  const checkpointIndices = buildCheckpointIndices(prices.length, horizon, minTrainingDays, checkpointStep, maxCheckpoints);
  if (checkpointIndices.length === 0) {
    throw new Error(`Se necesitan al menos ${minTrainingDays + horizon + 1} cierres ajustados para validar 1 año hacia delante.`);
  }

  const total = checkpointIndices.length * modelIds.length;
  let done = 0;
  const results = {};

  for (let modelIndex = 0; modelIndex < modelIds.length; modelIndex++) {
    const modelId = modelIds[modelIndex];
    const simulator = SIMULATORS[modelId];
    if (!simulator) continue;

    const checkpoints = [];
    let modelName = modelId;
    let totalTimeMs = 0;

    for (let checkpointOffset = 0; checkpointOffset < checkpointIndices.length; checkpointOffset++) {
      const checkpointIndex = checkpointIndices[checkpointOffset];
      const historyPrices = prices.slice(0, checkpointIndex + 1);
      const logReturns = computeLogReturnsFromPrices(historyPrices);
      const s0 = historyPrices[historyPrices.length - 1];
      const actualFinalPrice = prices[checkpointIndex + horizon];

      await new Promise(resolve => setTimeout(resolve, 0));

      const t0 = performance.now();
      const simulation = simulator(logReturns, s0, horizon, nSim, seed + modelIndex * 1000 + checkpointOffset);
      modelName = simulation.model || modelName;
      const metrics = computeRiskMetrics(simulation, logReturns);
      const elapsedMs = performance.now() - t0;
      totalTimeMs += elapsedMs;

      const actualReturnPct = (actualFinalPrice / s0 - 1) * 100;
      const absErrorPct = Math.abs(metrics.expectedPrice - actualFinalPrice) / actualFinalPrice * 100;
      const medianAbsErrorPct = Math.abs(metrics.medianPrice - actualFinalPrice) / actualFinalPrice * 100;
      const biasPct = (metrics.expectedPrice - actualFinalPrice) / actualFinalPrice * 100;
      const predictedDirection = classifyDirection(metrics.expectedReturnPct, neutralBandPct);
      const actualDirection = classifyDirection(actualReturnPct, neutralBandPct);
      const signal = generateSignal(metrics);

      checkpoints.push({
        checkpointNumber: checkpointOffset + 1,
        checkpointIndex,
        historyLength: historyPrices.length,
        horizon,
        trainEndDate: dates?.[checkpointIndex] || null,
        actualEndDate: dates?.[checkpointIndex + horizon] || null,
        s0,
        actualPrice: actualFinalPrice,
        predictedPrice: metrics.expectedPrice,
        predictedMedianPrice: metrics.medianPrice,
        predictedReturnPct: metrics.expectedReturnPct,
        actualReturnPct,
        returnErrorPct: metrics.expectedReturnPct - actualReturnPct,
        absErrorPct,
        medianAbsErrorPct,
        biasPct,
        directionHit: predictedDirection === actualDirection,
        within95: actualFinalPrice >= metrics.ci95Lower && actualFinalPrice <= metrics.ci95Upper,
        within99: actualFinalPrice >= metrics.ci99Lower && actualFinalPrice <= metrics.ci99Upper,
        probUp: metrics.probUp,
        signal: signal.signal,
        signalColor: signal.color,
        signalScore: signal.score,
        ci95Lower: metrics.ci95Lower,
        ci95Upper: metrics.ci95Upper,
        ci99Lower: metrics.ci99Lower,
        ci99Upper: metrics.ci99Upper,
        timeMs: Math.round(elapsedMs),
      });

      done++;
      if (onProgress) {
        onProgress({
          modelId,
          modelIndex: modelIndex + 1,
          modelCount: modelIds.length,
          checkpointIndex: checkpointOffset + 1,
          checkpointCount: checkpointIndices.length,
          done,
          total,
        });
      }
    }

    results[modelId] = summarizeBacktest(modelId, modelName, checkpoints, totalTimeMs);
  }

  return {
    settings: {
      horizon,
      nSim,
      minTrainingDays,
      checkpointStep,
      maxCheckpoints,
      neutralBandPct,
    },
    totalCheckpoints: checkpointIndices.length,
    results,
  };
}
