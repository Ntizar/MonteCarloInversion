/* ═══════════════════════════════════════════════════════════════════
   simulation-worker.js — Web Worker: todas las simulaciones Monte Carlo
   fuera del hilo principal para no bloquear la UI.
   Monte Carlo Stock Simulator v3.0
   ═══════════════════════════════════════════════════════════════════

   Protocolo de mensajes (postMessage):
   ───────────────────────────────────────
   Entrada (main → worker):
     { type: 'RUN_SIMULATIONS', payload: { logReturns, s0, horizon, nSim, modelIds, seed } }
     { type: 'RUN_BACKTEST',    payload: { prices, dates, modelIds, options } }

   Salida (worker → main):
     { type: 'PROGRESS',    payload: { pct, message } }
     { type: 'RESULT',      payload: { results, metrics, backtest } }
     { type: 'ERROR',       payload: { message } }
   ═══════════════════════════════════════════════════════════════════ */

import { mulberry32, createRNG, mean, std, variance, percentile, rollingVariance, correlation, clamp, averageOrZero, computeLogReturnsFromPrices } from './math-utils.js';

// ── GBM ─────────────────────────────────────────────────────────
function simulateGBM(logReturns, s0, horizon, nSim, seed) {
  const rng = createRNG(seed);
  const mu = mean(logReturns);
  const sigma = std(logReturns, 1);
  const drift = mu - 0.5 * sigma * sigma;

  const paths = new Array(nSim);
  for (let i = 0; i < nSim; i++) {
    paths[i] = new Float64Array(horizon + 1);
    paths[i][0] = s0;
    let logS = Math.log(s0);
    for (let t = 1; t <= horizon; t++) { logS += drift + sigma * rng.normal(); paths[i][t] = Math.exp(logS); }
  }
  const finalPrices = new Float64Array(nSim);
  for (let i = 0; i < nSim; i++) finalPrices[i] = paths[i][horizon];
  return { model: 'GBM', modelId: 'gbm', paths, finalPrices, s0, horizon, nSim, params: { mu: mu * 252, sigma: sigma * Math.sqrt(252) } };
}

// ── Heston ───────────────────────────────────────────────────────
function calibrateHeston(logReturns) {
  const realizedVar = rollingVariance(logReturns, 21);
  const v0 = variance(logReturns.slice(-21), 1);
  const theta = mean(realizedVar);
  const xi = realizedVar.length > 1 ? std(realizedVar.map((v, i, a) => i > 0 ? v - a[i - 1] : 0).slice(1), 1) : 0.1;
  let kappa = 2.0;
  let rho = -0.5;
  if (logReturns.length > 42) {
    const retSlice = logReturns.slice(21);
    const volSlice = realizedVar.slice(0, retSlice.length).map(v => Math.sqrt(Math.max(v, 1e-10)));
    rho = clamp(correlation(retSlice, volSlice), -0.99, 0.99);
  }
  let bestErr = Infinity;
  for (let k = 0.5; k <= 15; k += 0.5) {
    let err = 0, vs = v0;
    for (let i = 0; i < realizedVar.length; i++) { vs = Math.max(vs + k * (theta - vs), 1e-10); err += (vs - realizedVar[i]) ** 2; }
    if (err < bestErr) { bestErr = err; kappa = k; }
  }
  return { kappa, theta: Math.max(theta, 1e-8), xi: Math.max(xi, 0.01), rho, v0: Math.max(v0, 1e-8) };
}

function simulateHeston(logReturns, s0, horizon, nSim, seed) {
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
      const z1 = rng.normal(), z2 = rho * z1 + sqrtOneMinusRho2 * rng.normal();
      const vPos = Math.max(V, 0), sqrtV = Math.sqrt(vPos);
      S = S * Math.exp((mu - 0.5 * vPos) + sqrtV * z1);
      V = V + kappa * (theta - vPos) + xi * sqrtV * z2;
      paths[i][t] = S;
    }
  }
  const finalPrices = new Float64Array(nSim);
  for (let i = 0; i < nSim; i++) finalPrices[i] = paths[i][horizon];
  return { model: 'Heston', modelId: 'heston', paths, finalPrices, s0, horizon, nSim, params: { mu: mu * 252, kappa, theta, xi, rho, v0 } };
}

// ── Jump Diffusion ───────────────────────────────────────────────
function estimateJumpParams(logReturns) {
  const mu = mean(logReturns), sigma = std(logReturns, 1);
  const jumpMask = logReturns.map(r => Math.abs((r - mu) / sigma) > 2.5);
  const nJumps = jumpMask.filter(Boolean).length;
  const lam = nJumps / logReturns.length;
  let jumpMean = 0, jumpStd = sigma * 0.5;
  if (nJumps > 0) {
    const sizes = logReturns.filter((_, i) => jumpMask[i]).map(r => r - mu);
    jumpMean = mean(sizes);
    jumpStd = nJumps > 1 ? std(sizes, 1) : sigma;
  }
  const continuous = logReturns.filter((_, i) => !jumpMask[i]);
  return { muC: continuous.length > 0 ? mean(continuous) : mu, sigmaC: continuous.length > 1 ? std(continuous, 1) : sigma, lam: Math.max(lam, 0.001), jumpMean, jumpStd };
}

function simulateJumpDiffusion(logReturns, s0, horizon, nSim, seed) {
  const rng = createRNG(seed);
  const { muC, sigmaC, lam, jumpMean, jumpStd } = estimateJumpParams(logReturns);
  const k = Math.exp(jumpMean + 0.5 * jumpStd * jumpStd) - 1;
  const paths = new Array(nSim);
  for (let i = 0; i < nSim; i++) {
    paths[i] = new Float64Array(horizon + 1);
    paths[i][0] = s0;
    let S = s0;
    for (let t = 1; t <= horizon; t++) {
      const z = rng.normal(), nj = rng.poisson(lam);
      let J = 0;
      for (let j = 0; j < nj; j++) J += jumpMean + jumpStd * rng.normal();
      S = S * Math.exp((muC - lam * k - 0.5 * sigmaC * sigmaC) + sigmaC * z + J);
      paths[i][t] = S;
    }
  }
  const finalPrices = new Float64Array(nSim);
  for (let i = 0; i < nSim; i++) finalPrices[i] = paths[i][horizon];
  return { model: 'Jump Diffusion', modelId: 'jump', paths, finalPrices, s0, horizon, nSim, params: { mu: muC * 252, sigma: sigmaC * Math.sqrt(252), lambda: lam, jumpMean, jumpStd } };
}

// ── GARCH(1,1) ───────────────────────────────────────────────────
function fitGarch(logReturns) {
  const retPct = logReturns.map(r => r * 100);
  const muPct = mean(retPct);
  const demeaned = retPct.map(r => r - muPct);
  const uncondVar = variance(demeaned, 1);
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
      if (ll > bestLL) { bestLL = ll; bestAlpha = a; bestBeta = b; }
    }
  }
  const omega = uncondVar * (1 - bestAlpha - bestBeta);
  let sigma2 = uncondVar;
  for (let i = 1; i < demeaned.length; i++) {
    sigma2 = omega + bestAlpha * demeaned[i - 1] ** 2 + bestBeta * sigma2;
    sigma2 = Math.max(sigma2, 1e-8);
  }
  return { omega: Math.max(omega, 1e-8), alpha: bestAlpha, beta: bestBeta, muPct, lastVariancePct2: sigma2, lastResidPct: demeaned[demeaned.length - 1] };
}

function simulateGarch(logReturns, s0, horizon, nSim, seed) {
  const rng = createRNG(seed);
  const { omega, alpha, beta, muPct, lastVariancePct2, lastResidPct } = fitGarch(logReturns);
  const paths = new Array(nSim);
  for (let i = 0; i < nSim; i++) {
    paths[i] = new Float64Array(horizon + 1);
    paths[i][0] = s0;
    let S = s0, sig2 = lastVariancePct2, epsPrev = lastResidPct;
    for (let t = 1; t <= horizon; t++) {
      sig2 = Math.max(omega + alpha * epsPrev ** 2 + beta * sig2, 1e-8);
      const z = rng.normal(), eps = Math.sqrt(sig2) * z;
      S = S * Math.exp((muPct + eps) / 100.0);
      paths[i][t] = S;
      epsPrev = eps;
    }
  }
  const finalPrices = new Float64Array(nSim);
  for (let i = 0; i < nSim; i++) finalPrices[i] = paths[i][horizon];
  return { model: 'GARCH(1,1)', modelId: 'garch', paths, finalPrices, s0, horizon, nSim, params: { omega, alpha, beta, muPct } };
}

// ── Bootstrap ────────────────────────────────────────────────────
function simulateBootstrap(logReturns, s0, horizon, nSim, seed) {
  const rng = createRNG(seed);
  const paths = new Array(nSim);
  for (let i = 0; i < nSim; i++) {
    paths[i] = new Float64Array(horizon + 1);
    paths[i][0] = s0;
    let logS = Math.log(s0);
    for (let t = 1; t <= horizon; t++) { logS += logReturns[rng.randInt(logReturns.length)]; paths[i][t] = Math.exp(logS); }
  }
  const finalPrices = new Float64Array(nSim);
  for (let i = 0; i < nSim; i++) finalPrices[i] = paths[i][horizon];
  return { model: 'Bootstrap', modelId: 'bootstrap', paths, finalPrices, s0, horizon, nSim, params: { nReturns: logReturns.length } };
}

const SIMULATORS = { gbm: simulateGBM, heston: simulateHeston, jump: simulateJumpDiffusion, garch: simulateGarch, bootstrap: simulateBootstrap };

// ── Risk Metrics ─────────────────────────────────────────────────
const CONFIDENCE_LEVELS = [0.90, 0.95, 0.99];
const RISK_FREE_RATE = 0.035;

function computeRiskMetrics(result, logReturns) {
  const { finalPrices, s0, paths } = result;
  const fp = Array.from(finalPrices);
  const returns = fp.map(p => p / s0 - 1);
  const metrics = {
    model: result.model, s0, nSim: result.nSim,
    expectedPrice: mean(fp), medianPrice: percentile(fp, 50), stdPrice: std(fp, 0),
    ci95Lower: percentile(fp, 2.5), ci95Upper: percentile(fp, 97.5),
    ci99Lower: percentile(fp, 0.5), ci99Upper: percentile(fp, 99.5),
    probUp: fp.filter(p => p > s0).length / fp.length,
    probLoss10: fp.filter(p => p < s0 * 0.9).length / fp.length,
    probLoss20: fp.filter(p => p < s0 * 0.8).length / fp.length,
    probLoss30: fp.filter(p => p < s0 * 0.7).length / fp.length,
    expectedReturnPct: (mean(fp) / s0 - 1) * 100,
  };
  for (const cl of CONFIDENCE_LEVELS) {
    const alpha = (1 - cl) * 100;
    const varVal = -percentile(returns, alpha);
    const cutoff = percentile(returns, alpha);
    const tail = returns.filter(r => r <= cutoff);
    const label = Math.round(cl * 100);
    metrics[`VaR_${label}`] = varVal;
    metrics[`CVaR_${label}`] = tail.length > 0 ? -mean(tail) : 0;
  }
  // MDD
  const sampleSize = Math.min(paths.length, 500);
  const mdds = [];
  for (let i = 0; i < sampleSize; i++) {
    let peak = paths[i][0], maxDD = 0;
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
  if (logReturns && logReturns.length > 0) {
    const muA = mean(logReturns) * 252;
    const sigmaA = std(logReturns, 1) * Math.sqrt(252);
    const rf = RISK_FREE_RATE;
    metrics.sharpe = sigmaA > 0 ? (muA - rf) / sigmaA : 0;
    const rfDaily = rf / 252;
    const excess = logReturns.map(r => r - rfDaily);
    const downside = excess.filter(r => r < 0);
    const downsideStd = downside.length > 1 ? std(downside, 1) * Math.sqrt(252) : 1;
    metrics.sortino = (muA - rf) / downsideStd;
    for (const w of [30, 60, 252]) {
      if (logReturns.length >= w) metrics[`vol_${w}d`] = std(logReturns.slice(-w), 1) * Math.sqrt(252);
    }
  }
  return metrics;
}

// ── Signal ───────────────────────────────────────────────────────
function generateSignal(metrics) {
  const probUp = metrics.probUp;
  const expectedReturn = metrics.expectedReturnPct / 100;
  const sharpe = metrics.sharpe || 0;
  const var95 = metrics.VaR_95 || 0;
  let signal, color;
  if (probUp > 0.55 && expectedReturn > 0.05 && sharpe > 0.3) { signal = 'BUY'; color = '#E8C547'; }
  else if (probUp < 0.40 || (var95 > 0.15 && expectedReturn < 0)) { signal = 'SELL'; color = '#EF4444'; }
  else { signal = 'HOLD'; color = '#9A7B2C'; }
  const nSim = metrics.nSim || 0;
  const confidence = nSim >= 5000 ? 'HIGH' : nSim >= 2000 ? 'MEDIUM' : 'LOW';
  const score = Math.min(100, Math.max(0, Math.round(probUp * 40 + sharpe * 20 + expectedReturn * 200)));
  return { signal, color, confidence, score, probUp, expectedReturn, var95, sharpe };
}

// ── Backtest helpers ─────────────────────────────────────────────
function buildCheckpointIndices(priceCount, horizon, minTrainingDays, checkpointStep, maxCheckpoints) {
  const lastCheckpoint = priceCount - horizon - 1;
  if (lastCheckpoint < minTrainingDays) return [];
  const indices = [];
  for (let idx = minTrainingDays; idx <= lastCheckpoint; idx += checkpointStep) indices.push(idx);
  if (indices[indices.length - 1] !== lastCheckpoint) indices.push(lastCheckpoint);
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
  const absErrors = checkpoints.map(c => c.absErrorPct);
  const returnErrors = checkpoints.map(c => c.returnErrorPct);
  const directionHits = checkpoints.map(c => c.directionHit ? 1 : 0);
  const within95 = checkpoints.map(c => c.within95 ? 1 : 0);
  const within99 = checkpoints.map(c => c.within99 ? 1 : 0);
  const biases = checkpoints.map(c => c.biasPct);
  const signalScores = checkpoints.map(c => c.signalScore);
  const predictedReturns = checkpoints.map(c => c.predictedReturnPct);
  const actualReturns = checkpoints.map(c => c.actualReturnPct);
  const latestWindow = checkpoints[checkpoints.length - 1] || null;
  const bestWindow = checkpoints.reduce((best, c) => (!best || c.absErrorPct < best.absErrorPct) ? c : best, null);
  const worstWindow = checkpoints.reduce((worst, c) => (!worst || c.absErrorPct > worst.absErrorPct) ? c : worst, null);
  const summary = {
    modelId, model: modelName,
    nCheckpoints: checkpoints.length,
    meanAbsErrorPct: averageOrZero(absErrors),
    medianAbsErrorPct: absErrors.length > 0 ? percentile(absErrors, 50) : 0,
    rmseReturnPct: returnErrors.length > 0 ? Math.sqrt(averageOrZero(returnErrors.map(e => e * e))) : 0,
    directionAccuracy: averageOrZero(directionHits),
    within95Rate: averageOrZero(within95),
    within99Rate: averageOrZero(within99),
    avgBiasPct: averageOrZero(biases),
    avgSignalScore: averageOrZero(signalScores),
    avgPredictedReturnPct: averageOrZero(predictedReturns),
    avgActualReturnPct: averageOrZero(actualReturns),
    bullishSignals: checkpoints.filter(c => c.signal === 'BUY').length,
    bearishSignals: checkpoints.filter(c => c.signal === 'SELL').length,
    holdSignals: checkpoints.filter(c => c.signal === 'HOLD').length,
    totalTimeMs: Math.round(totalTimeMs),
    avgTimeMs: checkpoints.length > 0 ? Math.round(totalTimeMs / checkpoints.length) : 0,
    latestAbsErrorPct: latestWindow?.absErrorPct ?? 0,
    latestDirectionHit: latestWindow?.directionHit ?? false,
    bestWindow, worstWindow, latestWindow,
    periodStart: checkpoints[0]?.trainEndDate ?? null,
    periodEnd: latestWindow?.actualEndDate ?? null,
  };
  summary.score = computeHistoricalScore(summary);
  return { modelId, model: modelName, checkpoints, summary };
}

// ═══════════════════════════════════════════════════════════════════
// Worker message handler
// ═══════════════════════════════════════════════════════════════════
self.onmessage = async function (e) {
  const { type, payload } = e.data;

  if (type === 'RUN_SIMULATIONS') {
    try {
      const { logReturns, s0, horizon, nSim, modelIds, seed } = payload;
      const results = {};
      const metrics = {};
      let done = 0;
      const total = modelIds.length;

      for (const id of modelIds) {
        const sim = SIMULATORS[id];
        if (!sim) continue;

        self.postMessage({ type: 'PROGRESS', payload: { pct: Math.round((done / total) * 55), message: `Simulando ${id.toUpperCase()}...` } });

        const t0 = performance.now();
        results[id] = sim(logReturns, s0, horizon, nSim, seed);
        results[id].timeMs = Math.round(performance.now() - t0);
        metrics[id] = computeRiskMetrics(results[id], logReturns);
        done++;
        self.postMessage({ type: 'PROGRESS', payload: { pct: Math.round((done / total) * 55), message: `${id.toUpperCase()} completado` } });
      }

      self.postMessage({ type: 'SIM_DONE', payload: { results: serializeResults(results), metrics } });
    } catch (err) {
      self.postMessage({ type: 'ERROR', payload: { message: err.message } });
    }
    return;
  }

  if (type === 'RUN_BACKTEST') {
    try {
      const { prices, dates, modelIds, options } = payload;
      const horizon = options.horizon || 252;
      const nSim = options.nSim || 600;
      const minTrainingDays = options.minTrainingDays || 252;
      const checkpointStep = options.checkpointStep || 63;
      const maxCheckpoints = options.maxCheckpoints || 8;
      const neutralBandPct = options.neutralBandPct ?? 5;
      const seed = options.seed ?? 42;

      const checkpointIndices = buildCheckpointIndices(prices.length, horizon, minTrainingDays, checkpointStep, maxCheckpoints);
      if (checkpointIndices.length === 0) {
        self.postMessage({ type: 'BACKTEST_DONE', payload: { backtest: null } });
        return;
      }

      const total = checkpointIndices.length * modelIds.length;
      let done = 0;
      const backtestResults = {};

      for (let mIdx = 0; mIdx < modelIds.length; mIdx++) {
        const modelId = modelIds[mIdx];
        const simulator = SIMULATORS[modelId];
        if (!simulator) continue;

        const checkpoints = [];
        let modelName = modelId;
        let totalTimeMs = 0;

        for (let cpOffset = 0; cpOffset < checkpointIndices.length; cpOffset++) {
          const cpIndex = checkpointIndices[cpOffset];
          const historyPrices = prices.slice(0, cpIndex + 1);
          const logReturns = computeLogReturnsFromPrices(historyPrices);
          const s0 = historyPrices[historyPrices.length - 1];
          const actualFinalPrice = prices[cpIndex + horizon];

          const t0 = performance.now();
          const simulation = simulator(logReturns, s0, horizon, nSim, seed + mIdx * 1000 + cpOffset);
          modelName = simulation.model || modelName;
          const cpMetrics = computeRiskMetrics(simulation, logReturns);
          const elapsedMs = performance.now() - t0;
          totalTimeMs += elapsedMs;

          const actualReturnPct = (actualFinalPrice / s0 - 1) * 100;
          const absErrorPct = Math.abs(cpMetrics.expectedPrice - actualFinalPrice) / actualFinalPrice * 100;
          const biasPct = (cpMetrics.expectedPrice - actualFinalPrice) / actualFinalPrice * 100;
          const predictedDirection = classifyDirection(cpMetrics.expectedReturnPct, neutralBandPct);
          const actualDirection = classifyDirection(actualReturnPct, neutralBandPct);
          const signal = generateSignal(cpMetrics);

          checkpoints.push({
            checkpointNumber: cpOffset + 1,
            checkpointIndex: cpIndex,
            historyLength: historyPrices.length,
            horizon,
            trainEndDate: dates?.[cpIndex] || null,
            actualEndDate: dates?.[cpIndex + horizon] || null,
            s0,
            actualPrice: actualFinalPrice,
            predictedPrice: cpMetrics.expectedPrice,
            predictedMedianPrice: cpMetrics.medianPrice,
            predictedReturnPct: cpMetrics.expectedReturnPct,
            actualReturnPct,
            returnErrorPct: cpMetrics.expectedReturnPct - actualReturnPct,
            absErrorPct,
            medianAbsErrorPct: Math.abs(cpMetrics.medianPrice - actualFinalPrice) / actualFinalPrice * 100,
            biasPct,
            directionHit: predictedDirection === actualDirection,
            within95: actualFinalPrice >= cpMetrics.ci95Lower && actualFinalPrice <= cpMetrics.ci95Upper,
            within99: actualFinalPrice >= cpMetrics.ci99Lower && actualFinalPrice <= cpMetrics.ci99Upper,
            probUp: cpMetrics.probUp,
            signal: signal.signal,
            signalColor: signal.color,
            signalScore: signal.score,
            ci95Lower: cpMetrics.ci95Lower,
            ci95Upper: cpMetrics.ci95Upper,
            ci99Lower: cpMetrics.ci99Lower,
            ci99Upper: cpMetrics.ci99Upper,
            timeMs: Math.round(elapsedMs),
          });

          done++;
          self.postMessage({
            type: 'PROGRESS',
            payload: {
              pct: 55 + Math.round((done / total) * 45),
              message: `Backtest ${modelId} · corte ${cpOffset + 1}/${checkpointIndices.length}`,
              modelId, checkpointIndex: cpOffset + 1, checkpointCount: checkpointIndices.length, done, total,
            },
          });
        }

        backtestResults[modelId] = summarizeBacktest(modelId, modelName, checkpoints, totalTimeMs);
      }

      const backtest = {
        settings: { horizon, nSim, minTrainingDays, checkpointStep, maxCheckpoints, neutralBandPct },
        totalCheckpoints: checkpointIndices.length,
        results: backtestResults,
      };

      self.postMessage({ type: 'BACKTEST_DONE', payload: { backtest } });
    } catch (err) {
      self.postMessage({ type: 'ERROR', payload: { message: err.message } });
    }
    return;
  }
};

// Serialize Float64Array → plain Array for structured clone compatibility
function serializeResults(results) {
  const out = {};
  for (const [id, r] of Object.entries(results)) {
    out[id] = {
      ...r,
      finalPrices: Array.from(r.finalPrices),
      // Paths are large — keep as arrays for transfer but omit if memory is tight
      paths: r.paths.map(p => Array.from(p)),
    };
  }
  return out;
}
