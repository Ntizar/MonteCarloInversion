/* ═══════════════════════════════════════════════════════════════════
   technicals.js — Indicadores de análisis técnico
   Computación local sobre precios históricos (sin fetch)
   Monte Carlo Stock Simulator v3.3
   ═══════════════════════════════════════════════════════════════════ */

/** Media móvil simple */
function sma(arr, period) {
  const result = new Array(arr.length).fill(null);
  for (let i = period - 1; i < arr.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += arr[i - j];
    result[i] = sum / period;
  }
  return result;
}

/** Media móvil exponencial */
function ema(arr, period) {
  const k = 2 / (period + 1);
  const result = new Array(arr.length).fill(null);
  // primer EMA = SMA del primer periodo
  let sum = 0;
  for (let i = 0; i < period; i++) sum += arr[i];
  result[period - 1] = sum / period;
  for (let i = period; i < arr.length; i++) {
    result[i] = arr[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

/** RSI de 14 periodos */
function computeRSI(close, period = 14) {
  const changes = [];
  for (let i = 1; i < close.length; i++) changes.push(close[i] - close[i - 1]);

  let gains = 0, losses = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) gains += changes[i];
    else losses -= changes[i];
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const rsiArr = new Array(close.length).fill(null);

  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiArr[i + 1] = 100 - 100 / (1 + rs);
  }

  return rsiArr;
}

/** MACD (12, 26, 9) */
function computeMACD(close) {
  const ema12 = ema(close, 12);
  const ema26 = ema(close, 26);
  const macdLine = close.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null ? ema12[i] - ema26[i] : null
  );
  const validMacd = macdLine.filter(v => v !== null);
  const signalFull = ema(validMacd, 9);
  // Realinear la señal con el array original
  const signalLine = new Array(close.length).fill(null);
  let si = 0;
  for (let i = 0; i < close.length; i++) {
    if (macdLine[i] !== null) {
      signalLine[i] = signalFull[si++] ?? null;
    }
  }
  const histogram = close.map((_, i) =>
    macdLine[i] !== null && signalLine[i] !== null ? macdLine[i] - signalLine[i] : null
  );
  return { line: macdLine, signal: signalLine, histogram };
}

/** Bandas de Bollinger (20 periodos, 2 desviaciones) */
function computeBollinger(close, period = 20, mult = 2) {
  const middle = sma(close, period);
  const upper = new Array(close.length).fill(null);
  const lower = new Array(close.length).fill(null);
  for (let i = period - 1; i < close.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += (close[i - j] - middle[i]) ** 2;
    const stdDev = Math.sqrt(sum / period);
    upper[i] = middle[i] + mult * stdDev;
    lower[i] = middle[i] - mult * stdDev;
  }
  return { upper, middle, lower };
}

/** ATR — Average True Range (14 periodos) */
function computeATR(high, low, close, period = 14) {
  const tr = [null];
  for (let i = 1; i < close.length; i++) {
    tr.push(Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    ));
  }
  return sma(tr.filter(v => v !== null), period).slice(-1)[0] ?? null;
}

/** Último valor no nulo de un array */
const last = arr => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null) return arr[i];
  }
  return null;
};

/**
 * Calcula todos los indicadores técnicos sobre los datos de precio.
 * @param {object} stockData — objeto devuelto por fetchStockData (adjClose, high, low, close, volume, dates)
 * @returns {object} — objeto con todos los indicadores y sus señales
 */
export function computeTechnicals(stockData) {
  if (!stockData?.adjClose?.length) return null;

  const close   = stockData.adjClose;
  const high    = stockData.high   ?? close;
  const low     = stockData.low    ?? close;
  const volume  = stockData.volume ?? [];
  const n       = close.length;
  const current = close[n - 1];

  // ── Medias móviles ───────────────────────────────────────────────
  const ma50Arr  = sma(close, 50);
  const ma200Arr = sma(close, 200);
  const ma20Arr  = sma(close, 20);
  const ma50  = last(ma50Arr);
  const ma200 = last(ma200Arr);
  const ma20  = last(ma20Arr);

  // Golden / Death cross
  const goldenCross = ma50 !== null && ma200 !== null && ma50 > ma200;
  const prevMa50  = ma50Arr[n - 2];
  const prevMa200 = ma200Arr[n - 2];
  const crossRecent = prevMa50 !== null && prevMa200 !== null &&
    Math.sign(ma50 - ma200) !== Math.sign(prevMa50 - prevMa200);

  // ── RSI ──────────────────────────────────────────────────────────
  const rsiArr = computeRSI(close, 14);
  const rsi14  = last(rsiArr);
  const rsiPrev = rsiArr[n - 2] ?? rsi14;

  // ── MACD ─────────────────────────────────────────────────────────
  const macd = computeMACD(close);
  const macdVal  = last(macd.line);
  const macdSig  = last(macd.signal);
  const macdHist = last(macd.histogram);
  const macdHistPrev = (() => {
    for (let i = macd.histogram.length - 2; i >= 0; i--) {
      if (macd.histogram[i] !== null) return macd.histogram[i];
    }
    return null;
  })();

  // ── Bollinger ────────────────────────────────────────────────────
  const bollinger = computeBollinger(close, 20, 2);
  const bUpper  = last(bollinger.upper);
  const bMiddle = last(bollinger.middle);
  const bLower  = last(bollinger.lower);
  const bWidth  = bUpper !== null && bLower !== null ? ((bUpper - bLower) / bMiddle * 100) : null;
  const bPos    = bUpper !== null && bLower !== null
    ? Math.max(0, Math.min(100, ((current - bLower) / (bUpper - bLower)) * 100))
    : null;

  // ── ATR / Volatilidad ────────────────────────────────────────────
  const atr = computeATR(high, low, close, 14);
  const atrPct = atr !== null ? (atr / current * 100) : null;

  // ── Volumen ──────────────────────────────────────────────────────
  let volTrend = null;
  if (volume.length >= 20) {
    const volSlice = volume.slice(-20).filter(v => v > 0);
    const avgVol = volSlice.reduce((a, b) => a + b, 0) / volSlice.length;
    const lastVol = volume[volume.length - 1];
    volTrend = lastVol > avgVol * 1.5 ? 'ALTO' : lastVol < avgVol * 0.5 ? 'BAJO' : 'NORMAL';
  }

  // ── Señal técnica compuesta ──────────────────────────────────────
  let bullPoints = 0, bearPoints = 0;

  // RSI
  if (rsi14 !== null) {
    if (rsi14 < 30) bullPoints += 2;       // sobreventa
    else if (rsi14 < 45) bullPoints += 1;
    else if (rsi14 > 70) bearPoints += 2;  // sobrecompra
    else if (rsi14 > 55) bearPoints += 1;
  }

  // MACD
  if (macdHist !== null && macdHistPrev !== null) {
    if (macdHist > 0 && macdHistPrev <= 0) bullPoints += 2; // cruce alcista
    else if (macdHist > 0) bullPoints += 1;
    else if (macdHist < 0 && macdHistPrev >= 0) bearPoints += 2; // cruce bajista
    else bearPoints += 1;
  }

  // MA50 vs MA200
  if (ma50 !== null && ma200 !== null) {
    if (goldenCross) bullPoints += 1;
    else bearPoints += 1;
  }

  // Precio vs MA50
  if (ma50 !== null) {
    if (current > ma50 * 1.02) bullPoints += 1;
    else if (current < ma50 * 0.98) bearPoints += 1;
  }

  // Bollinger position
  if (bPos !== null) {
    if (bPos < 20) bullPoints += 1;
    else if (bPos > 80) bearPoints += 1;
  }

  const score = Math.round((bullPoints / (bullPoints + bearPoints || 1)) * 100);
  let trend, trendColor;
  if (score >= 65)      { trend = 'ALCISTA';  trendColor = '#10B981'; }
  else if (score >= 45) { trend = 'NEUTRO';   trendColor = '#E8C547'; }
  else                  { trend = 'BAJISTA';  trendColor = '#EF4444'; }

  // Soporte/Resistencia simples (min/max 52 semanas)
  const last252 = close.slice(-252);
  const support    = Math.min(...last252);
  const resistance = Math.max(...last252);
  const distSupport    = ((current - support) / current * 100).toFixed(1);
  const distResistance = ((resistance - current) / current * 100).toFixed(1);

  return {
    current,
    // Medias móviles
    ma20, ma50, ma200,
    goldenCross, crossRecent,
    // RSI
    rsi14, rsiPrev,
    rsiZone: rsi14 < 30 ? 'SOBREVENTA' : rsi14 > 70 ? 'SOBRECOMPRA' : 'NORMAL',
    // MACD
    macd: { value: macdVal, signal: macdSig, histogram: macdHist, histPrev: macdHistPrev },
    // Bollinger
    bollinger: { upper: bUpper, middle: bMiddle, lower: bLower, width: bWidth, position: bPos },
    // Volatilidad
    atr, atrPct,
    // Volumen
    volTrend,
    // Soporte / Resistencia
    support, resistance, distSupport, distResistance,
    // Señal compuesta
    trend, trendColor, score,
    bullPoints, bearPoints,
  };
}

/** Devuelve HTML de la tarjeta de análisis técnico */
export function renderTechnicalsCard(tech) {
  if (!tech) return '<p class="context-unavailable">Datos técnicos no disponibles</p>';

  const fmt = (v, dec = 2) => v != null ? Number(v).toFixed(dec) : '—';
  const pct = (v, dec = 1) => v != null ? `${Number(v).toFixed(dec)}%` : '—';

  const rsiBar = tech.rsi14 != null
    ? `<div class="tech-bar-wrap"><div class="tech-bar" style="width:${tech.rsi14}%;background:${tech.rsi14 < 30 ? '#10B981' : tech.rsi14 > 70 ? '#EF4444' : '#E8C547'}"></div></div>`
    : '';

  const bposBar = tech.bollinger.position != null
    ? `<div class="tech-bar-wrap"><div class="tech-bar" style="width:${tech.bollinger.position}%;background:${tech.bollinger.position < 20 ? '#10B981' : tech.bollinger.position > 80 ? '#EF4444' : '#9A7B2C'}"></div></div>`
    : '';

  const crossLabel = tech.crossRecent
    ? `<span class="tech-badge" style="background:${tech.goldenCross ? '#10B981' : '#EF4444'}">${tech.goldenCross ? 'Golden Cross' : 'Death Cross'} reciente</span>`
    : '';

  return `
    <div class="tech-card">
      <div class="tech-signal-row">
        <span class="tech-signal-badge" style="background:${tech.trendColor}">${tech.trend}</span>
        <span class="tech-signal-score">Score técnico: ${tech.score}/100</span>
        ${crossLabel}
      </div>

      <div class="tech-grid">
        <div class="tech-section">
          <h4>Medias Móviles</h4>
          <div class="tech-row"><span>MA 20</span><span>${fmt(tech.ma20)}</span></div>
          <div class="tech-row"><span>MA 50</span><span>${fmt(tech.ma50)}</span></div>
          <div class="tech-row"><span>MA 200</span><span>${fmt(tech.ma200)}</span></div>
          <div class="tech-row"><span>Tendencia</span><span style="color:${tech.goldenCross ? '#10B981' : '#EF4444'}">${tech.goldenCross ? 'MA50 > MA200' : 'MA50 < MA200'}</span></div>
        </div>

        <div class="tech-section">
          <h4>RSI (14)</h4>
          <div class="tech-row"><span>RSI</span><span style="color:${tech.rsi14 < 30 ? '#10B981' : tech.rsi14 > 70 ? '#EF4444' : '#E8C547'}">${fmt(tech.rsi14, 1)}</span></div>
          ${rsiBar}
          <div class="tech-row"><span>Zona</span><span>${tech.rsiZone}</span></div>
        </div>

        <div class="tech-section">
          <h4>MACD (12,26,9)</h4>
          <div class="tech-row"><span>Línea</span><span>${fmt(tech.macd.value, 3)}</span></div>
          <div class="tech-row"><span>Señal</span><span>${fmt(tech.macd.signal, 3)}</span></div>
          <div class="tech-row"><span>Histograma</span><span style="color:${(tech.macd.histogram ?? 0) > 0 ? '#10B981' : '#EF4444'}">${fmt(tech.macd.histogram, 3)}</span></div>
          <div class="tech-row"><span>Cruce</span><span>${tech.macd.histogram != null && tech.macd.histPrev != null ? (tech.macd.histogram > 0 && tech.macd.histPrev <= 0 ? '↑ Alcista' : tech.macd.histogram < 0 && tech.macd.histPrev >= 0 ? '↓ Bajista' : '—') : '—'}</span></div>
        </div>

        <div class="tech-section">
          <h4>Bandas de Bollinger (20)</h4>
          <div class="tech-row"><span>Superior</span><span>${fmt(tech.bollinger.upper)}</span></div>
          <div class="tech-row"><span>Media</span><span>${fmt(tech.bollinger.middle)}</span></div>
          <div class="tech-row"><span>Inferior</span><span>${fmt(tech.bollinger.lower)}</span></div>
          <div class="tech-row"><span>Posición</span><span>${tech.bollinger.position != null ? `${tech.bollinger.position.toFixed(0)}%` : '—'}</span></div>
          ${bposBar}
          <div class="tech-row"><span>Anchura</span><span>${pct(tech.bollinger.width)}</span></div>
        </div>

        <div class="tech-section">
          <h4>Soporte & Resistencia (52s)</h4>
          <div class="tech-row"><span>Resistencia</span><span style="color:#EF4444">${fmt(tech.resistance)} <small>(-${tech.distResistance}%)</small></span></div>
          <div class="tech-row"><span>Precio actual</span><span>${fmt(tech.current)}</span></div>
          <div class="tech-row"><span>Soporte</span><span style="color:#10B981">${fmt(tech.support)} <small>(+${tech.distSupport}%)</small></span></div>
        </div>

        <div class="tech-section">
          <h4>Volatilidad & Volumen</h4>
          <div class="tech-row"><span>ATR (14)</span><span>${fmt(tech.atr)}</span></div>
          <div class="tech-row"><span>ATR %</span><span>${pct(tech.atrPct)}</span></div>
          <div class="tech-row"><span>Volumen</span><span>${tech.volTrend ?? '—'}</span></div>
        </div>
      </div>
    </div>
  `;
}
