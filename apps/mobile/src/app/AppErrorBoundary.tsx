import { Component } from 'react';
import type { PropsWithChildren } from 'react';

export class AppErrorBoundary extends Component<
  PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="empty-page" role="alert">
        <h1>Die Ansicht konnte nicht geladen werden.</h1>
        <p>
          Bitte lade die Seite erneut. Falls der Fehler bleibt, prüfe die
          Reisekonfiguration.
        </p>
        <button
          className="retry-button"
          type="button"
          onClick={() => window.location.reload()}
        >
          Erneut laden
        </button>
      </section>
    );
  }
}
