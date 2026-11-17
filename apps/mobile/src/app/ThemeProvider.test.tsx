import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ThemePicker, ThemeProvider } from './ThemeProvider';

let matches = false;
let onChange: () => void;
beforeEach(() => {
  localStorage.clear();
  matches = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, listener: () => void) => {
        onChange = listener;
      },
      removeEventListener: vi.fn(),
    })),
  );
});
it('folgt dem System, speichert eine Auswahl und stellt sie nach Neustart wieder her', async () => {
  const user = userEvent.setup();
  const view = render(
    <ThemeProvider>
      <ThemePicker />
    </ThemeProvider>,
  );
  expect(document.documentElement.dataset.theme).toBe('light');
  act(() => {
    matches = true;
    onChange();
  });
  expect(document.documentElement.dataset.theme).toBe('dark');
  await user.selectOptions(screen.getByLabelText('Darstellung'), 'light');
  expect(localStorage.getItem('skiurlaub:theme')).toBe('light');
  view.unmount();
  render(
    <ThemeProvider>
      <ThemePicker />
    </ThemeProvider>,
  );
  expect(document.documentElement.dataset.theme).toBe('light');
});
it('bleibt mit blockierter Persistenz bedienbar', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  render(
    <ThemeProvider>
      <ThemePicker />
    </ThemeProvider>,
  );
  await userEvent.selectOptions(screen.getByLabelText('Darstellung'), 'dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
});
