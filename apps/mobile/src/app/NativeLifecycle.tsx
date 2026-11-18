import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient, focusManager } from '@tanstack/react-query';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SplashScreen } from '@capacitor/splash-screen';

export const nativeBackEvent = 'skiurlaub:android-back';
export function useAndroidBack(handler: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: Event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      handler();
    };
    document.addEventListener(nativeBackEvent, listener);
    return () => document.removeEventListener(nativeBackEvent, listener);
  }, [handler, enabled]);
}

export function NativeLifecycle() {
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = App.addListener('backButton', () => {
      if (
        !document.dispatchEvent(
          new Event(nativeBackEvent, { cancelable: true }),
        )
      )
        return;
      const details =
        document.querySelector<HTMLDetailsElement>('details[open]');
      if (details) {
        details.open = false;
        return;
      }
      if (location.pathname === '/skipaesse')
        void navigate('/profil', { replace: true });
      else if (location.pathname.startsWith('/skitage/'))
        void navigate('/skitage', { replace: true });
      else if (location.pathname !== '/') void navigate('/', { replace: true });
      else void App.minimizeApp();
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [location.pathname, navigate]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.dataset.platform = 'android';
    const applyBars = () => {
      void SystemBars.setStyle({
        style:
          document.documentElement.dataset.theme === 'dark'
            ? SystemBarsStyle.Dark
            : SystemBarsStyle.Light,
      });
    };
    applyBars();
    const observer = new MutationObserver(applyBars);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      focusManager.setFocused(isActive);
      if (isActive) {
        void client.invalidateQueries({ queryKey: ['dashboard'] });
        void client.invalidateQueries({ queryKey: ['private'] });
      }
    });
    const openExternal = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href]')
          : null;
      if (!anchor || event.defaultPrevented) return;
      const url = new URL(anchor.href);
      if (url.origin === window.location.origin) return;
      if (url.protocol !== 'https:') {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      void Browser.open({ url: url.href }).catch(() =>
        window.alert(
          'Der Link konnte nicht geöffnet werden. Bitte versuche es später erneut.',
        ),
      );
    };
    document.addEventListener('click', openExternal);
    void SplashScreen.hide();
    return () => {
      observer.disconnect();
      document.removeEventListener('click', openExternal);
      void listener.then((handle) => handle.remove());
    };
  }, [client]);
  return null;
}
