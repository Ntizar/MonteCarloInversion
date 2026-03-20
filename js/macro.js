/* ═══════════════════════════════════════════════════════════════════
   macro.js — Datos macroeconómicos
   Fuentes: FRED API (JSON oficial), Yahoo Finance indices
   Monte Carlo Stock Simulator v3.3
   ═══════════════════════════════════════════════════════════════════ */

import { getCachedMacro, setCachedMacro } from './cache.js';

// FRED API — endpoint JSON oficial (más fiable que el CSV endpoint)
// Key pública registrada para uso educativo/personal
const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_API_KEY  = 'b4e2288c85b7a9d5b3c43a18d5e2fc0f'; // key pública gratuita (FRED permite 120 req/min)

// CORS proxies — orden de preferencia
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  url => `https://thingproxy.freeboard.io/fetch/${url}`,
];

async function fetchWithProxy(url, json = false) {
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      return json ? await res.json() : await res.text();
    } catch {
      continue;
    }
  }
  throw new Error(`No se pudo obtener: ${url}`);
}

function parseFREDJson(data) {
  if (!data?.observations) return [];
  return data.observations
    .filter(o => o.value !== '.' && o.value !== 'N/A')
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
    .filter(o => !isNaN(o.value));
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

  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 4);
  const dateStr = startDate.toISOString().split('T')[0];

  const url = `${FRED_API_BASE}?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&observation_start=${dateStr}&sort_order=asc`;

  try {
    const jsonData = await fetchWithProxy(url, true);
    let data = parseFREDJson(jsonData);

    if (data.length === 0) throw new Error('empty');

    if (transform === 'pct_change_12') {
      data = computePctChangeYoY(data);
    }

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
 * Renderiza el panel macro del home (macro panel container)
 */
export function renderMacroPanel(container, context) {
  if (!container) return;
  if (!context) { container.innerHTML = '<p class="macro-unavailable">Datos macro no disponibles</p>'; return; }
  container.innerHTML = renderMacroContextCard(context);
}

/**
 * Devuelve HTML de la tarjeta de contexto macro (para la pestaña Context)
 */
export function renderMacroContextCard(context) {
  if (!context) return '<p class="context-unavailable">Datos macro no disponibles</p>';
  const ind = context.indicators || {};
  const signalColors = { FAVORABLE: '#10B981', MIXTO: '#E8C547', ADVERSO: '#EF4444' };
  const signalColor = signalColors[context.signal] || '#9A7B2C';
  const fmt = (v) => v != null ? v : '—';
  return `
    <div class="macro-context-card">
      <div class="macro-signal-row">
        <span class="macro-signal-badge" style="background:${signalColor}">${context.signal ?? '—'}</span>
        <span class="macro-signal-score">Score ${context.score ?? '—'}</span>
        <span class="macro-signal-msg">${context.message ?? ''}</span>
      </div>
      <div class="macro-indicators-grid">
        ${ind.fed_rate ? `<div class="macro-ind"><span class="macro-ind-label">${ind.fed_rate.label}</span><span class="macro-ind-val">${fmt(ind.fed_rate.value)}${ind.fed_rate.unit}</span></div>` : ''}
        ${ind.inflation ? `<div class="macro-ind"><span class="macro-ind-label">${ind.inflation.label}</span><span class="macro-ind-val">${fmt(ind.inflation.value)}${ind.inflation.unit}</span></div>` : ''}
        ${ind.vix ? `<div class="macro-ind"><span class="macro-ind-label">${ind.vix.label}</span><span class="macro-ind-val">${fmt(ind.vix.value)}</span></div>` : ''}
        ${ind.treasury_10y ? `<div class="macro-ind"><span class="macro-ind-label">${ind.treasury_10y.label}</span><span class="macro-ind-val">${fmt(ind.treasury_10y.value)}${ind.treasury_10y.unit}</span></div>` : ''}
        ${ind.treasury_2y ? `<div class="macro-ind"><span class="macro-ind-label">${ind.treasury_2y.label}</span><span class="macro-ind-val">${fmt(ind.treasury_2y.value)}${ind.treasury_2y.unit}</span></div>` : ''}
        ${ind.yield_spread ? `<div class="macro-ind"><span class="macro-ind-label">${ind.yield_spread.label}</span><span class="macro-ind-val ${ind.yield_spread.inverted ? 'text-red' : 'text-green'}">${fmt(ind.yield_spread.value)}${ind.yield_spread.unit}${ind.yield_spread.inverted ? ' ⚠️' : ''}</span></div>` : ''}
        ${ind.unemployment ? `<div class="macro-ind"><span class="macro-ind-label">${ind.unemployment.label}</span><span class="macro-ind-val">${fmt(ind.unemployment.value)}${ind.unemployment.unit}</span></div>` : ''}
      </div>
    </div>
  `;
}

/** Alias para compatibilidad con app.js que importa fetchMacroData */
export { fetchMacroContext as fetchMacroData };

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
