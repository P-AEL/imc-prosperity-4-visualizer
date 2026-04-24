import { ReactNode } from 'react';
import { ActivityLogRow } from '../../models.ts';
import { Chart } from './Chart.tsx';
import { buildProfitLossSeries, getPerformanceScopeLabel } from './performance-utils.ts';

export interface ProfitLossChartProps {
  symbols: string[];
  activityLogs: ActivityLogRow[];
  selectedDay: number | null;
}

export function ProfitLossChart({ symbols, activityLogs, selectedDay }: ProfitLossChartProps): ReactNode {
  const { formatXValue, series } = buildProfitLossSeries(activityLogs, symbols, selectedDay);

  return (
    <Chart
      title={`Profit / Loss (${getPerformanceScopeLabel(selectedDay)})`}
      series={series}
      formatXValue={formatXValue}
    />
  );
}
