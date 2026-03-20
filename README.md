# Monte Carlo Stock Simulator — v3.0

Aplicación web completa para simulación Monte Carlo de acciones bursátiles con diseño LiquidGlass. Desplegada en GitHub Pages, sin servidor.

**Desarrollado por David Antizar**

Live: [https://ntizar.github.io/MonteCarloInversion/](https://ntizar.github.io/MonteCarloInversion/)

---

## Novedades en v3.0

- **Web Workers** — Las simulaciones Monte Carlo se ejecutan en un hilo secundario; la UI nunca se bloquea.
- **Cache IndexedDB** — Datos de precio, macro y fundamentales se cachean con TTL por tipo; no se recargan en cada visita.
- **Datos macro (FRED API)** — Tipo de interés FED, inflación PCE, VIX, curva de tipos, spread crediticio. Sin API key.
- **Fundamentales (Yahoo Finance)** — P/E, P/B, EPS, márgenes, deuda, dividendo y más, via CORS proxy.
- **Noticias y sentimiento** — Feed RSS de Yahoo Finance con análisis de sentimiento por titular.
- **Screener** — Filtros por señal, Sharpe, VaR, retorno esperado y ordenación dinámica sobre el ranking del radar.
- **Exportar PDF / CSV** — Descarga el informe de simulación o el ranking del mercado en un click.
- **Tab Contexto** — Nueva pestaña por acción que integra macro, fundamentales y noticias en una sola vista.
- **Cadena de proxies CORS robusta** — allorigins.win → corsproxy.io → codetabs.com con detección automática de entorno GitHub Pages.

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
│   ├── index.html                  # Página principal (v3.0: tab Contexto, panel macro)
│   ├── css/
│   │   └── styles.css              # Diseño LiquidGlass + estilos v3.0
│   └── js/
│       ├── app.js                  # Controlador principal (v3.0: imports macro/fund/news/export)
│       ├── api.js                  # Fetch + cache IndexedDB + cadena CORS
│       ├── cache.js                # IndexedDB con TTL por tipo de dato
│       ├── macro.js                # FRED API — datos macro + render
│       ├── fundamentals.js         # Yahoo Finance quoteSummary + render
│       ├── news.js                 # Yahoo RSS + análisis de sentimiento
│       ├── screener.js             # Filtros y ordenación del ranking
│       ├── exporter.js             # Exportar CSV y PDF
│       ├── simulation-worker.js    # Web Worker — 5 motores Monte Carlo
│       ├── simulation.js           # Orquestador de simulación (main thread)
│       ├── portfolio.js            # Radar de mercado y portfolio ideal
│       ├── charts.js               # Renderizado de gráficos (Chart.js)
│       └── config.js               # Configuración y listas de acciones
└── README.md
```

---

## Despliegue

La app está desplegada en **GitHub Pages** — estática, sin servidor, sin build step.

Para actualizar: hacer push a `main`. GitHub Pages se actualiza automáticamente.

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
| FRED (St. Louis Fed) | Macro: tipos, inflación, VIX, curva | `api.stlouisfed.org/fred/series/observations` |
| Wikipedia | Composición IBEX 35 y S&P 500 | via CORS proxy |

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
