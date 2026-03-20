/* ═══════════════════════════════════════════════════════════════════
   exporter.js — Exportación PDF (vía window.print) y CSV
   Monte Carlo Stock Simulator v3.0
   ═══════════════════════════════════════════════════════════════════ */

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
 * Genera un informe HTML y abre el diálogo de impresión
 * El informe está diseñado para ser legible en papel (blanco/negro o color)
 */
export function exportSimulationPDF(symbol, results, metrics, backtest, fundamentals, news) {
  const ts = new Date().toLocaleString('es-ES');
  const modelIds = Object.keys(metrics);

  const table = (headers, rows) => `
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `;

  const summaryRows = modelIds.map(id => {
    const m = metrics[id];
    const r = results[id] || {};
    const sig = generateSignalSimple(m);
    return [
      r.model || id,
      `$${m.expectedPrice?.toFixed(2) ?? '?'}`,
      `${m.expectedReturnPct >= 0 ? '+' : ''}${m.expectedReturnPct?.toFixed(2) ?? '?'}%`,
      `${(m.probUp * 100).toFixed(1)}%`,
      `${((m.VaR_95 || 0) * 100).toFixed(2)}%`,
      `${((m.mddMean || 0) * 100).toFixed(2)}%`,
      `${m.sharpe?.toFixed(3) ?? '?'}`,
      sig.signal,
    ];
  });

  const btRows = backtest?.results ? Object.entries(backtest.results).map(([id, bt]) => {
    const s = bt.summary || {};
    return [
      bt.model || id,
      s.score ?? '?',
      `${(s.directionAccuracy * 100).toFixed(1)}%`,
      `${s.meanAbsErrorPct?.toFixed(2)}%`,
      `${(s.within95Rate * 100).toFixed(1)}%`,
    ];
  }) : [];

  const fundHTML = fundamentals && !fundamentals.unavailable ? `
    <section>
      <h2>Fundamentales</h2>
      <div class="fund-grid">
        <div><strong>P/E Trailing</strong> ${fundamentals.valuation?.trailingPE?.toFixed(1) ?? '—'}</div>
        <div><strong>P/E Forward</strong> ${fundamentals.valuation?.forwardPE?.toFixed(1) ?? '—'}</div>
        <div><strong>ROE</strong> ${fundamentals.profitability?.returnOnEquity?.toFixed(1) ?? '—'}%</div>
        <div><strong>Margen Neto</strong> ${fundamentals.profitability?.profitMargins?.toFixed(1) ?? '—'}%</div>
        <div><strong>Crec. BPA</strong> ${fundamentals.growth?.earningsGrowth?.toFixed(1) ?? '—'}%</div>
        <div><strong>Deuda/Equity</strong> ${fundamentals.health?.debtToEquity?.toFixed(1) ?? '—'}</div>
        <div><strong>Target Analistas</strong> $${fundamentals.analystConsensus?.targetMeanPrice?.toFixed(2) ?? '—'}</div>
        <div><strong>Recomendación</strong> ${fundamentals.analystConsensus?.recommendationKey?.toUpperCase() ?? '—'}</div>
        <div><strong>Cap. Mercado</strong> ${fundamentals.valuation?.marketCap ?? '—'}</div>
        <div><strong>Beta</strong> ${fundamentals.info?.beta?.toFixed(2) ?? '—'}</div>
      </div>
    </section>
  ` : '';

  const newsHTML = news?.news?.length ? `
    <section>
      <h2>Noticias Recientes</h2>
      <p>Sentimiento: <strong>${news.sentimentIndex?.label ?? '—'}</strong> (Score ${news.sentimentIndex?.score ?? '—'})</p>
      <ul class="news-list">
        ${news.news.slice(0, 6).map(n => `
          <li>
            <span class="news-date">${n.date ? new Date(n.date).toLocaleDateString('es-ES') : '—'}</span>
            <span class="news-title">${n.title}</span>
            <span class="news-sentiment" style="color:${n.sentiment?.color}">${n.sentiment?.label ?? ''}</span>
          </li>
        `).join('')}
      </ul>
    </section>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe Monte Carlo — ${symbol}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #111; background: #fff; padding: 20px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 16px 0 8px; }
  .meta { color: #555; font-size: 10px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  th { background: #1a1a1a; color: #fff; padding: 4px 6px; text-align: left; }
  td { padding: 3px 6px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .fund-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .fund-grid div { background: #f5f5f5; padding: 6px 8px; border-radius: 4px; }
  .fund-grid strong { display: block; font-size: 9px; color: #555; margin-bottom: 2px; }
  .news-list { list-style: none; }
  .news-list li { padding: 4px 0; border-bottom: 1px solid #eee; display: flex; gap: 8px; align-items: flex-start; }
  .news-date { color: #888; white-space: nowrap; font-size: 9px; min-width: 60px; }
  .news-sentiment { font-size: 9px; font-weight: bold; white-space: nowrap; }
  .disclaimer { margin-top: 20px; font-size: 9px; color: #888; border-top: 1px solid #eee; padding-top: 8px; }
  @media print {
    body { padding: 10px; }
    @page { margin: 1cm; }
  }
</style>
</head>
<body>

<h1>Monte Carlo Stock Simulator — ${symbol}</h1>
<div class="meta">Informe generado el ${ts} · Monte Carlo Stock Simulator v3.0</div>

<section>
  <h2>Resumen por Modelo</h2>
  ${table(
    ['Modelo', 'Precio Esperado', 'Retorno %', 'P(Subida)', 'VaR 95%', 'MDD Medio', 'Sharpe', 'Señal'],
    summaryRows
  )}
</section>

${btRows.length > 0 ? `
<section>
  <h2>Validación Histórica (Backtest)</h2>
  ${table(
    ['Modelo', 'Score', 'Acierto Dirección', 'Error Medio %', 'Cobertura IC95%'],
    btRows
  )}
</section>` : ''}

${fundHTML}
${newsHTML}

<div class="disclaimer">
  Los resultados de este simulador son de naturaleza estadística y no constituyen asesoramiento financiero.
  Invierta únicamente lo que esté dispuesto a perder. Monte Carlo Stock Simulator v3.0 · Datos: Yahoo Finance.
</div>

</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('Activa las ventanas emergentes para generar el PDF');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
  };
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
