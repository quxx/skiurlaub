# GPS und Offline: Entwurf

Phase 0. Modul optional, nie automatisch starten. Capacitor verbindet das Web-UI
mit einem nativen Android-Standortdienst inklusive sichtbarer Foreground-
Benachrichtigung. Der Standard-Geolocation-Wrapper allein ist keine Zusage für
zuverlässige Aufzeichnung bei gesperrtem Bildschirm.
Quellen: [Capacitor Geolocation](https://capacitorjs.com/docs/apis/geolocation),
[Android Akku und Standort](https://developer.android.com/develop/sensors-and-location/location/battery).

Rohpunkte mit Zeit, Koordinaten, Höhe und Genauigkeit lokal in versionierten
Segmenten sichern, auch bei Prozessneustart. Start/Pause/Fortsetzen/Stoppen explizit.
5–15 Sekunden als Experiment; Bewegung, Geschwindigkeit, Genauigkeit und Pausen
steuern Intervalle. Batched Locations prüfen. Ausreißer, Sprünge und Glättung
testen; Lift/Abfahrt und Pistenerkennung nur mit Qualitätsangabe.
Rohdaten, abgeleitete Messungen und bestätigte Ergebnisse trennen; GPS und
Skiline nie unbemerkt addieren. Abgleich über Zeit/Gebiet/Lift bleibt nachvollziehbar.

Browser: IndexedDB für versionierte Daten und persistente Queue; Android:
native persistente Datenbank/Dateien plus Keystore für Geheimnisse, Pluginwahl
erst nach Lizenz-/Wartungsprüfung. App-Shell später per Service Worker.
Queue enthält UUID, Nutzer, Schema-Version, Revision, Versuchszähler und Status.
API dedupliziert pro Nutzer/Idempotency-Key; Wiederholungen liefern dasselbe
Ergebnis. Konflikte per Revision melden, keine stillen Überschreibungen von
Routen; Backoff, Authpause und sichere Wiederaufnahme nach Reconnect.

Offline lesbar: eigene Daten, freigegebene Cacheansichten mit Quellzeit, lokale
Tracks und Urlaubsinfos. Offline schreibbar: Tracks und unkritische Einstellungen.
Gruppenänderungen nur online. Gruppen-Cache ist widerrufbare Zugriffskopie mit
technisch begrenztem Rückruf (siehe security.md).

Akkuabnahme erst nach gemeinsam festgelegtem Budget. Vorläufig 15–20 zusätzliche
Prozentpunkte in acht Stunden als Diskussionswert, keine Garantie. Gleiche Geräte
mit/ohne Tracking vergleichen: Display an/gesperrt, acht Stunden, schlechter Empfang,
offline, Energiesparmodus und lange Pausen. Pro Lauf Gerät/Android, Dauer,
Akku vorher/nachher, Punktzahl/-genauigkeit, Lücken, Neustarts und CPU/Standortnutzung
protokollieren. Auch Berechtigungsentzug, voller Speicher und Appneustart prüfen.
Bei Nichterfüllung optimieren und experimentell lassen.

Karten: OSM-Datenlizenz und Kachelhost-Nutzungsrecht getrennt prüfen. Öffentliche
OSM-Kacheln nicht für Offline-Prefetch verwenden:
[Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).
LiftRadar/OpenSkiData und Intermaps-Rechte vor zusätzlicher Nutzung klären;
eine vorhandene URL beweist kein Nutzungsrecht.
