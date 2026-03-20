/* ═══════════════════════════════════════════════════════════════════
   config.js — Markets, tickers, and simulation defaults
   ═══════════════════════════════════════════════════════════════════ */

export const MODELS = {
  gbm:       { id: 'gbm',       name: 'GBM',               fullName: 'Geometric Brownian Motion',     color: '#F0D060', colorRgb: '240,208,96'  },
  heston:    { id: 'heston',    name: 'Heston',             fullName: 'Heston Stochastic Volatility',  color: '#D4A843', colorRgb: '212,168,67'  },
  jump:      { id: 'jump',      name: 'Jump Diffusion',     fullName: 'Merton Jump-Diffusion',         color: '#E8C547', colorRgb: '232,197,71'  },
  garch:     { id: 'garch',     name: 'GARCH(1,1)',         fullName: 'GARCH(1,1) Monte Carlo',        color: '#C49B38', colorRgb: '196,155,56'  },
  bootstrap: { id: 'bootstrap', name: 'Bootstrap',          fullName: 'Historical Bootstrap',          color: '#9A7B2C', colorRgb: '154,123,44'  },
};

export const DEFAULTS = {
  horizon: 252,
  simulations: 3000,
  backtestHorizon: 252,
  backtestSimulations: 750,
  backtestMinTrainingDays: 252,
  backtestCheckpointStep: 63,
  backtestMaxCheckpoints: 12,
  backtestNeutralBandPct: 1.5,
  scannerRange: '3y',
  scannerQuickLookback: 252,
  scannerDeepCandidates: 18,
  scannerPortfolioSize: 8,
  scannerMaxWeight: 0.22,
  scannerCurrentSimulations: 450,
  scannerHistoricalSimulations: 250,
  scannerBatchChunkSize: 25,
  scannerTopRankingCount: 15,
  confidenceLevels: [0.90, 0.95, 0.99],
  riskFreeRate: 0.035,
  buyThresholdProb: 0.65,
  sellThresholdProb: 0.35,
  minExpectedReturn: 0.05,
  minSharpeBuy: 0.5,
};

export const PORTFOLIO_MODELS = ['gbm', 'jump', 'bootstrap'];

export const COMMODITIES = {
  'GC=F': 'Oro',
  'SI=F': 'Plata',
  'HG=F': 'Cobre',
  'PL=F': 'Platino',
  'PA=F': 'Paladio',
  'CL=F': 'Crudo WTI',
  'BZ=F': 'Crudo Brent',
  'NG=F': 'Gas Natural',
  'ZC=F': 'Maiz',
  'ZW=F': 'Trigo',
  'ZS=F': 'Soja',
  'KC=F': 'Cafe',
};

export const PORTFOLIO_UNIVERSES = {
  ibex35: { id: 'ibex35', label: 'IBEX 35 Completo', flag: '🇪🇸', source: 'remote' },
  sp500: { id: 'sp500', label: 'S&P 500 Completo', flag: '🇺🇸', source: 'remote' },
  commodities: { id: 'commodities', label: 'Materias Primas', flag: '⛏️', source: 'static', tickers: COMMODITIES },
};

export const MARKETS = {
  'IBEX 35': {
    flag: '🇪🇸', currency: '€', index: '^IBEX',
    tickers: {
      'ACS.MC':'ACS','ACX.MC':'Acerinox','AMS.MC':'Amadeus IT Group',
      'ANA.MC':'Acciona','ANE.MC':'Acciona Energía','BBVA.MC':'BBVA',
      'BKT.MC':'Bankinter','CABK.MC':'CaixaBank','CLNX.MC':'Cellnex Telecom',
      'COL.MC':'Inmobiliaria Colonial','AENA.MC':'AENA','ELE.MC':'Endesa',
      'ENG.MC':'Enagás','FDR.MC':'Fluidra','FER.MC':'Ferrovial',
      'GRF.MC':'Grifols','IAG.MC':'IAG','IBE.MC':'Iberdrola',
      'IDR.MC':'Indra','ITX.MC':'Inditex','LOG.MC':'Logista',
      'MAP.MC':'MAPFRE','MRL.MC':'Merlin Properties','MTS.MC':'ArcelorMittal',
      'NTGY.MC':'Naturgy','PUIG.MC':'Puig','RED.MC':'Redeia',
      'REP.MC':'Repsol','ROVI.MC':'Laboratorios Rovi','SAB.MC':'Banco Sabadell',
      'SAN.MC':'Banco Santander','SCYR.MC':'Sacyr','SLR.MC':'Solaria',
      'TEF.MC':'Telefónica','UNI.MC':'Unicaja',
    }
  },
  'S&P 500': {
    flag: '🇺🇸', currency: '$', index: '^GSPC',
    tickers: {
      // Tecnología
      'AAPL':'Apple','MSFT':'Microsoft','GOOGL':'Alphabet','AMZN':'Amazon',
      'NVDA':'NVIDIA','META':'Meta','TSLA':'Tesla','AVGO':'Broadcom',
      'ORCL':'Oracle','CRM':'Salesforce','AMD':'AMD','ADBE':'Adobe',
      'INTC':'Intel','CSCO':'Cisco','QCOM':'Qualcomm','IBM':'IBM',
      'NOW':'ServiceNow','INTU':'Intuit','AMAT':'Applied Materials','MU':'Micron',
      'PANW':'Palo Alto Networks','SNOW':'Snowflake','PLTR':'Palantir','APP':'AppLovin',
      'FTNT':'Fortinet','KLAC':'KLA Corp','LRCX':'Lam Research','MRVL':'Marvell',
      // Financieras
      'JPM':'JPMorgan Chase','V':'Visa','MA':'Mastercard','BAC':'Bank of America',
      'WFC':'Wells Fargo','GS':'Goldman Sachs','MS':'Morgan Stanley',
      'BLK':'BlackRock','AXP':'American Express','C':'Citigroup',
      'SCHW':'Charles Schwab','COF':'Capital One','USB':'U.S. Bancorp',
      'PGR':'Progressive','CB':'Chubb','MMC':'Marsh & McLennan',
      // Salud
      'UNH':'UnitedHealth','JNJ':'Johnson & Johnson','LLY':'Eli Lilly',
      'PFE':'Pfizer','ABBV':'AbbVie','MRK':'Merck','TMO':'Thermo Fisher',
      'ABT':'Abbott','DHR':'Danaher','BMY':'Bristol-Myers Squibb',
      'AMGN':'Amgen','GILD':'Gilead','VRTX':'Vertex','REGN':'Regeneron',
      'ISRG':'Intuitive Surgical','SYK':'Stryker','ELV':'Elevance',
      // Consumo discrecional
      'WMT':'Walmart','PG':'Procter & Gamble','KO':'Coca-Cola',
      'PEP':'PepsiCo','COST':'Costco','MCD':"McDonald's",'NKE':'Nike',
      'SBUX':'Starbucks','HD':'Home Depot','LOW':'Lowe\'s',
      'TGT':'Target','TJX':'TJ Maxx','BKNG':'Booking Holdings',
      // Energía & Industrial
      'XOM':'ExxonMobil','CVX':'Chevron','COP':'ConocoPhillips',
      'CAT':'Caterpillar','BA':'Boeing','HON':'Honeywell','UPS':'UPS',
      'GE':'GE Aerospace','RTX':'RTX Corp','LMT':'Lockheed Martin',
      'DE':'John Deere','MMM':'3M','FDX':'FedEx',
      // Comunicaciones & Media
      'DIS':'Walt Disney','NFLX':'Netflix','CMCSA':'Comcast','T':'AT&T','VZ':'Verizon',
      'TMUS':'T-Mobile','WBD':'Warner Bros Discovery',
      // Utilities & REITs
      'NEE':'NextEra Energy','DUK':'Duke Energy','SO':'Southern Company',
      'AMT':'American Tower','PLD':'Prologis','EQIX':'Equinix',
      // Materiales
      'LIN':'Linde','APD':'Air Products','SHW':'Sherwin-Williams',
    }
  },
  'EURO STOXX': {
    flag: '🇪🇺', currency: '€', index: '^STOXX50E',
    tickers: {
      'ASML.AS':'ASML','MC.PA':'LVMH','SAP.DE':'SAP','SIE.DE':'Siemens',
      'OR.PA':'L\'Oréal','TTE.PA':'TotalEnergies','AI.PA':'Air Liquide',
      'ALV.DE':'Allianz','SU.PA':'Schneider Electric','BNP.PA':'BNP Paribas',
      'DTE.DE':'Deutsche Telekom','BAS.DE':'BASF','ENEL.MI':'Enel',
      'ISP.MI':'Intesa Sanpaolo','ABI.BR':'AB InBev','INGA.AS':'ING Group',
      'AIR.PA':'Airbus','MUV2.DE':'Munich Re','DPW.DE':'DHL Group',
    }
  },
  'FTSE 100': {
    flag: '🇬🇧', currency: '£', index: '^FTSE',
    tickers: {
      'AZN.L':'AstraZeneca','SHEL.L':'Shell','HSBA.L':'HSBC','ULVR.L':'Unilever',
      'BP.L':'BP','RIO.L':'Rio Tinto','GSK.L':'GSK','DGE.L':'Diageo',
      'LSEG.L':'London Stock Exchange','REL.L':'RELX','NG.L':'National Grid',
      'AAL.L':'Anglo American','LLOY.L':'Lloyds Banking','BARC.L':'Barclays',
      'VOD.L':'Vodafone','BA.L':'BAE Systems',
    }
  },
  'Nikkei 225': {
    flag: '🇯🇵', currency: '¥', index: '^N225',
    tickers: {
      '7203.T':'Toyota','6758.T':'Sony','6902.T':'DENSO','6861.T':'Keyence',
      '8306.T':'MUFG','9984.T':'SoftBank','7267.T':'Honda','4502.T':'Takeda',
      '7741.T':'HOYA','6501.T':'Hitachi','9432.T':'NTT','6098.T':'Recruit',
      '6367.T':'Daikin','4568.T':'Daiichi Sankyo',
    }
  },
  'Crypto': {
    flag: '₿', currency: '$', index: 'BTC-USD',
    tickers: {
      'BTC-USD':'Bitcoin','ETH-USD':'Ethereum','SOL-USD':'Solana',
      'BNB-USD':'Binance Coin','XRP-USD':'XRP','ADA-USD':'Cardano',
      'DOGE-USD':'Dogecoin','AVAX-USD':'Avalanche','DOT-USD':'Polkadot',
      'MATIC-USD':'Polygon','LINK-USD':'Chainlink','UNI-USD':'Uniswap',
      'ATOM-USD':'Cosmos','LTC-USD':'Litecoin','NEAR-USD':'NEAR Protocol',
    }
  },
  'Materias Primas': {
    flag: '⛏️', currency: '$', index: 'GC=F',
    tickers: COMMODITIES,
  },
};

// Flat lookup: ticker → name
export const TICKER_NAMES = {};
for (const market of Object.values(MARKETS)) {
  Object.assign(TICKER_NAMES, market.tickers);
}

export function registerMarketTickers(marketName, tickers) {
  if (!MARKETS[marketName] || !tickers) return;
  MARKETS[marketName].tickers = tickers;
  Object.assign(TICKER_NAMES, tickers);
}

export function getTickerName(symbol) {
  return TICKER_NAMES[symbol] || symbol;
}

export function getCurrency(symbol) {
  for (const market of Object.values(MARKETS)) {
    if (symbol in market.tickers) return market.currency;
  }
  if (symbol.endsWith('.MC')) return '€';
  if (symbol.endsWith('.PA') || symbol.endsWith('.AS') || symbol.endsWith('.MI') || symbol.endsWith('.BR')) return '€';
  if (symbol.endsWith('.DE')) return '€';
  if (symbol.endsWith('.L')) return '£';
  if (symbol.endsWith('.T') || symbol.endsWith('.TYO')) return '¥';
  if (symbol.endsWith('.HK')) return 'HK$';
  if (symbol.endsWith('.SS') || symbol.endsWith('.SZ')) return '¥';
  if (symbol.endsWith('.AX')) return 'A$';
  if (symbol.endsWith('.TO') || symbol.endsWith('.V')) return 'C$';
  if (symbol.includes('-USD')) return '$';
  return '$';
}
