# Monte Carlo Stock Simulator

> Simulación institucional de riesgos bursátiles — directo en tu navegador, sin servidor, sin registro, sin coste.

**[Abrir la aplicación →](https://ntizar.github.io/MonteCarloInversion/)**

Desarrollado por **David Antizar**

---

## Por qué existe esta herramienta

La mayoría de simuladores de bolsa para retail son grafiquitos de colores sin rigor estadístico. Este proyecto hace lo contrario: aplica los mismos modelos estocásticos que usan los escritorios de derivados (GBM, Heston, Jump-Diffusion, GARCH) y añade una capa de validación histórica real, todo ejecutado en el navegador del usuario en segundos.

El resultado: puedes analizar cualquier acción del mundo — señal, riesgo cuantificado, contexto macro, técnicos, opciones, sentimiento, insiders — y descargarlo como informe PDF, sin pagar ni dar tus datos a nadie.

---

## Qué puedes hacer

### Simular el futuro de cualquier acción
Escribe un ticker (AAPL, NVDA, ASML.AS, BTC-USD...) y en segundos obtienes:
- **Fan chart** con trayectorias de precio y bandas de confianza 95%/99%
- **Señal BUY / HOLD / SELL** con score 0–100, consenso entre los 5 modelos
- **VaR y CVaR** al 95% y 99% — cuánto puedes perder en el peor escenario
- **Probabilidades** de caída ≥10%, ≥20%, ≥30%
- **Sharpe y Sortino** — rentabilidad ajustada al riesgo

### Comparar modelos y confiar en el más preciso
Los 5 modelos se ejecutan en paralelo en un Web Worker (sin bloquear la interfaz):

| Modelo | Qué captura mejor |
|--------|------------------|
| **GBM** — Geometric Brownian Motion | Activos líquidos estables, baseline teórico |
| **Heston** — Volatilidad estocástica | Mercados con clusters de volatilidad |
| **Jump-Diffusion** (Merton) | Saltos por earnings, noticias o crisis |
| **GARCH(1,1)** | Volatilidad variable en el tiempo |
| **Bootstrap** | Sin supuestos distribucionales, realismo histórico |

El backtest automático a 1 año te dice qué modelo funcionó mejor históricamente para esa acción concreta — y lo usa como modelo de referencia.

### Contexto completo: 9 fuentes de datos en paralelo
La pestaña **Contexto** carga simultáneamente, con interpretación en lenguaje natural para el activo analizado:

1. **Análisis técnico** — RSI, MACD, Bollinger, MA20/50/200, Golden Cross, ATR, soporte/resistencia. Score técnico compuesto 0–100.
2. **Opciones** — Put/Call ratio por volumen y open interest, IV implícita ATM. Señal de sentimiento institucional.
3. **Contexto macro** — FED rate, inflación, VIX, bono 10Y, curva 2s10s. Señal FAVORABLE / MIXTO / ADVERSO.
4. **Fundamentales** — P/E, ROE, márgenes, crecimiento BPA, deuda, consenso analistas.
5. **Earnings Calendar** — Próximas fechas de resultados con estimaciones de consenso. Alerta si ≤14 días.
6. **Noticias** — Últimas noticias con análisis de sentimiento por titular y score global.
7. **Sentimiento Reddit** — Menciones en r/wallstreetbets y r/stocks. Score ponderado por upvotes.
8. **Insider Trading** — Filings Form 4 de la SEC (últimos 90 días). % propiedad insiders e instituciones.
9. **Correlación** — Matriz Pearson entre todos los activos analizados en la sesión. Para construir carteras diversificadas.

### Escanear mercados enteros y construir un portfolio ideal
El **Radar de Mercado** analiza universos completos:
- IBEX 35, S&P 500 (~100 tickers curados), EURO STOXX, FTSE 100, Nikkei 225, Crypto, Materias Primas
- Fase rápida (todo el universo) + fase profunda (Monte Carlo + backtest para los finalistas)
- Screener con filtros por señal, Sharpe mínimo, VaR máximo y retorno esperado
- Portfolio ideal con pesos sugeridos por optimización Sharpe
- Tabla paginada para universos grandes

### Exportar informes profesionales
- **PDF** — Informe completo imprimible: señal, riesgo, backtest, modelos, macro, fundamentales, noticias, técnicos, opciones, insiders, Reddit, aviso legal. Con párrafos de interpretación contextualizados para el activo analizado.
- **CSV** — Ranking completo del universo escaneado

---

## Stack técnico

- **100% frontend** — Vanilla JS (ES modules), Chart.js, zero dependencias de build
- **Sin backend** — Todos los cálculos en el navegador
- **Web Worker** — Monte Carlo y backtest en hilo secundario; la UI nunca se congela
- **IndexedDB cache** — TTL diferenciado: precios 4h, fundamentales 24h, macro 6h, noticias 15min
- **CORS proxy chain** — 4 proxies en cascada con fallback automático
- **Content Security Policy** estricta en `index.html`
- **GitHub Actions CI/CD** — `public/` publicado en `gh-pages` en cada push a `main`

### APIs utilizadas (todas gratuitas, sin registro)

| Fuente | Datos |
|--------|-------|
| Yahoo Finance | Precios históricos OHLCV, fundamentales, opciones |
| Yahoo Finance RSS | Noticias y sentimiento |
| FRED (St. Louis Fed) | Macro: tipos, inflación, VIX, curva de tipos |
| Wikipedia | Composición IBEX 35 y S&P 500 |
| Reddit (JSON público) | Sentimiento WallStreetBets / r/stocks |
| SEC EDGAR EFTS | Insider trading Form 4 |

---

## Estructura del proyecto

```
MonteCarloInversion/
├── .github/workflows/deploy.yml   # CI/CD — publica public/ en gh-pages
└── public/
    ├── index.html                 # SPA con CSP completo
    ├── css/styles.css             # Design system LiquidGlass (Black & Gold)
    └── js/
        ├── app.js                 # Controlador principal
        ├── api.js                 # Yahoo Finance + cadena CORS
        ├── cache.js               # IndexedDB TTL
        ├── config.js              # Mercados, tickers, defaults
        ├── simulation.js          # Orquestador Monte Carlo
        ├── simulation-worker.js   # Web Worker — 5 motores estocásticos
        ├── math-utils.js          # PRNG, estadísticas (compartido Worker/main)
        ├── charts.js              # Visualizaciones Chart.js
        ├── macro.js               # FRED API
        ├── fundamentals.js        # Yahoo quoteSummary + earnings
        ├── news.js                # RSS + sentimiento
        ├── technicals.js          # RSI, MACD, Bollinger, MA, ATR (local)
        ├── options.js             # Put/Call ratio, IV implícita
        ├── reddit.js              # Sentimiento Reddit
        ├── insiders.js            # SEC EDGAR Form 4
        ├── correlation.js         # Matriz Pearson entre activos
        ├── screener.js            # Filtros sobre ranking de mercado
        ├── portfolio.js           # Radar de mercado + portfolio ideal
        └── exporter.js            # CSV y PDF
```

---

## Desarrollo local

```bash
# Python
python -m http.server 8080 --directory public

# Node
npx serve public
```

---

## Aviso legal

Los resultados no constituyen asesoramiento financiero. Son simulaciones estadísticas sobre datos históricos con fines educativos y de investigación. Úsalos bajo tu propia responsabilidad.

---

## Changelog

### v3.5 — Pestaña Contexto rehecha + PDF Reddit + S&P 500 ampliado + paginación ranking

- **Pestaña Contexto corregida** — Bugs de lógica `!== undefined` eliminados. Ahora usa flags `_optionsLoaded`, `_redditLoaded`, `_insidersLoaded` para mostrar correctamente el estado de carga. La re-renderización completa al finalizar los fetches funciona siempre.
- **Contexto interpretativo en Contexto** — Cada sección (técnicos, opciones, macro, fundamentales, noticias, Reddit, insiders, correlación) incluye un párrafo en lenguaje natural que explica qué significa cada dato para ese activo concreto.
- **Sección Reddit en PDF** — Nueva sección 11 en el informe PDF: menciones, sentimiento global, posts más votados con subreddit, título, score y fecha.
- **Contexto interpretativo en PDF** — Párrafos de interpretación añadidos en las secciones de Macro, Fundamentales, Técnicos y Opciones del PDF.
- **S&P 500 fallback ampliado** — De 65 a ~100 tickers representativos, organizados por sector: Tecnología, Financieras, Salud, Consumo, Energía/Industrial, Comunicaciones, Utilities/REITs, Materiales.
- **Paginación en tabla de ranking** — 25 activos por página con controles numéricos. Se integra con el screener existente; al aplicar filtros resetea a la página 1.
- **CSS** — Estilos para paginación (`.ranking-pagination`, `.page-btn`) y párrafos interpretativos (`.context-interp`).
- **`exporter.js` v3.5** — Firma ampliada a 11 parámetros (`redditData`). Versión actualizada en cabecera y footer del PDF.
- **`app.js`** — Tres llamadas a `exportSimulationPDF` actualizadas con `currentReddit`. Variables de estado `currentFundamentals` y `currentNews` reseteadas correctamente al cambiar de símbolo.

### v3.4 — PDF enriquecido con técnicos, opciones e insider trading

- **Análisis Técnico en PDF** — Sección con tabla de 4 bloques: MA20/50/200 + Golden/Death Cross, RSI (14) + zona, MACD (12,26,9) con cruce, Bollinger (20,2σ), soporte/resistencia 52s, ATR/volumen. Score técnico 0–100.
- **Opciones en PDF** — Volumen calls/puts, P/C ratio, open interest, IV implícita ATM, señal de sentimiento.
- **Insider Trading en PDF** — Form 4 (SEC EDGAR, 90 días): insider, fecha, tipo. % propiedad insiders e institucional.
- **`exporter.js` v3.4** — Firma ampliada de 7 a 10 parámetros.
- **`app.js`** — Llamadas a `exportSimulationPDF` actualizadas.

### v3.3 — Análisis técnico, opciones, Reddit, insiders, earnings, correlación

- **Fix FRED macro** — Migrado a API JSON oficial (`api.stlouisfed.org/fred/series/observations`); 4º proxy CORS añadido.
- **`technicals.js`** — RSI 14, MACD (12,26,9), Bollinger (20,2), MA20/50/200, Golden/Death Cross, ATR, soporte/resistencia 52s. Score 0–100. Computación 100% local.
- **`options.js`** — Put/Call ratio, IV implícita ATM, señal sentimiento institucional.
- **`reddit.js`** — Menciones en r/wallstreetbets + r/stocks (7 días), sentimiento ponderado por upvotes.
- **`insiders.js`** — Form 4 SEC EDGAR (90 días), % propiedad insiders e instituciones.
- **Earnings Calendar** — Extracción `calendarEvents`: fechas earnings + EPS/revenue estimados + ex-dividendo. Alerta urgente ≤14 días.
- **`correlation.js`** — Matriz Pearson sobre log-returns diarios. Heatmap HTML + volatilidad anualizada.
- **Pestaña Contexto** — Ampliada de 3 a 9 secciones en paralelo.
- **CSP** — `connect-src` ampliado con nuevas fuentes.

### v3.2 — Fix arquitectura, refactoring y seguridad

- **Fix imports** — `fetchStockNews`, `renderMacroPanel`, `renderMacroContextCard`, `renderFundamentalsCard`, `renderNewsCard` corregidos.
- **Web Worker** — Simulaciones y backtest en `simulation-worker.js`; main thread no bloqueado.
- **Screener** — Conectado al informe de mercado en `portfolio.js`.
- **`math-utils.js`** — PRNG y estadísticas centralizados; duplicación eliminada.
- **Moneda dinámica en PDF** — `getCurrency()` para €, £, ¥.
- **Content Security Policy** — Cabecera CSP en `index.html`.

### v3.1 — PDF export completo + fix deploy

- **Botón PDF** — Tras ejecutar simulación, lanza ventana imprimible.
- **Informe PDF** — 8 secciones: señal, riesgo, backtest, modelos, macro, fundamentales, noticias, aviso legal.
- **Fix deploy** — GitHub Actions publica `public/` en `gh-pages` automáticamente.

### v3.0 — Arquitectura completa

- Web Workers, Cache IndexedDB, FRED API, Fundamentales Yahoo Finance, Noticias y sentimiento, Screener, Exportar CSV, Tab Contexto, cadena CORS con 3 proxies.
