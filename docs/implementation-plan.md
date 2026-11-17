# Phase 0: Migration, Risiken und nächste Phase

Stand 17.11.2026. Vorschlag zur Prüfung; Umsetzung erst nach Freigabe.

## Phase 1 konkret

1. Bestehende Countdown-, Provider-, Prognose- und Kartenfunktionen mit
   Charakterisierungstests absichern; keine neuen Livequellen hinzufügen.
2. Nach Architekturfreigabe pnpm-Workspace aufbauen und bestehende App nach
   `apps/web` verschieben; Aliase, Assetpfade, Dev-/Buildbefehle nachführen.
   API und Fachpakete nur soweit bereits benötigt vorbereiten.
3. ESLint, Prettier, Vitest, React Testing Library und Playwright einrichten;
   kompatible Versionen/API-Dokumentation vor Installation erneut prüfen.
4. React Router: Home, Skitage, Gruppe, Skipässe, Profil. Nicht vorhandene
   Bereiche erhalten ehrliche leere Ansichten ohne fingierte persönliche Daten.
5. Nordic-Clean-Tokens mit Salbei/Naturtönen, Light/Dark/System und persistenter
   Auswahl; mobile Bottom-Navigation, Desktop-Sidebar, Safe Areas, Tastaturfokus,
   ausreichend große Touch-Ziele und lesbare Kontraste.
6. Bestehendes Dashboard in die Hülle integrieren; gebietsspezifische Zuordnungen
   aus Darstellung isolieren, Kartenmodul lazy laden. Keine Liveprovider neu bauen.
7. CI für Frozen-Install, Format, Lint, Typecheck, Unit-/Komponententests,
   Build und kleinen Web-E2E-Flow. Dokumentation und Reviewübergabe.

Abnahme: direkter Einstieg und Reload aller Routen, Navigation auf Mobil/Desktop,
Theme inklusive Systemwechsel und Neustart, Countdown-Grenzen und unbekanntes
Reiseende, fehlgeschlagene Provider mit/ohne Cache, unveränderte Prognose-/Karten-
Funktionen, unbekannte/mehrdeutige Liftzuordnung neutral. Fixtures synthetisch;
Netzwerk in Tests mocken. DST-Test und Enddatum-vor-Start-Validierung ergänzen.
Playwright prüft Navigation, Theme und Dashboard-Fehlerfall.

## Weitere Phasen und Abhängigkeiten

| Phase | Umfang / Freigabepunkt                                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------- |
| 2     | Dashboard härten: getrennte Schneequelle, Vertragsvalidierung, Quellen-/Lizenzprüfung, Cache-/Zeitzonentests    |
| 3     | Worker/D1, Migrationen, unabhängige Anmeldung; Loginanbieter, Sessions und Datenschutzkonzept zuvor entscheiden |
| 4     | Mock-/Import-Skiline, Schemas, Sync; echter Adapter bleibt bis Freigabe deaktiviert                             |
| 5     | Skipässe, manuelle Eingabe, Capacitor-Grundlage und NFC-Gerätetest; Registrierung nur bestätigt                 |
| 6     | persönliche Statistiken, Quellenkennzeichnung, Recharts, Saisons und Rekorde                                    |
| 7     | Gruppen, Einladungen, Freigaben, Rankings; Berechtigungs-Negativtests für jeden Ressourcentyp                   |
| 8     | IndexedDB/native Persistenz, Queue, App-Shell, Konflikt- und Reconnecttests                                     |
| 9     | nativer GPS-Dienst, Auswertung, optionale Gruppenfreigabe; Akku-/Geräteabnahme vor Aktivierung                  |
| 10    | reproduzierbarer signierter Android-Release, Releasekanal, APK-Updateprüfung                                    |
| 11    | Regression, Sicherheits-/Kostenprüfung, Restore-Test, Betriebs- und Benutzeranleitung                           |

Gruppenfähige Schemas/Autorisierungsregeln bereits Phase 3 berücksichtigen;
Gruppenprodukt erst Phase 7. Lokales GPS-Speichermodell erst nach Phase 8.
NFC erfordert Capacitor schon Phase 5, dessen Release-Abschluss bleibt Phase 10.
Jede Phase endet mit Checks, dokumentierten Einschränkungen und Reviewstopp.

## Risiken

| Risiko                                | Auswirkung                                | Gegenmaßnahme / Entscheidung                                                                   |
| ------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Undokumentierte Skiline-Schnittstelle | Sperre, Änderungen, unzulässige Nutzung   | Mock/Import zuerst, Freigabe und Vertragstest vor Live                                         |
| Gruppenzugriff / GPS-Historie         | Offenlegung privater Bewegungen           | serverseitige Ressourcenprüfung, explizite Freigaben, Negativtests                             |
| Offline nach Gruppenaustritt          | heruntergeladene Kopien bleiben vorhanden | keine sofortige Fernlöschung versprechen, kurze Cachegültigkeit und Löschversuch bei Reconnect |
| Eigener E-Mail-Login                  | Versandkosten, Zustellung, Missbrauch     | Anbieterwahl vor Phase 3; Codeversuche begrenzen, unabhängige Identität                        |
| Freikontingente / CPU                 | Anfragen scheitern bei Grenzen            | indizierte Abfragen, kleine Uploadsegmente, Limits und Messung                                 |
| Geometrie-/Status-Matching            | falscher Betriebsstatus                   | stabile Provider-Mappings, Mehrdeutigkeit neutral, keine Sicherheitsnavigation                 |
| Drittanbieter-/Kartenlizenzen         | Quelle nicht weiterverwendbar             | Attribution und Nutzungsrecht je Dienst; offlinefähigen Kartenanbieter separat prüfen          |
| Android GPS/NFC                       | UID falsch interpretiert, Trackinglücken  | Bestätigung und reale Geräte-/Kartenprüfung, native Dienste                                    |
| Akku                                  | Tracking unbrauchbar                      | adaptive Intervalle, Vergleichsmessung, optional lassen                                        |
| Signing-Key-Verlust                   | APK-Updates unmöglich                     | verschlüsseltes Backup, eingeschränkte CI-Secrets, Restoreprobe                                |
| Vorhandene Qualitätssicherung fehlt   | Regression beim Umbau                     | Charakterisierungstests vor Strukturänderung                                                   |

## Freigaben und offene Punkte

Vor Phase 1: Zielstruktur/pnpm und vorgeschlagenen UI-Umbau bestätigen.
Vor Phase 3: unabhängigen Loginanbieter, zulässige Kosten, Aufbewahrung und
Gruppenfreigaben festlegen. Vor Live-Skiline: Freigabe und anonymisierte
Exporte/Vertragstests erforderlich. Vor GPS: Geräte, Akku-Budget und
Objektspeicherentscheidung. Reiseende bleibt offen und blockiert Phase 1 nicht.

Phase 0 ändert ausschließlich Dokumentation; keine neue Anwendung oder
Testinfrastruktur implementiert. Validierungsergebnisse siehe Deployment-Dokument.
