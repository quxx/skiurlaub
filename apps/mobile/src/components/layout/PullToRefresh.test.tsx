import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { PullToRefresh } from './PullToRefresh';
import { refreshActiveData } from '@/data/refresh';

vi.mock('@/data/refresh', () => ({ refreshActiveData: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PullToRefresh>
        <div data-testid="content">Inhalt</div>
        <div className="leaflet-container" data-testid="map">
          Karte
        </div>
      </PullToRefresh>
    </QueryClientProvider>,
  );
  return screen.getByTestId('content');
}
function pull(element: HTMLElement, x = 20, y = 220) {
  fireEvent.touchStart(element, { touches: [{ clientX: 20, clientY: 20 }] });
  fireEvent.touchMove(element, {
    cancelable: true,
    touches: [{ clientX: x, clientY: y }],
  });
}

it('aktualisiert erst beim Loslassen und bündelt erneute Gesten während des Ladens', async () => {
  let done!: (message: string) => void;
  vi.mocked(refreshActiveData).mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const content = setup();
  pull(content);
  expect(refreshActiveData).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Loslassen');
  fireEvent.touchEnd(content);
  expect(refreshActiveData).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('werden aktualisiert');
  pull(content);
  fireEvent.touchEnd(content);
  expect(refreshActiveData).toHaveBeenCalledTimes(1);
  await act(async () => done('Daten aktualisiert.'));
  expect(screen.getByRole('status')).toHaveTextContent('Daten aktualisiert.');
});

it('ignoriert zu kurze, horizontale, abgebrochene und Karten-Gesten sowie Ziehen unterhalb des Seitenanfangs', () => {
  const content = setup();
  pull(content, 20, 60);
  fireEvent.touchEnd(content);
  pull(content);
  fireEvent.touchMove(content, {
    cancelable: true,
    touches: [{ clientX: 20, clientY: 22 }],
  });
  fireEvent.touchEnd(content);
  pull(content, 250, 80);
  fireEvent.touchEnd(content);
  pull(content);
  fireEvent.touchCancel(content);
  fireEvent.touchEnd(content);
  pull(screen.getByTestId('map'));
  fireEvent.touchEnd(screen.getByTestId('map'));
  vi.stubGlobal('scrollY', 100);
  pull(content);
  fireEvent.touchEnd(content);
  expect(refreshActiveData).not.toHaveBeenCalled();
});

it('beendet den Ladezustand nach einem Fehler und bietet eine Tastatur-/Screenreader-Aktion', async () => {
  vi.mocked(refreshActiveData).mockRejectedValue(new Error('Offline.'));
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Daten aktualisieren' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Offline.'),
  );
  expect(
    screen.getByRole('button', { name: 'Daten aktualisieren' }),
  ).toBeEnabled();
});
