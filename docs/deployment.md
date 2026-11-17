# Deployment, Kosten und Prüfstand

Aktueller Stand Phase 3: ausschließlich native Android-App; Cloudflare hostet
das Backend, keine Website. Die API ist auf
`https://skiurlaub-api.kroniq-caps.workers.dev` veröffentlicht. Eigene D1-Datenbank
`skiurlaub-db`, beide Migrationen und Secrets sind eingerichtet. Die konfigurierte
APK ist installiert und die API live geprüft. Echte Google-Anmeldung und erhaltene
Sitzung nach vollständigem App-Prozessneustart sind auf dem Handy bestanden.
Siehe [Google- und Cloudflare-Setup](google-login-setup.md).
Die folgenden Abschnitte dokumentieren historische Planungsstände.

Phase 0, 17.11.2026. Kein Deployment vorgenommen.
Aktueller Phase-1-Buildpfad: `apps/web/dist`; Root-Kommandos verwenden pnpm.
Siehe [Phase-1-Abnahme](phase-1-migration.md). Die Prüfergebnisse weiter unten
beschreiben den historischen Stand bei Phase 0.
Vorschlag: Worker Assets für Web, `/api/v1` im selben Worker, D1 für Relationen.
Secrets ausschließlich Worker-/CI-Secrets; `.env.example` enthält bereits nur
öffentliche VITE-Konfiguration. VITE-Variablen niemals für Geheimnisse nutzen.
Preview/Produktion mit getrennten Datenbanken und Secrets; lokale D1-Migrationen
und Integrationstests vor Remote-Migration. Keine echten Nutzerdaten in Preview.

## Geprüfte externe Bedingungen

| Dienst       | Gelesener Stand / Folgerung                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Workers Free | 100.000 Requests/Tag, 10 ms CPU je Aufruf; große Parser-/GPS-Jobs segmentieren                                 |
| D1 Free      | 5 Mio. gelesene und 100.000 geschriebene Zeilen/Tag, 5 GB Gesamtspeicher; einzelne DB-Limits zusätzlich prüfen |
| Open-Meteo   | nichtkommerziell, unter 10.000 Abrufen/Tag, 5.000/Stunde, 600/Minute; CC BY 4.0 Attribution                    |
| status.live  | persönlich/nichtkommerziell kostenlos; produktive Abruffrequenz und Datenverwendung weiter prüfen              |
| OSM-Kacheln  | Attribution, Caching gemäß Header, kein Bulkdownload/Offline-Prefetch; keine Verfügbarkeitsgarantie            |

Quellen: [Workers](https://developers.cloudflare.com/workers/platform/pricing/),
[D1](https://developers.cloudflare.com/d1/platform/pricing/),
[Open-Meteo](https://open-meteo.com/en/terms),
[status.live](https://status.live/terms),
[OSM](https://operations.osmfoundation.org/policies/tiles/).

Planungsbeispiel, keine Messung: 10 Nutzer × 96 Abrufe pro acht Stunden ×
3 API-Routen = 2.880 Requests/Tag. Bei 100 indizierten gelesenen Zeilen/Abruf
288.000 Reads; öffentliche Provider zentral cachen. Andere Kontonutzung,
Schreibamplifikation durch Indizes, Bots und GPS-Uploads zusätzlich berücksichtigen.
0 Euro für Worker/D1 erscheint dafür realistisch, ist keine Gesamtkostengarantie.
E-Mail-Versand, Domain, Objektspeicher, Karten und CI-Kontingente bleiben offen.
Keine kostenpflichtigen Ressourcen ohne Freigabe; bei Limits Funktionen kontrolliert
einschränken, nicht automatisch Tarif wechseln. Vor jeder Aktivierung neu prüfen.

## Backup-/Restore-Plan

Vor Migration verschlüsselten D1-Export und Konfigurationsversion sichern;
vorläufig tägliche Backups bei aktiver Nutzung vorschlagen. Private Trackobjekte
mit Prüfsummen/Manifest und Formatversion sichern. Schlüssel getrennt sichern,
nie im Repository. Aufbewahrung und Speicherort vor Produktion vereinbaren.
Restore zunächst in isolierte Datenbank/Bucket: Migrationstand, Foreign Keys,
Zeilenzahlen, Eigentümerzuordnung, Objektprüfsummen und Beispielabrufe prüfen;
Sessions nach Notfall gegebenenfalls widerrufen. Erst danach kontrollierter Wechsel.
D1 Time Travel ergänzend prüfen, nicht als einziges externes Backup voraussetzen.
RPO/RTO und regelmäßigen Restore-Test vor Phase 11 vereinbaren.

## Ausgeführte Prüfungen

`npm run typecheck`: erfolgreich. `npm run build`: erfolgreich (2.073 Module,
JavaScript 445,14 kB, gzip 134,83 kB; Hero-Bild 2.475,69 kB).
`npm run lint` und `npm test`: nicht ausführbar,
Skripte fehlen. Keine vorhandenen Unit-/Integration-/E2E-/Androidtests gefunden.
Phase 0 führt keine Testinfrastruktur ein; diese ist Teil Phase 1.
Keine Live-Skiline-, NFC-, GPS-, Signing- oder Restoretests ausgeführt.
