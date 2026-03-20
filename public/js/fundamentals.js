/* ═══════════════════════════════════════════════════════════════════
   fundamentals.js — Datos fundamentales sin API key
   Fuentes: Yahoo Finance summary (via CORS proxy), Open data público
   Monte Carlo Stock Simulator v3.0
   ═══════════════════════════════════════════════════════════════════ */

import { getCachedFundamentals, setCachedFundamentals } from './cache.js';

const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

async function fetchYahooModule(symbol, modules) {
  const moduleStr = modules.join(',');
  for (const makeProxy of CORS_PROXIES) {
    for (const host of YAHOO_HOSTS) {
      const url = `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${moduleStr}`;
      try {
        const res = await fetch(makeProxy(url), { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        const json = await res.json();
        const result = json?.quoteSummary?.result?.[0];
        if (result) return result;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function safeVal(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return null;
    cur = cur[k];
  }
  return cur ?? null;
}

function safeFmt(val, decimals = 2) {
  const n = typeof val === 'object' && val !== null ? (val.raw ?? val.fmt ?? val) : val;
  if (n == null || isNaN(n)) return null;
  return parseFloat(parseFloat(n).toFixed(decimals));
}

function fmtBig(val) {
  const n = safeFmt(val, 0);
  if (n == null) return null;
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toString();
}

/**
 * Obtiene fundamentales completos de una acción vía Yahoo Finance (sin API key)
 */
export async function fetchFundamentals(symbol) {
  // Cache hit
  const cached = await getCachedFundamentals(symbol);
  if (cached) return cached;

  try {
    const data = await fetchYahooModule(symbol, [
      'summaryDetail',
      'financialData',
      'defaultKeyStatistics',
      'calendarEvents',
      'earningsTrend',
    ]);

    if (!data) return buildEmptyFundamentals(symbol);

    const sd = data.summaryDetail || {};
    const fd = data.financialData || {};
    const ks = data.defaultKeyStatistics || {};
    const et = data.earningsTrend || {};
    const ce = data.calendarEvents || {};

    const fundamentals = {
      symbol,
      generatedAt: new Date().toISOString(),

      // Valoración
      valuation: {
        trailingPE: safeFmt(sd.trailingPE),
        forwardPE: safeFmt(sd.forwardPE),
        pegRatio: safeFmt(ks.pegRatio),
        priceToBook: safeFmt(ks.priceToBook),
        priceToSales: safeFmt(ks.priceToSalesTrailing12Months),
        evToEbitda: safeFmt(ks.enterpriseToEbitda),
        evToRevenue: safeFmt(ks.enterpriseToRevenue),
        marketCap: fmtBig(sd.marketCap),
        marketCapRaw: safeFmt(sd.marketCap, 0),
        enterpriseValue: fmtBig(ks.enterpriseValue),
      },

      // Rentabilidad
      profitability: {
        profitMargins: safeFmt(fd.profitMargins ? fd.profitMargins * 100 : null),
        operatingMargins: safeFmt(fd.operatingMargins ? fd.operatingMargins * 100 : null),
        grossMargins: safeFmt(fd.grossMargins ? fd.grossMargins * 100 : null),
        returnOnEquity: safeFmt(fd.returnOnEquity ? fd.returnOnEquity * 100 : null),
        returnOnAssets: safeFmt(fd.returnOnAssets ? fd.returnOnAssets * 100 : null),
        ebitda: fmtBig(fd.ebitda),
        totalRevenue: fmtBig(fd.totalRevenue),
      },

      // Crecimiento
      growth: {
        revenueGrowth: safeFmt(fd.revenueGrowth ? fd.revenueGrowth * 100 : null),
        earningsGrowth: safeFmt(fd.earningsGrowth ? fd.earningsGrowth * 100 : null),
        revenuePerShare: safeFmt(fd.revenuePerShare),
        earningsPerShare: safeFmt(ks.trailingEps),
        forwardEPS: safeFmt(ks.forwardEps),
        bookValuePerShare: safeFmt(ks.bookValue),
        // Estimaciones analistas
        nextYearEPS: extractAnalystEPS(et, 'yearly', 0),
        currentYearEPS: extractAnalystEPS(et, 'yearly', 1),
      },

      // Salud financiera
      health: {
        totalDebt: fmtBig(fd.totalDebt),
        totalCash: fmtBig(fd.totalCash),
        debtToEquity: safeFmt(fd.debtToEquity),
        currentRatio: safeFmt(fd.currentRatio),
        quickRatio: safeFmt(fd.quickRatio),
        freeCashflow: fmtBig(fd.freeCashflow),
        operatingCashflow: fmtBig(fd.operatingCashflow),
      },

      // Dividendos
      dividends: {
        dividendYield: safeFmt(sd.dividendYield ? sd.dividendYield * 100 : null),
        dividendRate: safeFmt(sd.dividendRate),
        payoutRatio: safeFmt(sd.payoutRatio ? sd.payoutRatio * 100 : null),
        exDividendDate: sd.exDividendDate?.fmt || null,
        fiveYearAvgDivYield: safeFmt(sd.fiveYearAvgDividendYield),
      },

      // Info adicional
      info: {
        beta: safeFmt(sd.beta),
        shortRatio: safeFmt(ks.shortRatio),
        sharesOutstanding: fmtBig(ks.sharesOutstanding),
        float: fmtBig(ks.floatShares),
        insidersPercent: safeFmt(ks.heldPercentInsiders ? ks.heldPercentInsiders * 100 : null),
        institutionsPercent: safeFmt(ks.heldPercentInstitutions ? ks.heldPercentInstitutions * 100 : null),
        fiftyTwoWeekHigh: safeFmt(sd.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: safeFmt(sd.fiftyTwoWeekLow),
        fiftyDayAverage: safeFmt(sd.fiftyDayAverage),
        twoHundredDayAverage: safeFmt(sd.twoHundredDayAverage),
      },

      // Recomendación analistas
      analystConsensus: {
        targetMeanPrice: safeFmt(fd.targetMeanPrice),
        targetHighPrice: safeFmt(fd.targetHighPrice),
        targetLowPrice: safeFmt(fd.targetLowPrice),
        numberOfAnalystOpinions: safeFmt(fd.numberOfAnalystOpinions),
        recommendationMean: safeFmt(fd.recommendationMean),
        recommendationKey: fd.recommendationKey || null,
      },

      // Calendario de earnings y dividendos
      calendar: {
        earningsDates: (() => {
          const dates = ce.earnings?.earningsDate;
          if (!Array.isArray(dates) || dates.length === 0) return [];
          return dates
            .map(d => d?.raw ? new Date(d.raw * 1000).toISOString().split('T')[0] : d?.fmt || null)
            .filter(Boolean);
        })(),
        earningsAvg:  ce.earnings?.earningsAverage?.fmt || null,
        earningsLow:  ce.earnings?.earningsLow?.fmt || null,
        earningsHigh: ce.earnings?.earningsHigh?.fmt || null,
        revenueAvg:   ce.earnings?.revenueAverage?.fmt || null,
        exDividendDate: ce.exDividendDate?.fmt || sd.exDividendDate?.fmt || null,
        dividendDate:   ce.dividendDate?.fmt || null,
      },
    };

    // Señal fundamental compuesta
    fundamentals.signal = computeFundamentalSignal(fundamentals);

    await setCachedFundamentals(symbol, fundamentals);
    return fundamentals;
  } catch (err) {
    console.warn(`Fundamentals failed for ${symbol}:`, err.message);
    return buildEmptyFundamentals(symbol);
  }
}

function extractAnalystEPS(earningsTrend, period, index) {
  try {
    const trends = earningsTrend?.trend || [];
    const target = trends.find(t => t.period === (index === 0 ? '+1y' : '0y'));
    return safeFmt(target?.earningsEstimate?.avg);
  } catch {
    return null;
  }
}

function buildEmptyFundamentals(symbol) {
  return {
    symbol,
    generatedAt: new Date().toISOString(),
    unavailable: true,
    valuation: {}, profitability: {}, growth: {}, health: {}, dividends: {}, info: {}, analystConsensus: {},
    signal: { label: 'N/A', color: '#888', score: 50, reason: 'Datos fundamentales no disponibles' },
  };
}

/**
 * Genera una señal fundamental compuesta (1-100)
 */
function computeFundamentalSignal(f) {
  const scores = [];
  const reasons = [];

  // P/E razonable (bajo es mejor, muy bajo puede ser trampa)
  const pe = f.valuation.trailingPE;
  if (pe !== null) {
    const peScore = pe < 0 ? 20 : pe < 15 ? 80 : pe < 25 ? 65 : pe < 40 ? 45 : 20;
    scores.push({ score: peScore, weight: 0.20 });
    if (peScore > 60) reasons.push(`P/E atractivo (${pe.toFixed(1)}x)`);
    else if (peScore < 40) reasons.push(`P/E elevado (${pe.toFixed(1)}x)`);
  }

  // ROE — rentabilidad para accionistas
  const roe = f.profitability.returnOnEquity;
  if (roe !== null) {
    const roeScore = roe < 0 ? 15 : roe < 5 ? 40 : roe < 15 ? 65 : roe < 25 ? 80 : 90;
    scores.push({ score: roeScore, weight: 0.20 });
    if (roe > 15) reasons.push(`ROE sólido (${roe.toFixed(1)}%)`);
  }

  // Margen neto
  const margin = f.profitability.profitMargins;
  if (margin !== null) {
    const marginScore = margin < 0 ? 10 : margin < 5 ? 40 : margin < 15 ? 65 : margin < 25 ? 80 : 90;
    scores.push({ score: marginScore, weight: 0.15 });
    if (margin > 15) reasons.push(`Márgenes netos altos (${margin.toFixed(1)}%)`);
  }

  // Crecimiento de beneficios
  const eg = f.growth.earningsGrowth;
  if (eg !== null) {
    const egScore = eg < -20 ? 10 : eg < 0 ? 30 : eg < 10 ? 55 : eg < 25 ? 75 : 90;
    scores.push({ score: egScore, weight: 0.20 });
    if (eg > 10) reasons.push(`Crecimiento BPA positivo (${eg.toFixed(1)}%)`);
  }

  // Deuda/Equity
  const de = f.health.debtToEquity;
  if (de !== null) {
    const deScore = de < 30 ? 85 : de < 80 ? 65 : de < 150 ? 45 : de < 300 ? 25 : 10;
    scores.push({ score: deScore, weight: 0.15 });
    if (de > 150) reasons.push(`Deuda elevada (D/E ${de.toFixed(0)}%)`);
  }

  // Recomendación analistas
  const recKey = f.analystConsensus.recommendationKey;
  if (recKey) {
    const recMap = { 'strong_buy': 90, 'buy': 75, 'hold': 50, 'underperform': 30, 'sell': 15 };
    const recScore = recMap[recKey] || 50;
    scores.push({ score: recScore, weight: 0.10 });
    if (recScore > 70) reasons.push(`Analistas: ${recKey.replace('_', ' ').toUpperCase()}`);
  }

  if (scores.length === 0) {
    return { label: 'N/A', color: '#888', score: 50, reason: 'Datos insuficientes' };
  }

  const totalWeight = scores.reduce((s, x) => s + x.weight, 0);
  const compositeScore = Math.round(
    scores.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight
  );

  const label = compositeScore >= 70 ? 'FUERTE' : compositeScore >= 55 ? 'POSITIVO' : compositeScore >= 40 ? 'NEUTRO' : 'DÉBIL';
  const color = compositeScore >= 70 ? '#10B981' : compositeScore >= 55 ? '#E8C547' : compositeScore >= 40 ? '#9A7B2C' : '#EF4444';

  return {
    label,
    color,
    score: compositeScore,
    reason: reasons.slice(0, 3).join(' · ') || 'Análisis fundamental disponible',
  };
}

/**
 * Renderiza la tarjeta de fundamentales (HTML string)
 */
export function renderFundamentalsCard(f) {
  if (!f || f.unavailable) {
    return '<p class="context-unavailable">Fundamentales no disponibles para este símbolo.</p>';
  }
  const v = f.valuation || {};
  const p = f.profitability || {};
  const g = f.growth || {};
  const h = f.health || {};
  const d = f.dividends || {};
  const i = f.info || {};
  const ac = f.analystConsensus || {};
  const sig = f.signal || {};
  const sigColors = { FUERTE: '#10B981', POSITIVO: '#E8C547', NEUTRO: '#9A7B2C', DÉBIL: '#EF4444' };
  const sigColor = sigColors[sig.label] || '#888';
  const fv = (val, suffix = '') => (val != null ? `${val}${suffix}` : '—');

  return `
    <div class="fundamentals-card">
      <div class="fund-signal-row">
        <span class="fund-signal-badge" style="background:${sigColor}">${sig.label ?? 'N/A'}</span>
        <span class="fund-signal-score">Score ${sig.score ?? '—'}</span>
        <span class="fund-signal-reason">${sig.reason ?? ''}</span>
      </div>
      <div class="fund-grid">
        <div class="fund-section">
          <h5>Valoración</h5>
          <div class="fund-row"><span>P/E Trailing</span><strong>${fv(v.trailingPE, 'x')}</strong></div>
          <div class="fund-row"><span>P/E Forward</span><strong>${fv(v.forwardPE, 'x')}</strong></div>
          <div class="fund-row"><span>PEG</span><strong>${fv(v.pegRatio)}</strong></div>
          <div class="fund-row"><span>P/B</span><strong>${fv(v.priceToBook, 'x')}</strong></div>
          <div class="fund-row"><span>EV/EBITDA</span><strong>${fv(v.evToEbitda, 'x')}</strong></div>
          <div class="fund-row"><span>Cap. Mercado</span><strong>${fv(v.marketCap)}</strong></div>
        </div>
        <div class="fund-section">
          <h5>Rentabilidad</h5>
          <div class="fund-row"><span>ROE</span><strong>${fv(p.returnOnEquity, '%')}</strong></div>
          <div class="fund-row"><span>ROA</span><strong>${fv(p.returnOnAssets, '%')}</strong></div>
          <div class="fund-row"><span>Margen Neto</span><strong>${fv(p.profitMargins, '%')}</strong></div>
          <div class="fund-row"><span>Margen Bruto</span><strong>${fv(p.grossMargins, '%')}</strong></div>
          <div class="fund-row"><span>Margen Op.</span><strong>${fv(p.operatingMargins, '%')}</strong></div>
          <div class="fund-row"><span>EBITDA</span><strong>${fv(p.ebitda)}</strong></div>
        </div>
        <div class="fund-section">
          <h5>Crecimiento</h5>
          <div class="fund-row"><span>Crec. BPA</span><strong>${fv(g.earningsGrowth, '%')}</strong></div>
          <div class="fund-row"><span>Crec. Ingresos</span><strong>${fv(g.revenueGrowth, '%')}</strong></div>
          <div class="fund-row"><span>BPA Trailing</span><strong>${fv(g.earningsPerShare)}</strong></div>
          <div class="fund-row"><span>BPA Forward</span><strong>${fv(g.forwardEPS)}</strong></div>
        </div>
        <div class="fund-section">
          <h5>Salud Financiera</h5>
          <div class="fund-row"><span>Deuda/Equity</span><strong>${fv(h.debtToEquity)}</strong></div>
          <div class="fund-row"><span>Ratio Corriente</span><strong>${fv(h.currentRatio)}</strong></div>
          <div class="fund-row"><span>Caja Total</span><strong>${fv(h.totalCash)}</strong></div>
          <div class="fund-row"><span>Flujo Libre</span><strong>${fv(h.freeCashflow)}</strong></div>
        </div>
        <div class="fund-section">
          <h5>Dividendos &amp; Info</h5>
          <div class="fund-row"><span>Yield Div.</span><strong>${fv(d.dividendYield, '%')}</strong></div>
          <div class="fund-row"><span>Beta</span><strong>${fv(i.beta)}</strong></div>
          <div class="fund-row"><span>Máx 52 sem.</span><strong>${fv(i.fiftyTwoWeekHigh)}</strong></div>
          <div class="fund-row"><span>Mín 52 sem.</span><strong>${fv(i.fiftyTwoWeekLow)}</strong></div>
        </div>
        <div class="fund-section">
          <h5>Consenso Analistas</h5>
          <div class="fund-row"><span>Target Precio</span><strong>${fv(ac.targetMeanPrice)}</strong></div>
          <div class="fund-row"><span>Target Alto</span><strong>${fv(ac.targetHighPrice)}</strong></div>
          <div class="fund-row"><span>Target Bajo</span><strong>${fv(ac.targetLowPrice)}</strong></div>
          <div class="fund-row"><span>Recomendación</span><strong>${ac.recommendationKey?.toUpperCase() ?? '—'}</strong></div>
          <div class="fund-row"><span>Nº Analistas</span><strong>${fv(ac.numberOfAnalystOpinions)}</strong></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Formatea un valor fundamental para mostrar en UI
 */
export function fmtFundamental(val, suffix = '') {
  if (val === null || val === undefined) return 'N/D';
  return `${val}${suffix}`;
}
