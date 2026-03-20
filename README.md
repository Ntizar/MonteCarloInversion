# Monte Carlo Stock Simulator — v3.3

Aplicación web completa para simulación Monte Carlo de acciones bursátiles con diseño LiquidGlass. Desplegada en GitHub Pages, sin servidor, sin build step, sin backend.

**Desarrollado por David Antizar**

Live: [https://ntizar.github.io/MonteCarloInversion/](https://ntizar.github.io/MonteCarloInversion/)

---

## Qué hace

Simula la evolución futura del precio de cualquier acción del mundo usando 5 modelos estocásticos distintos, y enriquece el análisis con datos macro, fundamentales, técnicos, opciones, noticias, sentimiento de Reddit e insider trading — todo desde APIs gratuitas, sin registro, ejecutado 100% en el navegador.

---

## Características principales

### Simulación Monte Carlo
- **5 modelos estocásticos** independientes ejecutados en paralelo en un Web Worker (sin bloquear la UI):
  - **GBM** (Geometric Brownian Motion) — baseline para activos estables
  - **Heston** — volatilidad estocástica para mercados con clusters de vol
  - **Jump-Diffusion** (Merton) — modela saltos discretos por eventos extremos
  - **GARCH(1,1)** — volatilidad condicional que se adapta al régimen actual
  - **Bootstrap** — remuestreo histórico, sin supuestos distribucionales
- Configurable: horizonte (1–252 días), número de simulaciones (100–10.000), selección de modelos
- Fan charts con intervalos de confianza 95% y 99%
- Distribución de precios finales con percentiles clave

### Métricas de riesgo por modelo
- Señal BUY / HOLD / SELL con score de confianza 0–100
- VaR y CVaR al 95% y 99%
- Sharpe ratio y Sortino ratio
- Max Drawdown esperado
- Probabilidades de pérdida ≥10%, ≥20%, ≥30%
- Precio esperado y retorno esperado

### Validación histórica (backtest)
- Rolling backtest automático a 1 año con checkpoints reales
- En cada checkpoint: calibración solo con datos anteriores → simulación → comparación con precio real
- Métricas: score histórico, error absoluto medio, error mediano, acierto direccional, cobertura IC95%
- Ranking de modelos por rendimiento histórico real

### Análisis técnico automático (sin API externa)
- RSI 14 con zona sobrecompra/sobreventa
- MACD (12, 26, 9) con detección de cruce alcista/bajista
- Bandas de Bollinger (20, 2) con posición relativa del precio
- Medias móviles MA20, MA50, MA200 — Golden Cross / Death Cross
- ATR (Average True Range) y volatilidad porcentual
- Soporte y resistencia de 52 semanas con distancia al precio actual
- Señal técnica compuesta con score 0–100 y etiqueta ALCISTA/NEUTRO/BAJISTA

### Contexto macro (FRED API)
- Tipo de interés FED (FEDFUNDS)
- Inflación IPC YoY (CPIAUCSL)
- Desempleo (UNRATE)
- Bono EEUU 10Y y 2Y (DGS10, DGS2)
- Spread curva de tipos 10Y–2Y (con detección de inversión)
- VIX (VIXCLS)
- Señal macro global FAVORABLE / MIXTO / ADVERSO con score ponderado

### Fundamentales (Yahoo Finance)
- Valoración: P/E, P/E forward, PEG, P/B, P/S, EV/EBITDA, cap. bursátil
- Rentabilidad: márgenes bruto/operativo/neto, ROE, ROA, EBITDA
- Crecimiento: EPS trailing/forward, estimaciones analistas +1y
- Salud financiera: deuda, caja, ratio corriente, free cash flow
- Dividendos: yield, tasa, payout ratio, fecha ex-dividendo
- Info: beta, short ratio, % insiders, % instituciones, máx/mín 52 semanas
- Consenso analistas: precio objetivo medio/alto/bajo, recomendación

### Calendario de earnings y dividendos
- Próximas fechas de resultados trimestrales con estimaciones EPS y revenue de consenso
- Fecha ex-dividendo y fecha de pago
- Alerta visual destacada si los earnings están a ≤14 días

### Opciones y sentimiento institucional (Yahoo Finance)
- Put/Call ratio por volumen y por open interest
- Volatilidad implícita promedio ATM (5 strikes más cercanos al precio actual)
- Total de contratos calls y puts
- Señal de sentimiento: OPTIMISTA / NEUTRO / PRECAUCIÓN / PESIMISTA

### Noticias y sentimiento (Yahoo Finance RSS)
- Últimas noticias del ticker con análisis de sentimiento por titular (POSITIVO/NEGATIVO/NEUTRO)
- Score de sentimiento agregado con índice global
- Hasta 10 noticias con enlace, fecha y fuente

### Sentimiento Reddit / WallStreetBets
- Búsqueda de menciones del ticker en r/wallstreetbets y r/stocks (últimos 7 días)
- Análisis de sentimiento por post con palabras clave bullish/bearish
- Score global ponderado por upvotes
- Lista de los posts más votados con enlace directo

### Insider trading (SEC EDGAR)
- Últimos filings Form 4 de la SEC (90 días) — compras y ventas de directivos
- Porcentaje de propiedad de insiders e instituciones
- Enlace directo a SEC EDGAR para ver el histórico completo
- Solo aplica a acciones USA listadas en SEC

### Radar de Mercado y Portfolio Ideal
- 7 mercados precargados: IBEX 35, S&P 500, EURO STOXX, FTSE 100, Nikkei 225, Crypto, Materias Primas
- Universos completos para escaneo: IBEX 35 (35), S&P 500 (65 curados), Materias Primas
- Fase rápida: momentum, volatilidad, Sharpe, drawdown — sin simulación completa
- Fase profunda: Monte Carlo + backtest para cada activo del universo
- Ranking global con score, señal y métricas de riesgo
- Screener con filtros por señal, Sharpe mínimo, VaR máximo y retorno esperado
- Portfolio ideal con pesos sugeridos por optimización de Sharpe

### Correlación entre activos
- Matriz de correlación de Pearson sobre log-returns diarios de hasta 5 años
- Entre todos los activos analizados en la sesión actual
- Heatmap HTML con código de colores (rojo = alta correlación, verde = anticorrelación)
- Volatilidad anualizada y correlación media por activo

### Exportación
- **PDF** — Informe completo imprimible con todas las secciones (señal, riesgo, backtest, modelos, macro, fundamentales, noticias, aviso legal)
- **CSV** — Descarga del ranking del mercado completo

---

## Pestaña Contexto (9 secciones)

Al analizar cualquier acción, la pestaña **Contexto** carga en paralelo:

1. Análisis técnico (local, instantáneo)
2. Opciones y sentimiento institucional
3. Contexto macro (FRED)
4. Fundamentales
5. Earnings Calendar
6. Noticias y sentimiento
7. Sentimiento Reddit
8. Insider Trading (SEC)
9. Correlación con otros activos analizados

---

## Estructura

```
MonteCarloInversion/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD → publica public/ en gh-pages en cada push a main
├── public/
│   ├── index.html                  # SPA principal con CSP completo
│   ├── css/
│   │   └── styles.css              # Design system LiquidGlass (Black & Gold)
│   └── js/
│       ├── app.js                  # Controlador principal — orquesta todos los módulos
│       ├── api.js                  # Fetch Yahoo Finance + cadena CORS 3 proxies
│       ├── cache.js                # IndexedDB con TTL por tipo de dato
│       ├── config.js               # Mercados, tickers, modelos, getCurrency()
│       ├── simulation.js           # Orquestador Monte Carlo (main thread)
│       ├── simulation-worker.js    # Web Worker — 5 motores estocásticos
│       ├── math-utils.js           # PRNG, estadísticas, utilidades matemáticas (shared)
│       ├── charts.js               # Chart.js — fan charts, distribuciones, comparaciones
│       ├── macro.js                # FRED API JSON — macro + render
│       ├── fundamentals.js         # Yahoo Finance quoteSummary + earnings calendar
│       ├── news.js                 # Yahoo RSS + análisis de sentimiento
│       ├── technicals.js           # RSI, MACD, Bollinger, MA, ATR (computación local)
│       ├── options.js              # Put/Call ratio, IV implícita (Yahoo Finance options)
│       ├── reddit.js               # Sentimiento Reddit / WallStreetBets
│       ├── insiders.js             # Insider trading SEC EDGAR Form 4
│       ├── correlation.js          # Matriz de correlación Pearson entre activos
│       ├── screener.js             # Filtros y ordenación del ranking de mercado
│       ├── portfolio.js            # Radar de mercado y portfolio ideal
│       └── exporter.js             # Exportar CSV y PDF
└── README.md
```

---

## Despliegue

Desplegado en **GitHub Pages** — estático, sin servidor, sin build step.

El workflow `.github/workflows/deploy.yml` publica automáticamente `public/` en `gh-pages` en cada push a `main`.

**Configuración inicial (una sola vez):**
Settings → Pages → Source → Deploy from a branch → Branch: `gh-pages` / `/ (root)`

---

## Desarrollo local

```bash
# Python
python -m http.server 8080 --directory public

# Node
npx serve public
```

---

## APIs utilizadas (todas gratuitas, sin registro)

| Fuente | Datos | Autenticación |
|--------|-------|---------------|
| Yahoo Finance | Precios históricos, fundamentales, opciones | Sin key, via CORS proxy |
| Yahoo Finance RSS | Noticias y sentimiento | Sin key |
| FRED (St. Louis Fed) | Macro: tipos, inflación, VIX, curva | API key gratuita (incluida) |
| Wikipedia | Composición IBEX 35 y S&P 500 | Sin key, via CORS proxy |
| Reddit API | Sentimiento WallStreetBets/stocks | Sin key (endpoint público JSON) |
| SEC EDGAR EFTS | Insider trading Form 4 | Sin key |

**Proxies CORS utilizados** (en cascada si falla el anterior):
1. `api.allorigins.win`
2. `corsproxy.io`
3. `api.codetabs.com`
4. `thingproxy.freeboard.io`

---

## Modelos de Simulación

| Modelo | Ecuación estocástica | Mejor para |
|--------|---------------------|------------|
| GBM | dS = μ·S·dt + σ·S·dW | Baseline, activos líquidos estables |
| Heston | dS + dv (vol estocástica, reversión media) | Mercados con clustering de volatilidad |
| Jump-Diffusion | dS + J·dN (saltos Poisson de Merton) | Acciones con riesgo de eventos discretos |
| GARCH(1,1) | σ²ₜ = ω + α·ε²ₜ₋₁ + β·σ²ₜ₋₁ | Mercados con volatilidad variable en el tiempo |
| Bootstrap | Remuestreo con reemplazamiento | Sin supuestos distribucionales, market-realistic |

---

## Validación Histórica

Rolling backtest automático a 1 año:

1. Toma hasta 12 checkpoints del histórico disponible.
2. En cada checkpoint, calibra el modelo **solo con datos anteriores** a esa fecha.
3. Simula el horizonte temporal equivalente hacia adelante.
4. Compara precio simulado con precio real observado.
5. Agrega: score histórico, MAE, error mediano, acierto direccional, cobertura IC 95%.

---

## Seguridad

- **Content Security Policy** — `default-src 'self'`, restricciones explícitas en `script-src`, `worker-src`, `connect-src`, `font-src`, `style-src` e `img-src`.
- **Sin backend** — ningún dato del usuario sale de su navegador.
- **Cache local** — IndexedDB con TTL; los datos expiran automáticamente (precios: 4h, fundamentales: 24h, macro: 6h, noticias: 15min).

---

## Disclaimer

Los resultados de esta herramienta **no constituyen asesoramiento financiero**.
Son simulaciones basadas en datos históricos y modelos estocásticos.
Úselos únicamente con fines educativos y de investigación.

---

## Changelog

### v3.3 — Análisis técnico, opciones, Reddit, insiders, earnings, correlación

- **Fix FRED macro** — Migrado de endpoint CSV inestable a API JSON oficial (`api.stlouisfed.org/fred/series/observations`); añadido 4º proxy CORS. Datos macro ahora cargados correctamente.
- **`technicals.js`** — RSI 14, MACD (12,26,9), Bollinger (20,2), MA20/50/200, Golden/Death Cross, ATR, soporte/resistencia 52s. Señal técnica compuesta score 0–100. Computación 100% local sobre datos ya disponibles.
- **`options.js`** — Put/Call ratio por volumen y open interest, IV implícita ATM promedio, señal sentimiento institucional. Fuente: Yahoo Finance options chain.
- **`reddit.js`** — Menciones ticker en r/wallstreetbets + r/stocks (7 días), sentimiento por post ponderado por upvotes, score global.
- **`insiders.js`** — Form 4 SEC EDGAR últimos 90 días, % propiedad insiders e instituciones, enlace EDGAR.
- **Earnings Calendar** (`fundamentals.js`) — Extracción `calendarEvents`: fechas earnings + EPS/revenue estimados + ex-dividendo. Alerta urgente si ≤ 14 días.
- **`correlation.js`** — Matriz Pearson sobre log-returns diarios (hasta 5 años) entre activos de la sesión. Heatmap HTML + volatilidad anualizada + correlación media por activo.
- **Pestaña Contexto** — Ampliada de 3 a 9 secciones cargadas en paralelo.
- **CSP** — `connect-src` ampliado con `api.stlouisfed.org`, `thingproxy.freeboard.io`, `www.reddit.com`, `efts.sec.gov`, `www.sec.gov`.

### v3.2 — Fix arquitectura, refactoring y seguridad

- **Fix import mismatches** — `fetchStockNews`, `renderMacroPanel`, `renderMacroContextCard`, `renderFundamentalsCard`, `renderNewsCard` exportados e importados correctamente.
- **Web Worker conectado** — Simulaciones Monte Carlo y backtest ejecutados en `simulation-worker.js` vía `new Worker()`; main thread nunca bloqueado.
- **Screener integrado** — `screener.js` conectado al informe de mercado en `portfolio.js`.
- **`math-utils.js`** — PRNG, estadísticas y funciones math centralizadas; duplicación eliminada de `simulation.js`, `simulation-worker.js` y `portfolio.js`.
- **Moneda dinámica en PDF** — `exporter.js` detecta moneda via `getCurrency()`; correcto para €, £, ¥.
- **Fix estructura datos macro** — `exporter.js` accede correctamente a `macro.indicators.*`.
- **Content Security Policy** — Cabecera CSP añadida a `index.html`.
- **Fix FRED API** — `vintage_date=` corregido a `observation_start=`.

### v3.1 — PDF export completo + fix deploy

- **Botón PDF** — Aparece tras ejecutar la simulación, lanza ventana imprimible.
- **Informe PDF completo** — 8 secciones: señal, riesgo, backtest, modelos, macro, fundamentales, noticias, aviso legal.
- **Fix bug** — `exportSimulationPDF()` ahora recibe los 7 parámetros de estado completos.
- **Fix deploy** — GitHub Actions workflow publica `public/` en `gh-pages` automáticamente.

### v3.0 — Arquitectura completa

- **Web Workers** — Simulaciones en hilo secundario.
- **Cache IndexedDB** — TTL diferenciado por tipo de dato.
- **FRED API** — Datos macro sin API key.
- **Fundamentales Yahoo Finance** — via CORS proxy.
- **Noticias y sentimiento** — RSS Yahoo Finance.
- **Screener** — Filtros sobre el ranking del radar.
- **Exportar CSV** — Descarga del ranking en un click.
- **Tab Contexto** — Macro + fundamentales + noticias integrados.
- **Cadena CORS robusta** — 3 proxies con fallback automático.
