# Phase 4: Skiline-Adapter (Mock, Import, Modelle)

Stand 18.11.2026. **Es gibt keinen einzigen Netzwerkaufruf zu Skiline.** Der Live-Adapter
ist implementiert, aber gesperrt; er enthält absichtlich keinen HTTP-Code.

## Ergebnis

Skiline-Daten sind innerhalb der App strukturiert nutzbar: Ein JSON-Export (oder der
Mock) wird validiert, normalisiert und pro Nutzer in D1 gespeichert. Es gibt noch keine
Oberfläche dafür (Skitage-Ansicht = Phase 6, Skipässe = Phase 5).

## Bestandteile

### `packages/skiline` (neues Paket `@skiurlaub/skiline`, rein TypeScript, ohne I/O)

| Datei            | Inhalt                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ids.ts`         | getrennte, gebrandete ID-Typen: numerische Ticket-ID, Ticket-UUID, Benutzer-Ticket-UUID, Gebiet, Teilgebiet, Skitag     |
| `tickets.ts`     | Discriminated Union Skidata (nr1–nr4) / OCC (nr1–nr3) / ChipNumber (nr2), Registrierung nur mit `confirmedByUser: true` |
| `api-schemas.ts` | Zod für `getData` und für den **verschachtelten JSON-String** `SkiingDay.data`; Größen- und Wertegrenzen                |
| `normalize.ts`   | Export → `NormalizedSkiDay`; kaputte Datensätze werden einzeln abgewiesen; lokale Tage mit Zeitzone                     |
| `results.ts`     | Ergebnistypen; `RefreshOutcome` mit 7 getrennten Zuständen; `classifyRefresh`                                           |
| `adapter.ts`     | Schnittstelle `SkilineAdapter` (Login anfordern/bestätigen, trennen, Daten, Ticket anlegen, Refresh)                    |
| `mock.ts`        | `MockSkilineAdapter`, nur `@example.invalid`, Code `000000`, simulierbare Fehler                                        |
| `fixtures.ts`    | vollständig synthetische Beispieldaten (keine echten Konten)                                                            |
| `sync.ts`        | reine Regeln: Mindestabstand, Backoff mit Jitter, Retry-After, letzter Versuch/Erfolg getrennt, „veraltet“              |
| `live.ts`        | `LiveSkilineAdapter` (Standard `enabled: false`), `SkilineTransport`, `TokenVault`, `redactSecrets`                     |

### Backend (`apps/api`)

- Migration `0003_skiing_days.sql`: `ski_resorts`, `resort_provider_ids`, `skiing_days`,
  `skiing_day_statistics`, `sync_jobs`. Dedup über `UNIQUE(user_id, source, external_id)`,
  Rohdaten (`raw_payload`, max. 512 KB) getrennt von berechneten Werten.
- `POST /api/v1/skiline/import`: angemeldet, max. 4 MiB, max. 366 Tage, 10 Importe pro
  Stunde und Nutzer. Idempotent (Inhalts-Hash je Tag, nur Neues/Geändertes wird geschrieben).
  Antwort: angelegt/aktualisiert/unverändert und je abgewiesenem Datensatz ein Grund.
- `GET /api/v1/skiing-days`: nur eigene Tage (max. 400), ohne Provider-IDs und Rohdaten.
- `DELETE /api/v1/skiing-days/:id`: nur eigene; fremde und unbekannte IDs liefern gleich 404.
- DTO-Schemas in `packages/shared` (`importReportSchema`, `skiingDaySchema`, …).

## Wichtige Entscheidungen

1. **Kein Netzwerkcode für Skiline.** Transport (HTTP-Methode, Pfade, der Wert von `config`)
   ist unbekannt und wird erst mit bestätigtem Vertrag geliefert. Der Adapter ist darüber
   getestet (Fake-Transport), aber ohne Transport nicht lauffähig.
2. **Token nie zurückgeben, nie loggen.** `login` behält nur `authToken` im `TokenVault`,
   `keycloakToken` wird verworfen; Fehlertexte des Transports werden nicht weitergereicht.
   Wo der echte Vault liegt (Gerät/Keystore oder verschlüsselt serverseitig) wird vor der
   Aktivierung entschieden; in D1 im Klartext **nie**.
3. **Einheiten nicht raten.** `verticalMeters` gilt als Meter (Name). Die Einheit von
   `slopeDistance` ist unbekannt und wird als `unknown` gespeichert und ausgeliefert. Phase 6
   darf `unknown` nicht in Kilometer umrechnen.
4. **Zeitzone nicht raten.** Reine Daten gelten als lokal, Zeitpunkte brauchen eine Zone und
   werden in die Zeitzone des Gebiets umgerechnet (aktuell Fallback `Europe/Vienna`).
5. **Refresh-Ergebnis konservativ.** Die beobachtete Antwort „alles null/leer“ ist
   `unknown`, nie Erfolg.
6. **Gebietsnamen** kommen aus Importen und werden nur beim Anlegen gesetzt (nie
   überschrieben, Steuerzeichen entfernt); Stammdaten sind für alle Nutzer gemeinsam.

## Unbestätigte Annahmen (vor Live-Betrieb klären)

- Feldnamen auf Tag/Gebiet/Ticket außer `data`: `id`, `date`, `resortId`, `ticketId`, `name`
  sind **Annahmen**. Ein echter, anonymisierter Export wird gebraucht, um sie zu bestätigen.
- Format von `graphData` (derzeit nur als begrenztes Array gespeichert, nicht ausgewertet).
- Einheit von `slopeDistance`, Dauer des Skitags (kein Feld bekannt), Saisonformat.
- Stellenlängen der Ticketnummern (Grenze 24 Ziffern ist nur eine großzügige Obergrenze).
- Bedeutung der Refresh-Felder, Rate Limits, Tokenlaufzeit, Refresh-Vertrag, Zulässigkeit.
- Zeitzone anderer Skigebiete.

## Tests

- `packages/skiline`: 72 Tests (Parser inkl. `1e999`, `null`, Größe, `__proto__`; Zeitzonen;
  Tickets; Mock-Fehlerfälle; gesperrter Live-Adapter ruft den Transport nie auf; Token-Handling;
  Sync-Regeln mit Backoff und Jitter).
- `apps/api`: 10 neue Integrationstests (`test/skiing-days.test.ts`): Anmeldung erforderlich,
  Import, Idempotenz, Revision, einzelne Ablehnungen, **Isolation zwischen Nutzern**, Löschen,
  Gebietsnamen, Größen-/Anzahl-/Formatgrenzen, Rate Limit, Fremdschlüssel.
- Nicht getestet: echtes Skiline (bewusst), Import auf dem Gerät (keine Oberfläche), Last mit
  366 großen Tagen auf echtem D1, gleichzeitige Importe desselben Nutzers.

## Betrieb / Deployment

Phase 4 ist **nicht veröffentlicht**. Zum Aktivieren (nach deiner Freigabe):
`pnpm --filter @skiurlaub/api exec wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc`,
dann `wrangler deploy --config wrangler.production.jsonc`. Mögliche Reste: verwaiste
Gebietszeilen bei exakt gleichzeitigem Erstimport desselben neuen Gebiets (harmlos).

## Offene Punkte / Freigaben

1. Freigabe und Zulässigkeit der Skiline-Nutzung; anonymisierter echter Export für den Vertragstest.
2. Wo liegen Skiline-Token (Vault-Entscheidung), Verschlüsselung, Schlüsselrotation.
3. Oberfläche für den Import (z. B. unter Skitage); Datenexport/Löschung gesamt in Phase 11.
