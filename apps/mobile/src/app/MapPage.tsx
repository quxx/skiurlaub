import { lazy, Suspense } from 'react';
import {
  ResortDataProvider,
  useResortData,
} from '@/components/resort/ResortDataProvider';
const LiftMiniMap = lazy(() =>
  import('@/components/resort/LiftMiniMap').then((module) => ({
    default: module.LiftMiniMap,
  })),
);

function ResortMap() {
  const { resource } = useResortData();
  const resort = resource.data?.data;
  return (
    <section className="map-page">
      <Suspense fallback={<p role="status">Karte wird geladen …</p>}>
        <LiftMiniMap
          lifts={resort?.liftItems ?? []}
          pisteStatuses={resort?.pisteItems ?? []}
          webcams={resort?.webcams ?? []}
        />
      </Suspense>
    </section>
  );
}
export function MapPage() {
  return (
    <ResortDataProvider>
      <ResortMap />
    </ResortDataProvider>
  );
}
