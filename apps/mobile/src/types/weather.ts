export type WeatherSnapshot = {
  temperatureCelsius: number;
  apparentTemperatureCelsius: number;
  snowDepthCentimeters: number;
  weatherCode: number;
  windSpeedKmh: number;
  windGustsKmh: number;
  isDay: boolean;
};

export type DailyForecast = {
  date: string;
  weatherCode: number;
  temperatureMinCelsius: number;
  temperatureMaxCelsius: number;
  snowfallCentimeters: number;
  precipitationProbabilityPercent: number;
  sunrise: string;
  sunset: string;
};

export type HourlyForecast = {
  time: string;
  temperatureCelsius: number;
  apparentTemperatureCelsius: number;
  weatherCode: number;
  snowfallCentimeters: number;
  precipitationProbabilityPercent: number;
  windSpeedKmh: number;
};
