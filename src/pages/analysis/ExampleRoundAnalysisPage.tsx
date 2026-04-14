import { Badge, Container, Grid, Group, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { Dropzone, FileRejection } from '@mantine/dropzone';
import { IconUpload } from '@tabler/icons-react';
import Highcharts from 'highcharts/highstock';
import { ReactNode, useEffect, useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert.tsx';
import { useAsync } from '../../hooks/use-async.ts';
import {
  buildRoundDayAnalysis,
  ExampleProductMetrics,
  ExampleRoundDayAnalysis,
  getExampleRoundAnalysesByKey,
  getExampleRoundAnalysisKey,
  getExampleRoundAnalysisOptions,
  getRoundDayFromFileName,
  getRoundDayFromPriceCsv,
  loadExampleRoundAnalyses,
} from '../../utils/example-round-analysis.ts';
import { formatNumber } from '../../utils/format.ts';
import { Chart } from '../visualizer/Chart.tsx';
import { VisualizerCard } from '../visualizer/VisualizerCard.tsx';

interface UploadedCsvFile {
  day: number;
  fileName: string;
  raw: string;
  round: number;
}

interface UploadedDayEntry {
  analysis: ExampleRoundDayAnalysis | null;
  day: number;
  error: Error | null;
  key: string;
  pricesFileName: string | null;
  round: number;
  tradesFileName: string | null;
}

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

function renderUploadDropzoneContent(label: string): ReactNode {
  return (
    <Group justify="center" gap="xl" style={{ minHeight: 80, pointerEvents: 'none' }}>
      <IconUpload size={40} />
      <Text size="lg">{label}</Text>
    </Group>
  );
}

function getRejectedFileMessage(rejections: FileRejection[], label: string): Error {
  const messages: string[] = [];

  for (const rejection of rejections) {
    const reason = {
      'file-invalid-type': 'Invalid type, only CSV files are supported.',
      'file-too-large': 'File too large.',
      'file-too-small': 'File too small.',
      'too-many-files': 'Too many files.',
    }[rejection.errors[0].code]!;

    messages.push(`Could not load ${label} from ${rejection.file.name}: ${reason}`);
  }

  return new Error(messages.join(' '));
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      resolve(reader.result as string);
    });

    reader.addEventListener('error', () => {
      reject(new Error(`Could not read ${file.name}`));
    });

    reader.readAsText(file);
  });
}

function createUploadedDayEntries(
  uploadedPriceFiles: Record<string, UploadedCsvFile>,
  uploadedTradeFiles: Record<string, UploadedCsvFile>,
): UploadedDayEntry[] {
  const keys = new Set([...Object.keys(uploadedPriceFiles), ...Object.keys(uploadedTradeFiles)]);

  return [...keys]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(key => {
      const prices = uploadedPriceFiles[key] ?? null;
      const trades = uploadedTradeFiles[key] ?? null;

      if (prices === null || trades === null) {
        return {
          analysis: null,
          day: prices?.day ?? trades!.day,
          error: null,
          key,
          pricesFileName: prices?.fileName ?? null,
          round: prices?.round ?? trades!.round,
          tradesFileName: trades?.fileName ?? null,
        };
      }

      try {
        return {
          analysis: buildRoundDayAnalysis(prices.round, prices.day, prices.raw, trades.raw),
          day: prices.day,
          error: null,
          key,
          pricesFileName: prices.fileName,
          round: prices.round,
          tradesFileName: trades.fileName,
        };
      } catch (error) {
        return {
          analysis: null,
          day: prices.day,
          error: error as Error,
          key,
          pricesFileName: prices.fileName,
          round: prices.round,
          tradesFileName: trades.fileName,
        };
      }
    });
}

function createDatasetOptions(
  bundledAnalyses: ExampleRoundDayAnalysis[],
  uploadedDayEntries: UploadedDayEntry[],
): Array<{ value: string; label: string }> {
  const bundledOptions = getExampleRoundAnalysisOptions(bundledAnalyses).map(option => ({
    value: `example:${option.value}`,
    label: `Example ${option.label}`,
  }));
  const uploadedOptions = uploadedDayEntries
    .filter(entry => entry.analysis !== null)
    .map(entry => ({
      value: `uploaded:${entry.key}`,
      label: `Uploaded Round ${entry.round} / Day ${entry.day}`,
    }));

  return [...bundledOptions, ...uploadedOptions];
}

export function ExampleRoundAnalysisPage(): ReactNode {
  const bundledAnalysesRequest = useAsync<ExampleRoundDayAnalysis[]>(loadExampleRoundAnalyses);
  const [priceUploadError, setPriceUploadError] = useState<Error>();
  const [selectedDatasetKey, setSelectedDatasetKey] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [tradeUploadError, setTradeUploadError] = useState<Error>();
  const [uploadedPriceFiles, setUploadedPriceFiles] = useState<Record<string, UploadedCsvFile>>({});
  const [uploadedTradeFiles, setUploadedTradeFiles] = useState<Record<string, UploadedCsvFile>>({});

  useEffect(() => {
    bundledAnalysesRequest.call();
  }, [bundledAnalysesRequest.call]);

  const uploadPriceFiles = useAsync(async (files: File[]): Promise<void> => {
    setPriceUploadError(undefined);

    const parsedFiles = await Promise.all(
      files.map(async file => {
        const raw = await readFileAsText(file);
        const roundDay = getRoundDayFromPriceCsv(raw, file.name);

        if (roundDay === null) {
          throw new Error(`Could not infer round/day from price CSV ${file.name}.`);
        }

        return {
          ...roundDay,
          fileName: file.name,
          raw,
        };
      }),
    );

    setUploadedPriceFiles(currentFiles => {
      const nextFiles = { ...currentFiles };

      for (const file of parsedFiles) {
        nextFiles[getExampleRoundAnalysisKey(file.round, file.day)] = file;
      }

      return nextFiles;
    });
  });

  const uploadTradeFiles = useAsync(async (files: File[]): Promise<void> => {
    setTradeUploadError(undefined);

    const parsedFiles = await Promise.all(
      files.map(async file => {
        const raw = await readFileAsText(file);
        const roundDay = getRoundDayFromFileName(file.name);

        if (roundDay === null) {
          throw new Error(`Could not infer round/day from trade CSV filename ${file.name}.`);
        }

        return {
          ...roundDay,
          fileName: file.name,
          raw,
        };
      }),
    );

    setUploadedTradeFiles(currentFiles => {
      const nextFiles = { ...currentFiles };

      for (const file of parsedFiles) {
        nextFiles[getExampleRoundAnalysisKey(file.round, file.day)] = file;
      }

      return nextFiles;
    });
  });

  if (!bundledAnalysesRequest.success || bundledAnalysesRequest.result === undefined) {
    return (
      <Container fluid>
        <VisualizerCard>
          <Title order={2}>Round CSV Analysis</Title>
          <Text mt="xs">
            {bundledAnalysesRequest.error
              ? `Could not load the bundled example CSVs: ${bundledAnalysesRequest.error.message}`
              : 'Loading bundled example CSV datasets...'}
          </Text>
        </VisualizerCard>
      </Container>
    );
  }

  const bundledAnalyses = bundledAnalysesRequest.result;
  const uploadedDayEntries = createUploadedDayEntries(uploadedPriceFiles, uploadedTradeFiles);
  const datasetOptions = createDatasetOptions(bundledAnalyses, uploadedDayEntries);
  const activeDatasetKey = selectedDatasetKey ?? datasetOptions[0].value;
  const bundledAnalysesByKey = Object.fromEntries(
    Object.entries(getExampleRoundAnalysesByKey(bundledAnalyses)).map(([key, analysis]) => [
      `example:${key}`,
      analysis,
    ]),
  );
  const uploadedAnalysesByKey = Object.fromEntries(
    uploadedDayEntries.flatMap(entry => (entry.analysis === null ? [] : [[`uploaded:${entry.key}`, entry.analysis]])),
  );
  const allAnalysesByKey = {
    ...bundledAnalysesByKey,
    ...uploadedAnalysesByKey,
  } as Record<string, ExampleRoundDayAnalysis>;
  const analysis = allAnalysesByKey[activeDatasetKey] ?? bundledAnalyses[0];
  const product =
    selectedProduct !== null && analysis.products.includes(selectedProduct) ? selectedProduct : analysis.products[0];
  const priceRows = analysis.priceRowsByProduct[product];
  const tradeRows = analysis.tradeRowsByProduct[product];
  const metrics = analysis.metricsByProduct[product];
  const uploadedDayOptions = uploadedDayEntries
    .filter(entry => entry.analysis !== null)
    .map(entry => ({
      value: `uploaded:${entry.key}`,
      label: `Round ${entry.round} / Day ${entry.day}`,
    }));

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

  const uploadedDayRows = uploadedDayEntries.map(entry => {
    const status = entry.error !== null ? 'error' : entry.analysis !== null ? 'ready' : 'waiting';
    const badgeColor = status === 'ready' ? 'green' : status === 'error' ? 'red' : 'yellow';
    const badgeLabel = status === 'ready' ? 'Ready' : status === 'error' ? 'Parse error' : 'Waiting for matching CSV';

    return (
      <Table.Tr key={entry.key}>
        <Table.Td>{entry.round}</Table.Td>
        <Table.Td>{entry.day}</Table.Td>
        <Table.Td>{entry.pricesFileName ?? 'Missing'}</Table.Td>
        <Table.Td>{entry.tradesFileName ?? 'Missing'}</Table.Td>
        <Table.Td>
          <Badge color={badgeColor} variant="light">
            {badgeLabel}
          </Badge>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Container fluid>
      <Stack>
        <VisualizerCard>
          <Title order={2}>Round CSV Analysis</Title>
          <Text mt="xs">
            Analyze the bundled example datasets or upload your own round CSVs. Prices and trades are uploaded
            separately, and the uploaded days panel pairs them into ready-to-analyze day views.
          </Text>
        </VisualizerCard>

        <Grid>
          <Grid.Col span={{ base: 12, xl: 6 }}>
            <VisualizerCard title="Upload Price CSVs">
              <Stack>
                <Text size="sm" c="dimmed">
                  Drop one or multiple price files here. Day is read from the filename when available, otherwise from
                  the CSV contents.
                </Text>
                {priceUploadError && <ErrorAlert error={priceUploadError} />}
                {uploadPriceFiles.error && <ErrorAlert error={uploadPriceFiles.error} />}
                <Dropzone
                  accept={['text/csv', '.csv']}
                  loading={uploadPriceFiles.loading}
                  multiple
                  onDrop={uploadPriceFiles.call}
                  onReject={rejections => setPriceUploadError(getRejectedFileMessage(rejections, 'price CSVs'))}
                >
                  <Dropzone.Idle>
                    {renderUploadDropzoneContent('Drag price CSVs here or click to select')}
                  </Dropzone.Idle>
                  <Dropzone.Accept>{renderUploadDropzoneContent('Release to upload price CSVs')}</Dropzone.Accept>
                </Dropzone>
                <Text size="sm">
                  Uploaded price files: <strong>{formatNumber(Object.keys(uploadedPriceFiles).length)}</strong>
                </Text>
              </Stack>
            </VisualizerCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, xl: 6 }}>
            <VisualizerCard title="Upload Trade CSVs">
              <Stack>
                <Text size="sm" c="dimmed">
                  Drop one or multiple trade files here. Trade day matching is inferred from filenames like
                  `trades_round_1_day_-1.csv`.
                </Text>
                {tradeUploadError && <ErrorAlert error={tradeUploadError} />}
                {uploadTradeFiles.error && <ErrorAlert error={uploadTradeFiles.error} />}
                <Dropzone
                  accept={['text/csv', '.csv']}
                  loading={uploadTradeFiles.loading}
                  multiple
                  onDrop={uploadTradeFiles.call}
                  onReject={rejections => setTradeUploadError(getRejectedFileMessage(rejections, 'trade CSVs'))}
                >
                  <Dropzone.Idle>
                    {renderUploadDropzoneContent('Drag trade CSVs here or click to select')}
                  </Dropzone.Idle>
                  <Dropzone.Accept>{renderUploadDropzoneContent('Release to upload trade CSVs')}</Dropzone.Accept>
                </Dropzone>
                <Text size="sm">
                  Uploaded trade files: <strong>{formatNumber(Object.keys(uploadedTradeFiles).length)}</strong>
                </Text>
              </Stack>
            </VisualizerCard>
          </Grid.Col>

          <Grid.Col span={12}>
            <VisualizerCard title="Uploaded Days">
              <Stack>
                <Text size="sm" c="dimmed">
                  This window shows every round/day found in your uploads. A day becomes selectable once both the
                  matching price CSV and trade CSV are present.
                </Text>

                {uploadedDayEntries.some(entry => entry.error !== null) && (
                  <ErrorAlert error={uploadedDayEntries.find(entry => entry.error !== null)!.error!} />
                )}

                {uploadedDayRows.length === 0 ? (
                  <Text>No uploaded CSVs yet.</Text>
                ) : (
                  <Table.ScrollContainer minWidth={720}>
                    <Table withColumnBorders horizontalSpacing={8} verticalSpacing={4}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Round</Table.Th>
                          <Table.Th>Day</Table.Th>
                          <Table.Th>Prices file</Table.Th>
                          <Table.Th>Trades file</Table.Th>
                          <Table.Th>Status</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>{uploadedDayRows}</Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                )}

                <Select
                  allowDeselect={false}
                  data={uploadedDayOptions}
                  disabled={uploadedDayOptions.length === 0}
                  label="Uploaded day view"
                  placeholder="Upload matching price and trade CSVs first"
                  value={activeDatasetKey.startsWith('uploaded:') ? activeDatasetKey : null}
                  onChange={value => {
                    if (value !== null) {
                      setSelectedDatasetKey(value);
                      setSelectedProduct(null);
                    }
                  }}
                />
              </Stack>
            </VisualizerCard>
          </Grid.Col>
        </Grid>

        <VisualizerCard>
          <Group justify="space-between" align="end">
            <Select
              allowDeselect={false}
              data={datasetOptions}
              label="Active dataset"
              value={activeDatasetKey}
              onChange={value => {
                if (value !== null) {
                  setSelectedDatasetKey(value);
                  setSelectedProduct(null);
                }
              }}
              w={320}
            />
            <Select
              allowDeselect={false}
              data={analysis.products}
              label="Product"
              value={product}
              onChange={value => {
                if (value !== null) {
                  setSelectedProduct(value);
                }
              }}
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
        </Grid>
      </Stack>
    </Container>
  );
}
