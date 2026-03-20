/* ═══════════════════════════════════════════════════════════════════
   correlation.js — Matriz de correlación entre activos
   Computación local sobre log-returns históricos (sin fetch)
   Monte Carlo Stock Simulator v3.3
   ═══════════════════════════════════════════════════════════════════ */

import { mean, std } from './math-utils.js';

/**
 * Calcula Pearson correlation entre dos arrays de igual longitud
 */
function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb;
    da  += xa * xa;
    db  += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  return denom > 0 ? num / denom : null;
}

/**
 * Calcula log-returns a partir de precios de cierre ajustados
 */
function toLogReturns(prices) {
  const lr = [];
  for (let i = 1; i < prices.length; i++) {
    const r = prices[i] / prices[i - 1];
    if (r > 0) lr.push(Math.log(r));
  }
  return lr;
}

/**
 * Alinea dos series de returns al período mínimo común
 */
function align(r1, r2) {
  const n = Math.min(r1.length, r2.length);
  return [r1.slice(-n), r2.slice(-n)];
}

/**
 * Construye la matriz de correlación para un conjunto de activos
 * @param {Object} stockDataMap — { symbol: stockData } donde stockData tiene adjClose
 * @returns {Object} — { symbols, matrix, stats }
 */
export function computeCorrelationMatrix(stockDataMap) {
  const entries = Object.entries(stockDataMap).filter(([, d]) => d?.adjClose?.length > 10);
  if (entries.length < 2) return null;

  const symbols  = entries.map(([s]) => s);
  const returns  = entries.map(([, d]) => toLogReturns(d.adjClose));

  const n = symbols.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(null));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const [r1, r2] = align(returns[i], returns[j]);
      const corr = pearson(r1, r2);
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }

  // Estadísticas por activo: volatilidad anualizada
  const volatilities = returns.map(r => {
    const s = std(r);
    return s != null ? +(s * Math.sqrt(252) * 100).toFixed(1) : null;
  });

  // Correlación promedio de cada activo con el resto
  const avgCorrelations = symbols.map((_, i) => {
    const vals = matrix[i].filter((v, j) => j !== i && v !== null);
    if (vals.length === 0) return null;
    return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3);
  });

  return { symbols, matrix, volatilities, avgCorrelations };
}

/**
 * Renderiza el heatmap de correlación como tabla HTML
 */
export function renderCorrelationCard(corrData) {
  if (!corrData || corrData.symbols.length < 2) {
    return '<p class="context-unavailable">Analiza al menos 2 activos en el Radar de Mercado para ver la correlación entre ellos</p>';
  }

  const { symbols, matrix, volatilities, avgCorrelations } = corrData;
  const n = symbols.length;

  const corrColor = (v) => {
    if (v === null) return '#1a1a1a';
    if (v >= 0.8)  return '#7f1d1d'; // rojo oscuro — muy alta
    if (v >= 0.5)  return '#c2410c'; // naranja
    if (v >= 0.2)  return '#854d0e'; // amarillo oscuro
    if (v >= -0.2) return '#1a3a1a'; // gris verde — sin correlación
    if (v >= -0.5) return '#065f46'; // verde medio
    return '#052e16';                 // verde oscuro — anticorrelación
  };

  const fmtV = (v) => v !== null ? v.toFixed(2) : '—';

  // Cabecera
  const header = `<tr><th></th>${symbols.map(s => `<th class="corr-sym">${s.split('.')[0]}</th>`).join('')}</tr>`;

  // Filas
  const rows = symbols.map((sym, i) => {
    const cells = matrix[i].map((v, j) => {
      const bg = corrColor(v);
      const textColor = v !== null && Math.abs(v) > 0.3 ? '#fff' : '#ccc';
      const bold = i === j ? 'font-weight:700;' : '';
      return `<td style="background:${bg};color:${textColor};${bold}">${fmtV(v)}</td>`;
    }).join('');
    return `<tr><th class="corr-sym">${sym.split('.')[0]}</th>${cells}</tr>`;
  }).join('');

  // Resumen por activo
  const summaryRows = symbols.map((sym, i) => `
    <tr>
      <td>${sym}</td>
      <td>${volatilities[i] != null ? `${volatilities[i]}%` : '—'}</td>
      <td>${avgCorrelations[i] != null ? avgCorrelations[i].toFixed(2) : '—'}</td>
    </tr>
  `).join('');

  return `
    <div class="corr-card">
      <div class="corr-legend">
        <span class="corr-legend-item" style="background:#052e16">Anticorr. &lt;-0.5</span>
        <span class="corr-legend-item" style="background:#1a3a1a">Sin corr. ±0.2</span>
        <span class="corr-legend-item" style="background:#c2410c">Alta &gt;0.5</span>
        <span class="corr-legend-item" style="background:#7f1d1d">Muy alta &gt;0.8</span>
      </div>
      <div class="corr-table-wrap">
        <table class="corr-table">
          <thead>${header}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <table class="corr-summary-table">
        <thead><tr><th>Activo</th><th>Volatilidad anual</th><th>Corr. media</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
      <p class="corr-note">Correlación basada en log-returns diarios de hasta 5 años. Valores cercanos a 1 = se mueven igual · -1 = se mueven opuesto · 0 = independientes</p>
    </div>
  `;
}
