/* ═══════════════════════════════════════════════════════════════════
   news.js — Noticias y sentimiento sin API key
   Fuentes: Yahoo Finance RSS (via CORS proxy)
   Monte Carlo Stock Simulator v3.0
   ═══════════════════════════════════════════════════════════════════ */

import { getCachedNews, setCachedNews } from './cache.js';

const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

// Yahoo Finance RSS — no requiere API key
const YAHOO_RSS = (symbol) =>
  `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;

async function fetchRSS(url) {
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const text = await res.text();
      return parseRSS(text);
    } catch {
      continue;
    }
  }
  return [];
}

function parseRSS(xmlText) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const content = match[1];
    const title = extractTag(content, 'title');
    const link = extractTag(content, 'link');
    const pubDate = extractTag(content, 'pubDate');
    const description = stripHtml(extractTag(content, 'description') || '');
    const source = extractAttribute(content, 'source', 'url') || extractTag(content, 'source') || 'Yahoo Finance';

    if (title) {
      items.push({
        title: cleanText(title),
        link: cleanText(link),
        date: pubDate ? new Date(pubDate).toISOString() : null,
        description: description ? description.slice(0, 200) : null,
        source: cleanText(source),
        sentiment: classifySentiment(title + ' ' + (description || '')),
      });
    }
  }

  return items.slice(0, 10); // Máximo 10 noticias
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return null;
  return (match[1] || match[2] || '').trim();
}

function extractAttribute(xml, tag, attr) {
  const match = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

function stripHtml(text) {
  return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

// Clasificación de sentimiento simple basada en palabras clave
const BULLISH_WORDS = [
  'surge', 'soar', 'rally', 'gain', 'rise', 'up', 'high', 'record', 'beat', 'exceed',
  'strong', 'positive', 'growth', 'profit', 'buy', 'upgrade', 'outperform', 'bullish',
  'breakthrough', 'launch', 'deal', 'contract', 'partnership', 'dividend', 'buyback',
  'sube', 'sube', 'máximo', 'récord', 'supera', 'crece', 'beneficios', 'dividendo',
];

const BEARISH_WORDS = [
  'plunge', 'drop', 'fall', 'decline', 'loss', 'cut', 'miss', 'weak', 'concern', 'risk',
  'debt', 'lawsuit', 'investigation', 'fraud', 'recall', 'warning', 'downgrade', 'sell',
  'bearish', 'crash', 'slump', 'disappointing', 'below', 'layoffs', 'restructuring',
  'baja', 'cae', 'mínimo', 'pérdidas', 'recorta', 'investigación', 'deuda',
];

function classifySentiment(text) {
  const lower = text.toLowerCase();
  let bullishCount = 0;
  let bearishCount = 0;

  for (const word of BULLISH_WORDS) {
    if (lower.includes(word)) bullishCount++;
  }
  for (const word of BEARISH_WORDS) {
    if (lower.includes(word)) bearishCount++;
  }

  if (bullishCount > bearishCount + 1) return { label: 'POSITIVO', color: '#10B981', score: 70 + bullishCount * 5 };
  if (bearishCount > bullishCount + 1) return { label: 'NEGATIVO', color: '#EF4444', score: 30 - bearishCount * 5 };
  return { label: 'NEUTRO', color: '#9A7B2C', score: 50 };
}

/**
 * Calcula un índice de sentimiento global de las noticias (0-100)
 */
function computeNewsSentimentIndex(news) {
  if (!news || news.length === 0) return { score: 50, label: 'NEUTRO', color: '#9A7B2C' };

  const scores = news.map(n => n.sentiment?.score ?? 50);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const clamped = Math.max(0, Math.min(100, avgScore));

  const label = clamped >= 65 ? 'POSITIVO' : clamped >= 40 ? 'NEUTRO' : 'NEGATIVO';
  const color = clamped >= 65 ? '#10B981' : clamped >= 40 ? '#9A7B2C' : '#EF4444';

  return { score: Math.round(clamped), label, color };
}

/**
 * Obtiene noticias recientes de una acción
 */
export async function fetchStockNews(symbol) {
  const cached = await getCachedNews(symbol);
  if (cached) return cached;

  try {
    const news = await fetchRSS(YAHOO_RSS(symbol));
    const sentimentIndex = computeNewsSentimentIndex(news);

    const result = {
      symbol,
      generatedAt: new Date().toISOString(),
      news,
      sentimentIndex,
      count: news.length,
    };

    await setCachedNews(symbol, result);
    return result;
  } catch (err) {
    console.warn(`News fetch failed for ${symbol}:`, err.message);
    return {
      symbol,
      generatedAt: new Date().toISOString(),
      news: [],
      sentimentIndex: { score: 50, label: 'NEUTRO', color: '#9A7B2C' },
      count: 0,
    };
  }
}

/**
 * Renderiza la tarjeta de noticias y sentimiento (HTML string)
 */
export function renderNewsCard(newsData) {
  if (!newsData || newsData.count === 0) {
    return '<p class="context-unavailable">No hay noticias disponibles para este símbolo.</p>';
  }
  const si = newsData.sentimentIndex || {};
  return `
    <div class="news-card">
      <div class="news-sentiment-banner" style="border-left: 4px solid ${si.color || '#9A7B2C'}">
        <span>Sentimiento: <strong style="color:${si.color || '#9A7B2C'}">${si.label || 'NEUTRO'}</strong></span>
        <span class="news-score">Score ${si.score ?? 50}/100</span>
      </div>
      <ul class="news-list">
        ${newsData.news.slice(0, 8).map(n => `
          <li class="news-item">
            <div class="news-item-header">
              <span class="news-sentiment-dot" style="background:${n.sentiment?.color || '#9A7B2C'}" title="${n.sentiment?.label || ''}"></span>
              <a class="news-title" href="${n.link || '#'}" target="_blank" rel="noopener noreferrer">${n.title}</a>
            </div>
            <div class="news-meta">
              <span class="news-source">${n.source || 'Yahoo Finance'}</span>
              ${n.date ? `<span class="news-date">${new Date(n.date).toLocaleDateString('es-ES')}</span>` : ''}
              <span class="news-sentiment-label" style="color:${n.sentiment?.color || '#9A7B2C'}">${n.sentiment?.label || ''}</span>
            </div>
            ${n.description ? `<p class="news-desc">${n.description}</p>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

/**
 * Obtiene noticias del mercado general
 */
export async function fetchMarketNews() {
  const cached = await getCachedNews('_market_general');
  if (cached) return cached;

  try {
    // Noticias generales de mercado via Yahoo Finance
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EIXIC,%5EDJI&region=US&lang=en-US`;
    const news = await fetchRSS(url);
    const sentimentIndex = computeNewsSentimentIndex(news);

    const result = {
      symbol: 'MARKET',
      generatedAt: new Date().toISOString(),
      news,
      sentimentIndex,
      count: news.length,
    };

    await setCachedNews('_market_general', result);
    return result;
  } catch {
    return { symbol: 'MARKET', news: [], sentimentIndex: { score: 50, label: 'NEUTRO', color: '#9A7B2C' }, count: 0 };
  }
}
