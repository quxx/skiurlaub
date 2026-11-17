import { DashboardPreview } from '@/components/dashboard/DashboardPreview';
import { ForecastPreview } from '@/components/forecast/ForecastPreview';
import { ResortDataProvider } from '@/components/resort/ResortDataProvider';
import { WeatherDataProvider } from '@/components/weather/WeatherDataProvider';
import { TripInformation } from '@/components/dashboard/TripInformation';

export function HomePage() {
  return (
    <WeatherDataProvider>
      <ResortDataProvider>
        <div className="dashboard">
          <DashboardPreview />
          <ForecastPreview />
          <TripInformation />
        </div>
      </ResortDataProvider>
    </WeatherDataProvider>
  );
}
