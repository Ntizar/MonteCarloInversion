/* ═══════════════════════════════════════════════════════════════════
   reddit.js — Sentimiento Reddit / WallStreetBets
   Fuente: Reddit API pública (sin autenticación)
   Monte Carlo Stock Simulator v3.3
   ═══════════════════════════════════════════════════════════════════ */

import { getCachedMacro, setCachedMacro } from './cache.js';

const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

// Subreddits a consultar por orden de relevancia
const SUBREDDITS = ['wallstreetbets', 'stocks', 'investing', 'StockMarket'];

// Palabras clave de sentimiento
const BULL_WORDS = ['buy', 'long', 'calls', 'bull', 'moon', 'rocket', 'growth', 'strong', 'up', 'bullish', 'green', 'undervalued', 'oversold'];
const BEAR_WORDS = ['sell', 'short', 'puts', 'bear', 'crash', 'drop', 'fall', 'weak', 'down', 'bearish', 'red', 'overvalued', 'overbought'];

function analyzeSentiment(text) {
  const lower = text.toLowerCase();
  let bull = 0, bear = 0;
  BULL_WORDS.forEach(w => { if (lower.includes(w)) bull++; });
  BEAR_WORDS.forEach(w => { if (lower.includes(w)) bear++; });
  const total = bull + bear;
  if (total === 0) return { label: 'NEUTRO', color: '#9A7B2C', score: 50 };
  const score = Math.round((bull / total) * 100);
  if (score >= 60) return { label: 'ALCISTA', color: '#10B981', score };
  if (score <= 40) return { label: 'BAJISTA', color: '#EF4444', score };
  return { label: 'NEUTRO', color: '#E8C547', score };
}

async function fetchSubreddit(subreddit, query) {
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&sort=new&limit=10&t=week&restrict_sr=1`;
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const text = await res.text();
      // Algunos proxies envuelven en {contents:...}
      let data;
      try { data = JSON.parse(text); } catch { continue; }
      if (data?.contents) { try { data = JSON.parse(data.contents); } catch { continue; } }
      if (data?.data?.children) return data.data.children;
    } catch { continue; }
  }
  return [];
}

/**
 * Obtiene menciones y sentimiento de una acción en Reddit
 */
export async function fetchRedditSentiment(symbol) {
  // Limpiar símbolo: AAPL, MC.BBVA → AAPL, BBVA
  const ticker = symbol.split('.')[0].replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const cacheKey = `reddit:${ticker}`;
  const cached = await getCachedMacro(cacheKey);
  if (cached) return cached;

  try {
    // Buscar en WSB y stocks (los más activos)
    const [wsbPosts, stocksPosts] = await Promise.all([
      fetchSubreddit('wallstreetbets', ticker),
      fetchSubreddit('stocks', ticker),
    ]);

    const allPosts = [...wsbPosts, ...stocksPosts];

    if (allPosts.length === 0) {
      const result = { symbol: ticker, mentions: 0, posts: [], overallSentiment: { label: 'SIN DATOS', color: '#9A7B2C', score: 50 }, generatedAt: new Date().toISOString() };
      await setCachedMacro(cacheKey, result);
      return result;
    }

    const posts = allPosts
      .map(child => {
        const p = child.data;
        const text = `${p.title ?? ''} ${p.selftext ?? ''}`;
        // Filtrar que realmente mencione el ticker
        if (!text.toUpperCase().includes(ticker)) return null;
        return {
          title: p.title ?? '',
          url: `https://reddit.com${p.permalink}`,
          subreddit: p.subreddit,
          score: p.score ?? 0,
          comments: p.num_comments ?? 0,
          created: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
          sentiment: analyzeSentiment(text),
          upvoteRatio: p.upvote_ratio ?? null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    // Sentimiento global ponderado por score (upvotes)
    let totalWeight = 0, weightedScore = 0;
    posts.forEach(p => {
      const w = Math.max(1, p.score);
      weightedScore += p.sentiment.score * w;
      totalWeight += w;
    });
    const globalScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 50;
    let overallLabel, overallColor;
    if (globalScore >= 60)      { overallLabel = 'ALCISTA'; overallColor = '#10B981'; }
    else if (globalScore <= 40) { overallLabel = 'BAJISTA'; overallColor = '#EF4444'; }
    else                        { overallLabel = 'NEUTRO';  overallColor = '#E8C547'; }

    const result = {
      symbol: ticker,
      mentions: posts.length,
      posts,
      overallSentiment: { label: overallLabel, color: overallColor, score: globalScore },
      generatedAt: new Date().toISOString(),
    };

    await setCachedMacro(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`Reddit sentiment failed for ${symbol}:`, err.message);
    return null;
  }
}

/** Renderiza tarjeta de sentimiento Reddit */
export function renderRedditCard(reddit) {
  if (!reddit) return '<p class="context-unavailable">Datos de Reddit no disponibles</p>';
  if (reddit.mentions === 0) return `<p class="context-unavailable">Sin menciones recientes de <strong>${reddit.symbol}</strong> en Reddit esta semana</p>`;

  const timeAgo = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(h / 24);
    return d > 0 ? `hace ${d}d` : h > 0 ? `hace ${h}h` : 'hoy';
  };

  const postsHtml = reddit.posts.map(p => `
    <div class="reddit-post">
      <div class="reddit-post-header">
        <span class="reddit-sentiment-dot" style="background:${p.sentiment.color}" title="${p.sentiment.label}"></span>
        <a href="${p.url}" target="_blank" rel="noopener" class="reddit-post-title">${p.title.slice(0, 100)}${p.title.length > 100 ? '…' : ''}</a>
      </div>
      <div class="reddit-post-meta">
        <span>r/${p.subreddit}</span>
        <span>▲ ${p.score.toLocaleString()}</span>
        <span>💬 ${p.comments}</span>
        <span>${timeAgo(p.created)}</span>
        <span class="reddit-sentiment-label" style="color:${p.sentiment.color}">${p.sentiment.label}</span>
      </div>
    </div>
  `).join('');

  return `
    <div class="reddit-card">
      <div class="reddit-overall-row">
        <span class="reddit-badge" style="background:${reddit.overallSentiment.color}">${reddit.overallSentiment.label}</span>
        <span class="reddit-score">Score: ${reddit.overallSentiment.score}/100</span>
        <span class="reddit-mentions">${reddit.mentions} posts relevantes esta semana</span>
      </div>
      <div class="reddit-posts-list">${postsHtml}</div>
    </div>
  `;
}
