/* ═══════════════════════════════════════════════════════════════════
   cache.js — IndexedDB cache layer para datos de precios y fundamentales
   Monte Carlo Stock Simulator v3.0
   ═══════════════════════════════════════════════════════════════════ */

const DB_NAME = 'MonteCarloPro';
const DB_VERSION = 3;
const STORE_PRICES = 'prices';
const STORE_FUNDAMENTALS = 'fundamentals';
const STORE_NEWS = 'news';
const STORE_MACRO = 'macro';

// TTL por tipo de dato (ms)
const TTL = {
  prices_5y: 4 * 60 * 60 * 1000,      // 4h — histórico 5 años
  prices_1y: 2 * 60 * 60 * 1000,      // 2h — histórico 1 año
  prices_3mo: 30 * 60 * 1000,          // 30min — datos recientes
  fundamentals: 24 * 60 * 60 * 1000,  // 24h — fundamentales
  news: 15 * 60 * 1000,                // 15min — noticias
  macro: 6 * 60 * 60 * 1000,          // 6h — datos macro
  universe: 12 * 60 * 60 * 1000,      // 12h — universos de tickers
};

let _db = null;

async function openDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Crear stores con índice por timestamp para limpieza
      [STORE_PRICES, STORE_FUNDAMENTALS, STORE_NEWS, STORE_MACRO].forEach(name => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'key' });
          store.createIndex('ts', 'ts', { unique: false });
        }
      });
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      // Limpiar entradas expiradas al abrir
      cleanExpired().catch(() => {});
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

async function get(storeName, key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function set(storeName, key, value, ttlMs) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put({ key, value, ts: Date.now(), ttl: ttlMs });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

function isExpired(entry) {
  if (!entry) return true;
  return Date.now() - entry.ts > entry.ttl;
}

async function cleanExpired() {
  try {
    const db = await openDB();
    const stores = [STORE_PRICES, STORE_FUNDAMENTALS, STORE_NEWS, STORE_MACRO];
    const now = Date.now();

    for (const storeName of stores) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return;
        const entry = cursor.value;
        if (now - entry.ts > entry.ttl) {
          cursor.delete();
        }
        cursor.continue();
      };
    }
  } catch {
    // No crítico
  }
}

// ── API pública ──────────────────────────────────────────────────

export async function getCachedPrices(symbol, range) {
  const key = `prices:${symbol}:${range}`;
  const entry = await get(STORE_PRICES, key);
  if (entry && !isExpired(entry)) return entry.value;
  return null;
}

export async function setCachedPrices(symbol, range, data) {
  const key = `prices:${symbol}:${range}`;
  const ttlKey = `prices_${range.replace(/\d+/g, n => n)}`;
  const ttlMs = TTL[ttlKey] || TTL['prices_5y'];
  return set(STORE_PRICES, key, data, ttlMs);
}

export async function getCachedFundamentals(symbol) {
  const key = `fundamentals:${symbol}`;
  const entry = await get(STORE_FUNDAMENTALS, key);
  if (entry && !isExpired(entry)) return entry.value;
  return null;
}

export async function setCachedFundamentals(symbol, data) {
  return set(STORE_FUNDAMENTALS, `fundamentals:${symbol}`, data, TTL.fundamentals);
}

export async function getCachedNews(symbol) {
  const key = `news:${symbol}`;
  const entry = await get(STORE_NEWS, key);
  if (entry && !isExpired(entry)) return entry.value;
  return null;
}

export async function setCachedNews(symbol, data) {
  return set(STORE_NEWS, `news:${symbol}`, data, TTL.news);
}

export async function getCachedMacro(key) {
  const entry = await get(STORE_MACRO, `macro:${key}`);
  if (entry && !isExpired(entry)) return entry.value;
  return null;
}

export async function setCachedMacro(key, data) {
  return set(STORE_MACRO, `macro:${key}`, data, TTL.macro);
}

export async function getCachedUniverse(marketId) {
  const entry = await get(STORE_PRICES, `universe:${marketId}`);
  if (entry && !isExpired(entry)) return entry.value;
  return null;
}

export async function setCachedUniverse(marketId, data) {
  return set(STORE_PRICES, `universe:${marketId}`, data, TTL.universe);
}

/** Tamaño total aproximado del cache en KB */
export async function getCacheStats() {
  try {
    const db = await openDB();
    const stores = [STORE_PRICES, STORE_FUNDAMENTALS, STORE_NEWS, STORE_MACRO];
    let total = 0;
    let counts = {};

    for (const storeName of stores) {
      const count = await new Promise(resolve => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      });
      counts[storeName] = count;
      total += count;
    }

    return { total, counts };
  } catch {
    return { total: 0, counts: {} };
  }
}

export async function clearCache() {
  try {
    const db = await openDB();
    const stores = [STORE_PRICES, STORE_FUNDAMENTALS, STORE_NEWS, STORE_MACRO];
    for (const storeName of stores) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
    }
    return true;
  } catch {
    return false;
  }
}
