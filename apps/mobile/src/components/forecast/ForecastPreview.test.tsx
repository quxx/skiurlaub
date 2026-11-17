import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ForecastPreview } from './ForecastPreview';
import { WeatherDataProvider } from '@/components/weather/WeatherDataProvider';
import { weatherResponse } from '@/test/fixtures';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

it('zeigt sieben Tage und öffnet und schließt die zugehörige Stundenansicht', async () => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(weatherResponse()))),
  );
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WeatherDataProvider>
        <ForecastPreview />
      </WeatherDataProvider>
    </QueryClientProvider>,
  );
  const buttons = await screen.findAllByRole('button', { expanded: false });
  expect(buttons).toHaveLength(7);
  await user.click(buttons[0]);
  expect(buttons[0]).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('00:00')).toBeVisible();
  await user.click(buttons[0]);
  expect(buttons[0]).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('00:00')).not.toBeInTheDocument();
});
