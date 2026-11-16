import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type WeatherPresentation = {
  label: string;
  icon: LucideIcon;
  isSunny: boolean;
};

export function weatherPresentation(code: number): WeatherPresentation {
  if (code === 0) return { label: 'Klarer Himmel', icon: Sun, isSunny: true };
  if (code === 1) return { label: 'Überwiegend klar', icon: Sun, isSunny: true };
  if (code === 2) return { label: 'Teilweise bewölkt', icon: Cloud, isSunny: false };
  if (code === 3) return { label: 'Bedeckt', icon: Cloud, isSunny: false };
  if (code === 45 || code === 48) return { label: 'Nebel', icon: CloudFog, isSunny: false };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { label: code >= 66 ? 'Gefrierender Regen' : 'Regen', icon: CloudRain, isSunny: false };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { label: code === 75 || code === 86 ? 'Starker Schneefall' : 'Schneefall', icon: CloudSnow, isSunny: false };
  }
  if (code >= 95) return { label: 'Gewitter', icon: CloudLightning, isSunny: false };
  return { label: 'Wetterlage unbekannt', icon: Cloud, isSunny: false };
}
