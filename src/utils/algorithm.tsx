import { Text } from '@mantine/core';
import { ReactNode } from 'react';
import {
  ActivityLogRow,
  Algorithm,
  AlgorithmDataRow,
  AlgorithmSummary,
  CompressedAlgorithmDataRow,
  CompressedListing,
  CompressedObservations,
  CompressedOrder,
  CompressedOrderDepth,
  CompressedTrade,
  CompressedTradingState,
  ConversionObservation,
  Listing,
  Observation,
  Order,
  OrderDepth,
  Product,
  ProsperitySymbol,
  Trade,
  TradingState,
} from '../models.ts';
import { authenticatedAxios } from './axios.ts';

interface ServerLogEntry {
  sandboxLog: string;
  lambdaLog: string;
  timestamp: number;
}

interface ServerTradeHistoryEntry {
  timestamp: number;
  buyer: string;
  seller: string;
  symbol: string;
  currency?: string;
  price: number;
  quantity: number;
}

interface ServerLogFile {
  submissionId: string;
  activitiesLog: string;
  logs: ServerLogEntry[];
  tradeHistory: ServerTradeHistoryEntry[];
}

export class AlgorithmParseError extends Error {
  public constructor(public readonly node: ReactNode) {
    super('Failed to parse algorithm logs');
  }
}

function getColumnValues(columns: string[], indices: number[]): number[] {
  const values: number[] = [];

  for (const index of indices) {
    const value = columns[index];
    if (value !== '') {
      values.push(parseFloat(value));
    }
  }

  return values;
}

function parseActivityLogLines(lines: string[]): ActivityLogRow[] {
  const rows: ActivityLogRow[] = [];

  for (const line of lines) {
    if (line === '') {
      continue;
    }

    const columns = line.split(';');
    if (columns.length < 17 || columns[0] === 'day') {
      continue;
    }

    rows.push({
      day: Number(columns[0]),
      timestamp: Number(columns[1]),
      product: columns[2],
      bidPrices: getColumnValues(columns, [3, 5, 7]),
      bidVolumes: getColumnValues(columns, [4, 6, 8]),
      askPrices: getColumnValues(columns, [9, 11, 13]),
      askVolumes: getColumnValues(columns, [10, 12, 14]),
      midPrice: Number(columns[15]),
      profitLoss: Number(columns[16]),
    });
  }

  return rows;
}

function getActivityLogs(logLines: string[]): ActivityLogRow[] {
  const headerIndex = logLines.indexOf('Activities log:');
  if (headerIndex === -1) {
    return [];
  }

  return parseActivityLogLines(logLines.slice(headerIndex + 2));
}

function decompressListings(compressed: CompressedListing[]): Record<ProsperitySymbol, Listing> {
  const listings: Record<ProsperitySymbol, Listing> = {};

  for (const [symbol, product, denomination] of compressed) {
    listings[symbol] = {
      symbol,
      product,
      denomination,
    };
  }

  return listings;
}

function decompressOrderDepths(
  compressed: Record<ProsperitySymbol, CompressedOrderDepth>,
): Record<ProsperitySymbol, OrderDepth> {
  const orderDepths: Record<ProsperitySymbol, OrderDepth> = {};

  for (const [symbol, [buyOrders, sellOrders]] of Object.entries(compressed)) {
    orderDepths[symbol] = {
      buyOrders,
      sellOrders,
    };
  }

  return orderDepths;
}

function decompressTrades(compressed: CompressedTrade[]): Record<ProsperitySymbol, Trade[]> {
  const trades: Record<ProsperitySymbol, Trade[]> = {};

  for (const [symbol, price, quantity, buyer, seller, timestamp] of compressed) {
    if (trades[symbol] === undefined) {
      trades[symbol] = [];
    }

    trades[symbol].push({
      symbol,
      price,
      quantity,
      buyer,
      seller,
      timestamp,
    });
  }

  return trades;
}

function decompressObservations(compressed: CompressedObservations): Observation {
  const conversionObservations: Record<Product, ConversionObservation> = {};

  for (const [
    product,
    [bidPrice, askPrice, transportFees, exportTariff, importTariff, sugarPrice, sunlightIndex],
  ] of Object.entries(compressed[1])) {
    conversionObservations[product] = {
      bidPrice,
      askPrice,
      transportFees,
      exportTariff,
      importTariff,
      sugarPrice,
      sunlightIndex,
    };
  }

  return {
    plainValueObservations: compressed[0],
    conversionObservations,
  };
}

function decompressState(compressed: CompressedTradingState): TradingState {
  return {
    timestamp: compressed[0],
    traderData: compressed[1],
    listings: decompressListings(compressed[2]),
    orderDepths: decompressOrderDepths(compressed[3]),
    ownTrades: decompressTrades(compressed[4]),
    marketTrades: decompressTrades(compressed[5]),
    position: compressed[6],
    observations: decompressObservations(compressed[7]),
  };
}

function decompressOrders(compressed: CompressedOrder[]): Record<ProsperitySymbol, Order[]> {
  const orders: Record<ProsperitySymbol, Order[]> = {};

  for (const [symbol, price, quantity] of compressed) {
    if (orders[symbol] === undefined) {
      orders[symbol] = [];
    }

    orders[symbol].push({
      symbol,
      price,
      quantity,
    });
  }

  return orders;
}

function decompressDataRow(compressed: CompressedAlgorithmDataRow, sandboxLogs: string): AlgorithmDataRow {
  return {
    state: decompressState(compressed[0]),
    orders: decompressOrders(compressed[1]),
    conversions: compressed[2],
    traderData: compressed[3],
    algorithmLogs: compressed[4],
    sandboxLogs,
  };
}

function getAlgorithmData(logLines: string[]): AlgorithmDataRow[] {
  const headerIndex = logLines.indexOf('Sandbox logs:');
  if (headerIndex === -1) {
    return [];
  }

  const rows: AlgorithmDataRow[] = [];
  let nextSandboxLogs = '';

  const sandboxLogPrefix = '  "sandboxLog": ';
  const lambdaLogPrefix = '  "lambdaLog": ';

  for (let i = headerIndex + 1; i < logLines.length; i++) {
    const line = logLines[i];
    if (line.endsWith(':')) {
      break;
    }

    if (line.startsWith(sandboxLogPrefix)) {
      nextSandboxLogs = JSON.parse(line.substring(sandboxLogPrefix.length, line.length - 1)).trim();

      if (nextSandboxLogs.startsWith('Conversion request')) {
        const lastRow = rows[rows.length - 1];
        lastRow.sandboxLogs += (lastRow.sandboxLogs.length > 0 ? '\n' : '') + nextSandboxLogs;

        nextSandboxLogs = '';
      }

      continue;
    }

    if (!line.startsWith(lambdaLogPrefix) || line === '  "lambdaLog": "",') {
      continue;
    }

    const start = line.indexOf('[[');
    const end = line.lastIndexOf(']') + 1;

    try {
      const compressedDataRow = JSON.parse(JSON.parse('"' + line.substring(start, end) + '"'));
      rows.push(decompressDataRow(compressedDataRow, nextSandboxLogs));
    } catch (err) {
      console.log(line);
      console.error(err);

      throw new AlgorithmParseError(
        (
          <>
            <Text>Logs are in invalid format. Could not parse the following line:</Text>
            <Text>{line}</Text>
          </>
        ),
      );
    }
  }

  return rows;
}

function getListingDenomination(trades: ServerTradeHistoryEntry[]): string {
  return trades.find(trade => trade.currency)?.currency ?? 'XIRECS';
}

function getOrderDepth(row: ActivityLogRow): OrderDepth {
  const buyOrders: Record<number, number> = {};
  const sellOrders: Record<number, number> = {};

  row.bidPrices.forEach((price, index) => {
    buyOrders[price] = row.bidVolumes[index];
  });

  row.askPrices.forEach((price, index) => {
    sellOrders[price] = row.askVolumes[index];
  });

  return { buyOrders, sellOrders };
}

function getPositionsFromLambdaLog(lambdaLog: string): Record<Product, number> {
  const positions: Record<Product, number> = {};

  for (const line of lambdaLog.split('\n')) {
    const match = /^(\S+)\s+pos=(-?\d+(?:\.\d+)?)/.exec(line.trim());
    if (match === null) {
      continue;
    }

    positions[match[1]] = Number(match[2]);
  }

  return positions;
}

function getTradesByTimestamp(trades: ServerTradeHistoryEntry[]): Map<number, ServerTradeHistoryEntry[]> {
  const tradesByTimestamp = new Map<number, ServerTradeHistoryEntry[]>();

  for (const trade of trades) {
    const existing = tradesByTimestamp.get(trade.timestamp);
    if (existing === undefined) {
      tradesByTimestamp.set(trade.timestamp, [trade]);
    } else {
      existing.push(trade);
    }
  }

  return tradesByTimestamp;
}

function groupTrades(
  trades: ServerTradeHistoryEntry[],
  predicate: (trade: ServerTradeHistoryEntry) => boolean,
): Record<ProsperitySymbol, Trade[]> {
  const grouped: Record<ProsperitySymbol, Trade[]> = {};

  for (const trade of trades) {
    if (!predicate(trade)) {
      continue;
    }

    if (grouped[trade.symbol] === undefined) {
      grouped[trade.symbol] = [];
    }

    grouped[trade.symbol].push({
      symbol: trade.symbol,
      price: trade.price,
      quantity: trade.quantity,
      buyer: trade.buyer,
      seller: trade.seller,
      timestamp: trade.timestamp,
    });
  }

  return grouped;
}

function parseJsonAlgorithmLogs(logs: string): Algorithm | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(logs);
  } catch {
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('activitiesLog' in parsed) ||
    !('logs' in parsed) ||
    !('tradeHistory' in parsed)
  ) {
    return null;
  }

  const serverLogFile = parsed as ServerLogFile;
  const activityLogs = parseActivityLogLines(serverLogFile.activitiesLog.trim().split(/\r?\n/));
  const activityRowsByTimestamp = new Map<number, ActivityLogRow[]>();

  for (const row of activityLogs) {
    const existing = activityRowsByTimestamp.get(row.timestamp);
    if (existing === undefined) {
      activityRowsByTimestamp.set(row.timestamp, [row]);
    } else {
      existing.push(row);
    }
  }

  const tradesByTimestamp = getTradesByTimestamp(serverLogFile.tradeHistory);
  const denomination = getListingDenomination(serverLogFile.tradeHistory);

  const data = serverLogFile.logs.map<AlgorithmDataRow>(logRow => {
    const rowsForTimestamp = activityRowsByTimestamp.get(logRow.timestamp) ?? [];
    const tradesForTimestamp = tradesByTimestamp.get(logRow.timestamp) ?? [];

    const listings: Record<ProsperitySymbol, Listing> = {};
    const orderDepths: Record<ProsperitySymbol, OrderDepth> = {};

    for (const row of rowsForTimestamp) {
      listings[row.product] = {
        symbol: row.product,
        product: row.product,
        denomination,
      };
      orderDepths[row.product] = getOrderDepth(row);
    }

    return {
      state: {
        timestamp: logRow.timestamp,
        traderData: '',
        listings,
        orderDepths,
        ownTrades: groupTrades(
          tradesForTimestamp,
          trade => trade.buyer === 'SUBMISSION' || trade.seller === 'SUBMISSION',
        ),
        marketTrades: groupTrades(
          tradesForTimestamp,
          trade => trade.buyer !== 'SUBMISSION' && trade.seller !== 'SUBMISSION',
        ),
        position: getPositionsFromLambdaLog(logRow.lambdaLog),
        observations: {
          plainValueObservations: {},
          conversionObservations: {},
        },
      },
      orders: {},
      conversions: 0,
      traderData: '',
      algorithmLogs: logRow.lambdaLog.trim(),
      sandboxLogs: logRow.sandboxLog.trim(),
    };
  });

  return {
    activityLogs,
    data,
  };
}

export function parseAlgorithmLogs(logs: string, summary?: AlgorithmSummary): Algorithm {
  const parsedJsonLogs = parseJsonAlgorithmLogs(logs);
  if (parsedJsonLogs !== null) {
    return {
      ...parsedJsonLogs,
      summary,
    };
  }

  const logLines = logs.trim().split(/\r?\n/);

  const activityLogs = getActivityLogs(logLines);
  const data = getAlgorithmData(logLines);

  if (activityLogs.length === 0 && data.length === 0) {
    throw new AlgorithmParseError(
      (
        <Text>
          Logs are empty, either something went wrong with your submission or your backtester logs in a different format
          than Prosperity&apos;s submission environment.
        </Text>
      ),
    );
  }

  if (activityLogs.length === 0 || data.length === 0) {
    throw new AlgorithmParseError(
      /* prettier-ignore */
      <Text>Logs are in invalid format.</Text>,
    );
  }

  return {
    summary,
    activityLogs,
    data,
  };
}

export async function getAlgorithmLogsUrl(algorithmId: string): Promise<string> {
  const urlResponse = await authenticatedAxios.get(
    `https://bz97lt8b1e.execute-api.eu-west-1.amazonaws.com/prod/submission/logs/${algorithmId}`,
  );

  return urlResponse.data;
}

function downloadFile(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = new URL(url).pathname.split('/').pop()!;
  link.target = '_blank';
  link.rel = 'noreferrer';

  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadAlgorithmLogs(algorithmId: string): Promise<void> {
  const logsUrl = await getAlgorithmLogsUrl(algorithmId);
  downloadFile(logsUrl);
}

export async function downloadAlgorithmResults(algorithmId: string): Promise<void> {
  const detailsResponse = await authenticatedAxios.get(
    `https://bz97lt8b1e.execute-api.eu-west-1.amazonaws.com/prod/results/tutorial/${algorithmId}`,
  );

  downloadFile(detailsResponse.data.algo.summary.activitiesLog);
}
