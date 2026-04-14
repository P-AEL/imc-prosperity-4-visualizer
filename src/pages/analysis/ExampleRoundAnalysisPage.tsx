import { Badge, Container, Grid, Group, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import Highcharts from 'highcharts/highstock';
import { ReactNode, useState } from 'react';
import { useAsync } from '../../hooks/use-async.ts';
import {
  ExampleProductMetrics,
  getExampleRoundAnalysesByKey,
  getExampleRoundAnalysisOptions,
  loadExampleRoundAnalyses,
} from '../../utils/example-round-analysis.ts';
import { formatNumber } from '../../utils/format.ts';
import { Chart } from '../visualizer/Chart.tsx';
import { VisualizerCard } from '../visualizer/VisualizerCard.tsx';

function formatMetric(value: number | null, decimals: number = 2, suffix: string = ''): string {
  if (value === null) {
    return 'N/A';
  }

  return `${formatNumber(value, decimals)}${suffix}`;
}

function getMetricTone(value: number | null): string {
  if (value === null || value === 0) {
    return 'gray';
  }

  return value > 0 ? 'green' : 'red';
}

function createOverviewRows(metricsByProduct: Record<string, ExampleProductMetrics>): ReactNode[] {
  return Object.values(metricsByProduct)
    .sort((a, b) => a.product.localeCompare(b.product))
    .map(metrics => (
      <Table.Tr key={metrics.product}>
        <Table.Td>{metrics.product}</Table.Td>
        <Table.Td>{formatMetric(metrics.openMidPrice)}</Table.Td>
        <Table.Td>{formatMetric(metrics.closeMidPrice)}</Table.Td>
        <Table.Td>
          <Badge color={getMetricTone(metrics.absoluteChange)} variant="light">
            {formatMetric(metrics.absoluteChange)}
          </Badge>
        </Table.Td>
        <Table.Td>{formatMetric(metrics.averageSpread)}</Table.Td>
        <Table.Td>{formatNumber(metrics.tradeCount)}</Table.Td>
        <Table.Td>{formatNumber(metrics.totalTradedVolume)}</Table.Td>
        <Table.Td>{formatMetric(metrics.volumeWeightedAveragePrice)}</Table.Td>
      </Table.Tr>
    ));
}

export function ExampleRoundAnalysisPage(): ReactNode {
  const exampleRoundAnalyses = useAsync(loadExampleRoundAnalyses);
  const [selectedAnalysisKey, setSelectedAnalysisKey] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  if (!exampleRoundAnalyses.success) {
    return (
      <Container fluid>
        <VisualizerCard>
          <Title order={2}>Example Round Analysis</Title>
          <Text mt="xs">
            {exampleRoundAnalyses.error
              ? `Could not load the bundled example CSVs: ${exampleRoundAnalyses.error.message}`
              : 'Loading bundled example CSV datasets...'}
          </Text>
        </VisualizerCard>
      </Container>
    );
  }

  const analyses = exampleRoundAnalyses.result;
  const analysisOptions = getExampleRoundAnalysisOptions(analyses);
  const analysesByKey = getExampleRoundAnalysesByKey(analyses);
  const activeAnalysisKey = selectedAnalysisKey ?? analysisOptions[0].value;
  const analysis = analysesByKey[activeAnalysisKey];
  const product = selectedProduct !== null && analysis.products.includes(selectedProduct) ? selectedProduct : analysis.products[0];
  const priceRows = analysis.priceRowsByProduct[product];
  const tradeRows = analysis.tradeRowsByProduct[product];
  const metrics = analysis.metricsByProduct[product];

  const priceSeries: Highcharts.SeriesOptionsType[] = [
    {
      type: 'line',
      name: 'Best bid',
      data: priceRows.flatMap(row => (row.bidPrice1 === null ? [] : [[row.timestamp, row.bidPrice1]])),
      tooltip: {
        valueDecimals: 2,
      },
    },
    {
      type: 'line',
      name: 'Mid price',
      data: priceRows.flatMap(row => (row.midPrice === null ? [] : [[row.timestamp, row.midPrice]])),
      tooltip: {
        valueDecimals: 2,
      },
    },
    {
      type: 'line',
      name: 'Best ask',
      data: priceRows.flatMap(row => (row.askPrice1 === null ? [] : [[row.timestamp, row.askPrice1]])),
      tooltip: {
        valueDecimals: 2,
      },
    },
  ];

  const tradeSeries: Highcharts.SeriesOptionsType[] = [
    {
      type: 'scatter',
      name: 'Trade price',
      data: tradeRows.map(row => [row.timestamp, row.price]),
      tooltip: {
        valueDecimals: 2,
      },
    },
    {
      type: 'column',
      name: 'Trade size',
      yAxis: 1,
      data: tradeRows.map(row => [row.timestamp, Math.abs(row.quantity)]),
      tooltip: {
        valueDecimals: 0,
      },
    },
  ];

  const tradeTableRows = tradeRows.slice(0, 12).map((trade, index) => (
    <Table.Tr key={`${trade.timestamp}-${trade.price}-${index}`}>
      <Table.Td>{formatNumber(trade.timestamp)}</Table.Td>
      <Table.Td>{formatMetric(trade.price)}</Table.Td>
      <Table.Td>{formatNumber(Math.abs(trade.quantity))}</Table.Td>
      <Table.Td>{trade.currency}</Table.Td>
    </Table.Tr>
  ));

  return (
    <Container fluid>
      <Stack>
        <VisualizerCard>
          <Title order={2}>Example Round Analysis</Title>
          <Text mt="xs">
            Explore the bundled example CSVs for Round {analysis.round}. This view combines order book snapshots and
            trade prints so you can inspect microstructure, compare products, and benchmark ideas before wiring them
            into your algorithm workflow.
          </Text>
        </VisualizerCard>

        <VisualizerCard>
          <Group justify="space-between" align="end">
            <Select
              label="Dataset"
              data={analysisOptions}
              value={activeAnalysisKey}
              onChange={value => {
                if (value === null) {
                  return;
                }

                setSelectedAnalysisKey(value);
                const nextAnalysis = analysesByKey[value];
                setSelectedProduct(nextAnalysis.products[0]);
              }}
              allowDeselect={false}
              w={240}
            />
            <Select
              label="Product"
              data={analysis.products}
              value={product}
              onChange={value => {
                if (value !== null) {
                  setSelectedProduct(value);
                }
              }}
              allowDeselect={false}
              w={260}
            />
          </Group>
        </VisualizerCard>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          <VisualizerCard title="Closing Mid">
            <Text size="xl" fw={700}>
              {formatMetric(metrics.closeMidPrice)}
            </Text>
            <Badge mt="sm" color={getMetricTone(metrics.absoluteChange)} variant="light">
              {formatMetric(metrics.absoluteChange)} ({formatMetric(metrics.percentageChange, 2, '%')})
            </Badge>
          </VisualizerCard>

          <VisualizerCard title="Spread Profile">
            <Text size="xl" fw={700}>
              {formatMetric(metrics.averageSpread)}
            </Text>
            <Text size="sm" c="dimmed">
              Min {formatMetric(metrics.minSpread)} / Max {formatMetric(metrics.maxSpread)}
            </Text>
          </VisualizerCard>

          <VisualizerCard title="Trade Activity">
            <Text size="xl" fw={700}>
              {formatNumber(metrics.tradeCount)} trades
            </Text>
            <Text size="sm" c="dimmed">
              {formatNumber(metrics.totalTradedVolume)} units traded
            </Text>
          </VisualizerCard>

          <VisualizerCard title="VWAP Basis">
            <Text size="xl" fw={700}>
              {formatMetric(metrics.volumeWeightedAveragePrice)}
            </Text>
            <Badge mt="sm" color={getMetricTone(metrics.tradePriceToCloseBasis)} variant="light">
              Close basis {formatMetric(metrics.tradePriceToCloseBasis)}
            </Badge>
          </VisualizerCard>
        </SimpleGrid>

        <Grid>
          <Grid.Col span={{ base: 12, xl: 7 }}>
            <Chart title={`${product} order book prices`} series={priceSeries} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, xl: 5 }}>
            <VisualizerCard title={`${product} trading summary`}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text c="dimmed">Observed snapshots</Text>
                  <Text fw={600}>{formatNumber(metrics.snapshotCount)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text c="dimmed">Spread coverage</Text>
                  <Text fw={600}>{formatMetric(metrics.spreadCoverage * 100, 1, '%')}</Text>
                </Group>
                <Group justify="space-between">
                  <Text c="dimmed">Intraday range</Text>
                  <Text fw={600}>
                    {formatMetric(metrics.lowMidPrice)} to {formatMetric(metrics.highMidPrice)}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text c="dimmed">Average top-of-book volume</Text>
                  <Text fw={600}>{formatMetric(metrics.averageTopOfBookVolume)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text c="dimmed">Average trade size</Text>
                  <Text fw={600}>{formatMetric(metrics.averageTradeSize)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text c="dimmed">First / last trade</Text>
                  <Text fw={600}>
                    {metrics.firstTradeTimestamp === null ? 'N/A' : formatNumber(metrics.firstTradeTimestamp)} /{' '}
                    {metrics.lastTradeTimestamp === null ? 'N/A' : formatNumber(metrics.lastTradeTimestamp)}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text c="dimmed">Traded notional</Text>
                  <Text fw={600}>{formatMetric(metrics.totalTradedNotional)}</Text>
                </Group>
              </Stack>
            </VisualizerCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, xl: 7 }}>
            <Chart
              title={`${product} trade prints and size`}
              series={tradeSeries}
              options={{
                yAxis: [
                  {
                    title: {
                      text: 'Trade price',
                    },
                  },
                  {
                    title: {
                      text: 'Trade size',
                    },
                    opposite: true,
                  },
                ],
              }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, xl: 5 }}>
            <VisualizerCard title="Recent trades">
              {tradeTableRows.length === 0 ? (
                <Text>No trades recorded for this product/day.</Text>
              ) : (
                <Table.ScrollContainer minWidth={320}>
                  <Table withColumnBorders horizontalSpacing={8} verticalSpacing={4}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Timestamp</Table.Th>
                        <Table.Th>Price</Table.Th>
                        <Table.Th>Size</Table.Th>
                        <Table.Th>Currency</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>{tradeTableRows}</Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </VisualizerCard>
          </Grid.Col>

          <Grid.Col span={12}>
            <VisualizerCard title={`Round ${analysis.round} / Day ${analysis.day} comparison`}>
              <Table.ScrollContainer minWidth={720}>
                <Table withColumnBorders horizontalSpacing={8} verticalSpacing={4}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Product</Table.Th>
                      <Table.Th>Open mid</Table.Th>
                      <Table.Th>Close mid</Table.Th>
                      <Table.Th>Change</Table.Th>
                      <Table.Th>Avg spread</Table.Th>
                      <Table.Th>Trades</Table.Th>
                      <Table.Th>Volume</Table.Th>
                      <Table.Th>VWAP</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>{createOverviewRows(analysis.metricsByProduct)}</Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </VisualizerCard>
          </Grid.Col>

          <Grid.Col span={12}>
            <VisualizerCard title="What to look for">
              <Text>
                Use closing-vs-opening drift to spot trending days, compare VWAP against the closing mid to see where
                prints concentrated, and watch average spread together with top-of-book volume to judge how tradable a
                product really was.
              </Text>
            </VisualizerCard>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
