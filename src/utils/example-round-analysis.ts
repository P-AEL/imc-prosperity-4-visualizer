export interface ExamplePriceRow {
  day: number;
  timestamp: number;
  product: string;
  bidPrice1: number | null;
  bidVolume1: number | null;
  bidPrice2: number | null;
  bidVolume2: number | null;
  bidPrice3: number | null;
  bidVolume3: number | null;
  askPrice1: number | null;
  askVolume1: number | null;
  askPrice2: number | null;
  askVolume2: number | null;
  askPrice3: number | null;
  askVolume3: number | null;
  midPrice: number | null;
  profitAndLoss: number | null;
}

export interface ExampleTradeRow {
  timestamp: number;
  buyer: string;
  seller: string;
  symbol: string;
  currency: string;
  price: number;
  quantity: number;
}

export interface ExampleProductMetrics {
  product: string;
  snapshotCount: number;
  tradeCount: number;
  openMidPrice: number | null;
  closeMidPrice: number | null;
  lowMidPrice: number | null;
  highMidPrice: number | null;
  absoluteChange: number | null;
  percentageChange: number | null;
  averageSpread: number | null;
  minSpread: number | null;
  maxSpread: number | null;
  spreadCoverage: number;
  averageTopOfBookVolume: number | null;
  totalTradedVolume: number;
  averageTradeSize: number | null;
  totalTradedNotional: number;
  volumeWeightedAveragePrice: number | null;
  tradePriceToCloseBasis: number | null;
  firstTradeTimestamp: number | null;
  lastTradeTimestamp: number | null;
}

export interface ExampleRoundDayAnalysis {
  round: number;
  day: number;
  products: string[];
  priceRowsByProduct: Record<string, ExamplePriceRow[]>;
  tradeRowsByProduct: Record<string, ExampleTradeRow[]>;
  metricsByProduct: Record<string, ExampleProductMetrics>;
}

interface ExampleRoundFileSet {
  day: number;
  pricesFileName: string;
  tradesFileName: string;
}

function parseDelimitedFile<T>(raw: string, parser: (values: string[]) => T): T[] {
  const lines = raw.trim().split(/\r?\n/);
  return lines
    .slice(1)
    .filter(Boolean)
    .map(line => parser(line.split(';')));
}

function parseNumber(value: string): number | null {
  if (value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePriceRows(raw: string): ExamplePriceRow[] {
  return parseDelimitedFile(raw, values => ({
    day: Number(values[0]),
    timestamp: Number(values[1]),
    product: values[2],
    bidPrice1: parseNumber(values[3]),
    bidVolume1: parseNumber(values[4]),
    bidPrice2: parseNumber(values[5]),
    bidVolume2: parseNumber(values[6]),
    bidPrice3: parseNumber(values[7]),
    bidVolume3: parseNumber(values[8]),
    askPrice1: parseNumber(values[9]),
    askVolume1: parseNumber(values[10]),
    askPrice2: parseNumber(values[11]),
    askVolume2: parseNumber(values[12]),
    askPrice3: parseNumber(values[13]),
    askVolume3: parseNumber(values[14]),
    midPrice: parseNumber(values[15]),
    profitAndLoss: parseNumber(values[16]),
  }));
}

function parseTradeRows(raw: string): ExampleTradeRow[] {
  return parseDelimitedFile(raw, values => ({
    timestamp: Number(values[0]),
    buyer: values[1],
    seller: values[2],
    symbol: values[3],
    currency: values[4],
    price: Number(values[5]),
    quantity: Number(values[6]),
  }));
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function min(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.min(...values);
}

function max(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.max(...values);
}

function buildMetrics(
  product: string,
  priceRows: ExamplePriceRow[],
  tradeRows: ExampleTradeRow[],
): ExampleProductMetrics {
  const midPrices = priceRows.flatMap(row => (row.midPrice === null ? [] : [row.midPrice]));
  const spreads = priceRows.flatMap(row =>
    row.bidPrice1 !== null && row.askPrice1 !== null ? [row.askPrice1 - row.bidPrice1] : [],
  );
  const topOfBookVolumes = priceRows.flatMap(row => {
    const values: number[] = [];

    if (row.bidVolume1 !== null) {
      values.push(row.bidVolume1);
    }

    if (row.askVolume1 !== null) {
      values.push(Math.abs(row.askVolume1));
    }

    return values.length > 0 ? [values.reduce((total, value) => total + value, 0)] : [];
  });
  const tradeVolumes = tradeRows.map(row => Math.abs(row.quantity));
  const totalTradedVolume = sum(tradeVolumes);
  const totalTradedNotional = sum(tradeRows.map(row => row.price * Math.abs(row.quantity)));
  const volumeWeightedAveragePrice = totalTradedVolume > 0 ? totalTradedNotional / totalTradedVolume : null;
  const closeMidPrice = midPrices.length > 0 ? midPrices[midPrices.length - 1] : null;

  return {
    product,
    snapshotCount: priceRows.length,
    tradeCount: tradeRows.length,
    openMidPrice: midPrices.length > 0 ? midPrices[0] : null,
    closeMidPrice,
    lowMidPrice: min(midPrices),
    highMidPrice: max(midPrices),
    absoluteChange:
      midPrices.length > 1 && midPrices[0] !== null && closeMidPrice !== null ? closeMidPrice - midPrices[0] : null,
    percentageChange:
      midPrices.length > 1 && midPrices[0] !== null && midPrices[0] !== 0 && closeMidPrice !== null
        ? ((closeMidPrice - midPrices[0]) / midPrices[0]) * 100
        : null,
    averageSpread: average(spreads),
    minSpread: min(spreads),
    maxSpread: max(spreads),
    spreadCoverage: priceRows.length > 0 ? spreads.length / priceRows.length : 0,
    averageTopOfBookVolume: average(topOfBookVolumes),
    totalTradedVolume,
    averageTradeSize: tradeRows.length > 0 ? totalTradedVolume / tradeRows.length : null,
    totalTradedNotional,
    volumeWeightedAveragePrice,
    tradePriceToCloseBasis:
      volumeWeightedAveragePrice !== null && closeMidPrice !== null ? volumeWeightedAveragePrice - closeMidPrice : null,
    firstTradeTimestamp: tradeRows.length > 0 ? tradeRows[0].timestamp : null,
    lastTradeTimestamp: tradeRows.length > 0 ? tradeRows[tradeRows.length - 1].timestamp : null,
  };
}

function buildDayAnalysis(round: number, day: number, pricesRaw: string, tradesRaw: string): ExampleRoundDayAnalysis {
  const priceRows = parsePriceRows(pricesRaw);
  const tradeRows = parseTradeRows(tradesRaw);
  const productSet = new Set<string>();

  for (const row of priceRows) {
    productSet.add(row.product);
  }

  for (const row of tradeRows) {
    productSet.add(row.symbol);
  }

  const products = [...productSet].sort((a, b) => a.localeCompare(b));
  const priceRowsByProduct: Record<string, ExamplePriceRow[]> = {};
  const tradeRowsByProduct: Record<string, ExampleTradeRow[]> = {};
  const metricsByProduct: Record<string, ExampleProductMetrics> = {};

  for (const product of products) {
    priceRowsByProduct[product] = priceRows.filter(row => row.product === product);
    tradeRowsByProduct[product] = tradeRows.filter(row => row.symbol === product);
    metricsByProduct[product] = buildMetrics(product, priceRowsByProduct[product], tradeRowsByProduct[product]);
  }

  return {
    round,
    day,
    products,
    priceRowsByProduct,
    tradeRowsByProduct,
    metricsByProduct,
  };
}

const EXAMPLE_ROUND_FILE_SETS: ExampleRoundFileSet[] = [
  {
    day: -2,
    pricesFileName: 'prices_round_1_day_-2.csv',
    tradesFileName: 'trades_round_1_day_-2.csv',
  },
  {
    day: -1,
    pricesFileName: 'prices_round_1_day_-1.csv',
    tradesFileName: 'trades_round_1_day_-1.csv',
  },
  {
    day: 0,
    pricesFileName: 'prices_round_1_day_0.csv',
    tradesFileName: 'trades_round_1_day_0.csv',
  },
];

let exampleRoundAnalysesPromise: Promise<ExampleRoundDayAnalysis[]> | null = null;

async function loadTextFile(fileName: string): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}${fileName}`);

  if (!response.ok) {
    throw new Error(`Failed to load example dataset: ${fileName}`);
  }

  return response.text();
}

export async function loadExampleRoundAnalyses(): Promise<ExampleRoundDayAnalysis[]> {
  if (exampleRoundAnalysesPromise === null) {
    exampleRoundAnalysesPromise = Promise.all(
      EXAMPLE_ROUND_FILE_SETS.map(async fileSet => {
        const [pricesRaw, tradesRaw] = await Promise.all([
          loadTextFile(fileSet.pricesFileName),
          loadTextFile(fileSet.tradesFileName),
        ]);

        return buildDayAnalysis(1, fileSet.day, pricesRaw, tradesRaw);
      }),
    );
  }

  return exampleRoundAnalysesPromise;
}

export function getExampleRoundAnalysisKey(round: number, day: number): string {
  return `round-${round}-day-${day}`;
}

export function getExampleRoundAnalysisOptions(
  analyses: ExampleRoundDayAnalysis[],
): Array<{ value: string; label: string }> {
  return analyses.map(analysis => ({
    value: getExampleRoundAnalysisKey(analysis.round, analysis.day),
    label: `Round ${analysis.round} / Day ${analysis.day}`,
  }));
}

export function getExampleRoundAnalysesByKey(
  analyses: ExampleRoundDayAnalysis[],
): Record<string, ExampleRoundDayAnalysis> {
  return Object.fromEntries(
    analyses.map(analysis => [getExampleRoundAnalysisKey(analysis.round, analysis.day), analysis]),
  ) as Record<string, ExampleRoundDayAnalysis>;
}
