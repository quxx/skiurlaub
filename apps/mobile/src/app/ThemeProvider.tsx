import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

export type Theme = 'light' | 'dark' | 'system';
const key = 'skiurlaub:theme';
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(key);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.style.colorScheme =
        document.documentElement.dataset.theme;
    };
    apply();
    try {
      localStorage.setItem(key, theme);
    } catch {
      /* Storage is optional. */
    }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemePicker() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeProvider missing');
  return (
    <label className="theme-picker">
      <span className="theme-picker__label">Darstellung</span>
      <select
        value={context.theme}
        onChange={(event) => context.setTheme(event.target.value as Theme)}
      >
        <option value="system">System</option>
        <option value="light">Hell</option>
        <option value="dark">Dunkel</option>
      </select>
    </label>
  );
}
