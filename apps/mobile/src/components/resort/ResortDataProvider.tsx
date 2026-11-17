import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';
import { statusLiveProvider } from '@/data/resort/status-live-provider';
import { useRemoteResource } from '@/hooks/useRemoteResource';
import type { ResortStatus } from '@/types/resort';

type ContextValue = ReturnType<typeof useRemoteResource<ResortStatus>>;
const ResortContext = createContext<ContextValue | null>(null);
export function ResortDataProvider({ children }: PropsWithChildren) {
  const value = useRemoteResource(
    'resort',
    statusLiveProvider.getStatus,
    15 * 60_000,
  );
  return (
    <ResortContext.Provider value={value}>{children}</ResortContext.Provider>
  );
}
export function useResortData(): ContextValue {
  const context = useContext(ResortContext);
  if (!context) throw new Error('ResortDataProvider missing');
  return context;
}
