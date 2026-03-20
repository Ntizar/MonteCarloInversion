# Monte Carlo Stock Simulator — v3.3

Aplicación web completa para simulación Monte Carlo de acciones bursátiles con diseño LiquidGlass. Desplegada en GitHub Pages, sin servidor.

**Desarrollado por David Antizar**

Live: [https://ntizar.github.io/MonteCarloInversion/](https://ntizar.github.io/MonteCarloInversion/)

---

## Características principales

- **5 algoritmos de simulación** Monte Carlo:
  - **GBM** — Geometric Brownian Motion
  - **Heston** — Volatilidad Estocástica
  - **Jump-Diffusion** — Modelo de Merton con saltos
  - **GARCH(1,1)** — Volatilidad condicional
  - **Bootstrap** — Remuestreo histórico

- **Cualquier acción del mundo** — Busca por ticker o nombre (Yahoo Finance)
- **7 mercados precargados** — IBEX 35, S&P 500, EURO STOXX, FTSE 100, Nikkei 225, Crypto y Materias Primas
- **Universos completos para escaneo**: IBEX 35, S&P 500 y Materias Primas
- **Radar de Mercado & Portfolio Ideal**:
  - Fase rápida (momentum, volatilidad, Sharpe, drawdown)
  - Fase profunda (Monte Carlo + backtest histórico)
  - Ranking global con score, señal y métricas de riesgo
  - Portfolio ideal con pesos sugeridos
- **Informe completo** por acción:
  - Señal BUY/HOLD/SELL con score de confianza
  - VaR, CVaR, Sharpe, Sortino, Max Drawdown
  - Intervalos de confianza 95% y 99%
  - Probabilidades de pérdida (≥10%, ≥20%, ≥30%)
  - Fan charts y distribución de precios finales
- **Validación histórica a 1 año** — Rolling backtest con checkpoints reales
- **Comparación de algoritmos** — Tablas y gráficos comparativos
- **Metodología completa** — Documentación de SDEs, métricas y señales

---

## Estructura

```
MonteCarloInversion/
├── public/
│   ├── index.html                  # Página principal (v3.3: CSP ampliado)
│   ├── css/
│   │   └── styles.css              # Diseño LiquidGlass + estilos v3.3
│   └── js/
│       ├── app.js                  # Controlador principal
│       ├── api.js                  # Fetch + cache IndexedDB + cadena CORS
│       ├── cache.js                # IndexedDB con TTL por tipo de dato
│       ├── macro.js                # FRED API JSON — datos macro + render
│       ├── fundamentals.js         # Yahoo Finance quoteSummary + earnings calendar
│       ├── news.js                 # Yahoo RSS + análisis de sentimiento
│       ├── screener.js             # Filtros y ordenación del ranking
│       ├── exporter.js             # Exportar CSV y PDF
│       ├── simulation-worker.js    # Web Worker — 5 motores Monte Carlo
│       ├── simulation.js           # Orquestador de simulación (main thread)
│       ├── math-utils.js           # Funciones matemáticas compartidas (PRNG, stats)
│       ├── technicals.js           # RSI, MACD, Bollinger, MA50/200, ATR (local)
│       ├── options.js              # Put/Call ratio y volatilidad implícita (Yahoo)
│       ├── reddit.js               # Sentimiento Reddit / WallStreetBets
│       ├── insiders.js             # Insider trading SEC EDGAR Form 4
│       ├── correlation.js          # Matriz de correlación entre activos
│       ├── portfolio.js            # Radar de mercado y portfolio ideal
│       ├── charts.js               # Renderizado de gráficos (Chart.js)
│       └── config.js               # Configuración y listas de acciones
└── README.md
```

---

## Despliegue

La app está desplegada en **GitHub Pages** — estática, sin servidor, sin build step.

El workflow `.github/workflows/deploy.yml` publica automáticamente el contenido de `public/`
en la rama `gh-pages` cada vez que se hace push a `main`.

**Configuración requerida en el repo (una sola vez):**
Settings → Pages → Source → Deploy from a branch → Branch: `gh-pages` / `/ (root)`

---

## Desarrollo local

Abre `public/index.html` directamente en el navegador, o sirve la carpeta con cualquier servidor HTTP estático:

```bash
# Python
python -m http.server 8080 --directory public

# Node (npx)
npx serve public
```

---

## APIs utilizadas (todas gratuitas, sin registro)

| Fuente | Datos | Endpoint |
|--------|-------|----------|
| Yahoo Finance | Precios históricos, búsqueda, fundamentales | via CORS proxy |
| Yahoo Finance RSS | Noticias | `feeds.finance.yahoo.com/rss/2.0/headline` |
| Yahoo Finance Options | Put/Call ratio, IV, open interest | `query1.finance.yahoo.com/v7/finance/options` |
| FRED (St. Louis Fed) | Macro: tipos, inflación, VIX, curva | `api.stlouisfed.org/fred/series/observations` |
| Wikipedia | Composición IBEX 35 y S&P 500 | via CORS proxy |
| Reddit API | Sentimiento WallStreetBets/stocks | `www.reddit.com/r/.../search.json` |
| SEC EDGAR | Insider trading Form 4 | `efts.sec.gov/LATEST/search-index` |

---

## Modelos de Simulación

| Modelo | Ecuación | Mejor para |
|--------|----------|------------|
| GBM | dS = μ·S·dt + σ·S·dW | Baseline, activos estables |
| Heston | dS + dv (vol estocástica) | Mercados con clusters de volatilidad |
| Jump-Diffusion | dS + J·dN (saltos Poisson) | Acciones con eventos extremos |
| GARCH(1,1) | σ²_t condicional | Mercados con volatilidad variable |
| Bootstrap | Remuestreo histórico | Sin supuestos distribucionales |

---

## Validación Histórica

Rolling backtest automático a 1 año:

1. Toma checkpoints del histórico disponible.
2. En cada checkpoint, calibra el modelo solo con datos anteriores a esa fecha.
3. Simula 252 sesiones futuras.
4. Compara con el precio real observado.
5. Agrega: score histórico, error absoluto medio, acierto direccional, cobertura IC 95%.

---

## Disclaimer

Los resultados de esta herramienta **no constituyen asesoramiento financiero**.
Son simulaciones basadas en datos históricos y modelos estocásticos.
Úselos únicamente con fines educativos y de investigación.

---

## Changelog

### v3.3 — Análisis técnico, opciones, Reddit, insiders, earnings, correlación

- **Fix FRED API** — Migrado de endpoint CSV a API JSON oficial (`api.stlouisfed.org/fred/series/observations`); añadido 4º proxy CORS. Los datos macro (tipo FED, inflación, VIX, curva de tipos) ahora se cargan correctamente.
- **Análisis técnico automático** (`technicals.js`) — RSI 14, MACD (12,26,9), Bandas de Bollinger (20,2), MA20/MA50/MA200, Golden/Death Cross, ATR, soporte & resistencia 52 semanas, señal técnica compuesta con score 0-100.
- **Put/Call ratio & opciones** (`options.js`) — Volumen y open interest de calls/puts, ratio P/C, volatilidad implícita ATM promedio, señal de sentimiento institucional. Fuente: Yahoo Finance options chain.
- **Sentimiento Reddit** (`reddit.js`) — Menciones del ticker en r/wallstreetbets y r/stocks (últimos 7 días), análisis de sentimiento por post, score global ponderado por upvotes.
- **Insider trading** (`insiders.js`) — Últimas transacciones Form 4 de la SEC EDGAR (90 días), con porcentajes de propiedad de insiders e instituciones. Enlace directo a SEC EDGAR.
- **Earnings Calendar** (`fundamentals.js`) — Extracción de `calendarEvents` de Yahoo Finance: fechas de resultados trimestrales (con estimaciones EPS y revenue), fecha ex-dividendo, fecha de pago. Alerta visual si earnings en ≤ 14 días.
- **Correlación entre activos** (`correlation.js`) — Matriz de correlación de Pearson sobre log-returns de hasta 5 años entre todos los activos analizados en la sesión. Heatmap HTML con código de colores + volatilidad anualizada por activo.
- **Pestaña Contexto expandida** — 9 secciones: Análisis técnico · Opciones · Macro · Fundamentales · Earnings Calendar · Noticias · Reddit · Insiders · Correlación.
- **CSP actualizado** — `connect-src` ampliado con `api.stlouisfed.org`, `thingproxy.freeboard.io`, `www.reddit.com`, `efts.sec.gov`, `www.sec.gov`.

### v3.2 — Fix arquitectura, refactoring y seguridad

- **Fix import mismatches** — `fetchStockNews`, `renderMacroPanel`, `renderMacroContextCard`, `renderFundamentalsCard`, `renderNewsCard` ahora exportados e importados correctamente; la app ya no fallaba silenciosamente al arrancar.
- **Web Worker conectado** — Las simulaciones Monte Carlo y el backtest histórico se ejecutan realmente en `simulation-worker.js` vía `new Worker()`; el main thread nunca se bloquea.
- **Screener integrado** — `screener.js` conectado al informe de mercado en `portfolio.js`; los filtros por señal, Sharpe, VaR y retorno esperado ya funcionan sobre el ranking.
- **`math-utils.js` creado** — Funciones PRNG, estadísticas y utilidades matemáticas centralizadas; eliminada la duplicación entre `simulation.js`, `simulation-worker.js` y `portfolio.js`.
- **Moneda dinámica en PDF** — `exporter.js` detecta la moneda real del activo via `getCurrency()`; ya no aparece `$` para acciones europeas o japonesas.
- **Fix estructura datos macro** — `exporter.js` accede correctamente a `macro.indicators.*`; eliminados accesos incorrectos a `macro.fedRate`, `macro.inflation`, etc.
- **Content Security Policy** — Añadida cabecera CSP en `index.html` restringiendo `script-src`, `worker-src`, `connect-src`, `font-src`, `style-src` e `img-src`.
- **Fix FRED API** — Parámetro `vintage_date=` corregido a `observation_start=` en `macro.js`.

### v3.1 — PDF export completo + fix deploy

- **Botón PDF en cabecera de acción** — Aparece solo tras ejecutar la simulación, empujado al extremo derecho del header.
- **Informe PDF completo** — Abre una ventana imprimible con 8 secciones:
  1. Señal y resumen por modelo (precio esperado, retorno, P(subida), Sharpe, Sortino, señal, score)
  2. Métricas de riesgo expandidas (VaR/CVaR al 95% y 99%, MDD, P(−10%), P(−20%), vol 30d y anual)
  3. Validación histórica (score, acierto direccional, error medio/mediano, cobertura IC95%, checkpoints)
  4. Explicación de los 5 modelos (ecuación, caso de uso ideal, limitación)
  5. Contexto macro (tipo FED, inflación, VIX, curva 2s10s, señal macro)
  6. Fundamentales
  7. Noticias y sentimiento (hasta 8 noticias)
  8. Aviso legal
- **Fix bug crítico** — Las dos llamadas a `exportSimulationPDF()` pasaban solo el símbolo; ahora pasan los 7 parámetros de estado.
- **Fix deploy** — GitHub Actions workflow que publica `public/` en rama `gh-pages` automáticamente en cada push a `main`.

### v3.0 — Arquitectura completa

- **Web Workers** — Las simulaciones Monte Carlo se ejecutan en un hilo secundario; la UI nunca se bloquea.
- **Cache IndexedDB** — Datos de precio, macro y fundamentales se cachean con TTL por tipo; no se recargan en cada visita.
- **Datos macro (FRED API)** — Tipo de interés FED, inflación PCE, VIX, curva de tipos, spread crediticio. Sin API key.
- **Fundamentales (Yahoo Finance)** — P/E, P/B, EPS, márgenes, deuda, dividendo y más, via CORS proxy.
- **Noticias y sentimiento** — Feed RSS de Yahoo Finance con análisis de sentimiento por titular.
- **Screener** — Filtros por señal, Sharpe, VaR, retorno esperado y ordenación dinámica sobre el ranking del radar.
- **Exportar CSV** — Descarga el ranking del mercado en un click.
- **Tab Contexto** — Nueva pestaña por acción que integra macro, fundamentales y noticias en una sola vista.
- **Cadena de proxies CORS robusta** — allorigins.win → corsproxy.io → codetabs.com con detección automática de entorno GitHub Pages.
