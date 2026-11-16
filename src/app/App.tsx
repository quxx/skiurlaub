import { DashboardPreview } from '@/components/dashboard/DashboardPreview';
import { ForecastPreview } from '@/components/forecast/ForecastPreview';
import { AppFooter } from '@/components/layout/AppFooter';
import { ResortDataProvider } from '@/components/resort/ResortDataProvider';
import { TripHero } from '@/components/hero/TripHero';
import { WeatherDataProvider } from '@/components/weather/WeatherDataProvider';

export function App() {
  return (
    <WeatherDataProvider>
      <ResortDataProvider>
        <div className="min-h-screen overflow-x-hidden bg-midnight-950 text-ice-50">
          <TripHero />
          <main>
            <DashboardPreview />
            <ForecastPreview />
          </main>
          <AppFooter />
        </div>
      </ResortDataProvider>
    </WeatherDataProvider>
  );
}
