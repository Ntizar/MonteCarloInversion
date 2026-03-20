/* ═══════════════════════════════════════════════════════════════════
   screener.js — Filtrado rápido de acciones por sector, cap y señal
   Monte Carlo Stock Simulator v3.0
   ═══════════════════════════════════════════════════════════════════ */

// Sector mapping — Yahoo Finance quoteType / sector field
// Used to filter/label stocks in the screener UI
export const SECTOR_LABELS = {
  Technology: 'Tecnología',
  Healthcare: 'Salud',
  Financials: 'Finanzas',
  'Consumer Discretionary': 'Consumo Discrecional',
  'Consumer Staples': 'Consumo Básico',
  Industrials: 'Industriales',
  Energy: 'Energía',
  Utilities: 'Utilities',
  Materials: 'Materiales',
  'Communication Services': 'Comunicaciones',
  'Real Estate': 'Inmobiliario',
  Unknown: 'Desconocido',
};

// Cap buckets (USD)
export const CAP_BUCKETS = [
  { id: 'mega',  label: 'Mega Cap (>$200B)',  min: 200e9,   max: Infinity },
  { id: 'large', label: 'Large Cap ($10B–200B)', min: 10e9, max: 200e9 },
  { id: 'mid',   label: 'Mid Cap ($2B–10B)',  min: 2e9,     max: 10e9 },
  { id: 'small', label: 'Small Cap (<$2B)',   min: 0,       max: 2e9 },
];

/**
 * Clasifica una capitalización en bucket
 */
export function classifyMarketCap(capRaw) {
  if (capRaw == null) return 'unknown';
  for (const bucket of CAP_BUCKETS) {
    if (capRaw >= bucket.min && capRaw < bucket.max) return bucket.id;
  }
  return 'unknown';
}

/**
 * Aplica filtros sobre un array de resultados de acciones.
 *
 * @param {Array} items  — Array de objetos con { symbol, name, signal, fundamentals, metrics }
 * @param {Object} filters — { signals: ['BUY'|'HOLD'|'SELL'], caps: ['mega'|'large'|'mid'|'small'], minScore, maxScore }
 * @returns {Array} — Items filtrados
 */
export function applyScreenerFilters(items, filters = {}) {
  if (!items || items.length === 0) return [];

  const { signals, caps, minScore, maxScore, minProbUp, sectors } = filters;

  return items.filter(item => {
    // Signal filter
    if (signals && signals.length > 0) {
      if (!signals.includes(item.signal)) return false;
    }

    // Market cap filter
    if (caps && caps.length > 0) {
      const cap = classifyMarketCap(item.fundamentals?.valuation?.marketCapRaw);
      if (!caps.includes(cap)) return false;
    }

    // Score filter
    if (minScore != null && (item.score ?? 0) < minScore) return false;
    if (maxScore != null && (item.score ?? 100) > maxScore) return false;

    // ProbUp filter
    if (minProbUp != null && (item.probUp ?? 0) < minProbUp) return false;

    return true;
  });
}

/**
 * Ordena los resultados del screener
 * @param {Array} items
 * @param {'score'|'probUp'|'expectedReturn'|'var'|'name'} sortBy
 * @param {'asc'|'desc'} order
 */
export function sortScreenerResults(items, sortBy = 'score', order = 'desc') {
  const sign = order === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    let va, vb;
    switch (sortBy) {
      case 'probUp':        va = a.probUp ?? 0; vb = b.probUp ?? 0; break;
      case 'expectedReturn': va = a.expectedReturn ?? 0; vb = b.expectedReturn ?? 0; break;
      case 'var':           va = a.var95 ?? 0; vb = b.var95 ?? 0; break;
      case 'name':          return sign * (a.name || a.symbol).localeCompare(b.name || b.symbol);
      default:              va = a.score ?? 0; vb = b.score ?? 0;
    }
    return sign * (va - vb);
  });
}

/**
 * Construye el HTML de la fila de un screener item (tabla compacta)
 * @param {Object} item
 * @param {string} currency
 */
export function renderScreenerRow(item, currency = '$') {
  const signalColors = { BUY: '#E8C547', HOLD: '#9A7B2C', SELL: '#EF4444' };
  const signalColor = signalColors[item.signal] || '#888';
  const capLabel = CAP_BUCKETS.find(b => b.id === classifyMarketCap(item.fundamentals?.valuation?.marketCapRaw))?.label ?? '—';
  const pe = item.fundamentals?.valuation?.trailingPE;
  const roe = item.fundamentals?.profitability?.returnOnEquity;

  return `
    <tr class="screener-row" data-symbol="${item.symbol}">
      <td>
        <button class="screener-link" data-symbol="${item.symbol}">
          <strong>${item.symbol}</strong>
          <span class="screener-name">${item.name || ''}</span>
        </button>
      </td>
      <td>${currency}${(item.currentPrice || 0).toFixed(2)}</td>
      <td>
        <span class="signal-mini" style="background:${signalColor}">${item.signal || '—'}</span>
      </td>
      <td>
        <div class="score-bar-wrap">
          <span>${item.score ?? '—'}</span>
          <div class="score-bar"><div class="score-fill" style="width:${item.score ?? 0}%;background:${signalColor}"></div></div>
        </div>
      </td>
      <td class="${(item.probUp ?? 0) >= 0.5 ? 'text-green' : 'text-red'}">${item.probUp != null ? (item.probUp * 100).toFixed(1) + '%' : '—'}</td>
      <td class="${(item.expectedReturn ?? 0) >= 0 ? 'text-green' : 'text-red'}">${item.expectedReturn != null ? ((item.expectedReturn >= 0 ? '+' : '') + item.expectedReturn.toFixed(1) + '%') : '—'}</td>
      <td class="text-red">${item.var95 != null ? (item.var95 * 100).toFixed(1) + '%' : '—'}</td>
      <td>${pe != null ? pe.toFixed(1) + 'x' : '—'}</td>
      <td>${roe != null ? roe.toFixed(1) + '%' : '—'}</td>
      <td class="cap-badge">${capLabel}</td>
    </tr>
  `;
}

/**
 * Genera el HTML del panel de filtros del screener
 */
export function renderScreenerFilters() {
  return `
    <div class="screener-filters glass-card">
      <h4>Filtros</h4>
      <div class="filter-row">
        <div class="filter-group">
          <label>Señal</label>
          <div class="filter-checks">
            <label><input type="checkbox" class="sf-signal" value="BUY" checked> <span class="signal-dot" style="background:#E8C547"></span>BUY</label>
            <label><input type="checkbox" class="sf-signal" value="HOLD" checked> <span class="signal-dot" style="background:#9A7B2C"></span>HOLD</label>
            <label><input type="checkbox" class="sf-signal" value="SELL"> <span class="signal-dot" style="background:#EF4444"></span>SELL</label>
          </div>
        </div>
        <div class="filter-group">
          <label>Capitalización</label>
          <div class="filter-checks">
            <label><input type="checkbox" class="sf-cap" value="mega" checked>Mega</label>
            <label><input type="checkbox" class="sf-cap" value="large" checked>Large</label>
            <label><input type="checkbox" class="sf-cap" value="mid" checked>Mid</label>
            <label><input type="checkbox" class="sf-cap" value="small" checked>Small</label>
          </div>
        </div>
        <div class="filter-group">
          <label>Score mínimo</label>
          <input type="range" class="sf-minscore" min="0" max="100" value="0" step="5">
          <span class="sf-minscore-val">0</span>
        </div>
        <div class="filter-group">
          <label>P(Subida) mín.</label>
          <input type="range" class="sf-minprobup" min="0" max="100" value="0" step="5">
          <span class="sf-minprobup-val">0%</span>
        </div>
        <div class="filter-group filter-sort">
          <label>Ordenar por</label>
          <select class="sf-sortby">
            <option value="score">Score</option>
            <option value="probUp">P(Subida)</option>
            <option value="expectedReturn">Retorno Esperado</option>
            <option value="var">VaR 95%</option>
            <option value="name">Nombre</option>
          </select>
          <select class="sf-order">
            <option value="desc">Desc.</option>
            <option value="asc">Asc.</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

/**
 * Lee los valores actuales del panel de filtros del DOM
 * @param {Element} container — El contenedor del screener
 */
export function readScreenerFilters(container) {
  const signals = [...container.querySelectorAll('.sf-signal:checked')].map(el => el.value);
  const caps = [...container.querySelectorAll('.sf-cap:checked')].map(el => el.value);
  const minScore = parseInt(container.querySelector('.sf-minscore')?.value || '0');
  const minProbUp = parseInt(container.querySelector('.sf-minprobup')?.value || '0') / 100;
  const sortBy = container.querySelector('.sf-sortby')?.value || 'score';
  const order = container.querySelector('.sf-order')?.value || 'desc';
  return { signals, caps, minScore, minProbUp, sortBy, order };
}

/**
 * Conecta los eventos del panel de filtros al callback de refresco
 * @param {Element} container
 * @param {Function} onFilterChange — callback()
 */
export function bindScreenerFilterEvents(container, onFilterChange) {
  container.querySelectorAll('.sf-signal, .sf-cap').forEach(el => el.addEventListener('change', onFilterChange));
  container.querySelectorAll('.sf-sortby, .sf-order').forEach(el => el.addEventListener('change', onFilterChange));

  const minscoreSlider = container.querySelector('.sf-minscore');
  const minscoreVal = container.querySelector('.sf-minscore-val');
  if (minscoreSlider) {
    minscoreSlider.addEventListener('input', () => {
      if (minscoreVal) minscoreVal.textContent = minscoreSlider.value;
      onFilterChange();
    });
  }

  const probupSlider = container.querySelector('.sf-minprobup');
  const probupVal = container.querySelector('.sf-minprobup-val');
  if (probupSlider) {
    probupSlider.addEventListener('input', () => {
      if (probupVal) probupVal.textContent = probupSlider.value + '%';
      onFilterChange();
    });
  }
}
