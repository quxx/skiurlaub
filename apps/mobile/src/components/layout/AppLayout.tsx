import {
  CalendarDays,
  Home,
  MountainSnow,
  UserRound,
  Users,
  ArrowLeft,
  Settings2,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useEffect, useRef } from 'react';
import { NativeLifecycle } from '@/app/NativeLifecycle';
import { TripHeader } from './TripHeader';
import { tripConfig } from '@/app/trip-config';
import { PullToRefresh } from './PullToRefresh';

const destinations = [
  { to: '/', label: 'Start', icon: Home },
  { to: '/skitage', label: 'Skitage', icon: CalendarDays },
  { to: '/gruppe', label: 'Gruppe', icon: Users },
  { to: '/profil', label: 'Profil', icon: UserRound },
];

export function AppLayout() {
  const { pathname } = useLocation();
  const title =
    pathname === '/'
      ? tripConfig.destination
      : pathname === '/karte'
        ? 'Pistenkarte'
        : pathname === '/skipaesse'
          ? 'Skipässe'
          : pathname.startsWith('/skitage/')
            ? 'Aufzeichnung'
            : (destinations.find((item) => item.to === pathname)?.label ??
              'Seite nicht gefunden');
  const main = useRef<HTMLElement>(null);
  const previous = useRef(pathname);
  useEffect(() => {
    document.title = `${title} · Skiurlaub`;
    if (previous.current !== pathname) {
      window.scrollTo(0, 0);
      main.current?.focus({ preventScroll: true });
      previous.current = pathname;
    }
  }, [pathname, title]);
  return (
    <div className="app-layout">
      <NativeLifecycle />
      <a className="skip-link" href="#main-content">
        Zum Inhalt
      </a>
      <aside className="app-sidebar">
        <NavLink
          to="/"
          className="app-brand"
          aria-label="Skiurlaub – Startseite"
        >
          <MountainSnow aria-hidden="true" />
          <span>
            Skiurlaub<small>Gemeinsam in die Berge</small>
          </span>
        </NavLink>
        <nav className="app-navigation" aria-label="Hauptnavigation">
          {destinations.map(({ to, label, icon: Icon }) => {
            const active =
              pathname === to ||
              (to === '/profil' && pathname === '/skipaesse') ||
              (to === '/skitage' && pathname.startsWith('/skitage/'));
            return (
              <Link
                key={to}
                to={to}
                className={active ? 'active' : ''}
                aria-current={active ? 'page' : undefined}
              >
                <span className="nav-icon">
                  <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="app-body">
        <header className="app-toolbar">
          {(pathname === '/karte' ||
            pathname === '/skipaesse' ||
            pathname.startsWith('/skitage/')) && (
            <Link
              to={
                pathname === '/skipaesse'
                  ? '/profil'
                  : pathname.startsWith('/skitage/')
                    ? '/skitage'
                    : '/'
              }
              className="icon-button"
              aria-label={
                pathname === '/skipaesse'
                  ? 'Zurück zum Profil'
                  : pathname.startsWith('/skitage/')
                    ? 'Zurück zu den Aufzeichnungen'
                    : 'Zurück zur Übersicht'
              }
            >
              <ArrowLeft size={24} aria-hidden="true" />
            </Link>
          )}
          {pathname === '/' ? (
            <TripHeader />
          ) : (
            <h1 className="toolbar-context">{title}</h1>
          )}
          {pathname !== '/profil' && (
            <Link
              to="/profil"
              className="icon-button"
              aria-label="Einstellungen öffnen"
            >
              <Settings2 size={24} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          )}
        </header>
        <main id="main-content" tabIndex={-1} ref={main}>
          <PullToRefresh key={pathname}>
            <Outlet />
          </PullToRefresh>
        </main>
      </div>
    </div>
  );
}
