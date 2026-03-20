/* ═══════════════════════════════════════════════════════════════════
   options.js — Put/Call ratio y datos de opciones
   Fuente: Yahoo Finance v7/finance/options (sin API key)
   Monte Carlo Stock Simulator v3.3
   ═══════════════════════════════════════════════════════════════════ */

import { getCachedMacro, setCachedMacro } from './cache.js';

const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

async function fetchWithProxy(url) {
  for (const host of YAHOO_HOSTS) {
    for (const makeProxy of CORS_PROXIES) {
      const targetUrl = url.replace('YAHOO_HOST', host);
      try {
        const res = await fetch(makeProxy(targetUrl), { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.optionChain?.result?.length > 0) return data;
      } catch { continue; }
    }
  }
  return null;
}

/**
 * Obtiene Put/Call ratio y datos de opciones de la expiración más próxima
 */
export async function fetchOptionsData(symbol) {
  const cacheKey = `options:${symbol}`;
  const cached = await getCachedMacro(cacheKey);
  if (cached) return cached;

  const url = `https://YAHOO_HOST/v7/finance/options/${symbol}`;

  try {
    const data = await fetchWithProxy(url);
    if (!data) return null;

    const result = data.optionChain?.result?.[0];
    if (!result) return null;

    const expirations = result.expirationDates?.map(ts =>
      new Date(ts * 1000).toISOString().split('T')[0]
    ) || [];

    const options = result.options?.[0];
    if (!options) return null;

    const calls = options.calls || [];
    const puts  = options.puts  || [];

    // Volumen y open interest
    const callVolume = calls.reduce((s, c) => s + (c.volume ?? 0), 0);
    const putVolume  = puts.reduce((s, p) => s + (p.volume ?? 0), 0);
    const callOI     = calls.reduce((s, c) => s + (c.openInterest ?? 0), 0);
    const putOI      = puts.reduce((s, p) => s + (p.openInterest ?? 0), 0);

    const totalVolume = callVolume + putVolume;
    const totalOI     = callOI + putOI;

    const pcRatioVol = callVolume > 0 ? (putVolume / callVolume) : null;
    const pcRatioOI  = callOI    > 0 ? (putOI    / callOI)    : null;

    // IV promedio de ATM calls (5 más cercanas al precio actual)
    const currentPrice = result.quote?.regularMarketPrice ?? null;
    let avgIV = null;
    if (currentPrice && calls.length > 0) {
      const sorted = [...calls].sort((a, b) =>
        Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice)
      ).slice(0, 5);
      const ivs = sorted.map(c => c.impliedVolatility).filter(v => v != null && v > 0);
      if (ivs.length > 0) avgIV = ivs.reduce((a, b) => a + b, 0) / ivs.length;
    }

    // Señal Put/Call
    let sentiment, sentimentColor;
    if (pcRatioVol !== null) {
      if (pcRatioVol < 0.7)       { sentiment = 'OPTIMISTA';   sentimentColor = '#10B981'; }
      else if (pcRatioVol < 1.0)  { sentiment = 'NEUTRO';      sentimentColor = '#E8C547'; }
      else if (pcRatioVol < 1.5)  { sentiment = 'PRECAUCIÓN';  sentimentColor = '#E8C547'; }
      else                        { sentiment = 'PESIMISTA';   sentimentColor = '#EF4444'; }
    } else {
      sentiment = 'SIN DATOS'; sentimentColor = '#9A7B2C';
    }

    const result_obj = {
      symbol,
      generatedAt: new Date().toISOString(),
      expirations,
      nextExpiration: expirations[0] ?? null,
      callVolume, putVolume, totalVolume,
      callOI, putOI, totalOI,
      pcRatioVol: pcRatioVol != null ? +pcRatioVol.toFixed(3) : null,
      pcRatioOI:  pcRatioOI  != null ? +pcRatioOI.toFixed(3)  : null,
      impliedVolatility: avgIV != null ? +(avgIV * 100).toFixed(1) : null,
      sentiment, sentimentColor,
      callsCount: calls.length,
      putsCount:  puts.length,
    };

    await setCachedMacro(cacheKey, result_obj);
    return result_obj;
  } catch (err) {
    console.warn(`Options failed for ${symbol}:`, err.message);
    return null;
  }
}

/** Renderiza tarjeta de opciones */
export function renderOptionsCard(options) {
  if (!options) return '<p class="context-unavailable">Datos de opciones no disponibles (puede que el activo no tenga opciones listadas)</p>';

  const fmt = (v) => v != null ? v.toLocaleString() : '—';
  const fmtR = (v) => v != null ? v.toFixed(3) : '—';

  const pcBar = options.pcRatioVol != null
    ? Math.min(100, (options.pcRatioVol / 2) * 100)
    : 50;

  return `
    <div class="options-card">
      <div class="options-signal-row">
        <span class="options-sentiment-badge" style="background:${options.sentimentColor}">${options.sentiment}</span>
        <span class="options-meta">Próx. vencimiento: ${options.nextExpiration ?? '—'} · ${options.expirations.length} vencimientos</span>
      </div>

      <div class="options-grid">
        <div class="options-section">
          <h4>Volumen</h4>
          <div class="options-row calls"><span>CALLS</span><span>${fmt(options.callVolume)}</span></div>
          <div class="options-row puts"><span>PUTS</span><span>${fmt(options.putVolume)}</span></div>
          <div class="options-row total"><span>P/C Ratio Vol.</span><span>${fmtR(options.pcRatioVol)}</span></div>
        </div>

        <div class="options-section">
          <h4>Open Interest</h4>
          <div class="options-row calls"><span>CALLS OI</span><span>${fmt(options.callOI)}</span></div>
          <div class="options-row puts"><span>PUTS OI</span><span>${fmt(options.putOI)}</span></div>
          <div class="options-row total"><span>P/C Ratio OI</span><span>${fmtR(options.pcRatioOI)}</span></div>
        </div>

        <div class="options-section">
          <h4>Volatilidad Implícita</h4>
          <div class="options-row"><span>IV Promedio ATM</span><span>${options.impliedVolatility != null ? `${options.impliedVolatility}%` : '—'}</span></div>
          <div class="options-row"><span>Contratos calls</span><span>${options.callsCount}</span></div>
          <div class="options-row"><span>Contratos puts</span><span>${options.putsCount}</span></div>
        </div>
      </div>

      <div class="options-bar-wrap">
        <span class="options-bar-label calls">CALLS</span>
        <div class="options-bar-track">
          <div class="options-bar-fill" style="width:${100 - pcBar}%;background:#10B981"></div>
          <div class="options-bar-fill" style="width:${pcBar}%;background:#EF4444"></div>
        </div>
        <span class="options-bar-label puts">PUTS</span>
      </div>
      <p class="options-note">P/C Ratio &lt; 0.7 = optimismo institucional · &gt; 1.0 = precaución · &gt; 1.5 = pesimismo</p>
    </div>
  `;
}
