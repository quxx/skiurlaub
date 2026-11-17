import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshActiveData } from '@/data/refresh';

export function PullToRefresh({ children }: PropsWithChildren) {
  const client = useQueryClient();
  const area = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    let start: { x: number; y: number } | null = null;
    let pull = 0;
    let mounted = true;
    const reset = () => {
      start = null;
      pull = 0;
      setDistance(0);
    };
    const refresh = async () => {
      if (busy.current) return;
      busy.current = true;
      clearTimeout(hideTimer.current);
      setRefreshing(true);
      setMessage('Daten werden aktualisiert …');
      try {
        const result = await refreshActiveData(client);
        if (mounted) setMessage(result);
      } catch (error) {
        if (mounted)
          setMessage(
            error instanceof Error
              ? error.message
              : 'Aktualisierung fehlgeschlagen.',
          );
      } finally {
        busy.current = false;
        if (mounted) {
          setRefreshing(false);
          hideTimer.current = setTimeout(() => setMessage(''), 5000);
        }
      }
    };
    const onStart = (event: TouchEvent) => {
      reset();
      if (busy.current || window.scrollY > 0 || event.touches.length !== 1)
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          'a,button,input,textarea,select,[contenteditable],.leaflet-container,.hourly-scroll,.map-layer-controls',
        )
      )
        return;
      for (
        let parent = target;
        parent && parent !== element;
        parent = parent.parentElement
      ) {
        if (
          parent.scrollHeight > parent.clientHeight &&
          /auto|scroll/.test(getComputedStyle(parent).overflowY)
        )
          return;
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1 || window.scrollY > 0) {
        reset();
        return;
      }
      const dx = Math.abs(event.touches[0].clientX - start.x);
      const dy = event.touches[0].clientY - start.y;
      if (dy < 0 || dx > Math.max(8, dy)) {
        reset();
        return;
      }
      if (dy < 8) {
        pull = 0;
        setDistance(0);
        return;
      }
      if (!event.cancelable) {
        reset();
        return;
      }
      event.preventDefault();
      pull = Math.min(96, dy * 0.45);
      setDistance(pull);
    };
    const onEnd = () => {
      const ready = pull >= 64;
      reset();
      if (ready) void refresh();
    };
    const onClick = () => {
      void refresh();
    };
    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    element.addEventListener('touchend', onEnd);
    element.addEventListener('touchcancel', reset);
    const button = element.querySelector('button.pull-refresh-action');
    button?.addEventListener('click', onClick);
    return () => {
      mounted = false;
      clearTimeout(hideTimer.current);
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', reset);
      button?.removeEventListener('click', onClick);
    };
  }, [client]);

  const label = distance
    ? distance >= 64
      ? 'Loslassen zum Aktualisieren'
      : 'Zum Aktualisieren ziehen'
    : message;
  return (
    <div
      ref={area}
      className="pull-refresh-area"
      aria-busy={refreshing || undefined}
    >
      <button
        type="button"
        className="pull-refresh-action"
        disabled={refreshing}
      >
        Daten aktualisieren
      </button>
      <div
        className="pull-refresh-feedback"
        data-visible={Boolean(label)}
        data-loading={refreshing}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <RefreshCw
          size={20}
          strokeWidth={1.8}
          aria-hidden="true"
          style={{ rotate: `${distance * 3}deg` }}
        />
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}
