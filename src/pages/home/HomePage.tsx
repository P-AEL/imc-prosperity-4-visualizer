import { Anchor, Container, Stack, Text } from '@mantine/core';
import { ReactNode } from 'react';
import { HomeCard } from './HomeCard.tsx';
import { LoadFromFile } from './LoadFromFile.tsx';
import { LoadFromProsperity } from './LoadFromProsperity.tsx';
import { LoadFromUrl } from './LoadFromUrl.tsx';

export function HomePage(): ReactNode {
  return (
    <Container>
      <Stack>
        <HomeCard title="Welcome!">
          <Text>
            IMC Prosperity 4 Visualizer is a visualizer for{' '}
            <Anchor href="https://prosperity.imc.com/" target="_blank" rel="noreferrer">
              IMC Prosperity 4
            </Anchor>{' '}
            algorithms. Its source code is available in the{' '}
            <Anchor href="https://github.com/P-AEL/imc-prosperity-4-visualizer" target="_blank" rel="noreferrer">
              P-AEL/imc-prosperity-4-visualizer
            </Anchor>{' '}
            GitHub repository. Load an algorithm below to get started.
          </Text>
        </HomeCard>

        <LoadFromFile />
        <LoadFromProsperity />
        <LoadFromUrl />
      </Stack>
    </Container>
  );
}
