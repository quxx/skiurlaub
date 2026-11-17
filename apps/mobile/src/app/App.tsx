import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyPage } from '@/app/EmptyPage';
import { CalendarDays, CreditCard, Users } from 'lucide-react';
import { ProfilePage } from '@/app/ProfilePage';
import { MapPage } from '@/app/MapPage';

const HomePage = lazy(() =>
  import('@/app/HomePage').then((module) => ({ default: module.HomePage })),
);

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          index
          element={
            <Suspense
              fallback={
                <p className="route-loading" role="status">
                  Dashboard wird geladen …
                </p>
              }
            >
              <HomePage />
            </Suspense>
          }
        />
        <Route
          path="skitage"
          element={
            <EmptyPage
              title="Skitage"
              icon={CalendarDays}
              description="Hier findest du später deine Skitage und Statistiken."
            />
          }
        />
        <Route
          path="gruppe"
          element={
            <EmptyPage
              title="Gruppe"
              icon={Users}
              description="Hier planst du später mit deiner Reisegruppe."
            />
          }
        />
        <Route
          path="skipaesse"
          element={
            <EmptyPage
              title="Skipässe"
              icon={CreditCard}
              description="Hier verwaltest du später deine Skipässe."
            />
          }
        />
        <Route path="profil" element={<ProfilePage />} />
        <Route path="karte" element={<MapPage />} />
        <Route
          path="*"
          element={
            <EmptyPage
              title="Seite nicht gefunden"
              description="Unter dieser Adresse gibt es keine Seite. Über die Navigation kommst du zurück zu deinem Skiurlaub."
            />
          }
        />
      </Route>
    </Routes>
  );
}
