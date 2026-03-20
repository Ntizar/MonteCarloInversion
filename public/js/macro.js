/* ═══════════════════════════════════════════════════════════════════
   macro.js — Datos macroeconómicos sin API key
   Fuentes: FRED API (sin key para series públicas), Yahoo Finance indices
   Monte Carlo Stock Simulator v3.0
   ═══════════════════════════════════════════════════════════════════ */

import { getCachedMacro, setCachedMacro } from './cache.js';

// FRED API — series públicas sin necesidad de API key
// Se accede via CORS proxy ya que FRED no tiene CORS habilitado
const FRED_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

// Series macro clave
const MACRO_SERIES = {
  fed_rate: { id: 'FEDFUNDS', name: 'Tipo FED (Fed Funds Rate)', unit: '%' },
  cpi: { id: 'CPIAUCSL', name: 'IPC EEUU (YoY %)', unit: '%', transform: 'pct_change_12' },
  unemployment: { id: 'UNRATE', name: 'Desempleo EEUU', unit: '%' },
  treasury_10y: { id: 'DGS10', name: 'Bono EEUU 10 años', unit: '%' },
  treasury_2y: { id: 'DGS2', name: 'Bono EEUU 2 años', unit: '%' },
  vix: { id: 'VIXCLS', name: 'VIX (Volatilidad implícita)', unit: 'puntos' },
  gdp_growth: { id: 'A191RL1Q225SBEA', name: 'Crecimiento PIB EEUU', unit: '%' },
  sp500_pe: { id: 'CAPE', name: 'CAPE Ratio S&P 500', unit: 'x' },
};

// CORS proxies para FRED
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

async function fetchWithProxy(url) {
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { signal: AbortSignal.timeout(8000) });
      if (res.ok) return await res.text();
    } catch {
      continue;
    }
  }
  throw new Error(`No se pudo obtener: ${url}`);
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 2) continue;
    const date = parts[0].trim();
    const val = parseFloat(parts[1]);
    if (!isNaN(val)) {
      data.push({ date, value: val });
    }
  }
  return data;
}

function computePctChangeYoY(data) {
  const result = [];
  for (let i = 12; i < data.length; i++) {
    const prev = data[i - 12].value;
    const curr = data[i].value;
    if (prev > 0) {
      result.push({ date: data[i].date, value: ((curr / prev) - 1) * 100 });
    }
  }
  return result;
}

async function fetchFREDSeries(seriesId, transform = null, limit = 36) {
  const cacheKey = `fred_${seriesId}`;
  const cached = await getCachedMacro(cacheKey);
  if (cached) return cached;

  // Fecha de inicio: 3 años atrás
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 4);
  const dateStr = startDate.toISOString().split('T')[0];

  const url = `${FRED_BASE}?id=${seriesId}&vintage_date=${dateStr}`;

  try {
    const csvText = await fetchWithProxy(url);
    let data = parseCSV(csvText);

    if (transform === 'pct_change_12') {
      data = computePctChangeYoY(data);
    }

    // Solo los últimos N puntos
    const result = data.slice(-limit);
    await setCachedMacro(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`FRED ${seriesId} failed:`, err.message);
    return null;
  }
}

/**
 * Obtiene el resumen macro actual más relevante para el análisis de inversión
 */
export async function fetchMacroContext() {
  const cacheKey = 'macro_context_summary';
  const cached = await getCachedMacro(cacheKey);
  if (cached) return cached;

  // Fetch en paralelo todas las series
  const [fedData, cpiData, unemploymentData, t10yData, t2yData, vixData] = await Promise.all([
    fetchFREDSeries('FEDFUNDS', null, 24),
    fetchFREDSeries('CPIAUCSL', 'pct_change_12', 24),
    fetchFREDSeries('UNRATE', null, 24),
    fetchFREDSeries('DGS10', null, 24),
    fetchFREDSeries('DGS2', null, 24),
    fetchFREDSeries('VIXCLS', null, 60),
  ]);

  const getLatest = (data) => data && data.length > 0 ? data[data.length - 1] : null;
  const getPrev = (data) => data && data.length > 1 ? data[data.length - 2] : null;

  const fedLatest = getLatest(fedData);
  const cpiLatest = getLatest(cpiData);
  const unemploymentLatest = getLatest(unemploymentData);
  const t10yLatest = getLatest(t10yData);
  const t2yLatest = getLatest(t2yData);
  const vixLatest = getLatest(vixData);

  // Spread curva de tipos (inversión = recesión)
  const yieldSpread = (t10yLatest && t2yLatest)
    ? (t10yLatest.value - t2yLatest.value).toFixed(2)
    : null;
  const invertedCurve = yieldSpread !== null && parseFloat(yieldSpread) < 0;

  // Señal macro global
  let macroSignal = 'NEUTRAL';
  let macroScore = 50;
  let macroMessage = '';

  if (vixLatest && cpiLatest && fedLatest) {
    const vixScore = vixLatest.value < 15 ? 80 : vixLatest.value < 20 ? 65 : vixLatest.value < 30 ? 40 : 20;
    const inflationScore = cpiLatest.value < 2.5 ? 80 : cpiLatest.value < 4 ? 55 : cpiLatest.value < 7 ? 30 : 10;
    const rateScore = fedLatest.value < 2 ? 75 : fedLatest.value < 4 ? 55 : fedLatest.value < 5.5 ? 40 : 25;
    const curveScore = invertedCurve ? 25 : 70;

    macroScore = Math.round(vixScore * 0.3 + inflationScore * 0.3 + rateScore * 0.25 + curveScore * 0.15);

    if (macroScore >= 65) {
      macroSignal = 'FAVORABLE';
      macroMessage = 'Entorno macro favorable: volatilidad contenida, inflación controlada y tipos sin presión extrema.';
    } else if (macroScore >= 45) {
      macroSignal = 'MIXTO';
      macroMessage = 'Entorno macro mixto. Conviene mantener diversificación y vigilar evolución de tipos e inflación.';
    } else {
      macroSignal = 'ADVERSO';
      macroMessage = 'Entorno macro adverso: alta volatilidad, inflación elevada o tipos restrictivos. Cautela recomendada.';
    }
  }

  const context = {
    generatedAt: new Date().toISOString(),
    signal: macroSignal,
    score: macroScore,
    message: macroMessage,
    indicators: {
      fed_rate: fedLatest ? { value: fedLatest.value, date: fedLatest.date, unit: '%', label: 'Tipo FED' } : null,
      inflation: cpiLatest ? { value: cpiLatest.value.toFixed(2), date: cpiLatest.date, unit: '%', label: 'Inflación IPC YoY' } : null,
      unemployment: unemploymentLatest ? { value: unemploymentLatest.value, date: unemploymentLatest.date, unit: '%', label: 'Desempleo EEUU' } : null,
      treasury_10y: t10yLatest ? { value: t10yLatest.value, date: t10yLatest.date, unit: '%', label: 'Bono 10Y EEUU' } : null,
      treasury_2y: t2yLatest ? { value: t2yLatest.value, date: t2yLatest.date, unit: '%', label: 'Bono 2Y EEUU' } : null,
      yield_spread: yieldSpread !== null ? { value: yieldSpread, unit: '%', label: 'Spread 10Y-2Y', inverted: invertedCurve } : null,
      vix: vixLatest ? { value: vixLatest.value.toFixed(1), date: vixLatest.date, unit: 'puntos', label: 'VIX' } : null,
    },
    series: {
      fed: fedData,
      cpi: cpiData,
      unemployment: unemploymentData,
      treasury_10y: t10yData,
      vix: vixData,
    },
  };

  await setCachedMacro(cacheKey, context);
  return context;
}

/**
 * Ajusta el risk free rate basado en la tasa FED actual
 */
export async function getLiveRiskFreeRate() {
  try {
    const data = await fetchFREDSeries('DGS10', null, 5);
    if (data && data.length > 0) {
      return data[data.length - 1].value / 100; // En decimal
    }
  } catch {
    // Fallback
  }
  return 0.035; // Default 3.5%
}
