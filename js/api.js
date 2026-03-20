/* ═══════════════════════════════════════════════════════════════════
   api.js — Fetch stock data  v3.0
   + IndexedDB cache (via cache.js)
   + Robust CORS proxy rotation
   + Works on GitHub Pages (no Netlify required)
   ═══════════════════════════════════════════════════════════════════ */

import { MARKETS, COMMODITIES } from './config.js';
import { getCachedPrices, setCachedPrices, getCachedUniverse, setCachedUniverse } from './cache.js';

// ── Environment detection ────────────────────────────────────────
const isNetlify = window.location.hostname.includes('netlify.app') || window.location.hostname.includes('netlify.com');
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const useNetlifyFunction = isNetlify || isLocalhost;

const API_BASE = '/.netlify/functions/stock-data';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

// CORS proxy list — tried in order, both for Yahoo Finance and other sources
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

// ── Core fetch helpers ───────────────────────────────────────────

async function fetchFromNetlifyFunction(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (res.ok) {
    const data = await res.json();
    if (!data.error) return data;
    throw new Error(data.error);
  }
  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || `HTTP ${res.status}`);
}

async function fetchDirectYahoo(originalUrl) {
  const u = new URL(originalUrl, window.location.origin);
  const action = u.searchParams.get('action') || 'chart';
  const symbol = u.searchParams.get('symbol') || '';
  const query = u.searchParams.get('q') || '';
  const range = u.searchParams.get('range') || '5y';
  const interval = u.searchParams.get('interval') || '1d';

  for (const makeProxy of CORS_PROXIES) {
    for (const host of YAHOO_HOSTS) {
      let yahooUrl;
      if (action === 'search') {
        yahooUrl = `https://${host}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`;
      } else {
        yahooUrl = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
      }

      try {
        const proxyUrl = makeProxy(yahooUrl);
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) continue;
        const json = await res.json();

        if (action === 'search') {
          const quotes = (json.quotes || [])
            .filter(q => ['EQUITY', 'ETF', 'CRYPTOCURRENCY', 'INDEX'].includes(q.quoteType))
            .map(q => ({ symbol: q.symbol, name: q.shortname || q.longname || q.symbol, exchange: q.exchDisp || '', type: q.quoteType }));
          return { quotes };
        }

        const result = json.chart?.result?.[0];
        if (!result) continue;
        const meta = result.meta;
        const quote = result.indicators?.quote?.[0] || {};
        return {
          symbol: meta.symbol,
          currency: meta.currency || 'USD',
          exchangeName: meta.exchangeName || '',
          instrumentType: meta.instrumentType || '',
          regularMarketPrice: meta.regularMarketPrice,
          previousClose: meta.previousClose || meta.chartPreviousClose,
          timestamps: result.timestamp || [],
          open: quote.open || [],
          high: quote.high || [],
          low: quote.low || [],
          close: quote.close || [],
          volume: quote.volume || [],
          adjClose: result.indicators?.adjclose?.[0]?.adjclose || quote.close || [],
        };
      } catch (_) { continue; }
    }
  }
  throw new Error('No se pudo conectar con ninguna fuente de datos. Revisa tu conexión a Internet e inténtalo de nuevo.');
}

async function fetchWithFallback(url, options = {}) {
  const u = new URL(url, window.location.origin);
  const action = u.searchParams.get('action') || 'chart';
  const supportsDirectYahoo = action === 'chart' || action === 'search';

  if (!useNetlifyFunction && supportsDirectYahoo) {
    return fetchDirectYahoo(url);
  }

  // On Netlify or localhost: try the function, fall back to direct Yahoo
  try {
    return await fetchFromNetlifyFunction(url, options);
  } catch (_) {
    if (supportsDirectYahoo) return fetchDirectYahoo(url);
    throw _;
  }
}

// ── Stock Data ───────────────────────────────────────────────────

export async function fetchStockData(symbol, range = '5y') {
  // Check cache first
  const cached = await getCachedPrices(symbol, range);
  if (cached) return cached;

  const url = `${API_BASE}?action=chart&symbol=${encodeURIComponent(symbol)}&range=${range}&interval=1d`;
  const data = await fetchWithFallback(url);
  const normalized = normalizeChartPayload(data, symbol);

  // Cache the result
  await setCachedPrices(symbol, range, normalized);
  return normalized;
}

function normalizeChartPayload(data, fallbackSymbol) {
  const symbol = data.symbol || fallbackSymbol;
  const len = data.timestamps?.length || 0;
  if (len === 0) throw new Error(`No se recibieron datos para ${symbol}`);

  const clean = { dates: [], open: [], high: [], low: [], close: [], volume: [], adjClose: [] };
  for (let i = 0; i < len; i++) {
    if (data.close[i] != null) {
      clean.dates.push(new Date(data.timestamps[i] * 1000));
      clean.open.push(data.open[i]);
      clean.high.push(data.high[i]);
      clean.low.push(data.low[i]);
      clean.close.push(data.close[i]);
      clean.volume.push(data.volume[i] || 0);
      clean.adjClose.push(data.adjClose[i] ?? data.close[i]);
    }
  }

  if (clean.close.length < 5) throw new Error(`Datos insuficientes para ${symbol} (solo ${clean.close.length} puntos)`);

  return {
    symbol: data.symbol || symbol,
    currency: data.currency || 'USD',
    exchange: data.exchangeName || '',
    currentPrice: data.regularMarketPrice || clean.close[clean.close.length - 1],
    previousClose: data.previousClose || clean.close[clean.close.length - 2],
    ...clean,
  };
}

export async function searchStocks(query) {
  if (!query || query.length < 1) return [];
  const url = `${API_BASE}?action=search&q=${encodeURIComponent(query)}`;
  try {
    const data = await fetchWithFallback(url);
    return data.quotes || [];
  } catch (e) {
    console.warn('Search failed:', e.message);
    return [];
  }
}

// ── Market Universes ─────────────────────────────────────────────

const memCache = new Map();

export async function fetchMarketUniverse(marketId) {
  if (memCache.has(marketId)) return memCache.get(marketId);

  // Check IndexedDB cache
  const cached = await getCachedUniverse(marketId);
  if (cached) {
    memCache.set(marketId, cached);
    return cached;
  }

  const data = await loadUniverse(marketId);
  const universe = {
    marketId,
    label: data.label || marketId,
    currency: data.currency || '$',
    tickers: data.tickers || {},
    count: Object.keys(data.tickers || {}).length,
  };

  memCache.set(marketId, universe);
  await setCachedUniverse(marketId, universe);
  return universe;
}

async function loadUniverse(marketId) {
  const url = `${API_BASE}?action=universe&market=${encodeURIComponent(marketId)}`;

  if (useNetlifyFunction) {
    try {
      return await fetchFromNetlifyFunction(url);
    } catch (_) {
      return fetchClientUniverse(marketId);
    }
  }

  return fetchClientUniverse(marketId);
}

// ── Bulk Data Fetch ──────────────────────────────────────────────

export async function fetchBulkStockData(symbols, range = '3y', chunkSize = 25, onProgress) {
  const uniqueSymbols = [...new Set((symbols || []).filter(Boolean))];

  // On Netlify: use batch endpoint; otherwise fetch individually with concurrency
  if (useNetlifyFunction) {
    return fetchBulkViaNetlify(uniqueSymbols, range, chunkSize, onProgress);
  }

  return fetchBulkDirect(uniqueSymbols, range, onProgress, chunkSize);
}

async function fetchBulkViaNetlify(symbols, range, chunkSize, onProgress) {
  const results = {};
  let processed = 0;

  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    const url = `${API_BASE}?action=batch-chart&symbols=${encodeURIComponent(chunk.join(','))}&range=${encodeURIComponent(range)}&interval=1d`;

    // Try Netlify function; fall back to individual direct fetches for this chunk
    let batch = {};
    try {
      const data = await fetchFromNetlifyFunction(url);
      batch = data.results || {};
    } catch (_) {
      // Fall back per-symbol
      for (const symbol of chunk) {
        try {
          const item = await fetchStockData(symbol, range);
          batch[symbol] = item;
        } catch (err) {
          batch[symbol] = { error: err.message };
        }
      }
    }

    for (const symbol of chunk) {
      const item = batch[symbol];
      processed++;
      if (item?.error) {
        if (onProgress) onProgress(processed, symbols.length, symbol, item.error);
        continue;
      }
      try {
        // normalizeChartPayload only if raw (has timestamps), else already normalized
        results[symbol] = item.timestamps ? normalizeChartPayload(item, symbol) : item;
      } catch (error) {
        if (onProgress) onProgress(processed, symbols.length, symbol, error.message);
        continue;
      }
      if (onProgress) onProgress(processed, symbols.length, symbol, null);
    }
  }

  return results;
}

async function fetchBulkDirect(symbols, range, onProgress, chunkSize) {
  const results = {};
  let processed = 0;
  const concurrency = Math.max(1, Math.min(4, chunkSize || 4));

  await asyncPool(concurrency, symbols, async (symbol) => {
    // Check cache first
    const cached = await getCachedPrices(symbol, range);
    if (cached) {
      results[symbol] = cached;
      processed++;
      if (onProgress) onProgress(processed, symbols.length, symbol, null);
      return;
    }

    try {
      results[symbol] = await fetchStockData(symbol, range);
      processed++;
      if (onProgress) onProgress(processed, symbols.length, symbol, null);
    } catch (error) {
      processed++;
      if (onProgress) onProgress(processed, symbols.length, symbol, error.message || 'No data');
    }
  });

  return results;
}

// ── Client-side Universe Parsing ─────────────────────────────────

async function fetchClientUniverse(marketId) {
  const id = String(marketId || '').toLowerCase();

  if (id === 'commodities') {
    return { label: 'Materias Primas', currency: '$', tickers: COMMODITIES };
  }

  if (id === 'sp500') {
    try {
      const rawText = await fetchWikipediaWikitext('List_of_S%26P_500_companies');
      return {
        label: 'S&P 500 Completo', currency: '$',
        tickers: parseSp500Universe(extractWikiSection(rawText, '== S&P 500 component stocks ==')),
      };
    } catch (_) {
      return { label: 'S&P 500', currency: '$', tickers: MARKETS['S&P 500']?.tickers || {} };
    }
  }

  if (id === 'ibex35') {
    try {
      const rawText = await fetchWikipediaWikitext('IBEX_35');
      return {
        label: 'IBEX 35 Completo', currency: '€',
        tickers: parseIbexUniverse(extractWikiSection(rawText, '==Components==')),
      };
    } catch (_) {
      return { label: 'IBEX 35', currency: '€', tickers: MARKETS['IBEX 35']?.tickers || {} };
    }
  }

  throw new Error(`Unknown market universe: ${marketId}`);
}

async function fetchWikipediaWikitext(pageTitle) {
  const url = `${WIKIPEDIA_API}?action=query&prop=revisions&titles=${pageTitle}&rvprop=content&rvslots=main&formatversion=2&format=json&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const data = await res.json();
  const content = data?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  if (!content) throw new Error(`No se pudo cargar el universo ${pageTitle}`);
  return content;
}

function extractWikiSection(rawText, marker) {
  const start = rawText.indexOf(marker);
  if (start === -1) throw new Error(`Marker not found: ${marker}`);
  const sectionStart = rawText.indexOf('{|', start);
  if (sectionStart === -1) throw new Error(`Table start not found after: ${marker}`);
  const nextHeading = rawText.indexOf('\n==', sectionStart);
  return rawText.slice(sectionStart, nextHeading === -1 ? undefined : nextHeading);
}

function parseSp500Universe(section) {
  const rows = section.split('\n|-').slice(2);
  const tickers = {};
  for (const row of rows) {
    const lines = row.split('\n').map(l => l.trim()).filter(Boolean);
    const symbolMatch = row.match(/\{\{(?:NyseSymbol|NasdaqSymbol)\|([^}|]+)(?:\|[^}]*)?\}\}/);
    if (!symbolMatch) continue;
    const symbol = symbolMatch[1].trim();
    const dataLine = lines.find((l, idx) => idx > 0 && (l.includes('||') || l.startsWith('|[[')));
    if (!dataLine) continue;
    const company = cleanWikiText(dataLine.replace(/^\|/, '').split('||')[0]);
    if (!company) continue;
    tickers[symbol] = company;
  }
  return tickers;
}

function parseIbexUniverse(section) {
  const rows = section.split('\n|-').slice(1);
  const tickers = {};
  for (const row of rows) {
    const lines = row.split('\n').map(l => l.trim()).filter(Boolean);
    const symbolLine = lines.find(l => l.startsWith('|[http'));
    const companyLine = lines.find((l, idx) => l.startsWith('|') && idx > 0);
    if (!symbolLine || !companyLine) continue;
    const symbolMatch = symbolLine.match(/\s([A-Z0-9.=]+)\]$/);
    if (!symbolMatch) continue;
    const company = cleanWikiText(companyLine.replace(/^\|/, ''));
    if (!company) continue;
    tickers[symbolMatch[1].trim()] = company;
  }
  return tickers;
}

function cleanWikiText(value) {
  return String(value || '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/\{\{nowrap\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{sortname\|([^|}]+)\|([^}]+)\}\}/g, '$1 $2')
    .replace(/\{\{[^}]+\|([^}]+)\}\}/g, '$1')
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[[^\s\]]+\s([^\]]+)\]/g, '$1')
    .replace(/''+/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Utilities ────────────────────────────────────────────────────

async function asyncPool(limit, items, iterator) {
  const executing = new Set();
  for (const item of items) {
    const promise = Promise.resolve().then(() => iterator(item));
    executing.add(promise);
    const cleanup = () => executing.delete(promise);
    promise.then(cleanup, cleanup);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
}

export function computeLogReturns(prices) {
  const logRet = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) logRet.push(Math.log(prices[i] / prices[i - 1]));
  }
  return logRet;
}
