import Highcharts from 'highcharts';
import { ActivityLogRow } from '../../models.ts';
import { formatNumber } from '../../utils/format.ts';

export const ALL_DAYS_SELECT_VALUE = 'all-days';

const DAY_TIMELINE_SPAN = 1_100_000;

function sortActivityLogs(left: ActivityLogRow, right: ActivityLogRow): number {
  if (left.day !== right.day) {
    return left.day - right.day;
  }

  if (left.timestamp !== right.timestamp) {
    return left.timestamp - right.timestamp;
  }

  return left.product.localeCompare(right.product);
}

function getSyntheticTimestamp(dayIndex: number, timestamp: number): number {
  return dayIndex * DAY_TIMELINE_SPAN + timestamp;
}

function getTotalSeriesForDay(activityLogs: ActivityLogRow[], dayIndex?: number): [number, number][] {
  const totalsByTimestamp = new Map<number, number>();

  for (const row of [...activityLogs].sort(sortActivityLogs)) {
    const timestamp = dayIndex === undefined ? row.timestamp : getSyntheticTimestamp(dayIndex, row.timestamp);
    totalsByTimestamp.set(timestamp, (totalsByTimestamp.get(timestamp) ?? 0) + row.profitLoss);
  }

  return [...totalsByTimestamp.entries()].map(([timestamp, profitLoss]) => [timestamp, profitLoss]);
}

function getSymbolSeriesForDay(
  activityLogs: ActivityLogRow[],
  symbol: string,
  dayIndex?: number,
): Array<[number, number]> {
  return [...activityLogs]
    .sort(sortActivityLogs)
    .flatMap(row =>
      row.product === symbol
        ? [[dayIndex === undefined ? row.timestamp : getSyntheticTimestamp(dayIndex, row.timestamp), row.profitLoss]]
        : [],
    );
}

export function getAvailablePerformanceDays(activityLogs: ActivityLogRow[]): number[] {
  return [...new Set(activityLogs.map(row => row.day))].sort((a, b) => a - b);
}

export function getPerformanceDaySelectOptions(
  activityLogs: ActivityLogRow[],
): Array<{ value: string; label: string }> {
  const days = getAvailablePerformanceDays(activityLogs);

  return [
    { value: ALL_DAYS_SELECT_VALUE, label: 'All days' },
    ...days.map(day => ({
      value: String(day),
      label: `Day ${day}`,
    })),
  ];
}

export function getPerformanceScopeLabel(selectedDay: number | null): string {
  return selectedDay === null ? 'All days' : `Day ${selectedDay}`;
}

export function formatRoundLabel(round?: string): string | null {
  if (round === undefined) {
    return null;
  }

  const match = /^ROUND(\d+)$/i.exec(round);
  if (match === null) {
    return round;
  }

  return match[1] === '0' ? 'Tutorial' : `Round ${match[1]}`;
}

export function getFinalProfitLoss(activityLogs: ActivityLogRow[], selectedDay: number | null): number {
  const selectedDays = selectedDay === null ? getAvailablePerformanceDays(activityLogs) : [selectedDay];

  return selectedDays.reduce((total, day) => {
    const rowsForDay = [...activityLogs].filter(row => row.day === day).sort(sortActivityLogs);
    if (rowsForDay.length === 0) {
      return total;
    }

    const lastTimestamp = rowsForDay[rowsForDay.length - 1].timestamp;
    const finalProfitLoss = rowsForDay
      .filter(row => row.timestamp === lastTimestamp)
      .reduce((dayTotal, row) => dayTotal + row.profitLoss, 0);

    return total + finalProfitLoss;
  }, 0);
}

export function buildProfitLossSeries(
  activityLogs: ActivityLogRow[],
  symbols: string[],
  selectedDay: number | null,
): {
  formatXValue?: (value: number) => string;
  series: Highcharts.SeriesOptionsType[];
} {
  if (selectedDay !== null) {
    const rowsForDay = activityLogs.filter(row => row.day === selectedDay);

    return {
      series: [
        {
          type: 'line',
          name: 'Total',
          data: getTotalSeriesForDay(rowsForDay),
        },
        ...symbols.map(symbol => ({
          type: 'line' as const,
          name: symbol,
          data: getSymbolSeriesForDay(rowsForDay, symbol),
          dashStyle: 'Dash' as const,
        })),
      ],
    };
  }

  const days = getAvailablePerformanceDays(activityLogs);
  const rowsByDay = new Map<number, ActivityLogRow[]>();

  for (const day of days) {
    rowsByDay.set(
      day,
      activityLogs.filter(row => row.day === day),
    );
  }

  return {
    formatXValue: value => {
      const dayIndex = Math.max(0, Math.min(Math.floor(value / DAY_TIMELINE_SPAN), days.length - 1));
      const day = days[dayIndex];
      const timestamp = value - dayIndex * DAY_TIMELINE_SPAN;
      return `Day ${day} / ${formatNumber(timestamp)}`;
    },
    series: [
      {
        type: 'line',
        name: 'Total',
        data: days.flatMap((day, dayIndex) => getTotalSeriesForDay(rowsByDay.get(day) ?? [], dayIndex)),
      },
      ...symbols.map(symbol => ({
        type: 'line' as const,
        name: symbol,
        data: days.flatMap((day, dayIndex) => getSymbolSeriesForDay(rowsByDay.get(day) ?? [], symbol, dayIndex)),
        dashStyle: 'Dash' as const,
      })),
    ],
  };
}
