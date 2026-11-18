# Phase 2 – Urlaubs-Dashboard

Stand: 17.11.2026. Umfang: vorhandenes Dashboard vervollständigen und Datenverhalten
absichern. Keine Backend-, Authentifizierungs-, Gruppen- oder Android-Implementierung.

## Änderungen

- Countdown und konfigurierbare Reisephasen erhalten; Reiseende bleibt optional.
  Reiseinformationen mit Start, noch offenem Ende, offiziellem Gebietslink und
  ehrlichem Hinweis zu noch nicht verfügbaren persönlichen/Gruppenstatistiken.
- Wetter- und Resort-Kontexte verwenden TanStack Query zur Bündelung von Anfragen,
  Abbruch beim Verlassen, Lade-/Fehlerzuständen und Reconnect-Verhalten.
- Automatisch alle 30 Minuten Wetter und alle 15 Minuten Resortstatus, nur bei
  sichtbarer App; nach Reiseende kein periodischer Abruf. Ein initialer Abruf beim
  Öffnen bleibt möglich. Manuelles Aktualisieren mit mindestens einer Minute
  Wartezeit, auch nach Fehlern; kein automatischer Retry-Sturm.
- Quellstand und letzter erfolgreicher Abruf getrennt mit Datum und Europe/Vienna.
  Alte Quellstände (Wetter über drei Stunden, Resort über zwei Stunden) und zu weit
  zukünftige Quellzeiten werden als veraltet markiert. Diese Schwellen sind
  konservative Produktentscheidungen, keine garantierten Anbieterintervalle.
- Zod-Verträge für Wetter, Resort und Pistengeometrien: Wertebereiche, gültige
  Zeitstempel, konsistente Reihenlängen, plausible Summen und HTTPS-Webcamlinks.
  `source_error`/`none_listed` werden als nicht verfügbar behandelt, nicht als geschlossen.
- Versionierter Cache speichert validierte Rohantworten und wird beim Lesen erneut
  vollständig validiert. Alte oder manipulierte Formate, falsche Zeitstempel und
  Einträge aus der Zukunft werden ignoriert. Wettercache maximal 48 Stunden,
  Resortcache maximal 24 Stunden als deutlich veraltete Rückfallwerte.
- Abruffehler mit vorhandenem Cache erhalten den letzten Erfolg und zeigen eine
  Erklärung. Ohne belastbare Daten bleiben Werte unbekannt, auch Prozentangaben.
  Offlinehinweis sowie Lade-/Fehlerzustände in der Prognose ergänzt.
- Netzwerkanfragen haben zwölf Sekunden Timeout. HTTP 429 mit Retry-After
  (Sekunden oder HTTP-Datum) löst Backoff aus, ersatzweise fünf Minuten.
- Open-Meteo wird mit `timeformat=unixtime` und expliziten Einheiten angefragt.
  Stunden bleiben absolute UTC-Zeitpunkte und werden in der Resort-Zeitzone
  angezeigt/den lokalen Tagen zugeordnet. Die dokumentierten festen Tagesgrenzen
  der API werden mit deren Offset in Datumswerte umgewandelt. Ein alter erster
  Prognosetag wird nicht mehr pauschal „Heute“ genannt.
- Eigenständiger SnowProvider-Vertrag und Modelladapter nutzen dieselbe bereits
  validierte Wetterantwort ohne zusätzlichen Netzabruf. Anzeige ausdrücklich
  „Modellwert / keine Messung“; heutiger Neuschnee ist eine Prognose, keine Messung.
  Keine Ableitung offizieller Berg-/Talschneehöhen aus Modellwerten.
- Anzahl offener Pisten zusätzlich zu offenen Pistenkilometern, sofern vom Feed
  geliefert. Keine Ableitung einer Gesamtzahl aus unvollständigen Einzelmeldungen.
- Datenquellen und Attribution direkt im Dashboard, einschließlich offizieller
  Berichtseite und Hinweis auf die maßgeblichen Anzeigen vor Ort.

## Quellenprüfung und Kosten

| Quelle                                                                                                  | Prüfung / Nutzungsrahmen                                                                                                                                                                        | Intervall und Kosten                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Open-Meteo](https://open-meteo.com/en/terms)                                                           | private nichtkommerzielle Nutzung, CC BY 4.0, Attribution; [API-Dokumentation](https://open-meteo.com/en/docs) zu Einheiten und Zeitformaten geprüft                                            | App: 30 Minuten, höchstens circa 48 automatische Abrufe pro aktivem Browser/Tag; Free API unter 10.000/Tag, 5.000/Stunde, 600/Minute                                    |
| [status.live](https://status.live/terms)                                                                | nichtoffiziell, persönlich/nichtkommerziell kostenlos, Attribution und Originalcredits erhalten; [Rate Limits](https://status.live/llms.txt) und [Credits](https://status.live/credits) gelesen | App: 15 Minuten, maximal circa 96 automatische Abrufe pro aktivem Browser/Tag; JSON-API dokumentiert 120 Requests/Minute/IP                                             |
| [Offizieller Schneebericht](https://www.zillertalarena.com/info-service/livecams-wetter/schneebericht/) | Bericht vorhanden, kein freigegebener maschinenlesbarer Feed in dieser Prüfung bestätigt; keine Scraping-Implementierung                                                                        | verlinkt, keine automatischen Abrufe                                                                                                                                    |
| [OSM-Kacheln](https://operations.osmfoundation.org/policies/tiles/)                                     | Attribution sichtbar, Browsercache beibehalten, kein Offline-Prefetch; keine Verfügbarkeitsgarantie                                                                                             | bestehende sichtausschnittbezogene Nutzung, kein neuer Dienst                                                                                                           |
| [LiftRadar](https://liftradar.eu), [OpenSkiMap](https://openskimap.org/)                                | vorhandene Geometrieintegration beibehalten und validiert; OSM-Datenherkunft ist keine automatische Freigabe für jede Hosting-/Weiterverteilungsform                                            | Stand 18.11.2026: Abruf laut [LiftRadar-API-Seite](https://liftradar.eu/de/api) erlaubt (frei lesbar, Kacheln ODbL, Quellenangabe nötig); Hinweise siehe phase-9-gps.md |

Die Intervalle sind App-Entscheidungen und versprechen keine Echtzeitdaten.
Keine kostenpflichtigen Dienste, Accounts oder Ressourcen angelegt. Die zentrale
Provider-Zwischenspeicherung bleibt für das spätere Backend vorgesehen; aktuell
gelten Abrufe pro Browser und zusätzliche manuelle Abrufe innerhalb der Limits.

Am 17.11.2026 einmaliger lesender Liveabruf: Open-Meteo HTTP 200, sieben Tage,
168 Stunden, numerische UTC-Zeitpunkte; status.live HTTP 200, `reported`, Lift-
und Pistenanzahlen sowie Pistenkilometer vorhanden. Das ist eine Momentaufnahme,
keine Verfügbarkeitsgarantie oder vollständige Prüfung aller Felder im Livebetrieb.
Die Web-Leseumgebung konnte die API-URLs nicht öffnen; die Prüfung erfolgte per
direktem HTTP-Abruf. Nutzungsbedingungen wurden über die offiziellen Seiten gelesen.

## Tests und Abnahme

Unit-/Komponententests: Providerverträge, Summenkonsistenz, Reihenlängen,
Cachevalidierung, Frische/Alter, fehlender Speicher, UTC/DST und lokale
Tagesgrenzen, unbekannte Schneemesswerte, Query-Deduplizierung, manuelle
Aktualisierung, Polling-Stopp, Offlinefehler und Retry-After.
Desktop-/Mobil-Browsertests zusätzlich für Cache bei Ausfall, alte Prognosetage,
Modellkennzeichnung und beschädigte Antworten. Alle automatisierten Fixtures sind
synthetisch, keine personenbezogenen Daten oder Zugangsdaten.

Prüfstand: Typecheck, ESLint ohne Warnungen und Produktionsbuild erfolgreich.
34 Unit-/Komponententests in neun Dateien erfolgreich; zusätzlich zwölf
Desktop-/Mobil-Browsertests erfolgreich. Screenshots des Dashboards geprüft.
Prettier-Formatprüfung und `git diff --check` erfolgreich.
Zusätzliche Regressionen decken Kartenkoordinaten, verständliche DOM-Timeouts und
den sofortigen erneuten Abruf nach Wiederverbindung trotz kürzlich geladenem
Cache-Rückfall ab. Wiederverbindung bleibt nach Reiseende deaktiviert.

## Offene Punkte

Offizielle Berg-/Talschneehöhen bleiben unbekannt, bis eine zulässige Datenquelle
bestätigt ist; der offizielle Bericht ist erreichbar verlinkt. Diese Einschränkung
ist bewusst sichtbar und kein ersatzweise erfundener Messwert. Rechtliche Freigaben
für zusätzliche externe Datenquellen sind nicht durch diese technische Prüfung erteilt.
Der Wetterspeicher ist ein Datenrückfall, keine vollständige Offline-App; App-Shell
und persistente Synchronisierung gehören in Phase 8. Gruppen-/persönliche Vorschauen
und Urlaubsrekorde benötigen die späteren Fachmodule. Echte Android-Geräte, Firefox,
Safari und ein Cloudflare-Deployment wurden hier nicht geprüft. Phase 3 benötigt
vor Implementierung eine Entscheidung über den unabhängigen Login und Versanddienst.
