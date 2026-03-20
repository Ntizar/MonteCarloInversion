/* ═══════════════════════════════════════════════════════════════════
   exporter.js — Exportación PDF (vía window.print) y CSV
   Monte Carlo Stock Simulator v3.5
   ═══════════════════════════════════════════════════════════════════ */

import { getCurrency } from './config.js';

// ── CSV Helpers ──────────────────────────────────────────────────

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCSVRow(values) {
  return values.map(escapeCSV).join(',');
}

function downloadBlob(filename, content, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType }); // BOM for Excel UTF-8 support
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── CSV Export ───────────────────────────────────────────────────

/**
 * Exporta los resultados de simulación como CSV
 */
export function exportSimulationCSV(symbol, results, metrics, backtest) {
  const lines = [];
  const ts = new Date().toISOString().slice(0, 10);

  // Header section
  lines.push('Monte Carlo Stock Simulator — Informe de Simulación');
  lines.push(`Símbolo;${symbol}`);
  lines.push(`Fecha;${ts}`);
  lines.push('');

  // Model summary
  lines.push('RESUMEN POR MODELO');
  lines.push(buildCSVRow([
    'Modelo', 'Precio Esperado', 'Retorno Esperado %', 'P(Subida) %',
    'VaR 95%', 'CVaR 95%', 'Max Drawdown Medio', 'Sharpe', 'Sortino', 'Señal', 'Score', 'Tiempo (ms)',
  ]));

  for (const [id, m] of Object.entries(metrics)) {
    const r = results[id] || {};
    const sig = generateSignalSimple(m);
    lines.push(buildCSVRow([
      r.model || id,
      m.expectedPrice?.toFixed(4) ?? '',
      m.expectedReturnPct?.toFixed(2) ?? '',
      (m.probUp != null ? (m.probUp * 100).toFixed(2) : ''),
      (m.VaR_95 != null ? (m.VaR_95 * 100).toFixed(2) : ''),
      (m.CVaR_95 != null ? (m.CVaR_95 * 100).toFixed(2) : ''),
      (m.mddMean != null ? (m.mddMean * 100).toFixed(2) : ''),
      m.sharpe?.toFixed(4) ?? '',
      m.sortino?.toFixed(4) ?? '',
      sig.signal,
      sig.score,
      r.timeMs ?? '',
    ]));
  }

  lines.push('');

  // Risk metrics detail
  lines.push('MÉTRICAS DE RIESGO DETALLADAS');
  lines.push(buildCSVRow([
    'Modelo',
    'VaR 90%', 'CVaR 90%',
    'VaR 95%', 'CVaR 95%',
    'VaR 99%', 'CVaR 99%',
    'IC 95% Inferior', 'IC 95% Superior',
    'IC 99% Inferior', 'IC 99% Superior',
    'P(Pérdida ≥10%)', 'P(Pérdida ≥20%)', 'P(Pérdida ≥30%)',
    'Vol 30d', 'Vol 60d', 'Vol 252d',
  ]));

  for (const [id, m] of Object.entries(metrics)) {
    const r = results[id] || {};
    lines.push(buildCSVRow([
      r.model || id,
      (m.VaR_90 != null ? (m.VaR_90 * 100).toFixed(2) : ''),
      (m.CVaR_90 != null ? (m.CVaR_90 * 100).toFixed(2) : ''),
      (m.VaR_95 != null ? (m.VaR_95 * 100).toFixed(2) : ''),
      (m.CVaR_95 != null ? (m.CVaR_95 * 100).toFixed(2) : ''),
      (m.VaR_99 != null ? (m.VaR_99 * 100).toFixed(2) : ''),
      (m.CVaR_99 != null ? (m.CVaR_99 * 100).toFixed(2) : ''),
      m.ci95Lower?.toFixed(4) ?? '',
      m.ci95Upper?.toFixed(4) ?? '',
      m.ci99Lower?.toFixed(4) ?? '',
      m.ci99Upper?.toFixed(4) ?? '',
      (m.probLoss10 != null ? (m.probLoss10 * 100).toFixed(2) : ''),
      (m.probLoss20 != null ? (m.probLoss20 * 100).toFixed(2) : ''),
      (m.probLoss30 != null ? (m.probLoss30 * 100).toFixed(2) : ''),
      (m.vol_30d != null ? (m.vol_30d * 100).toFixed(2) : ''),
      (m.vol_60d != null ? (m.vol_60d * 100).toFixed(2) : ''),
      (m.vol_252d != null ? (m.vol_252d * 100).toFixed(2) : ''),
    ]));
  }

  lines.push('');

  // Backtest summary
  if (backtest?.results) {
    lines.push('VALIDACIÓN HISTÓRICA');
    lines.push(buildCSVRow([
      'Modelo', 'Score', 'Veces mejor', 'Acierto Dirección %',
      'Error Medio %', 'Error Mediano %', 'Cobertura IC95 %',
      'Sesgo Medio %', 'Último Error %', 'Tiempo Medio (ms)',
    ]));

    for (const [id, bt] of Object.entries(backtest.results)) {
      const s = bt.summary || {};
      lines.push(buildCSVRow([
        bt.model || id,
        s.score ?? '',
        s.nCheckpoints ?? '',
        (s.directionAccuracy != null ? (s.directionAccuracy * 100).toFixed(1) : ''),
        s.meanAbsErrorPct?.toFixed(2) ?? '',
        s.medianAbsErrorPct?.toFixed(2) ?? '',
        (s.within95Rate != null ? (s.within95Rate * 100).toFixed(1) : ''),
        s.avgBiasPct?.toFixed(2) ?? '',
        s.latestAbsErrorPct?.toFixed(2) ?? '',
        s.avgTimeMs ?? '',
      ]));
    }
  }

  lines.push('');
  lines.push('Datos generados por Monte Carlo Stock Simulator v3.0');
  lines.push('Nota: Este informe no constituye asesoramiento financiero.');

  const csv = lines.join('\n');
  downloadBlob(`monte-carlo-${symbol}-${ts}.csv`, csv);
}

/**
 * Exporta el ranking del radar de mercado como CSV
 */
export function exportMarketRankingCSV(rankingItems, label = 'mercado') {
  const ts = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push('Monte Carlo Stock Simulator — Radar de Mercado');
  lines.push(`Universo;${label}`);
  lines.push(`Fecha;${ts}`);
  lines.push('');

  lines.push(buildCSVRow([
    '#', 'Símbolo', 'Nombre', 'Precio', 'Señal', 'Score',
    'P(Subida) %', 'Retorno Esperado %', 'VaR 95%',
    'P/E', 'ROE %', 'Margen Neto %',
    'Cap Bucket', 'Recomendación Analistas',
  ]));

  rankingItems.forEach((item, i) => {
    const f = item.fundamentals || {};
    lines.push(buildCSVRow([
      i + 1,
      item.symbol,
      item.name || '',
      item.currentPrice?.toFixed(2) ?? '',
      item.signal || '',
      item.score ?? '',
      (item.probUp != null ? (item.probUp * 100).toFixed(1) : ''),
      item.expectedReturn?.toFixed(2) ?? '',
      (item.var95 != null ? (item.var95 * 100).toFixed(1) : ''),
      f.valuation?.trailingPE?.toFixed(1) ?? '',
      f.profitability?.returnOnEquity?.toFixed(1) ?? '',
      f.profitability?.profitMargins?.toFixed(1) ?? '',
      f.valuation?.marketCap ?? '',
      f.analystConsensus?.recommendationKey ?? '',
    ]));
  });

  lines.push('');
  lines.push('Datos generados por Monte Carlo Stock Simulator v3.0');

  downloadBlob(`radar-mercado-${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${ts}.csv`, lines.join('\n'));
}

// ── PDF Export (window.print with print stylesheet) ──────────────

/**
 * Genera un informe HTML completo y abre el diálogo de impresión.
 * El informe está diseñado para ser legible en papel (blanco/negro o color).
 *
 * @param {string} symbol
 * @param {object} results      — map of modelId → simulation result
 * @param {object} metrics      — map of modelId → computed metrics
 * @param {object} backtest     — historical backtest object (may be null)
 * @param {object} fundamentals — fundamentals data (may be null)
 * @param {object} news         — news + sentiment data (may be null)
 * @param {object} macroData    — macro context data (may be null)
 * @param {object} technicals   — computed technicals object (may be null)
 * @param {object} optionsData  — options Put/Call data (may be null)
 * @param {object} insiders     — insider trading data (may be null)
 * @param {object} redditData   — Reddit sentiment data (may be null)
 */
export function exportSimulationPDF(symbol, results, metrics, backtest, fundamentals, news, macroData, technicals, optionsData, insiders, redditData) {
  const ts = new Date().toLocaleString('es-ES');
  const currency = getCurrency(symbol);

  // Guard: need at least metrics to generate a useful report
  if (!metrics || Object.keys(metrics).length === 0) {
    alert('Ejecuta la simulación antes de exportar el PDF.');
    return;
  }

  const modelIds = Object.keys(metrics);

  // ── Utility: build an HTML table ────────────────────────────────
  const table = (headers, rows) => `
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `;

  // ── Section 1: Signal summary ────────────────────────────────────
  const signalRows = modelIds.map(id => {
    const m = metrics[id];
    const r = results[id] || {};
    const sig = generateSignalSimple(m);
    const signalStyle = sig.signal === 'BUY'
      ? 'color:#0a7c3e;font-weight:bold'
      : sig.signal === 'SELL'
        ? 'color:#b91c1c;font-weight:bold'
        : 'color:#92400e;font-weight:bold';
    return [
      r.model || id,
      `${currency}${m.expectedPrice?.toFixed(2) ?? '?'}`,
      `${m.expectedReturnPct >= 0 ? '+' : ''}${m.expectedReturnPct?.toFixed(2) ?? '?'}%`,
      `${((m.probUp || 0) * 100).toFixed(1)}%`,
      `${m.sharpe?.toFixed(3) ?? '?'}`,
      `${m.sortino?.toFixed(3) ?? '?'}`,
      `<span style="${signalStyle}">${sig.signal}</span>`,
      sig.score,
    ];
  });

  // ── Section 2: Risk metrics ──────────────────────────────────────
  const riskRows = modelIds.map(id => {
    const m = metrics[id];
    const r = results[id] || {};
    return [
      r.model || id,
      `${((m.VaR_95 || 0) * 100).toFixed(2)}%`,
      `${((m.CVaR_95 || 0) * 100).toFixed(2)}%`,
      `${((m.VaR_99 || 0) * 100).toFixed(2)}%`,
      `${((m.CVaR_99 || 0) * 100).toFixed(2)}%`,
      `${((m.mddMean || 0) * 100).toFixed(2)}%`,
      `${((m.probLoss10 || 0) * 100).toFixed(1)}%`,
      `${((m.probLoss20 || 0) * 100).toFixed(1)}%`,
      `${((m.vol_30d || 0) * 100).toFixed(1)}%`,
      `${((m.vol_252d || 0) * 100).toFixed(1)}%`,
    ];
  });

  // ── Section 3: Backtest ──────────────────────────────────────────
  const btRows = backtest?.results ? Object.entries(backtest.results).map(([id, bt]) => {
    const s = bt.summary || {};
    return [
      bt.model || id,
      s.score ?? '?',
      `${((s.directionAccuracy || 0) * 100).toFixed(1)}%`,
      `${s.meanAbsErrorPct?.toFixed(2) ?? '?'}%`,
      `${s.medianAbsErrorPct?.toFixed(2) ?? '?'}%`,
      `${((s.within95Rate || 0) * 100).toFixed(1)}%`,
      s.nCheckpoints ?? '?',
    ];
  }) : [];

  // ── Section 4: Algorithm explanations ───────────────────────────
  const algorithmHTML = `
    <section>
      <h2>Explicación de los Modelos</h2>
      <div class="algo-grid">

        <div class="algo-card">
          <div class="algo-name">GBM — Geometric Brownian Motion</div>
          <div class="algo-eq">dS = μ·S·dt + σ·S·dW</div>
          <div class="algo-body">
            <span class="algo-label">Descripción:</span> Modelo estocástico clásico con drift μ y
            volatilidad σ constantes. Base de la fórmula de Black-Scholes.<br>
            <span class="algo-label">Ideal para:</span> Activos estables, comparativa base.<br>
            <span class="algo-label">Limitación:</span> No capta volatilidad variable ni colas gruesas.
          </div>
        </div>

        <div class="algo-card">
          <div class="algo-name">Heston — Volatilidad Estocástica</div>
          <div class="algo-eq">dv = κ(θ−v)dt + ξ√v·dW<sub>v</sub></div>
          <div class="algo-body">
            <span class="algo-label">Descripción:</span> La volatilidad sigue su propio proceso
            de reversión a la media. Capta la agrupación de volatilidad (clustering).<br>
            <span class="algo-label">Ideal para:</span> Mercados con episodios de alta/baja vol.<br>
            <span class="algo-label">Limitación:</span> Mayor coste computacional; parámetros difíciles de calibrar.
          </div>
        </div>

        <div class="algo-card">
          <div class="algo-name">Jump-Diffusion (Merton)</div>
          <div class="algo-eq">dS = μ·S·dt + σ·S·dW + J·dN</div>
          <div class="algo-body">
            <span class="algo-label">Descripción:</span> Añade saltos de Poisson al GBM para
            modelar eventos discretos (earnings, noticias, crisis).<br>
            <span class="algo-label">Ideal para:</span> Acciones con riesgo de salto elevado.<br>
            <span class="algo-label">Limitación:</span> Los parámetros de salto (λ, μ_J, σ_J) son difíciles de estimar.
          </div>
        </div>

        <div class="algo-card">
          <div class="algo-name">GARCH(1,1)</div>
          <div class="algo-eq">σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}</div>
          <div class="algo-body">
            <span class="algo-label">Descripción:</span> La varianza condicional hoy depende del
            shock de ayer y de la varianza de ayer. Modela heterocedasticidad.<br>
            <span class="algo-label">Ideal para:</span> Series con volatilidad variable en el tiempo.<br>
            <span class="algo-label">Limitación:</span> Requiere historia suficiente para calibración confiable.
          </div>
        </div>

        <div class="algo-card">
          <div class="algo-name">Bootstrap (No Paramétrico)</div>
          <div class="algo-eq">r_t ← muestra aleatoria de {r_históricos}</div>
          <div class="algo-body">
            <span class="algo-label">Descripción:</span> Remuestrea retornos históricos reales
            sin asumir ninguna distribución paramétrica.<br>
            <span class="algo-label">Ideal para:</span> Cuando no se quiere imponer supuestos distribucionales.<br>
            <span class="algo-label">Limitación:</span> No puede generar escenarios peores que los observados históricamente.
          </div>
        </div>

      </div>
    </section>
  `;

  // ── Section 5: Macro context ─────────────────────────────────────
  const macroHTML = macroData ? (() => {
    const macro = macroData;
    const ind = macro.indicators || {};
    const fedRate = ind.fed_rate?.value;
    const inflation = ind.inflation?.value;
    const vix = ind.vix?.value;
    const t10y = ind.treasury_10y?.value;
    const t2y = ind.treasury_2y?.value;
    const yieldSpread = ind.yield_spread?.value;
    const invertedCurve = ind.yield_spread?.inverted;
    const ycLabel = yieldSpread != null
      ? (invertedCurve ? 'Invertida (riesgo recesión)' : parseFloat(yieldSpread) < 0.5 ? 'Plana' : 'Normal')
      : '—';
    const macroSig = macro.signal || '';
    const sigStyle = macroSig === 'FAVORABLE' ? 'color:#0a7c3e;font-weight:bold'
      : macroSig === 'ADVERSO' ? 'color:#b91c1c;font-weight:bold'
      : 'color:#92400e;font-weight:bold';
    return `
    <section>
      <h2>Contexto Macro</h2>
      <p style="font-size:10px;color:#333;margin-bottom:8px">
        ${macroSig === 'FAVORABLE'
          ? `El entorno macroeconómico es <strong style="color:#0a7c3e">favorable</strong> para activos de riesgo (score ${macro.score ?? '—'}/100). Tipos y volatilidad en niveles que históricamente sostienen las valoraciones bursátiles.`
          : macroSig === 'ADVERSO'
            ? `El entorno macro es <strong style="color:#b91c1c">adverso</strong> para activos de riesgo (score ${macro.score ?? '—'}/100). ${invertedCurve ? 'La curva de tipos invertida es una señal recesiva clásica. ' : ''}Tipos elevados o VIX alto pueden presionar los múltiplos de valoración de <strong>${symbol}</strong>.`
            : `El contexto macro es <strong style="color:#92400e">neutro</strong> (score ${macro.score ?? '—'}/100). ${macro.message ?? 'Ni viento de cola ni de cara para la renta variable en este momento.'}`
        }
      </p>
      <div class="macro-grid">
        <div class="macro-item">
          <span class="macro-label">Tipo FED</span>
          <span class="macro-val">${fedRate != null ? parseFloat(fedRate).toFixed(2) + '%' : '—'}</span>
        </div>
        <div class="macro-item">
          <span class="macro-label">Inflación (CPI)</span>
          <span class="macro-val">${inflation != null ? parseFloat(inflation).toFixed(2) + '%' : '—'}</span>
        </div>
        <div class="macro-item">
          <span class="macro-label">VIX</span>
          <span class="macro-val">${vix != null ? parseFloat(vix).toFixed(1) : '—'}</span>
        </div>
        <div class="macro-item">
          <span class="macro-label">Bono 10Y</span>
          <span class="macro-val">${t10y != null ? parseFloat(t10y).toFixed(2) + '%' : '—'}</span>
        </div>
        <div class="macro-item">
          <span class="macro-label">Curva 2s10s</span>
          <span class="macro-val">${yieldSpread != null ? parseFloat(yieldSpread).toFixed(2) + '%' : '—'}</span>
        </div>
        <div class="macro-item">
          <span class="macro-label">Tipo Curva</span>
          <span class="macro-val">${ycLabel}</span>
        </div>
        <div class="macro-item">
          <span class="macro-label">Señal Macro</span>
          <span class="macro-val" style="${sigStyle}">${macroSig || '—'}</span>
        </div>
        <div class="macro-item">
          <span class="macro-label">Score Macro</span>
          <span class="macro-val">${macro.score ?? '—'}</span>
        </div>
      </div>
      ${macro.message ? `<p style="margin-top:8px;font-size:10px;color:#555">${macro.message}</p>` : ''}
    </section>
  `;
  })() : '';

  // ── Section 6: Fundamentals ──────────────────────────────────────
  const fundHTML = fundamentals && !fundamentals.unavailable ? (() => {
    const f = fundamentals;
    const pe = f.valuation?.trailingPE;
    const roe = f.profitability?.returnOnEquity;
    const margin = f.profitability?.profitMargins;
    const rec = f.analystConsensus?.recommendationKey?.toUpperCase();
    const targetMean = f.analystConsensus?.targetMeanPrice;
    const peInterp = pe != null
      ? (pe < 12 ? `P/E ${pe.toFixed(1)}x — valoración baja, posible oportunidad de valor o riesgo estructural pendiente de confirmar.`
         : pe < 20 ? `P/E ${pe.toFixed(1)}x — rango razonable para una empresa madura.`
         : pe < 35 ? `P/E ${pe.toFixed(1)}x — valoración de crecimiento; el mercado descuenta expansión de beneficios.`
         : `P/E ${pe.toFixed(1)}x — valoración muy exigente; cualquier decepcción en resultados puede provocar correcciones severas.`)
      : '';
    const roeInterp = roe != null
      ? ` ROE ${roe.toFixed(1)}% — ${roe > 20 ? 'excelente rentabilidad sobre fondos propios' : roe > 10 ? 'rentabilidad razonable' : 'rentabilidad reducida; puede indicar uso ineficiente del capital'}.`
      : '';
    const marginInterp = margin != null
      ? ` Margen neto ${margin.toFixed(1)}% — ${margin > 20 ? 'márgenes elevados típicos de empresas con foso competitivo' : margin > 5 ? 'márgenes normales del sector' : 'márgenes ajustados que dejan poco margen de error operativo'}.`
      : '';
    const upside = targetMean != null
      ? ` Target analistas: ${currency}${targetMean.toFixed(2)} (${rec ?? '—'}).`
      : '';
    return `
    <section>
      <h2>Fundamentales — ${symbol}</h2>
      <p style="font-size:10px;color:#333;margin-bottom:8px">${peInterp}${roeInterp}${marginInterp}${upside}</p>
      <div class="fund-grid">
        <div><strong>P/E Trailing</strong>${f.valuation?.trailingPE?.toFixed(1) ?? '—'}</div>
        <div><strong>P/E Forward</strong>${f.valuation?.forwardPE?.toFixed(1) ?? '—'}</div>
        <div><strong>ROE</strong>${f.profitability?.returnOnEquity?.toFixed(1) ?? '—'}%</div>
        <div><strong>Margen Neto</strong>${f.profitability?.profitMargins?.toFixed(1) ?? '—'}%</div>
        <div><strong>Crec. BPA</strong>${f.growth?.earningsGrowth?.toFixed(1) ?? '—'}%</div>
        <div><strong>Deuda/Equity</strong>${f.health?.debtToEquity?.toFixed(1) ?? '—'}</div>
        <div><strong>Target Analistas</strong>${currency}${f.analystConsensus?.targetMeanPrice?.toFixed(2) ?? '—'}</div>
        <div><strong>Recomendación</strong>${f.analystConsensus?.recommendationKey?.toUpperCase() ?? '—'}</div>
        <div><strong>Cap. Mercado</strong>${f.valuation?.marketCap ?? '—'}</div>
        <div><strong>Beta</strong>${f.info?.beta?.toFixed(2) ?? '—'}</div>
      </div>
    </section>
  `;
  })() : '';

  // ── Section 7: News / Sentiment ──────────────────────────────────
  const newsHTML = news?.news?.length ? `
    <section>
      <h2>Noticias Recientes y Sentimiento</h2>
      <p class="sentiment-line">Sentimiento general: <strong>${news.sentimentIndex?.label ?? '—'}</strong>
        &nbsp;·&nbsp; Score: <strong>${news.sentimentIndex?.score ?? '—'}</strong></p>
      <ul class="news-list">
        ${news.news.slice(0, 8).map(n => `
          <li>
            <span class="news-date">${n.date ? new Date(n.date).toLocaleDateString('es-ES') : '—'}</span>
            <span class="news-title">${n.title}</span>
            <span class="news-sentiment" style="color:${n.sentiment?.color ?? '#555'}">${n.sentiment?.label ?? ''}</span>
          </li>
        `).join('')}
      </ul>
    </section>
  ` : '';

  // ── Section 8: Technical Analysis ───────────────────────────────
  const techHTML = technicals ? (() => {
    const t = technicals;
    const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : '—';
    const pct  = (v, d = 1) => v != null ? `${Number(v).toFixed(d)}%` : '—';

    const trendStyle = t.trendColor
      ? `color:${t.trendColor};font-weight:bold`
      : '';

    const rsiStyle = t.rsi14 != null
      ? `color:${t.rsi14 < 30 ? '#0a7c3e' : t.rsi14 > 70 ? '#b91c1c' : '#92400e'}`
      : '';

    const macdHistStyle = (t.macd?.histogram ?? 0) >= 0
      ? 'color:#0a7c3e'
      : 'color:#b91c1c';

    const macdCruce = t.macd?.histogram != null && t.macd?.histPrev != null
      ? (t.macd.histogram > 0 && t.macd.histPrev <= 0
          ? '↑ Alcista'
          : t.macd.histogram < 0 && t.macd.histPrev >= 0
            ? '↓ Bajista'
            : '—')
      : '—';

    const crossLabel = t.crossRecent
      ? (t.goldenCross ? 'Golden Cross reciente' : 'Death Cross reciente')
      : (t.goldenCross ? 'MA50 > MA200' : 'MA50 < MA200');

    return `
    <section>
      <h2>Análisis Técnico — ${symbol}</h2>
      <p style="font-size:10px;color:#333;margin-bottom:8px">
        ${t.score >= 70
          ? `El cuadro técnico de <strong>${symbol}</strong> es <strong style="color:#0a7c3e">alcista</strong> (score ${t.score}/100). ${t.goldenCross ? 'MA50 por encima de MA200 (Golden Cross). ' : ''}${t.rsi14 != null && t.rsi14 < 50 ? '' : t.rsi14 != null && t.rsi14 > 70 ? 'RSI en zona de sobrecompra — vigilar posible corrección. ' : ''}Tendencia: <strong>${t.trend}</strong>.`
          : t.score <= 35
            ? `El cuadro técnico de <strong>${symbol}</strong> muestra <strong style="color:#b91c1c">debilidad</strong> (score ${t.score}/100). ${!t.goldenCross ? 'MA50 por debajo de MA200 (Death Cross). ' : ''}${t.rsi14 != null && t.rsi14 < 30 ? 'RSI en sobreventa — posible rebote técnico. ' : ''}Tendencia: <strong>${t.trend}</strong>.`
            : `Técnicos de <strong>${symbol}</strong> en zona <strong style="color:#92400e">neutral</strong> (score ${t.score}/100). No hay señales técnicas dominantes claras. Tendencia: <strong>${t.trend}</strong>.`
        }
      </p>
      <div class="tech-pdf-header">
        <span class="tech-pdf-badge" style="background:${t.trendColor ?? '#555'};color:#fff;padding:3px 10px;border-radius:3px;font-weight:bold">${t.trend ?? '—'}</span>
        &nbsp; Score técnico: <strong>${t.score ?? '—'}/100</strong>
        &nbsp; · &nbsp; Bull: ${t.bullPoints ?? 0} pts &nbsp; Bear: ${t.bearPoints ?? 0} pts
      </div>
      <div class="tech-pdf-grid">
        <div class="tech-pdf-block">
          <div class="tech-pdf-block-title">Medias Móviles</div>
          <table>
            <tbody>
              <tr><td>MA 20</td><td>${fmt(t.ma20)}</td></tr>
              <tr><td>MA 50</td><td>${fmt(t.ma50)}</td></tr>
              <tr><td>MA 200</td><td>${fmt(t.ma200)}</td></tr>
              <tr><td>Relación MA</td><td style="${t.goldenCross ? 'color:#0a7c3e' : 'color:#b91c1c'}">${crossLabel}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="tech-pdf-block">
          <div class="tech-pdf-block-title">RSI (14)</div>
          <table>
            <tbody>
              <tr><td>RSI</td><td style="${rsiStyle}">${fmt(t.rsi14, 1)}</td></tr>
              <tr><td>Zona</td><td>${t.rsiZone ?? '—'}</td></tr>
            </tbody>
          </table>
          <div class="tech-pdf-block-title" style="margin-top:8px">MACD (12,26,9)</div>
          <table>
            <tbody>
              <tr><td>Línea</td><td>${fmt(t.macd?.value, 3)}</td></tr>
              <tr><td>Señal</td><td>${fmt(t.macd?.signal, 3)}</td></tr>
              <tr><td>Histograma</td><td style="${macdHistStyle}">${fmt(t.macd?.histogram, 3)}</td></tr>
              <tr><td>Cruce</td><td>${macdCruce}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="tech-pdf-block">
          <div class="tech-pdf-block-title">Bollinger (20, 2σ)</div>
          <table>
            <tbody>
              <tr><td>Superior</td><td>${fmt(t.bollinger?.upper)}</td></tr>
              <tr><td>Media</td><td>${fmt(t.bollinger?.middle)}</td></tr>
              <tr><td>Inferior</td><td>${fmt(t.bollinger?.lower)}</td></tr>
              <tr><td>Posición %B</td><td>${t.bollinger?.position != null ? t.bollinger.position.toFixed(0) + '%' : '—'}</td></tr>
              <tr><td>Anchura</td><td>${pct(t.bollinger?.width)}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="tech-pdf-block">
          <div class="tech-pdf-block-title">Soporte & Resistencia (52s)</div>
          <table>
            <tbody>
              <tr><td>Resistencia</td><td style="color:#b91c1c">${fmt(t.resistance)} <small>(-${t.distResistance}%)</small></td></tr>
              <tr><td>Precio actual</td><td><strong>${fmt(t.current)}</strong></td></tr>
              <tr><td>Soporte</td><td style="color:#0a7c3e">${fmt(t.support)} <small>(+${t.distSupport}%)</small></td></tr>
            </tbody>
          </table>
          <div class="tech-pdf-block-title" style="margin-top:8px">Volatilidad & Volumen</div>
          <table>
            <tbody>
              <tr><td>ATR (14)</td><td>${fmt(t.atr)}</td></tr>
              <tr><td>ATR %</td><td>${pct(t.atrPct)}</td></tr>
              <tr><td>Volumen</td><td>${t.volTrend ?? '—'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `})() : '';

  // ── Section 9: Options ───────────────────────────────────────────
  const optionsHTML = optionsData ? (() => {
    const o = optionsData;
    const fmt = v => v != null ? v.toLocaleString('es-ES') : '—';
    const fmtR = v => v != null ? v.toFixed(3) : '—';
    const sentStyle = o.sentimentColor
      ? `background:${o.sentimentColor};color:#fff;padding:3px 10px;border-radius:3px;font-weight:bold`
      : '';
    return `
    <section>
      <h2>Opciones — Put/Call Ratio — ${symbol}</h2>
      <p style="font-size:10px;color:#333;margin-bottom:8px">
        ${o.pcRatioVol != null
          ? (o.pcRatioVol < 0.7
              ? `P/C Vol ${o.pcRatioVol.toFixed(2)}: <strong style="color:#0a7c3e">sesgo alcista</strong>. El mercado de opciones posiciona más calls que puts — los participantes institucionales apuestan mayoritariamente al alza en <strong>${symbol}</strong>.`
              : o.pcRatioVol > 1.2
                ? `P/C Vol ${o.pcRatioVol.toFixed(2)}: <strong style="color:#b91c1c">cobertura bajista o precaución</strong>. El predominio de puts refleja expectativas de caída o cobertura de posiciones largas sobre <strong>${symbol}</strong>.`
                : `P/C Vol ${o.pcRatioVol.toFixed(2)}: mercado de opciones <strong style="color:#92400e">equilibrado</strong>. Sin sesgo direccional claro en <strong>${symbol}</strong>.`)
          : `Datos de opciones disponibles para <strong>${symbol}</strong>.`
        }
        ${o.impliedVolatility != null ? ` IV implícita ATM: <strong>${o.impliedVolatility}%</strong> — ${parseFloat(o.impliedVolatility) > 40 ? 'volatilidad implícita elevada; las opciones están caras, lo que puede indicar incertidumbre sobre un evento próximo.' : parseFloat(o.impliedVolatility) < 15 ? 'baja volatilidad implícita; mercado complaciente.' : 'volatilidad implícita en rango normal.'}` : ''}
      </p>
      <div class="options-pdf-header">
        <span style="${sentStyle}">${o.sentiment ?? '—'}</span>
        &nbsp; Próx. vencimiento: <strong>${o.nextExpiration ?? '—'}</strong>
        &nbsp; · &nbsp; ${o.expirations?.length ?? 0} vencimientos disponibles
      </div>
      <div class="options-pdf-grid">
        <div class="options-pdf-block">
          <div class="tech-pdf-block-title">Volumen</div>
          <table>
            <tbody>
              <tr><td>Calls</td><td style="color:#0a7c3e">${fmt(o.callVolume)}</td></tr>
              <tr><td>Puts</td><td style="color:#b91c1c">${fmt(o.putVolume)}</td></tr>
              <tr><td>Total</td><td>${fmt(o.totalVolume)}</td></tr>
              <tr><td>P/C Ratio (vol.)</td><td><strong>${fmtR(o.pcRatioVol)}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div class="options-pdf-block">
          <div class="tech-pdf-block-title">Open Interest</div>
          <table>
            <tbody>
              <tr><td>Calls OI</td><td style="color:#0a7c3e">${fmt(o.callOI)}</td></tr>
              <tr><td>Puts OI</td><td style="color:#b91c1c">${fmt(o.putOI)}</td></tr>
              <tr><td>Total OI</td><td>${fmt(o.totalOI)}</td></tr>
              <tr><td>P/C Ratio (OI)</td><td><strong>${fmtR(o.pcRatioOI)}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div class="options-pdf-block">
          <div class="tech-pdf-block-title">Volatilidad Implícita</div>
          <table>
            <tbody>
              <tr><td>IV promedio ATM</td><td><strong>${o.impliedVolatility != null ? o.impliedVolatility + '%' : '—'}</strong></td></tr>
              <tr><td>Contratos calls</td><td>${o.callsCount ?? '—'}</td></tr>
              <tr><td>Contratos puts</td><td>${o.putsCount ?? '—'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <p style="font-size:9px;color:#888;margin-top:6px">P/C Ratio &lt; 0.7 = optimismo institucional &nbsp;·&nbsp; &gt; 1.0 = precaución &nbsp;·&nbsp; &gt; 1.5 = pesimismo</p>
    </section>
  `})() : '';

  // ── Section 10: Insider Trading ──────────────────────────────────
  const insidersHTML = (() => {
    const insidersPct = fundamentals?.info?.insidersPercent ?? null;
    const instPct     = fundamentals?.info?.institutionsPercent ?? null;
    const ownershipRow = (insidersPct != null || instPct != null)
      ? `<tr>
          ${insidersPct != null ? `<td colspan="3">Propiedad insiders: <strong>${Number(insidersPct).toFixed(2)}%</strong></td>` : '<td colspan="3">—</td>'}
          ${instPct != null ? `<td colspan="3">Propiedad institucional: <strong>${Number(instPct).toFixed(2)}%</strong></td>` : '<td colspan="3">—</td>'}
         </tr>`
      : '';

    if (!insiders?.transactions?.length) {
      if (!ownershipRow) return '';
      return `
      <section>
        <h2>Insider Trading & Propiedad</h2>
        <table><tbody>${ownershipRow}</tbody></table>
        <p style="font-size:9px;color:#888">No se encontraron filings Form 4 recientes en SEC EDGAR (puede que sea un activo no-USA)</p>
      </section>`;
    }

    const timeAgo = (dateStr) => {
      if (!dateStr) return '';
      const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
      return `hace ${d}d`;
    };

    const rows = insiders.transactions.map(t => `
      <tr>
        <td>${t.insiderName ?? '—'}</td>
        <td>${t.filedDate ?? '—'} <small style="color:#888">${timeAgo(t.filedDate)}</small></td>
        <td>Form ${t.formType ?? '4'}</td>
      </tr>
    `).join('');

    return `
    <section>
      <h2>Insider Trading (SEC EDGAR — últimos 90 días)</h2>
      ${ownershipRow ? `<table><tbody>${ownershipRow}</tbody></table>` : ''}
      <table>
        <thead><tr><th>Insider</th><th>Fecha filing</th><th>Tipo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
  })();

  // ── Section 11: Reddit Sentiment ────────────────────────────────
  const redditHTML = (() => {
    if (!redditData || (redditData.mentions === 0 && !redditData.posts?.length)) {
      return '';
    }
    const r = redditData;
    const s = r.overallSentiment;
    const sentStyle = s?.color
      ? `color:${s.color};font-weight:bold`
      : 'font-weight:bold';
    const interp = s?.label === 'Muy Positivo' || s?.label === 'Positivo'
      ? `El sentimiento retail en Reddit es <strong style="color:#0a7c3e">${s.label}</strong> para <strong>${symbol}</strong> (${r.mentions} menciones). El entusiasmo de la comunidad puede amplificar movimientos alcistas, aunque también introduce volatilidad especulativa a corto plazo.`
      : s?.label === 'Negativo' || s?.label === 'Muy Negativo'
        ? `El sentimiento en Reddit es <strong style="color:#b91c1c">${s.label}</strong> para <strong>${symbol}</strong> (${r.mentions} menciones). La presión vendedora del retail puede exacerbar correcciones; o bien puede ser una señal contraria de capitulación.`
        : `Sentimiento Reddit <strong style="color:#92400e">${s?.label ?? 'neutral'}</strong> para <strong>${symbol}</strong> con ${r.mentions} menciones. Sin momentum especulativo notable.`;

    const topPosts = (r.posts || []).slice(0, 5);
    const postRows = topPosts.map(p => `
      <tr>
        <td>${p.subreddit ?? '—'}</td>
        <td>${p.title ? p.title.slice(0, 80) + (p.title.length > 80 ? '…' : '') : '—'}</td>
        <td style="color:${p.sentiment?.color ?? '#555'}">${p.sentiment?.label ?? '—'}</td>
        <td>${p.score?.toLocaleString('es-ES') ?? '—'}</td>
        <td>${p.created ? new Date(p.created * 1000).toLocaleDateString('es-ES') : '—'}</td>
      </tr>
    `).join('');

    return `
    <section>
      <h2>Sentimiento Reddit — ${symbol}</h2>
      <p style="font-size:10px;color:#333;margin-bottom:8px">${interp}</p>
      <div style="display:flex;gap:16px;margin-bottom:10px;font-size:10px">
        <span>Menciones totales: <strong>${r.mentions}</strong></span>
        <span>Sentimiento general: <strong style="${sentStyle}">${s?.label ?? '—'}</strong></span>
        ${s?.score != null ? `<span>Score: <strong>${s.score.toFixed(2)}</strong></span>` : ''}
      </div>
      ${topPosts.length > 0 ? `
      <table>
        <thead><tr><th>Subreddit</th><th>Título</th><th>Sentimiento</th><th>Votos</th><th>Fecha</th></tr></thead>
        <tbody>${postRows}</tbody>
      </table>` : ''}
    </section>
  `;
  })();

  // ── Assemble full HTML document ──────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe Monte Carlo — ${symbol}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #111; background: #fff; padding: 24px 28px; }
  h1 { font-size: 22px; margin-bottom: 2px; }
  h2 { font-size: 13px; background: #1a1a1a; color: #f0d060; padding: 5px 8px; margin: 20px 0 8px; letter-spacing: .5px; }
  .meta { color: #555; font-size: 10px; margin-bottom: 18px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  th { background: #2a2a2a; color: #f0d060; padding: 4px 6px; text-align: left; font-size: 9px; text-transform: uppercase; }
  td { padding: 3px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:nth-child(even) td { background: #f8f8f6; }

  /* Fundamentals grid */
  .fund-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 4px; }
  .fund-grid div { background: #f5f5f5; padding: 6px 8px; border-radius: 3px; border-left: 3px solid #c9a227; }
  .fund-grid strong { display: block; font-size: 9px; color: #888; margin-bottom: 2px; text-transform: uppercase; }

  /* Macro grid */
  .macro-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 4px; }
  .macro-item { background: #f5f5f5; padding: 6px 8px; border-radius: 3px; border-left: 3px solid #1a1a1a; text-align: center; }
  .macro-label { display: block; font-size: 9px; color: #888; text-transform: uppercase; margin-bottom: 3px; }
  .macro-val { display: block; font-size: 12px; font-weight: bold; }

  /* Algorithm cards */
  .algo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 4px; }
  .algo-card { background: #f9f9f7; border: 1px solid #e0d9b5; border-radius: 4px; padding: 8px 10px; }
  .algo-name { font-weight: bold; font-size: 10px; margin-bottom: 3px; color: #1a1a1a; }
  .algo-eq { font-family: 'Courier New', monospace; font-size: 9px; background: #f0ead8; padding: 3px 6px; border-radius: 2px; margin-bottom: 4px; }
  .algo-body { font-size: 9px; color: #444; line-height: 1.5; }
  .algo-label { font-weight: bold; color: #1a1a1a; }

  /* News */
  .sentiment-line { margin-bottom: 6px; }
  .news-list { list-style: none; }
  .news-list li { padding: 4px 0; border-bottom: 1px solid #eee; display: flex; gap: 8px; align-items: flex-start; }
  .news-date { color: #888; white-space: nowrap; font-size: 9px; min-width: 65px; padding-top: 1px; }
  .news-title { flex: 1; }
  .news-sentiment { font-size: 9px; font-weight: bold; white-space: nowrap; padding-top: 1px; }

  /* Disclaimer */
  .disclaimer { margin-top: 24px; font-size: 9px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; line-height: 1.6; }

  /* Technical Analysis */
  .tech-pdf-header { margin-bottom: 10px; font-size: 11px; }
  .tech-pdf-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 4px; }
  .tech-pdf-block { background: #f9f9f7; border: 1px solid #e0d9b5; border-radius: 4px; padding: 8px 10px; }
  .tech-pdf-block-title { font-weight: bold; font-size: 9px; text-transform: uppercase; color: #555; margin-bottom: 4px; border-bottom: 1px solid #e0d9b5; padding-bottom: 2px; }

  /* Options */
  .options-pdf-header { margin-bottom: 10px; font-size: 11px; }
  .options-pdf-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 4px; }
  .options-pdf-block { background: #f9f9f7; border: 1px solid #e0d9b5; border-radius: 4px; padding: 8px 10px; }

  /* Print */
  @media print {
    body { padding: 8px 10px; }
    @page { margin: 1.2cm; size: A4; }
    h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .algo-card, .macro-item, .fund-grid div { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<h1>Monte Carlo Stock Simulator — ${symbol}</h1>
<div class="meta">Informe generado el ${ts} &nbsp;·&nbsp; Monte Carlo Stock Simulator v3.5 &nbsp;·&nbsp; Datos: Yahoo Finance (sin garantía de exactitud)</div>

<!-- 1. Signal Summary -->
<section>
  <h2>Señal y Resumen por Modelo</h2>
  ${table(
    ['Modelo', 'Precio Esperado', 'Retorno %', 'P(Subida)', 'Sharpe', 'Sortino', 'Señal', 'Score'],
    signalRows
  )}
</section>

<!-- 2. Risk Metrics -->
<section>
  <h2>Métricas de Riesgo</h2>
  ${table(
    ['Modelo', 'VaR 95%', 'CVaR 95%', 'VaR 99%', 'CVaR 99%', 'MDD Medio', 'P(−10%)', 'P(−20%)', 'Vol 30d', 'Vol Anual'],
    riskRows
  )}
</section>

<!-- 3. Backtest -->
${btRows.length > 0 ? `
<section>
  <h2>Validación Histórica (Backtest)</h2>
  ${table(
    ['Modelo', 'Score', 'Acierto Dirección', 'Error Medio %', 'Error Mediano %', 'Cobertura IC95%', 'Checkpoints'],
    btRows
  )}
</section>` : ''}

<!-- 4. Algorithm Explanations -->
${algorithmHTML}

<!-- 5. Macro Context -->
${macroHTML}

<!-- 6. Fundamentals -->
${fundHTML}

<!-- 7. News / Sentiment -->
${newsHTML}

<!-- 8. Technical Analysis -->
${techHTML}

<!-- 9. Options -->
${optionsHTML}

<!-- 10. Insider Trading -->
${insidersHTML}

<!-- 11. Reddit Sentiment -->
${redditHTML}

<!-- 12. Disclaimer -->
<div class="disclaimer">
  <strong>Aviso legal:</strong> Los resultados de este simulador son de naturaleza puramente estadística y se basan en datos históricos.
  No constituyen asesoramiento financiero, de inversión, legal ni fiscal. Las simulaciones de Monte Carlo no garantizan resultados futuros.
  Invierta únicamente el capital que esté dispuesto a perder. Consulte a un asesor financiero certificado antes de tomar decisiones de inversión.
  Monte Carlo Stock Simulator v3.5 &nbsp;·&nbsp; Datos proporcionados por Yahoo Finance sin garantía de exactitud ni integridad.
</div>

</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('Activa las ventanas emergentes para generar el PDF.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Small delay so styles render before print dialog opens
  setTimeout(() => win.print(), 400);
}

// ── Shared helpers ───────────────────────────────────────────────
function generateSignalSimple(metrics) {
  if (!metrics) return { signal: 'N/A', score: 0 };
  const probUp = metrics.probUp || 0;
  const expectedReturn = (metrics.expectedReturnPct || 0) / 100;
  const sharpe = metrics.sharpe || 0;
  const var95 = metrics.VaR_95 || 0;
  let signal;
  if (probUp > 0.55 && expectedReturn > 0.05 && sharpe > 0.3) signal = 'BUY';
  else if (probUp < 0.40 || (var95 > 0.15 && expectedReturn < 0)) signal = 'SELL';
  else signal = 'HOLD';
  const score = Math.min(100, Math.max(0, Math.round(probUp * 40 + sharpe * 20 + expectedReturn * 200)));
  return { signal, score };
}
