/* ═══════════════════════════════════════════════════════════════════
   insiders.js — Insider trading (compras/ventas de directivos)
   Fuente: SEC EDGAR EFTS full-text search (Form 4, sin API key)
   Monte Carlo Stock Simulator v3.3
   ═══════════════════════════════════════════════════════════════════ */

import { getCachedMacro, setCachedMacro } from './cache.js';

const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

async function fetchWithProxy(url, json = true) {
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      return json ? await res.json() : await res.text();
    } catch { continue; }
  }
  return null;
}

function parseTransactionType(code) {
  const map = {
    'P': 'Compra (mercado abierto)',
    'S': 'Venta (mercado abierto)',
    'A': 'Asignación/Premio',
    'D': 'Devolución al emisor',
    'F': 'Pago de impuestos',
    'G': 'Donación',
    'I': 'Operación discrecional',
    'M': 'Ejercicio de opción',
    'C': 'Conversión',
    'E': 'Caducidad',
    'X': 'Ejercicio de warrant',
  };
  return map[code] || code || 'Desconocido';
}

/**
 * Obtiene las últimas transacciones de insiders (Form 4) para un símbolo via SEC EDGAR
 */
export async function fetchInsiderTrading(symbol) {
  // Solo aplica a acciones USA
  const ticker = symbol.split('.')[0].toUpperCase();
  const cacheKey = `insiders:${ticker}`;
  const cached = await getCachedMacro(cacheKey);
  if (cached) return cached;

  try {
    // SEC EDGAR full-text search por Form 4 con el ticker en el título
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90); // últimos 90 días
    const startStr = startDate.toISOString().split('T')[0];
    const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${ticker}%22&dateRange=custom&startdt=${startStr}&forms=4&hits.hits._source=period_of_report,display_names,entity_name,file_date`;

    const data = await fetchWithProxy(searchUrl, true);

    if (!data?.hits?.hits?.length) {
      const result = { symbol: ticker, transactions: [], summary: null, generatedAt: new Date().toISOString() };
      await setCachedMacro(cacheKey, result);
      return result;
    }

    // Extraer datos básicos de los hits de EDGAR
    const hits = data.hits.hits.slice(0, 10);
    const transactions = hits.map(hit => {
      const src = hit._source ?? {};
      return {
        filedDate:   src.file_date   ?? null,
        periodDate:  src.period_of_report ?? null,
        insiderName: src.display_names ?? src.entity_name ?? 'Desconocido',
        formType:    '4',
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4&dateb=&owner=include&count=10&search_text=`,
      };
    }).filter(t => t.filedDate);

    // Intentar obtener más detalle del primer filing
    let detailedTransactions = transactions;
    try {
      const detailUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${ticker}%22&dateRange=custom&startdt=${startStr}&forms=4&hits.hits._source=period_of_report,display_names,entity_name,file_date,form_type`;
      const detail = await fetchWithProxy(detailUrl, true);
      if (detail?.hits?.hits?.length > 0) {
        detailedTransactions = detail.hits.hits.slice(0, 15).map(hit => {
          const src = hit._source ?? {};
          return {
            filedDate:   src.file_date ?? null,
            periodDate:  src.period_of_report ?? null,
            insiderName: Array.isArray(src.display_names) ? src.display_names.join(', ') : (src.display_names ?? src.entity_name ?? 'Desconocido'),
            formType:    src.form_type ?? '4',
          };
        }).filter(t => t.filedDate);
      }
    } catch { /* usar los básicos */ }

    const result = {
      symbol: ticker,
      transactions: detailedTransactions,
      count: detailedTransactions.length,
      generatedAt: new Date().toISOString(),
      secUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&CIK=&type=4&dateb=&owner=include&count=20&search_text=&action=getcompany`,
    };

    await setCachedMacro(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`Insider trading failed for ${symbol}:`, err.message);
    return null;
  }
}

/** Renderiza tarjeta de insider trading */
export function renderInsidersCard(insiders, fundamentals) {
  // Porcentajes de insiders/instituciones desde fundamentals si están disponibles
  const insidersPct = fundamentals?.info?.insidersPercent ?? null;
  const instPct     = fundamentals?.info?.institutionsPercent ?? null;

  const ownershipHtml = (insidersPct != null || instPct != null) ? `
    <div class="insiders-ownership">
      ${insidersPct != null ? `<div class="insiders-own-item"><span>Propiedad insiders</span><span class="own-val">${Number(insidersPct).toFixed(2)}%</span></div>` : ''}
      ${instPct != null ? `<div class="insiders-own-item"><span>Propiedad institucional</span><span class="own-val">${Number(instPct).toFixed(2)}%</span></div>` : ''}
    </div>
  ` : '';

  if (!insiders || insiders.transactions?.length === 0) {
    return `
      <div class="insiders-card">
        ${ownershipHtml}
        <p class="context-unavailable">No se encontraron filings Form 4 recientes en SEC EDGAR para este símbolo (puede que sea un activo no-USA)</p>
        ${insiders?.secUrl ? `<a href="${insiders.secUrl}" target="_blank" rel="noopener" class="insiders-sec-link">Ver en SEC EDGAR</a>` : ''}
      </div>
    `;
  }

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const d = Math.floor(diff / 86400000);
    return `hace ${d}d`;
  };

  const rowsHtml = insiders.transactions.map(t => `
    <div class="insiders-row">
      <span class="insiders-name">${t.insiderName}</span>
      <span class="insiders-date">${t.filedDate ?? '—'} <small>${timeAgo(t.filedDate)}</small></span>
      <span class="insiders-form">Form ${t.formType}</span>
    </div>
  `).join('');

  return `
    <div class="insiders-card">
      ${ownershipHtml}
      <div class="insiders-table">
        <div class="insiders-header">
          <span>Insider</span><span>Fecha filing</span><span>Tipo</span>
        </div>
        ${rowsHtml}
      </div>
      ${insiders.secUrl ? `<a href="${insiders.secUrl}" target="_blank" rel="noopener" class="insiders-sec-link">Ver todos los Form 4 en SEC EDGAR</a>` : ''}
    </div>
  `;
}
