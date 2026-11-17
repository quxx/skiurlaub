# Skiline: Planung und Freigabegrenze

Stand 17.11.2026. Ein deaktivierter Identitätsadapter liegt in
`apps/api/src/skiline.ts`; ein Live-Datenadapter existiert noch nicht.
Die Angaben zu `requestLogin`, `login`, `createTicket`, `refreshTickets` und
`getData` stammen ausschließlich aus dem Master-Prompt, nicht aus hier
verifizierten API-Verträgen. Es wurden keine Login-/Registrierungsaufrufe gesendet.

## Aktueller Recherchefund zur Anmeldung

Auf einer Skiline-Domain ist eine technische
[JAMES-Authentifizierungsdokumentation](https://documentation.production.aws.skiline.cc/james/getting-started/authentication.html)
auffindbar. Sie beschreibt API-Login, GraphQL-Login und einen Token-Austausch.
Das ist ein konkreter Hinweis auf technische Integrationsmöglichkeiten, aber
noch kein Nachweis, dass dieselben Endpunkte aktuelle allgemeine Skiline-Konten
für unsere Drittanbieter-App unterstützen oder freigegeben sind. Die Beispiele
enthalten Daten aus 2021 und einen JAMES-/Andermatt-Kontext.

Für einen App-Login über Skiline sind die aktuelle Schnittstelle und ihre
Verwendbarkeit für unsere App, eine serverseitig bestätigte stabile Nutzer-ID
und der erlaubte Token-/Anmeldeablauf zu klären. Erst danach kann der Adapter
eigene App-Sitzungen ausstellen. Ein bloßes Öffnen der Skiline-Loginseite oder
ein ungeprüft vom Client übergebener Skiline-Token reichen dafür nicht.
Die zuvor freigegebene Google-Anmeldung bleibt ein davon unabhängiger Weg.

## Datenadapter

Phase 4 beginnt mit `MockSkilineAdapter` und JSON-Importadapter mit synthetischen
Fixtures. Liveadapter separat serverseitig, standardmäßig deaktiviert und erst
nach zulässiger Nutzung und erfolgreichem Funktionstest aktivieren.
App-Anmeldung bleibt unabhängig. Keine fremden OAuth-Clients, Cookies oder
Zugriffsschutzumgehung. Kein Provider-Token in Frontend, Logs oder Fixtures.

Adapteroperationen: Konto verbinden/trennen, Daten importieren/lesen,
Ticket explizit registrieren und aktualisieren. Ergebnisse typisiert:
erfolgreich, unverändert, nicht gefunden, übersprungen, Rate Limit,
Authentifizierung abgelaufen, unbekannter Fehler. Unbekannte Antworten erhalten
keinen erfundenen Erfolgsstatus. Timeout 600 Sekunden und Tokenlaufzeit circa
180 Tage sind Beobachtungen, keine garantierten Konfigurationen.

Ticket-Union: Skidata(nr1–nr4), OCC(nr1–nr3), ChipNumber(nr2).
Feldpflichten, Datumssemantik, forceTicketCreation und contractIds müssen vor
Livebetrieb geprüft werden. IDs als unterschiedliche Typen und Tabellenfelder;
334 und 141 sind Beispiele externer Gebiets-IDs, keine fachlichen Konstanten.

`SkiingDay.data`: zuerst äußeres Schema, dann begrenzten JSON-String parsen,
danach inneres Zod-Schema validieren. Größen-/Tiefenlimits, ungültiges JSON,
null, fehlende Felder, negative/unendliche Werte und geänderte Antwortformen
testen. Fehlerhafte Datensätze mit verständlicher Meldung abweisen.

Sync: pro Konto/Ticket deduplizieren, letzten Erfolg getrennt vom letzten
Versuch führen; manuell und beim Öffnen, periodisch nur optional. Mindestabstand,
Backoff/Jitter und Retry-After beachten; fünf Minuten erst nach Rate-Limit-Prüfung.
Offen: Nutzungsfreigabe, Auth-/Refreshvertrag, Rate Limits, Einheiten,
Saisonformat, Zeitzone, externe ID-Stabilität, Ticketlöschung und Rechteumfang.
