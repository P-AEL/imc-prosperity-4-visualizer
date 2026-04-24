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
  day: number;
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

export interface RoundDayKey {
  round: number;
  day: number;
}

interface ExampleRoundFileSet {
  day: number;
  pricesFileName: string;
  tradesFileName: string;
}

const DEFAULT_TIMELINE_STEP = 100;

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
  return parseDelimitedFile(raw, values => {
    const bidPrice1 = parseNumber(values[3]);
    const askPrice1 = parseNumber(values[9]);
    const parsedMidPrice = parseNumber(values[15]);
    const midPrice = parsedMidPrice === 0 && bidPrice1 === null && askPrice1 === null ? null : parsedMidPrice;

    return {
      day: Number(values[0]),
      timestamp: Number(values[1]),
      product: values[2],
      bidPrice1,
      bidVolume1: parseNumber(values[4]),
      bidPrice2: parseNumber(values[5]),
      bidVolume2: parseNumber(values[6]),
      bidPrice3: parseNumber(values[7]),
      bidVolume3: parseNumber(values[8]),
      askPrice1,
      askVolume1: parseNumber(values[10]),
      askPrice2: parseNumber(values[11]),
      askVolume2: parseNumber(values[12]),
      askPrice3: parseNumber(values[13]),
      askVolume3: parseNumber(values[14]),
      midPrice,
      profitAndLoss: parseNumber(values[16]),
    };
  });
}

function parseTradeRows(raw: string, day: number): ExampleTradeRow[] {
  return parseDelimitedFile(raw, values => ({
    day,
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

export function buildRoundDayAnalysis(
  round: number,
  day: number,
  pricesRaw: string,
  tradesRaw: string,
): ExampleRoundDayAnalysis {
  const priceRows = parsePriceRows(pricesRaw);
  const tradeRows = parseTradeRows(tradesRaw, day);
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

function getSortedUniqueTimestamps(analyses: ExampleRoundDayAnalysis[]): number[] {
  const timestamps = new Set<number>();

  for (const analysis of analyses) {
    for (const rows of Object.values(analysis.priceRowsByProduct)) {
      for (const row of rows) {
        timestamps.add(row.timestamp);
      }
    }

    for (const rows of Object.values(analysis.tradeRowsByProduct)) {
      for (const row of rows) {
        timestamps.add(row.timestamp);
      }
    }
  }

  return [...timestamps].sort((a, b) => a - b);
}

export function getRoundTimelineSpan(analyses: ExampleRoundDayAnalysis[]): number {
  const timestamps = getSortedUniqueTimestamps(analyses);

  if (timestamps.length === 0) {
    return DEFAULT_TIMELINE_STEP;
  }

  if (timestamps.length === 1) {
    return timestamps[0] + DEFAULT_TIMELINE_STEP;
  }

  let minStep = Number.POSITIVE_INFINITY;
  for (let i = 1; i < timestamps.length; i++) {
    const step = timestamps[i] - timestamps[i - 1];

    if (step > 0) {
      minStep = Math.min(minStep, step);
    }
  }

  return timestamps[timestamps.length - 1] + (Number.isFinite(minStep) ? minStep : DEFAULT_TIMELINE_STEP);
}

export function buildAllDaysRoundAnalysis(analyses: ExampleRoundDayAnalysis[]): ExampleRoundDayAnalysis {
  const sortedAnalyses = [...analyses].sort((a, b) => a.day - b.day);

  if (sortedAnalyses.length === 0) {
    throw new Error('Cannot build an all-days analysis without any day analyses.');
  }

  const round = sortedAnalyses[0].round;
  const timelineSpan = getRoundTimelineSpan(sortedAnalyses);
  const productSet = new Set<string>();

  for (const analysis of sortedAnalyses) {
    for (const product of analysis.products) {
      productSet.add(product);
    }
  }

  const products = [...productSet].sort((a, b) => a.localeCompare(b));
  const priceRowsByProduct: Record<string, ExamplePriceRow[]> = {};
  const tradeRowsByProduct: Record<string, ExampleTradeRow[]> = {};
  const metricsByProduct: Record<string, ExampleProductMetrics> = {};

  for (const product of products) {
    const combinedPriceRows: ExamplePriceRow[] = [];
    const combinedTradeRows: ExampleTradeRow[] = [];

    sortedAnalyses.forEach((analysis, index) => {
      const timestampOffset = index * timelineSpan;

      combinedPriceRows.push(
        ...(analysis.priceRowsByProduct[product] ?? []).map(row => ({
          ...row,
          timestamp: row.timestamp + timestampOffset,
        })),
      );

      combinedTradeRows.push(
        ...(analysis.tradeRowsByProduct[product] ?? []).map(row => ({
          ...row,
          timestamp: row.timestamp + timestampOffset,
        })),
      );
    });

    combinedPriceRows.sort((a, b) => a.timestamp - b.timestamp);
    combinedTradeRows.sort((a, b) => a.timestamp - b.timestamp);

    priceRowsByProduct[product] = combinedPriceRows;
    tradeRowsByProduct[product] = combinedTradeRows;
    metricsByProduct[product] = buildMetrics(product, combinedPriceRows, combinedTradeRows);
  }

  return {
    round,
    day: sortedAnalyses[0].day,
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

        return buildRoundDayAnalysis(1, fileSet.day, pricesRaw, tradesRaw);
      }),
    );
  }

  return exampleRoundAnalysesPromise;
}

export function getExampleRoundAnalysisKey(round: number, day: number): string {
  return `round-${round}-day-${day}`;
}

export function getRoundDayFromFileName(fileName: string): RoundDayKey | null {
  const roundMatch = fileName.match(/round_(\d+)/i);
  const dayMatch = fileName.match(/day_(-?\d+)/i);

  if (dayMatch === null) {
    return null;
  }

  return {
    round: roundMatch === null ? 1 : Number(roundMatch[1]),
    day: Number(dayMatch[1]),
  };
}

export function getRoundDayFromPriceCsv(raw: string, fileName?: string): RoundDayKey | null {
  const fromFileName = fileName ? getRoundDayFromFileName(fileName) : null;
  if (fromFileName !== null) {
    return fromFileName;
  }

  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return null;
  }

  const firstValues = lines[1].split(';');
  if (firstValues.length < 2) {
    return null;
  }

  const day = Number(firstValues[0]);
  if (!Number.isFinite(day)) {
    return null;
  }

  return {
    round: 1,
    day,
  };
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
