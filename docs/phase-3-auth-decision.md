# Phase 3 – App-Anmeldung und Android-Sitzungen

Stand: 17.11.2026. Phase 3 ist freigegeben und lokal implementiert. Das
Produktziel ist inzwischen ausschließlich Android mit React + Capacitor.
Produktive Anmeldung bleibt aus, bis Hosting und Anmeldedienst eingerichtet sind.

## Bestätigte Entscheidungen

- Eigene App-Identität und widerrufbare Sitzungen, unabhängig von Skiline.
- Skiline bleibt bevorzugte spätere Verknüpfung, aber ohne bestätigte
  Identitäts-Schnittstelle deaktiviert; kein Skiline-Token als App-Sitzung.
- Keine eigene Domain und kein Maildienst vorhanden. Ein Cloudflare-Konto besteht;
  die lokale CLI-Anmeldung wurde bestätigt. Skiurlaub hat jetzt einen eigenen
  veröffentlichten Worker und eine eigene D1-Datenbank mit beiden Migrationen.
- Google-Anmeldung ist vom Benutzer freigegeben und als nativer Android-
  Credential-Manager-Ablauf implementiert. Setup und offene echte Abnahme:
  [Google-Anmeldung einrichten](google-login-setup.md).
- Das Backend kann eine Cloudflare-`workers.dev`-Adresse verwenden. Google braucht
  keinen E-Mail-Versand. Kein neuer Mailanbieter oder kostenpflichtiger Dienst
  aktiviert. Backend auf workers.dev veröffentlicht; siehe Setup.

## Implementiert

Worker/D1 und versionierte Migration: Nutzer, Identitäten, Sessions,
Einmalcode-Challenges, Rate Limits und minimale Gruppenmitgliedschaft.
E-Mail-Code zehn Minuten gültig, maximal fünf Versuche, atomare Einmalverwendung,
HMAC-Schutz und neutrale Antworten für nicht zugelassene Adressen. Empfänger
müssen im Produktivbetrieb explizit zugelassen sein. Mailversand über das
bestehende interne Service-Binding `AUTH_MAILER`, noch ohne konkreten Anbieter.

Eigene Sitzungen gelten 30 Tage ab letzter Nutzung (Verlängerung höchstens einmal täglich, absolut höchstens 90 Tage nach der Anmeldung; Entscheidung des Nutzers am 18.11.2026, vorher fest 7 Tage). Logout und „Alle Sitzungen beenden“ wirken weiterhin sofort. In D1 liegt nur der SHA-256-Hash.
Browser-Entwicklungsansichten behalten HttpOnly-/SameSite-Cookies und
Origin-/CSRF-Prüfung. Android verwendet einen getrennten Transport ohne Cookies:
`skiurlaub_v1_` plus 256-Bit-Zufallswert als app-eigenes Bearer-Geheimnis.
Format allein berechtigt nicht: Jede private Anfrage prüft den Sessionhash,
Ablauf und gegebenenfalls die aktuelle Gruppenmitgliedschaft.

Der native Transportmarker `X-Skiurlaub-Client: android` ist kein
Identitätsnachweis. Er gilt nur ohne Origin, Cookie und Browser-Fetch-Metadaten;
Preflight wird weiterhin abgewiesen. Browser-/Cookie- und native Sessions sind
nicht austauschbar. Kein offenes CORS erforderlich.

## Android

`SkiurlaubApiPlugin` führt ausschließlich erlaubte App-API-Aufrufe zum fest
konfigurierten Backend aus. HTTPS, kein Redirect-Following, begrenzte Bodies,
zwölf Sekunden Verbindungs-/Lese-Timeout. Keine URLs oder Header aus JavaScript.
Die native Antwort auf Codebestätigung wird abgefangen: Session speichern,
Geheimnis entfernen, erst dann Ergebnis an React zurückgeben. Die React-App
verwendet für private Requests die Bridge und erzeugt keinen Authorization-Header.

`SessionStore` verschlüsselt das Geheimnis und den Ablauf per AES-256-GCM mit
einem nicht exportierbaren Android-Keystore-Schlüssel. Der API-Ursprung ist als
AAD gebunden. Beschädigung, Schlüsselverlust, Wechsel des Backend-Ursprungs und
lokaler Ablauf erfordern eine neue Anmeldung. Abmeldung entfernt die Sitzung
serverseitig und lokal. App-Backups und Geräteübertragung der App-Daten sind
ausgeschlossen. Kein Geheimnis in LocalStorage, JS, URL oder Bridge-Ergebnis.

Die bestehende Profiloberfläche verwendet Anmeldung, Codeprüfung,
Profiländerung und Logout nun auch über den nativen Transport. Ohne konfigurierte
API bleiben Kontofunktionen ehrlich als nicht aktiviert dargestellt.

Grundlagen: [Android Keystore](https://developer.android.com/privacy-and-security/keystore)
und [Capacitor Custom Native Code](https://next.capacitorjs.com/docs/next/android/custom-code).

## Lokale Prüfung auf dem Handy

Nur Debug-Builds erlauben `http://127.0.0.1:8787`. Ein Debug-spezifisches
Network-Security-XML erlaubt Klartext ausschließlich an 127.0.0.1; Release
erzwingt HTTPS. Der lokale Worker muss zusätzlich seine eigene Testfreigabe
und Loopback-Konfiguration erfüllen. Nur synthetische `@example.invalid`-Adressen,
keine echten E-Mails. `/dev/code` ist in der nativen Bridge ausschließlich für
diese Debug-/Loopback-Kombination erlaubt.

1. `pnpm --filter @skiurlaub/api test:serve` starten.
2. Für den Testprozess `VITE_API_BASE_URL=http://127.0.0.1:8787` setzen,
   dann `pnpm android:install`.
3. `pnpm android:auth-smoke`: stellt ADB-Reverse her und prüft Code-Anmeldung,
   Profiländerung, verschlüsselten Gerätespeicher, vollständigen Prozessneustart,
   persistente Anmeldung, Logout und erneut abgemeldeten Zustand nach Neustart.
   Reverse-Forwarding und Testsitzung werden danach entfernt.
4. Testprozess-Variable entfernen und `pnpm android:install` erneut ausführen,
   damit die normale APK ohne Testanmeldung wiederhergestellt ist.

Native Speicherprüfung: `:app:assembleDebugAndroidTest`, App und Test-APK mit
ADB installieren, dann gezielt
`adb shell am instrument -w -e class cc.quxx.skiurlaub.SessionStoreTest cc.quxx.skiurlaub.debug.test/androidx.test.runner.AndroidJUnitRunner`.
Die drei Tests nutzen getrennten gerätegeschützten Testspeicher und ersetzen
keine echte Sitzung. Kein Uninstall oder Daten-Wipe für diese Prüfungen.

Beobachtet: 46 React-/Clienttests, 12 Worker-/D1-Tests, 18 Oberflächentests
und drei echte Keystore-Gerätetests erfolgreich. Der vollständige native Login-Test auf
Samsung SM-S918B / Android 17 war erfolgreich. Browser-E2E bleiben Regression
für gemeinsame React- und API-Logik, kein Nachweis produktiver Zustellung.
Die normale APK ohne Testbackend wurde anschließend wieder auf dem Gerät
installiert; der lokale Testserver und das USB-Reverse-Forwarding sind beendet.

## Ergänzung Google-Anmeldung

Native Anmeldung mit Android Credential Manager, serverseitig einmaliger Nonce
und JOSE-Prüfung von Signatur, Issuer, Audience und Zeitangaben. Der Google-Nachweis
bleibt im nativen Plugin; danach wird eine eigene Sitzung gespeichert. Freigegebene
Gmail-/Workspace-Konten, keine automatische Zusammenführung mit anderen Providern.
Die zusätzliche D1-Migration ist `0002_google_login.sql`.

Aktuelle Prüfung: 48 Clienttests, 20 Worker-/D1-Tests einschließlich signierter
Google-Testnachweise und 18 Oberflächentests bestanden. APK gebaut, auf dem
Samsung installiert und Android-Navigation sowie Aktualisierungsgeste geprüft.
Web-Client-ID und Kontofreigabe sind eingerichtet, die produktive APK ist installiert.
HTTPS, Auth-Freigabe, abgewiesene gefälschte Nachweise und gesperrter Testmodus
sind live geprüft. Der Benutzer hat den echten Google-Login erfolgreich abgeschlossen;
anschließend sind native Profilabfrage und erhaltene Anmeldung nach vollständigem
App-Prozessneustart bestanden. Keine Sitzungsschlüssel in Bridge-Profilantwort,
Cookies, LocalStorage oder SessionStorage. Das echte Konto bleibt angemeldet.

## Für den produktiven Abschluss noch erforderlich

- Nicht erlaubtes Google-Konto: am 18.11.2026 vom Nutzer am echten Backend geprüft,
  die App meldet „Dieses Konto ist für die App nicht freigegeben“. Abbruch des
  Google-Dialogs sowie Logout wurden vom Nutzer am 18.11.2026 bestätigt; auch die erneute
  Anmeldung nach dem Abmelden funktioniert (Nutzer, 18.11.2026). Alle manuellen
  Prüfungen sind damit erledigt. Ein Maildienst ist hierfür nicht nötig.
- Aufbewahrungs-/Löschregeln: Entscheidung vom 18.11.2026, Konto-Löschung und Datenexport erst in Phase 11 (bis dahin Löschung nur manuell in D1; Fremdschlüssel löschen Identität und Sitzungen per Kaskade). Betriebsfreigabe für echte personenbezogene Daten bleibt offen.
- Der Server mit der 30-Tage-Sitzung ist am 18.11.2026 veröffentlicht (Worker-Version a386fb99-c4d6-4125-bc60-752ab626e8ae; Health, Auth-Status und 401 ohne Login geprüft). Am Gerät nach frischer Anmeldung bestätigt: `sessionExpiresAt` = Anmeldezeit + 30 Tage, `/me` 200, kein Token in der Antwort.

Phase 3 ist damit lokal und nativ prüfbar; der produktive Abschluss ist offen.
GPS, NFC, Statistikimport und Gruppenverwaltung werden hier nicht vorgezogen.
