import { Badge, Container, Grid, Group, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { Dropzone, FileRejection } from '@mantine/dropzone';
import { IconUpload } from '@tabler/icons-react';
import Highcharts from 'highcharts/highstock';
import { ReactNode, useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert.tsx';
import { useAsync } from '../../hooks/use-async.ts';
import {
  buildAllDaysRoundAnalysis,
  buildRoundDayAnalysis,
  ExampleProductMetrics,
  ExampleRoundDayAnalysis,
  getExampleRoundAnalysisKey,
  getRoundDayFromFileName,
  getRoundDayFromPriceCsv,
  getRoundTimelineSpan,
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

interface AnalysisDataset {
  analysis: ExampleRoundDayAnalysis;
  formatTimestamp: (timestamp: number) => string;
  key: string;
  label: string;
}

const ALL_DAYS_DATASET_SUFFIX = 'all-days';

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

function createDatasetOptions(analysisDatasets: AnalysisDataset[]): Array<{ value: string; label: string }> {
  return analysisDatasets.map(dataset => ({
    value: dataset.key,
    label: dataset.label,
  }));
}

function getAllDaysDatasetKey(round: number): string {
  return `round-${round}-${ALL_DAYS_DATASET_SUFFIX}`;
}

function createDayTimestampFormatter(): (timestamp: number) => string {
  return timestamp => formatNumber(timestamp);
}

function createAllDaysTimestampFormatter(
  analyses: ExampleRoundDayAnalysis[],
  timelineSpan: number,
): (timestamp: number) => string {
  const sortedDays = [...analyses].sort((a, b) => a.day - b.day).map(analysis => analysis.day);

  return timestamp => {
    const dayIndex = Math.max(0, Math.min(Math.floor(timestamp / timelineSpan), sortedDays.length - 1));
    const day = sortedDays[dayIndex];
    const dayTimestamp = timestamp - dayIndex * timelineSpan;

    return `Day ${day} / ${formatNumber(dayTimestamp)}`;
  };
}

function createAnalysisDatasets(uploadedDayEntries: UploadedDayEntry[]): AnalysisDataset[] {
  const readyEntries = uploadedDayEntries.filter(
    (entry): entry is UploadedDayEntry & { analysis: ExampleRoundDayAnalysis } => entry.analysis !== null,
  );
  const entriesByRound = new Map<number, Array<UploadedDayEntry & { analysis: ExampleRoundDayAnalysis }>>();

  for (const entry of readyEntries) {
    const currentEntries = entriesByRound.get(entry.round);

    if (currentEntries === undefined) {
      entriesByRound.set(entry.round, [entry]);
    } else {
      currentEntries.push(entry);
    }
  }

  return [...entriesByRound.entries()]
    .sort(([leftRound], [rightRound]) => leftRound - rightRound)
    .flatMap(([round, entries]) => {
      const sortedEntries = [...entries].sort((a, b) => a.day - b.day);
      const datasets: AnalysisDataset[] = [];

      if (sortedEntries.length > 1) {
        const analyses = sortedEntries.map(entry => entry.analysis);
        const timelineSpan = getRoundTimelineSpan(analyses);

        datasets.push({
          analysis: buildAllDaysRoundAnalysis(analyses),
          formatTimestamp: createAllDaysTimestampFormatter(analyses, timelineSpan),
          key: getAllDaysDatasetKey(round),
          label: `Round ${round} / All days`,
        });
      }

      datasets.push(
        ...sortedEntries.map(entry => ({
          analysis: entry.analysis,
          formatTimestamp: createDayTimestampFormatter(),
          key: entry.key,
          label: `Round ${entry.round} / Day ${entry.day}`,
        })),
      );

      return datasets;
    });
}

export function ExampleRoundAnalysisPage(): ReactNode {
  const [priceUploadError, setPriceUploadError] = useState<Error>();
  const [selectedDatasetKey, setSelectedDatasetKey] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [tradeUploadError, setTradeUploadError] = useState<Error>();
  const [uploadedPriceFiles, setUploadedPriceFiles] = useState<Record<string, UploadedCsvFile>>({});
  const [uploadedTradeFiles, setUploadedTradeFiles] = useState<Record<string, UploadedCsvFile>>({});

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

    const lastFile = parsedFiles[parsedFiles.length - 1];
    setSelectedDatasetKey(getExampleRoundAnalysisKey(lastFile.round, lastFile.day));
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

    const lastFile = parsedFiles[parsedFiles.length - 1];
    setSelectedDatasetKey(getExampleRoundAnalysisKey(lastFile.round, lastFile.day));
  });

  const uploadedDayEntries = createUploadedDayEntries(uploadedPriceFiles, uploadedTradeFiles);
  const analysisDatasets = createAnalysisDatasets(uploadedDayEntries);
  const datasetOptions = createDatasetOptions(analysisDatasets);
  const analysisDatasetsByKey = Object.fromEntries(analysisDatasets.map(dataset => [dataset.key, dataset])) as Record<
    string,
    AnalysisDataset
  >;
  const activeDatasetKey =
    selectedDatasetKey !== null && analysisDatasetsByKey[selectedDatasetKey] !== undefined
      ? selectedDatasetKey
      : (datasetOptions[0]?.value ?? null);
  const activeDataset = activeDatasetKey === null ? null : (analysisDatasetsByKey[activeDatasetKey] ?? null);
  const analysis = activeDataset?.analysis ?? null;
  const product =
    analysis !== null && selectedProduct !== null && analysis.products.includes(selectedProduct)
      ? selectedProduct
      : (analysis?.products[0] ?? null);
  const priceRows = product !== null && analysis !== null ? analysis.priceRowsByProduct[product] : [];
  const tradeRows = product !== null && analysis !== null ? analysis.tradeRowsByProduct[product] : [];
  const metrics = product !== null && analysis !== null ? analysis.metricsByProduct[product] : null;
  const formatDatasetTimestamp = activeDataset?.formatTimestamp ?? createDayTimestampFormatter();

  const priceSeries: Highcharts.SeriesOptionsType[] =
    analysis === null || product === null
      ? []
      : [
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

  const tradeSeries: Highcharts.SeriesOptionsType[] =
    analysis === null || product === null
      ? []
      : [
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

  const tradeTableRows = tradeRows.slice(-12).map((trade, index) => (
    <Table.Tr key={`${trade.timestamp}-${trade.price}-${index}`}>
      <Table.Td>{formatDatasetTimestamp(trade.timestamp)}</Table.Td>
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
            Upload your own round CSVs. Prices and trades are uploaded separately, and the uploaded days panel pairs
            them into ready-to-analyze day views.
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
                  matching price CSV and trade CSV are present. If a round has multiple ready days, you also get an `All
                  days` dataset that stitches them together into one continuous timeline.
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
                  data={datasetOptions}
                  disabled={datasetOptions.length === 0}
                  label="Uploaded day view"
                  placeholder="Upload matching price and trade CSVs first"
                  value={activeDatasetKey}
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

        {analysis === null || product === null || metrics === null ? (
          <VisualizerCard>
            <Text>Upload at least one matching pair of price and trade CSVs to start analyzing a dataset.</Text>
          </VisualizerCard>
        ) : (
          <>
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
                <Chart
                  title={`${product} order book prices`}
                  series={priceSeries}
                  formatXValue={formatDatasetTimestamp}
                />
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
                        {metrics.firstTradeTimestamp === null
                          ? 'N/A'
                          : formatDatasetTimestamp(metrics.firstTradeTimestamp)}{' '}
                        /{' '}
                        {metrics.lastTradeTimestamp === null
                          ? 'N/A'
                          : formatDatasetTimestamp(metrics.lastTradeTimestamp)}
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
                  formatXValue={formatDatasetTimestamp}
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
                    <Text>No trades recorded for this product in the selected dataset.</Text>
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
                <VisualizerCard title={`${activeDataset?.label ?? `Round ${analysis.round}`} comparison`}>
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
          </>
        )}
      </Stack>
    </Container>
  );
}
