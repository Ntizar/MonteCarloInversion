/* ═══════════════════════════════════════════════════════════════════
   math-utils.js — Shared math & RNG utilities
   Used by: simulation.js, simulation-worker.js, portfolio.js
   Monte Carlo Stock Simulator v3.0
   ═══════════════════════════════════════════════════════════════════ */

// ── Random Number Generation ─────────────────────────────────────
// Seeded PRNG (Mulberry32) for reproducibility
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller for standard normal
export function createRNG(seed) {
  const uniform = seed != null ? mulberry32(seed) : () => Math.random();
  let spare = null;
  return {
    uniform,
    normal() {
      if (spare !== null) {
        const val = spare;
        spare = null;
        return val;
      }
      let u, v, s;
      do {
        u = uniform() * 2 - 1;
        v = uniform() * 2 - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const mul = Math.sqrt((-2 * Math.log(s)) / s);
      spare = v * mul;
      return u * mul;
    },
    // Poisson via Knuth's algorithm
    poisson(lambda) {
      if (lambda < 30) {
        const L = Math.exp(-lambda);
        let k = 0, p = 1;
        do { k++; p *= uniform(); } while (p > L);
        return k - 1;
      }
      // For large lambda, use normal approximation
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.normal()));
    },
    // Random integer in [0, max)
    randInt(max) {
      return Math.floor(uniform() * max);
    },
  };
}

// ── Statistics Utilities ─────────────────────────────────────────
export function mean(arr) {
  let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

export function std(arr, ddof = 1) {
  const m = mean(arr);
  let s = 0; for (let i = 0; i < arr.length; i++) s += (arr[i] - m) ** 2;
  return Math.sqrt(s / (arr.length - ddof));
}

export function variance(arr, ddof = 1) {
  const m = mean(arr);
  let s = 0; for (let i = 0; i < arr.length; i++) s += (arr[i] - m) ** 2;
  return s / (arr.length - ddof);
}

export function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function rollingVariance(arr, window) {
  const result = [];
  for (let i = window; i <= arr.length; i++) {
    const slice = arr.slice(i - window, i);
    result.push(variance(slice, 1));
  }
  return result;
}

export function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let cov = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db; sa += da * da; sb += db * db;
  }
  const denom = Math.sqrt(sa * sb);
  return denom > 0 ? cov / denom : 0;
}

export function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

export function averageOrZero(arr) {
  return arr.length > 0 ? mean(arr) : 0;
}

export function computeLogReturnsFromPrices(prices) {
  const logReturns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return logReturns;
}
