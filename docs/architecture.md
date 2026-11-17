# Phase 0: Architekturvorschlag

Stand 17.11.2026, zur Freigabe. Bestehende React-App schrittweise erweitern.
Ein API-Worker, eine D1-Datenbank, dieselben Verträge für Browser und Android.
Keine Microservices, kein Zustand ohne konkreten Bedarf.

## Zielstruktur

```text
apps/web/             bestehendes src/public/Vite; später android/ von Capacitor
apps/api/             Worker, Routen, Autorisierung, D1-Migrationen, Provider
packages/shared/      Zod-Schemas, DTOs, IDs, Datum-/Statistikfunktionen
packages/skiline/     serverseitige Adapter, Mock und Import
packages/gps/         reine Validierung/Auswertung ohne Android-Abhängigkeit
docs/                 Entscheidungen und Betriebsanleitungen
.github/workflows/    später Qualitäts- und Release-Pipelines
```

pnpm Workspaces als Vorschlag für Web/API/Verträge; Umzug atomar in Phase 1,
npm-Lockfile erst nach funktionierendem pnpm-Frozen-Install ersetzen.
`gps` und weitere Pakete erst bei tatsächlicher Verwendung anlegen.
UI zunächst innerhalb der Web-App; kein leeres gemeinsames UI-Paket.

Browser → Worker Assets + `/api/v1` → D1. Android-WebView → dieselbe HTTPS-API.
React Router für fünf Bereiche; TanStack Query für Serverzustand; Theme und
kleine lokale Einstellungen mit React und versionierter Persistenz.
Recharts erst Phase 6. Zod für Netz-, Import-, Konfigurations- und Cachegrenzen.
Wetter-, Schnee-, Resort- und Geometrieprovider bleiben getrennte Verträge.
Zentrale öffentliche Provider-Caches später im Worker vermeiden Abrufe je Nutzer.
Private Daten erhalten keinen öffentlichen CDN-Cache.

## Identität und Berechtigungen

Eigene App-Identität zuerst; Vorschlag E-Mail-Einmalcode mit unabhängigem
Versanddienst, erst nach Anbieter-/Kostenentscheidung in Phase 3.
Alternative Passkeys prüfen, falls Versanddienst nicht gewünscht.
Kein produktiver Login vor dieser Entscheidung. Skiline wird anschließend
als optionales Konto verbunden, niemals als eigener Sessionnachweis akzeptiert.
Browser: zufällige opaque Session im Secure/HttpOnly-Cookie, serverseitig nur Hash.
Android: eigener widerrufbarer Sitzungstyp, Geheimnis im Keystore-gestützten
Speicher; genauer Login-Rückkanal und CORS/CSRF-Verhalten in Phase 3 testen.

Jeder Zugriff prüft aktuelle Mitgliedschaft und explizite Ressourcenzuordnung.
Freigaben getrennt für Vergangenheit, neue Skitage, Skipass-Metadaten und volle
GPS-Routen; neue Gruppen erhalten keine historischen Daten automatisch.
DTOs enthalten niemals E-Mail, Ticketnummer oder Provider-Token anderer Nutzer.

## Erstes relationales Datenmodell

Alle internen IDs generierte Text-UUIDs; UTC-Zeitstempel, lokale Skitag-Daten
plus IANA-Zeitzone; Meter als Einheit, Kilometer erst zur Darstellung.
Foreign Keys und CHECKs, Migrationen versioniert; folgende Tabellen sind Entwurf.

| Tabelle                 | Wichtige Felder / Beziehungen                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| users                   | id, email_normalized UNIQUE, display_name, avatar_ref, created_at                                                   |
| user_sessions           | id, user_id FK, secret_hash UNIQUE, client_type, expires_at, revoked_at                                             |
| auth_challenges         | id, email, code_hash, expires_at, attempts, consumed_at; für unabhängigen OTP-Login                                 |
| groups                  | id, name, created_by FK users                                                                                       |
| group_members           | group_id FK, user_id FK, role, joined_at; gemeinsamer PK                                                            |
| group_invites           | id, group_id FK, code_hash UNIQUE, expires_at, revoked_at, max_uses, use_count                                      |
| ski_trips               | id, group_id FK, resort_id FK, name, starts_at, ends_at NULL, time_zone, mode_override NULL                         |
| ski_resorts             | id, parent_id FK optional, name, time_zone, coordinates                                                             |
| resort_provider_ids     | resort_id FK, provider, external_id; UNIQUE(provider, external_id)                                                  |
| provider_connections    | id, user_id FK, provider, encrypted_credentials, key_version, expires_at, revoked_at                                |
| ski_passes              | id, user_id FK, resort_id FK, format, encrypted_identifier, masked_label, status                                    |
| pass_provider_ids       | pass_id FK, provider, id_kind, external_id; scoped UNIQUE; numeric/technical/user-ticket IDs getrennt               |
| skiing_days             | id, user_id FK, pass_id FK optional, resort_id FK, local_date, source, external_id, synced_at, revision             |
| skiing_day_statistics   | id, day_id FK, source, vertical_m, lift_count, slope_distance_m, duration_s, quality, algorithm_version             |
| gps_tracks              | id, user_id FK, day_id FK optional, started_at, ended_at, object_key, checksum, format_version, revision            |
| resource_shares         | group_id FK, owner_id FK, day_id/pass_id/track_id FK; CHECK genau ein Ziel; UNIQUE je Ziel/Gruppe                   |
| group_share_preferences | group_id/user_id FK, future_days, future_tracks, history_from NULL; zusammengesetzter PK                            |
| sync_jobs               | id, user_id FK, connection_id FK optional, kind, idempotency_key, state, attempts, next_attempt_at, last_success_at |
| app_releases            | id, platform, channel, version_name, version_code, min_supported_code, apk_url, sha256, published_at                |

Rohimport und berechnete/akzeptierte Messwerte logisch trennen; begrenzte
Rohpayloads geschützt speichern, keine Token aus Payloads übernehmen.
Dedup über UNIQUE(user_id, source, external_id) für stabile externe IDs;
Import ohne stabile ID mit dokumentiertem kanonischem Fingerprint.
Indizes auf Sessions(user_id, expires_at), Mitglieder(user_id, group_id),
Skitage(user_id, local_date), Shares(group_id), Jobs(state, next_attempt_at).
Eigentümer von Freigabe und Ziel muss zusätzlich in der API übereinstimmen.
Letzter Gruppenadmin darf nicht ohne Übergabe austreten.

GPS: D1 nur Metadaten und Summen; komprimierte, versionierte Tracksegmente
lokal, später eventuell privater R2-Bucket nach Kostenfreigabe. Keine Zeile
pro Sekunde. Löschstrategie für Metadaten, Objekte und Backups gemeinsam festlegen.

Initiale Reise: Hochkrimml/Zillertal Arena, Start 10.01.2027 Europe/Vienna,
Ende NULL bis Nutzerangabe; kein erfundenes Enddatum. Saison und Reise sind
getrennte Konzepte, mehrere Reisen pro Saison möglich.
