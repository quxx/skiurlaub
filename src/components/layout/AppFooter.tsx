import { MountainSnow } from 'lucide-react';

import { tripConfig } from '@/app/trip-config';

export function AppFooter() {
  return (
    <footer className="border-t border-white/7 bg-[#040a11] py-12">
      <div className="shell grid gap-8 text-xs text-ice-200/45 sm:grid-cols-2 lg:grid-cols-4 lg:items-center">
        <div>
          <div className="flex items-center gap-3 font-bold tracking-[0.14em] text-ice-50">
            <MountainSnow className="text-glacier-300" size={21} aria-hidden="true" />
            SKITRIP 2027
          </div>
          <p className="mt-3">Persönliches Dashboard für Hochkrimml.</p>
        </div>
        <div>
          <span className="footer-label">Reiseziel</span>
          <strong className="text-ice-50/75">{tripConfig.destination}</strong>
        </div>
        <div>
          <span className="footer-label">Koordinaten</span>
          <strong className="text-ice-50/75">
            {tripConfig.weatherLocation.latitude}, {tripConfig.weatherLocation.longitude}
          </strong>
        </div>
        <div className="lg:text-right">
          <span className="footer-label">Projektstatus</span>
          <strong className="text-glacier-200/80">Phase 3 · Lokal</strong>
        </div>
      </div>
    </footer>
  );
}
